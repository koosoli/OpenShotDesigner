import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../projectLibrary';
import { forgetNativeProjectHandle, saveNativeProjectFile } from '../nativeProjectFile';

describe('native project file binding', () => {
  beforeEach(() => {
    forgetNativeProjectHandle();
    delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });

  it('binds one handle per project so Ctrl+S cannot overwrite another production', async () => {
    const writes: string[][] = [[], []];
    let pickerCalls = 0;
    (window as Window & { showSaveFilePicker?: () => Promise<unknown> }).showSaveFilePicker = vi.fn(async () => {
      const index = pickerCalls++;
      return {
        createWritable: async () => ({
          write: async (blob: Blob) => { writes[index].push(await blob.text()); },
          close: async () => undefined,
        }),
      };
    });
    const first = createProject({ title: 'First' });
    const second = createProject({ title: 'Second' });

    await saveNativeProjectFile(first);
    await saveNativeProjectFile(second);
    first.title = 'First changed';
    await saveNativeProjectFile(first);

    expect(pickerCalls).toBe(2);
    expect(writes[0]).toHaveLength(2);
    expect(writes[1]).toHaveLength(1);
    expect(writes[0][1]).toContain('First changed');
    expect(writes[1][0]).toContain('Second');
  });

  it('does not bind a one-off library Save As export', async () => {
    let pickerCalls = 0;
    (window as Window & { showSaveFilePicker?: () => Promise<unknown> }).showSaveFilePicker = vi.fn(async () => {
      pickerCalls++;
      return { createWritable: async () => ({ write: async () => undefined, close: async () => undefined }) };
    });
    const project = createProject({ title: 'Library export' });
    await saveNativeProjectFile(project, { saveAs: true, bindHandle: false });
    await saveNativeProjectFile(project);
    expect(pickerCalls).toBe(2);
  });
});
