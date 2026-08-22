import React from 'react';
import type { Character, ScriptScene } from '../../domain/script';
import type { CharacterReport, DoodColumn, DoodRow, DoodWorkStatus } from '../../domain/reports';
import type { ScriptLocationBreakdown } from '../../domain/script/logic';

interface ScriptReportsPrintViewProps {
  productionTitle: string;
  scenes: ScriptScene[];
  characters: Character[];
  characterReports: CharacterReport[];
  locations: ScriptLocationBreakdown[];
  dood: { columns: DoodColumn[]; rows: DoodRow[] };
  sections: { scenes: boolean; characters: boolean; locations: boolean; dood: boolean };
  /** Production logo (data URL) shown top-right above the report sections. */
  logo?: string;
}

const DOOD_LABEL: Record<DoodWorkStatus, string> = { start: 'SW', work: 'W', finish: 'WF', hold: 'H', off: '' };

const INT_EXT_LABEL: Record<string, string> = { INT: 'INT', EXT: 'EXT', INT_EXT: 'I/E', OTHER: 'EST' };

/**
 * Printable script breakdown reports: scene list, character report, location
 * report and the day-out-of-days grid. Derived on demand from canonical
 * project data (plan rule 37) — nothing here is stored.
 */
export const ScriptReportsPrintView: React.FC<ScriptReportsPrintViewProps> = ({
  productionTitle,
  scenes,
  characters,
  characterReports,
  locations,
  dood,
  sections,
  logo,
}) => {
  const cell = 'border border-slate-300 px-2 py-1 align-top text-[10.5px]';
  const head = `${cell} bg-slate-100 font-bold uppercase tracking-wider text-[9px] text-slate-700`;
  const characterName = (id: string) => characters.find((c) => c.id === id)?.canonicalName ?? '—';

  return (
    <div className="space-y-6">
      {logo && (
        <div className="flex justify-end">
          <img src={logo} alt="Production logo" className="max-w-[42mm] max-h-[16mm] object-contain" />
        </div>
      )}
      {sections.scenes && (
        <section className="print-section">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1 mb-2">
            Scene list · {scenes.length} scenes
          </h3>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${head} w-12`}>Sc.</th>
                <th className={`${head} w-12`}>I/E</th>
                <th className={head}>Heading</th>
                <th className={`${head} w-24`}>Time</th>
                <th className={`${head} w-16`}>Pages</th>
                <th className={head}>Cast</th>
              </tr>
            </thead>
            <tbody>
              {scenes.map((scene) => (
                <tr key={scene.id} className={`break-inside-avoid ${scene.omitted ? 'text-slate-400' : ''}`}>
                  <td className={`${cell} font-mono font-bold`}>{scene.sceneNumber}</td>
                  <td className={`${cell} font-mono`}>{scene.intExt ? INT_EXT_LABEL[scene.intExt] ?? '' : ''}</td>
                  <td className={cell}>
                    <span className={scene.omitted ? 'line-through' : ''}>{scene.heading}</span>
                    {scene.omitted && <span className="ml-1 px-1 border border-slate-300 text-[7.5px] uppercase">Omitted</span>}
                  </td>
                  <td className={cell}>{scene.timeOfDay ?? '—'}</td>
                  <td className={`${cell} font-mono`}>{scene.pageLengthEighths !== undefined ? `${scene.pageLengthEighths}/8` : '—'}</td>
                  <td className={cell}>{scene.characterIds.map(characterName).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {sections.characters && (
        <section className="print-section">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1 mb-2">
            Character report · {characterReports.length} speaking characters
          </h3>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={head}>Character</th>
                <th className={head}>Cast as</th>
                <th className={`${head} w-16`}>Scenes</th>
                <th className={head}>Scene numbers</th>
              </tr>
            </thead>
            <tbody>
              {characterReports.map((entry) => (
                <tr key={entry.character?.id ?? entry.scenes[0]?.id} className="break-inside-avoid">
                  <td className={`${cell} font-bold uppercase`}>{entry.character?.canonicalName ?? '—'}</td>
                  <td className={cell}>{entry.castPerson?.displayName ?? <span className="text-slate-400">not cast</span>}</td>
                  <td className={`${cell} font-mono`}>{entry.scenes.length}</td>
                  <td className={`${cell} font-mono`}>{entry.scenes.map((scene) => scene.sceneNumber).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {sections.locations && (
        <section className="print-section">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1 mb-2">
            Location report · {locations.length} locations
          </h3>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={head}>Location</th>
                <th className={`${head} w-16`}>Scenes</th>
                <th className={head}>Scene numbers</th>
                <th className={`${head} w-20`}>Linked</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((entry) => (
                <tr key={entry.key} className="break-inside-avoid">
                  <td className={`${cell} font-semibold`}>{entry.name}</td>
                  <td className={`${cell} font-mono`}>{entry.scenes.length}</td>
                  <td className={`${cell} font-mono`}>{entry.scenes.map((scene) => scene.sceneNumber).join(', ')}</td>
                  <td className={cell}>{entry.locationId ? 'Yes' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {sections.dood && (
        <section className="print-section">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1 mb-2">
            Day out of days · {dood.columns.length} shooting days
          </h3>
          {dood.columns.length === 0 ? (
            <p className="text-[10.5px] text-slate-500">No shooting days scheduled yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={head}>Character / performer</th>
                    {dood.columns.map((column) => (
                      <th key={column.dayId} className={`${head} text-center`}>
                        <div>{column.dayName}</div>
                        <div className="font-normal">{column.date?.slice(5) ?? '—'}</div>
                      </th>
                    ))}
                    <th className={`${head} text-right`}>Days</th>
                  </tr>
                </thead>
                <tbody>
                  {dood.rows.map((row) => {
                    const working = row.cells.filter((c) => c.status !== 'off' && c.status !== 'hold').length;
                    return (
                      <tr key={row.characterId} className="break-inside-avoid">
                        <td className={`${cell} font-semibold`}>{row.displayName}</td>
                        {row.cells.map((c) => (
                          <td key={c.dayId} className={`${cell} text-center font-mono font-bold`}>{DOOD_LABEL[c.status]}</td>
                        ))}
                        <td className={`${cell} text-right font-mono`}>{working}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[9px] text-slate-500 mt-1">SW = start work · W = work · H = hold · WF = work finish. Derived from scene strips on each shooting day.</p>
        </section>
      )}

      <p className="text-[9px] text-slate-500">{productionTitle} · generated from project data</p>
    </div>
  );
};
