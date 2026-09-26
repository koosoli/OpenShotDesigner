import React, { useRef, useState } from 'react';
import { AlertTriangle, Building2, CalendarDays, CheckCircle2, FileText, ImagePlus, MapPin, Printer, Send } from 'lucide-react';
import { PdfExportButton } from '../common/PdfExportButton';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useDialogs } from '../dialog/DialogProvider';
import { loadLogoFile } from '../../utils/image';
import { createId } from '../../domain/ids';
import { personalCallsToIcs, shootingDaysToIcs, type ProductionDay } from '../../domain/scheduling';
import type { CallSheetData, StandingCallSheetField } from '../../domain/reports';
import { diffCallSheetSnapshots, parseIssuedCallSheet, resolveStandingCallSheet } from '../../domain/reports';
import { buildCallSheetPdfFilename, createCallSheetPdf } from '../../utils/pdf/callSheetPdf';
import { callSheetPdfInputFromData } from '../../utils/pdf/callSheetData';
import { StandingCallSheetEditor } from './StandingCallSheetEditor';
import { CallSheetPrintView } from '../reports/CallSheetPrintView';
import { LocationMapCapture } from './LocationMapCapture';
import { SetLocationLink } from '../locations/SetLocationLink';
import { ProjectImage } from '../common/ProjectImage';
import { bytesToBlob, downloadBlob, safeFileName } from '../../utils/download';

interface CallSheetWorkspaceProps {
  days: ProductionDay[];
  selectedDayId: string | null;
  onSelectDay: (dayId: string) => void;
  sheet: CallSheetData | null;
  updateDay: (dayId: string, updates: Partial<ProductionDay>) => void;
  onPrint: (day: ProductionDay, currentSheet?: CallSheetData) => void;
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
  const { notice } = useDialogs();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const selectedDay = days.find((day) => day.id === selectedDayId) ?? days[0];
  const fieldClass = `w-full min-h-9 rounded-md border px-2.5 py-2 text-[11px] outline-none focus:ring-2 focus:ring-cyan-500/25 ${
    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-slate-100'
  }`;
  const people = project.people ?? [];
  const [calendarPersonId, setCalendarPersonId] = useState('');
  const pickups = selectedDay?.callSheet?.pickups ?? [];

  /** Immutable pick-up-list mutations; each writes the whole day's call sheet. */
  const setPickups = (next: NonNullable<NonNullable<ProductionDay['callSheet']>['pickups']>) => {
    if (!selectedDay) return;
    updateDay(selectedDay.id, {
      callSheet: { ...(selectedDay.callSheet ?? {}), pickups: next },
    });
  };
  const addPickup = () => {
    // Performers are the people most often collected, so a new row starts on
    // the first cast member without a pick-up rather than on whoever is first
    // in the contact list.
    const collected = new Set(pickups.map((pickup) => pickup.personId));
    const first =
      people.find((person) => (person.kind === 'cast' || person.kind === 'talent') && !collected.has(person.id)) ??
      people.find((person) => !collected.has(person.id)) ??
      people[0];
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

  const patchCallSheet = (updates: NonNullable<ProductionDay['callSheet']>) => {
    const lifecycleOnly = Object.keys(updates).every((key) => key === 'status' || key === 'issues');
    updateDay(selectedDay.id, {
      callSheet: {
        ...selectedDay.callSheet,
        ...updates,
        ...(lifecycleOnly ? {} : { status: 'draft' as const }),
      },
    });
  };

  const issues = selectedDay.callSheet?.issues ?? [];
  const latestIssue = issues.at(-1);
  const latestSnapshot = latestIssue ? parseIssuedCallSheet(latestIssue.snapshotJson) : null;
  const changesSinceIssue = diffCallSheetSnapshots(latestSnapshot, sheet);
  // An issued snapshot is immutable. As soon as any derived source changes,
  // the live document becomes a draft again and must not keep wearing the old
  // revision number or issued timestamp.
  const liveSheet: CallSheetData = latestIssue && changesSinceIssue.length > 0
    ? { ...sheet, isDraft: true, revision: undefined, issuedAt: undefined }
    : sheet;

  const issueCurrentSheet = () => {
    const issuedAt = new Date().toISOString();
    const revision = Math.max(0, ...issues.map((issue) => issue.revision)) + 1;
    const issuedSheet: CallSheetData = {
      ...sheet,
      isDraft: false,
      revision,
      issuedAt,
    };
    const personIds = [...new Set([...sheet.cast, ...sheet.crew].flatMap((person) => person.id ? [person.id] : []))];
    updateDay(selectedDay.id, {
      callSheet: {
        ...selectedDay.callSheet,
        status: 'final',
        issues: [
          ...issues,
          {
            id: createId('call-sheet-issue'),
            revision,
            issuedAt,
            snapshotJson: JSON.stringify(issuedSheet),
            acknowledgements: personIds.map((personId) => ({ personId })),
          },
        ],
      },
    });
  };

  /** Direct PDF download (no print dialog). Issued snapshots render from the
   * frozen REV data, so the file can never drift from its revision. */
  const downloadSheetPdf = (data: CallSheetData) => {
    void (async () => {
      const bytes = await createCallSheetPdf(callSheetPdfInputFromData(data));
      downloadBlob(
        bytesToBlob(bytes, 'application/pdf'),
        buildCallSheetPdfFilename({
          productionTitle: project.title,
          dayName: selectedDay.name,
          ...(data.revision === undefined ? {} : { revision: data.revision }),
          ...(selectedDay.date && /^\d{4}-\d{2}-\d{2}$/.test(selectedDay.date) ? { date: selectedDay.date } : {}),
        }),
      );
    })();
  };

  const toggleAcknowledgement = (personId: string) => {
    if (!latestIssue) return;
    const nextIssues = issues.map((issue) =>
      issue.id !== latestIssue.id
        ? issue
        : {
            ...issue,
            acknowledgements: issue.acknowledgements.map((acknowledgement) =>
              acknowledgement.personId === personId
                ? {
                    ...acknowledgement,
                    confirmedAt: acknowledgement.confirmedAt ? undefined : new Date().toISOString(),
                  }
                : acknowledgement,
            ),
          },
    );
    updateDay(selectedDay.id, {
      callSheet: { ...selectedDay.callSheet, issues: nextIssues },
    });
  };

  const downloadCalendar = (contents: string, suffix: string) => {
    downloadBlob(
      new Blob([contents], { type: 'text/calendar;charset=utf-8' }),
      `${safeFileName(project.title, 'production').toLowerCase()}_${suffix}.ics`,
    );
  };

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
              <button key={day.id} onClick={() => onSelectDay(day.id)} aria-pressed={active} className={`w-full rounded-lg px-2.5 py-2.5 text-left border transition-colors ${active ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-950' : isLight ? 'bg-white border-slate-200 hover:border-slate-400' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`}>
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
                    <ProjectImage imageRef={project.logo} alt="Production logo" className="max-w-full max-h-full object-contain" />
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
                          .then(({ ref, name }) => updateProjectMeta({ logo: ref, logoName: name }))
                          .catch(() => { void notice({ title: 'Logo unreadable', message: 'Could not load that image as a logo.' }); });
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

            {/* Draft is the default, so this toggle records the decision to
                issue rather than the decision to hold. */}
            <label className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-slate-500">
              <input
                type="checkbox"
                checked={(selectedDay.callSheet?.status ?? 'draft') === 'draft'}
                onChange={(event) => patchCallSheet({ status: event.target.checked ? 'draft' : 'final' })}
                className="accent-rose-600"
              />
              Draft — watermark the sheet
            </label>

            <label className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-slate-500">
              <input
                type="checkbox"
                checked={selectedDay.callSheet?.hideCastContacts !== true}
                onChange={(event) => patchCallSheet({ hideCastContacts: !event.target.checked })}
                className="accent-cyan-600"
              />
              Include cast contact numbers
            </label>

            {/* Where the day shoots, and whether the sheet can print an
                address for it. A set that came straight from a scene heading
                has none until it is linked to a project location — which is
                offered here, on the sheet that needs it, not on a report page. */}
            <div className={`rounded-lg border p-2 space-y-1.5 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/60'}`}>
              <div className="text-[9px] font-bold uppercase text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> Locations on this sheet</div>
              {sheet.locations.length === 0 && <p className="text-[10px] text-amber-600">Nothing scheduled names a location yet. Scenes take theirs from the heading; setups from their location field.</p>}
              {sheet.locations.map((location, index) => (
                <div key={index} className="text-[10px] flex items-center gap-1.5 flex-wrap">
                  <b className="truncate">{location.name}</b>
                  {location.address && <span className="text-slate-500 truncate">{location.address}</span>}
                  {/* Always offered, linked or not: a wrong link is changed here
                      by picking another location, or undone with Unlink. */}
                  <SetLocationLink setName={location.setName ?? location.name} isLight={isLight} />
                </div>
              ))}
            </div>

            <LocationMapCapture
              day={selectedDay}
              locations={sheet.locations}
              patchCallSheet={patchCallSheet}
              isLight={isLight}
            />

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
            <div className="flex items-center justify-between mb-3 gap-3">
              <div><div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Live document preview</div><div className="text-xs font-bold">{sheet.warnings.length ? `${sheet.warnings.length} readiness warning${sheet.warnings.length === 1 ? '' : 's'}` : changesSinceIssue.length ? `Draft · changed since Rev ${latestIssue?.revision}` : latestIssue ? `Issued revision ${latestIssue.revision}` : 'Ready to issue'}</div></div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadCalendar(shootingDaysToIcs(days, project.title), 'shooting-days')}
                  title="Download all dated shooting days as an iCalendar file"
                  className={`h-9 px-2.5 rounded-lg border text-[11px] font-black flex items-center gap-1.5 ${isLight ? 'bg-white border-slate-300 hover:bg-slate-100' : 'bg-slate-900 border-slate-700 hover:bg-slate-800'}`}
                >
                  <CalendarDays className="w-3.5 h-3.5" /> .ics
                </button>
                <button
                  onClick={issueCurrentSheet}
                  disabled={sheet.warnings.length > 0}
                  title={sheet.warnings.length ? 'Resolve readiness warnings before issuing' : 'Freeze and issue a new revision'}
                  className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-black flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> Issue {latestIssue ? `Rev ${latestIssue.revision + 1}` : 'Rev 1'}
                </button>
                <PdfExportButton onClick={() => onPrint(selectedDay, liveSheet)} title="Call Sheet als PDF exportieren" className="!h-9 !w-9 !border-sky-600 !bg-sky-600 !text-white hover:!bg-sky-500" />
                <button
                  onClick={() => downloadSheetPdf(liveSheet)}
                  title="Download the live sheet as PDF (no print dialog)"
                  className="h-9 px-3 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-[11px] font-black flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" /> PDF
                </button>
              </div>
            </div>

            {people.length > 0 && (
              <div className={`mb-3 rounded-lg border p-2 flex items-center gap-2 ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'}`}>
                <span className="text-[9px] font-bold uppercase text-slate-500">Personal call calendar</span>
                <select value={calendarPersonId} onChange={(event) => setCalendarPersonId(event.target.value)} className={`${fieldClass} py-1.5 flex-1`}>
                  <option value="">Choose crew or cast…</option>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
                </select>
                <button
                  disabled={!calendarPersonId}
                  onClick={() => {
                    const person = people.find((candidate) => candidate.id === calendarPersonId);
                    if (person) {
                      downloadCalendar(
                        personalCallsToIcs(days, project.title, person.id, person.displayName),
                        safeFileName(person.displayName, 'call-times').toLowerCase(),
                      );
                    }
                  }}
                  className="h-8 px-2.5 rounded-lg bg-violet-600 text-white text-[10px] font-bold disabled:opacity-40"
                >
                  Download .ics
                </button>
              </div>
            )}

            {latestIssue && (
              <div className={`mb-3 rounded-xl border p-3 text-[10px] ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'}`}>
                <div className="flex items-center justify-between gap-2">
                  <strong className="uppercase tracking-wide">Rev {latestIssue.revision} · {new Date(latestIssue.issuedAt).toLocaleString()}</strong>
                  <div className="flex items-center gap-2">
                    <span className={changesSinceIssue.length ? 'text-amber-500' : 'text-emerald-500'}>
                      {changesSinceIssue.length ? `${changesSinceIssue.length} change(s) since issue` : 'Current document matches issue'}
                    </span>
                    {latestSnapshot && (
                      <>
                        <button
                          onClick={() => onPrint(selectedDay, latestSnapshot)}
                          title={`Print the immutable issued Rev ${latestIssue.revision}`}
                          className={`h-7 px-2 rounded-md border font-bold flex items-center gap-1 ${isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'}`}
                        >
                          <Printer className="w-3 h-3" /> Print issued Rev {latestIssue.revision}
                        </button>
                        <button
                          onClick={() => downloadSheetPdf(latestSnapshot)}
                          title={`Download the immutable issued Rev ${latestIssue.revision} as PDF`}
                          className={`h-7 px-2 rounded-md border font-bold flex items-center gap-1 ${isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'}`}
                        >
                          <FileText className="w-3 h-3" /> PDF Rev {latestIssue.revision}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {changesSinceIssue.length > 0 && (
                  <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    {changesSinceIssue.map((change) => (
                      <li key={change.field}><b>{change.field}:</b> {change.before} → {change.after}</li>
                    ))}
                  </ul>
                )}
                {latestIssue.acknowledgements.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-inherit">
                    <div className="font-bold uppercase tracking-wide mb-1.5">Manual confirmations</div>
                    <div className="flex flex-wrap gap-1.5">
                      {latestIssue.acknowledgements.map((acknowledgement) => {
                        const person = people.find((candidate) => candidate.id === acknowledgement.personId);
                        return (
                          <button
                            key={acknowledgement.personId}
                            onClick={() => toggleAcknowledgement(acknowledgement.personId)}
                            className={`px-2 py-1 rounded-full border flex items-center gap-1 ${acknowledgement.confirmedAt ? 'border-emerald-500 text-emerald-600' : isLight ? 'border-slate-300' : 'border-slate-700'}`}
                          >
                            <CheckCircle2 className="w-3 h-3" /> {person?.displayName ?? 'Removed person'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* The real printed sheet, not a second rendering of it.
                Maintaining a separate preview meant every block added to the
                printout had to be added here too, and three were missed —
                walkie channels, unit base and pick-ups were reported as "not
                getting added to the call sheet" when they had been on the
                printout all along, and the heads-of-department block had the
                same gap. `CallSheetPrintView` carries its own styles, so it
                renders on screen exactly as it prints. */}
            <article className="mx-auto bg-white text-slate-950 shadow-xl border border-slate-300 min-h-[720px] p-6">
              <CallSheetPrintView sheet={liveSheet} />
            </article>
          </section>
        </div>
      </div>
    </div>
  );
};
