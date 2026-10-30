import type { MessageAction, Room } from '@trystero-p2p/core';
import { MAX_DOCUMENT_BYTES } from './model';
import { PeerDiscovery } from './peerDiscovery';

export interface ChannelMessage { data: string; peerId?: string }
export interface SessionChannel {
  readyState: number;
  onopen: ((event?: unknown) => void) | null;
  onclose: ((event?: unknown) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  onmessage: ((event: ChannelMessage) => void) | null;
  send(data: string): void;
  close(code?: number): void;
}
interface Packet { type: 'update' | 'ack'; id: number; data?: string }
const MAX_PACKET = Math.ceil(MAX_DOCUMENT_BYTES * 4 / 3) + 256;

/** Mesh transport. ACKs are emitted only after another browser validated the update. */
export class PeerChannel implements SessionChannel {
  readyState = 0;
  onopen: SessionChannel['onopen'] = null;
  onclose: SessionChannel['onclose'] = null;
  onerror: SessionChannel['onerror'] = null;
  onmessage: SessionChannel['onmessage'] = null;
  onresync: (() => void) | null = null;
  onnotice: ((message: string | null) => void) | null = null;
  private discovery: PeerDiscovery;
  private room: Room | null = null;
  private action: MessageAction<string> | null = null;
  private pending: { packet: string; id: number; waiting: Set<string>; acknowledged: boolean } | null = null;
  private peers = new Set<string>();
  private reserved = new Map<string, number>();
  private counts = new Map<string, { at: number; count: number; bytes: number }>();
  private accepted = new Set<string>();
  private validating = new Map<string, Map<string, { peerId: string; id: number }>>();
  private receipts = new Map<string, string>();
  private hashing = 0; private hashingBytes = 0;
  private startup: ReturnType<typeof setTimeout>;
  private abort = new AbortController();

  constructor(secret: string) {
    if (typeof RTCPeerConnection !== 'function' || !crypto.subtle) throw new Error('Direct collaboration needs a WebRTC-capable browser on HTTPS or localhost.');
    this.discovery = new PeerDiscovery(secret, () => {
      if (this.readyState !== 0) return;
      this.readyState = 1; clearTimeout(this.startup); this.onopen?.();
    });
    this.startup = setTimeout(() => this.onnotice?.('Connection services are unavailable. Your plan stays local; try again later.'), 15_000);
    void this.initialize(secret).catch(() => {
      if (this.readyState === 3) return;
      this.onnotice?.('Direct browser collaboration could not start. Your project stays local.');
      this.close();
    });
  }
  private async initialize(secret: string) {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`osd-peer-room-v1:${secret}`)));
    if (this.readyState === 3) return;
    const roomId = Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
    this.room = this.discovery.join({
      appId: 'OpenShotDesigner-direct-v1', password: secret,
      maxReceiveBytes: MAX_PACKET,
      relayConfig: { warnOnRelayFailure: false },
    }, roomId, {
      onPeerHandshake: async (id) => {
        const now = Date.now();
        for (const [pending, at] of this.reserved) if (!this.peers.has(pending) && now - at > 10_000) this.reserved.delete(pending);
        if (this.readyState === 3 || (!this.reserved.has(id) && this.reserved.size >= 5)) throw new Error('Room participant limit.');
        this.reserved.set(id, now);
      },
      onJoinError: ({ peerId }) => {
        this.reserved.delete(peerId);
        if (this.readyState !== 3 && this.peers.size === 0) this.onnotice?.('The browsers could not establish a direct connection. Try another network; this network may require a relay.');
      },
    });
    this.action = this.room.makeAction<string>('osd-plan-v1', {
      onReceive: ({ byteLength, peerId, metadata }) => {
        if (this.readyState !== 1 || !this.peers.has(peerId) || metadata !== undefined || byteLength > MAX_PACKET) return false;
        let counter = this.counts.get(peerId);
        if (!counter || Date.now() - counter.at > 10_000) { counter = { at: Date.now(), count: 0, bytes: 0 }; this.counts.set(peerId, counter); }
        counter.count++; counter.bytes += byteLength;
        if (counter.count > 1000 || counter.bytes > MAX_DOCUMENT_BYTES * 8) { this.room?.getPeers()[peerId]?.close(); return false; }
        return true;
      },
      onMessage: (data, { peerId }) => { void this.receive(data, peerId); },
    });
    this.room.onPeerJoin = (id) => {
      if (this.readyState === 3 || (!this.peers.has(id) && this.peers.size >= 5)) {
        this.reserved.delete(id); this.room?.getPeers()[id]?.close(); return;
      }
      this.peers.add(id); this.reserved.set(id, Date.now()); this.onnotice?.(null);
      this.presence();
      if (this.pending) { this.pending.waiting.add(id); this.transmit(this.pending.packet, id); }
      this.onresync?.();
    };
    this.room.onPeerLeave = (id) => {
      this.peers.delete(id); this.reserved.delete(id); this.counts.delete(id);
      this.pending?.waiting.delete(id); this.complete(); this.presence();
    };
  }
  private presence() {
    if (this.readyState !== 3) this.onmessage?.({ data: JSON.stringify({ type: 'peers', count: this.peers.size + 1 }) });
  }
  private transmit(packet: string, target?: string) {
    void this.action?.send(packet, { target, signal: this.abort.signal }).catch(() => {
      if (this.readyState !== 3) this.onnotice?.('A browser has not received the latest changes yet. Keep this tab open or export the project.');
    });
  }
  private async digest(data: string) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  private remember(digest: string) {
    this.accepted.add(digest);
    if (this.accepted.size > 512) this.accepted.delete(this.accepted.values().next().value!);
  }
  private async receive(data: unknown, peerId: string) {
    if (this.readyState !== 1 || !this.peers.has(peerId)) return;
    try {
      if (typeof data !== 'string' || data.length > MAX_PACKET) throw new Error();
      const packet = JSON.parse(data) as Packet;
      if (!packet || typeof packet !== 'object' || Array.isArray(packet) ||
          !Number.isSafeInteger(packet.id) || packet.id < 1 ||
          Object.keys(packet).some((key) => !['type', 'id', 'data'].includes(key))) throw new Error();
      if (packet.type === 'ack' && packet.data === undefined) {
        if (this.pending?.id === packet.id && this.pending.waiting.delete(peerId)) { this.pending.acknowledged = true; this.complete(); }
      } else if (packet.type === 'update' && typeof packet.data === 'string') {
        if (this.hashing >= 16 || this.hashingBytes + data.length > MAX_DOCUMENT_BYTES * 12) throw new Error();
        this.hashing++; this.hashingBytes += data.length;
        let digest: string;
        try { digest = await this.digest(packet.data); }
        finally { this.hashing--; this.hashingBytes -= data.length; }
        if (this.readyState !== 1 || !this.peers.has(peerId)) return;
        const key = `${peerId}:${packet.id}`;
        // A sender may retransmit a sequence, but must not change its payload
        // while validation is pending: otherwise one receipt could confirm another.
        const previous = this.receipts.get(key);
        if (previous && previous !== digest) throw new Error();
        if (this.accepted.has(digest)) { this.transmit(JSON.stringify({ type: 'ack', id: packet.id }), peerId); return; }
        if (this.receipts.size >= 32) throw new Error();
        const existing = this.validating.get(digest);
        this.receipts.set(key, digest);
        if (existing) { existing.set(key, { peerId, id: packet.id }); return; }
        this.validating.set(digest, new Map([[key, { peerId, id: packet.id }]]));
        this.onmessage?.({ data, peerId });
      } else throw new Error();
    } catch { this.room?.getPeers()[peerId]?.close(); }
  }
  private complete() {
    const current = this.pending;
    if (!current || current.waiting.size || !current.acknowledged) return;
    this.pending = null;
    this.onmessage?.({ data: JSON.stringify({ type: 'ack', id: current.id }) });
  }
  confirm(peerId: string, id: number) {
    const digest = this.receipts.get(`${peerId}:${id}`);
    if (!digest) return;
    const waiting = this.validating.get(digest);
    this.remember(digest); this.validating.delete(digest);
    waiting?.forEach((receipt, key) => {
      this.receipts.delete(key);
      if (this.peers.has(receipt.peerId)) this.transmit(JSON.stringify({ type: 'ack', id: receipt.id }), receipt.peerId);
    });
  }
  send(data: string) {
    if (this.readyState !== 1) return;
    const packet = JSON.parse(data) as Packet;
    if (this.pending || data.length > MAX_PACKET || packet.type !== 'update') throw new Error('Direct send queue limit.');
    this.pending = { packet: data, id: packet.id, waiting: new Set(this.peers), acknowledged: false };
    void this.digest(packet.data!).then((digest) => {
      if (this.readyState !== 1) return;
      this.remember(digest);
      if (this.pending?.id === packet.id && this.peers.size) this.transmit(data);
    }).catch(() => { if (this.readyState !== 3) this.close(); });
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3; clearTimeout(this.startup); this.abort.abort();
    const room = this.room; this.room = null;
    // This adapter owns one room per tab. Close physical peers too: retaining a
    // warm connection in an old strategy instance breaks a rapid offline/rejoin.
    Object.values(room?.getPeers() ?? {}).forEach((peer) => peer.close());
    // Stop network discovery immediately; room cleanup owns its internal peer timers.
    this.discovery.close();
    void room?.leave().catch(() => undefined);
    this.peers.clear(); this.reserved.clear(); this.counts.clear(); this.pending = null;
    this.accepted.clear(); this.validating.clear(); this.receipts.clear();
    this.onclose?.();
  }
}
