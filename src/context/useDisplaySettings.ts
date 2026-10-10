/**
 * Display and label preferences: UI-only, stored per browser apart from the
 * project. Extracted from `FloorPlanContext`.
 */
import { useState } from 'react';
import { DEFAULT_DISPLAY_SETTINGS, LEGACY_STORAGE_KEYS, STORAGE_KEYS, migrateStorageKey } from './displaySettings';
import type { DisplaySettings } from './displaySettings';

const readDisplaySettings = (): DisplaySettings => {
  try {
    const saved = migrateStorageKey(LEGACY_STORAGE_KEYS.display, STORAGE_KEYS.display);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Light names became default-on; migrate any previously-saved "off".
      if (parsed.showLightNameLabels === false) parsed.showLightNameLabels = true;
      // Kelvin and dim-level labels default to OFF; migrate legacy saved "on".
      if (parsed._v !== 2) {
        parsed.showLightKelvinLabels = false;
        parsed.showLightIntensityLabels = false;
        parsed._v = 2;
        try {
          localStorage.setItem(STORAGE_KEYS.display, JSON.stringify(parsed));
        } catch {
          // Preference only.
        }
      }
      return {
        ...DEFAULT_DISPLAY_SETTINGS,
        ...parsed,
        labelCategoryOpacity: {
          ...DEFAULT_DISPLAY_SETTINGS.labelCategoryOpacity,
          ...(parsed.labelCategoryOpacity || {}),
        },
      };
    }
  } catch {
    // Corrupt or blocked storage: fall back to defaults.
  }
  return DEFAULT_DISPLAY_SETTINGS;
};

export const useDisplaySettings = () => {
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(readDisplaySettings);
  const updateDisplaySettings = (updates: Partial<DisplaySettings>) => {
    setDisplaySettings((prev) => {
      const next = { ...prev, ...updates, _v: 2 };
      try {
        localStorage.setItem(STORAGE_KEYS.display, JSON.stringify(next));
      } catch {
        // Preference only.
      }
      return next;
    });
  };
  return { displaySettings, updateDisplaySettings };
};
