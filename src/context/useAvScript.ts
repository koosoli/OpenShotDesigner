/**
 * The A/V script slice of the project: the two-column rows, the script format
 * mode, and keeping each row in step with the shot (and camera) it creates.
 * Extracted from `FloorPlanContext`.
 */
import { useMemo } from 'react';
import type { AVScriptRow, CameraElement, Project, SceneSetup, ScriptFormatMode, Shot, Vector2D } from '../types';
import { createId } from '../domain/ids';
import { nextCameraLabel } from '../domain/plan/cameraLabels';
import { CAMERA_COLOR_PALETTE } from '../constants/presets';
import { calculateFovAngle } from '../utils/geometry';

const SAMPLE_AV_ROWS: AVScriptRow[] = [
  {
    id: 'av-1',
    shotNumber: '1',
    shotName: 'WS - Master Establishing',
    shotSize: 'WS',
    video: 'EXT. GLASS PAVILION - SUNRISE. Crane down slowly as the golden morning sun reflects off the glass facade.',
    audio: 'MUSIC: Ethereal synth strings swell gently. Ambient birds chirping in the garden distance.',
    durationSec: 6,
  },
  {
    id: 'av-2',
    shotNumber: '2',
    shotName: 'MS - Protagonist Arrival',
    shotSize: 'MS',
    video: 'TRACKING SHOT with Marcus as he walks briskly toward the security entrance, briefcase in hand.',
    audio: 'MARCUS (V.O.)\n(calm, measured)\nThey told me the vault was impenetrable. They lied.',
    durationSec: 5,
  },
  {
    id: 'av-3',
    shotNumber: '3',
    shotName: 'CU - Biometric Scan',
    shotSize: 'CU',
    video: 'INSERT - Scanner panel flashing emerald green as Marcus places his palm on the glass plate.',
    audio: 'SFX: High-tech confirmation chime (DOUBLE BEEP). Pneumatic door lock releases with a hiss.',
    durationSec: 3,
  },
];

export const useAvScript = (input: {
  project: Project;
  activeSetup: SceneSetup;
  setRecordedProject: (updater: (prev: Project) => Project) => void;
  commitSetupUpdate: (updater: (prevSetup: SceneSetup) => SceneSetup | null) => void;
  updateShot: (id: string, updates: Partial<Shot>) => void;
  deleteShot: (id: string) => void;
  getNewCameraPosition: () => Vector2D;
  setSelectedShotId: (id: string | null) => void;
  setSelectedElementIds: (ids: string[]) => void;
}) => {
  const {
    project,
    activeSetup,
    setRecordedProject,
    commitSetupUpdate,
    updateShot,
    deleteShot,
    getNewCameraPosition,
    setSelectedShotId,
    setSelectedElementIds,
  } = input;

  // Memoised for the same reason as `scriptLines`: the fallback builds fresh
  // objects, which would change the context value's identity on every render.
  const avScriptRows: AVScriptRow[] = useMemo(() => project.avScriptRows || SAMPLE_AV_ROWS, [project.avScriptRows]);

  const scriptFormatMode: ScriptFormatMode = project.scriptFormatMode || 'lined_coverage';

  const setScriptFormatMode = (mode: ScriptFormatMode) => {
    setRecordedProject((prev) => ({ ...prev, scriptFormatMode: mode }));
  };

  const setAVScriptRows = (rows: AVScriptRow[]) => {
    setRecordedProject((prev) => ({ ...prev, avScriptRows: rows }));
  };

  const updateAVScriptRow = (id: string, updates: Partial<AVScriptRow>) => {
    // Resolve the linked shot OUTSIDE the updater: updaters must stay pure
    // (StrictMode runs them twice) and must never dispatch other updates.
    const target = avScriptRows.find((r) => r.id === id);
    if (target?.linkedShotId) {
      const shotUpdates: Partial<Shot> = {};
      if (updates.shotNumber !== undefined) shotUpdates.shotNumber = updates.shotNumber;
      if (updates.shotName !== undefined) shotUpdates.name = updates.shotName;
      if (updates.shotSize !== undefined) shotUpdates.shotSize = updates.shotSize;
      if (updates.video !== undefined) shotUpdates.framingDescription = updates.video;
      if (updates.audio !== undefined) shotUpdates.actionScriptNotes = updates.audio;
      if (updates.durationSec !== undefined) shotUpdates.estDurationSeconds = updates.durationSec;
      updateShot(target.linkedShotId, shotUpdates);
    }
    setRecordedProject((prev) => {
      const current = prev.avScriptRows || avScriptRows;
      return {
        ...prev,
        avScriptRows: current.map((row) => (row.id === id ? { ...row, ...updates } : row)),
      };
    });
  };

  /** A new camera on the active setup plus the shot it covers, for one row. */
  const buildCameraAndShot = (spec: {
    shotNumber: string;
    shotName: string;
    shotSize: Shot['shotSize'];
    video: string;
    audio: string;
    durationSec: number;
    order: number;
  }) => {
    const existingCameras = activeSetup.elements.filter((e) => e.type === 'camera') as CameraElement[];
    const camLetter = activeSetup.shootMode === 'multi_cam' ? nextCameraLabel(existingCameras) : 'A';
    const spawnPos = getNewCameraPosition();
    const shotId = createId('shot');
    const camId = createId('cam');

    const camera: CameraElement = {
      id: camId,
      type: 'camera',
      name: `Camera ${camLetter} (${spec.shotName})`,
      cameraLabel: camLetter,
      color: CAMERA_COLOR_PALETTE[existingCameras.length % CAMERA_COLOR_PALETTE.length],
      x: spawnPos.x,
      y: spawnPos.y,
      rotation: 0,
      locked: false,
      visible: true,
      focalLength: 35,
      sensorFormat: 'Super35',
      fovAngle: calculateFovAngle(35, 'Super35'),
      aspectRatio: '16:9',
      cameraHeight: 'Eye Level',
      rigType: 'Tripod',
      throwDistance: 160,
      path: [],
      associatedShotId: shotId,
    };

    const shot: Shot = {
      id: shotId,
      sceneNumber: activeSetup.sceneNumber || '1',
      shotNumber: spec.shotNumber,
      name: spec.shotName,
      cameraId: camId,
      cameraLabel: camLetter,
      shotSize: spec.shotSize,
      lensMm: 35,
      cameraAngle: 'Eye Level',
      movement: 'Static',
      aspectRatio: '16:9',
      frameRate: 24,
      subjectActorIds: [],
      framingDescription: spec.video,
      actionScriptNotes: spec.audio,
      status: 'planned',
      takesCount: 0,
      estDurationSeconds: spec.durationSec,
      order: spec.order,
    };

    commitSetupUpdate((prevSetup) => ({
      ...prevSetup,
      elements: [...prevSetup.elements, camera],
      shots: [...prevSetup.shots, shot],
    }));
    return { shotId, camId };
  };

  const addAVScriptRow = (row?: Partial<AVScriptRow>): string => {
    const currentRows = project.avScriptRows || avScriptRows;
    const shotNumber = row?.shotNumber || String(currentRows.length + 1);
    const shotName = row?.shotName || `Shot ${shotNumber}`;
    const shotSize = row?.shotSize || 'MS';
    const video = row?.video || `Framed on subject (${shotSize})`;
    const audio = row?.audio || '';
    const durationSec = row?.durationSec || 5;

    const { shotId, camId } = buildCameraAndShot({
      shotNumber,
      shotName,
      shotSize,
      video,
      audio,
      durationSec,
      order: activeSetup.shots.length + 1,
    });

    const avRowId = `av-${shotId}`;
    const newRow: AVScriptRow = { id: avRowId, shotNumber, shotName, shotSize, video, audio, durationSec, linkedShotId: shotId };
    setRecordedProject((prev) => ({
      ...prev,
      avScriptRows: [...(prev.avScriptRows || currentRows), newRow],
    }));

    setSelectedShotId(shotId);
    setSelectedElementIds([camId]);
    return avRowId;
  };

  const deleteAVScriptRow = (id: string) => {
    const current = project.avScriptRows || avScriptRows;
    const row = current.find((r) => r.id === id);
    if (row?.linkedShotId) {
      deleteShot(row.linkedShotId);
    }
    setRecordedProject((prev) => {
      const rows = prev.avScriptRows || current;
      return {
        ...prev,
        avScriptRows: rows.filter((r) => r.id !== id && r.linkedShotId !== row?.linkedShotId),
      };
    });
  };

  const syncAVRowToShot = (rowId: string): string => {
    const current = project.avScriptRows || avScriptRows;
    const row = current.find((r) => r.id === rowId);
    if (!row) return '';

    const shotName = row.shotName || `Shot ${row.shotNumber}`;
    const { shotId } = buildCameraAndShot({
      shotNumber: row.shotNumber,
      shotName,
      shotSize: row.shotSize || 'MS',
      video: row.video,
      audio: row.audio,
      durationSec: row.durationSec || 5,
      order: activeSetup.shots.length,
    });

    // Link row back to created shot
    updateAVScriptRow(rowId, { linkedShotId: shotId });
    setSelectedShotId(shotId);
    return shotId;
  };

  return {
    avScriptRows,
    scriptFormatMode,
    setScriptFormatMode,
    setAVScriptRows,
    updateAVScriptRow,
    addAVScriptRow,
    deleteAVScriptRow,
    syncAVRowToShot,
  };
};
