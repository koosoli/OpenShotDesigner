import React from 'react';
import { ProjectImage } from '../common/ProjectImage';
import type { Project } from '../../types';
import { buildRunOfShowSheet } from '../../domain/scheduling/runOfShow';

export interface PrintableRunOfShowNote {
  department: string;
  text: string;
}

export interface PrintableRunOfShowCue {
  id: string;
  /** Position on the page, 1-based: the number the caller says out loud. */
  number: number;
  label: string;
  segmentName?: string;
  /** Resolved start, seconds past midnight; null prints as "—". */
  startSeconds: number | null;
  /** null prints as "—", never as 0 — an unknown length is not a zero-length cue. */
  durationSeconds: number | null;
  notes: PrintableRunOfShowNote[];
}

export interface PrintableRunOfShowIssue {
  severity: string;
  message: string;
}

export interface RunOfShowPrintViewProps {
  productionTitle: string;
  company?: string;
  /** Production logo (data URL or asset id) shown top-right of the masthead. */
  logo?: string;
  cues: PrintableRunOfShowCue[];
  /** null when any cue has no duration, so the sheet says so instead of lying. */
  totalRunTimeSeconds: number | null;
  issues: PrintableRunOfShowIssue[];
}

/** "20:00" / "20:00:30" clock time; "—" when the start could not be resolved. */
const formatClock = (seconds: number | null): string => {
  if (seconds === null) return '—';
  const norm = ((seconds % 86400) + 86400) % 86400;
  const h = Math.floor(norm / 3600);
  const m = Math.floor((norm % 3600) / 60);
  const s = norm % 60;
  const mm = String(m).padStart(2, '0');
  return s > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${h}:${mm}`;
};

/** "1h 05m" / "45m 30s" / "—" for an unknown length (never silently 0). */
const formatDuration = (seconds: number | null): string => {
  if (seconds === null) return '—';
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);
  return parts.join(' ');
};

/**
 * Self-contained printable run of show — the cue list as the sheet the show
 * caller actually holds: number, cue, segment, start, length, and every
 * department's note under the row it belongs to.
 *
 * Render inside a `.run-of-show-print-host` container: off-screen on screen,
 * the only visible document in print media.
 */
export const RunOfShowPrintView: React.FC<RunOfShowPrintViewProps> = ({
  productionTitle,
  company,
  logo,
  cues,
  totalRunTimeSeconds,
  issues,
}) => {
  const generatedAt = new Intl.DateTimeFormat('en-CA').format(new Date());

  return (
    <>
      <style>{`
        .run-of-show-print-host {
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
          .run-of-show-print-host { position: static !important; left: 0 !important; width: auto !important; }
        }
        .ros-doc { padding: 6mm 4mm; color: #0f172a; background: #fff; font-size: 10.5px; line-height: 1.35; }
        .ros-doc * { box-sizing: border-box; }
        .ros-masthead { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: stretch; border-bottom: 3px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
        .ros-kicker { font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase; color: #0e7490; font-weight: 700; margin: 0 0 3px; }
        .ros-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; line-height: 1.05; letter-spacing: -0.3px; }
        .ros-company { font-size: 9px; color: #475569; margin: 4px 0 0; }
        .ros-meta { text-align: right; font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
        .ros-logo { max-width: 42mm; max-height: 16mm; object-fit: contain; margin-bottom: 4px; }
        .ros-table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .ros-table th, .ros-table td { border: 1px solid #cbd5e1; padding: 3.5px 6px; text-align: left; vertical-align: top; }
        .ros-table th { background: #f1f5f9; text-transform: uppercase; font-size: 8px; letter-spacing: 0.8px; color: #475569; }
        .ros-table td.num, .ros-table th.num { text-align: right; white-space: nowrap; font-family: 'Courier New', monospace; }
        .ros-table td.cue-no { text-align: center; font-weight: 900; font-family: 'Courier New', monospace; }
        /* A cue and its department notes must never be split across a page:
           half a cue is worse on paper than a shorter page. */
        .ros-cue, .ros-notes { page-break-inside: avoid; break-inside: avoid; }
        .ros-cue td { border-bottom-width: 0; }
        .ros-label { font-weight: 700; }
        .ros-segment { font-size: 8px; text-transform: uppercase; letter-spacing: 0.6px; color: #475569; }
        .ros-notes td { border-top-width: 0; background: #f8fafc; font-size: 9.5px; }
        .ros-note { margin: 0 0 1px; }
        .ros-note-dept { display: inline-block; min-width: 17mm; font-size: 7.5px; letter-spacing: 0.6px; text-transform: uppercase; font-weight: 700; color: #0f172a; }
        .ros-total-row td { font-weight: 700; background: #f1f5f9; }
        .ros-issues { margin-top: 12px; border: 1px solid #b45309; padding: 6px 8px; page-break-inside: avoid; break-inside: avoid; }
        .ros-issues h2 { font-size: 9px; letter-spacing: 1.2px; text-transform: uppercase; margin: 0 0 4px; color: #b45309; }
        .ros-issues ul { margin: 0; padding-left: 14px; }
        .ros-issues li { font-size: 9.5px; margin-bottom: 1px; }
        .ros-severity { font-weight: 700; text-transform: uppercase; font-size: 8px; letter-spacing: 0.6px; margin-right: 4px; }
        .ros-footer { margin-top: 14px; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 8.5px; color: #475569; display: flex; justify-content: space-between; gap: 10px; }
        .ros-footer p { margin: 0; }
      `}</style>
      <div className="ros-doc">
        <header className="ros-masthead">
          <div>
            <p className="ros-kicker">{company ? `${company} · ` : ''}Run of show · Cue list</p>
            <h1 className="ros-title">{productionTitle}</h1>
            <p className="ros-company">{cues.length} cue{cues.length === 1 ? '' : 's'} · generated {generatedAt}</p>
          </div>
          <div className="ros-meta">
            {logo && <ProjectImage imageRef={logo} alt="Production logo" className="ros-logo" />}
            <div>Total run time</div>
            <div style={{ fontSize: 20, color: '#0f172a', fontFamily: "'Courier New', monospace" }}>
              {formatDuration(totalRunTimeSeconds)}
            </div>
          </div>
        </header>

        {cues.length === 0 && <p>No cues in the running order yet.</p>}

        {cues.length > 0 && (
          <table className="ros-table">
            <thead>
              <tr>
                <th className="num" style={{ width: '8mm' }}>#</th>
                <th>Cue</th>
                <th style={{ width: '32mm' }}>Segment</th>
                <th className="num" style={{ width: '20mm' }}>Start</th>
                <th className="num" style={{ width: '20mm' }}>Length</th>
              </tr>
            </thead>
            <tbody>
              {cues.map((cue) => (
                <React.Fragment key={cue.id}>
                  <tr className="ros-cue">
                    <td className="cue-no">{cue.number}</td>
                    <td className="ros-label">{cue.label.trim() === '' ? '—' : cue.label}</td>
                    <td className="ros-segment">{cue.segmentName ?? '—'}</td>
                    <td className="num">{formatClock(cue.startSeconds)}</td>
                    <td className="num">{formatDuration(cue.durationSeconds)}</td>
                  </tr>
                  <tr className="ros-notes">
                    <td />
                    <td colSpan={4}>
                      {cue.notes.length === 0 ? (
                        <p className="ros-note">—</p>
                      ) : (
                        cue.notes.map((note) => (
                          <p key={note.department} className="ros-note">
                            <span className="ros-note-dept">{note.department}</span>
                            {note.text}
                          </p>
                        ))
                      )}
                    </td>
                  </tr>
                </React.Fragment>
              ))}
              <tr className="ros-total-row">
                <td colSpan={4}>Total run time</td>
                <td className="num">{formatDuration(totalRunTimeSeconds)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {issues.length > 0 && (
          <section className="ros-issues">
            <h2>Cue-list issues</h2>
            <ul>
              {issues.map((cueIssue, i) => (
                <li key={`issue-${i}`}>
                  <span className="ros-severity">{cueIssue.severity}</span>
                  {cueIssue.message}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="ros-footer">
          <p>Generated from project data · {generatedAt}</p>
          <p>Times are planned; the caller's clock is the running one.</p>
        </footer>
      </div>
    </>
  );
};

/**
 * Map a project onto the printable sheet, so a caller can render the whole
 * document with `<RunOfShowPrintView {...buildRunOfShowPrintModel(project)} />`
 * and nothing else.
 *
 * `showStartSeconds` is the wall-clock time the show goes up, seconds past
 * midnight — the same figure the Run of Show panel's "Show start" field feeds
 * to `computeCueStarts`. Omitted, the sheet counts from zero, which is what a
 * rehearsal or a pre-record wants.
 */
export const buildRunOfShowPrintModel = (
  project: Project,
  showStartSeconds?: number,
): RunOfShowPrintViewProps => {
  const sheet = buildRunOfShowSheet(
    project.runOfShowCues ?? [],
    project.productionSegments ?? [],
    showStartSeconds,
  );
  return {
    productionTitle: project.title,
    ...(project.productionCompany ? { company: project.productionCompany } : {}),
    ...(project.logo ? { logo: project.logo } : {}),
    cues: sheet.rows.map((row) => ({
      id: row.cueId,
      number: row.number,
      label: row.label,
      ...(row.segmentName === undefined ? {} : { segmentName: row.segmentName }),
      startSeconds: row.startSeconds,
      durationSeconds: row.durationSeconds,
      notes: row.notes,
    })),
    totalRunTimeSeconds: sheet.totalRunTimeSeconds,
    issues: sheet.issues.map((cueIssue) => ({
      severity: cueIssue.severity,
      message: cueIssue.message,
    })),
  };
};
