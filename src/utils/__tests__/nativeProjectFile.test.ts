import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../projectLibrary';
import {
  applyAssetRemap,
  bindNativeProjectHandle,
  forgetNativeProjectHandle,
  getBoundProjectFileName,
  getLastNativeSaveAt,
  listRecentProjectFiles,
  parseProjectFileBytes,
  saveNativeProjectFile,
} from '../nativeProjectFile';
import { parseProjectPackageV2 } from '../projectPackageV2';

const mockSavePicker = (writes: Blob[][], names: (string | undefined)[] = []) => {
  let pickerCalls = 0;
  (window as Window & { showSaveFilePicker?: () => Promise<unknown> }).showSaveFilePicker = vi.fn(async () => {
    const index = pickerCalls++;
    return {
      name: names[index] ?? `production-${index}.osd`,
      createWritable: async () => ({
        // Keep the Blob itself: .text() would corrupt ZIP bytes through
        // UTF-8 decoding, while a real file handle writes bytes faithfully.
        write: async (blob: Blob) => { writes[index].push(blob); },
        close: async () => undefined,
      }),
    };
  });
  return () => pickerCalls;
};

describe('native project file binding', () => {
  beforeEach(() => {
    forgetNativeProjectHandle();
    localStorage.clear();
    delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
    delete (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker;
  });

  it('binds one handle per project so Ctrl+S cannot overwrite another production', async () => {
    const writes: Blob[][] = [[], []];
    const pickerCalls = mockSavePicker(writes);
    const first = createProject({ title: 'First' });
    const second = createProject({ title: 'Second' });

    await saveNativeProjectFile(first);
    await saveNativeProjectFile(second);
    first.title = 'First changed';
    await saveNativeProjectFile(first);

    expect(pickerCalls()).toBe(2);
    expect(writes[0]).toHaveLength(2);
    expect(writes[1]).toHaveLength(1);
    // New files are v2 ZIP archives: parse them back instead of grepping text.
    const reparsed = await parseProjectPackageV2(writes[0][1]);
    expect(reparsed.project.title).toBe('First changed');
  });

  it('writes v1 JSON on explicit request', async () => {
    const writes: Blob[][] = [[]];
    mockSavePicker(writes);
    await saveNativeProjectFile(createProject({ title: 'Legacy' }), { format: 'v1' });
    expect(await writes[0][0].text()).toContain('Legacy');
  });

  it('does not bind a one-off library Save As export', async () => {
    const writes: Blob[][] = [[], []];
    const pickerCalls = mockSavePicker(writes);
    const project = createProject({ title: 'Library export' });
    await saveNativeProjectFile(project, { saveAs: true, bindHandle: false });
    await saveNativeProjectFile(project);
    expect(pickerCalls()).toBe(2);
  });

  it('tracks the bound file name and last save time', async () => {
    const writes: Blob[][] = [[]];
    mockSavePicker(writes, ['my-film.osd']);
    const project = createProject({ title: 'Tracked' });
    expect(getBoundProjectFileName(project.id)).toBeUndefined();
    await saveNativeProjectFile(project);
    expect(getBoundProjectFileName(project.id)).toBe('my-film.osd');
    expect(getLastNativeSaveAt(project.id)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps a recent-files list across saves', async () => {
    const writes: Blob[][] = [[], []];
    mockSavePicker(writes, ['a.osd', 'b.osd']);
    await saveNativeProjectFile(createProject({ title: 'A' }));
    await saveNativeProjectFile(createProject({ title: 'B' }));
    const recent = listRecentProjectFiles();
    expect(recent.map((entry) => entry.fileName)).toEqual(['b.osd', 'a.osd']);
  });

  it('binds a picked file to the final project id on open', async () => {
    const project = createProject({ title: 'Opened' });
    const bytes = new TextEncoder().encode(JSON.stringify(project));
    (window as Window & { showOpenFilePicker?: () => Promise<unknown> }).showOpenFilePicker = vi.fn(async () => [{
      name: 'opened.osd',
      getFile: async () => new File([bytes], 'opened.osd'),
      createWritable: async () => ({ write: async () => undefined, close: async () => undefined }),
    }]);
    const { openNativeProjectFile } = await import('../nativeProjectFile');
    const opened = await openNativeProjectFile();
    expect(opened?.fileName).toBe('opened.osd');
    expect(opened?.format).toBe('json');
    bindNativeProjectHandle('final-id', opened!.fileName, opened!.handle);
    expect(getBoundProjectFileName('final-id')).toBe('opened.osd');
  });

  it('sniffs v2 ZIP bytes even with a misleading extension', async () => {
    const writes: Blob[][] = [[]];
    mockSavePicker(writes);
    const project = createProject({ title: 'Zipped' });
    await saveNativeProjectFile(project);
    const parsed = await parseProjectFileBytes(await writes[0][0].arrayBuffer());
    expect(parsed.format).toBe('osd-v2');
    expect(parsed.project.title).toBe('Zipped');
  });

  it('rejects garbage bytes with a readable error', async () => {
    const bytes = new TextEncoder().encode('definitely not a project');
    await expect(parseProjectFileBytes(bytes.buffer as ArrayBuffer)).rejects.toThrow(/could not be read/i);
  });

  it('applies asset id rewrites only when non-empty', () => {
    const project = createProject({ title: 'Remap' });
    expect(applyAssetRemap(project, {})).toBe(project);
  });
});
