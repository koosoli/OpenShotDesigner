import React from 'react';
import { ProjectImage } from '../common/ProjectImage';
import {
  dailyProgressReport,
  formatPageEighths,
  formatSpan,
  plannedDayMinutes,
} from '../../domain/reports';
import type { DailyProgressReport } from '../../domain/reports';
import { formatDurationHours } from '../../domain/scheduling';
import { keyCrewDisplayName } from '../../domain/people';
import type { Project } from '../../types';

/**
 * The end-of-day production report, on paper (plan §35).
 *
 * The sheet the production office reads first: what was scheduled, what was
 * actually shot, and whether the unit is ahead or behind. Every figure comes
 * from `domain/reports/dailyProgress` rather than being recomputed here
 * (rule 4), so the paper and the panel cannot disagree.
 *
 * Unknown prints as an em dash and says so in words where the reason matters.
 * A DPR is the document a schedule gets renegotiated from, and a number on it
 * that turns out to be a partial sum costs more than a blank would have.
 */

export interface DailyProgressPrintViewProps {
  productionTitle: string;
  company?: string;
  logo?: string;
  director?: string;
  firstAd?: string;
  report: DailyProgressReport;
  /** The published call-to-wrap window, when the day names both. */
  plannedDayMinutes: number | null;
  /** Rendered inside the export modal rather than as a standalone print host. */
  embedded?: boolean;
}

const dash = (value: string | number | undefined): string =>
  value === undefined || value === '' ? '—' : String(value);

export const DailyProgressPrintView: React.FC<DailyProgressPrintViewProps> = ({
  productionTitle,
  company,
  logo,
  director,
  firstAd,
  report,
  plannedDayMinutes: plannedMinutes,
  embedded = false,
}) => {
  const generatedAt = new Date().toISOString().split('T')[0];
  const behind = (report.scheduleVarianceMinutes ?? 0) > 0;

  return (
    <>
      <style>{`
        .dpr-host {
          position: absolute; left: -10000px; top: 0; width: 190mm;
          background: #ffffff; color: #0f172a; font-family: Arial, Helvetica, sans-serif;
        }
        @media print {
          body #app-root { display: none !important; }
          .dpr-host { position: static !important; left: 0 !important; width: auto !important; }
        }
        .dpr-doc { padding: 6mm 4mm; color: #0f172a; background: #fff; font-size: 10.5px; line-height: 1.35; }
        .dpr-doc * { box-sizing: border-box; }
        .dpr-masthead { display: grid; grid-template-columns: 1fr auto; gap: 12px; border-bottom: 3px solid #0f172a; padding-bottom: 8px; }
        .dpr-kicker { font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase; color: #0e7490; font-weight: 700; margin: 0 0 3px; }
        .dpr-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; line-height: 1.05; }
        .dpr-sub { font-size: 9px; color: #475569; margin: 4px 0 0; }
        .dpr-meta { text-align: right; font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
        .dpr-logo { max-width: 42mm; max-height: 16mm; object-fit: contain; margin-bottom: 4px; }
        .dpr-verdict { font-size: 20px; font-family: 'Courier New', monospace; }
        .dpr-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 8px; }
        .dpr-card { border: 1px solid #cbd5e1; padding: 6px 8px; }
        .dpr-card b { display: block; font-size: 8px; letter-spacing: 0.8px; text-transform: uppercase; color: #475569; font-weight: 700; }
        .dpr-card span { font-family: 'Courier New', monospace; font-size: 15px; font-weight: 700; }
        .dpr-card em { display: block; font-style: normal; font-size: 8.5px; color: #64748b; }
        .dpr-section { background: #0f172a; color: #fff; padding: 5px 8px; margin: 14px 0 0; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; page-break-after: avoid; break-after: avoid; }
        .dpr-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 3px; }
        .dpr-table th, .dpr-table td { border: 1px solid #cbd5e1; padding: 3.5px 6px; text-align: left; vertical-align: top; }
        .dpr-table th { background: #f1f5f9; text-transform: uppercase; font-size: 8px; letter-spacing: 0.8px; color: #475569; }
        .dpr-table td.num, .dpr-table th.num { text-align: right; white-space: nowrap; font-family: 'Courier New', monospace; }
        .dpr-table tr { page-break-inside: avoid; break-inside: avoid; }
        .dpr-gap { border: 1.5px solid #b91c1c; background: #fee2e2; color: #7f1d1d; padding: 6px 10px; font-size: 10px; margin-top: 8px; page-break-inside: avoid; break-inside: avoid; }
        .dpr-clear { border: 1.5px solid #94a3b8; background: #f8fafc; padding: 6px 10px; font-size: 10px; margin-top: 8px; }
        .dpr-empty { font-size: 10px; color: #64748b; border: 1px dashed #cbd5e1; padding: 6px 10px; margin-top: 3px; }
        .dpr-footer { margin-top: 14px; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 8.5px; color: #475569; display: flex; justify-content: space-between; gap: 10px; }
        .dpr-footer p { margin: 0; }
      `}</style>
      <div className={embedded ? 'dpr-doc' : 'dpr-host'}>
        <div className={embedded ? undefined : 'dpr-doc'}>
          <header className="dpr-masthead">
            <div>
              <p className="dpr-kicker">
                {company ? `${company} · ` : ''}Daily progress report
              </p>
              <h1 className="dpr-title">{productionTitle}</h1>
              <p className="dpr-sub">
                {report.dayName}
                {report.date ? ` · ${report.date}` : ''} · call {dash(report.crewCall)} · planned
                wrap {dash(report.plannedWrap)}
                {plannedMinutes !== null ? ` (${formatDurationHours(plannedMinutes)})` : ''} ·
                generated {generatedAt}
                {director ? ` · Director ${director}` : ''}
                {firstAd ? ` · 1st AD ${firstAd}` : ''}
              </p>
            </div>
            <div className="dpr-meta">
              {logo && <ProjectImage imageRef={logo} alt="Production logo" className="dpr-logo" />}
              <div>Schedule</div>
              <div
                className="dpr-verdict"
                style={{ color: behind ? '#b91c1c' : '#0f172a' }}
              >
                {report.scheduleVarianceLabel ?? '—'}
              </div>
            </div>
          </header>

          <div className="dpr-cards">
            <div className="dpr-card">
              <b>Scenes</b>
              <span>
                {report.scenesCompleted}/{report.scenesScheduled}
              </span>
              <em>completed / scheduled</em>
            </div>
            <div className="dpr-card">
              <b>Pages</b>
              <span>
                {formatPageEighths(report.pagesCoveredEighths)}/
                {formatPageEighths(report.pagesScheduledEighths)}
              </span>
              <em>
                {report.pagesScheduledEighths === null
                  ? 'not all scenes have a page length'
                  : 'shot / scheduled'}
              </em>
            </div>
            <div className="dpr-card">
              <b>Setups</b>
              <span>
                {report.setupsCompleted}/{report.setupsScheduled}
              </span>
              <em>completed / scheduled</em>
            </div>
            <div className="dpr-card">
              <b>Shots</b>
              <span>
                {report.shotsCovered}/{report.shotsScheduled}
              </span>
              <em>covered / scheduled</em>
            </div>
          </div>

          <div className="dpr-cards" style={{ marginTop: 6 }}>
            <div className="dpr-card">
              <b>First take</b>
              <span>{dash(report.firstTakeAt)}</span>
              <em>logged</em>
            </div>
            <div className="dpr-card">
              <b>Last take</b>
              <span>{dash(report.lastTakeAt)}</span>
              <em>logged</em>
            </div>
            <div className="dpr-card">
              <b>Shooting span</b>
              <span>{formatSpan(report.shootingSpanMinutes)}</span>
              <em>first to last take</em>
            </div>
            <div className="dpr-card">
              <b>Takes</b>
              <span>{report.takesLogged}</span>
              <em>
                {report.takesGood} good · {report.takesNg} NG
              </em>
            </div>
          </div>

          <p className="dpr-sub" style={{ marginTop: 6 }}>
            First and last are the first and last <b>takes logged</b>, not camera-roll times: a
            unit that spends the first hour lighting has a first take later than its call, which
            is normal and not a delay.
          </p>

          <h2 className="dpr-section">Scenes</h2>
          {report.scenes.length === 0 ? (
            <p className="dpr-empty">Nothing scheduled on this day.</p>
          ) : (
            <table className="dpr-table">
              <thead>
                <tr>
                  <th>Scene</th>
                  <th className="num">Pages</th>
                  <th className="num">Shots planned</th>
                  <th className="num">Covered</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {report.scenes.map((scene) => (
                  <tr key={scene.sceneNumber}>
                    <td>{scene.sceneNumber}</td>
                    <td className="num">{formatPageEighths(scene.pageEighths)}</td>
                    <td className="num">{scene.plannedShots}</td>
                    <td className="num">{scene.coveredShots}</td>
                    <td>{scene.complete ? 'Complete' : 'Incomplete'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2 className="dpr-section">Not covered</h2>
          {report.shotsNotShot.length === 0 && report.shotsAttempted === 0 ? (
            <p className="dpr-clear">Every shot scheduled for the day has a good take.</p>
          ) : (
            <div className="dpr-gap">
              {report.shotsNotShot.length > 0 && (
                <p>
                  <b>Not shot ({report.shotsNotShot.length}):</b>{' '}
                  {report.shotsNotShot
                    .map((shot) => shot.shotNumber || shot.name || shot.shotId)
                    .join(', ')}
                </p>
              )}
              {report.shotsAttempted > 0 && (
                <p>
                  <b>Shot with no good take:</b> {report.shotsAttempted}
                </p>
              )}
            </div>
          )}

          {report.shotsUnscheduled.length > 0 && (
            <>
              <h2 className="dpr-section">Shot but not scheduled</h2>
              <table className="dpr-table">
                <thead>
                  <tr>
                    <th>Shot</th>
                    <th>Scene</th>
                    <th>Description</th>
                    <th className="num">Takes</th>
                  </tr>
                </thead>
                <tbody>
                  {report.shotsUnscheduled.map((shot) => (
                    <tr key={shot.shotId}>
                      <td>{dash(shot.shotNumber)}</td>
                      <td>{dash(shot.sceneNumber)}</td>
                      <td>{dash(shot.name)}</td>
                      <td className="num">{shot.takeCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <footer className="dpr-footer">
            <p>
              Derived from the schedule and the continuity log. Correct a take and this sheet
              corrects with it.
            </p>
            <p>{productionTitle}</p>
          </footer>
        </div>
      </div>
    </>
  );
};

/**
 * The whole print model from a project, so the export modal stays a renderer:
 * `<DailyProgressPrintView {...buildDailyProgressPrintModel(project)} />`.
 *
 * The day comes from the caller, otherwise from the scope set on the
 * continuity panel — printing what is on screen. A filter pointing at a
 * deleted day falls back to the first day rather than printing another day's
 * work under its name.
 */
export const buildDailyProgressPrintModel = (
  project: Project,
  options: { productionDayId?: string } = {},
): DailyProgressPrintViewProps | null => {
  const days = project.productionDays ?? [];
  const requestedId = options.productionDayId ?? project.continuityDayFilterId;
  const day = days.find((candidate) => candidate.id === requestedId) ?? days[0];
  if (!day) return null;

  const legacy = { director: project.director, cinematographer: project.cinematographer };
  const crew = (roleKey: string) => keyCrewDisplayName(project.people ?? [], roleKey, legacy);

  const report = dailyProgressReport(
    day,
    project.scheduleBlocks ?? [],
    { setups: project.setups, scriptScenes: project.scriptScenes },
    project.takes ?? [],
  );

  return {
    productionTitle: project.title,
    company: project.productionCompany,
    logo: project.logo,
    director: crew('director'),
    firstAd: crew('first_ad'),
    report,
    plannedDayMinutes: plannedDayMinutes(day),
  };
};
