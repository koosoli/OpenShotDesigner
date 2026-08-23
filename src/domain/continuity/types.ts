/**
 * Continuity log domain types — the script supervisor's record of what was
 * actually shot, and the source of the DaVinci Resolve metadata export.
 *
 * The unit is the TAKE. Before this existed a `Shot` carried `takesCount:
 * number` and nothing else, so there was nowhere to put a take's file name,
 * its good/NG flag or what happened in it. `takesCount` is now derived from
 * these records (see `logic.takesCountFor`) rather than stored twice; two
 * counters that can disagree means one of them is a lie.
 *
 * Rule 13 applies throughout: a value the app does not know stays `undefined`.
 * A continuity report is read months later by someone who was not there, and a
 * plausible default in it is worse than a blank — it is confidently wrong.
 */

/**
 * Camera values as they actually were on this take, when they differed from
 * the shot's plan. Absent fields mean "as planned" and resolve against the
 * shot and its `CameraElement` at export time; they are not copied in, so
 * correcting the plan corrects every take that never overrode it.
 */
export interface TakeCameraOverrides {
  /** Resolve's "Camera #" — "Main Cam", "A", "B". */
  cameraLabel?: string;
  cameraType?: string;
  cameraFps?: number;
  /** As written on the report: "1/50". Free text, because that is what it is. */
  shutterSpeed?: string;
  iso?: number;
  /** Kelvin. The one camera value the floor-plan model has no home for. */
  whitePointKelvin?: number;
  focalMm?: number;
  filter?: string;
  aperture?: string;
  cameraNotes?: string;
}

/**
 * Circumstances of the take that the schedule would otherwise supply. Present
 * only when the day diverged from the plan — the scene that moved inside
 * because it rained, the night exterior shot at dusk.
 */
export interface TakeSlateOverrides {
  sceneNumber?: string;
  /** What the slate said, when it differs from the shot list. */
  shotNumber?: string;
  /** `YYYY_MM_DD` as Resolve wants it, when the take was not shot on its day's date. */
  dateRecorded?: string;
  environment?: 'INT' | 'EXT';
  location?: string;
  dayNight?: 'DAY' | 'NIGHT';
  /**
   * What the shot is, when the shot's own framing description is empty or the
   * take needs saying differently. Falls back to the shot, so correcting the
   * shot list still corrects every take that never overrode it.
   */
  description?: string;
}

/**
 * Production-level values the app has nowhere else to keep.
 *
 * Most of the crew columns resolve from the crew list, and Production Company
 * / Production Name / Director / DOP each have a real field on the project —
 * so those are edited at source rather than copied here (rule 37). Sound Mixer
 * and Script Supervisor have no project field, and a production that has not
 * built a crew list still has to be able to name them on the report.
 *
 * Strictly a FALLBACK: anyone actually assigned the role on the crew list wins,
 * so filling the crew list later cannot leave a stale name on the paperwork.
 */
export interface ContinuityCrewDefaults {
  soundMixer?: string;
  scriptSupervisor?: string;
}

export interface Take {
  id: string;
  /** The `Shot` this covers. Unplanned pickups get a real shot, flagged. */
  shotId: string;
  /** `ProductionDay.id` this was shot on. A shot can be covered across days. */
  productionDayId?: string;
  takeNumber: number;
  /**
   * The camera's file name on the card, extension included ("A001C002.mov").
   * Deliberately optional and deliberately NOT typed live: on set the person
   * logging continuity does not know it — the camera assistant does, and the
   * names come off the card at wrap. It is filled in the reconciliation pass
   * (`fileNames.ts`), which is the only place the guess-the-next-name rule
   * runs. A take with no file name still exports; it simply attaches to
   * nothing in Resolve, which is the honest state.
   */
  fileName?: string;
  /** Undefined = not yet judged, which is not the same as NG. */
  isGoodTake?: boolean;
  /** What happened in the take. Becomes the Resolve `Comments` column. */
  comments?: string;
  keywords?: string[];
  /** Sound roll / camera card identifier — the `Roll Card #` column. */
  rollCard?: string;
  cameraOverrides?: TakeCameraOverrides;
  slateOverrides?: TakeSlateOverrides;
  /** ISO timestamp the take was logged, for ordering within a day. */
  loggedAt?: string;
}
