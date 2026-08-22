import React from 'react';
import type { ScriptSides } from '../../domain/script';

interface ScriptSidesPrintViewProps {
  sides: ScriptSides;
  title: string;
  /** e.g. "Day 3 · 2026-09-14" — printed in the header of every scene block. */
  subtitle?: string;
  characterFilter?: string;
}

/** Courier character-column layout (12pt Courier = 10 characters per inch, 60-column body). */
const LAYOUT: Record<string, { left: number; width: number; className: string }> = {
  scene: { left: 0, width: 60, className: 'font-bold uppercase' },
  action: { left: 0, width: 60, className: '' },
  character: { left: 22, width: 38, className: 'uppercase' },
  parenthetical: { left: 16, width: 25, className: '' },
  dialogue: { left: 10, width: 35, className: '' },
  transition: { left: 40, width: 20, className: 'uppercase text-right' },
  shot: { left: 0, width: 60, className: 'uppercase' },
  note: { left: 0, width: 60, className: 'italic text-slate-500' },
  'page-break': { left: 0, width: 60, className: 'text-center text-slate-400' },
};

/**
 * Script sides — the scenes for a shooting day in shooting order, Courier
 * formatted, one scene per block with its scene number in the margin.
 * Derived from canonical script lines (plan rule 37).
 */
export const ScriptSidesPrintView: React.FC<ScriptSidesPrintViewProps> = ({ sides, title, subtitle, characterFilter }) => {
  if (sides.scenes.length === 0) {
    return (
      <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-4">
        No scenes selected for these sides{characterFilter ? ` (no scenes with dialogue for ${characterFilter})` : ''}.
      </p>
    );
  }
  return (
    <div className="font-mono text-[11.5px] leading-[1.35] text-slate-900" style={{ fontFamily: '"Courier Prime", "Courier New", Courier, monospace' }}>
      {sides.scenes.map((scene, index) => (
        <section key={scene.sceneId} className="print-section break-inside-avoid mb-6" style={{ pageBreakBefore: index > 0 && index % 3 === 0 ? 'always' : undefined }}>
          <header className="flex items-center justify-between text-[9px] uppercase tracking-wider text-slate-500 border-b border-slate-300 pb-0.5 mb-2 font-sans">
            <span>{title} · Sides</span>
            <span>{subtitle ?? ''}</span>
            <span>Scene {scene.sceneNumber}{scene.omitted ? ' · OMITTED' : ''}</span>
          </header>
          <div className="relative pl-[4ch]" style={{ maxWidth: '64ch' }}>
            {scene.lines.map((line, lineIndex) => {
              const layout = LAYOUT[line.type ?? 'action'] ?? LAYOUT.action;
              const isHeading = line.type === 'scene';
              const text = isHeading && scene.omitted ? scene.heading : line.text;
              return (
                <div
                  key={line.id}
                  className={`relative whitespace-pre-wrap break-words ${layout.className} ${scene.omitted && isHeading ? 'opacity-60 tracking-widest' : ''}`}
                  style={{
                    marginLeft: `${layout.left}ch`,
                    maxWidth: `${layout.width}ch`,
                    marginTop: lineIndex === 0 ? 0 : line.type === 'scene' ? '1.6em' : line.type === 'character' ? '1em' : '0.55em',
                  }}
                >
                  {isHeading && (
                    <span className="absolute font-bold" style={{ left: '-4ch' }}>{scene.sceneNumber}</span>
                  )}
                  {text}
                  {isHeading && (
                    <span className="absolute font-bold" style={{ right: '-4ch' }}>{scene.sceneNumber}</span>
                  )}
                </div>
              );
            })}
          </div>
          {scene.characters.length > 0 && !scene.omitted && (
            <p className="mt-2 text-[9px] font-sans text-slate-500">Cast: {scene.characters.join(', ')}</p>
          )}
        </section>
      ))}
      {sides.missingSceneIds.length > 0 && (
        <p className="text-[9px] font-sans text-rose-600">{sides.missingSceneIds.length} requested scene(s) no longer exist in the script.</p>
      )}
    </div>
  );
};
