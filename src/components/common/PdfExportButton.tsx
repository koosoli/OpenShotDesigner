import React from 'react';
import { FileDown } from 'lucide-react';

interface PdfExportButtonProps {
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  className?: string;
}

/** One compact, predictable PDF action for every workspace surface. */
export const PdfExportButton: React.FC<PdfExportButtonProps> = ({
  onClick,
  title = 'PDF export',
  disabled = false,
  className = '',
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    className={`h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40 bg-white border-slate-300 text-slate-700 hover:border-sky-500 hover:text-sky-700 dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200 dark:hover:border-sky-500 dark:hover:text-sky-300 ${className}`}
  >
    <FileDown className="h-3.5 w-3.5" />
  </button>
);
