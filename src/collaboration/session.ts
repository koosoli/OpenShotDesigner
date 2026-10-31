import * as Y from 'yjs';
import { RoomCache } from './roomCache';
import type { Project } from '../types';
import { applyLocalChanges, localChanges, LOCAL_ORIGIN, MAX_DOCUMENT_BYTES, projectView, readDocument, readWithPendingChanges, seedDocument, type SharedChanges } from './model';
import type { Invite } from './invite';
import { isPeerInvite, ticketExpiry } from './invite';
import { BrowserValidation } from './browserValidation';
import { PeerChannel, type ChannelMessage } from './peerChannel';

export interface SessionStatus {
  connected: boolean; ready: boolean; pending: boolean; peers: number;
  cached: boolean; error: string | null; reconciled: boolean;
  canUndo: boolean; canRedo: boolean;
  stopped?: boolean;
  transport?: 'webrtc' | 'relay';
  scope?: 'plan' | 'project';
}
const NETWORK = 'network';
const CACHE = 'cache';
const toBase64 = (data: Uint8Array) => {
  let raw = '';
  for (let i = 0; i < data.length; i += 8192) raw += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(raw);
};
const fromBase64 = (data: string) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

/** Provider boundary. Network acknowledgments mean relay receipt, never peer durability. */
export class CollaborationSession {
  get sharesProduction() { return this.status.scope === 'project'; }
  readonly doc = new Y.Doc();
  readonly undoManager = new Y.UndoManager(this.doc.getMap('plan'), { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 400 });
  private persistence: RoomCache | null = null;
  private socket: WebSocket | PeerChannel | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private queued: Uint8Array[] = [];
  private sequence = 0;
  private awaiting = new Set<number>();
  private closed = false;
  private lastAcknowledged = Date.now();
  private lastEmitted = '';
  private healthTimer: ReturnType<typeof setInterval>;
  private validation = new BrowserValidation();
  private incoming = Promise.resolve();
  private incomingCount = 0;
  private incomingBytes = 0;
  private retryCount = 0;
  private hasConnected = false;
  private pendingLocal: SharedChanges = new Map();
  private pendingProblem: Error | null = null;
  private readonly onOffline = () => {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.status.connected = false;
    this.status.peers = 0;
    this.emit();
  };
  private readonly onOnline = () => this.connect();
  private readonly onHide = () => this.persistence?.flush();
  private readonly onVisibility = () => { if (document.visibilityState === 'hidden') this.onHide(); };
  private status: SessionStatus = { connected: false, ready: false, pending: false, peers: 0, cached: false, error: null, reconciled: false, canUndo: false, canRedo: false };

  constructor(readonly invite: Invite, private readonly onRemote: (project: Project) => void, private readonly onStatus: (status: SessionStatus) => void) {
    window.addEventListener('offline', this.onOffline);
    window.addEventListener('online', this.onOnline);
    window.addEventListener('pagehide', this.onHide);
    window.addEventListener('beforeunload', this.onHide);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.status.transport = isPeerInvite(invite) ? 'webrtc' : 'relay';
    this.healthTimer = setInterval(() => {
      if (this.awaiting.size && this.status.connected && (!isPeerInvite(this.invite) || this.status.peers > 1) && Date.now() - this.lastAcknowledged > (isPeerInvite(this.invite) ? 30_000 : 10_000)) this.socket?.close();
    }, 1000);
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      try {
        const shared = readDocument(this.doc);
        if (shared) {
          this.status.scope = shared.id === 'collaboration-project' ? 'project' : 'plan';
          this.status.ready = true;
          if (origin !== LOCAL_ORIGIN && origin !== this.undoManager) this.onRemote(shared);
          if (origin === this.undoManager) this.onRemote(shared);
        }
        if (origin !== CACHE) this.persistence?.save(Y.encodeStateAsUpdate(this.doc));
        if ((origin !== NETWORK || isPeerInvite(this.invite)) && origin !== CACHE) {
          this.status.pending = true;
          this.queued.push(update);
          if (!this.sendTimer) this.sendTimer = setTimeout(() => this.flush(), 50);
        }
        this.emit();
      } catch (error) { this.fail(error); }
    });
    this.undoManager.on('stack-item-added', () => this.emit());
    this.undoManager.on('stack-item-popped', () => this.emit());
    this.undoManager.on('stack-cleared', () => this.emit());
  }

  private emit() {
    this.status.canUndo = this.undoManager.canUndo();
    this.status.canRedo = this.undoManager.canRedo();
    const key = JSON.stringify(this.status);
    if (key !== this.lastEmitted) {
      this.lastEmitted = key;
      this.onStatus({ ...this.status });
    }
  }

  async open(seed?: Project) {
    const identity = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${this.invite.relay}/${this.invite.room}`));
    if (this.closed) return;
    const key = Array.from(new Uint8Array(identity), (b) => b.toString(16).padStart(2, '0')).join('');
    try {
      this.persistence = new RoomCache(`plan-room-v2-${key}`, (error) => {
        if (this.closed) return;
        this.status.cached = false;
        this.status.error = `${error.message} Export your plan before closing.`;
        this.emit();
      });
      const cached = await this.persistence.load();
      if (this.closed) return;
      if (cached) {
        await this.validation.validate(Y.encodeStateAsUpdate(this.doc), cached);
        if (this.closed) return;
        Y.applyUpdate(this.doc, cached, CACHE);
      }
      this.status.cached = true;
    } catch (error) {
      // A late cache read must never merge into the live room after timeout.
      this.persistence?.close();
      this.persistence = null;
      this.status.error = error instanceof Error ? error.message : 'Room cache unavailable; use Export project.';
    }
    if (this.closed) return;
    if (seed && !readDocument(this.doc)) seedDocument(this.doc, seed);
    const shared = readDocument(this.doc);
    if (shared) { this.status.scope = shared.id === 'collaboration-project' ? 'project' : 'plan'; this.status.ready = true; this.onRemote(shared); }
    this.connect();
    this.emit();
  }

  private connect() {
    if (this.closed || !navigator.onLine || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    if (this.invite.ticket && ticketExpiry(this.invite.ticket) <= Date.now()) {
      this.fail(new Error('This invitation has expired. Keep/export the local project and start a new session.')); return;
    }
    const socket = this.socket = isPeerInvite(this.invite) ? new PeerChannel(this.invite.room) :
      new WebSocket(`${this.invite.relay}/${this.invite.room}`, this.invite.ticket ? ['osd-collab-v1', `ticket.${this.invite.ticket}`] : undefined);
    if (socket instanceof PeerChannel) {
      socket.onresync = () => {
        if (socket !== this.socket || this.closed) return;
        this.queued = [Y.encodeStateAsUpdate(this.doc)]; this.flush();
      };
      socket.onnotice = (message) => {
        if (socket !== this.socket || this.closed) return;
        this.status.error = message; this.emit();
      };
    }
    socket.onopen = () => {
      if (this.closed || socket !== this.socket) { socket.close(); return; }
      this.status.connected = true;
      this.retryCount = 0;
      this.lastAcknowledged = Date.now();
      this.status.reconciled ||= this.hasConnected && this.status.pending;
      this.hasConnected = true;
      this.awaiting.clear();
      this.queued = [];
      this.send(Y.encodeStateAsUpdate(this.doc));
      this.emit();
    };
    socket.onmessage = (event: ChannelMessage) => {
      if (this.closed || socket !== this.socket) return;
      if (typeof event.data !== 'string' || event.data.length > MAX_DOCUMENT_BYTES * 2 ||
          this.incomingCount >= (isPeerInvite(this.invite) ? 32 : 16) || this.incomingBytes + event.data.length > MAX_DOCUMENT_BYTES * (isPeerInvite(this.invite) ? 12 : 4)) {
        this.fail(new Error('Remote message or processing queue exceeded its limit.')); return;
      }
      this.incomingCount++; this.incomingBytes += event.data.length;
      this.incoming = this.incoming.then(async () => {
      if (this.closed || socket !== this.socket) return;
      try {
        if (event.data.length > MAX_DOCUMENT_BYTES * 2) throw new Error('Relay message too large.');
        const message = JSON.parse(event.data) as { type: string; data?: string; id?: number; count?: number; message?: string };
        if (message.type === 'update' && typeof message.data === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(message.data)) {
          if (event.peerId && (!Number.isSafeInteger(message.id) || message.id! < 1)) throw new Error('Invalid browser update sequence.');
          const update = fromBase64(message.data);
          await this.validation.validate(Y.encodeStateAsUpdate(this.doc), update);
          if (this.closed || socket !== this.socket) return;
          Y.applyUpdate(this.doc, update, NETWORK);
          if (event.peerId && socket instanceof PeerChannel) socket.confirm(event.peerId, message.id!);
        } else if (message.type === 'ack' && Number.isSafeInteger(message.id) && this.awaiting.has(message.id!)) {
          this.lastAcknowledged = Date.now();
          this.awaiting.delete(message.id!);
          this.status.pending = this.awaiting.size > 0 || this.queued.length > 0;
          if (this.queued.length) this.flush();
        } else if (message.type === 'peers' && Number.isInteger(message.count) && message.count! >= 1 && message.count! <= 6) this.status.peers = message.count!;
        else if (message.type === 'error') throw new Error(message.message ?? 'Relay rejected an update. Export your local plan.');
        else throw new Error('Unexpected relay message.');
        this.emit();
      } catch (error) { this.fail(error); }
      }).finally(() => { this.incomingCount--; this.incomingBytes -= event.data.length; });
    };
    socket.onclose = () => {
      if (socket !== this.socket) return;
      this.status.connected = false;
      this.status.peers = 0;
      this.emit();
      if (!this.closed) {
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(++this.retryCount, 5)) + Math.floor(Math.random() * 500);
        this.retry = setTimeout(() => this.connect(), delay);
      }
    };
    socket.onerror = () => { /* onclose drives reconnect; local editing stays available. */ };
  }

  private send(update: Uint8Array) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const id = ++this.sequence;
    this.awaiting.add(id);
    this.status.pending = true;
    this.socket.send(JSON.stringify({ type: 'update', id, data: toBase64(update) }));
  }
  private flush() {
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = null;
    if (!this.queued.length) return;
    if (this.socket?.readyState !== WebSocket.OPEN) {
      // The persisted document is the offline outbox; reconnect sends its full state.
      this.queued = [];
      return;
    }
    if (this.awaiting.size) {
      // One unacknowledged frame bounds both endpoints' validation queues.
      if (this.queued.length > 1) this.queued = [Y.mergeUpdates(this.queued)];
      this.sendTimer = setTimeout(() => this.flush(), 50);
      return;
    }
    this.send(Y.mergeUpdates(this.queued));
    this.queued = [];
    this.emit();
  }
  write(before: Project, after: Project) {
    this.captureLocal(before, after);
    this.flushLocal();
  }
  captureLocal(before: Project, after: Project) {
    if (this.closed || before === after) return;
    try { for (const [key, value] of localChanges(before, after, this.sharesProduction ? 'project' : 'plan')) this.pendingLocal.set(key, value); }
    catch (error) { this.pendingProblem = error instanceof Error ? error : new Error('Local changes cannot be shared.'); }
  }
  flushLocal() {
    if (this.closed) return;
    if (this.pendingProblem) throw this.pendingProblem;
    const changes = this.pendingLocal;
    this.pendingLocal = new Map();
    applyLocalChanges(this.doc, changes);
  }
  view(local?: Project) {
    if (this.pendingProblem) return local ?? null;
    const shared = readWithPendingChanges(this.doc, this.pendingLocal);
    return shared ? projectView(shared, local) : null;
  }
  undo() { this.flushLocal(); this.undoManager.stopCapturing(); this.undoManager.undo(); }
  redo() { this.flushLocal(); this.undoManager.stopCapturing(); this.undoManager.redo(); }
  boundary() { this.flushLocal(); this.undoManager.stopCapturing(); }
  private fail(error: unknown) {
    this.status.error = error instanceof Error ? error.message : String(error);
    this.socket?.close(1000);
    this.closed = true;
    this.status.stopped = true;
    this.status.connected = false;
    this.emit();
  }
  close() {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    if (this.sendTimer) clearTimeout(this.sendTimer);
    clearInterval(this.healthTimer);
    this.validation.close();
    window.removeEventListener('offline', this.onOffline);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('pagehide', this.onHide);
    window.removeEventListener('beforeunload', this.onHide);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.socket?.close();
    this.undoManager.destroy();
    this.persistence?.close();
    this.doc.destroy();
  }
}
