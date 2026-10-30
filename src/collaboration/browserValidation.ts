/** A malicious relay must not run its binary decoder on the editor's UI thread. */
export class BrowserValidation {
  private worker: Worker | null = null;
  private active: { reject: (error: Error) => void } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  validate(snapshot: Uint8Array, update: Uint8Array): Promise<void> {
    if (this.active) return Promise.reject(new Error('Remote update is already being validated.'));
    const starting = !this.worker;
    this.worker ??= new Worker(new URL('./validation.worker.ts', import.meta.url), { type: 'module' });
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      this.active = { reject };
      this.timer = setTimeout(() => this.close(), starting ? 10_000 : 1500);
      worker.onmessage = (event: MessageEvent<{ error?: string; ready?: boolean }>) => {
        if (this.timer) clearTimeout(this.timer);
        if (event.data.ready) {
          this.timer = setTimeout(() => this.close(), 1500);
          worker.postMessage({ snapshot, update });
          return;
        }
        this.timer = null; this.active = null;
        if (event.data.error) reject(new Error(event.data.error));
        else resolve();
      };
      worker.onerror = () => this.close();
      if (!starting) worker.postMessage({ snapshot, update });
    });
  }
  close() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.worker?.terminate(); this.worker = null;
    this.active?.reject(new Error('Remote validation failed or exceeded its time limit.'));
    this.active = null;
  }
}
