import React, { useEffect, useRef, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { CameraMovement, Shot, ShotSize, ShotStatus } from '../../types';
import { CAMERA_MOVEMENTS, SHOT_SIZES } from '../../constants/presets';
import { exportShotListToCsv } from '../../utils/exportShotList';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Eye,
  Film,
  GripVertical,
  Hash,
  Layers,
  LayoutGrid,
  List,
  MoreVertical,
  Plus,
  Printer,
  Sparkles,
  Table,
  Trash2,
  Video,
} from 'lucide-react';

export const ShotListPanel: React.FC = () => {
  const {
    project,
    activeSetup,
    selectedShotId,
    selectedElementIds,
    selectShot,
    addShot,
    insertShotAfter,
    updateShot,
    deleteShot,
    reorderShots,
    moveShot,
    renumberAllShots,
    sortShotsBy,
    createCameraAndShot,
    openViewfinder,
    openExportModal,
    theme,
  } = useFloorPlan();

  const isLight = theme === 'light';
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [filterCamera, setFilterCamera] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedShotId, setExpandedShotId] = useState<string | null>(null);
  const [isRenumberMenuOpen, setIsRenumberMenuOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [lastInsertedShotId, setLastInsertedShotId] = useState<string | null>(null);
  const shotListContainerRef = useRef<HTMLDivElement>(null);

  const cameras = activeSetup.elements.filter((e) => e.type === 'camera');

  // Filter shots
  const filteredShots = activeSetup.shots.filter((shot) => {
    if (filterCamera !== 'all' && shot.cameraId !== filterCamera) return false;
    if (filterStatus !== 'all' && shot.status !== filterStatus) return false;
    return true;
  });

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
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      reorderShots(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleInsertBelow = (e: React.MouseEvent, shotId: string) => {
    e.stopPropagation();
    const newId = insertShotAfter(shotId);
    setLastInsertedShotId(newId);
  };

  return (
    <div
      id="shot-list-panel"
      className={`flex flex-col h-full w-full select-none transition-colors ${
        isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'
      }`}
    >
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

            {/* Quick Add Blank Shot */}
            <button
              id="btn-add-shot"
              onClick={() => addShot()}
              title="Add Shot to List (creates camera on plan)"
              className={`p-1.5 rounded-lg border text-xs transition-colors ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            {/* Export CSV / Excel */}
            <button
              onClick={() => exportShotListToCsv(activeSetup, project.title)}
              title="Export Shot List to Excel / CSV spreadsheet"
              className={`p-1.5 rounded-lg border text-xs transition-colors ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {/* Print View */}
            <button
              onClick={openExportModal}
              title="Print Shot List or Blueprint Floor Plan"
              className={`p-1.5 rounded-lg border text-xs transition-colors ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 2. Controls Toolbar (View Toggle, Sorting, Renumbering) */}
        <div className="flex items-center justify-between gap-1.5 pt-1 text-[11px]">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {/* Sort Dropdown */}
            <div className="flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3 opacity-60 flex-shrink-0" />
              <select
                onChange={(e) => sortShotsBy(e.target.value as any)}
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

          {/* View Toggle: Cards vs Table List */}
          <div className={`flex items-center gap-0.5 border rounded-lg p-0.5 ${
            isLight ? 'bg-slate-200/70 border-slate-300' : 'bg-slate-800 border-slate-700'
          }`}>
            <button
              onClick={() => setViewMode('cards')}
              title="Storyboard / Coverage Cards View"
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

        {/* Sub-letter insertion feedback banner */}
        {lastInsertedShotId && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-sky-500/10 border border-sky-500/30 text-xs text-sky-700 dark:text-sky-300">
            <span className="flex items-center gap-1.5 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-sky-500" />
              Inserted new coverage shot.
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  renumberAllShots('scene_alphabetic');
                  setLastInsertedShotId(null);
                }}
                className="px-2 py-0.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-[10px] font-bold"
              >
                Renumber Rest (1A, 1B, 1C...)
              </button>
              <button
                onClick={() => setLastInsertedShotId(null)}
                className="text-[10px] opacity-70 hover:opacity-100"
              >
                Keep
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Main Content: Cards View or Table List View */}
      <div
        ref={shotListContainerRef}
        className="flex-1 overflow-y-auto p-2.5 space-y-2 custom-scrollbar"
      >
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
          filteredShots.map((shot, index) => {
            const isSelected = selectedShotId === shot.id;
            const isCameraSelected = selectedElementIds.includes(shot.cameraId);
            const isExpanded = expandedShotId === shot.id;
            const shotSizeInfo = SHOT_SIZES.find((s) => s.value === shot.shotSize) || SHOT_SIZES[4];
            const linkedCamera = cameras.find((c) => c.id === shot.cameraId);
            const isBeingDragged = draggedIndex === index;
            const isDragOver = dragOverIndex === index;

            return (
              <div
                key={shot.id}
                id={`shot-card-${shot.id}`}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => selectShot(shot.id, true)}
                className={`group relative rounded-xl border transition-all cursor-pointer p-3 ${
                  isBeingDragged ? 'opacity-40 scale-95 border-dashed border-sky-400' : ''
                } ${
                  isDragOver ? 'border-t-4 border-t-sky-500' : ''
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

                {/* Primary Card Top Row: Grip, Shot # (editable), Camera, Size, Lens, Status, Actions */}
                <div className="flex items-center justify-between gap-1.5">
                  {/* Left: Drag Grip + Editable Shot # + Camera Pill */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div
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

                    {/* Linked Camera Pill with Dropdown */}
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={shot.cameraId || ''}
                        onChange={(e) => {
                          const newCamId = e.target.value;
                          const cam = cameras.find((c) => c.id === newCamId);
                          updateShot(shot.id, {
                            cameraId: newCamId,
                            cameraLabel: cam ? (cam as any).cameraLabel : 'A',
                            lensMm: cam ? (cam as any).focalLength : shot.lensMm,
                          });
                        }}
                        className={`text-[10px] font-mono font-semibold py-0.5 px-1.5 rounded border cursor-pointer ${
                          linkedCamera
                            ? isLight ? 'bg-slate-100 text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'
                            : 'bg-amber-500/15 text-amber-600 border-amber-500/30'
                        }`}
                      >
                        <option value="">No Camera</option>
                        {cameras.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name || `Cam ${(c as any).cameraLabel}`}
                          </option>
                        ))}
                      </select>
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
                      className={`p-1 rounded transition-colors ${
                        isLight ? 'text-slate-500 hover:text-sky-600 hover:bg-slate-100' : 'text-slate-400 hover:text-sky-300 hover:bg-slate-700'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    {/* Insert Shot Below Button */}
                    <button
                      onClick={(e) => handleInsertBelow(e, shot.id)}
                      title="Insert Sub-Shot Below (e.g. 1B)"
                      className={`p-1 rounded transition-colors text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-slate-700`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>

                    {/* Expand/Collapse Toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedShotId(isExpanded ? null : shot.id);
                      }}
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
                        value={shot.movement || 'Static'}
                        onChange={(e) => updateShot(shot.id, { movement: e.target.value as CameraMovement })}
                        className={`text-[10px] font-semibold py-0.5 px-1.5 rounded border cursor-pointer focus:outline-none focus:border-sky-500 ${
                          isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'
                        }`}
                      >
                        {CAMERA_MOVEMENTS.map((m) => (
                          <option key={m.value} value={m.value}>
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
                        onChange={(e) => updateShot(shot.id, { cameraAngle: e.target.value as any })}
                        className={`text-[10px] font-semibold py-0.5 px-1.5 rounded border cursor-pointer focus:outline-none focus:border-sky-500 ${
                          isLight ? 'bg-slate-50 text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'
                        }`}
                      >
                        {['Eye Level', 'Low Angle', 'High Angle', 'Ground', 'Knee', 'Waist', 'High', "Bird's Eye", "Worm's Eye", 'Dutch Angle'].map((a) => (
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
                        className={`px-2 py-0.5 text-xs font-bold ${isLight ? 'hover:bg-slate-200 text-slate-700' : 'hover:bg-slate-800 text-slate-300'}`}
                      >
                        -
                      </button>
                      <span className="px-2 font-mono text-sky-500 font-bold text-xs">{shot.takesCount || 0}</span>
                      <button
                        onClick={() => updateShot(shot.id, { takesCount: (shot.takesCount || 0) + 1 })}
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
                        <label className="text-[9px] font-bold tracking-wider uppercase opacity-60 block mb-0.5">MOVEMENT</label>
                        <select
                          value={shot.movement}
                          onChange={(e) => updateShot(shot.id, { movement: e.target.value as CameraMovement })}
                          className={`w-full text-xs border rounded-lg p-1.5 ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'}`}
                        >
                          {CAMERA_MOVEMENTS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[9px] font-bold tracking-wider uppercase opacity-60 block mb-0.5">CAMERA ANGLE</label>
                        <select
                          value={shot.cameraAngle}
                          onChange={(e) => updateShot(shot.id, { cameraAngle: e.target.value as any })}
                          className={`w-full text-xs border rounded-lg p-1.5 ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'}`}
                        >
                          {['Ground', 'Knee', 'Waist', 'Eye Level', 'High', 'Low Angle', 'High Angle', "Bird's Eye", "Worm's Eye", 'Dutch Angle'].map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Framing & Action description */}
                    <div>
                      <label className="text-[9px] font-bold tracking-wider uppercase opacity-60 block mb-0.5">FRAMING & ACTION NOTES</label>
                      <textarea
                        value={shot.framingDescription}
                        onChange={(e) => updateShot(shot.id, { framingDescription: e.target.value })}
                        placeholder="e.g. OTS John looking at Sarah. Camera dollies left as John stands up..."
                        rows={2}
                        className={`w-full text-xs border rounded-lg p-2 focus:border-sky-500 focus:outline-none ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={(e) => handleInsertBelow(e, shot.id)}
                        className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-semibold"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Insert Sub-Shot Below (1B)</span>
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
                  <th className="py-2.5 px-2 w-14">Shot #</th>
                  <th className="py-2.5 px-2">Shot Name / Action</th>
                  <th className="py-2.5 px-2 w-24">Cam</th>
                  <th className="py-2.5 px-2 w-16">Size</th>
                  <th className="py-2.5 px-2 w-16">Lens</th>
                  <th className="py-2.5 px-2 w-20">Move</th>
                  <th className="py-2.5 px-2 w-20">Angle</th>
                  <th className="py-2.5 px-2 w-16 text-center">Takes</th>
                  <th className="py-2.5 px-2 w-20">Status</th>
                  <th className="py-2.5 px-2 w-16 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredShots.map((shot, index) => {
                  const isSelected = selectedShotId === shot.id;
                  const linkedCamera = cameras.find((c) => c.id === shot.cameraId);
                  const isBeingDragged = draggedIndex === index;
                  const isDragOver = dragOverIndex === index;

                  return (
                    <tr
                      key={shot.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      onClick={() => selectShot(shot.id, true)}
                      className={`cursor-pointer transition-colors ${
                        isBeingDragged ? 'opacity-30 bg-sky-100 dark:bg-sky-950' : ''
                      } ${
                        isDragOver ? 'border-t-2 border-sky-500' : ''
                      } ${
                        isSelected
                          ? isLight ? 'bg-sky-50 font-medium' : 'bg-slate-800 font-medium'
                          : isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/60'
                      }`}
                    >
                      {/* Drag Handle */}
                      <td className="py-2 px-1 text-center">
                        <div className="cursor-grab text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex justify-center">
                          <GripVertical className="w-3.5 h-3.5" />
                        </div>
                      </td>

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

                      {/* Camera Selector */}
                      <td className="py-2 px-1.5" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={shot.cameraId || ''}
                          onChange={(e) => {
                            const newCamId = e.target.value;
                            const cam = cameras.find((c) => c.id === newCamId);
                            updateShot(shot.id, {
                              cameraId: newCamId,
                              cameraLabel: cam ? (cam as any).cameraLabel : 'A',
                              lensMm: cam ? (cam as any).focalLength : shot.lensMm,
                            });
                          }}
                          className={`w-full text-[11px] font-mono py-0.5 px-1 rounded border ${
                            isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                          }`}
                        >
                          <option value="">None</option>
                          {cameras.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name || `Cam ${(c as any).cameraLabel}`}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Shot Size */}
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

                      {/* Lens */}
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

                      {/* Movement */}
                      <td className="py-2 px-1.5" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={shot.movement || 'Static'}
                          onChange={(e) => updateShot(shot.id, { movement: e.target.value as CameraMovement })}
                          className={`w-full text-[10px] py-0.5 px-1 rounded border ${
                            isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                          }`}
                        >
                          {CAMERA_MOVEMENTS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Angle */}
                      <td className="py-2 px-1.5" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={shot.cameraAngle || 'Eye Level'}
                          onChange={(e) => updateShot(shot.id, { cameraAngle: e.target.value as any })}
                          className={`w-full text-[10px] py-0.5 px-1 rounded border ${
                            isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                          }`}
                        >
                          {['Eye Level', 'Low Angle', 'High Angle', 'Ground', 'Knee', 'Waist', 'High', "Bird's Eye", "Worm's Eye", 'Dutch Angle'].map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Takes */}
                      <td className="py-2 px-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1 font-mono text-xs font-bold text-sky-500">
                          <button
                            onClick={() => updateShot(shot.id, { takesCount: Math.max(0, (shot.takesCount || 0) - 1) })}
                            className="px-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            -
                          </button>
                          <span>{shot.takesCount || 0}</span>
                          <button
                            onClick={() => updateShot(shot.id, { takesCount: (shot.takesCount || 0) + 1 })}
                            className="px-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      {/* Status */}
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

                      {/* Actions */}
                      <td className="py-2 px-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openViewfinder(shot.cameraId)}
                            title="Simulate Camera Viewfinder"
                            className="p-1 text-slate-400 hover:text-sky-500 rounded"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleInsertBelow(e, shot.id)}
                            title="Insert Sub-Shot Below (1B)"
                            className="p-1 text-sky-500 hover:text-sky-600 rounded"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteShot(shot.id)}
                            title="Delete Shot"
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
      <div className={`p-2.5 border-t text-[11px] flex items-center justify-between ${
        isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-slate-800 bg-slate-950/80 text-slate-400'
      }`}>
        <span className="flex items-center gap-1 font-mono">
          <Layers className="w-3.5 h-3.5 text-sky-500" />
          Drag rows or cards to reorder
        </span>
        <button
          onClick={() => addShot()}
          className="text-sky-500 hover:text-sky-600 font-bold flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Shot</span>
        </button>
      </div>
    </div>
  );
};
