/**
 * When did project data last leave the browser as a file?
 *
 * The dashboard reminds viewers whose backup is going stale ("last backup:
 * 12 days ago"). Every project-level artifact records itself: native .osd
 * saves, .osd/JSON downloads, and cloud uploads. CSVs and PDFs do not count
 * — a call sheet is not a restorable backup. Storage failures are swallowed:
 * a reminder timestamp must never break a save.
 */

const KEY = 'openshotdesigner_last_backup';

/** Days without a backup before the dashboard starts reminding. */
export const BACKUP_REMINDER_DAYS = 7;

const DAY_MS = 86_400_000;

/** Stamp now (or a given moment, for tests) as the last backup. */
export const recordBackup = (at?: string): void => {
  try {
    localStorage.setItem(KEY, at ?? new Date().toISOString());
  } catch {
    // Reminder only — never break the save it annotates.
  }
};

/** ISO timestamp of the last recorded backup, or null when never/nonsense. */
export const getLastBackupAt = (): string | null => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw && !Number.isNaN(Date.parse(raw)) ? raw : null;
  } catch {
    return null;
  }
};

/** "today" | "yesterday" | "N days ago" | "never", for the reminder line. */
export const backupAgeText = (iso: string | null, now: number = Date.now()): string => {
  if (!iso || Number.isNaN(Date.parse(iso))) return 'never';
  const days = Math.floor((now - Date.parse(iso)) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
};

/** True when nobody should trust the backup situation anymore. */
export const backupIsStale = (iso: string | null, now: number = Date.now()): boolean => {
  if (!iso || Number.isNaN(Date.parse(iso))) return true;
  return now - Date.parse(iso) > BACKUP_REMINDER_DAYS * DAY_MS;
};
