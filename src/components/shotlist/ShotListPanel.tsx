import React, { useEffect, useId, useRef, useState } from 'react';
import { nextCameraLabel } from '../../domain/plan/cameraLabels';
import { createPortal } from 'react-dom';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { CameraElement, CameraMovement, Shot, ShotSize, ShotStatus } from '../../types';
import { CAMERA_ANGLES, CAMERA_MOVEMENTS, SHOT_SIZES, ASPECT_RATIOS } from '../../constants/presets';
import { parseOption } from '../../domain/optionValue';

/** The sort keys `sortShotsBy` accepts, and the values its <option>s carry. */
const SHOT_SORT_VALUES = ['custom', 'shotNumber', 'camera', 'lens', 'status'] as const;
import { keyFrameImage } from '../../utils/storyboardFrames';
import { effectiveMovement, hasCameraMove } from '../../utils/cameraMovement';
import { exportShotListToCsv } from '../../utils/exportShotList';
import { buildPdfFilename, createShotListPdf, shotListRowsFromSetups } from '../../utils/pdf';
import { bytesToBlob, downloadBlob } from '../../utils/download';
import { ProjectImage } from '../common/ProjectImage';
import { CoverageWarnings } from './CoverageWarnings';
import {
  ArrowUpDown,
  Camera,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Film,
  GripVertical,
  Hash,
  Image,
  Layers,
  LayoutGrid,
  Plus,
  Table,
  FileText,
  Trash2,
  Video,
  SlidersHorizontal,
} from 'lucide-react';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
import { PdfExportButton } from '../common/PdfExportButton';

interface CamPickerOption {
  id: string;
  label: string;
}

interface CamPickerProps {
  value: string;
  isLight: boolean;
  options: CamPickerOption[];
  /** Letter the next created camera would get, shown in the "+ New camera" row. */
  nextLetter: string;
  onPick: (cameraId: string | null) => void;
  compact?: boolean;
}

/**
 * CAM cell: a native <select> listing each distinct camera letter (A, B, C...)
 * present on the floor plan plus "No Camera". Changing the selection links the
 * shot to that camera; an occupied camera is copied to preserve its owner's path.
 */
const CamPicker: React.FC<CamPickerProps> = ({ value, isLight, options, nextLetter, onPick, compact }) => {
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <select
        value={value || ''}
        onChange={(e) => {
          onPick(e.target.value || null);
        }}
        title="Link a camera to this shot — several shots can share the same camera"
        className={`appearance-none text-[11px] font-mono font-semibold py-0.5 pl-1.5 pr-6 rounded border cursor-pointer ${
          value
            ? isLight ? 'bg-slate-100 text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'
            : 'bg-amber-500/15 text-amber-600 border-amber-500/30'
        } ${compact ? 'w-24' : 'w-full'}`}
      >
        <option value="">— No Camera —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
        <option value="__new__">+ New camera ({nextLetter})</option>
      </select>
      <ChevronDown className={`pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 ${value ? 'opacity-60' : ''}`} />
    </div>
  );
};

/** The status values a shot can carry, in workflow order. */
const SHOT_STATUSES: ShotStatus[] = ['planned', 'rehearsed', 'ready', 'taken', 'omitted'];

/** Optional columns of the production table. Shot # and name are never hidden. */
type ShotColumnKey = 'cam' | 'size' | 'lens' | 'move' | 'angle' | 'takes' | 'status';

const SHOT_COLUMNS: Array<{ key: ShotColumnKey; label: string }> = [
  { key: 'cam', label: 'Cam' },
  { key: 'size', label: 'Size' },
  { key: 'lens', label: 'Lens' },
  { key: 'move', label: 'Move' },
  { key: 'angle', label: 'Angle' },
  { key: 'takes', label: 'Takes' },
  { key: 'status', label: 'Status' },
];

/** Device preference (rule 38): which columns this browser hides. */
const SHOT_COLUMNS_KEY = 'osd.shotlist.hiddenColumns';

export const ShotListPanel: React.FC = () => {
  // Prefix for pairing each caption with its control (`htmlFor`/`id`). From
  // `useId` so two instances of this panel on screen cannot collide — the
  // captions used to be plain siblings with no `htmlFor`, which meant screen
  // readers announced every one of these inputs unlabelled.
  const fieldId = useId();
  const { project, activeSetup, selectedShotId, selectedElementIds, selectShot, updateShot, deleteShot, insertShotAfter, reorderShots, renumberAllShots, sortShotsBy, createCameraAndShot, assignCameraToShot, addCameraForShot, openViewfinder, setActiveSetupId, startScriptLinking, allScriptMarks } = useFloorPlan();
  const { theme } = useWorkspaceUI();

  const isLight = theme === 'light';
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [filterCamera, setFilterCamera] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  /**
   * Which table columns to show. A device preference, not project data (rule
   * 38): two people looking at the same production want different columns.
   */
  const [hiddenColumns, setHiddenColumns] = useState<Set<ShotColumnKey>>(() => {
    try {
      const saved = localStorage.getItem(SHOT_COLUMNS_KEY);
      return saved ? new Set(JSON.parse(saved) as ShotColumnKey[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const toggleColumn = (key: ShotColumnKey) =>
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(SHOT_COLUMNS_KEY, JSON.stringify([...next]));
      } catch {
        // A device that refuses storage still gets the toggle for this session.
      }
      return next;
    });
  const shows = (key: ShotColumnKey) => !hiddenColumns.has(key);
  // Off by default: the list shows this scene only, unless the user asks for
  // the whole production.
  const [showAllScenes, setShowAllScenes] = useState(false);
  const [expandedShotId, setExpandedShotId] = useState<string | null>(null);
  const [isRenumberMenuOpen, setIsRenumberMenuOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  // Insertion gap the blue line marks: 0 = above the first shot … n = below
  // the last one. Unlike a row index this can express "place at the very end".
  const [dropGap, setDropGap] = useState<number | null>(null);
  const [insertMenu, setInsertMenu] = useState<{ shotId: string; x: number; y: number } | null>(null);
  // Storyboard thumbnails in the shot list (like the print export). Defaults ON
  // when any shot in the current scope already carries a frame.
  const sceneShots = project.setups.find((s) => s.id === activeSetup.id)?.shots || [];
  const hasStoryboards = sceneShots.some((s) => !!s.storyboardImage);
  const [showStoryboards, setShowStoryboards] = useState<boolean>(hasStoryboards);
  // Boards saved after mount (e.g. a frame captured in the viewfinder) must
  // become visible without a reload: flip the column on the first time this
  // scene goes from no boards to some. A manual toggle-off afterwards stays off.
  const storyboardsSeenRef = useRef(hasStoryboards);
  useEffect(() => {
    if (!hasStoryboards) {
      storyboardsSeenRef.current = false;
      return;
    }
    if (!storyboardsSeenRef.current) {
      storyboardsSeenRef.current = true;
      setShowStoryboards(true);
    }
  }, [hasStoryboards]);
  const shotListContainerRef = useRef<HTMLDivElement>(null);
  const dragGhostRef = useRef<HTMLDivElement | null>(null);

  // Aspect ratio the storyboard frames were drawn at, from the scene settings.
  const sceneAspectRatio =
    ASPECT_RATIOS.find((a) => a.value === (activeSetup.aspectRatio || '16:9'))?.ratio || 16 / 9;

  const cameras = activeSetup.elements.filter((e): e is CameraElement => e.type === 'camera');

  // One dropdown entry per camera LETTER. Cameras added via "+ Cam & Shot"
  // are all positions of the default Camera A and share a single entry —
  // only cameras the user actively labels (B, C, ...) show up as additional
  // entries. Options show just the letter, no lens / description clutter.
  const camerasByLabel = new Map<string, CameraElement>();
  cameras.forEach((c) => {
    const label = (c.cameraLabel || 'A').toUpperCase();
    if (!camerasByLabel.has(label)) camerasByLabel.set(label, c);
  });

  // Map a shot's linked camera to its label's dropdown entry
  const camPickerValue = (shot: Shot): string => {
    const cam = cameras.find((c) => c.id === shot.cameraId);
    if (!cam) return '';
    const label = (cam.cameraLabel || 'A').toUpperCase();
    return camerasByLabel.get(label)?.id || '';
  };

  // Key storyboard frame for a shot (the same one the print export shows).
  // `keyFrameImage` reads the frames and falls back to the retired single-image
  // field for projects that still hold one, so both eras show a board.
  const storyboardImageFor = (shot: Shot): string | undefined => keyFrameImage(shot);

  // Pick an existing camera (or null) for a shot. If another shot owns the
  // selected camera, the context copies it so both shots retain their paths.
  const pickCamera = (shot: Shot, cameraId: string | null) => {
    // "+ New camera" adds camera B, C, … to the floor plan and shoots this
    // setup on it; any other choice simply re-links the shot to that camera.
    if (cameraId === '__new__') {
      addCameraForShot(shot.id);
      return;
    }
    assignCameraToShot(shot.id, cameraId);
  };

  /** Letter the next new camera would take (A is the default first camera). */
  // The same rule the context uses when it actually creates the camera. This
  // had its own loop that started at A rather than reserving it, so the letter
  // offered in the dropdown could differ from the one you got — the label
  // promising "A" while the new camera arrived as "C".
  const nextCameraLetter = nextCameraLabel(cameras);

  const camPickerOptions: CamPickerOption[] = Array.from(camerasByLabel.values()).map((c) => ({
    id: c.id,
    label: (c.cameraLabel || 'A').toUpperCase(),
  }));

  // Which scenes' shots are listed: this setup, or every setup in the project.
  const setupIdByShotId = new Map<string, string>();
  project.setups.forEach((setup) => setup.shots.forEach((shot) => setupIdByShotId.set(shot.id, setup.id)));
  const sceneLabelBySetupId = new Map(
    project.setups.map((setup) => [setup.id, setup.sceneNumber || setup.name])
  );
  const sourceShots = showAllScenes ? project.setups.flatMap((setup) => setup.shots) : activeSetup.shots;
  const isForeignShot = (shot: Shot) => setupIdByShotId.get(shot.id) !== activeSetup.id;

  // Filter shots
  const filteredShots = sourceShots.filter((shot) => {
    if (filterCamera !== 'all' && shot.cameraId !== filterCamera) return false;
    if (filterStatus !== 'all' && shot.status !== filterStatus) return false;
    return true;
  });

  /**
   * How many rows are actually put in the DOM.
   *
   * Measured on 2026-09-08: one shot row is 111 DOM nodes, and building 1.000
   * of them costs ~700 ms of raw DOM work in Chrome before React's own
   * reconciliation. The derivations behind them are free by comparison —
   * flattening, sorting and camera lookup over 1.000 shots are all under a
   * millisecond (see utils/__tests__/scale.bench.test.ts). The cost is
   * creating the nodes, which is why `content-visibility: auto` only bought
   * 1.2x when tried: it skips layout, not construction.
   *
   * A feature runs 800–1500 shots, so on an "All scenes" view this is a real
   * ceiling, not a theoretical one.
   *
   * The window slices from the START of `filteredShots`, deliberately: every
   * row's `index` then still matches its position in the full array, so
   * drag-to-reorder arithmetic is untouched. That is what makes this a small,
   * reversible change rather than a virtualisation project — and unlike true
   * virtualisation it keeps browser find-in-page working on what is shown.
   */
  const ROW_WINDOW = 200;
  const [rowLimit, setRowLimit] = useState(ROW_WINDOW);
  const visibleShots = filteredShots.length > rowLimit
    ? filteredShots.slice(0, rowLimit)
    : filteredShots;
  const hiddenShotCount = filteredShots.length - visibleShots.length;

  const linedShotIds = new Set(allScriptMarks.map((mark) => mark.shotId));

  /** Selecting a shot from another scene switches to that scene first. */
  const selectShotAnywhere = (shot: Shot) => {
    const owner = setupIdByShotId.get(shot.id);
    if (owner && owner !== activeSetup.id) setActiveSetupId(owner);
    selectShot(shot.id, true);
  };

  // Auto scroll to active shot when selected via floor plan camera
  useEffect(() => {
    if (selectedShotId && shotListContainerRef.current) {
      const el = document.getElementById(`shot-card-${selectedShotId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedShotId]);

  // Total runtime estimate
  const totalSeconds = activeSetup.shots.reduce((acc, s) => acc + (s.estDurationSeconds || 0), 0);
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}m ${rem < 10 ? '0' : ''}${rem}s`;
  };

  // Drag and Drop handlers

  // Ghost chip that follows the cursor while dragging a shot — dragging from
  // the small grip would otherwise show just the grip icon as the native drag
  // image, with no hint which shot is being moved (the scheduler strips get
  // this for free because their whole row is the drag source).
  const showShotDragGhost = (e: React.DragEvent, shot?: Shot) => {
    const ghost = dragGhostRef.current;
    if (!ghost || !shot || typeof e.dataTransfer.setDragImage !== 'function') return;
    ghost.replaceChildren();
    const chip = document.createElement('div');
    chip.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:8px',
      'padding:6px 12px',
      'border-radius:10px',
      'border:1.5px solid #0ea5e9',
      `background:${isLight ? '#ffffff' : '#0f172a'}`,
      `color:${isLight ? '#334155' : '#e0f2fe'}`,
      'font-size:12px',
      'font-weight:700',
      'line-height:1',
      'box-shadow:0 10px 28px rgba(14,165,233,0.35)',
      'white-space:nowrap',
    ].join(';');
    if (showStoryboards) {
      const thumbSrc = storyboardImageFor(shot);
      if (thumbSrc) {
        const img = document.createElement('img');
        img.src = thumbSrc;
        img.alt = '';
        img.style.cssText = [
          'width:48px',
          `height:${Math.round(48 / sceneAspectRatio)}px`,
          'border-radius:4px',
          `background:${isLight ? '#f1f5f9' : '#020617'}`,
          `object-fit:${shot.storyboardFit === 'contain' ? 'contain' : 'cover'}`,
        ].join(';');
        chip.appendChild(img);
      }
    }
    const num = document.createElement('span');
    num.textContent = shot.shotNumber || '—';
    num.style.cssText =
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#0ea5e9;';
    chip.appendChild(num);
    const camLabel = cameras.find(
      (c: { id: string; cameraLabel?: string }) => c.id === shot.cameraId
    )?.cameraLabel;
    if (camLabel) {
      const cam = document.createElement('span');
      cam.textContent = `CAM ${String(camLabel).toUpperCase()}`;
      cam.style.cssText = [
        'padding:3px 7px',
        'border-radius:999px',
        `background:${isLight ? '#f1f5f9' : '#1e293b'}`,
        'font-family:ui-monospace,SFMono-Regular,Menlo,monospace',
        'font-size:10px',
      ].join(';');
      chip.appendChild(cam);
    }
    const sizeCode = SHOT_SIZES.find((s) => s.value === shot.shotSize)?.code;
    if (sizeCode) {
      const size = document.createElement('span');
      size.textContent = sizeCode;
      size.style.cssText = 'letter-spacing:0.05em;';
      chip.appendChild(size);
    }
    ghost.appendChild(chip);
    e.dataTransfer.setDragImage(ghost, 24, 24);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    showShotDragGhost(e, filteredShots[index]);
  };

  /** Gap implied by the pointer: upper half of a row = before it, lower half = after it. */
  const gapFromPointer = (e: React.DragEvent, index: number) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return index + (e.clientY > rect.top + rect.height / 2 ? 1 : 0);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const gap = gapFromPointer(e, index);
    if (dropGap !== gap) {
      setDropGap(gap);
    }
  };

  const handleDrop = (e: React.DragEvent, gap: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIndex !== null) {
      // After the dragged shot is removed, gaps right of it shift by one.
      const insertAt = gap > draggedIndex ? gap - 1 : gap;
      if (insertAt !== draggedIndex) {
        reorderShots(draggedIndex, insertAt);
      }
    }
    setDraggedIndex(null);
    setDropGap(null);
  };

  // Pointer in the padding below the list or between rows (row handlers stop
  // propagation, so this only sees the dead zones): once it is past the last
  // shot's midpoint the line moves below the list, i.e. "place last".
  const handleDragOverEnd = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!filteredShots.length) return;
    const lastEl = shotListContainerRef.current?.lastElementChild as HTMLElement | null;
    if (!lastEl) return;
    const rect = lastEl.getBoundingClientRect();
    if (e.clientY >= rect.top + rect.height / 2 && dropGap !== filteredShots.length) {
      setDropGap(filteredShots.length);
    }
  };
  const handleDropEnd = (e: React.DragEvent) => {
    handleDrop(e, dropGap ?? filteredShots.length);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDropGap(null);
  };

  // Every "+" quick-add in the shot list does the same thing as "+ Cam & Shot":
  // drops a new camera on the floor plan and creates its shot.
  const handleAddCameraAndShot = (e: React.MouseEvent) => {
    e.stopPropagation();
    createCameraAndShot();
  };

  /**
   * The "+" on a row opens the insert-position choice. The menu is rendered in
   * a portal on <body> and positioned from the button's screen rect — inside
   * the panel it was being clipped by the scrolling list / table container.
   */
  const renderInsertButton = (shot: Shot) => (
    <button
      onClick={(event) => {
        event.stopPropagation();
        if (insertMenu?.shotId === shot.id) {
          setInsertMenu(null);
          return;
        }
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        setInsertMenu({ shotId: shot.id, x: rect.right, y: rect.bottom });
      }}
      title="Insert a shot directly after this shot"
      aria-label="Insert a shot directly after this shot"
      className="p-1 text-sky-500 hover:text-sky-600 hover:bg-sky-500/10 rounded"
    >
      <Plus className="w-3.5 h-3.5" />
    </button>
  );

  const insertMenuOverlay =
    insertMenu &&
    createPortal(
      <>
        <div className="fixed inset-0 z-[90]" onClick={() => setInsertMenu(null)} />
        <div
          className={`fixed z-[91] w-64 max-w-[calc(100vw-1rem)] rounded-xl border shadow-2xl p-1.5 text-left ${
            isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-800 border-slate-700 text-slate-100'
          }`}
          style={{
            // Keep the menu on screen when the row sits near an edge
            left: Math.max(8, Math.min(insertMenu.x - 256, window.innerWidth - 264)),
            top: Math.min(insertMenu.y + 6, window.innerHeight - 150),
          }}
        >
          <button
            onClick={() => {
              insertShotAfter(insertMenu.shotId);
              setInsertMenu(null);
            }}
            className="w-full px-2.5 py-2 rounded-lg hover:bg-sky-500 hover:text-white text-[11px]"
          >
            <strong>Insert as letter (default)</strong>
            <span className="block opacity-70 mt-0.5">Between 1 and 2 becomes 1A; shot 2 stays 2.</span>
          </button>
          <button
            onClick={() => {
              insertShotAfter(insertMenu.shotId, { renumberRest: true });
              setInsertMenu(null);
            }}
            className="w-full px-2.5 py-2 rounded-lg hover:bg-violet-500 hover:text-white text-[11px]"
          >
            <strong>Insert and renumber</strong>
            <span className="block opacity-70 mt-0.5">New shot becomes 2; old shot 2 and following shots shift up.</span>
          </button>
        </div>
      </>,
      document.body
    );

  return (
    <div
      id="shot-list-panel"
      className={`flex flex-col h-full w-full select-none transition-colors ${
        isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'
      }`}
    >
      {insertMenuOverlay}

      {/* 1. Header & Quick Actions */}
      <div className={`p-3 border-b space-y-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/90'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500 border border-sky-500/20">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold tracking-wide uppercase">
                  Shot List
                </h2>
                <span className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-sky-500/15 text-sky-600 font-bold border border-sky-500/30">
                  {activeSetup.shots.length} shots
                </span>
              </div>
              <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Scene {activeSetup.sceneNumber} • {formatTime(totalSeconds)}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Add Camera + Shot Button */}
            <button
              id="btn-add-camera-shot"
              onClick={() => createCameraAndShot()}
              title="Add a new Camera on Floor Plan & Shot in List"
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors shadow-sm"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>+ Cam & Shot</span>
            </button>

            {/* Export CSV / Excel */}
            <button
              onClick={() => exportShotListToCsv(activeSetup, project.title)}
              title="Export Shot List to Excel / CSV spreadsheet"
              aria-label="Export Shot List to Excel / CSV spreadsheet"
              className={`p-1.5 rounded-lg border text-xs transition-colors ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {/* Download PDF */}
            <PdfExportButton
              onClick={() => {
                void (async () => {
                  const bytes = await createShotListPdf({
                    productionTitle: project.title,
                    subtitle: `Scene ${activeSetup.sceneNumber || ''} — ${activeSetup.name || ''}`.trim(),
                    rows: shotListRowsFromSetups([activeSetup]),
                  });
                  downloadBlob(
                    bytesToBlob(bytes, 'application/pdf'),
                    buildPdfFilename({ production: project.title, document: 'shot-list' }),
                  );
                })();
              }}
              title="Shotliste als PDF exportieren"
            />
          </div>
        </div>

        {/* 2. Controls Toolbar (View Toggle, Sorting, Renumbering) */}
        <div className="flex items-center justify-between gap-1.5 pt-1 text-[11px]">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {/* Sort Dropdown */}
            <div className="flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3 opacity-60 flex-shrink-0" />
              <select
                onChange={(e) => sortShotsBy(parseOption(SHOT_SORT_VALUES, e.target.value, 'custom'))}
                className={`text-[11px] border rounded px-1.5 py-0.5 focus:outline-none focus:border-sky-500 ${
                  isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
                title="Sort Shots"
              >
                <option value="custom">Sort: Manual Order</option>
                <option value="shotNumber">Sort: Shot Number</option>
                <option value="camera">Sort: Camera (A-Z)</option>
                <option value="lens">Sort: Focal Length</option>
                <option value="status">Sort: Status</option>
              </select>
            </div>

            {/* Renumber Dropdown Menu */}
            <div className="relative">
              <button
                onClick={() => setIsRenumberMenuOpen((prev) => !prev)}
                title="Auto-Renumber All Shots in Scene"
                aria-expanded={isRenumberMenuOpen}
                className={`flex items-center gap-1 px-1.5 py-0.5 border rounded text-[11px] font-medium transition-colors ${
                  isLight ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
              >
                <Hash className="w-3 h-3 text-sky-500" />
                <span>Renumber</span>
                <ChevronDown className="w-2.5 h-2.5 opacity-60" />
              </button>

              {isRenumberMenuOpen && (
                <div
                  className={`absolute left-0 top-full mt-1 w-48 rounded-lg shadow-xl border z-50 p-1 text-[11px] space-y-0.5 ${
                    isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                  onClick={() => setIsRenumberMenuOpen(false)}
                >
                  <button
                    onClick={() => renumberAllShots('scene_slash_number')}
                    className={`w-full text-left px-2 py-1.5 rounded hover:bg-sky-500 hover:text-white transition-colors flex items-center justify-between font-medium`}
                  >
                    <span>Scene / Shot (Default)</span>
                    <span className="font-mono text-[10px] opacity-75">1/1, 1/2, 1/3</span>
                  </button>
                  <button
                    onClick={() => renumberAllShots('scene_alphabetic')}
                    className={`w-full text-left px-2 py-1.5 rounded hover:bg-sky-500 hover:text-white transition-colors flex items-center justify-between`}
                  >
                    <span>Scene + Letters</span>
                    <span className="font-mono text-[10px] opacity-75">1A, 1B, 1C</span>
                  </button>
                  <button
                    onClick={() => renumberAllShots('numeric')}
                    className={`w-full text-left px-2 py-1.5 rounded hover:bg-sky-500 hover:text-white transition-colors flex items-center justify-between`}
                  >
                    <span>Sequential Numbers</span>
                    <span className="font-mono text-[10px] opacity-75">1, 2, 3...</span>
                  </button>
                  <button
                    onClick={() => renumberAllShots('alphabetic')}
                    className={`w-full text-left px-2 py-1.5 rounded hover:bg-sky-500 hover:text-white transition-colors flex items-center justify-between`}
                  >
                    <span>Letters Only</span>
                    <span className="font-mono text-[10px] opacity-75">A, B, C...</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Filters & columns. The camera and status filters existed in state
              with no way to set them; column visibility is new. Both are view
              preferences, so neither touches project data. */}
          <button
            onClick={() => setShowFilters((prev) => !prev)}
            title="Filter shots and choose which columns to show"
            aria-pressed={showFilters}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold transition-colors ${
              showFilters || filterCamera !== 'all' || filterStatus !== 'all' || hiddenColumns.size > 0
                ? 'bg-sky-600 text-white border-sky-500'
                : isLight
                ? 'bg-slate-100 text-slate-600 border-slate-300 hover:text-slate-900'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              Filter
              {filterCamera !== 'all' || filterStatus !== 'all' || hiddenColumns.size > 0
                ? ` (${
                    (filterCamera !== 'all' ? 1 : 0) +
                    (filterStatus !== 'all' ? 1 : 0) +
                    (hiddenColumns.size > 0 ? 1 : 0)
                  })`
                : ''}
            </span>
          </button>

          {/* Scene scope: this scene only (default) or every scene */}
          <button
            onClick={() => setShowAllScenes((prev) => !prev)}
            title={
              showAllScenes
                ? 'Showing shots from every scene — click to show this scene only'
                : 'Show shots from all scenes in this project'
            }
            aria-pressed={showAllScenes}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold transition-colors ${
              showAllScenes
                ? 'bg-violet-600 text-white border-violet-500'
                : isLight
                ? 'bg-slate-100 text-slate-600 border-slate-300 hover:text-slate-900'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All scenes</span>
          </button>

          {/* View Toggle: Cards vs Table List */}
          <div className={`flex items-center gap-0.5 border rounded-lg p-0.5 ${
            isLight ? 'bg-slate-200/70 border-slate-300' : 'bg-slate-800 border-slate-700'
          }`}>
            <button
              onClick={() => setShowStoryboards((v) => !v)}
              title={
                showStoryboards
                  ? 'Hide storyboard thumbnails from the shot list'
                  : 'Show storyboard thumbnails in the shot list (like the print export)'
              }
              aria-pressed={showStoryboards}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors ${
                showStoryboards
                  ? 'bg-amber-500 text-white shadow-xs'
                  : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Image className="w-3.5 h-3.5" />
              <span>Story</span>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              title="Storyboard / Coverage Cards View"
              aria-pressed={viewMode === 'cards'}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors ${
                viewMode === 'cards'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Production Table / Spreadsheet List View"
              aria-pressed={viewMode === 'table'}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors ${
                viewMode === 'table'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>
        </div>
      </div>

              {showFilters && (
          <div
            className={`mx-3 mb-2 rounded-xl border p-3 space-y-2.5 text-xs ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 block">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Camera
                </span>
                <select
                  value={filterCamera}
                  onChange={(e) => setFilterCamera(e.target.value)}
                  className={`w-full rounded-lg border px-2 py-1.5 ${
                    isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
                  }`}
                >
                  <option value="all">Every camera</option>
                  {cameras.map((camera) => (
                    <option key={camera.id} value={camera.id}>
                      {(camera as { cameraLabel?: string }).cameraLabel || camera.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 block">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Status
                </span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className={`w-full rounded-lg border px-2 py-1.5 ${
                    isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-200'
                  }`}
                >
                  <option value="all">Any status</option>
                  {SHOT_STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Columns
              </span>
              <div className="flex flex-wrap gap-1">
                {SHOT_COLUMNS.map((column) => (
                  <button
                    key={column.key}
                    onClick={() => toggleColumn(column.key)}
                    aria-pressed={shows(column.key)}
                    className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-colors ${
                      shows(column.key)
                        ? 'bg-sky-600 text-white border-sky-500'
                        : isLight
                        ? 'bg-white text-slate-400 border-slate-300 line-through'
                        : 'bg-slate-900 text-slate-500 border-slate-700 line-through'
                    }`}
                  >
                    {column.label}
                  </button>
                ))}
              </div>
              <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Shot number and name always show. Column choices are remembered on this device only.
              </p>
            </div>

            {(filterCamera !== 'all' || filterStatus !== 'all' || hiddenColumns.size > 0) && (
              <button
                onClick={() => {
                  setFilterCamera('all');
                  setFilterStatus('all');
                  setHiddenColumns(new Set());
                  try {
                    localStorage.removeItem(SHOT_COLUMNS_KEY);
                  } catch {
                    // nothing to clear
                  }
                }}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                  isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
                }`}
              >
                Reset filters &amp; columns
              </button>
            )}
          </div>
        )}

        {/* 3. Main Content: Cards View or Table List View */}
      <div
        ref={shotListContainerRef}
        onDragOver={handleDragOverEnd}
        onDrop={handleDropEnd}
        className="flex-1 overflow-y-auto p-2.5 space-y-2 custom-scrollbar"
      >
        {/* Coverage warnings, scoped to whatever the list is showing.
            Collapsed by default: it sits above the thing people opened the
            panel for. */}
        <CoverageWarnings scope={showAllScenes ? 'project' : 'scene'} isLight={isLight} />
        {filteredShots.length === 0 ? (
          <div className={`p-8 text-center border border-dashed rounded-xl my-4 ${isLight ? 'border-slate-300' : 'border-slate-800'}`}>
            <Video className="w-8 h-8 mx-auto text-slate-400 mb-2" />
            <p className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>No shots planned yet</p>
            <p className={`text-[11px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Click "+ Cam & Shot" above to drop a camera on the floor plan and create its shot.
            </p>
            <button
              onClick={() => createCameraAndShot()}
              className="mt-3 px-3 py-1.5 text-xs font-semibold bg-sky-600 text-white rounded-lg hover:bg-sky-500 shadow-sm"
            >
              + Create First Camera & Shot
            </button>
          </div>
        ) : viewMode === 'cards' ? (
          /* ========================================================================= */
          /* CARDS VIEW                                                                */
          /* ========================================================================= */
          visibleShots.map((shot, index) => {
            const isSelected = selectedShotId === shot.id;
            const isCameraSelected = selectedElementIds.includes(shot.cameraId);
            const isExpanded = expandedShotId === shot.id;
            const shotSizeInfo = SHOT_SIZES.find((s) => s.value === shot.shotSize) || SHOT_SIZES[4];
            const linkedCamera = cameras.find((c) => c.id === shot.cameraId);
            const isBeingDragged = draggedIndex === index;
            const isDropBefore = dropGap === index;
            const isDropAfter = dropGap === index + 1;

            return (
              <div
                key={shot.id}
                id={`shot-card-${shot.id}`}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, gapFromPointer(e, index))}
                onDragEnd={handleDragEnd}
                onClick={() => selectShotAnywhere(shot)}
                className={`group relative rounded-xl border transition-all cursor-pointer p-3 ${
                  isBeingDragged ? 'opacity-40 scale-95 border-dashed border-sky-400' : ''
                } ${
                  isDropBefore ? 'border-t-4 border-t-sky-500' : ''
                } ${
                  isDropAfter ? 'border-b-4 border-b-sky-500' : ''
                } ${
                  isSelected || isCameraSelected
                    ? isLight
                      ? 'bg-sky-50/95 border-sky-500 shadow-md ring-1 ring-sky-500'
                      : 'bg-slate-800/95 border-sky-500 shadow-md ring-1 ring-sky-500'
                    : isLight
                    ? 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    : 'bg-slate-800/50 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'
                }`}
              >
                {/* Active Left Indicator */}
                {(isSelected || isCameraSelected) && (
                  <div className="absolute -left-0.5 top-2 bottom-2 w-1.5 bg-sky-500 rounded-r" />
                )}

                {/* Storyboard thumbnail — larger in card view, like the print storyboard */}
                {showStoryboards && storyboardImageFor(shot) && (
                  <div
                    className="overflow-hidden rounded-lg border mb-2 bg-slate-100 dark:bg-slate-950"
                    style={{ aspectRatio: `${sceneAspectRatio} / 1`, maxHeight: 190 }}
                  >
                    <ProjectImage
                      imageRef={storyboardImageFor(shot)}
                      alt={`Storyboard ${shot.shotNumber}`}
                      className="w-full h-full object-cover block pointer-events-none"
                      style={{
                        objectFit: shot.storyboardFit === 'contain' ? 'contain' : 'cover',
                        objectPosition: `${shot.storyboardPosition?.x ?? 50}% ${shot.storyboardPosition?.y ?? 50}%`,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}

                {/* Primary Card Top Row: Grip, Shot # (editable), Camera, Size, Lens, Status, Actions */}
                <div className="flex items-center justify-between gap-1.5">
                  {/* Left: Drag Grip + Editable Shot # + Camera Pill */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      title="Drag to rearrange shot order"
                      className="cursor-grab active:cursor-grabbing p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>

                    {/* Editable Shot Number Badge */}
                    <input
                      type="text"
                      value={shot.shotNumber || '1A'}
                      onChange={(e) => updateShot(shot.id, { shotNumber: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      title="Click to edit shot number"
                      className={`w-12 text-center text-xs font-mono font-bold px-1 py-0.5 rounded border focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                        isLight ? 'bg-slate-100 text-sky-700 border-sky-300' : 'bg-slate-900 text-sky-400 border-sky-500/40'
                      }`}
                    />

                    {/* Linked Camera Combobox */}
                    <div className="relative">
                      <CamPicker
                        compact
                        isLight={isLight}
                        value={camPickerValue(shot)}
                        options={camPickerOptions}
                        nextLetter={nextCameraLetter}
                        onPick={(id) => pickCamera(shot, id)}
                      />
                    </div>

                    {/* Shot Size Pill */}
                    <select
                      value={shot.shotSize}
                      onChange={(e) => updateShot(shot.id, { shotSize: e.target.value as ShotSize })}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-[10px] font-bold uppercase tracking-wider py-0.5 px-1.5 rounded border cursor-pointer ${shotSizeInfo.badgeBg}`}
                    >
                      {SHOT_SIZES.map((sz) => (
                        <option key={sz.value} value={sz.value}>
                          {sz.code}
                        </option>
                      ))}
                    </select>

                    {/* Lens mm */}
                    <select
                      value={shot.lensMm}
                      onChange={(e) => updateShot(shot.id, { lensMm: Number(e.target.value) })}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-[10px] font-mono py-0.5 px-1.5 rounded border cursor-pointer ${
                        isLight ? 'bg-slate-50 text-slate-700 border-slate-200' : 'bg-slate-900 text-slate-300 border-slate-700'
                      }`}
                    >
                      {[14, 18, 24, 28, 35, 50, 75, 85, 105, 135, 200].map((mm) => (
                        <option key={mm} value={mm}>
                          {mm}mm
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Right: Status Dropdown + Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <select
                      value={shot.status}
                      onChange={(e) => updateShot(shot.id, { status: e.target.value as ShotStatus })}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-[10px] font-bold rounded px-1.5 py-0.5 border cursor-pointer ${
                        shot.status === 'taken'
                          ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/40'
                          : shot.status === 'ready'
                          ? 'bg-sky-500/15 text-sky-600 border-sky-500/40'
                          : isLight ? 'bg-white text-slate-700 border-slate-300' : 'bg-slate-900 text-slate-300 border-slate-700'
                      }`}
                    >
                      <option value="planned">Planned</option>
                      <option value="rehearsed">Rehearsed</option>
                      <option value="ready">Ready</option>
                      <option value="taken">Done</option>
                      <option value="omitted">Omit</option>
                    </select>

                    {/* Viewfinder Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openViewfinder(shot.cameraId);
                      }}
                      title="Open Simulated Viewfinder for this Shot"
                      aria-label="Open Simulated Viewfinder for this Shot"
                      className={`p-1 rounded transition-colors ${
                        isLight ? 'text-slate-500 hover:text-sky-600 hover:bg-slate-100' : 'text-slate-400 hover:text-sky-300 hover:bg-slate-700'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    {/* Line this shot into the screenplay */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startScriptLinking(shot.id);
                      }}
                      title={
                        linedShotIds.has(shot.id)
                          ? 'Re-line this shot: highlight the screenplay it covers'
                          : 'Line this shot: highlight the screenplay it covers'
                      }
                      aria-label={
                        linedShotIds.has(shot.id)
                          ? 'Re-line this shot: highlight the screenplay it covers'
                          : 'Line this shot: highlight the screenplay it covers'
                      }
                      className={`p-1 rounded transition-colors ${
                        linedShotIds.has(shot.id)
                          ? 'text-violet-500'
                          : isLight ? 'text-slate-500 hover:text-violet-600 hover:bg-slate-100' : 'text-slate-400 hover:text-violet-300 hover:bg-slate-700'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>

                    {/* Insert directly after this shot (letter behavior is the default). */}
                    {renderInsertButton(shot)}

                    {/* Expand/Collapse Toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedShotId(isExpanded ? null : shot.id);
                      }}
                      title={isExpanded ? 'Collapse shot details' : 'Expand shot details'}
                      aria-label={isExpanded ? 'Collapse shot details' : 'Expand shot details'}
                      aria-expanded={isExpanded}
                      className={`p-1 rounded transition-colors ${
                        isLight ? 'text-slate-400 hover:text-slate-800 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Editable Shot Name / Subject */}
                <div className="mt-2">
                  <input
                    type="text"
                    value={shot.name}
                    onChange={(e) => updateShot(shot.id, { name: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Shot Name / Action Description..."
                    className={`w-full text-xs font-semibold px-2 py-1 rounded-lg border focus:outline-none focus:border-sky-500 transition-colors ${
                      isLight ? 'bg-slate-50 text-slate-800 border-slate-200 focus:bg-white' : 'bg-slate-900/80 text-slate-200 border-slate-700 focus:bg-slate-950'
                    }`}
                  />
                </div>

                {/* Movement, Angle & Takes quick row with interactive Dropdowns */}
                <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-slate-200 dark:border-slate-700/60 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    {/* Camera Movement Dropdown */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Move:</span>
                      <select
                        value={effectiveMovement(shot, linkedCamera)}
                        onChange={(e) => updateShot(shot.id, { movement: e.target.value as CameraMovement })}
                        title={hasCameraMove(linkedCamera) ? 'This camera has a move path — it cannot be static' : undefined}
                        className={`text-[10px] font-semibold py-0.5 px-1.5 rounded border cursor-pointer focus:outline-none focus:border-sky-500 ${
                          isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'
                        }`}
                      >
                        {CAMERA_MOVEMENTS.map((m) => (
                          <option key={m.value} value={m.value} disabled={m.value === 'Static' && hasCameraMove(linkedCamera)}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Camera Angle Dropdown */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Angle:</span>
                      <select
                        value={shot.cameraAngle || 'Eye Level'}
                        onChange={(e) =>
                          updateShot(shot.id, {
                            cameraAngle: parseOption(
                              CAMERA_ANGLES,
                              e.target.value,
                              shot.cameraAngle || 'Eye Level',
                            ),
                          })
                        }
                        className={`text-[10px] font-semibold py-0.5 px-1.5 rounded border cursor-pointer focus:outline-none focus:border-sky-500 ${
                          isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'
                        }`}
                      >
                        {CAMERA_ANGLES.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Takes Counter */}
                  <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] font-medium opacity-75">Takes:</span>
                    <div className={`flex items-center border rounded-lg ${isLight ? 'border-slate-300 bg-slate-100' : 'border-slate-700 bg-slate-900'}`}>
                      <button
                        onClick={() => updateShot(shot.id, { takesCount: Math.max(0, (shot.takesCount || 0) - 1) })}
                        title="One fewer take"
                        aria-label={`One fewer take for shot ${shot.shotNumber}`}
                        className={`px-2 py-0.5 text-xs font-bold ${isLight ? 'hover:bg-slate-200 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
                      >
                        -
                      </button>
                      <span className="px-2 font-mono text-sky-500 font-bold text-xs">{shot.takesCount || 0}</span>
                      <button
                        onClick={() => updateShot(shot.id, { takesCount: (shot.takesCount || 0) + 1 })}
                        title="One more take"
                        aria-label={`One more take for shot ${shot.shotNumber}`}
                        className={`px-2 py-0.5 text-xs font-bold ${isLight ? 'hover:bg-slate-200 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Full Coverage Inspector */}
                {isExpanded && (
                  <div
                    className={`mt-2.5 pt-2.5 border-t space-y-2 text-xs ${isLight ? 'border-slate-200 text-slate-700' : 'border-slate-700/60 text-slate-300'}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor={`${fieldId}-movement`} className="text-[9px] font-bold tracking-wider uppercase opacity-60 block mb-0.5">MOVEMENT</label>
                        <select id={`${fieldId}-movement`}
                          value={effectiveMovement(shot, linkedCamera)}
                          onChange={(e) => updateShot(shot.id, { movement: e.target.value as CameraMovement })}
                          title={hasCameraMove(linkedCamera) ? 'This camera has a move path — it cannot be static' : undefined}
                          className={`w-full text-xs border rounded-lg p-1.5 ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'}`}
                        >
                          {CAMERA_MOVEMENTS.map((m) => (
                            <option key={m.value} value={m.value} disabled={m.value === 'Static' && hasCameraMove(linkedCamera)}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor={`${fieldId}-camera-angle`} className="text-[9px] font-bold tracking-wider uppercase opacity-60 block mb-0.5">CAMERA ANGLE</label>
                        <select id={`${fieldId}-camera-angle`}
                          value={shot.cameraAngle}
                          onChange={(e) =>
                          updateShot(shot.id, {
                            cameraAngle: parseOption(
                              CAMERA_ANGLES,
                              e.target.value,
                              shot.cameraAngle || 'Eye Level',
                            ),
                          })
                        }
                          className={`w-full text-xs border rounded-lg p-1.5 ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'}`}
                        >
                          {CAMERA_ANGLES.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Framing & Action description */}
                    <div>
                      <label htmlFor={`${fieldId}-framing-action-notes`} className="text-[9px] font-bold tracking-wider uppercase opacity-60 block mb-0.5">FRAMING & ACTION NOTES</label>
                      <textarea id={`${fieldId}-framing-action-notes`}
                        value={shot.framingDescription}
                        onChange={(e) => updateShot(shot.id, { framingDescription: e.target.value })}
                        placeholder="e.g. OTS John looking at Sarah. Camera dollies left as John stands up..."
                        rows={2}
                        className={`w-full text-xs border rounded-lg p-2 focus:border-sky-500 focus:outline-none ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={handleAddCameraAndShot}
                        className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-semibold"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Add Camera & Shot</span>
                      </button>

                      <button
                        onClick={() => deleteShot(shot.id)}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 px-2 py-1 rounded transition-colors font-medium"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete Shot</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          /* ========================================================================= */
          /* TABLE LIST VIEW (PRODUCTION SPREADSHEET)                                  */
          /* ========================================================================= */
          <div className={`overflow-x-auto rounded-xl border ${isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'}`}>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={`border-b text-[10px] uppercase tracking-wider font-bold ${
                  isLight ? 'bg-slate-100/80 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}>
                  <th className="py-2.5 px-2 w-8 text-center"></th>
                  {showStoryboards && <th className="py-2.5 px-2 w-12">Story</th>}
                  <th className="py-2.5 px-2 w-14">Shot #</th>
                  <th className="py-2.5 px-2">Shot Name / Action</th>
                  {shows('cam') && <th className="py-2.5 px-2 w-24">Cam</th>}
                  {shows('size') && <th className="py-2.5 px-2 w-16">Size</th>}
                  {shows('lens') && <th className="py-2.5 px-2 w-16">Lens</th>}
                  {shows('move') && <th className="py-2.5 px-2 w-20">Move</th>}
                  {shows('angle') && <th className="py-2.5 px-2 w-20">Angle</th>}
                  {shows('takes') && <th className="py-2.5 px-2 w-16 text-center">Takes</th>}
                  {shows('status') && <th className="py-2.5 px-2 w-20">Status</th>}
                  <th className="py-2.5 px-2 w-16 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {visibleShots.map((shot, index) => {
                  const isSelected = selectedShotId === shot.id;
                  const foreign = isForeignShot(shot);
                  const linkedCamera = cameras.find((c) => c.id === shot.cameraId);
                  const isBeingDragged = draggedIndex === index;
                  const isDropBefore = dropGap === index;
                  const isDropAfter = dropGap === index + 1;

                  return (
                    <tr
                      key={shot.id}
                      id={`shot-card-${shot.id}`}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, gapFromPointer(e, index))}
                      onDragEnd={handleDragEnd}
                      onClick={() => selectShotAnywhere(shot)}
                      className={`cursor-pointer transition-colors ${
                        isBeingDragged ? 'opacity-30 bg-sky-100 dark:bg-sky-950' : ''
                      } ${
                        isDropBefore ? 'border-t-2 border-t-sky-500' : ''
                      } ${
                        isDropAfter ? 'border-b-2 border-b-sky-500' : ''
                      } ${
                        isSelected
                          ? isLight ? 'bg-sky-50 font-medium' : 'bg-slate-800 font-medium'
                          : isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/60'
                      }`}
                    >
                      {/* Drag Handle (reordering only makes sense within a scene) */}
                      <td className="py-2 px-1 text-center">
                        {showAllScenes ? (
                          <span
                            title={`Scene ${sceneLabelBySetupId.get(setupIdByShotId.get(shot.id) || '') || ''}`}
                            className={`text-[9px] font-mono font-bold px-1 py-0.5 rounded ${
                              foreign
                                ? isLight ? 'bg-violet-100 text-violet-700' : 'bg-violet-500/20 text-violet-300'
                                : isLight ? 'bg-sky-100 text-sky-700' : 'bg-sky-500/20 text-sky-300'
                            }`}
                          >
                            {sceneLabelBySetupId.get(setupIdByShotId.get(shot.id) || '') || '—'}
                          </span>
                        ) : (
                          <div
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            className="cursor-grab text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex justify-center"
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </td>

                      {/* Small storyboard thumbnail (kept tiny so rows stay compact) */}
                      {showStoryboards && (
                        <td className="py-1 px-2 align-middle" onClick={(e) => e.stopPropagation()}>
                          {storyboardImageFor(shot) ? (
                            <div
                              className="overflow-hidden rounded border bg-slate-100 dark:bg-slate-950"
                              style={{ width: 40, aspectRatio: `${sceneAspectRatio} / 1` }}
                            >
                              <ProjectImage
                                imageRef={storyboardImageFor(shot)}
                                alt={`Storyboard ${shot.shotNumber}`}
                                className="w-full h-full block"
                                style={{
                                  objectFit: shot.storyboardFit === 'contain' ? 'contain' : 'cover',
                                  objectPosition: `${shot.storyboardPosition?.x ?? 50}% ${shot.storyboardPosition?.y ?? 50}%`,
                                }}
                              />
                            </div>
                          ) : (
                            <div
                              className="rounded border border-dashed flex items-center justify-center text-[9px] text-slate-400"
                              style={{ width: 40, aspectRatio: `${sceneAspectRatio} / 1` }}
                            >
                              —
                            </div>
                          )}
                        </td>
                      )}

                      {/* Editable Shot Number */}
                      <td className="py-2 px-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={shot.shotNumber || `${activeSetup.sceneNumber || '1'}/${index + 1}`}
                          onChange={(e) => updateShot(shot.id, { shotNumber: e.target.value })}
                          className={`w-12 text-center text-xs font-mono font-bold py-0.5 px-1 rounded border focus:outline-none focus:border-sky-500 ${
                            isLight ? 'bg-slate-50 text-sky-700 border-slate-300' : 'bg-slate-950 text-sky-400 border-slate-700'
                          }`}
                        />
                      </td>

                      {/* Editable Shot Name */}
                      <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={shot.name}
                          onChange={(e) => updateShot(shot.id, { name: e.target.value })}
                          placeholder="Shot description..."
                          className={`w-full text-xs py-0.5 px-1.5 rounded border border-transparent hover:border-slate-300 focus:border-sky-500 focus:outline-none ${
                            isLight ? 'text-slate-800 bg-transparent focus:bg-white' : 'text-slate-200 bg-transparent focus:bg-slate-950'
                          }`}
                        />
                      </td>

                      {/* Camera Combobox */}
                      {shows('cam') && (
                        <td className="py-2 px-1.5" onClick={(e) => e.stopPropagation()}>
                        <CamPicker
                        isLight={isLight}
                        value={camPickerValue(shot)}
                        options={camPickerOptions}
                        nextLetter={nextCameraLetter}
                        onPick={(id) => pickCamera(shot, id)}
                        />
                        </td>
                      )}

                      {/* Shot Size */}
                      {shows('size') && (
                        <td className="py-2 px-1.5" onClick={(e) => e.stopPropagation()}>
                        <select
                        value={shot.shotSize}
                        onChange={(e) => updateShot(shot.id, { shotSize: e.target.value as ShotSize })}
                        className={`w-full text-[10px] font-bold py-0.5 px-1 rounded border ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                        }`}
                        >
                        {SHOT_SIZES.map((sz) => (
                        <option key={sz.value} value={sz.value}>
                        {sz.code}
                        </option>
                        ))}
                        </select>
                        </td>
                      )}

                      {/* Lens */}
                      {shows('lens') && (
                        <td className="py-2 px-1.5" onClick={(e) => e.stopPropagation()}>
                        <select
                        value={shot.lensMm}
                        onChange={(e) => updateShot(shot.id, { lensMm: Number(e.target.value) })}
                        className={`w-full text-[10px] font-mono py-0.5 px-1 rounded border ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                        }`}
                        >
                        {[14, 18, 24, 28, 35, 50, 75, 85, 105, 135, 200].map((mm) => (
                        <option key={mm} value={mm}>
                        {mm}mm
                        </option>
                        ))}
                        </select>
                        </td>
                      )}

                      {/* Movement */}
                      {shows('move') && (
                        <td className="py-2 px-1.5" onClick={(e) => e.stopPropagation()}>
                        <select
                        value={effectiveMovement(shot, linkedCamera)}
                        onChange={(e) => updateShot(shot.id, { movement: e.target.value as CameraMovement })}
                        title={hasCameraMove(linkedCamera) ? 'This camera has a move path — it cannot be static' : undefined}
                        className={`w-full text-[10px] py-0.5 px-1 rounded border ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                        }`}
                        >
                        {CAMERA_MOVEMENTS.map((m) => (
                        <option key={m.value} value={m.value} disabled={m.value === 'Static' && hasCameraMove(linkedCamera)}>
                        {m.label}
                        </option>
                        ))}
                        </select>
                        </td>
                      )}

                      {/* Angle */}
                      {shows('angle') && (
                        <td className="py-2 px-1.5" onClick={(e) => e.stopPropagation()}>
                        <select
                        value={shot.cameraAngle || 'Eye Level'}
                        onChange={(e) =>
                          updateShot(shot.id, {
                            cameraAngle: parseOption(
                              CAMERA_ANGLES,
                              e.target.value,
                              shot.cameraAngle || 'Eye Level',
                            ),
                          })
                        }
                        className={`w-full text-[10px] py-0.5 px-1 rounded border ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                        }`}
                        >
                        {CAMERA_ANGLES.map((a) => (
                        <option key={a} value={a}>
                        {a}
                        </option>
                        ))}
                        </select>
                        </td>
                      )}

                      {/* Takes */}
                      {shows('takes') && (
                        <td className="py-2 px-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1 font-mono text-xs font-bold text-sky-500">
                        <button
                        onClick={() => updateShot(shot.id, { takesCount: Math.max(0, (shot.takesCount || 0) - 1) })}
                        title="One fewer take"
                        aria-label={`One fewer take for shot ${shot.shotNumber}`}
                        className="px-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                        -
                        </button>
                        <span>{shot.takesCount || 0}</span>
                        <button
                        onClick={() => updateShot(shot.id, { takesCount: (shot.takesCount || 0) + 1 })}
                        title="One more take"
                        aria-label={`One more take for shot ${shot.shotNumber}`}
                        className="px-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                        +
                        </button>
                        </div>
                        </td>
                      )}

                      {/* Status */}
                      {shows('status') && (
                        <td className="py-2 px-1.5" onClick={(e) => e.stopPropagation()}>
                        <select
                        value={shot.status}
                        onChange={(e) => updateShot(shot.id, { status: e.target.value as ShotStatus })}
                        className={`w-full text-[10px] font-bold py-0.5 px-1 rounded border ${
                        shot.status === 'taken'
                        ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/40'
                        : shot.status === 'ready'
                        ? 'bg-sky-500/15 text-sky-600 border-sky-500/40'
                        : isLight ? 'bg-white text-slate-700 border-slate-300' : 'bg-slate-950 text-slate-300 border-slate-700'
                        }`}
                        >
                        <option value="planned">Planned</option>
                        <option value="ready">Ready</option>
                        <option value="taken">Done</option>
                        <option value="omitted">Omit</option>
                        </select>
                        </td>
                      )}

                      {/* Actions */}
                      <td className="py-2 px-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openViewfinder(shot.cameraId)}
                            title="Simulate Camera Viewfinder"
                            aria-label="Simulate Camera Viewfinder"
                            className="p-1 text-slate-400 hover:text-sky-500 rounded"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => startScriptLinking(shot.id)}
                            title={
                              linedShotIds.has(shot.id)
                                ? 'Re-line this shot in the script'
                                : 'Line this shot in the script'
                            }
                            aria-label={
                              linedShotIds.has(shot.id)
                                ? 'Re-line this shot in the script'
                                : 'Line this shot in the script'
                            }
                            className={`p-1 rounded ${
                              linedShotIds.has(shot.id) ? 'text-violet-500' : 'text-slate-400 hover:text-violet-500'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          {renderInsertButton(shot)}
                          <button
                            onClick={() => deleteShot(shot.id)}
                            title="Delete Shot"
                            aria-label="Delete Shot"
                            className="p-1 text-red-400 hover:text-red-500 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Footer */}
      <div
        ref={dragGhostRef}
        aria-hidden="true"
        style={{ position: 'fixed', top: 0, left: -10000, pointerEvents: 'none' }}
      />
      {/*
        Never hide rows silently. A shot list that quietly stops at 200 would
        have a producer conclude their shots were lost; the count and the way
        out are both stated, and the list is complete in every export
        regardless of what is on screen here.
      */}
      {hiddenShotCount > 0 && (
        <div className={`px-2.5 py-2 border-t flex items-center justify-between gap-2 text-[11px] ${
          isLight ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-amber-900/60 bg-amber-950/30 text-amber-200'
        }`}>
          <span>
            Showing the first <strong>{visibleShots.length}</strong> of {filteredShots.length} shots.
            Exports and reports always include all of them.
          </span>
          <button
            type="button"
            onClick={() => setRowLimit(filteredShots.length)}
            className="shrink-0 px-2 py-1 rounded-md font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            Show all {filteredShots.length}
          </button>
        </div>
      )}
      <div className={`p-2.5 border-t text-[11px] flex items-center justify-between ${
        isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-slate-800 bg-slate-950/80 text-slate-400'
      }`}>
        <span className="flex items-center gap-1 font-mono">
          <Layers className="w-3.5 h-3.5 text-sky-500" />
          Drag rows or cards to reorder
        </span>
        <button
          onClick={handleAddCameraAndShot}
          className="text-sky-500 hover:text-sky-600 font-bold flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Shot</span>
        </button>
      </div>
    </div>
  );
};
