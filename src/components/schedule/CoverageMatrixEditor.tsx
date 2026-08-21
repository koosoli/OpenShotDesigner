import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  emptyCoverageMatrix,
  removeCoverageColumn,
  setCoverageCell,
  type CoverageMatrix,
} from '../../domain/scheduling';

/**
 * Multi-camera coverage matrix editor (plan §15.3): rows are run-of-show cues,
 * columns are cameras; each cell plans that camera's responsibility.
 */
export const CoverageMatrixEditor: React.FC = () => {
  const { project, updateProjectMeta, activeSetup, theme } = useFloorPlan();
  const isLight = theme === 'light';
  const [open, setOpen] = useState(false);
  const [newCamera, setNewCamera] = useState('');

  const matrix: CoverageMatrix = project.coverageMatrix ?? emptyCoverageMatrix();
  const cues = project.runOfShowCues ?? [];
  const cameraLabels = [
    ...new Set([
      ...matrix.cameraIds,
      ...activeSetup.elements
        .filter((el) => el.type === 'camera')
        .map((el) => (el as { cameraLabel?: string }).cameraLabel || el.name)
        .filter(Boolean),
    ]),
  ];

  const update = (next: CoverageMatrix) => updateProjectMeta({ coverageMatrix: next });

  const addCamera = () => {
    const id = newCamera.trim();
    if (!id || cameraLabels.includes(id)) return;
    update(setCoverageCell(matrix, '__register__', id, ''));
    setNewCamera('');
  };

  const rowKeyFor = (cueId: string) => cueId;

  const inputClass = `rounded border px-1.5 py-1 text-[11px] ${
    isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950'
  }`;

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 w-full px-2 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ${
          isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'
        }`}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Camera coverage
      </button>

      {open && (
        <div className="mt-2 overflow-x-auto">
          {cues.length === 0 ? (
            <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Add run-of-show cues first — rows follow the cue list.
            </p>
          ) : (
            <table className="text-[11px] border-collapse min-w-full">
              <thead>
                <tr>
                  <th className={`px-2 py-1 text-left ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Cue</th>
                  {cameraLabels.map((cam) => (
                    <th key={cam} className="px-1.5 py-1">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        {cam}
                        {matrix.cameraIds.includes(cam) && (
                          <button
                            onClick={() => update(removeCoverageColumn(matrix, cam))}
                            title={`Remove column ${cam}`}
                            className="p-0.5 rounded hover:bg-red-500/20 text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cues.map((cue) => {
                  const rowKey = rowKeyFor(cue.id);
                  return (
                    <tr key={cue.id}>
                      <td className={`px-2 py-1 whitespace-nowrap font-medium ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                        {cue.label}
                      </td>
                      {cameraLabels.map((cam) => (
                        <td key={cam} className="px-0.5 py-0.5">
                          <input
                            value={matrix.cells[rowKey]?.[cam] ?? ''}
                            onChange={(event) =>
                              update(setCoverageCell(matrix, rowKey, cam, event.target.value))
                            }
                            placeholder="—"
                            className={`${inputClass} w-24`}
                            aria-label={`${cue.label} — ${cam}`}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="flex items-center gap-1.5 mt-2">
            <input
              value={newCamera}
              onChange={(event) => setNewCamera(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && addCamera()}
              placeholder="Camera name/label"
              className={`${inputClass} w-36`}
            />
            <button
              onClick={addCamera}
              className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Column
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
