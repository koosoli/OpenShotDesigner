import React, { useEffect, useRef, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { ActorElement, CameraElement, PropElement } from '../../types';
import { isPointInCameraFov } from '../../utils/geometry';
import { loadStoryboardImageFile } from '../../utils/image';
import { storeImageAsset } from '../../utils/assetImages';
import { dataUrlToBlob } from '../../utils/projectMedia';
import { framesOf, setFramePatch, isSlotOmitted, slotsOf, START_SLOT, keyFrameImage } from '../../utils/storyboardFrames';
import { renderSimulatedFrame, SimulatedSubject } from '../../utils/simulatedFrame';
import {
  APERTURES,
  ASPECT_RATIOS,
  FOCAL_LENGTH_PRESETS,
  FRAME_RATES,
  ISO_VALUES,
  ND_FILTERS,
  SENSOR_FORMATS,
  SHUTTER_ANGLES,
} from '../../constants/presets';
import { ProjectImage } from '../common/ProjectImage';
import { useDialogFocusTrap } from '../../utils/useDialogFocusTrap';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Eye,
  Grid,
  PenTool,
  RotateCw,
  Image as ImageIcon,
  Save,
  Smartphone,
  SwitchCamera,
  Video,
  VideoOff,
  Shield,
  User,
  X,
} from 'lucide-react';

const CAMERA_HEIGHTS: NonNullable<CameraElement['cameraHeight']>[] = [
  'Ground',
  'Knee',
  'Waist',
  'Eye Level',
  'High',
  'Low Angle',
  'High Angle',
  'Overhead / Bird\'s Eye',
  'Dutch Angle',
];

const hudSelect =
  'bg-slate-950 border border-slate-800 text-slate-200 rounded-md px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:border-sky-500 cursor-pointer';

export const ViewfinderModal: React.FC = () => {
  const {
    activeSetup,
    isViewfinderOpen,
    viewfinderCameraId,
    openViewfinder,
    closeViewfinder,
    updateElement,
    updateShot,
    addShot,
    selectedShotId,
  } = useFloorPlan();

  const [showRuleOfThirds, setShowRuleOfThirds] = useState(true);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [showSafeAreas, setShowSafeAreas] = useState(true);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState(false);
  const [showStoryboard, setShowStoryboard] = useState(true);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Live camera (laptop webcam, phone or iPad camera) shown inside the finder
  // with every guide drawn on top, so a storyboard frame can be shot on the spot.
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  /** The still grabbed on capture: the finder freezes on it until retake. */
  const [frozenFrame, setFrozenFrame] = useState<string | null>(null);
  /** Which keyframe a capture lands on (camera start, a waypoint, the end). */
  const [captureSlot, setCaptureSlot] = useState<string>(START_SLOT);
  /** Set once the live <video> has real pixels (metadata loaded). */
  const [videoReady, setVideoReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // The finder is painted over the workspace rather than replacing it, so
  // keyboard focus has to be held inside its panel while it is open. Only one
  // of the two panels below is ever mounted, so they can share the one ref.
  const dialogRef = useDialogFocusTrap(isViewfinderOpen);

  const stopLiveCamera = () => {
    setFrozenFrame(null);
    setVideoReady(false);
    setLiveStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
  };

  const startLiveCamera = async (mode: 'environment' | 'user' = facingMode) => {
    setLiveError(null);
    setFrozenFrame(null);
    setVideoReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setLiveError('This browser cannot open a camera. Use “Photo file” instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1920 } },
        audio: false,
      });
      // The permission prompt can outlive the modal: if it closed meanwhile,
      // release the camera immediately instead of leaving the LED on.
      if (!isOpenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      // Swap streams in one step so the old tracks always get released.
      setLiveStream((current) => {
        current?.getTracks().forEach((track) => track.stop());
        return stream;
      });
      setFacingMode(mode);
    } catch (error) {
      setLiveError(
        (error as DOMException)?.name === 'NotAllowedError'
          ? 'Camera permission was declined — allow it in the browser and try again.'
          : 'No camera available on this device.'
      );
    }
  };

  // Attach / release the stream, and never leave the camera running.
  useEffect(() => {
    if (videoRef.current && liveStream) {
      videoRef.current.srcObject = liveStream;
      videoRef.current.play().catch(() => undefined);
    }
  }, [liveStream]);

  const isOpenRef = useRef(isViewfinderOpen);
  useEffect(() => {
    isOpenRef.current = isViewfinderOpen;
    if (!isViewfinderOpen) stopLiveCamera();
  }, [isViewfinderOpen]);

  useEffect(() => () => stopLiveCamera(), []);

  // Space / Enter works as the shutter while the live picture is on screen.
  useEffect(() => {
    if (!liveStream) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (!frozenFrame) captureLiveFrame();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!isViewfinderOpen) return null;

  const cameras = activeSetup.elements.filter((e) => e.type === 'camera') as CameraElement[];
  const selectedCamera =
    cameras.find((c) => c.id === viewfinderCameraId) || cameras[0];

  if (!selectedCamera) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="viewfinder-no-cameras-title"
          tabIndex={-1}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center max-w-md shadow-2xl"
        >
          <Camera className="w-12 h-12 mx-auto text-slate-500 mb-3" />
          <h3 id="viewfinder-no-cameras-title" className="text-base font-bold text-white mb-1">No Cameras on Floor Plan</h3>
          <p className="text-xs text-slate-400 mb-4">
            Add a camera to your scene setup to view the simulated optical viewfinder.
          </p>
          <button
            onClick={closeViewfinder}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold"
          >
            Close Viewfinder
          </button>
        </div>
      </div>
    );
  }

  const cameraIndex = cameras.findIndex((c) => c.id === selectedCamera.id);
  const prevCamera = cameras[(cameraIndex - 1 + cameras.length) % cameras.length];
  const nextCamera = cameras[(cameraIndex + 1) % cameras.length];

  // Camera parameters
  const cameraPos = { x: selectedCamera.x, y: selectedCamera.y };
  const focal = selectedCamera.focalLength || 35;
  const fovAngle = selectedCamera.fovAngle || 45;
  const throwDist = selectedCamera.throwDistance || 400;

  // Find all actors in FOV
  const actors = activeSetup.elements.filter((e) => e.type === 'actor') as ActorElement[];
  const visibleActors = actors
    .map((actor) => {
      const fovCheck = isPointInCameraFov(
        { x: actor.x, y: actor.y },
        cameraPos,
        selectedCamera.rotation,
        fovAngle,
        throwDist
      );
      return { actor, ...fovCheck };
    })
    .filter((res) => res.inFrame)
    .sort((a, b) => b.distance - a.distance); // Render back-to-front

  // Find props in FOV
  const props = activeSetup.elements.filter((e) => e.type === 'prop') as PropElement[];
  const visibleProps = props
    .map((prop) => {
      const fovCheck = isPointInCameraFov(
        { x: prop.x, y: prop.y },
        cameraPos,
        selectedCamera.rotation,
        fovAngle,
        throwDist
      );
      return { prop, ...fovCheck };
    })
    .filter((res) => res.inFrame)
    .sort((a, b) => b.distance - a.distance);

  // Aspect ratio helper
  const getAspectRatioStyle = (ar?: string) => {
    switch (ar) {
      case '16:9':
        return 'aspect-[16/9] max-w-[760px]';
      case '4:3':
        return 'aspect-[4/3] max-w-[560px]';
      case '1.85:1':
        return 'aspect-[1.85/1] max-w-[740px]';
      case '9:16':
        return 'aspect-[9/16] max-w-[340px]';
      case '2.39:1':
      default:
        return 'aspect-[2.39/1] max-w-[820px]';
    }
  };

  // The shot this camera covers — where storyboard art is read from and saved to.
  const targetShot =
    activeSetup.shots.find((shot) => shot.id === selectedCamera.associatedShotId) ||
    activeSetup.shots.find((shot) => shot.cameraId === selectedCamera.id) ||
    activeSetup.shots.find((shot) => shot.id === selectedShotId);

  // Exposure / recording settings: stored on the camera (and the shot's frame
  // rate) so they survive, print, and travel with the project.
  const aperture = selectedCamera.aperture || 'f/2.8';
  const iso = selectedCamera.iso ?? 800;
  const shutterAngle = selectedCamera.shutterAngle ?? 180;
  const ndFilter = selectedCamera.ndFilter || 'None';
  const frameRate = targetShot?.frameRate ?? 24;
  const shutterSpeed = frameRate > 0 ? Math.round((360 / shutterAngle) * frameRate) : 0;

  // True when the frame carries real imagery (live feed or attached art), in
  // which case the simulated silhouettes would only get in the way.
  // Keyframes this shot can be boarded on, and the one being worked on now.
  // currentSlotKey resolves to the slot actually highlighted — captureSlot can
  // go stale when the camera switches and its waypoint keys no longer exist,
  // which used to file captures under an orphan key nothing displayed.
  const frameSlots = targetShot ? slotsOf(targetShot, selectedCamera) : [];
  const activeSlot = frameSlots.find((slot) => slot.key === captureSlot) || frameSlots[0];
  // Captures must land on a slot the board actually shows: if the picked slot
  // was omitted from the storyboard, walk outward to the nearest kept slot.
  // START_SLOT is never omitted, so it stays the final fallback.
  const resolveWriteSlotKey = (preferred: string): string => {
    if (!targetShot) return preferred;
    const startIndex = frameSlots.findIndex((slot) => slot.key === preferred);
    if (startIndex < 0) return START_SLOT;
    for (let offset = 0; offset < frameSlots.length; offset += 1) {
      if (offset > 0) {
        const behind = frameSlots[startIndex - offset];
        if (behind && !isSlotOmitted(targetShot, behind.key)) return behind.key;
      }
      const ahead = frameSlots[startIndex + offset];
      if (ahead && !isSlotOmitted(targetShot, ahead.key)) return ahead.key;
    }
    return START_SLOT;
  };
  const currentSlotKey = activeSlot ? resolveWriteSlotKey(activeSlot.key) : START_SLOT;
  const resolvedSlot = frameSlots.find((slot) => slot.key === currentSlotKey) || activeSlot;
  const shownStoryboard = resolvedSlot?.frame?.image || (targetShot ? keyFrameImage(targetShot) : undefined);
  const showsRealImage = !!liveStream || !!frozenFrame || (showStoryboard && !!shownStoryboard);

  const framingNotes = () => {
    const subjectNames = visibleActors.map((a) => a.actor.name || a.actor.characterLetter).join(', ');
    return `Shot on Cam ${selectedCamera.cameraLabel} (${focal}mm, ${selectedCamera.aspectRatio}). In frame: ${
      subjectNames || 'Empty frame'
    }.`;
  };

  /** Subjects inside this camera's FOV, shaped for renderSimulatedFrame. */
  const buildSimulatedSubjects = (): SimulatedSubject[] => [
    ...visibleProps.map(({ prop, normalizedX, distance }) => ({
      kind: 'prop' as const,
      label: prop.name || prop.propType,
      normalizedX,
      distance,
    })),
    ...visibleActors.map(({ actor, normalizedX, distance }) => ({
      kind: 'actor' as const,
      label: `${actor.name || actor.characterLetter} · ${(distance / 50).toFixed(1)}m`,
      normalizedX,
      distance,
      color: actor.color || '#3b82f6',
      badge: actor.characterLetter,
    })),
  ];

  /** Rasterise the simulated finder (guides + subjects) exactly as on screen. */
  const renderFinderBoardImage = (): string | null =>
    renderSimulatedFrame({
      aspectRatio:
        ASPECT_RATIOS.find((entry) => entry.value === (selectedCamera.aspectRatio || '16:9'))?.ratio || 16 / 9,
      showRuleOfThirds,
      showSafeAreas,
      showCrosshair,
      caption: `CAM ${selectedCamera.cameraLabel} · ${focal}mm · ${selectedCamera.aspectRatio || '16:9'} · ${selectedCamera.cameraHeight || 'Eye Level'}`,
      subjects: buildSimulatedSubjects(),
    });

  /**
   * "Save Framing to Shot" — and, while the live camera is running, it is also
   * the shutter: it freezes the moment and stores it as the storyboard. Image
   * and framing go into ONE updateShot call; two calls in a row would each
   * start from the same stale setup and the second would drop the first.
   */
  const handleSaveFramingToShot = () => {
    if (!targetShot) {
      // No shot on this camera yet: capture (or create) instead of refusing.
      if (liveStream) {
        const frame = frozenFrame || grabFrame();
        if (!frame) {
          setLiveError('The camera picture is not ready yet — wait until you can see it, then save.');
          return;
        }
        setFrozenFrame(frame);
        videoRef.current?.pause();
        saveStoryboardImage(frame);
      } else {
        addShot({
          cameraId: selectedCamera.id,
          cameraLabel: selectedCamera.cameraLabel,
          lensMm: focal,
          framingDescription: framingNotes(),
        });
        setSaveNote(`Created a shot for Cam ${selectedCamera.cameraLabel}.`);
      }
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2200);
      return;
    }

    const framing = {
      cameraId: selectedCamera.id,
      cameraLabel: selectedCamera.cameraLabel,
      lensMm: focal,
      framingDescription: targetShot.framingDescription || framingNotes(),
    };

    if (liveStream) {
      const frame = frozenFrame || grabFrame();
      if (!frame) {
        setLiveError('The camera picture is not ready yet — wait until you can see it, then save.');
        return;
      }
      setFrozenFrame(frame);
      videoRef.current?.pause();
      // Same slot-aware path as the shutter: the still lands in the resolved
      // Frame slot (legacy mirrors included) in this same single commit.
      updateShot(targetShot.id, {
        ...framing,
        ...setFramePatch(targetShot, currentSlotKey, { image: frame, fit: 'cover' }),
      });
      setShowStoryboard(true);
      setPhotoFeedback(true);
      setSaveNote(`Storyboard and framing saved to shot ${targetShot.shotNumber}.`);
      setTimeout(() => setPhotoFeedback(false), 2200);
    } else {
      // No webcam: board the simulated blocking so saving the framing leaves
      // the shot with a picture — but ONLY when this slot has none.
      //
      // It used to do that unconditionally, which meant attaching your own
      // photo and then pressing Save replaced it with a raster of the
      // simulated view: silhouettes, and the caption "Empty frame" whenever no
      // actor stood in the camera's cone. The photo was not lost by accident,
      // it was deliberately overwritten by the thing meant to be a fallback.
      const existingArt = framesOf(targetShot)[currentSlotKey]?.image;
      const boardImage = existingArt ? null : renderFinderBoardImage();
      if (boardImage) {
        updateShot(targetShot.id, {
          ...framing,
          ...setFramePatch(targetShot, currentSlotKey, { image: boardImage, fit: 'cover' }),
        });
        setShowStoryboard(true);
        setSaveNote(`Framing and board saved to shot ${targetShot.shotNumber}.`);
      } else {
        updateShot(targetShot.id, framing);
        setSaveNote(
          existingArt
            ? `Framing saved to shot ${targetShot.shotNumber}. Its board was kept.`
            : `Framing saved to shot ${targetShot.shotNumber}.`,
        );
      }
    }
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2200);
  };

  /**
   * Grab the current live frame, cropped to the camera's aspect ratio exactly
   * as it is composed in the finder, and store it as this shot's storyboard.
   */
  /** Grab the current frame as a JPEG cropped to the camera's aspect ratio. */
  const grabFrame = (): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    const targetRatio =
      ASPECT_RATIOS.find((entry) => entry.value === (selectedCamera.aspectRatio || '16:9'))?.ratio || 16 / 9;
    const sourceRatio = video.videoWidth / video.videoHeight;

    // Centre-crop the sensor image to the framing the user sees ("cover")
    let sw = video.videoWidth;
    let sh = video.videoHeight;
    if (sourceRatio > targetRatio) sw = Math.round(video.videoHeight * targetRatio);
    else sh = Math.round(video.videoWidth / targetRatio);
    const sx = Math.round((video.videoWidth - sw) / 2);
    const sy = Math.round((video.videoHeight - sh) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = Math.min(1280, sw);
    canvas.height = Math.max(1, Math.round(canvas.width / targetRatio));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    try {
      return canvas.toDataURL('image/jpeg', 0.82);
    } catch {
      return null;
    }
  };

  /**
   * Capture freezes the finder on the exact moment that was taken and stores it
   * on the shot. Every failure says why — a silent no-op is what made this look
   * like nothing was being saved.
   */
  /**
   * Store a storyboard image on this camera's shot. If the camera has no shot
   * yet, one is created for it in the same commit — capturing must never be a
   * dead end.
   */
  /**
   * Put a captured or chosen image on the shot.
   *
   * Anything arriving as a data URL — a camera grab, a rasterised simulated
   * frame — is moved into the asset store first. Storing it inline would put
   * base64 straight into project state (rule 26), where it is re-copied into
   * every undo snapshot and every duplicate; the media pass would move it on
   * the next load anyway, so doing it here saves the round trip and keeps the
   * project small in the session it was captured.
   */
  const storeCapturedFrame = async (image: string): Promise<string> => {
    if (!image.startsWith('data:')) return image;
    // Decoded by hand rather than via `fetch(dataUrl)`, which some content
    // security policies block. Any failure keeps the inline image: a board the
    // user just captured must never be lost to a storage problem, and the media
    // pass will move it on the next load.
    const blob = dataUrlToBlob(image);
    if (!blob) return image;
    try {
      const stored = await storeImageAsset(blob, { maxSize: 1280, quality: 0.82, source: 'viewfinder' });
      return stored.assetId;
    } catch {
      return image;
    }
  };

  const saveStoryboardImage = async (image: string) => {
    const ref = await storeCapturedFrame(image);
    const slotName = resolvedSlot?.label ? `${resolvedSlot.label.toLowerCase()} frame` : 'storyboard';

    if (targetShot) {
      updateShot(targetShot.id, setFramePatch(targetShot, currentSlotKey, { image: ref, fit: 'cover' }));
      setSaveNote(
        currentSlotKey === START_SLOT
          ? `Saved as the storyboard of shot ${targetShot.shotNumber}.`
          : `Saved as the ${slotName} of shot ${targetShot.shotNumber}.`
      );
    } else {
      addShot({
        cameraId: selectedCamera.id,
        cameraLabel: selectedCamera.cameraLabel,
        lensMm: focal,
        framingDescription: framingNotes(),
        storyboardImage: ref,
        storyboardFit: 'cover',
      });
      setSaveNote(`Created a shot for Cam ${selectedCamera.cameraLabel} and saved the storyboard to it.`);
    }
    setShowStoryboard(true);
    setPhotoFeedback(true);
    setTimeout(() => setPhotoFeedback(false), 2200);
  };

  const captureLiveFrame = () => {
    setLiveError(null);

    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setLiveError('The camera picture is not ready yet — wait until you can see it, then capture.');
      return;
    }

    const frame = grabFrame();
    if (!frame) {
      setLiveError('That frame could not be read from the camera.');
      return;
    }

    // Freeze first, so the moment taken is on screen whatever happens next.
    setFrozenFrame(frame);
    video.pause();
    saveStoryboardImage(frame);
  };

  /**
   * Board the SIMULATED frame: the blocking you see in the finder (silhouettes,
   * props, guides) is rasterised and stored as this shot's storyboard art, so
   * a board can be built from the floor plan alone — no camera, no drawing.
   */
  const captureSimulatedFrame = () => {
    setLiveError(null);
    const image = renderFinderBoardImage();
    if (!image) {
      setLiveError('This browser blocked reading the canvas, so the simulated frame could not be saved.');
      return;
    }
    setFrozenFrame(image);
    saveStoryboardImage(image);
  };

  const handleCameraPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLiveError(null);
    // Phone photos are many megabytes — downscale before storing, otherwise the
    // project exceeds the browser's storage quota and nothing is kept.
    loadStoryboardImageFile(file)
      .then((ref) => {
        // Release the camera first. The finder hides the board while a stream
        // is running, so attaching a photo with the camera open saved it and
        // then showed the live feed exactly as before — indistinguishable from
        // the upload having failed. Choosing a photo is a decision about what
        // the finder should show, so it takes over.
        stopLiveCamera();
        saveStoryboardImage(ref);
      })
      .catch(() => setLiveError('That photo could not be read.'));
    event.target.value = '';
  };

  return (
    <div
      id="viewfinder-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-3 sm:p-6 select-none animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="viewfinder-title"
        tabIndex={-1}
        className="relative w-full max-w-5xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95dvh]"
      >
        {/* 1. Modal Header Bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="viewfinder-title" className="text-sm font-bold text-white tracking-wide uppercase">
                  Director's Optical Viewfinder
                </h3>
                <span className="px-2 py-0.5 text-xs font-mono font-bold bg-sky-600 text-white rounded">
                  CAM {selectedCamera.cameraLabel}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {focal}mm • {selectedCamera.aspectRatio}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {selectedCamera.name} • Height: {selectedCamera.cameraHeight || 'Eye Level'} • Rig: {selectedCamera.rigType || 'Tripod'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Prev / Next Camera Navigator */}
            {cameras.length > 1 && (
              <div className="flex items-center border border-slate-700 rounded-lg overflow-hidden bg-slate-800">
                <button
                  onClick={() => openViewfinder(prevCamera.id)}
                  title={`Previous Camera (${prevCamera.cameraLabel})`}
                  aria-label={`Previous Camera (${prevCamera.cameraLabel})`}
                  className="p-1.5 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <select
                  value={selectedCamera.id}
                  onChange={(e) => openViewfinder(e.target.value)}
                  className="bg-transparent text-slate-200 text-xs font-mono font-bold px-2 py-1 focus:outline-none cursor-pointer"
                >
                  {cameras.map((c) => (
                    <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                      Cam {c.cameraLabel}: {c.name} ({c.focalLength}mm)
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => openViewfinder(nextCamera.id)}
                  title={`Next Camera (${nextCamera.cameraLabel})`}
                  aria-label={`Next Camera (${nextCamera.cameraLabel})`}
                  className="p-1.5 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              onClick={closeViewfinder}
              title="Close the viewfinder"
              aria-label="Close the viewfinder"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. Optical Simulated Viewfinder Screen */}
        <div className="relative flex-1 bg-black flex items-center justify-center p-2 sm:p-4 min-h-[220px] sm:min-h-[360px] overflow-hidden">
          {/* Framed Monitor Screen */}
          <div
            ref={frameRef}
            className={`relative w-full ${getAspectRatioStyle(
              selectedCamera.aspectRatio
            )} bg-slate-950 border-2 border-slate-700 shadow-2xl rounded-lg overflow-hidden flex items-center justify-center`}
          >
            {/* Live camera feed — every guide below is drawn on top of it. The
                element stays mounted while the camera runs so the stream is
                never detached by an unrelated re-render. */}
            {liveStream && (
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                onLoadedMetadata={(event) => {
                  setVideoReady(true);
                  // Some browsers ignore autoplay until play() is called explicitly
                  (event.currentTarget as HTMLVideoElement).play().catch(() => undefined);
                }}
                onCanPlay={() => setVideoReady(true)}
                className={`absolute inset-0 w-full h-full object-cover z-[5] ${frozenFrame ? 'invisible' : ''}`}
              />
            )}

            {/* Frozen capture: the exact moment that was taken */}
            {frozenFrame && (
              <img src={frozenFrame} alt="Captured frame" className="absolute inset-0 w-full h-full object-cover z-[6]" />
            )}

            {/* Attached storyboard art, shown as the frame's backing plate */}
            {!liveStream && showStoryboard && shownStoryboard && (
              <ProjectImage
                imageRef={shownStoryboard}
                alt={`Storyboard for shot ${targetShot?.shotNumber}`}
                className="absolute inset-0 w-full h-full z-[5]"
                style={{ objectFit: resolvedSlot?.frame?.fit || 'cover' }}
              />
            )}

            {/* Cinematic Studio Horizon & Perspective Grid */}
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col justify-end pointer-events-none">
              {/* Ceiling grid lines */}
              <div className="w-full h-1/3 bg-slate-950/60 border-b border-slate-800/40" />
              {/* Studio Stage floor */}
              <div className="w-full h-2/5 bg-gradient-to-t from-slate-900 to-slate-950 border-t border-slate-800/80">
                <div className="w-full h-full opacity-20 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />
              </div>
            </div>

            {/* Rule of Thirds Grid Overlay */}
            {showRuleOfThirds && (
              <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 z-20">
                <div className="border-r border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-r border-b border-white/20" />
                <div className="border-b border-white/20" />
                <div className="border-r border-white/20" />
                <div className="border-r border-white/20" />
                <div />
              </div>
            )}

            {/* Center Crosshair */}
            {showCrosshair && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
                <div className="w-8 h-[1px] bg-red-500/70" />
                <div className="h-8 w-[1px] bg-red-500/70 absolute" />
                <div className="w-3 h-3 rounded-full border border-red-500/70 absolute" />
              </div>
            )}

            {/* 90% and 80% Safe Areas */}
            {showSafeAreas && (
              <>
                <div className="absolute inset-[5%] border border-yellow-400/30 rounded pointer-events-none z-20">
                  <span className="absolute top-1 left-1.5 text-[8px] font-mono text-yellow-400/50">90% ACTION SAFE</span>
                </div>
                <div className="absolute inset-[10%] border border-cyan-400/30 rounded pointer-events-none z-20">
                  <span className="absolute top-1 left-1.5 text-[8px] font-mono text-cyan-400/50">80% TITLE SAFE</span>
                </div>
              </>
            )}

            {/* Simulated 3D Props in FOV (hidden behind live video / artwork) */}
            {!showsRealImage && visibleProps.map(({ prop, normalizedX, distance }) => {
              const scale = Math.max(0.3, Math.min(1.8, 160 / distance));
              const leftPercent = 50 + normalizedX * 42;
              return (
                <div
                  key={prop.id}
                  className="absolute bottom-[22%] -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-300 z-10 opacity-75"
                  style={{
                    left: `${leftPercent}%`,
                    transform: `translateX(-50%) scale(${scale})`,
                    transformOrigin: 'bottom center',
                  }}
                >
                  <div className="px-2 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-300 border border-slate-700 shadow mb-1">
                    {prop.name || prop.propType} ({(distance / 50).toFixed(1)}m)
                  </div>
                  <div className="w-24 h-16 rounded-lg bg-slate-700/80 border-2 border-slate-600 shadow-xl flex items-center justify-center text-xs font-semibold text-slate-300">
                    {prop.name || prop.propType}
                  </div>
                </div>
              );
            })}

            {/* Simulated 3D Actor Silhouettes in FOV */}
            {showsRealImage ? null : visibleActors.length === 0 && visibleProps.length === 0 ? (
              <div className="relative z-10 text-center text-slate-400 text-xs px-6 py-4 bg-slate-950/70 border border-slate-800 rounded-xl">
                <Eye className="w-6 h-6 mx-auto text-sky-500 mb-1.5" />
                <p className="font-mono font-bold text-slate-200">NO SUBJECTS IN FIELD OF VIEW</p>
                <p className="text-[11px] mt-1 text-slate-400">
                  Rotate the camera or adjust actors on the floor plan to place them inside this camera's coverage cone.
                </p>
              </div>
            ) : (
              visibleActors.map(({ actor, normalizedX, distance }) => {
                // Closer distance = larger silhouette scale
                const scale = Math.max(0.35, Math.min(2.4, 190 / distance));
                const leftPercent = 50 + normalizedX * 44;
                const color = actor.color || '#3b82f6';
                const meters = (distance / 50).toFixed(1);

                return (
                  <div
                    key={actor.id}
                    className="absolute bottom-[20%] -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-300 z-15"
                    style={{
                      left: `${leftPercent}%`,
                      transform: `translateX(-50%) scale(${scale})`,
                      transformOrigin: 'bottom center',
                    }}
                  >
                    {/* Character Tag Pill */}
                    <div
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-xl mb-1 flex items-center gap-1 border border-white/30"
                      style={{ backgroundColor: color }}
                    >
                      <User className="w-2.5 h-2.5" />
                      <span>{actor.name} ({actor.characterLetter}) • {meters}m</span>
                    </div>

                    {/* Actor Silhouette Figure */}
                    <div className="relative flex flex-col items-center">
                      {/* Head with character avatar */}
                      <div
                        className="w-14 h-14 rounded-full border-2 border-white shadow-xl flex items-center justify-center font-bold text-white text-base shadow-black/60"
                        style={{ backgroundColor: color }}
                      >
                        {actor.characterLetter}
                      </div>

                      {/* Torso */}
                      <div
                        className="w-24 h-32 rounded-t-3xl mt-1 border-t-2 border-white/50 shadow-2xl"
                        style={{
                          backgroundColor: color,
                          opacity: 0.9,
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}

            {/* Live camera: a proper shutter button, on the picture itself */}
            {liveStream && !frozenFrame && (
              <div className="absolute bottom-10 left-0 right-0 z-40 flex flex-col items-center gap-1.5">
                <button
                  onClick={captureLiveFrame}
                  title="Take this frame as the storyboard (Space)"
                  aria-label="Take this frame as the storyboard (Space)"
                  className={`w-14 h-14 rounded-full border-4 shadow-2xl flex items-center justify-center transition-transform active:scale-95 ${
                    videoReady
                      ? 'border-white bg-red-600 hover:bg-red-500'
                      : 'border-slate-400 bg-slate-700 cursor-wait'
                  }`}
                >
                  <Camera className="w-6 h-6 text-white" />
                </button>
                <span className="px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white">
                  {videoReady
                    ? `LIVE ${videoRef.current?.videoWidth || 0}×${videoRef.current?.videoHeight || 0} — press to capture`
                    : 'Starting camera…'}
                </span>
              </div>
            )}

            {/* What the frame is showing right now */}
            {showsRealImage && (
              <div className="absolute top-12 left-4 z-30 pointer-events-none">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    frozenFrame ? 'bg-amber-500 text-black' : liveStream ? 'bg-red-600 text-white' : 'bg-violet-600 text-white'
                  }`}
                >
                  {frozenFrame
                    ? `CAPTURED ${resolvedSlot?.short || 'FRAME'}`
                    : liveStream
                      ? 'LIVE CAMERA'
                      : `STORYBOARD ${targetShot?.shotNumber || ''}${
                          resolvedSlot?.short ? ` · ${resolvedSlot.short}` : ''
                        }`}
                </span>
              </div>
            )}

            {/* Cinematic Camera Telemetry HUD Overlay (Top) */}
            <div className="absolute top-3 left-4 right-4 flex items-center justify-between text-[11px] font-mono text-emerald-400 drop-shadow z-30 pointer-events-none">
              <div className="flex items-center gap-2 bg-black/60 px-2 py-1 rounded backdrop-blur-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="font-bold text-red-400">REC [00:02:14:08]</span>
              </div>
              <div className="flex items-center gap-3 text-slate-200 bg-black/60 px-2.5 py-1 rounded backdrop-blur-xs">
                <span>FPS: {frameRate.toFixed(2)}</span>
                <span>
                  SHUTTER: {shutterAngle}° {shutterSpeed ? `(1/${shutterSpeed})` : ''}
                </span>
                <span className="text-amber-400 font-bold">{aperture}</span>
                <span>ISO: {iso}</span>
                {ndFilter !== 'None' && <span className="text-emerald-400">ND {ndFilter}</span>}
                <span className="text-sky-400 font-bold">{focal}mm</span>
              </div>
            </div>

            {/* Cinematic Camera Telemetry HUD Overlay (Bottom) */}
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[11px] font-mono text-slate-300 drop-shadow z-30 pointer-events-none">
              <div className="bg-black/60 px-2 py-0.5 rounded backdrop-blur-xs">
                <span>{selectedCamera.aspectRatio} CINEMA</span>
              </div>
              <div className="flex items-center gap-3 bg-black/60 px-2.5 py-0.5 rounded backdrop-blur-xs">
                <span>SENSOR: {selectedCamera.sensorFormat}</span>
                <span className="text-sky-400">H-FOV: {selectedCamera.fovAngle}°</span>
                <span>ROT: {selectedCamera.rotation}°</span>
              </div>
            </div>
          </div>
        </div>

        {liveError && (
          <div className="px-4 py-2 bg-rose-950/70 border-t border-rose-800 text-[11px] text-rose-200">
            {liveError}
          </div>
        )}

        {saveNote && !liveError && (
          <div className="px-4 py-2 bg-emerald-950/70 border-t border-emerald-800 text-[11px] text-emerald-200 flex items-center justify-between gap-2">
            <span>{saveNote}</span>
            <button
              onClick={() => setSaveNote(null)}
              title="Dismiss this message"
              aria-label="Dismiss this message"
              className="opacity-70 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 3a. Exposure & recording settings — everything on the HUD is editable */}
        <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="text-slate-400 font-medium">Exposure:</span>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">Iris</span>
            <select
              value={aperture}
              onChange={(e) => updateElement(selectedCamera.id, { aperture: e.target.value })}
              className={hudSelect}
            >
              {APERTURES.map((value) => (
                <option key={value} value={value} className="bg-slate-900">
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">ISO</span>
            <select
              value={iso}
              onChange={(e) => updateElement(selectedCamera.id, { iso: Number(e.target.value) })}
              className={hudSelect}
            >
              {ISO_VALUES.map((value) => (
                <option key={value} value={value} className="bg-slate-900">
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">Shutter</span>
            <select
              value={shutterAngle}
              onChange={(e) => updateElement(selectedCamera.id, { shutterAngle: Number(e.target.value) })}
              className={hudSelect}
            >
              {SHUTTER_ANGLES.map((value) => (
                <option key={value} value={value} className="bg-slate-900">
                  {value}°
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">FPS</span>
            <select
              value={frameRate}
              onChange={(e) => targetShot && updateShot(targetShot.id, { frameRate: Number(e.target.value) })}
              disabled={!targetShot}
              title={targetShot ? 'Frame rate for this shot' : 'This camera has no shot yet'}
              className={`${hudSelect} ${targetShot ? '' : 'opacity-40 cursor-not-allowed'}`}
            >
              {FRAME_RATES.map((value) => (
                <option key={value} value={value} className="bg-slate-900">
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">ND</span>
            <select
              value={ndFilter}
              onChange={(e) => updateElement(selectedCamera.id, { ndFilter: e.target.value })}
              className={hudSelect}
            >
              {ND_FILTERS.map((value) => (
                <option key={value} value={value} className="bg-slate-900">
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">Sensor</span>
            <select
              value={selectedCamera.sensorFormat}
              onChange={(e) =>
                updateElement(selectedCamera.id, { sensorFormat: e.target.value as CameraElement['sensorFormat'] })
              }
              className={hudSelect}
            >
              {SENSOR_FORMATS.map((entry) => (
                <option key={entry.value} value={entry.value} className="bg-slate-900">
                  {entry.value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">Ratio</span>
            <select
              value={selectedCamera.aspectRatio}
              onChange={(e) =>
                updateElement(selectedCamera.id, { aspectRatio: e.target.value as CameraElement['aspectRatio'] })
              }
              className={hudSelect}
            >
              {ASPECT_RATIOS.map((entry) => (
                <option key={entry.value} value={entry.value} className="bg-slate-900">
                  {entry.value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">Height</span>
            <select
              value={selectedCamera.cameraHeight || 'Eye Level'}
              onChange={(e) =>
                updateElement(selectedCamera.id, { cameraHeight: e.target.value as CameraElement['cameraHeight'] })
              }
              className={hudSelect}
            >
              {CAMERA_HEIGHTS.map((value) => (
                <option key={value} value={value} className="bg-slate-900">
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* 3. Live Optical Controls Bar */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
          {/* Quick Focal Length / Prime Lenses */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Lenses:</span>
            <div className="flex items-center gap-1">
              {FOCAL_LENGTH_PRESETS.slice(0, 7).map((mm) => (
                <button
                  key={mm}
                  onClick={() => updateElement(selectedCamera.id, { focalLength: mm })}
                  className={`px-2.5 py-1 text-xs font-mono rounded-lg border transition-colors ${
                    focal === mm
                      ? 'bg-sky-600 text-white border-sky-500 font-bold shadow-sm'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white hover:border-slate-700'
                  }`}
                >
                  {mm}mm
                </button>
              ))}
            </div>
          </div>

          {/* Quick Camera Rotation Adjustment */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Pan Angle:</span>
            <input
              type="range"
              min={0}
              max={360}
              value={selectedCamera.rotation}
              onChange={(e) => updateElement(selectedCamera.id, { rotation: Number(e.target.value) })}
              className="w-28 accent-sky-500 cursor-pointer"
            />
            <span className="text-xs font-mono text-sky-400 w-10">{selectedCamera.rotation}°</span>
          </div>

          {/* Guide Overlay Toggles & Framing Save */}
          <div className="flex items-center gap-2">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleCameraPhoto}
              className="hidden"
            />
            {/* Which camera keyframe is being boarded */}
            {frameSlots.length > 1 && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wide">Frame</span>
                <div className="flex items-center rounded-lg border border-slate-700 overflow-hidden">
                  {frameSlots.map((slot) => (
                    <button
                      key={slot.key}
                      onClick={() => setCaptureSlot(slot.key)}
                      title={`Board the frame at ${slot.label.toLowerCase()} of the move${
                        slot.frame?.image ? ' (already boarded)' : ''
                      }`}
                      className={`px-2 py-1 text-[11px] font-semibold flex items-center gap-1 ${
                        currentSlotKey === slot.key
                          ? slot.short === 'END'
                            ? 'bg-amber-500 text-black'
                            : 'bg-violet-600 text-white'
                          : 'bg-slate-950 text-slate-300'
                      }`}
                    >
                      {slot.label}
                      {slot.frame?.image && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Live camera: shoot the storyboard through the finder's guides */}
            {liveStream ? (
              <>
                {frozenFrame ? (
                  <button
                    onClick={() => {
                      setFrozenFrame(null);
                      setSaveNote(null);
                      videoRef.current?.play().catch(() => undefined);
                    }}
                    title="Discard this frame and go back to the live picture"
                    className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg border bg-slate-950 text-slate-200 border-slate-700 hover:text-white"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Retake</span>
                  </button>
                ) : null}
                {!frozenFrame && (
                <button
                  onClick={captureLiveFrame}
                  title={
                    targetShot
                      ? 'Capture this frame as the shot\'s storyboard'
                      : 'Capture — a shot is created for this camera automatically'
                  }
                  className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg shadow-sm transition-colors ${
                    photoFeedback ? 'bg-emerald-600 text-white' : 'bg-violet-600 hover:bg-violet-500 text-white'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{photoFeedback ? 'Storyboard attached!' : 'Capture frame'}</span>
                </button>
                )}
                {!frozenFrame && (
                <button
                  onClick={() => startLiveCamera(facingMode === 'environment' ? 'user' : 'environment')}
                  title="Switch between the front and rear camera"
                  aria-label="Switch between the front and rear camera"
                  className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border bg-slate-950 text-slate-300 border-slate-800 hover:text-white"
                >
                  <SwitchCamera className="w-3.5 h-3.5" />
                </button>
                )}
                <button
                  onClick={() => {
                    setFrozenFrame(null);
                    stopLiveCamera();
                  }}
                  title="Stop the camera"
                  className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border bg-slate-950 text-rose-400 border-rose-500/40 hover:text-rose-300"
                >
                  <VideoOff className="w-3.5 h-3.5" />
                  <span>Stop</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => startLiveCamera()}
                title="Open this device's camera inside the viewfinder (webcam, phone or iPad) and shoot the storyboard through these guides"
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg shadow-sm bg-violet-600 hover:bg-violet-500 text-white"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Live camera</span>
              </button>
            )}

            {!liveStream && (
              <button
                onClick={captureSimulatedFrame}
                title="Board this blocking: save the simulated frame (silhouettes, props and guides) as this shot's storyboard"
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg shadow-sm transition-colors ${
                  photoFeedback ? 'bg-emerald-600 text-white' : 'bg-sky-600 hover:bg-sky-500 text-white'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>{photoFeedback ? 'Board saved!' : 'Board this frame'}</span>
              </button>
            )}

            <button
              onClick={() => cameraInputRef.current?.click()}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                photoFeedback
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white'
              }`}
              title="Attach a photo from a file (on iPad and mobile this opens the camera app)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Photo file</span>
            </button>

            {targetShot && keyFrameImage(targetShot) && !liveStream && (
              <button
                onClick={() => setShowStoryboard((shown) => !shown)}
                title="Show or hide the attached storyboard inside the finder"
                aria-pressed={showStoryboard}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  showStoryboard
                    ? 'bg-slate-800 text-violet-300 border-violet-500/50'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Board</span>
              </button>
            )}
            <button
              onClick={() => setShowRuleOfThirds(!showRuleOfThirds)}
              aria-pressed={showRuleOfThirds}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                showRuleOfThirds
                  ? 'bg-slate-800 text-sky-400 border-sky-500/50'
                  : 'bg-slate-950 text-slate-400 border-slate-800'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Thirds</span>
            </button>

            <button
              onClick={() => setShowCrosshair(!showCrosshair)}
              aria-pressed={showCrosshair}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                showCrosshair
                  ? 'bg-slate-800 text-sky-400 border-sky-500/50'
                  : 'bg-slate-950 text-slate-400 border-slate-800'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Cross</span>
            </button>

            <button
              onClick={() => setShowSafeAreas(!showSafeAreas)}
              aria-pressed={showSafeAreas}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                showSafeAreas
                  ? 'bg-slate-800 text-sky-400 border-sky-500/50'
                  : 'bg-slate-950 text-slate-400 border-slate-800'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Safe</span>
            </button>

            {/* Save Framing to Selected Shot */}
            <button
              onClick={handleSaveFramingToShot}
              title={
                targetShot
                  ? 'Save the framing and board the current view into the selected Frame slot of this shot'
                  : 'Create a shot for this camera with this framing (and its picture, when one is available)'
              }
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg shadow-sm transition-colors ${
                savedFeedback
                  ? 'bg-emerald-600 text-white'
                  : 'bg-sky-600 hover:bg-sky-500 text-white'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {savedFeedback
                  ? 'Saved to shot!'
                  : liveStream
                    ? 'Capture & save to shot'
                    : 'Save Framing & Board to Shot'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
