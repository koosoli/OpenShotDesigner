import React from 'react';
import type { BudgetSummary } from '../../domain/budget';
import { RATE_BASIS_LABELS, formatMoney } from '../../domain/budget';
import { ProjectImage } from '../common/ProjectImage';

interface BudgetPrintViewProps {
  productionTitle: string;
  company?: string;
  logo?: string;
  summary: BudgetSummary;
}

/**
 * The budget as paper. Render inside a `.budget-print-host` container (see the
 * embedded style block): off-screen on screen, the only document in print.
 *
 * Laid out the way a financier reads one: totals and the above/below split
 * first, then every category with its lines, then VAT by rate — which is the
 * table the accountant wants and the one nobody prints by hand.
 */
export const BudgetPrintView: React.FC<BudgetPrintViewProps> = ({ productionTitle, company, logo, summary }) => {
  const generatedAt = new Date().toISOString().split('T')[0];
  const money = (value: number) => formatMoney(value, summary.settings.currency);

  return (
    <>
      <style>{`
        .budget-print-host {
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
          .budget-print-host { position: static !important; left: 0 !important; width: auto !important; }
        }
        .bu-doc { padding: 6mm 4mm; color: #0f172a; background: #fff; font-size: 10.5px; line-height: 1.35; }
        .bu-doc * { box-sizing: border-box; }
        .bu-masthead { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; border-bottom: 3px solid #0f172a; padding-bottom: 8px; }
        .bu-kicker { font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase; color: #047857; font-weight: 700; margin: 0 0 3px; }
        .bu-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; line-height: 1.05; letter-spacing: -0.3px; }
        .bu-company { font-size: 9px; color: #475569; margin: 4px 0 0; }
        .bu-logo { max-width: 42mm; max-height: 16mm; object-fit: contain; }
        .bu-totals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #cbd5e1; border: 1px solid #cbd5e1; margin-top: 8px; }
        .bu-totals div { background: #f8fafc; padding: 5px 7px; }
        .bu-totals b { display: block; font-size: 7.5px; letter-spacing: 1px; text-transform: uppercase; color: #64748b; margin-bottom: 1px; }
        .bu-totals span { font-family: 'Courier New', monospace; font-weight: 900; font-size: 13px; }
        .bu-section { font-size: 9px; letter-spacing: 1.8px; text-transform: uppercase; font-weight: 900; color: #fff; background: #0f172a; padding: 3px 7px; margin: 12px 0 0; display: flex; justify-content: space-between; break-after: avoid; }
        .bu-section.atl { background: #047857; }
        .bu-table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .bu-table th, .bu-table td { border: 1px solid #cbd5e1; padding: 3.5px 6px; text-align: left; vertical-align: top; }
        .bu-table th { background: #f1f5f9; text-transform: uppercase; font-size: 8px; letter-spacing: 0.8px; color: #475569; }
        .bu-table td.num, .bu-table th.num { text-align: right; font-family: 'Courier New', monospace; white-space: nowrap; }
        .bu-table tr { break-inside: avoid; }
        .bu-sub td { font-weight: 900; background: #f8fafc; }
        .bu-detail { font-size: 8px; color: #475569; }
        .bu-warn { font-size: 8px; color: #b45309; }
        .bu-foot { margin-top: 10px; font-size: 8px; color: #64748b; display: flex; justify-content: space-between; }
      `}</style>
      <div className="bu-doc">
        <header className="bu-masthead">
          <div>
            <p className="bu-kicker">Production budget</p>
            <h1 className="bu-title">{productionTitle}</h1>
            {company && <p className="bu-company">{company}</p>}
            <p className="bu-company">
              {summary.shootDays} shooting day{summary.shootDays === 1 ? '' : 's'} · amounts in {summary.settings.currency}, net unless stated · default VAT {summary.settings.defaultVatPercent}% · paid week {summary.settings.weekDays} days
            </p>
          </div>
          {logo && <ProjectImage imageRef={logo} alt="Production logo" className="bu-logo" />}
        </header>

        <div className="bu-totals">
          <div><b>Net</b><span>{money(summary.net)}</span></div>
          <div><b>VAT</b><span>{money(summary.vat)}</span></div>
          <div><b>Gross</b><span>{money(summary.gross)}</span></div>
          <div><b>Total{summary.contingency > 0 ? ` incl. ${summary.settings.contingencyPercent}% contingency` : ''}</b><span>{money(summary.total)}</span></div>
        </div>
        <div className="bu-totals" style={{ marginTop: 1 }}>
          <div><b>Above the line (gross)</b><span>{money(summary.aboveTheLine.gross)}</span></div>
          <div><b>Below the line (gross)</b><span>{money(summary.belowTheLine.gross)}</span></div>
          <div><b>Priced lines</b><span>{summary.entries.length}</span></div>
          <div><b>Unpriced</b><span>{summary.unpriced.length}</span></div>
        </div>

        {summary.categories.map((category) => (
          <section key={category.category}>
            <h2 className={`bu-section${category.category === 'above_the_line' ? ' atl' : ''}`}>
              <span>{category.label}</span>
              <span>{money(category.gross)}</span>
            </h2>
            <table className="bu-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Rate</th>
                  <th className="num">Days × qty</th>
                  <th className="num">Net</th>
                  <th className="num">VAT</th>
                  <th className="num">Gross</th>
                </tr>
              </thead>
              <tbody>
                {category.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <strong>{entry.label}</strong>
                      {entry.detail && <div className="bu-detail">{entry.detail}</div>}
                      {entry.warning && <div className="bu-warn">{entry.warning}</div>}
                    </td>
                    <td className="num">{money(entry.rate)} {RATE_BASIS_LABELS[entry.basis]}</td>
                    <td className="num">{entry.basis === 'flat' ? '—' : `${entry.units} d`}{entry.quantity > 1 ? ` × ${entry.quantity}` : ''}</td>
                    <td className="num">{money(entry.net)}</td>
                    <td className="num">{entry.vatPercent}% · {money(entry.vat)}</td>
                    <td className="num">{money(entry.gross)}</td>
                  </tr>
                ))}
                <tr className="bu-sub">
                  <td colSpan={3}>Subtotal {category.label}</td>
                  <td className="num">{money(category.net)}</td>
                  <td className="num">{money(category.vat)}</td>
                  <td className="num">{money(category.gross)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        ))}

        <section>
          <h2 className="bu-section"><span>VAT by rate</span><span>{money(summary.vat)}</span></h2>
          <table className="bu-table">
            <thead><tr><th>Rate</th><th className="num">Net base</th><th className="num">VAT</th></tr></thead>
            <tbody>
              {summary.vatByRate.map((bucket) => (
                <tr key={bucket.percent}>
                  <td>{bucket.percent}%</td>
                  <td className="num">{money(bucket.net)}</td>
                  <td className="num">{money(bucket.vat)}</td>
                </tr>
              ))}
              {summary.contingency > 0 && (
                <tr className="bu-sub"><td>Contingency {summary.settings.contingencyPercent}% on net</td><td className="num">{money(summary.net)}</td><td className="num">{money(summary.contingency)}</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {summary.unpriced.length > 0 && (
          <section>
            <h2 className="bu-section"><span>Not yet priced</span><span>{summary.unpriced.length}</span></h2>
            <p style={{ fontSize: '9px', margin: '4px 0 0' }}>
              {summary.unpriced.map((item) => item.label).join(' · ')}
            </p>
          </section>
        )}

        <footer className="bu-foot">
          <span>Derived from the crew list, the plans and the schedule; rates and hand lines are the only inputs.</span>
          <span>Generated {generatedAt}</span>
        </footer>
      </div>
    </>
  );
};
