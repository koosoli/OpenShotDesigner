import { useId, useMemo, useRef, useState } from 'react';
import { Box, Download, RotateCcw, X } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
import { buildConstructCadMacro } from '../../domain/plan/constructCadExport';
import { downloadText, safeFileName } from '../../utils/download';
import { PREVIEW_DIMENSIONS_MM } from '../../domain/plan/planArchitecture';
import { buildWallPreview, projectWallPreview } from '../../domain/plan/wallPreview';

const INITIAL_ANGLE = 35;

export function PlanPreviewButton() {
  const { activeSetup } = useFloorPlan();
  const { theme } = useWorkspaceUI();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [angle, setAngle] = useState(INITIAL_ANGLE);
  const isLight = theme === 'light';
  const solids = useMemo(() => open && activeSetup
    ? buildWallPreview(activeSetup.elements, activeSetup.layers, activeSetup.gridSettings)
    : [], [open, activeSetup]);
  const preview = useMemo(() => projectWallPreview(solids, angle), [solids, angle]);
  const cadExport = useMemo(() => open && activeSetup
    ? buildConstructCadMacro(activeSetup.name, activeSetup.elements, activeSetup.layers, activeSetup.gridSettings)
    : null, [open, activeSetup]);
  const { wallHeight, doorHeight, windowSill, windowHead } = PREVIEW_DIMENSIONS_MM;

  return (
    <>
      <button
        type="button"
        aria-label="Open 3D floor plan preview"
        title="3D floor plan preview"
        onClick={() => {
          dialogRef.current?.showModal();
          setOpen(true);
        }}
        className={`h-8 inline-flex items-center justify-center gap-1.5 px-2 rounded-md border text-xs font-semibold ${isLight
          ? 'border-slate-300 bg-white text-sky-800 hover:bg-sky-50'
          : 'border-slate-700 bg-slate-800 text-sky-300 hover:bg-slate-700'}`}
      >
        <Box className="size-3.5" aria-hidden="true" />
        3D
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        className={`m-auto w-[min(94vw,60rem)] max-h-[90dvh] overflow-auto rounded-2xl border shadow-2xl backdrop:bg-slate-950/65 ${isLight
          ? 'border-slate-200 bg-white text-slate-900'
          : 'border-slate-700 bg-slate-900 text-slate-100'}`}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <h2 id={titleId} className="font-semibold">3D floor plan preview</h2>
            <p className="text-xs opacity-70">{activeSetup?.name}</p>
          </div>
          <button
            type="button"
            aria-label="Close 3D floor plan preview"
            onClick={() => dialogRef.current?.close()}
            className="grid size-10 place-items-center rounded-lg hover:bg-slate-500/20"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className={`grid h-[min(55dvh,34rem)] min-h-44 place-items-center ${isLight ? 'bg-slate-100' : 'bg-slate-950'}`}>
          {preview ? (
            <svg
              role="img"
              aria-label="Three-dimensional view of walls and openings"
              viewBox={preview.viewBox}
              className="h-full w-full min-h-0"
            >
              {preview.faces.map(({ key, points, color, shade }) => (
                <g key={key}>
                  <polygon points={points} fill={color} />
                  <polygon points={points} fill="black" fillOpacity={shade} />
                </g>
              ))}
            </svg>
          ) : (
            <p className="px-4 text-center text-sm opacity-75">Draw visible walls and set a valid plan scale to preview them here.</p>
          )}
        </div>
        <footer className="space-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <label className="flex min-w-44 flex-1 items-center gap-2 text-sm">
              Rotate
              <input
                type="range"
                min={0}
                max={360}
                value={angle}
                onChange={(event) => setAngle(event.currentTarget.valueAsNumber)}
                disabled={!preview}
                className="h-8 min-w-0 flex-1 accent-sky-500"
              />
              <span aria-hidden="true" className="w-9 tabular-nums">{angle}°</span>
            </label>
            <button
              type="button"
              onClick={() => setAngle(INITIAL_ANGLE)}
              disabled={!preview}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-slate-500/20 disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" /> Reset
            </button>
          </div>
          {cadExport && activeSetup && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-500/20 pt-2">
              <button
                type="button"
                onClick={() => downloadText(cadExport.text, `${safeFileName(activeSetup.name, 'floor-plan')}.ccmacro`, {
                  bom: false,
                })}
                className="inline-flex min-h-9 items-center gap-2 rounded-md px-2 text-sm font-medium hover:bg-slate-500/20"
              >
                <Download className="size-4" aria-hidden="true" /> Export for ConstructCAD
              </button>
              {cadExport.skippedOpenings > 0 && (
                <span className="text-xs opacity-75">{cadExport.skippedOpenings} openings omitted because their host was missing, ambiguous, or had insufficient end clearance.</span>
              )}
            </div>
          )}
          <p className="text-xs opacity-75">
            Preview assumes {wallHeight} mm walls, {doorHeight} mm doors and windows from {windowSill} to {windowHead} mm above the floor.
          </p>
        </footer>
      </dialog>
    </>
  );
}
