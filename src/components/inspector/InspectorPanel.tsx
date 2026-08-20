import React, { useEffect, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  ActorElement,
  ArrowElement,
  CameraElement,
  DoorElement,
  FloorPlanElement,
  LightElement,
  PropElement,
  ShapeElement,
  Shot,
  ShapeType,
  TextElement,
  WallElement,
  Waypoint,
  WindowElement,
} from '../../types';
import {
  ACTOR_COLOR_PALETTE,
  ASPECT_RATIOS,
  CAMERA_COLOR_PALETTE,
  CAMERA_HEIGHTS,
  CAMERA_RIGS,
  DEFAULT_FLAG_SIZE,
  FLAG_SIZE_PRESETS,
  FOCAL_LENGTH_PRESETS,
  LIGHT_FIXTURES,
  LIGHTING_BRANDS,
  LIGHT_ROLES,
  PROP_CATALOG,
  SENSOR_FORMATS,
} from '../../constants/presets';
import { flagLabel, isFlagFixture } from '../canvas/FlagFixtureIcon';
import { ensureHexColor, hexToHsv, hexToRgbParts, hsvToHex, kelvinToHex, kelvinToRgb, rgbToHex } from '../../utils/geometry';
import { APERTURES, FRAME_RATES, ISO_VALUES, ND_FILTERS, SHUTTER_ANGLES } from '../../constants/presets';

const SHAPE_TYPES: ShapeType[] = [
  'line',
  'rectangle',
  'circle',
  'ellipse',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'star',
];
import { loadLogoFile, loadStoryboardImageFile } from '../../utils/image';
import { framesOf, setFramePatch, slotsOf } from '../../utils/storyboardFrames';
import {
  Camera,
  Circle,
  Compass,
  Copy,
  DoorClosed,
  Eye,
  EyeOff,
  Film,
  Flame,
  FlipHorizontal,
  Image as ImageIcon,
  ImagePlus,
  Lightbulb,
  Lock,
  Maximize,
  Move3d,
  Palette,
  RotateCcw,
  RotateCw,
  Sliders,
  SquareSplitHorizontal,
  Sun,
  Trash2,
  Tv,
  Unlock,
  User,
  Users,
  Video,
  AppWindow,
  Tags,
  Grid3x3,
  AlignLeft,
  AlignRight,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignStartVertical,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
  ChevronDown,
  ChevronRight,
  Gauge,
  Layers,
  Sparkles,
  SlidersHorizontal,
  Settings2,
  Square,
  Type,
  MoveRight,
} from 'lucide-react';

type AlignMode = 'left' | 'right' | 'hcenter' | 'top' | 'bottom' | 'vcenter';

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Approximate 2D bounding box of an element on the floor plan, used for align/distribute. */
function getElementBounds(el: FloorPlanElement): Bounds {
  if (el.type === 'prop' || el.type === 'shape') {
    const w = (el as any).width || 80;
    const h = (el as any).height || 50;
    return { minX: el.x - w / 2, minY: el.y - h / 2, maxX: el.x + w / 2, maxY: el.y + h / 2 };
  }
  if (el.type === 'wall') {
    const x2 = (el as any).x2 ?? el.x;
    const y2 = (el as any).y2 ?? el.y;
    return { minX: Math.min(el.x, x2), minY: Math.min(el.y, y2), maxX: Math.max(el.x, x2), maxY: Math.max(el.y, y2) };
  }
  if (el.type === 'door' || el.type === 'window') {
    const w = (el as any).width || 60;
    const h = 18;
    return { minX: el.x - w / 2, minY: el.y - h / 2, maxX: el.x + w / 2, maxY: el.y + h / 2 };
  }
  if (el.type === 'light') return { minX: el.x - 14, minY: el.y - 14, maxX: el.x + 14, maxY: el.y + 14 };
  if (el.type === 'actor') return { minX: el.x - 22, minY: el.y - 22, maxX: el.x + 22, maxY: el.y + 22 };
  if (el.type === 'camera') return { minX: el.x - 22, minY: el.y - 22, maxX: el.x + 22, maxY: el.y + 22 };
  return { minX: el.x - 15, minY: el.y - 15, maxX: el.x + 15, maxY: el.y + 15 };
}

/** Compact on/off pill used in the Display & Labels panel */
const PillToggle: React.FC<{
  on: boolean;
  onClick: () => void;
  label: string;
  isLight: boolean;
}> = ({ on, onClick, label, isLight }) => (
  <button
    onClick={onClick}
    className={`py-1.5 text-[10px] font-semibold rounded-lg border flex items-center justify-center gap-1 transition-colors ${
      on
        ? isLight ? 'bg-teal-50 text-teal-700 border-teal-300' : 'bg-teal-950/40 text-teal-300 border-teal-800'
        : isLight ? 'bg-slate-100 text-slate-500 border-slate-300' : 'bg-slate-900 text-slate-500 border-slate-800'
    }`}
  >
    {label}
  </button>
);

/** Storyboard image uploader — reads an image file and stores it as a data URL
 *  (embedded inside the saved project JSON), OR links an external image URL so
 *  the project references it instead. Previews it inside the scene's aspect
 *  ratio frame, with fit + pan controls. */
const StoryboardField: React.FC<{
  label: string;
  value?: string;
  onChange: (url: string | null) => void;
  aspectRatio: number;
  fit?: 'cover' | 'contain';
  position?: { x: number; y: number };
  onFitChange?: (fit: 'cover' | 'contain') => void;
  onPositionChange?: (pos: { x: number; y: number }) => void;
  isLight: boolean;
}> = ({ label, value, onChange, aspectRatio, fit, position, onFitChange, onPositionChange, isLight }) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [imgError, setImgError] = useState(false);

  // Re-test the image whenever the source changes (upload or re-link).
  useEffect(() => {
    setImgError(false);
  }, [value]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Downscaled so big photos still fit in the browser's storage.
    loadStoryboardImageFile(file)
      .then((dataUrl) => onChange(dataUrl))
      .catch(() => setImgError(true));
    e.target.value = '';
  };

  const applyLink = () => {
    const url = linkDraft.trim();
    if (!url) return;
    onChange(url);
    setLinkDraft('');
    setShowLinkInput(false);
  };

  const isEmbedded = !!value && value.startsWith('data:');
  const ratio = aspectRatio > 0 ? aspectRatio : 16 / 9;
  const curFit = fit || 'cover';
  const posX = position?.x ?? 50;

  return (
    <div>
      <label className="opacity-60 block mb-1">{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
      {value ? (
        <div className={`rounded-lg overflow-hidden border ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>
          {/* Aspect-ratio framed preview */}
          <div
            className="w-full bg-slate-100 overflow-hidden"
            style={{ aspectRatio: `${ratio} / 1`, position: 'relative' }}
          >
            {imgError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center p-2 bg-slate-200 dark:bg-slate-900">
                <ImageIcon className="w-5 h-5 text-slate-400" />
                <span className="text-[10px] font-semibold text-slate-500">
                  Storyboard image could not be loaded.
                </span>
                <span className="text-[9px] text-slate-400">
                  The file may have moved. Re-link or upload it again.
                </span>
              </div>
            ) : (
              <img
                src={value}
                alt={label}
                className="absolute inset-0 w-full h-full"
                onError={() => setImgError(true)}
                style={{
                  objectFit: curFit === 'cover' ? 'cover' : 'contain',
                  objectPosition: `${posX}% ${position?.y ?? 50}%`,
                  background: '#0f172a',
                }}
              />
            )}
          </div>

          {/* Fit + framing controls */}
          <div className="p-1.5 border-t space-y-1.5">
            <div className="flex gap-1">
              <button
                onClick={() => onFitChange?.('cover')}
                className={`flex-1 py-1 text-[10px] font-semibold rounded border transition-colors ${
                  curFit === 'cover'
                    ? 'bg-violet-600 text-white border-violet-500'
                    : isLight ? 'bg-slate-50 text-slate-600 border-slate-300' : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                Crop to frame
              </button>
              <button
                onClick={() => onFitChange?.('contain')}
                className={`flex-1 py-1 text-[10px] font-semibold rounded border transition-colors ${
                  curFit === 'contain'
                    ? 'bg-violet-600 text-white border-violet-500'
                    : isLight ? 'bg-slate-50 text-slate-600 border-slate-300' : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                Fit whole image
              </button>
            </div>
            {curFit === 'cover' && (
              <div>
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="opacity-60">Horizontal framing</span>
                  <span className="font-mono font-bold text-violet-500">{Math.round(posX)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={posX}
                  onChange={(e) => onPositionChange?.({ x: Number(e.target.value), y: position?.y ?? 50 })}
                  className="w-full accent-violet-500 cursor-pointer"
                />
              </div>
            )}

            {/* Storage note */}
            <p className={`text-[9px] leading-snug ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
              {isEmbedded
                ? 'Embedded in the project file — saves and loads everywhere with the project.'
                : 'Linked by URL — only loads when this address is reachable.'}
            </p>

            <div className="flex">
              <button
                onClick={() => inputRef.current?.click()}
                className={`flex-1 py-1.5 text-[10px] font-semibold border-t ${
                  isLight ? 'text-sky-700 border-slate-200 hover:bg-sky-50' : 'text-sky-300 border-slate-700 hover:bg-slate-800'
                }`}
              >
                Replace
              </button>
              <button
                onClick={() => setShowLinkInput((v) => !v)}
                className={`flex-1 py-1.5 text-[10px] font-semibold border-t border-l ${
                  showLinkInput
                    ? 'text-violet-600 dark:text-violet-300'
                    : isLight ? 'text-violet-700 border-slate-200 hover:bg-violet-50' : 'text-violet-300 border-slate-700 hover:bg-slate-800'
                }`}
              >
                {showLinkInput ? 'Cancel' : 'Link URL'}
              </button>
              <button
                onClick={() => onChange(null)}
                className={`flex-1 py-1.5 text-[10px] font-semibold border-t border-l ${
                  isLight ? 'text-red-600 border-slate-200 hover:bg-red-50' : 'text-red-400 border-slate-700 hover:bg-red-950/40'
                }`}
              >
                Remove
              </button>
            </div>

            {showLinkInput && (
              <div className="flex gap-1 pt-1.5">
                <input
                  type="text"
                  value={linkDraft}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyLink()}
                  placeholder="https://…/frame.jpg or relative/path.jpg"
                  className={`flex-1 text-[11px] border rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-500 ${
                    isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
                <button
                  onClick={applyLink}
                  className="px-2.5 py-1.5 text-[10px] font-semibold bg-violet-600 hover:bg-violet-500 text-white rounded-lg"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <button
            onClick={() => inputRef.current?.click()}
            className={`w-full py-3 rounded-lg border border-dashed text-[11px] font-semibold transition-colors ${
              isLight ? 'text-slate-500 border-slate-300 hover:bg-slate-50' : 'text-slate-400 border-slate-700 hover:bg-slate-800'
            }`}
          >
            + Attach Storyboard Image
          </button>
          <button
            onClick={() => setShowLinkInput((v) => !v)}
            className={`w-full py-2 rounded-lg border border-dashed text-[10px] font-semibold transition-colors ${
              isLight ? 'text-violet-600 border-violet-300 hover:bg-violet-50' : 'text-violet-300 border-violet-800 hover:bg-slate-800'
            }`}
          >
            {showLinkInput ? 'Cancel linking' : 'or Link Image by URL…'}
          </button>
          {showLinkInput && (
            <div className="flex gap-1">
              <input
                type="text"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyLink()}
                placeholder="https://…/frame.jpg or relative/path.jpg"
                className={`flex-1 text-[11px] border rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-500 ${
                  isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              />
              <button
                onClick={applyLink}
                className="px-2.5 py-1.5 text-[10px] font-semibold bg-violet-600 hover:bg-violet-500 text-white rounded-lg"
              >
                Apply
              </button>
            </div>
          )}
          <p className={`text-[9px] leading-snug ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
            Uploading embeds the image in the project file (self-contained). Linking stores only the
            URL — the image must stay reachable for it to display later.
          </p>
        </div>
      )}
    </div>
  );
};
const RubricSection: React.FC<{
  title: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  isLight: boolean;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  className?: string;
}> = ({
  title,
  icon,
  badge,
  defaultOpen = true,
  isLight,
  children,
  headerRight,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={`rounded-xl border transition-all overflow-hidden ${
        isLight ? 'bg-slate-50/70 border-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.04)]' : 'bg-slate-950/40 border-slate-800'
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2.5 flex items-center justify-between text-left transition-colors select-none ${
          isLight
            ? 'hover:bg-slate-100/70 text-slate-800'
            : 'hover:bg-slate-800/50 text-slate-200'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-sky-500 flex-shrink-0">{icon}</span>}
          <span className="text-[11px] font-bold tracking-wider uppercase truncate opacity-90">
            {title}
          </span>
          {badge && <span className="flex-shrink-0">{badge}</span>}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {headerRight}
          <span className="opacity-50 transition-transform">
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
        </div>
      </button>

      {isOpen && (
        <div
          className={`px-3 pb-3 pt-2.5 border-t space-y-3 ${
            isLight ? 'border-slate-200/80 bg-white' : 'border-slate-800/80 bg-slate-900/40'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
};

/** Color swatch input + opacity slider + Auto (reset to element color) row */
const ColorField: React.FC<{
  label: string;
  value: string | null;
  opacity?: number;
  onChange: (color: string | null) => void;
  onOpacityChange?: (opacity: number) => void;
  isLight: boolean;
}> = ({ label, value, opacity = 1, onChange, onOpacityChange, isLight }) => (
  <div className="flex items-center justify-between gap-1.5 py-1">
    <span className="text-[11px] opacity-75 min-w-[70px] flex-shrink-0">{label}</span>
    <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
      {onOpacityChange && (
        <div className="flex items-center gap-1 flex-1 max-w-[110px]" title={`${label} label opacity`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
            className="w-full h-1.5 accent-amber-500 rounded-lg cursor-pointer appearance-none bg-slate-200 dark:bg-slate-700"
          />
          <span className="text-[9px] font-mono font-bold text-amber-500 w-6 text-right select-none">
            {Math.round(opacity * 100)}%
          </span>
        </div>
      )}
      <label
        className={`relative w-6 h-6 rounded-md border cursor-pointer overflow-hidden flex-shrink-0 ${
          isLight ? 'border-slate-300' : 'border-slate-700'
        }`}
        title={`Pick a color for ${label.toLowerCase()}`}
      >
        <input
          type="color"
          value={ensureHexColor(value, '#ffffff')}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
        <span
          className="absolute inset-0 rounded-sm"
          style={{ background: value || 'conic-gradient(#94a3b8, #e2e8f0, #94a3b8)' }}
        />
      </label>
      <button
        onClick={() => onChange(null)}
        title="Reset to element's default color"
        className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-[9px] font-semibold border transition-colors flex-shrink-0 ${
          isLight
            ? 'border-slate-300 text-slate-500 hover:bg-slate-200'
            : 'border-slate-700 text-slate-400 hover:bg-slate-800'
        } ${value ? '' : 'opacity-40 pointer-events-none'}`}
      >
        <RotateCcw className="w-2.5 h-2.5" />
        Auto
      </button>
    </div>
  </div>
);

/**
 * Shared movement waypoint list editor (actors & cameras).
 * Waypoints can also be dragged and rotated directly on the floor plan canvas when the element is selected.
 */
const WaypointListEditor: React.FC<{
  elementId: string;
  path: Waypoint[];
  baseRotation: number;
  accentClass: string;
  isLight: boolean;
  /** Cameras only: the shot whose storyboard this camera's beats belong to. */
  boardShot?: Shot | null;
}> = ({ elementId, path, baseRotation, accentClass, isLight, boardShot }) => {
  const { updateElement, updateShot } = useFloorPlan();
  const beatInputRef = React.useRef<HTMLInputElement>(null);
  const [beatUploadSlot, setBeatUploadSlot] = useState<string | null>(null);
  const boardedFrames = boardShot ? framesOf(boardShot) : {};

  const updateWaypoint = (wpId: string, updates: Partial<Waypoint>) => {
    const newPath = path.map((wp) => (wp.id === wpId ? { ...wp, ...updates } : wp));
    updateElement(elementId, { path: newPath } as any);
  };

  const removeWaypoint = (wpId: string) => {
    updateElement(elementId, { path: path.filter((wp) => wp.id !== wpId) } as any);
  };

  if (path.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {path.map((wp) => {
        const wpRot = Math.round(((wp.rotation ?? baseRotation) % 360 + 360) % 360);
        return (
          <div
            key={wp.id}
            className={`flex items-center gap-1.5 p-1.5 rounded-lg border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}
          >
            <span className={`text-[10px] font-mono font-bold px-1 ${accentClass}`}>B{wp.beat}</span>
            <input
              type="number"
              min={2}
              value={wp.beat}
              title="Beat number"
              onChange={(e) => updateWaypoint(wp.id, { beat: Math.max(2, Number(e.target.value) || 2) })}
              className={`w-10 border rounded px-1 py-0.5 text-[11px] font-mono ${
                isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'
              }`}
            />
            <input
              type="number"
              min={0}
              max={359}
              value={wpRot}
              title="Facing rotation (degrees) at this waypoint"
              onChange={(e) => updateWaypoint(wp.id, { rotation: ((Number(e.target.value) % 360) + 360) % 360 })}
              className={`w-14 border rounded px-1 py-0.5 text-[11px] font-mono text-center ${
                isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'
              }`}
            />
            <span className={`text-[9px] font-mono opacity-50 ${accentClass}`}>°</span>
            <div className="relative flex-1 min-w-0 flex items-center">
              <input
                type="text"
                value={wp.dialogueCue || ''}
                placeholder="Dialogue / action cue..."
                title={wp.hideCue ? "Dialogue or action cue (Hidden on floorplan)" : "Dialogue or action cue at this waypoint"}
                onChange={(e) => updateWaypoint(wp.id, { dialogueCue: e.target.value })}
                className={`w-full border rounded px-1.5 py-0.5 pr-6 text-[11px] ${
                  wp.hideCue ? 'line-through opacity-50' : ''
                } ${
                  isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'
                }`}
              />
              {wp.dialogueCue && (
                <button
                  type="button"
                  onClick={() => updateWaypoint(wp.id, { hideCue: !wp.hideCue })}
                  title={wp.hideCue ? "Show cue on floorplan" : "Hide cue on floorplan"}
                  className={`absolute right-1 p-0.5 rounded transition-colors ${
                    wp.hideCue
                      ? 'text-amber-500 hover:text-amber-400 bg-amber-500/15'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
                  }`}
                >
                  {wp.hideCue ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              )}
            </div>
            {/* Board this beat: attach a storyboard frame for this waypoint */}
            {boardShot && (
              <button
                onClick={() => {
                  setBeatUploadSlot(wp.id);
                  beatInputRef.current?.click();
                }}
                title={
                  boardedFrames[wp.id]?.image
                    ? `Replace the storyboard frame for beat ${wp.beat}`
                    : `Add a storyboard frame for beat ${wp.beat}`
                }
                className={`p-1 rounded transition-colors ${
                  boardedFrames[wp.id]?.image
                    ? 'text-violet-500 hover:bg-violet-500/15'
                    : 'text-slate-400 hover:text-violet-400 hover:bg-violet-500/10'
                }`}
              >
                <ImageIcon className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={() => removeWaypoint(wp.id)}
              title="Delete waypoint"
              className="p-1 rounded text-red-400 hover:bg-red-500/15 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        );
      })}
      {boardShot && (
        <input
          ref={beatInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && beatUploadSlot) {
              loadStoryboardImageFile(file)
                .then((dataUrl) =>
                  updateShot(boardShot.id, setFramePatch(boardShot, beatUploadSlot, { image: dataUrl, fit: 'cover' }))
                )
                .catch(() => alert('That image could not be read.'));
            }
            setBeatUploadSlot(null);
            e.target.value = '';
          }}
        />
      )}
      <p className={`text-[10px] italic ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
        Tip: drag a numbered marker to reposition it, or drag its small circle handle to rotate its facing.
        {boardShot ? ' The picture button boards that beat.' : ''}
      </p>
    </div>
  );
};

export const InspectorPanel: React.FC = () => {
  const logoInputRef = React.useRef<HTMLInputElement>(null);
  const {
    activeSetup,
    project,
    updateProjectMeta,
    selectedElementIds,
    updateElement,
    deleteSelectedElements,
    duplicateSelected,
    openViewfinder,
    selectShot,
    updateShot,
    playback,
    updateSetupMeta,
    insertDoorInWall,
    insertWindowInWall,
    rotateElementBy,
    theme,
    backgroundImages,
    selectedBackgroundId,
    setSelectedBackgroundId,
    updateBackgroundImage,
    removeBackgroundImage,
    displaySettings,
    updateDisplaySettings,
    updateMultipleElements,
    setGridSettings,
  } = useFloorPlan();

  const isLight = theme === 'light';
  // Shared styling for the camera exposure dropdowns
  const selectClass = `w-full border rounded px-1.5 py-1 text-[11px] ${
    isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
  }`;

  // Dedicated Reference Image inspector — shown when a background image is
  // selected on the canvas (separate from the Scene Setup inspector).
  const selectedBg = backgroundImages.find((b) => b.id === selectedBackgroundId);
  if (selectedBg) {
    return (
      <div
        id="inspector-panel-image"
        className={`flex flex-col h-full text-xs p-4 space-y-4 select-none overflow-y-auto ${
          isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-200'
        }`}
      >
        <div className={`flex items-center justify-between pb-3 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="w-4 h-4 text-teal-500 flex-shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider truncate">
              Reference Image
            </h3>
          </div>
          <button
            onClick={() => setSelectedBackgroundId(null)}
            title="Close image settings (back to scene setup)"
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
              isLight ? 'text-slate-500 hover:bg-slate-200' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            ✕
          </button>
        </div>

        {/* Thumbnail preview */}
        <div className={`rounded-xl overflow-hidden border ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <div
            className="w-full h-32 bg-slate-100 flex items-center justify-center"
            style={{ backgroundImage: 'linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 75%,#e2e8f0 75%),linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 75%,#e2e8f0 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0, 8px 8px' }}
          >
            <img
              src={selectedBg.url}
              alt={selectedBg.name || 'Reference image'}
              className="max-h-32 max-w-full object-contain"
              style={{ opacity: selectedBg.opacity ?? 0.5 }}
            />
          </div>
        </div>

        {/* Name */}
        <div>
          <label className={`block mb-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Image Name
          </label>
          <input
            type="text"
            value={selectedBg.name || ''}
            onChange={(e) => updateBackgroundImage(selectedBg.id, { name: e.target.value })}
            placeholder="e.g. Floorplan Scan, Scout Photo"
            className={`w-full border rounded-lg p-2 focus:border-teal-500 focus:outline-none ${
              isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
            }`}
          />
        </div>

        {/* Opacity */}
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="opacity-60">Opacity</span>
            <span className="font-mono font-bold text-teal-500">
              {Math.round((selectedBg.opacity ?? 0.5) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={selectedBg.opacity ?? 0.5}
            onChange={(e) => updateBackgroundImage(selectedBg.id, { opacity: parseFloat(e.target.value) })}
            className="w-full accent-teal-500 cursor-pointer"
          />
        </div>

        {/* Position & Size */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>X</label>
            <input
              type="number"
              value={Math.round(selectedBg.x)}
              onChange={(e) => updateBackgroundImage(selectedBg.id, { x: Number(e.target.value) })}
              className={`w-full border rounded-lg p-2 focus:border-teal-500 ${
                isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
              }`}
            />
          </div>
          <div>
            <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Y</label>
            <input
              type="number"
              value={Math.round(selectedBg.y)}
              onChange={(e) => updateBackgroundImage(selectedBg.id, { y: Number(e.target.value) })}
              className={`w-full border rounded-lg p-2 focus:border-teal-500 ${
                isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
              }`}
            />
          </div>
          <div>
            <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Width</label>
            <input
              type="number"
              value={Math.round(selectedBg.width)}
              onChange={(e) => updateBackgroundImage(selectedBg.id, { width: Number(e.target.value) })}
              className={`w-full border rounded-lg p-2 focus:border-teal-500 ${
                isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
              }`}
            />
          </div>
          <div>
            <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Height</label>
            <input
              type="number"
              value={Math.round(selectedBg.height)}
              onChange={(e) => updateBackgroundImage(selectedBg.id, { height: Number(e.target.value) })}
              className={`w-full border rounded-lg p-2 focus:border-teal-500 ${
                isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
              }`}
            />
          </div>
        </div>

        {/* Visibility / Lock */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => updateBackgroundImage(selectedBg.id, { visible: !selectedBg.visible })}
            className={`py-2 text-[11px] font-semibold rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${
              selectedBg.visible
                ? isLight ? 'bg-teal-50 text-teal-700 border-teal-300' : 'bg-teal-950/40 text-teal-300 border-teal-800'
                : isLight ? 'bg-slate-100 text-slate-500 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            {selectedBg.visible ? 'Visible' : 'Hidden'}
          </button>
          <button
            onClick={() => updateBackgroundImage(selectedBg.id, { locked: !selectedBg.locked })}
            title={selectedBg.locked ? 'Unlock (allow moving & resizing)' : 'Lock (prevent accidental moves)'}
            className={`py-2 text-[11px] font-semibold rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${
              selectedBg.locked
                ? isLight ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-amber-950/40 text-amber-300 border-amber-800'
                : isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            {selectedBg.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            {selectedBg.locked ? 'Locked' : 'Unlocked'}
          </button>
        </div>

        {/* Delete */}
        <button
          onClick={() => {
            removeBackgroundImage(selectedBg.id);
            setSelectedBackgroundId(null);
          }}
          className={`w-full py-2 text-[11px] font-semibold rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${
            isLight
              ? 'bg-red-50 text-red-600 border-red-300 hover:bg-red-100'
              : 'bg-red-950/30 text-red-400 border-red-900 hover:bg-red-950/60'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Image
        </button>

        <p className={`text-[10px] italic ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
          Drag the image on the canvas to move it, use the corner handles to scale
          (proportions preserved), or press <strong>Delete</strong> to remove it.
        </p>
      </div>
    );
  }

  if (selectedElementIds.length === 0) {
    // Show Scene / Setup Meta Inspector
    return (
      <div
        id="inspector-panel-empty"
        className={`flex flex-col h-full text-xs p-4 space-y-4 select-none overflow-y-auto ${
          isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-200'
        }`}
      >
        <div className={`flex items-center gap-2 pb-3 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <Sliders className="w-4 h-4 text-sky-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider">
            Scene Setup Inspector
          </h3>
        </div>
        <div className="space-y-3">
          {/* Rubric 1: Scene & Environment */}
          <RubricSection
            title="Scene & Environment"
            icon={<Sliders className="w-3.5 h-3.5 text-sky-500" />}
            badge={
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-500 font-semibold">
                Scene {activeSetup.sceneNumber}
              </span>
            }
            defaultOpen={true}
            isLight={isLight}
          >
            <div>
              <label className={`block mb-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Scene Setup Name</label>
              <input
                type="text"
                value={activeSetup.name}
                onChange={(e) => updateSetupMeta({ name: e.target.value })}
                className={`w-full border rounded-lg p-2 focus:border-sky-500 focus:outline-none ${
                  isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Scene / Setup Number</label>
                <input
                  type="text"
                  value={activeSetup.sceneNumber}
                  onChange={(e) => updateSetupMeta({ sceneNumber: e.target.value })}
                  className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                    isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
              <div>
                <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Script Page</label>
                <input
                  type="text"
                  value={activeSetup.scriptPage || ''}
                  onChange={(e) => updateSetupMeta({ scriptPage: e.target.value })}
                  placeholder="e.g. p. 12-14"
                  className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                    isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Scene Location / Slugline</label>
              <input
                type="text"
                value={activeSetup.location}
                onChange={(e) => updateSetupMeta({ location: e.target.value })}
                placeholder="e.g. INT. LIVING ROOM - NIGHT"
                className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                  isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              />
            </div>

            <div>
              <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Lighting / Time of Day</label>
              <select
                value={activeSetup.timeOfDay}
                onChange={(e) => updateSetupMeta({ timeOfDay: e.target.value as any })}
                className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                  isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              >
                <option value="Day INT">Day INT (Interior Daylight)</option>
                <option value="Night INT">Night INT (Interior Night)</option>
                <option value="Day EXT">Day EXT (Exterior Sun)</option>
                <option value="Night EXT">Night EXT (Exterior Night)</option>
              </select>
            </div>

            {/* Project Aspect Ratio (also frames storyboards) */}
            <div>
              <label className={`block mb-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Project Aspect Ratio
              </label>
              <select
                value={activeSetup.aspectRatio || '16:9'}
                onChange={(e) => updateSetupMeta({ aspectRatio: e.target.value as any })}
                className={`w-full border rounded-lg p-2 focus:border-violet-500 ${
                  isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              >
                {ASPECT_RATIOS.map((ar) => (
                  <option key={ar.value} value={ar.value}>
                    {ar.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Measurement / Grid Units */}
            <div>
              <label className={`block mb-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Measurement Units
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setGridSettings({
                      unit: 'm',
                      pixelsPerUnit: 30,
                    })
                  }
                  className={`py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                    (activeSetup.gridSettings?.unit || 'm') === 'm'
                      ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                      : isLight
                      ? 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <span>Meters (m)</span>
                  <span className="text-[10px] opacity-75 font-mono">Metric</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setGridSettings({
                      unit: 'ft',
                      pixelsPerUnit: 25,
                    })
                  }
                  className={`py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                    activeSetup.gridSettings?.unit === 'ft'
                      ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                      : isLight
                      ? 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <span>Feet (ft)</span>
                  <span className="text-[10px] opacity-75 font-mono">Imperial</span>
                </button>
              </div>
            </div>
          </RubricSection>

          {/* Rubric 2: Production Info */}
          <RubricSection
            title="Production Info"
            icon={<Film className="w-3.5 h-3.5 text-sky-500" />}
            badge={
              project.title ? (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-500/10 opacity-75 truncate max-w-[100px]">
                  {project.title}
                </span>
              ) : undefined
            }
            defaultOpen={false}
            isLight={isLight}
          >
            <div>
              <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Project Title</label>
              <input
                type="text"
                value={project.title}
                onChange={(e) => updateProjectMeta({ title: e.target.value })}
                className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                  isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Director</label>
                <input
                  type="text"
                  value={project.director}
                  placeholder="e.g. Jane Doe"
                  onChange={(e) => updateProjectMeta({ director: e.target.value })}
                  className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                    isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
              <div>
                <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Cinematographer / DP</label>
                <input
                  type="text"
                  value={project.cinematographer}
                  placeholder="e.g. John Smith"
                  onChange={(e) => updateProjectMeta({ cinematographer: e.target.value })}
                  className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                    isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Production Company</label>
                <input
                  type="text"
                  value={project.productionCompany || ''}
                  placeholder="e.g. Studio Films"
                  onChange={(e) => updateProjectMeta({ productionCompany: e.target.value })}
                  className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                    isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
              <div>
                <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Date</label>
                <input
                  type="text"
                  value={project.date}
                  placeholder="YYYY-MM-DD"
                  onChange={(e) => updateProjectMeta({ date: e.target.value })}
                  className={`w-full border rounded-lg p-2 focus:border-sky-500 ${
                    isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
            </div>
            {/* Production logo */}
            <div>
              <label className={`block mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Production Logo</label>
              <div className="flex items-center gap-2">
                <div
                  className={`w-16 h-12 rounded-lg border flex items-center justify-center overflow-hidden flex-shrink-0 ${
                    isLight ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'
                  }`}
                >
                  {project.logo ? (
                    <img src={project.logo} alt="Production logo" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <ImagePlus className="w-4 h-4 opacity-40" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        loadLogoFile(file)
                          .then(({ dataUrl, name }) => updateProjectMeta({ logo: dataUrl, logoName: name }))
                          .catch(() => alert('Could not load that image as a logo.'));
                      }
                      e.target.value = '';
                    }}
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-semibold ${
                        isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      {project.logo ? 'Replace logo' : 'Upload logo'}
                    </button>
                    {project.logo && (
                      <button
                        onClick={() => updateProjectMeta({ logo: undefined, logoName: undefined })}
                        className="px-2 py-1 rounded-lg border border-rose-500/50 text-rose-500 text-[11px] font-semibold"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <p className={`text-[10px] truncate ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                    {project.logoName || 'PNG with transparency works best'}
                  </p>
                </div>
              </div>
            </div>
          </RubricSection>

          {/* Rubric 3: Display & Labels */}
          <RubricSection
            title="Display & Labels"
            icon={<Tags className="w-3.5 h-3.5 text-violet-500" />}
            defaultOpen={false}
            isLight={isLight}
          >
            {/* Master toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold">Show all labels</span>
              <button
                onClick={() => updateDisplaySettings({ showLabels: !displaySettings.showLabels })}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  displaySettings.showLabels ? 'bg-teal-500' : isLight ? 'bg-slate-300' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                    displaySettings.showLabels ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Size & opacity */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="opacity-60">Label size</span>
                <span className="font-mono font-bold text-teal-500">
                  {Math.round(displaySettings.labelScale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={displaySettings.labelScale}
                onChange={(e) => updateDisplaySettings({ labelScale: parseFloat(e.target.value) })}
                className="w-full accent-teal-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="opacity-60">Label transparency</span>
                <span className="font-mono font-bold text-teal-500">
                  {Math.round((1 - displaySettings.labelOpacity) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={displaySettings.labelOpacity}
                onChange={(e) => updateDisplaySettings({ labelOpacity: parseFloat(e.target.value) })}
                className="w-full accent-teal-500 cursor-pointer"
              />
            </div>

            {/* Per-category visibility */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-1.5">
                Show labels for
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <PillToggle on={displaySettings.showActorLabels} onClick={() => updateDisplaySettings({ showActorLabels: !displaySettings.showActorLabels })} label="Actors" isLight={isLight} />
                <PillToggle on={displaySettings.showCameraLabels} onClick={() => updateDisplaySettings({ showCameraLabels: !displaySettings.showCameraLabels })} label="Cameras" isLight={isLight} />
                <PillToggle on={displaySettings.showPropLabels} onClick={() => updateDisplaySettings({ showPropLabels: !displaySettings.showPropLabels })} label="Props" isLight={isLight} />
                <PillToggle on={displaySettings.showTrackLabels} onClick={() => updateDisplaySettings({ showTrackLabels: !displaySettings.showTrackLabels })} label="Tracks" isLight={isLight} />
                <PillToggle on={displaySettings.showLightLabels} onClick={() => updateDisplaySettings({ showLightLabels: !displaySettings.showLightLabels })} label="Lights" isLight={isLight} />
                <PillToggle on={displaySettings.showLightNameLabels} onClick={() => updateDisplaySettings({ showLightNameLabels: !displaySettings.showLightNameLabels })} label="Light names" isLight={isLight} />
                <PillToggle on={displaySettings.showMeasurementLabels} onClick={() => updateDisplaySettings({ showMeasurementLabels: !displaySettings.showMeasurementLabels })} label="Measurements" isLight={isLight} />
              </div>
            </div>
          </RubricSection>

          {/* Rubric 4: Camera & Light HUD Badge Info */}
          <RubricSection
            title="Camera & Light HUD Details"
            icon={<Tv className="w-3.5 h-3.5 text-sky-500" />}
            defaultOpen={false}
            isLight={isLight}
          >
            {/* Shot info shown on camera labels */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-1.5">
                Camera Badge HUD
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <PillToggle on={displaySettings.showShotNumberOnCamera} onClick={() => updateDisplaySettings({ showShotNumberOnCamera: !displaySettings.showShotNumberOnCamera })} label="Shot #" isLight={isLight} />
                <PillToggle on={displaySettings.showShotSizeOnCamera} onClick={() => updateDisplaySettings({ showShotSizeOnCamera: !displaySettings.showShotSizeOnCamera })} label="Shot size" isLight={isLight} />
                <PillToggle on={displaySettings.showShotLensOnCamera} onClick={() => updateDisplaySettings({ showShotLensOnCamera: !displaySettings.showShotLensOnCamera })} label="Lens" isLight={isLight} />
                <PillToggle on={displaySettings.showShotAngleOnCamera} onClick={() => updateDisplaySettings({ showShotAngleOnCamera: !displaySettings.showShotAngleOnCamera })} label="Angle" isLight={isLight} />
                <PillToggle on={displaySettings.showLensFovLabel} onClick={() => updateDisplaySettings({ showLensFovLabel: !displaySettings.showLensFovLabel })} label="Lens/FOV" isLight={isLight} />
              </div>
            </div>

            {/* Light info shown on light labels */}
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-1.5">
                Light Badge HUD
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <PillToggle
                  on={displaySettings.showLightRoleLabels !== false}
                  onClick={() => updateDisplaySettings({ showLightRoleLabels: !(displaySettings.showLightRoleLabels !== false) })}
                  label="Function / Role"
                  isLight={isLight}
                />
                <PillToggle
                  on={displaySettings.showLightNameLabels !== false}
                  onClick={() => updateDisplaySettings({ showLightNameLabels: !(displaySettings.showLightNameLabels !== false) })}
                  label="Name / Model"
                  isLight={isLight}
                />
                <PillToggle
                  on={displaySettings.showLightKelvinLabels === true}
                  onClick={() => updateDisplaySettings({ showLightKelvinLabels: !(displaySettings.showLightKelvinLabels === true) })}
                  label="Color Temp (K)"
                  isLight={isLight}
                />
                <PillToggle
                  on={displaySettings.showLightIntensityLabels === true}
                  onClick={() => updateDisplaySettings({ showLightIntensityLabels: !(displaySettings.showLightIntensityLabels === true) })}
                  label="Dim Level (%)"
                  isLight={isLight}
                />
              </div>
            </div>
          </RubricSection>

          {/* Rubric 5: Label Colors & Opacity */}
          <RubricSection
            title="Label Colors & Opacity"
            icon={<Palette className="w-3.5 h-3.5 text-amber-500" />}
            defaultOpen={false}
            isLight={isLight}
          >
            <div className="space-y-1">
              <ColorField
                label="Actors"
                value={displaySettings.actorLabelColor}
                opacity={displaySettings.labelCategoryOpacity?.actors ?? 1}
                onChange={(c) => updateDisplaySettings({ actorLabelColor: c })}
                onOpacityChange={(op) =>
                  updateDisplaySettings({
                    labelCategoryOpacity: {
                      ...displaySettings.labelCategoryOpacity,
                      actors: op,
                    },
                  })
                }
                isLight={isLight}
              />
              <ColorField
                label="Cameras"
                value={displaySettings.cameraLabelColor}
                opacity={displaySettings.labelCategoryOpacity?.cameras ?? 1}
                onChange={(c) => updateDisplaySettings({ cameraLabelColor: c })}
                onOpacityChange={(op) =>
                  updateDisplaySettings({
                    labelCategoryOpacity: {
                      ...displaySettings.labelCategoryOpacity,
                      cameras: op,
                    },
                  })
                }
                isLight={isLight}
              />
              <ColorField
                label="Props"
                value={displaySettings.propLabelColor}
                opacity={displaySettings.labelCategoryOpacity?.props ?? 1}
                onChange={(c) => updateDisplaySettings({ propLabelColor: c })}
                onOpacityChange={(op) =>
                  updateDisplaySettings({
                    labelCategoryOpacity: {
                      ...displaySettings.labelCategoryOpacity,
                      props: op,
                    },
                  })
                }
                isLight={isLight}
              />
              <ColorField
                label="Tracks"
                value={displaySettings.trackLabelColor}
                opacity={displaySettings.labelCategoryOpacity?.tracks ?? 1}
                onChange={(c) => updateDisplaySettings({ trackLabelColor: c })}
                onOpacityChange={(op) =>
                  updateDisplaySettings({
                    labelCategoryOpacity: {
                      ...displaySettings.labelCategoryOpacity,
                      tracks: op,
                    },
                  })
                }
                isLight={isLight}
              />
              <ColorField
                label="Lights"
                value={displaySettings.lightLabelColor}
                opacity={displaySettings.labelCategoryOpacity?.lights ?? 1}
                onChange={(c) => updateDisplaySettings({ lightLabelColor: c })}
                onOpacityChange={(op) =>
                  updateDisplaySettings({
                    labelCategoryOpacity: {
                      ...displaySettings.labelCategoryOpacity,
                      lights: op,
                    },
                  })
                }
                isLight={isLight}
              />
              <ColorField
                label="Doors/Wins"
                value={displaySettings.doorWindowLabelColor}
                opacity={displaySettings.labelCategoryOpacity?.doorWindows ?? 1}
                onChange={(c) => updateDisplaySettings({ doorWindowLabelColor: c })}
                onOpacityChange={(op) =>
                  updateDisplaySettings({
                    labelCategoryOpacity: {
                      ...displaySettings.labelCategoryOpacity,
                      doorWindows: op,
                    },
                  })
                }
                isLight={isLight}
              />
              <ColorField
                label="Measures"
                value={displaySettings.measurementLabelColor}
                opacity={displaySettings.labelCategoryOpacity?.measurements ?? 1}
                onChange={(c) => updateDisplaySettings({ measurementLabelColor: c })}
                onOpacityChange={(op) =>
                  updateDisplaySettings({
                    labelCategoryOpacity: {
                      ...displaySettings.labelCategoryOpacity,
                      measurements: op,
                    },
                  })
                }
                isLight={isLight}
              />
            </div>
          </RubricSection>

          {/* Rubric 6: Declutter Floor Plan */}
          <RubricSection
            title="Declutter Floor Plan"
            icon={<Grid3x3 className="w-3.5 h-3.5 text-emerald-500" />}
            defaultOpen={false}
            isLight={isLight}
          >
            <div className="grid grid-cols-2 gap-1.5">
              <PillToggle on={displaySettings.showWaypoints} onClick={() => updateDisplaySettings({ showWaypoints: !displaySettings.showWaypoints })} label="Waypoints & paths" isLight={isLight} />
              <PillToggle on={displaySettings.showFovCones} onClick={() => updateDisplaySettings({ showFovCones: !displaySettings.showFovCones })} label="Camera FOV cones" isLight={isLight} />
              <PillToggle on={displaySettings.showLightBeams} onClick={() => updateDisplaySettings({ showLightBeams: !displaySettings.showLightBeams })} label="Light beams" isLight={isLight} />
              <PillToggle on={displaySettings.showStoryboardThumbs} onClick={() => updateDisplaySettings({ showStoryboardThumbs: !displaySettings.showStoryboardThumbs })} label="Storyboard frames" isLight={isLight} />
              <PillToggle on={displaySettings.showDoorWindowLabels} onClick={() => updateDisplaySettings({ showDoorWindowLabels: !displaySettings.showDoorWindowLabels })} label="Door/window labels" isLight={isLight} />
              <PillToggle
                on={displaySettings.showGrid || activeSetup.gridSettings?.showGrid === true}
                onClick={() => {
                  const next = !(displaySettings.showGrid || activeSetup.gridSettings?.showGrid === true);
                  updateDisplaySettings({ showGrid: next });
                  setGridSettings({ showGrid: next });
                }}
                label="Grid & axes"
                isLight={isLight}
              />
            </div>

            {/* Camera FOV Cone Opacity Slider */}
            {displaySettings.showFovCones !== false && (
              <div className="pt-2.5 mt-2 border-t border-slate-700/30">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="opacity-70">Camera FOV Cone Opacity</span>
                  <span className="font-mono text-sky-500 font-bold">
                    {Math.round((displaySettings.fovConeOpacity ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={Math.round((displaySettings.fovConeOpacity ?? 1) * 100)}
                  onChange={(e) =>
                    updateDisplaySettings({
                      fovConeOpacity: Number(e.target.value) / 100,
                    })
                  }
                  className="w-full accent-sky-500 cursor-pointer h-1.5"
                />
              </div>
            )}
          </RubricSection>

          {/* Rubric 7: Reference Images */}
          {backgroundImages.length > 0 && (
            <RubricSection
              title={`Reference Images (${backgroundImages.length})`}
              icon={<ImageIcon className="w-3.5 h-3.5 text-teal-500" />}
              defaultOpen={false}
              isLight={isLight}
            >
              <div className="space-y-3">
                {backgroundImages.map((bg, idx) => (
                  <div
                    key={bg.id}
                    className={`p-2.5 rounded-xl border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold text-teal-500 uppercase truncate pr-2">
                        {bg.name || `Reference ${idx + 1}`}
                      </span>
                      <button
                        onClick={() => updateBackgroundImage(bg.id, { visible: !bg.visible })}
                        title={bg.visible ? 'Hide on canvas' : 'Show on canvas'}
                        className="p-1 rounded hover:bg-slate-500/15 transition-colors"
                      >
                        <Eye
                          className={`w-3.5 h-3.5 ${bg.visible ? 'text-teal-500' : 'text-slate-500'}`}
                        />
                      </button>
                    </div>

                    {/* Opacity */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="opacity-60">Opacity</span>
                        <span className="font-mono font-bold text-teal-500">
                          {Math.round((bg.opacity ?? 0.5) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={bg.opacity ?? 0.5}
                        onChange={(e) =>
                          updateBackgroundImage(bg.id, { opacity: parseFloat(e.target.value) })
                        }
                        className="w-full accent-teal-500 cursor-pointer"
                      />
                    </div>

                    {/* Visibility & Lock Toggles */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => updateBackgroundImage(bg.id, { visible: !bg.visible })}
                        className={`py-1.5 text-[10px] font-semibold rounded-lg border flex items-center justify-center gap-1 transition-colors ${
                          bg.visible
                            ? isLight ? 'bg-teal-50 text-teal-700 border-teal-300' : 'bg-teal-950/40 text-teal-300 border-teal-800'
                            : isLight ? 'bg-slate-100 text-slate-500 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        <Eye className="w-3 h-3" />
                        {bg.visible ? 'Visible' : 'Hidden'}
                      </button>
                      <button
                        onClick={() => updateBackgroundImage(bg.id, { locked: !bg.locked })}
                        title={bg.locked ? 'Unlock (allow moving & resizing)' : 'Lock (prevent accidental moves)'}
                        className={`py-1.5 text-[10px] font-semibold rounded-lg border flex items-center justify-center gap-1 transition-colors ${
                          bg.locked
                            ? isLight ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-amber-950/40 text-amber-300 border-amber-800'
                            : isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        {bg.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        {bg.locked ? 'Locked' : 'Unlocked'}
                      </button>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => removeBackgroundImage(bg.id)}
                      className={`mt-2 w-full py-1.5 text-[10px] font-semibold rounded-lg border flex items-center justify-center gap-1 transition-colors ${
                        isLight
                          ? 'bg-red-50 text-red-600 border-red-300 hover:bg-red-100'
                          : 'bg-red-950/30 text-red-400 border-red-900 hover:bg-red-950/60'
                      }`}
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete Image
                    </button>
                  </div>
                ))}

                <p className={`text-[10px] italic ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                  Click an image on the canvas to select it, drag it to move, use the corner handles to scale
                  (proportions preserved), or press <strong>Delete</strong> to remove it. Upload more via the
                  teal image button in the left toolbar.
                </p>
              </div>
            </RubricSection>
          )}

          <div className={`pt-4 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
            <h4 className="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-2">
              Scene Statistics
            </h4>            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className={`p-2.5 rounded-lg border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                <span className="opacity-60 block text-[10px]">TOTAL ELEMENTS</span>
                <span className="text-base font-bold font-mono text-sky-500">{activeSetup.elements.length}</span>
              </div>
              <div className={`p-2.5 rounded-lg border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                <span className="opacity-60 block text-[10px]">PLANNED SHOTS</span>
                <span className="text-base font-bold font-mono text-emerald-500">{activeSetup.shots.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Multi-element selection
  if (selectedElementIds.length > 1) {
    return (
      <div
        id="inspector-panel-multi"
        className={`flex flex-col h-full text-xs p-4 space-y-4 select-none ${
          isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-200'
        }`}
      >
        <div className={`flex items-center justify-between pb-3 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider">
              {selectedElementIds.length} Items Selected
            </h3>
          </div>
        </div>

        <p className="text-xs opacity-75">
          Multiple floor plan elements selected. You can move them together or rotate the selection.
        </p>

        {/* Multi rotate buttons */}
        <div className="space-y-1.5 pt-2">
          <label className="text-[10px] font-bold uppercase opacity-60 block">Rotate Selection</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => selectedElementIds.forEach((id) => rotateElementBy(id, -45))}
              className={`py-2 px-3 border rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Rotate -45°</span>
            </button>
            <button
              onClick={() => selectedElementIds.forEach((id) => rotateElementBy(id, 45))}
              className={`py-2 px-3 border rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Rotate +45°</span>
            </button>
          </div>
        </div>

        {/* Align & Distribute tools */}
        <div className="space-y-3 pt-2">
          <div>
            <label className="text-[10px] font-bold uppercase opacity-60 block mb-1.5">Align Selection</label>
            <div className="grid grid-cols-6 gap-1.5">
              {(
                [
                  { mode: 'left' as AlignMode, Icon: AlignLeft, title: 'Align Left Edges' },
                  { mode: 'hcenter' as AlignMode, Icon: AlignCenterHorizontal, title: 'Align Horizontal Centers' },
                  { mode: 'right' as AlignMode, Icon: AlignRight, title: 'Align Right Edges' },
                  { mode: 'top' as AlignMode, Icon: AlignStartVertical, title: 'Align Top Edges' },
                  { mode: 'vcenter' as AlignMode, Icon: AlignCenterVertical, title: 'Align Vertical Centers' },
                  { mode: 'bottom' as AlignMode, Icon: AlignEndVertical, title: 'Align Bottom Edges' },
                ]
              ).map(({ mode, Icon, title }) => {
                const doAlign = () => {
                  const els = activeSetup.elements.filter((e) => selectedElementIds.includes(e.id));
                  if (els.length < 2) return;
                  const bounds = els.map((e) => ({ el: e, b: getElementBounds(e) }));
                  const minX = Math.min(...bounds.map((x) => x.b.minX));
                  const maxX = Math.max(...bounds.map((x) => x.b.maxX));
                  const minY = Math.min(...bounds.map((x) => x.b.minY));
                  const maxY = Math.max(...bounds.map((x) => x.b.maxY));
                  const cx = (minX + maxX) / 2;
                  const cy = (minY + maxY) / 2;
                  const updates = bounds.map(({ el, b }) => {
                    let nx = el.x;
                    let ny = el.y;
                    if (mode === 'left') nx = el.x + (minX - b.minX);
                    else if (mode === 'right') nx = el.x + (maxX - b.maxX);
                    else if (mode === 'hcenter') nx = el.x + (cx - (b.minX + b.maxX) / 2);
                    else if (mode === 'top') ny = el.y + (minY - b.minY);
                    else if (mode === 'bottom') ny = el.y + (maxY - b.maxY);
                    else if (mode === 'vcenter') ny = el.y + (cy - (b.minY + b.maxY) / 2);
                    return { id: el.id, updates: { x: Math.round(nx), y: Math.round(ny) } };
                  });
                  updateMultipleElements(updates, true);
                };
                return (
                  <button
                    key={mode}
                    onClick={doAlign}
                    title={title}
                    className={`py-2 border rounded-lg flex items-center justify-center transition-colors ${
                      isLight
                        ? 'bg-slate-100 hover:bg-sky-100 text-slate-600 hover:text-sky-700 border-slate-300'
                        : 'bg-slate-800 hover:bg-sky-950 text-slate-300 hover:text-sky-300 border-slate-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase opacity-60 block mb-1.5">Distribute Spacing (3+ items)</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => {
                  const els = activeSetup.elements.filter((e) => selectedElementIds.includes(e.id));
                  if (els.length < 3) return;
                  const bounds = els.map((e) => ({ el: e, b: getElementBounds(e) }));
                  bounds.sort((a, c) => (a.b.minX + a.b.maxX) / 2 - (c.b.minX + c.b.maxX) / 2);
                  const minC = (bounds[0].b.minX + bounds[0].b.maxX) / 2;
                  const maxC = (bounds[bounds.length - 1].b.minX + bounds[bounds.length - 1].b.maxX) / 2;
                  const step = (maxC - minC) / (bounds.length - 1);
                  const updates = bounds.map(({ el, b }, i) => ({
                    id: el.id,
                    updates: { x: Math.round(el.x + (minC + step * i - (b.minX + b.maxX) / 2)) },
                  }));
                  updateMultipleElements(updates, true);
                }}
                title="Evenly space selected items horizontally"
                className={`py-2 border rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors ${
                  isLight
                    ? 'bg-slate-100 hover:bg-sky-100 text-slate-600 hover:text-sky-700 border-slate-300'
                    : 'bg-slate-800 hover:bg-sky-950 text-slate-300 hover:text-sky-300 border-slate-700'
                }`}
              >
                <AlignHorizontalSpaceBetween className="w-4 h-4" />
                <span>Horizontal</span>
              </button>
              <button
                onClick={() => {
                  const els = activeSetup.elements.filter((e) => selectedElementIds.includes(e.id));
                  if (els.length < 3) return;
                  const bounds = els.map((e) => ({ el: e, b: getElementBounds(e) }));
                  bounds.sort((a, c) => (a.b.minY + a.b.maxY) / 2 - (c.b.minY + c.b.maxY) / 2);
                  const minC = (bounds[0].b.minY + bounds[0].b.maxY) / 2;
                  const maxC = (bounds[bounds.length - 1].b.minY + bounds[bounds.length - 1].b.maxY) / 2;
                  const step = (maxC - minC) / (bounds.length - 1);
                  const updates = bounds.map(({ el, b }, i) => ({
                    id: el.id,
                    updates: { y: Math.round(el.y + (minC + step * i - (b.minY + b.maxY) / 2)) },
                  }));
                  updateMultipleElements(updates, true);
                }}
                title="Evenly space selected items vertically"
                className={`py-2 border rounded-lg flex items-center justify-center gap-1.5 font-medium transition-colors ${
                  isLight
                    ? 'bg-slate-100 hover:bg-sky-100 text-slate-600 hover:text-sky-700 border-slate-300'
                    : 'bg-slate-800 hover:bg-sky-950 text-slate-300 hover:text-sky-300 border-slate-700'
                }`}
              >
                <AlignVerticalSpaceBetween className="w-4 h-4" />
                <span>Vertical</span>
              </button>
            </div>
          </div>
        </div>

        <div className="pt-3">
          <button
            onClick={deleteSelectedElements}
            className="w-full flex items-center justify-center gap-2 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-lg text-xs font-semibold transition-colors"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
            <span>Delete {selectedElementIds.length} Selected Items</span>
          </button>
        </div>
      </div>
    );
  }

  // Single element selected
  const activeId = selectedElementIds[0];
  const el = activeSetup.elements.find((e) => e.id === activeId);
  if (!el) return null;

  const currentRotation = Math.round((el.rotation || 0) % 360 + 360) % 360;

  return (
    <div
      id="inspector-panel"
      className={`flex flex-col h-full p-4 space-y-4 select-none overflow-y-auto custom-scrollbar text-xs ${
        isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-200'
      }`}
    >
      {/* 1. Header with Delete & Duplicate */}
      <div className={`flex items-center justify-between pb-3 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        <div className="flex items-center gap-2">
          {el.type === 'camera' ? (
            <Camera className="w-4 h-4 text-sky-500" />
          ) : el.type === 'actor' ? (
            <User className="w-4 h-4 text-emerald-500" />
          ) : el.type === 'light' ? (
            <Lightbulb className="w-4 h-4 text-amber-500" />
          ) : (
            <Sliders className="w-4 h-4 text-purple-500" />
          )}
          <h3 className="text-xs font-bold uppercase tracking-wider">
            {el.type} Inspector
          </h3>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={duplicateSelected}
            title="Duplicate (Ctrl+D)"
            className={`p-1.5 rounded-lg transition-colors ${
              isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={deleteSelectedElements}
            title="Delete element (Del)"
            className="p-1.5 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Common Properties (Name & Position Rubric) */}
      <div className="space-y-3">
        <div>
          <label className={`block mb-1 font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Element Name / Label</label>
          <input
            type="text"
            value={el.name}
            onChange={(e) => updateElement(el.id, { name: e.target.value })}
            className={`w-full border rounded-lg p-2 focus:border-sky-500 focus:outline-none ${
              isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
            }`}
          />
        </div>

        {/* Position, Rotation & Transform Rubric */}
        <RubricSection
          title="Position & Orientation"
          icon={<Move3d className="w-3.5 h-3.5 text-slate-400" />}
          badge={
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-500/10 opacity-75">
              X:{Math.round(el.x)} Y:{Math.round(el.y)} {currentRotation !== undefined ? `· ${currentRotation}°` : ''}
            </span>
          }
          defaultOpen={false}
          isLight={isLight}
        >
          {/* Position Controls */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="opacity-60 block text-[10px]">POS X (px)</label>
              <input
                type="number"
                value={Math.round(el.x)}
                onChange={(e) => updateElement(el.id, { x: Number(e.target.value) })}
                className={`w-full border rounded px-2 py-1 font-mono text-xs ${
                  isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              />
            </div>
            <div>
              <label className="opacity-60 block text-[10px]">POS Y (px)</label>
              <input
                type="number"
                value={Math.round(el.y)}
                onChange={(e) => updateElement(el.id, { y: Number(e.target.value) })}
                className={`w-full border rounded px-2 py-1 font-mono text-xs ${
                  isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              />
            </div>
          </div>

          {/* Rotation & Orientation Section */}
          {el.type !== 'wall' && el.type !== 'track' && el.type !== 'measurement' && el.type !== 'arrow' && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs flex items-center gap-1.5 opacity-80">
                  <Compass className="w-3.5 h-3.5 text-sky-500" />
                  Rotation Angle
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={360}
                    value={currentRotation}
                    onChange={(e) => updateElement(el.id, { rotation: ((Number(e.target.value) % 360) + 360) % 360 })}
                    className={`w-14 text-right border rounded px-1.5 py-0.5 font-mono text-xs font-bold text-sky-500 ${
                      isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                    }`}
                  />
                  <span className="text-xs font-mono font-bold text-sky-500">°</span>
                </div>
              </div>

              {/* Slider */}
              <input
                type="range"
                min={0}
                max={360}
                value={currentRotation}
                onChange={(e) => updateElement(el.id, { rotation: Number(e.target.value) })}
                className="w-full accent-sky-500 cursor-pointer"
              />

              {/* Quick Rotate Buttons */}
              <div className="grid grid-cols-4 gap-1 pt-0.5">
                <button
                  onClick={() => rotateElementBy(el.id, -90)}
                  title="Rotate -90°"
                  className={`py-1 text-[10px] font-mono rounded border flex items-center justify-center gap-0.5 ${
                    isLight ? 'bg-white hover:bg-slate-100 border-slate-300' : 'bg-slate-900 hover:bg-slate-800 border-slate-700'
                  }`}
                >
                  <RotateCcw className="w-2.5 h-2.5" /> -90°
                </button>
                <button
                  onClick={() => rotateElementBy(el.id, -45)}
                  title="Rotate -45°"
                  className={`py-1 text-[10px] font-mono rounded border flex items-center justify-center gap-0.5 ${
                    isLight ? 'bg-white hover:bg-slate-100 border-slate-300' : 'bg-slate-900 hover:bg-slate-800 border-slate-700'
                  }`}
                >
                  <RotateCcw className="w-2.5 h-2.5" /> -45°
                </button>
                <button
                  onClick={() => rotateElementBy(el.id, 45)}
                  title="Rotate +45°"
                  className={`py-1 text-[10px] font-mono rounded border flex items-center justify-center gap-0.5 ${
                    isLight ? 'bg-white hover:bg-slate-100 border-slate-300' : 'bg-slate-900 hover:bg-slate-800 border-slate-700'
                  }`}
                >
                  <RotateCw className="w-2.5 h-2.5" /> +45°
                </button>
                <button
                  onClick={() => rotateElementBy(el.id, 90)}
                  title="Rotate +90°"
                  className={`py-1 text-[10px] font-mono rounded border flex items-center justify-center gap-0.5 ${
                    isLight ? 'bg-white hover:bg-slate-100 border-slate-300' : 'bg-slate-900 hover:bg-slate-800 border-slate-700'
                  }`}
                >
                  <RotateCw className="w-2.5 h-2.5" /> +90°
                </button>
              </div>

              {/* Cardinal Facing Presets */}
              <div className="grid grid-cols-4 gap-1 text-[9px] font-mono">
                <button
                  onClick={() => updateElement(el.id, { rotation: 0 })}
                  className={`py-0.5 rounded border text-center ${
                    currentRotation === 0 ? 'bg-sky-600 text-white font-bold border-sky-500' : isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  0° (Right)
                </button>
                <button
                  onClick={() => updateElement(el.id, { rotation: 90 })}
                  className={`py-0.5 rounded border text-center ${
                    currentRotation === 90 ? 'bg-sky-600 text-white font-bold border-sky-500' : isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  90° (Down)
                </button>
                <button
                  onClick={() => updateElement(el.id, { rotation: 180 })}
                  className={`py-0.5 rounded border text-center ${
                    currentRotation === 180 ? 'bg-sky-600 text-white font-bold border-sky-500' : isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  180° (Left)
                </button>
                <button
                  onClick={() => updateElement(el.id, { rotation: 270 })}
                  className={`py-0.5 rounded border text-center ${
                    currentRotation === 270 ? 'bg-sky-600 text-white font-bold border-sky-500' : isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  270° (Up)
                </button>
              </div>
            </div>
          )}

          {/* Per-Item Opacity Slider */}
          <div className="pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
            <div className="flex justify-between text-[11px] mb-1 font-medium">
              <span className={isLight ? 'text-slate-600' : 'text-slate-400'}>Item Opacity</span>
              <span className="font-mono font-bold text-sky-500">
                {Math.round((el.opacity ?? 1.0) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round((el.opacity ?? 1.0) * 100)}
              onChange={(e) => updateElement(el.id, { opacity: Number(e.target.value) / 100 })}
              className="w-full accent-sky-500 cursor-pointer"
            />
          </div>
        </RubricSection>
      </div>

      {/* 3. CAMERA SPECIFIC INSPECTOR */}
        {el.type === 'camera' && (() => {
          const cam = el as CameraElement;
          return (
            <div className="space-y-3 pt-1">
              {/* Quick Viewfinder Button */}
              <button
                onClick={() => openViewfinder(cam.id)}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-semibold text-xs transition-colors shadow-sm"
              >
                <Eye className="w-4 h-4" />
                <span>Simulate Camera Viewfinder</span>
              </button>

              {/* Rubric 1: Camera Identification & Rig */}
              <RubricSection
                title="Camera Identity & Rig"
                icon={<Camera className="w-3.5 h-3.5 text-sky-500" />}
                badge={
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-500 font-bold">
                    CAM {cam.cameraLabel}
                  </span>
                }
                defaultOpen={true}
                isLight={isLight}
              >
                {/* Camera Letter & Color */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="opacity-60 block mb-1">Camera ID</label>
                    <input
                      type="text"
                      value={cam.cameraLabel}
                      maxLength={3}
                      onChange={(e) => updateElement(cam.id, { cameraLabel: e.target.value.toUpperCase() })}
                      className={`w-full border rounded px-2 py-1 font-bold text-center ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="opacity-60 block mb-1">Color Marker</label>
                    <div className="flex gap-1.5 pt-1">
                      {CAMERA_COLOR_PALETTE.map((c) => (
                        <button
                          key={c}
                          onClick={() => updateElement(cam.id, { color: c })}
                          style={{ backgroundColor: c }}
                          className={`w-5 h-5 rounded-full border ${
                            cam.color === c ? 'border-white ring-2 ring-sky-400' : 'border-transparent'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Camera Rig & Height */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="opacity-60 block mb-1">Camera Rig</label>
                    <select
                      value={cam.rigType}
                      onChange={(e) => updateElement(cam.id, { rigType: e.target.value as any })}
                      className={`w-full border rounded-lg p-1.5 text-xs ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                      }`}
                    >
                      {CAMERA_RIGS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="opacity-60 block mb-1">Camera Height</label>
                    <select
                      value={cam.cameraHeight}
                      onChange={(e) => updateElement(cam.id, { cameraHeight: e.target.value as any })}
                      className={`w-full border rounded-lg p-1.5 text-xs ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                      }`}
                    >
                      {CAMERA_HEIGHTS.map((h) => (
                        <option key={h.value} value={h.value}>
                          {h.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </RubricSection>

              {/* Rubric 2: Lens, Sensor & Optics */}
              <RubricSection
                title="Lens & Optics"
                icon={<Eye className="w-3.5 h-3.5 text-indigo-500" />}
                badge={
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500 font-bold">
                    {cam.focalLength}mm · {cam.fovAngle}°
                  </span>
                }
                defaultOpen={true}
                isLight={isLight}
              >
                {/* Lens Focal Length */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-medium opacity-75">Lens Focal Length</label>
                    <span className="font-mono text-sky-500 font-bold">{cam.focalLength}mm</span>
                  </div>
                  {/* Focal length preset buttons */}
                  <div className="grid grid-cols-5 gap-1 mb-2">
                    {FOCAL_LENGTH_PRESETS.slice(0, 10).map((mm) => (
                      <button
                        key={mm}
                        onClick={() => updateElement(cam.id, { focalLength: mm })}
                        className={`py-1 text-[11px] font-mono rounded border transition-colors ${
                          cam.focalLength === mm
                            ? 'bg-sky-600 text-white border-sky-500 font-bold'
                            : isLight ? 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {mm}
                      </button>
                    ))}
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={200}
                    step={1}
                    value={cam.focalLength}
                    onChange={(e) => updateElement(cam.id, { focalLength: Number(e.target.value) })}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>

                {/* Sensor Format */}
                <div>
                  <label className="opacity-60 block mb-1">Sensor Format</label>
                  <select
                    value={cam.sensorFormat}
                    onChange={(e) => updateElement(cam.id, { sensorFormat: e.target.value as any })}
                    className={`w-full border rounded-lg p-2 ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  >
                    {SENSOR_FORMATS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] opacity-60 mt-1 block">
                    Horizontal FOV: <strong className="text-sky-500">{cam.fovAngle}°</strong>
                  </span>
                </div>

                {/* Aspect Ratio */}
                <div>
                  <label className="opacity-60 block mb-1">Aspect Ratio</label>
                  <select
                    value={cam.aspectRatio}
                    onChange={(e) => updateElement(cam.id, { aspectRatio: e.target.value as any })}
                    className={`w-full border rounded-lg p-2 ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  >
                    {ASPECT_RATIOS.map((ar) => (
                      <option key={ar.value} value={ar.value}>
                        {ar.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* FOV Cone Opacity */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="opacity-60">FOV Cone Opacity</span>
                    <span className="font-mono text-sky-500 font-bold">{Math.round((cam.fovOpacity ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={5}
                    value={Math.round((cam.fovOpacity ?? 1) * 100)}
                    onChange={(e) => updateElement(cam.id, { fovOpacity: Number(e.target.value) / 100 })}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>
              </RubricSection>

              {/* Rubric 3: Cinematography Exposure HUD */}
              <RubricSection
                title="Cinematography Exposure"
                icon={<Gauge className="w-3.5 h-3.5 text-amber-500" />}
                badge={
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold">
                    {cam.aperture || 'f/2.8'} · ISO {cam.iso ?? 800}
                  </span>
                }
                defaultOpen={false}
                isLight={isLight}
              >
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="opacity-60 block mb-1">Iris / T-stop</label>
                    <select
                      value={cam.aperture || 'f/2.8'}
                      onChange={(e) => updateElement(cam.id, { aperture: e.target.value })}
                      className={selectClass}
                    >
                      {APERTURES.map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="opacity-60 block mb-1">ISO</label>
                    <select
                      value={cam.iso ?? 800}
                      onChange={(e) => updateElement(cam.id, { iso: Number(e.target.value) })}
                      className={selectClass}
                    >
                      {ISO_VALUES.map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="opacity-60 block mb-1">Shutter Angle</label>
                    <select
                      value={cam.shutterAngle ?? 180}
                      onChange={(e) => updateElement(cam.id, { shutterAngle: Number(e.target.value) })}
                      className={selectClass}
                    >
                      {SHUTTER_ANGLES.map((value) => (
                        <option key={value} value={value}>{value}°</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="opacity-60 block mb-1">ND Filter</label>
                    <select
                      value={cam.ndFilter || 'None'}
                      onChange={(e) => updateElement(cam.id, { ndFilter: e.target.value })}
                      className={selectClass}
                    >
                      {ND_FILTERS.map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                  {(() => {
                    const fpsShot =
                      activeSetup.shots.find((shot) => shot.id === cam.associatedShotId) ||
                      activeSetup.shots.find((shot) => shot.cameraId === cam.id);
                    if (!fpsShot) return null;
                    return (
                      <div>
                        <label className="opacity-60 block mb-1">Frame Rate (shot {fpsShot.shotNumber})</label>
                        <select
                          value={fpsShot.frameRate ?? 24}
                          onChange={(e) => updateShot(fpsShot.id, { frameRate: Number(e.target.value) })}
                          className={selectClass}
                        >
                          {FRAME_RATES.map((value) => (
                            <option key={value} value={value}>{value} fps</option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}
                </div>
              </RubricSection>

              {/* Rubric 4: Waypoints & Storyboard */}
              {(() => {
                const nextBeat = Math.max(2, ...(cam.path || []).map((wp) => wp.beat + 1));
                const handleAddCamWp = () => {
                  const existingPath = cam.path || [];
                  const lastPoint = existingPath.length > 0
                    ? existingPath[existingPath.length - 1]
                    : { x: cam.x, y: cam.y, rotation: cam.rotation || 0 };
                  const angleRad = ((lastPoint.rotation || 0) * Math.PI) / 180;
                  const offsetDist = 60;
                  const newWp = {
                    id: `wp-${Date.now()}`,
                    x: Math.round(lastPoint.x + Math.cos(angleRad) * offsetDist),
                    y: Math.round(lastPoint.y + Math.sin(angleRad) * offsetDist),
                    rotation: lastPoint.rotation || 0,
                    beat: nextBeat,
                    dialogueCue: '',
                  };
                  updateElement(cam.id, { path: [...existingPath, newWp] });
                  if (nextBeat > (activeSetup.totalBeats || 1)) {
                    updateSetupMeta({ totalBeats: nextBeat });
                  }
                };

                return (
                  <RubricSection
                    title="Waypoints & Storyboard"
                    icon={<Compass className="w-3.5 h-3.5 text-emerald-500" />}
                    defaultOpen={true}
                    isLight={isLight}
                    headerRight={
                      <button
                        type="button"
                        title={`Add camera movement waypoint (Beat ${nextBeat})`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          handleAddCamWp();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="px-2 py-0.5 text-[10px] font-bold rounded bg-sky-500 hover:bg-sky-600 active:scale-95 text-white transition-all cursor-pointer select-none"
                      >
                        + Waypoint
                      </button>
                    }
                  >
                    {/* Camera Movement Waypoints */}
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        handleAddCamWp();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className={`w-full py-2 border rounded-lg text-xs font-semibold cursor-pointer select-none active:scale-[0.98] transition-transform ${
                        isLight ? 'bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100' : 'bg-slate-800 hover:bg-slate-700 text-sky-300 border-slate-700'
                      }`}
                    >
                      + Add Camera Movement Waypoint (Beat {nextBeat})
                    </button>

                {/* Editable waypoint list */}
                <WaypointListEditor
                  boardShot={
                    activeSetup.shots.find((shot) => shot.id === cam.associatedShotId) ||
                    activeSetup.shots.find((shot) => shot.cameraId === cam.id) ||
                    null
                  }
                  elementId={cam.id}
                  path={cam.path || []}
                  baseRotation={cam.rotation}
                  accentClass="text-sky-500"
                  isLight={isLight}
                />

                {/* Storyboard frames */}
                {(() => {
                  const linkedShot =
                    activeSetup.shots.find((s) => s.id === cam.associatedShotId) ||
                    activeSetup.shots.find((s) => s.cameraId === cam.id);
                  if (!linkedShot) return null;

                  const slots = slotsOf(linkedShot, cam);
                  const sceneRatio =
                    ASPECT_RATIOS.find((a) => a.value === (activeSetup.aspectRatio || '16:9'))?.ratio || 16 / 9;

                  return (
                    <div className={`pt-3 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-1 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-violet-500" />
                        Storyboard — Shot {linkedShot.shotNumber}
                      </h4>
                      <p className={`text-[10px] mb-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {slots.length > 1
                          ? `One frame per keyframe of this move (${slots.map((slot) => slot.label).join(' → ')}).`
                          : 'Add a waypoint to this camera to board the move beat by beat.'}
                      </p>

                      <div className="space-y-3">
                        {slots.map((slot) => (
                          <StoryboardField
                            key={slot.key}
                            label={slots.length > 1 ? `${slot.label} frame` : `Storyboard for Shot ${linkedShot.shotNumber}`}
                            value={slot.frame?.image}
                            onChange={(url) =>
                              updateShot(
                                linkedShot.id,
                                setFramePatch(linkedShot, slot.key, url ? { image: url, fit: 'cover' } : null)
                              )
                            }
                            aspectRatio={sceneRatio}
                            fit={slot.frame?.fit}
                            onFitChange={(fit) =>
                              updateShot(linkedShot.id, setFramePatch(linkedShot, slot.key, { fit }))
                            }
                            isLight={isLight}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </RubricSection>
            );
          })()}
        </div>
      );
    })()}

        {/* 4. ACTOR SPECIFIC INSPECTOR */}
        {el.type === 'actor' && (() => {
          const actor = el as ActorElement;
          return (
            <div className="space-y-3 pt-1">
              {/* Rubric 1: Character & Stance */}
              <RubricSection
                title="Character & Stance"
                icon={<User className="w-3.5 h-3.5 text-emerald-500" />}
                badge={
                  actor.characterName ? (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-bold truncate max-w-[100px]">
                      {actor.characterName}
                    </span>
                  ) : undefined
                }
                defaultOpen={true}
                isLight={isLight}
              >
                <div>
                  <label className="opacity-60 block mb-1">Character Name / ID</label>
                  <input
                    type="text"
                    value={actor.characterName || ''}
                    placeholder="e.g. SARAH (Lead Detective)"
                    onChange={(e) => updateElement(actor.id, { characterName: e.target.value })}
                    className={`w-full border rounded-lg p-2 ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  />
                </div>

                {/* Color Marker */}
                <div>
                  <label className="opacity-60 block mb-1">Avatar Color</label>
                  <div className="flex gap-2">
                    {ACTOR_COLOR_PALETTE.map((c) => (
                      <button
                        key={c}
                        onClick={() => updateElement(actor.id, { color: c })}
                        style={{ backgroundColor: c }}
                        className={`w-6 h-6 rounded-full border ${
                          actor.color === c ? 'border-white ring-2 ring-emerald-400' : 'border-transparent'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Actor Stance */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updateElement(actor.id, { isStanding: true })}
                    className={`py-2 text-xs font-semibold rounded-lg border transition-colors ${
                      actor.isStanding
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                        : isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    Standing
                  </button>
                  <button
                    onClick={() => updateElement(actor.id, { isStanding: false })}
                    className={`py-2 text-xs font-semibold rounded-lg border transition-colors ${
                      !actor.isStanding
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                        : isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    Seated / Chair
                  </button>
                </div>

                {/* Blocking Action & Dialogue notes */}
                <div>
                  <label className="opacity-60 block mb-1">Actor Action / Dialogue Notes</label>
                  <textarea
                    value={actor.actionNotes || ''}
                    onChange={(e) => updateElement(actor.id, { actionNotes: e.target.value })}
                    placeholder="e.g. Enters through front door on Beat 1, confronts Sarah on Beat 2..."
                    rows={2}
                    className={`w-full border rounded-lg p-2 focus:border-emerald-500 ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  />
                </div>
              </RubricSection>

              {/* Rubric 2: Waypoints & Movement */}
              {(() => {
                const nextBeat = Math.max(2, ...(actor.path || []).map((wp) => wp.beat + 1));
                const handleAddActorWp = () => {
                  const existingPath = actor.path || [];
                  const lastPoint = existingPath.length > 0
                    ? existingPath[existingPath.length - 1]
                    : { x: actor.x, y: actor.y, rotation: actor.rotation || 0 };
                  const angleRad = ((lastPoint.rotation || 0) * Math.PI) / 180;
                  const offsetDist = 50;
                  const newWp = {
                    id: `wp-${Date.now()}`,
                    x: Math.round(lastPoint.x + Math.cos(angleRad) * offsetDist),
                    y: Math.round(lastPoint.y + Math.sin(angleRad) * offsetDist),
                    rotation: lastPoint.rotation || 0,
                    beat: nextBeat,
                    dialogueCue: '',
                  };
                  updateElement(actor.id, { path: [...existingPath, newWp] });
                  if (nextBeat > (activeSetup.totalBeats || 1)) {
                    updateSetupMeta({ totalBeats: nextBeat });
                  }
                };

                return (
                  <RubricSection
                    title="Waypoints & Trajectory"
                    icon={<Compass className="w-3.5 h-3.5 text-sky-500" />}
                    defaultOpen={true}
                    isLight={isLight}
                    headerRight={
                      <button
                        type="button"
                        title={`Add actor waypoint (Beat ${nextBeat})`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          handleAddActorWp();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white transition-all cursor-pointer select-none"
                      >
                        + Waypoint
                      </button>
                    }
                  >
                    {/* Add Waypoint Button */}
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        handleAddActorWp();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className={`w-full py-2 border rounded-lg text-xs font-semibold cursor-pointer select-none active:scale-[0.98] transition-transform ${
                        isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100' : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700'
                      }`}
                    >
                      + Add Actor Waypoint (Beat {nextBeat})
                    </button>

                {/* Editable waypoint list */}
                <WaypointListEditor
                  elementId={actor.id}
                  path={actor.path || []}
                  baseRotation={actor.rotation}
                  accentClass="text-emerald-500"
                  isLight={isLight}
                />
              </RubricSection>
            );
          })()}
        </div>
      );
    })()}

        {/* 5. LIGHT SPECIFIC INSPECTOR */}
        {el.type === 'light' && (() => {
          const light = el as LightElement;
          const isFlag = isFlagFixture(light.fixtureType);
          const isRgbMode = !!light.rgbColor;
          const colorHex = (() => {
            if (light.rgbColor) {
              return ensureHexColor(light.rgbColor);
            }
            return kelvinToHex(light.colorTemp || 5600);
          })();
          const rgbParts = hexToRgbParts(colorHex);
          const hsvParts = hexToHsv(colorHex);
          return (
            <div className="space-y-3 pt-1">
              {/* Rubric 1: Role, Fixture & Model */}
              <RubricSection
                title="Role, Fixture & Model"
                icon={<Lightbulb className="w-3.5 h-3.5 text-amber-500" />}
                badge={
                  light.lightRole && light.lightRole !== 'unassigned' ? (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold uppercase truncate max-w-[100px]">
                      {LIGHT_ROLES.find((r) => r.value === light.lightRole)?.label || light.lightRole}
                    </span>
                  ) : undefined
                }
                defaultOpen={true}
                isLight={isLight}
              >
                {/* Light Function / Role */}
                <div>
                  <label className="opacity-60 block mb-1 font-semibold">Light Function / Role</label>
                  <select
                    value={light.lightRole || 'unassigned'}
                    onChange={(e) => updateElement(light.id, { lightRole: e.target.value as any })}
                    className={`w-full border rounded-lg p-2 font-medium ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  >
                    {LIGHT_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label} ({r.description})
                      </option>
                    ))}
                  </select>

                  {/* Role Tag Color Customizer */}
                  {light.lightRole && light.lightRole !== 'unassigned' && (() => {
                    const beamHex = isFlag
                      ? '#ffffff'
                      : (light.rgbColor ? ensureHexColor(light.rgbColor) : kelvinToHex(light.colorTemp || 5600));
                    const isAuto = !light.roleColor;
                    const activeRoleColor = light.roleColor ? ensureHexColor(light.roleColor) : beamHex;

                    return (
                      <div className={`mt-2 p-2 rounded-xl border space-y-1.5 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider opacity-50">
                            Role Tag Color
                          </span>
                          <button
                            type="button"
                            onClick={() => updateElement(light.id, { roleColor: undefined })}
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border transition-all ${
                              isAuto
                                ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                                : isLight
                                ? 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                                : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                            }`}
                          >
                            Auto (Beam Color)
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-sm flex-shrink-0"
                              style={{ backgroundColor: activeRoleColor }}
                            />
                            <span className="text-xs font-mono font-bold truncate">
                              {isAuto ? 'Auto' : light.roleColor}
                            </span>
                            {isAuto && (
                              <span className="text-[10px] opacity-60 truncate">
                                (Matches {isFlag ? 'white' : (light.colorTemp > 0 ? `${light.colorTemp}K` : 'RGB')})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <label
                              className={`relative w-6 h-6 rounded-md border cursor-pointer overflow-hidden ${
                                isLight ? 'border-slate-300' : 'border-slate-700'
                              }`}
                              title="Pick custom color for this role tag"
                            >
                              <input
                                type="color"
                                value={ensureHexColor(activeRoleColor, '#f59e0b')}
                                onChange={(e) => updateElement(light.id, { roleColor: e.target.value })}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                              />
                              <span
                                className="absolute inset-0.5 rounded border border-black/10"
                                style={{ backgroundColor: activeRoleColor }}
                              />
                            </label>
                          </div>
                        </div>

                        {/* Quick Swatches */}
                        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-800/60">
                          <span className="text-[9px] opacity-50">Custom:</span>
                          {[
                            { color: '#ffffff', label: 'White' },
                            { color: '#f59e0b', label: 'Amber' },
                            { color: '#38bdf8', label: 'Sky' },
                            { color: '#10b981', label: 'Emerald' },
                            { color: '#a855f7', label: 'Purple' },
                            { color: '#ec4899', label: 'Pink' },
                            { color: '#94a3b8', label: 'Slate' },
                          ].map((s) => (
                            <button
                              key={s.color}
                              type="button"
                              title={s.label}
                              onClick={() => updateElement(light.id, { roleColor: s.color })}
                              className={`w-4 h-4 rounded-full border transition-transform hover:scale-110 ${
                                light.roleColor?.toLowerCase() === s.color.toLowerCase()
                                  ? 'ring-2 ring-sky-500 scale-110'
                                  : 'border-white/20'
                              }`}
                              style={{ backgroundColor: s.color }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Fixture Type */}
                <div>
                  <label className="opacity-60 block mb-1 font-semibold">Fixture Model / Type</label>
                  <select
                    value={light.fixtureType}
                    onChange={(e) => {
                      const fix = LIGHT_FIXTURES.find((f) => f.type === e.target.value);
                      const flag = !!fix?.isFlag;
                      const defaultName = !light.brand && !light.fixtureModel ? (fix?.name || 'Light') : light.name;
                      updateElement(light.id, {
                        fixtureType: e.target.value as any,
                        name: defaultName,
                        beamAngle: flag ? 0 : fix?.defaultBeam ?? light.beamAngle,
                        colorTemp: flag ? 0 : fix?.defaultTemp ?? (light.colorTemp || 5600),
                        rgbColor: undefined,
                        ...(flag
                          ? { flagSize: light.flagSize || DEFAULT_FLAG_SIZE }
                          : {}),
                      });
                    }}
                    className={`w-full border rounded-lg p-2 ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  >
                    {LIGHT_FIXTURES.map((f) => (
                      <option key={f.type} value={f.type}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Brand & Model Designation */}
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="opacity-60 block mb-1 font-semibold">Brand</label>
                      <select
                        value={light.brand || ''}
                        onChange={(e) => {
                          const brand = e.target.value;
                          const fix = LIGHT_FIXTURES.find((f) => f.type === light.fixtureType);
                          if (!brand) {
                            updateElement(light.id, {
                              brand: undefined,
                              fixtureModel: undefined,
                              name: fix?.name || 'Light',
                            });
                            return;
                          }
                          const newName = `${brand} ${fix?.name || 'Light'}`.trim();
                          updateElement(light.id, { brand, fixtureModel: undefined, name: newName });
                        }}
                        className={`w-full border rounded-lg p-2 ${
                          isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                        }`}
                      >
                        <option value="">(No Brand / Generic)</option>
                        {LIGHTING_BRANDS.map((b) => (
                          <option key={b.brand} value={b.brand}>
                            {b.brand}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="opacity-60 block mb-1 font-semibold">Model Preset</label>
                      {(() => {
                        const brandObj = LIGHTING_BRANDS.find((b) => b.brand === light.brand);
                        const models = brandObj?.models || [];
                        const isCustom = !!light.fixtureModel && !models.includes(light.fixtureModel);

                        return (
                          <select
                            value={isCustom ? '__custom__' : (light.fixtureModel || '')}
                            onChange={(e) => {
                              const val = e.target.value;
                              const fix = LIGHT_FIXTURES.find((f) => f.type === light.fixtureType);
                              if (val === '__custom__') {
                                updateElement(light.id, { fixtureModel: light.fixtureModel || 'Custom Model' });
                              } else if (!val) {
                                const newName = light.brand ? `${light.brand} ${fix?.name || 'Light'}` : (fix?.name || 'Light');
                                updateElement(light.id, { fixtureModel: undefined, name: newName });
                              } else {
                                const newName = light.brand ? `${light.brand} ${val}`.trim() : val;
                                updateElement(light.id, { fixtureModel: val, name: newName });
                              }
                            }}
                            className={`w-full border rounded-lg p-2 ${
                              isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                            }`}
                          >
                            <option value="">(Select a Model...)</option>
                            {models.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                            <option value="__custom__">✏️ Custom Model Name…</option>
                          </select>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Custom Model Name Input Field */}
                  {(() => {
                    const brandObj = LIGHTING_BRANDS.find((b) => b.brand === light.brand);
                    const models = brandObj?.models || [];
                    const isCustom = !models.includes(light.fixtureModel || '');
                    if (!isCustom && !light.brand) return null;

                    return (
                      <div>
                        <label className="opacity-60 block mb-1 text-[11px]">Custom Model / Unit Name</label>
                        <input
                          type="text"
                          value={light.fixtureModel || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            const fix = LIGHT_FIXTURES.find((f) => f.type === light.fixtureType);
                            const newName = val
                              ? (light.brand ? `${light.brand} ${val}`.trim() : val)
                              : (light.brand ? `${light.brand} ${fix?.name || 'Light'}` : (fix?.name || 'Light'));
                            updateElement(light.id, { fixtureModel: val || undefined, name: newName });
                          }}
                          placeholder="e.g. LS 600d Pro / Custom Unit"
                          className={`w-full border rounded-lg p-2 text-xs ${
                            isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                          }`}
                        />
                      </div>
                    );
                  })()}

                  {/* Quick Model Presets pills */}
                  {light.brand && (() => {
                    const models = LIGHTING_BRANDS.find((b) => b.brand === light.brand)?.models || [];
                    if (models.length === 0) return null;
                    return (
                      <div>
                        <span className="text-[10px] opacity-60 block mb-1 font-medium">Quick Presets:</span>
                        <div className="flex flex-wrap gap-1">
                          {models.slice(0, 8).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                const newName = `${light.brand} ${m}`.trim();
                                updateElement(light.id, { fixtureModel: m, name: newName });
                              }}
                              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                                light.fixtureModel === m
                                  ? 'bg-sky-600 text-white border-sky-500 font-semibold'
                                  : isLight
                                  ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {isFlag && (
                  /* ---------- C-STAND FLAG CONTROLS ---------- */
                  <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                    <div>
                      <label className="opacity-60 block mb-1">Flag Fabric Size</label>
                      <div className="grid grid-cols-4 gap-1">
                        {FLAG_SIZE_PRESETS.map((s) => (
                          <button
                            key={s.value}
                            onClick={() =>
                              updateElement(light.id, {
                                flagSize: s.value as LightElement['flagSize'],
                              })
                            }
                            title={s.label}
                            className={`py-1.5 text-[10px] font-mono rounded border transition-colors ${
                              (light.flagSize || DEFAULT_FLAG_SIZE) === s.value
                                ? 'bg-slate-950 text-white border-slate-500'
                                : isLight
                                ? 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                                : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {light.fixtureType === 'flag_net' && (
                      <div>
                        <label className="opacity-60 block mb-1">Net Density (Light Cut)</label>
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            onClick={() => updateElement(light.id, { netValue: 'single' })}
                            className={`py-1.5 text-[10px] font-semibold rounded border transition-colors ${
                              (light.netValue || 'single') === 'single'
                                ? 'bg-sky-600 text-white border-sky-500'
                                : isLight
                                ? 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                                : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                            }`}
                          >
                            Single Net (≈½ stop)
                          </button>
                          <button
                            onClick={() => updateElement(light.id, { netValue: 'double' })}
                            className={`py-1.5 text-[10px] font-semibold rounded border transition-colors ${
                              light.netValue === 'double'
                                ? 'bg-sky-600 text-white border-sky-500'
                                : isLight
                                ? 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                                : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                            }`}
                          >
                            Double Net (≈1 stop)
                          </button>
                        </div>
                      </div>
                    )}

                    <div className={`text-[10px] rounded-lg border p-2.5 leading-relaxed ${
                      isLight ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}>
                      <strong className={isLight ? 'text-slate-700' : 'text-slate-200'}>
                        {flagLabel(light)}
                      </strong>
                      {light.fixtureType === 'flag_solid' || light.fixtureType === 'c_stand_flag'
                        ? ' — blocks / removes light (negative fill).'
                        : light.fixtureType === 'flag_silk'
                        ? ' — softens & diffuses the light passing through it.'
                        : light.fixtureType === 'flag_net'
                        ? ' — reduces intensity in a wash without changing color or softness.'
                        : ' — shapes light with a long blade (kicks, forehead shadows).'}
                      {' '}Flags do not emit light, so they have no beam, color temp, or intensity.
                    </div>
                  </div>
                )}
              </RubricSection>

              {!isFlag && (
                <>
                  {/* Rubric 2: Color Temperature & Intensity */}
                  <RubricSection
                    title="Color & Intensity"
                    icon={<Sun className="w-3.5 h-3.5 text-amber-500" />}
                    badge={
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold">
                        {isRgbMode ? colorHex : `${light.colorTemp || 5600}K`} · {light.intensity}%
                      </span>
                    }
                    defaultOpen={true}
                    isLight={isLight}
                  >
                    {/* Color Mode Selector */}
                    <div>
                      <label className="opacity-60 block mb-1 font-semibold">Color Mode</label>
                      <div className="grid grid-cols-2 gap-1.5 mb-2">
                        <button
                          type="button"
                          onClick={() => updateElement(light.id, { rgbColor: undefined, colorTemp: light.colorTemp || 5600 })}
                          style={
                            !isRgbMode
                              ? {
                                  backgroundColor: kelvinToRgb(light.colorTemp || 5600),
                                  color: '#0f172a',
                                  borderColor: '#f59e0b',
                                }
                              : undefined
                          }
                          className={`py-1.5 text-xs font-bold rounded-lg border transition-all shadow-sm ${
                            !isRgbMode
                              ? 'ring-2 ring-amber-400/40'
                              : isLight
                              ? 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                              : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          Kelvin CCT (White)
                        </button>
                        <button
                          type="button"
                          onClick={() => updateElement(light.id, { rgbColor: light.rgbColor || colorHex, colorTemp: 0 })}
                          style={
                            isRgbMode
                              ? {
                                  backgroundColor: colorHex,
                                  color: '#ffffff',
                                  borderColor: colorHex,
                                  textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                                }
                              : undefined
                          }
                          className={`py-1.5 text-xs font-bold rounded-lg border transition-all shadow-sm ${
                            isRgbMode
                              ? 'ring-2 ring-white/40'
                              : isLight
                              ? 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                              : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          RGB / HSV Color
                        </button>
                      </div>
                    </div>

                    {!isRgbMode ? (
                      /* ---------- KELVIN CCT MODE (DEFAULT) ---------- */
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="opacity-60">Color Temp (Kelvin)</span>
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-black/20 inline-block shadow-sm"
                              style={{ backgroundColor: kelvinToRgb(light.colorTemp || 5600) }}
                            />
                            <span className="font-mono text-amber-500 font-bold">
                              {light.colorTemp || 5600}K
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-1 mb-2">
                          {[2700, 3200, 4500, 5600].map((k) => {
                            const kColor = kelvinToRgb(k);
                            const isSelected = light.colorTemp === k;
                            return (
                              <button
                                key={k}
                                type="button"
                                onClick={() => updateElement(light.id, { colorTemp: k, rgbColor: undefined })}
                                style={isSelected ? { backgroundColor: kColor, color: '#0f172a', borderColor: '#f59e0b' } : undefined}
                                className={`py-1 text-[10px] font-mono rounded border flex items-center justify-center gap-1 transition-all ${
                                  isSelected
                                    ? 'font-bold shadow-sm ring-1 ring-amber-400'
                                    : isLight
                                    ? 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900'
                                }`}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full border border-black/20"
                                  style={{ backgroundColor: kColor }}
                                />
                                <span>{k}K</span>
                              </button>
                            );
                          })}
                        </div>
                        <input
                          type="range"
                          min={2000}
                          max={7000}
                          step={100}
                          value={light.colorTemp || 5600}
                          onChange={(e) => updateElement(light.id, { colorTemp: Number(e.target.value), rgbColor: undefined })}
                          style={{
                            accentColor: kelvinToRgb(light.colorTemp || 5600),
                          }}
                          className="w-full cursor-pointer h-2 rounded-lg"
                        />
                      </div>
                    ) : (
                      /* ---------- RGB / HSV FULL COLOR MODE ---------- */
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="opacity-60 font-semibold">RGB / HSV Color</span>
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-3 h-3 rounded-full border border-white/20 shadow-sm"
                              style={{ backgroundColor: colorHex }}
                            />
                            <span className="font-mono font-bold uppercase" style={{ color: colorHex }}>
                              {colorHex}
                            </span>
                          </div>
                        </div>
                        <input
                          type="color"
                          value={ensureHexColor(colorHex, '#ff0055')}
                          onChange={(e) =>
                            updateElement(light.id, { rgbColor: e.target.value, colorTemp: 0 })
                          }
                          className="w-full h-8 cursor-pointer rounded border bg-transparent"
                        />
                        {/* RGB values with color-coded sliders */}
                        <div className="grid grid-cols-3 gap-2">
                          {(
                            [
                              ['R', rgbParts.r, 255, '#ef4444', 'text-red-500'],
                              ['G', rgbParts.g, 255, '#22c55e', 'text-green-500'],
                              ['B', rgbParts.b, 255, '#3b82f6', 'text-blue-500'],
                            ] as const
                          ).map(([label, val, max, accent, textClass]) => (
                            <label key={label} className="block">
                              <span className={`block text-[9px] font-bold opacity-80 mb-0.5 ${textClass}`}>
                                {label} {val}
                              </span>
                              <input
                                type="range"
                                min={0}
                                max={max}
                                value={val}
                                style={{ accentColor: accent }}
                                onChange={(e) =>
                                  updateElement(light.id, {
                                    rgbColor: rgbToHex(
                                      label === 'R' ? Number(e.target.value) : rgbParts.r,
                                      label === 'G' ? Number(e.target.value) : rgbParts.g,
                                      label === 'B' ? Number(e.target.value) : rgbParts.b
                                    ),
                                    colorTemp: 0,
                                  })
                                }
                                className="w-full cursor-pointer h-2 rounded-lg"
                              />
                            </label>
                          ))}
                        </div>
                        {/* HSV values with color-coded sliders */}
                        <div className="grid grid-cols-3 gap-2">
                          {(
                            [
                              ['H', hsvParts.h, 360, hsvToHex(hsvParts.h, 100, 100), 'text-fuchsia-400'],
                              ['S', hsvParts.s, 100, colorHex, 'text-cyan-400'],
                              ['V', hsvParts.v, 100, colorHex, 'text-amber-400'],
                            ] as const
                          ).map(([label, val, max, accent, textClass]) => (
                            <label key={label} className="block">
                              <span className={`block text-[9px] font-bold opacity-80 mb-0.5 ${textClass}`}>
                                {label} {val}
                              </span>
                              <input
                                type="range"
                                min={0}
                                max={max}
                                value={val}
                                style={{ accentColor: accent }}
                                onChange={(e) =>
                                  updateElement(light.id, {
                                    rgbColor: hsvToHex(
                                      label === 'H' ? Number(e.target.value) : hsvParts.h,
                                      label === 'S' ? Number(e.target.value) : hsvParts.s,
                                      label === 'V' ? Number(e.target.value) : hsvParts.v
                                    ),
                                    colorTemp: 0,
                                  })
                                }
                                className="w-full cursor-pointer h-2 rounded-lg"
                              />
                            </label>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => updateElement(light.id, { rgbColor: undefined, colorTemp: 5600 })}
                          className={`w-full py-1 text-xs rounded border text-slate-400 hover:text-white transition-colors ${
                            isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          ✕ Remove RGB Color (Reset to Kelvin White)
                        </button>
                      </div>
                    )}

                    {/* Light Intensity */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="opacity-60">Intensity (Dimmer)</span>
                        <span className="font-mono font-bold">{light.intensity}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={light.intensity}
                        onChange={(e) => updateElement(light.id, { intensity: Number(e.target.value) })}
                        style={{ accentColor: isRgbMode ? colorHex : kelvinToRgb(light.colorTemp || 5600) }}
                        className="w-full cursor-pointer h-2 rounded-lg"
                      />
                    </div>

                    {/* Per-light beam visibility */}
                    <div>
                      <div className="grid grid-cols-2 gap-2">
                        <PillToggle
                          on={light.beamVisible !== false}
                          onClick={() => updateElement(light.id, { beamVisible: light.beamVisible === false })}
                          label="Light beam"
                          isLight={isLight}
                        />
                        <PillToggle
                          on={light.hasBarnDoors === true}
                          onClick={() => updateElement(light.id, { hasBarnDoors: light.hasBarnDoors !== true })}
                          label="Barn doors"
                          isLight={isLight}
                        />
                      </div>
                    </div>
                  </RubricSection>

                  {/* Rubric 3: Beam Geometry & Throw */}
                  <RubricSection
                    title="Beam Throw & Angle"
                    icon={<Maximize className="w-3.5 h-3.5 text-sky-500" />}
                    badge={
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-500 font-bold">
                        {light.beamAngle}° · {light.throwDistance}px
                      </span>
                    }
                    defaultOpen={false}
                    isLight={isLight}
                  >
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="opacity-60">Beam Angle</span>
                          <span className="font-mono text-amber-500 font-bold">{light.beamAngle}°</span>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={160}
                          value={light.beamAngle}
                          onChange={(e) => updateElement(light.id, { beamAngle: Number(e.target.value) })}
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="opacity-60">Throw Distance</span>
                          <span className="font-mono text-amber-500 font-bold">{light.throwDistance} px</span>
                        </div>
                        <input
                          type="range"
                          min={60}
                          max={400}
                          value={light.throwDistance}
                          onChange={(e) => updateElement(light.id, { throwDistance: Number(e.target.value) })}
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                      </div>
                    </div>
                  </RubricSection>
                </>
              )}

              {/* Rubric 4: Floorplan Badge & Custom Label Color */}
              <RubricSection
                title="Badge Info & Label Color"
                icon={<Tags className="w-3.5 h-3.5 text-purple-500" />}
                defaultOpen={false}
                isLight={isLight}
              >
                {/* Floor Plan Label Toggles */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-1">
                    Floorplan Badge Info
                  </span>
                  <div className="grid grid-cols-2 gap-1">
                    <PillToggle
                      on={displaySettings.showLightRoleLabels !== false}
                      onClick={() => updateDisplaySettings({ showLightRoleLabels: !(displaySettings.showLightRoleLabels !== false) })}
                      label="Role (Key/Fill)"
                      isLight={isLight}
                    />
                    <PillToggle
                      on={displaySettings.showLightNameLabels !== false}
                      onClick={() => updateDisplaySettings({ showLightNameLabels: !(displaySettings.showLightNameLabels !== false) })}
                      label="Name / Model"
                      isLight={isLight}
                    />
                    <PillToggle
                      on={displaySettings.showLightKelvinLabels === true}
                      onClick={() => updateDisplaySettings({ showLightKelvinLabels: !(displaySettings.showLightKelvinLabels === true) })}
                      label="Color Temp (K)"
                      isLight={isLight}
                    />
                    <PillToggle
                      on={displaySettings.showLightIntensityLabels === true}
                      onClick={() => updateDisplaySettings({ showLightIntensityLabels: !(displaySettings.showLightIntensityLabels === true) })}
                      label="Dim Level (%)"
                      isLight={isLight}
                    />
                  </div>
                </div>

                {/* Per-fixture Label Color */}
                {(() => {
                  const beamHex = isFlag
                    ? '#ffffff'
                    : (light.rgbColor ? ensureHexColor(light.rgbColor) : kelvinToHex(light.colorTemp || 5600));
                  const isAuto = !light.labelColor;

                  return (
                    <div className={`mt-2 p-2 rounded-xl border space-y-2 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-50">
                          Fixture Label Color
                        </span>
                        <button
                          type="button"
                          onClick={() => updateElement(light.id, { labelColor: undefined })}
                          className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border transition-all ${
                            isAuto
                              ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                              : isLight
                              ? 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                              : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          Auto (Beam Color)
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-sm flex-shrink-0"
                            style={{ backgroundColor: light.labelColor ? ensureHexColor(light.labelColor) : beamHex }}
                          />
                          <span className="text-xs font-mono font-bold truncate">
                            {isAuto ? 'Auto' : light.labelColor}
                          </span>
                          {isAuto && (
                            <span className="text-[10px] opacity-60 truncate">
                              (Matches {isFlag ? 'white' : (light.colorTemp > 0 ? `${light.colorTemp}K` : 'RGB')})
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <label
                            className={`relative w-6 h-6 rounded-md border cursor-pointer overflow-hidden ${
                              isLight ? 'border-slate-300' : 'border-slate-700'
                            }`}
                            title="Pick custom label color"
                          >
                            <input
                              type="color"
                              value={ensureHexColor(light.labelColor || beamHex, '#ffffff')}
                              onChange={(e) => updateElement(light.id, { labelColor: e.target.value })}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                            <span
                              className="absolute inset-0.5 rounded border border-black/10"
                              style={{ backgroundColor: light.labelColor ? ensureHexColor(light.labelColor) : beamHex }}
                            />
                          </label>
                        </div>
                      </div>

                      {/* Quick Swatches */}
                      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-800/60">
                        <span className="text-[9px] opacity-50">Custom:</span>
                        {[
                          { color: '#ffffff', label: 'White' },
                          { color: '#f59e0b', label: 'Amber' },
                          { color: '#38bdf8', label: 'Sky' },
                          { color: '#10b981', label: 'Emerald' },
                          { color: '#ec4899', label: 'Pink' },
                          { color: '#94a3b8', label: 'Slate' },
                        ].map((s) => (
                          <button
                            key={s.color}
                            type="button"
                            title={s.label}
                            onClick={() => updateElement(light.id, { labelColor: s.color })}
                            className={`w-4 h-4 rounded-full border transition-transform hover:scale-110 ${
                              light.labelColor?.toLowerCase() === s.color.toLowerCase()
                                ? 'ring-2 ring-sky-500 scale-110'
                                : 'border-white/20'
                            }`}
                            style={{ backgroundColor: s.color }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </RubricSection>
            </div>
          );
        })()}

        {/* 6. PROP SPECIFIC INSPECTOR */}
        {el.type === 'prop' && (() => {
          const prop = el as PropElement;
          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Prop Dimensions & Type"
                icon={<Tv className="w-3.5 h-3.5 text-purple-500" />}
                defaultOpen={true}
                isLight={isLight}
              >
                <div>
                  <label className="opacity-60 block mb-1">Prop Type Preset</label>
                  <select
                    value={prop.propType}
                    onChange={(e) => {
                      const info = PROP_CATALOG.find((p) => p.type === e.target.value);
                      updateElement(prop.id, {
                        propType: e.target.value as any,
                        width: info?.defaultWidth ?? prop.width,
                        height: info?.defaultHeight ?? prop.height,
                        color: info?.defaultColor ?? prop.color,
                      });
                    }}
                    className={`w-full border rounded-lg p-2 ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  >
                    {PROP_CATALOG.map((p) => (
                      <option key={p.type} value={p.type}>
                        {p.name} ({p.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="opacity-60 block mb-1">Width (px)</label>
                    <input
                      type="number"
                      value={prop.width}
                      onChange={(e) => updateElement(prop.id, { width: Number(e.target.value) })}
                      className={`w-full border rounded p-1 font-mono ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="opacity-60 block mb-1">Height (px)</label>
                    <input
                      type="number"
                      value={prop.height}
                      onChange={(e) => updateElement(prop.id, { height: Number(e.target.value) })}
                      className={`w-full border rounded p-1 font-mono ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                      }`}
                    />
                  </div>
                </div>

                {/* Prop Opacity Slider */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="opacity-60">Opacity</span>
                    <span className="font-mono text-purple-400 font-bold">
                      {Math.round((prop.opacity ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={5}
                    value={Math.round((prop.opacity ?? 1) * 100)}
                    onChange={(e) => updateElement(prop.id, { opacity: Number(e.target.value) / 100 })}
                    className="w-full accent-purple-500 cursor-pointer h-1.5"
                  />
                </div>

                {/* Color / Material Tint */}
                <div>
                  <label className="opacity-60 block mb-1">Color / Material Tint</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={prop.color || '#475569'}
                      onChange={(e) => updateElement(prop.id, { color: e.target.value })}
                      className="w-8 h-8 rounded border cursor-pointer flex-shrink-0"
                    />
                    <input
                      type="text"
                      value={prop.color || '#475569'}
                      onChange={(e) => updateElement(prop.id, { color: e.target.value })}
                      className={`flex-1 border rounded p-1 font-mono text-xs ${
                        isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                      }`}
                    />
                  </div>
                </div>
              </RubricSection>
            </div>
          );
        })()}

        {/* 7. WALL SPECIFIC INSPECTOR */}
        {el.type === 'wall' && (() => {
          const wall = el as WallElement;
          const wallLen = Math.round(
            Math.sqrt(Math.pow((wall.x2 ?? wall.x + 200) - wall.x, 2) + Math.pow((wall.y2 ?? wall.y) - wall.y, 2))
          );
          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Wall Dimensions & Inserts"
                icon={<Square className="w-3.5 h-3.5 text-slate-400" />}
                badge={
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-500/10 font-bold">
                    {(wallLen / 50).toFixed(2)}m
                  </span>
                }
                defaultOpen={true}
                isLight={isLight}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="opacity-60">Wall Length:</span>
                  <span className="font-mono text-sky-500 font-bold">{(wallLen / 50).toFixed(2)}m ({wallLen}px)</span>
                </div>

                <div>
                  <label className="opacity-60 block mb-1">Thickness (px)</label>
                  <input
                    type="number"
                    min={4}
                    max={40}
                    value={wall.thickness || 12}
                    onChange={(e) => updateElement(wall.id, { thickness: Number(e.target.value) })}
                    className={`w-full border rounded p-1.5 font-mono text-xs ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  />
                </div>

                {/* Quick Snap Insert Door / Window Buttons */}
                <div className="pt-2 space-y-2 border-t border-slate-200/60 dark:border-slate-700/50">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 block">
                    Quick Wall Insertions
                  </span>
                  <button
                    onClick={() => insertDoorInWall(wall.id)}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 border border-amber-500/40 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <DoorClosed className="w-4 h-4 text-amber-500" />
                    <span>+ Snap Door onto this Wall</span>
                  </button>
                  <button
                    onClick={() => insertWindowInWall(wall.id)}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-sky-500/15 hover:bg-sky-500/25 text-sky-600 border border-sky-500/40 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <AppWindow className="w-4 h-4 text-sky-500" />
                    <span>+ Snap Window onto this Wall</span>
                  </button>
                </div>
              </RubricSection>
            </div>
          );
        })()}

        {/* 8. DOOR SPECIFIC INSPECTOR */}
        {el.type === 'door' && (() => {
          const door = el as DoorElement;
          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Door Dimensions & Swing"
                icon={<DoorClosed className="w-3.5 h-3.5 text-amber-500" />}
                defaultOpen={true}
                isLight={isLight}
              >
                <div>
                  <label className="opacity-60 block mb-1">Door Width (px)</label>
                  <input
                    type="number"
                    min={30}
                    max={150}
                    value={door.width || 60}
                    onChange={(e) => updateElement(door.id, { width: Number(e.target.value) })}
                    className={`w-full border rounded p-1.5 font-mono text-xs ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  />
                </div>

                <div>
                  <label className="opacity-60 block mb-1">Door Swing Angle</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[45, 90, 180].map((deg) => (
                      <button
                        key={deg}
                        onClick={() => updateElement(door.id, { swingAngle: deg })}
                        className={`py-1.5 text-xs font-mono rounded border ${
                          (door.swingAngle || 90) === deg
                            ? 'bg-amber-600 text-white border-amber-500 font-bold'
                            : isLight ? 'bg-slate-50 text-slate-700 border-slate-300' : 'bg-slate-950 text-slate-400 border-slate-800'
                        }`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => updateElement(door.id, { swingDirection: door.swingDirection === 'left' ? 'right' : 'left' })}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1 transition-colors ${
                      isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                  >
                    <FlipHorizontal className="w-3.5 h-3.5 text-amber-500" />
                    <span>{door.swingDirection === 'left' ? 'Left Hinge' : 'Right Hinge'}</span>
                  </button>
                  <button
                    onClick={() => updateElement(door.id, { isOpen: !door.isOpen })}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1 transition-colors ${
                      isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                  >
                    <SquareSplitHorizontal className="w-3.5 h-3.5 text-amber-500" />
                    <span>{door.isOpen ? 'Door Open' : 'Door Closed'}</span>
                  </button>
                </div>
              </RubricSection>
            </div>
          );
        })()}

        {/* 9. WINDOW SPECIFIC INSPECTOR */}
        {el.type === 'window' && (() => {
          const win = el as WindowElement;
          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Window Dimensions & Sunlight"
                icon={<AppWindow className="w-3.5 h-3.5 text-sky-500" />}
                defaultOpen={true}
                isLight={isLight}
              >
                <div>
                  <label className="opacity-60 block mb-1">Window Width (px)</label>
                  <input
                    type="number"
                    min={30}
                    max={250}
                    value={win.width || 80}
                    onChange={(e) => updateElement(win.id, { width: Number(e.target.value) })}
                    className={`w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                  />
                </div>

                <div>
                  <label className="opacity-60 block mb-1">Depth / Frame (px)</label>
                  <input
                    type="number"
                    min={6}
                    max={30}
                    value={win.depth || 12}
                    onChange={(e) => updateElement(win.id, { depth: Number(e.target.value) })}
                    className={`w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                  />
                </div>

                <div className="p-2.5 bg-sky-500/10 border border-sky-500/30 rounded-lg text-[11px] text-sky-600">
                  <span className="font-semibold block mb-0.5">Natural Sunlight Simulation</span>
                  Acts as an ambient daylight portal on the floor plan and camera coverage preview.
                </div>

                <PillToggle
                  on={win.beamVisible === true}
                  onClick={() =>
                    updateElement(win.id, {
                      beamVisible: !win.beamVisible,
                    })
                  }
                  label="Sunlight cone"
                  isLight={isLight}
                />

                {/* Window Orientation & Direction */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex justify-between items-center mb-1">
                    <label className="opacity-60 text-xs">Window Facing Angle</label>
                    <span className="font-mono text-xs font-bold text-sky-500">
                      {Math.round(((win.rotation || 0) % 360 + 360) % 360)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={Math.round(((win.rotation || 0) % 360 + 360) % 360)}
                    onChange={(e) => updateElement(win.id, { rotation: Number(e.target.value) })}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
                  />
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateElement(win.id, {
                          rotation: Math.round(((win.rotation || 0) + 180) % 360),
                        })
                      }
                      className={`py-1.5 px-2 border rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                        isLight
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                      }`}
                    >
                      <RotateCw className="w-3 h-3" />
                      Flip 180°
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateElement(win.id, {
                          rotation: Math.round(((win.rotation || 0) + 90) % 360),
                        })
                      }
                      className={`py-1.5 px-2 border rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                        isLight
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                      }`}
                    >
                      <RotateCw className="w-3 h-3" />
                      Rotate +90°
                    </button>
                  </div>
                </div>
              </RubricSection>
            </div>
          );
        })()}

        {/* 10. TEXT SPECIFIC INSPECTOR */}
        {el.type === 'text' && (() => {
          const txt = el as TextElement;
          const txtInputClass = `w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`;
          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Text Content & Typography"
                icon={<Type className="w-3.5 h-3.5 text-blue-500" />}
                defaultOpen={true}
                isLight={isLight}
              >
                <div>
                  <label className="opacity-60 block mb-1">Text Content</label>
                  <textarea
                    value={txt.text}
                    onChange={(e) => updateElement(txt.id, { text: e.target.value })}
                    rows={2}
                    className={txtInputClass}
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="opacity-60">Font Size (px)</span>
                    <span className="font-mono font-bold">{txt.fontSize || 16}px</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={96}
                    step={1}
                    value={txt.fontSize || 16}
                    onChange={(e) => updateElement(txt.id, { fontSize: Number(e.target.value) })}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <PillToggle
                    on={(txt.fontWeight || 'normal') === 'bold'}
                    onClick={() => updateElement(txt.id, { fontWeight: txt.fontWeight === 'bold' ? 'normal' : 'bold' })}
                    label="Bold"
                    isLight={isLight}
                  />
                  <PillToggle
                    on={(txt.fontStyle || 'normal') === 'italic'}
                    onClick={() => updateElement(txt.id, { fontStyle: txt.fontStyle === 'italic' ? 'normal' : 'italic' })}
                    label="Italic"
                    isLight={isLight}
                  />
                  <PillToggle
                    on={txt.underline === true}
                    onClick={() => updateElement(txt.id, { underline: txt.underline !== true })}
                    label="Underline"
                    isLight={isLight}
                  />
                  <PillToggle
                    on={txt.strikethrough === true}
                    onClick={() => updateElement(txt.id, { strikethrough: txt.strikethrough !== true })}
                    label="Strikethrough"
                    isLight={isLight}
                  />
                </div>

                <div>
                  <label className="opacity-60 block mb-1">Font Family</label>
                  <select
                    value={txt.fontFamily || 'sans-serif'}
                    onChange={(e) => updateElement(txt.id, { fontFamily: e.target.value })}
                    className={txtInputClass}
                  >
                    <option value="sans-serif">Sans-Serif</option>
                    <option value="serif">Serif</option>
                    <option value="monospace">Monospace</option>
                    <option value="Georgia, serif">Georgia</option>
                    <option value="Verdana, sans-serif">Verdana</option>
                    <option value="Impact, sans-serif">Impact</option>
                  </select>
                </div>

                <div>
                  <label className="opacity-60 block mb-1">Text Alignment</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['left', 'center', 'right'] as const).map((align) => (
                      <button
                        key={align}
                        onClick={() => updateElement(txt.id, { textAlign: align })}
                        className={`py-1.5 text-[10px] font-semibold rounded border capitalize ${
                          (txt.textAlign || 'center') === align
                            ? 'bg-sky-600 text-white border-sky-500'
                            : isLight
                            ? 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                            : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
                        }`}
                      >
                        {align}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="opacity-60">Text Color</span>
                    <span className="font-mono font-bold uppercase">{txt.color || '#94a3b8'}</span>
                  </div>
                  <input
                    type="color"
                    value={(txt.color || '#94a3b8').startsWith('#') ? txt.color || '#94a3b8' : `#${txt.color}`}
                    onChange={(e) => updateElement(txt.id, { color: e.target.value })}
                    className="w-full h-8 cursor-pointer rounded border bg-transparent"
                  />
                </div>
              </RubricSection>
            </div>
          );
        })()}

        {/* 11. SHAPE SPECIFIC INSPECTOR */}
        {el.type === 'shape' && (() => {
          const shape = el as ShapeElement;
          const fill = shape.color || '#38bdf8';
          const strokeColor = shape.strokeColor || fill;
          const fillOpacity = shape.opacity ?? 0.3;
          const strokeWidth = shape.strokeWidth ?? 2;
          const strokeOpacity = shape.strokeOpacity ?? 1;
          const dashStyle = shape.dashStyle || 'solid';
          const filled = shape.filled !== false;
          const optionBtn = (active: boolean) =>
            `py-1.5 text-[10px] font-semibold rounded border capitalize ${
              active
                ? 'bg-sky-600 text-white border-sky-500'
                : isLight
                ? 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
            }`;

          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Shape Geometry & Styling"
                icon={<Circle className="w-3.5 h-3.5 text-cyan-500" />}
                badge={
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-500 font-bold capitalize">
                    {shape.shapeType}
                  </span>
                }
                defaultOpen={true}
                isLight={isLight}
              >
                <div>
                  <label className="opacity-60 block mb-1">Type</label>
                  <select
                    value={shape.shapeType}
                    onChange={(e) => updateElement(shape.id, { shapeType: e.target.value as ShapeType })}
                    className={selectClass}
                  >
                    {SHAPE_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {value.charAt(0).toUpperCase() + value.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="opacity-60 block mb-1">Label (optional)</label>
                  <input
                    type="text"
                    value={shape.label || ''}
                    onChange={(e) => updateElement(shape.id, { label: e.target.value })}
                    placeholder="e.g. Hot zone, carpet, shadow…"
                    className={`w-full border rounded p-1.5 text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                  />
                </div>

                {shape.shapeType === 'line' ? (
                  /* Tailored controls for Line Shape */
                  <div className="space-y-3 pt-1">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-300">Line Length (px)</span>
                        <span className="font-mono font-bold text-sky-400">{Math.round(shape.width)} px</span>
                      </div>
                      <input
                        type="range"
                        min={20}
                        max={1200}
                        value={shape.width}
                        onChange={(e) => updateElement(shape.id, { width: Number(e.target.value) })}
                        className="w-full accent-sky-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-300">Line Thickness / Stroke (px)</span>
                        <span className="font-mono font-bold text-sky-400">{shape.strokeWidth ?? 4} px</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={40}
                        step={1}
                        value={shape.strokeWidth ?? 4}
                        onChange={(e) => updateElement(shape.id, { strokeWidth: Number(e.target.value) })}
                        className="w-full accent-sky-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-300">Line Color</span>
                        <span className="font-mono font-bold uppercase text-sky-400">{strokeColor}</span>
                      </div>
                      <input
                        type="color"
                        value={strokeColor}
                        onChange={(e) => updateElement(shape.id, { strokeColor: e.target.value, color: e.target.value })}
                        className="w-full h-8 cursor-pointer rounded border bg-transparent"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-300">Line Opacity</span>
                        <span className="font-mono font-bold text-sky-400">{Math.round(strokeOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={strokeOpacity}
                        onChange={(e) => updateElement(shape.id, { strokeOpacity: Number(e.target.value) })}
                        className="w-full accent-sky-500 cursor-pointer"
                      />
                    </div>
                  </div>
                ) : (
                  /* Controls for 2D Polygons, Rectangles & Circles */
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="opacity-60">Width</span>
                          <span className="font-mono font-bold">{Math.round(shape.width)}</span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={900}
                          value={shape.width}
                          onChange={(e) => updateElement(shape.id, { width: Number(e.target.value) })}
                          className="w-full accent-sky-500 cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="opacity-60">Height</span>
                          <span className="font-mono font-bold">{Math.round(shape.height)}</span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={900}
                          value={shape.height}
                          onChange={(e) => updateElement(shape.id, { height: Number(e.target.value) })}
                          className="w-full accent-sky-500 cursor-pointer"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="opacity-60">Fill</span>
                        <button
                          onClick={() => updateElement(shape.id, { filled: !filled })}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            filled
                              ? 'bg-sky-600 text-white border-sky-500'
                              : isLight
                              ? 'bg-slate-100 text-slate-500 border-slate-300'
                              : 'bg-slate-950 text-slate-400 border-slate-700'
                          }`}
                        >
                          {filled ? 'Filled' : 'Outline only'}
                        </button>
                      </div>
                      <input
                        type="color"
                        value={fill}
                        onChange={(e) => updateElement(shape.id, { color: e.target.value })}
                        className="w-full h-8 cursor-pointer rounded border bg-transparent"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="opacity-60">Fill Opacity</span>
                        <span className="font-mono font-bold">{Math.round(fillOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={fillOpacity}
                        onChange={(e) => updateElement(shape.id, { opacity: Number(e.target.value) })}
                        className="w-full accent-sky-500 cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="opacity-60">Outline Color</span>
                        <span className="font-mono font-bold uppercase">{strokeColor}</span>
                      </div>
                      <input
                        type="color"
                        value={strokeColor}
                        onChange={(e) => updateElement(shape.id, { strokeColor: e.target.value })}
                        className="w-full h-8 cursor-pointer rounded border bg-transparent"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="opacity-60">Outline</span>
                          <span className="font-mono font-bold">{strokeWidth}px</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={10}
                          step={0.5}
                          value={strokeWidth}
                          onChange={(e) => updateElement(shape.id, { strokeWidth: Number(e.target.value) })}
                          className="w-full accent-sky-500 cursor-pointer"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="opacity-60">Outline Opacity</span>
                          <span className="font-mono font-bold">{Math.round(strokeOpacity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={strokeOpacity}
                          onChange={(e) => updateElement(shape.id, { strokeOpacity: Number(e.target.value) })}
                          className="w-full accent-sky-500 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="opacity-60 block mb-1">Outline Style</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['solid', 'dashed', 'dotted'] as const).map((style) => (
                      <button
                        key={style}
                        onClick={() => updateElement(shape.id, { dashStyle: style })}
                        className={optionBtn(dashStyle === style)}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                {shape.shapeType === 'rectangle' && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="opacity-60">Corner Radius</span>
                      <span className="font-mono font-bold">{shape.cornerRadius ?? 0}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      value={shape.cornerRadius ?? 0}
                      onChange={(e) => updateElement(shape.id, { cornerRadius: Number(e.target.value) })}
                      className="w-full accent-sky-500 cursor-pointer"
                    />
                  </div>
                )}
              </RubricSection>
            </div>
          );
        })()}

        {/* 12. ARROW SPECIFIC INSPECTOR */}
        {el.type === 'arrow' && (() => {
          const arr = el as ArrowElement;
          const arrowColor = arr.color || '#f97316';
          const strokeWidth = arr.strokeWidth || 2.5;
          const headStyle = arr.headStyle || 'single';
          const dashStyle = arr.dashStyle || 'solid';
          const optionBtn = (active: boolean) =>
            `py-1.5 text-[10px] font-semibold rounded border capitalize ${
              active
                ? 'bg-sky-600 text-white border-sky-500'
                : isLight
                ? 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
            }`;

          return (
            <div className="space-y-3 pt-1">
              <RubricSection
                title="Arrow Direction & Style"
                icon={<MoveRight className="w-3.5 h-3.5 text-orange-500" />}
                defaultOpen={true}
                isLight={isLight}
              >
                <div>
                  <label className="opacity-60 block mb-1">Label (optional)</label>
                  <input
                    type="text"
                    value={arr.label || ''}
                    onChange={(e) => updateElement(arr.id, { label: e.target.value })}
                    placeholder="e.g. Camera move, Actor blocking…"
                    className={`w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="opacity-60">Arrow Color</span>
                    <span className="font-mono font-bold uppercase">{arrowColor}</span>
                  </div>
                  <input
                    type="color"
                    value={arrowColor}
                    onChange={(e) => updateElement(arr.id, { color: e.target.value })}
                    className="w-full h-8 cursor-pointer rounded border bg-transparent"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="opacity-60">Line Weight</span>
                    <span className="font-mono font-bold">{strokeWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={8}
                    step={0.5}
                    value={strokeWidth}
                    onChange={(e) => updateElement(arr.id, { strokeWidth: Number(e.target.value) })}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="opacity-60 block mb-1">Arrowhead</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['single', 'double', 'open'] as const).map((style) => (
                      <button
                        key={style}
                        onClick={() => updateElement(arr.id, { headStyle: style })}
                        className={optionBtn(headStyle === style)}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="opacity-60 block mb-1">Line Style</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['solid', 'dashed', 'dotted'] as const).map((dash) => (
                      <button
                        key={dash}
                        onClick={() => updateElement(arr.id, { dashStyle: dash })}
                        className={optionBtn(dashStyle === dash)}
                      >
                        {dash}
                      </button>
                    ))}
                  </div>
                </div>
              </RubricSection>
            </div>
          );
        })()}
    </div>
  );
};

