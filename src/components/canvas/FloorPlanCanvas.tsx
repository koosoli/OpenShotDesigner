import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  elementLength,
  endpointsOf,
  hasEndpoints,
  hasPath,
  hasSize,
} from '../../domain/plan/elementGuards';
import { boundsContain, elementBounds, padBounds } from '../../domain/plan/elementBounds';
import {
  ActorElement,
  AnnotationElement,
  ArrowElement,
  CableElement,
  CameraElement,
  DoorElement,
  ElementPatch,
  FloorPlanElement,
  LightElement,
  MeasurementElement,
  RoadElement,
  PlanLayer,
  PropElement,
  ShapeElement,
  Shot,
  StrokeElement,
  StrokePoint,
  TextElement,
  TrackElement,
  Vector2D,
  WallElement,
  Waypoint,
  WindowElement,
} from '../../types';
import { boundsCenterOfPoints, findNearestWall, getAngleBetweenPoints, snapToGrid } from '../../utils/geometry';
import { ASPECT_RATIOS, CABLE_TYPES } from '../../constants/presets';
import { boardedFrames, keyFrame, keyFrameImage, setFramePatch, START_SLOT } from '../../utils/storyboardFrames';
import { ActorElementView } from './ActorElementView';
import { AnnotationLayer } from './AnnotationLayer';
import { BackgroundLayer } from './BackgroundLayer';
import { CameraElementView } from './CameraElementView';
import { ElementContextMenu, ElementContextMenuState } from './ElementContextMenu';
import { GridLayer } from './GridLayer';
import { LightingLayer } from './LightingLayer';
import { PropsLayer } from './PropsLayer';
import { ShapesLayer } from './ShapesLayer';
import { FreehandStrokeLayer } from './FreehandStrokeLayer';
import { FreehandToolOptions } from './FreehandToolOptions';
import {
  computeGroupPoseOverrides,
  getFreehandToolPreferences,
  groupPivotOf,
  hasWaypointPath,
  isEndpointElement,
  isStrokeElement,
  patchWaypoint,
  planElementBounds,
  setFreehandToolPreferences,
  transformMemberElement,
  translatePath,
  translateStrokePoints,
} from '../../domain/plan';
import type { ElementPose, FreehandToolSettings } from '../../domain/plan';
import { calibrateBackgroundImage } from '../../domain/plan';
import { createId } from '../../domain/ids';
import { CableLayer } from './CableLayer';
import { RoadLayer } from './RoadLayer';
import { SunOverlay } from './SunOverlay';
import { sceneSunPlan } from '../../domain/sun';
import { StoryboardThumbLayer } from './StoryboardThumbLayer';
import { TrussLayer, type TrussRunOnPlan } from './TrussLayer';
import { ResizeHandle, TransformControls } from './TransformControls';
import { WallLayer } from './WallLayer';
import { Move, ZoomIn, ZoomOut, Check, X, Keyboard, Scan, Grid } from 'lucide-react';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';

interface DragState {
  type:
    | 'move'
    | 'rotate'
    | 'pan'
    | 'box_select'
    | 'endpoint_start'
    | 'endpoint_end'
    | 'resize_element'
    | 'draw_wall'
    | 'draw_measure'
    | 'draw_arrow'
    | 'draw_cable'
    | 'waypoint'
    | 'waypoint_rotate'
    | 'curve'
    | 'group_rotate'
    | 'group_waypoint';
  startMouse: Vector2D;
  startElements: Map<string, FloorPlanElement>;
  selectedIds: string[];
  activeElementId?: string;
  startOffset?: Vector2D;
  endpointType?: 'start' | 'end';
  handle?: ResizeHandle;
  waypointId?: string;
  /** group_rotate gesture state. */
  groupId?: string;
  startPivot?: Vector2D;
  startAngleDeg?: number;
}

/**
 * One shared empty array for element types the plan has none of.
 * A fresh `[]` per render would defeat the memoised layers below for exactly
 * the plans that need it least — an empty layer would re-render every frame.
 */
const EMPTY_ELEMENTS: FloorPlanElement[] = [];

/** Element types a cable can be plugged into. Fixed, so it lives out here. */
const ATTACHABLE_DEVICE_TYPES: ReadonlyArray<FloorPlanElement['type']> = ['camera', 'light', 'actor', 'prop'];

export const FloorPlanCanvas: React.FC = () => {
  const { activeSetup, project, selectedElementIds, selectedShotId, highlightedElementId, activeTool, activeShapeType, activeCableType, playback, selectElement, selectElements, clearSelection, addElement, updateElement, updateShot, updateSetupMeta, updateMultipleElements, deleteSelectedElements, updateBackgroundImage, removeBackgroundImage, updateProjectMeta, backgroundImages, selectedBackgroundId, setSelectedBackgroundId, calibratingBackgroundId, cancelBackgroundCalibration, undo, redo, setTool, setCanvasOffset, setCanvasTransform, zoomIn, zoomOut, resetZoom, openViewfinder, displaySettings, updateDisplaySettings, setGridSettings, duplicateSelected, copySelectedElements, pasteElements, commitCurrentState, setCanvasViewport } = useFloorPlan();
  const { theme, setActiveRightTab, setRightPanelOpen } = useWorkspaceUI();

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Report the live viewport size so the context can spawn new cameras at
  // the visual center of the canvas
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const report = () => setCanvasViewport(container.clientWidth, container.clientHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(container);
    return () => observer.disconnect();
  }, [setCanvasViewport]);

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [boxSelection, setBoxSelection] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [hoverCanvasPos, setHoverCanvasPos] = useState<Vector2D | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Freehand annotation stroke (plan §6.2): points accumulate in the ref while
  // the pointer is down; `liveStroke` mirrors it for the rubberband preview.
  // A second touch finger aborts the stroke so pinch/pan keeps working.
  const [freehandSettings, setFreehandSettings] = useState<FreehandToolSettings>(getFreehandToolPreferences);
  useEffect(() => setFreehandToolPreferences(freehandSettings), [freehandSettings]);
  const activeStrokeRef = useRef<{ pointerId: number; points: StrokePoint[] } | null>(null);
  const [liveStroke, setLiveStroke] = useState<StrokePoint[] | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<Vector2D[]>([]);
  const [calibrationLength, setCalibrationLength] = useState('1');
  const [calibrationUnit, setCalibrationUnit] = useState<'m' | 'ft'>('m');
  const [calibrationError, setCalibrationError] = useState<string | null>(null);

  // Context menu (plan §6.3): desktop right-click or touch long-press (~550ms)
  // on an element. Long-press is cancelled by movement >10px, a second finger,
  // pointer up/cancel — and never starts while a pen stroke is in progress.
  const [contextMenu, setContextMenu] = useState<ElementContextMenuState | null>(null);
  const longPressRef = useRef<{ timer: number; startX: number; startY: number } | null>(null);
  const cancelLongPress = useCallback(() => {
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current.timer);
      longPressRef.current = null;
    }
  }, []);

  // Plan layers (§6.1): elements whose layerId maps to a hidden layer of the
  // active setup are not rendered; locked layers render but are
  // non-interactable. Elements without a layerId are unlayered → always shown.
  const getLayerFor = useCallback(
    (el: FloorPlanElement): PlanLayer | null =>
      el.layerId ? activeSetup.layers?.find((l) => l.id === el.layerId) ?? null : null,
    [activeSetup.layers],
  );
  const isElementHidden = useCallback((el: FloorPlanElement): boolean => {
    const layer = getLayerFor(el);
    return !!layer && !layer.visible;
  }, [getLayerFor]);
  const isEffectivelyLocked = useCallback(
    (el: FloorPlanElement): boolean => {
      const layer = getLayerFor(el);
      return !!el.locked || (!!layer && layer.locked);
    },
    [getLayerFor],
  );

  // Lightweight hit-test for the context menu: topmost element whose
  // approximate bounds contain the canvas point (hidden layers skipped).
  const findElementAtPoint = useCallback((pos: Vector2D): FloorPlanElement | null => {
    const pad = 12;
    const elements = activeSetup.elements;
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (isElementHidden(el)) continue;
      // Body only: a camera's routed move is not part of what you right-click.
      const box = elementBounds(el, { markerHalfExtent: 20 });
      if (box && boundsContain(padBounds(box, pad), pos.x, pos.y)) return el;
    }
    return null;
  }, [activeSetup.elements, isElementHidden]);


  // Continuous / Connected architectural wall drawing state
  const [connectedWallStart, setConnectedWallStart] = useState<Vector2D | null>(null);
  const [wallChainFirstPoint, setWallChainFirstPoint] = useState<Vector2D | null>(null);
  // Continuous cable routing state (like connected walls): remembers the cable
  // being routed and the last vertex so the next click adds a corner.
  const [connectedCableStart, setConnectedCableStart] = useState<{ cableId: string; x: number; y: number } | null>(null);
  // Guards against adding a stray corner when the user double-clicks to finish
  // a routed run (same trick walls rely on via their double-click handler).
  const lastCableClickRef = useRef<{ time: number; x: number; y: number } | null>(null);

  // Holding Alt temporarily disables magnet/grid snapping for fine placement.
  const altDownRef = useRef(false);

  const canvasScale = activeSetup?.canvasScale ?? 1;
  const canvasOffset = useMemo(
    () => activeSetup?.canvasOffset ?? { x: 50, y: 50 },
    [activeSetup?.canvasOffset],
  );
  const gridSettings = activeSetup?.gridSettings || { size: 30, snap: true, showGrid: false, unit: 'm' as const, pixelsPerUnit: 30 };
  useEffect(() => {
    setCalibrationPoints([]);
    setCalibrationLength('1');
    setCalibrationUnit(gridSettings.unit);
    setCalibrationError(null);
  }, [calibratingBackgroundId, gridSettings.unit]);

  const canvasScaleRef = useRef(canvasScale);
  const canvasOffsetRef = useRef(canvasOffset);
  canvasScaleRef.current = canvasScale;
  canvasOffsetRef.current = canvasOffset;

  // True when the current drag actually changed element positions (used to push
  // exactly ONE history entry on release, so Ctrl+Z undoes a whole gesture).
  const dragChangedRef = useRef(false);

  // Original geometry of linked cables, snapshotted the first time a move
  // gesture cascades into them — keeps endpoint-following frame-independent.
  const movedCableSnapshotsRef = useRef<Map<string, CableElement>>(new Map());

  /** Point-anchored device kinds a cable end can attach to. */

  /** Nearest attachable device anchor within `radius` canvas units, if any. */
  const findAttachableDeviceAt = useCallback((
    point: Vector2D,
    elements: FloorPlanElement[],
    radius = 26,
  ): FloorPlanElement | undefined => {
    let best: { el: FloorPlanElement; dist: number } | undefined;
    for (const candidate of elements) {
      if (!ATTACHABLE_DEVICE_TYPES.includes(candidate.type)) continue;
      const dist = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (dist <= radius && (!best || dist < best.dist)) best = { el: candidate, dist };
    }
    return best?.el;
  }, []);

  /** Display label used for cable end labels (e.g. "CAM A"). */
  const deviceLabelOf = (el: FloorPlanElement): string =>
    el.type === 'camera' && (el as CameraElement).cameraLabel
      ? `CAM ${(el as CameraElement).cameraLabel.toUpperCase()}`
      : el.name;

  // Convert client viewport coordinates to Canvas space
  const screenToCanvas = useCallback(
    (clientX: number, clientY: number): Vector2D => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const rawX = clientX - rect.left;
      const rawY = clientY - rect.top;

      return {
        x: (rawX - canvasOffset.x) / canvasScale,
        y: (rawY - canvasOffset.y) / canvasScale,
      };
    },
    [canvasOffset, canvasScale]
  );

  // Smooth cursor-centered wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const currentScale = canvasScaleRef.current;
      const currentOffset = canvasOffsetRef.current;

      // Cursor-relative scaling
      const delta = e.deltaY;
      const zoomFactor = delta < 0 ? 1.12 : 0.89;
      const newScale = Math.max(0.15, Math.min(4.0, currentScale * zoomFactor));

      // Calculate world point under the mouse cursor to keep it stationary
      const worldX = (mouseX - currentOffset.x) / currentScale;
      const worldY = (mouseY - currentOffset.y) / currentScale;

      const newOffsetX = mouseX - worldX * newScale;
      const newOffsetY = mouseY - worldY * newScale;

      setCanvasTransform(newScale, { x: newOffsetX, y: newOffsetY });
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleNativeWheel);
    };
  }, [setCanvasTransform]);

  /**
   * Touch gestures: two fingers pinch to zoom and pan at the same time, the way
   * every map app behaves. The container sets `touch-action: none`, so the
   * browser's own gestures are off and we drive the transform ourselves.
   */
  const pinchRef = useRef<{
    startDistance: number;
    startScale: number;
    startOffset: Vector2D;
    startCentre: Vector2D;
  } | null>(null);
  const isPinchingRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const touchPoint = (touch: Touch): Vector2D => {
      const rect = container.getBoundingClientRect();
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      cancelLongPress();
      const a = touchPoint(event.touches[0]);
      const b = touchPoint(event.touches[1]);
      pinchRef.current = {
        startDistance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        startScale: canvasScaleRef.current,
        startOffset: { ...canvasOffsetRef.current },
        startCentre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      isPinchingRef.current = true;
      // A second finger cancels whatever the first finger started (dragging an
      // element, a marquee, an in-progress freehand stroke) so the gesture is
      // purely a viewport move. Aborted strokes are never committed.
      if (activeStrokeRef.current) {
        activeStrokeRef.current = null;
        setLiveStroke(null);
      }
      setDragState(null);
    };

    const handleTouchMove = (event: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();

      const a = touchPoint(event.touches[0]);
      const b = touchPoint(event.touches[1]);
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

      const nextScale = Math.max(0.15, Math.min(4, (pinch.startScale * distance) / pinch.startDistance));
      // Keep the world point that was under the initial finger midpoint pinned
      // under the current midpoint: that gives pinch-zoom and drag in one move.
      const worldX = (pinch.startCentre.x - pinch.startOffset.x) / pinch.startScale;
      const worldY = (pinch.startCentre.y - pinch.startOffset.y) / pinch.startScale;

      setCanvasTransform(nextScale, {
        x: centre.x - worldX * nextScale,
        y: centre.y - worldY * nextScale,
      });
    };

    const endPinch = (event: TouchEvent) => {
      if (event.touches.length >= 2) return;
      pinchRef.current = null;
      // Swallow the stray single-pointer events that follow a lifted finger.
      if (isPinchingRef.current) {
        window.setTimeout(() => {
          isPinchingRef.current = false;
        }, 120);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', endPinch);
    container.addEventListener('touchcancel', endPinch);
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', endPinch);
      container.removeEventListener('touchcancel', endPinch);
    };
  }, [cancelLongPress, setCanvasTransform]);

  // Compute the bounding box of all scene content (elements + reference images)
  const getContentBounds = useCallback((): { minX: number; minY: number; maxX: number; maxY: number } | null => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let found = false;

    const includePoint = (x: number, y: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      found = true;
    };

    activeSetup.elements.forEach((el) => {
      includePoint(el.x, el.y);
      if (hasEndpoints(el)) {
        includePoint(el.x2, el.y2);
      }
      if (hasSize(el)) {
        includePoint(el.x - el.width / 2, el.y - el.height / 2);
        includePoint(el.x + el.width / 2, el.y + el.height / 2);
      }
      if (hasPath(el)) {
        el.path.forEach((point) => includePoint(point.x, point.y));
      }
    });

    backgroundImages.forEach((img) => {
      includePoint(img.x, img.y);
      includePoint(img.x + img.width, img.y + img.height);
    });

    if (!found) return null;
    return { minX, minY, maxX, maxY };
  }, [activeSetup.elements, backgroundImages]);

  // Fit & center the floor plan content to fill the viewport
  const fitToContent = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const vw = container.clientWidth;
    const vh = container.clientHeight;
    if (vw <= 0 || vh <= 0) return;

    const bounds = getContentBounds();
    if (!bounds) return;

    const contentW = Math.max(bounds.maxX - bounds.minX, 1);
    const contentH = Math.max(bounds.maxY - bounds.minY, 1);

    const pad = 0.12; // 12% breathing room around the content
    const fitScale = Math.max(
      0.15,
      Math.min(4.0, Math.min((vw * (1 - pad)) / contentW, (vh * (1 - pad)) / contentH))
    );

    const midX = (bounds.minX + bounds.maxX) / 2;
    const midY = (bounds.minY + bounds.maxY) / 2;

    setCanvasTransform(fitScale, {
      x: vw / 2 - midX * fitScale,
      y: vh / 2 - midY * fitScale,
    });
  }, [getContentBounds, setCanvasTransform]);

  // Center & zoom the floor plan whenever the active setup (e.g. a selected template) changes
  const lastFittedSetupId = useRef<string | null>(null);
  useEffect(() => {
    if (lastFittedSetupId.current === activeSetup.id) return;
    lastFittedSetupId.current = activeSetup.id;
    fitToContent();
  }, [fitToContent, activeSetup.id]);

  // Segregate elements for wall snapping & SVG z-ordering.
  // Elements on hidden layers are filtered out here, so they are neither
  // rendered, hit-tested, snapped against, nor exported to storyboard thumbs.
  //
  // Memoised, and so is everything derived from it below. Without this the
  // filter allocates a new array on every render, which makes the bucketing
  // pass recompute, which hands every SVG layer a new array — and the
  // `React.memo` on those layers becomes a no-op. Moving the pointer across
  // the canvas would redraw the whole plan, glyph by glyph, which is exactly
  // what the memoisation exists to stop.
  const visibleElements = useMemo(
    () => activeSetup.elements.filter((el) => !isElementHidden(el)),
    [activeSetup.elements, isElementHidden],
  );

  // Group animation (§6.4): members of keyed groups render from their
  // interpolated pose at the current beat. Ephemeral render state only —
  // editing keeps targeting base data, so pauses/drags stay stable.
  //
  // Poses are suppressed mid-drag so editing targets base data — except while
  // dragging a group keyframe, where the whole point is to watch the group
  // follow the dot.
  const renderedElements = useMemo(() => {
    const groupPoseOverrides = new Map<string, ElementPose>();
    if (!dragState || dragState.type === 'group_waypoint') {
      for (const group of activeSetup.groups || []) {
        if (!group.path || group.path.length === 0) continue;
        computeGroupPoseOverrides(visibleElements, group, playback.currentBeat).forEach((pose, id) =>
          groupPoseOverrides.set(id, pose),
        );
      }
    }
    if (groupPoseOverrides.size === 0) return visibleElements;
    return visibleElements.map((el) => {
      const pose = groupPoseOverrides.get(el.id);
      if (!pose) return el;
      const merged: Record<string, unknown> = { ...el, x: pose.x, y: pose.y, rotation: pose.rotation };
      if ('x2' in el) {
        merged.x2 = pose.x2;
        merged.y2 = pose.y2;
      }
      if (el.type === 'stroke') {
        merged.points = pose.strokePoints;
      } else if (pose.pathPoints && 'path' in el) {
        merged.path = pose.pathPoints;
      }
      return merged as unknown as FloorPlanElement;
    });
  }, [visibleElements, activeSetup.groups, dragState, playback.currentBeat]);

  /**
   * Sun for this scene (plan §37): the linked location's map pin, on the date
   * and time being planned. Absent whenever the scene has no location, the
   * location has no pin, or the overlay is switched off — a sun position is
   * never invented from a guess at where the shoot is.
   */
  const sunSettings = activeSetup.sunSettings;
  const sunView = useMemo(() => {
    if (!sunSettings?.enabled) return null;
    const location = (project.locations ?? []).find((entry) => entry.id === activeSetup.locationId);
    // The scrubber's time is a time AT THE LOCATION, so the moment is built in
    // the location's zone; `sceneSunPlan` owns that and the inspector reads the
    // same answer.
    const plan = sceneSunPlan({
      lat: location?.lat,
      lng: location?.lng,
      timeZone: location?.timeZone,
      date: sunSettings.date || project.date,
      timeMinutes: sunSettings.timeMinutes,
    });
    if (!plan) return null;
    return { sun: plan.position, planNorthDeg: sunSettings.planNorthDeg ?? 0 };
  }, [sunSettings, project.locations, project.date, activeSetup.locationId]);

  // One bucketing pass, memoised, instead of thirteen `.filter()` calls per
  // render. Two reasons, and the second is the important one: the plan is
  // walked once rather than thirteen times, and — because each bucket keeps
  // its identity while the elements are unchanged — the memoised SVG layers
  // below can skip re-rendering entirely. Without this, moving the pointer
  // across the canvas handed every layer a brand-new array and redrew the
  // whole plan, furniture glyphs and all, on every mouse move.
  const byType = useMemo(() => {
    const buckets: Record<string, FloorPlanElement[]> = {};
    for (const element of renderedElements) (buckets[element.type] ??= []).push(element);
    return buckets;
  }, [renderedElements]);
  const ofType = <T extends FloorPlanElement>(type: string): T[] =>
    (byType[type] ?? EMPTY_ELEMENTS) as T[];

  const walls = ofType<WallElement>('wall');
  const doors = ofType<DoorElement>('door');
  const windows = ofType<WindowElement>('window');
  const lights = ofType<LightElement>('light');
  const propsList = ofType<PropElement>('prop');
  const tracks = ofType<TrackElement>('track');
  const roads = ofType<RoadElement>('road');
  const actors = ofType<ActorElement>('actor');
  const cameras = ofType<CameraElement>('camera');

  // Which shot's info to show under a camera: the selected shot if it uses this
  // camera, else the camera's associated shot, else the first linked shot.
  const getShotForCamera = useCallback(
    (camera: CameraElement): Shot | null => {
      if (selectedShotId) {
        const sel = activeSetup.shots.find((s) => s.id === selectedShotId && s.cameraId === camera.id);
        if (sel) return sel;
      }
      if (camera.associatedShotId) {
        const assoc = activeSetup.shots.find((s) => s.id === camera.associatedShotId);
        if (assoc) return assoc;
      }
      return activeSetup.shots.find((s) => s.cameraId === camera.id) || null;
    },
    [selectedShotId, activeSetup.shots],
  );
  const measurements = ofType<MeasurementElement>('measurement');
  const arrows = ofType<ArrowElement>('arrow');
  const texts = ofType<TextElement>('text');
  const cables = ofType<CableElement>('cable');
  const strokes = ofType<StrokeElement>('stroke');
  const annotations = ofType<AnnotationElement>('annotation');

  // Storyboard thumbnails: shots that have a storyboard attached, shown near
  // their camera on the floor plan.
  const sceneAspectRatio =
    ASPECT_RATIOS.find((a) => a.value === (activeSetup.aspectRatio || '16:9'))?.ratio || 16 / 9;
  const shapes = ofType<ShapeElement>('shape');
  const storyboardThumbs = cameras
    .map((c) => ({ camera: c, shot: getShotForCamera(c) }))
    .filter(
      (item): item is { camera: CameraElement; shot: Shot } =>
        !!item.shot && boardedFrames(item.shot, item.camera).length > 0
    );

  // Layer callbacks are hoisted out of the JSX and given stable identities, so
  // the memoised layers below can actually skip a render. Inline arrow props
  // are a new function every render, which makes `React.memo` a no-op: hovering
  // the plan redrew every furniture glyph on the canvas.
  //
  // The context actions these call (`updateShot`, `updateElement`, …) are
  // themselves identity-stable — see `useStableContextValue` — so these
  // dependency lists really do stay quiet between renders.
  const nearestCameraTo = useCallback(
    (center: Vector2D): CameraElement | null => {
      let best: CameraElement | null = null;
      let bestDistance = Infinity;
      for (const camera of cameras) {
        const distance = Math.hypot(camera.x - center.x, camera.y - center.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = camera;
        }
      }
      // Beyond this the user was not aiming at a camera; dropping onto the
      // nearest one anywhere on the plan would be a surprise, not a shortcut.
      return best && bestDistance <= 110 ? best : null;
    },
    [cameras],
  );

  const handleSelectBackgroundImage = useCallback(
    (id: string) => {
      clearSelection();
      setSelectedBackgroundId(id);
      setActiveRightTab('inspector');
    },
    [clearSelection, setSelectedBackgroundId, setActiveRightTab],
  );

  const handleDropImageToCamera = useCallback(
    (image: { url: string }, center: Vector2D) => {
      const target = nearestCameraTo(center);
      if (!target) return;
      const shot = getShotForCamera(target);
      // Through setFramePatch, not the retired `storyboardImage` field:
      // writing that directly leaves `storyboardFrames` — which is what the
      // thumb layer and the exports read — untouched.
      if (shot) updateShot(shot.id, setFramePatch(shot, START_SLOT, { image: image.url, fit: 'cover' }));
    },
    [nearestCameraTo, getShotForCamera, updateShot],
  );

  const handleUpdateElementText = useCallback(
    (id: string, newText: string) => updateElement(id, { text: newText }),
    [updateElement],
  );

  const handleDragStoryboardThumb = useCallback(
    (shotId: string, slotKey: string, pos: Vector2D) => {
      const shot = activeSetup.shots.find((item) => item.id === shotId);
      if (shot) updateShot(shotId, setFramePatch(shot, slotKey, { canvasPosition: pos }));
    },
    [activeSetup.shots, updateShot],
  );

  const handleDropBoardToCamera = useCallback(
    (sourceShot: Shot, center: Vector2D) => {
      const target = nearestCameraTo(center);
      if (!target) return;
      const targetShot = getShotForCamera(target);
      // `keyFrameImage` rather than the retired field, which is now cleared on
      // every frame write — so dragging a board between cameras had silently
      // stopped working for any recently boarded shot.
      const sourceImage = keyFrameImage(sourceShot);
      if (targetShot && targetShot.id !== sourceShot.id && sourceImage) {
        updateShot(
          targetShot.id,
          setFramePatch(targetShot, START_SLOT, {
            image: sourceImage,
            fit: keyFrame(sourceShot)?.fit || 'cover',
          }),
        );
      }
    },
    [nearestCameraTo, getShotForCamera, updateShot],
  );

  /**
   * Truss runs, positioned on the plan in scene units.
   *
   * Rigging measures in millimetres and the plan is drawn in scene units, so
   * the conversion goes through the same grid scale the ruler uses — a 3 m bay
   * has to be 3 m against the room, or the drawing is decoration rather than a
   * plan.
   */
  const trussUnitsPerMm = useMemo(() => {
    const perUnit = gridSettings.pixelsPerUnit || 30;
    const mmPerUnit = gridSettings.unit === 'ft' ? 304.8 : 1000;
    return perUnit / mmPerUnit;
  }, [gridSettings.pixelsPerUnit, gridSettings.unit]);

  const trussRuns: TrussRunOnPlan[] = useMemo(() => {
    const profiles = project.trussProfiles ?? [];
    const items = project.riggingItems ?? [];
    return (project.trussElements ?? []).map((run, index) => {
      const profile = profiles.find((entry) => entry.id === run.profileId);
      // A run that has never been placed sits at 0,0 — which for every run in
      // the rig means one illegible stack in the corner. Unplaced runs are laid
      // out down the plan instead, far enough apart to grab. The first drag
      // writes the real position, so this only ever describes a run nobody has
      // positioned yet.
      const unplaced = run.x === 0 && run.y === 0;
      return {
        id: run.id,
        label: run.label?.trim() || `Truss ${index + 1}`,
        x: unplaced ? 140 : run.x,
        y: unplaced ? 140 + index * 70 : run.y,
        rotation: run.rotation,
        lengthMm: run.lengthOverrideMm ?? profile?.lengthMm,
        widthMm: profile?.widthMm,
        hangPointsMm: items
          .filter(
            (item) =>
              item.trussElementId === run.id &&
              (item.kind === 'motor' || item.kind === 'hang_point') &&
              item.positionMm !== undefined,
          )
          .map((item) => item.positionMm as number),
      };
    });
  }, [project.trussElements, project.trussProfiles, project.riggingItems]);

  /**
   * `record` is false while the pointer is down and true once on release, so a
   * drag across the room is ONE undo step rather than one per pointer move —
   * the same bargain every element drag on this canvas makes.
   */
  const moveTrussRun = useCallback(
    (id: string, position: { x: number; y: number }, record: boolean) => {
      updateProjectMeta(
        (prev) => ({
          trussElements: (prev.trussElements ?? []).map((run) =>
            run.id === id ? { ...run, ...position } : run,
          ),
        }),
        record,
      );
    },
    [updateProjectMeta],
  );

  const rotateTrussRun = useCallback(
    (id: string, rotation: number, record: boolean) => {
      updateProjectMeta(
        (prev) => ({
          trussElements: (prev.trussElements ?? []).map((run) =>
            run.id === id ? { ...run, rotation } : run,
          ),
        }),
        record,
      );
    },
    [updateProjectMeta],
  );

  const [selectedTrussId, setSelectedTrussId] = useState<string | null>(null);

  // Collect all wall corner vertices for magnetic snapping. Memoised so the
  // snap lookup below keeps a stable identity between renders that did not
  // move a wall.
  const wallVertices: Vector2D[] = useMemo(() => {
    const vertices: Vector2D[] = [];
    for (const w of walls) {
      vertices.push({ x: w.x, y: w.y });
      vertices.push({ x: w.x2 ?? w.x + 200, y: w.y2 ?? w.y });
    }
    return vertices;
  }, [walls]);

  // Find nearest corner vertex
  const findNearestVertex = useCallback((pt: Vector2D, maxDist = 20): Vector2D | null => {
    let nearest: Vector2D | null = null;
    let minDist = maxDist;
    wallVertices.forEach((v) => {
      const d = Math.hypot(v.x - pt.x, v.y - pt.y);
      if (d < minDist) {
        minDist = d;
        nearest = v;
      }
    });
    return nearest;
  }, [wallVertices]);

  // Compute live wall snapping for door/window tools
  const nearestWallInfo =
    (activeTool === 'door' || activeTool === 'window') && hoverCanvasPos && walls.length > 0 && !altDownRef.current
      ? findNearestWall(hoverCanvasPos, walls, 60)
      : null;

  // Snapped current cursor position for drawing (Alt temporarily disables magnets)
  const getDrawingCursorPos = useCallback((rawPos: Vector2D): Vector2D => {
    const snapEnabled = !altDownRef.current;
    const snapVertex = snapEnabled ? findNearestVertex(rawPos, 20) : null;
    if (snapVertex) return snapVertex;

    let x = snapEnabled ? snapToGrid(rawPos.x, gridSettings.size, gridSettings.snap) : rawPos.x;
    let y = snapEnabled ? snapToGrid(rawPos.y, gridSettings.size, gridSettings.snap) : rawPos.y;

    // If connected wall is active, snap to 0°, 45°, 90°, 180° relative to start point
    if (snapEnabled && connectedWallStart) {
      const dx = x - connectedWallStart.x;
      const dy = y - connectedWallStart.y;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const normalizedAngle = (angle + 360) % 360;

      // Snap to nearest 45 degree angle if close
      const snapAngle = Math.round(normalizedAngle / 45) * 45;
      if (Math.abs(normalizedAngle - snapAngle) < 8) {
        const dist = Math.hypot(dx, dy);
        const rad = (snapAngle * Math.PI) / 180;
        x = connectedWallStart.x + Math.round(dist * Math.cos(rad));
        y = connectedWallStart.y + Math.round(dist * Math.sin(rad));
      }
    }

    return { x, y };
  }, [connectedWallStart, findNearestVertex, gridSettings.size, gridSettings.snap]);

  // Finish connected wall mode
  const finishConnectedWalls = useCallback(() => {
    setConnectedWallStart(null);
    setWallChainFirstPoint(null);
    setTool('select');
  }, [setTool]);

  // Finish continuous cable routing (keeps the cable tool selected so a new run can start)
  //
  // Not wrapped in useCallback: it closes over a dozen pieces of canvas state
  // that are themselves recreated per render, so a useCallback here would need
  // that whole chain stabilised first and would still change identity. The
  // effect using it lists it correctly, so this costs one listener swap per
  // render and nothing in correctness.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const finishConnectedCable = () => {
    // Attach the run's final vertex to a nearby device, so dragging that
    // device afterwards drags the cable end with it.
    if (connectedCableStart) {
      const el = activeSetup.elements.find((e) => e.id === connectedCableStart.cableId);
      if (el && el.type === 'cable') {
        const device = findAttachableDeviceAt(
          { x: connectedCableStart.x, y: connectedCableStart.y },
          activeSetup.elements,
        );
        updateElement(el.id, {
          ...(device
            ? { toElementId: device.id, toLabel: deviceLabelOf(device) }
            : { toElementId: undefined }),
        });
      }
    }
    setConnectedCableStart(null);
    lastCableClickRef.current = null;
  };

  // Leaving the cable tool cancels any in-progress routed run
  useEffect(() => {
    if (activeTool !== 'cable') setConnectedCableStart(null);
  }, [activeTool]);

  /**
   * Touch long-press → context menu (§6.3): select mode, primary finger only,
   * cancelled by drag (>10px), pinch or a second finger. Never fires while a
   * pen stroke is in progress. `elementId` pre-resolves the pressed element
   * (element views stop propagation, so the hit test cannot be redone later).
   */
  const armLongPress = useCallback((e: React.PointerEvent, elementId: string | null) => {
    cancelLongPress();
    if (e.pointerType !== 'touch' || !e.isPrimary) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const timer = window.setTimeout(() => {
      longPressRef.current = null;
      if (isPinchingRef.current || activeStrokeRef.current) return;
      // A held press must not keep dragging under the open menu.
      setDragState(null);
      setBoxSelection(null);
      const hit = elementId ?? findElementAtPoint(screenToCanvas(startX, startY))?.id ?? null;
      setContextMenu({ x: startX, y: startY, elementId: hit });
    }, 550);
    longPressRef.current = { timer, startX, startY };
  }, [cancelLongPress, findElementAtPoint, screenToCanvas]);

  // Pointer Down on canvas background or elements
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!containerRef.current || isPinchingRef.current) return;
    // A second finger is the start of a pinch (touchstart fires after this
    // pointerdown); it must never place elements or start a drag/marquee.
    if (e.pointerType === 'touch' && !e.isPrimary) {
      cancelLongPress();
      return;
    }

    // Middle click or Spacebar is Pan
    if (e.button === 1 || isSpacePressed || activeTool === 'pan') {
      e.preventDefault();
      setDragState({
        type: 'pan',
        startMouse: { x: e.clientX, y: e.clientY },
        startElements: new Map(),
        selectedIds: [],
        startOffset: { ...canvasOffset },
      });
      return;
    }

    if (e.button !== 0) return; // Only left click for actions

    // Touch long-press opens the context menu (§6.3) on empty canvas; element
    // presses arm it from handleElementSelect (which stops propagation).
    if (e.pointerType === 'touch' && activeTool === 'select') armLongPress(e, null);

    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    const drawPos = getDrawingCursorPos(canvasPos);

    if (calibratingBackgroundId) {
      e.preventDefault();
      const image = backgroundImages.find((background) => background.id === calibratingBackgroundId);
      if (!image) {
        cancelBackgroundCalibration();
        return;
      }
      const insideImage =
        canvasPos.x >= image.x && canvasPos.x <= image.x + image.width &&
        canvasPos.y >= image.y && canvasPos.y <= image.y + image.height;
      if (!insideImage) {
        setCalibrationError('Place both marks on the selected reference image.');
        return;
      }
      setCalibrationError(null);
      setCalibrationPoints((current) => current.length >= 2 ? [canvasPos] : [...current, canvasPos]);
      return;
    }

    // Freehand annotation stroke: mouse & stylus always draw; a touch finger
    // only draws when it is the primary pointer and no pinch is in progress,
    // so two-finger pinch/pan keeps working with the pen tool selected.
    if (activeTool === 'stroke') {
      const touchCanDraw = e.pointerType === 'touch' && e.isPrimary && !isPinchingRef.current;
      const canDraw =
        e.pointerType === 'mouse' || e.pointerType === 'pen' || touchCanDraw;
      if (!canDraw) return;

      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is best-effort; drawing still works inside the canvas.
      }
      const point: StrokePoint = { x: canvasPos.x, y: canvasPos.y };
      if (e.pointerType === 'pen' && e.pressure > 0) point.pressure = e.pressure;
      activeStrokeRef.current = { pointerId: e.pointerId, points: [point] };
      setLiveStroke([point]);
      return;
    }

    // Shape tool: click to drop the current shape at that point (except drag-drawn line shapes)
    if (activeTool === 'shape' && activeShapeType !== 'line') {
      const newId = addElement({ type: 'shape', x: drawPos.x, y: drawPos.y });
      selectElement(newId);
      setTool('select');
      return;
    }

    // 1. Door or Window Tool - Instant reliable placement with wall alignment
    if (activeTool === 'door' || activeTool === 'window') {
      const wallSnap = findNearestWall(canvasPos, walls, 60);
      let newId: string;
      if (wallSnap) {
        newId = addElement({
          type: activeTool,
          x: wallSnap.point.x,
          y: wallSnap.point.y,
          rotation: wallSnap.angle,
          name: activeTool === 'door' ? 'Door' : 'Window',
        });
      } else {
        newId = addElement({
          type: activeTool,
          x: drawPos.x,
          y: drawPos.y,
          rotation: 0,
          name: activeTool === 'door' ? 'Door' : 'Window',
        });
      }
      selectElement(newId);
      setTool('select');
      return;
    }

    // 2. Connected / Architectural Wall Drawing Mode
    if (activeTool === 'wall') {
      if (!connectedWallStart) {
        // First vertex of the chain
        setConnectedWallStart(drawPos);
        setWallChainFirstPoint(drawPos);

        // Also initiate standard drag wall in case user just wants to drag a single wall
        const wallId = addElement({
          type: 'wall',
          x: drawPos.x,
          y: drawPos.y,
          x2: drawPos.x + 1,
          y2: drawPos.y + 1,
        });

        const initialElements = new Map<string, FloorPlanElement>();
        const createdWall = activeSetup.elements.find((el) => el.id === wallId);
        if (createdWall) initialElements.set(wallId, createdWall);

        setDragState({
          type: 'draw_wall',
          startMouse: { x: e.clientX, y: e.clientY },
          startElements: initialElements,
          selectedIds: [wallId],
          activeElementId: wallId,
        });
      } else {
        // Second or subsequent vertex in continuous mode
        const isClosingLoop =
          wallChainFirstPoint &&
          Math.hypot(drawPos.x - wallChainFirstPoint.x, drawPos.y - wallChainFirstPoint.y) < 25;

        const endX = isClosingLoop ? wallChainFirstPoint.x : drawPos.x;
        const endY = isClosingLoop ? wallChainFirstPoint.y : drawPos.y;

        // Create the connected wall segment
        addElement({
          type: 'wall',
          x: connectedWallStart.x,
          y: connectedWallStart.y,
          x2: endX,
          y2: endY,
        });

        if (isClosingLoop) {
          // Closed room! Finish drawing
          finishConnectedWalls();
        } else {
          // Continue chain from new vertex
          setConnectedWallStart({ x: endX, y: endY });
        }
      }
      return;
    }

    // 2b. Tape Measure Tool - drag to draw a measurement between two points
    if (activeTool === 'measure') {
      const measureId = addElement({
        type: 'measurement',
        x: drawPos.x,
        y: drawPos.y,
        x2: drawPos.x,
        y2: drawPos.y,
      });

      setDragState({
        type: 'draw_measure',
        startMouse: { x: e.clientX, y: e.clientY },
        startElements: new Map(),
        selectedIds: [measureId],
        activeElementId: measureId,
      });
      selectElement(measureId);
      return;
    }

    // 2c. Arrow Tool - drag to draw an arrow between two points
    if (activeTool === 'arrow') {
      const arrowId = addElement({
        type: 'arrow',
        x: drawPos.x,
        y: drawPos.y,
        x2: drawPos.x,
        y2: drawPos.y,
        color: '#f97316',
        strokeWidth: 2.5,
        headStyle: 'single',
        dashStyle: 'solid',
      });

      setDragState({
        type: 'draw_arrow',
        startMouse: { x: e.clientX, y: e.clientY },
        startElements: new Map(),
        selectedIds: [arrowId],
        activeElementId: arrowId,
      });
      selectElement(arrowId);
      return;
    }

    // 2c2. Cable Tool - mirrors the connected-wall mechanic: drag out the first
    // segment, then CLICK to add routing corners; finish with double-click,
    // Enter, Esc, or the Finish bar.
    if (activeTool === 'cable') {
      if (!connectedCableStart) {
        // First vertex of the run: initiate a drag so the user can either drag
        // a single segment or click once to start chaining. Starting on a
        // device attaches the run's from-end to it.
        const startDevice = findAttachableDeviceAt(drawPos, activeSetup.elements);
        const cableId = addElement({
          type: 'cable',
          cableType: activeCableType,
          x: startDevice ? startDevice.x : drawPos.x,
          y: startDevice ? startDevice.y : drawPos.y,
          x2: drawPos.x,
          y2: drawPos.y,
          ...(startDevice
            ? { fromElementId: startDevice.id, fromLabel: deviceLabelOf(startDevice) }
            : {}),
        });

        setDragState({
          type: 'draw_cable',
          startMouse: { x: e.clientX, y: e.clientY },
          startElements: new Map(),
          selectedIds: [cableId],
          activeElementId: cableId,
        });
        selectElement(cableId);
      } else {
        // Second or subsequent vertex: clicking adds a corner to the SAME run.
        const chain = connectedCableStart;

        // A fast second click near the last one means "double-click to finish"
        // — don't add a stray corner for it.
        const now = Date.now();
        const last = lastCableClickRef.current;
        lastCableClickRef.current = { time: now, x: drawPos.x, y: drawPos.y };
        if (last && now - last.time < 400 && Math.hypot(drawPos.x - last.x, drawPos.y - last.y) < 12) {
          finishConnectedCable();
          return;
        }

        const el = activeSetup.elements.find((e) => e.id === chain.cableId) as CableElement | undefined;
        if (el && el.type === 'cable') {
          // Freeze the current vertex as a routing point, then extend the run
          // to the clicked position.
          const path = el.path || [];
          const lastPt = path.length ? path[path.length - 1] : null;
          const newPath =
            !lastPt || Math.hypot(lastPt.x - chain.x, lastPt.y - chain.y) > 1
              ? [
                  ...path,
                  {
                    id: createId('wp'),
                    x: Math.round(chain.x),
                    y: Math.round(chain.y),
                  },
                ]
              : path;
          updateElement(chain.cableId, { path: newPath, x2: drawPos.x, y2: drawPos.y });
          // Continue the chain from the new vertex
          setConnectedCableStart({ cableId: chain.cableId, x: drawPos.x, y: drawPos.y });
        }
      }
      return;
    }

    // 2d. Line Shape Tool - drag to draw a line between two points
    if (activeTool === 'shape' && activeShapeType === 'line') {
      const lineId = addElement({
        type: 'shape',
        shapeType: 'line',
        x: drawPos.x,
        y: drawPos.y,
        width: 1,
        height: 4,
        strokeWidth: 4,
        strokeColor: '#38bdf8',
        filled: false,
      });

      const startElementsMap = new Map<string, FloorPlanElement>();
      const createdLine: ShapeElement = {
        id: lineId,
        type: 'shape',
        name: 'Line',
        shapeType: 'line',
        x: drawPos.x,
        y: drawPos.y,
        rotation: 0,
        width: 1,
        height: 4,
        color: '#38bdf8',
        filled: false,
        opacity: 0.3,
        strokeColor: '#38bdf8',
        strokeWidth: 4,
        strokeOpacity: 1,
        dashStyle: 'solid',
        locked: false,
      };
      startElementsMap.set(lineId, createdLine);

      setDragState({
        type: 'endpoint_end',
        startMouse: { x: e.clientX, y: e.clientY },
        startElements: startElementsMap,
        selectedIds: [lineId],
        activeElementId: lineId,
      });
      selectElement(lineId);
      setTool('select');
      return;
    }

    // 3. Other insert tools (Actor, Camera, Light, Prop, Track, etc.)
    if (activeTool !== 'select') {
      const newId = addElement({
        type: activeTool,
        x: drawPos.x,
        y: drawPos.y,
      });
      selectElement(newId);
      setTool('select');
      return;
    }

    // 4. In select mode on empty background -> Box Selection
    if ((e.target as HTMLElement).tagName === 'svg' || (e.target as HTMLElement).id === 'floor-plan-svg') {
      if (!e.shiftKey) {
        clearSelection();
      }
      setDragState({
        type: 'box_select',
        startMouse: { x: canvasPos.x, y: canvasPos.y },
        startElements: new Map(),
        selectedIds: [...selectedElementIds],
      });
      setBoxSelection({
        x1: canvasPos.x,
        y1: canvasPos.y,
        x2: canvasPos.x,
        y2: canvasPos.y,
      });
    }
  }, [
    activeCableType,
    activeSetup.elements,
    activeShapeType,
    activeTool,
    addElement,
    armLongPress,
    backgroundImages,
    calibratingBackgroundId,
    cancelBackgroundCalibration,
    cancelLongPress,
    canvasOffset,
    clearSelection,
    connectedCableStart,
    connectedWallStart,
    findAttachableDeviceAt,
    finishConnectedCable,
    finishConnectedWalls,
    getDrawingCursorPos,
    isSpacePressed,
    screenToCanvas,
    selectElement,
    selectedElementIds,
    setTool,
    updateElement,
    wallChainFirstPoint,
    walls,
  ]);

  // Double-click to open contextual inspector. `force` selects even locked
  // elements so they can be reached and unlocked from the inspector.
  const handleElementDoubleClick = (id: string, e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    selectElement(id, false, true);
    setActiveRightTab('inspector');
  };

  // Element Select & Drag
  const handleElementSelect = useCallback((id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    if (isPinchingRef.current) return;
    if (e.pointerType === 'touch' && !e.isPrimary) {
      cancelLongPress();
      return;
    }
    if (e.pointerType === 'touch' && activeTool === 'select') armLongPress(e, id);

    // Double-clicking ANY element — locked or not — selects it and opens its
    // inspector immediately. This is the deliberate escape hatch for locked
    // elements (single clicks and lasso still pass right over them).
    if (e.detail >= 2) {
      selectElement(id, false, true);
      setActiveRightTab('inspector');
      return;
    }

    // If door or window tool is active, place directly on clicked element (wall)
    if (activeTool === 'door' || activeTool === 'window') {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      const wallSnap = findNearestWall(canvasPos, walls, 60);
      let newId: string;
      if (wallSnap) {
        newId = addElement({
          type: activeTool,
          x: wallSnap.point.x,
          y: wallSnap.point.y,
          rotation: wallSnap.angle,
          name: activeTool === 'door' ? 'Door' : 'Window',
        });
      } else {
        newId = addElement({
          type: activeTool,
          x: canvasPos.x,
          y: canvasPos.y,
          rotation: 0,
          name: activeTool === 'door' ? 'Door' : 'Window',
        });
      }
      selectElement(newId);
      setTool('select');
      return;
    }

    if (activeTool === 'wall' || activeTool === 'measure' || activeTool === 'arrow' || activeTool === 'cable' || activeTool === 'stroke' || (activeTool === 'shape' && activeShapeType === 'line')) {
      // Connect wall to clicked element / start measuring from clicked element
      handlePointerDown(e);
      return;
    }

    if (activeTool === 'pan' || isSpacePressed) return;

    // Locked elements are never selectable by clicking, and a press on one
    // falls straight through as a lasso drag — so items sitting ON TOP of a
    // locked shape (things you often want to move away) can still be selected.
    // The lasso itself skips locked elements, so only the top items are grabbed.
    // Elements on a locked PLAN LAYER behave the same way (plan §6.1).
    const targetElement = activeSetup.elements.find((el) => el.id === id);
    if (targetElement && isEffectivelyLocked(targetElement)) {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      if (!e.shiftKey) clearSelection();
      setDragState({
        type: 'box_select',
        startMouse: { x: canvasPos.x, y: canvasPos.y },
        startElements: new Map(),
        selectedIds: [...selectedElementIds],
      });
      setBoxSelection({
        x1: canvasPos.x,
        y1: canvasPos.y,
        x2: canvasPos.x,
        y2: canvasPos.y,
      });
      return;
    }

  // Plan groups (plan §6.4): helpers for group-aware selection and dragging.
  /** All live member ids of the group containing `elementId` (empty = none). */
  const getGroupMemberIds = (elementId: string): string[] => {
    const group = (activeSetup.groups || []).find((g) => g.childIds.includes(elementId));
    if (!group) return [];
    return group.childIds.filter((cid) => activeSetup.elements.some((el) => el.id === cid));
  };

  /**
   * Expand a drag set to whole groups: moving ANY member of a group moves ALL
   * members, by seeding every co-member into the drag's start snapshot so the
   * move handler applies the same delta to them. Rotation/resize are untouched
   * (separate handlers that never go through here).
   */
  const expandDragSetWithGroupMembers = (startElementsMap: Map<string, FloorPlanElement>, extraIds: string[]) => {
    const draggedIds = new Set(extraIds);
    startElementsMap.forEach((_, key) => draggedIds.add(key));
    (activeSetup.groups || []).forEach((group) => {
      if (!group.childIds.some((cid) => draggedIds.has(cid))) return;
      group.childIds.forEach((cid) => {
        if (draggedIds.has(cid)) return;
        const member = activeSetup.elements.find((el) => el.id === cid);
        // Locked members stay pinned, matching single-element behavior.
        if (!member || isEffectivelyLocked(member)) return;
        startElementsMap.set(cid, JSON.parse(JSON.stringify(member)));
      });
    });
  };

  let nextSelected = [...selectedElementIds];
    if (e.shiftKey) {
      // Shift is today's multi-select modifier: it toggles the INDIVIDUAL
      // element even when it belongs to a group (escape hatch from the group).
      if (nextSelected.includes(id)) {
        nextSelected = nextSelected.filter((i) => i !== id);
      } else {
        nextSelected.push(id);
      }
      selectElements(nextSelected);
    } else {
      if (!nextSelected.includes(id)) {
        // Plain click on a grouped element selects its WHOLE group so the
        // group moves as one; Alt+click opts for the individual element.
        // (Locked elements already returned early above, so no lock check.)
        const memberIds = e.altKey ? [] : getGroupMemberIds(id);
        if (memberIds.length > 0) {
          nextSelected = memberIds;
          selectElements(memberIds);
        } else {
          nextSelected = [id];
          selectElement(id);
        }
      }
    }

    const startElementsMap = new Map<string, FloorPlanElement>();
    activeSetup.elements.forEach((el) => {
      if ((nextSelected.includes(el.id) || el.id === id) && !isEffectivelyLocked(el)) {
        startElementsMap.set(el.id, JSON.parse(JSON.stringify(el)));
      }
    });

    expandDragSetWithGroupMembers(startElementsMap, [id]);

    if (startElementsMap.size > 0) {
      movedCableSnapshotsRef.current.clear();
      setDragState({
        type: 'move',
        startMouse: { x: e.clientX, y: e.clientY },
        startElements: startElementsMap,
        selectedIds: nextSelected,
        activeElementId: id,
      });
    }
    // Everything the handler reads is listed. Memoised because it is the
    // `onSelect` of every SVG layer: an unstable identity here makes
    // `React.memo` on those layers a no-op, which is what used to redraw the
    // whole plan on a pointer move.
  }, [
    activeSetup.elements,
    activeSetup.groups,
    activeShapeType,
    activeTool,
    addElement,
    armLongPress,
    cancelLongPress,
    clearSelection,
    handlePointerDown,
    isEffectivelyLocked,
    isSpacePressed,
    screenToCanvas,
    selectElement,
    selectElements,
    selectedElementIds,
    setActiveRightTab,
    setTool,
    walls,
  ]);

  // Stable identity so the memoised stroke layer is not handed a new callback
  // on every render.
  const handleStrokePointerDown = useCallback(
    (stroke: StrokeElement, e: React.PointerEvent) => handleElementSelect(stroke.id, e),
    [handleElementSelect],
  );

  // Rotate handle start
  const handleRotateStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (selectedElementIds.length === 0) return;

    const activeId = selectedElementIds[0];
    const el = activeSetup.elements.find((e) => e.id === activeId);
    if (!el || isEffectivelyLocked(el)) return;

    const startElementsMap = new Map<string, FloorPlanElement>();
    startElementsMap.set(activeId, JSON.parse(JSON.stringify(el)));

    setDragState({
      type: 'rotate',
      startMouse: { x: e.clientX, y: e.clientY },
      startElements: startElementsMap,
      selectedIds: [activeId],
      activeElementId: activeId,
    });
  };

  // The single group whose FULL member set equals the current selection —
  // the target for whole-group rotate and keyframe editing.
  const activeGroup = (activeSetup.groups || []).find(
    (group) =>
      selectedElementIds.length >= 2 &&
      group.childIds.length === selectedElementIds.length &&
      selectedElementIds.every((id) => group.childIds.includes(id)),
  );

  // Whole-group rotate handle start: rotates every member rigidly around the
  // group's bbox-centre pivot. One gesture = one undo step (committed on release).
  const handleGroupRotateStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!activeGroup) return;
    const startElementsMap = new Map<string, FloorPlanElement>();
    for (const childId of activeGroup.childIds) {
      const member = activeSetup.elements.find((el) => el.id === childId);
      if (!member || isEffectivelyLocked(member)) return;
      startElementsMap.set(childId, JSON.parse(JSON.stringify(member)));
    }
    const members = Array.from(startElementsMap.values());
    const pivot = groupPivotOf(members);
    if (!pivot) return;
    const startPos = screenToCanvas(e.clientX, e.clientY);
    setDragState({
      type: 'group_rotate',
      startMouse: { x: e.clientX, y: e.clientY },
      startElements: startElementsMap,
      selectedIds: [...activeGroup.childIds],
      activeElementId: activeGroup.id,
      groupId: activeGroup.id,
      startPivot: pivot,
      startAngleDeg: getAngleBetweenPoints(pivot, startPos),
    });
  };

  /**
   * Drag one group keyframe to a new plan position. Group keyframes carry the
   * GROUP PIVOT position for that beat, so moving the dot moves every member
   * together during playback — the same gesture actor and camera waypoints use.
   */
  const handleGroupWaypointDragStart = (waypointId: string, e: React.PointerEvent) => {
    e.stopPropagation();
    if (activeTool !== 'select' || !activeGroup) return;
    if (e.isPrimary === false) return;
    setDragState({
      type: 'group_waypoint',
      startMouse: { x: e.clientX, y: e.clientY },
      startElements: new Map(),
      selectedIds: [...activeGroup.childIds],
      activeElementId: activeGroup.id,
      groupId: activeGroup.id,
      waypointId,
    });
  };

  /**
   * Immutably patch one keyframe of the active group.
   *
   * `recordHistory` is false while dragging: the gesture writes on every
   * pointer move, and `commitCurrentState` on release pushes the single undo
   * entry. Recording per move would bury the undo stack under one entry per
   * pixel of drag.
   */
  const patchGroupWaypoint = (
    groupId: string,
    waypointId: string,
    patch: { x: number; y: number },
    recordHistory = true,
  ) => {
    updateSetupMeta(
      {
        groups: (activeSetup.groups || []).map((group) =>
          group.id !== groupId
            ? group
            : {
                ...group,
                path: (group.path || []).map((wp) => (wp.id === waypointId ? { ...wp, ...patch } : wp)),
              },
        ),
      },
      recordHistory,
    );
  };

  // Current rotation delta of an in-progress group-rotate gesture, in degrees.
  const groupRotateDeltaNow = (ds: DragState, nowPos: Vector2D): number => {
    if (!ds.startPivot || ds.startAngleDeg === undefined) return 0;
    let delta = getAngleBetweenPoints(ds.startPivot, nowPos) - ds.startAngleDeg;
    delta = ((delta % 360) + 540) % 360 - 180;
    return Math.round(delta / 5) * 5;
  };

  // Endpoint drag start for walls/tracks/rulers
  const handleEndpointDragStart = (endpoint: 'start' | 'end', e: React.PointerEvent) => {
    e.stopPropagation();
    if (selectedElementIds.length === 0) return;

    const activeId = selectedElementIds[0];
    const el = activeSetup.elements.find((e) => e.id === activeId);
    if (!el || isEffectivelyLocked(el)) return;

    const startElementsMap = new Map<string, FloorPlanElement>();
    startElementsMap.set(activeId, JSON.parse(JSON.stringify(el)));

    setDragState({
      type: endpoint === 'start' ? 'endpoint_start' : 'endpoint_end',
      startMouse: { x: e.clientX, y: e.clientY },
      startElements: startElementsMap,
      selectedIds: [activeId],
      activeElementId: activeId,
      endpointType: endpoint,
    });
  };

  // Curve control drag start for dolly tracks — bends a track (and switches it
  // to curved) by dragging its control point along the track normal.
  const handleCurveDragStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (selectedElementIds.length === 0) return;

    const activeId = selectedElementIds[0];
    const el = activeSetup.elements.find((e2) => e2.id === activeId);
    if (!el || isEffectivelyLocked(el)) return;

    const startElementsMap = new Map<string, FloorPlanElement>();
    startElementsMap.set(activeId, JSON.parse(JSON.stringify(el)));

    setDragState({
      type: 'curve',
      startMouse: { x: e.clientX, y: e.clientY },
      startElements: startElementsMap,
      selectedIds: [activeId],
      activeElementId: activeId,
    });
  };

  // 2D Shape & Prop Resize drag start
  const handleResizeStart = (handle: ResizeHandle, e: React.PointerEvent) => {
    e.stopPropagation();
    if (selectedElementIds.length === 0) return;

    const activeId = selectedElementIds[0];
    const el = activeSetup.elements.find((e2) => e2.id === activeId);
    if (!el || isEffectivelyLocked(el)) return;

    const startElementsMap = new Map<string, FloorPlanElement>();
    startElementsMap.set(activeId, JSON.parse(JSON.stringify(el)));

    setDragState({
      type: 'resize_element',
      handle,
      startMouse: { x: e.clientX, y: e.clientY },
      startElements: startElementsMap,
      selectedIds: [activeId],
      activeElementId: activeId,
    });
  };

  // Movement waypoint drag start (actors & cameras)
  const handleWaypointDragStart = (elementId: string, waypointId: string, e: React.PointerEvent) => {
    e.stopPropagation();
    if (activeTool !== 'select') return;

    const el = activeSetup.elements.find((e2) => e2.id === elementId);
    if (!el || isEffectivelyLocked(el)) return;

    selectElement(elementId);

    setDragState({
      type: 'waypoint',
      startMouse: { x: e.clientX, y: e.clientY },
      startElements: new Map(),
      selectedIds: [elementId],
      activeElementId: elementId,
      waypointId,
    });
  };

  // Movement waypoint rotation drag start (actors & cameras)
  const handleWaypointRotateStart = (elementId: string, waypointId: string, e: React.PointerEvent) => {
    e.stopPropagation();
    if (activeTool !== 'select') return;

    const el = activeSetup.elements.find((e2) => e2.id === elementId);
    if (!el || isEffectivelyLocked(el)) return;

    selectElement(elementId);

    setDragState({
      type: 'waypoint_rotate',
      startMouse: { x: e.clientX, y: e.clientY },
      startElements: new Map(),
      selectedIds: [elementId],
      activeElementId: elementId,
      waypointId,
    });
  };

  // Add camera waypoint
  const handleAddCameraWaypoint = (cameraId: string) => {
    const cam = activeSetup.elements.find((e) => e.id === cameraId) as CameraElement | undefined;
    if (!cam) return;
    const existingPath = cam.path || [];
    const nextBeat = Math.max(2, ...existingPath.map((wp) => wp.beat + 1));
    const lastPoint = existingPath.length > 0
      ? existingPath[existingPath.length - 1]
      : { x: cam.x, y: cam.y, rotation: cam.rotation || 0 };

    const angleRad = ((lastPoint.rotation || 0) * Math.PI) / 180;
    const offsetDist = 60;
    const spawnX = Math.round(lastPoint.x + Math.cos(angleRad) * offsetDist);
    const spawnY = Math.round(lastPoint.y + Math.sin(angleRad) * offsetDist);

    const newWp = {
      id: createId('wp'),
      x: spawnX,
      y: spawnY,
      rotation: lastPoint.rotation || 0,
      beat: nextBeat,
      dialogueCue: '',
    };

    updateElement(cam.id, { path: [...existingPath, newWp] });
    if (nextBeat > (activeSetup.totalBeats || 1)) {
      updateSetupMeta({ totalBeats: nextBeat });
    }
  };

  // Add actor waypoint
  const handleAddActorWaypoint = (actorId: string) => {
    const actor = activeSetup.elements.find((e) => e.id === actorId) as ActorElement | undefined;
    if (!actor) return;
    const existingPath = actor.path || [];
    const nextBeat = Math.max(2, ...existingPath.map((wp) => wp.beat + 1));
    const lastPoint = existingPath.length > 0
      ? existingPath[existingPath.length - 1]
      : { x: actor.x, y: actor.y, rotation: actor.rotation || 0 };

    const angleRad = ((lastPoint.rotation || 0) * Math.PI) / 180;
    const offsetDist = 50;
    const spawnX = Math.round(lastPoint.x + Math.cos(angleRad) * offsetDist);
    const spawnY = Math.round(lastPoint.y + Math.sin(angleRad) * offsetDist);

    const newWp = {
      id: createId('wp'),
      x: spawnX,
      y: spawnY,
      rotation: lastPoint.rotation || 0,
      beat: nextBeat,
      dialogueCue: '',
    };

    updateElement(actor.id, { path: [...existingPath, newWp] });
    if (nextBeat > (activeSetup.totalBeats || 1)) {
      updateSetupMeta({ totalBeats: nextBeat });
    }
  };

  // Add light (followspot / practical / repositioned fixture) waypoint
  const handleAddLightWaypoint = (lightId: string) => {
    const light = activeSetup.elements.find((e) => e.id === lightId) as LightElement | undefined;
    if (!light) return;
    const existingPath = light.path || [];
    const nextBeat = Math.max(2, ...existingPath.map((wp) => wp.beat + 1));
    const lastPoint = existingPath.length > 0
      ? existingPath[existingPath.length - 1]
      : { x: light.x, y: light.y, rotation: light.rotation || 0 };

    const angleRad = ((lastPoint.rotation || 0) * Math.PI) / 180;
    const offsetDist = 60;
    updateElement(light.id, {
      path: [
        ...existingPath,
        {
          id: createId('wp'),
          x: Math.round(lastPoint.x + Math.cos(angleRad) * offsetDist),
          y: Math.round(lastPoint.y + Math.sin(angleRad) * offsetDist),
          rotation: lastPoint.rotation || 0,
          beat: nextBeat,
        },
      ],
    });
    if (nextBeat > (activeSetup.totalBeats || 1)) updateSetupMeta({ totalBeats: nextBeat });
  };

  // Add prop (car / vehicle / furniture) waypoint
  const handleAddPropWaypoint = (propId: string) => {
    const prop = activeSetup.elements.find((e) => e.id === propId) as PropElement | undefined;
    if (!prop) return;
    const existingPath = prop.path || [];
    const nextBeat = Math.max(2, ...existingPath.map((wp) => wp.beat + 1));
    const lastPoint = existingPath.length > 0
      ? existingPath[existingPath.length - 1]
      : { x: prop.x, y: prop.y, rotation: prop.rotation || 0 };

    const angleRad = ((lastPoint.rotation || 0) * Math.PI) / 180;
    const offsetDist = 70;
    const spawnX = Math.round(lastPoint.x + Math.cos(angleRad) * offsetDist);
    const spawnY = Math.round(lastPoint.y + Math.sin(angleRad) * offsetDist);

    const newWp = {
      id: createId('wp'),
      x: spawnX,
      y: spawnY,
      rotation: lastPoint.rotation || 0,
      beat: nextBeat,
      dialogueCue: '',
    };

    updateElement(prop.id, { path: [...existingPath, newWp] });
    if (nextBeat > (activeSetup.totalBeats || 1)) {
      updateSetupMeta({ totalBeats: nextBeat });
    }
  };

  // Pointer Move
  const handlePointerMove = (e: React.PointerEvent) => {
    // Long-press is a HOLD: any real drag (>10px) cancels the pending menu.
    const press = longPressRef.current;
    if (press && Math.hypot(e.clientX - press.startX, e.clientY - press.startY) > 10) {
      cancelLongPress();
    }

    const mouseCanvas = screenToCanvas(e.clientX, e.clientY);
    setHoverCanvasPos(mouseCanvas);

    // Freehand stroke sampling: use coalesced events when available so fast
    // gestures keep every intermediate point instead of just the last one.
    const stroke = activeStrokeRef.current;
    if (stroke && e.pointerId === stroke.pointerId && !isPinchingRef.current) {
      const native = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
      const coalesced =
        typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
      const samples = coalesced.length > 0 ? coalesced : [native];
      const next = [...stroke.points];
      for (const sample of samples) {
        const p = screenToCanvas(sample.clientX, sample.clientY);
        const point: StrokePoint = { x: p.x, y: p.y };
        if (sample.pointerType === 'pen' && sample.pressure > 0) point.pressure = sample.pressure;
        next.push(point);
      }
      stroke.points = next;
      setLiveStroke(next);
      return;
    }

    if (!dragState) return;

    // Safety net: if the drag button is no longer held (the pointerup was
    // missed — e.g. it raced ahead of a pending render, or fired outside the
    // window), place the item NOW instead of letting it keep following the
    // cursor. handlePointerUp is idempotent, so this is safe to call here.
    const leftHeld = (e.buttons & 1) !== 0;
    if (dragState.type === 'pan' ? e.buttons === 0 : !leftHeld) {
      handlePointerUp();
      return;
    }

    if (dragState.type === 'pan' && dragState.startOffset) {
      const dx = e.clientX - dragState.startMouse.x;
      const dy = e.clientY - dragState.startMouse.y;
      setCanvasOffset({
        x: dragState.startOffset.x + dx,
        y: dragState.startOffset.y + dy,
      });
      return;
    }

    if (dragState.type === 'box_select') {
      setBoxSelection({
        x1: dragState.startMouse.x,
        y1: dragState.startMouse.y,
        x2: mouseCanvas.x,
        y2: mouseCanvas.y,
      });

      const minX = Math.min(dragState.startMouse.x, mouseCanvas.x);
      const maxX = Math.max(dragState.startMouse.x, mouseCanvas.x);
      const minY = Math.min(dragState.startMouse.y, mouseCanvas.y);
      const maxY = Math.max(dragState.startMouse.y, mouseCanvas.y);

      const insideIds = activeSetup.elements
        .filter((el) => el.x >= minX && el.x <= maxX && el.y >= minY && el.y <= maxY && !isEffectivelyLocked(el))
        .map((el) => el.id);

      selectElements(insideIds);
      return;
    }

    if (dragState.type === 'move') {
      const deltaScreenX = e.clientX - dragState.startMouse.x;
      const deltaScreenY = e.clientY - dragState.startMouse.y;

      const deltaCanvasX = deltaScreenX / canvasScale;
      const deltaCanvasY = deltaScreenY / canvasScale;

      const updates: { id: string; updates: ElementPatch }[] = [];

      // Multi-element drags snap ONCE and apply the identical final delta to
      // EVERY element. Snapping each member independently would re-grid
      // off-grid icons (e.g. fine-placed with Alt) onto different lattice
      // points, visually scattering the group. Single-element drags keep the
      // original per-element snapping behaviour.
      const draggingMultiple = dragState.startElements.size > 1;
      let snapAdjustX = 0;
      let snapAdjustY = 0;
      if (draggingMultiple && gridSettings.snap && !altDownRef.current) {
        const primary = dragState.startElements.values().next().value as FloorPlanElement;
        const rawPrimaryX = primary.x + deltaCanvasX;
        const rawPrimaryY = primary.y + deltaCanvasY;
        snapAdjustX = snapToGrid(rawPrimaryX, gridSettings.size, true) - rawPrimaryX;
        snapAdjustY = snapToGrid(rawPrimaryY, gridSettings.size, true) - rawPrimaryY;
      }

      // Final per-element translation for this frame, consumed by the
      // attached-cable cascade below.
      const movedDeltas = new Map<string, { dx: number; dy: number }>();

      dragState.startElements.forEach((origEl, id) => {
        const nextX = origEl.x + deltaCanvasX + snapAdjustX;
        const nextY = origEl.y + deltaCanvasY + snapAdjustY;
        let finalX = nextX;
        let finalY = nextY;
        let nextRotation = origEl.rotation;

        if ((origEl.type === 'door' || origEl.type === 'window') && !draggingMultiple && walls.length > 0 && !altDownRef.current) {
          const snapMatch = findNearestWall({ x: nextX, y: nextY }, walls, 50);
          if (snapMatch) {
            finalX = snapMatch.point.x;
            finalY = snapMatch.point.y;
            const angleDiff = Math.abs((((origEl.rotation - snapMatch.angle) % 360) + 360) % 360);
            const isFlipped = angleDiff > 90 && angleDiff < 270;
            nextRotation = isFlipped ? Math.round((snapMatch.angle + 180) % 360) : snapMatch.angle;
          } else if (gridSettings.snap) {
            finalX = snapToGrid(finalX, gridSettings.size, true);
            finalY = snapToGrid(finalY, gridSettings.size, true);
          }
        } else if (!draggingMultiple && gridSettings.snap && !altDownRef.current) {
          finalX = snapToGrid(finalX, gridSettings.size, true);
          finalY = snapToGrid(finalY, gridSettings.size, true);
        }

        const dx = finalX - origEl.x;
        const dy = finalY - origEl.y;

        const updateObj: ElementPatch = {
          x: finalX,
          y: finalY,
          rotation: nextRotation,
        };

        if ('x2' in origEl && typeof origEl.x2 === 'number') {
          updateObj.x2 = origEl.x2 + dx;
          updateObj.y2 = origEl.y2 + dy;
        }

        if ('path' in origEl && Array.isArray(origEl.path)) {
          updateObj.path = translatePath(origEl.path, dx, dy);
        }

        // Freehand strokes store absolute vertices — translate them with the
        // element so dragging actually moves the ink.
        if ('points' in origEl && Array.isArray(origEl.points)) {
          updateObj.points = translateStrokePoints(origEl.points, dx, dy);
        }

        updates.push({ id, updates: updateObj });
        movedDeltas.set(id, { dx, dy });
      });

      // Attached cable ends follow their devices: any cable whose semantic
      // endpoint references a dragged element (but which is not itself being
      // dragged) gets its anchored end translated by the same delta. Endpoint
      // geometry is anchored on a per-gesture snapshot, so repeated pointer
      // moves never accumulate drift.
      if (movedDeltas.size > 0) {
        const draggedIds = new Set(dragState.startElements.keys());
        for (const el of activeSetup.elements) {
          if (el.type !== 'cable') continue;
          const cable = el as CableElement;
          if (draggedIds.has(cable.id)) continue;
          const fromDelta = cable.fromElementId ? movedDeltas.get(cable.fromElementId) : undefined;
          const toDelta = cable.toElementId ? movedDeltas.get(cable.toElementId) : undefined;
          if (!fromDelta && !toDelta) continue;

          let snapshot = movedCableSnapshotsRef.current.get(cable.id);
          if (!snapshot) {
            snapshot = {
              ...cable,
              ...(cable.path ? { path: cable.path.map((point) => ({ ...point })) } : {}),
            };
            movedCableSnapshotsRef.current.set(cable.id, snapshot);
          }

          const updateObj: ElementPatch = {};
          if (fromDelta) {
            updateObj.x = snapshot.x + fromDelta.dx;
            updateObj.y = snapshot.y + fromDelta.dy;
          }
          if (toDelta) {
            updateObj.x2 = snapshot.x2 + toDelta.dx;
            updateObj.y2 = snapshot.y2 + toDelta.dy;
          }
          if (snapshot.path && snapshot.path.length > 0) {
            const interiorDx = ((fromDelta?.dx ?? 0) + (toDelta?.dx ?? 0)) / ((fromDelta ? 1 : 0) + (toDelta ? 1 : 0) || 1);
            const interiorDy = ((fromDelta?.dy ?? 0) + (toDelta?.dy ?? 0)) / ((fromDelta ? 1 : 0) + (toDelta ? 1 : 0) || 1);
            updateObj.path = translatePath(snapshot.path, interiorDx, interiorDy);
          }
          if ('x' in updateObj || 'x2' in updateObj || 'path' in updateObj) {
            updates.push({ id: cable.id, updates: updateObj });
          }
        }
      }

      dragChangedRef.current = true;
      updateMultipleElements(updates, false);
      return;
    }

    if (dragState.type === 'rotate' && dragState.activeElementId) {
      const origEl = dragState.startElements.get(dragState.activeElementId);
      if (!origEl) return;

      // Freehand strokes pivot around their bounding-box centre (the visual
      // middle of the ink); every other element pivots on its anchor point.
      const pivot = origEl.type === 'stroke'
        ? boundsCenterOfPoints((origEl as StrokeElement).points) ?? { x: origEl.x, y: origEl.y }
        : { x: origEl.x, y: origEl.y };

      let angle = getAngleBetweenPoints(pivot, mouseCanvas);

      if (e.shiftKey) {
        angle = Math.round(angle / 45) * 45;
      } else {
        angle = Math.round(angle / 5) * 5;
      }

      dragChangedRef.current = true;
      updateElement(dragState.activeElementId, { rotation: (angle + 360) % 360 }, false);
      return;
    }

    if (dragState.type === 'group_rotate' && dragState.groupId) {
      let delta = groupRotateDeltaNow(dragState, mouseCanvas);
      if (e.shiftKey) delta = Math.round(delta / 45) * 45;
      const pivot = dragState.startPivot!;
      const updates: { id: string; updates: ElementPatch }[] = [];
      dragState.startElements.forEach((origEl, id) => {
        const transformed = transformMemberElement(origEl, {
          deltaDeg: delta,
          center: pivot,
          translation: { x: 0, y: 0 },
        });
        const updateObj: Record<string, unknown> = {
          x: transformed.x,
          y: transformed.y,
          rotation: transformed.rotation,
        };
        if (isEndpointElement(transformed)) {
          updateObj.x2 = transformed.x2;
          updateObj.y2 = transformed.y2;
        }
        if (isStrokeElement(transformed)) {
          updateObj.points = transformed.points;
        } else if ('path' in transformed) {
          updateObj.path = (transformed as { path?: Waypoint[] }).path;
        }
        updates.push({ id, updates: updateObj });
      });
      dragChangedRef.current = true;
      updateMultipleElements(updates, false);
      return;
    }

    if (
      (dragState.type === 'endpoint_start' ||
        dragState.type === 'endpoint_end' ||
        dragState.type === 'draw_wall' ||
        dragState.type === 'draw_measure' ||
        dragState.type === 'draw_arrow' ||
        dragState.type === 'draw_cable') &&
      dragState.activeElementId
    ) {
      const drawPos = getDrawingCursorPos(mouseCanvas);
      const orig = dragState.startElements.get(dragState.activeElementId);

      // Line basic shape endpoint drag
      if (orig && orig.type === 'shape' && orig.shapeType === 'line') {
        const shape = orig;
        const rad = ((shape.rotation || 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const half = (shape.width || 180) / 2;
        const origP1 = { x: shape.x - half * cos, y: shape.y - half * sin };
        const origP2 = { x: shape.x + half * cos, y: shape.y + half * sin };

        const p1 = dragState.type === 'endpoint_start' ? drawPos : origP1;
        const p2 = dragState.type === 'endpoint_end' ? drawPos : origP2;

        const newLen = Math.max(15, Math.hypot(p2.x - p1.x, p2.y - p1.y));
        let newAngle = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
        if (e.shiftKey) {
          newAngle = Math.round(newAngle / 45) * 45;
        }
        const newCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

        dragChangedRef.current = true;
        updateElement(
          dragState.activeElementId,
          {
            x: newCenter.x,
            y: newCenter.y,
            width: Math.round(newLen),
            rotation: Math.round((newAngle + 360) % 360),
          },
          false
        );
        return;
      }

      if (dragState.type === 'endpoint_start') {
        dragChangedRef.current = true;
        updateElement(dragState.activeElementId, { x: drawPos.x, y: drawPos.y }, false);
      } else {
        dragChangedRef.current = true;
        updateElement(dragState.activeElementId, { x2: drawPos.x, y2: drawPos.y }, false);
      }
      return;
    }

    // Curved dolly track control-point drag: project the cursor onto the track
    // normal to derive the signed curve offset from the chord midpoint.
    if (dragState.type === 'curve' && dragState.activeElementId) {
      const orig = dragState.startElements.get(dragState.activeElementId);
      if (!orig) return;

      const { x1, y1, x2, y2 } = endpointsOf(orig);
      const dist = Math.max(20, Math.hypot(x2 - x1, y2 - y1));
      const normalX = -(y2 - y1) / dist;
      const normalY = (x2 - x1) / dist;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      // Signed distance of the cursor from the chord midpoint along the normal
      let offset = Math.round((mouseCanvas.x - midX) * normalX + (mouseCanvas.y - midY) * normalY);
      if (e.shiftKey) {
        offset = Math.round(offset / 10) * 10;
      }
      offset = Math.max(-500, Math.min(500, offset));
      // Snap straight tracks that land near zero back to a perfectly straight line.
      const snappedIsCurved = Math.abs(offset) >= 4;

      dragChangedRef.current = true;
      updateElement(
        dragState.activeElementId,
        { isCurved: snappedIsCurved, curveOffset: offset },
        false
      );
      return;
    }

    // 2D Shapes & Props interactive resize dragging
    if (dragState.type === 'resize_element' && dragState.activeElementId && dragState.handle) {
      const orig = dragState.startElements.get(dragState.activeElementId);
      if (!orig) return;

      const deltaScreenX = e.clientX - dragState.startMouse.x;
      const deltaScreenY = e.clientY - dragState.startMouse.y;
      const deltaCanvasX = deltaScreenX / canvasScale;
      const deltaCanvasY = deltaScreenY / canvasScale;

      const rotRad = -((orig.rotation || 0) * Math.PI) / 180;
      const localDx = deltaCanvasX * Math.cos(rotRad) - deltaCanvasY * Math.sin(rotRad);
      const localDy = deltaCanvasX * Math.sin(rotRad) + deltaCanvasY * Math.cos(rotRad);

      const origW = hasSize(orig) ? orig.width : 80;
      const origH = hasSize(orig) ? orig.height : 60;

      let newW = origW;
      let newH = origH;
      let centerShiftX = 0;
      let centerShiftY = 0;

      const handle = dragState.handle;
      if (handle.includes('e')) {
        newW = Math.max(5, origW + localDx);
        centerShiftX = (newW - origW) / 2;
      }
      if (handle.includes('w')) {
        newW = Math.max(5, origW - localDx);
        centerShiftX = -(newW - origW) / 2;
      }
      if (handle.includes('s')) {
        newH = Math.max(5, origH + localDy);
        centerShiftY = (newH - origH) / 2;
      }
      if (handle.includes('n')) {
        newH = Math.max(5, origH - localDy);
        centerShiftY = -(newH - origH) / 2;
      }

      if (orig.type === 'shape' && orig.shapeType === 'circle') {
        const sz = Math.max(newW, newH);
        newW = sz;
        newH = sz;
      }

      const worldRotRad = ((orig.rotation || 0) * Math.PI) / 180;
      const worldShiftX = centerShiftX * Math.cos(worldRotRad) - centerShiftY * Math.sin(worldRotRad);
      const worldShiftY = centerShiftX * Math.sin(worldRotRad) + centerShiftY * Math.cos(worldRotRad);

      dragChangedRef.current = true;
      updateElement(
        dragState.activeElementId,
        {
          x: orig.x + worldShiftX,
          y: orig.y + worldShiftY,
          width: Math.round(newW),
          height: Math.round(newH),
        },
        false
      );
      return;
    }

    // Drag an actor / camera movement waypoint directly on the canvas
    if (dragState.type === 'group_waypoint' && dragState.groupId && dragState.waypointId) {
      let nextX = mouseCanvas.x;
      let nextY = mouseCanvas.y;
      if (gridSettings.snap && !altDownRef.current) {
        nextX = snapToGrid(nextX, gridSettings.size, true);
        nextY = snapToGrid(nextY, gridSettings.size, true);
      }
      dragChangedRef.current = true;
      patchGroupWaypoint(dragState.groupId, dragState.waypointId, { x: Math.round(nextX), y: Math.round(nextY) }, false);
      return;
    }

    if (dragState.type === 'waypoint' && dragState.activeElementId && dragState.waypointId) {
      const el = activeSetup.elements.find((e2) => e2.id === dragState.activeElementId);
      if (el && hasWaypointPath(el)) {
        let nextX = mouseCanvas.x;
        let nextY = mouseCanvas.y;
        if (gridSettings.snap && !altDownRef.current) {
          nextX = snapToGrid(nextX, gridSettings.size, true);
          nextY = snapToGrid(nextY, gridSettings.size, true);
        }
        dragChangedRef.current = true;
        updateElement(
          dragState.activeElementId,
          { path: patchWaypoint(el.path, dragState.waypointId, { x: nextX, y: nextY }) },
          false,
        );
      }
      return;
    }

    // Rotate a waypoint's facing direction on the canvas
    if (dragState.type === 'waypoint_rotate' && dragState.activeElementId && dragState.waypointId) {
      const el = activeSetup.elements.find((e2) => e2.id === dragState.activeElementId);
      if (el && hasWaypointPath(el)) {
        const wp = el.path.find((w) => w.id === dragState.waypointId);
        if (wp) {
          let angle = getAngleBetweenPoints({ x: wp.x, y: wp.y }, mouseCanvas);
          if (e.shiftKey) {
            angle = Math.round(angle / 45) * 45;
          } else {
            angle = Math.round(angle / 5) * 5;
          }
          dragChangedRef.current = true;
          updateElement(
            dragState.activeElementId,
            { path: patchWaypoint(el.path, dragState.waypointId, { rotation: (angle + 360) % 360 }) },
            false,
          );
        }
      }
      return;
    }
  };

  // Pointer Up
  //
  // Deliberately not a useCallback: this is the drag-release path and it reads
  // most of the canvas's state and callbacks. Stabilising it would mean
  // stabilising all of them, for the sake of avoiding one listener swap per
  // render. Its effect's dependency list is complete, which is what matters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handlePointerUp = () => {
    if (dragState?.type === 'draw_measure') {
      // Finish measuring: if the tape is a zero-length click, give it a sensible default length
      const el = activeSetup.elements.find((e) => e.id === dragState.activeElementId);
      if (hasEndpoints(el)) {
        const length = elementLength(el);
        if (length < 5) {
          updateElement(el.id, { x2: el.x + 150, y2: el.y }, false);
        }
      }
      setTool('select');
    }
    if (dragState?.type === 'draw_arrow') {
      // Finish arrow: a zero-length click gets a sensible default 150px arrow to the right
      const el = activeSetup.elements.find((e) => e.id === dragState.activeElementId);
      if (hasEndpoints(el)) {
        const length = elementLength(el);
        if (length < 5) {
          updateElement(el.id, { x2: el.x + 150, y2: el.y }, false);
        }
      }
      setTool('select');
    }
    if (dragState?.type === 'draw_cable') {
      // First segment of a routed run: on release we start chaining from the
      // endpoint so the next CLICK adds a corner (exactly like connected walls).
      const el = activeSetup.elements.find((e) => e.id === dragState.activeElementId);
      if (hasEndpoints(el)) {
        const length = elementLength(el);
        // Re-evaluate the from-end attachment wherever the start landed.
        if (el.type === 'cable') {
          const startDevice = findAttachableDeviceAt({ x: el.x, y: el.y }, activeSetup.elements);
          updateElement(el.id, {
            ...(startDevice
              ? { fromElementId: startDevice.id, fromLabel: deviceLabelOf(startDevice) }
              : { fromElementId: undefined }),
          }, false);
        }
        if (length < 5) {
          // Just a click, not a drag: give the first segment a sensible default
          // length, then keep the tool active for chaining.
          updateElement(el.id, { x2: el.x + 150, y2: el.y }, false);
          setConnectedCableStart({ cableId: el.id, x: el.x + 150, y: el.y });
        } else {
          setConnectedCableStart({ cableId: el.id, x: el.x2, y: el.y2 });
        }
      }
      // Stay in the cable tool — the next click routes a corner.
    }
    if (dragState?.type === 'draw_wall') {
      // If user dragged a significant wall length, finish wall; if clicked in place, leave connected wall mode active
      const el = activeSetup.elements.find((e) => e.id === dragState.activeElementId);
      if (el && 'x2' in el && typeof el.x2 === 'number') {
        const length = Math.hypot(el.x2 - el.x, el.y2 - el.y);
        if (length > 20) {
          // Keep connected wall point at endpoint so user can continue chaining
          setConnectedWallStart({ x: el.x2, y: el.y2 });
        }
      }
    }

    if (dragState?.type === 'endpoint_start' || dragState?.type === 'endpoint_end') {
      // Dropping a cable end on a device attaches it; dropping it on empty
      // space detaches. Runs before the single history commit below so the
      // whole gesture stays one undo step.
      const el = activeSetup.elements.find((e) => e.id === dragState.activeElementId);
      if (el && el.type === 'cable') {
        const isStart = dragState.type === 'endpoint_start';
        const px = isStart ? el.x : (el as CableElement).x2;
        const py = isStart ? el.y : (el as CableElement).y2;
        const otherEndId = isStart ? (el as CableElement).toElementId : (el as CableElement).fromElementId;
        const device = findAttachableDeviceAt({ x: px, y: py }, activeSetup.elements);
        if (device && device.id !== otherEndId) {
          updateElement(el.id, isStart
            ? { fromElementId: device.id, fromLabel: deviceLabelOf(device) }
            : { toElementId: device.id, toLabel: deviceLabelOf(device) }, false);
        } else {
          updateElement(el.id, isStart
            ? { fromElementId: undefined }
            : { toElementId: undefined }, false);
        }
      }
    }

    // Drags that modified EXISTING elements get pushed into history exactly
    // once here, so one gesture = one undo step. (draw_wall / draw_measure are
    // excluded: they already pushed a creation entry, and undo reverts them by
    // removing the whole element.)
    if (
      dragChangedRef.current &&
      dragState &&
      ['move', 'rotate', 'group_rotate', 'group_waypoint', 'endpoint_start', 'endpoint_end', 'waypoint', 'waypoint_rotate', 'curve'].includes(dragState.type)
    ) {
      commitCurrentState();
    }
    dragChangedRef.current = false;
    movedCableSnapshotsRef.current.clear();
    setDragState(null);
    setBoxSelection(null);
  };

  // Commit (or abort) an in-progress freehand stroke. Committed strokes go
  // through addElement, so they get ids, autosave and undo history like any
  // other element; aborted ones (second finger, pointercancel) vanish.
  const finishStroke = (commit: boolean) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    activeStrokeRef.current = null;
    setLiveStroke(null);
    if (!commit || stroke.points.length < 2) return;
    addElement({
      type: 'stroke',
      name: 'Annotation',
      x: stroke.points[0].x,
      y: stroke.points[0].y,
      points: stroke.points,
      color: freehandSettings.color,
      strokeWidth: freehandSettings.strokeWidth,
      opacity: freehandSettings.opacity,
      toolStyle: freehandSettings.toolStyle,
    });
    // Strokes are annotations: don't leave them selected (addElement auto-selects).
    clearSelection();
  };

  const handleCanvasPointerUp = (e: React.PointerEvent) => {
    cancelLongPress();
    if (activeStrokeRef.current && e.pointerId === activeStrokeRef.current.pointerId) {
      finishStroke(true);
      return;
    }
    handlePointerUp();
  };

  const handleCanvasPointerCancel = () => {
    cancelLongPress();
    finishStroke(false);
  };

  // Finalize any in-progress drag when the button is released ANYWHERE (even
  // outside the canvas), so a dropped item is always placed and never stays
  // stuck to the cursor. handlePointerUp is idempotent, so the container's own
  // onPointerUp firing first is harmless.
  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [handlePointerUp]);

  // Keyboard Shortcuts (Delete, Space, Undo, Redo, Esc, Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Never hijack keys from anything that edits text or has its own
      // keyboard semantics (form fields, contentEditable, a text selection
      // the user is about to copy from the script / shot list).
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      // The canvas is always mounted, so a window-level listener would keep
      // acting on the plan while the user is working a button in the shot
      // list, the inspector or a modal — Delete would silently remove the
      // selected element, "l" would lock it, Ctrl+V would paste into the plan.
      //
      // The rule is stated as "not somewhere that owns its own keys" rather
      // than "inside the canvas container". Requiring the container looked
      // tighter but was wrong: the tool palette and the timeline are siblings
      // of the canvas, so clicking a tool button and then pressing Delete did
      // nothing at all. What actually needs excluding is the side panel and
      // any open dialog.
      //
      // A dialog is checked by presence, not just by focus: a modal that opens
      // without moving focus leaves it on <body>, and Delete would otherwise
      // reach the plan behind the modal.
      //
      // `instanceof Element` before `closest`: a keyboard event dispatched
      // straight at `window` (which tooling and some libraries do) has a
      // target that is neither, and calling DOM methods on it throws — taking
      // every shortcut in the app down with it, including undo.
      const targetElement = target instanceof Element ? target : null;
      const onCanvasSurface =
        document.querySelector('[role="dialog"]') === null &&
        targetElement?.closest('#right-sidebar, [role="dialog"]') == null;
      // Letter keys arrive upper-case while Shift is held, so compare on a
      // folded copy: `e.key === 'z'` alone never matches Ctrl+Shift+Z.
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const textSelection = window.getSelection();
      if (
        textSelection &&
        !textSelection.isCollapsed &&
        textSelection.toString().length > 0 &&
        (e.metaKey || e.ctrlKey) &&
        (key === 'c' || key === 'x')
      ) {
        return;
      }

      // Holding Ctrl+Z (or C/V/D/Y) auto-repeats keydown events; ignore repeats
      // so a single physical press only ever triggers ONE undo/redo/copy/paste.
      if (e.repeat && ['z', 'y', 'c', 'v', 'd'].includes(key)) {
        return;
      }

      // Undo/redo are application-level and stay global.
      if ((e.metaKey || e.ctrlKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && key === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (!onCanvasSurface) return;

      if (e.code === 'Space') {
        setIsSpacePressed(true);
      }

      if (e.key === 'Alt') {
        altDownRef.current = true;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedBackgroundId) {
          removeBackgroundImage(selectedBackgroundId);
          setSelectedBackgroundId(null);
        } else {
          deleteSelectedElements();
        }
      }

      if (e.key === 'Escape') {
        cancelBackgroundCalibration();
        setContextMenu(null);
        clearSelection();
        finishConnectedWalls();
        finishConnectedCable();
        setShowShortcuts(false);
      }

      if (e.key === 'Enter') {
        finishConnectedWalls();
        finishConnectedCable();
      }

      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      }

      if ((e.metaKey || e.ctrlKey) && key === 'd') {
        e.preventDefault();
        duplicateSelected();
      }

      if ((e.metaKey || e.ctrlKey) && key === 'c') {
        e.preventDefault();
        copySelectedElements();
      }

      if ((e.metaKey || e.ctrlKey) && key === 'v') {
        e.preventDefault();
        pasteElements();
      }

      // Lock / Unlock toggle shortcut (L or Ctrl+L)
      if (key === 'l' && !e.altKey && !e.shiftKey) {
        if (selectedElementIds.length > 0) {
          e.preventDefault();
          const selectedEls = activeSetup.elements.filter((el) => selectedElementIds.includes(el.id));
          const anyUnlocked = selectedEls.some((el) => !el.locked);
          updateMultipleElements(
            selectedElementIds.map((id) => ({ id, updates: { locked: anyUnlocked } })),
            true
          );
        } else if (selectedBackgroundId) {
          e.preventDefault();
          const bg = activeSetup.backgroundImages?.find((b) => b.id === selectedBackgroundId);
          if (bg) updateBackgroundImage(selectedBackgroundId, { locked: !bg.locked });
        }
      }

      // Nudge with arrow keys (only for unlocked elements)
      if (selectedElementIds.length > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 2;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

        const updates = selectedElementIds
          .map((id) => {
            const el = activeSetup.elements.find((e) => e.id === id);
            if (!el || isEffectivelyLocked(el)) return null;
            const linearUpdates: ElementPatch =
              'x2' in el && typeof el.x2 === 'number'
                ? { x2: el.x2 + dx, y2: el.y2 + dy }
                : {};
            // Strokes nudge via their absolute vertices.
            const strokeUpdates: ElementPatch =
              el.type === 'stroke' && Array.isArray(el.points)
                ? { points: translateStrokePoints(el.points, dx, dy) }
                : {};
            // Movement paths and cable routes are absolute too. Dragging has
            // always carried them; the keyboard nudge did not, so arrowing an
            // actor across the plan left its beats standing where they were.
            const pathUpdates: ElementPatch =
              'path' in el && Array.isArray(el.path) && el.path.length > 0
                ? { path: translatePath(el.path, dx, dy) }
                : {};
            return {
              id,
              updates: {
                x: el.x + dx,
                y: el.y + dy,
                ...linearUpdates,
                ...strokeUpdates,
                ...pathUpdates,
              },
            };
          })
          .filter(Boolean) as { id: string; updates: ElementPatch }[];

        updateMultipleElements(updates, true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
      if (e.key === 'Alt') {
        altDownRef.current = false;
      }
    };

    const handleBlur = () => {
      // Never leave the Alt-snap-disable flag stuck if the window loses focus.
      altDownRef.current = false;
      setIsSpacePressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
    // Everything the handlers touch is listed. An omitted dependency here means
    // a keyboard shortcut acting on a stale copy of the scene — nudging a
    // background image that has since moved, or finishing a wall/cable run with
    // an out-of-date callback.
  }, [selectedElementIds, deleteSelectedElements, clearSelection, undo, redo, activeSetup.elements, activeSetup.backgroundImages, updateMultipleElements, updateBackgroundImage, setTool, selectedBackgroundId, removeBackgroundImage, setSelectedBackgroundId, duplicateSelected, copySelectedElements, pasteElements, cancelBackgroundCalibration, finishConnectedWalls, finishConnectedCable, isEffectivelyLocked]);

  const selectedElementRaw =
    selectedElementIds.length === 1
      ? activeSetup.elements.find((e) => e.id === selectedElementIds[0])
      : null;
  // A selection whose layer was hidden afterwards keeps its data but gets no
  // on-canvas transform handles while invisible.
  const selectedElement = selectedElementRaw && !isElementHidden(selectedElementRaw)
    ? selectedElementRaw
    : null;

  const isLightMode = theme === 'light';

  /**
   * One sentence describing what is on the plan, for the SVG's accessible name.
   *
   * Counts by type rather than listing elements: a screen reader reading out
   * forty individual props before the user reaches the toolbar is worse than
   * silence, and the per-element detail is already available as real DOM in the
   * shot list and the inspector. This is the orientation line — what scene, how
   * much is on it — and the panels are the navigation.
   */
  const planSummaryLabel = useMemo(() => {
    const visible = (activeSetup?.elements ?? []).filter((element) => !isElementHidden(element));
    if (visible.length === 0) {
      return `Floor plan for ${activeSetup?.name || 'this scene'} — empty`;
    }
    const counts = new Map<string, number>();
    for (const element of visible) {
      counts.set(element.type, (counts.get(element.type) ?? 0) + 1);
    }
    const parts = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([type, count]) => `${count} ${type}${count === 1 ? '' : 's'}`);
    return `Floor plan for ${activeSetup?.name || 'this scene'} — ${parts.join(', ')}`;
  }, [activeSetup?.elements, activeSetup?.name, isElementHidden]);

  const applyBackgroundCalibration = () => {
    if (!calibratingBackgroundId || calibrationPoints.length !== 2) return;
    const image = backgroundImages.find((background) => background.id === calibratingBackgroundId);
    const realLength = Number(calibrationLength);
    if (!image || !Number.isFinite(realLength) || realLength <= 0) {
      setCalibrationError('Enter a real length greater than zero.');
      return;
    }
    const result = calibrateBackgroundImage(
      image,
      calibrationPoints[0],
      calibrationPoints[1],
      realLength,
      calibrationUnit,
      gridSettings,
      new Date().toISOString(),
    );
    if (!result) {
      setCalibrationError('The two marks are too close together. Mark a longer scale line.');
      return;
    }
    updateBackgroundImage(
      image.id!,
      {
        ...result.updates,
        x: Math.round(result.updates.x * 100) / 100,
        y: Math.round(result.updates.y * 100) / 100,
        width: Math.round(result.updates.width * 100) / 100,
        height: Math.round(result.updates.height * 100) / 100,
      },
      true,
    );
    cancelBackgroundCalibration();
    setCalibrationPoints([]);
  };

  // Live cursor snap indicator
  const activeDrawPos = hoverCanvasPos ? getDrawingCursorPos(hoverCanvasPos) : null;
  const isMagnetSnapped = hoverCanvasPos && findNearestVertex(hoverCanvasPos, 20) !== null;

  return (
    <div
      ref={containerRef}
      id="floor-plan-canvas-container"
      className={`relative w-full h-full overflow-hidden select-none transition-colors duration-200 ${
        isLightMode ? 'bg-slate-100' : 'bg-slate-950'
      } ${
        isSpacePressed || activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : activeTool !== 'select' ? 'cursor-crosshair' : 'cursor-default'
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handleCanvasPointerUp}
      onPointerCancel={handleCanvasPointerCancel}
      onContextMenu={(e) => {
        e.preventDefault();
        cancelLongPress();
        if (isPinchingRef.current || activeStrokeRef.current) return;
        const hit = findElementAtPoint(screenToCanvas(e.clientX, e.clientY));
        setContextMenu({ x: e.clientX, y: e.clientY, elementId: hit?.id ?? null });
      }}
      onDoubleClick={(e) => {
        finishConnectedWalls();
        finishConnectedCable();
        // Double-clicking bare canvas opens the scene's own settings: the
        // Inspector with nothing selected IS the plan / scene panel, and it
        // already opens on Scene & Environment. Same "hit nothing" test the
        // box-select path uses — an element or a background image is a real
        // target and only the bare svg is not — so this cannot fire on the
        // double-click that opens an element's inspector.
        if (activeTool !== 'select') return;
        const target = e.target as HTMLElement;
        if (target.tagName !== 'svg' && target.id !== 'floor-plan-svg') return;
        clearSelection();
        setActiveRightTab('inspector');
        setRightPanelOpen(true);
      }}
    >
      {/* The plan is the app's primary content and was previously invisible to
          assistive tech: an unlabelled <svg> is announced, if at all, as
          "graphic". role="img" plus a summary at least says what is on the
          plan and how much of it; the per-element detail lives in the
          inspector and the shot list, which are real DOM. */}
      <svg
        ref={svgRef}
        id="floor-plan-svg"
        role="img"
        aria-label={planSummaryLabel}
        className="w-full h-full block"
      >
        {/* 0. Endless Vector Grid & Axes — rendered outside the pan/zoom
            transform so it always covers the viewport, while the pattern
            transform keeps it aligned to world coordinates */}
        <GridLayer
          gridSettings={gridSettings}
          canvasScale={canvasScale}
          canvasOffset={canvasOffset}
          visible={(displaySettings.showGrid === true) || (gridSettings.showGrid === true)}
          dark={!isLightMode}
        />

        {/* Transform layer for Canvas scale and Pan offset */}
        <g transform={`translate(${canvasOffset.x}, ${canvasOffset.y}) scale(${canvasScale})`}>

          {/* 2. Scalable Reference Blueprint / Screenshot Layers (multiple supported) */}
          <BackgroundLayer
            backgroundImages={backgroundImages}
            canvasScale={canvasScale}
            selectedBackgroundId={selectedBackgroundId}
            isInteractive={activeTool === 'select' && !calibratingBackgroundId}
            onSelectImage={handleSelectBackgroundImage}
            onUpdate={updateBackgroundImage}
            onDelete={removeBackgroundImage}
            onDropToCamera={handleDropImageToCamera}
          />

          {/* 3. Props, Furniture, Rigs, Tracks, Measurements */}
          <ShapesLayer
            shapes={shapes}
            selectedIds={selectedElementIds}
            onSelect={handleElementSelect}
            onDoubleClick={handleElementDoubleClick}
            canvasScale={canvasScale}
            showHiddenGhosts
          />

          {sunView && (
            <SunOverlay
              sun={sunView.sun}
              planNorthDeg={sunView.planNorthDeg}
              center={{ x: 120, y: 120 }}
              radius={78}
              isLight={theme === 'light'}
            />
          )}

          {/* Streets sit under everything else on the plan: on an exterior the
              road is the ground, not an annotation on top of it. */}
          <RoadLayer
            roads={roads}
            selectedIds={selectedElementIds}
            onSelect={handleElementSelect}
            onDoubleClick={handleElementDoubleClick}
            displaySettings={displaySettings}
          />

          <PropsLayer
            propsList={propsList}
            tracks={tracks}
            measurements={measurements}
            arrows={arrows}
            texts={texts}
            selectedIds={selectedElementIds}
            onSelect={handleElementSelect}
            onDoubleClick={handleElementDoubleClick}
            onUpdateText={handleUpdateElementText}
            pixelsPerUnit={gridSettings.pixelsPerUnit}
            displaySettings={displaySettings}
            currentBeat={playback.currentBeat}
            onAddWaypoint={handleAddPropWaypoint}
            onWaypointDragStart={handleWaypointDragStart}
            onWaypointRotateStart={handleWaypointRotateStart}
          />

          <CableLayer
            cables={cables}
            allElements={activeSetup.elements}
            selectedIds={selectedElementIds}
            onSelect={handleElementSelect}
            onDoubleClick={handleElementDoubleClick}
            pixelsPerUnit={gridSettings.pixelsPerUnit}
            displaySettings={displaySettings}
          />

          {/* 3b. Truss runs. Above the room and the cable runs, below the
              fixtures — a truss is overhead structure, and the lamps hanging
              off it have to read on top of it. */}
          {trussRuns.length > 0 && (
            <TrussLayer
              runs={trussRuns}
              unitsPerMm={trussUnitsPerMm}
              selectedId={selectedTrussId}
              isInteractive={activeTool === 'select'}
              onSelect={setSelectedTrussId}
              onMove={moveTrussRun}
              onRotate={rotateTrussRun}
              canvasScale={canvasScale}
              isLight={isLightMode}
            />
          )}

          {/* 4. Lighting Beams & Fixtures */}
          <LightingLayer
            lights={lights}
            selectedIds={selectedElementIds}
            onSelect={handleElementSelect}
            onDoubleClick={handleElementDoubleClick}
            displaySettings={displaySettings}
            gridSettings={activeSetup.gridSettings}
            currentBeat={playback.currentBeat}
            onAddWaypoint={handleAddLightWaypoint}
            onWaypointDragStart={handleWaypointDragStart}
            onWaypointRotateStart={handleWaypointRotateStart}
          />

          {/* 5. Walls, Doors, Windows with Live Snapping Glow */}
          <WallLayer
            walls={walls}
            doors={doors}
            windows={windows}
            selectedIds={selectedElementIds}
            snappedWallId={nearestWallInfo?.wallId}
            showLightBeams={displaySettings.showLightBeams}
            showDoorWindowLabels={displaySettings.showDoorWindowLabels}
            onSelect={handleElementSelect}
            onDoubleClick={handleElementDoubleClick}
            categoryOpacity={displaySettings.categoryOpacity}
            labelOpacity={(displaySettings.labelOpacity ?? 1) * (displaySettings.labelCategoryOpacity?.doorWindows ?? 1)}
            labelColor={displaySettings.doorWindowLabelColor}
          />

          {/* 6. Live Connected Wall Rubberband Preview */}
          {connectedWallStart && activeDrawPos && (
            <g className="pointer-events-none">
              <line
                x1={connectedWallStart.x}
                y1={connectedWallStart.y}
                x2={activeDrawPos.x}
                y2={activeDrawPos.y}
                stroke="#38bdf8"
                strokeWidth={14}
                strokeLinecap="square"
                opacity={0.7}
              />
              <line
                x1={connectedWallStart.x}
                y1={connectedWallStart.y}
                x2={activeDrawPos.x}
                y2={activeDrawPos.y}
                stroke="#0284c7"
                strokeWidth={2}
                strokeDasharray="4 4"
              />
              {/* Length indicator */}
              <text
                x={(connectedWallStart.x + activeDrawPos.x) / 2}
                y={(connectedWallStart.y + activeDrawPos.y) / 2 - 12}
                textAnchor="middle"
                fill="#38bdf8"
                fontSize={12 / canvasScale}
                fontWeight="bold"
                fontFamily="monospace"
              >
                {(Math.hypot(activeDrawPos.x - connectedWallStart.x, activeDrawPos.y - connectedWallStart.y) / 50).toFixed(2)}m
              </text>
            </g>
          )}

          {/* 6b. Live Cable Routing Rubberband Preview */}
          {connectedCableStart && activeDrawPos && (() => {
            const cEl = activeSetup.elements.find((e) => e.id === connectedCableStart.cableId);
            const cInfo = cEl && cEl.type === 'cable' ? CABLE_TYPES.find((c) => c.type === cEl.cableType) : null;
            const cColor = cEl && cEl.type === 'cable' ? cEl.color || cInfo?.color || '#38bdf8' : '#38bdf8';
            const segLen = Math.hypot(activeDrawPos.x - connectedCableStart.x, activeDrawPos.y - connectedCableStart.y);
            return (
              <g className="pointer-events-none">
                <line
                  x1={connectedCableStart.x}
                  y1={connectedCableStart.y}
                  x2={activeDrawPos.x}
                  y2={activeDrawPos.y}
                  stroke={cColor}
                  strokeWidth={8}
                  strokeLinecap="round"
                  opacity={0.55}
                />
                <line
                  x1={connectedCableStart.x}
                  y1={connectedCableStart.y}
                  x2={activeDrawPos.x}
                  y2={activeDrawPos.y}
                  stroke={cColor}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
                {/* Vertex dot + length */}
                <circle cx={connectedCableStart.x} cy={connectedCableStart.y} r={4.5} fill={cColor} stroke="#0f172a" strokeWidth={1.5} />
                <text
                  x={(connectedCableStart.x + activeDrawPos.x) / 2}
                  y={(connectedCableStart.y + activeDrawPos.y) / 2 - 12}
                  textAnchor="middle"
                  fill={cColor}
                  fontSize={11 / canvasScale}
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {`${(segLen / (activeSetup.gridSettings?.pixelsPerUnit || 50)).toFixed(1)}m`}
                </text>
              </g>
            );
          })()}

          {/* 7. Corner Magnetic Snap Dot */}
          {activeTool === 'wall' && activeDrawPos && (
            <g transform={`translate(${activeDrawPos.x}, ${activeDrawPos.y})`} className="pointer-events-none">
              <circle
                cx={0}
                cy={0}
                r={isMagnetSnapped ? 7 : 4}
                fill={isMagnetSnapped ? '#10b981' : '#38bdf8'}
                stroke="#0f172a"
                strokeWidth={2}
              />
              {isMagnetSnapped && (
                <circle cx={0} cy={0} r={12} fill="none" stroke="#10b981" strokeWidth={1.5} className="animate-ping" />
              )}
            </g>
          )}

          {/* Ghost Preview for Snapping Door / Window tool on walls */}
          {nearestWallInfo && (
            <g
              transform={`translate(${nearestWallInfo.point.x}, ${nearestWallInfo.point.y}) rotate(${nearestWallInfo.angle})`}
              className="pointer-events-none opacity-90"
            >
              {activeTool === 'door' ? (
                <g>
                  <circle cx={0} cy={0} r={6} fill="#f59e0b" />
                  <line x1={0} y1={0} x2={60} y2={0} stroke="#38bdf8" strokeWidth={4} />
                  <path d="M 0 0 A 60 60 0 0 1 60 60" fill="none" stroke="#38bdf8" strokeWidth={2} strokeDasharray="4 4" />
                </g>
              ) : (
                <rect x={-50} y={-8} width={100} height={16} fill="#38bdf8" fillOpacity={0.5} stroke="#38bdf8" strokeWidth={2.5} rx={3} />
              )}
            </g>
          )}

          {/* 8. Actors & Blocking Waypoints */}
          {actors.map((actor) => (
            <ActorElementView
              key={actor.id}
              actor={actor}
              isSelected={selectedElementIds.includes(actor.id)}
              isHighlighted={highlightedElementId === actor.id}
              currentBeat={playback.currentBeat}
              isPlaying={playback.isPlaying}
              onSelect={handleElementSelect}
              onDoubleClick={handleElementDoubleClick}
              onAddWaypoint={handleAddActorWaypoint}
              onWaypointDragStart={handleWaypointDragStart}
              onWaypointRotateStart={handleWaypointRotateStart}
              displaySettings={displaySettings}
            />
          ))}

          {/* 9. Cameras, FOV Cones & Shots */}
          {cameras.map((camera) => (
            <CameraElementView
              key={camera.id}
              camera={camera}
              shot={getShotForCamera(camera)}
              isSelected={selectedElementIds.includes(camera.id)}
              isHighlighted={highlightedElementId === camera.id}
              currentBeat={playback.currentBeat}
              isPlaying={playback.isPlaying}
              onSelect={handleElementSelect}
              onDoubleClick={handleElementDoubleClick}
              onOpenViewfinder={openViewfinder}
              onAddWaypoint={handleAddCameraWaypoint}
              onWaypointDragStart={handleWaypointDragStart}
              onWaypointRotateStart={handleWaypointRotateStart}
              displaySettings={displaySettings}
            />
          ))}

          {/* 9b-bis. Group motion path: the keyframes were previously invisible,
              so a group could be animated but never seen or adjusted on the
              plan. Each dot is the GROUP PIVOT at that beat and is draggable,
              exactly like an actor or camera waypoint. */}
          {activeGroup && (activeGroup.path?.length ?? 0) > 0 && (() => {
            const path = [...(activeGroup.path || [])].sort((a, b) => a.beat - b.beat);
            const members = activeGroup.childIds
              .map((id) => activeSetup.elements.find((el) => el.id === id))
              .filter((el): el is FloorPlanElement => !!el);
            const basePivot = groupPivotOf(members);
            // The base pose is where the group sits before the first keyframe.
            const points = basePivot ? [basePivot, ...path] : path;
            return (
              <g className="group-motion-path">
                <polyline
                  points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth={1.5 / canvasScale}
                  strokeDasharray="6 4"
                  opacity={0.75}
                  className="pointer-events-none"
                />
                {basePivot && (
                  <circle
                    cx={basePivot.x}
                    cy={basePivot.y}
                    r={4 / canvasScale}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={1.5 / canvasScale}
                    className="pointer-events-none"
                  />
                )}
                {path.map((wp) => (
                  <g
                    key={wp.id}
                    transform={`translate(${wp.x}, ${wp.y})`}
                    className="cursor-grab active:cursor-grabbing"
                    onPointerDown={(e) => handleGroupWaypointDragStart(wp.id, e)}
                  >
                    <title>{`Group keyframe — beat ${wp.beat}, ${Math.round(wp.rotation ?? 0)}deg. Drag to move the whole group.`}</title>
                    {/* Touch-sized invisible grab area around the dot. */}
                    <circle r={16 / canvasScale} fill="transparent" />
                    <circle
                      r={8 / canvasScale}
                      fill={playback.currentBeat === wp.beat ? '#0ea5e9' : '#0f172a'}
                      stroke="#38bdf8"
                      strokeWidth={2 / canvasScale}
                    />
                    <text
                      y={3 / canvasScale}
                      textAnchor="middle"
                      fill="#e0f2fe"
                      fontSize={8 / canvasScale}
                      fontWeight="bold"
                      fontFamily="monospace"
                      className="pointer-events-none select-none"
                    >
                      {wp.beat}
                    </text>
                  </g>
                ))}
              </g>
            );
          })()}

          {/* 9c. Whole-group rotate handle: shown when the selection exactly
              matches one plan group; rotates every member around the pivot. */}
          {activeGroup && !dragState && (() => {
            const members = activeGroup.childIds
              .map((id) => renderedElements.find((el) => el.id === id))
              .filter((el): el is FloorPlanElement => !!el);
            const pivot = groupPivotOf(members);
            if (!pivot) return null;
            return (
              <g transform={`translate(${pivot.x}, ${pivot.y})`}>
                <title>Rotate whole group</title>
                <line x1={0} y1={0} x2={26} y2={-26} stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="3 3" className="pointer-events-none" />
                {/* Pivot marker only - NOT a rotate hit target. It sits on top
                    of the group's own contents, so making it grabbable turned
                    ordinary drags into accidental rotations. Rotation is the
                    offset knob below. */}
                <circle r={3} fill="#38bdf8" opacity={0.7} className="pointer-events-none" />
                {/* Offset rotate knob with a touch-sized transparent halo. */}
                <g transform="translate(30, -30)" onPointerDown={handleGroupRotateStart} className="cursor-grab">
                  <circle r={14} fill="transparent" />
                  <circle r={7} fill="#38bdf8" stroke="#0f172a" strokeWidth={2} className="drop-shadow-md" />
                </g>
              </g>
            );
          })()}

          {/* Gear-list locate flash: animated ring for every element kind
              that has no built-in highlight (actors/cameras render their own). */}
          {(() => {
            if (!highlightedElementId) return null;
            if (actors.some((a) => a.id === highlightedElementId)) return null;
            if (cameras.some((c) => c.id === highlightedElementId)) return null;
            const el = activeSetup.elements.find((e) => e.id === highlightedElementId);
            if (!el || el.visible === false) return null;
            const bounds = planElementBounds(el);
            const cx = (bounds.minX + bounds.maxX) / 2;
            const cy = (bounds.minY + bounds.maxY) / 2;
            const r = Math.max(18, Math.min(90, Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2 + 8));
            return (
              <g transform={`translate(${cx}, ${cy})`} className="pointer-events-none">
                <circle r={r} fill="none" stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="4 4" />
                <circle r={r} fill="none" stroke="#f59e0b" strokeWidth={2} className="animate-ping" />
              </g>
            );
          })()}

          {/* 9b. Storyboard Thumbnails (attached to their camera, draggable) */}
          {displaySettings.showStoryboardThumbs && (
          <StoryboardThumbLayer
            items={storyboardThumbs}
            canvasScale={canvasScale}
            aspectRatio={sceneAspectRatio}
            isInteractive={activeTool === 'select'}
            onDragThumb={handleDragStoryboardThumb}
            // Select only — going through handleElementSelect would also start a
            // camera move drag, which fought with the thumbnail's own drag.
            onSelectCamera={selectElement}
            onDoubleClickCamera={handleElementDoubleClick}
            onDropToCamera={handleDropBoardToCamera}
          />
          )}

          {/* 9c. Freehand annotation strokes (plan §6.2): above most content,
              below selection handles. Interactive in the editor: click to
              select, drag to move, rotate handle to pivot; highlighter =
              3× width, ~0.35 opacity. */}
          <FreehandStrokeLayer
            strokes={strokes}
            liveStroke={liveStroke}
            liveColor={freehandSettings.color}
            liveWidth={freehandSettings.strokeWidth}
            liveOpacity={freehandSettings.opacity}
            liveToolStyle={freehandSettings.toolStyle}
            onStrokePointerDown={handleStrokePointerDown}
            selectedStrokeIds={selectedElementIds}
          />

          {/* 9d. Callout annotations (plan §6.2): faint leader line from the
              target element to freely-movable text, above content so the
              callout always reads, below selection handles. */}
          <AnnotationLayer
            annotations={annotations}
            allElements={renderedElements}
            selectedIds={selectedElementIds}
            onSelect={handleElementSelect}
            onDoubleClick={handleElementDoubleClick}
            onUpdateText={handleUpdateElementText}
            isLight={isLightMode}
          />

          {calibratingBackgroundId && calibrationPoints.length > 0 && (
            <g className="pointer-events-none" aria-label="Scale calibration marks">
              {calibrationPoints.length === 2 && (
                <line
                  x1={calibrationPoints[0].x}
                  y1={calibrationPoints[0].y}
                  x2={calibrationPoints[1].x}
                  y2={calibrationPoints[1].y}
                  stroke="#f97316"
                  strokeWidth={3 / canvasScale}
                  strokeDasharray={`${8 / canvasScale} ${5 / canvasScale}`}
                />
              )}
              {calibrationPoints.map((point, index) => (
                <g key={`${point.x}-${point.y}-${index}`}>
                  <circle cx={point.x} cy={point.y} r={8 / canvasScale} fill="#fff7ed" stroke="#f97316" strokeWidth={3 / canvasScale} />
                  <text x={point.x} y={point.y + 3 / canvasScale} textAnchor="middle" fontSize={9 / canvasScale} fontWeight="bold" fill="#9a3412">
                    {index + 1}
                  </text>
                </g>
              ))}
            </g>
          )}

          {/* 10. Interactive Transform Handles (Rotation & Linear Endpoints) */}
          {selectedElement && (
            <TransformControls
              selectedElement={selectedElement}
              canvasScale={canvasScale}
              onRotateStart={handleRotateStart}
              onEndpointDragStart={handleEndpointDragStart}
              onResizeStart={handleResizeStart}
              onCurveDragStart={handleCurveDragStart}
              pixelsPerUnit={gridSettings.pixelsPerUnit}
              unit={gridSettings.unit}
            />
          )}

          {/* 11. Marquee Box Selection */}
          {boxSelection && (
            <rect
              x={Math.min(boxSelection.x1, boxSelection.x2)}
              y={Math.min(boxSelection.y1, boxSelection.y2)}
              width={Math.abs(boxSelection.x2 - boxSelection.x1)}
              height={Math.abs(boxSelection.y2 - boxSelection.y1)}
              fill="rgba(56, 189, 248, 0.12)"
              stroke="#38bdf8"
              strokeWidth={1 / canvasScale}
              strokeDasharray={`${4 / canvasScale} ${4 / canvasScale}`}
            />
          )}
        </g>
      </svg>

      {activeTool === 'stroke' && (
        <FreehandToolOptions
          settings={freehandSettings}
          isLight={isLightMode}
          onChange={setFreehandSettings}
        />
      )}

      {calibratingBackgroundId && (
        <section
          aria-label="Floor plan scale calibration"
          onPointerDown={(event) => event.stopPropagation()}
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-40 w-[min(680px,calc(100%-24px))] rounded-xl border shadow-2xl backdrop-blur-md p-3 ${
            isLightMode ? 'bg-white/95 border-orange-200 text-slate-800' : 'bg-slate-900/95 border-orange-700 text-slate-100'
          }`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[190px] flex-1">
              <div className="text-xs font-bold text-orange-500">Calibrate floor-plan scale</div>
              <p className="text-[11px] opacity-70 mt-0.5">
                {calibrationPoints.length === 0
                  ? 'Click the first end of a known scale line on the image.'
                  : calibrationPoints.length === 1
                    ? 'Click the other end of that same scale line.'
                    : 'Enter the real distance represented by the marked line.'}
              </p>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold">
              Distance
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={calibrationLength}
                onChange={(event) => setCalibrationLength(event.target.value)}
                className={`w-20 rounded-md border px-2 py-1.5 ${isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'}`}
              />
              <select
                aria-label="Calibration unit"
                value={calibrationUnit}
                onChange={(event) => setCalibrationUnit(event.target.value as 'm' | 'ft')}
                className={`rounded-md border px-2 py-1.5 ${isLightMode ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'}`}
              >
                <option value="m">metres</option>
                <option value="ft">feet</option>
              </select>
            </label>
            <button
              type="button"
              disabled={calibrationPoints.length !== 2}
              onClick={applyBackgroundCalibration}
              className="px-3 py-1.5 rounded-md bg-orange-500 hover:bg-orange-400 disabled:opacity-35 disabled:cursor-not-allowed text-slate-950 text-[11px] font-bold"
            >
              Apply scale
            </button>
            <button
              type="button"
              onClick={() => {
                setCalibrationPoints([]);
                setCalibrationError(null);
              }}
              className={`px-2 py-1.5 rounded-md text-[11px] font-semibold ${isLightMode ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}
            >
              Restart
            </button>
            <button
              type="button"
              onClick={cancelBackgroundCalibration}
              className={`px-2 py-1.5 rounded-md text-[11px] font-semibold ${isLightMode ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}
            >
              Cancel
            </button>
          </div>
          {calibrationError && <p className="text-[11px] text-red-500 font-semibold mt-2">{calibrationError}</p>}
        </section>
      )}

      {/* Floating Canvas Quick Controls (Zoom, Reset, Pan toggle) */}
      <div className="absolute bottom-5 right-5 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1.5 shadow-2xl z-20">
        <button
          id="btn-zoom-out"
          onClick={zoomOut}
          title="Zoom Out (Mouse Wheel Down or Ctrl -)"
          aria-label="Zoom out"
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          id="btn-zoom-reset"
          onClick={resetZoom}
          title="Reset Zoom & Pan"
          aria-label="Reset zoom and pan"
          className="px-2.5 py-1 text-xs font-mono text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          {Math.round(canvasScale * 100)}%
        </button>

        <button
          id="btn-zoom-in"
          onClick={zoomIn}
          title="Zoom In (Mouse Wheel Up or Ctrl +)"
          aria-label="Zoom in"
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-5 bg-slate-700 mx-1" />

        <button
          id="btn-pan-toggle"
          onClick={() => setTool(activeTool === 'pan' ? 'select' : 'pan')}
          title="Pan Mode (Hold Spacebar or Middle Click to Drag)"
          aria-label="Pan mode"
          aria-pressed={activeTool === 'pan'}
          className={`p-2 rounded-lg transition-colors ${
            activeTool === 'pan' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Move className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-5 bg-slate-700 mx-1" />

        <button
          id="btn-center-view"
          onClick={fitToContent}
          title="Center View (Fit Floor Plan to Screen)"
          aria-label="Centre the view on the floor plan"
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <Scan className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-5 bg-slate-700 mx-1" />

        {/* Viewing Grid Overlay Toggle */}
        {(() => {
          const isGridOn = (displaySettings.showGrid === true) || (activeSetup.gridSettings?.showGrid === true);
          return (
            <button
              id="btn-toggle-grid"
              onClick={() => {
                const next = !isGridOn;
                updateDisplaySettings({ showGrid: next });
                setGridSettings({ showGrid: next });
              }}
              title={`Toggle Viewing Grid Overlay (${isGridOn ? 'ON' : 'OFF'})`}
              aria-label="Viewing grid overlay"
              aria-pressed={isGridOn}
              className={`p-2 rounded-lg transition-colors ${
                isGridOn
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>
          );
        })()}
      </div>

      {/* Connected Wall Active Finish Bar */}
      {connectedWallStart && (
        <div className="absolute top-4 right-1/2 translate-x-1/2 bg-sky-950/95 border border-sky-500 text-sky-100 text-xs px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-3 z-30">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Click to add wall corner • Snaps to corners & 90°</span>
          <button
            onClick={finishConnectedWalls}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Finish (Enter)</span>
          </button>
          <button
            onClick={finishConnectedWalls}
            className="p-1 hover:bg-sky-900 rounded text-slate-400 hover:text-white"
            title="Cancel"
            aria-label="Finish the wall run"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Connected Cable Routing Finish Bar */}
      {connectedCableStart && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-sky-950/95 border border-sky-500 text-sky-100 text-xs px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-3 z-30">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Click to add cable corner • Double-click / Enter / Esc to finish</span>
          <button
            onClick={finishConnectedCable}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Finish (Enter)</span>
          </button>
          <button
            onClick={finishConnectedCable}
            className="p-1 hover:bg-sky-900 rounded text-slate-400 hover:text-white"
            title="Cancel"
            aria-label="Finish the cable run"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Active Tool Helper Pill */}
      {activeTool !== 'select' && !connectedWallStart && !connectedCableStart && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-sky-950/95 border border-sky-500/60 text-sky-200 text-xs px-4 py-2 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 pointer-events-none z-20">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
          <span>
            {activeTool === 'door' || activeTool === 'window' ? (
              <>Click on or near any <strong>Wall</strong> to attach {activeTool} (Esc to cancel)</>
            ) : activeTool === 'wall' ? (
              <>Click and drag to draw a wall, or click points to draw <strong>Connected Rooms</strong></>
            ) : activeTool === 'measure' ? (
              <><strong>Click and drag</strong> between two points to measure distance (Esc to cancel)</>
            ) : activeTool === 'arrow' ? (
              <><strong>Click and drag</strong> to draw an arrow (Esc to cancel)</>
            ) : activeTool === 'cable' ? (
              <>Click &amp; drag to start a cable run, then <strong>click to add corners</strong> (double-click / Enter to finish)</>
            ) : activeTool === 'stroke' ? (
              <><strong>Draw</strong> freehand annotations with mouse or stylus • two fingers still pinch/zoom (Esc to cancel)</>
            ) : (
              <>Click on canvas to place <strong>{activeTool.toUpperCase()}</strong> (Press Esc to cancel)</>
            )}
          </span>
        </div>
      )}

      {/* Keyboard Shortcuts Cheat Sheet (? toggles) */}
      {showShortcuts && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onPointerDown={() => setShowShortcuts(false)}
        >
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-slate-900 border border-slate-700 text-slate-200 rounded-2xl shadow-2xl p-5 select-none custom-scrollbar"
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-sky-500" />
                Keyboard Shortcuts
              </h3>
              <button
                onClick={() => setShowShortcuts(false)}
                title="Close"
                aria-label="Close the keyboard shortcuts list"
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-[11px]">
              {[
                {
                  group: 'Selection & Editing',
                  items: [
                    ['Del / Backspace', 'Delete selected elements (or reference image)'],
                    ['Shift + Click', 'Multi-select elements'],
                    ['Ctrl/Cmd + D', 'Duplicate selection'],
                    ['Ctrl/Cmd + C', 'Copy selected elements'],
                    ['Ctrl/Cmd + V', 'Paste copied elements'],
                    ['L / Ctrl+L', 'Lock / Unlock selected elements (prevent accidental moves)'],
                    ['Arrow Keys', 'Nudge selection (Shift = 10px)'],
                    ['Esc', 'Deselect / cancel current tool'],
                  ],
                },
                {
                  group: 'Drawing',
                  items: [
                    ['Enter', 'Finish connected wall chain'],
                    ['Esc', 'Cancel wall / measure drawing'],
                    ['Hold Shift', 'Snap rotation & angles to 45°'],
                    ['Hold Alt', 'Temporarily disable snap / grid magnets (fine placement)'],
                  ],
                },
                {
                  group: 'Canvas Navigation',
                  items: [
                    ['Hold Space / Middle-click', 'Pan the floor plan'],
                    ['Mouse Wheel', 'Zoom (cursor-centered)'],
                    ['Center View button', 'Fit & center the floor plan to screen'],
                    ['Ctrl/Cmd + Z', 'Undo'],
                    ['Ctrl/Cmd + Shift + Z / Ctrl+Y', 'Redo'],
                  ],
                },
                {
                  group: 'Other',
                  items: [
                    ['?', 'Toggle this cheat sheet'],
                    ['Delete key on selected image', 'Remove the active reference image'],
                  ],
                },
              ].map(({ group, items }) => (
                <div key={group}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-sky-500 mb-1">{group}</p>
                  <div className="space-y-1">
                    {items.map(([key, desc]) => (
                      <div key={key} className="flex items-center justify-between gap-3">
                        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-sky-300 whitespace-nowrap">
                          {key}
                        </kbd>
                        <span className="text-slate-400 text-right">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Element context menu (right-click / touch long-press, plan §6.3) */}
      {contextMenu && (
        <ElementContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
      )}

      {/* Tiny scale indicator pinned to the bottom-left corner (5 units at current zoom) */}
      <div className="absolute bottom-2.5 left-3 z-30 flex items-center gap-1.5 opacity-50 pointer-events-none select-none">
        <div className="flex items-center">
          <div className="w-px h-[6px] bg-slate-400" />
          <div
            className="h-[2px] bg-slate-400"
            style={{ width: Math.max(16, gridSettings.pixelsPerUnit * canvasScale * 5) }}
          />
          <div className="w-px h-[6px] bg-slate-400" />
        </div>
        <span className="text-[9px] leading-none font-mono text-slate-400">
          5{gridSettings.unit === 'm' ? 'm' : 'ft'}
        </span>
      </div>
    </div>
  );
};
