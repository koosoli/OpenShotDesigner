import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../projectLibrary';
import { CURRENT_PROJECT_SCHEMA_VERSION } from '../../domain/migrations';

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'osd-agent-')); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

function cli(...args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/project-agent.ts', ...args], {
    encoding: 'utf8', timeout: 10_000,
  });
}

describe('headless project entry points', () => {
  it('migrates a JSON backup and publishes a complete batch without replacing files', async () => {
    const source = join(directory, 'source.json');
    const output = join(directory, 'edited.json');
    const changes = join(directory, 'changes.json');
    const project = createProject({ title: 'Source' });
    const original = JSON.stringify({ ...project, schemaVersion: 41 });
    await writeFile(source, original);
    const inspected = cli('inspect', '--project', source);
    expect(inspected.stderr).toBe('');
    expect(JSON.parse(inspected.stdout)).toMatchObject({ migratedFrom: 41, schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION });

    await writeFile(changes, JSON.stringify([
      { type: 'production_details', updates: { title: 'Edited' } },
      { type: 'setup_location', setupId: project.activeSetupId, locationId: 'missing' },
    ]));
    const args = ['apply', '--project', source, '--changes', changes, '--output', output];
    expect(cli(...args).stderr).toContain('Unknown location');
    await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' });

    await writeFile(changes, JSON.stringify([
      { type: 'production_details', updates: { title: 'Edited' } },
      { type: 'document_language', language: 'de' },
    ]));
    expect(cli(...args).status).toBe(0);
    const edited = await readFile(output, 'utf8');
    expect(JSON.parse(edited)).toMatchObject({ id: project.id, title: 'Edited', documentLanguage: 'de' });
    expect(cli(...args).status).toBe(1);
    expect(await readFile(output, 'utf8')).toBe(edited);
    expect(await readFile(source, 'utf8')).toBe(original);
  });

  it('negotiates MCP over stdio and writes an edited package with its media', async () => {
    const project = createProject({ title: 'Source' });
    const source = join(directory, 'source.osd');
    const output = join(directory, 'edited.osd');
    const id = 'asset-local-test';
    const media = new Uint8Array([0, 1, 128, 255]);
    await writeFile(source, zipSync({
      'project.json': strToU8(JSON.stringify({ ...project, logo: id })),
      'manifest.json': strToU8(JSON.stringify({
        formatVersion: 2, title: project.title, projectId: project.id,
        generatedAt: new Date().toISOString(), assetCount: 1, checksums: {},
      })),
      [`assets/${id}`]: media,
    }));
    const child = spawn(process.execPath, [
      '--import', 'tsx', 'scripts/project-mcp.ts', '--project', source, '--output', output,
    ], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000 });
    const exited = once(child, 'exit');
    const lines = createInterface({ input: child.stdout });
    const messages = lines[Symbol.asyncIterator]();
    let sequence = 0;
    const send = (message: object) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
    const request = async (method: string, params?: object) => {
      const id = ++sequence;
      send({ id, method, params });
      const line = await messages.next();
      if (line.done) throw new Error(`MCP server exited before replying to ${method}.`);
      const message = JSON.parse(line.value);
      expect(message).toMatchObject({ jsonrpc: '2.0', id });
      return message.result;
    };
    try {
      expect(await request('initialize', {
        protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' },
      })).toMatchObject({ serverInfo: { name: 'open-shot-designer' } });
      send({ method: 'notifications/initialized' });
      expect((await request('tools/list')).tools.map((tool: { name: string }) => tool.name))
        .toEqual(expect.arrayContaining(['inspect_project', 'list_shots', 'validate_project', 'apply_project_changes']));
      expect(await request('tools/call', { name: 'inspect_project', arguments: {} }))
        .toMatchObject({ structuredContent: { title: 'Source' } });
      expect(await request('tools/call', {
        name: 'apply_project_changes',
        arguments: { changes: [{ type: 'production_details', updates: { title: 'Edited' } }] },
      })).toMatchObject({ structuredContent: { changesApplied: 1, projectId: project.id } });
      const archive = unzipSync(await readFile(output));
      expect(archive[`assets/${id}`]).toEqual(media);
      expect(JSON.parse(strFromU8(archive['project.json']))).toMatchObject({ title: 'Edited', logo: id });
      expect(JSON.parse(strFromU8(archive['manifest.json']))).toMatchObject({ title: 'Edited', assetCount: 1 });
    } finally {
      lines.close();
      child.kill();
      await exited;
    }
  });
});
