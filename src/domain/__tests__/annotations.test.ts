import { describe, expect, it } from 'vitest';
import type { AnnotationElement, FloorPlanElement } from '../../types';
import {
  annotationLeaderEndpoints,
  annotationLineStyleOf,
  annotationsForTarget,
  annotationTargetPoint,
  buildAnnotation,
  DEFAULT_ANNOTATION_LINE_OPACITY,
  remapAnnotationTargets,
  stripAnnotationsTargeting,
} from '../plan/annotations';

const prop = (over: Partial<FloorPlanElement> = {}): FloorPlanElement =>
  ({ id: 'prop-1', type: 'prop', name: 'Table', x: 100, y: 200, rotation: 0, ...over }) as unknown as FloorPlanElement;

const annotation = (over: Partial<AnnotationElement> = {}): AnnotationElement =>
  ({
    id: 'ann-1',
    type: 'annotation',
    name: 'Note',
    x: 190,
    y: 130,
    rotation: 0,
    targetElementId: 'prop-1',
    text: 'Move here',
    fontSize: 14,
    color: '#e2e8f0',
    ...over,
  }) as AnnotationElement;

describe('annotationTargetPoint', () => {
  it('anchors plain elements at their position', () => {
    expect(annotationTargetPoint([prop()], annotation())).toEqual({ x: 100, y: 200 });
  });

  it('anchors two-point elements at their midpoint', () => {
    const wall = prop({ id: 'wall-1', type: 'wall', x: 0, y: 0, x2: 200, y2: 0 });
    const ann = annotation({ targetElementId: 'wall-1' });
    expect(annotationTargetPoint([wall], ann)).toEqual({ x: 100, y: 0 });
  });

  it('returns null for a missing target instead of guessing', () => {
    expect(annotationTargetPoint([], annotation())).toBeNull();
  });
});

describe('annotationLeaderEndpoints', () => {
  it('connects the target anchor to the free text position', () => {
    expect(annotationLeaderEndpoints([prop()], annotation())).toEqual({
      x1: 100,
      y1: 200,
      x2: 190,
      y2: 130,
    });
  });

  it('moves with the text: the line follows the anchor', () => {
    const moved = annotation({ x: 300, y: 400 });
    expect(annotationLeaderEndpoints([prop()], moved)).toMatchObject({ x2: 300, y2: 400 });
  });

  it('returns null when the target is gone', () => {
    expect(annotationLeaderEndpoints([], annotation())).toBeNull();
  });
});

describe('annotationLineStyleOf', () => {
  it('is very faint by default', () => {
    const style = annotationLineStyleOf(annotation());
    expect(style.opacity).toBe(DEFAULT_ANNOTATION_LINE_OPACITY);
    expect(style.opacity).toBeLessThanOrEqual(0.3);
    expect(style.width).toBe(1);
  });

  it('honours explicit overrides', () => {
    const style = annotationLineStyleOf(
      annotation({ lineColor: '#f00', lineWidth: 3, lineOpacity: 0.9, lineDash: 'dashed' }),
    );
    expect(style).toEqual({ color: '#f00', width: 3, opacity: 0.9, dash: 'dashed' });
  });
});

describe('buildAnnotation', () => {
  it('pins to the target and offsets the text clear of it', () => {
    const ann = buildAnnotation(prop());
    expect(ann.targetElementId).toBe('prop-1');
    expect(ann.x).not.toBe(100);
    expect(ann.y).not.toBe(200);
    expect(ann.text).toBe('Note');
  });

  it('mints unique ids', () => {
    expect(buildAnnotation(prop()).id).not.toBe(buildAnnotation(prop()).id);
  });

  it('is box-less by default', () => {
    expect(buildAnnotation(prop()).showBackground).toBe(false);
  });
});

describe('annotationsForTarget / stripAnnotationsTargeting', () => {
  it('lists only annotations pointing at the target', () => {
    const elements = [prop(), annotation(), annotation({ id: 'ann-2', targetElementId: 'other' })];
    expect(annotationsForTarget(elements, 'prop-1').map((a) => a.id)).toEqual(['ann-1']);
  });

  it('drops orphaned callouts when their target is deleted, and nothing else', () => {
    const other = prop({ id: 'other', x: 0, y: 0 });
    const elements = [prop(), other, annotation(), annotation({ id: 'ann-2', targetElementId: 'other' })];
    const stripped = stripAnnotationsTargeting(elements, new Set(['prop-1']));
    expect(stripped.map((e) => e.id).sort()).toEqual(['ann-2', 'other', 'prop-1'].sort());
    expect(stripped.find((e) => e.id === 'ann-1')).toBeUndefined();
  });
});

describe('remapAnnotationTargets', () => {
  it('points duplicated annotations at the duplicated target', () => {
    const ann = annotation();
    const remapped = remapAnnotationTargets([ann], new Map([['prop-1', 'prop-2']]));
    expect((remapped[0] as AnnotationElement).targetElementId).toBe('prop-2');
  });

  it('keeps pointing at the original when the target was not copied', () => {
    const remapped = remapAnnotationTargets([annotation()], new Map());
    expect((remapped[0] as AnnotationElement).targetElementId).toBe('prop-1');
  });
});
