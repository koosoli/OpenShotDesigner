import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  ActorElement,
  CameraElement,
  DoorElement,
  FloorPlanElement,
  LightElement,
  PropElement,
  ShapeElement,
  Shot,
  TrackElement,
  Vector2D,
  WallElement,
  WindowElement,
} from '../../types';
import { findNearestWall, getAngleBetweenPoints, snapToGrid } from '../../utils/geometry';
import { ASPECT_RATIOS } from '../../constants/presets';
import { boardedFrames, setFramePatch, START_SLOT } from '../../utils/storyboardFrames';
import { ActorElementView } from './ActorElementView';
import { BackgroundLayer } from './BackgroundLayer';
import { CameraElementView } from './CameraElementView';
import { GridLayer } from './GridLayer';
import { LightingLayer } from './LightingLayer';
import { PropsLayer } from './PropsLayer';
import { ShapesLayer } from './ShapesLayer';
import { StoryboardThumbLayer } from './StoryboardThumbLayer';
import { ResizeHandle, TransformControls } from './TransformControls';
import { WallLayer } from './WallLayer';
import { Move, ZoomIn, ZoomOut, Check, X, Keyboard, Scan, Grid } from 'lucide-react';

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
    | 'waypoint'
    | 'waypoint_rotate';
  startMouse: Vector2D;
  startElements: Map<string, FloorPlanElement>;
  selectedIds: string[];
  activeElementId?: string;
  startOffset?: Vector2D;
  endpointType?: 'start' | 'end';
  handle?: ResizeHandle;
  waypointId?: string;
}

export const FloorPlanCanvas: React.FC = () => {
  const {
    activeSetup,
    selectedElementIds,
    selectedShotId,
    highlightedElementId,
    activeTool,
    activeShapeType,
    playback,
    theme,
    selectElement,
    selectElements,
    clearSelection,
    addElement,
    updateElement,
    updateShot,
    updateSetupMeta,
    updateMultipleElements,
    deleteSelectedElements,
    updateBackgroundImage,
    removeBackgroundImage,
    backgroundImages,
    selectedBackgroundId,
    setSelectedBackgroundId,
    undo,
    redo,
    setTool,
    setCanvasScale,
    setCanvasOffset,
    setCanvasTransform,
    zoomIn,
    zoomOut,
    resetZoom,
    openViewfinder,
    setActiveRightTab,
    displaySettings,
    updateDisplaySettings,
    setGridSettings,
    duplicateSelected,
    copySelectedElements,
    pasteElements,
    commitCurrentState,
    setCanvasViewport,
  } = useFloorPlan();

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

  // Continuous / Connected architectural wall drawing state
  const [connectedWallStart, setConnectedWallStart] = useState<Vector2D | null>(null);
  const [wallChainFirstPoint, setWallChainFirstPoint] = useState<Vector2D | null>(null);

  const canvasScale = activeSetup?.canvasScale ?? 1;
  const canvasOffset = activeSetup?.canvasOffset ?? { x: 50, y: 50 };
  const gridSettings = activeSetup?.gridSettings || { size: 30, snap: true, showGrid: false, unit: 'm' as const, pixelsPerUnit: 30 };

  const canvasScaleRef = useRef(canvasScale);
  const canvasOffsetRef = useRef(canvasOffset);
  canvasScaleRef.current = canvasScale;
  canvasOffsetRef.current = canvasOffset;

  // True when the current drag actually changed element positions (used to push
  // exactly ONE history entry on release, so Ctrl+Z undoes a whole gesture).
  const dragChangedRef = useRef(false);

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
      // element, a marquee) so the gesture is purely a viewport move.
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
  }, [setCanvasTransform]);

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
      const anyEl = el as any;
      if (typeof anyEl.x2 === 'number') {
        includePoint(anyEl.x2, anyEl.y2);
      }
      if (typeof anyEl.width === 'number' && typeof anyEl.height === 'number') {
        includePoint(el.x - anyEl.width / 2, el.y - anyEl.height / 2);
        includePoint(el.x + anyEl.width / 2, el.y + anyEl.height / 2);
      }
      if (Array.isArray(anyEl.path)) {
        anyEl.path.forEach((wp: any) => includePoint(wp.x, wp.y));
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

  // Segregate elements for wall snapping & SVG z-ordering
  const walls = activeSetup.elements.filter((e) => e.type === 'wall') as WallElement[];
  const doors = activeSetup.elements.filter((e) => e.type === 'door') as DoorElement[];
  const windows = activeSetup.elements.filter((e) => e.type === 'window') as WindowElement[];
  const lights = activeSetup.elements.filter((e) => e.type === 'light') as LightElement[];
  const propsList = activeSetup.elements.filter((e) => e.type === 'prop') as PropElement[];
  const tracks = activeSetup.elements.filter((e) => e.type === 'track') as TrackElement[];
  const actors = activeSetup.elements.filter((e) => e.type === 'actor') as ActorElement[];
  const cameras = activeSetup.elements.filter((e) => e.type === 'camera') as CameraElement[];

  // Which shot's info to show under a camera: the selected shot if it uses this
  // camera, else the camera's associated shot, else the first linked shot.
  const getShotForCamera = (camera: CameraElement): Shot | null => {
    if (selectedShotId) {
      const sel = activeSetup.shots.find((s) => s.id === selectedShotId && s.cameraId === camera.id);
      if (sel) return sel;
    }
    if (camera.associatedShotId) {
      const assoc = activeSetup.shots.find((s) => s.id === camera.associatedShotId);
      if (assoc) return assoc;
    }
    return activeSetup.shots.find((s) => s.cameraId === camera.id) || null;
  };
  const measurements = activeSetup.elements.filter((e) => e.type === 'measurement');
  const arrows = activeSetup.elements.filter((e) => e.type === 'arrow');
  const texts = activeSetup.elements.filter((e) => e.type === 'text');

  // Storyboard thumbnails: shots that have a storyboard attached, shown near
  // their camera on the floor plan.
  const sceneAspectRatio =
    ASPECT_RATIOS.find((a) => a.value === (activeSetup.aspectRatio || '16:9'))?.ratio || 16 / 9;
  const shapes = activeSetup.elements.filter((e) => e.type === 'shape') as ShapeElement[];
  const storyboardThumbs = cameras
    .map((c) => ({ camera: c, shot: getShotForCamera(c) }))
    .filter(
      (item): item is { camera: CameraElement; shot: Shot } =>
        !!item.shot && boardedFrames(item.shot, item.camera).length > 0
    );

  // Collect all wall corner vertices for magnetic snapping
  const wallVertices: Vector2D[] = [];
  walls.forEach((w) => {
    wallVertices.push({ x: w.x, y: w.y });
    wallVertices.push({ x: w.x2 ?? w.x + 200, y: w.y2 ?? w.y });
  });

  // Find nearest corner vertex
  const findNearestVertex = (pt: Vector2D, maxDist = 20): Vector2D | null => {
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
  };

  // Compute live wall snapping for door/window tools
  const nearestWallInfo =
    (activeTool === 'door' || activeTool === 'window') && hoverCanvasPos && walls.length > 0
      ? findNearestWall(hoverCanvasPos, walls, 60)
      : null;

  // Snapped current cursor position for drawing
  const getDrawingCursorPos = (rawPos: Vector2D): Vector2D => {
    const snapVertex = findNearestVertex(rawPos, 20);
    if (snapVertex) return snapVertex;

    let x = snapToGrid(rawPos.x, gridSettings.size, gridSettings.snap);
    let y = snapToGrid(rawPos.y, gridSettings.size, gridSettings.snap);

    // If connected wall is active, snap to 0°, 45°, 90°, 180° relative to start point
    if (connectedWallStart) {
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
  };

  // Finish connected wall mode
  const finishConnectedWalls = () => {
    setConnectedWallStart(null);
    setWallChainFirstPoint(null);
    setTool('select');
  };

  // Pointer Down on canvas background or elements
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current || isPinchingRef.current) return;

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

    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    const drawPos = getDrawingCursorPos(canvasPos);

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
      } as any);

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
      } as any);

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
      } as any);

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
  };

  // Double-click to open contextual inspector
  const handleElementDoubleClick = (id: string, e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    selectElement(id);
    setActiveRightTab('inspector');
  };

  // Element Select & Drag
  const handleElementSelect = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();

    // Double-clicking ANY element on the floor plan opens its inspector immediately
    if (e.detail >= 2) {
      selectElement(id);
      setActiveRightTab('inspector');
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

    if (activeTool === 'wall' || activeTool === 'measure' || activeTool === 'arrow' || (activeTool === 'shape' && activeShapeType === 'line')) {
      // Connect wall to clicked element / start measuring from clicked element
      handlePointerDown(e);
      return;
    }

    if (activeTool === 'pan' || isSpacePressed) return;

    let nextSelected = [...selectedElementIds];
    if (e.shiftKey) {
      if (nextSelected.includes(id)) {
        nextSelected = nextSelected.filter((i) => i !== id);
      } else {
        nextSelected.push(id);
      }
      selectElements(nextSelected);
    } else {
      if (!nextSelected.includes(id)) {
        nextSelected = [id];
        selectElement(id);
      }
    }

    const startElementsMap = new Map<string, FloorPlanElement>();
    activeSetup.elements.forEach((el) => {
      if (nextSelected.includes(el.id) || el.id === id) {
        startElementsMap.set(el.id, JSON.parse(JSON.stringify(el)));
      }
    });

    setDragState({
      type: 'move',
      startMouse: { x: e.clientX, y: e.clientY },
      startElements: startElementsMap,
      selectedIds: nextSelected,
      activeElementId: id,
    });
  };

  // Rotate handle start
  const handleRotateStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (selectedElementIds.length === 0) return;

    const activeId = selectedElementIds[0];
    const el = activeSetup.elements.find((e) => e.id === activeId);
    if (!el) return;

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

  // Endpoint drag start for walls/tracks/rulers
  const handleEndpointDragStart = (endpoint: 'start' | 'end', e: React.PointerEvent) => {
    e.stopPropagation();
    if (selectedElementIds.length === 0) return;

    const activeId = selectedElementIds[0];
    const el = activeSetup.elements.find((e) => e.id === activeId);
    if (!el) return;

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

  // 2D Shape & Prop Resize drag start
  const handleResizeStart = (handle: ResizeHandle, e: React.PointerEvent) => {
    e.stopPropagation();
    if (selectedElementIds.length === 0) return;

    const activeId = selectedElementIds[0];
    const el = activeSetup.elements.find((e2) => e2.id === activeId);
    if (!el) return;

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
      id: `wp-${Date.now()}`,
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
      id: `wp-${Date.now()}`,
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

  // Pointer Move
  const handlePointerMove = (e: React.PointerEvent) => {
    const mouseCanvas = screenToCanvas(e.clientX, e.clientY);
    setHoverCanvasPos(mouseCanvas);

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
        .filter((el) => el.x >= minX && el.x <= maxX && el.y >= minY && el.y <= maxY)
        .map((el) => el.id);

      selectElements(insideIds);
      return;
    }

    if (dragState.type === 'move') {
      const deltaScreenX = e.clientX - dragState.startMouse.x;
      const deltaScreenY = e.clientY - dragState.startMouse.y;

      const deltaCanvasX = deltaScreenX / canvasScale;
      const deltaCanvasY = deltaScreenY / canvasScale;

      const updates: { id: string; updates: Partial<FloorPlanElement> }[] = [];

      dragState.startElements.forEach((origEl, id) => {
        let nextX = origEl.x + deltaCanvasX;
        let nextY = origEl.y + deltaCanvasY;
        let nextRotation = origEl.rotation;

        if ((origEl.type === 'door' || origEl.type === 'window') && dragState.startElements.size === 1 && walls.length > 0) {
          const snapMatch = findNearestWall({ x: nextX, y: nextY }, walls, 50);
          if (snapMatch) {
            nextX = snapMatch.point.x;
            nextY = snapMatch.point.y;
            nextRotation = snapMatch.angle;
          } else if (gridSettings.snap) {
            nextX = snapToGrid(nextX, gridSettings.size, true);
            nextY = snapToGrid(nextY, gridSettings.size, true);
          }
        } else if (gridSettings.snap) {
          nextX = snapToGrid(nextX, gridSettings.size, true);
          nextY = snapToGrid(nextY, gridSettings.size, true);
        }

        const dx = nextX - origEl.x;
        const dy = nextY - origEl.y;

        const updateObj: Partial<FloorPlanElement> = {
          x: nextX,
          y: nextY,
          rotation: nextRotation,
        };

        if ('x2' in origEl && typeof (origEl as any).x2 === 'number') {
          (updateObj as any).x2 = (origEl as any).x2 + dx;
          (updateObj as any).y2 = (origEl as any).y2 + dy;
        }

        if ('path' in origEl && Array.isArray((origEl as any).path)) {
          (updateObj as any).path = (origEl as any).path.map((wp: any) => ({
            ...wp,
            x: wp.x + dx,
            y: wp.y + dy,
          }));
        }

        updates.push({ id, updates: updateObj });
      });

      dragChangedRef.current = true;
      updateMultipleElements(updates, false);
      return;
    }

    if (dragState.type === 'rotate' && dragState.activeElementId) {
      const origEl = dragState.startElements.get(dragState.activeElementId);
      if (!origEl) return;

      let angle = getAngleBetweenPoints({ x: origEl.x, y: origEl.y }, mouseCanvas);

      if (e.shiftKey) {
        angle = Math.round(angle / 45) * 45;
      } else {
        angle = Math.round(angle / 5) * 5;
      }

      dragChangedRef.current = true;
      updateElement(dragState.activeElementId, { rotation: (angle + 360) % 360 }, false);
      return;
    }

    if (
      (dragState.type === 'endpoint_start' ||
        dragState.type === 'endpoint_end' ||
        dragState.type === 'draw_wall' ||
        dragState.type === 'draw_measure' ||
        dragState.type === 'draw_arrow') &&
      dragState.activeElementId
    ) {
      const drawPos = getDrawingCursorPos(mouseCanvas);
      const orig = dragState.startElements.get(dragState.activeElementId);

      // Line basic shape endpoint drag
      if (orig && orig.type === 'shape' && (orig as any).shapeType === 'line') {
        const shape = orig as any;
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
          } as any,
          false
        );
        return;
      }

      if (dragState.type === 'endpoint_start') {
        dragChangedRef.current = true;
        updateElement(dragState.activeElementId, { x: drawPos.x, y: drawPos.y }, false);
      } else {
        dragChangedRef.current = true;
        updateElement(dragState.activeElementId, { x2: drawPos.x, y2: drawPos.y } as any, false);
      }
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

      const origW = (orig as any).width || 80;
      const origH = (orig as any).height || 60;

      let newW = origW;
      let newH = origH;
      let centerShiftX = 0;
      let centerShiftY = 0;

      const handle = dragState.handle;
      if (handle.includes('e')) {
        newW = Math.max(15, origW + localDx);
        centerShiftX = (newW - origW) / 2;
      }
      if (handle.includes('w')) {
        newW = Math.max(15, origW - localDx);
        centerShiftX = -(newW - origW) / 2;
      }
      if (handle.includes('s')) {
        newH = Math.max(15, origH + localDy);
        centerShiftY = (newH - origH) / 2;
      }
      if (handle.includes('n')) {
        newH = Math.max(15, origH - localDy);
        centerShiftY = -(newH - origH) / 2;
      }

      if ((orig as any).shapeType === 'circle') {
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
        } as any,
        false
      );
      return;
    }

    // Drag an actor / camera movement waypoint directly on the canvas
    if (dragState.type === 'waypoint' && dragState.activeElementId && dragState.waypointId) {
      const el = activeSetup.elements.find((e2) => e2.id === dragState.activeElementId);
      if (el && 'path' in el && Array.isArray((el as any).path)) {
        let nextX = mouseCanvas.x;
        let nextY = mouseCanvas.y;
        if (gridSettings.snap) {
          nextX = snapToGrid(nextX, gridSettings.size, true);
          nextY = snapToGrid(nextY, gridSettings.size, true);
        }
        const newPath = (el as any).path.map((wp: any) =>
          wp.id === dragState.waypointId ? { ...wp, x: nextX, y: nextY } : wp
        );
        dragChangedRef.current = true;
        updateElement(dragState.activeElementId, { path: newPath } as any, false);
      }
      return;
    }

    // Rotate a waypoint's facing direction on the canvas
    if (dragState.type === 'waypoint_rotate' && dragState.activeElementId && dragState.waypointId) {
      const el = activeSetup.elements.find((e2) => e2.id === dragState.activeElementId);
      if (el && 'path' in el && Array.isArray((el as any).path)) {
        const wp = (el as any).path.find((w: any) => w.id === dragState.waypointId);
        if (wp) {
          let angle = getAngleBetweenPoints({ x: wp.x, y: wp.y }, mouseCanvas);
          if (e.shiftKey) {
            angle = Math.round(angle / 45) * 45;
          } else {
            angle = Math.round(angle / 5) * 5;
          }
          const newPath = (el as any).path.map((w: any) =>
            w.id === dragState.waypointId ? { ...w, rotation: (angle + 360) % 360 } : w
          );
          dragChangedRef.current = true;
          updateElement(dragState.activeElementId, { path: newPath } as any, false);
        }
      }
      return;
    }
  };

  // Pointer Up
  const handlePointerUp = () => {
    if (dragState?.type === 'draw_measure') {
      // Finish measuring: if the tape is a zero-length click, give it a sensible default length
      const el = activeSetup.elements.find((e) => e.id === dragState.activeElementId);
      if (el && 'x2' in el) {
        const length = Math.hypot((el as any).x2 - el.x, (el as any).y2 - el.y);
        if (length < 5) {
          updateElement(el.id, { x2: el.x + 150, y2: el.y } as any, false);
        }
      }
      setTool('select');
    }
    if (dragState?.type === 'draw_arrow') {
      // Finish arrow: a zero-length click gets a sensible default 150px arrow to the right
      const el = activeSetup.elements.find((e) => e.id === dragState.activeElementId);
      if (el && 'x2' in el) {
        const length = Math.hypot((el as any).x2 - el.x, (el as any).y2 - el.y);
        if (length < 5) {
          updateElement(el.id, { x2: el.x + 150, y2: el.y } as any, false);
        }
      }
      setTool('select');
    }
    if (dragState?.type === 'draw_wall') {
      // If user dragged a significant wall length, finish wall; if clicked in place, leave connected wall mode active
      const el = activeSetup.elements.find((e) => e.id === dragState.activeElementId);
      if (el && 'x2' in el && typeof (el as any).x2 === 'number') {
        const length = Math.hypot((el as any).x2 - el.x, (el as any).y2 - el.y);
        if (length > 20) {
          // Keep connected wall point at endpoint so user can continue chaining
          setConnectedWallStart({ x: (el as any).x2, y: (el as any).y2 });
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
      ['move', 'rotate', 'endpoint_start', 'endpoint_end', 'waypoint', 'waypoint_rotate'].includes(dragState.type)
    ) {
      commitCurrentState();
    }
    dragChangedRef.current = false;
    setDragState(null);
    setBoxSelection(null);
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
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
        return;
      }

      // Holding Ctrl+Z (or C/V/D/Y) auto-repeats keydown events; ignore repeats
      // so a single physical press only ever triggers ONE undo/redo/copy/paste.
      if (e.repeat && ['z', 'y', 'c', 'v', 'd'].includes(e.key)) {
        return;
      }

      if (e.code === 'Space') {
        setIsSpacePressed(true);
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
        clearSelection();
        finishConnectedWalls();
        setShowShortcuts(false);
      }

      if (e.key === 'Enter') {
        finishConnectedWalls();
      }

      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        duplicateSelected();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        e.preventDefault();
        copySelectedElements();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        e.preventDefault();
        pasteElements();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }

      // Nudge with arrow keys
      if (selectedElementIds.length > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 2;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

        const updates = selectedElementIds
          .map((id) => {
            const el = activeSetup.elements.find((e) => e.id === id);
            if (!el) return null;
            const hasX2 = 'x2' in el && typeof (el as any).x2 === 'number';
            const linearUpdates = hasX2
              ? { x2: (el as any).x2 + dx, y2: (el as any).y2 + dy }
              : {};
            return {
              id,
              updates: {
                x: el.x + dx,
                y: el.y + dy,
                ...linearUpdates,
              },
            };
          })
          .filter(Boolean) as { id: string; updates: Partial<FloorPlanElement> }[];

        updateMultipleElements(updates, true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedElementIds, deleteSelectedElements, clearSelection, undo, redo, activeSetup.elements, updateMultipleElements, setTool, selectedBackgroundId, removeBackgroundImage, setSelectedBackgroundId, duplicateSelected, copySelectedElements, pasteElements]);

  const selectedElement =
    selectedElementIds.length === 1
      ? activeSetup.elements.find((e) => e.id === selectedElementIds[0])
      : null;

  const isLightMode = theme === 'light';

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
      onPointerUp={handlePointerUp}
      onDoubleClick={finishConnectedWalls}
    >
      <svg
        ref={svgRef}
        id="floor-plan-svg"
        className="w-full h-full block"
      >
        {/* Transform layer for Canvas scale and Pan offset */}
        <g transform={`translate(${canvasOffset.x}, ${canvasOffset.y}) scale(${canvasScale})`}>
          {/* 1. Vector Grid & Axes */}
          <GridLayer
            gridSettings={gridSettings}
            visible={(displaySettings.showGrid === true) || (gridSettings.showGrid === true)}
            dark={!isLightMode}
          />

          {/* 2. Scalable Reference Blueprint / Screenshot Layers (multiple supported) */}
          <BackgroundLayer
            backgroundImages={backgroundImages}
            canvasScale={canvasScale}
            selectedBackgroundId={selectedBackgroundId}
            isInteractive={activeTool === 'select'}
            onSelectImage={(id) => {
              clearSelection();
              setSelectedBackgroundId(id);
              setActiveRightTab('inspector');
            }}
            onUpdate={updateBackgroundImage}
            onDelete={removeBackgroundImage}
            onDropToCamera={(image, center) => {
              const target = cameras
                .map((camera) => ({ camera, distance: Math.hypot(camera.x - center.x, camera.y - center.y) }))
                .sort((a, b) => a.distance - b.distance)[0];
              if (!target || target.distance > 110) return;
              const shot = getShotForCamera(target.camera);
              if (shot) updateShot(shot.id, { storyboardImage: image.url, storyboardFit: 'cover' });
            }}
          />

          {/* 3. Props, Furniture, Rigs, Tracks, Measurements */}
          <ShapesLayer
            shapes={shapes}
            selectedIds={selectedElementIds}
            onSelect={handleElementSelect}
            onDoubleClick={handleElementDoubleClick}
            canvasScale={canvasScale}
          />

          <PropsLayer
            propsList={propsList}
            tracks={tracks}
            measurements={measurements as any}
            arrows={arrows as any}
            texts={texts as any}
            selectedIds={selectedElementIds}
            onSelect={handleElementSelect}
            onDoubleClick={handleElementDoubleClick}
            onUpdateText={(id, newText) => updateElement(id, { text: newText } as any)}
            pixelsPerUnit={gridSettings.pixelsPerUnit}
            displaySettings={displaySettings}
          />

          {/* 4. Lighting Beams & Fixtures */}
          <LightingLayer
            lights={lights}
            selectedIds={selectedElementIds}
            onSelect={handleElementSelect}
            onDoubleClick={handleElementDoubleClick}
            displaySettings={displaySettings}
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

          {/* 9b. Storyboard Thumbnails (attached to their camera, draggable) */}
          {displaySettings.showStoryboardThumbs && (
          <StoryboardThumbLayer
            items={storyboardThumbs}
            canvasScale={canvasScale}
            aspectRatio={sceneAspectRatio}
            isInteractive={activeTool === 'select'}
            onDragThumb={(shotId, slotKey, pos) => {
              const shot = activeSetup.shots.find((item) => item.id === shotId);
              if (shot) updateShot(shotId, setFramePatch(shot, slotKey, { canvasPosition: pos }));
            }}
            // Select only — going through handleElementSelect would also start a
            // camera move drag, which fought with the thumbnail's own drag.
            onSelectCamera={(camId) => selectElement(camId)}
            onDoubleClickCamera={handleElementDoubleClick}
            onDropToCamera={(sourceShot, center) => {
              const target = cameras
                .map((camera) => ({ camera, distance: Math.hypot(camera.x - center.x, camera.y - center.y) }))
                .sort((a, b) => a.distance - b.distance)[0];
              if (!target || target.distance > 110) return;
              const targetShot = getShotForCamera(target.camera);
              if (targetShot && targetShot.id !== sourceShot.id && sourceShot.storyboardImage) {
                updateShot(
                  targetShot.id,
                  setFramePatch(targetShot, START_SLOT, {
                    image: sourceShot.storyboardImage,
                    fit: sourceShot.storyboardFit || 'cover',
                  })
                );
              }
            }}
          />
          )}

          {/* 10. Interactive Transform Handles (Rotation & Linear Endpoints) */}
          {selectedElement && (
            <TransformControls
              selectedElement={selectedElement}
              canvasScale={canvasScale}
              onRotateStart={handleRotateStart}
              onEndpointDragStart={handleEndpointDragStart}
              onResizeStart={handleResizeStart}
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

      {/* Floating Canvas Quick Controls (Zoom, Reset, Pan toggle) */}
      <div className="absolute bottom-5 right-5 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1.5 shadow-2xl z-20">
        <button
          id="btn-zoom-out"
          onClick={zoomOut}
          title="Zoom Out (Mouse Wheel Down or Ctrl -)"
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          id="btn-zoom-reset"
          onClick={resetZoom}
          title="Reset Zoom & Pan"
          className="px-2.5 py-1 text-xs font-mono text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          {Math.round(canvasScale * 100)}%
        </button>

        <button
          id="btn-zoom-in"
          onClick={zoomIn}
          title="Zoom In (Mouse Wheel Up or Ctrl +)"
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="w-[1px] h-5 bg-slate-700 mx-1" />

        <button
          id="btn-pan-toggle"
          onClick={() => setTool(activeTool === 'pan' ? 'select' : 'pan')}
          title="Pan Mode (Hold Spacebar or Middle Click to Drag)"
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
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Active Tool Helper Pill */}
      {activeTool !== 'select' && !connectedWallStart && (
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
