import { link, mkdtemp, open, rm, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { detectSchemaVersion, migrateProject } from '../../src/domain/migrations';
import { parseProjectPackage } from '../../src/utils/projectPackage';
import { exportProjectPackageV2, parseProjectPackageV2 } from '../../src/utils/projectPackageV2';
import type { AssetStore } from '../../src/domain/storage/types';
import type { Project } from '../../src/types';

export async function loadAgentProject(path: string) {
  const file = await open(path, 'r');
  const bytes = await (async () => {
    try {
      if (!(await file.stat()).isFile()) throw new Error('Project input must be a regular file.');
      return await file.readFile();
    } finally {
      await file.close();
    }
  })();
  const data = new Blob([bytes]);
  let raw: unknown;
  let media: Pick<AssetStore, 'get' | 'getMetadata'> | undefined;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const parsed = await parseProjectPackageV2(data);
    raw = parsed.project;
    const byId = new Map(parsed.assets.map(asset => [asset.id, asset]));
    media = {
      async get(id) {
        const asset = byId.get(id);
        return asset ? new Blob([new Uint8Array(asset.data)]) : null;
      },
      async getMetadata(id) { return byId.get(id)?.metadata ?? null; },
    };
  } else {
    raw = JSON.parse(new TextDecoder().decode(bytes));
    if ((raw as { manifest?: { formatVersion?: unknown } } | null)?.manifest?.formatVersion === 1) {
      const parsed = await parseProjectPackage(data);
      raw = parsed.project;
      const byId = new Map(parsed.assets.map(asset => [asset.id, asset]));
      media = {
        async get(id) {
          const asset = byId.get(id);
          return asset ? new Blob([Buffer.from(asset.dataBase64, 'base64')]) : null;
        },
        async getMetadata(id) { return byId.get(id)?.metadata ?? null; },
      };
    }
  }
  const version = detectSchemaVersion(raw);
  if (version === null || !Number.isInteger(version) || version < 1) {
    throw new Error('Invalid Open Shot Designer project schema version.');
  }
  const { project, migratedFrom } = migrateProject(raw);
  if (typeof project.id !== 'string' || typeof project.title !== 'string' ||
      project.setups.some(setup => !setup || typeof setup.id !== 'string' ||
        !Array.isArray(setup.elements) || !Array.isArray(setup.shots))) {
    throw new Error('Invalid Open Shot Designer project structure.');
  }
  return { project, migratedFrom, media };
}

export async function saveAgentProject(
  output: string,
  project: Project,
  media: Awaited<ReturnType<typeof loadAgentProject>>['media'],
) {
  const destination = resolve(output);
  const extension = media ? '.osd' : '.json';
  if (!destination.toLowerCase().endsWith(extension)) {
    throw new Error(`Output must use the ${extension} extension for this project format.`);
  }
  const data = media
    ? new Uint8Array(await (await exportProjectPackageV2(project, media)).arrayBuffer())
    : JSON.stringify(project, null, 2) + '\n';
  const staging = await mkdtemp(join(dirname(destination), '.osd-agent-'));
  const temp = join(staging, basename(destination));
  try {
    await writeFile(temp, data, { mode: 0o600 });
    // Publish only a complete file and fail if another process created the destination.
    await link(temp, destination);
  } finally {
    await rm(temp, { force: true });
    await rmdir(staging);
  }
  return destination;
}
