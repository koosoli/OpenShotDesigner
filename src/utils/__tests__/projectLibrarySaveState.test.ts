import { describe, expect, it } from 'vitest';
import { createProject, flushPendingWrites, getSaveState, initProjectLibrary, markSavePending, writeProject } from '../projectLibrary';

describe('save-state ordering with debounced screenplay edits', () => {
  it('does not announce saved when an older write finishes ahead of the new debounce', async () => {
    await initProjectLibrary();
    const original = createProject({ title: 'First draft' });
    writeProject(original);
    markSavePending(original.id);
    await flushPendingWrites();
    expect(getSaveState()).toBe('saving');
    writeProject({ ...original, title: 'Latest draft' });
    await flushPendingWrites();
    expect(getSaveState()).toBe('saved');
  });
  it('does not let a write for another production acknowledge this production', async () => {
    const a = createProject({ title: 'A' }), b = createProject({ title: 'B' });
    markSavePending(a.id);
    writeProject(b);
    await flushPendingWrites();
    expect(getSaveState()).toBe('saving');
    writeProject(a);
    await flushPendingWrites();
    expect(getSaveState()).toBe('saved');
  });
});
