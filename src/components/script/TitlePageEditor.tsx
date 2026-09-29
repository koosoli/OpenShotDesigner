import React from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { TitlePageView } from './TitlePageView';

interface TitlePageEditorProps {
  isLight: boolean;
}

/**
 * The screenplay's cover, edited beside a live preview of itself.
 *
 * The fields are Fountain's standard title-page keys, so a script imported with
 * a cover arrives with these filled in and an exported one carries them back
 * out. Printing the cover is opt-in — plenty of productions print sides and
 * lined pages far more often than a submission draft — and the DRAFT stamp is
 * off until someone asks for it, because stamping a script that is going to a
 * financier is the expensive mistake here.
 */

/** Today's date in the same words the static placeholder used to show — a suggestion only, never written. */
const todayPlaceholder = (): string =>
  new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
export const TitlePageEditor: React.FC<TitlePageEditorProps> = ({ isLight }) => {
  const { project, setTitlePage } = useFloorPlan();
  const page = project.titlePage ?? {};

  const inputCls = `w-full rounded-md border px-2 py-1.5 text-xs outline-none ${
    isLight ? 'border-slate-300 bg-white text-slate-800 focus:border-violet-400' : 'border-slate-700 bg-slate-950 text-slate-200 focus:border-violet-500'
  }`;
  const labelCls = `text-[9px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`;

  const field = (
    key: 'title' | 'credit' | 'authors' | 'source' | 'draftLabel' | 'date' | 'contact' | 'copyright' | 'notes',
    label: string,
    placeholder: string,
    rows = 0,
  ) => (
    <label className="block space-y-1">
      <span className={labelCls}>{label}</span>
      {rows > 0 ? (
        <textarea
          value={page[key] ?? ''}
          rows={rows}
          onChange={(event) => setTitlePage({ [key]: event.target.value || undefined })}
          placeholder={placeholder}
          className={`${inputCls} resize-y`}
        />
      ) : (
        <input
          value={page[key] ?? ''}
          onChange={(event) => setTitlePage({ [key]: event.target.value || undefined })}
          placeholder={placeholder}
          className={inputCls}
        />
      )}
    </label>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] p-3 sm:p-5">
      <div className="space-y-2.5">
        <div>
          <h3 className="text-sm font-black">Title page</h3>
          <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Fountain's standard fields, so an imported cover arrives filled in and an exported script carries it back out.
          </p>
        </div>

        <label className={`flex items-center gap-2 rounded-lg border p-2 text-[11px] font-semibold ${isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950'}`}>
          <input
            type="checkbox"
            checked={page.enabled === true}
            onChange={(event) => setTitlePage({ enabled: event.target.checked })}
            className="accent-violet-600"
          />
          Print a title page with the script
        </label>

        {/* Off by default: the opposite of a call sheet, where an unfinished
            sheet going out looking final is the costly mistake. */}
        <label className={`flex items-center gap-2 rounded-lg border p-2 text-[11px] font-semibold ${isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950'}`}>
          <input
            type="checkbox"
            checked={page.draft === true}
            onChange={(event) => setTitlePage({ draft: event.target.checked || undefined })}
            className="accent-rose-600"
          />
          Mark as a draft — DRAFT stamp on the cover
        </label>

        {field('title', 'Title', project.scriptTitle || 'Untitled Screenplay')}
        {field('credit', 'Credit', 'Written by')}
        {field('authors', 'Author(s)', 'One name per line', 2)}
        {field('source', 'Source', 'Based on the novel by…')}
        <div className="grid grid-cols-2 gap-2">
          {field('draftLabel', 'Draft', 'First Draft')}
          {field('date', 'Date', todayPlaceholder())}
        </div>
        {field('contact', 'Contact', 'Agency, address, phone', 3)}
        {field('copyright', 'Copyright', '© 2026 Lantern Pictures')}
        {field('notes', 'Notes', 'Anything else the cover should carry', 2)}
      </div>

      <div className={`rounded-xl border overflow-hidden ${isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-900'}`}>
        <div className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider border-b ${isLight ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'}`}>
          Preview{page.enabled === true ? '' : ' — not printed until the box above is ticked'}
        </div>
        <div className={page.enabled === true ? '' : 'opacity-50'}>
          <TitlePageView page={page} fallbackTitle={project.scriptTitle} isLight={isLight} />
        </div>
      </div>
    </div>
  );
};
