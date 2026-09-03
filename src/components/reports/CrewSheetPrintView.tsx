import React from 'react';
import type { CrewSheetData } from '../../domain/reports/crewSheet';
import { CREW_DEPARTMENTS, CREW_SHEET_NOTE } from '../../domain/reports/crewSheet';
import { ProjectImage } from '../common/ProjectImage';

interface CrewSheetPrintViewProps {
  sheet: CrewSheetData;
  /** Production logo (data URL) shown top-right of the header. */
  logo?: string;
}

const DEPARTMENT_LABELS: Record<string, string> = {
  camera: 'Camera',
  lighting: 'Lighting',
  audio: 'Audio',
  video: 'Video',
  stage: 'Stage',
  production: 'Production',
  other: 'Other',
};

/**
 * Self-contained printable crew-sheet document (concert/broadcast, plan §16).
 * Render inside a `.crew-sheet-print-host` container (see the embedded style
 * block): on screen it sits off-screen; in print media only this document shows.
 */
export const CrewSheetPrintView: React.FC<CrewSheetPrintViewProps> = ({ sheet, logo }) => {
  const generatedAt = new Intl.DateTimeFormat('en-CA').format(new Date());

  return (
    <>
      <style>{`
        .crew-sheet-print-host {
          position: absolute;
          left: -10000px;
          top: 0;
          width: 190mm;
          background: #ffffff;
          color: #000000;
          font-family: Georgia, 'Times New Roman', serif;
        }
        @media print {
          /* Only the crew sheet prints: hide the whole app shell. */
          body #app-root { display: none !important; }
          .crew-sheet-print-host {
            position: static !important;
            left: 0 !important;
            width: auto !important;
          }
        }
        .cws-doc { padding: 6mm 4mm; color: #000; background: #fff; }
        .cws-doc * { box-sizing: border-box; }
        .cws-header { border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 14px; }
        .cws-headrow { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .cws-logo { max-width: 42mm; max-height: 16mm; object-fit: contain; flex-shrink: 0; margin-left: auto; }
        .cws-kicker { font-family: Arial, Helvetica, sans-serif; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 2px; }
        .cws-title { font-size: 24px; font-weight: bold; text-transform: uppercase; margin: 0 0 6px; line-height: 1.15; }
        .cws-meta { display: flex; flex-wrap: wrap; gap: 4px 18px; font-family: Arial, Helvetica, sans-serif; font-size: 11px; margin: 0; }
        .cws-meta strong { display: inline-block; min-width: 60px; }
        .cws-section-title { font-family: Arial, Helvetica, sans-serif; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin: 16px 0 6px; page-break-after: avoid; break-after: avoid; }
        .cws-table { width: 100%; border-collapse: collapse; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
        .cws-table th, .cws-table td { border: 1px solid #444; padding: 4px 6px; text-align: left; vertical-align: top; }
        .cws-table th { background: #eee; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.5px; }
        .cws-footer { margin-top: 20px; border-top: 1px solid #999; padding-top: 6px; font-family: Arial, Helvetica, sans-serif; font-size: 9.5px; color: #333; }
        .cws-footer p { margin: 0 0 2px; }
      `}</style>
      <div className="cws-doc">
        <header className="cws-header">
          <div className="cws-headrow">
            <div>
              <p className="cws-kicker">Crew Sheet</p>
              <h1 className="cws-title">{sheet.productionTitle}</h1>
              <p className="cws-meta">
                <span>
                  <strong>DAY:</strong> {sheet.dayName}
                </span>
                <span>
                  <strong>DATE:</strong> {sheet.date ?? '—'}
                </span>
                <span>
                  <strong>VENUE:</strong> {sheet.venue ?? '—'}
                </span>
              </p>
            </div>
            {logo && <ProjectImage imageRef={logo} alt="Production logo" className="cws-logo" />}
          </div>
        </header>

        <section>
          <h2 className="cws-section-title">Show day timeline</h2>
          {sheet.timeline.length > 0 ? (
            <table className="cws-table">
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Time</th>
                  <th>Item</th>
                </tr>
              </thead>
              <tbody>
                {sheet.timeline.map((entry, i) => (
                  <tr key={`tl-${i}`}>
                    <td>{entry.start ?? '—'}</td>
                    <td>{entry.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 11 }}>
              No run-of-show cues for this day.
            </p>
          )}
        </section>

        {CREW_DEPARTMENTS.map((bucket) => {
          const members = sheet.departments[bucket] ?? [];
          if (members.length === 0) return null;
          return (
            <section key={bucket}>
              <h2 className="cws-section-title">{DEPARTMENT_LABELS[bucket] ?? bucket}</h2>
              <table className="cws-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((p) => (
                    <tr key={`dept-${bucket}-${p.id}`}>
                      <td>{p.displayName}</td>
                      <td>{p.role ?? '—'}</td>
                      <td>{p.phone ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}

        {sheet.contacts.length === 0 && (
          <section>
            <h2 className="cws-section-title">Contacts</h2>
            <p style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 11 }}>
              No crew listed.
            </p>
          </section>
        )}

        <footer className="cws-footer">
          <p>Generated from project data · {generatedAt}</p>
          <p>{CREW_SHEET_NOTE}</p>
        </footer>
      </div>
    </>
  );
};
