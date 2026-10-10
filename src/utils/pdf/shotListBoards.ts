/**
 * Storyboard frames for the shot-list PDF, in row order, read the same way the
 * shot list shows them (the key frame of each shot).
 */
import type { SceneSetup } from '../../types';
import { keyFrameImage } from '../storyboardFrames';
import { resolvePdfRasterBytes } from './imageBytes';
import type { ShotListBoardSize, ShotListPdfInput } from './shotListPdf';

export const shotListStoryboards = async (
  setups: SceneSetup[],
  size: ShotListBoardSize,
  aspectRatio: number,
): Promise<NonNullable<ShotListPdfInput['storyboards']>> => {
  const frames: Array<{ imageBytes?: Uint8Array; mimeType?: string } | undefined> = [];
  for (const setup of setups) {
    for (const shot of setup.shots ?? []) {
      const resolved = await resolvePdfRasterBytes(keyFrameImage(shot), 900);
      frames.push(resolved ? { imageBytes: resolved.bytes, mimeType: resolved.mimeType } : undefined);
    }
  }
  return { size, aspectRatio, frames };
};
