import { validateIncomingUpdate } from './validateUpdate';

self.onmessage = (event: MessageEvent<{ snapshot: Uint8Array; update: Uint8Array }>) => {
  try {
    validateIncomingUpdate(event.data.snapshot, event.data.update);
    self.postMessage({ accepted: true });
  } catch {
    self.postMessage({ error: 'Remote synchronization data was rejected.' });
  }
};
self.postMessage({ ready: true });
