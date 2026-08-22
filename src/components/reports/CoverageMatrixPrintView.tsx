import React from 'react';

export interface PrintableCoverageRow {
  label: string;
  /** Responsibility text per camera, aligned with the `cameras` array ('' = none). */
  cells: string[];
}

interface CoverageMatrixPrintViewProps {
  productionTitle: string;
  company?: string;
  cameras: string[];
  rows: PrintableCoverageRow[];
}

/**
 * Self-contained printable coverage matrix (the Coverage tab as paper):
 * camera responsibility per row, complementary to individual shots.
 */
export const CoverageMatrixPrintView: React.FC<CoverageMatrixPrintViewProps> = ({
  productionTitle,
  company,
  cameras,
  rows,
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
        .cv-doc { padding: 6mm 4mm; color: #0f172a; background: #fff; font-size: 10.5px; line-height: 1.35; }
        .cv-doc * { box-sizing: border-box; }
        .cv-masthead { border-bottom: 3px solid #0f172a; padding-bottom: 8px; margin-bottom: 4px; }
        .cv-kicker { font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase; color: #0e7490; font-weight: 700; margin: 0 0 3px; }
        .cv-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; line-height: 1.05; letter-spacing: -0.3px; }
        .cv-company { font-size: 9px; color: #475569; margin: 4px 0 0; }
        .cv-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 10px; }
        .cv-table th, .cv-table td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }
        .cv-table th { background: #f1f5f9; text-transform: uppercase; font-size: 8px; letter-spacing: 0.8px; color: #475569; }
        .cv-table td.row-label { font-weight: 700; background: #f8fafc; width: 34mm; }
        .cv-table td.empty { color: #cbd5e1; text-align: center; }
        .cv-footer { margin-top: 14px; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 8.5px; color: #475569; display: flex; justify-content: space-between; gap: 10px; }
        .cv-footer p { margin: 0; }
      `}</style>
      <div className="cv-doc">
        <header className="cv-masthead">
          <p className="cv-kicker">{company ? `${company} · ` : ''}Production schedule · Coverage matrix</p>
          <h1 className="cv-title">{productionTitle}</h1>
          <p className="cv-company">{cameras.length} camera{cameras.length === 1 ? '' : 's'} · {rows.length} row{rows.length === 1 ? '' : 's'} · generated {generatedAt}</p>
        </header>

        {rows.length > 0 && cameras.length > 0 ? (
          <table className="cv-table">
            <thead>
              <tr>
                <th style={{ width: '34mm' }}>Row</th>
                {cameras.map((camera) => (
                  <th key={camera}>{camera}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`row-${i}`}>
                  <td className="row-label">{row.label}</td>
                  {row.cells.map((text, c) => (
                    <td key={`cell-${i}-${c}`} className={text ? undefined : 'empty'}>{text || '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>The coverage matrix is empty — add camera columns and rows in the Coverage tab.</p>
        )}

        <footer className="cv-footer">
          <p>Generated from project data · {generatedAt}</p>
          <p>Coverage planning aid — not a shot list or a safety certification.</p>
        </footer>
      </div>
    </>
  );
};
