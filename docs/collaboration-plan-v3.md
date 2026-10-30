# Live floor-plan collaboration — reviewed implementation plan (v3)

**Superseded default:** the [v4 plan](collaboration-plan-v4.md) now implements account-free automatic WebRTC collaboration. The relay deployment sections below describe the optional private transport, not a requirement for ordinary users or session starters.

Date: 30 October 2026. Based on the supplied *Open Shot Designer — Collaborative Editing Proposal (v2)* and an audit of `koosoli/OpenShotDesigner` at `94f790b` (v1.5.1). Local `main` and GitHub `main` matched at the start of the work.

**Decision: implement an explicitly labelled collaboration preview, validate it, then pass the network/media release gates below before calling it a production feature.** This document improves and makes concrete the external proposal; it does not claim all of its acceptance criteria are satisfied. The original proposal is unchanged.

**Security update:** the [security review](collaboration-security-2026-10-30.md) adds protected public room creation, signed expiring invitations, public relay pinning, strict generated schemas, worker validation and abuse limits. Its deployment requirements supersede the initial unauthenticated preview assumptions.

**Second audit:** the [follow-up report](collaboration-second-audit-2026-10-30.md) fixes local/remote batching, project transitions, cache failures and reconnect traffic amplification. It contains the newest verification results.

## Repository findings

| Concern | Actual implementation | Consequence |
| --- | --- | --- |
| Editor | React 19, TypeScript, SVG; `FloorPlanContext` owns the production and active `SceneSetup` | Keep the existing canvas, tools and inspector; attach an optional state adapter. |
| Project format | Versioned `Project`, stable element/shot/layer/group IDs, schema v37 | Export ordinary snapshots; do not add CRDT fields to existing project files. |
| Mutation boundary | `useProjectHistory` wraps project setters; domain commands and gesture commits reach that boundary | Observe committed editor changes, exclude local viewport state, and project remote changes without writing them back as local commands. |
| Undo | Fifty whole-project snapshots | Unsafe for collaboration; use an origin-scoped Yjs UndoManager for shared operations. Reset the ordinary timeline when entering/leaving a room. |
| Persistence | IndexedDB-first project library, localStorage fallback, debounced autosave, per-tab write conflict detection | Each participant gets a separate local library project ID; reuse existing autosave and add separate room-state persistence. |
| Media | Content-addressed asset store; `.osd` ZIP export includes referenced bytes | An asset ID is not transferable media. Explicitly reject unsupported media in the preview; implement a separate transfer protocol before media support. |
| Frontend hosting | GitHub Pages at `/OpenShotDesigner/`; production build uses `GH_PAGES=true`; existing service worker | Invitation fragments preserve the base path. A relay is a separate process, not a Pages feature. |
| Existing design | `docs/collaboration-boundaries.md` and master plan Batch 3A already require document partitioning, a spike and local undo | Implement one plan first, rather than synchronizing the entire production and every department. |

## Architecture decision

Use **Yjs plus a small ephemeral WebSocket relay**, with a bounded browser-local IndexedDB snapshot cache. The preview does not depend on any provider's public demo server or free tier.

| Option | Fit for this repository | Decision |
| --- | --- | --- |
| WebRTC + CRDT | Host-independent editing is attractive; requires signaling plus realistic STUN/TURN/network tests and potentially relay bandwidth anyway | Keep as an alternative transport. Not implemented or experimentally compared in this session. |
| WebSocket + CRDT | A single deployable service; no browser host election; selective undo and convergent offline updates | Implemented for the preview. Internet reliability remains to be tested. |
| Browser host + ordered commands | Could reuse domain commands, but needs a host, migration/recovery rules and an offline merge design | More failure-state work for the promised host-independent experience. |
| Entire-project JSON broadcast | Small initial implementation, but overwrites independent edits and transmits unrelated production/media data | Reject. |

Yjs's standard WebSocket provider is a valid later alternative. The preview has a small explicit provider protocol because it needs staged application-level validation, bounded rooms, an immutable seed, and receipt acknowledgments. “Connected” and “received by relay” are deliberately different from “saved by everyone.” Keep the provider behind `CollaborationSession`; do not spread wire details through the canvas.

Verified upstream references: [selective undo](https://docs.yjs.dev/api/undo-manager), [WebSocket provider model](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket), [WebRTC provider/signaling defaults](https://github.com/yjs/y-webrtc), [GitHub Pages hosting](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site). These support the architecture comparison, not a claim that this prototype passed real-network trials.

## Concrete scope and semantics

1. **One plan, separate identity.** Starting creates a new room from the currently visible setup and its shots. Original library entries remain intact. Crew details, screenplay, other scenes, production days and unrelated departments are not seeded into the room.
2. **No guest seeding.** Joining waits for a valid room document or a cached previous copy. A guest's unrelated local plan is never sent as initialization. Room seed replacement is rejected; import/project switching leaves the room, so sharing a replacement requires a new invitation.
3. **Shared state.** Element and shot properties, layer/group records, explicit collection order, plan name/location, calibration/grid, beat count, sun settings, framing and storyboard order. Pan, zoom, current playback position, selections, tools and panels remain personal.
4. **Granular updates.** Stable flat Y.Map field keys avoid concurrent creation of competing nested maps. An ordinary label edit sends that property, not the entire scene. Geometric coordinates, endpoints, dimensions, path/points and rotation are one pose value to avoid hybrid transforms. Outbound drag updates coalesce over 50 ms.
5. **Conflicts.** Independent fields merge. Concurrent edits to the same field/pose use Yjs's deterministic map conflict resolution; it is **not** a promise of wall-clock last-gesture-wins. Object existence is independent of property writes, so a delayed move cannot resurrect a deleted object. Projection removes dangling shot/group/look-at references after deletion. Group gestures update member poses; competing member edits follow the same pose policy.
6. **Undo.** Only local editor-origin shared writes are tracked. Initial seeding and incoming updates are excluded. Local changes in other production modules are outside collaboration undo in the preview. Do not advertise the preview as whole-production collaboration.
7. **Recovery.** Compact room CRDT snapshots use an IndexedDB database keyed by a hash of endpoint plus room secret. Cache data is validated before application, and failed or timed-out reads cannot later merge into the live document. Project snapshots still use existing autosave. The latest original is saved before entering the separate room project. A returning participant can repopulate an empty relay. A fresh browser without a data holder stays in “Waiting for document.” Room persistence and project export are separate promises.
8. **Media gate.** Backgrounds, storyboard images and referenced custom files currently reject session creation with an actionable explanation. Adding unsupported media during a session stops sharing, preserves the edited local project and explains the failure. Nothing silently appears fully synchronized with missing resources.
9. **Limits.** Six clients per room; 2,000 records and a 2 MiB document/update-history limit; 32 retained rooms, 64 WebSockets, per-IP/admission/message limits, bounded validation queues and a 64 MiB retained-state budget. Long sessions reaching the history cap must export and fork a new room.
10. **Invitation/security.** A 256-bit cryptographic bearer secret is carried in the frontend URL fragment. Public rooms additionally need a server-signed ticket, valid for at most 24 hours; public room creation requires a separate creation key that never enters invitations. Public pages use only the operator-pinned relay. The relay sees plan contents and IP addresses. TLS protects transport; this is **not** end-to-end encryption. All valid-link holders can edit, copy and retain data. No promised individual revocation, remote deletion, read-only mode or forced session termination.

## Run and use the preview

For the German click-by-click participant guide and the browser-only hosted relay setup, see [Start/Join instructions](collaboration-start-guide-de.md). Participants need no installation. `render.yaml` is an optional, not-yet-deployed hosting template; the Pages workflow reads its public endpoint from the repository variable `VITE_COLLAB_RELAY_URL`.

Use a current Node runtime compatible with the repository's existing tools (validated here with Node 24.22.1).

```powershell
npm ci
npm run collaboration:relay
# In a second terminal:
npm run dev
```

Open the editor at `http://127.0.0.1:3000/`. Create/open a plan without media. Choose the people icon → **Start collaboration**, leaving `ws://127.0.0.1:1234` as the relay for local testing. Copy the invitation into a different browser profile, choose **Join session**, and confirm the displayed relay address. Export from the ordinary Save menu. **Leave session** retains the visible local copy.

No network connection or Yjs download is required for ordinary editing. Collaboration dependencies load when Start/Join is used. No room invitation automatically connects to an untrusted endpoint.

For an internet experiment, first follow the [protected deployment requirements](collaboration-security-2026-10-30.md). Use two different cryptographically random server secrets from a secret store and place the relay behind a tested TLS/WebSocket proxy. The configuration shape is:

```powershell
$env:COLLAB_HOST = '127.0.0.1'
$env:COLLAB_PORT = '1234'
$env:COLLAB_ORIGINS = 'https://koosoli.github.io'
$env:COLLAB_CREATE_KEY = '<64 hex characters from a secret store>'
$env:COLLAB_SIGNING_KEY = '<a different 64-character hex secret>'
npm run collaboration:relay

# In the separate static-frontend build environment; never expose either secret:
$env:VITE_COLLAB_RELAY_URL = 'wss://collaboration.your-domain.example'
```

The public frontend fails closed when no pinned relay is configured. Enter the creation key only when starting a room; guests use the signed invitation. The relay defaults to loopback, verifies public admission, and retains rooms in RAM for 15 minutes after the last client disconnects. A restart drops RAM state. Configure the proxy to avoid logging secret-bearing WebSocket paths, Authorization and subprotocol headers. Server-side limits supplement upstream throttling and monitoring; they do not replace a deployment security review.

There is no mandatory account, database archive, SaaS API key or built-in external service bill. Whoever hosts the relay pays its actual compute, bandwidth, TLS/domain and operational costs. No claim of free hosted capacity or an SLA is made.

GitHub Pages build:

```powershell
$env:GH_PAGES = 'true'
npm run build
npm run check:bundle
```

## Delivery gates

### Gate A — repository audit and reversible preview

- [x] Audit real state, history, persistence, media and Pages deployment boundaries.
- [x] Document the choice and conflict semantics instead of prescribing a library blindly.
- [x] Keep the existing renderer, ordinary project format and single-user workflow.
- [x] Implement Start/Join/Copy/Leave with a separate local project and waiting state.
- [x] Add a bounded, self-hostable ephemeral relay and local room persistence.
- [x] Add model/relay tests for concurrency, initialization, late join, undo, creator departure and empty-room recovery.
- [x] Complete browser interaction/recovery evidence; see [validation record](collaboration-validation-2026-10-30.md).

### Gate B — media support and usability before general release

- [ ] Transfer assets separately by content hash, with MIME/content/size verification, missing-asset status and local asset-store insertion. Do not embed blobs in the CRDT or re-send them with every movement.
- [ ] Test real large floorplans, mixed object types, group/member conflicts and long drags; record memory, bytes/update and latency percentiles.
- [ ] Test current Chromium, Firefox and mobile Safari, mobile sleep/backgrounding, private mode and cache/quota failures.
- [ ] Decide whether reconnect conflicts need a comparison/fork UI beyond the current warning.
- [ ] Evaluate a smaller always-visible connection indicator and presence/soft edit claims after essential reliability is proven.

### Gate C — real network acceptance before publishing collaboration as reliable

- [ ] Two physical devices on different internet connections (home Wi-Fi and mobile data).
- [ ] Representative restrictive school/office network; validate the TLS proxy's idle/upgrade behavior.
- [ ] Switch networks, sleep a device, restart the relay and interrupt connectivity while editing.
- [ ] Creator leaves with two guests; all clients leave; returning cached peer recovers; fresh browser gets waiting state if data has expired.
- [ ] Validate the production Pages invitation URL and offline reload of the already cached app shell and collaboration chunks.
- [ ] Record connection/join success, join time, drag responsiveness, traffic and recovery failures. A local browser-context test is not evidence for these checks.
- [ ] If relay reliability or operations fail these goals, compare a managed relay or a WebRTC/TURN experiment rather than declaring success.

### Gate D — deployment

- [ ] Choose an actual host/domain, retention expectations and acceptable running cost.
- [ ] Configure TLS, origin policy, proxy log redaction, public-service abuse controls and restart/health monitoring.
- [ ] Publish only after Gates B/C are satisfied or make the narrower experimental scope explicit.

No public relay, GitHub commit/push or live site deployment is performed by this local implementation.

## Validation record

Model tests verify replica equality, atomic competing transforms, independent attributes, stale delete/move behavior, local undo/redo, no repeated seeding, local viewport separation, unsupported media rejection, base-path invitation parsing and sub-1-KiB representative movement updates. Relay tests exercise actual local WebSocket sockets, receipt acknowledgments, late join, creator departure, immutable seed enforcement, origin rejection and room expiration.

`e2e/collaboration.spec.ts` exercises three isolated Chromium browser profiles through the real editor and relay, including unrelated local projects, changes in both directions, selective undo, offline edits/reconnect, refresh and snapshot export. These tests run on one machine and must not be described as a two-network or physical-device test.

Exact command results and remaining limitations are recorded in the [validation report](collaboration-validation-2026-10-30.md). The external proposal's internet and media acceptance criteria remain open until Gates B/C are completed.
