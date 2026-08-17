import React, { useRef, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  ActorElement,
  CameraElement,
  DoorElement,
  FloorPlanElement,
  LightElement,
  PropElement,
  TrackElement,
  WallElement,
  WindowElement,
} from '../../types';
import { getCameraFovPolygon, getLightBeamPolygon, kelvinToRgb } from '../../utils/geometry';
import { exportProjectToCsv, exportShotListToCsv } from '../../utils/exportShotList';
import { exportSvgAsPng } from '../../utils/exportFloorPlanPng';
import {
  AppWindow,
  ArrowRight,
  Camera,
  DoorClosed,
  Download,
  FileSpreadsheet,
  FileText,
  Film,
  Layers,
  MapPin,
  Maximize2,
  Printer,
  Sparkles,
  Sun,
  User,
  Video,
  X,
} from 'lucide-react';

export const PrintableShotPlan: React.FC = () => {
  const { project, activeSetup, isExportModalOpen, closeExportModal } = useFloorPlan();
  const [exportSection, setExportSection] = useState<'floorplan' | 'shotlist' | 'combined'>('floorplan');
  const [pngScale, setPngScale] = useState<2 | 3>(2);
  const floorPlanSvgRef = useRef<SVGSVGElement>(null);

  if (!isExportModalOpen) return null;

  const cameras = activeSetup.elements.filter((e) => e.type === 'camera') as CameraElement[];
  const lights = activeSetup.elements.filter((e) => e.type === 'light') as LightElement[];
  const actors = activeSetup.elements.filter((e) => e.type === 'actor') as ActorElement[];
  const walls = activeSetup.elements.filter((e) => e.type === 'wall') as WallElement[];
  const doors = activeSetup.elements.filter((e) => e.type === 'door') as DoorElement[];
  const windows = activeSetup.elements.filter((e) => e.type === 'window') as WindowElement[];
  const props = activeSetup.elements.filter((e) => e.type === 'prop') as PropElement[];
  const tracks = activeSetup.elements.filter((e) => e.type === 'track') as TrackElement[];

  const handlePrint = () => {
    window.print();
  };

  // Calculate bounding box of all elements to auto-fit printable blueprint
  let minX = 100, minY = 100, maxX = 900, maxY = 600;
  if (activeSetup.elements.length > 0) {
    minX = Math.min(...activeSetup.elements.map((e) => e.x)) - 60;
    minY = Math.min(...activeSetup.elements.map((e) => e.y)) - 60;
    maxX = Math.max(...activeSetup.elements.map((e) => (e as any).x2 || e.x + ((e as any).width || 80))) + 60;
    maxY = Math.max(...activeSetup.elements.map((e) => (e as any).y2 || e.y + ((e as any).height || 80))) + 60;
  }
  const viewBoxWidth = Math.max(800, maxX - minX);
  const viewBoxHeight = Math.max(500, maxY - minY);

  return (
    <div
      id="export-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 select-none animate-in fade-in"
    >
      <div className="relative w-full max-w-5xl bg-white text-slate-900 border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh]">
        {/* Top Control Bar (Hidden when printing) */}
        <div className="flex flex-wrap items-center justify-between px-6 py-3.5 bg-slate-900 text-white border-b border-slate-800 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                Export & Print Studio
              </h3>
              <p className="text-xs text-slate-400">
                Ink-saving high-contrast white layout for production printing and call sheets.
              </p>
            </div>
          </div>

          {/* Section Mode Toggle: Floor Plan Only, Shot List Only, Combined */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700">
              <button
                onClick={() => setExportSection('floorplan')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  exportSection === 'floorplan'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Floor Plan Blueprint
              </button>
              <button
                onClick={() => setExportSection('shotlist')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  exportSection === 'shotlist'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Shot List Only
              </button>
              <button
                onClick={() => setExportSection('combined')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  exportSection === 'combined'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Complete Package
              </button>
            </div>

            {/* Quick Actions: PNG, Print, CSV, Close */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>

            {(exportSection === 'floorplan' || exportSection === 'combined') && (
              <div className="flex items-center gap-1">
                <select
                  value={pngScale}
                  onChange={(e) => setPngScale(Number(e.target.value) as 2 | 3)}
                  title="PNG resolution"
                  className="px-1.5 py-1.5 bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  <option value={2}>2x</option>
                  <option value={3}>3x</option>
                </select>
                <button
                  onClick={() => {
                    if (floorPlanSvgRef.current) {
                      exportSvgAsPng(floorPlanSvgRef.current, {
                        scale: pngScale,
                        fileName: `FloorPlan_Scene_${activeSetup.sceneNumber || '1'}_${activeSetup.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`,
                        title: project.title,
                        subtitle: `SCENE ${activeSetup.sceneNumber}: ${activeSetup.name}`,
                        meta: [
                          `DATE: ${project.date || new Date().toISOString().split('T')[0]}`,
                          `DIR: ${project.director || '—'}`,
                          `DP: ${project.cinematographer || '—'}`,
                          `${activeSetup.location} (${activeSetup.timeOfDay})`,
                        ],
                      });
                    }
                  }}
                  title="Download Floor Plan as PNG image"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>PNG</span>
                </button>
              </div>
            )}

            {exportSection !== 'floorplan' && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => exportShotListToCsv(activeSetup, project.title)}
                  title="Download this scene's shot list as Excel / CSV"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>CSV</span>
                </button>
                <button
                  onClick={() => exportProjectToCsv(project)}
                  title="Download the whole project (all scenes) as Excel / CSV"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>All Scenes</span>
                </button>
              </div>
            )}

            <button
              onClick={closeExportModal}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Paper View (Strictly Pure White for Ink Saving) */}
        <div
          id="printable-content"
          className="flex-1 overflow-y-auto p-8 bg-white text-slate-900 print:p-2 print:overflow-visible"
        >
          {/* 1. Header Block (Standard Film Production Slate) */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6">
            <div className="flex justify-between items-start">
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
                      : '• COMPLETE PRODUCTION CALL SHEET'}
                  </span>
                </div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase mt-1">
                  {project.title}
                </h1>
                <h2 className="text-sm font-bold text-slate-700">
                  SCENE {activeSetup.sceneNumber}: {activeSetup.name}
                </h2>
              </div>
              <div className="text-right text-xs text-slate-700 font-mono space-y-0.5">
                <p><strong>DATE:</strong> {project.date || new Date().toISOString().split('T')[0]}</p>
                <p><strong>DIRECTOR:</strong> {project.director || '—'}</p>
                <p><strong>CINEMATOGRAPHER:</strong> {project.cinematographer || '—'}</p>
                <p><strong>LOCATION:</strong> {activeSetup.location} ({activeSetup.timeOfDay})</p>
              </div>
            </div>
          </div>

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
              <div className="border-2 border-slate-900 rounded-xl p-4 bg-white shadow-xs overflow-hidden">
                <svg
                  ref={floorPlanSvgRef}
                  id="print-floorplan-svg"
                  viewBox={`${minX} ${minY} ${viewBoxWidth} ${viewBoxHeight}`}
                  className="w-full h-auto max-h-[500px]"
                  style={{ backgroundColor: '#ffffff' }}
                >
                  {/* Subtle Grid pattern for architectural context */}
                  <defs>
                    <pattern id="print-grid" width="50" height="50" patternUnits="userSpaceOnUse">
                      <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect x={minX} y={minY} width={viewBoxWidth} height={viewBoxHeight} fill="url(#print-grid)" />

                  {/* 1. Draw Walls */}
                  {walls.map((wall) => {
                    const x2 = wall.x2 ?? wall.x + 200;
                    const y2 = wall.y2 ?? wall.y;
                    const thickness = wall.thickness || 12;
                    return (
                      <g key={wall.id}>
                        <line
                          x1={wall.x}
                          y1={wall.y}
                          x2={x2}
                          y2={y2}
                          stroke="#0f172a"
                          strokeWidth={thickness}
                          strokeLinecap="round"
                        />
                        <line
                          x1={wall.x}
                          y1={wall.y}
                          x2={x2}
                          y2={y2}
                          stroke="#ffffff"
                          strokeWidth={thickness / 3}
                          strokeLinecap="round"
                        />
                      </g>
                    );
                  })}

                  {/* 2. Draw Doors */}
                  {doors.map((door) => {
                    const w = door.width || 60;
                    const isLeft = door.swingDirection === 'left';
                    const sweepFlag = isLeft ? 0 : 1;
                    return (
                      <g
                        key={door.id}
                        transform={`translate(${door.x}, ${door.y}) rotate(${door.rotation || 0})`}
                      >
                        <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke="#ffffff" strokeWidth={14} />
                        <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke="#d97706" strokeWidth={3} />
                        <path
                          d={`M ${-w / 2} 0 A ${w} ${w} 0 0 ${sweepFlag} ${-w / 2 + w * 0.7} ${isLeft ? -w * 0.7 : w * 0.7}`}
                          fill="none"
                          stroke="#d97706"
                          strokeWidth="1.5"
                          strokeDasharray="4 3"
                        />
                      </g>
                    );
                  })}

                  {/* 3. Draw Windows */}
                  {windows.map((win) => {
                    const w = win.width || 80;
                    const d = win.depth || 14;
                    return (
                      <g
                        key={win.id}
                        transform={`translate(${win.x}, ${win.y}) rotate(${win.rotation || 0})`}
                      >
                        <rect
                          x={-w / 2}
                          y={-d / 2}
                          width={w}
                          height={d}
                          fill="#ffffff"
                          stroke="#0284c7"
                          strokeWidth="2"
                        />
                        <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke="#0284c7" strokeWidth="2" />
                      </g>
                    );
                  })}

                  {/* 4. Draw Props & Furniture */}
                  {props.map((prop) => (
                    <g
                      key={prop.id}
                      transform={`translate(${prop.x}, ${prop.y}) rotate(${prop.rotation || 0})`}
                    >
                      <rect
                        x={-(prop.width || 80) / 2}
                        y={-(prop.height || 50) / 2}
                        width={prop.width || 80}
                        height={prop.height || 50}
                        rx="4"
                        fill="#f8fafc"
                        stroke="#475569"
                        strokeWidth="1.5"
                      />
                      <text
                        x="0"
                        y="4"
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="bold"
                        fill="#334155"
                        fontFamily="sans-serif"
                      >
                        {prop.name || prop.propType}
                      </text>
                    </g>
                  ))}

                  {/* 5. Draw Light Beams & Fixtures */}
                  {lights.map((l) => {
                    const beamPath = getLightBeamPolygon(
                      { x: l.x, y: l.y },
                      l.rotation || 0,
                      l.beamAngle || 60,
                      l.throwDistance || 220
                    );
                    return (
                      <g key={l.id}>
                        <path d={beamPath} fill="#fef3c7" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
                        <g transform={`translate(${l.x}, ${l.y}) rotate(${l.rotation || 0})`}>
                          <polygon points="12,0 -8,-10 -4,0 -8,10" fill="#d97706" />
                          <circle cx="0" cy="0" r="10" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />
                          <text x="0" y="3.5" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#ffffff">
                            L
                          </text>
                          <text x="0" y="-14" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0f172a">
                            {l.name}
                          </text>
                        </g>
                      </g>
                    );
                  })}

                  {/* 6. Draw Camera FOV Cones & Camera Icons */}
                  {cameras.map((c) => {
                    const fov = getCameraFovPolygon(
                      { x: c.x, y: c.y },
                      c.rotation || 0,
                      c.fovAngle || 45,
                      c.coneDistance || 280
                    );
                    return (
                      <g key={c.id}>
                        {/* FOV Cone */}
                        <path
                          d={fov.pathString}
                          fill="#e0f2fe"
                          stroke="#0284c7"
                          strokeWidth="1.5"
                          strokeDasharray="4 3"
                          opacity="0.75"
                        />
                        <line x1={c.x} y1={c.y} x2={fov.centerPt.x} y2={fov.centerPt.y} stroke="#0284c7" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />

                        {/* Camera Body Icon */}
                        <g transform={`translate(${c.x}, ${c.y}) rotate(${c.rotation || 0})`}>
                          <polygon points="14,0 -8,-10 -4,0 -8,10" fill="#0284c7" />
                          <rect x="-12" y="-10" width="24" height="20" rx="3" fill="#0369a1" stroke="#ffffff" strokeWidth="2" />
                          <g transform={`rotate(${-(c.rotation || 0)})`}>
                            <text x="0" y="3.5" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#ffffff">
                              {c.cameraLabel}
                            </text>
                            <text x="0" y="-16" textAnchor="middle" fontSize="10" fontWeight="black" fill="#0f172a">
                              CAM {c.cameraLabel} ({c.focalLength}mm)
                            </text>
                          </g>
                        </g>
                      </g>
                    );
                  })}

                  {/* 7. Draw Actors */}
                  {actors.map((actor) => (
                    <g
                      key={actor.id}
                      transform={`translate(${actor.x}, ${actor.y}) rotate(${actor.rotation || 0})`}
                    >
                      {/* Direction Pointer */}
                      <polygon points="14,0 0,-7 3,0 0,7" fill="#059669" />
                      {/* Head */}
                      <circle cx="0" cy="0" r="12" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                      <g transform={`rotate(${-(actor.rotation || 0)})`}>
                        <text x="0" y="4" textAnchor="middle" fontSize="11" fontWeight="black" fill="#ffffff">
                          {actor.characterLetter}
                        </text>
                        <text x="0" y="-16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#0f172a">
                          {actor.name}
                        </text>
                      </g>
                    </g>
                  ))}
                </svg>
              </div>

              {/* Blueprint Legend Bar */}
              <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                <div className="p-2.5 bg-slate-50 border border-slate-300 rounded-lg">
                  <span className="font-bold uppercase text-[10px] text-slate-500 block mb-1">
                    Cameras In Scene ({cameras.length})
                  </span>
                  <div className="space-y-0.5 font-mono text-[11px]">
                    {cameras.map((c) => (
                      <div key={c.id} className="flex justify-between">
                        <strong>Cam {c.cameraLabel}: {c.name}</strong>
                        <span>{c.focalLength}mm ({c.aspectRatio})</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-300 rounded-lg">
                  <span className="font-bold uppercase text-[10px] text-slate-500 block mb-1">
                    Actors & Blocking ({actors.length})
                  </span>
                  <div className="space-y-0.5 text-[11px]">
                    {actors.map((a) => (
                      <div key={a.id} className="flex justify-between">
                        <strong>[{a.characterLetter}] {a.name}</strong>
                        <span className="text-slate-500">{a.isStanding ? 'Standing' : 'Seated'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-300 rounded-lg">
                  <span className="font-bold uppercase text-[10px] text-slate-500 block mb-1">
                    Lighting Inventory ({lights.length})
                  </span>
                  <div className="space-y-0.5 text-[11px]">
                    {lights.map((l) => (
                      <div key={l.id} className="flex justify-between font-mono">
                        <strong>{l.name}</strong>
                        <span>{l.colorTemp > 0 ? `${l.colorTemp}K` : 'RGB'} ({l.intensity}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION B: COVERAGE SHOT LIST BREAKDOWN TABLE                              */}
          {/* ========================================================================= */}
          {(exportSection === 'shotlist' || exportSection === 'combined') && (
            <div>
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
                          <td className="p-2.5 font-mono font-black text-slate-900 text-sm">
                            {shot.shotNumber}
                          </td>
                          <td className="p-2.5 font-bold">
                            {linkedCam ? `Cam ${linkedCam.cameraLabel}` : '—'}
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
                            {shot.movement}
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
        </div>
      </div>
    </div>
  );
};
