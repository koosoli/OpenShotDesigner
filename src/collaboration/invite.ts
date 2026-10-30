export interface Invite { relay: string; room: string; ticket?: string }
export const DIRECT_RELAY = 'webrtc:nostr:v1';
export const isPeerInvite = (invite: Invite) => invite.relay === DIRECT_RELAY;
const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
export const isLocalCollaborationPage = () => typeof window === 'undefined' || loopback(window.location.hostname);
export const configuredRelay = () => import.meta.env?.VITE_COLLAB_RELAY_URL as string | undefined;

export function relayUrl(value: string): string {
  if (typeof value !== 'string' || value.length > 1024) throw new Error('Invalid relay address.');
  const url = new URL(value);
  const localPage = isLocalCollaborationPage();
  if (url.username || url.password || url.search || url.hash ||
      (!localPage && loopback(url.hostname)) ||
      !(url.protocol === 'wss:' || (url.protocol === 'ws:' && loopback(url.hostname)))) {
    throw new Error('Use a wss:// relay URL (ws:// is allowed only on localhost).');
  }
  const normalized = url.href.replace(/\/$/, '');
  if (!localPage) {
    const trusted = configuredRelay();
    if (!trusted) throw new Error('Live collaboration is not configured on this installation.');
    if (normalized !== new URL(trusted).href.replace(/\/$/, '')) throw new Error('This invitation uses a relay that is not trusted by this installation.');
  }
  return normalized;
}

export function ticketExpiry(ticket: string): number {
  if (!/^[a-z\d]{1,12}\.[A-Za-z\d_-]{43}$/.test(ticket)) throw new Error('Invalid signed invitation.');
  const value = parseInt(ticket.split('.')[0], 36);
  if (!Number.isSafeInteger(value)) throw new Error('Invalid invitation expiry.');
  return value;
}

export function validateInvite(value: unknown): Invite {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid invitation.');
  const invite = value as Invite;
  if (Object.keys(invite).some((key) => !['room', 'relay', 'ticket'].includes(key)) || typeof invite.room !== 'string' || !/^[a-f0-9]{64}$/.test(invite.room)) throw new Error('Invalid room secret.');
  if (isPeerInvite(invite)) {
    if (invite.ticket !== undefined) throw new Error('Unexpected direct-session credential.');
    return { relay: DIRECT_RELAY, room: invite.room };
  }
  const relay = relayUrl(invite.relay);
  if (invite.ticket !== undefined && (typeof invite.ticket !== 'string' || ticketExpiry(invite.ticket) <= Date.now())) throw new Error('This invitation has expired. Ask for a new session; your local copy is still available.');
  if (typeof window !== 'undefined' && !loopback(window.location.hostname) && !invite.ticket) throw new Error('Public collaboration requires a signed invitation.');
  return { relay, room: invite.room, ...(invite.ticket ? { ticket: invite.ticket } : {}) };
}

export function parseInvite(value: string): Invite {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid invitation URL.');
  const raw = new URLSearchParams(url.hash.slice(1)).get('collab');
  if (!raw || raw.length > 4096) throw new Error('Invalid collaboration invitation.');
  return validateInvite(JSON.parse(raw));
}

/** Server issuance protects public room creation; the creation key never enters links/storage. */
export async function requestInvite(relay: string, creationKey = '', signal?: AbortSignal): Promise<Invite> {
  const normalized = relayUrl(relay);
  const key = creationKey.trim();
  if (key && !/^[a-f\d]{64}$/i.test(key)) throw new Error('The relay creation key must contain 64 hexadecimal characters.');
  const endpoint = new URL(normalized + '/rooms');
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
  const response = await fetch(endpoint, {
    method: 'POST', headers: key ? { Authorization: `Bearer ${key}` } : {},
    credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
  });
  if (response.status !== 201 || !response.body) {
    await response.body?.cancel();
    throw new Error(`The relay could not create a session (${response.status}). A protected relay requires its creation key.`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = ''; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 4096) throw new Error('Relay invitation response too large.');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return validateInvite({ ...JSON.parse(text), relay: normalized });
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export function createInvite(relay: string): Invite {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return { relay: relayUrl(relay), room: Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') };
}

/** Only the invitation fragment contains this independently generated 256-bit secret. */
export function createPeerInvite(): Invite {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return { relay: DIRECT_RELAY, room: Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') };
}

export function inviteLink(invite: Invite, base = window.location.href): string {
  const url = new URL(base);
  url.hash = new URLSearchParams({ collab: JSON.stringify(invite) }).toString();
  return url.href;
}
