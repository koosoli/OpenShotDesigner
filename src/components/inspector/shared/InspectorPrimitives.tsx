/**
 * Shared inspector widgets.
 *
 * Every element inspector is built from the same handful of pieces: a collapsing
 * section, a colour+opacity row, a pill toggle, the storyboard uploader and the
 * waypoint list. They lived inside InspectorPanel.tsx, which meant that file had
 * to be opened to change any of them and no element inspector could be moved out
 * without bringing them along.
 *
 * These are presentational and take everything they need as props, except
 * WaypointListEditor which reaches for the two mutators it needs directly.
 */
import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Image as ImageIcon,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { Shot, Waypoint } from '../../../types';
import { useFloorPlan } from '../../../context/FloorPlanContext';
import { useDialogs } from '../../dialog/DialogProvider';
import { framesOf, setFramePatch } from '../../../utils/storyboardFrames';
import { loadStoryboardImageFile } from '../../../utils/image';
import { ensureHexColor } from '../../../utils/geometry';

export const PillToggle: React.FC<{
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
export const StoryboardField: React.FC<{
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
                aria-expanded={showLinkInput}
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
            aria-expanded={showLinkInput}
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
export const RubricSection: React.FC<{
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
      {/* The badge and headerRight slots are frequently buttons themselves
          ("Add waypoint", "Add beat"), so they must sit OUTSIDE the collapse
          toggle: a <button> inside a <button> is invalid HTML, and the browser
          routes some of those clicks to the outer control — which collapsed the
          section instead of doing what the inner button said. */}
      <div
        className={`w-full px-3 py-2.5 flex items-center justify-between gap-2 transition-colors select-none ${
          isLight ? 'text-slate-800' : 'text-slate-200'
        }`}
      >
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          className={`flex-1 min-w-0 flex items-center gap-2 text-left rounded -mx-1 px-1 py-0.5 transition-colors ${
            isLight ? 'hover:bg-slate-100/70' : 'hover:bg-slate-800/50'
          }`}
        >
          {icon && <span className="text-sky-500 flex-shrink-0">{icon}</span>}
          <span className="text-[11px] font-bold tracking-wider uppercase truncate opacity-90">
            {title}
          </span>
          <span className="opacity-50 flex-shrink-0">
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
        </button>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {badge}
          {headerRight}
        </div>
      </div>

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
export const ColorField: React.FC<{
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
        {/* The swatch is the label; the input inside it needs its own name. */}
        <input
          aria-label={`Pick a color for ${label.toLowerCase()}`}
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
export const WaypointListEditor: React.FC<{
  elementId: string;
  path: Waypoint[];
  baseRotation: number;
  accentClass: string;
  isLight: boolean;
  /** Cameras only: the shot whose storyboard this camera's beats belong to. */
  boardShot?: Shot | null;
}> = ({ elementId, path, baseRotation, accentClass, isLight, boardShot }) => {
  const { updateElement, updateShot } = useFloorPlan();
  const { notice } = useDialogs();
  const beatInputRef = React.useRef<HTMLInputElement>(null);
  const [beatUploadSlot, setBeatUploadSlot] = useState<string | null>(null);
  const boardedFrames = boardShot ? framesOf(boardShot) : {};

  const updateWaypoint = (wpId: string, updates: Partial<Waypoint>) => {
    const newPath = path.map((wp) => (wp.id === wpId ? { ...wp, ...updates } : wp));
    updateElement(elementId, { path: newPath });
  };

  const removeWaypoint = (wpId: string) => {
    updateElement(elementId, { path: path.filter((wp) => wp.id !== wpId) });
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
                .catch(() => { void notice({ title: 'Image unreadable', message: 'That image could not be read.' }); });
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

/**
 * The inspector's standard `<select>` class string.
 *
 * Lived as a local in `InspectorPanel` until the twelve element inspectors were
 * split out of it, at which point four of them needed the same string. One
 * definition rather than four that drift apart.
 */
export const inspectorSelectClass = (isLight: boolean): string =>
  `w-full border rounded px-1.5 py-1 text-[11px] ${
    isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
  }`;
