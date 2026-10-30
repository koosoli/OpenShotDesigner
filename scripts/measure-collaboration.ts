import * as Y from 'yjs';
import { createProject } from '../src/utils/projectLibrary';
import { roomProject, seedDocument, writeLocalChanges } from '../src/collaboration/model';

// Model CPU/packet baseline, not a browser or cross-network latency measurement.
const seed = roomProject(createProject({ title: 'Collaboration benchmark' }));
const actor = seed.setups[0].elements[0];
for (let index = 0; index < 998; index++) seed.setups[0].elements.push({ ...actor, id: `benchmark-${index}`, x: index, y: index });
const doc = new Y.Doc();
seedDocument(doc, seed);
const sizes: number[] = [];
const timings: number[] = [];
doc.on('update', (update: Uint8Array) => sizes.push(update.length));
let previous = seed;
for (let index = 0; index < 100; index++) {
  const next = { ...previous, setups: [{ ...previous.setups[0], elements: previous.setups[0].elements.map((e, i) => i === 0 ? { ...e, x: e.x + 1 } : e) }] };
  const start = performance.now();
  writeLocalChanges(doc, previous, next);
  timings.push(performance.now() - start);
  previous = next;
}
timings.sort((a, b) => a - b);
console.log(JSON.stringify({
  objects: seed.setups[0].elements.length, movements: 100,
  medianModelUpdateMs: +timings[50].toFixed(2), p95ModelUpdateMs: +timings[95].toFixed(2),
  maximumRawYjsUpdateBytes: Math.max(...sizes), totalRawYjsUpdateBytes: sizes.reduce((a, b) => a + b, 0),
  finalDocumentBytes: Y.encodeStateAsUpdate(doc).length,
}, null, 2));
doc.destroy();
