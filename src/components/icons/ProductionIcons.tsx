import React from 'react';

/**
 * UI glyphs for the production tools (toolbar, inspector headers, quick
 * search). These are interface icons, not plan symbols — plan symbols live in
 * the shared Asset Library. Drawn on the lucide 24×24 stroke grid so they sit
 * next to lucide icons without looking foreign.
 */

type IconProps = { className?: string; strokeWidth?: number; title?: string };

const base = (strokeWidth: number) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

/** Motion-picture camera: body with matte box, two film magazines on top. */
export const MovieCameraIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', strokeWidth = 2, title }) => (
  <svg {...base(strokeWidth)} className={className}>
    {title && <title>{title}</title>}
    <circle cx="7.5" cy="6" r="3" />
    <circle cx="15" cy="6" r="3" />
    <rect x="3" y="10" width="12" height="8" rx="1.5" />
    <path d="M15 12.5l5-2.5v8l-5-2.5" />
    <path d="M7 18v3M11 18v3" />
  </svg>
);

/** Fresnel spotlight: lamp head with barn doors, yoke and a short beam. */
export const FresnelLightIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', strokeWidth = 2, title }) => (
  <svg {...base(strokeWidth)} className={className}>
    {title && <title>{title}</title>}
    <rect x="3" y="8" width="9" height="8" rx="1.5" />
    <path d="M12 8l3-2.5M12 16l3 2.5" />
    <path d="M16 9.5l5-2.5M16 12h6M16 14.5l5 2.5" />
    <path d="M7.5 16v3M4.5 21h6" />
  </svg>
);
