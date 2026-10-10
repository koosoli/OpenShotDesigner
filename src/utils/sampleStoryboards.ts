/**
 * Sketch storyboard frames for the example shots, so the shot list's board
 * thumbnails, size picker and full-screen viewer have something to show on an
 * example project. Inline SVG: deliberately rough, clearly a placeholder,
 * scaled by shot size (a wide shot has small figures, a close-up one face).
 */
import type { Shot } from '../types';

const figure = (cx: number, groundY: number, height: number, tone: string): string => {
  const head = height * 0.16;
  const bodyTop = groundY - height + head * 2;
  return `<circle cx="${cx}" cy="${groundY - height + head}" r="${head}" fill="${tone}"/>`
    + `<rect x="${cx - head * 1.1}" y="${bodyTop}" width="${head * 2.2}" height="${height - head * 2}" rx="${head * 0.8}" fill="${tone}"/>`;
};

/** Frame content by shot size code. */
const composition = (size: string): string => {
  switch (size) {
    case 'ELS':
    case 'WS':
    case 'FS':
      return '<rect x="0" y="300" width="640" height="60" fill="#3f3f46"/>'
        + '<rect x="420" y="90" width="90" height="210" fill="#52525b"/>'
        + figure(190, 300, 130, '#e4e4e7') + figure(330, 300, 120, '#a1a1aa');
    case 'MS':
    case 'MWS':
      return figure(220, 420, 300, '#e4e4e7') + figure(440, 420, 290, '#a1a1aa');
    case 'MCU':
      return '<rect x="-40" y="120" width="230" height="320" rx="110" fill="#27272a"/>' + figure(400, 520, 460, '#e4e4e7');
    case 'CU':
    case 'ECU':
    default:
      return '<circle cx="330" cy="200" r="130" fill="#e4e4e7"/><rect x="190" y="300" width="280" height="80" rx="40" fill="#e4e4e7"/>'
        + '<circle cx="285" cy="185" r="12" fill="#18181b"/><circle cx="375" cy="185" r="12" fill="#18181b"/>';
  }
};

/** A sketch board for one shot, as an inline image reference. */
export const sampleStoryboardFor = (shot: Pick<Shot, 'shotNumber' | 'shotSize'>): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">`
    + '<rect width="640" height="360" fill="#18181b"/>'
    + composition(shot.shotSize ?? 'MS')
    + '<rect x="0" y="0" width="640" height="360" fill="none" stroke="#71717a" stroke-width="4"/>'
    + `<text x="16" y="34" font-family="Helvetica,Arial,sans-serif" font-size="24" font-weight="700" fill="#38bdf8">${shot.shotNumber ?? ''} · ${shot.shotSize ?? ''}</text>`
    + '<text x="624" y="344" text-anchor="end" font-family="Helvetica,Arial,sans-serif" font-size="14" fill="#a1a1aa">example sketch</text>'
    + '</svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

/** Give every shot without a board a sketch; shots that have one are left alone. */
export const withSampleStoryboards = <T extends Pick<Shot, 'shotNumber' | 'shotSize' | 'storyboardImage' | 'storyboardFrames'>>(shots: readonly T[]): T[] =>
  shots.map((shot) =>
    shot.storyboardImage || Object.values(shot.storyboardFrames ?? {}).some((frame) => frame?.image)
      ? shot
      : { ...shot, storyboardImage: sampleStoryboardFor(shot) },
  );
