import { beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_REMINDER_DAYS,
  backupAgeText,
  backupIsStale,
  getLastBackupAt,
  recordBackup,
} from '../backupHistory';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-29T12:00:00.000Z');

describe('backupHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts unknown and records the moment', () => {
    expect(getLastBackupAt()).toBeNull();
    expect(backupAgeText(getLastBackupAt(), NOW)).toBe('never');
    expect(backupIsStale(getLastBackupAt(), NOW)).toBe(true);
    recordBackup('2026-09-29T09:00:00.000Z');
    expect(getLastBackupAt()).toBe('2026-09-29T09:00:00.000Z');
    expect(backupAgeText(getLastBackupAt(), NOW)).toBe('today');
    expect(backupIsStale(getLastBackupAt(), NOW)).toBe(false);
  });

  it('words ages the way the reminder reads them', () => {
    expect(backupAgeText(new Date(NOW - DAY).toISOString(), NOW)).toBe('yesterday');
    expect(backupAgeText(new Date(NOW - 12 * DAY).toISOString(), NOW)).toBe('12 days ago');
    expect(backupAgeText('not-a-date', NOW)).toBe('never');
  });

  it(`goes stale after ${BACKUP_REMINDER_DAYS} days`, () => {
    expect(backupIsStale(new Date(NOW - 7 * DAY).toISOString(), NOW)).toBe(false);
    expect(backupIsStale(new Date(NOW - 8 * DAY).toISOString(), NOW)).toBe(true);
  });
});
