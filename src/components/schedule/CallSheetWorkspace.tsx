import React, { useRef } from 'react';
import { AlertTriangle, Building2, CheckCircle2, ImagePlus, MapPin, Printer, ShieldAlert } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { loadLogoFile } from '../../utils/image';
import { locationMapLinkUrl } from '../../domain/locations';
import { createId } from '../../domain/ids';
import type { ProductionDay } from '../../domain/scheduling';
import type { CallSheetData, StandingCallSheetField } from '../../domain/reports';
import { resolveStandingCallSheet } from '../../domain/reports';
import { StandingCallSheetEditor } from './StandingCallSheetEditor';

interface CallSheetWorkspaceProps {
  days: ProductionDay[];
  selectedDayId: string | null;
  onSelectDay: (dayId: string) => void;
  sheet: CallSheetData | null;
  updateDay: (dayId: string, updates: Partial<ProductionDay>) => void;
  onPrint: (day: ProductionDay) => void;
  isLight: boolean;
}

/**
 * Day fields that inherit from the production's standing content. Same order
 * and labels as the standing editor, so the two read as one setting seen from
 * two places rather than as two unrelated forms.
 */
const STANDING_DAY_FIELDS: Array<{
  key: StandingCallSheetField;
  label: string;
  placeholder: string;
  rows: number;
}> = [
  { key: 'walkieChannels', label: 'Walkie channels', placeholder: 'Ch 1 Production · Ch 2 Camera', rows: 2 },
  { key: 'unitBase', label: 'Unit base', placeholder: 'Trucks, catering', rows: 2 },
  { key: 'parking', label: 'Parking & access', placeholder: 'Parking and access notes', rows: 2 },
  { key: 'nearestHospital', label: 'Nearest hospital', placeholder: 'Facility, address, phone', rows: 2 },
  { key: 'safetyNotes', label: 'Safety bulletin', placeholder: 'Hazards, PPE, medic, emergency plan', rows: 2 },
  { key: 'generalNotes', label: 'General notes', placeholder: 'Department notes, special instructions', rows: 3 },
];

const formatMinutes = (value: number | null): string => {
  if (value === null) return 'Incomplete';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export const CallSheetWorkspace: React.FC<CallSheetWorkspaceProps> = ({
  days,
  selectedDayId,
  onSelectDay,
  sheet,
  updateDay,
  onPrint,
  isLight,
}) => {
  const { project, updateProjectMeta } = useFloorPlan();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const selectedDay = days.find((day) => day.id === selectedDayId) ?? days[0];
  const fieldClass = `w-full min-h-9 rounded-md border px-2.5 py-2 text-[11px] outline-none focus:ring-2 focus:ring-cyan-500/25 ${
    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-slate-100'
  }`;
  const people = project.people ?? [];
  const pickups = selectedDay?.callSheet?.pickups ?? [];

  /** Immutable pick-up-list mutations; each writes the whole day's call sheet. */
  const setPickups = (next: NonNullable<NonNullable<ProductionDay['callSheet']>['pickups']>) => {
    if (!selectedDay) return;
    updateDay(selectedDay.id, {
      callSheet: { ...(selectedDay.callSheet ?? {}), pickups: next },
    });
  };
  const addPickup = () => {
    const first = people[0];
    if (!first) return;
    setPickups([...pickups, { id: createId('pickup'), personId: first.id }]);
  };
  const patchPickup = (
    pickupId: string,
    updates: Partial<NonNullable<NonNullable<ProductionDay['callSheet']>['pickups']>[number]>,
  ) => setPickups(pickups.map((pickup) => (pickup.id === pickupId ? { ...pickup, ...updates } : pickup)));
  const removePickup = (pickupId: string) =>
    setPickups(pickups.filter((pickup) => pickup.id !== pickupId));

  /**
   * Individual call times. A person with no entry works to the general crew
   * call, so the list only holds the exceptions rather than a row per head.
   */
  const personCalls = selectedDay?.callSheet?.personCalls ?? [];
  const setPersonCalls = (
    next: NonNullable<NonNullable<ProductionDay['callSheet']>['personCalls']>,
  ) => {
    if (!selectedDay) return;
    updateDay(selectedDay.id, {
      callSheet: { ...(selectedDay.callSheet ?? {}), personCalls: next },
    });
  };
  const addPersonCall = () => {
    const uncalled = people.find((person) => !personCalls.some((call) => call.personId === person.id));
    const target = uncalled ?? people[0];
    if (!target) return;
    setPersonCalls([...personCalls, { id: createId('call'), personId: target.id }]);
  };
  const patchPersonCall = (
    callId: string,
    updates: Partial<NonNullable<NonNullable<ProductionDay['callSheet']>['personCalls']>[number]>,
  ) => setPersonCalls(personCalls.map((call) => (call.id === callId ? { ...call, ...updates } : call)));
  const removePersonCall = (callId: string) =>
    setPersonCalls(personCalls.filter((call) => call.id !== callId));

  const companyInfo = project.productionCompanyInfo ?? {};
  const patchCompanyInfo = (updates: Partial<typeof companyInfo>) =>
    updateProjectMeta({ productionCompanyInfo: { ...companyInfo, ...updates } });

  if (!selectedDay || !sheet) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center">
        <div>
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center"><Printer className="w-5 h-5" /></div>
          <h3 className="font-bold">No shooting day selected</h3>
          <p className="mt-1 text-xs text-slate-500">Create a production day in the stripboard first.</p>
        </div>
      </div>
    );
  }

  const patchCallSheet = (updates: NonNullable<ProductionDay['callSheet']>) =>
    updateDay(selectedDay.id, { callSheet: { ...selectedDay.callSheet, ...updates } });

  // What this day actually shows for each inheritable field, and where it came
  // from — the editor labels it so overriding is a visible decision.
  const standing = resolveStandingCallSheet(project.standingCallSheet, selectedDay.callSheet);

  return (
    <div className="h-full min-h-0 flex overflow-hidden">
      <aside className={`w-44 shrink-0 border-r overflow-y-auto ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
        <div className="px-3 py-3 border-b border-inherit">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Call sheets</div>
          <div className="mt-0.5 text-sm font-black">Shoot days</div>
        </div>
        <div className="p-2 space-y-1">
          {days.map((day, index) => {
            const active = day.id === selectedDay.id;
            const ready = Boolean(day.date && day.crewCall && day.callSheet?.nearestHospital && day.scheduleBlockIds.length);
            return (
              <button key={day.id} onClick={() => onSelectDay(day.id)} className={`w-full rounded-lg px-2.5 py-2.5 text-left border transition-colors ${active ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-950' : isLight ? 'bg-white border-slate-200 hover:border-slate-400' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`}>
                <div className="flex items-center justify-between gap-2"><span className="text-[9px] font-black uppercase tracking-wider">Day {index + 1}</span>{ready ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}</div>
                <div className="mt-1 text-[11px] font-bold truncate">{day.name}</div>
                <div className={`mt-0.5 text-[9px] font-mono ${active ? 'opacity-70' : 'text-slate-500'}`}>{day.date || 'Date not set'}</div>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
        <div className="min-w-[670px] grid grid-cols-[230px_1fr] min-h-full">
          <section className={`border-r p-3 space-y-3 overflow-y-auto custom-scrollbar ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
            {/* Company identity — canonical project fields, edited where they are used. */}
            <div className="space-y-2">
              <div className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-600 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> Production company
              </div>
              <input
                value={project.productionCompany ?? ''}
                onChange={(event) => updateProjectMeta({ productionCompany: event.target.value })}
                placeholder="Company name"
                aria-label="Production company name"
                className={fieldClass}
              />
              <div className="flex items-center gap-2">
                <div className={`w-14 h-10 rounded-md border flex items-center justify-center overflow-hidden flex-shrink-0 ${isLight ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'}`}>
                  {project.logo ? (
                    <img src={project.logo} alt="Production logo" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <ImagePlus className="w-4 h-4 opacity-40" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        loadLogoFile(file)
                          .then(({ dataUrl, name }) => updateProjectMeta({ logo: dataUrl, logoName: name }))
                          .catch(() => alert('Could not load that image as a logo.'));
                      }
                      event.target.value = '';
                    }}
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'}`}
                    >
                      {project.logo ? 'Replace logo' : 'Upload logo'}
                    </button>
                    {project.logo && (
                      <button
                        onClick={() => updateProjectMeta({ logo: undefined, logoName: undefined })}
                        className="px-2 py-1 rounded-lg border border-rose-500/50 text-rose-500 text-[10px] font-bold"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <input
                value={companyInfo.address ?? ''}
                onChange={(event) => patchCompanyInfo({ address: event.target.value || undefined })}
                placeholder="Company address"
                aria-label="Company address"
                className={fieldClass}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={companyInfo.phone ?? ''}
                  onChange={(event) => patchCompanyInfo({ phone: event.target.value || undefined })}
                  placeholder="Phone"
                  aria-label="Company phone"
                  className={fieldClass}
                />
                <input
                  value={companyInfo.email ?? ''}
                  onChange={(event) => patchCompanyInfo({ email: event.target.value || undefined })}
                  placeholder="Email"
                  aria-label="Company email"
                  className={fieldClass}
                />
              </div>
              <input
                value={companyInfo.website ?? ''}
                onChange={(event) => patchCompanyInfo({ website: event.target.value || undefined })}
                placeholder="Website"
                aria-label="Company website"
                className={fieldClass}
              />
            </div>

            <div className={`border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`} />
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-600">Day setup</div>
              <h3 className="text-sm font-black mt-0.5">{selectedDay.name}</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[9px] font-bold uppercase text-slate-500">Date<input type="date" value={selectedDay.date ?? ''} onChange={(event) => updateDay(selectedDay.id, { date: event.target.value || undefined })} className={`${fieldClass} mt-1`} /></label>
              <label className="text-[9px] font-bold uppercase text-slate-500">Type<select value={selectedDay.callSheet?.type ?? 'shoot'} onChange={(event) => patchCallSheet({ type: event.target.value as NonNullable<ProductionDay['callSheet']>['type'] })} className={`${fieldClass} mt-1`}><option value="shoot">Shoot</option><option value="rehearsal">Rehearsal</option><option value="scout">Scout</option><option value="event">Event</option></select></label>
              <label className="text-[9px] font-bold uppercase text-slate-500">Crew call<input value={selectedDay.crewCall ?? ''} onChange={(event) => updateDay(selectedDay.id, { crewCall: event.target.value || undefined })} placeholder="07:00" className={`${fieldClass} mt-1 font-mono`} /></label>
              <label className="text-[9px] font-bold uppercase text-slate-500">Wrap<input value={selectedDay.plannedWrap ?? ''} onChange={(event) => updateDay(selectedDay.id, { plannedWrap: event.target.value || undefined })} placeholder="18:30" className={`${fieldClass} mt-1 font-mono`} /></label>
            </div>
            {/* Sunrise / sunset are calculated from the day's location pin.
                These two fields exist for the times a production works to
                instead — its own published figures, or a time adjusted for a
                ridge or a building line. Blank = use the calculation, so the
                placeholder shows what that is (rule 37). */}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[9px] font-bold uppercase text-slate-500">
                Sunrise
                <input
                  value={selectedDay.callSheet?.sunriseOverride ?? ''}
                  onChange={(event) => patchCallSheet({ sunriseOverride: event.target.value || undefined })}
                  placeholder={sheet.daylight.sunriseOrigin === 'derived' ? sheet.daylight.sunrise : 'No location pin'}
                  className={`${fieldClass} mt-1 font-mono`}
                />
              </label>
              <label className="text-[9px] font-bold uppercase text-slate-500">
                Sunset
                <input
                  value={selectedDay.callSheet?.sunsetOverride ?? ''}
                  onChange={(event) => patchCallSheet({ sunsetOverride: event.target.value || undefined })}
                  placeholder={sheet.daylight.sunsetOrigin === 'derived' ? sheet.daylight.sunset : 'No location pin'}
                  className={`${fieldClass} mt-1 font-mono`}
                />
              </label>
            </div>
            {sheet.daylight.note && (
              <p className="text-[9px] text-amber-600">{sheet.daylight.note}</p>
            )}
            <label className="text-[9px] font-bold uppercase text-slate-500 block">Weather<textarea rows={2} value={selectedDay.callSheet?.weatherSummary ?? ''} onChange={(event) => patchCallSheet({ weatherSummary: event.target.value || undefined })} placeholder="Forecast, temperature, wind" className={`${fieldClass} mt-1 resize-none`} /></label>
            {/* These fields inherit from the production's standing content.
                Blank means "inherit", and the placeholder shows what that is,
                so overriding is a visible decision rather than an accident. */}
            {STANDING_DAY_FIELDS.map((field) => (
              <label key={field.key} className="text-[9px] font-bold uppercase text-slate-500 block">
                <span className="flex items-center gap-1.5">
                  {field.label}
                  {standing[field.key].origin === 'production' && (
                    <span className="text-[8px] font-semibold normal-case text-cyan-600">
                      from production
                    </span>
                  )}
                  {standing[field.key].origin === 'day' && (
                    <span className="text-[8px] font-semibold normal-case text-amber-600">
                      overridden here
                    </span>
                  )}
                </span>
                <textarea
                  rows={field.rows}
                  value={selectedDay.callSheet?.[field.key] ?? ''}
                  onChange={(event) => patchCallSheet({ [field.key]: event.target.value || undefined })}
                  placeholder={
                    standing[field.key].origin === 'production'
                      ? standing[field.key].value
                      : field.placeholder
                  }
                  className={`${fieldClass} mt-1 resize-none`}
                />
              </label>
            ))}

            {/* The production-level values every day above inherits. Edited in
                the same column so the relationship is visible, rather than on a
                settings page nobody connects to the fields it feeds. */}
            <details className={`rounded-lg border p-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/60'}`}>
              <summary className="text-[9px] font-bold uppercase text-slate-500 cursor-pointer">
                Production standing content
              </summary>
              <div className="mt-2">
                <StandingCallSheetEditor fieldClass={fieldClass} />
              </div>
            </details>

            {/* Individual calls. Only the exceptions are listed: everyone else
                works to the general crew call at the top of the sheet. */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-bold uppercase text-slate-500 block">
                Individual call times
              </span>
              {personCalls.map((call) => (
                <div key={call.id} className="flex items-center gap-1.5">
                  <input
                    value={call.time ?? ''}
                    onChange={(event) => patchPersonCall(call.id, { time: event.target.value || undefined })}
                    placeholder="07:30"
                    aria-label="Call time"
                    className={`${fieldClass} !w-16 font-mono`}
                  />
                  <select
                    value={call.personId}
                    onChange={(event) => patchPersonCall(call.id, { personId: event.target.value })}
                    aria-label="Person called"
                    className={`${fieldClass} !w-auto flex-1 min-w-0`}
                  >
                    {people.some((person) => person.id === call.personId) ? null : (
                      <option value={call.personId}>Contact removed</option>
                    )}
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>{person.displayName}</option>
                    ))}
                  </select>
                  <input
                    value={call.note ?? ''}
                    onChange={(event) => patchPersonCall(call.id, { note: event.target.value || undefined })}
                    placeholder="Make-up"
                    aria-label="What the call is for"
                    className={`${fieldClass} !w-auto flex-1 min-w-0`}
                  />
                  <button
                    onClick={() => removePersonCall(call.id)}
                    title="Remove individual call"
                    aria-label="Remove individual call"
                    className="h-9 w-9 shrink-0 rounded-md text-slate-400 hover:text-rose-500"
                  >
                    x
                  </button>
                </div>
              ))}
              {people.length === 0 ? (
                <p className="text-[10px] text-amber-500">
                  Add crew and cast on the Crew tab first — a call has to name who it is for.
                </p>
              ) : (
                <p className="text-[10px] text-slate-500">
                  Anyone not listed works to the general crew call.
                </p>
              )}
              <button
                onClick={addPersonCall}
                disabled={people.length === 0}
                title={people.length === 0 ? 'Add people on the Crew tab first' : 'Add an individual call'}
                className={`h-9 px-3 rounded-md border text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'}`}
              >
                {people.length === 0 ? 'Add crew first to set calls' : '+ Add individual call'}
              </button>
            </div>

            {/* Transport: general arrangements plus a per-person pick-up list.
                Rows reference contacts, so the printed sheet can show their
                phone number without a second copy of it. */}
            <label className="text-[9px] font-bold uppercase text-slate-500 block">Transport &amp; pick-ups<textarea rows={2} value={selectedDay.callSheet?.pickupNotes ?? ''} onChange={(event) => patchCallSheet({ pickupNotes: event.target.value || undefined })} placeholder="Shuttle from the hotel 06:15, driver contact, crew van route" className={`${fieldClass} mt-1 resize-none`} /></label>
            <div className="space-y-1.5">
              {pickups.map((pickup) => (
                <div key={pickup.id} className="flex items-center gap-1.5">
                  <input
                    value={pickup.time ?? ''}
                    onChange={(event) => patchPickup(pickup.id, { time: event.target.value || undefined })}
                    placeholder="06:15"
                    aria-label="Pick-up time"
                    className={`${fieldClass} !w-16 font-mono`}
                  />
                  <select
                    value={pickup.personId}
                    onChange={(event) => patchPickup(pickup.id, { personId: event.target.value })}
                    aria-label="Person picked up"
                    className={`${fieldClass} !w-auto flex-1 min-w-0`}
                  >
                    {people.some((person) => person.id === pickup.personId) ? null : (
                      <option value={pickup.personId}>Contact removed</option>
                    )}
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>{person.displayName}</option>
                    ))}
                  </select>
                  <input
                    value={pickup.location ?? ''}
                    onChange={(event) => patchPickup(pickup.id, { location: event.target.value || undefined })}
                    placeholder="Hotel lobby"
                    aria-label="Pick-up location"
                    className={`${fieldClass} !w-auto flex-1 min-w-0`}
                  />
                  <button
                    onClick={() => removePickup(pickup.id)}
                    title="Remove pick-up"
                    aria-label={`Remove pick-up for ${pickup.personId}`}
                    className="h-9 w-9 shrink-0 rounded-md text-slate-400 hover:text-rose-500"
                  >
                    ×
                  </button>
                </div>
              ))}
              {/* A pick-up row has to name somebody, so with no crew there is
                  nothing to add. Say so on the button itself — a disabled
                  control that silently ignores the click explains nothing. */}
              {people.length === 0 && (
                <p className="text-[10px] text-amber-500">
                  Add crew and cast on the Crew tab first — a pick-up has to name who is collected.
                </p>
              )}
              <button
                onClick={addPickup}
                disabled={people.length === 0}
                title={people.length === 0 ? 'Add people on the Crew tab first' : 'Add a pick-up row'}
                className={`h-9 px-3 rounded-md border text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'}`}
              >
                {people.length === 0 ? 'Add crew first to add pick-ups' : '+ Add pick-up'}
              </button>
            </div>
          </section>

          <section className={`p-4 ${isLight ? 'bg-slate-200/60' : 'bg-slate-950'}`}>
            <div className="flex items-center justify-between mb-3">
              <div><div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Live document preview</div><div className="text-xs font-bold">{sheet.warnings.length ? `${sheet.warnings.length} readiness warning${sheet.warnings.length === 1 ? '' : 's'}` : 'Ready to issue'}</div></div>
              <button onClick={() => onPrint(selectedDay)} className="h-9 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-black flex items-center gap-1.5"><Printer className="w-3.5 h-3.5" /> Print / PDF</button>
            </div>

            <article className="mx-auto bg-white text-slate-950 shadow-xl border border-slate-300 min-h-[720px] p-6 font-sans">
              <header className="grid grid-cols-[1fr_auto] gap-5 pb-4 border-b-[3px] border-slate-950">
                <div><div className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-700">{sheet.productionCompany ? `${sheet.productionCompany} · Production call sheet` : 'Production call sheet'}</div><h1 className="mt-1 text-2xl font-black uppercase tracking-tight">{sheet.productionTitle}</h1><div className="mt-1 text-sm font-bold">{sheet.dayName}</div>{(sheet.productionCompanyInfo?.address || sheet.productionCompanyInfo?.phone || sheet.productionCompanyInfo?.email || sheet.productionCompanyInfo?.website) && <div className="mt-1 text-[10px] text-slate-600 leading-snug">{[sheet.productionCompanyInfo?.address, sheet.productionCompanyInfo?.phone, sheet.productionCompanyInfo?.email, sheet.productionCompanyInfo?.website].filter(Boolean).join(' · ')}</div>}</div>
                <div className="text-right flex flex-col items-end gap-2">
                  {sheet.productionLogo && <img src={sheet.productionLogo} alt="Production logo" className="max-w-[42mm] max-h-[18mm] object-contain" />}
                  <div><div className="text-[9px] font-bold uppercase text-slate-500">General crew call</div><div className="text-3xl font-black font-mono tracking-tight">{sheet.crewCall ?? '—'}</div><div className="text-[10px] font-bold">{sheet.date ?? 'DATE NOT SET'}</div></div>
                </div>
              </header>

              <div className="grid grid-cols-3 gap-px mt-3 bg-slate-300 border border-slate-300 text-[10px]">
                <div className="bg-slate-50 p-2"><b className="block uppercase text-[8px] text-slate-500">Planned wrap</b>{sheet.plannedWrap ?? '—'}</div>
                <div className="bg-slate-50 p-2"><b className="block uppercase text-[8px] text-slate-500">Weather</b>{sheet.weatherSummary ?? 'Not entered'}</div>
                <div className="bg-slate-50 p-2">
                  <b className="block uppercase text-[8px] text-slate-500">Sunrise / sunset</b>
                  {sheet.daylight.sunrise || sheet.daylight.sunset
                    ? `${sheet.daylight.sunrise ?? '—'} / ${sheet.daylight.sunset ?? '—'}`
                    : 'Pin the location to calculate'}
                </div>
                <div className="bg-slate-50 p-2"><b className="block uppercase text-[8px] text-slate-500">Total schedule</b>{formatMinutes(sheet.totalEstimatedMinutes)}</div>
              </div>

              {sheet.safetyNotes && <div className="mt-3 border-2 border-amber-500 bg-amber-50 p-2.5 flex gap-2 text-[10px]"><ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" /><div><b className="block uppercase text-[8px] tracking-wider">Safety bulletin</b>{sheet.safetyNotes}</div></div>}

              <section className="mt-4"><h2 className="text-[9px] font-black uppercase tracking-[0.18em] border-b-2 border-slate-900 pb-1">Locations</h2>{sheet.locations.length ? sheet.locations.map((location, index) => <div key={index} className="grid grid-cols-[18px_1fr_auto] gap-2 py-2 border-b border-slate-200 text-[10px]"><MapPin className="w-3.5 h-3.5 text-cyan-700" /><div><b>{location.name}</b><div className="text-slate-600">{location.address ?? 'Address not entered'}</div></div><a href={locationMapLinkUrl(location)} target="_blank" rel="noreferrer" className="text-[9px] font-bold text-sky-700 underline self-center">Map</a></div>) : <div className="py-2 text-[10px] text-amber-700">No linked shooting location</div>}</section>

<section className="mt-4"><h2 className="text-[9px] font-black uppercase tracking-[0.18em] border-b-2 border-slate-900 pb-1">Shooting schedule</h2><table className="w-full text-[9px] border-collapse"><thead><tr className="bg-slate-100 text-left uppercase text-[8px]"><th className="p-1.5">Time</th><th className="p-1.5">Schedule item</th><th className="p-1.5">Type</th><th className="p-1.5 text-right">Duration</th></tr></thead><tbody>{sheet.schedule.map((entry, index) => <tr key={index} className={`border-b border-slate-200 ${entry.omitted ? 'text-slate-400' : ''}`}><td className="p-1.5 font-mono font-bold">{entry.scheduledStart ?? '—'}</td><td className={`p-1.5 font-bold ${entry.omitted ? 'line-through' : ''}`}>{entry.label}{entry.omitted && <span className="ml-1 px-1 border border-slate-300 text-[7px] uppercase align-middle">Omitted</span>}</td><td className="p-1.5 uppercase text-slate-500">{entry.kind}</td><td className="p-1.5 text-right font-mono">{entry.estimatedMinutes === undefined ? '—' : `${entry.estimatedMinutes}m`}</td></tr>)}</tbody></table></section>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <section><h2 className="text-[9px] font-black uppercase tracking-[0.18em] border-b-2 border-slate-900 pb-1">Cast</h2>{sheet.cast.map((person, index) => <div key={index} className="py-1.5 border-b border-slate-200 text-[9px]"><b>{person.displayName}</b><span className="text-slate-500"> · {person.role ?? 'Talent'}</span></div>)}</section>
                <section><h2 className="text-[9px] font-black uppercase tracking-[0.18em] border-b-2 border-slate-900 pb-1">Key crew</h2>{sheet.crew.map((person, index) => <div key={index} className="py-1.5 border-b border-slate-200 text-[9px]"><b>{person.displayName}</b><span className="text-slate-500"> · {[person.department, person.role].filter(Boolean).join(' / ')}</span></div>)}</section>
              </div>

              {(sheet.parking || sheet.nearestHospital || sheet.generalNotes) && <section className="mt-4 grid grid-cols-2 gap-3 text-[9px]"><div><b className="block uppercase text-[8px] text-slate-500">Parking / access</b>{sheet.parking ?? '—'}</div><div><b className="block uppercase text-[8px] text-slate-500">Nearest hospital</b>{sheet.nearestHospital ?? '—'}</div>{sheet.generalNotes && <div className="col-span-2"><b className="block uppercase text-[8px] text-slate-500">General notes</b>{sheet.generalNotes}</div>}</section>}

              {sheet.lookAhead && (
                <section className="mt-4">
                  <h2 className="text-[9px] font-black uppercase tracking-[0.18em] text-white bg-violet-700 px-2 py-1">Look ahead · {sheet.lookAhead.dayName}</h2>
                  <div className="border border-violet-300 border-t-0 bg-violet-50 p-2 text-[9px]">
                    <div className="flex justify-between gap-2 font-bold"><span>{sheet.lookAhead.date ?? 'Date not set'} · crew call {sheet.lookAhead.crewCall ?? '—'}</span><span className="text-slate-500 font-normal">{sheet.lookAhead.locations.map((loc) => loc.name).join(', ') || 'No location linked yet'}</span></div>
                    {sheet.lookAhead.items.length ? <ol className="list-decimal pl-4 mt-1 space-y-0.5">{sheet.lookAhead.items.map((item, index) => <li key={index} className={item.omitted ? 'line-through text-slate-400' : ''}>{item.label}</li>)}</ol> : <p className="text-slate-500 mt-1">Nothing scheduled yet.</p>}
                    {sheet.lookAhead.cast.length > 0 && <p className="mt-1"><b>Cast:</b> {sheet.lookAhead.cast.map((person) => person.displayName).join(', ')}</p>}
                  </div>
                </section>
              )}

              {sheet.warnings.length > 0 && <div className="mt-4 border border-amber-400 bg-amber-50 p-2 text-[8px] text-amber-900"><b className="uppercase">Draft readiness:</b> {sheet.warnings.join(' · ')}</div>}
            </article>
          </section>
        </div>
      </div>
    </div>
  );
};
