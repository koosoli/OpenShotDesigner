/**
 * Every place a project can hold an image (rule 26).
 *
 * Declared once, as data, rather than as a hand-written walk in each of the
 * three things that need it (migrating, measuring, resolving). A new image
 * field is one entry here and the migration picks it up; a hand-written walk
 * would be three places to forget.
 *
 * Deliberately NOT a generic "find every data: URL in the JSON" scan: that
 * would also rewrite a field where an inline image is the correct answer, and
 * it gives no way to say what kind of image a field holds — which decides how
 * hard it is downscaled on the way to the store.
 */

import { inlineImageBytes, isInlineImage } from './imageRef';

/** How aggressively a field's images should be downscaled when stored. */
export interface ImageFieldPolicy {
  /** Longest edge in pixels. */
  maxSize: number;
  quality: number;
  /** PNG instead of JPEG, for images whose transparency matters. */
  keepAlpha?: boolean;
}

export interface ImageFieldLocation {
  /** Human-readable path, for reporting what moved. */
  path: string;
  /** The current value: an asset id or an inline data URL. */
  value: string;
  /** Replace the value in place. */
  set: (next: string) => void;
  policy: ImageFieldPolicy;
}

/**
 * Storyboard frames are looked at, not zoomed into: 1280 px is already more
 * than the largest place one is shown. Background plates are traced over at
 * canvas zoom, so they keep more. A logo needs its transparency.
 */
const STORYBOARD: ImageFieldPolicy = { maxSize: 1280, quality: 0.82 };
const BACKGROUND: ImageFieldPolicy = { maxSize: 2400, quality: 0.86 };
const LOGO: ImageFieldPolicy = { maxSize: 320, quality: 0.92, keepAlpha: true };

/** Minimal shapes, so this module does not depend on the whole Project type. */
interface MediaProject {
  logo?: string;
  setups?: Array<{
    name?: string;
    backgroundImages?: Array<{ url?: string }>;
    shots?: MediaShot[];
  }>;
  avScriptRows?: Array<{ shotNumber?: string; storyboardImage?: string }>;
}

interface MediaShot {
  shotNumber?: string;
  storyboardImage?: string;
  storyboardImageEnd?: string;
  storyboardFrames?: Record<string, { image?: string }>;
}

/**
 * Every image-bearing field in a project, with a setter for each.
 *
 * Mutating setters rather than a rebuilt tree: the caller is replacing strings
 * in a structure it already cloned, and threading an immutable update through
 * four levels of optional arrays would be far more code for no benefit here.
 */
export const imageFieldsOf = (project: MediaProject): ImageFieldLocation[] => {
  const found: ImageFieldLocation[] = [];

  const add = (
    path: string,
    value: string | undefined,
    set: (next: string) => void,
    policy: ImageFieldPolicy,
  ): void => {
    if (value) found.push({ path, value, set, policy });
  };

  add('logo', project.logo, (next) => { project.logo = next; }, LOGO);

  (project.setups ?? []).forEach((setup, setupIndex) => {
    const label = setup.name || `setup ${setupIndex + 1}`;

    (setup.backgroundImages ?? []).forEach((background, index) => {
      add(
        `${label} · background ${index + 1}`,
        background.url,
        (next) => { background.url = next; },
        BACKGROUND,
      );
    });

    (setup.shots ?? []).forEach((shot, shotIndex) => {
      const shotLabel = `${label} · shot ${shot.shotNumber || shotIndex + 1}`;
      add(`${shotLabel} · board`, shot.storyboardImage, (next) => { shot.storyboardImage = next; }, STORYBOARD);
      add(`${shotLabel} · end board`, shot.storyboardImageEnd, (next) => { shot.storyboardImageEnd = next; }, STORYBOARD);
      for (const [slot, frame] of Object.entries(shot.storyboardFrames ?? {})) {
        add(`${shotLabel} · frame ${slot}`, frame.image, (next) => { frame.image = next; }, STORYBOARD);
      }
    });
  });

  (project.avScriptRows ?? []).forEach((row, index) => {
    add(
      `AV row ${row.shotNumber || index + 1}`,
      row.storyboardImage,
      (next) => { row.storyboardImage = next; },
      STORYBOARD,
    );
  });

  return found;
};

export interface InlineImageReport {
  count: number;
  /** Total characters those inline images add to the project. */
  bytes: number;
  paths: string[];
}

/** What a project is still carrying inline — what the migration would move. */
export const inlineImagesIn = (project: MediaProject): InlineImageReport => {
  const inline = imageFieldsOf(project).filter((field) => isInlineImage(field.value));
  return {
    count: inline.length,
    bytes: inline.reduce((total, field) => total + inlineImageBytes(field.value), 0),
    paths: inline.map((field) => field.path),
  };
};
