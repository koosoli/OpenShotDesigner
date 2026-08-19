import React, { useEffect, useRef, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  ActorElement,
  ArrowElement,
  BackgroundImage,
  CameraElement,
  DoorElement,
  FloorPlanElement,
  LightElement,
  MeasurementElement,
  PropElement,
  TextElement,
  TrackElement,
  WallElement,
  WindowElement,
} from '../../types';
import { getCameraFovPolygon, getLightBeamPolygon, getSmoothSplinePath, kelvinToRgb } from '../../utils/geometry';
import { ASPECT_RATIOS } from '../../constants/presets';
import { exportProjectToCsv, exportShotListToCsv } from '../../utils/exportShotList';
import { exportSvgAsPng } from '../../utils/exportFloorPlanPng';
import { FlagFixtureIcon, flagLabel, isFlagFixture } from '../canvas/FlagFixtureIcon';
import { FixtureGlyph } from '../canvas/FixtureGlyph';
import { ArrowGlyph } from '../canvas/ArrowGlyph';
import { LinedScriptPage, linedExcerpt } from '../script/LinedScriptPage';
import { orderedStoryboardShots } from '../../utils/storyboardOrder';
import {
  AppWindow,
  ArrowRight,
  Camera,
  DoorClosed,
  Download,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
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
  const {
    project,
    activeSetup,
    isExportModalOpen,
    closeExportModal,
    exportSection,
    setExportSection,
    scriptLines,
    allScriptMarks,
    allShots,
  } = useFloorPlan();
  const [pngScale, setPngScale] = useState<2 | 3>(2);
  const [showStoryboards, setShowStoryboards] = useState(false);
  // A lined script prints the covered material by default; the full screenplay
  // is one click away.
  const [scriptScope, setScriptScope] = useState<'lined' | 'full'>('lined');

  // When the export opens, default the storyboard toggle ON if any shot has a
  // storyboard attached (still fully toggleable off/on by the user).
  useEffect(() => {
    if (isExportModalOpen) {
      setShowStoryboards(activeSetup.shots.some((s) => !!s.storyboardImage));
    }
  }, [isExportModalOpen, activeSetup]);
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
  const measurements = activeSetup.elements.filter((e) => e.type === 'measurement') as MeasurementElement[];
  const texts = activeSetup.elements.filter((e) => e.type === 'text') as TextElement[];
  const arrows = activeSetup.elements.filter((e) => e.type === 'arrow') as ArrowElement[];
  const backgroundImages = (activeSetup.backgroundImages || []).filter((i) => i.visible) as BackgroundImage[];
  const sceneAspectRatio =
    ASPECT_RATIOS.find((a) => a.value === (activeSetup.aspectRatio || '16:9'))?.ratio || 16 / 9;

  // Default export scope: only the screenplay the user actually lined.
  const printedScriptLines =
    scriptScope === 'full' ? scriptLines : linedExcerpt(scriptLines, allScriptMarks);

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
  for (const img of backgroundImages) {
    minX = Math.min(minX, img.x - 20);
    minY = Math.min(minY, img.y - 20);
    maxX = Math.max(maxX, img.x + img.width + 20);
    maxY = Math.max(maxY, img.y + img.height + 20);
  }
  if (showStoryboards) {
    for (const shot of activeSetup.shots) {
      if (!shot.storyboardImage) continue;
      const cam = cameras.find((c) => c.id === shot.cameraId);
      if (!cam) continue;
      const pos = shot.storyboardCanvasPosition || { x: cam.x + 110, y: cam.y - 60 };
      minX = Math.min(minX, pos.x - 60);
      minY = Math.min(minY, pos.y - 60);
      maxX = Math.max(maxX, pos.x + 60);
      maxY = Math.max(maxY, pos.y + 60);
    }
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
                onClick={() => setExportSection('storyboard')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  exportSection === 'storyboard'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Storyboard
              </button>
              <button
                onClick={() => setExportSection('linedscript')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  exportSection === 'linedscript'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Lined Script
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
                        logo: project.logo,
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

            {(exportSection === 'shotlist' || exportSection === 'combined') && (
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

            {/* Storyboards toggle: controls thumbnails on the blueprint AND in the shot list */}
            <button
              onClick={() => setShowStoryboards((prev) => !prev)}
              title={showStoryboards ? 'Hide storyboard thumbnails' : 'Show storyboard thumbnails on the floor plan and in the shot list'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
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
            <div className="flex justify-between items-start gap-4">
              <div className="flex items-start gap-3 min-w-0">
                {project.logo && (
                  <img
                    src={project.logo}
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
                        href={img.url}
                        x={0}
                        y={0}
                        width={img.width}
                        height={img.height}
                        opacity={Math.max(0.12, Math.min(1, img.opacity || 0.5))}
                        preserveAspectRatio="none"
                      />
                      {img.name && (
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

                  {/* 3.5 Draw Dolly Tracks */}
                  {tracks.map((track) => {
                    const x1 = track.x;
                    const y1 = track.y;
                    const x2 = track.x2 ?? track.x + 240;
                    const y2 = track.y2 ?? track.y;
                    const dist = Math.max(20, Math.hypot(x2 - x1, y2 - y1));
                    const angle = Math.atan2(y2 - y1, x2 - x1);
                    const isCurved = !!track.isCurved;
                    const curveOffset = track.curveOffset || 60;

                    if (isCurved) {
                      const midX = (x1 + x2) / 2;
                      const midY = (y1 + y2) / 2;
                      const normalX = -(y2 - y1) / dist;
                      const normalY = (x2 - x1) / dist;
                      const ctrlX = midX + normalX * curveOffset;
                      const ctrlY = midY + normalY * curveOffset;
                      const steps = Math.max(4, Math.floor(dist / 30));
                      const pts: { x: number; y: number; nx: number; ny: number }[] = [];
                      for (let i = 0; i <= steps; i++) {
                        const t = i / steps;
                        const px = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * ctrlX + t * t * x2;
                        const py = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * ctrlY + t * t * y2;
                        const tx = 2 * (1 - t) * (ctrlX - x1) + 2 * t * (x2 - ctrlX);
                        const ty = 2 * (1 - t) * (ctrlY - y1) + 2 * t * (y2 - ctrlY);
                        const tLen = Math.hypot(tx, ty) || 1;
                        pts.push({ x: px, y: py, nx: -ty / tLen, ny: tx / tLen });
                      }
                      const inner = pts
                        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x - p.nx * 12).toFixed(1)} ${(p.y - p.ny * 12).toFixed(1)}`)
                        .join(' ');
                      const outer = pts
                        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x + p.nx * 12).toFixed(1)} ${(p.y + p.ny * 12).toFixed(1)}`)
                        .join(' ');
                      return (
                        <g key={track.id}>
                          <path d={inner} fill="none" stroke="#475569" strokeWidth={3} strokeLinecap="round" />
                          <path d={outer} fill="none" stroke="#475569" strokeWidth={3} strokeLinecap="round" />
                          {pts.map((p, i) => (
                            <line
                              key={i}
                              x1={p.x - p.nx * 16}
                              y1={p.y - p.ny * 16}
                              x2={p.x + p.nx * 16}
                              y2={p.y + p.ny * 16}
                              stroke="#334155"
                              strokeWidth={2}
                            />
                          ))}
                        </g>
                      );
                    }

                    const sleeperCount = Math.max(2, Math.floor(dist / 25));
                    const cos = Math.cos(angle);
                    const sin = Math.sin(angle);
                    const px = -sin * 14;
                    const py = cos * 14;
                    return (
                      <g key={track.id}>
                        <line x1={x1 + px} y1={y1 + py} x2={x2 + px} y2={y2 + py} stroke="#475569" strokeWidth={3} strokeLinecap="round" />
                        <line x1={x1 - px} y1={y1 - py} x2={x2 - px} y2={y2 - py} stroke="#475569" strokeWidth={3} strokeLinecap="round" />
                        {Array.from({ length: sleeperCount + 1 }).map((_, i) => {
                          const t = i / sleeperCount;
                          const sx = x1 + (x2 - x1) * t;
                          const sy = y1 + (y2 - y1) * t;
                          return (
                            <line key={i} x1={sx + px} y1={sy + py} x2={sx - px} y2={sy - py} stroke="#334155" strokeWidth={2} />
                          );
                        })}
                      </g>
                    );
                  })}

                  {/* 3.6 Draw Measurements */}
                  {measurements.map((m) => {
                    const x1 = m.x;
                    const y1 = m.y;
                    const x2 = m.x2 ?? m.x + 150;
                    const y2 = m.y2 ?? m.y;
                    const midX = (x1 + x2) / 2;
                    const midY = (y1 + y2) / 2;
                    const pixelsPerUnit = activeSetup.gridSettings?.pixelsPerUnit || 50;
                    const dist = Math.hypot(x2 - x1, y2 - y1);
                    const label = `${Math.round((dist / pixelsPerUnit) * 10) / 10} ${m.unit}`;
                    return (
                      <g key={m.id}>
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d97706" strokeWidth={2} strokeDasharray="6 3" />
                        <circle cx={x1} cy={y1} r={4} fill="#d97706" />
                        <circle cx={x2} cy={y2} r={4} fill="#d97706" />
                        <g transform={`translate(${midX}, ${midY - 12})`}>
                          <rect x={-34} y={-9} width={68} height={18} rx={3} fill="#0f172a" stroke="#d97706" strokeWidth={1} />
                          <text x={0} y={4} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#f59e0b" fontFamily="monospace">
                            {label}
                          </text>
                        </g>
                      </g>
                    );
                  })}

                  {/* 3.7 Draw Arrows */}
                  {arrows.map((a) => (
                    <g key={a.id}>
                      <ArrowGlyph
                        x1={a.x}
                        y1={a.y}
                        x2={a.x2 ?? a.x + 150}
                        y2={a.y2 ?? a.y}
                        color={a.color || '#f97316'}
                        strokeWidth={a.strokeWidth || 2.5}
                        headStyle={a.headStyle}
                        dashStyle={a.dashStyle}
                      />
                      {a.label && (
                        <g transform={`translate(${(a.x + (a.x2 ?? a.x + 150)) / 2}, ${(a.y + (a.y2 ?? a.y)) / 2 - 12})`}>
                          <rect x={-38} y={-9} width={76} height={18} rx={3} fill="#0f172a" stroke="#f97316" strokeWidth={1} />
                          <text x={0} y={4} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#fb923c" fontFamily="monospace">
                            {a.label}
                          </text>
                        </g>
                      )}
                    </g>
                  ))}

                  {/* 3.8 Draw Text Annotations */}
                  {texts.map((txt) => (
                    <g key={txt.id} transform={`translate(${txt.x}, ${txt.y})`}>
                      <text
                        x={0}
                        y={0}
                        textAnchor={txt.textAlign === 'left' ? 'start' : txt.textAlign === 'right' ? 'end' : 'middle'}
                        fontSize={txt.fontSize || 16}
                        fill={txt.color || '#94a3b8'}
                        fontFamily={txt.fontFamily || 'sans-serif'}
                        fontWeight={txt.fontWeight || 'normal'}
                        fontStyle={txt.fontStyle || 'normal'}
                        textDecoration={[txt.underline ? 'underline' : null, txt.strikethrough ? 'line-through' : null]
                          .filter(Boolean)
                          .join(' ') || undefined}
                      >
                        {txt.text}
                      </text>
                    </g>
                  ))}

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
                    const isFlag = isFlagFixture(l.fixtureType);
                    const lightColor = l.rgbColor || kelvinToRgb(l.colorTemp || 5600);
                    const beamAngle = l.beamAngle || 60;
                    const throwDist = l.throwDistance || 220;
                    const isOmni = l.fixtureType === 'practical' || beamAngle >= 350;
                    const showBeam = !isFlag && l.beamVisible !== false && beamAngle > 0 && !isOmni;
                    const beamPath = showBeam
                      ? getLightBeamPolygon({ x: l.x, y: l.y }, l.rotation || 0, beamAngle, throwDist)
                      : '';
                    return (
                      <g key={l.id}>
                        {showBeam && (
                          <path d={beamPath} fill="#fef3c7" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
                        )}
                        <g transform={`translate(${l.x}, ${l.y}) rotate(${l.rotation || 0})`}>
                          {isFlag ? (
                            <>
                              <FlagFixtureIcon light={l} />
                              <text x="0" y={-10} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0f172a" fontFamily="sans-serif">
                                {l.name}
                              </text>
                            </>
                          ) : (
                            <>
                              <FixtureGlyph fixtureType={l.fixtureType} color={lightColor} />
                              <text x="0" y={isOmni ? 24 : -18} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0f172a" fontFamily="sans-serif">
                                {l.name}
                              </text>
                            </>
                          )}
                        </g>
                      </g>
                    );
                  })}

                  {/* 5.5 Draw Waypoint Trajectories (camera moves & actor blocking) */}
                  {cameras.map((c) => {
                    const cWps = (c.path || []).filter((wp) => wp.x !== undefined && wp.y !== undefined);
                    if (cWps.length === 0) return null;
                    const pts = [{ x: c.x, y: c.y }, ...cWps.map((wp) => ({ x: wp.x, y: wp.y }))];
                    return (
                      <g key={`${c.id}-traj`}>
                        <path
                          d={getSmoothSplinePath(pts)}
                          fill="none"
                          stroke="#0284c7"
                          strokeWidth="2"
                          strokeDasharray="6 4"
                          strokeOpacity="0.6"
                        />
                        {pts.map((p, i) => (
                          <g key={i} transform={`translate(${p.x}, ${p.y})`}>
                            <circle cx={0} cy={0} r={i === 0 ? 5 : 4} fill={i === 0 ? '#0f172a' : '#ffffff'} stroke="#0284c7" strokeWidth={1.5} />
                            <text x={0} y={i === 0 ? -9 : 13} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#0284c7" fontFamily="sans-serif">
                              {i === 0 ? 'S' : `B${cWps[i - 1]?.beat ?? i + 1}`}
                            </text>
                          </g>
                        ))}
                      </g>
                    );
                  })}
                  {actors.map((a) => {
                    const aWps = (a.path || []).filter((wp) => wp.x !== undefined && wp.y !== undefined);
                    if (aWps.length === 0) return null;
                    const pts = [{ x: a.x, y: a.y }, ...aWps.map((wp) => ({ x: wp.x, y: wp.y }))];
                    return (
                      <g key={`${a.id}-traj`}>
                        <path
                          d={getSmoothSplinePath(pts)}
                          fill="none"
                          stroke="#059669"
                          strokeWidth="2"
                          strokeDasharray="6 4"
                          strokeOpacity="0.6"
                        />
                        {pts.map((p, i) => (
                          <g key={i} transform={`translate(${p.x}, ${p.y})`}>
                            <circle cx={0} cy={0} r={i === 0 ? 5 : 4} fill={i === 0 ? '#0f172a' : '#ffffff'} stroke="#059669" strokeWidth={1.5} />
                            <text x={0} y={i === 0 ? -9 : 13} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#059669" fontFamily="sans-serif">
                              {i === 0 ? 'S' : `B${aWps[i - 1]?.beat ?? i + 1}`}
                            </text>
                          </g>
                        ))}
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

                  {/* 8. Storyboard Thumbnails on the Blueprint (near their camera) */}
                  {showStoryboards &&
                    activeSetup.shots
                      .filter((s) => !!s.storyboardImage)
                      .map((shot) => {
                        const cam = cameras.find((c) => c.id === shot.cameraId);
                        if (!cam) return null;
                        const pos = shot.storyboardCanvasPosition || { x: cam.x + 110, y: cam.y - 60 };
                        const sbW = 56;
                        const sbH = sbW / sceneAspectRatio;
                        const sbClip = `print-sb-${shot.id}`;
                        const isCover = shot.storyboardFit !== 'contain';
                        return (
                          <g key={`${shot.id}-sb`}>
                            {/* Leader line from camera */}
                            <line
                              x1={cam.x}
                              y1={cam.y}
                              x2={pos.x}
                              y2={pos.y}
                              stroke="#a78bfa"
                              strokeWidth="1"
                              strokeDasharray="4 3"
                              opacity="0.7"
                            />
                            <defs>
                              <clipPath id={sbClip}>
                                <rect x={-sbW / 2} y={-sbH / 2} width={sbW} height={sbH} rx="3" />
                              </clipPath>
                            </defs>
                            <g transform={`translate(${pos.x}, ${pos.y})`}>
                              <rect
                                x={-sbW / 2}
                                y={-sbH / 2}
                                width={sbW}
                                height={sbH}
                                rx="3"
                                fill="#ffffff"
                                stroke="#7c3aed"
                                strokeWidth="1.5"
                              />
                              <image
                                href={shot.storyboardImage}
                                x={-sbW / 2}
                                y={-sbH / 2}
                                width={sbW}
                                height={sbH}
                                preserveAspectRatio={isCover ? 'xMidYMid slice' : 'xMidYMid meet'}
                                clipPath={`url(#${sbClip})`}
                              />
                              <text
                                x={0}
                                y={sbH / 2 + 11}
                                textAnchor="middle"
                                fontSize="9"
                                fontWeight="bold"
                                fill="#6d28d9"
                                fontFamily="sans-serif"
                              >
                                SB {shot.shotNumber}
                              </text>
                            </g>
                          </g>
                        );
                      })}
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
                        <span>
                          {isFlagFixture(l.fixtureType)
                            ? flagLabel(l)
                            : `${l.colorTemp > 0 ? `${l.colorTemp}K` : 'RGB'} (${l.intensity}%)`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
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
                  {activeSetup.shots.length} FRAME{activeSetup.shots.length === 1 ? '' : 'S'} ·{' '}
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
                    return (
                      <div
                        key={shot.id}
                        className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid"
                      >
                        <div
                          className="relative w-full bg-slate-100 border-b border-slate-300"
                          style={{ aspectRatio: String(sceneAspectRatio) }}
                        >
                          {shot.storyboardImage ? (
                            <img
                              src={shot.storyboardImage}
                              alt=""
                              className="absolute inset-0 w-full h-full"
                              style={{ objectFit: shot.storyboardFit || 'cover' }}
                            />
                          ) : (
                            // Shots without artwork still print their frame, so
                            // the board can be drawn in by hand on set.
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-400">
                              (no storyboard)
                            </span>
                          )}
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-slate-900 text-white text-[10px] font-mono font-bold">
                            {shot.shotNumber}
                            {cam ? ` · ${(cam.cameraLabel || 'A').toUpperCase()}` : ''}
                          </span>
                        </div>
                        <div className="p-1.5">
                          <p className="text-[11px] font-bold text-slate-900 leading-snug">{shot.name}</p>
                          {shot.framingDescription && (
                            <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
                              {shot.framingDescription}
                            </p>
                          )}
                          <p className="text-[9px] font-mono text-slate-500 mt-1">
                            {shot.shotSize} · {shot.lensMm}mm · {shot.movement}
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
          {/* SECTION L: LINED SHOOTING SCRIPT                                           */}
          {/* ========================================================================= */}
          {(exportSection === 'linedscript' || exportSection === 'combined') && (
            <div className="mb-8">
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
                      isLight
                      print
                    />
                  )}
                </div>
              )}
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
                              {shot.storyboardImage ? (
                                <div
                                  className="overflow-hidden rounded border border-slate-300 bg-slate-100"
                                  style={{ width: 64, aspectRatio: `${sceneAspectRatio} / 1` }}
                                >
                                  <img
                                    src={shot.storyboardImage}
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
