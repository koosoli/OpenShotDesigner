/**
 * Small per-browser view preferences (a remembered highlighter mode, a
 * storyboard thumbnail size). Not project data: they never travel with a
 * file. Storage can be missing or throw (private windows, blocked site
 * data), so every access is guarded and falls back to the default.
 */

const PREFIX = 'openshotdesigner_ui_';

export const readUiPref = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const value = localStorage.getItem(PREFIX + key);
    return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
};

export const writeUiPref = (key: string, value: string): void => {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Preference only; nothing to recover.
  }
};

/** The shot list's storyboard view, shared with its print and PDF exports. */
export type ShotListBoardSize = 'S' | 'M' | 'L' | 'XL';
export const SHOT_LIST_BOARD_SIZES: readonly ShotListBoardSize[] = ['S', 'M', 'L', 'XL'];
export const readShotListBoardSize = (): ShotListBoardSize =>
  readUiPref<ShotListBoardSize>('shotlist_board_size', SHOT_LIST_BOARD_SIZES, 'M');
/** 'on' / 'off' once the person has chosen; 'auto' = follow whether boards exist. */
export const readShotListBoardsShown = (): 'on' | 'off' | 'auto' =>
  readUiPref<'on' | 'off' | 'auto'>('shotlist_board_show', ['on', 'off', 'auto'], 'auto');

/** Schedule module views, remembered per browser; other modules can ask for one. */
export type ScheduleView = 'stripboard' | 'oneliner' | 'dood' | 'calendar' | 'callsheets' | 'coverage' | 'timereport' | 'dpr';
export const SCHEDULE_VIEWS: readonly ScheduleView[] = ['stripboard', 'oneliner', 'dood', 'calendar', 'callsheets', 'coverage', 'timereport', 'dpr'];
export const readScheduleView = (): ScheduleView => readUiPref<ScheduleView>('schedule_view', SCHEDULE_VIEWS, 'stripboard');
/** Open the Schedule module on `view` next time it mounts (e.g. a "Day out of days" link). */
export const requestScheduleView = (view: ScheduleView): void => writeUiPref('schedule_view', view);
