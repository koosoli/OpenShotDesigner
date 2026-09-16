/**
 * The callout annotation inspector, plus the per-element annotation list.
 *
 * An annotation is a regular plan element (`type: 'annotation'`) whose leader
 * line is derived from its target to its own freely-movable text anchor. This
 * file owns both halves of that relationship in the inspector:
 *
 * - `AnnotationInspector` edits the selected annotation itself: text content,
 *   typography, pill background and the faint-by-default leader line.
 * - `ElementAnnotationsSection` renders under every OTHER element type and is
 *   how a callout gets created in the first place ("Add annotation"), with the
 *   existing callouts on this element listed for quick selection.
 *
 * Follows `TextInspector`/`ArrowInspector`: reads context directly rather than
 * taking a long prop list.
 */

import React, { useId } from 'react';
import type { AnnotationElement } from '../../../types';
import { PillToggle, RubricSection } from '../shared/InspectorPrimitives';
import { MessageSquarePlus, MoveUpRight, StickyNote, Trash2 } from 'lucide-react';
import { useFloorPlan } from '../../../context/FloorPlanContext';
import { annotationsForTarget, stripAnnotationsTargeting } from '../../../domain/plan/annotations';

interface AnnotationInspectorProps {
  ann: AnnotationElement;
  isLight: boolean;
}

export const AnnotationInspector: React.FC<AnnotationInspectorProps> = ({ ann, isLight }) => {
  const fieldId = useId();
  const { activeSetup, updateElement, selectElement } = useFloorPlan();
  const inputClass = `w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`;
  const target = activeSetup.elements.find((el) => el.id === ann.targetElementId);
  const lineWidth = ann.lineWidth ?? 1;
  const lineOpacity = ann.lineOpacity ?? 0.25;
  const lineDash = ann.lineDash ?? 'solid';
  const optionBtn = (active: boolean) =>
    `py-1.5 text-[10px] font-semibold rounded border capitalize ${
      active
        ? 'bg-sky-600 text-white border-sky-500'
        : isLight
        ? 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
        : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
    }`;

  return (
    <div className="space-y-3 pt-1">
      <RubricSection
        title="Linked Element"
        icon={<MoveUpRight className="w-3.5 h-3.5 text-sky-500" />}
        defaultOpen={true}
        isLight={isLight}
      >
        {target ? (
          <button
            onClick={() => selectElement(target.id, false, true)}
            title="Select the element this callout points at"
            className={`w-full text-left border rounded-lg p-2 transition-colors ${
              isLight ? 'bg-slate-50 border-slate-200 hover:bg-slate-100' : 'bg-slate-950 border-slate-800 hover:bg-slate-800'
            }`}
          >
            <span className="block text-[10px] uppercase tracking-wider opacity-60">{target.type}</span>
            <span className="block text-xs font-bold truncate">{target.name || target.id}</span>
          </button>
        ) : (
          <p className="text-[11px] text-amber-500 font-semibold">
            Detached — its target element is gone. The text stays where it was; delete this callout or leave it as a free note.
          </p>
        )}
        <p className="text-[10px] italic opacity-60">
          Drag the text anywhere on the plan — the leader line stays connected to the target.
        </p>
      </RubricSection>

      <RubricSection
        title="Text Content & Typography"
        icon={<StickyNote className="w-3.5 h-3.5 text-blue-500" />}
        defaultOpen={true}
        isLight={isLight}
      >
        <div>
          <label htmlFor={`${fieldId}-annotation-text`} className="opacity-60 block mb-1">Text Content</label>
          <textarea id={`${fieldId}-annotation-text`}
            value={ann.text}
            onChange={(e) => updateElement(ann.id, { text: e.target.value })}
            rows={2}
            className={inputClass}
          />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="opacity-60">Font Size (px)</span>
            <span className="font-mono font-bold">{ann.fontSize || 14}px</span>
          </div>
          <input
            type="range"
            min={8}
            max={96}
            step={1}
            value={ann.fontSize || 14}
            onChange={(e) => updateElement(ann.id, { fontSize: Number(e.target.value) })}
            className="w-full accent-sky-500 cursor-pointer"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <PillToggle
            on={(ann.fontWeight || 'normal') === 'bold'}
            onClick={() => updateElement(ann.id, { fontWeight: ann.fontWeight === 'bold' ? 'normal' : 'bold' })}
            label="Bold"
            isLight={isLight}
          />
          <PillToggle
            on={(ann.fontStyle || 'normal') === 'italic'}
            onClick={() => updateElement(ann.id, { fontStyle: ann.fontStyle === 'italic' ? 'normal' : 'italic' })}
            label="Italic"
            isLight={isLight}
          />
          <PillToggle
            on={ann.underline === true}
            onClick={() => updateElement(ann.id, { underline: ann.underline !== true })}
            label="Underline"
            isLight={isLight}
          />
          <PillToggle
            on={ann.strikethrough === true}
            onClick={() => updateElement(ann.id, { strikethrough: ann.strikethrough !== true })}
            label="Strikethrough"
            isLight={isLight}
          />
        </div>

        <div>
          <label htmlFor={`${fieldId}-annotation-font`} className="opacity-60 block mb-1">Font Family</label>
          <select id={`${fieldId}-annotation-font`}
            value={ann.fontFamily || 'sans-serif'}
            onChange={(e) => updateElement(ann.id, { fontFamily: e.target.value })}
            className={inputClass}
          >
            <option value="sans-serif">Sans-Serif</option>
            <option value="serif">Serif</option>
            <option value="monospace">Monospace</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="Verdana, sans-serif">Verdana</option>
            <option value="Impact, sans-serif">Impact</option>
          </select>
        </div>

        <div>
          <span id={`${fieldId}-annotation-align-group`} className="opacity-60 block mb-1">Text Alignment</span>
          <div role="group" aria-labelledby={`${fieldId}-annotation-align-group`} className="grid grid-cols-3 gap-1">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                onClick={() => updateElement(ann.id, { textAlign: align })}
                className={optionBtn((ann.textAlign || 'center') === align)}
              >
                {align}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="opacity-60">Text Color</span>
            <span className="font-mono font-bold uppercase">{ann.color || '#e2e8f0'}</span>
          </div>
          <input
            type="color"
            value={(ann.color || '#e2e8f0').startsWith('#') ? ann.color || '#e2e8f0' : '#e2e8f0'}
            onChange={(e) => updateElement(ann.id, { color: e.target.value })}
            className="w-full h-8 cursor-pointer rounded border bg-transparent"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 items-end">
          <PillToggle
            on={ann.showBackground === true}
            onClick={() => updateElement(ann.id, { showBackground: ann.showBackground !== true })}
            label="Background Pill"
            isLight={isLight}
          />
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="opacity-60">Pill Color</span>
            </div>
            <input
              type="color"
              value={(ann.backgroundColor || (isLight ? '#ffffff' : '#0f172a')).startsWith('#') ? (ann.backgroundColor || (isLight ? '#ffffff' : '#0f172a')) : (isLight ? '#ffffff' : '#0f172a')}
              onChange={(e) => updateElement(ann.id, { backgroundColor: e.target.value })}
              disabled={ann.showBackground !== true}
              className="w-full h-8 cursor-pointer rounded border bg-transparent disabled:opacity-40"
            />
          </div>
        </div>
      </RubricSection>

      <RubricSection
        title="Leader Line"
        icon={<MoveUpRight className="w-3.5 h-3.5 text-slate-400" />}
        defaultOpen={true}
        isLight={isLight}
      >
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="opacity-60">Line Color</span>
            <span className="font-mono font-bold uppercase">{ann.lineColor || '#94a3b8'}</span>
          </div>
          <input
            type="color"
            value={(ann.lineColor || '#94a3b8').startsWith('#') ? ann.lineColor || '#94a3b8' : '#94a3b8'}
            onChange={(e) => updateElement(ann.id, { lineColor: e.target.value })}
            className="w-full h-8 cursor-pointer rounded border bg-transparent"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="opacity-60">Line Weight</span>
            <span className="font-mono font-bold">{lineWidth}px</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={6}
            step={0.5}
            value={lineWidth}
            onChange={(e) => updateElement(ann.id, { lineWidth: Number(e.target.value) })}
            className="w-full accent-sky-500 cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="opacity-60">Line Opacity (faint by default)</span>
            <span className="font-mono font-bold">{Math.round(lineOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={lineOpacity}
            onChange={(e) => updateElement(ann.id, { lineOpacity: Number(e.target.value) })}
            className="w-full accent-sky-500 cursor-pointer"
          />
        </div>

        <div>
          <span id={`${fieldId}-annotation-dash-group`} className="opacity-60 block mb-1">Line Style</span>
          <div role="group" aria-labelledby={`${fieldId}-annotation-dash-group`} className="grid grid-cols-3 gap-1">
            {(['solid', 'dashed', 'dotted'] as const).map((dash) => (
              <button
                key={dash}
                onClick={() => updateElement(ann.id, { lineDash: dash })}
                className={optionBtn(lineDash === dash)}
              >
                {dash}
              </button>
            ))}
          </div>
        </div>
      </RubricSection>
    </div>
  );
};

/**
 * The annotation list shown under every non-annotation element: existing
 * callouts on this element plus the "Add annotation" entry point. Creating one
 * selects it immediately so the user can type without hunting for it.
 */
export const ElementAnnotationsSection: React.FC<{ elementId: string; isLight: boolean }> = ({
  elementId,
  isLight,
}) => {
  const { activeSetup, addElement, selectElement, updateSetupMeta } = useFloorPlan();
  const notes = annotationsForTarget(activeSetup.elements, elementId);

  const addAnnotation = () => {
    addElement({ type: 'annotation', targetElementId: elementId } as Parameters<typeof addElement>[0]);
  };

  // Deleting a callout also drops anything pointed at it (an annotation can
  // itself be annotated), mirroring the canvas cascade without reimplementing it.
  const removeAnnotation = (noteId: string) => {
    updateSetupMeta({
      elements: stripAnnotationsTargeting(
        activeSetup.elements.filter((element) => element.id !== noteId),
        new Set([noteId]),
      ),
    });
  };

  return (
    <RubricSection
      title="Annotations"
      icon={<MessageSquarePlus className="w-3.5 h-3.5 text-amber-500" />}
      badge={
        notes.length > 0 ? (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-500/10 opacity-75">
            {notes.length}
          </span>
        ) : undefined
      }
      defaultOpen={notes.length > 0}
      isLight={isLight}
    >
      {notes.length > 0 && (
        <ul className="space-y-1.5">
          {notes.map((note) => (
            <li
              key={note.id}
              className={`flex items-center gap-1.5 border rounded-lg p-1.5 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}
            >
              <button
                onClick={() => selectElement(note.id, false, true)}
                title="Select this annotation to edit it"
                className="flex-1 min-w-0 text-left"
              >
                <span className="block text-[11px] font-semibold truncate">{note.text || 'Note'}</span>
                <span className="block text-[9px] font-mono opacity-50">
                  X:{Math.round(note.x)} Y:{Math.round(note.y)}
                </span>
              </button>
              <button
                onClick={() => removeAnnotation(note.id)}
                title="Delete this annotation"
                aria-label={`Delete annotation ${note.text || 'Note'}`}
                className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={addAnnotation}
        className={`w-full py-2 rounded-lg border border-dashed text-[11px] font-semibold transition-colors flex items-center justify-center gap-1.5 ${
          isLight ? 'text-amber-700 border-amber-300 hover:bg-amber-50' : 'text-amber-300 border-amber-800 hover:bg-amber-950/40'
        }`}
      >
        <MessageSquarePlus className="w-3.5 h-3.5" /> Add Annotation
      </button>
      <p className="text-[10px] italic opacity-60">
        Adds a note with a faint leader line to this element. Drag the text anywhere — the line follows.
      </p>
    </RubricSection>
  );
};
