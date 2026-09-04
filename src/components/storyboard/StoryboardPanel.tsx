import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  Camera,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Plus,
  Printer,
  SlidersHorizontal,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useDialogs } from '../dialog/DialogProvider';
import { AspectRatio, CameraElement, Shot } from '../../types';
import { ASPECT_RATIOS } from '../../constants/presets';
import { orderedStoryboardShots } from '../../utils/storyboardOrder';
import {
  FrameSlot,
  START_SLOT,
  isSlotOmitted,
  setFramePatch,
  setSlotOmittedPatch,
  setSlotsPresetPatch,
  slotsOf,
  toggleSlotOmittedPatch,
  visibleStoryboardSlots,
} from '../../utils/storyboardFrames';
import { loadStoryboardImageFile } from '../../utils/image';
import { ProjectImage } from '../common/ProjectImage';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';

/** A moving shot is boarded on each of its camera's keyframes. */
export const shotHasMove = (shot: Shot): boolean =>
  !!shot.movement && shot.movement !== 'Static';

/**
 * Storyboard-only view of the active scene: one frame per shot (two for shots
 * with a camera move).
 *
 * It is the same data as the shot list — adding a frame here also creates the
 * shot and drops its camera on the floor plan, and shots created anywhere else
 * appear here (blank until a storyboard image is attached). Frames drag into
 * order and their description is editable in place.
 */
export const StoryboardPanel: React.FC = () => {
  const { activeSetup, selectedShotId, selectShot, updateShot, deleteShot, setStoryboardOrder, createCameraAndShot, openViewfinder, updateSetupMeta, displaySettings, updateDisplaySettings } = useFloorPlan();
  const { notice } = useDialogs();
  const { openExportModal, theme } = useWorkspaceUI();

  const isLight = theme === 'light';
  const hideBlankWaypoints = displaySettings.hideBlankStoryboardWaypoints ?? false;
  const [openWaypointsShotId, setOpenWaypointsShotId] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [uploadTarget, setUploadTarget] = useState<{ shotId: string; slotKey: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Board order is its own thing — see orderedStoryboardShots.
  const shots = orderedStoryboardShots(activeSetup);
  const cameras = activeSetup.elements.filter((element) => element.type === 'camera') as CameraElement[];
  const ratioValue = (activeSetup.aspectRatio || '16:9') as AspectRatio;
  const ratio = ASPECT_RATIOS.find((entry) => entry.value === ratioValue)?.ratio || 16 / 9;

  const setImage = (shot: Shot, slotKey: string, image: string | undefined) =>
    updateShot(shot.id, setFramePatch(shot, slotKey, image ? { image, fit: 'cover' } : null));

  const toggleFit = (shot: Shot, slot: FrameSlot) =>
    updateShot(
      shot.id,
      setFramePatch(shot, slot.key, { fit: slot.frame?.fit === 'contain' ? 'cover' : 'contain' })
    );

  const handleImageFile = (shot: Shot, slotKey: string, file: File) => {
    // Downscaled on the way in so a phone-sized photo can't blow the quota.
    loadStoryboardImageFile(file)
      .then((dataUrl) => setImage(shot, slotKey, dataUrl))
      .catch(() => { void notice({ title: 'Image unreadable', message: 'That image could not be read.' }); });
  };

  const handleDrop = (index: number) => {
    if (draggedIndex !== null && draggedIndex !== index) {
      // Rearranging frames only moves the board — the shot list keeps its order.
      const ids = shots.map((shot) => shot.id);
      const [moved] = ids.splice(draggedIndex, 1);
      ids.splice(index, 0, moved);
      setStoryboardOrder(ids);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const card = isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-800/60 border-slate-700 text-slate-100';
  const control = `rounded-lg border px-2 py-1 text-[11px] ${
    isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-slate-200'
  }`;

  /** One storyboard frame: the art (or a blank drop target) plus its controls. */
  const renderFrame = (
    shot: Shot,
    slot: FrameSlot,
    showLabel: boolean,
    camera?: CameraElement | null
  ) => {
    const image = slot.frame?.image;
    const fit = slot.frame?.fit || 'cover';
    const isStart = slot.key === START_SLOT;

    return (
      <div
        key={slot.key}
        className={`relative w-full ${isLight ? 'bg-slate-200' : 'bg-slate-950'}`}
        style={{ aspectRatio: String(ratio) }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const file = event.dataTransfer?.files?.[0];
          if (file && file.type.startsWith('image/')) {
            event.preventDefault();
            event.stopPropagation();
            handleImageFile(shot, slot.key, file);
          }
        }}
      >
        {image ? (
          <ProjectImage
            imageRef={image}
            alt={`${slot.label} frame for shot ${shot.shotNumber}`}
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: fit }}
          />
        ) : (
          // A keyframe without artwork keeps its frame — blank on purpose
          <button
            onClick={(event) => {
              event.stopPropagation();
              setUploadTarget({ shotId: shot.id, slotKey: slot.key });
              fileInputRef.current?.click();
            }}
            className={`absolute inset-0 flex flex-col items-center justify-center gap-1 text-[10px] ${
              isLight ? 'text-slate-400 hover:text-slate-600' : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>{showLabel ? slot.label : 'Drop or click to add art'}</span>
          </button>
        )}

        {showLabel && (
          <span
            className={`absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
              slot.short === 'END'
                ? 'bg-amber-500 text-black'
                : slot.short === 'START'
                  ? 'bg-violet-600 text-white'
                  : 'bg-sky-600 text-white'
            }`}
          >
            {slot.short || slot.label}
          </span>
        )}

        {/* Quick omit button for waypoint frames without art */}
        {!isStart && !image && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              updateShot(shot.id, setSlotOmittedPatch(shot, slot.key, true, camera, hideBlankWaypoints));
            }}
            title="Omit this waypoint picture from storyboard"
            className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 hover:bg-black/80 text-white/90 hover:text-white text-[9px] font-semibold flex items-center gap-1 z-10"
          >
            <EyeOff className="w-2.5 h-2.5" />
            <span>Omit</span>
          </button>
        )}

        {image && (
          <div className="absolute bottom-1.5 right-1.5 flex gap-1">
            <button
              onClick={(event) => {
                event.stopPropagation();
                toggleFit(shot, slot);
              }}
              title={fit === 'contain' ? 'Fill the frame' : 'Fit the whole image'}
              className="px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-semibold"
            >
              {fit === 'contain' ? 'Fit' : 'Fill'}
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                setUploadTarget({ shotId: shot.id, slotKey: slot.key });
                fileInputRef.current?.click();
              }}
              title="Replace image"
              aria-label="Replace image"
              className="p-1 rounded-md bg-black/60 text-white"
            >
              <Upload className="w-3 h-3" />
            </button>
            {!isStart && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  updateShot(shot.id, setSlotOmittedPatch(shot, slot.key, true, camera, hideBlankWaypoints));
                }}
                title="Omit this waypoint picture from storyboard (keeps artwork safe)"
                aria-label="Omit this waypoint picture from storyboard (keeps artwork safe)"
                className="p-1 rounded-md bg-black/60 hover:bg-black/80 text-white"
              >
                <EyeOff className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={(event) => {
                event.stopPropagation();
                setImage(shot, slot.key, undefined);
              }}
              title="Remove image"
              aria-label="Remove image"
              className="p-1 rounded-md bg-black/60 text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`h-full flex flex-col min-h-0 ${isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}`}>
      {/* Header */}
      <div className={`p-2.5 border-b flex flex-wrap items-center gap-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800'}`}>
        <div className="mr-auto">
          <h2 className="text-xs font-bold uppercase tracking-wide flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-violet-500" /> Storyboard
          </h2>
          <p className="text-[10px] opacity-60 mt-0.5">
            {shots.length} shot{shots.length === 1 ? '' : 's'} · one frame per camera keyframe · drag to arrange the
            board (the shot list keeps its own order)
          </p>
        </div>

        {/* Aspect ratio of every frame (and of the storyboards on the plan) */}
        <label className="flex items-center gap-1" title="Storyboard aspect ratio">
          <Maximize2 className="w-3.5 h-3.5 opacity-60" />
          <select
            value={ratioValue}
            onChange={(event) => updateSetupMeta({ aspectRatio: event.target.value as AspectRatio })}
            className={control}
          >
            {ASPECT_RATIOS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.value}
              </option>
            ))}
          </select>
        </label>

        {/* Toggle to leave out / include blank waypoint frames */}
        <button
          onClick={() =>
            updateDisplaySettings({ hideBlankStoryboardWaypoints: !hideBlankWaypoints })
          }
          title={
            hideBlankWaypoints
              ? 'Currently omitting blank waypoint frames across all shots. Click to show all unboarded keyframes.'
              : 'Click to omit unboarded waypoint frames from the storyboard.'
          }
          aria-pressed={hideBlankWaypoints}
          className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
            hideBlankWaypoints
              ? 'bg-violet-600 text-white border-violet-500 shadow-xs'
              : isLight
                ? 'border-slate-300 hover:bg-slate-100 text-slate-700'
                : 'border-slate-700 hover:bg-slate-800 text-slate-300'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{hideBlankWaypoints ? 'Blank waypoints omitted' : 'Omit blank waypoints'}</span>
        </button>

        <button
          onClick={() => openExportModal('storyboard')}
          title="Export / print the storyboard"
          className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1 ${
            isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
          }`}
        >
          <Printer className="w-3.5 h-3.5" /> Export
        </button>

        <button
          onClick={() => createCameraAndShot()}
          title="Add a frame — also adds the shot to the list and its camera to the floor plan"
          className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add frame
        </button>
      </div>

      {/* Frames */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5">
        {shots.length === 0 ? (
          <div className={`m-2 p-6 text-center border border-dashed rounded-xl ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>
            <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-xs font-semibold">No frames yet</p>
            <p className="text-[11px] opacity-60 mt-1">
              “Add frame” creates a shot with its camera on the floor plan. Shots added in the shot list or from the
              script show up here too — blank until you drop artwork on them.
            </p>
          </div>
        ) : (
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
            {shots.map((shot: Shot, index) => {
              const camera = cameras.find((item) => item.id === shot.cameraId);
              const isSelected = selectedShotId === shot.id;
              const isDragging = draggedIndex === index;
              const isDragOver = dragOverIndex === index && draggedIndex !== index;
              const isWaypointsOpen = openWaypointsShotId === shot.id;

              // All slots vs visible slots
              const allSlots = slotsOf(shot, camera);
              const slots = visibleStoryboardSlots(shot, camera, hideBlankWaypoints);
              const hiddenWaypointCount = allSlots.length - slots.length;

              return (
                <div
                  key={shot.id}
                  id={`storyboard-frame-${shot.id}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverIndex(index);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleDrop(index);
                  }}
                  onDragEnd={() => {
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  onClick={() => selectShot(shot.id, true)}
                  className={`relative border rounded-xl overflow-hidden flex flex-col transition-all cursor-pointer ${card} ${
                    isSelected ? 'ring-2 ring-sky-500/70' : ''
                  } ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'ring-2 ring-violet-500' : ''}`}
                >
                  {/* Waypoints Frame Manager Popover */}
                  {isWaypointsOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className={`absolute z-30 inset-x-1.5 top-1.5 rounded-xl p-2.5 shadow-2xl border flex flex-col gap-2 backdrop-blur-md ${
                        isLight
                          ? 'bg-white/95 border-slate-300 text-slate-900 shadow-slate-400/40'
                          : 'bg-slate-900/95 border-slate-700 text-slate-100 shadow-black/80'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b pb-1.5 border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <SlidersHorizontal className="w-3.5 h-3.5 text-violet-500" />
                          <span className="text-[11px] font-bold uppercase tracking-wider">Framing Beats</span>
                        </div>
                        <button
                          onClick={() => setOpenWaypointsShotId(null)}
                          title="Close the framing beats panel"
                          aria-label="Close the framing beats panel"
                          className="p-1 rounded-md text-slate-400 hover:text-slate-200"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Presets */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateShot(shot.id, setSlotsPresetPatch(shot, camera, 'all'))}
                          title="Show all waypoint keyframes"
                          className="flex-1 px-1.5 py-1 rounded-md text-[9px] font-semibold border border-slate-300 dark:border-slate-700 hover:bg-violet-500/10 hover:border-violet-500 transition-colors text-center"
                        >
                          All ({allSlots.length})
                        </button>
                        <button
                          onClick={() => updateShot(shot.id, setSlotsPresetPatch(shot, camera, 'start-end'))}
                          title="Only show the start framing and end framing (omit intermediate beats)"
                          className="flex-1 px-1.5 py-1 rounded-md text-[9px] font-semibold border border-slate-300 dark:border-slate-700 hover:bg-violet-500/10 hover:border-violet-500 transition-colors text-center"
                        >
                          Start & End
                        </button>
                        <button
                          onClick={() => updateShot(shot.id, setSlotsPresetPatch(shot, camera, 'omit-blank'))}
                          title="Omit unboarded waypoint frames on this shot"
                          className="flex-1 px-1.5 py-1 rounded-md text-[9px] font-semibold border border-slate-300 dark:border-slate-700 hover:bg-violet-500/10 hover:border-violet-500 transition-colors text-center"
                        >
                          With Art
                        </button>
                      </div>

                      {/* Keyframes checklist */}
                      <div className="flex flex-col gap-1 max-h-40 overflow-y-auto custom-scrollbar pr-0.5">
                        {allSlots.map((s) => {
                          const isOmitted = isSlotOmitted(shot, s.key, hideBlankWaypoints, s.frame?.image);
                          const isStart = s.key === START_SLOT;
                          const hasArt = !!s.frame?.image;

                          return (
                            <div
                              key={s.key}
                              onClick={() => {
                                if (isStart) return;
                                updateShot(
                                  shot.id,
                                  toggleSlotOmittedPatch(shot, s.key, camera, hideBlankWaypoints)
                                );
                              }}
                              className={`flex items-center justify-between p-1.5 rounded-lg text-[10px] transition-colors ${
                                isStart
                                  ? 'opacity-80 cursor-default bg-slate-500/10'
                                  : isOmitted
                                    ? 'bg-slate-500/5 text-slate-400 hover:bg-slate-500/10 cursor-pointer'
                                    : 'bg-violet-500/10 font-semibold text-violet-400 hover:bg-violet-500/20 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[8px] font-bold ${
                                    !isOmitted
                                      ? 'bg-violet-600 text-white border-violet-500'
                                      : 'border-slate-500 text-transparent'
                                  }`}
                                >
                                  ✓
                                </span>
                                <span className="font-mono font-bold">
                                  {s.short || s.label}
                                </span>
                                <span>{s.label}</span>
                              </div>

                              <div className="flex items-center gap-1 font-mono text-[9px]">
                                {hasArt ? (
                                  <span className="text-emerald-500 font-semibold">Art</span>
                                ) : (
                                  <span className="text-slate-500">Blank</span>
                                )}
                                {!isStart && (
                                  <span className={isOmitted ? 'text-amber-500 font-semibold' : 'text-slate-400'}>
                                    {isOmitted ? 'Omitted' : 'Shown'}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* One frame per camera keyframe */}
                  <div className="relative">
                    {slots.length > 1 ? (
                      <div className="flex flex-col gap-1.5 p-1 bg-slate-700/40">
                        {slots.map((slot) => renderFrame(shot, slot, true, camera))}
                      </div>
                    ) : (
                      renderFrame(shot, slots[0], allSlots.length > 1, camera)
                    )}

                    {/* Hidden blank/omitted waypoints indicator */}
                    {hiddenWaypointCount > 0 && (
                      <div
                        className={`px-2 py-1 flex items-center justify-between text-[10px] border-b ${
                          isLight ? 'bg-slate-100/90 border-slate-200 text-slate-600' : 'bg-slate-950/80 border-slate-800 text-slate-300'
                        }`}
                      >
                        <span className="font-mono flex items-center gap-1">
                          <Layers className="w-3 h-3 text-amber-500" />
                          {hiddenWaypointCount} waypoint{hiddenWaypointCount === 1 ? '' : 's'} omitted
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenWaypointsShotId(shot.id);
                            }}
                            title="Manage exactly which waypoint frames are shown"
                            className="text-sky-500 hover:text-sky-400 font-semibold underline underline-offset-2"
                          >
                            Manage
                          </button>
                          <span className="opacity-30">·</span>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              updateShot(shot.id, setSlotsPresetPatch(shot, camera, 'all'));
                            }}
                            title="Show all waypoint frames for this shot"
                            className="text-slate-400 hover:text-slate-200 font-semibold"
                          >
                            Show all
                          </button>
                        </div>
                      </div>
                    )}

                    {/* What the move is, between the keyframes */}
                    {slots.length > 1 && shotHasMove(shot) && (
                      <span className="absolute top-1 left-1/2 -translate-x-1/2 z-10 px-1.5 py-0.5 rounded-full bg-black/75 text-white text-[9px] font-bold flex items-center gap-1 pointer-events-none">
                        <ArrowRight className="w-3 h-3" />
                        {shot.movement}
                      </span>
                    )}

                    <div className="absolute top-1.5 left-1.5 flex items-center gap-1 z-10">
                      <span className="px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-mono font-bold">
                        {shot.shotNumber}
                      </span>
                      {camera && (
                        <span
                          className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold text-white flex items-center gap-1"
                          style={{ background: camera.color || '#0ea5e9' }}
                        >
                          <Camera className="w-2.5 h-2.5" />
                          {(camera.cameraLabel || 'A').toUpperCase()}
                        </span>
                      )}
                      {shot.movement && (
                        <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-black text-[9px] font-bold shadow-xs">
                          {shot.movement}
                        </span>
                      )}
                    </div>

                    <div className="absolute top-1.5 right-1.5 flex items-center gap-1 z-10">
                      {/* Waypoints Framing Beats button when camera has moves */}
                      {allSlots.length > 1 && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenWaypointsShotId(isWaypointsOpen ? null : shot.id);
                          }}
                          title={`Manage waypoint frames (${slots.length}/${allSlots.length} active)`}
                          aria-label={`Manage waypoint frames (${slots.length}/${allSlots.length} active)`}
                          aria-expanded={isWaypointsOpen}
                          className={`p-1 rounded-md text-[10px] font-mono font-bold flex items-center gap-1 transition-colors ${
                            slots.length < allSlots.length
                              ? 'bg-amber-500 text-black shadow-xs'
                              : 'bg-black/60 text-white hover:bg-black/80'
                          }`}
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          <span>{slots.length}/{allSlots.length}</span>
                        </button>
                      )}

                      {/* Shoot this frame with the device camera through the finder */}
                      {shot.cameraId && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            selectShot(shot.id, true);
                            openViewfinder(shot.cameraId);
                          }}
                          title="Open the viewfinder for this shot — take a storyboard photo with this device's camera"
                          aria-label="Open the viewfinder for this shot — take a storyboard photo with this device's camera"
                          className="p-1 rounded-md bg-black/60 text-white hover:bg-black/80"
                        >
                          <Video className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <div
                        draggable
                        onDragStart={(event) => {
                          event.stopPropagation();
                          setDraggedIndex(index);
                        }}
                        title="Drag to reorder"
                        className="p-1 rounded-md bg-black/60 text-white cursor-grab active:cursor-grabbing"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>

                  {/* Description, editable from the board */}
                  <div className="p-2 flex flex-col gap-1.5 flex-1">
                    <input
                      value={shot.name || ''}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => updateShot(shot.id, { name: event.target.value })}
                      placeholder="Shot name"
                      className={`w-full text-[11px] font-semibold bg-transparent border-b border-transparent focus:border-sky-500 focus:outline-none ${
                        isLight ? 'text-slate-800' : 'text-slate-100'
                      }`}
                    />
                    <textarea
                      value={shot.framingDescription || ''}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => updateShot(shot.id, { framingDescription: event.target.value })}
                      rows={2}
                      placeholder="Description — framing, action, camera move…"
                      className={`w-full text-[11px] leading-snug rounded-lg border p-1.5 resize-y ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                      }`}
                    />
                    {shot.actionScriptNotes && (
                      <p
                        title={shot.actionScriptNotes}
                        className={`text-[10px] leading-snug rounded-lg px-1.5 py-1 line-clamp-3 ${
                          isLight ? 'bg-violet-50 text-violet-900' : 'bg-violet-500/10 text-violet-200'
                        }`}
                      >
                        <span className="font-bold uppercase tracking-wide opacity-70">From script · </span>
                        {shot.actionScriptNotes}
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-auto pt-0.5">
                      <span className={`text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {shot.shotSize} · {shot.lensMm}mm{shot.movement ? ` · ${shot.movement}` : ''}
                      </span>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteShot(shot.id);
                        }}
                        title="Delete this shot (removes it from the shot list and its camera from the plan)"
                        aria-label="Delete this shot (removes it from the shot list and its camera from the plan)"
                        className="p-1 rounded text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const shot = uploadTarget && shots.find((item) => item.id === uploadTarget.shotId);
          if (file && uploadTarget && shot) handleImageFile(shot, uploadTarget.slotKey, file);
          setUploadTarget(null);
          event.target.value = '';
        }}
      />
    </div>
  );
};
