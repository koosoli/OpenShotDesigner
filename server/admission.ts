import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface PublicAccess { creationKey: string; signingKey: string; ticketTtlMs?: number }
export function validateAccess(access: PublicAccess): void {
  if (!/^[a-f\d]{64}$/i.test(access.creationKey) || !/^[a-f\d]{64}$/i.test(access.signingKey) || access.creationKey.toLowerCase() === access.signingKey.toLowerCase()) throw new Error('Public access requires two different random 32-byte hex keys.');
  if (access.ticketTtlMs !== undefined && (!Number.isSafeInteger(access.ticketTtlMs) || access.ticketTtlMs < 1000 || access.ticketTtlMs > 24 * 60 * 60_000)) throw new Error('Ticket lifetime must be between one second and 24 hours.');
}
export function creationAllowed(header: string | undefined, access: PublicAccess): boolean {
  return timingSafeEqual(createHash('sha256').update(header ?? '').digest(), createHash('sha256').update(`Bearer ${access.creationKey}`).digest());
}
export function issueTicket(room: string, access: PublicAccess, now = Date.now()): string {
  const expiry = (now + (access.ticketTtlMs ?? 24 * 60 * 60_000)).toString(36);
  const signature = createHmac('sha256', Buffer.from(access.signingKey, 'hex')).update(`${room}.${expiry}`).digest('base64url');
  return `${expiry}.${signature}`;
}
export function verifyTicket(room: string, ticket: string | undefined, access: PublicAccess, now = Date.now()): number | null {
  if (!ticket || !/^[a-z\d]{1,12}\.[A-Za-z\d_-]{43}$/.test(ticket)) return null;
  const [expiry, signature] = ticket.split('.');
  const expires = parseInt(expiry, 36);
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + 24 * 60 * 60_000) return null;
  const expected = createHmac('sha256', Buffer.from(access.signingKey, 'hex')).update(`${room}.${expiry}`).digest();
  const received = Buffer.from(signature, 'base64url');
  return received.toString('base64url') === signature && received.length === expected.length && timingSafeEqual(received, expected) ? expires : null;
}

export class RateLimits {
  private entries = new Map<string, { at: number; count: number; bytes: number }>();
  constructor(private readonly windowMs: number, private readonly maxCount: number, private readonly maxBytes = Infinity) {}
  consume(key: string, bytes = 0, now = Date.now()): boolean {
    let entry = this.entries.get(key);
    if (!entry || now - entry.at >= this.windowMs) {
      if (this.entries.size >= 4096) this.prune(now);
      if (!entry && this.entries.size >= 4096) return false;
      entry = { at: now, count: 0, bytes: 0 }; this.entries.set(key, entry);
    }
    entry.count++; entry.bytes += bytes;
    return entry.count <= this.maxCount && entry.bytes <= this.maxBytes;
  }
  prune(now = Date.now()) { for (const [key, entry] of this.entries) if (now - entry.at >= this.windowMs) this.entries.delete(key); }
}
