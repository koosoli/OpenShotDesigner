import React from 'react';

export interface PrintableCalendarEvent {
  title: string;
  startDate: string;
  endDate: string;
  category: string;
  status?: string;
}

export interface PrintableCalendarDay {
  name: string;
  date?: string;
  crewCall?: string;
  plannedWrap?: string;
  totalMinutes?: number;
}

interface ScheduleCalendarPrintViewProps {
  productionTitle: string;
  company?: string;
  events: PrintableCalendarEvent[];
  days: PrintableCalendarDay[];
}

const CATEGORY_LABELS: Record<string, string> = {
  development: 'Development',
  preproduction: 'Pre-production',
  shoot: 'Shoot',
  post: 'Post',
  delivery: 'Delivery',
  custom: 'Other',
};

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

/** "3h 15m" / "45m" / "—" for missing estimates (never silently 0). */
const formatMinutes = (total: number | undefined): string => {
  if (total === undefined) return '—';
  if (total <= 0) return '0m';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m`.trim() : `${m}m`;
};

/**
 * Self-contained printable production calendar (the Timeline tab as paper):
 * milestone lines plus the dated shooting days with call/wrap and totals.
 */
export const ScheduleCalendarPrintView: React.FC<ScheduleCalendarPrintViewProps> = ({
  productionTitle,
  company,
  events,
  days,
}) => {
  const generatedAt = new Date().toISOString().split('T')[0];

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
        .sc-doc { padding: 6mm 4mm; color: #0f172a; background: #fff; font-size: 10.5px; line-height: 1.35; }
        .sc-doc * { box-sizing: border-box; }
        .sc-masthead { border-bottom: 3px solid #0f172a; padding-bottom: 8px; margin-bottom: 4px; }
        .sc-kicker { font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase; color: #0e7490; font-weight: 700; margin: 0 0 3px; }
        .sc-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; line-height: 1.05; letter-spacing: -0.3px; }
        .sc-company { font-size: 9px; color: #475569; margin: 4px 0 0; }
        .sc-section-title { font-size: 9px; letter-spacing: 1.8px; text-transform: uppercase; font-weight: 900; color: #fff; background: #0e7490; padding: 3px 7px; margin: 12px 0 0; page-break-after: avoid; break-after: avoid; }
        .sc-section-title.dark { background: #0f172a; }
        .sc-table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .sc-table th, .sc-table td { border: 1px solid #cbd5e1; padding: 3.5px 6px; text-align: left; vertical-align: top; }
        .sc-table th { background: #f1f5f9; text-transform: uppercase; font-size: 8px; letter-spacing: 0.8px; color: #475569; }
        .sc-table td.num, .sc-table th.num { text-align: right; white-space: nowrap; font-family: 'Courier New', monospace; }
        .sc-table td.time { font-family: 'Courier New', monospace; font-weight: 700; white-space: nowrap; }
        .sc-badge { display: inline-block; padding: 0 4px; border-radius: 2px; background: #e2e8f0; font-size: 7.5px; letter-spacing: 0.6px; text-transform: uppercase; font-weight: 700; }
        .sc-footer { margin-top: 14px; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 8.5px; color: #475569; display: flex; justify-content: space-between; gap: 10px; }
        .sc-footer p { margin: 0; }
      `}</style>
      <div className="sc-doc">
        <header className="sc-masthead">
          <p className="sc-kicker">{company ? `${company} · ` : ''}Production schedule · Calendar</p>
          <h1 className="sc-title">{productionTitle}</h1>
          <p className="sc-company">Generated {generatedAt}</p>
        </header>

        <section>
          <h2 className="sc-section-title">Production calendar lines</h2>
          {events.length > 0 ? (
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th style={{ width: '24mm' }}>Start</th>
                  <th style={{ width: '24mm' }}>End</th>
                  <th style={{ width: '28mm' }}>Category</th>
                  <th style={{ width: '22mm' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, i) => (
                  <tr key={`event-${i}`}>
                    <td><strong>{event.title}</strong></td>
                    <td className="time">{event.startDate}</td>
                    <td className="time">{event.endDate}</td>
                    <td>{CATEGORY_LABELS[event.category] ?? event.category}</td>
                    <td>{event.status ? STATUS_LABELS[event.status] ?? event.status : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No calendar lines yet.</p>
          )}
        </section>

        <section>
          <h2 className="sc-section-title dark">Shooting days</h2>
          {days.length > 0 ? (
            <table className="sc-table">
              <thead>
                <tr>
                  <th className="num" style={{ width: '8mm' }}>#</th>
                  <th>Day</th>
                  <th style={{ width: '24mm' }}>Date</th>
                  <th style={{ width: '16mm' }}>Call</th>
                  <th style={{ width: '16mm' }}>Wrap</th>
                  <th className="num" style={{ width: '18mm' }}>Est.</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day, i) => (
                  <tr key={`day-${i}`}>
                    <td className="num">{i + 1}</td>
                    <td><strong>{day.name}</strong></td>
                    <td className="time">{day.date ?? '—'}</td>
                    <td className="time">{day.crewCall ?? '—'}</td>
                    <td className="time">{day.plannedWrap ?? '—'}</td>
                    <td className="num">{formatMinutes(day.totalMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No shooting days scheduled yet.</p>
          )}
        </section>

        <footer className="sc-footer">
          <p>Generated from project data · {generatedAt}</p>
          <p>All times are estimates for planning purposes only.</p>
        </footer>
      </div>
    </>
  );
};
