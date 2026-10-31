# Whole-production collaboration — 1.7.0

New sessions share the saved production, including its screenplay and
preproduction modules. The original stays in the browser's project library.
The static GitHub Pages app still needs no participant installation, account,
hosting setup or connection configuration.

## Start and compatibility

Open **Collaborate → Start collaboration → Copy invite link**. Guests open
the complete link, choose **Join session**, and confirm **Join shared project?**.
Images and file attachments are omitted automatically; there is no longer a
checkbox to enable omission.

After updating from 1.6.x, **leave the old session, open the original full
production from All projects, and start a new session from it**. The old shared
copy never contained the previously excluded modules and cannot recover them.
Existing invitations retain their original single-plan scope. The new app can
read those rooms, but cannot change their immutable seed into another protocol.
All participants in a production session should use 1.7.0 or later. A privately
operated relay also needs the updated application/validator; the default direct
mode needs no operator action.

## Shared and personal data

| Data | Behaviour |
| --- | --- |
| Screenplay, AV script, title page, writing styles/notes/bookmarks/alternates, revisions and scene numbering | Shared |
| All scene setups, geometry, blocking, shots, script linings, groups, layers and custom equipment metadata | Shared |
| Crew, cast, contacts and their private fields, rates, locations and scout text | Shared |
| Schedule, calendar, call-sheet inputs, reports, continuity, coverage and production segments | Shared |
| Budget inputs/actuals, task boards, logistics, power, rigging, review comments and other saved project fields | Shared; derived reports are recomputed by the existing app |
| Named milestone snapshots | Shared after the same media filtering; nested revision histories are rejected |
| Logos, headshots, backgrounds, storyboard frames, AV images, scout photos, mood-board image files, map images and custom fixture/geometry files | Excluded from synchronization |
| Image-linked frame layout/content | Remains with the attachment; mood-board captions and scout metadata remain structured data |
| Library identity, save timestamp, selected scene, per-scene zoom/pan/playback and browser UI preferences | Personal |

New attachments added during a session remain in that browser's local shared
copy. Adding one does not stop synchronization. Incoming production changes
preserve local attachments for surviving records; deleting a record still
deletes that record from the shared production. New participants cannot recover
another browser's attachment bytes. Export an `.osd` package to transfer media.

Anyone with the invitation can read, edit and retain **all shared production
data**, including personal contact fields and budgets. The Start panel and Join
dialog explain that scope. Transport encryption does not hide information from
an invited participant. Individual revocation and read-only roles are still
outside this preview.

## Merge behaviour

The production protocol uses bounded Yjs map entries with canonical paths and
stable record IDs. Independent records and fields merge, concurrent record
insertions survive, and deletion wins over an offline edit to a deleted record.
Plan transforms remain atomic. Screenplay paragraph text, formatting and
anchored notes also form one atomic value, preserving valid text offsets.

This is **not character-level collaborative text editing**. Simultaneous edits
to the same paragraph resolve to one complete paragraph according to Yjs's
deterministic conflict order. Primitive lists and other fields without stable
record IDs are atomic values too. Review overlapping edits and retain backups.
Undo targets local transactions and does not undo another participant's
independent changes. Scene selection and navigation do not move another user.

Required references are reconciled after closed type validation: deleted plan
objects cannot leave live camera/shot/group links, deleted script lines cannot
leave active linings, and schedules/cast assignments/takes are checked against
the surviving records. Invalid resulting productions are rejected before render;
the local copy remains exportable if a session stops.

## Security review and limits

- The transport and its encrypted discovery boundary are unchanged. Public
  discovery services receive connection messages, not production JSON.
- New immutable room headers identify production protocol 2. Old plan seeds
  retain their original decoder and validation rules. Seed replacement remains
  forbidden.
- Runtime schemas are generated from the editor's **Project, SceneSetup and
  ScriptLine** types, including nested module types. Closed schemas reject
  unknown fields, invalid arrays and malformed nested records before repair or
  rendering. Recursive revision/omitted-script types use bounded references.
- Canonical path parsing rejects prototype keys, duplicate identities, invalid
  record orders, oversized paths and invalid atomic pose/paragraph fields.
  Trie allocation is bounded independently, including unused paths.
- Media filtering is a **local outgoing operation**. Incoming documents never
  use it to silently accept media: their asset/image fields are rejected before
  application. Local attachment preservation uses explicit typed fields only.
- Literal HTTP(S) website/reference text is accepted in production data;
  executable, blob, inline-data and file URI payloads remain prohibited. Large
  screenplay source has its own bounded text allowance. Monetary `amount`
  fields permit finite values up to 10¹²; other numeric limits are unchanged.
- Existing limits remain **2 MiB of CRDT state/history**, 2,000 plan objects per
  setup, six participants, 50,000 wire fields and 100,000 JSON/trie nodes.
  Production JSON depth is capped at 32, at most 100 setups are accepted, and
  worker deadlines, transport queues, size/rate checks and replay guards remain.
  Export and start a fresh session when synchronization history reaches its cap.
- A 1,000-object plan and a 5,000-paragraph script each fit below the existing
  2 MiB limit in the model benchmark. These are scale samples, not a latency
  guarantee for every production, device or network.

Regression coverage includes whole-sample-production round trips, media removal
across modules and snapshots, preservation of originals/local attachments,
offline paragraph and crew/schedule changes, insert/delete conflicts, text/style
atomicity, local undo, personal navigation and project-reference remapping.
Attack cases cover prototype paths, malformed module values, unexpected fields,
remote media injection and unsafe URLs. Real-browser journeys exercise both
directions of script editing, crew updates, budget settings, task boards,
scene creation and reload/rejoin over browser WebRTC channels.

The [direct-transport audit](collaboration-direct-security-2026-10-30.md) still
applies to discovery, encryption and network limitations; its single-plan data
scope is superseded here. Public-service availability and NAT/firewall
reachability remain external constraints. This review is not an independent
penetration-test certification.
