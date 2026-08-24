/**
 * The schedule, driven the way an AD drives it.
 *
 * A shooting day is not a local fact: the call sheet, the day-needs report, the
 * budget and the continuity checklist all read from it, and a scene scheduled
 * on the wrong day is wrong in five places at once. These tests assert what
 * ended up on the project after an interaction, because "the strip moved on
 * screen" and "the day now holds that block" are different claims — and the
 * second one is what everything downstream reads.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderPanel } from './renderPanel';

afterEach(cleanup);

const mount = () => renderPanel({ module: 'schedule/SchedulePanel', exportName: 'SchedulePanel' });

const addDay = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /Add shooting day/i }));
};

describe('SchedulePanel', () => {
  it('adds a shooting day to the project', async () => {
    const user = userEvent.setup();
    const { project } = await mount();
    const before = project().productionDays?.length ?? 0;

    await addDay(user);

    expect(project().productionDays ?? []).toHaveLength(before + 1);
    // The example project already carries days, so this is deliberately
    // relative — an absolute count would pass or fail on the fixture rather
    // than on the behaviour.
  });

  it('renames a day and keeps the rest of it intact', async () => {
    const user = userEvent.setup();
    const { project } = await mount();
    await addDay(user);

    const day = (project().productionDays ?? []).at(-1)!;
    const field = screen.getByPlaceholderText(
      `Shooting day ${(project().productionDays ?? []).length}`,
    );
    await user.type(field, 'Diner exteriors');

    const renamed = (project().productionDays ?? []).find((entry) => entry.id === day.id);
    expect(renamed?.name).toContain('Diner exteriors');
    expect(renamed?.scheduleBlockIds).toEqual(day.scheduleBlockIds);
  });

  /**
   * Scheduling a setup is what the continuity checklist and the call sheet both
   * key off. The block has to land in the day's ordered list, not merely exist.
   */
  it('schedules a setup onto the first day', async () => {
    const user = userEvent.setup();
    const { project } = await mount();
    await addDay(user);

    const addButtons = screen.getAllByRole('button', { name: 'Add to first shooting day' });
    expect(addButtons.length).toBeGreaterThan(0);
    await user.click(addButtons[0]);

    const day = (project().productionDays ?? [])[0];
    expect(day.scheduleBlockIds.length).toBeGreaterThan(0);
    // Every id the day holds resolves to a real block.
    const blockIds = new Set((project().scheduleBlocks ?? []).map((block) => block.id));
    for (const id of day.scheduleBlockIds) {
      expect(blockIds.has(id)).toBe(true);
    }
  });

  it('returns a scheduled block to the unscheduled pool', async () => {
    const user = userEvent.setup();
    const { project } = await mount();
    await user.click(screen.getAllByRole('button', { name: 'Add to first shooting day' })[0]);
    const scheduledBefore = (project().productionDays ?? [])[0].scheduleBlockIds.length;
    const blocksBefore = (project().scheduleBlocks ?? []).length;
    expect(scheduledBefore).toBeGreaterThan(0);

    await user.click(screen.getAllByRole('button', { name: 'Return to unscheduled' })[0]);

    const day = (project().productionDays ?? [])[0];
    expect(day.scheduleBlockIds).toHaveLength(scheduledBefore - 1);
    // The block itself survives — it is unscheduled, not deleted.
    expect(project().scheduleBlocks ?? []).toHaveLength(blocksBefore);
  });

  /**
   * Deleting a day must not delete the work planned on it. The blocks return to
   * the pool; a day is a container, and losing the strips with it would mean
   * re-entering the plan.
   */
  it('deletes a day without deleting the blocks that were on it', async () => {
    const user = userEvent.setup();
    const { project } = await mount();
    await user.click(screen.getAllByRole('button', { name: 'Add to first shooting day' })[0]);
    const daysBefore = (project().productionDays ?? []).length;
    const blocksBefore = (project().scheduleBlocks ?? []).length;

    await user.click(screen.getAllByRole('button', { name: 'Delete this shooting day' })[0]);

    expect(project().productionDays ?? []).toHaveLength(daysBefore - 1);
    // Blocks return to the pool rather than going with the day: a day is a
    // container, and losing the strips would mean re-entering the plan.
    expect(project().scheduleBlocks ?? []).toHaveLength(blocksBefore);
  });

  /**
   * Continuity takes point at a production day. Deleting the day unhooks them
   * rather than deleting them: the footage exists on a card, and the day going
   * away does not unshoot it.
   */
  it('unhooks continuity takes from a deleted day, keeping the takes', async () => {
    const user = userEvent.setup();
    const { project, api, act } = await mount();
    await addDay(user);
    const dayId = (project().productionDays ?? [])[0].id;

    await act(() => {
      api().updateProjectMeta({
        takes: [{ id: 'take-1', shotId: 'some-shot', takeNumber: 1, productionDayId: dayId }],
      });
    });

    await user.click(screen.getAllByRole('button', { name: 'Delete this shooting day' })[0]);

    const takes = project().takes ?? [];
    expect(takes).toHaveLength(1);
    expect(takes[0].productionDayId).toBeUndefined();
  });

  it('records an estimate against the block it was typed on', async () => {
    const user = userEvent.setup();
    const { project } = await mount();
    await addDay(user);
    await user.click(screen.getAllByRole('button', { name: 'Add to first shooting day' })[0]);

    const scheduledId = (project().productionDays ?? [])[0].scheduleBlockIds[0];
    const minuteFields = screen.getAllByPlaceholderText('—');
    await user.type(minuteFields[0], '45');

    const block = (project().scheduleBlocks ?? []).find((entry) => entry.id === scheduledId);
    expect(block?.estimatedMinutes).toBeGreaterThan(0);
  });
});
