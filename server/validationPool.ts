import { Worker } from 'node:worker_threads';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Accepted { snapshot: Uint8Array; broadcast: Uint8Array }
interface Job {
  snapshot: Uint8Array; update: Uint8Array;
  resolve: (value: Accepted) => void; reject: (error: Error) => void;
}

/** One bounded queue/worker keeps binary decoders off the HTTP event loop. */
export class ValidationPool {
  private worker: Worker | null = null;
  private ready = false;
  private closed = false;
  private queue: Job[] = [];
  private active: Job | null = null;
  private bytes = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  validate(snapshot: Uint8Array, update: Uint8Array): Promise<Accepted> {
    if (this.closed || this.queue.length >= 32 || this.bytes + snapshot.length + update.length > 16 * 1024 * 1024) return Promise.reject(new Error('Validation capacity reached.'));
    return new Promise((resolve, reject) => {
      this.bytes += snapshot.length + update.length;
      this.queue.push({ snapshot, update, resolve, reject });
      this.pump();
    });
  }

  private pump() {
    if (this.closed || this.active || !this.queue.length) return;
    if (!this.worker) {
      let worker: Worker;
      try {
        worker = new Worker(join(dirname(fileURLToPath(import.meta.url)), 'relayValidationWorker.mjs'), {
          execArgv: [], env: { TSX_DISABLE_CACHE: '1' },
          resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 2 },
        });
      } catch {
        const job = this.queue.shift()!;
        this.bytes -= job.snapshot.length + job.update.length;
        job.reject(new Error('Validation worker unavailable.'));
        this.pump(); return;
      }
      this.worker = worker;
      this.timer = setTimeout(() => this.failed(worker), 5000);
      worker.on('message', (message: { ready?: boolean; error?: string; accepted?: Uint8Array; broadcast?: Uint8Array }) => {
        if (this.worker !== worker || this.closed) return;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        if (message.ready) { this.ready = true; this.pump(); return; }
        const job = this.active;
        if (!job) { this.failed(worker); return; }
        this.active = null;
        this.bytes -= job.snapshot.length + job.update.length;
        if (message.accepted && message.broadcast) job.resolve({ snapshot: message.accepted, broadcast: message.broadcast });
        else job.reject(new Error(message.error ?? 'Shared update rejected.'));
        this.pump();
      });
      worker.on('error', (error: unknown) => this.failed(worker, error instanceof Error ? error.message : 'Validation worker failed.'));
      worker.on('exit', () => this.failed(worker));
      return;
    }
    if (!this.ready) return;
    this.active = this.queue.shift()!;
    const worker = this.worker;
    this.timer = setTimeout(() => this.failed(worker), 1000);
    worker.postMessage({ snapshot: this.active.snapshot, update: this.active.update });
  }

  private failed(worker: Worker, reason = 'Document validation exceeded its resource limit.') {
    if (worker !== this.worker) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.worker = null;
    this.ready = false;
    void worker.terminate();
    const job = this.active ?? this.queue.shift();
    this.active = null;
    if (job) {
      this.bytes -= job.snapshot.length + job.update.length;
      job.reject(new Error(reason));
    }
    this.pump();
  }

  async close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    const jobs = [...(this.active ? [this.active] : []), ...this.queue];
    this.active = null; this.queue = []; this.bytes = 0;
    jobs.forEach((job) => job.reject(new Error('Relay is stopping.')));
    if (this.worker) await this.worker.terminate();
    this.worker = null;
  }
}
