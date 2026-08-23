import React from 'react';
import { Film } from 'lucide-react';
import type { AVScriptRow } from '../../types';
import { avRowNumber } from '../../domain/script';
import type { AvLinkedShot } from '../../domain/script';

interface AvScriptPrintViewProps {
  rows: AVScriptRow[];
  /** The shot list, so a linked row prints the shot's number rather than a stale copy. */
  shots?: AvLinkedShot[];
}

/**
 * The AV (two-column) script as paper: video down one side, audio down the
 * other, with the shot number and running time in the margins. The classic
 * commercial, documentary and corporate format.
 *
 * Lives in its own module rather than inside the export studio because it is a
 * report like any other, and because it used to print only when the script
 * panel happened to be in AV mode — a screenplay-shaped condition on a document
 * that has nothing to do with a screenplay.
 */
export const AvScriptPrintView: React.FC<AvScriptPrintViewProps> = ({ rows, shots = [] }) => {
  const totalSeconds = rows.reduce((sum, row) => sum + (row.durationSec || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
          <Film className="w-4 h-4 text-violet-600" />
          <span>Audio-Visual (AV) 2-Column Script Sheet</span>
        </h3>
        <span className="font-mono text-xs font-bold text-slate-700">
          {rows.length} SHOT{rows.length === 1 ? '' : 'S'}
          {totalSeconds > 0 && ` · ${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-4">
          No AV script rows yet — add them in the Script panel’s AV Script tab.
        </p>
      ) : (
        <div className="border border-slate-900 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-900 text-slate-900 font-bold">
                <th className="p-2.5 font-mono w-16 text-center">SHOT #</th>
                <th className="p-2.5 w-44">NAME &amp; SIZE</th>
                <th className="p-2.5 w-1/2">VIDEO (VISUALS &amp; CAMERA)</th>
                <th className="p-2.5 w-1/2">AUDIO (VO, DIALOGUE, SFX, MUSIC)</th>
                <th className="p-2.5 font-mono w-16 text-center">TIME</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {rows.map((row) => (
                <tr key={row.id} className="break-inside-avoid">
                  <td className="p-2.5 font-mono font-black text-slate-900 text-center">{avRowNumber(row, shots)}</td>
                  <td className="p-2.5">
                    <div className="font-bold text-slate-900">{row.shotName || `Shot ${avRowNumber(row, shots)}`}</div>
                    {row.shotSize && !row.noShot && (
                      <span className="inline-block px-1.5 py-0.5 mt-0.5 rounded bg-slate-200 text-slate-800 text-[10px] font-bold">
                        {row.shotSize}
                      </span>
                    )}
                    {/* Titles, graphics and stock are real rows on the sheet;
                        the badge tells the unit there is nothing to shoot. */}
                    {row.noShot && (
                      <span className="inline-block px-1.5 py-0.5 mt-0.5 rounded border border-slate-400 text-slate-600 text-[10px] font-bold">
                        NO CAMERA
                      </span>
                    )}
                  </td>
                  <td className="p-2.5 text-slate-800 whitespace-pre-wrap leading-relaxed">{row.video}</td>
                  <td className="p-2.5 text-slate-800 whitespace-pre-wrap leading-relaxed font-mono text-[11px]">{row.audio}</td>
                  <td className="p-2.5 font-mono text-center text-slate-600">
                    {row.durationSec ? `${row.durationSec}s` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
