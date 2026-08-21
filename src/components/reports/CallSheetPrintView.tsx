import React from 'react';
import type { CallSheetData, CallSheetEntry, CallSheetPerson } from '../../domain/reports';
import { locationMapLinkUrl } from '../../domain/locations';

interface CallSheetPrintViewProps {
  sheet: CallSheetData;
}

const KIND_LABELS: Record<CallSheetEntry['kind'], string> = {
  scene: 'Scene',
  setup: 'Setup',
  segment: 'Segment',
  manual: 'Manual',
  shots: 'Shots',
  cue: 'Cue',
};

/** "3h 15m" / "45m" / "—" for missing estimates (never silently 0). */
const formatMinutes = (total: number | undefined): string => {
  if (total === undefined) return '—';
  if (total <= 0) return '0m';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m`.trim() : `${m}m`;
};

const joinDefined = (parts: (string | undefined)[]): string =>
  parts.filter(Boolean).join(' · ');

/**
 * Self-contained printable call-sheet document. Render inside a
 * `.call-sheet-print-host` container (see the embedded style block): on screen
 * it sits off-screen; in print media only this document is shown.
 */
export const CallSheetPrintView: React.FC<CallSheetPrintViewProps> = ({ sheet }) => {
  const generatedAt = new Date().toISOString().split('T')[0];

  return (
    <>
      <style>{`
        .call-sheet-print-host {
          position: absolute;
          left: -10000px;
          top: 0;
          width: 190mm;
          background: #ffffff;
          color: #000000;
          font-family: Georgia, 'Times New Roman', serif;
        }
        @media print {
          /* Only the call sheet prints: hide the whole app shell. */
          body #app-root { display: none !important; }
          .call-sheet-print-host {
            position: static !important;
            left: 0 !important;
            width: auto !important;
          }
        }
        .cs-doc { padding: 6mm 4mm; color: #000; background: #fff; }
        .cs-doc * { box-sizing: border-box; }
        .cs-header { border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 14px; }
        .cs-kicker { font-family: Arial, Helvetica, sans-serif; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 2px; }
        .cs-title { font-size: 24px; font-weight: bold; text-transform: uppercase; margin: 0 0 6px; line-height: 1.15; }
        .cs-meta { display: flex; flex-wrap: wrap; gap: 4px 18px; font-family: Arial, Helvetica, sans-serif; font-size: 11px; margin: 0; }
        .cs-meta strong { display: inline-block; min-width: 70px; }
        .cs-section-title { font-family: Arial, Helvetica, sans-serif; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin: 16px 0 6px; page-break-after: avoid; break-after: avoid; }
        .cs-table { width: 100%; border-collapse: collapse; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
        .cs-table th, .cs-table td { border: 1px solid #444; padding: 4px 6px; text-align: left; vertical-align: top; }
        .cs-table th { background: #eee; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.5px; }
        .cs-table td.num, .cs-table th.num { text-align: right; white-space: nowrap; }
        .cs-total-row td { font-weight: bold; background: #f5f5f5; }
        .cs-unresolved { color: #7a0000; font-style: italic; }
        .cs-warnings { border: 1.5px solid #7a0000; padding: 6px 10px; font-family: Arial, Helvetica, sans-serif; font-size: 11px; page-break-inside: avoid; break-inside: avoid; }
        .cs-warnings ul { margin: 4px 0 0; padding-left: 18px; }
        .cs-warnings li { margin-bottom: 2px; }
        .cs-footer { margin-top: 20px; border-top: 1px solid #999; padding-top: 6px; font-family: Arial, Helvetica, sans-serif; font-size: 9.5px; color: #333; }
        .cs-footer p { margin: 0 0 2px; }
      `}</style>
      <div className="cs-doc">
        <header className="cs-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
            <div><p className="cs-kicker">{sheet.productionCompany ? `${sheet.productionCompany} · Call Sheet` : 'Call Sheet'}</p><h1 className="cs-title">{sheet.productionTitle}</h1></div>
            {sheet.productionLogo && <img src={sheet.productionLogo} alt="Production logo" style={{ maxWidth: '42mm', maxHeight: '18mm', objectFit: 'contain' }} />}
          </div>
          <p className="cs-meta">
            <span>
              <strong>DAY:</strong> {sheet.dayName}
            </span>
            <span>
              <strong>DATE:</strong> {sheet.date ?? '—'}
            </span>
            <span>
              <strong>CREW CALL:</strong> {sheet.crewCall ?? '—'}
            </span>
            <span>
              <strong>PLANNED WRAP:</strong> {sheet.plannedWrap ?? '—'}
            </span>
            <span>
              <strong>TYPE:</strong> {sheet.type.toUpperCase()}
            </span>
          </p>
          {(sheet.productionCompanyInfo?.address || sheet.productionCompanyInfo?.phone || sheet.productionCompanyInfo?.email || sheet.productionCompanyInfo?.website) && (
            <p style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 9.5, color: '#333', margin: '6px 0 0' }}>
              {[sheet.productionCompanyInfo?.address, sheet.productionCompanyInfo?.phone, sheet.productionCompanyInfo?.email, sheet.productionCompanyInfo?.website].filter(Boolean).join(' · ')}
            </p>
          )}
        </header>

        {(sheet.weatherSummary || sheet.parking || sheet.nearestHospital) && (
          <section>
            <h2 className="cs-section-title">Day information</h2>
            <table className="cs-table"><tbody>
              <tr><th>Weather</th><td>{sheet.weatherSummary ?? '—'}</td></tr>
              <tr><th>Parking / access</th><td>{sheet.parking ?? '—'}</td></tr>
              <tr><th>Nearest hospital</th><td>{sheet.nearestHospital ?? '—'}</td></tr>
            </tbody></table>
          </section>
        )}

        {(sheet.safetyNotes || sheet.generalNotes) && (
          <section>
            <h2 className="cs-section-title">Bulletins</h2>
            {sheet.safetyNotes && <p className="cs-warnings"><strong>Safety:</strong> {sheet.safetyNotes}</p>}
            {sheet.generalNotes && <p style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 11, whiteSpace: 'pre-wrap' }}>{sheet.generalNotes}</p>}
          </section>
        )}

        <section>
          <h2 className="cs-section-title">Locations</h2>
          {sheet.locations.length > 0 ? (
            <table className="cs-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Address</th>
                  <th style={{ width: '18mm' }}>Map</th>
                </tr>
              </thead>
              <tbody>
                {sheet.locations.map((loc, i) => (
                  <tr key={`loc-${i}`}>
                    <td>{loc.name}</td>
                    <td>{loc.address ?? '—'}</td>
                    <td><a href={locationMapLinkUrl(loc)} style={{ color: '#0369a1' }}>Open map</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="cs-table" style={{ border: 'none' }}>No locations recorded for this day.</p>
          )}
        </section>

        <section>
          <h2 className="cs-section-title">Schedule</h2>
          <table className="cs-table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Start</th>
                <th>Item</th>
                <th>Kind</th>
                <th className="num">Est. time</th>
              </tr>
            </thead>
            <tbody>
              {sheet.schedule.map((entry, i) => (
                <tr key={`entry-${i}`}>
                  <td className="num">{i + 1}</td>
                  <td className="num">{entry.scheduledStart ?? '—'}</td>
                  <td className={entry.unresolved ? 'cs-unresolved' : undefined}>{entry.label}</td>
                  <td>{KIND_LABELS[entry.kind]}</td>
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

        <section>
          <h2 className="cs-section-title">Cast</h2>
          {sheet.cast.length > 0 ? (
            <table className="cs-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>
                {sheet.cast.map((p, i) => (
                  <tr key={`cast-${i}`}>
                    <td>{p.displayName}</td>
                    <td>{p.role ?? '—'}</td>
                    <td>{joinDefined([p.phone, p.email]) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 11 }}>No cast scheduled.</p>
          )}
        </section>

        <section>
          <h2 className="cs-section-title">Crew</h2>
          {sheet.crew.length > 0 ? (
            <table className="cs-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department / Role</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>
                {sheet.crew.map((p, i) => (
                  <tr key={`crew-${i}`}>
                    <td>{p.displayName}</td>
                    <td>{joinDefined([p.department, p.role]) || '—'}</td>
                    <td>{joinDefined([p.phone, p.email]) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 11 }}>No crew listed.</p>
          )}
        </section>

        {sheet.warnings.length > 0 && (
          <section className="cs-warnings">
            <strong>Warnings</strong>
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
