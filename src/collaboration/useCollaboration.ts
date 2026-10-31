import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Project } from '../types';
import { flushPendingWrites, getSaveState, writeProject } from '../utils/projectLibrary';
import type { CollaborationSession, SessionStatus } from './session';
import type { Invite } from './invite';
import { createPeerInvite, requestInvite, inviteLink, validateInvite } from './invite';
import type { RoomProjectOptions } from './model';

export interface CollaborationControls {
  active: boolean; status: SessionStatus | null; invite: Invite | null;
  start: (relay: string, creationKey?: string, options?: RoomProjectOptions) => Promise<void>;
  startDirect: (options?: RoomProjectOptions) => Promise<void>;
  join: (invite: Invite) => Promise<void>;
  captureLocal: (before: Project, after: Project) => void;
  leave: () => void; undo: () => void; redo: () => void; boundary: () => void;
}

/** Optional adapter: the ordinary editor never loads Yjs or opens a connection. */
export function useCollaboration(project: Project, setProject: Dispatch<SetStateAction<Project>>): CollaborationControls {
  const session = useRef<CollaborationSession | null>(null);
  const observed = useRef(project);
  const attachedId = useRef<string | null>(null);
  const source = useRef<{ id: string; setup?: string } | null>(null);
  const transition = useRef<Project | null>(null);
  const creation = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [initial, setInitial] = useState<{ current: CollaborationSession; shared: Project } | null>(null);
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const leave = useCallback(() => {
    generation.current++;
    creation.current?.abort(); creation.current = null;
    session.current?.close(); session.current = null;
    attachedId.current = null; source.current = null; transition.current = null;
    setInitial(null); setStatus(null); setInvite(null);
    const url = new URL(window.location.href);
    if (new URLSearchParams(url.hash.slice(1)).has('collab')) {
      url.hash = ''; window.history.replaceState(null, '', url);
    }
  }, []);
  const stop = useCallback((error: unknown) => {
    leave();
    setStatus({ connected: false, ready: true, pending: true, peers: 0, cached: false,
      error: `Collaboration stopped. Your changes remain local. ${error instanceof Error ? error.message : String(error)}`,
      reconciled: false, canUndo: false, canRedo: false });
  }, [leave]);

  useLayoutEffect(() => {
    observed.current = project;
    if (transition.current?.id === project.id) {
      attachedId.current = project.id;
      source.current = null; transition.current = null; setInitial(null);
    }
    if (source.current && (source.current.id !== project.id || source.current.setup && source.current.setup !== project.activeSetupId)) { leave(); return; }
    if (attachedId.current && project.id !== attachedId.current) { leave(); return; }
    if (session.current && attachedId.current) {
      try { session.current.flushLocal(); } catch (error) { stop(error); }
    }
  }, [project, leave, stop]);

  // Save the latest committed original before entering the separate room copy.
  // Conditional replacement retries if a queued edit changed that original.
  useEffect(() => {
    if (!initial || session.current !== initial.current || attachedId.current) return;
    let cancelled = false;
    void (async () => {
      try {
        writeProject(project);
        await flushPendingWrites();
        if (getSaveState() === 'error') throw new Error('The original project could not be saved. Export it before joining.');
        if (cancelled || session.current !== initial.current) return;
        const view = initial.current.view(transition.current ?? undefined);
        if (!view) return;
        transition.current = view;
        setProject((prev) => session.current === initial.current && prev === project ? view : prev);
      } catch (error) { if (!cancelled && session.current === initial.current) stop(error); }
    })();
    return () => { cancelled = true; };
  }, [initial, project, setProject, stop]);

  const connect = useCallback(async (next: Invite, seed?: Project) => {
    next = validateInvite(next);
    leave();
    source.current = { id: observed.current.id };
    const ticket = generation.current;
    const { CollaborationSession } = await import('./session');
    if (ticket !== generation.current) return;
    const current = new CollaborationSession(next, (shared) => {
      if (session.current !== current) return;
      if (!attachedId.current) { setInitial({ current, shared }); return; }
      setProject((prev) => {
        if (session.current !== current || prev.id !== attachedId.current) return prev;
        return current.view(prev) ?? prev;
      });
    }, (state) => {
      if (session.current !== current) return;
      setStatus(state);
      if (state.stopped) queueMicrotask(() => {
        if (session.current !== current) return;
        leave();
        setStatus({ ...state, error: `Collaboration stopped. Your project remains local and exportable. ${state.error ?? ''}` });
      });
    });
    session.current = current; setInvite(next);
    window.history.replaceState(null, '', inviteLink(next));
    try { await current.open(seed); }
    catch (error) { if (session.current === current) leave(); throw error; }
  }, [leave, setProject]);

  useEffect(() => () => {
    generation.current++;
    creation.current?.abort();
    session.current?.close(); session.current = null;
  }, []);

  const command = (action: 'undo' | 'redo' | 'boundary') => {
    try { session.current?.[action](); } catch (error) { stop(error); }
  };
  return {
    active: invite !== null, status, invite,
    startDirect: async (options) => {
      leave();
      source.current = { id: observed.current.id, ...(options?.scope === 'plan' ? { setup: observed.current.activeSetupId } : {}) };
      const ticket = generation.current;
      try {
        const { roomProject } = await import('./model');
        if (ticket !== generation.current) return;
        await connect(createPeerInvite(), roomProject(observed.current, { scope: 'project', omitMedia: true, ...options }));
      } catch (error) { if (ticket === generation.current) source.current = null; throw error; }
    },
    start: async (relay, creationKey, options) => {
      leave();
      const controller = new AbortController(); creation.current = controller;
      source.current = { id: observed.current.id, ...(options?.scope === 'plan' ? { setup: observed.current.activeSetupId } : {}) };
      const ticket = generation.current;
      try {
        const { roomProject } = await import('./model');
        if (controller.signal.aborted || ticket !== generation.current) return;
        roomProject(observed.current, { scope: 'project', omitMedia: true, ...options });
        const next = await requestInvite(relay, creationKey, controller.signal);
        if (controller.signal.aborted || ticket !== generation.current) return;
        const seed = roomProject(observed.current, { scope: 'project', omitMedia: true, ...options });
        creation.current = null;
        await connect(next, seed);
      } catch (error) { if (!controller.signal.aborted) throw error; }
      finally { if (creation.current === controller) { creation.current = null; source.current = null; } }
    },
    captureLocal: (before, after) => {
      if (session.current && attachedId.current === before.id) session.current.captureLocal(before, after);
    },
    join: (next) => connect(next), leave,
    undo: () => command('undo'), redo: () => command('redo'), boundary: () => command('boundary'),
  };
}
