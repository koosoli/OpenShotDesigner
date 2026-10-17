import React, { useMemo, useRef } from 'react';
import { ImagePlus, Plus, Trash2, Tv, Video } from 'lucide-react';
import type { AVScriptRow, Shot, ShotSize } from '../../types';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { avCoverage, avRowNumber, rowsForMissingShots } from '../../domain/script';
import { createId } from '../../domain/ids';
import { loadStoryboardImageFile } from '../../utils/image';
import { keyFrameFit, keyFrameImage } from '../../utils/storyboardFrames';
import { ProjectImage } from '../common/ProjectImage';
import { useDialogs } from '../dialog/DialogProvider';

export const SHOT_SIZES: ShotSize[] = ['WS', 'FS', 'MWS', 'MS', 'MCU', 'CU', 'ECU', 'OTS', 'POV', 'Insert'];

/**
 * Board art for one AV row: its own uploaded frame when present, otherwise the
 * linked floor-plan shot's storyboard (so syncing a camera and boarding it in
 * the viewfinder shows up here automatically).
 */
const AVStoryboardCell: React.FC<{
  row: AVScriptRow;
  linkedShot?: Shot;
  isLight: boolean;
  onChange: (updates: Partial<AVScriptRow>) => void;
}> = ({ row, linkedShot, isLight: _isLight, onChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { notice } = useDialogs();
  const inherited = !row.storyboardImage && linkedShot ? keyFrameImage(linkedShot) : undefined;
  const image = row.storyboardImage ?? inherited;
  const fit = row.storyboardFit ?? (linkedShot ? keyFrameFit(linkedShot) : 'cover');

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          loadStoryboardImageFile(file)
            .then((dataUrl) => onChange({ storyboardImage: dataUrl, storyboardFit: 'cover' }))
            .catch(() => { void notice({ title: 'Image unreadable', message: 'That image could not be read.' }); });
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        title={image ? 'Replace this row’s board frame' : 'Attach a board frame to this AV row'}
        className={`relative w-24 aspect-video rounded-md border overflow-hidden flex items-center justify-center transition-colors ${
          'border-line-strong bg-surface-sunken hover:border-violet-400 dark:hover:border-violet-500'
        }`}
      >
        {image ? (
          <>
            <ProjectImage imageRef={image} alt={`Board for shot ${row.shotNumber}`} className="absolute inset-0 w-full h-full" style={{ objectFit: fit }} />
            {inherited && (
              <span className="absolute bottom-0 inset-x-0 bg-black/65 text-[10px] font-bold uppercase tracking-wider text-sky-300 py-px">
                From shot
              </span>
            )}
          </>
        ) : (
          <ImagePlus className="w-4 h-4 opacity-40" />
        )}
      </button>
      {row.storyboardImage && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onChange({ storyboardFit: fit === 'cover' ? 'contain' : 'cover' })}
            className="text-[10px] px-1 rounded border border-slate-600 text-slate-400 hover:text-slate-200"
            title="Toggle crop / fit"
          >
            {fit}
          </button>
          <button
            onClick={() => onChange({ storyboardImage: undefined, storyboardFit: undefined })}
            className="text-[10px] px-1 rounded border border-rose-500/40 text-rose-400"
            title="Remove this row's board frame"
          >
            clear
          </button>
        </div>
      )}

    </div>
  );
};

/**
 * The two-column A/V script: video and audio per row, each row optionally
 * linked to a floor-plan shot, with coverage warnings both ways (shots with
 * no row, rows whose shot is gone). Extracted from `ScriptPanel`.
 */
export const AVScriptView: React.FC<{ isLight: boolean }> = ({ isLight }) => {
  const {
    avScriptRows,
    setAVScriptRows,
    addAVScriptRow,
    updateAVScriptRow,
    deleteAVScriptRow,
    syncAVRowToShot,
    allShots,
    selectShot,
    selectedShotId,
  } = useFloorPlan();

  const avCoverageReport = useMemo(
    () => avCoverage(avScriptRows || [], allShots),
    [avScriptRows, allShots],
  );

  /** The missing direction: a row for every shot that has none. */
  const addRowsForMissingShots = () => {
    const additions = rowsForMissingShots(
      avCoverageReport.missingShots,
      () => createId('av'),
      (shot) => {
        const full = allShots.find((candidate) => candidate.id === shot.id);
        return full?.framingDescription || [full?.shotSize, full?.movement].filter(Boolean).join(' · ');
      },
    );
    if (additions.length === 0) return;
    setAVScriptRows([...(avScriptRows || []), ...additions]);
  };

  return (
    <div className={`flex-1 overflow-auto custom-scrollbar p-3 sm:p-4 bg-surface-sunken`}>
      <div className="max-w-6xl mx-auto space-y-3">
        <div className={`p-3 rounded-xl border flex items-center justify-between flex-wrap gap-2 ${
          'bg-surface border-line-strong'
        }`}>
          <div className="flex items-center gap-2.5">
            <Tv className="w-5 h-5 text-violet-400 flex-shrink-0" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider">Audio-Visual (AV) 2-Column Script</h3>
              <p className="text-[11px] text-slate-400">
                Discrete shot-by-shot script for commercials, corporate videos, and multi-cam shoots. Every row syncs directly with floor plan cameras.
              </p>
            </div>
          </div>
          <button
            onClick={() => addAVScriptRow()}
            className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center gap-1 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Add AV Shot
          </button>
        </div>

        <div className={`rounded-xl border shadow-sm overflow-hidden ${
          'bg-surface border-line-strong'
        }`}>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={`border-b text-[10px] font-bold uppercase tracking-wider ${
                'bg-slate-100 dark:bg-slate-950/80 text-ink-muted border-line-strong'
              }`}>
                <th className="py-2.5 px-3 w-14 text-center">#</th>
                <th className="py-2.5 px-2 w-28 text-center">Board</th>
                <th className="py-2.5 px-3 w-48">Shot Name / Size</th>
                <th className="py-2.5 px-3 w-1/2">VIDEO (Visuals, Camera & Lighting)</th>
                <th className="py-2.5 px-3 w-1/2">AUDIO (VO, Dialogue & SFX)</th>
                <th className="py-2.5 px-2 w-16 text-center">Time</th>
                <th className="py-2.5 px-3 w-32 text-center">Shot Sync</th>
                <th className="py-2.5 px-2 w-12 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-xs">
              {avScriptRows.map((row) => (
                <tr
                  key={row.id}
                  className={`group transition-colors ${
                    row.linkedShotId === selectedShotId
                      ? 'bg-violet-950/40 ring-1 ring-violet-500/30'
                      : 'hover:bg-slate-800/30'
                  }`}
                >
                  <td className="py-2 px-2 text-center font-mono font-bold text-slate-400">
                    {/* A linked row shows its SHOT's number and cannot drift
                        from it. Editing numbers belongs to the shot list,
                        which is also what renumbers them; a stored copy here
                        is how "shot 2" came to mean nothing to "shot 1/2". */}
                    {row.linkedShotId ? (
                      <span
                        className="block w-full text-center text-emerald-300"
                        title="From the linked shot — renumber in the shot list"
                      >
                        {avRowNumber(row, allShots)}
                      </span>
                    ) : (
                      <input
                        value={row.shotNumber}
                        onChange={(e) => updateAVScriptRow(row.id, { shotNumber: e.target.value })}
                        aria-label="Row number"
                        className="w-10 text-center bg-transparent border border-transparent hover:border-slate-700 focus:border-violet-500 rounded outline-none"
                      />
                    )}
                  </td>

                  <td className="py-2 px-2">
                    <AVStoryboardCell
                      row={row}
                      linkedShot={row.linkedShotId ? allShots.find((shot) => shot.id === row.linkedShotId) : undefined}
                      isLight={isLight}
                      onChange={(updates) => updateAVScriptRow(row.id, updates)}
                    />
                  </td>

                  <td className="py-2 px-3 space-y-1">
                    <input
                      value={row.shotName || ''}
                      onChange={(e) => updateAVScriptRow(row.id, { shotName: e.target.value })}
                      placeholder="e.g. Master Wide"
                      className="w-full bg-transparent font-semibold text-slate-100 border border-transparent hover:border-slate-700 focus:border-violet-500 rounded px-1 py-0.5 outline-none"
                    />
                    <select
                      value={row.shotSize || 'MS'}
                      onChange={(e) => updateAVScriptRow(row.id, { shotSize: e.target.value as ShotSize })}
                      className="text-[10px] rounded border border-slate-700 bg-slate-950 text-amber-400 px-1 py-0.5 outline-none"
                    >
                      {SHOT_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="py-2 px-3">
                    <textarea
                      value={row.video}
                      onChange={(e) => updateAVScriptRow(row.id, { video: e.target.value })}
                      rows={3}
                      placeholder="Describe visual action, camera move, framing..."
                      className="w-full rounded border border-slate-800/80 bg-slate-950/60 focus:bg-slate-950 focus:border-violet-500 p-1.5 text-xs text-slate-200 outline-none leading-relaxed custom-scrollbar resize-y"
                    />
                  </td>

                  <td className="py-2 px-3">
                    <textarea
                      value={row.audio}
                      onChange={(e) => updateAVScriptRow(row.id, { audio: e.target.value })}
                      rows={3}
                      placeholder="VOICE, Dialogue, (delivery), SFX, Music BGM..."
                      className="w-full rounded border border-slate-800/80 bg-slate-950/60 focus:bg-slate-950 focus:border-violet-500 p-1.5 text-xs text-sky-200 outline-none leading-relaxed custom-scrollbar resize-y font-mono"
                    />
                  </td>

                  <td className="py-2 px-2 text-center">
                    <div className="flex items-center justify-center gap-0.5 font-mono text-xs">
                      <input
                        type="number"
                        min={1}
                        max={600}
                        value={row.durationSec || ''}
                        onChange={(e) => updateAVScriptRow(row.id, { durationSec: parseInt(e.target.value) || undefined })}
                        placeholder="5"
                        className="w-10 text-center bg-transparent border border-slate-700 rounded px-0.5 py-0.5 outline-none"
                      />
                      <span className="text-[10px] text-slate-500">s</span>
                    </div>
                  </td>

                  <td className="py-2 px-3 text-center">
                    {row.linkedShotId ? (
                      <div className="flex items-center justify-center gap-1">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                          Linked
                        </span>
                        <button
                          onClick={() => selectShot(row.linkedShotId!)}
                          className="text-[10px] text-violet-400 hover:underline"
                          title="Select linked camera on floor plan"
                        >
                          View
                        </button>
                      </div>
                    ) : row.noShot ? (
                      <button
                        onClick={() => updateAVScriptRow(row.id, { noShot: undefined })}
                        className="px-2 py-0.5 rounded-full border border-slate-600 text-slate-400 text-[10px] font-bold mx-auto block"
                        title="Marked as needing no camera — titles, graphics, stock. Click to treat it as a shot again."
                      >
                        No camera
                      </button>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5">
                        <button
                          onClick={() => syncAVRowToShot(row.id)}
                          className="px-2.5 py-1 rounded bg-sky-600/80 hover:bg-sky-500 text-white text-[10px] font-semibold flex items-center gap-1 shadow-sm"
                          title="Create camera element on floor plan and link to this AV shot"
                        >
                          <Video className="w-3 h-3" /> Sync Cam
                        </button>
                        {/* Titles, graphics and stock are real AV rows that
                            will never be a camera; saying so once stops the
                            coverage line asking for ever. */}
                        <button
                          onClick={() => updateAVScriptRow(row.id, { noShot: true })}
                          className="text-[10px] text-slate-500 hover:text-slate-300 underline"
                          title="Titles, graphics, stock footage — this row needs no camera"
                        >
                          needs no camera
                        </button>
                      </div>
                    )}
                  </td>

                  <td className="py-2 px-2 text-center">
                    <button
                      onClick={() => deleteAVScriptRow(row.id)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 opacity-60 hover:opacity-100"
                      title="Delete AV row"
                      aria-label="Delete AV row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={`p-2.5 border-t flex items-center justify-between ${
            'bg-surface-sunken border-line'
          }`}>
            <button
              onClick={() => addAVScriptRow()}
              className="px-3 py-1 rounded-lg bg-violet-600/80 hover:bg-accent text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Next Shot
            </button>
            <span className="text-[11px] text-slate-500 font-mono">
              {avScriptRows.length} total shots · {avScriptRows.reduce((acc, r) => acc + (r.durationSec || 0), 0)}s est. runtime
              {/* The AV script and the shot list describe the same shoot;
                  this says where they disagree, and fills the gap in one
                  press. Rows marked "needs no camera" are never counted. */}
              {avCoverageReport.missingShots.length > 0 && (
                <>
                  {' · '}
                  <button
                    onClick={addRowsForMissingShots}
                    className="text-amber-400 hover:text-amber-300 underline font-semibold"
                    title={avCoverageReport.missingShots.map((shot) => `${shot.shotNumber} ${shot.name ?? ''}`.trim()).join(', ')}
                  >
                    {avCoverageReport.missingShots.length} shot{avCoverageReport.missingShots.length === 1 ? '' : 's'} not in the AV script — add {avCoverageReport.missingShots.length === 1 ? 'it' : 'them'}
                  </button>
                </>
              )}
              {avCoverageReport.danglingRows.length > 0 && (
                <span className="text-slate-500">
                  {' · '}{avCoverageReport.danglingRows.length} row{avCoverageReport.danglingRows.length === 1 ? '' : 's'} whose shot was deleted
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
