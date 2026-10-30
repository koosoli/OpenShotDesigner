# Collaboration security review and hardening

30 October 2026 · Local implementation on `codex/floorplan-collaboration`.

**Current default:** account-free WebRTC is now documented in [v4](collaboration-plan-v4.md) and its [direct-transport security audit](collaboration-direct-security-2026-10-30.md). This document's operator/Node-relay requirements apply to the optional private relay, not ordinary session starters.

**Later follow-up:** the [second detailed audit](collaboration-second-audit-2026-10-30.md) records additional corrected lifecycle/data-integrity/availability findings and supersedes the verification counts below.

**The initial preview was not suitable for anonymous public exposure. This pass adds concrete safeguards and regression tests. It is not a security certification or a claim that deployment, browsers and dependencies can never have vulnerabilities.** No public host has been provisioned and nothing has been pushed or deployed.

## Scope and trust

Reviewed the newly introduced invitation parsing, room initialization, shared-state projection, editor rendering inputs, browser persistence boundary, WebSocket transport, relay admission and resource use, runtime dependencies, and production script policy. The entire pre-existing production-planning application is not claimed to have received a complete independent penetration test.

The threat model includes an internet caller who can forge an Origin header, a malicious or leaked-link participant, a tampered invitation, corrupt/malicious synchronization data, a hostile relay selected during local development, and resource-exhaustion attempts. Local malware, a compromised browser extension, a compromised build/repository, or a fully compromised operator host remain outside the protection a collaboration adapter can provide.

## Findings and changes

| Finding in the first preview | Implemented protection |
| --- | --- |
| An allowed Origin could be forged by a non-browser caller; public room creation had no separate authorization | Public operation now requires a **room-creation key** and a separate **server signing key**. The creation API checks its bearer authorization; WebSocket admission verifies a room-bound signed ticket before returning any plan data. |
| Arbitrary invitation endpoints could send a public visitor to an attacker's relay | Public pages accept only the operator-configured `VITE_COLLAB_RELAY_URL`. Without this configuration collaboration fails closed. Loopback development retains explicit endpoint selection for testing. Public pages also reject unsigned invitations and loopback destinations. |
| Invitations had no expiration | Public tickets expire within **24 hours**. Room changes cannot extend or forge a signature. Expired tickets cannot join, submit changes or receive broadcasts; expiration also stops browser reconnect attempts. |
| Message limits alone did not constrain connection/room/control-frame floods | Added global/per-IP connection limits, handshake/data/control-frame limits, fragment/buffer limits, a bounded limiter table, bounded queues, slow-receiver handling, a total retained-state budget and short HTTP/header timeouts. Automatic Pong buffering is disabled; bounded control-frame handlers answer legitimate pings. Forwarding headers are ignored unless one exact immediate proxy is explicitly trusted. |
| Binary decoding ran on the relay event loop and the editor UI thread | The relay stages binary updates in a reusable worker with a **1-second processing deadline** and a **128 MiB V8 old-generation limit**. The browser stages incoming binary data in a worker with a **1.5-second deadline**. Invalid updates never enter the accepted server snapshot. |
| General JSON checks did not fully constrain editor field types or record assembly | Added closed runtime schemas generated from the editor's TypeScript interfaces. Prototype keys, identity/pose smuggling, unknown roots/fields, nested shared types, pending dependency garbage, excessive complexity, malformed paths and unsafe paint values are rejected before projection/renderer use. |
| Local documents could have been confused with remote seed metadata | Seed identity and allowed document fields are now restricted. Each participant still gets a separate local library ID; the original production is neither seeded by a guest nor sent to a relay just because an invite was opened. |
| High traffic could grow queues or create reconnect storms | A client sends one unacknowledged update at a time, coalesces further edits, bounds incoming work and uses exponential reconnect backoff with jitter. On a fatal error the visible project stays local and exportable. |
| Script injection lacked a separate browser policy | Production HTML now contains a CSP: scripts are limited to the application origin, the existing Google sign-in loader, and build-hashed startup code. Arbitrary inline JavaScript and JavaScript eval are blocked. A no-referrer policy is added. |
| The complete dependency audit had three development-tool advisories | Applied three compatible transitive updates (`brace-expansion`, `js-yaml`, `undici`). The complete current `npm audit`, including development dependencies, reports **zero vulnerabilities**. This is a scanner result at this date, not a guarantee against unknown issues. |

The SVG markup inserted by existing canvas renderers is taken from the application's curated symbol registry, not from peer-supplied SVG. Peer labels remain React text. Runtime schema validation rejects attempts to introduce arbitrary renderer fields or external SVG paint references. Background/media transfer remains disabled for this preview.

## Public operation is explicit

Local development still defaults to `127.0.0.1` and local browser origins. Without protected configuration the relay refuses non-loopback binding and non-loopback browser origins. Origins are an additional browser boundary, **not the authentication mechanism**.

A public setup requires all of the following:

1. Generate **two different cryptographically random 32-byte keys**, represented as 64 hex characters. Keep both in the server's secret store. Give the creation key only to people allowed to create sessions; never distribute the signing key to clients.
2. Configure the relay process with `COLLAB_CREATE_KEY`, `COLLAB_SIGNING_KEY` and the exact HTTPS `COLLAB_ORIGINS` value. The application origin is `https://koosoli.github.io`, not a path wildcard.
3. Keep the backend on loopback or an isolated container network, behind a tested **HTTPS/WSS proxy**. Do not expose the backend's plaintext HTTP port to the internet. A non-root service account, a read-only application deployment and OS/container resource limits are still required operational defenses.
4. Only if the immediate proxy overwrites `X-Forwarded-For` with its actual client address, set `COLLAB_TRUSTED_PROXY` to that proxy's exact IP. Chained/appended or arbitrary forwarding headers are rejected in this mode. Otherwise leave this unset and configure rate limits at the proxy as well.
5. Build the static frontend with the public, non-secret `VITE_COLLAB_RELAY_URL` pointing at that exact WSS endpoint. **Never prefix either server secret with `VITE_` or put it into the frontend bundle.**
6. Do not log WebSocket request paths, Authorization headers, WebSocket subprotocol headers, invitations or project payloads. TLS termination/proxy access logs can otherwise disclose bearer credentials even though the application itself does not log them.
7. Use a maintained, patched Node runtime, restrict ingress, monitor rejected traffic/resource use without recording credentials, and test the actual TLS/proxy setup before publication.

Example configuration shape (placeholders must come from a secret store; do not paste these strings as real keys):

```powershell
# Relay process:
$env:COLLAB_HOST = '127.0.0.1'
$env:COLLAB_ORIGINS = 'https://koosoli.github.io'
$env:COLLAB_CREATE_KEY = '<64 hex characters from a secure secret store>'
$env:COLLAB_SIGNING_KEY = '<a different 64-character hex secret>'
# Set only when the immediate proxy is explicitly configured as described above:
# $env:COLLAB_TRUSTED_PROXY = '127.0.0.1'
npm run collaboration:relay

# Separate frontend build process. This endpoint is public configuration:
$env:VITE_COLLAB_RELAY_URL = 'wss://collaboration.your-domain.example'
$env:GH_PAGES = 'true'
npm run build
```

This is a configuration guide, not a deployed or externally verified TLS setup. The relay currently runs from TypeScript using the repository's `tsx` loader; install the full locked dependency tree with `npm ci`, or provide a reviewed compiled-server build. `npm ci --omit=dev` alone does not install that loader.

## Limits and what they mean

- Six members per room, 32 retained rooms by default, 64 live WebSockets overall and 12 per resolved client IP. Total retained room snapshots are limited to 64 MiB.
- Plans/history are limited to 2 MiB and 2,000 project records. The relay accepts at most 3 MiB per encoded WebSocket message, with compression disabled. A peer may have only one update under validation. Global queued input is capped at 16 MiB; the validation worker has its own bounded queue.
- Handshakes: 60 per IP/minute and 300 globally/10 seconds. Additional message/count/byte limits apply to connections, client IPs and the relay. Ping/Pong frames have separate limits (20 per connection, 120 per IP and 500 globally per 10 seconds). Messages are also limited to 1,024 fragments and 4,096 buffered input chunks. Users behind one NAT share its IP limit; network/proxy load testing remains necessary.
- Ordinary disconnects retain room snapshots in RAM for 15 idle minutes. Tickets expire independently, within 24 hours. A server restart drops RAM; browser copies and portable exports remain important.

Worker threads are **not an OS sandbox**. Node's V8 resource limit does not cover every external allocation, and a browser cannot enforce an absolute per-worker heap limit. Payload/complexity caps, a trusted relay, maintained libraries and process/container limits remain necessary. The browser WebSocket API also does not expose a pre-allocation maximum for a frame delivered by a fully compromised trusted relay; endpoint pinning avoids treating arbitrary invitation hosts as trusted infrastructure.

## Verification

- Full suite: **2,916 tests in 247 files passed** after hardening.
- Collaboration tests: **50 passed**, including **33 security regression cases** in `security.test.ts`.
- **Eight real Chromium cases passed** against the Pages-path production build, verifying protected creation, creation-key separation, signed guest access, malicious-relay rejection without disclosing/replacing an unrelated project, text escaping, production CSP enforcement, public-host fail-closed behavior and PDF compatibility alongside concurrency/offline/refresh/export. The existing service-worker offline-reload case also passed with the new production policy.
- TypeScript, ESLint and encoding checks pass; the production Pages build passes the entry bundle budget. The production worker is a separate generated asset, covered by the same-origin worker policy.
- Current full dependency audit: **0 reported vulnerabilities**. Three transitive advisories were fixed without a major dependency migration.

Attack cases include reserved/prototype keys, pose identity smuggling, hidden seed fields, existing-local-project IDs, malformed paths, excessive nesting, nested Yjs types/unknown roots, SVG URL paints including escapes, corrupt binary input, missing/forged/cross-room/expired tickets, forged Origin and forwarding headers, denied room/global/IP limits, oversized frames, bursts during validation and room isolation. Tests use fixed fixture keys only; no real deployment secrets are committed or generated for sharing.

The 1,000-object model benchmark after stricter validation observed 18.63 ms median / 23.31 ms p95 per model update; raw movement updates remain at most 71 bytes in that fixture. This is not an internet-latency or whole-editor rendering guarantee. Resource caps can deliberately reject overloaded sessions while preserving their local copies.

## Remaining security and release gates

- Validate real devices/networks and the actual public proxy/TLS/firewall configuration. No public endpoint has been tested or approved here.
- A valid invitation is still a **bearer credential**. Every holder may edit/copy the room. Expiration limits lifetime, but there is no per-user identity, individual participant revocation or read-only role. Leave does not revoke other people's links. Signing-key rotation/restart invalidates existing public tickets globally; it is not selective revocation.
- The relay sees plaintext project contents after TLS termination. End-to-end encryption is not implemented. Avoid treating this preview as a confidential cloud archive.
- Larger floors, mobile sleep, denial-of-service beyond one process/network capacity, independent penetration testing and an operator recovery/load exercise remain open. No application can guarantee immunity to every future browser/library/host vulnerability.

The controls follow the relevant principles in the [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html): explicit admission, origin checks, bounded input/traffic and credential-safe handling. For worker-limit scope, see the [Node worker_threads documentation](https://nodejs.org/api/worker_threads.html). Test findings above are observations of this implementation, not third-party certification.
