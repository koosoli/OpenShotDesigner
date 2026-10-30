import { MAX_DOCUMENT_BYTES } from './model';

/** Compact, bounded recovery cache. Every IDB failure has an owned rejection path. */
export class RoomCache {
  private db: IDBDatabase | null = null;
  private closed = false;
  private failed = false;
  private pending: Uint8Array | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly name: string, private readonly onError: (error: Error) => void) {}

  async load(): Promise<Uint8Array | null> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      let expired = false;
      const request = indexedDB.open(this.name, 1);
      const timer = setTimeout(() => { expired = true; reject(new Error('Local room cache timed out.')); }, 5000);
      request.onupgradeneeded = () => { request.result.createObjectStore('snapshot'); };
      request.onerror = () => { clearTimeout(timer); reject(new Error('Local room cache could not be opened.')); };
      request.onsuccess = () => {
        clearTimeout(timer);
        if (expired || this.closed) { request.result.close(); reject(new Error('Local room cache closed.')); }
        else resolve(request.result);
      };
    });
    if (this.closed) { db.close(); return null; }
    this.db = db;
    db.onversionchange = () => { this.problem(new Error('Local room cache changed in another tab.')); db.close(); };
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('snapshot', 'readonly');
      const request = tx.objectStore('snapshot').get('plan');
      const timer = setTimeout(() => { try { tx.abort(); } catch { /* Already finished. */ } reject(new Error('Local room cache read timed out.')); }, 5000);
      tx.oncomplete = () => { clearTimeout(timer); resolve(request.result); };
      tx.onerror = tx.onabort = () => { clearTimeout(timer); reject(new Error('Local room cache could not be read.')); };
    });
    if (this.closed || value === undefined) return null;
    if (!ArrayBuffer.isView(value) || value.byteLength > MAX_DOCUMENT_BYTES) throw new Error('Invalid local room cache.');
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  save(snapshot: Uint8Array) {
    if (this.closed || this.failed || !this.db) return;
    if (snapshot.byteLength > MAX_DOCUMENT_BYTES) { this.problem(new Error('Local room history exceeds its cache limit.')); return; }
    this.pending = snapshot;
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 250);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.closed || this.failed || !this.db || !this.pending) return;
    try {
      const tx = this.db.transaction('snapshot', 'readwrite');
      tx.objectStore('snapshot').put(this.pending, 'plan');
      this.pending = null;
      const timer = setTimeout(() => { try { tx.abort(); } catch { /* Already finished. */ } this.problem(new Error('Local room cache write timed out.')); }, 5000);
      tx.oncomplete = () => { clearTimeout(timer); };
      tx.onerror = tx.onabort = () => { clearTimeout(timer); this.problem(new Error('Local room cache write failed.')); };
    } catch { this.problem(new Error('Local room cache write failed.')); }
  }

  private problem(error: Error) {
    if (this.failed) return;
    this.failed = true;
    this.onError(error);
  }

  close() {
    if (this.closed) return;
    this.flush();
    this.closed = true;
    this.db?.close(); this.db = null;
  }
}
