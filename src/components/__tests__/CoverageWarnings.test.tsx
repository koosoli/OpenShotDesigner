/**
 * Coverage warnings — the seam between the shot list and `domain/shots/coverage`.
 *
 * The domain function is unit-tested and was correct throughout; the defect
 * pinned here lived entirely in the adapter, and was found by driving the real
 * app rather than by the suite. An actor MARKER is a per-setup floor-plan
 * element, so the same performer standing in two setups of one scene is two
 * elements with two ids — and the panel printed "CHARACTER C is in scene 1 but
 * appears in no shot" once per marker.
 *
 * BEHAVIOUR-ONLY (see `renderWithProject`): drive the DOM, assert what is
 * visible.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../context/FloorPlanContext', async () => {
  const harness = await import('./renderWithProject');
  return { useFloorPlan: () => harness.currentDeps() };
});
// Theme and the export modal live in their own context now, so the stub does
// too — a panel reaching for them through `useFloorPlan` fails here as it
// would in the app.
vi.mock('../../context/WorkspaceUIContext', async () => {
  const harness = await import('./renderWithProject');
  return { useWorkspaceUI: () => harness.currentWorkspaceUI() };
});

import { CoverageWarnings } from '../shotlist/CoverageWarnings';
import { projectFixture, renderWithProject } from './renderWithProject';
import type { Project } from '../../types';

afterEach(cleanup);

const actor = (id: string, name: string, characterId?: string) =>
  ({
    id,
    type: 'actor',
    x: 0,
    y: 0,
    rotation: 0,
    characterLetter: name.charAt(0),
    characterName: name,
    ...(characterId ? { characterId } : {}),
    color: '#fff',
    isStanding: true,
    path: [],
  }) as unknown as Project['setups'][number]['elements'][number];

const shot = (id: string, sceneNumber: string, shotSize: string, subjectActorIds: string[] = []) =>
  ({
    id,
    sceneNumber,
    shotNumber: id,
    name: '',
    cameraId: '',
    cameraLabel: 'A',
    shotSize,
    lensMm: 35,
    cameraAngle: 'Eye Level',
    movement: 'Static',
    aspectRatio: '16:9',
    frameRate: 25,
    subjectActorIds,
    framingDescription: '',
    status: 'planned',
    takesCount: 0,
    estDurationSeconds: 0,
    order: 1,
  }) as unknown as Project['setups'][number]['shots'][number];

const setup = (
  id: string,
  sceneNumber: string,
  elements: Project['setups'][number]['elements'],
  shots: Project['setups'][number]['shots'],
) =>
  ({
    id,
    name: id,
    sceneNumber,
    location: '',
    timeOfDay: 'Day INT',
    elements,
    shots,
  }) as unknown as Project['setups'][number];

/** Open the collapsed banner and read the warnings out of it. */
const openAndRead = async (user: ReturnType<typeof userEvent.setup>): Promise<string[]> => {
  await user.click(screen.getByRole('button', { name: /Coverage/ }));
  return screen.queryAllByRole('listitem').map((item) => item.textContent ?? '');
};

describe('CoverageWarnings', () => {
  /**
   * The regression. Two markers for one performer across two setups of scene 1,
   * neither in any shot: one warning, not two.
   */
  it('reports one performer once, however many setups they stand on', async () => {
    const user = userEvent.setup();
    renderWithProject(
      <CoverageWarnings scope="project" isLight={false} />,
      projectFixture({
        setups: [
          setup('s1', '1', [actor('a1', 'CHARACTER C')], [shot('1A', '1', 'WS')]),
          setup('s2', '1', [actor('a2', 'CHARACTER C')], [shot('1B', '1', 'CU')]),
        ],
      }),
    );

    const items = await openAndRead(user);
    const uncovered = items.filter((text) => text.includes('appears in no shot'));
    expect(uncovered).toHaveLength(1);
    expect(uncovered[0]).toContain('CHARACTER C');
  });

  it('merges markers that share a script character even under different names', async () => {
    const user = userEvent.setup();
    renderWithProject(
      <CoverageWarnings scope="project" isLight={false} />,
      projectFixture({
        setups: [
          setup('s1', '1', [actor('a1', 'JENNA', 'char-1')], [shot('1A', '1', 'WS')]),
          setup('s2', '1', [actor('a2', 'JENNA (double)', 'char-1')], [shot('1B', '1', 'CU')]),
        ],
      }),
    );

    const items = await openAndRead(user);
    expect(items.filter((text) => text.includes('appears in no shot'))).toHaveLength(1);
  });

  it('still treats two genuinely different performers as two', async () => {
    const user = userEvent.setup();
    renderWithProject(
      <CoverageWarnings scope="project" isLight={false} />,
      projectFixture({
        setups: [
          setup(
            's1',
            '1',
            [actor('a1', 'JENNA'), actor('a2', 'MARCUS')],
            [shot('1A', '1', 'WS')],
          ),
        ],
      }),
    );

    const items = await openAndRead(user);
    expect(items.filter((text) => text.includes('appears in no shot'))).toHaveLength(2);
  });

  it('resolves a shot’s subject through the same identity the scene uses', async () => {
    // The other half of the mapping: the shot names marker `a2`, the scene
    // knows the performer as `a1`, and they are the same person. Without the
    // translation the panel would say they are in the scene and in no shot
    // while a close-up of them sits in the list.
    const user = userEvent.setup();
    renderWithProject(
      <CoverageWarnings scope="project" isLight={false} />,
      projectFixture({
        setups: [
          setup('s1', '1', [actor('a1', 'JENNA')], [shot('1A', '1', 'WS')]),
          setup('s2', '1', [actor('a2', 'JENNA')], [shot('1B', '1', 'CU', ['a2'])]),
        ],
      }),
    );

    const items = await openAndRead(user);
    expect(items.filter((text) => text.includes('appears in no shot'))).toHaveLength(0);
  });

  it('says what it checked rather than showing a tick when it finds nothing', async () => {
    // An empty result is four questions answered, not a verdict on the
    // coverage, and the difference matters: a tick invites trust in checks
    // that were never run.
    const user = userEvent.setup();
    renderWithProject(
      <CoverageWarnings scope="scene" isLight={false} />,
      projectFixture({
        setups: [setup('s1', '1', [], [shot('1A', '1', 'WS'), shot('1B', '1', 'CU')])],
      }),
    );

    await user.click(screen.getByRole('button', { name: /Coverage/ }));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText(/these four questions/)).toBeTruthy();
  });

  it('does not ask the in-the-scene question at scene scope', async () => {
    // Scene scope cannot see the scene's other setups, so a performer whose
    // shots live on one of them would be reported as uncovered every time.
    const user = userEvent.setup();
    renderWithProject(
      <CoverageWarnings scope="scene" isLight={false} />,
      projectFixture({
        setups: [setup('s1', '1', [actor('a1', 'JENNA')], [shot('1A', '1', 'WS')])],
      }),
    );

    const items = await openAndRead(user);
    expect(items.filter((text) => text.includes('appears in no shot'))).toHaveLength(0);
  });
});
