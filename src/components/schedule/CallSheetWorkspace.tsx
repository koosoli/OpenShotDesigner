import React, { useRef } from 'react';
import { AlertTriangle, Building2, CheckCircle2, ImagePlus, MapPin, Printer, ShieldAlert } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { loadLogoFile } from '../../utils/image';
import { locationMapLinkUrl } from '../../domain/locations';
import type { ProductionDay } from '../../domain/scheduling';
import type { CallSheetData } from '../../domain/reports';

interface CallSheetWorkspaceProps {
  days: ProductionDay[];
  selectedDayId: string | null;
  onSelectDay: (dayId: string) => void;
  sheet: CallSheetData | null;
  updateDay: (dayId: string, updates: Partial<ProductionDay>) => void;
  onPrint: (day: ProductionDay) => void;
  isLight: boolean;
}

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
            <label className="text-[9px] font-bold uppercase text-slate-500 block">Weather<textarea rows={2} value={selectedDay.callSheet?.weatherSummary ?? ''} onChange={(event) => patchCallSheet({ weatherSummary: event.target.value || undefined })} placeholder="Forecast, sunrise/sunset, temperature" className={`${fieldClass} mt-1 resize-none`} /></label>
            <label className="text-[9px] font-bold uppercase text-slate-500 block">Parking & access<textarea rows={2} value={selectedDay.callSheet?.parking ?? ''} onChange={(event) => patchCallSheet({ parking: event.target.value || undefined })} placeholder="Unit base, parking, access notes" className={`${fieldClass} mt-1 resize-none`} /></label>
            <label className="text-[9px] font-bold uppercase text-slate-500 block">Nearest hospital<textarea rows={2} value={selectedDay.callSheet?.nearestHospital ?? ''} onChange={(event) => patchCallSheet({ nearestHospital: event.target.value || undefined })} placeholder="Facility, address, phone" className={`${fieldClass} mt-1 resize-none`} /></label>
            <label className="text-[9px] font-bold uppercase text-slate-500 block">Safety bulletin<textarea rows={2} value={selectedDay.callSheet?.safetyNotes ?? ''} onChange={(event) => patchCallSheet({ safetyNotes: event.target.value || undefined })} placeholder="Hazards, PPE, medic, emergency plan" className={`${fieldClass} mt-1 resize-none`} /></label>
            <label className="text-[9px] font-bold uppercase text-slate-500 block">General notes<textarea rows={3} value={selectedDay.callSheet?.generalNotes ?? ''} onChange={(event) => patchCallSheet({ generalNotes: event.target.value || undefined })} placeholder="Walkies, department notes, special instructions" className={`${fieldClass} mt-1 resize-none`} /></label>
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
