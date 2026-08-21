import type { StrokeElement } from '../../types';

export type FreehandToolStyle = NonNullable<StrokeElement['toolStyle']>;

export interface FreehandToolSettings {
  color: string;
  strokeWidth: number;
  opacity: number;
  toolStyle: FreehandToolStyle;
}

export const DEFAULT_FREEHAND_TOOL_SETTINGS: FreehandToolSettings = {
  color: '#f59e0b',
  strokeWidth: 3,
  opacity: 1,
  toolStyle: 'pen',
};

const FREEHAND_PREFERENCE_KEY = 'cineplan_freehand_preferences_v1';

const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export const normalizeFreehandToolSettings = (value: unknown): FreehandToolSettings => {
  if (!value || typeof value !== 'object') return { ...DEFAULT_FREEHAND_TOOL_SETTINGS };
  const candidate = value as Partial<FreehandToolSettings>;
  return {
    color: isHexColor(candidate.color) ? candidate.color : DEFAULT_FREEHAND_TOOL_SETTINGS.color,
    strokeWidth:
      typeof candidate.strokeWidth === 'number' && Number.isFinite(candidate.strokeWidth)
        ? Math.min(16, Math.max(1, Math.round(candidate.strokeWidth)))
        : DEFAULT_FREEHAND_TOOL_SETTINGS.strokeWidth,
    opacity:
      typeof candidate.opacity === 'number' && Number.isFinite(candidate.opacity)
        ? Math.min(1, Math.max(0.1, candidate.opacity))
        : DEFAULT_FREEHAND_TOOL_SETTINGS.opacity,
    toolStyle: candidate.toolStyle === 'highlighter' ? 'highlighter' : 'pen',
  };
};

/** Device-local brush preference; never enters shared project state. */
export const getFreehandToolPreferences = (): FreehandToolSettings => {
  try {
    const stored = localStorage.getItem(FREEHAND_PREFERENCE_KEY);
    return stored ? normalizeFreehandToolSettings(JSON.parse(stored)) : { ...DEFAULT_FREEHAND_TOOL_SETTINGS };
  } catch {
    return { ...DEFAULT_FREEHAND_TOOL_SETTINGS };
  }
};

export const setFreehandToolPreferences = (settings: FreehandToolSettings): void => {
  try {
    localStorage.setItem(FREEHAND_PREFERENCE_KEY, JSON.stringify(normalizeFreehandToolSettings(settings)));
  } catch {
    // A local preference must never interrupt drawing or project persistence.
  }
};

export interface FreehandStrokeAppearance {
  strokeWidth: number;
  opacity: number;
}

/**
 * Resolve persisted brush settings to SVG presentation values. Highlighters
 * are intentionally wider; legacy highlighters without explicit opacity keep
 * the historical 35% appearance.
 */
export const getFreehandStrokeAppearance = (
  stroke: Pick<StrokeElement, 'strokeWidth' | 'toolStyle' | 'opacity'>,
): FreehandStrokeAppearance => ({
  strokeWidth: stroke.toolStyle === 'highlighter' ? stroke.strokeWidth * 3 : stroke.strokeWidth,
  opacity: stroke.opacity ?? (stroke.toolStyle === 'highlighter' ? 0.35 : 1),
});
