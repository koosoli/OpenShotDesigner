import { createCollaborationRelay } from '../server/collaborationRelay';

const relay = createCollaborationRelay({
  origins: (process.env.COLLAB_ORIGINS ?? 'http://127.0.0.1:3000,http://localhost:3000').split(',').map((s) => s.trim()),
  ...(process.env.COLLAB_CREATE_KEY || process.env.COLLAB_SIGNING_KEY ? { publicAccess: {
    creationKey: process.env.COLLAB_CREATE_KEY ?? '', signingKey: process.env.COLLAB_SIGNING_KEY ?? '',
  } } : {}),
  trustedProxy: process.env.COLLAB_TRUSTED_PROXY,
});
const port = await relay.listen(Number(process.env.COLLAB_PORT ?? process.env.PORT ?? 1234), process.env.COLLAB_HOST ?? '127.0.0.1');
console.log(`Collaboration relay listening on port ${port} (ephemeral rooms; no project archive).`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void relay.close().then(() => process.exit(0)); });
