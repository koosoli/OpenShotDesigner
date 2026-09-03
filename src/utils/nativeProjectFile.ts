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

let activeHandle: WritableFileHandle | null = null;

export const supportsNativeProjectFiles = (): boolean =>
  typeof window !== 'undefined' && typeof (window as PickerWindow).showSaveFilePicker === 'function';

/** Save to the current .osd handle, asking for one on first save. */
export const saveNativeProjectFile = async (
  project: Project,
  options: { saveAs?: boolean; downloadFallback?: boolean } = {},
): Promise<'native' | 'download'> => {
  const blob = await exportProjectPackage(project);
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (picker) {
    if (!activeHandle || options.saveAs) {
      activeHandle = await picker({
        suggestedName: `${safeFileName(project.title, 'project').toLowerCase()}.osd`,
        types: [{ description: 'OpenShotDesigner project', accept: { 'application/json': ['.osd'] } }],
      });
    }
    const writable = await activeHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return 'native';
  }
  if (options.downloadFallback !== false) {
    downloadBlob(blob, `${safeFileName(project.title, 'project').toLowerCase()}.osd`);
  }
  return 'download';
};

export const forgetNativeProjectHandle = (): void => {
  activeHandle = null;
};
