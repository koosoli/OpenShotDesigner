/**
 * A one-time explanation of the panel the user just opened.
 *
 * The app's only in-product explanation used to be a tooltip repeating the
 * tab's own name, so "Run of show" explained itself as "Run of show". This
 * answers the two questions people actually have on first arrival: what is
 * this for, and where does its content come from — the second being the one
 * that matters most in an app where almost every panel is derived from another.
 *
 * Design decisions worth stating, because each is the opposite of what a
 * conventional onboarding does:
 *
 *  - It appears where you are, not at startup. Nothing is explained before the
 *    user has a reason to care.
 *  - It never blocks. No overlay, no "next", no step counter — it is a strip
 *    above the panel that can be dismissed and forgotten.
 *  - Dismissal is per panel and permanent. Someone who knows the shot list
 *    should not have to dismiss it again to reach the schedule, and never
 *    again after that.
 *  - Once dismissed it collapses to a "?" rather than disappearing. Onboarding
 *    you cannot get back is a worse deal than onboarding you must dismiss.
 */
import React from 'react';
import { HelpCircle, X } from 'lucide-react';
import { moduleGuideFor } from '../../domain/workspace';
import { usePersistentUiState } from '../../utils/usePersistentUiState';
import { useFloorPlan } from '../../context/FloorPlanContext';

export interface PanelIntroProps {
  /** Workspace module id, e.g. `shots`. Also the persistence key. */
  moduleId: string;
  isLight: boolean;
}

export const PanelIntro: React.FC<PanelIntroProps> = ({ moduleId, isLight }) => {
  const { displaySettings } = useFloorPlan();
  const [isDismissed, setDismissed] = usePersistentUiState(
    `panelIntro.${moduleId}.dismissed`,
    false,
  );
  const guide = moduleGuideFor(moduleId);

  // Master switch in Viewing Options: off means fully off, including the "?"
  // re-opener — there is nothing to re-open until the strips are enabled.
  if (displaySettings.showPanelIntros !== true) return null;

  // A module with nothing worth saying says nothing, rather than carrying a
  // sentence written to fill the slot.
  if (!guide) return null;

  if (isDismissed) {
    return (
      <div className="flex justify-end px-2.5 pt-1.5">
        <button
          type="button"
          onClick={() => setDismissed(false)}
          title="What is this panel for?"
          aria-label="What is this panel for?"
          className={`p-1 rounded-md transition-colors ${
            isLight
              ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
              : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <aside
      aria-label="About this panel"
      className={`mx-2.5 mt-2 rounded-lg border px-3 py-2 flex items-start gap-2 ${
        isLight
          ? 'bg-sky-50 border-sky-200 text-sky-950'
          : 'bg-sky-950/30 border-sky-900 text-sky-100'
      }`}
    >
      <HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-500" />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-[11px] font-semibold leading-snug">{guide.purpose}</p>
        <p className="text-[10px] leading-snug opacity-80">{guide.feeds}</p>
        {guide.output && (
          <p className="text-[10px] leading-snug opacity-70">
            <span className="font-bold uppercase tracking-wider text-[8px]">Exports</span>{' '}
            {guide.output}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        title="Got it — hide this"
        aria-label="Hide the explanation for this panel"
        className={`p-1 rounded shrink-0 transition-colors ${
          isLight ? 'hover:bg-sky-200/60' : 'hover:bg-sky-900/60'
        }`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </aside>
  );
};
