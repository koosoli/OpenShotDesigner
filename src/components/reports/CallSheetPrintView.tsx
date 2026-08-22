import React from 'react';
import type { CallSheetData, CallSheetEntry, CallSheetPerson } from '../../domain/reports';
import { locationMapLinkUrl } from '../../domain/locations';
import { classifyDepartment, CREW_DEPARTMENTS } from '../../domain/reports/crewSheet';

interface CallSheetPrintViewProps {
  sheet: CallSheetData;
}

const KIND_LABELS: Record<CallSheetEntry['kind'], string> = {
  scene: 'Scene',
  setup: 'Setup',
  segment: 'Segment',
  manual: 'Banner',
  shots: 'Shots',
  cue: 'Cue',
};

/** Badge tones mirroring the schedule board strip colors (see SchedulePanel). */
const KIND_TONES: Record<CallSheetEntry['kind'], string> = {
  scene: '#b45309',
  setup: '#0e7490',
  segment: '#4f46e5',
  manual: '#059669',
  shots: '#7c3aed',
  cue: '#db2777',
};

const DEPARTMENT_LABELS: Record<string, string> = {
  camera: 'Camera',
  lighting: 'Lighting / Electric',
  audio: 'Sound',
  video: 'Video',
  stage: 'Stage / Grip',
  production: 'Production',
  other: 'Other departments',
};

/** "3h 15m" / "45m" / "—" for missing estimates (never silently 0). */
const formatMinutes = (total: number | undefined): string => {
  if (total === undefined) return '—';
  if (total <= 0) return '0m';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m`.trim() : `${m}m`;
};

const joinDefined = (parts: (string | undefined)[]): string => parts.filter(Boolean).join(' · ');

const groupCrew = (crew: CallSheetPerson[]): Array<{ department: string; people: CallSheetPerson[] }> => {
  const buckets = new Map<string, CallSheetPerson[]>();
  for (const person of crew) {
    const key = classifyDepartment(person.department);
    const bucket = buckets.get(key) ?? [];
    bucket.push(person);
    buckets.set(key, bucket);
  }
  return CREW_DEPARTMENTS.filter((department) => buckets.has(department)).map((department) => ({
    department: DEPARTMENT_LABELS[department] ?? department,
    people: buckets.get(department) ?? [],
  }));
};

/**
 * Self-contained printable call-sheet document. Render inside a
 * `.call-sheet-print-host` container (see the embedded style block): on screen
 * it sits off-screen; in print media only this document is shown.
 */
export const CallSheetPrintView: React.FC<CallSheetPrintViewProps> = ({ sheet }) => {
  const generatedAt = new Date().toISOString().split('T')[0];
  const crewGroups = groupCrew(sheet.crew);
  const companyLine = [sheet.productionCompanyInfo?.address, sheet.productionCompanyInfo?.phone, sheet.productionCompanyInfo?.email, sheet.productionCompanyInfo?.website]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <style>{`
        .call-sheet-print-host {
          position: absolute;
          left: -10000px;
          top: 0;
          width: 190mm;
          background: #ffffff;
          color: #0f172a;
          font-family: Arial, Helvetica, sans-serif;
        }
        @media print {
          body #app-root { display: none !important; }
          .call-sheet-print-host { position: static !important; left: 0 !important; width: auto !important; }
        }
        .cs-doc { padding: 6mm 4mm; color: #0f172a; background: #fff; font-size: 10.5px; line-height: 1.35; }
        .cs-doc * { box-sizing: border-box; }
        .cs-masthead { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: stretch; border-bottom: 3px solid #0f172a; padding-bottom: 8px; }
        .cs-kicker { font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase; color: #0e7490; font-weight: 700; margin: 0 0 3px; }
        .cs-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; line-height: 1.05; letter-spacing: -0.3px; }
        .cs-day { font-size: 12px; font-weight: 700; margin: 4px 0 0; }
        .cs-company { font-size: 9px; color: #475569; margin: 4px 0 0; }
        .cs-callbox { text-align: right; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; gap: 6px; }
        .cs-callbox img { max-width: 42mm; max-height: 16mm; object-fit: contain; }
        .cs-call-label { font-size: 8px; letter-spacing: 1.5px; text-transform: uppercase; color: #64748b; font-weight: 700; }
        .cs-call-time { font-size: 30px; font-weight: 900; font-family: 'Courier New', monospace; line-height: 1; }
        .cs-call-date { font-size: 10px; font-weight: 700; }
        .cs-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #cbd5e1; border: 1px solid #cbd5e1; margin-top: 8px; }
        .cs-strip div { background: #f8fafc; padding: 5px 7px; }
        .cs-strip b { display: block; font-size: 7.5px; letter-spacing: 1px; text-transform: uppercase; color: #64748b; margin-bottom: 1px; }
        .cs-section-title { font-size: 9px; letter-spacing: 1.8px; text-transform: uppercase; font-weight: 900; color: #fff; background: #0f172a; padding: 3px 7px; margin: 12px 0 0; page-break-after: avoid; break-after: avoid; }
        .cs-section-title.accent { background: #0e7490; }
        .cs-section-title.ahead { background: #7c3aed; }
        .cs-table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .cs-table th, .cs-table td { border: 1px solid #cbd5e1; padding: 3.5px 6px; text-align: left; vertical-align: top; }
        .cs-table th { background: #f1f5f9; text-transform: uppercase; font-size: 8px; letter-spacing: 0.8px; color: #475569; }
        .cs-table td.num, .cs-table th.num { text-align: right; white-space: nowrap; font-family: 'Courier New', monospace; }
        .cs-table td.time { font-family: 'Courier New', monospace; font-weight: 700; white-space: nowrap; }
        .cs-total-row td { font-weight: 700; background: #f8fafc; }
        .cs-dept td { background: #e2e8f0; font-weight: 900; font-size: 8px; letter-spacing: 1.2px; text-transform: uppercase; }
        .cs-unresolved { color: #9f1239; font-style: italic; }
        .cs-omitted td { color: #64748b; }
        .cs-omitted .cs-item-label { text-decoration: line-through; }
        .cs-badge { display: inline-block; margin-left: 4px; padding: 0 3px; border: 1px solid #94a3b8; font-size: 7.5px; letter-spacing: 0.5px; text-transform: uppercase; border-radius: 2px; }
        .cs-kind { display: inline-block; padding: 0 4px; border-radius: 2px; background: #e2e8f0; background: color-mix(in srgb, var(--tone, #94a3b8) 16%, #ffffff); color: var(--tone, #334155); font-size: 7.5px; letter-spacing: 0.6px; text-transform: uppercase; font-weight: 700; }
        .cs-safety { border: 2px solid #f59e0b; background: #fffbeb; padding: 6px 9px; margin-top: 8px; page-break-inside: avoid; }
        .cs-safety b { display: block; font-size: 8px; letter-spacing: 1.2px; text-transform: uppercase; color: #92400e; }
        .cs-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .cs-notes { white-space: pre-wrap; }
        .cs-ahead { border: 1.5px solid #7c3aed; border-top: 0; padding: 6px 8px; background: #faf5ff; page-break-inside: avoid; }
        .cs-ahead-head { display: flex; justify-content: space-between; gap: 10px; font-weight: 700; margin-bottom: 3px; }
        .cs-ahead ol { margin: 2px 0 0; padding-left: 18px; }
        .cs-ahead li { margin: 1px 0; }
        .cs-ahead .muted { color: #64748b; font-weight: 400; }
        .cs-warnings { border: 1.5px solid #9f1239; padding: 6px 10px; margin-top: 10px; page-break-inside: avoid; }
        .cs-warnings ul { margin: 4px 0 0; padding-left: 18px; }
        .cs-footer { margin-top: 14px; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 8.5px; color: #475569; display: flex; justify-content: space-between; gap: 10px; }
        .cs-footer p { margin: 0; }
      `}</style>
      <div className="cs-doc">
        <header className="cs-masthead">
          <div>
            <p className="cs-kicker">{sheet.productionCompany ? `${sheet.productionCompany} · Call sheet` : 'Call sheet'} · {sheet.type}</p>
            <h1 className="cs-title">{sheet.productionTitle}</h1>
            <p className="cs-day">{sheet.dayName}</p>
            {companyLine && <p className="cs-company">{companyLine}</p>}
          </div>
          <div className="cs-callbox">
            {sheet.productionLogo && <img src={sheet.productionLogo} alt="Production logo" />}
            <div>
              <div className="cs-call-label">General crew call</div>
              <div className="cs-call-time">{sheet.crewCall ?? '—'}</div>
              <div className="cs-call-date">{sheet.date ?? 'DATE NOT SET'}</div>
            </div>
          </div>
        </header>

        <div className="cs-strip">
          <div><b>Planned wrap</b>{sheet.plannedWrap ?? '—'}</div>
          <div><b>Weather</b>{sheet.weatherSummary ?? '—'}</div>
          <div><b>Parking / access</b>{sheet.parking ?? '—'}</div>
          <div><b>Nearest hospital</b>{sheet.nearestHospital ?? '—'}</div>
        </div>

        {sheet.safetyNotes && (
          <section className="cs-safety">
            <b>Safety bulletin</b>
            <span className="cs-notes">{sheet.safetyNotes}</span>
          </section>
        )}

        <section>
          <h2 className="cs-section-title accent">Locations</h2>
          {sheet.locations.length > 0 ? (
            <table className="cs-table">
              <thead>
                <tr><th style={{ width: '36%' }}>Name</th><th>Address</th><th style={{ width: '18mm' }}>Map</th></tr>
              </thead>
              <tbody>
                {sheet.locations.map((loc, i) => (
                  <tr key={`loc-${i}`}>
                    <td><strong>{loc.name}</strong></td>
                    <td>{loc.address ?? '—'}</td>
                    <td><a href={locationMapLinkUrl(loc)} style={{ color: '#0e7490' }}>Open map</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No locations recorded for this day.</p>
          )}
        </section>

        <section>
          <h2 className="cs-section-title">Shooting schedule</h2>
          <table className="cs-table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th style={{ width: '14mm' }}>Start</th>
                <th>Item</th>
                <th style={{ width: '18mm' }}>Type</th>
                <th className="num">Est.</th>
              </tr>
            </thead>
            <tbody>
              {sheet.schedule.map((entry, i) => (
                <tr key={`entry-${i}`} className={entry.omitted ? 'cs-omitted' : undefined}>
                  <td className="num">{i + 1}</td>
                  <td className="time">{entry.scheduledStart ?? '—'}</td>
                  <td className={entry.unresolved ? 'cs-unresolved' : undefined}>
                    <span className="cs-item-label">{entry.label}</span>
                    {entry.omitted && <span className="cs-badge">Omitted</span>}
                  </td>
                  <td><span className="cs-kind" style={{ '--tone': KIND_TONES[entry.kind] } as React.CSSProperties}>{KIND_LABELS[entry.kind]}</span></td>
                  <td className="num">{formatMinutes(entry.estimatedMinutes)}</td>
                </tr>
              ))}
              <tr className="cs-total-row">
                <td colSpan={4}>Total estimated time</td>
                <td className="num">{formatMinutes(sheet.totalEstimatedMinutes ?? undefined)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <div className="cs-two">
          <section>
            <h2 className="cs-section-title accent">Cast</h2>
            {sheet.cast.length > 0 ? (
              <table className="cs-table">
                <thead><tr><th>Name</th><th>Role</th><th>Contact</th></tr></thead>
                <tbody>
                  {sheet.cast.map((p, i) => (
                    <tr key={`cast-${i}`}>
                      <td><strong>{p.displayName}</strong></td>
                      <td>{p.role ?? '—'}</td>
                      <td>{joinDefined([p.phone, p.email]) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No cast scheduled.</p>
            )}
          </section>
          <section>
            <h2 className="cs-section-title">Crew</h2>
            {sheet.crew.length > 0 ? (
              <table className="cs-table">
                <thead><tr><th>Name</th><th>Role</th><th>Contact</th></tr></thead>
                <tbody>
                  {crewGroups.map((group) => (
                    <React.Fragment key={group.department}>
                      <tr className="cs-dept"><td colSpan={3}>{group.department}</td></tr>
                      {group.people.map((p, i) => (
                        <tr key={`${group.department}-${i}`}>
                          <td><strong>{p.displayName}</strong></td>
                          <td>{p.role ?? '—'}</td>
                          <td>{joinDefined([p.phone, p.email]) || '—'}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No crew listed.</p>
            )}
          </section>
        </div>

        {(sheet.pickups.length > 0 || sheet.pickupNotes) && (
          <section>
            <h2 className="cs-section-title accent">Transport &amp; pick-ups</h2>
            {sheet.pickupNotes && (
              <p className="cs-notes" style={{ margin: '6px 0 0' }}>{sheet.pickupNotes}</p>
            )}
            {sheet.pickups.length > 0 && (
              <table className="cs-table" style={{ marginTop: sheet.pickupNotes ? '6px' : 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: '18mm' }}>Time</th>
                    <th style={{ width: '32%' }}>Name</th>
                    <th>Pick-up from</th>
                    <th style={{ width: '28%' }}>Contact / notes</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.pickups.map((pickup, i) => (
                    <tr key={`pickup-${i}`}>
                      <td className="time">{pickup.time ?? 'TBC'}</td>
                      <td>
                        <strong>{pickup.displayName}</strong>
                        {pickup.unresolved && ' (contact removed)'}
                        {pickup.role ? ` — ${pickup.role}` : ''}
                      </td>
                      <td>{pickup.location ?? 'TBC'}</td>
                      <td>{joinDefined([pickup.phone, pickup.notes]) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {sheet.generalNotes && (
          <section>
            <h2 className="cs-section-title">General notes</h2>
            <p className="cs-notes" style={{ margin: '6px 0 0' }}>{sheet.generalNotes}</p>
          </section>
        )}

        {sheet.lookAhead && (
          <section>
            <h2 className="cs-section-title ahead">Look ahead · {sheet.lookAhead.dayName}</h2>
            <div className="cs-ahead">
              <div className="cs-ahead-head">
                <span>{sheet.lookAhead.date ?? 'Date not set'} · crew call {sheet.lookAhead.crewCall ?? '—'}{sheet.lookAhead.plannedWrap ? ` · wrap ${sheet.lookAhead.plannedWrap}` : ''}</span>
                <span className="muted">{sheet.lookAhead.locations.map((loc) => loc.name).join(', ') || 'No location linked yet'}</span>
              </div>
              {sheet.lookAhead.items.length > 0 ? (
                <ol>
                  {sheet.lookAhead.items.map((item, i) => (
                    <li key={`ahead-${i}`} style={item.omitted ? { textDecoration: 'line-through', color: '#64748b' } : undefined}>
                      {item.label} <span className="muted">({KIND_LABELS[item.kind]})</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted" style={{ margin: 0 }}>Nothing scheduled yet.</p>
              )}
              {sheet.lookAhead.cast.length > 0 && (
                <p style={{ margin: '4px 0 0' }}><strong>Cast:</strong> {sheet.lookAhead.cast.map((p) => p.displayName).join(', ')}</p>
              )}
            </div>
          </section>
        )}

        {sheet.warnings.length > 0 && (
          <section className="cs-warnings">
            <strong>Readiness warnings</strong>
            <ul>
              {sheet.warnings.map((w, i) => (
                <li key={`warn-${i}`}>{w}</li>
              ))}
            </ul>
          </section>
        )}

        <footer className="cs-footer">
          <p>Generated from project data · {generatedAt}</p>
          <p>All times are estimates for planning purposes only and are not a safety or engineering certification.</p>
        </footer>
      </div>
    </>
  );
};
