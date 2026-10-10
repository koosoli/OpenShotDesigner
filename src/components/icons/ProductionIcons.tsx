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

/** Stripboard: a board of coloured production strips with a day break. */
export const StripboardIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', strokeWidth = 2, title }) => (
  <svg {...base(strokeWidth)} className={className}>
    {title && <title>{title}</title>}
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 8h18M3 12h18M3 16h18" />
    <path d="M7 3v18" />
  </svg>
);

/** Day out of days: a grid of days with work marks and a hold dash. */
export const DoodIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', strokeWidth = 2, title }) => (
  <svg {...base(strokeWidth)} className={className}>
    {title && <title>{title}</title>}
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M9 4v16M15 4v16" />
    <path d="M10.5 13.5l1.5 1.5 2.5-3" />
    <path d="M16.5 14.5h3" />
    <path d="M4.5 14.5l1.5 1.5 2-2.5" />
  </svg>
);

/** Sides: two stapled half pages of script. */
export const SidesIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', strokeWidth = 2, title }) => (
  <svg {...base(strokeWidth)} className={className}>
    {title && <title>{title}</title>}
    <path d="M8 3h9l3 3v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M4 7v13a1 1 0 0 0 1 1h10" />
    <path d="M10 8h4M10 11h7M12 14h5" />
  </svg>
);

/** Camera dolly: camera on a platform riding a track. */
export const DollyIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', strokeWidth = 2, title }) => (
  <svg {...base(strokeWidth)} className={className}>
    {title && <title>{title}</title>}
    <rect x="8" y="4" width="8" height="5" rx="1" />
    <path d="M12 9v4" />
    <rect x="5" y="13" width="14" height="4" rx="1" />
    <circle cx="8" cy="19" r="1.5" />
    <circle cx="16" cy="19" r="1.5" />
    <path d="M2 21h20" />
  </svg>
);

/** Crane / jib: arm on a column with a counterweight. */
export const CraneIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', strokeWidth = 2, title }) => (
  <svg {...base(strokeWidth)} className={className}>
    {title && <title>{title}</title>}
    <path d="M3 15L19 5" />
    <rect x="17" y="3" width="5" height="4" rx="1" />
    <rect x="2" y="14" width="3.5" height="3.5" rx="0.5" />
    <path d="M10 10.6V20M6 21h8" />
  </svg>
);

/** Stabiliser rig: camera on a sled with a gimbal arm and monitor. */
export const SteadicamIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', strokeWidth = 2, title }) => (
  <svg {...base(strokeWidth)} className={className}>
    {title && <title>{title}</title>}
    <rect x="8" y="2.5" width="8" height="5" rx="1" />
    <path d="M12 7.5v11" />
    <circle cx="12" cy="11" r="1.5" />
    <path d="M13.5 11h5l2 3" />
    <rect x="9" y="18.5" width="6" height="3" rx="1" />
  </svg>
);

/** C-stand: turtle base legs, riser, gobo arm with a flag. */
export const CStandIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', strokeWidth = 2, title }) => (
  <svg {...base(strokeWidth)} className={className}>
    {title && <title>{title}</title>}
    <path d="M8 4v17M8 21l-4-1M8 21l5 0M8 18l-3 3" />
    <path d="M8 6h12" />
    <rect x="14" y="7.5" width="6" height="5" />
  </svg>
);

/** Location scout: camera with a map pin. */
export const ScoutIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', strokeWidth = 2, title }) => (
  <svg {...base(strokeWidth)} className={className}>
    {title && <title>{title}</title>}
    <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h4L14 6h1" />
    <path d="M3 8v9a2 2 0 0 0 2 2h7" />
    <circle cx="9" cy="12.5" r="3" />
    <path d="M18.5 21s-4-3.6-4-7a4 4 0 0 1 8 0c0 3.4-4 7-4 7z" />
    <circle cx="18.5" cy="14" r="1.2" />
  </svg>
);

/** Time sheet: a form with a clock — the performers production time report. */
export const TimeSheetIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', strokeWidth = 2, title }) => (
  <svg {...base(strokeWidth)} className={className}>
    {title && <title>{title}</title>}
    <path d="M13 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9l4 4v3" />
    <path d="M8 8h5M8 12h4M8 16h3" />
    <circle cx="17.5" cy="16.5" r="4.5" />
    <path d="M17.5 14.5v2l1.5 1" />
  </svg>
);

/** Script breakdown: a page with highlighted element marks. */
export const BreakdownIcon: React.FC<IconProps> = ({ className = 'w-4 h-4', strokeWidth = 2, title }) => (
  <svg {...base(strokeWidth)} className={className}>
    {title && <title>{title}</title>}
    <path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M8 9h8" />
    <path d="M8 13h3" strokeWidth={strokeWidth * 2.2} opacity="0.45" />
    <path d="M13 13h3M8 17h8" />
  </svg>
);
