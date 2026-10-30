import { parentPort } from 'node:worker_threads';
import { tsImport } from 'tsx/esm/api';

const { validateRelayUpdate } = await tsImport('../src/collaboration/validateUpdate.ts', { parentURL: import.meta.url, tsconfig: false });
parentPort.on('message', ({ snapshot, update }) => {
  try {
    const { accepted, broadcast } = validateRelayUpdate(snapshot, update);
    parentPort.postMessage({ accepted, broadcast }, [accepted.buffer, broadcast.buffer]);
  } catch {
    // Do not send stack traces, plan strings or secrets back over the wire.
    parentPort.postMessage({ error: 'Shared update rejected by document validation.' });
  }
});
parentPort.postMessage({ ready: true });
