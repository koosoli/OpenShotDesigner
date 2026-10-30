import { createTopicStrategy, type StrategyMessage, type JoinRoom } from '@trystero-p2p/core';
import { createEvent, subscribe } from '@trystero-p2p/nostr';

// Fixed in the application, never selected by an invitation or by a guest.
export const DISCOVERY_SERVICES = ['wss://nos.lol', 'wss://cdn.satellite.earth', 'wss://relay.damus.io'] as const;
const MAX_SIGNAL = 96 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function base64(bytes: Uint8Array) {
  let raw = '';
  for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(raw);
}

/** Seal the entire discovery message, including announcements, before a public relay sees it. */
export class DiscoveryCipher {
  private readonly key: Promise<CryptoKey>;
  private seen = new Set<string>();
  constructor(secret: string) {
    if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Invalid discovery secret.');
    const bytes = Uint8Array.from(secret.match(/../g)!, (pair) => parseInt(pair, 16));
    this.key = crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  async seal(topic: string, message: StrategyMessage) {
    const plain = encoder.encode(JSON.stringify({ at: Date.now(), message }));
    if (plain.length > 64 * 1024) throw new Error('Discovery message too large.');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`osd-discovery-v1:${topic}`) }, await this.key, plain));
    const packed = new Uint8Array(iv.length + encrypted.length); packed.set(iv); packed.set(encrypted, iv.length);
    return base64(packed);
  }
  async open(topic: string, packed: string): Promise<Record<string, unknown> | null> {
    if (packed.length > MAX_SIGNAL || !/^[A-Za-z0-9+/]+={0,2}$/.test(packed) || this.seen.has(packed.slice(0, 16))) return null;
    try {
      const bytes = Uint8Array.from(atob(packed), (c) => c.charCodeAt(0));
      if (bytes.length < 28) return null;
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: encoder.encode(`osd-discovery-v1:${topic}`) }, await this.key, bytes.slice(12));
      const envelope = JSON.parse(decoder.decode(plain)) as { at?: unknown; message?: unknown };
      if (typeof envelope.at !== 'number' || Math.abs(Date.now() - envelope.at) > 120_000) return null;
      const message: unknown = typeof envelope.message === 'string' ? JSON.parse(envelope.message) : envelope.message;
      if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
      const record = message as Record<string, unknown>;
      if (typeof record.peerId !== 'string' || !/^[a-zA-Z0-9]{20}$/.test(record.peerId) ||
          Object.keys(record).some((key) => !['peerId', 'offer', 'answer', 'candidate', 'offerId', 'passive'].includes(key))) return null;
      for (const field of ['offer', 'answer', 'candidate', 'offerId']) if (record[field] !== undefined && (typeof record[field] !== 'string' || (record[field] as string).length > 60 * 1024)) return null;
      if (record.passive !== undefined && typeof record.passive !== 'boolean') return null;
      this.seen.add(packed.slice(0, 16));
      if (this.seen.size > 1024) this.seen.delete(this.seen.values().next().value!);
      return record;
    } catch { return null; }
  }
}

interface Subscription { id: string; handler: (topic: string, message: StrategyMessage) => void | Promise<void> }
class DiscoveryClient {
  private socket: WebSocket | null = null;
  private closed = false;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private subscriptions = new Map<string, Subscription>();
  private announcements = new Map<string, StrategyMessage>();
  private sends = 0;
  private count = 0; private bytes = 0; private since = Date.now();
  constructor(readonly url: string, private readonly owner: PeerDiscovery) {
    this.connect();
  }
  private connect() {
    if (this.closed) return;
    const socket = this.socket = new WebSocket(this.url);
    socket.onopen = () => {
      if (this.closed || socket !== this.socket) { socket.close(); return; }
      this.attempts = 0; this.owner.available();
      for (const [topic, sub] of this.subscriptions) socket.send(subscribe(sub.id, topic));
      for (const [topic, message] of this.announcements) void this.publish(topic, message, false);
    };
    socket.onmessage = (event) => {
      if (this.closed || socket !== this.socket) return;
      if (Date.now() - this.since > 10_000) { this.since = Date.now(); this.count = 0; this.bytes = 0; }
      if (typeof event.data !== 'string' || event.data.length > 128 * 1024 || ++this.count > 200 || (this.bytes += event.data.length) > 2 * 1024 * 1024) { this.close(); return; }
      try {
        const frame: unknown = JSON.parse(event.data);
        if (!Array.isArray(frame) || frame[0] !== 'EVENT' || frame.length !== 3 || typeof frame[1] !== 'string') return;
        const sub = [...this.subscriptions.entries()].find(([, value]) => value.id === frame[1]);
        const eventData = frame[2] as { content?: unknown; tags?: unknown } | null;
        if (!sub || !eventData || typeof eventData.content !== 'string' || eventData.content.length > MAX_SIGNAL) return;
        this.owner.receive(sub[0], eventData.content, sub[1].handler);
      } catch { /* Invalid public relay frames never reach WebRTC signaling. */ }
    };
    socket.onerror = () => { /* Close/retry owns connection failures. */ };
    socket.onclose = () => {
      if (this.closed || socket !== this.socket) return;
      this.retry = setTimeout(() => this.connect(), Math.min(30_000, 1000 * 2 ** Math.min(this.attempts++, 5)) + Math.random() * 500);
    };
  }
  subscribe(topic: string, handler: Subscription['handler']) {
    if (this.closed) return () => {};
    if (this.subscriptions.size >= 2) throw new Error('Discovery subscription limit.');
    const id = crypto.randomUUID(); this.subscriptions.set(topic, { id, handler });
    if (this.socket?.readyState === 1) this.socket.send(subscribe(id, topic));
    return () => {
      this.subscriptions.delete(topic);
      if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(['CLOSE', id]));
    };
  }
  async publish(topic: string, message: StrategyMessage, announce: boolean) {
    if (this.closed) return;
    if (announce) this.announcements.set(topic, message);
    if (this.socket?.readyState !== 1 || this.sends >= 64) return;
    this.sends++;
    try {
      const sealed = await this.owner.cipher.seal(topic, message);
      const event = await createEvent(topic, sealed);
      if (!this.closed && this.socket?.readyState === 1 && this.socket.bufferedAmount < 512 * 1024) this.socket.send(event);
    } catch { /* Best-effort discovery; the strategy reannounces. */ }
    finally { this.sends--; }
  }
  close() {
    this.closed = true; if (this.retry) clearTimeout(this.retry);
    this.socket?.close(); this.subscriptions.clear(); this.announcements.clear();
  }
}

/** Public services carry only short-lived sealed discovery; no plan snapshots. */
export class PeerDiscovery {
  readonly cipher: DiscoveryCipher;
  readonly join: JoinRoom;
  private clients: DiscoveryClient[] = [];
  private closed = false;
  private queued = 0; private bytes = 0;
  private tail = Promise.resolve();
  private known = new Set<string>();
  constructor(secret: string, readonly available: () => void) {
    this.cipher = new DiscoveryCipher(secret);
    this.join = createTopicStrategy<DiscoveryClient>({
      steadyAnnounceIntervalMs: 15_000,
      init: () => DISCOVERY_SERVICES.map((url) => {
        if (this.closed) throw new Error('Discovery closed.');
        const client = new DiscoveryClient(url, this); this.clients.push(client); return client;
      }),
      subscribeTopic: (client, topic, handler) => client.subscribe(topic, handler),
      publishTopic: (client, topic, message, context) => client.publish(topic, message, context.kind === 'announce'),
    });
  }
  receive(topic: string, packed: string, handler: Subscription['handler']) {
    if (this.closed || this.queued >= 16 || this.bytes + packed.length > 1024 * 1024) return;
    this.queued++; this.bytes += packed.length;
    this.tail = this.tail.then(async () => {
      if (this.closed) return;
      const payload = await this.cipher.open(topic, packed);
      if (!payload || this.closed) return;
      const id = payload.peerId as string;
      // Bound pending peer/offer identities for the whole session, not just connected peers.
      if (!this.known.has(id) && this.known.size >= 32) return;
      this.known.add(id);
      await handler(topic, payload);
    }).catch(() => undefined).finally(() => { this.queued--; this.bytes -= packed.length; });
  }
  close() { this.closed = true; this.clients.forEach((client) => client.close()); this.clients = []; this.known.clear(); }
}
