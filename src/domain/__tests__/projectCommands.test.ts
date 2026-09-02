import { describe, expect, it } from 'vitest';
import { applyProjectCommand } from '../project';
import type { Project } from '../../types';

const project = {
  id: 'project-1',
  title: 'Before',
  setups: [],
  activeSetupId: '',
} as unknown as Project;

describe('project command boundary', () => {
  it('applies an object patch without mutating the previous project', () => {
    const next = applyProjectCommand(project, { title: 'After' });
    expect(next.title).toBe('After');
    expect(project.title).toBe('Before');
  });

  it('evaluates functional changes against the latest project', () => {
    const latest = { ...project, title: 'Latest', productionCompany: 'Studio' };
    const next = applyProjectCommand(latest, (previous) => ({
      title: `${previous.title} Cut`,
      productionCompany: previous.productionCompany,
    }));
    expect(next).toMatchObject({ title: 'Latest Cut', productionCompany: 'Studio' });
  });
});
