# Response to the external review — 2026-08-23

An outside reviewer read the pushed state and `docs/handover-2026-08-23.md` and
listed eight things it thought the handover might not surface. This is the
result of checking each one against the code, not a restatement of the list.

Two of them were right and actionable, and are fixed in this session. Three are
real and open. Two are correctly deferred, not debt. One is not mine to decide.

Verdicts use: **confirmed** (true, acted on), **open** (true, not acted on),
**deferred** (true but correctly not-now), **decision** (needs the owner).

---

## 1. `FloorPlanContext` is still too large — **open, but not the worst one**

4,152 lines, above the 1,200-line "split it" line in `AGENTS.md`. True.

But the reviewer's framing — extract domain commands opportunistically when
touching related code — is already the established practice here, and it is
working: `domain/plan/setupWrite.ts`, `domain/integrity.ts`, `domain/reports/`,
`domain/sun/` and now `domain/plan/translate.ts` all came out of the context or
the canvas that way. The context is large because it is genuinely the whole
application's state, and the parts that were pure logic have mostly left.

I did not treat this as the priority, because two components are in worse shape
and have a clearer seam. See the next point.

## 2. `FloorPlanCanvas` and `EquipmentPanel` decomposition debt — **confirmed, and worse than the handover implied**

The handover named only `InspectorPanel`. That was the wrong file to single out.

| File | Lines | Top-level components in it |
| --- | --- | --- |
| `InspectorPanel.tsx` | 4,636 | 1 (a switch over twelve inspectors) |
| `FloorPlanCanvas.tsx` | 3,342 | **1** |
| `EquipmentPanel.tsx` | 2,653 | **1** |

`InspectorPanel` is twelve inspectors in a switch — an obvious seam, already
being cut (`LightInspector` is out). `FloorPlanCanvas` and `EquipmentPanel` are
each a *single function body* of 2,600–3,300 lines. That is the harder problem,
and the handover did not mention either.

`FloorPlanCanvas` has its seam already written into it as comments — fifteen
numbered render layers ("3. Props, Furniture, Rigs…", "4. Lighting Beams &
Fixtures", "8. Actors & Blocking Waypoints"). One of them, `PropsLayer.tsx`, is
already extracted. Continuing along the numbers is mechanical, not speculative.
That is the recommendation, not a rewrite.

## 3. The `any` escapes deserve a reduction plan — **confirmed and fixed as a class**

The most useful item on the list. 76 of the 146 `no-explicit-any` warnings were
in `FloorPlanCanvas`, and they were **one cause**, not seventy:

`updateElement` took `Partial<FloorPlanElement>`. Over a union that distributes
to `Partial<ActorElement> | Partial<CameraElement> | …`, so `{ path: [...] }`
matches no single member and every caller wrote `as any` to get past it. Each
one is a place where a misspelled key writes a junk property straight into
persisted project state with nothing to complain.

Fixed by `ElementPatch` (`src/types/index.ts`), which flattens the union — every
key any element declares, optional, with that key's real value type — plus
`src/domain/plan/translate.ts` for the geometry the casts were hiding.

- `as any` in `FloorPlanCanvas`: 71 → 25
- `no-explicit-any` warnings overall: 146 → 96

**Two defects the types surfaced, which is the actual argument for doing this:**

- **Arrow-key nudge left movement paths behind.** Dragging an element has always
  translated its `path`; the keyboard nudge, in the same file, translated
  `x`/`y` and `x2`/`y2` but not `path`. Arrowing an actor across the plan left
  its blocking beats standing where they were.
- **A hand-rolled `cable-wp-${Date.now()}-${random}` waypoint id** — the one site
  the previous audit's rule-16 sweep missed. Two handles created in the same
  millisecond collide, breaking React keys and drag targeting.

The remaining 96 are read-side narrowing, spread thin across eleven files. They
are worth taking opportunistically, not in a sweep — there is no second single
cause behind them.

## 4. Asset Library / symbol audit is not complete — **deferred, correctly**

True and explicitly true: `IMPLEMENTATION_PLAN.md` §43 defines a twelve-point
per-symbol checklist (KEEP / MINOR / FULL / REMOVE, clarity at 25/50/100/200 %,
theme, print, keywords, connector ports), and the batch gate says in as many
words *"Do not close the icon/asset workstream merely because the registry
infrastructure exists."*

The registry holds ~80 symbols with search keywords. Nothing records that the
per-symbol audit was performed on any of them.

But this is a **design workstream running in parallel**, not technical debt and
not a correctness risk. Nothing regresses while it is open. Treating it as
blocking would be reading the plan backwards.

## 5. End-to-end fixtures for the four QA scenarios — **open, and the strongest remaining item**

`IMPLEMENTATION_PLAN.md` §44 requires four representative test projects:
narrative, concert, broadcast, and simple floor-plan-only — the last with
*"This scenario must always remain supported."*

**Only the narrative one exists.** There are two setup templates
(`setup-dialogue-classic`, `setup-noir-interrogation`), both narrative. There is
no concert fixture, no broadcast fixture, no floor-plan-only fixture, and no
test that exercises the derived reports over a project that has no script.

This is not theoretical. The highest-severity bug of the last session was
exactly this shape: call sheets listed no cast unless *screenplay scenes* were
scheduled, so the script-optional path — the one the app exists to support —
printed "No cast scheduled" while the actors stood on the plan. A concert
fixture run through the call-sheet builder would have failed on day one.

Recommended as the next substantial piece of work: fixture projects per §44,
exercised through the real report builders (call sheet, DOOD, stripboard,
equipment list, power, cable, export selectors). Domain-level, no browser
needed, and it closes a whole class rather than one report.

## 6. Browser-level acceptance coverage — **open, with a caveat about how**

Literally true: all 820 tests are unit/domain (vitest + jsdom + fake-indexeddb).
There is no Playwright, no testing-library, and no test that opens the app.
Mouse, keyboard, touch, save/reload, print, PNG export and the static-build path
have no automated coverage at that level.

Worth qualifying two ways:

- The project already has a no-dependency browser-automation idiom:
  `scripts/capture-screenshots.mjs` drives installed Chrome over CDP, and its
  print-media emulation is what caught the stylesheet bug that was hiding the
  masthead on eight documents. A smoke script in that idiom fits the codebase
  and adds no dependency; adding a full E2E runner to a static-build project is
  a bigger call than it looks.
- Item 5 above buys more per hour of work. Most of the recent real bugs were
  wrong *derivations*, which a fixture catches deterministically, not wrong
  *event plumbing*, which is what a browser test catches.

So: agreed it is a gap, disagreed that it is the first thing to close.

## 7. The fixture-snapshot licensing mismatch — **decision, and sharper than "documentation"**

The reviewer says resolve it rather than note it. Agreed that it should be
resolved — but this is not a documentation edit, and it is not mine to make
(`AGENTS.md` rule 32: agents must not silently choose or change a license).

What is actually true, which is worse than the audit recorded:

- `src/generated/fixture-db.json` is committed, 1.23 MB, 629 fixtures.
- Its manifest records `"license": "CDDL-1.0 (see OFL repo)"`.
- That string is a **hardcoded literal in `scripts/build-fixture-db.ts:56`**. It
  is not read from the OFL export, not verified against it, and no per-fixture
  attribution is retained from the source data.
- The project's own baseline is **GPL-3.0** (`AGENTS.md`). CDDL-1.0 and GPL are
  the textbook incompatible pair for a combined work.

So rule 35 ("externally sourced snapshots record source, version/date,
attribution/license") is satisfied in form and not in substance: the recorded
license is an assertion nobody checked, and if the assertion is right it
conflicts with the project's own license.

**This needs the owner to decide**, and it is a real question, not paperwork:
verify what OFL actually licenses its fixture data under, then either keep the
snapshot with correct attribution, or stop committing it and generate on demand.
I have deliberately changed nothing here.

## 8. Remaining duplicate representations — **open, two concrete ones**

The reviewer asked in general; here are the specific ones, since a general
answer is not actionable.

1. **`project.director` / `project.cinematographer` versus `people`.** The
   people list is canonical, but two legacy project fields are *mirrored on
   every change* so the exports keep rendering (`ContactsPanel.tsx:249`). A
   genuine dual write. The panel already surfaces "typed directly into the
   project details and not yet linked", which is honest but is the symptom.
2. **`shot.storyboardImage` / `storyboardImageEnd` versus `storyboardFrames`.**
   Frames keyed by waypoint id are canonical; the two flat fields are legacy
   mirrors that `storyboardFrames.ts` folds back in and `ViewfinderModal` keeps
   writing ("legacy mirrors included", line 383).

The second one is best retired *together* with moving storyboard images into the
asset store — which is already the other unstarted in-flight item, and is the
larger of the two problems: those images are base64 JPEGs living directly in
project state, so they are duplicated into every undo snapshot and every clone,
against rule 26.

A third — two incompatible `path` shapes (`Waypoint[]` and `CablePathPoint[]`)
behind one field name — is now explicit rather than duplicated: see
`domain/plan/translate.ts`. Keeping them distinct is deliberate; a cable handle
has no beat, and merging them would write a meaningless number into saved data.

---

## What I did with this, and why

Finished the in-flight breakdown tagging UI first, as instructed, then took
item 3 — because it was the one where a single type change fixed the whole
class, and because it turned up two live defects on the way.

Left alone: the licensing question (owner's call), the symbol audit (a parallel
design batch), and any decomposition of `FloorPlanCanvas` or `EquipmentPanel`
(real, but a 3,000-line split is exactly the speculative rewrite worth *not*
starting at the end of a session).

Next, in my order: §44 scenario fixtures → storyboard images to the asset store
(taking the legacy mirror with them) → canvas layer extraction along the
numbered comments → the 115 unlabelled inputs.
