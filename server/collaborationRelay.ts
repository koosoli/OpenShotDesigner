import { createServer, type IncomingMessage } from 'node:http';
import { isIP, type AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { MAX_DOCUMENT_BYTES } from '../src/collaboration/model';
import { ValidationPool } from './validationPool';
import { creationAllowed, issueTicket, RateLimits, validateAccess, verifyTicket, type PublicAccess } from './admission';

interface Options {
  origins: string[]; maxRooms?: number; idleMs?: number;
  maxConnections?: number; maxConnectionsPerIp?: number;
  publicAccess?: PublicAccess;
  /** Only this immediate proxy may supply a single overwritten client-IP header. */
  trustedProxy?: string;
}
interface Room { snapshot: Uint8Array; peers: Set<WebSocket>; tail: Promise<void>; jobs: number; timer?: ReturnType<typeof setTimeout> }
interface Admission { room: string; ip: string; expires: number }
const normalizeIp = (ip: string) => ip.startsWith('::ffff:') ? ip.slice(7) : ip;
const loopback = (host: string) => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);

/** Bounded ephemeral service: no disk access, user HTML, plan logging, or public signup. */
export function createCollaborationRelay(options: Options) {
  if (!options.origins.length || options.origins.some((value) => {
    try { const url = new URL(value); return url.origin !== value || !['http:', 'https:'].includes(url.protocol) || (!loopback(url.hostname) && url.protocol !== 'https:'); }
    catch { return true; }
  })) throw new Error('Configure exact HTTPS browser origins (HTTP is allowed only for loopback development).');
  if (options.publicAccess) validateAccess(options.publicAccess);
  if (options.origins.some((value) => !loopback(new URL(value).hostname)) && !options.publicAccess) throw new Error('Public browser origins require protected room creation and signed invitations.');
  if (options.trustedProxy && !isIP(normalizeIp(options.trustedProxy))) throw new Error('Trusted proxy must be one explicit IP address.');

  const rooms = new Map<string, Room>();
  const peersPerIp = new Map<string, number>();
  const admissions = new WeakMap<WebSocket, Admission>();
  const handshakes = new RateLimits(60_000, 60);
  const globalHandshakes = new RateLimits(10_000, 300);
  const traffic = new RateLimits(10_000, 1600, 16 * MAX_DOCUMENT_BYTES);
  const globalTraffic = new RateLimits(10_000, 3000, 32 * MAX_DOCUMENT_BYTES);
  const controlTraffic = new RateLimits(10_000, 120);
  const globalControls = new RateLimits(10_000, 500);
  const validator = new ValidationPool();
  let retainedBytes = 0;
  let queuedBytes = 0;
  let queuedJobs = 0;
  let closing = false;

  const clientIp = (request: IncomingMessage): string | null => {
    const address = normalizeIp(request.socket.remoteAddress ?? '');
    if (!isIP(address)) return null;
    if (options.trustedProxy && address === normalizeIp(options.trustedProxy)) {
      const forwarded = request.headers['x-forwarded-for'];
      if (typeof forwarded !== 'string' || !isIP(forwarded.trim())) return null;
      return normalizeIp(forwarded.trim());
    }
    return address;
  };
  const admitRequest = (request: IncomingMessage) => {
    const ip = clientIp(request);
    return ip && handshakes.consume(ip) && globalHandshakes.consume('all') ? ip : null;
  };
  const server = createServer({ maxHeaderSize: 8192, headersTimeout: 5000, requestTimeout: 10_000, keepAliveTimeout: 5000 }, (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (request.url === '/health' || request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/plain' }); response.end('Collaboration relay\n'); return;
    }
    if (request.url !== '/rooms') { response.writeHead(404); response.end(); return; }
    const origin = request.headers.origin;
    if (!origin || !options.origins.includes(origin) || !admitRequest(request)) { response.writeHead(403); response.end(); return; }
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization' }); response.end(); return;
    }
    if (request.method !== 'POST' || request.headers['transfer-encoding'] || Number(request.headers['content-length'] ?? 0) !== 0) {
      response.writeHead(400, { Connection: 'close' }); response.end(); return;
    }
    if (options.publicAccess && !creationAllowed(request.headers.authorization, options.publicAccess)) { response.writeHead(403); response.end(); return; }
    const room = randomBytes(32).toString('hex');
    response.writeHead(201, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ room, ...(options.publicAccess ? { ticket: issueTicket(room, options.publicAccess) } : {}) }));
  });
  server.maxConnections = 128;
  server.maxHeadersCount = 32;
  const wss = new WebSocketServer({
    noServer: true, maxPayload: MAX_DOCUMENT_BYTES * 1.5, perMessageDeflate: false,
    autoPong: false, allowSynchronousEvents: false, maxFragments: 1024, maxBufferedChunks: 4096,
    handleProtocols: (protocols) => protocols.has('osd-collab-v1') ? 'osd-collab-v1' : false,
  });
  server.on('upgrade', (request, socket, head) => {
    const onSocketError = () => socket.destroy();
    socket.on('error', onSocketError);
    const path = request.url ?? '';
    const origin = request.headers.origin;
    const ip = admitRequest(request);
    const deny = (code: number) => { socket.end('HTTP/1.1 ' + code + ' Rejected\r\nConnection: close\r\n\r\n', () => socket.destroy()); };
    if (closing || !ip || !origin || !options.origins.includes(origin) || !/^\/[a-f0-9]{64}$/.test(path)) { deny(403); return; }
    const roomId = path.slice(1);
    const protocol = request.headers['sec-websocket-protocol']?.split(',').map((value) => value.trim()).find((value) => value.startsWith('ticket.'));
    const expires = options.publicAccess ? verifyTicket(roomId, protocol?.slice(7), options.publicAccess) : Infinity;
    if (expires === null) { deny(403); return; }
    const existing = rooms.get(roomId);
    if (wss.clients.size >= (options.maxConnections ?? 64) || (peersPerIp.get(ip) ?? 0) >= (options.maxConnectionsPerIp ?? 12) ||
        (existing?.peers.size ?? 0) >= 6 || (!existing && rooms.size >= (options.maxRooms ?? 32))) { deny(503); return; }
    wss.handleUpgrade(request, socket, head, (peer) => {
      socket.removeListener('error', onSocketError);
      admissions.set(peer, { room: roomId, ip, expires });
      peersPerIp.set(ip, (peersPerIp.get(ip) ?? 0) + 1);
      wss.emit('connection', peer, request);
    });
  });
  const send = (peer: WebSocket, message: unknown) => {
    if (peer.readyState !== WebSocket.OPEN) return;
    if (Date.now() >= admissions.get(peer)!.expires) { peer.terminate(); return; }
    if (peer.bufferedAmount > MAX_DOCUMENT_BYTES * 2) { peer.terminate(); return; }
    peer.send(JSON.stringify(message));
  };
  wss.on('connection', (peer) => {
    const admission = admissions.get(peer)!;
    let room = rooms.get(admission.room);
    if (!room) { room = { snapshot: new Uint8Array([0, 0]), peers: new Set(), tail: Promise.resolve(), jobs: 0 }; rooms.set(admission.room, room); retainedBytes += 2; }
    if (room.timer) clearTimeout(room.timer);
    room.peers.add(peer);
    const active = room;
    const presence = () => active.peers.forEach((p) => send(p, { type: 'peers', count: active.peers.size }));
    send(peer, { type: 'update', data: Buffer.from(active.snapshot).toString('base64') });
    presence();
    let count = 0; let bytes = 0; let since = Date.now(); let busy = false; let rejected = false;
    let controlCount = 0; let controlsSince = Date.now();
    const allowControl = () => {
      if (Date.now() - controlsSince > 10_000) { controlsSince = Date.now(); controlCount = 0; }
      if (Date.now() >= admission.expires || ++controlCount > 20 || !controlTraffic.consume(admission.ip) || !globalControls.consume('all') || peer.bufferedAmount > MAX_DOCUMENT_BYTES * 2) {
        peer.terminate(); return false;
      }
      return true;
    };
    peer.on('ping', (data) => { if (allowControl()) peer.pong(data); });
    peer.on('pong', () => { if (allowControl()) (peer as WebSocket & { alive?: boolean }).alive = true; });
    const reject = () => {
      rejected = true;
      send(peer, { type: 'error', message: 'Update rejected or relay resource limit reached. Keep/export your local project.' });
      peer.close(1008, 'Update rejected');
    };
    peer.on('message', (raw, isBinary) => {
      if (rejected || closing) return;
      const size = Array.isArray(raw) ? raw.reduce((sum, part) => sum + part.byteLength, 0) : raw.byteLength;
      if (Date.now() - since > 10_000) { since = Date.now(); count = 0; bytes = 0; }
      bytes += size;
      if (busy || isBinary || Date.now() >= admission.expires || ++count > 250 || bytes > MAX_DOCUMENT_BYTES * 4 ||
          !traffic.consume(admission.ip, size) || !globalTraffic.consume('all', size) || active.jobs >= 8 || queuedJobs >= 32 || queuedBytes + size > 16 * 1024 * 1024) { reject(); return; }
      busy = true; active.jobs++; queuedJobs++; queuedBytes += size;
      active.tail = active.tail.then(async () => {
        try {
          if (closing || rejected || peer.readyState !== WebSocket.OPEN || rooms.get(admission.room) !== active) return;
          const message: unknown = JSON.parse(raw.toString());
          if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid envelope.');
          const packet = message as { type?: unknown; id?: unknown; data?: unknown };
          if (Object.keys(packet).some((key) => !['type', 'id', 'data'].includes(key)) || packet.type !== 'update' || !Number.isSafeInteger(packet.id) || (packet.id as number) < 1 ||
              typeof packet.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(packet.data)) throw new Error('Invalid update.');
          const update = new Uint8Array(Buffer.from(packet.data, 'base64'));
          if (update.byteLength > MAX_DOCUMENT_BYTES) throw new Error('Update too large.');
          const accepted = await validator.validate(active.snapshot, update);
          if (closing || rejected || peer.readyState !== WebSocket.OPEN || rooms.get(admission.room) !== active) return;
          const nextBytes = retainedBytes - active.snapshot.length + accepted.snapshot.length;
          if (nextBytes > 64 * 1024 * 1024 || Date.now() >= admission.expires) throw new Error('Room memory or ticket limit.');
          retainedBytes = nextBytes;
          active.snapshot = accepted.snapshot;
          if (accepted.broadcast.length > 2) {
            const data = Buffer.from(accepted.broadcast).toString('base64');
            active.peers.forEach((other) => { if (other !== peer) send(other, { type: 'update', data }); });
          }
          send(peer, { type: 'ack', id: packet.id });
        } catch { if (!closing) reject(); }
        finally { busy = false; active.jobs--; queuedJobs--; queuedBytes -= size; }
      });
    });
    peer.on('error', () => { /* No secrets, payloads or request paths in logs. */ });
    peer.on('close', () => {
      const remaining = (peersPerIp.get(admission.ip) ?? 1) - 1;
      if (remaining) peersPerIp.set(admission.ip, remaining); else peersPerIp.delete(admission.ip);
      active.peers.delete(peer);
      presence();
      if (!closing && !active.peers.size) active.timer = setTimeout(() => { retainedBytes -= active.snapshot.length; rooms.delete(admission.room); }, options.idleMs ?? 15 * 60_000);
    });
  });
  const heartbeat = setInterval(() => {
    handshakes.prune(); globalHandshakes.prune(); traffic.prune(); globalTraffic.prune(); controlTraffic.prune(); globalControls.prune();
    wss.clients.forEach((peer) => {
      const marked = peer as WebSocket & { alive?: boolean };
      if (marked.alive === false || Date.now() >= admissions.get(peer)!.expires) { peer.terminate(); return; }
      marked.alive = false;
      peer.ping();
    });
  }, 30_000);
  return {
    async listen(port = 1234, host = '127.0.0.1') {
      if (!loopback(host) && !options.publicAccess) throw new Error('Non-loopback binding requires protected room creation and signed invitations.');
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
      return (server.address() as AddressInfo).port;
    },
    async close() {
      closing = true;
      clearInterval(heartbeat);
      wss.clients.forEach((peer) => peer.terminate());
      await validator.close();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      for (const room of rooms.values()) if (room.timer) clearTimeout(room.timer);
      rooms.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
