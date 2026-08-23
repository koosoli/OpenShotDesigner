import { describe, expect, it } from 'vitest';
import {
  allScenarioFixtures,
  broadcastFixture,
  concertFixture,
  floorPlanOnlyFixture,
  narrativeFixture,
} from './fixtures/scenarios';
import { castFilterForDay, castPersonIdsForDay, deriveCallSheet, deriveDood } from '../reports';
import { calculatePowerLoad } from '../power';
import { parseSceneHeading } from '../script/logic';
import { deriveAllScenesEquipment } from '../../utils/equipmentList';
import type { Project } from '../../types';

/**
 * Plan §44 requires four representative test projects. Until now only the
 * narrative one existed, which is why a whole class of bug — a derivation that
 * quietly assumes a screenplay — could ship. These run the real report builders
 * over all four.
 */

const callSheetFor = (project: Project) => {
  const day = (project.productionDays ?? [])[0];
  const blocks = project.scheduleBlocks ?? [];
  const castPersonIds = castFilterForDay(day.scheduleBlockIds, blocks, {
    scriptScenes: project.scriptScenes,
    setups: project.setups,
    castAssignments: project.castAssignments,
  });
  return deriveCallSheet({
    day,
    blocks,
    productionTitle: project.title,
    people: project.people ?? [],
    castPersonIds,
    locations: [],
  });
};

describe('every scenario survives the derivations', () => {
  it.each(allScenarioFixtures().map((f) => [f.label, f.project] as const))(
    '%s: equipment derivation does not throw and returns an array',
    (_label, project) => {
      const equipment = deriveAllScenesEquipment(project.setups);
      expect(Array.isArray(equipment)).toBe(true);
    },
  );

  it.each(
    allScenarioFixtures()
      .filter((f) => (f.project.productionDays ?? []).length > 0)
      .map((f) => [f.label, f.project] as const),
  )('%s: the call sheet lists its scheduled strips', (_label, project) => {
    const sheet = callSheetFor(project);
    expect(sheet.schedule.length).toBeGreaterThan(0);
    expect(sheet.crew.length).toBeGreaterThan(0);
  });
});

describe('narrative scenario', () => {
  const project = narrativeFixture();

  it('reaches cast through the screenplay scene', () => {
    const ids = castPersonIdsForDay(project.productionDays![0].scheduleBlockIds, project.scheduleBlocks!, {
      scriptScenes: project.scriptScenes,
      setups: project.setups,
      castAssignments: project.castAssignments,
    });
    expect(ids.sort()).toEqual(['p-alex', 'p-sarah']);
  });

  it('puts both performers on the call sheet', () => {
    expect(callSheetFor(project).cast.map((c) => c.displayName).sort()).toEqual([
      'Ingrid Falk',
      'Ruth Oyelaran',
    ]);
  });
});

describe('concert scenario — no script anywhere', () => {
  const project = concertFixture();

  it('has no screenplay, scenes, characters or cast assignments at all', () => {
    expect(project.scriptLines).toBeUndefined();
    expect(project.scriptScenes).toBeUndefined();
    expect(project.characters).toBeUndefined();
    expect(project.castAssignments).toBeUndefined();
  });

  it('schedules nothing by scene', () => {
    expect((project.scheduleBlocks ?? []).some((block) => block.kind === 'scene')).toBe(false);
  });

  /**
   * The performers are in `people` as `kind: 'cast'`. With no characters to
   * resolve through, the day yields no cast ids — and an empty id list must not
   * be read as "nobody is called", or the show-day call sheet goes out with an
   * empty cast table while the band is on the plan. This is last session's bug
   * one layer up: the derivation was taught to walk setups, but a production
   * with no character model at all still produces `[]`.
   */
  it('still calls the performers on the show-day sheet', () => {
    const sheet = callSheetFor(project);
    expect(sheet.cast.map((c) => c.displayName).sort()).toEqual(['Kofi Mensah', 'Mira Anand']);
  });

  it('calls the crew', () => {
    expect(callSheetFor(project).crew.map((c) => c.displayName).sort()).toEqual([
      'Dan Whitfield',
      'Petra Nowak',
    ]);
  });

  it('loads the power plan without a screenplay in sight', () => {
    const load = calculatePowerLoad(project.powerPlan!.consumers, () => undefined);
    expect(load.knownWatts).toBe(2400);
    expect(load.unknownConsumerCount).toBe(0);
  });

  it('produces an empty day-out-of-days rather than failing', () => {
    const dood = deriveDood({
      days: project.productionDays ?? [],
      blocks: project.scheduleBlocks ?? [],
      characters: [],
      castAssignments: project.castAssignments,
      people: project.people,
      getSceneCharacterIds: () => undefined,
    });
    expect(dood.columns.length).toBe(1);
    expect(dood.rows).toEqual([]);
  });
});

describe('broadcast scenario — segments, no screenplay', () => {
  const project = broadcastFixture();

  it('schedules by segment and by shots, never by scene', () => {
    const kinds = (project.scheduleBlocks ?? []).map((block) => block.kind);
    expect(kinds).toContain('segment');
    expect(kinds).toContain('shots');
    expect(kinds).not.toContain('scene');
  });

  it('calls the gallery crew on the transmission-day sheet', () => {
    expect(callSheetFor(project).crew.length).toBe(3);
  });

  it('carries an SDI run for every camera', () => {
    const elements = project.setups[0].elements;
    const cameras = elements.filter((el) => el.type === 'camera');
    const cables = elements.filter((el) => el.type === 'cable');
    expect(cables.length).toBe(cameras.length);
  });
});

describe('floor-plan-only scenario — must always remain supported', () => {
  const project = floorPlanOnlyFixture();

  it('has no production model around it whatsoever', () => {
    expect(project.people).toBeUndefined();
    expect(project.productionDays).toBeUndefined();
    expect(project.scheduleBlocks).toBeUndefined();
    expect(project.scriptLines).toBeUndefined();
    expect(project.setups[0].shots).toEqual([]);
  });

  it('still holds a readable plan', () => {
    const types = project.setups[0].elements.map((el) => el.type);
    expect(types).toContain('wall');
    expect(types).toContain('prop');
    expect(types).toContain('stroke');
  });

  /**
   * The furniture on a bare plan IS the equipment list — set dressing is what
   * an art department carries. A floor-plan-only project therefore has a real
   * equipment list and no production model at all, which is the combination
   * plan §44 says must keep working.
   */
  it('derives set dressing from the furniture, with no shots or crew involved', () => {
    const equipment = deriveAllScenesEquipment(project.setups);
    expect(equipment.map((item) => item.category)).toEqual(['props', 'props']);
    expect(equipment.every((item) => item.usedInSetups.length === 1)).toBe(true);
  });
});

/**
 * The number a call sheet prints is the production-issued one when there is
 * one. Asserted through `deriveCallSheet` rather than on the helper alone,
 * because the helper being right is worth nothing if the sheet does not call it.
 */
describe('production phone reaches the call sheet', () => {
  const withUnitHandsets = (): Project => {
    const base = concertFixture();
    return {
      ...base,
      people: (base.people ?? []).map((person) =>
        person.id === 'p-le'
          ? { ...person, phone: '+49 170 555 0104', productionPhone: '+49 151 555 0011' }
          : { ...person, phone: '+49 170 555 0105' },
      ),
    };
  };

  it('prints the production number for whoever has one', () => {
    const sheet = callSheetFor(withUnitHandsets());
    const designer = sheet.crew.find((c) => c.displayName === 'Petra Nowak');
    expect(designer?.phone).toBe('+49 151 555 0011');
  });

  it('prints the personal number for everyone who does not', () => {
    const sheet = callSheetFor(withUnitHandsets());
    const foh = sheet.crew.find((c) => c.displayName === 'Dan Whitfield');
    expect(foh?.phone).toBe('+49 170 555 0105');
  });
});

/**
 * Reported: "it is not clear how I can associate a scene's location with the
 * location so that it will show up on the call sheet."
 *
 * It was not a discoverability problem alone. A scene contributed a location to
 * the call sheet ONLY when someone had linked it to a canonical `Location` by
 * hand — the setup and shots paths both fall back to their own free text, and
 * the scene path did not. So a day scheduled entirely by scene printed "No
 * shooting location is linked to this day" while the slugline plainly said
 * INT. LIVING ROOM - NIGHT.
 */
describe('a scene heading names the location on the call sheet', () => {
  it('parses the set out of a slugline', () => {
    expect(parseSceneHeading('INT. LIVING ROOM - NIGHT').location).toBe('LIVING ROOM');
    expect(parseSceneHeading('EXT. BACKLOT AVENUE - DAY').location).toBe('BACKLOT AVENUE');
  });

  it('keeps the set name when there is no time of day', () => {
    expect(parseSceneHeading('INT. STAIRWELL').location).toBe('STAIRWELL');
  });

  it('reads the interior/exterior marker, which a call sheet prints', () => {
    expect(parseSceneHeading('EXT. BACKLOT AVENUE - DAY').intExt).toBe('EXT');
    expect(parseSceneHeading('INT. LIVING ROOM - NIGHT').timeOfDay).toBe('NIGHT');
  });
});
