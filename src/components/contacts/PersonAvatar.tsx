import React from 'react';
import { headshotImageStyle, personInitials } from '../../domain/people';
import type { Person } from '../../domain/people';
import { useAssetImageSrc } from '../../utils/assetImages';

interface PersonAvatarProps {
  person: Pick<Person, 'displayName' | 'headshotAssetId' | 'headshotFraming'>;
  /** Rendered size in pixels; the image is cropped square to fill it. */
  size?: number;
  /** Tailwind classes for the initials fallback, so callers keep their tints. */
  fallbackClassName?: string;
  className?: string;
}

/**
 * A person's headshot, falling back to their initials.
 *
 * Initials are the fallback rather than a silhouette icon because they still
 * identify someone: on a crew list of forty, "TB" next to a name is a second
 * confirmation you are looking at Tomas Berg. A generic head is decoration.
 *
 * The image resolves asynchronously from the asset store, so the initials also
 * cover the moment before it arrives — no layout shift, and no empty box on a
 * project whose assets did not travel with it.
 */
export const PersonAvatar: React.FC<PersonAvatarProps> = ({
  person,
  size = 32,
  fallbackClassName = 'bg-slate-500/20 text-slate-400',
  className = '',
}) => {
  const src = useAssetImageSrc(person.headshotAssetId);
  const dimension = { width: size, height: size };

  if (src) {
    // `overflow-hidden` on the wrapper rather than the image: a zoomed headshot
    // scales past the circle, and the circle is what the layout reserved space
    // for — scaling the box instead would shove the row it sits in.
    return (
      <span
        style={dimension}
        className={`rounded-full overflow-hidden flex-shrink-0 inline-block ${className}`}
      >
        <img
          src={src}
          alt={person.displayName}
          style={{ ...dimension, ...headshotImageStyle(person.headshotFraming) }}
        />
      </span>
    );
  }

  return (
    <span
      style={dimension}
      className={`rounded-full grid place-items-center font-black flex-shrink-0 ${fallbackClassName} ${className}`}
    >
      <span style={{ fontSize: Math.max(9, Math.round(size * 0.34)) }}>{personInitials(person)}</span>
    </span>
  );
};
