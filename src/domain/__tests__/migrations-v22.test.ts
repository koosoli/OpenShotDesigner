import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';
import { migrateV21ToV22, normalizeTitlePage } from '../migrations/v21-to-v22';

const v21Fixture = () => ({
  schemaVersion: 21,
  title: 'Title page test',
  director: '',
  cinematographer: '',
  date: '2026-08-23',
  activeSetupId: 'setup-1',
  setups: [{ id: 'setup-1', name: 'S', sceneNumber: '1', elements: [] as unknown[] }],
});

type Loose = Record<string, unknown>;

describe('normalizeTitlePage', () => {
  it('keeps the text fields that carry text', () => {
    expect(normalizeTitlePage({ enabled: true, title: 'Nightfall', authors: 'A. Writer\nB. Writer', notes: '   ' })).toEqual({
      enabled: true,
      title: 'Nightfall',
      authors: 'A. Writer\nB. Writer',
    });
  });

  it('drops values of the wrong type rather than rendering them', () => {
    expect(normalizeTitlePage({ title: 42, credit: {}, enabled: 'yes', draft: 'yes' })).toBeUndefined();
  });

  /** Absent already means "not a draft", so false is stored as nothing. */
  it('stores only a true draft flag', () => {
    expect(normalizeTitlePage({ title: 'X', draft: false })).toEqual({ title: 'X' });
    expect(normalizeTitlePage({ title: 'X', draft: true })).toEqual({ title: 'X', draft: true });
  });

  it('removes a cover with nothing in it', () => {
    expect(normalizeTitlePage({})).toBeUndefined();
    expect(normalizeTitlePage({ title: '   ' })).toBeUndefined();
    expect(normalizeTitlePage('cover')).toBeUndefined();
  });
});

describe('migrateV21ToV22', () => {
  it('stamps the version and backfills nothing', () => {
    const after = migrateV21ToV22(v21Fixture() as never) as unknown as Loose;
    expect(after.schemaVersion).toBe(22);
    expect('titlePage' in after).toBe(false);
  });

  it('normalises a cover that is present', () => {
    const after = migrateV21ToV22({ ...v21Fixture(), titlePage: { title: 'Nightfall', draft: false, bogus: 1 } } as never) as unknown as Loose;
    expect(after.titlePage).toEqual({ title: 'Nightfall' });
  });

  it('is reached by the migration chain', () => {
    const { project, migratedFrom } = migrateProject(v21Fixture());
    expect(migratedFrom).toBe(21);
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(CURRENT_PROJECT_SCHEMA_VERSION).toBeGreaterThanOrEqual(23);
  });
});
