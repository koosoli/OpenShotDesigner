import React, { useMemo, useState } from 'react';
import { Clapperboard, Plus, Trash2, Users } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  addCustomCoverageRow,
  emptyCoverageMatrix,
  registerCoverageCamera,
  removeCoverageColumn,
  removeCoverageRow,
  renameCoverageRow,
  setCoverageCell,
  type CoverageMatrix,
} from '../../domain/scheduling';

/**
 * Multi-camera coverage matrix editor (plan §15.3): rows plan what each
 * camera is responsible for at every moment. Rows follow the run-of-show cue
 * list when one exists, and manual rows can be added freely — coverage works
 * without a screenplay or cue sheet (plan rule 1).
 */
export const CoverageMatrixEditor: React.FC = () => {
  const { project, updateProjectMeta, activeSetup, theme } = useFloorPlan();
  const isLight = theme === 'light';

  const [newCamera, setNewCamera] = useState('');
  const [newRowLabel, setNewRowLabel] = useState('');

  const matrix: CoverageMatrix = project.coverageMatrix ?? emptyCoverageMatrix();
  const cues = useMemo(() => project.runOfShowCues ?? [], [project.runOfShowCues]);

  /** Camera columns: registered columns plus labels found on the active scene. */
  const cameraLabels = useMemo(
    () => [
      ...new Set([
        ...matrix.cameraIds,
        ...activeSetup.elements
          .filter((el) => el.type === 'camera')
          .map((el) => (el as { cameraLabel?: string }).cameraLabel || el.name)
          .filter(Boolean),
      ]),
    ],
    [matrix.cameraIds, activeSetup.elements]
  );

  /**
   * Ordered rows: run-of-show cues first (in cue order), then manual rows in
   * their stored order. Stale keys (deleted cues) drop out automatically.
   */
  const rows = useMemo(() => {
    const cueById = new Map(cues.map((cue) => [cue.id, cue] as const));
    const cueRows = cues.map((cue) => ({ key: cue.id, label: cue.label, kind: 'cue' as const }));
    const manualRows = matrix.rowKeys
      .filter((key) => !cueById.has(key))
      .map((key) => ({
        key,
        label: matrix.rowLabels?.[key]?.trim() || 'Untitled row',
        kind: 'manual' as const,
      }));
    return [...cueRows, ...manualRows];
  }, [cues, matrix.rowKeys, matrix.rowLabels]);

  const update = (next: CoverageMatrix) => updateProjectMeta({ coverageMatrix: next });

  const addCamera = () => {
    const id = newCamera.trim();
    if (!id || cameraLabels.includes(id)) return;
    update(registerCoverageCamera(matrix, id));
    setNewCamera('');
  };

  const addRow = () => {
    const label = newRowLabel.trim();
    if (!label) return;
    const { matrix: next } = addCustomCoverageRow(matrix, label);
    update(next);
    setNewRowLabel('');
  };

  const cardClass = isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700';
  const mutedText = isLight ? 'text-slate-500' : 'text-slate-400';
  const headingText = isLight ? 'text-slate-700' : 'text-slate-300';
  const inputClass = `min-h-[36px] px-2 py-1 rounded-lg border text-xs w-full transition-colors ${
    isLight
      ? 'bg-white border-slate-300 text-slate-800 focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500'
      : 'bg-slate-950 border-slate-700 text-slate-100 focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500'
  }`;
  const cellInputClass = `w-full min-w-[96px] rounded border px-1.5 py-1 text-[11px] ${
    isLight ? 'border-slate-200 bg-white text-slate-800 focus:border-sky-500' : 'border-slate-700 bg-slate-950 text-slate-100 focus:border-sky-500'
  }`;
  const primaryBtnClass =
    'flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg text-xs font-semibold transition-colors flex-shrink-0 disabled:opacity-40 bg-sky-600 text-white hover:bg-sky-700';

  return (
    <div className={`h-full overflow-y-auto p-3 space-y-3 select-none ${isLight ? 'bg-white' : 'bg-slate-900'}`}>
      <div className={`flex items-center justify-between pb-2 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        <div>
          <h2 className={`text-sm font-bold flex items-center gap-1.5 ${headingText}`}>
            <Users className="w-4 h-4 text-sky-500" />
            Coverage Matrix
          </h2>
          <p className={`mt-0.5 text-[10px] ${mutedText}`}>
            Plan each camera's responsibility per moment — complementary to shot-by-shot lists.
          </p>
        </div>
        <span className="text-[10px] font-mono opacity-60">
          {cameraLabels.length} cams · {rows.length} rows
        </span>
      </div>

      {/* Camera columns */}
      <div className="flex items-end gap-1.5 flex-wrap">
        <label className="flex flex-col gap-1 w-44">
          <span className={`text-[10px] font-medium ${mutedText}`}>Camera name/label</span>
          <input
            value={newCamera}
            onChange={(event) => setNewCamera(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && addCamera()}
            placeholder="A, B, Drone, Jib…"
            aria-label="New camera column"
            className={inputClass}
          />
        </label>
        <button onClick={addCamera} disabled={!newCamera.trim()} className={primaryBtnClass}>
          <Plus className="w-3.5 h-3.5" /> Column
        </button>
        {activeSetup.elements.some((el) => el.type === 'camera') && (
          <p className={`text-[10px] max-w-[240px] leading-snug ${mutedText}`}>
            Cameras placed on the active scene are offered as columns automatically.
          </p>
        )}
      </div>

      {cameraLabels.length === 0 ? (
        <div className={`rounded-xl border-2 border-dashed p-6 text-center ${isLight ? 'border-slate-300 bg-slate-50' : 'border-slate-700 bg-slate-950/40'}`}>
          <Clapperboard className="w-8 h-8 mx-auto mb-2 opacity-40 text-sky-500" />
          <p className="text-xs font-bold">Add your first camera column above</p>
          <p className={`mt-1 text-[10px] ${mutedText}`}>Columns are cameras; rows are moments (cues or custom entries).</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto custom-scrollbar rounded-lg border">
            <table className="text-[11px] border-collapse min-w-full">
              <thead>
                <tr className={isLight ? 'bg-slate-100' : 'bg-slate-950'}>
                  <th className={`px-2 py-1.5 text-left sticky left-0 z-10 ${isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-950 text-slate-400'}`}>Moment</th>
                  {cameraLabels.map((cam) => (
                    <th key={cam} className="px-1.5 py-1 min-w-[120px]">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        {cam}
                        {matrix.cameraIds.includes(cam) && (
                          <button
                            onClick={() => update(removeCoverageColumn(matrix, cam))}
                            title={`Remove column ${cam}`}
                            aria-label={`Remove column ${cam}`}
                            className="p-0.5 rounded hover:bg-red-500/20 text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={cameraLabels.length + 1} className={`px-3 py-6 text-center ${mutedText}`}>
                      No rows yet — add run-of-show cues or create manual rows below.
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.key} className={`border-t ${isLight ? 'border-slate-100' : 'border-slate-800'}`}>
                    <td className={`px-2 py-1 whitespace-nowrap sticky left-0 z-10 ${isLight ? 'bg-white' : 'bg-slate-900'}`}>
                      {row.kind === 'manual' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <input
                            value={matrix.rowLabels?.[row.key] ?? ''}
                            onChange={(event) => update(renameCoverageRow(matrix, row.key, event.target.value))}
                            placeholder="Row name"
                            aria-label="Row name"
                            className={`${cellInputClass} !w-36`}
                          />
                          <button
                            onClick={() => update(removeCoverageRow(matrix, row.key))}
                            title="Remove row"
                            aria-label="Remove row"
                            className="p-1 rounded hover:bg-red-500/20 text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </span>
                      ) : (
                        <span className={`font-medium ${isLight ? 'text-slate-700' : 'text-slate-200'}`} title={row.label}>
                          <span className="mr-1.5 px-1 py-0.5 rounded text-[8px] uppercase font-black align-middle bg-sky-500/15 text-sky-600 dark:text-sky-300">cue</span>
                          {row.label}
                        </span>
                      )}
                    </td>
                    {cameraLabels.map((cam) => (
                      <td key={cam} className="px-0.5 py-0.5">
                        <input
                          value={matrix.cells[row.key]?.[cam] ?? ''}
                          onChange={(event) => update(setCoverageCell(matrix, row.key, cam, event.target.value))}
                          placeholder="—"
                          aria-label={`${row.label} — ${cam}`}
                          className={cellInputClass}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Manual rows work without run-of-show cues (rule 1). */}
          <div className="flex items-end gap-1.5 flex-wrap">
            <label className="flex flex-col gap-1 w-56">
              <span className={`text-[10px] font-medium ${mutedText}`}>New row (moment)</span>
              <input
                value={newRowLabel}
                onChange={(event) => setNewRowLabel(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && addRow()}
                placeholder="Soundcheck, Singer MCU, Halftime…"
                aria-label="New coverage row"
                className={inputClass}
              />
            </label>
            <button onClick={addRow} disabled={!newRowLabel.trim()} className={primaryBtnClass}>
              <Plus className="w-3.5 h-3.5" /> Row
            </button>
          </div>
          <p className={`text-[10px] ${mutedText}`}>
            Rows follow your run-of-show cues when present; manual rows are independent entries.
          </p>
        </>
      )}
    </div>
  );
};
