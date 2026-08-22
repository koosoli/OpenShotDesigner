import { describe, it, expect } from 'vitest';
import {
  END_SLOT,
  START_SLOT,
  boardedFrames,
  framesOf,
  keyFrameImage,
  setFramePatch,
  slotsOf,
} from '../storyboardFrames';
import type { CameraElement, Shot, Waypoint } from '../../types';

let seq = 0;
const makeShot = (extra: Partial<Shot> = {}): Shot => ({
  id: `shot-test-${++seq}`,
  sceneNumber: '1',
  shotNumber: `1/${seq}`,
  name: `Shot ${seq}`,
  cameraId: 'cam-1',
  cameraLabel: 'A',
  shotSize: 'MS',
  lensMm: 35,
  cameraAngle: 'Eye Level',
  movement: 'Static',
  aspectRatio: '16:9',
  frameRate: 24,
  subjectActorIds: [],
  framingDescription: '',
  status: 'planned',
  takesCount: 0,
  estDurationSeconds: 20,
  order: seq,
  ...extra,
});

const waypoint = (id: string, beat: number): Waypoint => ({ id, x: 100 + beat * 10, y: 200, beat });

const makeCamera = (path: Waypoint[] = []): CameraElement => ({
  id: 'cam-1',
  type: 'camera',
  x: 0,
  y: 0,
  rotation: 0,
  name: 'Camera A',
  cameraLabel: 'A',
  color: '#3b82f6',
  focalLength: 35,
  sensorFormat: 'Super35',
  fovAngle: 45,
  aspectRatio: '16:9',
  cameraHeight: 'Eye Level',
  rigType: 'Tripod',
  throwDistance: 320,
  path,
});

describe('framesOf', () => {
  it('folds the legacy single image into the start slot', () => {
    const frames = framesOf(makeShot({ storyboardImage: 'data:start', storyboardFit: 'cover' }));
    expect(frames[START_SLOT]?.image).toBe('data:start');
    expect(frames[START_SLOT]?.fit).toBe('cover');
  });

  it('folds the legacy end image into the end slot', () => {
    const frames = framesOf(
      makeShot({ storyboardImage: 'data:start', storyboardImageEnd: 'data:end' })
    );
    expect(frames[START_SLOT]?.image).toBe('data:start');
    expect(frames[END_SLOT]?.image).toBe('data:end');
  });

  it('does not re-fold a mirrored non-start frame into a duplicate start slot', () => {
    // State produced by setFramePatch after boarding only the end slot.
    const shot = makeShot({
      storyboardFrames: { 'wp-1': { image: 'data:end' } },
      storyboardImage: 'data:end',
      storyboardFit: 'cover',
    });
    const frames = framesOf(shot);
    expect(frames[START_SLOT]).toBeUndefined();
    expect(frames['wp-1']?.image).toBe('data:end');
  });

  it('still folds the legacy image when no slot already holds that art', () => {
    const shot = makeShot({
      storyboardFrames: { 'wp-1': { image: 'data:other' } },
      storyboardImage: 'data:legacy',
    });
    const frames = framesOf(shot);
    expect(frames[START_SLOT]?.image).toBe('data:legacy');
    expect(frames['wp-1']?.image).toBe('data:other');
  });
});

describe('setFramePatch', () => {
  /**
   * The legacy single-image fields used to be written on every capture, so one
   * picture was stored twice and the two could disagree. They are now cleared
   * on write and only read (by `framesOf`, for projects that still hold them).
   */
  it('writes the frame and clears the retired mirrors', () => {
    const shot = makeShot();
    const patch = setFramePatch(shot, START_SLOT, { image: 'data:a', fit: 'cover' });
    expect(patch.storyboardFrames?.[START_SLOT]).toMatchObject({ image: 'data:a', fit: 'cover' });
    expect(patch.storyboardImage).toBeUndefined();
    expect(patch.storyboardFit).toBeUndefined();
    expect(patch.storyboardImageEnd).toBeUndefined();
  });

  it('keeps a non-start capture on its own slot, with no start copy', () => {
    const patch = setFramePatch(makeShot(), 'wp-1', { image: 'data:end', fit: 'cover' });
    expect(patch.storyboardFrames?.['wp-1']?.image).toBe('data:end');
    expect(patch.storyboardFrames?.[START_SLOT]).toBeUndefined();
  });

  it('sheds a legacy field the first time the shot is boarded, without losing it', () => {
    const legacy = { ...makeShot(), storyboardImage: 'data:old', storyboardFit: 'cover' } as Shot;
    const patch = setFramePatch(legacy, 'wp-1', { image: 'data:new' });
    // framesOf folded the old field into `start` before the write, so the art
    // survives as a frame while the field itself goes.
    expect(patch.storyboardFrames?.[START_SLOT]?.image).toBe('data:old');
    expect(patch.storyboardFrames?.['wp-1']?.image).toBe('data:new');
    expect(patch.storyboardImage).toBeUndefined();
  });

  it('removes a frame without disturbing the others', () => {
    let shot = makeShot();
    shot = { ...shot, ...setFramePatch(shot, 'wp-1', { image: 'data:end' }) } as Shot;
    shot = { ...shot, ...setFramePatch(shot, 'wp-2', { image: 'data:last' }) } as Shot;
    const patch = setFramePatch(shot, 'wp-1', null);
    expect(patch.storyboardFrames?.['wp-1']).toBeUndefined();
    expect(patch.storyboardFrames?.['wp-2']?.image).toBe('data:last');
  });

  it('clears everything when the last frame is removed', () => {
    let shot = makeShot();
    shot = { ...shot, ...setFramePatch(shot, START_SLOT, { image: 'data:a' }) } as Shot;
    const patch = setFramePatch(shot, START_SLOT, null);
    expect(patch.storyboardImage).toBeUndefined();
    expect(Object.keys(patch.storyboardFrames || {})).toHaveLength(0);
  });

  it('is stable on repeat captures of the same slot (update, not duplicate)', () => {
    let shot = makeShot();
    shot = { ...shot, ...setFramePatch(shot, START_SLOT, { image: 'data:v1' }) } as Shot;
    const patch = setFramePatch(shot, START_SLOT, { image: 'data:v2' });
    expect(patch.storyboardFrames?.[START_SLOT]?.image).toBe('data:v2');
    expect(Object.keys(patch.storyboardFrames || {})).toEqual([START_SLOT]);
  });

  it('round-trips through framesOf without growing a start copy', () => {
    let shot = makeShot();
    shot = { ...shot, ...setFramePatch(shot, 'wp-1', { image: 'data:end', fit: 'cover' }) } as Shot;
    const patch = setFramePatch(shot, 'wp-2', { image: 'data:last' });
    expect(patch.storyboardFrames?.[START_SLOT]).toBeUndefined();
    expect(patch.storyboardFrames?.['wp-1']?.image).toBe('data:end');
    expect(patch.storyboardFrames?.['wp-2']?.image).toBe('data:last');
  });
});

describe('keyFrameImage', () => {
  it('is the start frame when the shot has one', () => {
    const shot = { ...makeShot(), storyboardFrames: { [START_SLOT]: { image: 'data:a' }, 'wp-1': { image: 'data:b' } } } as Shot;
    expect(keyFrameImage(shot)).toBe('data:a');
  });

  it('falls back to the first boarded frame when start is empty', () => {
    const shot = { ...makeShot(), storyboardFrames: { 'wp-1': { image: 'data:b' } } } as Shot;
    expect(keyFrameImage(shot)).toBe('data:b');
  });

  /** Old projects have the field and no frames; the picture must still show. */
  it('reads a legacy project that only has the retired field', () => {
    expect(keyFrameImage({ ...makeShot(), storyboardImage: 'data:old' } as Shot)).toBe('data:old');
  });

  it('is undefined for an unboarded shot', () => {
    expect(keyFrameImage(makeShot())).toBeUndefined();
  });
});

describe('slotsOf / boardedFrames with mirrored frames', () => {
  it('shows exactly one boarded slot after an end-slot capture on a moving camera', () => {
    const camera = makeCamera([waypoint('wp-1', 2)]);
    let shot = makeShot();
    shot = { ...shot, ...setFramePatch(shot, 'wp-1', { image: 'data:end' }) } as Shot;

    const slots = slotsOf(shot, camera);
    expect(slots.map((s) => s.key)).toEqual([START_SLOT, 'wp-1']);
    expect(boardedFrames(shot, camera)).toHaveLength(1);
    expect(boardedFrames(shot, camera)[0].frame?.image).toBe('data:end');
  });

  it('still surfaces legacy end-only projects as a single end slot', () => {
    const shot = makeShot({ storyboardImageEnd: 'data:legacy-end' });
    const camera = makeCamera();
    const boarded = boardedFrames(shot, camera);
    expect(boarded).toHaveLength(1);
    expect(boarded[0].key).toBe(END_SLOT);
  });
});
