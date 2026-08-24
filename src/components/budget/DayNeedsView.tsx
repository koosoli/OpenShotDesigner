import React, { useMemo } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { groupPeopleByDepartment } from '../../domain/people';
import { useProductionNeeds } from './useProductionNeeds';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';

interface DayNeedsViewProps {
  isLight: boolean;
}

/** "23 Aug" from an ISO day; the string itself when it is not one. */
const shortDate = (iso: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

const DAY_KIND_LABEL = { shoot: 'Shoot', rehearsal: 'Rehearsal', scout: 'Scout', event: 'Event' } as const;

/**
 * Who and what has to be available on which day — one grid for people, one
 * for gear, a column per production day. The production manager's morning
 * question, answered from the schedule rather than from memory.
 */
export const DayNeedsView: React.FC<DayNeedsViewProps> = ({ isLight }) => {
  const { project } = useFloorPlan();
  const { setActiveRightTab } = useWorkspaceUI();
  const { needs, shootDays } = useProductionNeeds();
  const people = useMemo(() => project.people ?? [], [project.people]);
  const mutedCls = isLight ? 'text-slate-500' : 'text-slate-400';
  const cardCls = `rounded-xl border overflow-hidden ${isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900/60'}`;
  const headCls = `sticky top-0 z-10 text-[9px] uppercase font-bold ${isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-950 text-slate-400'}`;
  const rowBorder = isLight ? 'border-slate-100' : 'border-slate-800';

  const cast = people.filter((person) => person.kind === 'cast' || person.kind === 'talent');
  const crewGroups = groupPeopleByDepartment(people.filter((person) => person.kind === 'crew'));
  const personNeeded = (personId: string, dayIndex: number): boolean => {
    const day = needs[dayIndex];
    return day.castPersonIds.includes(personId) || day.crewPersonIds.includes(personId);
  };
  const gear = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; category: string; perDay: number[] }>();
    needs.forEach((day, index) => {
      for (const item of day.equipment) {
        const row = byKey.get(item.key) ?? { key: item.key, label: item.label, category: item.category, perDay: needs.map(() => 0) };
        row.perDay[index] = item.quantity;
        byKey.set(item.key, row);
      }
    });
    return [...byKey.values()].sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
  }, [needs]);

  if (needs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div className="max-w-sm space-y-2">
          <p className="text-sm font-bold">No production days yet</p>
          <p className={`text-xs ${mutedCls}`}>Add shooting days on the Schedule tab and drop scenes, setups or shots on them; this page then lists who and what each day needs.</p>
          <button onClick={() => setActiveRightTab('schedule')} className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold">Open schedule</button>
        </div>
      </div>
    );
  }

  const dayHeader = (
    <tr>
      <th className={`${headCls} text-left px-2 py-1.5 min-w-[160px]`}>&nbsp;</th>
      {needs.map((day) => (
        <th key={day.dayId} className={`${headCls} px-1.5 py-1.5 text-center min-w-[64px] align-top`} title={`${day.dayName} · ${DAY_KIND_LABEL[day.kind]} · scenes ${day.sceneNumbers.join(', ') || '—'}`}>
          <div className="truncate max-w-[90px]">{day.dayName}</div>
          <div className="font-mono font-normal normal-case">{day.date ? shortDate(day.date) : '—'}</div>
          {day.kind !== 'shoot' && <div className="font-normal normal-case text-amber-600">{DAY_KIND_LABEL[day.kind]}</div>}
        </th>
      ))}
    </tr>
  );
  const dot = (key: string, on: boolean, label?: string) => (
    <td key={key} className={`px-1.5 py-1 text-center ${on ? '' : 'opacity-20'}`} aria-label={on ? 'needed' : 'not needed'}>
      {on ? <span className="inline-block min-w-[18px] px-1 rounded bg-emerald-500 text-white text-[9px] font-black">{label ?? '●'}</span> : '·'}
    </td>
  );

  return (
    <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-4">
      <p className={`text-[10px] ${mutedCls}`}>
        {shootDays} shooting day{shootDays === 1 ? '' : 's'}. Cast follows the scenes, setups and shots scheduled on each day; crew are assumed on every shooting day; gear is whatever the day's setups put on the plan, at the most any single setup needs at once.
      </p>

      {/* Per-day summary cards: the at-a-glance version. */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {needs.map((day) => (
          <section key={day.dayId} className={`${cardCls} p-3 text-xs space-y-1`}>
            <div className="flex items-baseline justify-between gap-2">
              <b className="truncate">{day.dayName}</b>
              <span className={`font-mono text-[10px] ${mutedCls}`}>{day.date ? shortDate(day.date) : 'undated'} · {DAY_KIND_LABEL[day.kind]}</span>
            </div>
            <div><span className={mutedCls}>Scenes: </span>{day.sceneNumbers.length ? day.sceneNumbers.join(', ') : '—'}</div>
            <div><span className={mutedCls}>Cast ({day.castPersonIds.length}): </span>{day.castPersonIds.map((id) => people.find((p) => p.id === id)?.displayName ?? '?').join(', ') || '—'}</div>
            <div><span className={mutedCls}>Crew: </span>{day.crewPersonIds.length}</div>
            <div><span className={mutedCls}>Gear ({day.equipment.length}): </span>{day.equipment.slice(0, 6).map((item) => `${item.quantity > 1 ? `${item.quantity}× ` : ''}${item.label}`).join(', ')}{day.equipment.length > 6 ? ` +${day.equipment.length - 6} more` : ''}{day.equipment.length === 0 ? '—' : ''}</div>
          </section>
        ))}
      </div>

      <section className={cardCls}>
        <h3 className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider ${mutedCls}`}>People × days</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>{dayHeader}</thead>
            <tbody>
              {cast.length > 0 && <tr><td colSpan={needs.length + 1} className={`px-2 py-1 text-[9px] font-black uppercase ${isLight ? 'bg-amber-50 text-amber-800' : 'bg-amber-950/30 text-amber-300'}`}>Cast</td></tr>}
              {cast.map((person) => (
                <tr key={person.id} className={`border-t ${rowBorder}`}>
                  <td className="px-2 py-1 truncate"><b>{person.displayName}</b>{person.role && <span className={`ml-1 ${mutedCls}`}>{person.role}</span>}</td>
                  {needs.map((day, index) => dot(day.dayId, personNeeded(person.id, index)))}
                </tr>
              ))}
              {crewGroups.map((group) => (
                <React.Fragment key={group.department}>
                  <tr><td colSpan={needs.length + 1} className={`px-2 py-1 text-[9px] font-black uppercase ${isLight ? 'bg-slate-50 text-slate-600' : 'bg-slate-950/60 text-slate-400'}`}>{group.department}</td></tr>
                  {group.people.map((person) => (
                    <tr key={person.id} className={`border-t ${rowBorder}`}>
                      <td className="px-2 py-1 truncate"><b>{person.displayName}</b>{person.role && <span className={`ml-1 ${mutedCls}`}>{person.role}</span>}</td>
                      {needs.map((day, index) => dot(day.dayId, personNeeded(person.id, index)))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {people.length === 0 && <tr><td colSpan={needs.length + 1} className={`px-2 py-3 text-center ${mutedCls}`}>No crew or cast yet — add them on the Crew tab.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className={cardCls}>
        <h3 className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider ${mutedCls}`}>Equipment × days</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>{dayHeader}</thead>
            <tbody>
              {gear.map((item) => (
                <tr key={item.key} className={`border-t ${rowBorder}`}>
                  <td className="px-2 py-1 truncate"><b>{item.label}</b><span className={`ml-1 ${mutedCls}`}>{item.category}</span></td>
                  {item.perDay.map((quantity, index) => dot(needs[index].dayId, quantity > 0, quantity > 1 ? `×${quantity}` : undefined))}
                </tr>
              ))}
              {gear.length === 0 && <tr><td colSpan={needs.length + 1} className={`px-2 py-3 text-center ${mutedCls}`}>No gear resolves to a scheduled day yet. Schedule setups or shots — a scene strip finds its setup through the scene number.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
