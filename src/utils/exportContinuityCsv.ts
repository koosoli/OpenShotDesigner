/**
 * Download the continuity log as a DaVinci Resolve metadata CSV.
 *
 * The bytes are built in the domain (`domain/continuity/resolveCsv.ts`) so the
 * contract can be tested without a DOM; this file is only the download, and it
 * deliberately does nothing else. Resolve matches rows to clips by file name
 * and fields by header name, and fails silently at both — so nothing here may
 * "helpfully" reformat anything on the way out.
 *
 * A BOM is deliberately NOT written. Excel likes one, Resolve does not: with a
 * BOM the first header arrives with an invisible U+FEFF glued to it, so it
 * no longer reads as "File Name" and matches nothing — the silent failure
 * this whole feature is built to avoid.
 */
import { exportResolveCsv, type ContinuitySources, type Take } from '../domain/continuity';
import type { Project } from '../types';

/**
 * The project slice the continuity domain reads. One function, used by the
 * CSV, the paper report and the panel's placeholders alike, so all three
 * resolve every column the same way.
 */
export const continuitySourcesFrom = (project: Project): ContinuitySources => ({
  productionCompany: project.productionCompany,
  title: project.title,
  director: project.director,
  cinematographer: project.cinematographer,
  people: project.people,
  setups: project.setups,
  productionDays: project.productionDays,
  crewDefaults: project.continuityCrew,
});

const safeName = (value: string): string =>
  value.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Continuity';

/**
 * Write the CSV for `takes` and hand it to the browser.
 *
 * `dayLabel` only names the file; the scoping decision belongs to the caller,
 * which knows whether the user is looking at one day or the whole production.
 */
export const exportContinuityCsv = (
  project: Project,
  takes: readonly Take[],
  dayLabel?: string,
): void => {
  const csv = exportResolveCsv(takes, continuitySourcesFrom(project));
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `${safeName(project.title)}_Continuity${dayLabel ? `_${safeName(dayLabel)}` : ''}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
