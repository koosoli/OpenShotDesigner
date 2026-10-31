import { useCallback, useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
import { useDialogs } from '../dialog/DialogProvider';
import { useDismiss } from '../common/useDismiss';
import { configuredRelay, inviteLink, isLocalCollaborationPage, isPeerInvite, parseInvite, ticketExpiry } from '../../collaboration/invite';

export function CollaborationMenu() {
  const { collaboration } = useFloorPlan();
  const { closeDashboard } = useWorkspaceUI();
  const { confirm } = useDialogs();
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.hash.slice(1)).has('collab'));
  const [relay, setRelay] = useState(configuredRelay() ?? (isLocalCollaborationPage() ? 'ws://127.0.0.1:1234' : ''));
  const relayAvailable = isLocalCollaborationPage() || !!configuredRelay();
  const [useRelay, setUseRelay] = useState(false);
  const [creationKey, setCreationKey] = useState('');
  const [link, setLink] = useState(() => new URLSearchParams(window.location.hash.slice(1)).has('collab') ? window.location.href : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const invitationRef = useRef<HTMLInputElement>(null);
  useEffect(() => { invitationRef.current?.focus(); }, [collaboration.invite]);
  useEffect(() => {
    const invitation = () => {
      if (new URLSearchParams(window.location.hash.slice(1)).has('collab')) {
        setLink(window.location.href);
        setOpen(true);
        closeDashboard();
      }
    };
    invitation();
    window.addEventListener('hashchange', invitation);
    return () => window.removeEventListener('hashchange', invitation);
  }, [closeDashboard]);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, useCallback(() => { setOpen(false); setCreationKey(''); }, []), ref);
  const state = collaboration.status;
  const label = state?.error ? 'Collaboration needs attention' : !collaboration.active ? 'Collaborate' : !state?.ready ? 'Waiting for document' :
    !state.connected ? (state.pending ? 'Offline: changes not shared' : 'Reconnecting') : state.transport === 'webrtc' && state.peers < 2 ? 'Waiting for participants' : state.pending ? 'Sending changes' : `Live · ${Math.max(0, state.peers - 1)} peers`;
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null); setCopied(false);
    try { await action(); closeDashboard(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not start collaboration.'); }
    finally { setBusy(false); }
  };
  return <div className="relative shrink-0" ref={ref}>
    <button type="button" aria-expanded={open} aria-label="Live collaboration" title={label} onClick={() => { if (open) setCreationKey(''); setOpen((value) => !value); }}
      className="flex items-center gap-1 rounded-lg border border-line px-1 sm:px-2 py-1.5 text-xs text-ink">
      <Users className="w-4 h-4" /><span className="sr-only 2xl:not-sr-only" role="status">{label}</span>
    </button>
    {open && <section aria-label="Collaboration preview" className="fixed left-3 top-16 z-50 w-80 max-w-[90vw] max-h-[80vh] overflow-y-auto space-y-3 rounded-xl border border-line bg-surface p-4 text-xs text-ink shadow-2xl">
      <p className="font-semibold">Live production · preview</p>
      {(error || state?.error) && <p role="alert" className="text-red-600 dark:text-red-300">{error ?? state?.error}</p>}
      {collaboration.active ? <div className="space-y-2 rounded-lg border border-line p-3">
        <p role="status">{label}</p>
        {state?.scope === 'plan' && <p>Older plan-only session. Open your original full production from All projects, then start a new session to include its script and preproduction data.</p>}
        <label className="block">Invitation link<input ref={invitationRef} aria-label="Invitation link" className="mt-1 w-full rounded border border-line p-2 bg-surface-sunken" readOnly value={inviteLink(collaboration.invite!)} onFocus={(e) => e.target.select()} /></label>
        <button type="button" className="rounded bg-accent px-3 py-2 text-white" onClick={() => {
          void (async () => {
            try {
              await navigator.clipboard.writeText(inviteLink(collaboration.invite!));
              setCopied(true);
            } catch {
              invitationRef.current?.focus(); invitationRef.current?.select();
              setError('Clipboard unavailable. The invitation is selected; copy it manually.');
            }
          })();
        }}>{copied ? 'Copied' : 'Copy invite link'}</button>
        <button type="button" className="ml-2 rounded border border-line px-3 py-2" onClick={collaboration.leave}>Leave session</button>
      </div> : <div className="space-y-2 rounded-lg border border-line p-3">
        <p>Share the whole production, including scripts, contacts and their private fields, schedules and budgets. Images and file attachments stay local. Your original is preserved.</p>
        <button type="button" disabled={busy || (useRelay && !relayAvailable)} className="rounded bg-accent px-3 py-2 text-white disabled:opacity-50" onClick={() => void run(async () => { try { if (useRelay) await collaboration.start(relay, creationKey); else await collaboration.startDirect(); } finally { setCreationKey(''); } })}>Start collaboration</button>
      </div>}
      <p>Start and share a link. No installation, account, hosting setup or connection settings are required.</p>
      <p>{state?.scope === 'plan' ? 'This older invitation shares one plan only. Its local copy does not contain the original production modules. Your original remains in the project library.' : 'Shares all scenes, screenplay, preproduction, contacts, schedules, budgets and other production data in a separate local project. Everyone with the invitation can read, edit and keep this information.'}</p>
      <p>Images and file attachments are excluded automatically, including logos, headshots, backgrounds, storyboard frames, location photos and custom fixture files. Export .osd files for a backup with media.</p>
      <details>
        <summary className="cursor-pointer font-medium">How to start or join</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Open the production you want to share, then choose Start collaboration.</li>
          <li>Choose Copy invite link and send the link to your guests.</li>
          <li>Guests open the link, choose Join session, then confirm.</li>
          <li>Wait for Live before checking that changes reach the other browser.</li>
        </ol>
        <p className="mt-2">Existing public services help browsers connect. Some restricted networks can block direct connections; try another network if connecting fails.</p>
      </details>
      {isLocalCollaborationPage() && <p>Local test: use another browser profile on this computer. To invite another device, use the published website's link.</p>}
      {collaboration.active ? <>
        {state?.connected && !state.pending && state.transport !== 'webrtc' && <p>Changes received by the relay. This does not confirm that every peer has saved them.</p>}
        {state?.connected && !state.pending && state.transport === 'webrtc' && state.peers > 1 && <p>Changes received and checked by connected browsers. Export a project file for a separate backup.</p>}
        {state?.transport === 'webrtc' && state.peers < 2 && <p>Share the invitation and keep this tab open. The plan is local until another participant connects.</p>}
        {!state?.ready && <p>Your local project stays open while waiting. This invitation cannot recover a plan unless a previous participant or the relay still holds it.</p>}
        {state?.reconciled && <p>Reconnected changes were merged. Review objects edited by more than one person; Undo affects your own shared edits.</p>}
        {!state?.cached && <p>Room recovery in this browser is unavailable. Export before closing.</p>}
        <p>{state?.transport === 'webrtc' ? 'Plan data travels over encrypted browser connections. Public connection services help participants find each other. Leaving keeps this local copy; anyone with the link can edit and retain a copy.' : 'Leaving keeps this local copy. Anyone with the link can edit. The relay sees the plan; this preview has no end-to-end encryption or link revocation.'}</p>
        {collaboration.invite?.ticket && <p>Invitation expires: {new Date(ticketExpiry(collaboration.invite.ticket)).toLocaleString()}.</p>}
      </> : <>
        <details>
          <summary className="cursor-pointer">Private relay (optional)</summary>
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={useRelay} disabled={!relayAvailable} onChange={(e) => setUseRelay(e.target.checked)} />Use a private relay</label>
            {!relayAvailable && <p>Private relay is not configured. Automatic browser collaboration is available without one.</p>}
            <label className="block">Relay address<input aria-label="Relay address" readOnly={!isLocalCollaborationPage()} className="mt-1 w-full rounded border border-line p-2 bg-surface-sunken" value={relay} onChange={(e) => { setRelay(e.target.value); setUseRelay(true); }} /></label>
            <label className="block">Relay creation key (if required)<input type="password" autoComplete="off" aria-label="Relay creation key" className="mt-1 w-full rounded border border-line p-2 bg-surface-sunken" value={creationKey} onChange={(e) => { setCreationKey(e.target.value); setUseRelay(true); }} /></label>
            <p>Only a privately operated relay requires these settings. Its creation key is never included in invitations.</p>
          </div>
        </details>
        <label className="block">Join invitation<input aria-label="Join invitation" className="mt-1 w-full rounded border border-line p-2 bg-surface-sunken" value={link} onChange={(e) => setLink(e.target.value)} /></label>
        <button type="button" disabled={busy || !link} className="rounded border border-line px-3 py-2 disabled:opacity-50" onClick={() => void run(async () => {
          const invite = parseInvite(link);
          const message = isPeerInvite(invite) ? 'Join the shared production, including its script, contacts, schedules and budgets? Invitation holders can read, edit and retain copies. Images and file attachments are excluded. Connection services and other participants can see your network address. Your original stays in this browser; the shared project opens separately. Older invitations may share only one plan.' : `Connect to ${invite.relay}? This relay receives shared production data and your network address. The shared project may include scripts, contacts, schedules and budgets; images and attachments are excluded. Your current project stays in this browser's library. Export important work before continuing.`;
          if (await confirm({ title: 'Join shared project?', message, confirmLabel: 'Join session' })) await collaboration.join(invite);
        })}>Join session</button>
      </>}
    </section>}
  </div>;
}
