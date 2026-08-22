import React from 'react';
import { Radio } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import type { StandingCallSheet, StandingCallSheetField } from '../../domain/reports';

interface StandingCallSheetEditorProps {
  fieldClass: string;
}

const FIELDS: Array<{
  key: StandingCallSheetField;
  label: string;
  placeholder: string;
  rows?: number;
}> = [
  {
    key: 'walkieChannels',
    label: 'Walkie channels',
    placeholder: 'Ch 1 Production · Ch 2 Camera · Ch 3 Grip/Electric',
    rows: 2,
  },
  { key: 'unitBase', label: 'Unit base', placeholder: 'Where the trucks and catering sit', rows: 2 },
  { key: 'parking', label: 'Parking & access', placeholder: 'Standing parking and access notes', rows: 2 },
  { key: 'nearestHospital', label: 'Nearest hospital', placeholder: 'Facility, address, phone', rows: 2 },
  { key: 'safetyNotes', label: 'Safety bulletin', placeholder: 'Standing policy, PPE, medic', rows: 2 },
  { key: 'generalNotes', label: 'General notes', placeholder: 'Department notes that apply all shoot', rows: 3 },
];

/**
 * The production's standing call-sheet content.
 *
 * Every shooting day inherits these live rather than receiving a copy. That is
 * the whole reason this exists: copying yesterday's values onto today means
 * fifteen days each hold their own walkie plan, and changing channel 3 means
 * finding fifteen records — the ones nobody remembers are then wrong silently.
 * Here, changing a value changes every sheet that has not overridden it.
 */
export const StandingCallSheetEditor: React.FC<StandingCallSheetEditorProps> = ({ fieldClass }) => {
  const { project, updateProjectMeta } = useFloorPlan();
  const standing = project.standingCallSheet ?? {};

  const patch = (updates: Partial<StandingCallSheet>) =>
    updateProjectMeta((prev) => ({
      standingCallSheet: { ...(prev.standingCallSheet ?? {}), ...updates },
    }));

  return (
    <div className="space-y-2">
      <div>
        <div className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-600 flex items-center gap-1.5">
          <Radio className="w-3 h-3" /> Standing content
        </div>
        <p className="text-[9px] text-slate-500 mt-0.5">
          Every shooting day inherits these. A day that fills the same field in its own setup
          overrides them for that day only.
        </p>
      </div>
      {FIELDS.map((field) => (
        <label key={field.key} className="text-[9px] font-bold uppercase text-slate-500 block">
          {field.label}
          <textarea
            rows={field.rows ?? 2}
            value={standing[field.key] ?? ''}
            onChange={(event) => patch({ [field.key]: event.target.value || undefined })}
            placeholder={field.placeholder}
            className={`${fieldClass} mt-1 resize-none`}
          />
        </label>
      ))}
    </div>
  );
};
