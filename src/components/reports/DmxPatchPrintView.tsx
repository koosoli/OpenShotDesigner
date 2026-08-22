import React from 'react';
import type { DmxPatchSheetRow } from '../../utils/dmxPatch';

interface DmxPatchPrintViewProps {
  rows: DmxPatchSheetRow[];
  productionTitle: string;
  sceneName?: string;
  /**
   * True when the sheet is rendered inside the Export Studio's paper area,
   * which supplies its own header and print host — the standalone off-screen
   * host styles and the big title are then omitted.
   */
  embedded?: boolean;
}

const pad = (value: number | undefined): string =>
  value === undefined ? '—' : String(value).padStart(3, '0');

/**
 * Self-contained printable DMX patch sheet (console readout). Render inside a
 * `.dmx-print-host` container: off-screen on screen; the only visible document
 * in print media. Planning aid only — not a substitute for console software.
 */
export const DmxPatchPrintView: React.FC<DmxPatchPrintViewProps> = ({ rows, productionTitle, sceneName, embedded = false }) => {
  const generatedAt = new Date().toISOString().split('T')[0];
  const patched = rows.filter((row) => row.universe !== undefined && row.address !== undefined);
  const unpatched = rows.filter((row) => row.universe === undefined || row.address === undefined);
  const conflicts = patched.filter((row) => row.conflict);
  const universes = [...new Set(patched.map((row) => row.universe as number))].sort((a, b) => a - b);

  return (
    <>
      {!embedded && <style>{`
        .dmx-print-host {
          position: absolute;
          left: -10000px;
          top: 0;
          width: 190mm;
          background: #ffffff;
          color: #000000;
          font-family: Arial, Helvetica, sans-serif;
        }
        @media print {
          body #app-root { display: none !important; }
          .dmx-print-host { position: static !important; left: 0 !important; width: auto !important; }
        }
        .dmx-doc { padding: 6mm 4mm; }
        .dmx-doc * { box-sizing: border-box; }
        .dmx-kicker { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 2px; color: #555; }
        .dmx-title { font-size: 22px; font-weight: bold; text-transform: uppercase; margin: 0 0 10px; line-height: 1.15; }
        .dmx-meta { font-size: 11px; margin: 0 0 12px; color: #333; display: flex; flex-wrap: wrap; gap: 4px 18px; }
        .dmx-section-title { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin: 14px 0 6px; page-break-after: avoid; break-after: avoid; }
        .dmx-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .dmx-table th, .dmx-table td { border: 1px solid #444; padding: 3px 6px; text-align: left; vertical-align: top; }
        .dmx-table th { background: #eee; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.5px; }
        .dmx-table td.num, .dmx-table th.num { text-align: right; white-space: nowrap; font-family: monospace; }
        .dmx-conflict td { background: #fee2e2; }
        .dmx-note { border: 1.5px solid #b45309; background: #fffbeb; padding: 6px 10px; font-size: 10px; page-break-inside: avoid; break-inside: avoid; }
        .dmx-footer { margin-top: 18px; border-top: 1px solid #999; padding-top: 6px; font-size: 9px; color: #444; page-break-inside: avoid; break-inside: avoid; }
      `}</style>}
      {embedded && <style>{`
        .dmx-doc { padding: 0; }
        .dmx-doc * { box-sizing: border-box; }
        .dmx-section-title { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; border-bottom: 1.5px solid #000; padding-bottom: 2px; margin: 14px 0 6px; page-break-after: avoid; break-after: avoid; }
        .dmx-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .dmx-table th, .dmx-table td { border: 1px solid #444; padding: 3px 6px; text-align: left; vertical-align: top; }
        .dmx-table th { background: #eee; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.5px; }
        .dmx-table td.num, .dmx-table th.num { text-align: right; white-space: nowrap; font-family: monospace; }
        .dmx-conflict td { background: #fee2e2; }
        .dmx-note { border: 1.5px solid #b45309; background: #fffbeb; padding: 6px 10px; font-size: 10px; page-break-inside: avoid; break-inside: avoid; }
        .dmx-footer { margin-top: 18px; border-top: 1px solid #999; padding-top: 6px; font-size: 9px; color: #444; }
      `}</style>}
      <div className="dmx-doc">
        <header>
          {!embedded && <p className="dmx-kicker">DMX-512 patch sheet</p>}
          {!embedded && <h1 className="dmx-title">{productionTitle}</h1>}
          <p className="dmx-meta">
            <span><strong>Scene:</strong> {sceneName ?? '—'}</span>
            <span><strong>Universes:</strong> {universes.length ? universes.join(', ') : '—'}</span>
            <span><strong>Fixtures:</strong> {rows.length} total · {patched.length} patched</span>
            <span><strong>Date:</strong> {generatedAt}</span>
          </p>
        </header>

        <section>
          <h2 className="dmx-section-title">Patched fixtures</h2>
          <table className="dmx-table">
            <thead>
              <tr>
                <th className="num">Universe</th>
                <th className="num">Address</th>
                <th className="num">Range</th>
                <th className="num">Ch</th>
                <th>Fixture</th>
                <th>Type</th>
                <th>Mode</th>
              </tr>
            </thead>
            <tbody>
              {patched.length > 0 ? (
                patched.map((row) => (
                  <tr key={row.id} className={row.conflict ? 'dmx-conflict' : undefined}>
                    <td className="num">{row.universe}</td>
                    <td className="num">{pad(row.address)}</td>
                    <td className="num">{row.endAddress !== undefined ? `${pad(row.address)}–${pad(row.endAddress)}` : '—'}</td>
                    <td className="num">{row.channels ?? '?'}</td>
                    <td>{row.label}{row.conflict ? ' ⚠ CONFLICT' : ''}</td>
                    <td>{row.fixtureType ?? '—'}</td>
                    <td>{row.dmxModeName ?? '—'}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={7}>No fixtures patched yet.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {unpatched.length > 0 && (
          <section>
            <h2 className="dmx-section-title">Unpatched / unknown footprint</h2>
            <table className="dmx-table">
              <tbody>
                {unpatched.map((row) => (
                  <tr key={row.id}>
                    <td>{row.label}</td>
                    <td>{row.fixtureType ?? '—'}</td>
                    <td className="num">{row.channels === undefined ? 'channels unknown — set in fixture inspector' : `${row.channels} ch`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {conflicts.length > 0 && (
          <section className="dmx-note" style={{ marginTop: 12 }}>
            <strong>{conflicts.length} address conflict{conflicts.length === 1 ? '' : 's'}:</strong>{' '}
            {conflicts.map((row) => `${row.label} (U${row.universe}:${pad(row.address)})`).join(' · ')} — resolve before show time.
          </section>
        )}

        <footer className="dmx-footer">
          <p>Generated from project data · {generatedAt}</p>
          <p>Planning aid only — verify the final patch against the actual console and fixture manuals.</p>
        </footer>
      </div>
    </>
  );
};
