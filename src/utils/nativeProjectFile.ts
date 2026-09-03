import type { Project } from '../types';
import { exportProjectPackage } from './projectPackage';
import { downloadBlob, safeFileName } from './download';

interface WritableFileHandle {
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
  }>;
}

type PickerWindow = Window & {
  showSaveFilePicker?: (options: unknown) => Promise<WritableFileHandle>;
};

// A file handle belongs to one project, never to whichever project happened
// to be open after the picker closed. This prevents Ctrl+S in Project B from
// overwriting Project A.osd after switching productions.
const handlesByProjectId = new Map<string, WritableFileHandle>();

export const supportsNativeProjectFiles = (): boolean =>
  typeof window !== 'undefined' && typeof (window as PickerWindow).showSaveFilePicker === 'function';

/** Save to the current .osd handle, asking for one on first save. */
export const saveNativeProjectFile = async (
  project: Project,
  options: { saveAs?: boolean; downloadFallback?: boolean; bindHandle?: boolean } = {},
): Promise<'native' | 'download'> => {
  const blob = await exportProjectPackage(project);
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (picker) {
    let handle = options.saveAs ? undefined : handlesByProjectId.get(project.id);
    if (!handle) {
      handle = await picker({
        suggestedName: `${safeFileName(project.title, 'project').toLowerCase()}.osd`,
        types: [{ description: 'OpenShotDesigner project', accept: { 'application/json': ['.osd'] } }],
      });
      if (options.bindHandle !== false) handlesByProjectId.set(project.id, handle);
    }
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return 'native';
  }
  if (options.downloadFallback !== false) {
    downloadBlob(blob, `${safeFileName(project.title, 'project').toLowerCase()}.osd`);
  }
  return 'download';
};

export const forgetNativeProjectHandle = (projectId?: string): void => {
  if (projectId) handlesByProjectId.delete(projectId);
  else handlesByProjectId.clear();
};
