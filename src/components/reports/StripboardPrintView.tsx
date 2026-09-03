import React from 'react';
import { ProjectImage } from '../common/ProjectImage';
import { formatPageEighths } from '../../domain/reports';

export interface PrintableStripboardItem {
  label: string;
  kindLabel: string;
  minutes?: number;
  /** Hex accent mirroring the on-screen strip color (see SchedulePanel); undefined = neutral. */
  tone?: string;
  castNumbers?: number[];
  pageEighths?: number;
}

export interface PrintableStripboardDay {
  id: string;
  name: string;
  date?: string;
  crewCall?: string;
  plannedWrap?: string;
  items: PrintableStripboardItem[];
  totalMinutes: number;
}

interface StripboardPrintViewProps {
  productionTitle: string;
  company?: string;
  /** Production logo (data URL) shown top-right of the masthead. */
  logo?: string;
  days: PrintableStripboardDay[];
}

/** "3h 15m" / "45m" / "—" for missing estimates (never silently 0). */
const formatMinutes = (total: number | undefined): string => {
  if (total === undefined) return '—';
  if (total <= 0) return '0m';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m`.trim() : `${m}m`;
};

/**
 * Self-contained printable stripboard (the schedule Board tab as paper).
 * Render inside a `.schedule-print-host` container: off-screen on screen,
 * the only visible document in print media.
 */
export const StripboardPrintView: React.FC<StripboardPrintViewProps> = ({
  productionTitle,
  company,
  logo,
  days,
}) => {
  const generatedAt = new Intl.DateTimeFormat('en-CA').format(new Date());
  const grandTotal = days.reduce((sum, day) => sum + day.totalMinutes, 0);

  return (
    <>
      <style>{`
        .schedule-print-host {
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
          .schedule-print-host { position: static !important; left: 0 !important; width: auto !important; }
        }
        .sb-doc { padding: 6mm 4mm; color: #0f172a; background: #fff; font-size: 10.5px; line-height: 1.35; }
        .sb-doc * { box-sizing: border-box; }
        .sb-masthead { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: stretch; border-bottom: 3px solid #0f172a; padding-bottom: 8px; margin-bottom: 4px; }
        .sb-kicker { font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase; color: #0e7490; font-weight: 700; margin: 0 0 3px; }
        .sb-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; line-height: 1.05; letter-spacing: -0.3px; }
        .sb-sub { font-size: 10px; font-weight: 700; margin: 4px 0 0; color: #334155; }
        .sb-company { font-size: 9px; color: #475569; margin: 4px 0 0; }
        .sb-meta { text-align: right; font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
        .sb-logo { max-width: 42mm; max-height: 16mm; object-fit: contain; margin-bottom: 4px; }
        .sb-day-head { display: flex; justify-content: space-between; gap: 10px; background: #0f172a; color: #fff; padding: 5px 8px; margin: 14px 0 0; page-break-after: avoid; break-after: avoid; page-break-inside: avoid; }
        .sb-day-name { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; }
        .sb-day-facts { font-size: 9px; font-family: 'Courier New', monospace; font-weight: 700; }
        .sb-day-date { display: inline-block; margin-left: 3mm; padding-left: 3mm; border-left: 1px solid #64748b; color: #67e8f9; }
        .sb-table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .sb-table th, .sb-table td { border: 1px solid #cbd5e1; padding: 3.5px 6px; text-align: left; vertical-align: top; }
        .sb-table th { background: #f1f5f9; text-transform: uppercase; font-size: 8px; letter-spacing: 0.8px; color: #475569; }
        .sb-table td.num, .sb-table th.num { text-align: right; white-space: nowrap; font-family: 'Courier New', monospace; }
        .sb-item > td:first-child { border-left: 3px solid var(--tone, #cbd5e1); }
        .sb-kind { display: inline-block; padding: 0 4px; border-radius: 2px; background: #e2e8f0; background: color-mix(in srgb, var(--tone, #94a3b8) 16%, #ffffff); font-size: 7.5px; letter-spacing: 0.6px; text-transform: uppercase; font-weight: 700; }
        .sb-total-row td { font-weight: 700; background: #f8fafc; }
        .sb-footer { margin-top: 14px; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 8.5px; color: #475569; display: flex; justify-content: space-between; gap: 10px; }
        .sb-footer p { margin: 0; }
      `}</style>
      <div className="sb-doc">
        <header className="sb-masthead">
          <div>
            <p className="sb-kicker">{company ? `${company} · ` : ''}Production schedule · Stripboard</p>
            <h1 className="sb-title">{productionTitle}</h1>
            <p className="sb-company">{days.length} shooting day{days.length === 1 ? '' : 's'} · generated {generatedAt}</p>
          </div>
          <div className="sb-meta">
            {logo && <ProjectImage imageRef={logo} alt="Production logo" className="sb-logo" />}
            <div>Total estimated</div>
            <div style={{ fontSize: 20, color: '#0f172a', fontFamily: "'Courier New', monospace" }}>{formatMinutes(grandTotal)}</div>
          </div>
        </header>

        {days.length === 0 && <p>No shooting days scheduled yet.</p>}

        {days.map((day) => (
          <section key={day.id}>
            <div className="sb-day-head">
              <span className="sb-day-name">Shooting day {day.name}<span className="sb-day-date">Date: {day.date ?? 'NOT SET'}</span></span>
              <span className="sb-day-facts">
                CALL {day.crewCall ?? '—'} · WRAP {day.plannedWrap ?? '—'}
              </span>
            </div>
            <table className="sb-table">
              <thead>
                <tr>
                  <th className="num" style={{ width: '8mm' }}>#</th>
                  <th>Item</th>
                  <th style={{ width: '18mm' }}>Type</th>
                  <th className="num" style={{ width: '17mm' }}>Pages</th>
                  <th className="num" style={{ width: '18mm' }}>Cast #</th>
                  <th className="num" style={{ width: '18mm' }}>Est.</th>
                </tr>
              </thead>
              <tbody>
                {day.items.map((item, i) => (
                  <tr key={`item-${i}`} className="sb-item" style={{ '--tone': item.tone } as React.CSSProperties}>
                    <td className="num">{i + 1}</td>
                    <td>{item.label}</td>
                    <td><span className="sb-kind">{item.kindLabel}</span></td>
                    <td className="num">{formatPageEighths(item.pageEighths)}</td>
                    <td className="num">{item.castNumbers?.join(', ') || '—'}</td>
                    <td className="num">{formatMinutes(item.minutes)}</td>
                  </tr>
                ))}
                <tr className="sb-total-row">
                  <td colSpan={5}>Day total</td>
                  <td className="num">{formatMinutes(day.totalMinutes)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        ))}

        <footer className="sb-footer">
          <p>Generated from project data · {generatedAt}</p>
          <p>All times are estimates for planning purposes only.</p>
        </footer>
      </div>
    </>
  );
};
