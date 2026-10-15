import React, { useMemo, useState } from 'react';
import { pageLabels } from '../../domain/script/pageLock';
import { RotateCcw } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { SCREENPLAY_ROWS, estimateScenePageEighths, parsePageEighths, screenplayLayoutOptions } from '../../domain/script';
import type { Character, ScriptScene } from '../../domain/script';
import { formatPageEighths } from '../../domain/reports';
import type { ScriptLine } from '../../types';

interface SceneListReportProps {
  lines: ScriptLine[];
  scenes: ScriptScene[];
  characters: Character[];
  isLight: boolean;
}

const INT_EXT_LABEL: Record<string, string> = { INT: 'INT', EXT: 'EXT', INT_EXT: 'I/E', OTHER: '—' };

/**
 * Every scene with its length in eighths. The figure is measured from the
 * script; type over it to set your own (a scene that plays longer than it
 * reads, a montage on a quarter page), and the reset arrow goes back to the
 * measurement.
 *
 * The summary is the scene's index card (imported from Final Draft or a
 * Fountain `=` line, or written here). It lives on the heading line and feeds
 * the one-liner, the stripboard and the breakdown sheets.
 */
export const SceneListReport: React.FC<SceneListReportProps> = ({ lines, scenes, characters, isLight: _isLight }) => {
  const { setScriptLines, project } = useFloorPlan();
  const layout = useMemo(() => screenplayLayoutOptions(project.screenplayLayout), [project.screenplayLayout]);
  const pageOf = useMemo(() => pageLabels(lines, project.scriptPageLock, layout).byLine, [lines, project.scriptPageLock, layout]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [summaryDrafts, setSummaryDrafts] = useState<Record<string, string>>({});

  // The measurement with every override ignored, so a reset shows what it returns to.
  const measured = useMemo(
    () => estimateScenePageEighths(lines.map((line) => ({ ...line, pageEighthsOverride: undefined })), layout),
    [lines, layout],
  );
  const overrideById = useMemo(
    () => new Map(lines.filter((line) => line.pageEighthsOverride !== undefined).map((line) => [line.id, line.pageEighthsOverride!] as const)),
    [lines],
  );

  const setOverride = (sceneId: string, eighths: number | undefined) => {
    setScriptLines(lines.map((line) => {
      if (line.id !== sceneId) return line;
      const next = { ...line };
      if (eighths === undefined) delete next.pageEighthsOverride;
      else next.pageEighthsOverride = eighths;
      return next;
    }));
  };

  const commitSummary = (sceneId: string) => {
    const raw = summaryDrafts[sceneId];
    setSummaryDrafts((prev) => {
      const next = { ...prev };
      delete next[sceneId];
      return next;
    });
    if (raw === undefined) return;
    const text = raw.replace(/\s+/g, ' ').trim();
    const heading = lines.find((line) => line.id === sceneId);
    if (!heading || (heading.synopsis ?? '') === text) return;
    setScriptLines(lines.map((line) => {
      if (line.id !== sceneId) return line;
      const next = { ...line };
      if (text) next.synopsis = text;
      else delete next.synopsis;
      return next;
    }));
  };

  const commit = (scene: ScriptScene) => {
    const raw = drafts[scene.id];
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[scene.id];
      return next;
    });
    if (raw === undefined) return;
    // Blank, or typing the measured figure back in, clears the override.
    if (raw.trim() === '') {
      setOverride(scene.id, undefined);
      return;
    }
    const parsed = parsePageEighths(raw);
    if (parsed === undefined || parsed === scene.pageLengthEighths) return;
    setOverride(scene.id, parsed === measured.get(scene.id) ? undefined : parsed);
  };

  const live = scenes.filter((scene) => !scene.omitted);
  const total = live.reduce((sum, scene) => sum + (scene.pageLengthEighths ?? 0), 0);
  const nameOf = (id: string) => characters.find((character) => character.id === id)?.canonicalName;
  const muted = 'text-ink-muted';
  const border = 'border-line';

  return (
    <div className={`rounded-2xl border p-4 border-line bg-surface shadow-sm`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="text-sm font-bold">Scene list · page count</h3>
          <p className={`text-[11px] ${muted}`}>
            Lengths are measured in eighths of a page on the printed screenplay ({layout.paper === 'a4' ? 'A4' : 'US Letter'}, {SCREENPLAY_ROWS[layout.paper]} Courier lines a page). Type a length (2 3/8, 3/8, 1.5) to override one.
          </p>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold font-mono">{formatPageEighths(total)}</div>
          <div className={`text-[10px] uppercase tracking-wider ${muted}`}>pages · {live.length} scenes</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className={`text-left text-[10px] uppercase tracking-wider ${muted}`}>
              <th className="px-2 py-1.5">Sc</th>
              <th className="px-2 py-1.5">I/E</th>
              <th className="px-2 py-1.5">Heading</th>
              <th className="px-2 py-1.5">Summary</th>
              <th className="px-2 py-1.5">D/N</th>
              <th className="px-2 py-1.5">Story day</th>
              <th className="px-2 py-1.5">Page</th>
              <th className="px-2 py-1.5 text-right">Pages</th>
              <th className="px-2 py-1.5">Cast</th>
            </tr>
          </thead>
          <tbody>
            {scenes.map((scene) => {
              const isOverridden = overrideById.has(scene.id);
              const value = drafts[scene.id] ?? formatPageEighths(scene.pageLengthEighths);
              const cast = scene.characterIds.map(nameOf).filter(Boolean).join(', ');
              return (
                <tr key={scene.id} className={`border-t ${border} ${scene.omitted ? 'opacity-50' : ''}`}>
                  <td className="px-2 py-1.5 font-mono font-bold text-violet-400">
                    <span className="inline-flex items-center gap-1">
                      {scene.color && (
                        <span
                          aria-hidden
                          title="Index card colour"
                          className="inline-block w-2 h-2 rounded-full border border-line-strong"
                          style={{ background: scene.color }}
                        />
                      )}
                      {scene.sceneNumber}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-mono">{INT_EXT_LABEL[scene.intExt ?? 'OTHER']}</td>
                  <td className={`px-2 py-1.5 ${scene.omitted ? 'line-through' : ''}`}>{scene.heading}</td>
                  <td className="px-2 py-1.5 min-w-[12rem]">
                    <input
                      value={summaryDrafts[scene.id] ?? scene.synopsis ?? ''}
                      onChange={(event) => setSummaryDrafts((prev) => ({ ...prev, [scene.id]: event.target.value }))}
                      onBlur={() => commitSummary(scene.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                        if (event.key === 'Escape') {
                          setSummaryDrafts((prev) => {
                            const next = { ...prev };
                            delete next[scene.id];
                            return next;
                          });
                        }
                      }}
                      placeholder="What happens…"
                      aria-label={`Summary of scene ${scene.sceneNumber}`}
                      className="w-full rounded border border-transparent hover:border-line-strong focus:border-line-strong bg-transparent focus:bg-field px-1.5 py-0.5"
                    />
                  </td>
                  <td className="px-2 py-1.5">{scene.timeOfDay ?? '—'}</td>
                  <td className="px-2 py-1.5">{scene.scriptDay ?? '—'}</td>
                  <td className="px-2 py-1.5 font-mono">{pageOf.get(scene.id) ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {scene.omitted ? (
                      <span className="font-mono">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        {isOverridden && (
                          <button
                            type="button"
                            onClick={() => setOverride(scene.id, undefined)}
                            title={`Back to the measured ${formatPageEighths(measured.get(scene.id))}`}
                            aria-label="Use measured page count"
                            className="text-violet-400 hover:text-violet-300"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                        <input
                          value={value}
                          onChange={(event) => setDrafts((prev) => ({ ...prev, [scene.id]: event.target.value }))}
                          onBlur={() => commit(scene)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                            if (event.key === 'Escape') {
                              setDrafts((prev) => {
                                const next = { ...prev };
                                delete next[scene.id];
                                return next;
                              });
                            }
                          }}
                          aria-label={`Page length of scene ${scene.sceneNumber}`}
                          title={isOverridden ? 'Set by hand' : 'Measured from the script'}
                          className={`w-16 text-right font-mono rounded border px-1.5 py-0.5 ${isOverridden ? 'border-violet-400 text-violet-400' : 'border-line-strong bg-field'}`}
                        />
                      </span>
                    )}
                  </td>
                  <td className={`px-2 py-1.5 ${muted}`}>{cast || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
