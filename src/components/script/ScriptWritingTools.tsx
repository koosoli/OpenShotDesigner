import React, { useMemo, useState } from 'react';
import type { ScriptAlternate, ScriptLine } from '../../types';
import { createId } from '../../domain/ids';
import { chooseScriptAlternate, editScriptText, findScriptText, MAX_SCRIPT_ALTERNATES, MAX_SCRIPT_NOTES, moveScriptScene, replaceScriptHits, toggleTextStyle } from '../../domain/script/editing';
import type { ScriptSearchHit, StyleFlag } from '../../domain/script/editing';
import { StyledScriptText } from './StyledScriptText';

export interface WritingSelection { lineId: string; start: number; end: number }
interface Props {
  lines: ScriptLine[];
  activeLineId: string | null;
  selection: WritingSelection | null;
  pagesLocked: boolean;
  onChange: (lines: ScriptLine[]) => void;
  onGoTo: (hit: ScriptSearchHit) => void;
}
const button = 'rounded border border-line-strong px-2 py-1 text-xs hover:bg-surface-hover disabled:opacity-40';
const field = 'rounded border border-line-strong bg-surface px-2 py-1 text-xs min-w-0';
const editedAlternative = (alternative: ScriptAlternate, text: string): ScriptAlternate => {
  const next = editScriptText({ ...alternative, lineNumber: 0 }, text);
  return { id: alternative.id, text: next.text, ...(next.styles ? { styles: next.styles } : {}) };
};

/** Writes use the existing screenplay action, retaining history and production references. */
export function ScriptWritingTools({ lines, activeLineId, selection, pagesLocked, onChange, onGoTo }: Props) {
  const [query, setQuery] = useState(''), [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false), [hitIndex, setHitIndex] = useState(0);
  const hits = useMemo(() => findScriptText(lines, query, matchCase), [lines, query, matchCase]);
  const current = hits[hitIndex % Math.max(1, hits.length)];
  const line = lines.find((l) => l.id === activeLineId);
  const [noteText, setNoteText] = useState(''), [author, setAuthor] = useState(''), [noteColor, setNoteColor] = useState('#facc15');
  const [alternate, setAlternate] = useState(''), [sectionTitle, setSectionTitle] = useState('');
  const [sectionLevel, setSectionLevel] = useState<1 | 2 | 3>(1);
  const [toolError, setToolError] = useState('');
  const scenes = lines.filter((l) => l.type === 'scene');
  const selectedRange = line && selection?.lineId === line.id ? selection : null;
  const writeLine = (next: ScriptLine) => onChange(lines.map((l) => l.id === next.id ? next : l));
  const format = (flag: StyleFlag) => {
    try {
      if (line && selectedRange) writeLine(toggleTextStyle(line, selectedRange.start, selectedRange.end, flag));
      setToolError('');
    } catch (error) { setToolError(error instanceof Error ? error.message : 'Formatting could not be applied.'); }
  };
  const jump = (step: number) => {
    if (!hits.length) return;
    const index = (hitIndex + step + hits.length) % hits.length;
    setHitIndex(index); onGoTo(hits[index]);
  };
  return <section aria-label="Screenplay writing tools" className="shrink-0 border-b border-line p-3 space-y-3 bg-surface text-ink text-xs max-h-[35%] overflow-y-auto">
    {toolError && <p role="alert">{toolError}</p>}
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1">Find <input aria-label="Find in screenplay" className={field} maxLength={500} value={query} onChange={(e) => { setQuery(e.target.value); setHitIndex(0); }} /></label>
      <label className="flex items-center gap-1"><input type="checkbox" checked={matchCase} onChange={(e) => { setMatchCase(e.target.checked); setHitIndex(0); }} /> Match case</label>
      <span role="status">{hits.length ? `${hitIndex % hits.length + 1} / ${hits.length}${hits.length === 10000 ? '+' : ''}` : '0 matches'}</span>
      <button className={button} disabled={!hits.length} onClick={() => jump(-1)}>Previous match</button>
      <button className={button} disabled={!hits.length} onClick={() => { if (current) onGoTo(current); }}>Go to match</button>
      <button className={button} disabled={!hits.length} onClick={() => jump(1)}>Next match</button>
      <label className="flex items-center gap-1">Replace <input aria-label="Replacement text" className={field} maxLength={8192} value={replacement} onChange={(e) => setReplacement(e.target.value.replace(/[\r\n]/g, ' '))} /></label>
      <button className={button} disabled={!current} onClick={() => { if (current) onChange(replaceScriptHits(lines, [current], replacement)); }}>Replace match</button>
      <button className={button} disabled={!hits.length || hits.length >= 10000 || hits.length * replacement.length > 2 * 1024 * 1024} onClick={() => onChange(replaceScriptHits(lines, hits, replacement))}>Replace all</button>
    </div>
    {hits.length >= 10000 && <p role="status">Refine the search: showing the first 10,000 matches. Replace all is disabled.</p>}
    {hits.length * replacement.length > 2 * 1024 * 1024 && <p role="status">This replacement would add too much text at once. Replace fewer matches.</p>}
    <details open>
      <summary className="font-semibold cursor-pointer">Selected paragraph{line ? ` · ${line.lineNumber}` : ''}</summary>
      {!line ? <p className="mt-2 text-ink-muted">Click a paragraph in the screenplay to edit its writing tools.</p> : <div className="mt-2 space-y-3" key={line.id}>
        <p className="font-mono line-clamp-2"><StyledScriptText text={line.text || '(empty paragraph)'} styles={line.styles} /></p>
        <div className="flex flex-wrap gap-2 items-center">
          <span>Select words in the paragraph to format:</span>
          {(['bold', 'italic', 'underline'] as const).map((flag) => <button key={flag} className={button} disabled={!selectedRange || selectedRange.start === selectedRange.end} onMouseDown={(e) => e.preventDefault()} onClick={() => format(flag)}>{flag === 'bold' ? 'Bold' : flag === 'italic' ? 'Italic' : 'Underline'}</button>)}
          <label>Bookmark <input aria-label="Paragraph bookmark" key={`bookmark-${line.bookmark ?? ""}`} className={field} maxLength={120} defaultValue={line.bookmark ?? ''} onBlur={(e) => { if (e.target.value !== (line.bookmark ?? '')) writeLine({ ...line, bookmark: e.target.value.trim() || undefined }); }} /></label>
        </div>
        <fieldset className="space-y-2">
          <legend className="font-semibold">Script notes</legend>
          <div className="flex flex-wrap gap-2 items-center">
            <input aria-label="New note text" className={`${field} grow`} maxLength={8192} placeholder="Note on the selection or whole paragraph" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
            <input aria-label="Note author" className={field} maxLength={120} placeholder="Author (optional)" value={author} onChange={(e) => setAuthor(e.target.value)} />
            <input aria-label="Note colour" type="color" value={noteColor} onChange={(e) => setNoteColor(e.target.value)} />
            <button className={button} disabled={!noteText.trim() || (line.notes?.length ?? 0) >= MAX_SCRIPT_NOTES} onClick={() => {
              writeLine({ ...line, notes: [...(line.notes ?? []), { id: createId('sn'), text: noteText.trim(), ...(author.trim() ? { author: author.trim() } : {}), color: noteColor, start: selectedRange?.start ?? 0, end: selectedRange?.end ?? line.text.length }] }); setNoteText('');
            }}>Add note</button>
          </div>
          {line.notes?.map((n) => <div key={n.id} className="flex flex-wrap items-center gap-2 border-l-4 pl-2" style={{ borderColor: n.color ?? '#facc15' }}>
            <button className={button} onClick={() => onGoTo({ lineId: line.id, start: n.start, end: n.end })}>Show anchor</button>
            <input aria-label="Edit note text" key={`note-${n.text}`} className={`${field} grow`} maxLength={8192} defaultValue={n.text} onBlur={(e) => { if (e.target.value !== n.text) writeLine({ ...line, notes: line.notes?.map((a) => a.id === n.id ? { ...a, text: e.target.value } : a) }); }} />
            <input aria-label="Edit note author" key={`author-${n.author ?? ""}`} className={field} maxLength={120} defaultValue={n.author ?? ''} onBlur={(e) => { if (e.target.value !== (n.author ?? '')) writeLine({ ...line, notes: line.notes?.map((a) => a.id === n.id ? { ...a, author: e.target.value || undefined } : a) }); }} />
            <input aria-label="Edit note colour" type="color" value={n.color ?? '#facc15'} onChange={(e) => writeLine({ ...line, notes: line.notes?.map((a) => a.id === n.id ? { ...a, color: e.target.value } : a) })} />
            <button className={button} onClick={() => writeLine({ ...line, notes: line.notes?.filter((a) => a.id !== n.id) })}>Delete note</button>
          </div>)}
        </fieldset>
        {line.type === 'dialogue' && <fieldset className="space-y-2">
          <legend className="font-semibold">Dialogue alternatives · only the active paragraph prints</legend>
          <div className="flex flex-wrap gap-2">
            <input aria-label="New dialogue alternative" className={`${field} grow`} maxLength={65536} value={alternate} onChange={(e) => setAlternate(e.target.value)} />
            <button className={button} disabled={!alternate.trim() || (line.alternates?.length ?? 0) >= MAX_SCRIPT_ALTERNATES} onClick={() => { writeLine({ ...line, alternates: [...(line.alternates ?? []), { id: createId('alt'), text: alternate.trim() }] }); setAlternate(''); }}>Save alternative</button>
          </div>
          {line.alternates?.map((a) => <div key={a.id} className="flex flex-wrap gap-2 items-center">
            <input aria-label="Edit dialogue alternative" key={`alt-${a.text}`} className={`${field} grow`} maxLength={65536} defaultValue={a.text} onBlur={(e) => { if (e.target.value !== a.text) writeLine({ ...line, alternates: line.alternates?.map((other) => other.id === a.id ? editedAlternative(other, e.target.value) : other) }); }} />
            <button className={button} onClick={() => writeLine(chooseScriptAlternate(line, a.id))}>Use alternative</button>
            <button className={button} onClick={() => writeLine({ ...line, alternates: line.alternates?.filter((other) => other.id !== a.id) })}>Delete alternative</button>
          </div>)}
        </fieldset>}
        {line.type === 'scene' && <fieldset className="space-y-2">
          <legend className="font-semibold">Structure before this scene · does not print</legend>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Structure level" className={field} value={sectionLevel} onChange={(e) => setSectionLevel(Number(e.target.value) as 1 | 2 | 3)}><option value={1}>Act</option><option value={2}>Sequence</option><option value={3}>Section</option></select>
            <input aria-label="Structure title" className={`${field} grow`} maxLength={500} value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} />
            <button className={button} disabled={!sectionTitle.trim() || (line.structure?.length ?? 0) >= 16} onClick={() => { writeLine({ ...line, structure: [...(line.structure ?? []), { id: createId('structure'), title: sectionTitle.trim(), level: sectionLevel }] }); setSectionTitle(''); }}>Add structure point</button>
          </div>
          {line.structure?.map((s) => <div key={s.id} className="flex gap-2 items-center"><span>{['', 'Act', 'Sequence', 'Section'][s.level]}</span><input aria-label="Edit structure title" key={`structure-${s.title}`} className={`${field} grow`} maxLength={500} defaultValue={s.title} onBlur={(e) => { if (e.target.value !== s.title) writeLine({ ...line, structure: line.structure?.map((other) => other.id === s.id ? { ...other, title: e.target.value } : other) }); }} /><button className={button} onClick={() => writeLine({ ...line, structure: line.structure?.filter((other) => other.id !== s.id) })}>Delete structure point</button></div>)}
        </fieldset>}
      </div>}
    </details>
    <details><summary className="font-semibold cursor-pointer">Bookmarks and notes navigator</summary><div className="mt-2 flex flex-wrap gap-2">
      {lines.filter((l) => l.bookmark || l.notes?.length).map((l) => <button key={l.id} className={button} onClick={() => onGoTo({ lineId: l.id, start: l.notes?.[0]?.start ?? 0, end: l.notes?.[0]?.end ?? l.text.length })}>{l.bookmark || `Paragraph ${l.lineNumber}`} {l.notes?.length ? `· ${l.notes.length} notes` : ''}</button>)}
      {!lines.some((l) => l.bookmark || l.notes?.length) && <p>No bookmarks or anchored notes yet.</p>}
    </div></details>
    <details><summary className="font-semibold cursor-pointer">Scene cards and outline · {scenes.length} scenes</summary>
      {pagesLocked && <p className="mt-2 text-warn">Unlock script pages before reordering scenes. Scene numbers follow the production's numbering setting.</p>}
      <ol className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{scenes.map((scene, index) => <li key={scene.id} className="border border-line rounded p-2 space-y-2" style={{ borderTopColor: scene.sceneColor, borderTopWidth: scene.sceneColor ? 4 : undefined }}>
        {scene.structure?.map((s) => <p key={s.id} className="font-semibold" style={{ paddingLeft: `${s.level - 1}em` }}>{s.title}</p>)}
        <button className="font-mono text-left" onClick={() => onGoTo({ lineId: scene.id, start: 0, end: scene.text.length })}>{scene.sceneNumber ?? index + 1} · {scene.text}{scene.omitted ? ' · OMITTED' : ''}</button>
        <textarea aria-label={`Scene ${scene.sceneNumber ?? index + 1} synopsis`} key={`synopsis-${scene.synopsis ?? ""}`} className={`${field} w-full`} maxLength={8192} defaultValue={scene.synopsis ?? ''} onBlur={(e) => { if (e.target.value !== (scene.synopsis ?? '')) writeLine({ ...scene, synopsis: e.target.value }); }} />
        <div className="flex gap-2"><button className={button} disabled={pagesLocked || index === 0} onClick={() => onChange(moveScriptScene(lines, scene.id, -1))}>Move scene up</button><button className={button} disabled={pagesLocked || index === scenes.length - 1} onClick={() => onChange(moveScriptScene(lines, scene.id, 1))}>Move scene down</button></div>
      </li>)}</ol>
    </details>
  </section>;
}
