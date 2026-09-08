/**
 * The text element inspector.
 *
 * Lifted out of `InspectorPanel`, which held twelve of these in one switch and
 * had reached 4,600 lines because every new field was one more branch in a file
 * nobody could read end to end (AGENTS.md: one file per variant).
 *
 * Follows `LightInspector`: it reads what it needs from context directly rather
 * than taking a long prop list, since a twenty-prop list is only a copy of the
 * context with extra steps.
 */

import React, { useId } from 'react';
import type { TextElement } from '../../../types';
import { PillToggle, RubricSection } from '../shared/InspectorPrimitives';
import { Type } from 'lucide-react';
import { useFloorPlan } from '../../../context/FloorPlanContext';

interface TextInspectorProps {
  txt: TextElement;
  isLight: boolean;
}

export const TextInspector: React.FC<TextInspectorProps> = ({ txt, isLight }) => {
  const fieldId = useId();
  const { updateElement } = useFloorPlan();
  const txtInputClass = `w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`;
  return (
    <div className="space-y-3 pt-1">
      <RubricSection
            persistKey="textinspector.text-content-typography"
        title="Text Content & Typography"
        icon={<Type className="w-3.5 h-3.5 text-blue-500" />}
        defaultOpen={true}
        isLight={isLight}
      >
        <div>
          <label htmlFor={`${fieldId}-text-content`} className="opacity-60 block mb-1">Text Content</label>
          <textarea id={`${fieldId}-text-content`}
            value={txt.text}
            onChange={(e) => updateElement(txt.id, { text: e.target.value })}
            rows={2}
            className={txtInputClass}
          />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="opacity-60">Font Size (px)</span>
            <span className="font-mono font-bold">{txt.fontSize || 16}px</span>
          </div>
          <input
            type="range"
            min={8}
            max={96}
            step={1}
            value={txt.fontSize || 16}
            onChange={(e) => updateElement(txt.id, { fontSize: Number(e.target.value) })}
            className="w-full accent-sky-500 cursor-pointer"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <PillToggle
            on={(txt.fontWeight || 'normal') === 'bold'}
            onClick={() => updateElement(txt.id, { fontWeight: txt.fontWeight === 'bold' ? 'normal' : 'bold' })}
            label="Bold"
            isLight={isLight}
          />
          <PillToggle
            on={(txt.fontStyle || 'normal') === 'italic'}
            onClick={() => updateElement(txt.id, { fontStyle: txt.fontStyle === 'italic' ? 'normal' : 'italic' })}
            label="Italic"
            isLight={isLight}
          />
          <PillToggle
            on={txt.underline === true}
            onClick={() => updateElement(txt.id, { underline: txt.underline !== true })}
            label="Underline"
            isLight={isLight}
          />
          <PillToggle
            on={txt.strikethrough === true}
            onClick={() => updateElement(txt.id, { strikethrough: txt.strikethrough !== true })}
            label="Strikethrough"
            isLight={isLight}
          />
        </div>

        <div>
          <label htmlFor={`${fieldId}-font-family`} className="opacity-60 block mb-1">Font Family</label>
          <select id={`${fieldId}-font-family`}
            value={txt.fontFamily || 'sans-serif'}
            onChange={(e) => updateElement(txt.id, { fontFamily: e.target.value })}
            className={txtInputClass}
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
          <span id={`${fieldId}-text-alignment-group`} className="opacity-60 block mb-1">Text Alignment</span>
          <div role="group" aria-labelledby={`${fieldId}-text-alignment-group`} className="grid grid-cols-3 gap-1">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                onClick={() => updateElement(txt.id, { textAlign: align })}
                className={`py-1.5 text-[10px] font-semibold rounded border capitalize ${
                  (txt.textAlign || 'center') === align
                    ? 'bg-sky-600 text-white border-sky-500'
                    : isLight
                    ? 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                    : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
                }`}
              >
                {align}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="opacity-60">Text Color</span>
            <span className="font-mono font-bold uppercase">{txt.color || '#94a3b8'}</span>
          </div>
          <input
            type="color"
            value={(txt.color || '#94a3b8').startsWith('#') ? txt.color || '#94a3b8' : `#${txt.color}`}
            onChange={(e) => updateElement(txt.id, { color: e.target.value })}
            className="w-full h-8 cursor-pointer rounded border bg-transparent"
          />
        </div>
      </RubricSection>
    </div>
  );
};
