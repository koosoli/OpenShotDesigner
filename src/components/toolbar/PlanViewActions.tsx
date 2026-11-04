import { FileDown } from 'lucide-react';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
import { PlanPreviewButton } from './PlanPreviewButton';

export function PlanViewActions() {
  const { openExportModal } = useWorkspaceUI();
  return (
    <>
      <PlanPreviewButton />
      <button
        id="btn-open-export"
        onClick={() => openExportModal()}
        title="Export & Print Studio"
        aria-label="Open the export and print studio"
        className="h-8 w-8 inline-flex items-center justify-center bg-accent hover:bg-accent-hover text-white rounded-md transition-colors shadow-sm"
      >
        <FileDown className="w-3.5 h-3.5" />
      </button>
    </>
  );
}
