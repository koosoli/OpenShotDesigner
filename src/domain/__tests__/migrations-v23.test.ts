import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';
import { migrateV22ToV23 } from '../migrations/v22-to-v23';

const v22Fixture = (rows: unknown[] = []) => ({
  schemaVersion: 22,
  title: 'AV row test',
  director: '',
  cinematographer: '',
  date: '2026-08-23',
  activeSetupId: 'setup-1',
  setups: [{ id: 'setup-1', name: 'S', sceneNumber: '1', elements: [] as unknown[] }],
  avScriptRows: rows,
});

type Loose = Record<string, unknown>;
const rowsOf = (project: unknown) => (project as { avScriptRows: Loose[] }).avScriptRows;

describe('migrateV22ToV23', () => {
  it('stamps the version and leaves ordinary rows untouched', () => {
    const after = migrateV22ToV23(v22Fixture([{ id: 'r1', shotNumber: '1/1', video: 'x', audio: '' }]) as never);
    expect(after.schemaVersion).toBe(23);
    expect(rowsOf(after)[0]).toEqual({ id: 'r1', shotNumber: '1/1', video: 'x', audio: '' });
  });

  /** Absent already means "this is a shot row", so only a true flag is kept. */
  it('keeps only an explicit true flag', () => {
    const after = migrateV22ToV23(v22Fixture([
      { id: 'a', shotNumber: '1', video: '', audio: '', noShot: true },
      { id: 'b', shotNumber: '2', video: '', audio: '', noShot: false },
      { id: 'c', shotNumber: '3', video: '', audio: '', noShot: 'yes' },
    ]) as never);
    expect(rowsOf(after).map((r) => 'noShot' in r)).toEqual([true, false, false]);
  });

  it('is reached by the migration chain', () => {
    const { project, migratedFrom } = migrateProject(v22Fixture());
    expect(migratedFrom).toBe(22);
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(CURRENT_PROJECT_SCHEMA_VERSION).toBeGreaterThanOrEqual(23);
  });
});
