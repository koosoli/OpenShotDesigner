import { readSceneView } from './sceneViewSession';

export interface Scene3DPrintSnapshot { bytes: Uint8Array; caption: string }
/** Export-only bytes; never enter saved project or collaboration state. */
export async function readScene3DPrintSnapshot(key: string): Promise<Scene3DPrintSnapshot | undefined> {
  if (!readSceneView(key).includeInPrint) return undefined;
  const image = document.getElementById('print-scene3d-image');
  if (!(image instanceof HTMLImageElement) || !image.src.startsWith('data:image/png')) {
    throw new Error('The 3D snapshot is not ready yet. Wait for its preview, then print again.');
  }
  await image.decode();
  const response = await fetch(image.src);
  return { bytes: new Uint8Array(await response.arrayBuffer()), caption: image.dataset.caption ?? '3D overview' };
}
