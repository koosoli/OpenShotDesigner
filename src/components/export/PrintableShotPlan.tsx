import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  ActorElement,
  ArrowElement,
  BackgroundImage,
  CableElement,
  CameraElement,
  DoorElement,
  LightElement,
  MeasurementElement,
  PropElement,
  ShapeElement,
  StrokeElement,
  TextElement,
  RoadElement,
  TrackElement,
  WallElement,
  WindowElement,
} from '../../types';
import { ASPECT_RATIOS } from '../../constants/presets';
import { exportProjectToCsv, exportShotListToCsv } from '../../utils/exportShotList';
import { exportSvgAsPng } from '../../utils/exportFloorPlanPng';
import { waitForImages } from '../../utils/image';
import { ShapesLayer } from '../canvas/ShapesLayer';
import { FreehandStrokeLayer } from '../canvas/FreehandStrokeLayer';
import { ActorElementView } from '../canvas/ActorElementView';
import { CameraElementView } from '../canvas/CameraElementView';
import { LightingLayer } from '../canvas/LightingLayer';
import { PropsLayer } from '../canvas/PropsLayer';
import { CableLayer } from '../canvas/CableLayer';
import { RoadLayer } from '../canvas/RoadLayer';
import { WallLayer } from '../canvas/WallLayer';
import { StoryboardThumbLayer } from '../canvas/StoryboardThumbLayer';
import { LinedScriptPage, linedExcerpt } from '../script/LinedScriptPage';
import { TitlePageView } from '../script/TitlePageView';
import { AvScriptPrintView } from '../reports/AvScriptPrintView';
import { hasTitlePageContent } from '../../domain/script';
import { orderedStoryboardShots } from '../../utils/storyboardOrder';
import { slotsOf, boardedFrames, visibleStoryboardSlots } from '../../utils/storyboardFrames';
import { effectiveMovement } from '../../utils/cameraMovement';
import { exportEquipmentToCsv } from '../../utils/exportEquipmentCsv';
import {
  deriveSceneEquipment,
  deriveAllScenesEquipment,
  EQUIPMENT_CATEGORIES,
} from '../../utils/equipmentList';
import { Shot } from '../../types';
import {
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Minus,
  Plus,
  Printer,
  Sparkles,
  Sun,
  User,
  X,
} from 'lucide-react';
import type { DisplaySettings } from '../../context/FloorPlanContext';
import { elementsBounds, padBounds, selectPrintablePlanElements } from '../../domain/plan';
import { describeSceneUsage, isMasterEquipmentItem } from '../../domain/equipment';
import { MoodboardPrintView } from '../reports/MoodboardPrintView';
import { ContactListPrintView } from '../reports/ContactListPrintView';
import { ScriptReportsPrintView } from '../reports/ScriptReportsPrintView';
import { DmxPatchPrintView } from '../reports/DmxPatchPrintView';
import { collectFixturePatches, findConflicts, sortedPatchRows } from '../../utils/dmxPatch';
import { deriveCharacterReport, deriveDood } from '../../domain/reports';
import { ScriptSidesPrintView } from '../reports/ScriptSidesPrintView';
import { StripboardPrintView } from '../reports/StripboardPrintView';
import { PowerPrintView, buildPowerPrintModel } from '../reports/PowerPrintView';
import { RiggingPrintView, buildRiggingPrintModel } from '../reports/RiggingPrintView';
import { LogisticsPrintView, buildLogisticsPrintModel } from '../reports/LogisticsPrintView';
import { ContinuityPrintView, buildContinuityPrintModel } from '../reports/ContinuityPrintView';
import {
  CameraReportPrintView,
  SoundReportPrintView,
  buildCameraReportPrintModel,
  buildSoundReportPrintModel,
} from '../reports/SetReportsPrintView';
import {
  DailyProgressPrintView,
  buildDailyProgressPrintModel,
} from '../reports/DailyProgressPrintView';
import { RunOfShowPrintView, buildRunOfShowPrintModel } from '../reports/RunOfShowPrintView';
import { useFixtureCatalog } from '../inspector/useFixtureCatalog';
import { CoverageMatrixPrintView } from '../reports/CoverageMatrixPrintView';
import {
  buildPrintableCoverageRows,
  buildPrintableStripboardDays,
} from '../../domain/scheduling';
import { useMoodboardImageSrcs } from '../moodboard/moodboardAssets';
import { buildScriptSides, sidesCharacterOptions, splitScenes } from '../../domain/script';
import { deriveScriptBreakdown } from '../../domain/script/logic';
import { attachBreakdownItemsToScenes } from '../../domain/script';
import { ProjectImage } from '../common/ProjectImage';
import { useImageRefSrcs } from '../../utils/assetImages';
import { keyFrameImage } from '../../utils/storyboardFrames';
import { castNumbersScheduledOn } from '../../domain/reports';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';

export const PrintableShotPlan: React.FC = () => {
  const { project, activeSetup, scriptLines, allScriptMarks, allShots, avScriptRows, displaySettings } = useFloorPlan();
  const { isExportModalOpen, closeExportModal, exportSection, setExportSection } = useWorkspaceUI();
  // The power sheet reads the same two things the power panel does: the lights
  // standing on the plan, and the live fixture catalogue that gives them a
  // rated draw.
  const fixtureCatalog = useFixtureCatalog();
  const powerPlanLights = useMemo(
    () => activeSetup.elements.filter((element): element is LightElement => element.type === 'light'),
    [activeSetup.elements],
  );
  const [pngScale, setPngScale] = useState<2 | 3>(2);
  const [showStoryboards, setShowStoryboards] = useState(false);
  const [omitBlankWaypoints, setOmitBlankWaypoints] = useState(
    displaySettings.hideBlankStoryboardWaypoints ?? false
  );
  const [equipmentScope, setEquipmentScope] = useState<'current' | 'all'>('current');
  const [exportViewMode, setExportViewMode] = useState<'full' | 'canvas'>('full');
  const [customOverrides, setCustomOverrides] = useState<Partial<DisplaySettings>>({});
  const [scriptScope, setScriptScope] = useState<'lined' | 'full'>('lined');
  // Zoom/pan viewport over the floor plan: z scales the printed region around the
  // scene center, panX/panY shift it in scene units so the user can choose exactly
  // which portion of the canvas gets printed (and exported as PNG).
  const [floorPlanZoom, setFloorPlanZoom] = useState<{ z: number; panX: number; panY: number }>({
    z: 1,
    panX: 0,
    panY: 0,
  });
  const floorPlanSvgRef = useRef<SVGSVGElement>(null);
  // The dialog panel, so the focus trap below knows what counts as "inside".
  const dialogRef = useRef<HTMLDivElement>(null);

  // Mood-board export: which board to print (defaults to the first).
  const moodBoards = React.useMemo(() => project.moodBoards ?? [], [project.moodBoards]);
  const [exportBoardId, setExportBoardId] = useState<string | null>(null);
  const exportBoard = moodBoards.find((b) => b.id === exportBoardId) ?? moodBoards[0] ?? null;
  const exportCards = React.useMemo(
    () => (exportBoard ? [...exportBoard.cards].sort((a, b) => a.order - b.order) : []),
    [exportBoard]
  );
  const exportImageSrcs = useMoodboardImageSrcs(exportCards);

  // Script sides: which scenes, in which order, optionally for one character.
  const sceneChunks = React.useMemo(
    () => splitScenes(scriptLines).filter((chunk) => chunk.lines[0]?.type === 'scene'),
    [scriptLines],
  );
  const [sidesSceneIds, setSidesSceneIds] = useState<string[] | null>(null);
  const [sidesCharacter, setSidesCharacter] = useState('');
  const [sidesDayId, setSidesDayId] = useState('');
  const sidesCharacters = React.useMemo(() => sidesCharacterOptions(scriptLines), [scriptLines]);
  const sides = React.useMemo(
    () => buildScriptSides(scriptLines, { sceneIds: sidesSceneIds ?? undefined, character: sidesCharacter || undefined }),
    [scriptLines, sidesSceneIds, sidesCharacter],
  );
  const packageSides = React.useMemo(() => buildScriptSides(scriptLines), [scriptLines]);
  /* The complete package prints the same board and coverage grid the Schedule
     tab does — same domain builders, so the two can never disagree. */
  const packageBoardDays = React.useMemo(() => buildPrintableStripboardDays(
    project,
    undefined,
    (block) => castNumbersScheduledOn([block.id], [block], {
      scriptScenes: project.scriptScenes,
      setups: project.setups,
      castAssignments: project.castAssignments,
    }),
  ), [project]);
  const packageCoverageRows = React.useMemo(() => buildPrintableCoverageRows(project), [project]);
  const sidesDay = (project.productionDays ?? []).find((day) => day.id === sidesDayId);
  const applySidesDay = (dayId: string) => {
    setSidesDayId(dayId);
    const day = (project.productionDays ?? []).find((candidate) => candidate.id === dayId);
    if (!day) {
      setSidesSceneIds(null);
      return;
    }
    const blocks = project.scheduleBlocks ?? [];
    const sceneIds = day.scheduleBlockIds
      .map((blockId) => blocks.find((block) => block.id === blockId))
      .flatMap((block) => (block?.kind === 'scene' ? [block.scriptSceneId] : []));
    setSidesSceneIds(sceneIds);
  };
  const crewCharacters = React.useMemo(
    () => deriveScriptBreakdown(scriptLines, project.characters ?? [], project.locations ?? []).characters,
    [scriptLines, project.characters, project.locations],
  );
  const [crewShowRates, setCrewShowRates] = useState(false);

  // Script reports (scene list / characters / locations / DOOD) and the DMX
  // patch sheet are derived here so the print document stays a pure view.
  const [reportSections, setReportSections] = useState({ scenes: true, characters: true, locations: true, elements: true, dood: true });
  // Scenes come out of the script with `breakdownItemIds` empty — the script
  // does not know about elements — so resolve the tagged ones onto them here
  // rather than storing that link a second time (rule 37).
  const reportBreakdown = React.useMemo(() => {
    const derived = deriveScriptBreakdown(scriptLines, project.characters ?? [], project.locations ?? []);
    return {
      ...derived,
      scenes: attachBreakdownItemsToScenes(derived.scenes, scriptLines, project.breakdownItems ?? []),
    };
  }, [scriptLines, project.characters, project.locations, project.breakdownItems]);
  const reportCharacterEntries = React.useMemo(
    () => reportBreakdown.characters
      .map((character) => deriveCharacterReport(character.id, {
        scriptScenes: reportBreakdown.scenes,
        characters: reportBreakdown.characters,
        people: project.people,
        castAssignments: project.castAssignments,
      }))
      .filter((entry) => entry.scenes.length > 0)
      .sort((a, b) => b.scenes.length - a.scenes.length),
    [reportBreakdown, project.people, project.castAssignments],
  );
  const reportDood = React.useMemo(() => {
    const sceneCharacters = new Map(reportBreakdown.scenes.map((scene) => [scene.id, scene.characterIds] as const));
    return deriveDood({
      days: project.productionDays ?? [],
      blocks: project.scheduleBlocks ?? [],
      characters: reportBreakdown.characters,
      castAssignments: project.castAssignments,
      people: project.people,
      getSceneCharacterIds: (sceneId) => sceneCharacters.get(sceneId),
    });
  }, [reportBreakdown, project.productionDays, project.scheduleBlocks, project.castAssignments, project.people]);
  const dmxRows = React.useMemo(
    () => sortedPatchRows(findConflicts(collectFixturePatches(
      activeSetup.elements.filter((element): element is LightElement => element.type === 'light'),
    ))),
    [activeSetup.elements],
  );

  /**
   * The daily progress report needs a shooting day; a project that has not
   * scheduled one yet gets a null model and the section explains itself,
   * rather than the sheet rendering with every figure blank.
   */
  const dailyProgressModel = React.useMemo(
    () => buildDailyProgressPrintModel(project),
    [project],
  );

  // When the export opens, default the storyboard toggle ON if any shot has a
  // storyboard attached (still fully toggleable off/on by the user).
  useEffect(() => {
    if (isExportModalOpen) {
      setShowStoryboards(activeSetup.shots.some((s) => !!s.storyboardImage));
      setOmitBlankWaypoints(displaySettings.hideBlankStoryboardWaypoints ?? false);
      setFloorPlanZoom({ z: 1, panX: 0, panY: 0 });
    }
  }, [isExportModalOpen, activeSetup, displaySettings.hideBlankStoryboardWaypoints]);

  // Close export modal on Escape key press
  useEffect(() => {
    if (!isExportModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeExportModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExportModalOpen, closeExportModal]);

  // Focus management for the export dialog. Without it the keyboard focus stays
  // on whatever was behind the overlay, so Tab walks the page the user can no
  // longer see. On open we remember the trigger, move focus into the dialog and
  // keep Tab / Shift+Tab cycling inside it; on close we hand focus back so the
  // keyboard user resumes exactly where they left off.
  useEffect(() => {
    if (!isExportModalOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Recomputed on every Tab rather than cached, because the dialog's toolbar
    // and body change completely whenever the user picks another export section.
    const getFocusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((node) => node.offsetParent !== null);

    // Focus the panel itself rather than its first control: the toolbar is long,
    // and landing on the container lets a screen reader announce the heading first.
    dialog.focus();

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        // Nothing to move to, but focus must still not escape the dialog.
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!active || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Capture phase so the trap wins over anything the dialog body listens for.
    document.addEventListener('keydown', handleTabKey, true);
    return () => {
      document.removeEventListener('keydown', handleTabKey, true);
      previouslyFocused?.focus();
    };
  }, [isExportModalOpen]);

  // Derived effective display settings for the blueprint export
  const eff = React.useMemo(() => {
    if (exportViewMode === 'full') {
      return {
        showFovCones: true,
        showLightBeams: true,
        showLabels: true,
        showActorLabels: true,
        showCameraLabels: true,
        showPropLabels: true,
        showTrackLabels: true,
        showLightLabels: true,
        showLightNameLabels: true,
        showLightRoleLabels: true,
        showLightKelvinLabels: true,
        showLightIntensityLabels: true,
        showMeasurementLabels: true,
        showDoorWindowLabels: true,
        showShotSizeInScript: true,
        showShotSizeOnCamera: true,
        showShotLensOnCamera: true,
        showShotAngleOnCamera: true,
        showShotNumberOnCamera: true,
        showLensFovLabel: true,
        showWaypoints: true,
        showWaypointCues: true,
        showStoryboardThumbs: showStoryboards,
        showGrid: true,
        labelOpacity: 1,
        labelCategoryOpacity: {
          cameras: 1,
          actors: 1,
          lights: 1,
          props: 1,
          tracks: 1,
          doorWindows: 1,
          measurements: 1,
        },
        categoryOpacity: {
          cameras: 1,
          actors: 1,
          lights: 1,
          props: 1,
          walls: 1,
          tracks: 1,
          storyboards: 1,
          measurements: 1,
        },
        ...customOverrides,
      };
    } else {
      // 'canvas' mode: mirrors current active workspace canvas toggles
      return {
        showFovCones: displaySettings.showFovCones !== false,
        showLightBeams: displaySettings.showLightBeams !== false,
        showLabels: displaySettings.showLabels !== false,
        showActorLabels: displaySettings.showActorLabels !== false,
        showCameraLabels: displaySettings.showCameraLabels !== false,
        showPropLabels: displaySettings.showPropLabels !== false,
        showTrackLabels: displaySettings.showTrackLabels !== false,
        showLightLabels: displaySettings.showLightLabels !== false,
        showLightNameLabels: displaySettings.showLightNameLabels !== false,
        showLightRoleLabels: displaySettings.showLightRoleLabels !== false,
        showLightKelvinLabels: displaySettings.showLightKelvinLabels === true,
        showLightIntensityLabels: displaySettings.showLightIntensityLabels === true,
        showMeasurementLabels: displaySettings.showMeasurementLabels !== false,
        showDoorWindowLabels: displaySettings.showDoorWindowLabels !== false,
        showShotSizeInScript: displaySettings.showShotSizeInScript !== false,
        showShotSizeOnCamera: displaySettings.showShotSizeOnCamera === true,
        showShotLensOnCamera: displaySettings.showShotLensOnCamera === true,
        showShotAngleOnCamera: displaySettings.showShotAngleOnCamera === true,
        showShotNumberOnCamera: displaySettings.showShotNumberOnCamera !== false,
        showLensFovLabel: displaySettings.showLensFovLabel === true,
        showWaypoints: displaySettings.showWaypoints !== false,
        showWaypointCues: displaySettings.showWaypointCues === true,
        showStoryboardThumbs: showStoryboards && (displaySettings.showStoryboardThumbs !== false),
        showGrid: displaySettings.showGrid === true,
        fovConeOpacity: displaySettings.fovConeOpacity ?? 1,
        labelOpacity: displaySettings.labelOpacity ?? 1,
        labelCategoryOpacity: displaySettings.labelCategoryOpacity || {
          cameras: 1,
          actors: 1,
          lights: 1,
          props: 1,
          tracks: 1,
          doorWindows: 1,
          measurements: 1,
        },
        categoryOpacity: displaySettings.categoryOpacity || {
          cameras: 1,
          actors: 1,
          lights: 1,
          props: 1,
          walls: 1,
          tracks: 1,
          storyboards: 1,
          measurements: 1,
        },
        ...customOverrides,
      };
    }
  }, [exportViewMode, displaySettings, showStoryboards, customOverrides]);

  const effectiveDisplaySettings: DisplaySettings = React.useMemo(() => {
    return {
      ...displaySettings,
      showFovCones: eff.showFovCones,
      showLightBeams: eff.showLightBeams,
      showLabels: eff.showLabels,
      showActorLabels: eff.showActorLabels,
      showCameraLabels: eff.showCameraLabels,
      showPropLabels: eff.showPropLabels,
      showTrackLabels: eff.showTrackLabels,
      showLightLabels: eff.showLightLabels,
      showLightNameLabels: eff.showLightNameLabels,
      showLightRoleLabels: eff.showLightRoleLabels,
      showLightKelvinLabels: eff.showLightKelvinLabels,
      showLightIntensityLabels: eff.showLightIntensityLabels,
      showMeasurementLabels: eff.showMeasurementLabels,
      showDoorWindowLabels: eff.showDoorWindowLabels,
      showShotSizeInScript: eff.showShotSizeInScript,
      showShotSizeOnCamera: eff.showShotSizeOnCamera,
      showShotLensOnCamera: eff.showShotLensOnCamera,
      showShotAngleOnCamera: eff.showShotAngleOnCamera,
      showShotNumberOnCamera: eff.showShotNumberOnCamera,
      showLensFovLabel: eff.showLensFovLabel,
      showWaypoints: eff.showWaypoints,
      showWaypointCues: eff.showWaypointCues,
      showStoryboardThumbs: eff.showStoryboardThumbs,
      showGrid: eff.showGrid,
      fovConeOpacity: eff.fovConeOpacity ?? displaySettings.fovConeOpacity ?? 1.0,
      labelOpacity: eff.labelOpacity ?? displaySettings.labelOpacity ?? 1.0,
      labelCategoryOpacity: eff.labelCategoryOpacity ?? displaySettings.labelCategoryOpacity,
      categoryOpacity: eff.categoryOpacity ?? displaySettings.categoryOpacity,
    };
  }, [displaySettings, eff]);

  const toggleOverride = (key: keyof DisplaySettings, defaultVal: boolean) => {
    setCustomOverrides((prev) => {
      const current = key in prev ? !!prev[key] : eff[key] ?? defaultVal;
      return { ...prev, [key]: !current };
    });
  };

  const exportEquipmentItems = React.useMemo(
    () =>
      equipmentScope === 'all'
        ? deriveAllScenesEquipment(project.setups || [activeSetup])
        : deriveSceneEquipment(activeSetup),
    [equipmentScope, project.setups, activeSetup]
  );

  // Above the early return: hooks must run in the same order on every render,
  // and this one sat after it. Reference plates live in the asset store, so the
  // printed blueprint has to resolve them like everything else — without this
  // the export lost its reference plate silently, which is the worst way for a
  // printed plan to be wrong.
  const backgroundSrcs = useImageRefSrcs(
    (activeSetup.backgroundImages ?? []).filter((img) => img.visible).map((img) => img.url),
  );

  if (!isExportModalOpen) return null;

  const printableElements = selectPrintablePlanElements(activeSetup.elements, activeSetup.layers);
  const cameras = printableElements.filter((e) => e.type === 'camera') as CameraElement[];
  const lights = printableElements.filter((e) => e.type === 'light') as LightElement[];
  const actors = printableElements.filter((e) => e.type === 'actor') as ActorElement[];
  const walls = printableElements.filter((e) => e.type === 'wall') as WallElement[];
  const doors = printableElements.filter((e) => e.type === 'door') as DoorElement[];
  const windows = printableElements.filter((e) => e.type === 'window') as WindowElement[];
  const props = printableElements.filter((e) => e.type === 'prop') as PropElement[];
  const tracks = printableElements.filter((e) => e.type === 'track') as TrackElement[];
  const roads = printableElements.filter((e) => e.type === 'road') as RoadElement[];
  const measurements = printableElements.filter((e) => e.type === 'measurement') as MeasurementElement[];
  const texts = printableElements.filter((e) => e.type === 'text') as TextElement[];
  const arrows = printableElements.filter((e) => e.type === 'arrow') as ArrowElement[];
  const cables = printableElements.filter((e) => e.type === 'cable') as CableElement[];
  const shapes = printableElements.filter((e) => e.type === 'shape') as ShapeElement[];
  const strokes = printableElements.filter((e) => e.type === 'stroke') as StrokeElement[];
  const backgroundImages = (activeSetup.backgroundImages || []).filter((i) => i.visible) as BackgroundImage[];
  const sceneAspectRatio =
    ASPECT_RATIOS.find((a) => a.value === (activeSetup.aspectRatio || '16:9'))?.ratio || 16 / 9;

  const getShotForCamera = (camera: CameraElement): Shot | null => {
    if (camera.associatedShotId) {
      const assoc = activeSetup.shots.find((s) => s.id === camera.associatedShotId);
      if (assoc) return assoc;
    }
    return activeSetup.shots.find((s) => s.cameraId === camera.id) || null;
  };

  const storyboardThumbs = cameras
    .map((c) => ({ camera: c, shot: getShotForCamera(c) }))
    .filter(
      (item): item is { camera: CameraElement; shot: Shot } =>
        !!item.shot && boardedFrames(item.shot, item.camera).length > 0
    );

  // Default export scope: only the screenplay the user actually lined.
  const printedScriptLines =
    scriptScope === 'full' ? scriptLines : linedExcerpt(scriptLines, allScriptMarks);

  const handleExportPng = () => {
    if (floorPlanSvgRef.current) {
      exportSvgAsPng(floorPlanSvgRef.current, {
        scale: pngScale,
        logo: project.logo,
        fileName: `FloorPlan_Scene_${activeSetup.sceneNumber || '1'}_${activeSetup.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`,
        title: project.title,
        subtitle: `SCENE ${activeSetup.sceneNumber}: ${activeSetup.name}`,
        meta: [
          `DATE: ${project.date || new Intl.DateTimeFormat('en-CA').format(new Date())}`,
          `DIR: ${project.director || '—'}`,
          `DP: ${project.cinematographer || '—'}`,
          `${activeSetup.location} (${activeSetup.timeOfDay})`,
        ],
      });
    }
  };

  const handlePrint = () => {
    // Images (production logo, storyboard frames, reference plans) must be
    // decoded before the browser snapshots the page, or they print blank.
    void waitForImages(document.body).then(() => window.print());
  };

  // Bounding box of everything on the plan, to auto-fit the printable
  // blueprint. `includePath` keeps blocking beats in frame: they live away
  // from the element itself, and a camera move that runs off the page is the
  // one thing a printed plan must not silently lose. The default box is used
  // only for a plan with nothing on it.
  let fullMinX = 100, fullMinY = 100, fullMaxX = 900, fullMaxY = 600;
  const elementBox = elementsBounds(activeSetup.elements, {
    includePath: true,
    markerHalfExtent: 40,
  });
  if (elementBox) {
    const padded = padBounds(elementBox, 60);
    fullMinX = padded.minX;
    fullMinY = padded.minY;
    fullMaxX = padded.maxX;
    fullMaxY = padded.maxY;
  }
  for (const img of backgroundImages) {
    fullMinX = Math.min(fullMinX, img.x - 20);
    fullMinY = Math.min(fullMinY, img.y - 20);
    fullMaxX = Math.max(fullMaxX, img.x + img.width + 20);
    fullMaxY = Math.max(fullMaxY, img.y + img.height + 20);
  }
  if (showStoryboards) {
    for (const shot of activeSetup.shots) {
      const cam = cameras.find((c) => c.id === shot.cameraId);
      if (!cam) continue;
      slotsOf(shot, cam).forEach((slot, index) => {
        if (!slot.frame?.image) return;
        const pos =
          slot.frame.canvasPosition || { x: slot.anchor.x + 110, y: slot.anchor.y - 60 + index * 20 };
        fullMinX = Math.min(fullMinX, pos.x - 60);
        fullMinY = Math.min(fullMinY, pos.y - 60);
        fullMaxX = Math.max(fullMaxX, pos.x + 60);
        fullMaxY = Math.max(fullMaxY, pos.y + 60);
      });
    }
  }
  const fullWidth = Math.max(800, fullMaxX - fullMinX);
  const fullHeight = Math.max(500, fullMaxY - fullMinY);

  // Zoom/pan viewport: the printed portion of the canvas. Zoom scales the visible
  // region around the scene center; pan shifts it. The viewport is clamped so it
  // never leaves the auto-fit scene bounds entirely.
  const { z: zoom, panX, panY } = floorPlanZoom;
  const viewportWidth = fullWidth / zoom;
  const viewportHeight = fullHeight / zoom;
  const maxPanX = Math.max(0, (fullWidth - viewportWidth) / 2);
  const maxPanY = Math.max(0, (fullHeight - viewportHeight) / 2);
  const viewBoxMinX = fullMinX + (fullWidth - viewportWidth) / 2 + Math.min(maxPanX, Math.max(-maxPanX, panX));
  const viewBoxMinY = fullMinY + (fullHeight - viewportHeight) / 2 + Math.min(maxPanY, Math.max(-maxPanY, panY));

  const handleFloorPlanZoom = (dir: 1 | -1) => {
    setFloorPlanZoom((prev) => ({
      ...prev,
      z: Math.min(20, Math.max(1, prev.z * (dir > 0 ? 1.25 : 0.8))),
    }));
  };

  const handleFloorPlanPan = (dx: number, dy: number) => {
    setFloorPlanZoom((prev) => {
      const stepX = (fullWidth / prev.z) * 0.12;
      const stepY = (fullHeight / prev.z) * 0.12;
      return { ...prev, panX: prev.panX + dx * stepX, panY: prev.panY + dy * stepY };
    });
  };

  const resetFloorPlanZoom = () => setFloorPlanZoom({ z: 1, panX: 0, panY: 0 });

  return (
    <div
      id="export-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeExportModal();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 md:p-5 select-none animate-in fade-in cursor-pointer"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[98vw] xl:max-w-[1600px] bg-white text-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh] cursor-default outline-hidden"
      >
        <style>{`@media print { html body #app-root { display: block !important; } }`}</style>
        {/* Top Control Bar (Hidden when printing) */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-slate-900 text-white border-b border-slate-800 print:hidden">
          {/* Brand & Studio Title */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="export-modal-title" className="text-xs font-bold text-white tracking-wide uppercase">
                  Export & Print Studio
                </h3>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                  ESC to close
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Production-ready call sheets, blueprints, gear manifests & script packages
              </p>
            </div>
          </div>

          {/* Section Mode Segmented Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner overflow-x-auto custom-scrollbar">
            <button
              onClick={() => setExportSection('floorplan')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'floorplan'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Floor Plan Blueprint
            </button>
            <button
              onClick={() => setExportSection('shotlist')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'shotlist'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Shot List
            </button>
            <button
              onClick={() => setExportSection('storyboard')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'storyboard'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Storyboard
            </button>
            <button
              onClick={() => setExportSection('linedscript')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'linedscript'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Lined Script
            </button>
            <button
              onClick={() => setExportSection('avscript')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'avscript'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              AV Script
            </button>
            <button
              onClick={() => setExportSection('sides')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'sides'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Script Sides
            </button>
            <button
              onClick={() => setExportSection('scriptreports')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'scriptreports'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Script Reports
            </button>
            <button
              onClick={() => setExportSection('dmx')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'dmx'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              DMX Patch
            </button>
            <button
              onClick={() => setExportSection('crew')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'crew'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Contact List
            </button>
            <button
              onClick={() => setExportSection('equipment')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'equipment'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Equipment List
            </button>
            <button
              onClick={() => setExportSection('power')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'power'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Power Plan
            </button>
            <button
              onClick={() => setExportSection('rigging')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'rigging'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Rigging Plot
            </button>
            <button
              onClick={() => setExportSection('logistics')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'logistics'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Load List
            </button>
            <button
              onClick={() => setExportSection('continuity')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'continuity'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Continuity
            </button>
            <button
              onClick={() => setExportSection('camerareport')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'camerareport'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Camera Report
            </button>
            <button
              onClick={() => setExportSection('soundreport')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'soundreport'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sound Report
            </button>
            <button
              onClick={() => setExportSection('dailyprogress')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'dailyprogress'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Daily Report
            </button>
            <button
              onClick={() => setExportSection('runofshow')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'runofshow'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Run of Show
            </button>
            <button
              onClick={() => setExportSection('moodboard')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'moodboard'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Mood Board
            </button>
            <button
              onClick={() => setExportSection('combined')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'combined'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Complete Package
            </button>
          </div>

          {/* What "everything" actually means, and what is missing from this
              project so an empty section never looks like a lost section. */}
          {exportSection === 'combined' && (
            <p className="text-[10px] text-slate-400 leading-relaxed max-w-3xl">
              Includes: floor plan · shot list · equipment &amp; gear manifest · DMX patch ·
              storyboards · lined script · script breakdown reports · sides · stripboard ·
              coverage matrix · contact list · mood board. Sections with no data in this
              project are skipped.
            </p>
          )}

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Print / Save PDF */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>

            {/* PNG Export for Blueprint */}
            {(exportSection === 'floorplan' || exportSection === 'combined') && (
              <div className="flex items-center gap-1">
                <select
                  value={pngScale}
                  onChange={(e) => setPngScale(Number(e.target.value) as 2 | 3)}
                  title="PNG resolution scale"
                  className="px-1.5 py-1.5 bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <option value={2}>2x</option>
                  <option value={3}>3x</option>
                </select>
                <button
                  onClick={handleExportPng}
                  title="Download transparent high-resolution PNG"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PNG</span>
                </button>
              </div>
            )}

            {/* CSV for Shot List */}
            {(exportSection === 'shotlist' || exportSection === 'combined') && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => exportShotListToCsv(activeSetup, project.title)}
                  title="Download this scene's shot list as Excel / CSV"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>
                <button
                  onClick={() => exportProjectToCsv(project)}
                  title="Download the whole project (all scenes) as Excel / CSV"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>All Scenes</span>
                </button>
              </div>
            )}

            {/* Equipment Scope Switcher & CSV Export */}
            {(exportSection === 'equipment' || exportSection === 'combined') && (
              <div className="flex items-center gap-1.5">
                <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-xs font-semibold">
                  <button
                    onClick={() => setEquipmentScope('current')}
                    className={`px-2 py-1 rounded transition-colors ${
                      equipmentScope === 'current'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Scene {activeSetup.sceneNumber || '1'} Gear
                  </button>
                  <button
                    onClick={() => setEquipmentScope('all')}
                    className={`px-2 py-1 rounded transition-colors ${
                      equipmentScope === 'all'
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    All Scenes Master Truck
                  </button>
                </div>

                <button
                  onClick={() =>
                    exportEquipmentToCsv(
                      activeSetup,
                      project.title,
                      equipmentScope,
                      project.setups || [activeSetup]
                    )
                  }
                  title={`Download ${
                    equipmentScope === 'all' ? 'All Scenes Master Truck' : `Scene ${activeSetup.sceneNumber || '1'}`
                  } equipment manifest as Excel / CSV spreadsheet`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>
              </div>
            )}

            {/* Storyboards toggle */}
            <button
              onClick={() => setShowStoryboards((prev) => !prev)}
              title={showStoryboards ? 'Hide storyboard thumbnails' : 'Show storyboard thumbnails on the floor plan and in the shot list'}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                showStoryboards
                  ? 'bg-violet-600 text-white border-violet-500'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
              }`}
            >
              <span
                className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] ${
                  showStoryboards ? 'bg-white text-violet-700 border-white' : 'border-slate-500'
                }`}
              >
                {showStoryboards ? '✓' : ''}
              </span>
              Storyboards
            </button>

            {/* Omit blank waypoints toggle */}
            {(exportSection === 'storyboard' || (exportSection === 'combined' && showStoryboards)) && (
              <button
                onClick={() => setOmitBlankWaypoints((prev) => !prev)}
                title={
                  omitBlankWaypoints
                    ? 'Show all waypoint keyframes (including unboarded waypoints) on the exported storyboard'
                    : 'Omit blank waypoint keyframes (only print waypoints with attached art)'
                }
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  omitBlankWaypoints
                    ? 'bg-violet-600 text-white border-violet-500'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                <span
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] ${
                    omitBlankWaypoints ? 'bg-white text-violet-700 border-white' : 'border-slate-500'
                  }`}
                >
                  {omitBlankWaypoints ? '✓' : ''}
                </span>
                Omit Blank
              </button>
            )}

            {/* Close Button */}
            <button
              onClick={closeExportModal}
              title="Close (Esc or click outside)"
              aria-label="Close (Esc or click outside)"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Floor Plan Layer Customization Bar (Hidden when printing) */}
        {(exportSection === 'floorplan' || exportSection === 'combined') && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-2 bg-slate-950 text-white border-b border-slate-800 text-xs print:hidden">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Blueprint Mode:
              </span>
              <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                <button
                  onClick={() => {
                    setExportViewMode('full');
                    setCustomOverrides({});
                  }}
                  title="Everything Turned ON: all camera cones, light beams, labels, Kelvin, dim %, blocking waypoints and cues"
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    exportViewMode === 'full' && Object.keys(customOverrides).length === 0
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Full Blueprint (All ON)</span>
                </button>
                <button
                  onClick={() => {
                    setExportViewMode('canvas');
                    setCustomOverrides({});
                  }}
                  title="As Shown on Canvas: exactly matches your active floor plan workspace display toggles"
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    exportViewMode === 'canvas' && Object.keys(customOverrides).length === 0
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>As Shown on Canvas</span>
                </button>
              </div>
            </div>

            {/* Quick Layer Toggles */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase font-bold text-slate-500 mr-1">Layer Overrides:</span>
              <button
                type="button"
                onClick={() => toggleOverride('showFovCones', true)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  eff.showFovCones
                    ? 'bg-sky-950 text-sky-300 border-sky-600/60'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}
              >
                FOV Cones
              </button>
              <button
                type="button"
                onClick={() => toggleOverride('showLightBeams', true)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  eff.showLightBeams
                    ? 'bg-amber-950 text-amber-300 border-amber-600/60'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}
              >
                Light Beams
              </button>
              <button
                type="button"
                onClick={() => toggleOverride('showLabels', true)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  eff.showLabels
                    ? 'bg-slate-800 text-slate-200 border-slate-600'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}
              >
                Labels
              </button>
              <button
                type="button"
                onClick={() => {
                  const curr = eff.showLightKelvinLabels && eff.showLightIntensityLabels;
                  setCustomOverrides((prev) => ({
                    ...prev,
                    showLightKelvinLabels: !curr,
                    showLightIntensityLabels: !curr,
                  }));
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  eff.showLightKelvinLabels || eff.showLightIntensityLabels
                    ? 'bg-amber-950 text-amber-300 border-amber-600/60'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}
              >
                Kelvin & Dim %
              </button>
              <button
                type="button"
                onClick={() => toggleOverride('showWaypoints', true)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  eff.showWaypoints
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-600/60'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}
              >
                Waypoints
              </button>
              <button
                type="button"
                onClick={() => toggleOverride('showGrid', false)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  eff.showGrid
                    ? 'bg-slate-800 text-slate-200 border-slate-600'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}
              >
                Grid
              </button>
            </div>
          </div>
        )}

        {/* Mood-board options */}
        {exportSection === 'moodboard' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase font-bold text-slate-500">Board:</span>
            <select
              value={exportBoard?.id ?? ''}
              onChange={(e) => setExportBoardId(e.target.value || null)}
              className="px-2 py-1.5 bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
            >
              {moodBoards.length === 0 && <option value="">No mood boards yet</option>}
              {moodBoards.map((b) => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
            <span className="text-[10px] text-slate-500">
              Layout, captions and the color palette are edited on the Mood Board tab (Collage view).
            </span>
          </div>
        )}

        {/* Script-sides options */}
        {exportSection === 'sides' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase font-bold text-slate-500">Scenes:</span>
              <button onClick={() => { setSidesSceneIds(null); setSidesDayId(''); }} className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700">All</button>
              <button onClick={() => { setSidesSceneIds([]); setSidesDayId(''); }} className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700">None</button>
              <select
                value={sidesDayId}
                onChange={(e) => applySidesDay(e.target.value)}
                className="px-2 py-1.5 bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                title="Take the scenes scheduled on a shooting day, in shooting order"
              >
                <option value="">From shooting day…</option>
                {(project.productionDays ?? []).map((day) => (
                  <option key={day.id} value={day.id}>{day.name}{day.date ? ` · ${day.date}` : ''}</option>
                ))}
              </select>
              <span className="text-[10px] uppercase font-bold text-slate-500 ml-2">Character:</span>
              <select
                value={sidesCharacter}
                onChange={(e) => setSidesCharacter(e.target.value)}
                className="px-2 py-1.5 bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
              >
                <option value="">Everyone</option>
                {sidesCharacters.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              <span className="text-[10px] text-slate-500">{sides.scenes.length} scene{sides.scenes.length === 1 ? '' : 's'} in these sides</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap max-h-20 overflow-y-auto custom-scrollbar">
              {sceneChunks.map((chunk, index) => {
                const heading = chunk.lines[0];
                const number = heading.sceneNumber || String(index + 1);
                const on = sidesSceneIds === null || sidesSceneIds.includes(chunk.id);
                return (
                  <button
                    key={chunk.id}
                    onClick={() => {
                      const current = sidesSceneIds ?? sceneChunks.map((c) => c.id);
                      setSidesSceneIds(on ? current.filter((id) => id !== chunk.id) : [...current, chunk.id]);
                      setSidesDayId('');
                    }}
                    title={heading.text}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      on ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-500'
                    } ${heading.omitted ? 'line-through' : ''}`}
                  >
                    {number}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Script-report options */}
        {exportSection === 'scriptreports' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase font-bold text-slate-500">Include:</span>
            {([['scenes', 'Scene list'], ['characters', 'Characters'], ['locations', 'Locations'], ['elements', 'Elements'], ['dood', 'Day out of days']] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={reportSections[key]}
                  onChange={(e) => setReportSections((current) => ({ ...current, [key]: e.target.checked }))}
                  className="accent-sky-600"
                />
                {label}
              </label>
            ))}
            <span className="text-[10px] text-slate-500">{reportBreakdown.scenes.length} scenes · {reportCharacterEntries.length} characters · {reportDood.columns.length} shooting days</span>
          </div>
        )}

        {/* DMX patch options */}
        {exportSection === 'dmx' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-slate-500">
              {dmxRows.length} patched fixture{dmxRows.length === 1 ? '' : 's'} in this scene · addresses and channel footprints come from each fixture's linked profile.
            </span>
          </div>
        )}

        {/* Contact-list options */}
        {exportSection === 'crew' && (
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
              <input type="checkbox" checked={crewShowRates} onChange={(e) => setCrewShowRates(e.target.checked)} className="accent-sky-600" />
              Include rates (producer copy)
            </label>
            <span className="text-[10px] text-slate-500">{(project.people ?? []).length} contacts · edited in the Contacts module.</span>
          </div>
        )}

        {/* Printable Document Paper View (Strictly Pure White for Ink Saving) */}
        <div
          id="printable-content"
          className="flex-1 overflow-y-auto p-8 bg-white text-slate-900 print:p-2 print:overflow-visible"
        >
          {/* 1. Header Block (Standard Film Production Slate) */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6">
            <div className="flex justify-between items-start gap-4">
              <div className="flex items-start gap-3 min-w-0">
                {project.logo && (
                  <ProjectImage
                    imageRef={project.logo}
                    alt=""
                    className="h-14 w-auto max-w-[9rem] object-contain flex-shrink-0"
                  />
                )}
                <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs font-mono font-bold uppercase bg-slate-900 text-white rounded">
                    CINEMATOGRAPHY PLAN
                  </span>
                  <span className="text-xs font-bold text-slate-600">
                    {exportSection === 'floorplan'
                      ? '• 2D FLOOR PLAN BLUEPRINT'
                      : exportSection === 'shotlist'
                      ? '• COVERAGE SHOT LIST'
                      : exportSection === 'storyboard'
                      ? '• STORYBOARD'
                      : exportSection === 'linedscript'
                      ? '• LINED SHOOTING SCRIPT'
                      : exportSection === 'equipment'
                      ? (equipmentScope === 'all' ? '• ALL SCENES MASTER TRUCK MANIFEST' : '• SCENE EQUIPMENT PACKAGE')
                      : exportSection === 'moodboard'
                      ? '• VISUAL MOOD BOARD COLLAGE'
                      : exportSection === 'sides'
                      ? '• SCRIPT SIDES'
                      : exportSection === 'crew'
                      ? '• PRODUCTION CONTACT LIST'
                      : exportSection === 'scriptreports'
                      ? '• SCRIPT BREAKDOWN REPORTS'
                      : exportSection === 'dmx'
                      ? '• DMX PATCH SHEET'
                      : '• COMPLETE PRODUCTION PACKAGE'}
                  </span>
                </div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase mt-1">
                  {project.title}
                </h1>
                <h2 className="text-sm font-bold text-slate-700">
                  {exportSection === 'equipment' && equipmentScope === 'all'
                    ? `ALL ${project.setups?.length || 1} SCENES MASTER PRODUCTION MANIFEST`
                    : exportSection === 'sides'
                    ? (sidesDay ? `SIDES · ${sidesDay.name.toUpperCase()}${sidesDay.date ? ` · ${sidesDay.date}` : ''}` : `SIDES · ${sides.scenes.length} SCENE${sides.scenes.length === 1 ? '' : 'S'}`) + (sidesCharacter ? ` · ${sidesCharacter}` : '')
                    : exportSection === 'crew'
                    ? 'CREW, CAST & CONTACTS'
                    : exportSection === 'scriptreports'
                    ? 'SCENES · CHARACTERS · LOCATIONS · DAY OUT OF DAYS'
                    : exportSection === 'dmx'
                    ? `SCENE ${activeSetup.sceneNumber}: ${activeSetup.name} — DMX PATCH`
                    : `SCENE ${activeSetup.sceneNumber}: ${activeSetup.name}`}
                </h2>
                </div>
              </div>
              <div className="text-right text-xs text-slate-700 font-mono space-y-0.5">
                <p><strong>DATE:</strong> {project.date || new Intl.DateTimeFormat('en-CA').format(new Date())}</p>
                <p><strong>DIRECTOR:</strong> {project.director || '—'}</p>
                <p><strong>CINEMATOGRAPHER:</strong> {project.cinematographer || '—'}</p>
                <p><strong>LOCATION:</strong> {activeSetup.location} ({activeSetup.timeOfDay})</p>
              </div>
            </div>
          </div>

          {/* Mood-board collage document */}
          {exportSection === 'moodboard' && exportBoard && (
            <MoodboardPrintView board={exportBoard} srcs={exportImageSrcs} />
          )}

          {/* Script sides */}
          {exportSection === 'sides' && (
            scriptLines.length === 0 ? (
              <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-4">
                No screenplay yet — import or write one in the Script panel to generate sides.
              </p>
            ) : (
              <ScriptSidesPrintView
                sides={sides}
                title={project.title}
                subtitle={sidesDay ? `${sidesDay.name}${sidesDay.date ? ` · ${sidesDay.date}` : ''}` : project.date}
                characterFilter={sidesCharacter || undefined}
                logo={project.logo}
              />
            )
          )}

          {/* Script breakdown reports */}
          {exportSection === 'scriptreports' && (
            reportBreakdown.scenes.length === 0 ? (
              <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-4">
                No scene headings in the screenplay yet — write or import one in the Script panel.
              </p>
            ) : (
              <ScriptReportsPrintView
                productionTitle={project.title}
                scenes={reportBreakdown.scenes}
                characters={reportBreakdown.characters}
                characterReports={reportCharacterEntries}
                locations={reportBreakdown.locations}
                dood={reportDood}
                breakdownItems={project.breakdownItems}
                sections={reportSections}
                logo={project.logo}
              />
            )
          )}

          {/* DMX patch sheet */}
          {exportSection === 'dmx' && (
            dmxRows.length === 0 ? (
              <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-4">
                No DMX-controllable fixtures patched in this scene — link fixture profiles and addresses in the Inspector or the Gear panel.
              </p>
            ) : (
              <DmxPatchPrintView
                rows={dmxRows}
                productionTitle={project.title}
                sceneName={`Scene ${activeSetup.sceneNumber || ''}: ${activeSetup.name}`}
                embedded
              />
            )
          )}

          {/* Power, rigging, load list and run of show: the four production
              sheets that had no way onto paper at all. Each is rendered from
              the same domain derivation its panel uses, so the sheet and the
              screen cannot disagree. */}
          {exportSection === 'power' && (
            <PowerPrintView
              {...buildPowerPrintModel(project, {
                planLights: powerPlanLights,
                profiles: fixtureCatalog.profiles,
                sceneName: `Scene ${activeSetup.sceneNumber || ''}: ${activeSetup.name}`,
              })}
            />
          )}

          {exportSection === 'rigging' && <RiggingPrintView {...buildRiggingPrintModel(project)} />}

          {exportSection === 'logistics' && (
            <LogisticsPrintView {...buildLogisticsPrintModel(project)} />
          )}

          {exportSection === 'continuity' && (
            <ContinuityPrintView {...buildContinuityPrintModel(project)} />
          )}

          {/* The two sheets that travel with the media, and the sheet the
              production office reads at wrap. All three derive from the
              continuity log — nothing here is typed twice. */}
          {exportSection === 'camerareport' && (
            <CameraReportPrintView {...buildCameraReportPrintModel(project)} embedded />
          )}

          {exportSection === 'soundreport' && (
            <SoundReportPrintView {...buildSoundReportPrintModel(project)} embedded />
          )}

          {exportSection === 'dailyprogress' && (
            dailyProgressModel === null ? (
              <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-4">
                No production days yet — a daily progress report is about one shooting day.
                Add a day in the Schedule module.
              </p>
            ) : (
              <DailyProgressPrintView {...dailyProgressModel} embedded />
            )
          )}

          {exportSection === 'runofshow' && (
            <RunOfShowPrintView {...buildRunOfShowPrintModel(project)} />
          )}

          {/* Production contact list */}
          {exportSection === 'crew' && (
            (project.people ?? []).length === 0 ? (
              <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-4">
                No contacts yet — add crew and cast in the Contacts module.
              </p>
            ) : (
              <ContactListPrintView
                people={project.people ?? []}
                characters={crewCharacters}
                castAssignments={project.castAssignments ?? []}
                showRates={crewShowRates}
                currency={project.budget?.settings.currency}
                logo={project.logo}
              />
            )
          )}

          {/* ========================================================================= */}
          {/* SECTION A: 2D FLOOR PLAN BLUEPRINT GRAPHIC                                */}
          {/* ========================================================================= */}
          {(exportSection === 'floorplan' || exportSection === 'combined') && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-sky-600" />
                  <span>Scene Floor Plan Blueprint</span>
                </h3>
                <span className="text-[11px] font-mono text-slate-500">
                  Scale: 1 Grid Unit = {activeSetup.gridSettings?.unit === 'm' ? '1.0m' : '3.0ft'}
                </span>
              </div>

              {/* Architectural SVG Blueprint Diagram */}
              <div className="relative border-2 border-slate-900 rounded-xl p-4 bg-white shadow-xs overflow-hidden">
                {/* Floor Plan Viewport Controls (zoom / pan the printed portion) */}
                <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 bg-white/95 border border-slate-300 rounded-lg shadow-md px-1 py-0.5 print:hidden">
                  <button
                    type="button"
                    onClick={() => handleFloorPlanZoom(-1)}
                    title="Zoom out (widen the printed portion)"
                    aria-label="Zoom out (widen the printed portion)"
                    className="p-1 rounded-md hover:bg-slate-200 text-slate-600"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-10 text-center text-[10px] font-mono text-slate-700 select-none">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => handleFloorPlanZoom(1)}
                    title="Zoom in (focus the printed portion)"
                    aria-label="Zoom in (focus the printed portion)"
                    className="p-1 rounded-md hover:bg-slate-200 text-slate-600"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={resetFloorPlanZoom}
                    title="Reset view to fit the entire scene"
                    aria-label="Reset view to fit the entire scene"
                    className="p-1 rounded-md hover:bg-slate-200 text-slate-600"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-px h-4 bg-slate-300 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => handleFloorPlanPan(-1, 0)}
                    title="Pan left"
                    aria-label="Pan left"
                    className="p-1 rounded-md hover:bg-slate-200 text-slate-600"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFloorPlanPan(0, -1)}
                    title="Pan up"
                    aria-label="Pan up"
                    className="p-1 rounded-md hover:bg-slate-200 text-slate-600"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFloorPlanPan(0, 1)}
                    title="Pan down"
                    aria-label="Pan down"
                    className="p-1 rounded-md hover:bg-slate-200 text-slate-600"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFloorPlanPan(1, 0)}
                    title="Pan right"
                    aria-label="Pan right"
                    className="p-1 rounded-md hover:bg-slate-200 text-slate-600"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <svg
                  ref={floorPlanSvgRef}
                  id="print-floorplan-svg"
                  viewBox={`${viewBoxMinX} ${viewBoxMinY} ${viewportWidth} ${viewportHeight}`}
                  className="w-full h-auto max-h-[500px]"
                  style={{ backgroundColor: '#ffffff' }}
                >
                  {/* Subtle Grid pattern for architectural context */}
                  <defs>
                    <pattern id="print-grid" width="50" height="50" patternUnits="userSpaceOnUse">
                      <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                    </pattern>
                  </defs>
                  {eff.showGrid && (
                    <rect x={fullMinX} y={fullMinY} width={fullWidth} height={fullHeight} fill="url(#print-grid)" />
                  )}

                  {/* 0. Reference / Background Images (scout photo, blueprint, screenshot) */}
                  {backgroundImages.map((img) => (
                    <g
                      key={img.id || img.url}
                      transform={`translate(${img.x}, ${img.y}) rotate(${img.rotation || 0})`}
                    >
                      <rect
                        x={0}
                        y={0}
                        width={img.width}
                        height={img.height}
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth="1"
                        strokeDasharray="4 3"
                      />
                      <image
                        href={backgroundSrcs[img.url] ?? undefined}
                        x={0}
                        y={0}
                        width={img.width}
                        height={img.height}
                        opacity={Math.max(0.12, Math.min(1, img.opacity || 0.5))}
                        preserveAspectRatio="none"
                      />
                      {eff.showLabels && img.name && (
                        <text
                          x={4}
                          y={-6}
                          fontSize="9"
                          fontStyle="italic"
                          fill="#64748b"
                          fontFamily="sans-serif"
                        >
                          {img.name}
                        </text>
                      )}
                    </g>
                  ))}

                                    {/* 1. Walls, Doors & Windows */}
                  <WallLayer
                    walls={walls}
                    doors={doors}
                    windows={windows}
                    selectedIds={[]}
                    showLightBeams={effectiveDisplaySettings.showLightBeams}
                    showDoorWindowLabels={effectiveDisplaySettings.showLabels && effectiveDisplaySettings.showDoorWindowLabels}
                    onSelect={() => {}}
                    categoryOpacity={effectiveDisplaySettings.categoryOpacity}
                    labelOpacity={(effectiveDisplaySettings.labelOpacity ?? 1) * (effectiveDisplaySettings.labelCategoryOpacity?.doorWindows ?? 1)}
                    labelColor={effectiveDisplaySettings.doorWindowLabelColor}
                  />

                  {/* 2. Basic Shapes (Zones, Carpets, Areas) */}
                  <ShapesLayer
                    shapes={shapes}
                    selectedIds={[]}
                    onSelect={() => {}}
                    canvasScale={1}
                  />

                  {/* 3. Dolly Tracks, Props, Measurements, Arrows, Texts */}
                  <RoadLayer
                    roads={roads}
                    selectedIds={[]}
                    onSelect={() => {}}
                    displaySettings={effectiveDisplaySettings}
                  />

                  <PropsLayer
                    propsList={props}
                    tracks={tracks}
                    measurements={measurements}
                    arrows={arrows}
                    texts={texts}
                    selectedIds={[]}
                    onSelect={() => {}}
                    pixelsPerUnit={activeSetup.gridSettings?.pixelsPerUnit || 50}
                    displaySettings={effectiveDisplaySettings}
                  />

                  {/* 3b. Cable / Patch Runs */}
                  <CableLayer
                    cables={cables}
                    selectedIds={[]}
                    onSelect={() => {}}
                    pixelsPerUnit={activeSetup.gridSettings?.pixelsPerUnit || 50}
                    displaySettings={effectiveDisplaySettings}
                  />

                  {/* 4. Lighting Fixtures, Beams & Flags */}
                  <LightingLayer
                    lights={lights}
                    selectedIds={[]}
                    onSelect={() => {}}
                    displaySettings={effectiveDisplaySettings}
                    gridSettings={activeSetup.gridSettings}
                  />

                  {/* 5. Actors & Blocking Waypoints */}
                  {actors.map((actor) => (
                    <ActorElementView
                      key={actor.id}
                      actor={actor}
                      isSelected={false}
                      isHighlighted={false}
                      currentBeat={1}
                      isPlaying={false}
                      onSelect={() => {}}
                      displaySettings={effectiveDisplaySettings}
                    />
                  ))}

                  {/* 6. Cameras, FOV Cones & Shots */}
                  {cameras.map((camera) => (
                    <CameraElementView
                      key={camera.id}
                      camera={camera}
                      shot={getShotForCamera(camera)}
                      isSelected={false}
                      isHighlighted={false}
                      currentBeat={1}
                      isPlaying={false}
                      onSelect={() => {}}
                      displaySettings={effectiveDisplaySettings}
                    />
                  ))}

                  {/* 7. Storyboard Thumbnails pinned near camera */}
                  {showStoryboards && effectiveDisplaySettings.showStoryboardThumbs && (
                    <StoryboardThumbLayer
                      items={storyboardThumbs}
                      canvasScale={1}
                      aspectRatio={sceneAspectRatio}
                      isInteractive={false}
                      onSelectCamera={() => {}}
                    />
                  )}

                  {/* 8. Freehand annotations — identical geometry and styling to the live canvas. */}
                  <FreehandStrokeLayer strokes={strokes} />
                </svg>
              </div>

              <p className="text-[10px] text-slate-500 mt-2">
                Blocking beats: <span className="font-bold text-sky-700">blue</span> = camera moves — the ghost body
                and its coverage cone show where the camera sits and looks on each beat —{' '}
                <span className="font-bold text-emerald-700">green</span> = actor blocking, with a ghost figure at every
                beat. Beat numbers match the timeline.
              </p>

              {/* Blueprint Legend Bar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-xs">
                <div className="p-2.5 bg-slate-50 border border-slate-300 rounded-lg">
                  <span className="font-bold uppercase text-[10px] text-slate-700 block mb-1">
                    Actors & Blocking ({actors.length})
                  </span>
                  <div className="space-y-0.5 text-[11px]">
                    {actors.map((a) => (
                      <div key={a.id} className="flex justify-between">
                        <strong>[{a.characterLetter}] {a.name}</strong>
                        <span className="text-slate-600">{a.isStanding ? 'Standing' : 'Seated'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-300 rounded-lg">
                  <span className="font-bold uppercase text-[10px] text-slate-700 block mb-1">
                    Scene Summary
                  </span>
                  <div className="space-y-0.5 text-[11px] text-slate-700">
                    <div className="flex justify-between">
                      <span>Aspect Ratio:</span>
                      <strong className="font-mono">{sceneAspectRatio}:1</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Coverage Shots:</span>
                      <strong className="font-mono">{activeSetup.shots.length} planned shots</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION B: COVERAGE SHOT LIST BREAKDOWN TABLE                              */}
          {/* ========================================================================= */}
          {(exportSection === 'shotlist' || exportSection === 'combined') && (
            <div className="mb-8 print-section">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Film className="w-4 h-4 text-sky-600" />
                  <span>Coverage & Shot Breakdown Sheet</span>
                </h3>
                <span className="font-mono text-xs font-bold text-slate-700">
                  {activeSetup.shots.length} Planned Shots
                </span>
              </div>

              <div className="border border-slate-900 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-900 text-slate-900 font-bold">
                      {showStoryboards && (
                        <th className="p-2.5 w-16">STORY</th>
                      )}
                      <th className="p-2.5 font-mono w-16">SHOT #</th>
                      <th className="p-2.5 w-14">CAM</th>
                      <th className="p-2.5 w-14">SIZE</th>
                      <th className="p-2.5 w-14 font-mono">LENS</th>
                      <th className="p-2.5 w-24">ANGLE</th>
                      <th className="p-2.5 w-24">MOVEMENT</th>
                      <th className="p-2.5">FRAMING & ACTION DESCRIPTION</th>
                      <th className="p-2.5 font-mono w-20 text-center">TAKES</th>
                      <th className="p-2.5 font-mono w-16 text-center">DONE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {activeSetup.shots.map((shot) => {
                      const linkedCam = cameras.find((c) => c.id === shot.cameraId);
                      return (
                        <tr key={shot.id} className="hover:bg-slate-50">
                          {showStoryboards && (
                            <td className="p-2.5 align-middle">
                              {keyFrameImage(shot) ? (
                                <div
                                  className="overflow-hidden rounded border border-slate-300 bg-slate-100"
                                  style={{ width: 64, aspectRatio: `${sceneAspectRatio} / 1` }}
                                >
                                  <ProjectImage
                                    imageRef={keyFrameImage(shot)}
                                    alt={`Storyboard ${shot.shotNumber}`}
                                    className="w-full h-full"
                                    style={{
                                      objectFit: shot.storyboardFit === 'contain' ? 'contain' : 'cover',
                                      objectPosition: `${shot.storyboardPosition?.x ?? 50}% ${shot.storyboardPosition?.y ?? 50}%`,
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="w-16 h-10 rounded border border-dashed border-slate-300 flex items-center justify-center text-[9px] text-slate-400">
                                  No story
                                </div>
                              )}
                            </td>
                          )}
                          <td className="p-2.5 font-mono font-black text-slate-900 text-sm">
                            {shot.shotNumber}
                          </td>
                          <td className="p-2.5 font-bold">
                            {linkedCam ? linkedCam.cameraLabel : '—'}
                          </td>
                          <td className="p-2.5 font-bold uppercase">
                            {shot.shotSize}
                          </td>
                          <td className="p-2.5 font-mono">
                            {shot.lensMm}mm
                          </td>
                          <td className="p-2.5 text-slate-800">
                            {shot.cameraAngle}
                          </td>
                          <td className="p-2.5 text-slate-800">
                            {effectiveMovement(shot, linkedCam)}
                          </td>
                          <td className="p-2.5 text-slate-800">
                            <div className="font-bold text-slate-900">{shot.name}</div>
                            {shot.framingDescription && (
                              <div className="text-[11px] text-slate-600 mt-0.5">
                                {shot.framingDescription}
                              </div>
                            )}
                            {shot.equipmentNotes && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                Equipment: {shot.equipmentNotes}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 font-mono text-center font-bold">
                            {shot.takesCount || 0}
                          </td>
                          <td className="p-2.5 text-center">
                            <div className="w-4 h-4 border border-slate-900 rounded mx-auto" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION E: PRODUCTION EQUIPMENT PACKAGE & GEAR MANIFEST                   */}
          {/* ========================================================================= */}
          {(exportSection === 'equipment' || exportSection === 'combined') && (
            <div className="mb-8 print-section">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Boxes className="w-4 h-4 text-sky-600" />
                  <span>
                    {equipmentScope === 'all'
                      ? 'Master Production Equipment Package & Truck Manifest (All Scenes)'
                      : `Scene ${activeSetup.sceneNumber || '1'} Equipment Package`}
                  </span>
                </h3>
                <span className="font-mono text-xs font-bold text-slate-700">
                  {exportEquipmentItems.reduce((sum, i) => sum + i.quantity, 0)} TOTAL UNITS · {exportEquipmentItems.length} GEAR TYPES
                </span>
              </div>

              {exportEquipmentItems.length === 0 ? (
                <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-4">
                  No equipment recorded for this scene. Add cameras, lights, or custom gear in the Equipment tab.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {EQUIPMENT_CATEGORIES.map((cat) => {
                    const items = exportEquipmentItems.filter((i) => i.category === cat.key);
                    if (items.length === 0) return null;
                    const catTotal = items.reduce((sum, i) => sum + i.quantity, 0);

                    return (
                      <div key={cat.key} className="border border-slate-900 rounded-lg overflow-hidden break-inside-avoid">
                        {/* Rubric Header Banner */}
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-900 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                              {cat.label}
                            </span>
                            <span className="text-[10px] font-mono text-slate-600">
                              ({items.length} items · {catTotal} units)
                            </span>
                          </div>
                        </div>

                        {/* Rubric Table */}
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-300 text-slate-700 font-bold text-[10px] font-mono uppercase">
                              <th className="p-2 w-12 font-mono text-center">QTY</th>
                              <th className="p-2 w-1/5">BRAND</th>
                              <th className="p-2 w-1/4">UNIT NAME & MODEL</th>
                              <th className="p-2 w-1/5">ROLE / FUNCTION</th>
                              <th className="p-2">SPECS / OUTPUT / NOTES</th>
                              {equipmentScope === 'all' && (
                                <th className="p-2 w-1/5 font-mono text-[9px]">SCENE BREAKDOWN</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {items.map((item) => {
                              const masterItem = isMasterEquipmentItem(item) ? item : null;

                              return (
                                <tr key={item.id} className="hover:bg-slate-50/60 font-mono">
                                  <td className="p-2 align-top font-mono font-bold text-sky-700 text-center">
                                    x{item.quantity}
                                  </td>
                                  <td className="p-2 align-top font-semibold text-slate-800 font-sans">
                                    {item.brand || '—'}
                                  </td>
                                  <td className="p-2 align-top font-sans">
                                    <div className="font-bold text-slate-900">{item.name}</div>
                                    {item.model && item.model !== item.name && (
                                      <div className="text-[10px] font-mono text-slate-500">{item.model}</div>
                                    )}
                                    {item.packageItems && item.packageItems.length > 0 && (
                                      <div className="mt-1.5 pt-1 border-t border-slate-200 text-[10px] text-slate-700">
                                        <div className="font-bold text-slate-800 font-mono text-[9px] uppercase tracking-wider mb-0.5">
                                          📦 Package Kit Components:
                                        </div>
                                        <div className="space-y-0.5 font-mono text-[9px]">
                                          {item.packageItems.map((pkgSub) => (
                                            <div key={pkgSub.id} className="flex items-center gap-1">
                                              <span className="font-bold text-sky-700">└─ x{pkgSub.quantity}</span>
                                              <span className="font-semibold text-slate-900">{pkgSub.name}</span>
                                              {pkgSub.brand && <span className="text-slate-500">({pkgSub.brand})</span>}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-2 align-top text-slate-700 font-sans">
                                    {item.roleOrFunction ? (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-semibold">
                                        {item.roleOrFunction}
                                      </span>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                  <td className="p-2 align-top text-slate-600 text-[11px] leading-relaxed font-sans">
                                    {item.specs || '—'}
                                  </td>
                                  {equipmentScope === 'all' && masterItem && (
                                    <td className="p-2 align-top text-[10px] font-mono text-slate-600">
                                      <div>
                                        {describeSceneUsage(masterItem, { sceneLabel: 'Sc' }).join(', ')}
                                      </div>
                                      <div className="text-[9px] text-slate-400 mt-0.5">
                                        Peak: {masterItem.maxConcurrentQuantity} concurrent
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {exportSection === 'combined' && dmxRows.length > 0 && (
            <div className="mb-8 print-section break-before-page">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Sun className="w-4 h-4 text-sky-600" />
                  <span>DMX Patch Sheet</span>
                </h3>
                <span className="font-mono text-xs font-bold text-slate-700">
                  {dmxRows.length} PATCHED FIXTURE{dmxRows.length === 1 ? '' : 'S'}
                </span>
              </div>
              <DmxPatchPrintView
                rows={dmxRows}
                productionTitle={project.title}
                sceneName={`Scene ${activeSetup.sceneNumber || ''}: ${activeSetup.name}`}
                embedded
              />
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION S: STORYBOARD CONTACT SHEET                                        */}
          {/* ========================================================================= */}
          {(exportSection === 'storyboard' || (exportSection === 'combined' && showStoryboards)) && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-violet-600" />
                  <span>Storyboard</span>
                </h3>
                <span className="font-mono text-xs font-bold text-slate-700">
                  {orderedStoryboardShots(activeSetup).reduce(
                    (sum, s) =>
                      sum +
                      visibleStoryboardSlots(
                        s,
                        cameras.find((c) => c.id === s.cameraId),
                        omitBlankWaypoints
                      ).length,
                    0
                  )}{' '}
                  FRAME{orderedStoryboardShots(activeSetup).length === 1 ? '' : 'S'} ·{' '}
                  {activeSetup.aspectRatio || '16:9'}
                </span>
              </div>

              {activeSetup.shots.length === 0 ? (
                <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-4">
                  No shots in this scene yet.
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {orderedStoryboardShots(activeSetup).map((shot) => {
                    const cam = cameras.find((camera) => camera.id === shot.cameraId);
                    // One printed frame per camera keyframe (blank waypoints optionally omitted)
                    const frameSlots = visibleStoryboardSlots(shot, cam, omitBlankWaypoints);
                    const hasMove = frameSlots.length > 1;
                    return (
                      <div
                        key={shot.id}
                        className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid"
                      >
                        <div className="relative border-b border-slate-300">
                          {/* A move prints both frames stacked over each other */}
                          <div className={hasMove ? 'flex flex-col gap-1 bg-slate-200 p-0.5' : ''}>
                            {frameSlots.map((slot) => {
                              const image = slot.frame?.image;
                              const fit = slot.frame?.fit || 'cover';
                              return (
                                <div
                                  key={slot.key}
                                  className="relative w-full bg-slate-100"
                                  style={{ aspectRatio: String(sceneAspectRatio) }}
                                >
                                  {image ? (
                                    <ProjectImage
                                      imageRef={image}
                                      alt=""
                                      className="absolute inset-0 w-full h-full"
                                      style={{ objectFit: fit }}
                                    />
                                  ) : (
                                    // Shots without artwork still print their frame,
                                    // so the board can be drawn in by hand on set.
                                    <span className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-400">
                                      (no storyboard)
                                    </span>
                                  )}
                                  {hasMove && slot.short && (
                                    <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-slate-900 text-white text-[8px] font-mono font-bold">
                                      {slot.short}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-slate-900 text-white text-[10px] font-mono font-bold">
                            {shot.shotNumber}
                          </span>
                          {effectiveMovement(shot, cam) && (
                            <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-amber-500 text-black text-[9px] font-bold">
                              {effectiveMovement(shot, cam)}
                            </span>
                          )}
                        </div>
                        <div className="p-1.5">
                          <p className="text-[11px] font-bold text-slate-900 leading-snug">{shot.name}</p>
                          {shot.framingDescription && (
                            <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
                              {shot.framingDescription}
                            </p>
                          )}
                          <p className="text-[9px] font-mono text-slate-500 mt-1">
                            {shot.shotSize} · {shot.lensMm}mm · {effectiveMovement(shot, cam)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION L1: AV (2-COLUMN) SCRIPT                                           */}
          {/* ========================================================================= */}
          {/* Its own section, and part of the complete package whenever there are
              rows. It used to print only while the script panel sat in AV mode — a
              screenplay-shaped condition on a document that has no screenplay in
              it, so a production with an AV script could not print one without
              flipping a mode that has nothing to do with the document. */}
          {(exportSection === 'avscript' || (exportSection === 'combined' && (avScriptRows || []).length > 0)) && (
            <div className="mb-8 print-section">
              <AvScriptPrintView rows={avScriptRows || []} shots={allShots} />
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION L2: LINED SHOOTING SCRIPT                                          */}
          {/* ========================================================================= */}
          {(exportSection === 'linedscript' || (exportSection === 'combined' && scriptLines.length > 0)) && (
            <div className="mb-8">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-violet-600" />
                    <span>Lined Shooting Script</span>
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-slate-300 p-0.5 print:hidden">
                      <button
                        onClick={() => setScriptScope('lined')}
                        className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
                          scriptScope === 'lined' ? 'bg-sky-600 text-white' : 'text-slate-600'
                        }`}
                      >
                        Lined portions
                      </button>
                      <button
                        onClick={() => setScriptScope('full')}
                        className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
                          scriptScope === 'full' ? 'bg-sky-600 text-white' : 'text-slate-600'
                        }`}
                      >
                        Full screenplay
                      </button>
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-700">
                      {allScriptMarks.length} LINED SHOT{allScriptMarks.length === 1 ? '' : 'S'}
                    </span>
                  </div>
                </div>
                {scriptLines.length === 0 ? (
                  <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-4">
                    No screenplay imported for this scene — load one in the Script panel to print a lined script.
                  </p>
                ) : (
                  <div className="border border-slate-300 rounded-lg p-3 bg-white">
                    {/* The cover, when the production has asked for one. It is
                        a page of its own, so it breaks before the script. */}
                    {project.titlePage?.enabled && hasTitlePageContent(project.titlePage, project.scriptTitle) && (
                      <TitlePageView page={project.titlePage} fallbackTitle={project.scriptTitle} fontSize={11} print isLight />
                    )}
                    {printedScriptLines.length === 0 ? (
                      <p className="text-xs text-slate-500 p-3">
                        Nothing is lined yet — line a shot in the Script panel, or switch to “Full screenplay”.
                      </p>
                    ) : (
                      <LinedScriptPage
                        lines={printedScriptLines}
                        marks={allScriptMarks}
                        shots={allShots}
                        fontSize={11}
                        showShotSize={eff.showShotSizeInScript !== false}
                        isLight
                        print
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {exportSection === 'combined' && reportBreakdown.scenes.length > 0 && (
            <div className="mb-8 print-section break-before-page">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-violet-600" />
                  <span>Script Breakdown Reports</span>
                </h3>
                <span className="font-mono text-xs font-bold text-slate-700">
                  {reportBreakdown.scenes.length} SCENES · {reportCharacterEntries.length} CHARACTERS · {reportDood.columns.length} SHOOTING DAYS
                </span>
              </div>
              <ScriptReportsPrintView
                productionTitle={project.title}
                scenes={reportBreakdown.scenes}
                characters={reportBreakdown.characters}
                characterReports={reportCharacterEntries}
                locations={reportBreakdown.locations}
                dood={reportDood}
                breakdownItems={project.breakdownItems}
                sections={{ scenes: true, characters: true, locations: true, elements: true, dood: true }}
                logo={project.logo}
              />
            </div>
          )}

          {exportSection === 'combined' && packageSides.scenes.length > 0 && (
            <div className="mb-8 print-section break-before-page">
              <ScriptSidesPrintView
                sides={packageSides}
                title={project.title}
                subtitle={project.date}
                logo={project.logo}
              />
            </div>
          )}

          {exportSection === 'combined' && packageBoardDays.length > 0 && (
            <div className="mb-8 print-section break-before-page">
              <StripboardPrintView
                productionTitle={project.title}
                company={project.productionCompany}
                logo={project.logo}
                days={packageBoardDays}
              />
            </div>
          )}

          {exportSection === 'combined' && packageCoverageRows.length > 0 && (
            <div className="mb-8 print-section break-before-page">
              <CoverageMatrixPrintView
                productionTitle={project.title}
                company={project.productionCompany}
                logo={project.logo}
                cameras={project.coverageMatrix?.cameraIds ?? []}
                rows={packageCoverageRows}
              />
            </div>
          )}

          {exportSection === 'combined' && (project.people ?? []).length > 0 && (
            <div className="mb-8 print-section break-before-page">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-emerald-600" />
                  <span>Production Contact List</span>
                </h3>
                <span className="font-mono text-xs font-bold text-slate-700">
                  {(project.people ?? []).length} CONTACT{(project.people ?? []).length === 1 ? '' : 'S'}
                </span>
              </div>
              <ContactListPrintView
                people={project.people ?? []}
                characters={crewCharacters}
                castAssignments={project.castAssignments ?? []}
                logo={project.logo}
              />
            </div>
          )}

          {exportSection === 'combined' && exportBoard && (
            exportCards.length > 0 || (exportBoard.palette ?? []).length > 0
          ) && (
            <div className="mb-8 print-section break-before-page">
              <MoodboardPrintView board={exportBoard} srcs={exportImageSrcs} />
            </div>
          )}

          {/* Print Footer */}
          <div className="hidden print:flex items-center justify-between border-t border-slate-300 pt-3 mt-6 text-[10px] text-slate-500 font-mono">
            <span>{project.title || 'Cinematography Plan'} — Scene {activeSetup.sceneNumber}: {activeSetup.name}</span>
            <span>Generated on {new Date().toLocaleDateString()} · OpenShotDesigner</span>
          </div>
        </div>
      </div>
    </div>
  );
};
