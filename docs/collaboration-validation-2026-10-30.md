# Collaboration preview — validation record

30 October 2026 · Branch `codex/floorplan-collaboration` · Starting revision `94f790b` (v1.5.1).

**Security follow-up:** this records the initial preview checks. The later [security review](collaboration-security-2026-10-30.md) records the hardened protocol, additional tests, current dependency audit and mandatory public-deployment controls. Its requirements supersede the original unauthenticated public-service assumptions below.

## Delivered

The existing editor now has optional Start/Join/Copy/Leave collaboration controls. A room contains one plan and its shots, layers, groups and plan settings. Each participant receives a separate local project; the original production remains in the library. Element properties are synchronized granularly, with atomic pose values, deterministic conflict resolution, delete tombstones and local-origin undo/redo. Room state persists separately in IndexedDB; ordinary project autosave and portable `.osd`/JSON export remain available.

The relay is a separate, bounded in-memory WebSocket process. It stages and validates updates before accepting them, rejects plan replacement, acknowledges receipt and reports participant counts. Clients reconnect and resend their local document, detect offline/half-open connections, and stop safely with an exportable local project on a fatal validation error. A fresh participant with no recoverable state sees “Waiting for document.” No public service was provisioned, and no GitHub push or site deployment was performed.

## Checks

Validated with Node 24.22.1 and installed Playwright 1.63.0 on Windows. Ordinary scripts also build/run with the host's Node 22.17.0, but that runtime is older than the existing jsdom toolchain's declared minimum; use the newer runtime for the test suite.

| Check | Result |
| --- | --- |
| Full Vitest suite, `vitest run --maxWorkers=4` | **2,883 tests passed in 246 files**. Includes 17 new collaboration model/relay tests. |
| TypeScript, `tsc --noEmit` | Passed. |
| ESLint, `eslint . --max-warnings=0` | Passed. |
| Encoding, command-ratchet and installed Playwright version checks | Passed. |
| Production dependency audit, `npm audit --omit=dev --audit-level=critical` | Zero production dependency vulnerabilities reported. |
| Production build with `GH_PAGES=true` | Passed; entry approximately **367.0 KiB**, below the 420,000-byte budget. Collaboration runtime is a separate lazy chunk. |
| Existing critical-production and data-loss browser cases | **16 passed**, covering project recovery, legacy import, linked deletions, native saving, two-tab conflicts, confirmations and exports. |
| Existing phone layout and light/dark axe checks | **3 passed** after adapting the toolbar; phone controls fit 375 px, desktop title/share controls do not overlap. |
| Existing production service-worker offline reload | **1 passed**. |
| New collaboration browser cases | **2 passed** against development and repeated against the built app at `/OpenShotDesigner/`. |

There are **22 distinct browser cases** in the checks above. Repeating the two collaboration cases against the production build does not count as two extra features or as a real-network experiment. Individual reruns used separate Playwright output directories to keep their artifacts independent.

The three-profile collaboration case uses real Chromium profiles, real sockets and the real editor. It checks:

- A creator's original project remains stored and unchanged.
- A guest's unrelated production is not merged; there is no duplicate seed.
- Changes reach late joiners and flow in both directions.
- Local Undo leaves a different participant's edit intact.
- Two guests continue after the creator closes.
- Offline edits remain visible locally and reach the other guest after reconnect.
- Refresh/rejoin restores the room without duplicating objects.
- JSON exports converge; `.osd` export can be imported after leaving the session.
- A new browser entering an unseeded room retains its own local project and waits.

The model tests additionally exercise concurrent writes to the same transform, independent attributes, delete/move races, same-field remote edits surviving local undo, simultaneous additions, collection order, groups/layers, malformed arrays, invalid coordinates, external SVG paint references, unsupported media, and base-path invitation parsing. Relay tests verify room expiry, origin rejection, immutable seed enforcement, receipt acknowledgments and creator departure.

## Packet and model baseline

Reproduce with `npm run collaboration:benchmark`. One measured run on this machine, for **1,000 real-schema elements and 100 successive movements**:

| Measurement | Observed |
| --- | ---: |
| Median model-update CPU time | 12.52 ms |
| 95th percentile model-update CPU time | 22.24 ms |
| Maximum individual raw Yjs movement update | 71 bytes |
| Total raw movement updates | 7,098 bytes |
| Final encoded room document including seed/history | 766,017 bytes |

These are a model benchmark, not end-to-end drag latency, browser rendering performance, actual WebSocket/TLS byte totals or an internet reliability measurement. JSON envelopes/base64 add overhead. The editor adapter still examines the current plan to derive deltas; profile and optimize this at realistic upper sizes before a general release.

## Remaining release gates

1. **Media transfer:** backgrounds, storyboard images and custom asset files are deliberately unsupported and rejected in the preview. Implement a separate validated, content-addressed asset channel; do not put large blobs into each drag or the CRDT.
2. **Actual networks/devices:** test home Wi-Fi versus mobile data, restrictive networks, mobile sleep and browser engines. These were unavailable here. WebRTC was compared architecturally, not experimentally.
3. **Public infrastructure:** select a relay host/domain, TLS proxy, public-service abuse controls, operating budget and monitoring. Browser-origin checks are not strong user authentication. A secret-bearing WebSocket path must not enter proxy access logs.
4. **Creative conflict UX:** the same-field policy is deterministic Yjs resolution, not guaranteed last-completed-gesture ordering. Reconnection warns that concurrent work needs review. Larger crews may need a conflict comparison/fork UI or soft edit claims.
5. **Durability:** the relay's RAM expires after 15 idle minutes and disappears on restart. Browser storage can fail or be cleared. Relay acknowledgment proves receipt, not another participant's durable save. Portable export remains essential.
6. **Scope:** the preview shares one plan. Other production modules are local, and collaboration Undo covers shared edits. It does not implement accounts, read-only invitations, revocation, end-to-end encryption or a guaranteed project archive.

The [v3 plan](collaboration-plan-v3.md) provides the run instructions and phased release gates. The original supplied v2 document has not been modified.
