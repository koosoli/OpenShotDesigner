import React from 'react';
import { ProjectImage } from '../common/ProjectImage';
import {
  buildResolveRows,
  dayChecklist,
  takesForDay,
  type ChecklistShot,
  type ResolveMetadataRow,
} from '../../domain/continuity';
import { keyCrewDisplayName } from '../../domain/people';
import { continuitySourcesFrom } from '../../utils/exportContinuityCsv';
import type { Project } from '../../types';

/**
 * The continuity report and the shooting-day checklist, on paper.
 *
 * Both halves print because both are real paper documents: the script
 * supervisor's log goes in the camera report envelope, and the checklist is
 * what the 1st AD reads at wrap to find out what is missing. They are one
 * document because on a set they are one job — and because printing them
 * separately is how the two versions start to disagree.
 *
 * Every value comes from `src/domain/continuity` rather than being recomputed
 * here (rule 4), which is what keeps the paper and the panel telling the same
 * story. Unknown values print as an em dash, never as a plausible guess
 * (rule 13) — a continuity report is read months later by someone who was not
 * there.
 */

export interface PrintableTakeRow {
  scene: string;
  shot: string;
  take: string;
  /** "1", "0", or empty while the take has not been judged. */
  goodTake: string;
  fileName: string;
  rollCard: string;
  description: string;
  comments: string;
  keywords: string;
  cameraSummary: string;
}

export interface PrintableChecklistRow {
  shot: string;
  scene: string;
  name: string;
  takeCount: number;
  covered: boolean;
  unplanned: boolean;
}

export interface ContinuityPrintViewProps {
  productionTitle: string;
  company?: string;
  logo?: string;
  director?: string;
  cinematographer?: string;
  scriptSupervisor?: string;
  /** "Day 3 · 2024-05-21", or absent when no day is scoped. */
  scopeLabel?: string;
  takeRows: PrintableTakeRow[];
  checklist: PrintableChecklistRow[];
  unscheduled: PrintableChecklistRow[];
  gaps: {
    notShot: PrintableChecklistRow[];
    noGoodTake: PrintableChecklistRow[];
  };
  totals: {
    takes: number;
    goodTakes: number;
    plannedShots: number;
    coveredShots: number;
    /** Takes with no file name yet — the reconciliation pass is unfinished. */
    withoutFileName: number;
  };
}

const dash = (value: string | undefined): string => (value && value.trim() !== '' ? value : '—');

const goodTakeMark = (value: string): string => {
  if (value === '1') return '●';
  if (value === '0') return '○';
  return '—';
};

export const ContinuityPrintView: React.FC<ContinuityPrintViewProps> = ({
  productionTitle,
  company,
  logo,
  director,
  cinematographer,
  scriptSupervisor,
  scopeLabel,
  takeRows,
  checklist,
  unscheduled,
  gaps,
  totals,
}) => {
  const generatedAt = new Date().toISOString().split('T')[0];
  const missing = gaps.notShot.length + gaps.noGoodTake.length;

  return (
    <>
      <style>{`
        .continuity-print-host {
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
          .continuity-print-host { position: static !important; left: 0 !important; width: auto !important; }
        }
        .ct-doc { padding: 6mm 4mm; color: #0f172a; background: #fff; font-size: 10.5px; line-height: 1.35; }
        .ct-doc * { box-sizing: border-box; }
        .ct-masthead { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: stretch; border-bottom: 3px solid #0f172a; padding-bottom: 8px; margin-bottom: 4px; }
        .ct-kicker { font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase; color: #0e7490; font-weight: 700; margin: 0 0 3px; }
        .ct-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; line-height: 1.05; letter-spacing: -0.3px; }
        .ct-company { font-size: 9px; color: #475569; margin: 4px 0 0; }
        .ct-meta { text-align: right; font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
        .ct-logo { max-width: 42mm; max-height: 16mm; object-fit: contain; margin-bottom: 4px; }
        .ct-summary { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 9.5px; color: #334155; margin: 6px 0 0; }
        .ct-summary span b { font-family: 'Courier New', monospace; }
        .ct-section { background: #0f172a; color: #fff; padding: 5px 8px; margin: 14px 0 0; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; page-break-after: avoid; break-after: avoid; }
        .ct-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 3px; }
        .ct-table th, .ct-table td { border: 1px solid #cbd5e1; padding: 3.5px 6px; text-align: left; vertical-align: top; }
        .ct-table th { background: #f1f5f9; text-transform: uppercase; font-size: 8px; letter-spacing: 0.8px; color: #475569; }
        .ct-table td.num, .ct-table th.num { text-align: right; white-space: nowrap; font-family: 'Courier New', monospace; }
        .ct-table td.mono { font-family: 'Courier New', monospace; }
        .ct-table td.tick { width: 8mm; text-align: center; font-family: 'Courier New', monospace; color: #94a3b8; }
        .ct-table tr { page-break-inside: avoid; break-inside: avoid; }
        .ct-good { font-family: 'Courier New', monospace; text-align: center; }
        .ct-flag { font-size: 7.5px; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 700; color: #b45309; }
        .ct-gap { border: 1.5px solid #b91c1c; background: #fee2e2; color: #7f1d1d; padding: 6px 10px; font-size: 10px; margin-top: 8px; page-break-inside: avoid; break-inside: avoid; }
        .ct-gap p { margin: 0 0 3px; }
        .ct-gap p:last-child { margin-bottom: 0; }
        .ct-clear { border: 1.5px solid #94a3b8; background: #f8fafc; padding: 6px 10px; font-size: 10px; margin-top: 8px; }
        .ct-empty { font-size: 10px; color: #64748b; border: 1px dashed #cbd5e1; padding: 6px 10px; margin-top: 3px; }
        .ct-footer { margin-top: 14px; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 8.5px; color: #475569; display: flex; justify-content: space-between; gap: 10px; }
        .ct-footer p { margin: 0; }
      `}</style>
      <div className="ct-doc">
        <header className="ct-masthead">
          <div>
            <p className="ct-kicker">
              {company ? `${company} · ` : ''}Continuity · Script report
              {scopeLabel ? ` · ${scopeLabel}` : ''}
            </p>
            <h1 className="ct-title">{productionTitle}</h1>
            <p className="ct-company">
              {scopeLabel ? `${scopeLabel} · ` : ''}
              {totals.takes} take{totals.takes === 1 ? '' : 's'} · {totals.plannedShots} shot
              {totals.plannedShots === 1 ? '' : 's'} planned · generated {generatedAt}
            </p>
            <div className="ct-summary">
              {director && (
                <span>
                  Director <b>{director}</b>
                </span>
              )}
              {cinematographer && (
                <span>
                  DOP <b>{cinematographer}</b>
                </span>
              )}
              {scriptSupervisor && (
                <span>
                  Script supervisor <b>{scriptSupervisor}</b>
                </span>
              )}
              <span>
                Good takes <b>{totals.goodTakes}</b>
              </span>
              <span>
                Shots covered{' '}
                <b>
                  {totals.coveredShots}/{totals.plannedShots}
                </b>
              </span>
            </div>
          </div>
          <div className="ct-meta">
            {logo && <ProjectImage imageRef={logo} alt="Production logo" className="ct-logo" />}
            <div>Not covered</div>
            <div
              style={{
                fontSize: 20,
                color: missing > 0 ? '#b91c1c' : '#0f172a',
                fontFamily: "'Courier New', monospace",
              }}
            >
              {missing}
            </div>
          </div>
        </header>

        {/*
          The checklist first: at wrap it is the page people actually read, and
          the log behind it is the evidence for what it says.
        */}
        <h2 className="ct-section">Shooting-day checklist</h2>
        {checklist.length === 0 ? (
          <p className="ct-empty">
            Nothing scheduled for this day — schedule scenes, setups or shots to build the checklist.
          </p>
        ) : (
          <table className="ct-table">
            <thead>
              <tr>
                <th className="tick">✓</th>
                <th>Shot</th>
                <th>Scene</th>
                <th>Description</th>
                <th className="num">Takes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {checklist.map((row, index) => (
                <tr key={`${row.shot}-${index}`}>
                  <td className="tick">{row.covered ? '☑' : '☐'}</td>
                  <td className="mono">{dash(row.shot)}</td>
                  <td className="mono">{dash(row.scene)}</td>
                  <td>{dash(row.name)}</td>
                  <td className="num">{row.takeCount}</td>
                  <td>
                    {row.covered
                      ? 'Good take'
                      : row.takeCount > 0
                        ? 'Shot, no good take'
                        : 'Not shot'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {missing > 0 ? (
          <div className="ct-gap">
            {gaps.notShot.length > 0 && (
              <p>
                <b>Not shot ({gaps.notShot.length}):</b>{' '}
                {gaps.notShot.map((row) => dash(row.shot)).join(', ')}
              </p>
            )}
            {gaps.noGoodTake.length > 0 && (
              <p>
                <b>Shot but no good take ({gaps.noGoodTake.length}):</b>{' '}
                {gaps.noGoodTake.map((row) => dash(row.shot)).join(', ')}
              </p>
            )}
          </div>
        ) : (
          checklist.length > 0 && (
            <div className="ct-clear">Every shot scheduled for this day has a good take.</div>
          )
        )}

        {/*
          Kept in its own table on purpose: a pickup is not part of the plan,
          and folding it into the checklist would hide the shot it did not
          replace.
        */}
        {unscheduled.length > 0 && (
          <>
            <h2 className="ct-section">Shot but not planned</h2>
            <table className="ct-table">
              <thead>
                <tr>
                  <th>Shot</th>
                  <th>Scene</th>
                  <th>Description</th>
                  <th className="num">Takes</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {unscheduled.map((row, index) => (
                  <tr key={`${row.shot}-extra-${index}`}>
                    <td className="mono">
                      {dash(row.shot)} {row.unplanned && <span className="ct-flag">unplanned</span>}
                    </td>
                    <td className="mono">{dash(row.scene)}</td>
                    <td>{dash(row.name)}</td>
                    <td className="num">{row.takeCount}</td>
                    <td>{row.covered ? 'Good take' : 'No good take'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h2 className="ct-section">Continuity log</h2>
        {takeRows.length === 0 ? (
          <p className="ct-empty">No takes logged for this day yet.</p>
        ) : (
          <table className="ct-table">
            <thead>
              <tr>
                <th>Sc</th>
                <th>Sh</th>
                <th className="num">Tk</th>
                <th>G</th>
                <th>File name</th>
                <th>Card</th>
                <th>Description / comments</th>
                <th>Camera</th>
              </tr>
            </thead>
            <tbody>
              {takeRows.map((row, index) => (
                <tr key={`${row.shot}-${row.take}-${index}`}>
                  <td className="mono">{dash(row.scene)}</td>
                  <td className="mono">{dash(row.shot)}</td>
                  <td className="num">{dash(row.take)}</td>
                  <td className="ct-good">{goodTakeMark(row.goodTake)}</td>
                  <td className="mono">{dash(row.fileName)}</td>
                  <td className="mono">{dash(row.rollCard)}</td>
                  <td>
                    {dash(row.description)}
                    {row.comments && (
                      <>
                        <br />
                        <i>{row.comments}</i>
                      </>
                    )}
                    {row.keywords && (
                      <>
                        <br />
                        <span className="ct-flag">{row.keywords}</span>
                      </>
                    )}
                  </td>
                  <td className="mono">{dash(row.cameraSummary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="ct-footer">
          <p>
            ● good take · ○ no good · — not judged
            {totals.withoutFileName > 0
              ? ` · ${totals.withoutFileName} take${totals.withoutFileName === 1 ? '' : 's'} without a file name`
              : ''}
          </p>
          <p>{productionTitle}</p>
        </div>
      </div>
    </>
  );
};

const toChecklistRow = (entry: ChecklistShot): PrintableChecklistRow => ({
  shot: entry.shotNumber ?? '',
  scene: entry.sceneNumber ?? '',
  name: entry.name ?? '',
  takeCount: entry.takeCount,
  covered: entry.covered,
  unplanned: entry.unplanned,
});

/**
 * Build the printable model straight from the project:
 * `<ContinuityPrintView {...buildContinuityPrintModel(project)} />`.
 *
 * The log rows are the very same rows the Resolve CSV exports, so the paper
 * and the file can never describe different takes — the printed report is the
 * human-readable rendering of exactly what will reach the media pool.
 */
export const buildContinuityPrintModel = (
  project: Project,
  options: { productionDayId?: string } = {},
): ContinuityPrintViewProps => {
  const allTakes = project.takes ?? [];
  // The day comes from the caller when one is given, otherwise from the scope
  // set in the panel — printing what is on screen is the whole point. A filter
  // pointing at a deleted day must not silently print another day's work, so
  // the scope falls away and the sheet carries no scope label.
  const dayId = options.productionDayId ?? project.continuityDayFilterId;
  const day = dayId ? project.productionDays?.find((candidate) => candidate.id === dayId) : undefined;

  const takes = day ? takesForDay(allTakes, day.id) : allTakes;
  const sources = {
    setups: project.setups,
    scriptScenes: project.scriptScenes,
  };

  const checklist = day
    ? dayChecklist(
        day.scheduleBlockIds ?? [],
        project.scheduleBlocks ?? [],
        sources,
        allTakes,
        day.id,
      )
    : { planned: [], unscheduled: [], notShot: [], noGoodTake: [] };

  const rows: ResolveMetadataRow[] = buildResolveRows(takes, continuitySourcesFrom(project));

  const takeRows: PrintableTakeRow[] = rows.map((row) => {
    const camera = [row['Camera Type'], row['Camera FPS'] && `${row['Camera FPS']}fps`, row['Focal Point (mm)'], row['Camera Aperture'], row.ISO && `ISO ${row.ISO}`]
      .filter((part) => !!part && part !== '')
      .join(' · ');
    return {
      scene: row.Scene ?? '',
      shot: row.Shot ?? '',
      take: row.Take ?? '',
      goodTake: row['Good Take'] ?? '',
      fileName: row['File Name'] ?? '',
      rollCard: row['Roll Card #'] ?? '',
      description: row.Description ?? '',
      comments: row.Comments ?? '',
      keywords: row.Keywords ?? '',
      cameraSummary: camera,
    };
  });

  // Same resolver the CSV uses, so the paper and the file never name different
  // people: the crew list first, the legacy project fields as fallback.
  const legacy = { director: project.director, cinematographer: project.cinematographer };
  const crew = (roleKey: string) => keyCrewDisplayName(project.people ?? [], roleKey, legacy);

  return {
    productionTitle: project.title,
    company: project.productionCompany,
    logo: project.logo,
    director: crew('director'),
    cinematographer: crew('cinematographer'),
    scriptSupervisor: crew('script_supervisor') ?? project.continuityCrew?.scriptSupervisor,
    scopeLabel: day ? (day.date ? `${day.name} · ${day.date}` : day.name) : undefined,
    takeRows,
    checklist: checklist.planned.map(toChecklistRow),
    unscheduled: checklist.unscheduled.map(toChecklistRow),
    gaps: {
      notShot: checklist.notShot.map(toChecklistRow),
      noGoodTake: checklist.noGoodTake.map(toChecklistRow),
    },
    totals: {
      takes: takes.length,
      goodTakes: takes.filter((take) => take.isGoodTake === true).length,
      plannedShots: checklist.planned.length,
      coveredShots: checklist.planned.filter((entry) => entry.covered).length,
      withoutFileName: takes.filter((take) => !take.fileName).length,
    },
  };
};
