import * as Y from 'yjs';
import { MAX_DOCUMENT_BYTES, readDocument } from './model';

/** Reconnect snapshots must not be amplified into full snapshots for every peer. */
export function validateRelayUpdate(snapshot: Uint8Array, update: Uint8Array) {
  const accepted = validateIncomingUpdate(snapshot, update);
  const unchanged = accepted.length === snapshot.length && accepted.every((value, index) => value === snapshot[index]);
  const broadcast = unchanged ? new Uint8Array([0, 0]) : Y.diffUpdate(accepted, Y.encodeStateVectorFromUpdate(snapshot));
  return { accepted, broadcast };
}

/** Run untrusted binary decoding inside a disposable, time-limited worker. */
export function validateIncomingUpdate(snapshot: Uint8Array, update: Uint8Array): Uint8Array {
  if (snapshot.byteLength > MAX_DOCUMENT_BYTES || update.byteLength > MAX_DOCUMENT_BYTES) throw new Error('Synchronization payload too large.');
  const candidate = new Y.Doc();
  try {
    Y.applyUpdate(candidate, snapshot);
    const seed = candidate.getMap('meta').get('seed');
    Y.applyUpdate(candidate, update);
    if (seed !== undefined && candidate.getMap('meta').get('seed') !== seed) throw new Error('A room cannot be replaced. Fork a new session.');
    readDocument(candidate);
    const accepted = Y.encodeStateAsUpdate(candidate);
    if (accepted.byteLength > MAX_DOCUMENT_BYTES) throw new Error('Room size limit reached; export and fork a new session.');
    return accepted;
  } finally { candidate.destroy(); }
}
