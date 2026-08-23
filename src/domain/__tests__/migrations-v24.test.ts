import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';
import { migrateV23ToV24 } from '../migrations/v23-to-v24';

const v23Fixture = (shots: unknown[] = [], extra: Record<string, unknown> = {}) => ({
  schemaVersion: 23,
  title: 'Continuity migration test',
  director: '',
  cinematographer: '',
  date: '2026-08-23',
  activeSetupId: 'setup-1',
  setups: [
    { id: 'setup-1', name: 'S', sceneNumber: '1', elements: [] as unknown[], shots },
  ],
  ...extra,
});

type Loose = Record<string, unknown>;
const shotsOf = (project: unknown) =>
  (project as { setups: Array<{ shots: Loose[] }> }).setups[0].shots;

describe('migrateV23ToV24', () => {
  it('stamps the version and leaves a project that never shot anything alone', () => {
    const raw = v23Fixture();
    const after = migrateV23ToV24(raw as never);
    expect(after.schemaVersion).toBe(24);
    // Absent, not []: `takes` is optional and absent-safe, so backfilling it
    // would rewrite content the migration has nothing to say about.
    expect('takes' in after).toBe(false);
  });

  it('keeps a log that is already there', () => {
    const existing = [{ id: 't1', shotId: 'shot-1', takeNumber: 1 }];
    const after = migrateV23ToV24(v23Fixture([], { takes: existing }) as never);
    expect(after.takes).toEqual(existing);
  });

  /** Absent already means "planned", so only an explicit true flag is kept. */
  it('keeps only an explicit unplanned flag', () => {
    const after = migrateV23ToV24(
      v23Fixture([
        { id: 'a', shotNumber: '1A', unplanned: true },
        { id: 'b', shotNumber: '1B', unplanned: false },
        { id: 'c', shotNumber: '1C', unplanned: 'yes' },
        { id: 'd', shotNumber: '1D' },
      ]) as never,
    );
    expect(shotsOf(after).map((shot) => 'unplanned' in shot)).toEqual([true, false, false, false]);
  });

  /**
   * A stored count says three takes happened but not what they were called,
   * which day they were on, or which was good. Three blank records would look
   * like a log somebody kept, so the count stays where it is and
   * `takesCountFor` falls back to it.
   */
  it('does not fabricate take records from the legacy takesCount', () => {
    const after = migrateV23ToV24(
      v23Fixture([{ id: 'a', shotNumber: '1A', takesCount: 3 }]) as never,
    );
    expect('takes' in after).toBe(false);
    expect(shotsOf(after)[0].takesCount).toBe(3);
  });

  it('is reached by the migration chain', () => {
    const { project, migratedFrom } = migrateProject(v23Fixture());
    expect(migratedFrom).toBe(23);
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(CURRENT_PROJECT_SCHEMA_VERSION).toBe(24);
  });

  it('is deterministic', () => {
    const input = () => v23Fixture([{ id: 'a', shotNumber: '1A', unplanned: true }]) as never;
    expect(migrateV23ToV24(input())).toEqual(migrateV23ToV24(input()));
  });
});
