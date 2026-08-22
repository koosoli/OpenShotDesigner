import React from 'react';
import { useImageRefSrc } from '../../utils/assetImages';

type ProjectImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  /** An asset id or a legacy inline data URL. */
  imageRef?: string;
  /**
   * Required, not optional. Spreading props past a linter hides a missing
   * `alt`, and these images are storyboards and reference plates — the ones a
   * screen-reader user most needs described.
   */
  alt: string;
  /** Rendered when the reference resolves to nothing. */
  fallback?: React.ReactNode;
};

/**
 * An image stored in the project, in whichever form it is stored.
 *
 * Storyboards, background plates, AV rows and the logo held inline data URLs
 * until the media migration, and a project can be half-migrated — the pass is
 * forgiving, so an image it could not decode keeps its inline value. Readers
 * therefore cannot assume one form. Rather than teach fifteen `src={…}` sites
 * that rule and hope none is missed later, they all go through here.
 *
 * A missing asset renders the fallback (nothing, by default) rather than a
 * broken-image icon: the usual cause is a project opened where its assets did
 * not travel, and a broken icon reads as corruption rather than as absence.
 */
export const ProjectImage: React.FC<ProjectImageProps> = ({ imageRef, alt, fallback = null, ...props }) => {
  const src = useImageRefSrc(imageRef);
  if (!src) return <>{fallback}</>;
  return <img {...props} src={src} alt={alt} />;
};
