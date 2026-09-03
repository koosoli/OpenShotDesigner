import React from 'react';
import { ProjectImage } from '../common/ProjectImage';
import { buildMonthGrid, monthLabel, yearMonthOf } from '../../domain/scheduling';

export interface PrintableCalendarEvent {
  title: string;
  startDate: string;
  endDate: string;
  category: string;
  status?: string;
  /** User-picked line color (ProductionCalendarEvent.color); undefined = default violet. */
  color?: string;
}

export interface PrintableCalendarDay {
  name: string;
  date?: string;
  crewCall?: string;
  plannedWrap?: string;
  totalMinutes?: number;
  items?: string[];
}

interface ScheduleCalendarPrintViewProps {
  productionTitle: string;
  company?: string;
  /** Production logo (data URL) shown top-right of the masthead. */
  logo?: string;
  events: PrintableCalendarEvent[];
  days: PrintableCalendarDay[];
  mode: 'timeline' | 'month' | 'list';
  /** Month currently visible in the calendar, as YYYY-MM. */
  yearMonth: string;
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

/** Fallback for lines without an explicit color (matches the timeline default). */
const DEFAULT_EVENT_COLOR = '#7c3aed';

const isoDayNumber = (iso: string): number => {
  const [year, month, day] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
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
  logo,
  events,
  days,
  mode,
  yearMonth,
}) => {
  const generatedAt = new Intl.DateTimeFormat('en-CA').format(new Date());
  const firstDate = days.find((day) => day.date)?.date ?? events[0]?.startDate ?? generatedAt;
  const printedMonth = mode === 'month' ? yearMonth : yearMonthOf(firstDate);
  const month = buildMonthGrid(printedMonth);
  const timelineDates = [
    ...events.flatMap((event) => [event.startDate, event.endDate]),
    ...days.flatMap((day) => day.date ? [day.date] : []),
  ];
  const timelineStart = timelineDates.length > 0 ? Math.min(...timelineDates.map(isoDayNumber)) : isoDayNumber(generatedAt);
  const timelineEnd = timelineDates.length > 0 ? Math.max(...timelineDates.map(isoDayNumber)) : timelineStart;
  const timelineSpan = Math.max(1, timelineEnd - timelineStart + 1);

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
        .sc-headrow { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .sc-logo { max-width: 42mm; max-height: 16mm; object-fit: contain; flex-shrink: 0; margin-left: auto; }
        .sc-section-title { font-size: 9px; letter-spacing: 1.8px; text-transform: uppercase; font-weight: 900; color: #fff; background: #0e7490; padding: 3px 7px; margin: 12px 0 0; page-break-after: avoid; break-after: avoid; }
        .sc-section-title.dark { background: #0f172a; }
        .sc-table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .sc-table th, .sc-table td { border: 1px solid #cbd5e1; padding: 3.5px 6px; text-align: left; vertical-align: top; }
        .sc-table th { background: #f1f5f9; text-transform: uppercase; font-size: 8px; letter-spacing: 0.8px; color: #475569; }
        .sc-table td.num, .sc-table th.num { text-align: right; white-space: nowrap; font-family: 'Courier New', monospace; }
        .sc-table td.time { font-family: 'Courier New', monospace; font-weight: 700; white-space: nowrap; }
        .sc-badge { display: inline-block; padding: 0 4px; border-radius: 2px; background: #e2e8f0; font-size: 7.5px; letter-spacing: 0.6px; text-transform: uppercase; font-weight: 700; }
        .sc-event > td:first-child { border-left: 3px solid var(--tone, #7c3aed); }
        .sc-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: 1px; background: var(--tone, #7c3aed); }
        .sc-cat { background: #e2e8f0; background: color-mix(in srgb, var(--tone, #7c3aed) 14%, #ffffff); color: var(--tone, #334155); }
        .sc-footer { margin-top: 14px; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 8.5px; color: #475569; display: flex; justify-content: space-between; gap: 10px; }
        .sc-footer p { margin: 0; }
        .sc-month { display: grid; grid-template-columns: repeat(7, 1fr); border-left: 1px solid #cbd5e1; border-top: 1px solid #cbd5e1; }
        .sc-month > div { min-height: 22mm; padding: 2mm; border-right: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; font-size: 8px; overflow: hidden; }
        .sc-month .outside { color: #94a3b8; background: #f8fafc; }
        .sc-month-head > div { min-height: auto; text-align: center; text-transform: uppercase; font-weight: 800; background: #e2e8f0; }
        .sc-month-date { font: 700 9px 'Courier New', monospace; margin-bottom: 1mm; }
        .sc-month-item { display: block; margin-top: 1mm; padding: 0.5mm 1mm; border-radius: 1mm; background: #fef3c7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sc-timeline { border: 1px solid #cbd5e1; border-top: 0; }
        .sc-timeline-row { display: grid; grid-template-columns: 38mm 1fr; min-height: 9mm; border-top: 1px solid #e2e8f0; }
        .sc-timeline-label { padding: 2mm; font-size: 8.5px; overflow: hidden; }
        .sc-timeline-label small { display: block; color: #64748b; font-family: 'Courier New', monospace; }
        .sc-timeline-track { position: relative; margin: 2mm; background: repeating-linear-gradient(90deg, #f8fafc, #f8fafc 9.8%, #e2e8f0 10%); }
        .sc-timeline-bar { position: absolute; top: 1.2mm; height: 3.5mm; min-width: 1.5mm; border-radius: 2mm; background: var(--tone, #7c3aed); }
        .sc-timeline-day { position: absolute; top: 0.5mm; width: 2mm; height: 5mm; border-radius: 1mm; background: #d97706; }
        .sc-schedule-items { margin: 1mm 0 0; padding-left: 4mm; font-size: 8px; color: #475569; }
      `}</style>
      <div className="sc-doc">
        <header className="sc-masthead">
          <div className="sc-headrow">
            <div>
              <p className="sc-kicker">{company ? `${company} · ` : ''}Production schedule · {mode}</p>
              <h1 className="sc-title">{productionTitle}</h1>
              <p className="sc-company">Generated {generatedAt}</p>
            </div>
            {logo && <ProjectImage imageRef={logo} alt="Production logo" className="sc-logo" />}
          </div>
        </header>

        {mode === 'month' && (
          <section>
            <h2 className="sc-section-title dark">{monthLabel(printedMonth)}</h2>
            <div className="sc-month sc-month-head">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day}>{day}</div>)}</div>
            <div className="sc-month">
              {month.weeks.flat().map((cell) => {
                const work = days.filter((day) => day.date === cell.iso);
                const lines = events.filter((event) => event.startDate <= cell.iso && event.endDate >= cell.iso);
                return (
                  <div key={cell.iso} className={cell.inMonth ? '' : 'outside'}>
                    <div className="sc-month-date">{cell.dayOfMonth}</div>
                    {work.map((day) => <span key={day.name} className="sc-month-item"><strong>{day.name}</strong> · {day.crewCall ?? 'call TBD'}</span>)}
                    {lines.slice(0, 2).map((event) => <span key={event.title} className="sc-month-item" style={{ borderLeft: `2px solid ${event.color ?? DEFAULT_EVENT_COLOR}` }}>{event.title}</span>)}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {mode === 'timeline' && (
          <section>
            <h2 className="sc-section-title dark">Timeline · {timelineDates.length > 0 ? `${timelineDates.sort()[0]} — ${timelineDates.sort().at(-1)}` : 'No dated items'}</h2>
            <div className="sc-timeline">
              {events.map((event, index) => {
                const left = ((isoDayNumber(event.startDate) - timelineStart) / timelineSpan) * 100;
                const width = ((isoDayNumber(event.endDate) - isoDayNumber(event.startDate) + 1) / timelineSpan) * 100;
                return (
                  <div className="sc-timeline-row" key={`timeline-event-${index}`}>
                    <div className="sc-timeline-label"><strong>{event.title}</strong><small>{event.startDate} — {event.endDate}</small></div>
                    <div className="sc-timeline-track"><span className="sc-timeline-bar" style={{ left: `${left}%`, width: `${width}%`, '--tone': event.color ?? DEFAULT_EVENT_COLOR } as React.CSSProperties} /></div>
                  </div>
                );
              })}
              {days.filter((day) => day.date).map((day, index) => {
                const left = ((isoDayNumber(day.date!) - timelineStart) / timelineSpan) * 100;
                return (
                  <div className="sc-timeline-row" key={`timeline-day-${index}`}>
                    <div className="sc-timeline-label"><strong>{day.name}</strong><small>{day.date}</small></div>
                    <div className="sc-timeline-track"><span className="sc-timeline-day" style={{ left: `${left}%` }} /></div>
                  </div>
                );
              })}
              {events.length === 0 && days.every((day) => !day.date) && <p>No dated timeline items yet.</p>}
            </div>
          </section>
        )}

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
                  <tr key={`event-${i}`} className="sc-event" style={{ '--tone': event.color ?? DEFAULT_EVENT_COLOR } as React.CSSProperties}>
                    <td><span className="sc-dot" /><strong>{event.title}</strong></td>
                    <td className="time">{event.startDate}</td>
                    <td className="time">{event.endDate}</td>
                    <td><span className="sc-badge sc-cat">{CATEGORY_LABELS[event.category] ?? event.category}</span></td>
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
                  <th style={{ width: '22mm' }}>Date</th>
                  <th>Schedule</th>
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
                    <td>{day.items && day.items.length > 0 ? <ol className="sc-schedule-items">{day.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}</ol> : '—'}</td>
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
