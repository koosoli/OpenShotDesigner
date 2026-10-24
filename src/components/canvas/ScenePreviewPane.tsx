/**
 * A scene in split-screen mode that is not the one being edited right now.
 *
 * The pane draws the scene's plan with the same layers the canvas uses, at
 * the pan and zoom stored on the scene — the same view the editable canvas
 * uses — so when a press on the pane makes it the scene being edited
 * (SplitCanvasArea puts the canvas in its place) nothing moves. The press is
 * handed on: pressing an object and dragging moves it straight away.
 *
 * The wheel pans and zooms the pane without making it editable. The canvas
 * finds the pane as a drop target through `scenePaneDrop`.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
import { setSetupViewCommand } from '../../domain/commands';
import { elementsBounds, padBounds } from '../../domain/plan/elementBounds';
import { canRaiseAboveWalls } from '../../domain/plan/stacking';
import type {
  ActorElement,
  AnnotationElement,
  ArrowElement,
  CableElement,
  CameraElement,
  DoorElement,
  FloorPlanElement,
  IdentifiedBackgroundImage,
  LightElement,
  MeasurementElement,
  PropElement,
  RoadElement,
  ShapeElement,
  StrokeElement,
  TextElement,
  TrackElement,
  Vector2D,
  WallElement,
  WindowElement,
} from '../../types';
import { wheelIntent } from '../../utils/wheelIntent';
import { ActorElementView } from './ActorElementView';
import { AnnotationLayer } from './AnnotationLayer';
import { BackgroundLayer } from './BackgroundLayer';
import { CableLayer } from './CableLayer';
import { CameraElementView } from './CameraElementView';
import { FreehandStrokeLayer } from './FreehandStrokeLayer';
import { LightingLayer } from './LightingLayer';
import { PropsLayer } from './PropsLayer';
import { RoadLayer } from './RoadLayer';
import { ShapesLayer } from './ShapesLayer';
import { WallLayer } from './WallLayer';
import { scenePaneAttributes } from './scenePaneDrop';

const NOOP = () => {};
const NO_IDS: string[] = [];
const NO_ELEMENTS: FloorPlanElement[] = [];

/** A press on a pane, handed to the canvas that takes the pane's place. */
export interface PanePress {
  elementId: string;
  clientX: number;
  clientY: number;
  pointerId: number;
  pointerType: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** The view that fits `elements` into a box of `width` × `height` pixels. */
export const fitView = (elements: readonly FloorPlanElement[], width: number, height: number): { scale: number; offset: Vector2D } => {
  const bounds = elementsBounds(elements, { markerHalfExtent: 20 });
  if (!bounds) return { scale: 0.6, offset: { x: width / 2, y: height / 2 } };
  const padded = padBounds(bounds, 40);
  const contentWidth = Math.max(padded.maxX - padded.minX, 1);
  const contentHeight = Math.max(padded.maxY - padded.minY, 1);
  const scale = Math.max(0.15, Math.min(1.5, Math.min(width / contentWidth, height / contentHeight)));
  return {
    scale,
    offset: {
      x: width / 2 - ((padded.minX + padded.maxX) / 2) * scale,
      y: height / 2 - ((padded.minY + padded.maxY) / 2) * scale,
    },
  };
};

interface ScenePreviewPaneProps {
  setupId: string;
  /** Make this the scene being edited; `press` is the object pressed, if any. */
  onActivate: (press: PanePress | null) => void;
  /** Fit the plan into the pane once (a scene was just put here). */
  fitRequested?: boolean;
  onFitted?: () => void;
}

export const ScenePreviewPane: React.FC<ScenePreviewPaneProps> = ({ setupId, onActivate, fitRequested = false, onFitted }) => {
  const { project, displaySettings, runCommand } = useFloorPlan();
  const { theme } = useWorkspaceUI();
  const isLight = theme === 'light';
  const setup = project.setups.find((candidate) => candidate.id === setupId) ?? null;

  const containerRef = useRef<HTMLDivElement>(null);
  const view = useMemo(
    () => ({ scale: setup?.canvasScale || 1, offset: setup?.canvasOffset ?? { x: 0, y: 0 } }),
    [setup?.canvasScale, setup?.canvasOffset],
  );
  const viewRef = useRef(view);
  viewRef.current = view;
  const setView = (next: { scale: number; offset: Vector2D }) => {
    viewRef.current = next;
    runCommand(setSetupViewCommand, { setupId, scale: next.scale, offset: next.offset }, { record: false });
  };
  const setViewRef = useRef(setView);
  setViewRef.current = setView;
  const pressedElementRef = useRef(false);
  const [dropHover, setDropHover] = useState(false);

  const elements = useMemo(() => {
    if (!setup) return NO_ELEMENTS;
    const hiddenLayers = new Set((setup.layers ?? []).filter((layer) => !layer.visible).map((layer) => layer.id));
    return setup.elements.filter((element) => !element.layerId || !hiddenLayers.has(element.layerId));
  }, [setup]);

  const byType = useMemo(() => {
    const buckets: Record<string, FloorPlanElement[]> = {};
    for (const element of elements) {
      const key = element.aboveWalls && canRaiseAboveWalls(element) ? `above:${element.type}` : element.type;
      (buckets[key] ??= []).push(element);
    }
    return buckets;
  }, [elements]);
  const ofType = <T extends FloorPlanElement>(type: string): T[] => (byType[type] ?? NO_ELEMENTS) as T[];
  const raised = <T extends FloorPlanElement>(type: string): T[] => ofType<T>(`above:${type}`);

  const backgroundImages = useMemo(
    () => (setup?.backgroundImages ?? []).filter((image): image is IdentifiedBackgroundImage => !!image.id),
    [setup?.backgroundImages],
  );

  useEffect(() => {
    if (!fitRequested) return;
    const frame = requestAnimationFrame(() => {
      const box = containerRef.current?.getBoundingClientRect();
      if (box && box.width > 0 && box.height > 0) setViewRef.current(fitView(elements, box.width, box.height));
      onFitted?.();
    });
    return () => cancelAnimationFrame(frame);
    // Once per request; the elements are read as they are then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequested]);

  // Wheel: the same reading of mouse wheels, touchpad scrolls and pinches as
  // the canvas (utils/wheelIntent), on this pane's scene.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { scale, offset } = viewRef.current;
      const intent = wheelIntent(event);
      if (intent.kind === 'pan') {
        setViewRef.current({ scale, offset: { x: offset.x - intent.dx, y: offset.y - intent.dy } });
        return;
      }
      const rect = node.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const next = Math.max(0.15, Math.min(4, scale * intent.factor));
      const worldX = (mouseX - offset.x) / scale;
      const worldY = (mouseY - offset.y) / scale;
      setViewRef.current({ scale: next, offset: { x: mouseX - worldX * next, y: mouseY - worldY * next } });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  // Every layer reports a press on an object through `onSelect`, which runs
  // before the pane's own pointerdown.
  const pressElement = useMemo(
    () => (id: string, event: React.PointerEvent) => {
      if (event.button !== 0) return;
      pressedElementRef.current = true;
      onActivate({
        elementId: id,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      });
    },
    [onActivate],
  );

  const shotFor = (camera: CameraElement) =>
    setup?.shots.find((shot) => shot.id === camera.associatedShotId) ??
    setup?.shots.find((shot) => shot.cameraId === camera.id) ??
    null;

  if (!setup) return null;
  const layerBase = { selectedIds: NO_IDS, onSelect: pressElement, displaySettings };
  const pixelsPerUnit = setup.gridSettings?.pixelsPerUnit;

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 select-none touch-none cursor-pointer ${isLight ? 'bg-slate-100' : 'bg-slate-950'} ${
        dropHover ? 'ring-2 ring-inset ring-accent' : ''
      }`}
      data-testid="scene-preview-pane"
      onPointerDown={(event) => {
        if (pressedElementRef.current) {
          pressedElementRef.current = false;
          return;
        }
        if (event.button === 0) onActivate(null);
      }}
      // A drag coming in from the canvas: show where it lands.
      onPointerEnter={(event) => setDropHover((event.buttons & 1) !== 0)}
      onPointerLeave={() => setDropHover(false)}
      onPointerUpCapture={() => setDropHover(false)}
    >
      <svg
        className="w-full h-full block"
        role="img"
        aria-label={`Floor plan of ${setup.name} — press to edit`}
        {...scenePaneAttributes(setupId, view.scale, view.offset)}
      >
        <g transform={`translate(${view.offset.x}, ${view.offset.y}) scale(${view.scale})`}>
          <BackgroundLayer
            backgroundImages={backgroundImages}
            canvasScale={view.scale}
            selectedBackgroundId={null}
            isInteractive={false}
            onSelectImage={NOOP}
            onUpdate={NOOP}
            onDelete={NOOP}
          />
          <ShapesLayer shapes={ofType<ShapeElement>('shape')} {...layerBase} canvasScale={view.scale} />
          <RoadLayer roads={ofType<RoadElement>('road')} {...layerBase} />
          <PropsLayer
            propsList={ofType<PropElement>('prop')}
            tracks={ofType<TrackElement>('track')}
            measurements={ofType<MeasurementElement>('measurement')}
            arrows={ofType<ArrowElement>('arrow')}
            texts={ofType<TextElement>('text')}
            {...layerBase}
            pixelsPerUnit={pixelsPerUnit}
          />
          <CableLayer cables={ofType<CableElement>('cable')} allElements={setup.elements} {...layerBase} pixelsPerUnit={pixelsPerUnit} />
          <LightingLayer lights={ofType<LightElement>('light')} {...layerBase} gridSettings={setup.gridSettings} />
          <WallLayer
            walls={ofType<WallElement>('wall')}
            doors={ofType<DoorElement>('door')}
            windows={ofType<WindowElement>('window')}
            selectedIds={NO_IDS}
            onSelect={pressElement}
            showLightBeams={displaySettings.showLightBeams}
            showDoorWindowLabels={displaySettings.showDoorWindowLabels}
            categoryOpacity={displaySettings.categoryOpacity}
            labelOpacity={(displaySettings.labelOpacity ?? 1) * (displaySettings.labelCategoryOpacity?.doorWindows ?? 1)}
            labelColor={displaySettings.doorWindowLabelColor}
          />
          <ShapesLayer shapes={raised<ShapeElement>('shape')} {...layerBase} canvasScale={view.scale} />
          <PropsLayer
            propsList={raised<PropElement>('prop')}
            tracks={raised<TrackElement>('track')}
            measurements={raised<MeasurementElement>('measurement')}
            arrows={raised<ArrowElement>('arrow')}
            texts={raised<TextElement>('text')}
            {...layerBase}
            pixelsPerUnit={pixelsPerUnit}
          />
          <CableLayer cables={raised<CableElement>('cable')} allElements={setup.elements} {...layerBase} pixelsPerUnit={pixelsPerUnit} />
          <LightingLayer lights={raised<LightElement>('light')} {...layerBase} gridSettings={setup.gridSettings} />
          {ofType<ActorElement>('actor').map((actor) => (
            <ActorElementView
              key={actor.id}
              actor={actor}
              isSelected={false}
              isHighlighted={false}
              currentBeat={0}
              isPlaying={false}
              onSelect={pressElement}
              displaySettings={displaySettings}
            />
          ))}
          {ofType<CameraElement>('camera').map((camera) => (
            <CameraElementView
              key={camera.id}
              camera={camera}
              shot={shotFor(camera)}
              isSelected={false}
              isHighlighted={false}
              currentBeat={0}
              isPlaying={false}
              onSelect={pressElement}
              displaySettings={displaySettings}
            />
          ))}
          <FreehandStrokeLayer strokes={ofType<StrokeElement>('stroke')} selectedStrokeIds={NO_IDS} />
          <AnnotationLayer
            annotations={ofType<AnnotationElement>('annotation')}
            allElements={elements}
            selectedIds={NO_IDS}
            onSelect={pressElement}
            isLight={isLight}
          />
        </g>
      </svg>
      {elements.length === 0 && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-slate-500">
          Nothing on this plan yet — click to draw here, or drag objects in from another scene.
        </p>
      )}
    </div>
  );
};
