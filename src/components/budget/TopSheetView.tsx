import React, { useMemo } from 'react';
import type { BudgetActual } from '../../domain/budget';
import type { BudgetSummary } from '../../domain/budget';
import { formatMoney } from '../../domain/budget';
import { deriveTopSheet } from '../../domain/budget/topSheet';
import type { TopSheetRow } from '../../domain/budget/topSheet';
import { bytesToBlob, downloadBlob } from '../../utils/download';
import { PdfExportButton } from '../common/PdfExportButton';

interface TopSheetViewProps {
  productionTitle: string;
  summary: BudgetSummary;
  actuals: readonly BudgetActual[];
}

/**
 * The budget top sheet: every account with estimate, actual and variance,
 * above and below the line, then contingency, VAT and the total.
 */
export const TopSheetView: React.FC<TopSheetViewProps> = ({ productionTitle, summary, actuals }) => {
  const sheet = useMemo(() => deriveTopSheet(summary, actuals), [summary, actuals]);
  const currency = summary.settings.currency;
  const money = (value: number | undefined) => (value === undefined ? '—' : formatMoney(value, currency));
  const hasActuals = sheet.actualTotal !== undefined;

  const rowCells = (row: TopSheetRow) => [
    row.account,
    row.label,
    money(row.estimate),
    `${row.percent}%`,
    ...(hasActuals ? [money(row.actual), money(row.variance)] : []),
  ];

  const exportPdf = async () => {
    const [{ createTableReportPdf }, { buildPdfFilename }] = await Promise.all([
      import('../../utils/pdf/tableReportPdf'),
      import('../../utils/pdf/filenames'),
    ]);
    const bytes = await createTableReportPdf({
      productionTitle: productionTitle || 'Production',
      documentTitle: 'Budget Top Sheet',
      subtitle: `${summary.shootDays} shooting days · ${currency}`,
      orientation: 'portrait',
      fontSize: 9,
      columns: [
        { header: 'Acct', widthFrac: 9 },
        { header: 'Account', widthFrac: hasActuals ? 31 : 51 },
        { header: 'Estimate', widthFrac: 20, align: 'right' },
        { header: '%', widthFrac: 9, align: 'right' },
        ...(hasActuals ? [{ header: 'Actual', widthFrac: 16, align: 'right' as const }, { header: 'Variance', widthFrac: 15, align: 'right' as const }] : []),
      ],
      sections: [
        { heading: 'Above the line', rows: [...sheet.aboveTheLine.map(rowCells), ['', 'Total above the line', money(sheet.subtotalAbove), '', ...(hasActuals ? ['', ''] : [])]] },
        { heading: 'Below the line', rows: [...sheet.belowTheLine.map(rowCells), ['', 'Total below the line', money(sheet.subtotalBelow), '', ...(hasActuals ? ['', ''] : [])]] },
        {
          heading: 'Totals',
          rows: [
            ['', 'Net', money(sheet.net), '', ...(hasActuals ? [money(sheet.actualTotal), money(sheet.actualTotal === undefined ? undefined : sheet.net - sheet.actualTotal)] : [])],
            ['', 'Contingency', money(sheet.contingency), '', ...(hasActuals ? ['', ''] : [])],
            ['', 'VAT', money(sheet.vat), '', ...(hasActuals ? ['', ''] : [])],
            ['', 'Grand total', money(sheet.total), '', ...(hasActuals ? ['', ''] : [])],
          ],
        },
      ],
      footnote: 'Estimates are net of VAT. Variance = estimate − actual; positive is under budget.',
    });
    downloadBlob(bytesToBlob(bytes, 'application/pdf'), buildPdfFilename({ production: productionTitle, document: 'budget-top-sheet' }));
  };

  const head = 'px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted';
  const cell = 'px-3 py-1.5';
  const section = (title: string, rows: TopSheetRow[], subtotal: number) => (
    <>
      <tr className="bg-surface-sunken"><td colSpan={hasActuals ? 6 : 4} className={`${head} text-left`}>{title}</td></tr>
      {rows.map((row) => (
        <tr key={row.category} className="border-t border-line">
          <td className={`${cell} font-mono text-ink-muted`}>{row.account}</td>
          <td className={cell}>{row.label}</td>
          <td className={`${cell} text-right font-mono`}>{money(row.estimate)}</td>
          <td className={`${cell} text-right font-mono text-ink-muted`}>{row.percent}%</td>
          {hasActuals && <td className={`${cell} text-right font-mono`}>{money(row.actual)}</td>}
          {hasActuals && <td className={`${cell} text-right font-mono ${row.variance !== undefined && row.variance < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{money(row.variance)}</td>}
        </tr>
      ))}
      <tr className="border-t border-line-strong font-bold">
        <td className={cell} />
        <td className={cell}>Total {title.toLowerCase()}</td>
        <td className={`${cell} text-right font-mono`}>{money(subtotal)}</td>
        <td colSpan={hasActuals ? 3 : 1} />
      </tr>
    </>
  );

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
      <div className="max-w-3xl mx-auto rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line">
          <div>
            <h3 className="text-sm font-bold">Top sheet</h3>
            <p className="text-[11px] text-ink-muted">Every account, estimate {hasActuals ? 'against actuals ' : ''}— the page a financier reads first.</p>
          </div>
          <PdfExportButton onClick={() => { void exportPdf(); }} title="Download the budget top sheet as a PDF" />
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className={`${head} text-left`}>Acct</th>
              <th className={`${head} text-left`}>Account</th>
              <th className={`${head} text-right`}>Estimate</th>
              <th className={`${head} text-right`}>%</th>
              {hasActuals && <th className={`${head} text-right`}>Actual</th>}
              {hasActuals && <th className={`${head} text-right`}>Variance</th>}
            </tr>
          </thead>
          <tbody>
            {section('Above the line', sheet.aboveTheLine, sheet.subtotalAbove)}
            {section('Below the line', sheet.belowTheLine, sheet.subtotalBelow)}
            <tr className="border-t-2 border-line-strong"><td /><td className={cell}>Net</td><td className={`${cell} text-right font-mono`}>{money(sheet.net)}</td><td />{hasActuals && <td className={`${cell} text-right font-mono`}>{money(sheet.actualTotal)}</td>}{hasActuals && <td />}</tr>
            <tr><td /><td className={cell}>Contingency</td><td className={`${cell} text-right font-mono`}>{money(sheet.contingency)}</td><td colSpan={hasActuals ? 3 : 1} /></tr>
            <tr><td /><td className={cell}>VAT</td><td className={`${cell} text-right font-mono`}>{money(sheet.vat)}</td><td colSpan={hasActuals ? 3 : 1} /></tr>
            <tr className="border-t border-line-strong font-black text-sm"><td /><td className={cell}>Grand total</td><td className={`${cell} text-right font-mono`}>{money(sheet.total)}</td><td colSpan={hasActuals ? 3 : 1} /></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
