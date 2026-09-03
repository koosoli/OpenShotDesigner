import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, MessageSquareText, Plus, Reply, Trash2, X } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
import { createId } from '../../domain/ids';
import type { ReviewComment, ReviewTargetKind } from '../../domain/comments';
import { useDialogFocusTrap } from '../../utils/useDialogFocusTrap';

interface TargetOption { kind: ReviewTargetKind; id: string; label: string }

export const ReviewNotes: React.FC = () => {
  const { project, updateProjectMeta } = useFloorPlan();
  const { theme } = useWorkspaceUI();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [targetKey, setTargetKey] = useState(() => `project:${project.id}`);
  const [priority, setPriority] = useState<ReviewComment['priority']>('normal');
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const isLight = theme === 'light';
  const comments = project.reviewComments ?? [];
  const dialogRef = useDialogFocusTrap(open);

  const targets = useMemo((): TargetOption[] => [
    { kind: 'project', id: project.id, label: `Project — ${project.title}` },
    ...project.setups.map((setup) => ({ kind: 'scene' as const, id: setup.id, label: `Scene ${setup.sceneNumber} — ${setup.name}` })),
    ...project.setups.flatMap((setup) => setup.shots.map((shot) => ({ kind: 'shot' as const, id: shot.id, label: `Shot ${shot.shotNumber} — ${shot.name || 'Untitled'}` }))),
    ...(project.people ?? []).map((person) => ({ kind: 'person' as const, id: person.id, label: `Person — ${person.displayName}` })),
    ...(project.locations ?? []).map((location) => ({ kind: 'location' as const, id: location.id, label: `Location — ${location.name}` })),
    ...(project.productionDays ?? []).map((day) => ({ kind: 'production_day' as const, id: day.id, label: `Day — ${day.name}` })),
    ...project.setups.flatMap((setup) => setup.elements.map((element) => ({ kind: 'plan_element' as const, id: element.id, label: `Plan — ${element.name}` }))),
  ], [project]);

  useEffect(() => {
    if (!targets.some((target) => `${target.kind}:${target.id}` === targetKey)) {
      setTargetKey(`project:${project.id}`);
    }
  }, [project.id, targetKey, targets]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const mutate = (change: (current: ReviewComment[]) => ReviewComment[]) => updateProjectMeta((previous) => {
    const next = change(previous.reviewComments ?? []);
    return { reviewComments: next.length ? next : undefined };
  });
  const addComment = () => {
    const target = targets.find((candidate) => `${candidate.kind}:${candidate.id}` === targetKey) ?? targets[0];
    if (!target || !body.trim()) return;
    mutate((current) => [...current, { id: createId('comment'), targetKind: target.kind, targetId: target.id, targetLabel: target.label, body: body.trim(), priority, createdAt: new Date().toISOString(), replies: [] }]);
    setBody('');
  };
  const patch = (id: string, change: (comment: ReviewComment) => ReviewComment) =>
    mutate((current) => current.map((comment) => comment.id === id ? change(comment) : comment));

  const unresolved = comments.filter((comment) => !comment.resolvedAt).length;
  return (
    <>
      <button onClick={() => setOpen(true)} className={`absolute top-14 right-3 z-30 h-9 px-3 rounded-xl border shadow-lg backdrop-blur flex items-center gap-2 text-[11px] font-bold ${isLight ? 'bg-white/90 border-slate-300' : 'bg-slate-900/90 border-slate-700'}`}>
        <MessageSquareText className="w-4 h-4 text-violet-500" /> Review · {unresolved}
      </button>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div ref={dialogRef} tabIndex={-1} className={`relative w-full max-w-2xl max-h-[82vh] overflow-hidden rounded-2xl border shadow-2xl ${isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'}`} role="dialog" aria-modal="true" aria-labelledby="review-title">
            <div className="p-4 border-b border-inherit flex justify-between"><div><h2 id="review-title" className="font-black flex items-center gap-2"><MessageSquareText className="w-5 h-5 text-violet-500" /> Review notes</h2><p className="text-[11px] opacity-60 mt-1">Offline threads stay attached to the production entity they discuss.</p></div><button onClick={() => setOpen(false)} aria-label="Close review notes"><X className="w-4 h-4" /></button></div>
            <div className="p-4 overflow-y-auto max-h-[68vh]">
              <div className={`rounded-xl border p-3 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'}`}>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <select value={targetKey} onChange={(event) => setTargetKey(event.target.value)} className="rounded-lg border bg-transparent px-2 py-2 text-xs">
                    {targets.map((target) => <option key={`${target.kind}:${target.id}`} value={`${target.kind}:${target.id}`}>{target.label}</option>)}
                  </select>
                  <select value={priority} onChange={(event) => setPriority(event.target.value as ReviewComment['priority'])} className="rounded-lg border bg-transparent px-2 text-xs"><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select>
                  <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="@DP — 50mm instead?" className="col-span-2 rounded-lg border bg-transparent px-2 py-2 text-xs resize-y" rows={2} />
                </div>
                <button onClick={addComment} disabled={!body.trim()} className="mt-2 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-bold disabled:opacity-40 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add note</button>
              </div>
              <div className="mt-3 space-y-2">
                {[...comments].reverse().map((comment) => (
                  <article key={comment.id} className={`rounded-xl border p-3 ${comment.resolvedAt ? 'opacity-55' : ''} ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                    <div className="flex items-start gap-2"><div className="flex-1"><div className="text-[9px] font-black uppercase text-violet-500">{comment.targetLabel} · {comment.priority ?? 'normal'}</div><p className="text-xs mt-1 whitespace-pre-wrap">{comment.body}</p><div className="text-[9px] opacity-45 mt-1">{new Date(comment.createdAt).toLocaleString()}</div></div><button onClick={() => patch(comment.id, (current) => ({ ...current, resolvedAt: current.resolvedAt ? undefined : new Date().toISOString() }))} title="Resolve / reopen"><CheckCircle2 className={`w-4 h-4 ${comment.resolvedAt ? 'text-emerald-500' : ''}`} /></button><button onClick={() => mutate((current) => current.filter((candidate) => candidate.id !== comment.id))} title="Delete thread"><Trash2 className="w-4 h-4 text-rose-500" /></button></div>
                    {comment.replies.map((reply) => <div key={reply.id} className="ml-5 mt-2 pl-2 border-l-2 border-violet-500/30 text-[11px]"><p>{reply.body}</p><span className="text-[9px] opacity-40">{new Date(reply.createdAt).toLocaleString()}</span></div>)}
                    {replyFor === comment.id ? <div className="mt-2 flex gap-1.5"><input autoFocus value={replyBody} onChange={(event) => setReplyBody(event.target.value)} className="flex-1 rounded-lg border bg-transparent px-2 py-1.5 text-xs" placeholder="Reply…" /><button onClick={() => { if (replyBody.trim()) patch(comment.id, (current) => ({ ...current, replies: [...current.replies, { id: createId('reply'), body: replyBody.trim(), createdAt: new Date().toISOString() }] })); setReplyBody(''); setReplyFor(null); }} className="px-2 rounded-lg bg-violet-600 text-white text-xs">Send</button></div> : <button onClick={() => setReplyFor(comment.id)} className="mt-2 text-[10px] text-violet-500 flex items-center gap-1"><Reply className="w-3 h-3" /> Reply</button>}
                  </article>
                ))}
                {!comments.length && <p className="py-8 text-center text-xs opacity-50">No review notes yet.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
