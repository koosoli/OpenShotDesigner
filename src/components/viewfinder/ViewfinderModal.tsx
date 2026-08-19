import React, { useRef, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { ActorElement, CameraElement, PropElement } from '../../types';
import { isPointInCameraFov } from '../../utils/geometry';
import { FOCAL_LENGTH_PRESETS, SENSOR_FORMATS } from '../../constants/presets';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Eye,
  Grid,
  Layers,
  Maximize2,
  Minimize2,
  RotateCw,
  Save,
  Smartphone,
  Shield,
  Sliders,
  Sparkles,
  User,
  X,
} from 'lucide-react';

export const ViewfinderModal: React.FC = () => {
  const {
    activeSetup,
    isViewfinderOpen,
    viewfinderCameraId,
    openViewfinder,
    closeViewfinder,
    updateElement,
    updateShot,
    selectedShotId,
  } = useFloorPlan();

  const [showRuleOfThirds, setShowRuleOfThirds] = useState(true);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [showSafeAreas, setShowSafeAreas] = useState(true);
  const [aperture, setAperture] = useState<'f/1.4' | 'f/2.8' | 'f/5.6' | 'f/11'>('f/2.8');
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  if (!isViewfinderOpen) return null;

  const cameras = activeSetup.elements.filter((e) => e.type === 'camera') as CameraElement[];
  const selectedCamera =
    cameras.find((c) => c.id === viewfinderCameraId) || cameras[0];

  if (!selectedCamera) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center max-w-md shadow-2xl">
          <Camera className="w-12 h-12 mx-auto text-slate-500 mb-3" />
          <h3 className="text-base font-bold text-white mb-1">No Cameras on Floor Plan</h3>
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

  const handleSaveFramingToShot = () => {
    const targetShot = activeSetup.shots.find((shot) => shot.id === selectedCamera.associatedShotId)
      || activeSetup.shots.find((shot) => shot.cameraId === selectedCamera.id)
      || activeSetup.shots.find((shot) => shot.id === selectedShotId);
    if (targetShot) {
      const subjectNames = visibleActors.map((a) => a.actor.name || a.actor.characterLetter).join(', ');
      const desc = `Shot on Cam ${selectedCamera.cameraLabel} (${focal}mm, ${selectedCamera.aspectRatio}). In frame: ${
        subjectNames || 'Empty frame'
      }.`;
      updateShot(targetShot.id, {
        cameraId: selectedCamera.id,
        cameraLabel: selectedCamera.cameraLabel,
        lensMm: focal,
        framingDescription: desc,
      });
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2200);
    }
  };

  const handleCameraPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const targetShot = activeSetup.shots.find((shot) => shot.id === selectedCamera.associatedShotId)
      || activeSetup.shots.find((shot) => shot.cameraId === selectedCamera.id)
      || activeSetup.shots.find((shot) => shot.id === selectedShotId);
    if (!targetShot) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateShot(targetShot.id, { storyboardImage: String(reader.result), storyboardFit: 'cover' });
      setPhotoFeedback(true);
      setTimeout(() => setPhotoFeedback(false), 2200);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  return (
    <div
      id="viewfinder-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-3 sm:p-6 select-none animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-5xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95dvh]">
        {/* 1. Modal Header Bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide uppercase">
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
                  className="p-1.5 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              onClick={closeViewfinder}
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
            className={`relative w-full ${getAspectRatioStyle(
              selectedCamera.aspectRatio
            )} bg-slate-950 border-2 border-slate-700 shadow-2xl rounded-lg overflow-hidden flex items-center justify-center`}
          >
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

            {/* Simulated 3D Props in FOV */}
            {visibleProps.map(({ prop, normalizedX, distance }) => {
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
            {visibleActors.length === 0 && visibleProps.length === 0 ? (
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

            {/* Cinematic Camera Telemetry HUD Overlay (Top) */}
            <div className="absolute top-3 left-4 right-4 flex items-center justify-between text-[11px] font-mono text-emerald-400 drop-shadow z-30 pointer-events-none">
              <div className="flex items-center gap-2 bg-black/60 px-2 py-1 rounded backdrop-blur-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="font-bold text-red-400">REC [00:02:14:08]</span>
              </div>
              <div className="flex items-center gap-3 text-slate-200 bg-black/60 px-2.5 py-1 rounded backdrop-blur-xs">
                <span>FPS: 24.00</span>
                <span>SHUTTER: 180°</span>
                <span className="text-amber-400 font-bold">{aperture}</span>
                <span>ISO: 800</span>
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
            <button
              onClick={() => cameraInputRef.current?.click()}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg shadow-sm transition-colors ${
                photoFeedback ? 'bg-emerald-600 text-white' : 'bg-violet-600 hover:bg-violet-500 text-white'
              }`}
              title="On iPad and mobile this opens the rear camera and attaches the photo to this camera's shot"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{photoFeedback ? 'Storyboard attached!' : 'Take storyboard photo'}</span>
            </button>
            <button
              onClick={() => setShowRuleOfThirds(!showRuleOfThirds)}
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
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg shadow-sm transition-colors ${
                savedFeedback
                  ? 'bg-emerald-600 text-white'
                  : 'bg-sky-600 hover:bg-sky-500 text-white'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savedFeedback ? 'Framing Saved!' : 'Save Framing to Shot'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
