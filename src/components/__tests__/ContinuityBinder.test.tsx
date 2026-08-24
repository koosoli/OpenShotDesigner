/**
 * The continuity binder — the seam between the panel and
 * `domain/continuity/binder`.
 *
 * The domain is unit-tested; what these cases cover is what the component
 * actually persists, and the two invariants a form over a shared collection
 * has to hold: a second edit in the same tick must not discard the first, and
 * a linked character and a typed name must never both be set (the derivation
 * ignores the name when there is an id, so a project holding both would read
 * one way on screen and another on paper).
 *
 * BEHAVIOUR-ONLY (see `renderWithProject`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../context/FloorPlanContext', async () => {
  const harness = await import('./renderWithProject');
  return { useFloorPlan: () => harness.currentDeps() };
});

import { ContinuityBinder } from '../continuity/ContinuityBinder';
import { currentProject, projectFixture, renderWithProject } from './renderWithProject';
import type { Project } from '../../types';

afterEach(cleanup);

const scripted = (): Project =>
  projectFixture({
    characters: [
      { id: 'c1', canonicalName: 'JENNA', aliases: [] },
      { id: 'c2', canonicalName: 'MARCUS', aliases: [] },
    ],
    scriptScenes: [
      {
        id: 'sc4',
        sceneNumber: '4',
        heading: 'INT. KITCHEN - DAY',
        scriptDay: 'D1',
        characterIds: [],
        breakdownItemIds: [],
      },
    ],
  } as unknown as Partial<Project>);

const addNote = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Note' }));

const notes = () => currentProject().continuityNotes ?? [];

describe('ContinuityBinder', () => {
  it('adds a note in the department currently filtered to', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityBinder isLight={false} />, scripted());

    await user.selectOptions(screen.getByLabelText('Filter by department'), 'props');
    await addNote(user);

    expect(notes()).toHaveLength(1);
    expect(notes()[0].department).toBe('props');
    // Nothing else is carried: a wrong look nobody reads twice is worse than a
    // blank, which is the same rule the take log applies to its good flag.
    expect(notes()[0].description).toBe('');
  });

  it('persists what was typed into each field', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityBinder isLight={false} />, scripted());
    await addNote(user);

    await user.type(screen.getByLabelText('Scene'), '4');
    await user.type(screen.getByLabelText(/looked like/), 'Navy overcoat');
    await user.type(screen.getByLabelText('What changes during the scene'), 'Coat off at the door');

    const note = notes()[0];
    expect(note.sceneNumber).toBe('4');
    expect(note.description).toBe('Navy overcoat');
    expect(note.changeNote).toBe('Coat off at the door');
  });

  it('clears the typed name when a script character is linked', async () => {
    // The derivation ignores `characterName` whenever `characterId` is set, so
    // a note holding both would read one way on screen and another on paper.
    const user = userEvent.setup();
    renderWithProject(<ContinuityBinder isLight={false} />, scripted());
    await addNote(user);

    await user.type(screen.getByLabelText('Who this is about'), 'EXTRA 3');
    expect(notes()[0].characterName).toBe('EXTRA 3');

    await user.selectOptions(screen.getByLabelText('Character'), 'c1');
    expect(notes()[0].characterId).toBe('c1');
    expect(notes()[0].characterName).toBeUndefined();
  });

  it('keeps both notes when two are added in the same tick', () => {
    /**
     * The functional-update invariant, and it needs the clicks UNAWAITED to
     * test anything. `userEvent.click` flushes between calls, so two awaited
     * clicks pass just as well against a handler that reads the project from
     * its render closure — which is the bug. Dispatched together, React batches
     * them into one render, the second handler sees the state the first did,
     * and a non-functional update silently drops one note.
     *
     * Verified by mutation: rewriting `mutate` to build its patch from the
     * closed-over `notes` turns this case red and leaves the rest green.
     */
    renderWithProject(<ContinuityBinder isLight={false} />, scripted());
    const button = screen.getByRole('button', { name: 'Note' });

    // Both native clicks inside ONE `act`, so React batches them into a single
    // render and the second handler runs against the state the first saw.
    act(() => {
      button.click();
      button.click();
    });

    expect(notes()).toHaveLength(2);
  });

  it('keeps both notes when each is edited in turn', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityBinder isLight={false} />, scripted());
    await addNote(user);
    await addNote(user);

    const descriptions = screen.getAllByLabelText(/looked like/);
    await user.type(descriptions[0], 'Navy overcoat');
    await user.type(descriptions[1], 'Grey raincoat');

    expect(notes()).toHaveLength(2);
    expect(notes().map((note) => note.description)).toEqual(['Navy overcoat', 'Grey raincoat']);
  });

  it('warns when two notes disagree on one script day', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityBinder isLight={false} />, scripted());
    await addNote(user);
    await addNote(user);

    const days = screen.getAllByLabelText('Script day');
    const descriptions = screen.getAllByLabelText(/looked like/);
    await user.type(days[0], 'D1');
    await user.type(days[1], 'D1');
    await user.type(descriptions[0], 'Navy overcoat');
    await user.type(descriptions[1], 'Grey raincoat');

    await user.click(screen.getByRole('button', { name: /Continuity conflicts/ }));
    expect(screen.getByText(/differs across script day D1/)).toBeTruthy();
  });

  it('takes the script day from the scene when the note leaves it blank', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityBinder isLight={false} />, scripted());
    await addNote(user);
    await addNote(user);

    const scenes = screen.getAllByLabelText('Scene');
    const descriptions = screen.getAllByLabelText(/looked like/);
    await user.type(scenes[0], '4');
    await user.type(scenes[1], '4');
    await user.type(descriptions[0], 'Navy overcoat');
    await user.type(descriptions[1], 'Grey raincoat');

    await user.click(screen.getByRole('button', { name: /Continuity conflicts/ }));
    expect(screen.getByText(/differs across script day D1/)).toBeTruthy();
  });

  it('deletes only the note asked for', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityBinder isLight={false} />, scripted());
    await addNote(user);
    await addNote(user);
    await user.type(screen.getAllByLabelText(/looked like/)[1], 'Grey raincoat');

    await user.click(screen.getAllByRole('button', { name: 'Delete this note' })[0]);

    expect(notes()).toHaveLength(1);
    expect(notes()[0].description).toBe('Grey raincoat');
  });

  it('filters the list without touching what is stored', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityBinder isLight={false} />, scripted());
    await addNote(user);
    await user.selectOptions(screen.getByLabelText('Filter by department'), 'props');
    await addNote(user);

    expect(notes()).toHaveLength(2);
    // Filtered to props: the wardrobe note is hidden, not deleted.
    expect(screen.getAllByLabelText(/looked like/)).toHaveLength(1);

    await user.selectOptions(screen.getByLabelText('Filter by department'), 'all');
    expect(screen.getAllByLabelText(/looked like/)).toHaveLength(2);
  });

  it('offers a free-text name when the project has no script', async () => {
    // Rule 1: a production with no screenplay still dresses people.
    const user = userEvent.setup();
    renderWithProject(<ContinuityBinder isLight={false} />, projectFixture());
    await addNote(user);

    expect(screen.queryByLabelText('Character')).toBeNull();
    await user.type(screen.getByLabelText('Who this is about'), 'EXTRA 3');
    expect(notes()[0].characterName).toBe('EXTRA 3');
  });
});
