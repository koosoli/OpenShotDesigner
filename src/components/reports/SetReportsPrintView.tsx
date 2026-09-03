import React from 'react';
import { ProjectImage } from '../common/ProjectImage';
import { cameraReport, soundReport, takesForDay } from '../../domain/continuity';
import type {
  CameraReportRow,
  ReportRoll,
  SetReport,
  SoundReportRow,
} from '../../domain/continuity';
import { keyCrewDisplayName } from '../../domain/people';
import { continuitySourcesFrom } from '../../utils/exportContinuityCsv';
import type { Project } from '../../types';

/**
 * The camera report and the sound report, on paper.
 *
 * The two sheets that travel with the media: one to the DIT and then to post,
 * one to the mixer and then to post. Between them they are how anyone, months
 * later, works out what a file on a drive actually is.
 *
 * They share this file and their stylesheet because they are the same KIND of
 * document — one section per roll, one row per take, a tally at the foot of
 * each section — and they are two components because they are not the same
 * document: a wild track is a row on one and absent from the other, and they
 * group by different rolls. See `domain/continuity/setReports.ts`, which owns
 * both derivations; nothing is computed here (rule 4).
 */

const dash = (value: string | undefined): string =>
  value && value.trim() !== '' ? value : '—';

/** ● good, ○ NG, — not yet judged. Three states, never two. */
const goodMark = (value: boolean | undefined): string => {
  if (value === true) return '●';
  if (value === false) return '○';
  return '—';
};

const SET_REPORT_STYLES = `
  .sr-host {
    position: absolute; left: -10000px; top: 0; width: 190mm;
    background: #ffffff; color: #0f172a; font-family: Arial, Helvetica, sans-serif;
  }
  @media print {
    body #app-root { display: none !important; }
    .sr-host { position: static !important; left: 0 !important; width: auto !important; }
  }
  .sr-doc { padding: 6mm 4mm; color: #0f172a; background: #fff; font-size: 10.5px; line-height: 1.35; }
  .sr-doc * { box-sizing: border-box; }
  .sr-masthead { display: grid; grid-template-columns: 1fr auto; gap: 12px; border-bottom: 3px solid #0f172a; padding-bottom: 8px; }
  .sr-kicker { font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase; color: #0e7490; font-weight: 700; margin: 0 0 3px; }
  .sr-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; line-height: 1.05; }
  .sr-sub { font-size: 9px; color: #475569; margin: 4px 0 0; }
  .sr-meta { text-align: right; font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
  .sr-logo { max-width: 42mm; max-height: 16mm; object-fit: contain; margin-bottom: 4px; }
  .sr-count { font-size: 20px; font-family: 'Courier New', monospace; color: #0f172a; }
  .sr-roll { background: #0f172a; color: #fff; padding: 5px 8px; margin: 14px 0 0; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; display: flex; justify-content: space-between; gap: 10px; page-break-after: avoid; break-after: avoid; }
  .sr-roll span { font-weight: 700; letter-spacing: 0.4px; font-family: 'Courier New', monospace; }
  .sr-roll.unnamed { background: #7f1d1d; }
  .sr-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 3px; }
  .sr-table th, .sr-table td { border: 1px solid #cbd5e1; padding: 3.5px 6px; text-align: left; vertical-align: top; }
  .sr-table th { background: #f1f5f9; text-transform: uppercase; font-size: 8px; letter-spacing: 0.8px; color: #475569; }
  .sr-table td.mono, .sr-table th.mono { font-family: 'Courier New', monospace; white-space: nowrap; }
  .sr-table td.mark { text-align: center; font-family: 'Courier New', monospace; width: 8mm; }
  .sr-table tr { page-break-inside: avoid; break-inside: avoid; }
  .sr-flag { font-size: 7.5px; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 700; color: #b45309; }
  .sr-empty { font-size: 10px; color: #64748b; border: 1px dashed #cbd5e1; padding: 6px 10px; margin-top: 3px; }
  .sr-footer { margin-top: 14px; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 8.5px; color: #475569; display: flex; justify-content: space-between; gap: 10px; }
  .sr-footer p { margin: 0; }
`;

interface MastheadProps {
  kicker: string;
  productionTitle: string;
  company?: string;
  logo?: string;
  scopeLabel?: string;
  crewLine: string;
  totalRows: number;
  totalGood: number;
  countLabel: string;
}

const Masthead: React.FC<MastheadProps> = ({
  kicker,
  productionTitle,
  company,
  logo,
  scopeLabel,
  crewLine,
  totalRows,
  totalGood,
  countLabel,
}) => (
  <header className="sr-masthead">
    <div>
      <p className="sr-kicker">
        {company ? `${company} · ` : ''}
        {kicker}
        {scopeLabel ? ` · ${scopeLabel}` : ''}
      </p>
      <h1 className="sr-title">{productionTitle}</h1>
      <p className="sr-sub">
        {totalRows} take{totalRows === 1 ? '' : 's'} · {totalGood} good · generated{' '}
        {new Intl.DateTimeFormat('en-CA').format(new Date())}
        {crewLine ? ` · ${crewLine}` : ''}
      </p>
    </div>
    <div className="sr-meta">
      {logo && <ProjectImage imageRef={logo} alt="Production logo" className="sr-logo" />}
      <div>{countLabel}</div>
      <div className="sr-count">{totalRows}</div>
    </div>
  </header>
);

/** The heading strip above each roll's table, with that roll's own tally. */
const RollHeading = <TRow,>({ roll }: { roll: ReportRoll<TRow> }): React.ReactElement => (
  <h2 className={roll.unnamed ? 'sr-roll unnamed' : 'sr-roll'}>
    <span>{roll.roll}</span>
    <span>
      {roll.rows.length} take{roll.rows.length === 1 ? '' : 's'} · {roll.goodCount} good ·{' '}
      {roll.ngCount} NG
    </span>
  </h2>
);

export interface CameraReportPrintViewProps {
  productionTitle: string;
  company?: string;
  logo?: string;
  crewLine: string;
  scopeLabel?: string;
  report: SetReport<CameraReportRow>;
  embedded?: boolean;
}

export const CameraReportPrintView: React.FC<CameraReportPrintViewProps> = ({
  productionTitle,
  company,
  logo,
  crewLine,
  scopeLabel,
  report,
  embedded = false,
}) => (
  <>
    <style>{SET_REPORT_STYLES}</style>
    <div className={embedded ? 'sr-doc' : 'sr-host'}>
      <div className={embedded ? undefined : 'sr-doc'}>
        <Masthead
          kicker="Camera report"
          productionTitle={productionTitle}
          company={company}
          logo={logo}
          scopeLabel={scopeLabel}
          crewLine={crewLine}
          totalRows={report.totalRows}
          totalGood={report.totalGood}
          countLabel="Clips"
        />

        {report.rolls.length === 0 ? (
          <p className="sr-empty">
            No takes logged{scopeLabel ? ` on ${scopeLabel}` : ''}. The camera report is derived
            from the continuity log.
          </p>
        ) : (
          report.rolls.map((roll) => (
            <React.Fragment key={roll.roll}>
              <RollHeading roll={roll} />
              <table className="sr-table">
                <thead>
                  <tr>
                    <th className="mark">✓</th>
                    <th className="mono">File</th>
                    <th className="mono">Sc</th>
                    <th className="mono">Shot</th>
                    <th className="mono">Tk</th>
                    <th className="mono">Cam</th>
                    <th>Description</th>
                    <th className="mono">Lens</th>
                    <th className="mono">FPS</th>
                    <th className="mono">Shutter</th>
                    <th className="mono">ISO</th>
                    <th className="mono">Filter</th>
                    <th className="mono">T-stop</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {roll.rows.map((row) => (
                    <tr key={row.takeId}>
                      <td className="mark">{goodMark(row.isGoodTake)}</td>
                      <td className="mono">{dash(row.fileName)}</td>
                      <td className="mono">{dash(row.scene)}</td>
                      <td className="mono">{dash(row.shot)}</td>
                      <td className="mono">{row.take}</td>
                      <td className="mono">{dash(row.camera)}</td>
                      <td>
                        {dash(row.description)}
                        {row.mos && <span className="sr-flag"> · MOS</span>}
                      </td>
                      <td className="mono">{dash(row.lens)}</td>
                      <td className="mono">{dash(row.fps)}</td>
                      <td className="mono">{dash(row.shutter)}</td>
                      <td className="mono">{dash(row.iso)}</td>
                      <td className="mono">{dash(row.filter)}</td>
                      <td className="mono">{dash(row.aperture)}</td>
                      <td>{dash(row.notes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </React.Fragment>
          ))
        )}

        <footer className="sr-footer">
          <p>
            ● good · ○ NG · — not yet judged. Derived from the continuity log; a take with no file
            name has not been reconciled against the card yet.
          </p>
          <p>{productionTitle}</p>
        </footer>
      </div>
    </div>
  </>
);

export interface SoundReportPrintViewProps {
  productionTitle: string;
  company?: string;
  logo?: string;
  crewLine: string;
  scopeLabel?: string;
  report: SetReport<SoundReportRow>;
  embedded?: boolean;
}

export const SoundReportPrintView: React.FC<SoundReportPrintViewProps> = ({
  productionTitle,
  company,
  logo,
  crewLine,
  scopeLabel,
  report,
  embedded = false,
}) => (
  <>
    <style>{SET_REPORT_STYLES}</style>
    <div className={embedded ? 'sr-doc' : 'sr-host'}>
      <div className={embedded ? undefined : 'sr-doc'}>
        <Masthead
          kicker="Sound report"
          productionTitle={productionTitle}
          company={company}
          logo={logo}
          scopeLabel={scopeLabel}
          crewLine={crewLine}
          totalRows={report.totalRows}
          totalGood={report.totalGood}
          countLabel="Takes"
        />

        {report.rolls.length === 0 ? (
          <p className="sr-empty">
            No takes logged{scopeLabel ? ` on ${scopeLabel}` : ''}. The sound report is derived
            from the continuity log.
          </p>
        ) : (
          report.rolls.map((roll) => (
            <React.Fragment key={roll.roll}>
              <RollHeading roll={roll} />
              <table className="sr-table">
                <thead>
                  <tr>
                    <th className="mark">✓</th>
                    <th className="mono">Audio file</th>
                    <th className="mono">Sc</th>
                    <th className="mono">Shot</th>
                    <th className="mono">Tk</th>
                    <th>Type</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {roll.rows.map((row) => (
                    <tr key={row.takeId}>
                      <td className="mark">{goodMark(row.isGoodTake)}</td>
                      <td className="mono">{dash(row.soundFileName)}</td>
                      <td className="mono">{dash(row.scene)}</td>
                      <td className="mono">{dash(row.shot)}</td>
                      <td className="mono">{row.take}</td>
                      <td>
                        {/* MOS is printed rather than left blank on purpose: a
                            take missing from this sheet and a take marked MOS
                            look the same to a machine and completely different
                            to the assistant looking for the file. */}
                        {row.wildTrack ? (
                          <span className="sr-flag">Wild track</span>
                        ) : row.mos ? (
                          <span className="sr-flag">MOS — no sound recorded</span>
                        ) : (
                          'Sync'
                        )}
                      </td>
                      <td>{dash(row.notes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </React.Fragment>
          ))
        )}

        <footer className="sr-footer">
          <p>
            ● good · ○ NG · — not yet judged. MOS rows are listed so a missing audio file reads as
            intended rather than as lost.
          </p>
          <p>{productionTitle}</p>
        </footer>
      </div>
    </div>
  </>
);

/** The day scope and crew line both reports share. */
const scopeAndCrew = (
  project: Project,
  options: { productionDayId?: string },
): { takes: Project['takes']; scopeLabel?: string; crewLine: string } => {
  const allTakes = project.takes ?? [];
  const dayId = options.productionDayId ?? project.continuityDayFilterId;
  const day = dayId
    ? project.productionDays?.find((candidate) => candidate.id === dayId)
    : undefined;

  const legacy = { director: project.director, cinematographer: project.cinematographer };
  const crew = (roleKey: string) => keyCrewDisplayName(project.people ?? [], roleKey, legacy);

  const crewLine = [
    crew('cinematographer') && `DOP ${crew('cinematographer')}`,
    (crew('sound_mixer') ?? project.continuityCrew?.soundMixer) &&
      `Sound ${crew('sound_mixer') ?? project.continuityCrew?.soundMixer}`,
    (crew('script_supervisor') ?? project.continuityCrew?.scriptSupervisor) &&
      `Script ${crew('script_supervisor') ?? project.continuityCrew?.scriptSupervisor}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    // A filter pointing at a deleted day falls away rather than silently
    // printing another day's work — the same rule the continuity sheet uses.
    takes: day ? takesForDay(allTakes, day.id) : allTakes,
    ...(day ? { scopeLabel: day.date ? `${day.name} · ${day.date}` : day.name } : {}),
    crewLine,
  };
};

export const buildCameraReportPrintModel = (
  project: Project,
  options: { productionDayId?: string } = {},
): CameraReportPrintViewProps => {
  const { takes, scopeLabel, crewLine } = scopeAndCrew(project, options);
  return {
    productionTitle: project.title,
    company: project.productionCompany,
    logo: project.logo,
    crewLine,
    ...(scopeLabel ? { scopeLabel } : {}),
    report: cameraReport(takes ?? [], continuitySourcesFrom(project)),
  };
};

export const buildSoundReportPrintModel = (
  project: Project,
  options: { productionDayId?: string } = {},
): SoundReportPrintViewProps => {
  const { takes, scopeLabel, crewLine } = scopeAndCrew(project, options);
  return {
    productionTitle: project.title,
    company: project.productionCompany,
    logo: project.logo,
    crewLine,
    ...(scopeLabel ? { scopeLabel } : {}),
    report: soundReport(takes ?? [], continuitySourcesFrom(project)),
  };
};
