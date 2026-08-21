# Open Shot Designer — vNext Implementation Plan

> **Status:** Reviewed master plan — checked against the full product discussion on 2026-08-21  
> **Purpose:** Repository-level source of truth for human developers and AI coding agents.  
> **Branding:** Rebrand intentionally deferred. The architecture must remain product-name-neutral so branding can be changed later without touching domain logic or persisted project schemas.  
> **Core direction:** Modular, local-first production planning suite with optional self-hosted collaboration.  
> **Critical principle:** A screenplay is optional. The software must work just as well for a concert, broadcast, commercial, interview, live event, studio shoot, photo shoot, or a standalone floor plan.  
> **Implementation rule:** Preserve today's useful workflows while progressively replacing legacy architectural constraints; do not perform a big-bang rewrite.

## How to use this document

This is the **master product/architecture plan**, not a requirement that every coding agent read 3,000+ lines before touching one file.

Recommended agent workflow:

1. Read Sections **1–5** for product philosophy, non-negotiable rules, core entities and storage boundaries.
2. Read the section for the assigned workstream.
3. Read Sections **39–44** for agent coordination, dependencies, milestone gates and QA expectations.
4. Read the relevant rows in the traceability checklist.
5. Implement only the assigned slice and link the PR/task back to the applicable section(s).

A shorter `AGENTS.md` should be generated from the locked rules in this document and kept synchronized with them.

### Section map

```text
1–5    Product philosophy, rules, core model, storage/collaboration boundaries
6–11   Canvas, asset library, architecture, concert, broadcast, truss
12–16  Script, locations, scheduling, production day, call sheets
17–24  Fixtures, DMX, connections, cable, signal, power, rigging, logistics
25–34  Mood boards and collaboration
35–38  Future operational modules and reusable templates
39–44  Agent execution, dependencies, gates, risk, QA
45–49  Deployment contract, philosophy, decisions, traceability
```

---

# 1. Product Vision

Open Shot Designer should evolve from a shot/floor-plan tool into a modular production planning suite in which all production data can connect without forcing the user into one workflow.

The same project model should support:

- Narrative film
- Documentary
- Commercial
- Music video
- Concert filming
- Broadcast / OB
- Studio production
- Live events
- Interviews
- Photo shoots
- Technical floor plans without any script

The system should connect:

```text
Project
├── People
├── Locations / Venues
├── Plans
├── Setups
├── Shots / Cues
├── Production Days
├── Equipment
├── Assets
│
├── Optional Script
│   ├── Script Scenes
│   ├── Characters
│   └── Breakdown
│
└── Optional Live Production
    └── Run-of-Show Cues
```

The long-term workflow should allow:

```text
Script / Venue / Brief
        ↓
Locations & Plans
        ↓
Setups / Stage / Camera Positions
        ↓
Shots / Cues / Coverage
        ↓
Schedule / Production Days
        ↓
Call Sheets / Crew Sheets
        ↓
Equipment / Fixtures
        ↓
DMX / Power / Cables / Signal / Rigging
        ↓
Logistics
        ↓
Shoot-Day / Show-Day Tracking
```

Everything is optional, but everything should be able to talk to everything else.

## 1.1 Product module families

As the suite expands, avoid turning the right panel/navigation into a flat list of unrelated tabs.

Group capabilities under six conceptual families:

| Family | Includes |
|---|---|
| **Plan** | Floor plans, blocking, locations/venues, stage/compound design, annotations |
| **Create** | Script, AV script, breakdown, shots, storyboard, mood boards |
| **Schedule** | Production days, stripboard, Run of Show, call/crew sheets, on-set/show-day |
| **Technical** | Equipment, lighting, fixtures, DMX, cable, signal, power, rigging |
| **Logistics** | Cases, racks, carts, weight, volume, vehicles, load-in/out |
| **Collaborate** | Sharing, comments, presence, permissions, revisions/activity |

These are information-architecture families, **not separate databases**.

The UI may surface them as grouped navigation, workspaces or contextual tools; exact navigation design can evolve.

The important rule is:

> Adding a new module should not require adding another permanently visible top-level tab for every user.

## 1.2 Workspace presets, not separate applications

The suite should support project/workspace presets that configure which modules are visible by default without changing what the underlying project is allowed to contain.

Initial presets should include:

```text
Blank Floor Plan
Shot Planning / Blocking
Narrative Film
Documentary
Commercial / AV Script
Interview
Concert / Live Event
Broadcast / OB
Studio Production
Photo Shoot
Custom
```

Examples:

**Shot Planning / Blocking** preserves the current fast workflow:

```text
Plan
Shots
Storyboard
Equipment
Inspector
Export
```

It may bootstrap Camera A + Actor A + Shot 1, matching the current quick-start experience, without requiring a screenplay.

**Narrative Film** may show:

```text
Script
Breakdown
Plans
Shots
Storyboard
Schedule
Call Sheets
Equipment
```

**Concert / Live Event** may show:

```text
Venue
Stage / Plan
Cameras
Run of Show
Lighting
DMX
Power
Cables / Signal
Rigging
Logistics
Production Day
```

**Blank Floor Plan** may show only:

```text
Plan
Inspector
Assets
Annotations
Export
```

A user must be able to enable or hide modules later. Presets are UX/workspace configuration, **not hard data-model restrictions**.

Suggested concept:

```ts
interface WorkspaceProfile {
  preset:
    | "blank"
    | "shot_planning"
    | "narrative"
    | "documentary"
    | "commercial"
    | "interview"
    | "concert"
    | "broadcast"
    | "studio"
    | "photo"
    | "custom";

  enabledModules: ModuleId[];
}
```

No persisted entity should become invalid merely because its module is hidden.

---

# 2. Non-Negotiable Architectural Rules

These rules should also be copied into a repository-level `AGENTS.md`.

1. **No feature may require a screenplay unless it is explicitly a script feature.**
2. **No core feature may require the collaboration server.**
3. The static standalone build must remain functional, including GitHub Pages where technically possible.
4. Business/domain calculations must live outside React components.
5. Avoid adding new `any` types.
6. Every persistent schema change requires a migration.
7. Every important domain calculation requires unit tests.
8. Existing saved projects/imports must continue to load.
9. UI must support mouse and touch where appropriate.
10. Stylus/Pencil support must use the same canvas architecture rather than a separate app mode.
11. Do not create one-off SVG production symbols inside random components.
12. All production-plan symbols go through the shared Asset Library.
13. Missing technical data must remain `unknown`; never silently replace it with `0`.
14. Store technical quantities in explicit canonical units and convert only for display/export; never mix implicit metric/imperial values.
15. Rigging and electrical calculations are planning aids, not engineering or safety certification.
16. Every persistent entity must use globally unique IDs.
17. Heavy binary assets must not be embedded directly inside collaborative project state.
18. Collaboration must be considered when designing new data structures, even before the sync server exists.
19. Offline work must remain possible.
20. Rebranding must be a presentation/configuration concern, not a domain-model concern.
21. Avoid giant cross-domain context objects.
22. The collaboration framework must be ours/self-hostable; do not make Firebase, Supabase, or another hosted SaaS a required dependency.
23. Persistent project state and ephemeral presence state must be separate.
24. Collaborative undo/redo must never accidentally undo another user's remote changes.
25. Project data should be partitionable into sensible collaboration documents; do not assume one giant CRDT document.
26. Assets must be referenced by IDs/metadata, not embedded as base64 inside the main project state.
27. Technical source data must preserve provenance/version metadata where practical.
28. Never infer fixture power from arbitrary numbers found in a model name (for example, model numbers are not wattage).
29. External image/content integrations must use explicit provider adapters and respect source attribution/licensing; do not scrape third-party libraries.
30. Static/standalone mode must degrade gracefully when online providers are unavailable.
31. New dependencies require a short written justification in the PR/task notes; preserve the intentionally lean frontend where reasonable.
32. Agents must not silently choose or change the product license, brand name, CRDT library, backend stack, drag/drop library, or authentication strategy.
33. High-frequency collaboration data (cursor movement, viewport, live selection) must never be persisted into normal project history.
34. Local-first collaboration must tolerate temporary network loss and reconcile after reconnect.
35. Every externally sourced database snapshot must record source, version/date, and applicable attribution/license information.
36. The plan/canvas engine must remain usable without script, schedule, equipment, accounts, or server connectivity.
37. Reports, manifests and generated paperwork should derive from canonical project data; store explicit overrides/snapshots, not hidden duplicate copies.
38. Persistent local preferences, local session-only UI state, shared project state and broadcast presence must remain distinct.
---

## 2.1 Current Repository Baseline

This plan is based on the current codebase and must be updated when major architecture changes land.

Current important characteristics:

```text
React + Vite + TypeScript
Very small dependency footprint
Current package metadata declares GPL-3.0
Browser-local project library
localStorage project persistence
Large FloorPlanContext spanning many domains
No dedicated automated test runner yet
No collaboration backend
No IndexedDB persistence layer yet
No CRDT/local-first sync layer yet
Existing screenplay parser and lined-script workflow
Existing shot/camera synchronization
Existing equipment panel
Existing cable plan elements
Existing basic power planning
Existing basic DMX patching
Existing GitHub Pages deployment
```

Known architectural pressure points that motivated this plan:

- `FloorPlanContext` has become a broad cross-domain context and should be decomposed gradually.
- Project/asset persistence needs to move beyond `localStorage`, especially for storyboard/reference media.
- IDs are currently generated in multiple places and need a single strategy.
- Current DMX channel footprints are generic fixture-type guesses rather than exact fixture-mode data.
- Current DMX allocation logic needs boundary/gap tests before real production use.
- Current power estimation must stop relying on generic/model-number heuristics when authoritative fixture data exists.
- The current `SceneSetup` concept conflates screenplay scene, physical location and coverage setup; those concepts need to be separated before scheduling and collaboration expand.
- Current repository/package licensing is GPL-3.0. The future business/licensing direction is deferred, but implementation agents must not alter licensing or remove notices without a separate explicit decision/legal review.

---

# 3. Phase 0 — Stabilize the Existing Application

> **Terminology:** The Phase sections below describe logical capability/dependency stages. Section 41's **Implementation Batches** are the recommended practical sequencing for parallel AI/human development. When the two differ, dependency gates and Implementation Batches control execution order.

Do this before major new feature work.

## 3.1 Central ID system

Replace ad-hoc ID generation with a shared ID utility.

Example:

```ts
createId("shot")
createId("camera")
createId("setup")
createId("location")
createId("asset")
createId("fixture")
```

Preferred underlying implementation:

```ts
crypto.randomUUID()
```

with a safe fallback if required.

### Required fix

Duplicating a setup must regenerate nested IDs and remap all internal references.

A deep-clone/remap operation must handle:

- Setup IDs
- Shot IDs
- Camera IDs
- Actor IDs
- Light IDs
- Prop IDs
- Cable IDs
- Script lines
- Script marks
- AV script rows
- Storyboard/frame references
- Element references
- Subject references
- Parent/group references
- Future port/connection references

### Acceptance criteria

- Duplicate a complex setup.
- No duplicated persistent IDs remain.
- All links inside the duplicate point to duplicated entities, not originals.
- Project-wide lookups cannot collide.

---

## 3.2 Project schema versioning

Every saved project must contain:

```ts
interface Project {
  schemaVersion: number;
  id: string;
  ...
}
```

Add:

```text
src/domain/migrations/
  index.ts
  v1-to-v2.ts
  v2-to-v3.ts
  ...
```

### Requirements

- Migrations are deterministic.
- Old project JSON imports still load.
- Migration failures produce a useful error.
- Keep migration fixture files in tests.

### Legacy `SceneSetup` → vNext migration strategy

Do not try to infer a perfect normalized production structure from old projects automatically.

Initial migration should prioritize **lossless preservation**:

1. Each legacy `SceneSetup` becomes a vNext setup/plan representation without losing elements, shots, script marks, background images, grid/canvas state or blocking data.
2. Do not automatically decide that legacy walls/furniture are a reusable Location Master Plan. Preserve them in the migrated setup until the user explicitly promotes/extracts a master plan.
3. Preserve existing screenplay text and script-line IDs where possible.
4. Create/link canonical `ScriptScene` entities only where scene boundaries/numbers can be mapped safely; ambiguous cases remain reviewable rather than guessed.
5. Legacy free-text location headings may seed suggested `Location` entities, but aliases/merges require review where ambiguous.
6. Existing camera↔shot, script-mark↔shot and storyboard relationships must survive.
7. Migration tests must cover projects with and without scripts.

This prevents the normalization project from silently changing existing productions.

---

## 3.3 Split domain types

Move away from one giant `src/types/index.ts`.

Target structure:

```text
src/domain/
  project/
  people/
  locations/
  plan/
  shots/
  script/
  scheduling/
  equipment/
  fixtures/
  dmx/
  cable/
  signal/
  power/
  rigging/
  logistics/
  moodboard/
  assets/
  collaboration/
```

Each domain owns:

- Types
- Pure logic
- Serialization/migration helpers
- Validation
- Tests

---

## 3.4 Break up `FloorPlanContext`

Do this gradually.

Extract domain/service boundaries such as:

```text
ProjectService
PlanService
ShotService
ScriptService
EquipmentService
ScheduleService
AssetService
UserPreferencesService
```

Do not immediately replace everything with a new state library unless necessary.

Evaluate separate React contexts/reducers before adding another dependency.

### Important

Functions such as these must not live inside UI components:

```text
autoPatchFixtures()
calculateCableLength()
buildCharacterReport()
calculateRigLoad()
computeDayEquipment()
scheduleScene()
```

---

## 3.5 Type-safety improvements

Incrementally move toward strict TypeScript.

Goals:

```json
{
  "strict": true
}
```

Do not flip it globally until the codebase is ready.

Create a tracked cleanup list for existing `any` escapes.

Also audit whether `allowJs: true` is still needed. Disable permissive compiler options incrementally only when the existing code has been migrated/tests are green; do not flip strictness in one giant unrelated PR.

---

## 3.6 Validation framework

Introduce composable domain/project validation instead of scattered UI-only checks.

Conceptually:

```ts
interface ValidationIssue {
  severity: "error" | "warning" | "info";
  code: string;
  entityId?: string;
  message: string;
}

validateProject(...)
validatePlan(...)
validateSchedule(...)
validateDmxPatch(...)
validateConnections(...)
validatePowerPlan(...)
validateRiggingPlan(...)
```

Examples of **errors**:

- Duplicate persistent ID inside one project/document
- Dangling required reference
- Invalid schema/migration result
- Corrupt asset reference required to open the project

Examples of **warnings**:

- DMX collision
- Missing equipment weight
- Cable connector mismatch
- Schedule/cast availability conflict
- Setup references a detached/missing master plan
- Technical estimate uses a generic fallback

Rules:

- Imports/migrations run structural validation before replacing a valid saved project.
- UI warnings link back to the affected entity where possible.
- Domain validators are pure/testable.
- Do not run expensive whole-project validation on every pointer-move; validate incrementally or at meaningful commit boundaries.

---

## 3.7 Branding neutrality

Even though rebranding is deferred, remove avoidable brand coupling from domain/storage code.

Create a small presentation-level branding configuration, for example:

```ts
interface BrandingConfig {
  productName: string;
  shortName: string;
  logoAsset?: string;
  website?: string;
}
```

Rules:

- Do not rename persisted schema fields just because the product is later renamed.
- Do not bake the product name into new IndexedDB object-store names if a stable neutral namespace is possible.
- Exports may display the current configured brand, but project data remains brand-neutral.
- Repository/package renaming is a separate future task.
- Audit existing hard-coded product/author names in serializers, exports, titles, local-storage keys and UI text; move true branding into configuration while keeping legacy-storage migrations compatible.

---

## 3.8 Test infrastructure

Recommended:

- Vitest — domain/unit tests
- React Testing Library — important component behavior
- Playwright — workflow/smoke/visual tests

CI should eventually run:

```text
npm ci
npm run typecheck
npm run test
npm run build
npm run e2e-smoke
```

---

# 4. Phase 1 — Core Production Domain Model

The project is the center, not the screenplay.

## 4.1 Location / Venue

```ts
interface Location {
  id: string;
  name: string;
  aliases?: string[];

  /** Optional parent for venue areas / sub-locations such as Arena → Backstage. */
  parentLocationId?: string;

  type:
    | "location"
    | "studio"
    | "stage"
    | "venue"
    | "arena"
    | "outdoor"
    | "other";

  address?: string;
  contactIds?: string[];
  notes?: string;

  masterPlanId?: string;
  referenceAssetIds: string[];
}
```

Future additions may include:

- Parking
- Loading dock
- Unit base
- Power availability
- Internet
- Access notes
- Latitude/longitude
- Sun notes
- Emergency information

---

## 4.2 Plan document

A floor plan must not require a script scene.

```ts
interface PlanDocument {
  id: string;
  name: string;

  locationId?: string;

  baseElements: PlanElement[];
  layers: PlanLayer[];
}
```

Examples:

- Apartment master plan
- Main stage
- Arena broadcast compound
- Studio floor plan
- Interview setup
- Empty custom drawing

---

## 4.3 Setup

```ts
interface Setup {
  id: string;
  name: string;

  locationId?: string;
  basePlanId?: string;

  scriptSceneId?: string; // explicitly optional

  /**
   * Ordering only. Canonical shot membership is carried by Shot.setupId.
   */
  shotOrderIds: string[];

  overlayElements: PlanElement[];
}
```

### Narrative example

```text
Kitchen Master Plan
├── Scene 17 — Wide Setup
├── Scene 17 — Close-Up Setup
└── Scene 29 — Night Setup
```

### Concert example

```text
Main Stage
├── Camera Layout
├── Broadcast Layout
├── Lighting Plot
└── Cable / Power Layout
```

No script required.

### Setup scheduling rule

A `Setup` is **not owned by one production day**. Do not store a canonical `productionDayId` directly on `Setup`.

A setup, scene, shot or cue is scheduled through `ScheduleBlock` references. This allows:

- Moving work between days without mutating the underlying creative/technical entity
- Splitting a scene/setup across days when necessary
- Reusing a setup for rehearsal and shoot/show days
- Multiple schedule versions in the future

---

## 4.4 Script scene is a distinct optional entity

Do not make `Setup` itself represent the canonical screenplay scene.

```ts
interface ScriptScene {
  id: string;
  sceneNumber: string;
  heading: string;

  intExt?: "INT" | "EXT" | "INT_EXT" | "OTHER";
  locationId?: string;
  subLocation?: string;
  timeOfDay?: string;

  synopsis?: string;
  pageLengthEighths?: number;

  characterIds: string[];
  breakdownItemIds: string[];
}
```

A single `ScriptScene` may have:

- Zero setups
- One setup
- Multiple setups
- Shots distributed across several setups
- Scheduling blocks across more than one production day

The same `Location` may be linked to many script scenes.

---

## 4.5 Breakdown items

Use reusable structured breakdown entities rather than burying everything in text tags.

```ts
interface BreakdownItem {
  id: string;
  category:
    | "prop"
    | "wardrobe"
    | "vehicle"
    | "sfx"
    | "vfx"
    | "makeup"
    | "animal"
    | "stunt"
    | "sound"
    | "music"
    | "extras"
    | "special_equipment"
    | "other";

  name: string;
  notes?: string;
  sourceScriptLineIds?: string[];
}
```

Breakdown items may be linked to scenes, characters, departments, schedule days and equipment requirements.

---

## 4.6 Shot becomes an independent production entity

Today shots are tightly nested under scene setups. The vNext model should allow a shot to exist even when there is no screenplay and even when a floor plan has not been created yet.

Conceptually:

```ts
interface Shot {
  id: string;
  name: string;

  setupId?: string;
  scriptSceneId?: string;
  segmentId?: string;

  cameraId?: string;

  /** One or more lined-script/range references; do not reduce coverage to one line ID. */
  scriptCoverageIds?: string[];

  screenDurationSeconds?: number;

  /** Production-time planning; distinct from final screen duration. */
  estimatedSetupMinutes?: number;
  estimatedShootMinutes?: number;
  estimatedResetMinutes?: number;

  status: "planned" | "ready" | "shooting" | "taken" | "omitted";
}
```

The existing shot fields for lens, size, movement, frame rate, storyboard, subjects, camera label, notes and ordering remain part of the migrated domain.

### Canonical ownership rule

Avoid keeping the same relationship as independently editable data in two places.

For example:

- `Shot.setupId` is canonical membership; `Setup.shotOrderIds` controls ordering only.
- If a shot belongs to a setup whose `scriptSceneId` is already known, normally derive the scene through the setup rather than redundantly storing the same scene ID on the shot.
- `Shot.scriptSceneId` remains useful for shots that are script-linked before being assigned to a setup, or for an explicit shot-level script link.
- `Location` should normally be derived through the linked setup/script scene unless a deliberate shot-level location override exists.
- Schedule assignment lives in schedule blocks, not on the shot itself.

Referential integrity helpers/tests must detect dangling IDs after duplicate/delete/import/migration.

---

## 4.7 Non-scripted production segments

Live, broadcast, documentary and commercial work often needs a grouping concept that is neither a screenplay scene nor a single cue.

Add an optional generic production segment:

```ts
interface ProductionSegment {
  id: string;
  name: string;

  kind:
    | "song"
    | "act"
    | "interview"
    | "presentation"
    | "commercial_segment"
    | "sequence"
    | "custom";

  plannedDurationSeconds?: number;
  locationId?: string;

  notes?: string;
}
```

Examples:

```text
Song 1
Artist Entrance
Interview with CEO
Awards Block
Product Beauty Sequence
Halftime Segment
```

A segment may own/link:

- Shots
- Camera coverage assignments
- Run-of-show cues
- Setups
- References/mood-board cards

This gives no-script projects a first-class organizational structure without pretending they have screenplay scenes.

---

## 4.8 People

Create a generic people/contact domain that can support:

- Crew
- Cast
- Talent
- Venue contact
- Supplier
- Client
- Guest
- Artist
- Technician

Avoid separate unrelated address books per module.

Conceptually:

```ts
interface Person {
  id: string;
  displayName: string;

  kind?: "crew" | "cast" | "talent" | "contact" | "client" | "artist" | "other";

  department?: string;
  role?: string;

  email?: string;
  phone?: string;

  notes?: string;
}
```

`Character` and `Person` are intentionally different:

- **Character** = screenplay/story entity
- **Person** = real cast/talent/crew/contact

A cast assignment links them rather than merging them into one object.

A future **CollaborationUser/Account** is also a separate identity:

- Collaboration user = person authenticated to edit/view the software
- Production `Person` = someone listed in the production's cast/crew/contact data

They may optionally be linked when the same human is both, but they must not share one canonical ID/model. A guest editor should not automatically appear in the crew list, and a crew contact should not automatically receive software access.

Use an explicit cast/talent assignment where needed:

```ts
interface CastAssignment {
  id: string;
  characterId: string;
  personId: string;
  notes?: string;
}
```

For unscripted productions, talent may simply be a `Person` without any `Character`.

---

## 4.9 Workspace / Module Activation

Implement workspace presets after the base entities exist.

Important:

- Module visibility is not equivalent to data deletion.
- Opening a concert project must not force the Script tab into the user's workflow.
- Opening a narrative project must not hide technical modules permanently.
- Users may switch to a custom workspace.
- Project templates can pre-populate useful layers, reports and asset categories.

Acceptance examples:

```text
New Project → Blank Floor Plan
```

opens directly into a genuinely clean plan workspace with no mandatory actor/camera/shot bootstrap.

The current quick Camera A + Actor A + Shot 1 bootstrap moves to the **Shot Planning / Blocking** (and optionally Narrative) preset rather than being removed.

```text
New Project → Concert / Live Event
```

opens with venue/stage/camera/live-production tools and no mandatory screenplay.

```text
New Project → Narrative Film
```

opens with script/coverage tools but can still use DMX, power, cables and logistics.

---

## 4.10 Equipment identity vs plan placement

Do not make a floor-plan element itself the only identity of a piece/type of equipment.

Separate these concepts:

```text
Equipment Profile / Catalog Item
    What it is
    Model/specification
    Physical/technical data

Equipment Inventory Item (optional)
    A specific owned/rented unit
    Asset tag / serial / supplier

Plan Placement
    Where an instance appears on a plan

Equipment Requirement
    How many are needed for a setup/day/package
```

Conceptual generic profile:

```ts
interface EquipmentProfile {
  id: string;
  category: string;

  manufacturer?: string;
  model?: string;

  dimensions?: Dimensions;
  weightKg?: number;
  powerWatts?: number;

  portDefinitions?: ConnectionPortDefinition[];

  source?: SourceMetadata;
}
```

`FixtureProfile` extends/specializes this concept for lighting control data.

This separation is important for:

- Equipment manifests
- Reusing the same model many times
- Ports/signal flow
- Power calculations
- Rigging weight
- Logistics
- Scheduling/day packages
- Future inventory/serial tracking

Users must be able to create/edit **custom equipment profiles** for cameras, grip, audio, video, broadcast, power and logistics gear when no external dataset exists.

External datasets should enrich the same internal profile model rather than create parallel incompatible catalogs.

Production-plan **symbols remain visual definitions**. They may provide visual port-anchor positions, but authoritative connector/protocol data comes from the equipment/fixture profile where available.

---

## 4.11 Units and physical quantities

Choose canonical internal units for technical calculations.

Recommended direction:

```text
Length / dimensions: millimeters (or one explicitly chosen SI base)
Plan/world coordinates: one documented physical scale
Mass: kilograms
Power: watts
Current: amperes
Voltage: volts
Angles: degrees
Time durations: seconds/minutes with explicit field names
```

Display/export may convert to:

```text
m / cm / mm
ft / in
kg / lb
```

Rules:

- Every calculation API makes its units explicit.
- Imported data is converted at the adapter boundary.
- A user changing display units never changes stored physical meaning.
- Reports state the units used.
- Existing plan grid/unit preferences are migrated into this system.

---

## 4.12 Canonical relationship map

This relationship map is the conceptual source of truth for how the major domains connect.

```text
PROJECT
│
├── Location / Venue
│     ├── masterPlanId ───────────────► PlanDocument
│     └── reference assets
│
├── ScriptScene (optional)
│     ├── locationId ─────────────────► Location
│     ├── characterIds
│     └── breakdown items
│
├── PlanDocument
│     └── reusable base geometry/layers
│
├── Setup
│     ├── basePlanId ─────────────────► PlanDocument
│     ├── locationId ─────────────────► Location
│     ├── scriptSceneId? ─────────────► ScriptScene
│     └── scene/setup overlay elements
│
├── ProductionSegment (optional no-script grouping)
│     ├── locationId? ────────────────► Location
│     └── cues / coverage
│
├── Shot
│     ├── setupId? ───────────────────► Setup
│     ├── scriptSceneId?* ────────────► ScriptScene
│     ├── segmentId? ─────────────────► ProductionSegment
│     ├── cameraId?
│     └── script coverage refs?
│
├── RunOfShowCue
│     └── segmentId? ─────────────────► ProductionSegment
│
├── ProductionDay
│     └── ordered ScheduleBlock refs
│            └── exactly one target:
│                ScriptScene / Setup / Shots / Cue / Segment / Manual event
│
├── EquipmentProfile
│     ├── dimensions / weight / power
│     └── logical port definitions
│
├── Plan placement / technical element
│     ├── visual symbol
│     └── equipmentProfileId? ────────► EquipmentProfile / FixtureProfile
│
└── Technical graph
      ├── fixture mode / DMX patch
      ├── port-to-port connections
      ├── cable routes
      ├── power topology
      ├── rigging loads
      └── logistics containers
```

`*` `Shot.scriptSceneId` is used when a shot needs a direct script link without deriving it from its setup, as described in the canonical ownership rules.

### Derived-view rule

The following should normally be **derived** from canonical data rather than maintained as separate copies:

```text
Character report
Location report
Scene report
Department report
Equipment manifest
Day equipment package
DMX report
Cable manifest
Power report
Rigging/load report
Logistics summary
Call-sheet defaults
DOOD
One-line schedule
```

Generated/published documents may store an explicit frozen revision plus overrides, but the editable source data remains canonical.

---

## 4.13 Semantic links from plan elements

Floor-plan objects should be visual **placements of real production entities**, not isolated labels whenever structured data exists.

Examples:

```text
Actor placement
  → characterId?       (scripted)
  → personId?          (unscripted talent / real person)

Camera placement
  → equipmentProfileId?
  → equipmentInventoryItemId?
  → associated shot(s) / camera identity

Light placement
  → fixtureProfileId?
  → fixtureModeId?
  → inventory item?
  → DMX patch

Prop placement
  → breakdownItemId?
  → equipment/inventory item? when appropriate

Truss placement
  → trussProfileId?

Cable route
  → connectionId / endpoint port refs

Stage / PA / video / broadcast equipment placement
  → equipmentProfileId?
```

Rules:

- Human-readable names remain editable and useful even when an item is unlinked.
- Linking must not require a database profile for generic/freeform drawing.
- Once linked, reports should use the stable entity/profile ID rather than name matching.
- Deleting a plan placement must follow explicit relationship rules; it must not silently delete a reusable profile, character, person or breakdown item.
- Deleting a shot/camera relationship should preserve current user expectations where intentionally coupled, but the migration/refactor must make cascade behavior explicit and tested.

This semantic-link layer is what allows one floor-plan edit to feed shot lists, equipment, DMX, power, rigging, cable and logistics without copying data by hand.

---

# 5. Phase 2 — Storage Architecture

Primary persistent storage should move from localStorage to IndexedDB.

## 5.1 Storage abstraction

```ts
interface ProjectStore {
  list(): Promise<ProjectSummary[]>;
  load(id: string): Promise<Project>;
  save(project: Project): Promise<void>;
  delete(id: string): Promise<void>;
}
```

Standalone implementation:

```text
IndexedDbProjectStore
```

---

## 5.2 Asset storage abstraction

```ts
interface AssetStore {
  put(blob: Blob, metadata?: AssetMetadata): Promise<AssetRef>;
  get(id: string): Promise<Blob>;
  delete(id: string): Promise<void>;
}
```

Assets include:

- Storyboards
- Mood-board images
- Location photos
- Production logos
- Imported scripts
- Blueprint images
- Reference images
- PDFs
- Attachments
- Thumbnails

Do not store large base64 blobs directly in project documents.

Preserve the current storage-conscious image behavior:

- Generate thumbnails/previews.
- Downscale storyboard/reference captures where appropriate.
- Keep aspect-ratio/crop metadata separate from the original asset reference where possible.
- Avoid recompressing an image repeatedly on every save.
- Allow future policy choices about retaining original full-resolution media vs optimized production copies.

## 5.2.1 Content-addressed assets and deduplication

Where practical, use a SHA-256 content hash as part of asset identity.

Benefits:

- Avoid storing identical images/files multiple times.
- Reliable offline/shared asset references.
- Easier server deduplication.
- Stable cache keys.

Example conceptual reference:

```text
asset://sha256/8fd781fc...
```

Asset metadata should include:

```text
id
contentHash
mimeType
byteSize
width/height where applicable
createdAt
source/provenance where applicable
thumbnail refs
```

The implementation may use an internal UUID plus content hash; do not expose storage paths as durable IDs.

### Asset lifecycle / cleanup

Large media needs explicit lifecycle rules.

- Never delete an asset blob while it is referenced by a current project, named revision, published document or shared record.
- Track/reference assets by stable IDs rather than guessing from filenames.
- Provide a conservative orphan-cleanup path later for unreferenced thumbnails/originals.
- Asset cleanup must be safe across local/shared projects and named revisions.
- Shared server garbage collection must enforce authorization and retention rules.

---

## 5.2.2 Versioned project package import/export

Keep current JSON compatibility, but add a future full project-package format that can include referenced assets.

Conceptually:

```text
project-package/
  manifest.json
  project.json
  assets/
  thumbnails/
```

Requirements:

- Versioned manifest
- Checksums
- Import validation
- Missing-asset reporting
- Ability to export a shared project as a portable local copy
- Ability to turn a local project into a shared project without changing its conceptual identity unnecessarily
- Detect project-ID collisions on import

When importing a package whose project ID already exists, offer explicit semantics such as:

```text
Restore / Replace existing project
Import as a new copy
Cancel
```

`Import as a new copy` must use the same deep ID-remapping rules as project duplication so globally unique entity identities are not accidentally reused.

---

## 5.3 Static-mode requirement

When no server is configured:

```text
Standalone Mode

Projects → IndexedDB
Assets   → IndexedDB
Auth     → none
Sync     → none
```

The application should still be powerful and useful.

## 5.4 PWA / true offline application shell

IndexedDB alone does not make the application loadable with no network.

Add a service-worker/PWA strategy after storage migration is stable:

- Cache the app shell.
- Cache the bundled/static fixture database.
- Cache production symbols.
- Support install-to-home-screen where browsers allow it.
- Keep cache/version migrations explicit.
- Never cache authenticated/shared API responses indiscriminately.

Goal: a previously installed/opened standalone build remains usable at a location with no internet connection.

## 5.5 Autosave, recovery and save-state UX

Local-first must feel trustworthy.

Requirements:

- Debounced/transactional autosave to IndexedDB
- Stable `createdAt` / `updatedAt` metadata
- Visible save state such as `Saved locally`, `Saving…`, `Offline`, `Syncing…`, `Up to date`
- Recovery from interrupted writes where practical
- Never overwrite a valid project with partially parsed/imported data
- Import into a temporary/staging representation before committing destructive migrations
- Keep the previous valid version long enough to recover from migration/import failure

Do not spam saves on every pointer-move event; coalesce high-frequency canvas updates.

## 5.6 Optional local-file/folder provider

As a later enhancement, evaluate the browser File System Access API or equivalent browser capabilities behind a provider abstraction.

Potential benefits:

- Explicit `Save project package to disk`
- Work directly with a local production folder on supported browsers
- Easier manual backup/version control

Requirements:

- IndexedDB remains the portable fallback.
- Unsupported browsers must not lose functionality.
- Filesystem permissions are never mandatory for normal use.

---

## 5.7 Collaboration-Ready Data Boundaries — Design Now, Sync Later

Although the full collaboration server comes much later, the data model must be partitionable from the beginning.

Do **not** assume the entire production should become one giant synchronized document.

Candidate collaboration boundaries:

```text
Project metadata document
People / contacts document
Script document
Location documents
Plan / Setup documents
Schedule document
Equipment inventory document
Technical patch documents
Mood-board documents
Comment threads
```

The final split should be based on actual edit patterns and performance tests.

Goals:

- Moving a chair should not force synchronization of unrelated screenplay/media state.
- Script editing should not lock or churn a large floor-plan document.
- Different departments can work concurrently.
- Offline edits can merge at useful boundaries.
- Large assets remain outside CRDT/project JSON state.

### Shared project vs local preferences vs local session vs presence

There are **four** useful state classes.

#### Shared/persistent project data

```text
Camera position
Plan geometry
Script edits
Shots
Schedule
DMX patch
Cable routes
Comments
Mood-board cards
Production metadata
```

#### Persistent local user/device preferences

```text
Theme
Sidebar/panel widths
Personal panel layout
Recent/favorite assets
Last-used local tool preferences
Local-only UI settings
Possibly last personal viewport/zoom restore state
```

These survive reloads for the user/device but are **not** collaborative production data.

#### Ephemeral local session/UI state

```text
Open modal
Active right-panel tab
In-progress drag gesture
Current playback cursor
Transient text selection
Context-menu open state
Export dialog state
```

This is neither persisted project data nor collaboration presence.

#### Ephemeral collaborator presence

```text
Cursor
Live viewport
Current selection
Who is typing
Current tool when useful
Follow-user state
```

Presence disappears when the user disconnects and should not enter project history.

When a property could reasonably be either shared or personal (for example temporary layer visibility), make that choice explicit rather than accidentally syncing whatever currently happens to live in React state.

### Collaborative undo principle

Undo should be scoped to the local user's own operations where technically possible. A user pressing Undo must not revert another collaborator's independent remote edit.

This requirement must influence state/history design before realtime collaboration is implemented.

---

# 6. Phase 3 — Floor Plan Engine 2.0

## 6.1 Layer system

Add proper plan layers.

Initial defaults:

```text
Architecture
Production
Lighting
Rigging
Cables
Annotations
References
```

Each layer supports:

- Visible
- Hidden
- Locked
- Opacity
- Print/export visibility
- Reorder

Users may create custom layers.

---

## 6.2 Freehand drawing / Pencil support

Create an independent annotation layer.

Tools:

- Pen
- Highlighter
- Eraser
- Freehand arrow
- Lasso
- Stroke selection

Use browser Pointer Events.

Where available, support:

```text
pointerType
pressure
getCoalescedEvents()
```

### Requirements

- Mouse works.
- Touch works.
- Apple Pencil/stylus works.
- Pencil/stylus drawing and finger pan/zoom gestures do not fight each other.
- Two-finger pinch/zoom and pan remain available while drawing.
- Apply browser-supported palm-rejection/gesture heuristics where possible.
- Long-press context menu must not fire while an active pen stroke is in progress.
- Drawing cannot accidentally delete/move floor-plan equipment.
- Undo/redo supports strokes.
- Stroke data should be simplified/compressed where appropriate so long drawing sessions do not explode project size.
- Drawing is exportable.
- Annotation layer can be hidden or locked.

---

## 6.3 Touch-friendly context menu

Desktop:

- Right click

Touch:

- Long press

Initial actions:

```text
Open in Inspector

Lock
Unlock

Cut
Copy
Paste
Duplicate

Bring Forward
Send Back

Group
Ungroup

Hide
Show

Add Comment

Delete
```

Actions shown should depend on current selection.

On small/touch screens, the context menu may render as a bottom sheet rather than a tiny desktop popup. Touch targets must remain comfortably usable and the `Open in Inspector` action should be prominent.

When `Paste` is invoked from a spatial canvas context menu, prefer pasting near the invocation point (while preserving relative positions for multi-item selections) rather than always pasting at an unrelated default coordinate.

---

## 6.4 Grouping

Introduce real plan groups:

```ts
interface PlanGroup {
  id: string;
  childIds: string[];
}
```

Useful for:

- Table + chairs
- Drum kit
- Camera platform
- FOH tower
- Lighting package
- Stage riser
- Equipment carts

## 6.5 Reusable plan assemblies

A complex reusable item should not always become one enormous SVG.

Add a concept such as:

```ts
interface PlanAssemblyDefinition {
  id: string;
  name: string;
  category: string;

  children: AssemblyChildDefinition[];
}
```

Assemblies are reusable groups made from normal plan elements/symbols.

Good candidates:

- FOH tower
- Drum kit
- Camera platform
- Festival stage starter
- Interview setup
- Video village
- Broadcast commentary position
- Standard lighting package

Users should be able to:

```text
Insert assembly
→ keep grouped
→ ungroup/edit
→ optionally save modified group as custom assembly
```

This is more maintainable than drawing every complex production object as a monolithic icon.

---

# 7. Phase 4 — Asset Library 2.0

This should be a dedicated workstream.

## 7.1 Unified production symbol registry

```ts
interface PlanSymbolDefinition {
  id: string;
  category: string;
  subCategory: string;

  name: string;
  keywords: string[];

  svg: string;

  defaultWidth: number;
  defaultHeight: number;

  /** Optional real-world default size for scaled floor plans. */
  defaultPhysicalSize?: {
    widthMm?: number;
    depthMm?: number;
  };

  rotationAnchor?: { x: number; y: number };

  /**
   * Visual anchor positions only. Logical port definitions come from
   * EquipmentProfile / FixtureProfile.
   */
  portAnchors?: PlanPortAnchor[];
}
```

### Rule

UI icons and production-plan symbols are separate systems.

- UI icons: Lucide or standard UI icon set.
- Floor-plan symbols: purpose-built OSD production symbols.

---

## 7.2 Icon audit

Every existing plan asset must be classified:

```text
KEEP
MINOR REDESIGN
FULL REDESIGN
REMOVE
```

Each symbol must be visually reviewed at:

```text
25%
50%
100%
200%
```

A technically detailed SVG that becomes unreadable when zoomed out is a failed production-plan symbol.

## 7.3 Symbol visual language

Define a short symbol style guide before mass-producing SVGs:

- Top-down / orthographic plan readability
- Consistent stroke hierarchy
- Consistent direction/orientation markers
- Minimal detail at normal floor-plan zoom
- Optional mounting/connection points where useful
- Predictable label area
- Theme-safe contrast
- Print/PDF-safe appearance
- No unnecessary manufacturer branding in generic symbols

## 7.4 Lighting / fixture symbol families

Because OFL is a technical-data source rather than a plan-symbol set, create our own generic top-down lighting families.

Initial families should include:

```text
Fresnel
Profile / ellipsoidal
PAR
HMI
LED panel / softlight
Tube
Practical
Moving head — spot
Moving head — wash
Moving head — beam
Strobe
Batten / pixel bar
Follow spot position
Generic automated fixture
```

Existing grip/modifier symbols such as flags, diffusion, reflectors and stands remain part of the production symbol library.

The selected `FixtureProfile` determines exact model/mode/data; the symbol family determines readable plan appearance.

---

## 7.5 Quick Asset Search integration

The symbol registry becomes the search source for Quick Asset Search.

Keywords/synonyms should make searches such as:

```text
mix
```

find:

```text
FOH Mixing Position
Audio Console
Monitor Console
Vision Mixer
```

and:

```text
truss circle
```

find the relevant circular/arc truss assets.

Support aliases, category filters and future favorites/recent items without duplicating symbols.

---

# 8. Domestic / Architectural Asset Expansion

## Kitchen

Add:

- Base cabinet
- Wall cabinet
- Corner cabinet
- Kitchen island
- Sink
- Double sink
- Hob / cooktop
- Oven
- Fridge
- Freezer
- Dishwasher
- Range hood
- Bar stools
- Pantry cabinet

## Bathroom

Add:

- Toilet
- Urinal
- Sink
- Double vanity
- Bathtub
- Shower
- Walk-in shower
- Bidet
- Bathroom cabinet

## General architecture

Add:

- Structural column
- Staircase
- Spiral staircase
- Elevator
- Ramp
- Reception
- Counter
- Shelving
- Wardrobe
- Closet
- Office desk
- Conference table
- Bench
- Restaurant table
- Restaurant booth
- Bar counter

---

# 9. Concert / Live Production Asset Redesign

Existing live/concert symbols should receive a cohesive visual makeover.

## 9.1 Stage

Add or redesign:

- Stage deck
- Stage riser
- Stage platform
- Runway
- B-stage
- Stage stairs
- Stage ramp
- Stage wing
- Backstage zone
- DJ riser
- Drum riser
- Keyboard riser
- Rolling riser
- Stage roof / roof structure marker
- Stage-left / stage-right technical zones

---

## 9.2 Audience / Venue

Add:

- Front-of-stage barrier
- Crash barrier
- Crowd lane
- Security lane
- Accessible viewing platform
- Seating block
- Standing zone
- Camera pit
- Photo pit

---

## 9.3 Audio

Add/redesign:

- Line array
- Ground stack
- Sub array
- Delay stack/tower
- Stage monitor
- IEM rack
- FOH audio console
- Monitor console
- Audio rack
- Stage box
- Analog/digital split
- Mic position
- Speaker stand
- Monitor World zone
- PA hang position
- Delay tower / delay speaker position

---

## 9.4 Backline / performer positions

Add/redesign common stage-planning assets:

- Drum kit
- Keyboard / piano
- Guitar amp
- Bass amp
- Pedalboard
- Mic stand
- Vocal mic position
- DI / small stage box
- DJ table / DJ position
- Performer / artist position marker

These are plan symbols/placements; exact owned/rented equipment may link to `EquipmentProfile` where useful.

---

## 9.5 Video

Add:

- LED wall
- LED processor
- Projection screen
- Projector
- Video switcher
- Camera shading position
- Replay station
- Graphics station
- Monitor wall
- Video rack

---

## 9.6 FOH / mixing tower

Do not make this one generic icon.

Support:

- FOH zone
- FOH tower
- Audio position
- Lighting position
- Video position
- Broadcast position
- Platform
- Rail/barrier
- Access stairs
- Cable-entry / cable-exit points
- Generator / distro zone

Ideally these can be combined into reusable groups/templates.

---

# 10. Broadcast Asset Redesign

Add/redesign:

## Cameras

- Studio camera
- Broadcast pedestal
- PTZ
- ENG camera
- RF handheld
- Jib
- Crane
- Cable cam
- Robotic camera
- Commentary camera
- Beauty camera

## Control

- CCU
- RCP
- Vision mixer
- Shader position
- Replay / EVS
- Graphics station
- Router
- Patch bay
- Monitor wall

## Vehicles / Compound

- OB van
- OB truck
- Satellite truck
- RF vehicle
- Generator truck
- Production trailer
- Technical trailer

## Venue positions

- Commentary desk
- Interview position
- Mixed zone
- Press platform
- Camera platform
- Broadcast platform
- Cable bridge

---

# 11. Phase 5 — Truss Builder

Truss must evolve beyond being a generic floor-plan prop.

## 11.1 Truss profile and placed truss element

Separate reusable truss specification from a placed piece.

```ts
interface TrussProfile {
  id: string;

  manufacturer?: string;
  model?: string;

  geometry: "box" | "triangle" | "ladder" | "other";

  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;

  selfWeightKg?: number;

  source?: SourceMetadata;
}
```

```ts
interface TrussElement {
  id: string;
  profileId?: string;

  x: number;
  y: number;
  rotation: number;

  lengthOverrideMm?: number;
}
```

Start with generic profiles and allow exact manufacturer profiles later.

Structural/load-capacity tables are **not** implied by simply having a truss profile.

## 11.2 Truss pieces

Support:

- Box truss
- Triangle truss
- Ladder truss

Pieces:

- Straight segments
- 90° corners
- Variable corners
- T-junction
- X-junction
- Arc
- Circular truss
- Goalpost
- Ground-support tower

Builder behavior should support:

- Endpoint snapping
- Rotation-aware joining
- Connected-chain selection
- Segment length editing
- Clear connected/disconnected state
- Group/move connected assemblies without losing geometry

---

## 11.3 Rigging items

Add:

- Motor / hoist
- Hang point
- Drop
- Clamp
- Safety
- Bridle marker
- Rigging note

---

## 11.4 Hanging positions / point-load annotations

Even before structural engineering is supported, the plan should know **where** planned loads are attached.

Allow:

- Fixture attachment position on truss
- Motor/hang-point positions
- User-entered point-load annotations
- Load subtotal by truss section/hanging position
- Missing-load-data warnings

These are planning/documentation values only and must not be presented as structural approval.

---

## 11.5 Planned hanging mass

Initial report:

```text
Truss self weight
Lighting fixtures
PA / speakers
Video / LED equipment
Scenery / other mounted equipment
Motors / hoists where applicable
Clamps
Safeties
Cable allowance
Accessory weight
Other user-entered weight
-------------------------
Total planned suspended mass
```

The load model must be generic enough that **any equipment with known weight** can become a planned rigging load; it must not be hard-coded to lighting fixtures only.

Where cable routes/profiles provide reliable length and weight-per-meter data, rigging cable weight may be derived from the cable model. Otherwise use an explicit manual allowance and label it as such.

### Safety boundary

The software may calculate planned attached loads.

It must not claim structural safety unless a future certified engineering system exists.

Example acceptable output:

> Planned attached load: 428 kg

Not acceptable:

> This truss configuration is safe.

---

# 12. Phase 6 — Script Intelligence

The existing screenplay parser should be extended rather than replaced.

## 12.1 Character catalog

```ts
interface Character {
  id: string;
  canonicalName: string;
  aliases: string[];
}
```

Normalize:

```text
JOHN
JOHN (V.O.)
JOHN (O.S.)
JOHN (CONT'D)
```

to canonical character `JOHN` while preserving extension/display information.

---

## 12.2 Character autocomplete

When editing a Character screenplay element:

```text
AN
```

suggest:

```text
ANNA
ANDREW
ANDRE
```

Selecting a suggestion should link to the character entity.

---

## 12.3 Location entity parsing

Scene heading example:

```text
INT. JOHN'S APARTMENT - KITCHEN - NIGHT
```

Potential normalized structure:

```text
INT/EXT: INT
Location: JOHN'S APARTMENT
Sub-location: KITCHEN
Time: NIGHT
```

Do not silently over-normalize.

Offer user-visible merge/create choices where ambiguous.

Support safe entity maintenance:

- Rename canonical location
- Rename canonical character
- Add/remove aliases
- Merge duplicate entities
- Show which script scenes/setups will be affected before destructive merges
- Preserve original screenplay presentation text where appropriate

---

## 12.4 Location autocomplete

Typing:

```text
INT. KIT
```

should suggest existing project locations using prefix/fuzzy matching.

After a location is chosen, the editor may also suggest common time qualifiers such as:

```text
DAY
NIGHT
MORNING
EVENING
CONTINUOUS
LATER
```

Selecting a suggestion links the scene to the canonical `Location`; it does not merely paste an unrelated duplicate string.

Global rename/merge operations must update linked scene-heading presentation safely while preserving aliases/original import information where appropriate.

---

## 12.5 Script breakdown tags

Allow text to be tagged as:

- Character
- Prop
- Wardrobe
- Vehicle
- SFX
- VFX
- Makeup
- Animal
- Stunt
- Sound
- Music
- Extras
- Special equipment
- Other

Do not aggressively auto-tag arbitrary action-line text. Suggestions may assist the user, but breakdown classification remains reviewable/editable.

---

## 12.6 Character report

Include:

- All scenes
- Locations
- Script pages/eighths
- Dialogue count
- Estimated screen-time fields where possible
- Scheduled production days
- Shots featuring character
- First appearance
- Last appearance
- Wardrobe notes
- Continuity notes
- Cast assignment

---

## 12.7 Location report

Include:

- Scenes
- INT/EXT
- DAY/NIGHT
- Total script pages/eighths
- Cast
- Props
- Special requirements
- Scheduled days
- Shots/setups at the location
- Equipment/technical requirements associated with the location
- Floor-plan/master-plan status
- Address/venue notes

---

## 12.8 Breakdown-to-production actions

Reports must not be dead-end PDFs/tables.

From a location report or script scene, allow actions such as:

```text
Create Location
Link to Existing Location
Create Master Floor Plan
Open Master Floor Plan
Create Setup From This Scene
Create Setup At This Location
Create Production Segment At This Location
Create Unscripted Shot Plan At This Location
Show All Setups At This Location
Show Scheduled Days
```

This fulfills the goal that script breakdown, locations, floor plans, shots and scheduling all feed each other rather than becoming separate databases.

---

## 12.9 Scene report

Include:

- Heading
- Location
- Cast
- Script pages/eighths
- Synopsis
- Props
- Wardrobe
- Makeup
- Vehicles
- Extras
- Animals
- Stunts
- SFX
- VFX
- Sound/music
- Special/technical equipment
- Floor-plan status
- Shot count

---

## 12.10 Department breakdown reports

Generate department-filtered reports from the same structured breakdown data.

Initial departments/categories:

```text
Cast
Locations
Props
Wardrobe
Hair / Makeup
Vehicles
Extras
Animals
Stunts
SFX
VFX
Camera
Lighting
Grip
Sound
Power
Cables / Signal
Other / Custom
```

Important:

- Do not maintain separate manual copies of the same breakdown item per report.
- Reports are filtered/derived views over canonical scene/breakdown/equipment data.
- Allow export/print and quick navigation back to the source scene/item.

### Page/eighth accuracy

Where screenplay page/eighth information is estimated rather than read from authoritative pagination, label it as an estimate. Do not present approximate pagination as exact production-page counts.

---

## 12.11 Day Out Of Days (DOOD)

Once character ↔ scene ↔ production-day links exist, generate a classic Day Out Of Days report.

It should be derived from structured scheduling data rather than manually maintained.

At minimum support:

- Work
- Hold
- Start
- Finish
- Travel/off-day states where the production model supports them

Exact terminology/presentation can be refined with production-user feedback.

---

# 13. Phase 7 — Reusable Master Locations / Venues

A Location/Venue can own a reusable master plan.

Example:

```text
Apartment Kitchen — Master

Walls
Doors
Windows
Permanent cabinets
Power outlets
Fixed furniture
```

Multiple scene setups reference it.

Scene-specific overlays contain:

- Actors
- Cameras
- Lights
- Flags
- Cables
- Props
- Notes

Same system must work for:

- Film locations
- Studios
- Concert venues
- Arenas
- Theatres
- Broadcast compounds
- Conference spaces
- Stadiums

## 13.1 Master-plan propagation semantics

The relationship between a master plan and a setup must be predictable.

Default behavior:

```text
Location Master Plan
    fixed / reusable environment

Setup Overlay
    actors
    cameras
    lighting
    cables
    scene-specific props
```

When the master plan changes, linked setups should see the updated base geometry by default.

Provide explicit escape hatches:

- **Detach/clone from master** when a setup must become independent
- **Local overlay/override** for scene-specific temporary changes
- Clear indication of which objects come from master vs setup overlay

Do not silently copy master geometry into every setup, or later edits will diverge invisibly.

---

## 13.2 Named Revisions / Setup Freeze

Add user-facing named snapshots distinct from Undo/Redo.

Examples:

```text
Location Master — Site Visit 1
Lighting Plot — Client Approved
Setup A — Before Rehearsal
Broadcast Plan — Rev 3
```

A revision stores enough structured state to:

- Restore
- Duplicate as a new revision/setup
- Compare metadata/change summary later
- Protect an approved plan while experimentation continues

Rules:

- Undo/redo = short-term editing history
- Named revision = intentional production milestone
- Server backup = disaster recovery

Do not conflate these three systems.

In collaborative mode, named revisions should record author/time and be safe to create without freezing other users out of the current live document.

---

# 14. Phase 8 — Scheduling / Stripboard

Introduce:

```ts
interface ProductionDay {
  id: string;
  date?: string;
  name: string;

  crewCall?: string;

  /** Optional target/override; calculated wrap can be derived from schedule blocks. */
  plannedWrap?: string;

  notes?: string;

  scheduleBlockIds: string[];
}
```

Prefer a discriminated union rather than one object with many unrelated optional IDs:

```ts
type ScheduleBlock =
  | { id: string; kind: "scene"; scriptSceneId: string; estimatedMinutes?: number }
  | { id: string; kind: "setup"; setupId: string; estimatedMinutes?: number }
  | { id: string; kind: "shots"; shotIds: string[]; estimatedMinutes?: number }
  | { id: string; kind: "cue"; cueId: string; estimatedMinutes?: number }
  | { id: string; kind: "segment"; segmentId: string; estimatedMinutes?: number }
  | {
      id: string;
      kind: "manual";
      label: string;
      manualType?: "meal" | "move" | "rehearsal" | "load_in" | "strike" | "other";
      estimatedMinutes?: number;
    };
```

This prevents invalid combinations such as a block accidentally pointing at a scene, cue and setup simultaneously.

A schedule block may represent:

- Script scene
- Setup
- Shot
- Run-of-show cue
- Manual event
- Meal
- Company move
- Rehearsal
- Load-in
- Strike

---

## 14.1 Scheduler UI

Support drag/drop between:

```text
UNSCHEDULED
```

and:

```text
DAY 1
DAY 2
DAY 3
```

Support both:

- Scene-level scheduling
- Setup-level scheduling
- Shot-level scheduling

A scene can be expanded to expose individual shots.

Scheduler warnings/assistance should include:

- Scene split across multiple days
- Location/company move implications
- Cast availability conflicts when availability data exists
- DAY/NIGHT or INT/EXT filters
- Unscheduled scenes/shots
- Missing estimated production time
- Missing location assignment

Do not introduce opaque automatic scheduling. Suggestions should remain explainable and user-controlled.

For company moves, optionally support a routing/travel-time provider later:

```text
Location A → Location B
estimated travel time / distance
```

This must remain provider-based and optional; users can always enter move time manually, and offline scheduling must still work.

### Production-day card summary

Each day/column should be able to show at a glance:

```text
Date / Shoot Day
Crew Call
Primary Location(s)
Scenes / Segments
Page Count where relevant
Cast/Talent
Estimated Working Time
Meal
Company Move indicators
Estimated Wrap
Warnings
```

The details are derived from scheduled blocks and production-day metadata rather than manually duplicated.

## 14.2 Script order vs shooting order

Never overwrite narrative/script order when an AD rearranges the shooting schedule.

Maintain distinct concepts:

```text
Script / editorial order
Shot-list custom order
Schedule / shooting order
Storyboard order
```

A view may sort by any of them, but moving something in the schedule must not silently renumber the screenplay or destroy the user's shot-list order.

## 14.3 AD stripboard / one-line schedule view

Provide a compact production-oriented schedule representation in addition to large day cards.

Useful fields:

- Scene number / segment
- INT/EXT
- DAY/NIGHT
- Location
- Page/eighth count
- Cast
- Short synopsis
- Estimated production time
- Scheduled day/order

Traditional color conventions may be offered as a configurable preset, but status must never rely on color alone.

---

## 14.4 Production-time estimates

Do not confuse:

```text
Shot screen duration
```

with:

```text
Setup time
Shoot time
Reset time
Move time
```

Add production estimates separately.

## 14.5 Day-level derived data contract

A `ProductionDay` should be able to derive, without duplicate manual entry:

- Scenes/setups/shots scheduled that day
- Locations/venues
- Cast/talent required
- Crew/department requirements where assigned
- Equipment required
- Fixture/DMX package
- Power requirements
- Cable package
- Rigging package
- Logistics package
- Estimated working duration

This derived day model feeds call sheets, crew sheets, logistics and later on-set/show-day mode.

---

# 15. Phase 9 — Production Day / Run of Show

## 15.1 Generic production day timeline

Example:

```text
08:00 Load-in
10:00 Camera build
11:00 Cable
13:00 Lunch
14:00 Line check
15:30 Camera rehearsal
17:30 Doors
20:00 Show
22:30 Strike
```

---

## 15.2 Run of Show

Separate live-production view.

Run-of-show cues are smaller timed/ordered events and may optionally belong to a `ProductionSegment` such as a song, act or awards block.

Conceptual cue:

```ts
interface RunOfShowCue {
  id: string;

  segmentId?: string;

  label: string;
  plannedStart?: string;
  plannedDurationSeconds?: number;

  order: number;

  cameraNotes?: string;
  lightingNotes?: string;
  audioNotes?: string;
  videoNotes?: string;
  stageNotes?: string;
  productionNotes?: string;
}
```

The run of show is a **planning/coordination timeline**, not an attempt to become a live show-control console.

Example:

```text
20:00:00 Intro VT
20:01:40 Artist Entrance
20:03:00 Song 1
20:07:30 MC
20:09:00 Song 2
```

Each cue can contain:

- Camera assignments
- Lighting cue
- Audio note
- Video cue
- Stage action
- Production note

## 15.3 Multi-camera coverage matrix

For concerts, sports, studio and live production, allow planned camera responsibility at segment/cue level.

Example:

```text
             Verse        Chorus       Solo
CAM 1        Singer MS    Singer MCU   Singer
CAM 2        Guitar       Guitar CU    Guitar solo
CAM 3        Drums        Drums        Drums
CAM 5        Jib wide     Jib sweep    Audience
```

This is complementary to individual `Shot` objects: some live productions plan **coverage responsibilities** rather than a deterministic edit shot-by-shot.

Example camera coverage:

```text
CAM 1 — Singer MCU
CAM 2 — Guitar CU
CAM 3 — Drummer
CAM 5 — Jib wide
CAM 7 — Audience
```

---

# 16. Phase 10 — Call Sheets / Production Sheets

Generate documents from Production Day data.

## 16.1 Derived defaults + editable overrides

A call/crew sheet should primarily be generated from canonical project/day data rather than become another database that users must manually keep in sync.

Examples:

```text
ProductionDay locations → call-sheet locations
Scheduled scenes → scene table
Scene cast → required cast
People/contact data → crew contacts
Day equipment → equipment notes
```

Allow explicit document-level overrides for exceptions.

Store the override, not a duplicate hidden copy of every generated field.

Support document lifecycle metadata:

```text
Draft
Published
Superseded
```

and printable/PDF export.

In collaborative deployments, publishing a call sheet should create a stable revision so later schedule edits do not silently change the already-issued document.

## Film template

Include:

- Production
- Shoot day/date
- Crew call
- First shot / planned start
- Meal
- Estimated wrap
- Weather fields
- Sunrise/sunset fields
- Location(s), address and map/reference link fields
- Parking / unit base / loading access
- Scenes
- Page count
- Cast / talent required
- Individual call times and status/notes
- Schedule
- Special equipment / department notes
- Emergency information
- Nearest hospital / medical point when configured or safely provided
- Contacts
- Safety notes
- Transport / company moves
- Optional shot summary
- General notes

## Concert / Broadcast template

Include:

- Venue
- Load-in
- Crew call
- Tech check
- Soundcheck
- Rehearsal
- Meal / catering
- Doors
- Show
- Strike
- Department contacts
- Camera assignments
- Special technical/equipment notes
- Comms / radio / intercom channel notes
- Parking
- Loading dock
- Unit/base or compound notes
- Company moves / transport where relevant
- Credentials
- Emergency information

---

# 17. Phase 11 — Open Fixture Library Integration

Use OFL as a technical-data source, not as the application's internal schema.

### Important visual rule

OFL should **not** be treated as our floor-plan icon library. The application maintains its own coherent plan-symbol families.

Example:

```text
OSD symbol family: Moving Head Wash
        +
FixtureProfile: Manufacturer / Model / Mode
        =
A plan-readable symbol backed by real technical data
```

Where real physical dimensions are available, offer an optional dimensionally accurate footprint/scale while retaining a readable symbol representation.

## 17.1 Internal fixture profile

```ts
interface FixtureProfile extends EquipmentProfile {
  categories: string[];

  /**
   * Exact control modes from the selected fixture data source.
   */
  modes: FixtureMode[];

  optics?: {
    beamAngleMinDeg?: number;
    beamAngleMaxDeg?: number;
    fieldAngleMinDeg?: number;
    fieldAngleMaxDeg?: number;
  };

  colorTemperatureK?: {
    min?: number;
    max?: number;
  };

  source?: FixtureProfileSource; // provider, source id, snapshot/version/date
}

interface FixtureMode {
  id: string;
  name: string;
  channelCount: number;

  /** Optional normalized channel-function detail when available. */
  channels?: FixtureChannelDefinition[];
}
```

---

## 17.2 Adapter

```text
OFL data
   ↓
OFL Adapter
   ↓
FixtureProfile
   ↓
Application
```

Never spread raw OFL JSON assumptions across UI/domain code.

Map OFL power/DMX/physical connectors into the generic `EquipmentProfile.portDefinitions` / connection model where possible, so cable/signal/power planning does not need a second lighting-only connector system.

## 17.2.1 One fixture profile, many modules

Do not copy the same technical specification into multiple modules.

| Fixture / equipment data | Consumed by |
|---|---|
| Manufacturer / model | Equipment manifest, labels, reports |
| Physical dimensions | Plan footprint, clearance reference, logistics |
| Weight | Rigging/load planning, logistics |
| Power draw | Power planning |
| Power connectors | Power/cable planning |
| DMX/control connectors | Cable/signal planning |
| Selected DMX mode/channel footprint | DMX patch |
| Beam/field data | Lighting-plan visualization where applicable |
| Source/version metadata | Reports, troubleshooting, data updates |

If a fixture profile changes, derived modules should recalculate from the canonical profile plus explicit per-instance overrides.

Per-instance overrides must be visible and deliberate; do not silently fork copies of the profile.

---

## 17.3 Build-time fixture snapshot

Add a build script such as:

```text
scripts/build-fixture-db.ts
```

Generate compact static fixture data.

Benefits:

- GitHub Pages compatible
- Offline operation
- Versioned fixture database
- Reproducible builds
- Clear source/provenance tracking

Generate or retain a fixture-data manifest containing:

```text
provider
snapshot version/date
source revision if available
license/attribution metadata
generated-at timestamp
schema adapter version
```

For static builds, benchmark fixture-data size. If loading the full catalog becomes expensive, generate:

```text
compact searchable fixture index
+ lazy-loaded manufacturer/model detail chunks
```

without making online access mandatory. The complete selected snapshot must still be usable offline after the required data/app resources are cached.

---

## 17.4 Custom fixtures

Users must be able to create custom profiles for equipment not present in OFL.

Missing physical data remains unknown.

---

## 17.5 Future fixture / scene interoperability

After OFL integration is stable, evaluate standards-based import/export rather than creating proprietary-only fixture exchange.

Priority exploration:

- GDTF fixture import
- MVR scene/device interchange

Requirements:

- Keep these behind adapters.
- Do not make GDTF/MVR mandatory for normal projects.
- Map imported data into internal `FixtureProfile`, equipment, rigging and connection models.
- Preserve unknown fields/source data where useful without polluting core domain types.
- Add fixture-data conformance fixtures/tests before claiming compatibility.

---

# 18. Phase 12 — DMX 2.0

Build on existing DMX work.

Light instance should eventually reference:

```text
fixtureProfileId
fixtureModeId
dmxProtocol
dmxUniverse
dmxAddress
```

---

## 18.1 Universe view

Visual 512-channel universe.

Example:

```text
1         50       100       150

[ Fixture 1 ]
1────────34

                [ Fixture 2 ]
                65────────80
```

Features:

- Drag fixture block
- Auto patch
- Find free range
- Collision highlight
- Select fixture
- Jump to floor-plan object
- Jump from plan to DMX
- Mode changes update footprint
- Cross-universe validation

### Auto-patch strategies

Support explicit strategies rather than one magic algorithm:

- Compact / first available
- Preserve existing patched fixtures and fill gaps
- Start at selected universe/address
- Sequential spill into following universes
- Preserve user-selected fixture/group ordering
- Repatch only selected fixtures

A fixture-mode change that no longer fits its assigned range must produce a clear warning and proposed resolution, not silently overlap the next fixture.

Conflict/no-fit states should use icon/text/pattern in addition to color for accessibility.

---

## 18.2 Protocol-aware universe mapping

Internally, keep the core concept of a DMX universe separate from network transport/addressing.

Support future mapping to:

- sACN / E1.31
- Art-Net

Rules:

- Do not hard-code the existing arbitrary 32-universe UI limit into the domain model.
- Protocol-specific valid ranges belong in protocol adapters/validation.
- A project's display numbering convention must be explicit.
- Export/reporting must state the numbering convention to avoid off-by-one universe confusion.

---

## 18.3 Existing allocator fixes

Before production use, test/fix:

- Fixture footprint crossing channel 512
- Gap-fitting logic
- Universe overflow
- Invalid start addresses
- Mode changes causing collisions

---

## 18.4 DMX reports

Generate:

- Fixture schedule
- DMX patch
- Universe summary
- Fixture mode report
- CSV/PDF export

---

# 19. Phase 13 — Technical Port / Connection System

Every connectable technical object may expose ports.

Do not conflate a physical connector with the signal/protocol it carries.

For example:

```text
BNC        + SDI
XLR5       + DMX512
RJ45       + Ethernet / Art-Net / sACN / Dante
optical    + fiber transport
CEE32      + 3-phase power
```

Conceptually:

```ts
interface ConnectionPortDefinition {
  id: string;
  name: string;

  connectorType:
    | "BNC"
    | "HDMI"
    | "XLR3"
    | "XLR5"
    | "RJ45"
    | "LC_FIBER"
    | "SMPTE_FIBER"
    | "SPEAKON"
    | "SOCAPEX"
    | "POWERCON"
    | "POWERCON_TRUE1"
    | "SCHUKO"
    | "CEE16"
    | "CEE32"
    | "CEE63"
    | "CEE125"
    | "OTHER";

  signalType:
    | "SDI"
    | "HDMI_VIDEO"
    | "ANALOG_AUDIO"
    | "AES_EBU"
    | "SPEAKER_LEVEL"
    | "DMX512"
    | "ETHERNET"
    | "DANTE"
    | "AES67"
    | "ARTNET"
    | "SACN"
    | "SMPTE_CAMERA"
    | "TIMECODE"
    | "GENLOCK"
    | "TALLY"
    | "INTERCOM"
    | "NDI"
    | "SMPTE_ST2110"
    | "MADI"
    | "POWER_AC"
    | "OTHER";

  direction: "input" | "output" | "bidirectional";
}
```

These enums are extensible; do not treat the first list as exhaustive.

Logical/transport protocols and physical connectors should therefore be validated independently.

Examples:

Camera:

```text
SDI OUT 1
SDI OUT 2
TC IN
Audio IN
DC IN
```

Fixture:

```text
DMX IN
DMX OUT
Power IN
```

Console:

```text
Network
DMX
Power
```

---

# 20. Phase 14 — Cable Management 2.0

Existing cable drawing should become a real connection graph.

Upgrade endpoints from free-text labels to:

```ts
from: {
  elementId: string;
  portId?: string;
}

to: {
  elementId: string;
  portId?: string;
}
```

Keep display labels for usability.

Introduce reusable cable specifications rather than relying only on an enum name:

```ts
interface CableProfile {
  id: string;
  name: string;

  connectorA?: string;
  connectorB?: string;

  supportedSignalTypes?: string[];

  standardLengthsM?: number[];
  weightPerMeterKg?: number;

  notes?: string;
}
```

This allows:

- Same signal with different connector ends
- Adapters/hybrid cables
- Cable inventory lengths
- More accurate logistics weight later

Validate connector and signal/protocol compatibility where data is known.

Cable definitions should be able to describe two ends independently because adapters and hybrid cables exist.

Examples:

- Warn on incompatible connector types.
- Warn on output-to-output or input-to-input connections when direction is known.
- Allow intentional adapters/converters rather than blocking legitimate workflows.

---

## 20.1 Automatic cable length

Use plan scale and routed path.

Calculate:

```text
Horizontal routed path
+ vertical allowance
+ user-configurable slack
```

Example:

```text
Measured: 16.8 m
Slack: 15%
Required: 19.3 m

Recommended cable:
20 m SDI
```

---

## 20.2 Standard cable lengths / inventory recommendation

Allow a project or equipment package to define available standard lengths.

Example:

```text
5 m
10 m
20 m
30 m
50 m
```

A calculated 19.3 m requirement may recommend a 20 m cable, but the user can override it.

Do not silently assume global standard lengths.

---

## 20.3 Cable manifest

Example:

```text
12G SDI

5 m  × 2
10 m × 4
20 m × 7
50 m × 1
```

---

## 20.4 Cable bundles

Support shared routes:

```text
Bundle A

2× SDI
1× Ethernet
1× XLR
```

Potential future additions:

- Cable ramps
- Crossings
- Hazard markers
- Drum/reel assignment

---

# 21. Phase 15 — Signal Flow

Generate a signal-flow graph from connected ports.

Example:

```text
CAM A
  ↓ SMPTE
CCU 1
  ↓ SDI
ROUTER
  ↓
VISION MIXER
  ↓
PROGRAM
```

Useful for:

- Broadcast
- Video village
- Live production
- Audio
- Lighting network
- Streaming

---

# 22. Phase 16 — Power Planning 2.0

Replace crude equipment-name estimates where real profile data exists.

Introduce:

```text
Power Source
Distro
Circuit
Cable
Consumer
```

Profiles should support at least:

- 120 V / 20 A
- 230 V / 16 A
- 230 V / 32 A
- 400 V three-phase / 16 A
- 400 V three-phase / 32 A
- 400 V three-phase / 63 A
- 400 V three-phase / 125 A
- Generator
- Battery
- Custom

### Legacy-estimator migration rule

Do not derive wattage by extracting arbitrary numeric tokens from a fixture/model name. For example, `S60` in a model name is not inherently `60 W`.

Power priority:

```text
Authoritative fixture/equipment profile
→ User-entered override
→ Curated generic fallback
→ Unknown
```

Never guess silently.

Any generic headroom factor, diversity factor or circuit-utilization assumption must be visible/configurable in the report/calculation settings rather than hidden as a magic constant. Do not assume, for example, that a broadcast vehicle is self-powered unless its profile/project explicitly says so.

Calculate:

- Total load
- Circuit load
- Headroom
- Phase distribution
- Overload warnings
- Source totals

Generate a printable/exportable **Power Report** containing assumptions, source/circuit loads, warnings and missing-data flags.

Planning tool only; no claim of electrical certification.

Future advanced calculations may include:

- Voltage drop
- Cable sizing guidance
- Generator loading
- Battery runtime
- Phase balancing visualization

These require explicit assumptions, units and safety boundaries.

---

# 23. Phase 17 — Rigging Weight Planning

OFL and internal fixture profiles can supply real fixture mass where known.

Example:

```text
FRONT TRUSS

Truss self weight       126 kg
Fixtures                238 kg
Clamps                    21 kg
Safeties                  10 kg
Cable estimate            34 kg
Other                     18 kg
--------------------------------
TOTAL                    447 kg
```

### Rules

- Missing weight shows as missing.
- Do not treat missing weight as zero.
- Allow manual overrides.
- Keep source metadata.
- Do not declare structural safety.

Generate a printable/exportable **Rigging / Planned Load Report** with per-truss/hanging-position subtotals, missing-weight warnings and the safety boundary stated clearly.

---

# 24. Phase 18 — Equipment Logistics

Extend equipment data:

```ts
weightKg?: number;
dimensions?: Dimensions;
packedDimensions?: Dimensions;
caseId?: string;
```

Create logistics containers:

- Case
- Rack
- Cart
- Pallet
- Truck
- Van

Container/vehicle definitions may include:

```text
Empty weight / tare
External dimensions
Usable internal dimensions or usable volume
Maximum payload where known
Notes / access constraints
```

Do not calculate payload/volume utilization percentages when capacity is unknown.

Allow nesting:

```text
Truck 1
├── Camera Case 1
├── Camera Case 2
├── Lighting Cart
└── Cable Cases
```

Calculate:

- Weight
- Volume
- Quantity
- Vehicle utilization

### Physical vs packed volume

Do not equate a fixture's physical bounding box with its shipping/logistics volume.

Distinguish:

```text
Physical dimensions / unpacked bounding volume
Packed dimensions
Case/rack/cart dimensions
Pallet dimensions
Vehicle usable volume
```

If only raw fixture dimensions are known, label the result as an unpacked/bounding estimate rather than pretending it is the actual truck-pack volume.

Cable logistics may derive weight from the cable manifest (`length × weight-per-meter`) when reliable cable profiles are available.

---

## 24.1 Schedule-linked logistics

Because equipment is connected to scenes/setups/days, generate:

```text
Equipment required on Day 3
```

and identify gear that is not needed until later production days.

Generate:

- Equipment manifest
- Case/rack/cart contents
- Vehicle load summary
- Per-day logistics package
- Missing weight/dimension warnings

Future possibilities:

- Per-case contents/checklist
- Load-in status
- Load-out/return status
- Department ownership
- Barcode/QR integration only if later justified
- Load-in checklist
- Load-out checklist
- Truck pack list
- Department packages

---

# 25. Phase 19 — Mood Boards

Mood boards become first-class project entities.

```ts
interface MoodBoard {
  id: string;
  title: string;
  sections: MoodBoardSection[];
}
```

Cards support:

- Image
- Caption
- Tags
- Source URL
- Color notes
- Lens notes
- Lighting notes
- General notes

Cards may link to:

- Project
- Character
- Location
- Script scene
- Setup
- Shot

Input methods:

- Upload
- Drag/drop
- Clipboard paste
- Image URL

External image search must remain provider-based and optional.

Provider interface concept:

```ts
interface ReferenceImageProvider {
  search(query: string): Promise<ReferenceImageResult[]>;
}
```

Rules:

- User uploads/paste/local images remain first-class.
- No scraping-based dependency.
- Preserve source URL/provider/attribution metadata where required.
- A provider being unavailable must never break the mood-board module.
- Do not architect the system around a specific third-party still-image service.
- Search UI should be provider-neutral: query → thumbnails/results → inspect source → add reference to board.
- Depending on provider/license rules, a result may be imported as an asset or stored as a source/link reference; do not assume every search result may be permanently copied.

Optional later enhancements:

- Automatic color-palette extraction
- Dominant-color tags
- Lens/lighting annotations
- Reference grouping by scene/location/character

---

# 26. Phase 20 — Collaboration Architecture Foundations

Collaboration interfaces should be considered early, but the server can be implemented after the core model stabilizes.

Two first-class operating modes:

## Deployment targets

The architecture should support three practical deployments from one frontend codebase:

```text
A. Static standalone
   GitHub Pages / static web hosting
   IndexedDB + local assets
   No collaboration server

B. Static frontend + separately hosted collaboration server
   Technically useful for demos/internal deployments
   Requires configured API/WebSocket/CORS endpoints

C. Integrated self-hosted deployment
   Web frontend + API + realtime + database + asset store
   Preferred full collaborative deployment
```

Do not assume the web frontend is served from `/`; GitHub project-page/subpath deployment must remain part of CI/smoke testing.

## Standalone

```text
IndexedDB projects
IndexedDB assets
No login
No server
No sync
```

## Connected

```text
Accounts
Shared projects
Realtime sync
Shared assets
Comments
Presence
Permissions
Backups
```

The same frontend should support both.

Configuring a collaboration server must not automatically make local project creation/editing depend on login.

Default philosophy:

```text
Local project → no account required
Shared project → authentication or authorized guest link
```

A managed/enterprise deployment may later choose stricter policy, but that is deployment policy rather than a technical dependency baked into the core app.

The project dashboard should clearly distinguish:

```text
Local
Shared / synced
Offline copy of shared project
Sync problem
```

Turning a local project into a shared project should preserve its production identity and create the required remote/sync metadata rather than forcing users to rebuild or re-import the project.

---

# 27. Phase 21 — Repository / Package Layout for Collaboration

Only after core stabilization, consider evolving toward:

```text
apps/
  web/
  server/

packages/
  domain/
  fixture-data/
  symbols/
  sync/
```

Avoid doing this migration at the same time as every other refactor.

---

# 28. Phase 22 — Self-Hosted Collaboration Server

Do not require:

- Firebase
- Supabase
- External collaboration SaaS
- Third-party project database

Reference deployment shape:

```text
Web/API server
Realtime WebSocket server
Relational database (PostgreSQL is the current leading reference choice)
Asset storage
```

The exact backend framework/database implementation remains a deferred architecture decision until the collaboration spike/benchmark; do not interpret the reference shape as permission for an agent to commit the project to a stack silently.

Asset storage:

- Local filesystem by default
- Optional S3-compatible object storage later

Goal:

```bash
docker compose up -d
```

should be enough for a standard deployment.

---

## 28.1 Collaboration Security / Data Integrity Gate

Before exposing a shared deployment publicly, define and test:

- Authentication/session handling
- Password hashing if passwords exist
- Project-level ACL enforcement on every server operation
- Authenticated WebSocket connections
- HTTPS/TLS for public production deployments, including secure WebSocket transport
- Secure cookie/token handling appropriate to the selected auth model
- Signed/unguessable share tokens
- Share-link revocation
- Upload size limits
- MIME/type validation
- Asset authorization
- Rate limiting/abuse controls
- Server/database migrations
- Backups and restore procedure
- Audit logging for security-relevant actions
- CORS/CSRF strategy appropriate to the chosen auth model
- No secrets embedded in the frontend build

Self-hosted does not mean security can be deferred.

---

# 29. Phase 23 — Local-First Realtime Sync

Create an abstraction:

```ts
interface CollaborationProvider {
  connect(projectId: string): Promise<void>;
  disconnect(): void;
}
```

Standalone implementation:

```text
NoCollaborationProvider
```

Connected implementation:

```text
RealtimeCollaborationProvider
```

Use a proven CRDT or local-first synchronization library rather than inventing conflict-resolution algorithms.

The product/server/permissions model remains ours.

Sync design must also cover:

- Collaboration document boundaries
- Local persistence of synchronized documents
- Reconnect/retry behavior
- Duplicate operation protection
- Schema migration across server/client versions
- Asset upload/download queue
- Missing remote asset placeholders
- Partial/offline asset availability
- Recovery after interrupted uploads
- Sync/protocol version negotiation so incompatible client/server versions fail safely rather than corrupt data

### Semantic validation after merge

A CRDT can merge concurrent edits but cannot decide whether the merged production plan is operationally valid.

After local/remote changes merge, rerun relevant domain validators.

Examples:

- Two fixture edits now overlap in DMX
- Two schedule edits create an availability conflict
- A deleted equipment profile leaves a dangling plan reference
- A cable endpoint no longer exists
- A rigging item has lost required weight data

Surface these as domain warnings requiring user attention rather than trying to hide them as low-level sync conflicts.

---

# 30. Phase 24 — Presence

Presence is temporary and should not pollute project history.

Presence data may include:

- Online users
- Current selection
- Cursor
- Viewport
- Editing indicator
- Current tool
- Follow-user mode

Example:

```text
Marc is editing Fixture 14
```

Possible UI:

```text
O K M +2
```

and:

```text
Follow Marc
```

---

# 31. Phase 25 — Comments and Review

Comments are persistent project data and should also work in **standalone/local projects**.

Connected collaboration adds synchronized authorship, mentions and notifications; it does not redefine the comment model.

A local-only project may use a simple local-author identity until it is shared.

Comments can attach to:

- Shot
- Camera
- Fixture
- Cable
- Script line
- Schedule block
- Mood-board card
- Location
- Plan coordinate
- Setup
- DMX fixture/patch

Support:

- Threads
- Replies
- Mentions
- Resolve/reopen
- Timestamps
- Author
- Optional notifications later

---

# 32. Phase 26 — Permissions

Start simple.

Project roles:

```text
Owner
Admin
Editor
Commenter
Viewer
```

Department-specific permissions may come later if truly needed.

Do not overbuild permission complexity in version 1.

---

# 33. Phase 27 — Sharing

Initial UX:

```text
SHARE PROJECT

Invite:
name@example.com

Permission:
Viewer / Commenter / Editor / Admin

[Copy Link]
```

Owner controls whether the link is:

```text
Specific invited users only
Anyone with the link — Viewer
Anyone with the link — Commenter   (optional deployment policy)
```

Optional later:

```text
Anyone with the link
Viewer
```

Potential future controls:

- Expiration
- Password
- Guest access
- Domain restriction

A deployment may optionally allow a link-invited guest to join with a temporary display identity without creating a permanent account.

Guest access must still be permission-scoped and revocable.

Email delivery must be an optional notification/invitation adapter; self-hosted sharing should still work by copying a secure link even when no SMTP/email provider is configured.

---

## 33.1 Shared Project Activity / Version History

Do not expose raw CRDT internals as the user-facing history system.

Provide a higher-level project activity/history model later, capable of showing meaningful events such as:

```text
Oli moved Camera A
Marc changed Fixture L14 to Mode 7
Nora updated Day 3 schedule
Call Sheet Rev 2 published
Named revision “Client Approved” created
```

Requirements:

- User-readable activity, not millions of pointer updates
- Links back to affected entity where possible
- Named revision/publish events retained
- Server audit/security events remain separate from normal creative activity

This complements, but does not replace, local undo or named plan revisions.

---

# 34. Phase 28 — Offline Collaboration

Offline editing must be a deliberate feature.

Connection lost:

```text
OFFLINE
Changes saved locally
```

Reconnect:

```text
SYNCING
```

Then:

```text
UP TO DATE
```

This is especially important for:

- Film sets
- Arenas
- Basements
- Warehouses
- Outdoor locations
- Remote locations
- Broadcast compounds

---

# 35. Future On-Set / Show-Day Mode

After scheduling is stable, introduce an operational view.

Collaboration should enhance this mode but must **not** be required; on-set/show-day tracking must also work in standalone/local mode.

Possible functions:

- Current shot
- Next shot
- Shot status: planned / ready / shooting / taken / omitted
- Takes
- Actual start/end time
- Notes
- Continuity photos
- Schedule ahead/behind
- Completed/remaining shots
- Current cue
- Upcoming cues
- End-of-day production report
- Actual scene/setup start and finish times
- Ahead/behind schedule indicator

This bridges pre-production into production.

---

# 36. Future Continuity Module

Potential entities:

- Wardrobe
- Hair/makeup
- Props
- Continuity photo
- Script day
- Scene continuity
- Matching shots

This should connect to character, scene, setup and shooting day data.

---

# 37. Future Sun Planning

Location/production-day data may later include:

- Sunrise
- Sunset
- Golden hour
- Sun direction
- Exterior orientation
- Location notes

Useful UI may include:

- Sun-direction arrow/overlay on the floor plan
- Time-of-day scrubber for an exterior plan
- Golden-hour markers
- Date/location source and timestamp/assumption display

Keep this optional and provider-based. Manual planning remains available when the provider is unavailable.

---

# 38. Future Reusable Production Templates

This is distinct from the early **workspace presets**. Workspace presets change which modules are shown; reusable production templates contain actual reusable production data/configuration.

Reusable templates should eventually support:

- Entire production project
- Film location / location master plan
- Venue
- Stage
- Camera package
- Lighting package
- Crew roster
- DMX rig
- Broadcast compound
- Plan assembly (for example FOH tower / interview setup)
- Equipment/logistics package
- Call-sheet configuration

---

## 38.1 Performance, Touch and Accessibility Budgets

Complex concert/broadcast projects will stress the current canvas more than simple film scenes.

Before each major release, benchmark representative projects for:

- Canvas pan/zoom
- Multi-selection
- Large cable routes
- Hundreds of fixture objects
- Large OFL search results
- Script editing
- Schedule drag/drop
- IndexedDB load/save
- Collaborative updates

Do not invent permanent numeric performance thresholds in this document without measurement. Establish baselines from QA fixtures and track regressions.

Touch QA must include at least:

- iPad-class tablet
- Pencil/stylus where available
- Touch-only interaction
- Desktop mouse/keyboard

Accessibility requirements:

- Keyboard-reachable non-canvas controls
- Sufficient contrast
- Do not use color as the only conflict/status indicator
- Accessible labels for buttons/icons
- Touch target sizing appropriate for tablets

---

## 38.2 Existing Feature Regression Contract

The modernization work must preserve or deliberately migrate existing capabilities, including:

### Projects

- Project dashboard / multiple productions
- Rename / duplicate / download / delete project workflows
- JSON import creates/restores a project without silently overwriting another open production
- Existing sample/demo project path
- Production metadata/logo behavior

### Floor plan / blocking

- Floor-plan canvas, real-world scale, grid and measurement
- Cameras / actors / props / architecture / lights / shapes / track / cables
- Background/reference blueprints and set photos
- Move / resize / rotate interactions
- Camera/actor blocking paths, waypoints, rotation per waypoint and playback
- Storyboard thumbnails associated with the correct camera/keyframe position
- Undo/redo and keyboard shortcuts
- Full-screen panel/workspace behavior

### Camera / shot behavior

- Sensor-aware FOV / viewfinder
- Existing camera settings such as lens/sensor/aspect/frame rate/height/exposure-related finder settings
- Live device-camera viewfinder/capture where browser permissions support it
- Safe/action guides and storyboard overlay behavior where currently supported
- Shot list cards/table
- All-scenes view
- Insert-between-shots behavior
- Reorder / renumber
- Takes/status editing
- Camera reassignment **without destroying existing blocked positions**
- Camera ↔ shot selection synchronization
- Multi-camera workflows

### Storyboard

- Board has its own ordering independent of shot-list order
- Storyboards per shot and per camera keyframe/waypoint where currently supported
- Drag/drop/browse artwork
- Device-camera capture into the intended frame
- Aspect-ratio behavior
- Image optimization/downscaling
- Storyboard print/contact-sheet export

### Script

- Screenplay editor behavior and formatting workflow
- Existing screenplay keyboard/element-flow behavior (Enter/Tab style transitions) where currently supported
- Fountain/plain-text and Final Draft/FDX import paths
- Scene-number parsing
- Raw Fountain/page-view modes
- Lined-script selection, including existing word/range precision, and script-range ↔ shot linking
- Existing lining handles/adjustment
- Existing out-of-frame/squiggle and continuation markers
- Ability to line an existing shot without recreating it
- Existing unline/delete semantics, including keeping a shot when deliberately unlining it
- AV two-column script and bidirectional AV-row ↔ shot linking
- Touch text-selection behavior

### Equipment

- Equipment manifest derived from plan content
- Active-scene and all-scenes/master views
- Custom equipment
- Camera packages / expandable kits
- Existing department/search/filter workflows
- Existing equipment spreadsheet/CSV/Excel-style/print exports

### Responsive / export

- Responsive/mobile panels and bottom-sheet behavior
- Touch pinch/pan behavior
- Dark/light themes
- Lined script, storyboard, floor-plan blueprint, equipment and shot-list export workflows
- Existing lined-script export options such as lined-only vs full screenplay where supported
- PNG / print-PDF / CSV / JSON outputs where currently supported
- GitHub Pages build

If a replacement architecture changes an existing workflow, the PR/task must document the migration and user-visible behavior.

Keep at least one lightweight bundled/demo project path so first-run users and automated smoke tests can exercise the suite without importing their own production.

---

# 39. Agent Workstream Ownership

Recommended parallel-agent responsibilities:

| Agent | Ownership |
|---|---|
| Core Architecture | IDs, schema, migrations, storage, state/context extraction |
| Canvas UX | Layers, context menu, grouping, freehand drawing, touch/Pencil |
| Asset Library | Symbol registry, SVG design, icon audit, domestic/live/broadcast assets |
| Script | Parser improvements, characters, locations, autocomplete, breakdown |
| Locations | Venue/location domain, master plans, overlays |
| Scheduling | Production days, stripboard, drag/drop, Run of Show |
| Reports | Call sheets, production sheets, breakdown exports |
| Equipment Catalog | Generic equipment profiles, custom gear, packages, manifests, physical/technical metadata |
| Fixture / DMX | OFL adapter, lighting fixture profiles/modes, DMX universe |
| Cable / Signal | Ports, connectors/protocols, cables, bundles, manifests, signal flow |
| Power / Rigging | Power model, truss loads, safety boundaries |
| Logistics | Weight, volume, cases, racks, vehicles, day requirements |
| Mood Board | Boards, assets, links |
| Collaboration | Sync abstraction, server, sharing, presence, permissions |
| QA | Migration fixtures, unit tests, workflow tests, visual regression, performance |

## 39.1 Agent coordination rules

- One workstream owns a domain at a time.
- Agents should not perform opportunistic repo-wide refactors outside their assigned scope.
- Shared-domain changes require an explicit interface/task handoff.
- Avoid two agents editing the same legacy hotspot simultaneously.
- Small, reviewable commits/PRs are preferred over one giant feature dump.
- Every PR/task should state:
  - Scope
  - Data-model changes
  - Migration impact
  - New dependencies
  - Tests added
  - Standalone/GitHub Pages impact
  - Collaboration-readiness impact
- Do not mark a feature complete when only the UI exists.

---

# 40. Dependency Graph

Do not let every agent modify the same legacy structures at once.

```text
                         CORE MODEL
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
     SCRIPT                CANVAS              EQUIPMENT
        │                    │                    │
   BREAKDOWN              ASSETS              FIXTURES/OFL
        │                    │                    │
     LOCATIONS ─────── MASTER PLANS              DMX
        │                    │                    │
        └───────────────┐   PORTS/CONNECTIONS ───┘
                        │          │
                     SCHEDULE    CABLE/SIGNAL
                        │          │
                    CALL SHEET    POWER
                        │          │
                        └───── RIGGING
                                  │
                              LOGISTICS
                                  │
                           COLLABORATION
```

Collaboration interfaces are designed early.

Full collaboration implementation comes after persistent models are stable enough.

---

## 40.1 Milestone Gates

The numbered phases describe capabilities; these gates determine when later work is safe to accelerate.

## Gate A — Foundation Safe

Required before large parallel feature expansion:

```text
Central IDs
Schema versioning/migrations
Storage abstraction
IndexedDB project/assets
Autosave/recovery contract
Test runner + CI
Static-host/subpath regression test
Domain boundaries
Collaboration-ready document-boundary design
Existing-project migration fixtures
```

## Gate B — Production Model Stable

Required before scheduling/reporting/technical modules fan out heavily:

```text
Location/Venue
PlanDocument
Setup
Independent Shot
ProductionSegment
ScriptScene
People
BreakdownItem
EquipmentProfile foundation
Workspace presets
Master-plan linkage
Canonical relationship rules
```

After Gate B, run the **Batch 3A collaboration architecture spike** before too many later domains harden around untested synchronization assumptions.

## Gate C — Technical Graph Stable

Required before advanced cable/power/logistics automation:

```text
EquipmentProfile / FixtureProfile
Equipment identity vs plan placement
Physical connector vs signal/protocol model
Ports
Connections
Cable routing
DMX fixture mode
TrussProfile / rigging load identity
Physical weight/dimension units
```

## Gate D — Collaboration Public-Ready

Required before inviting external production users onto a hosted deployment:

```text
Local-first sync
Offline/reconnect tests
ACL enforcement
Asset authorization
Backups/restore
Security review
Schema/client-server compatibility
Migration strategy
```

---

## 40.2 Critical Risk Register

The following areas deserve explicit review rather than normal feature optimism:

| Risk | Mitigation |
|---|---|
| Legacy project corruption during schema changes | Versioned migrations + saved migration fixtures + backups |
| Giant React/state monolith grows further | Domain/service extraction before major module expansion |
| Media overwhelms browser storage | IndexedDB + asset separation + content addressing |
| Collaboration retrofitted too late | Define document boundaries/shared-vs-local-preferences-vs-session-vs-presence in foundation |
| CRDT document becomes too large/churn-heavy | Partition by edit domain and benchmark real projects |
| Concert/broadcast plans become slow | Representative performance fixtures + canvas profiling |
| Technical calculators imply unsafe certainty | Explicit unknown values, assumptions, warnings, no certification claims |
| External fixture/reference data changes | Adapter layer + source/version manifest + tests |
| Third-party licensing blocks commercial direction | Provenance/attribution register + own plan symbols |
| Offline shared assets fail partially | Asset queue, retry, placeholder and recovery design |
| Two agents refactor same hotspot differently | Workstream ownership + reviewable PR boundaries |
| Same relationship stored independently in multiple entities | Canonical ownership rules + referential-integrity tests + derived views |

---

# 41. Recommended Implementation Batches

## Batch 1 — Foundation

Do first:

- Central ID system
- Deep-clone/remap
- Schema versioning
- Migration framework
- Domain folder structure
- Storage abstractions
- IndexedDB project repository
- IndexedDB asset repository
- Initial context/service extraction
- Validation framework / referential-integrity checks
- Test infrastructure
- CI typecheck/test/build
- Collaboration-ready document-boundary design
- Shared project vs local preferences vs local session vs presence separation rules
- Canonical unit/quantity policy
- Autosave/save-state contract
- Existing-feature regression baseline
- Brand-neutral config

---

## Batch 2 — Canvas + Asset Foundation

Can run mostly in parallel after Batch 1 structure is clear.

### Canvas

- Layer system
- Touch context menu
- Freehand annotation
- Apple Pencil/stylus support
- Grouping
- Reusable plan assemblies
- PWA/offline app-shell foundation after IndexedDB storage is stable
- Static-host/subpath/deep-link smoke tests

### Asset Library

- Symbol registry
- Asset metadata
- Icon audit
- Symbol visual-language guide
- Quick Asset Search registry integration
- Start domestic assets
- Start concert redesign
- Start broadcast redesign

### Asset workstream continuation gate

The Asset Library agent/workstream continues in parallel after Batch 2.

Before the relevant production-suite beta is considered visually complete:

```text
✓ Every existing plan symbol audited
✓ Domestic/kitchen/bathroom expansion completed
✓ Concert/stage/FOH/backline set completed
✓ Broadcast/OB set completed
✓ Generic fixture symbol families completed
✓ Truss symbols migrated to the modular truss system where applicable
✓ Quick Asset Search metadata/keywords added
✓ Zoom/theme/print checks completed
```

Do not close the icon/asset workstream merely because the registry infrastructure exists.

---

## Batch 3 — Production Model

- Location/Venue entity
- Master Plan
- Generic Setup independent of screenplay
- Independent Shot entity and canonical relationship rules
- ProductionSegment for non-script work
- People/contact model and Character↔Person assignment boundary
- Generic EquipmentProfile / custom equipment foundation
- Semantic plan-element links
- Optional ScriptScene linkage
- Local comment/review entity foundation
- Data migration
- Workspace preset/module visibility model
- Blank / Shot Planning / Narrative / Documentary / Commercial / Concert / Broadcast project presets

---

## Batch 3A — Early Collaboration Architecture Spike

This is a **time-boxed validation spike**, not the full collaboration product.

Run it after the Batch 3 core relationships/storage model are stable enough to test.

Goals:

- Evaluate the shortlisted CRDT/local-first approach(es)
- Validate proposed collaboration document boundaries
- Synchronize a minimal project metadata document
- Synchronize one representative Plan/Setup document
- Synchronize local comments/review notes
- Test two browser clients editing different plan elements concurrently
- Test both clients going offline, making edits, and reconnecting in different orders
- Verify local undo does not revert an unrelated remote edit
- Measure document size/churn for representative plan operations
- Validate schema/version metadata and recovery behavior

Explicitly **out of scope** for the spike:

```text
Final authentication
Final permissions UI
Email invitations
Production-ready asset service
Notification system
Enterprise deployment
```

Deliverable:

```text
Collaboration architecture decision record
Chosen/approved sync direction or reasons to run another spike
Document-boundary recommendations
Measured risks / performance observations
Required changes to core domain/storage abstractions
```

Do not silently turn a spike dependency into a permanent production dependency without the explicit architecture decision.

---

## Batch 4 — Script + Locations

Parallel work:

### Script

- Character entity
- Character autocomplete
- Location parsing/autocomplete
- Breakdown tags
- Character/location/scene reports

### Locations

- Master plans
- Reusable venue plans
- Scene/setup overlays
- Master propagation / detach semantics
- Named setup/master-plan revisions
- Location reports

---

## Batch 5 — Scheduling

- ProductionDay
- ScheduleBlock
- Unscheduled pool
- Drag/drop
- Scene/setup/shot/segment scheduling
- Script order vs shooting order
- AD stripboard / one-line schedule
- Production-time estimates
- Run of Show + ProductionSegment/Cue relationships
- Multi-camera live coverage matrix
- Production Day timeline

---

## Batch 6 — Reports

- Film call sheet
- Concert/broadcast crew sheet
- Derived defaults + explicit overrides
- Draft/published/superseded revisions
- One-line schedule
- Character report
- Location report
- Scene breakdown
- Department reports
- Day Out Of Days when data allows

---

## Batch 7 — Fixture / DMX

- Internal FixtureProfile
- OFL adapter
- Static fixture snapshot
- Custom fixture editor
- Fix current allocator edge cases
- Visual universe view
- Auto-patch strategies / mode-change validation
- Art-Net / sACN protocol-aware universe mapping
- Patch reports
- Fixture source/version manifest
- Future GDTF/MVR adapter spike only after OFL path is stable

---

## Batch 8 — Truss / Cable / Signal / Power

Parallel specialist work:

### Rigging

- TrussProfile + modular truss builder
- Endpoint snapping/connected assemblies
- Motors/hang points
- Generalized equipment rigging loads
- Planned load report

### Cable / Signal

- Physical connector vs signal/protocol model
- Port system
- CableProfile model
- Connection graph
- Cable length
- Bundles
- Cable manifest
- Signal-flow view

### Power

- Regional supply profiles
- Distro/circuit model
- Load calculations
- Phase/headroom reporting

---

## Batch 9 — Logistics

- Equipment dimensions
- Equipment weight
- Packed dimensions
- Cases
- Racks
- Carts
- Pallets
- Vans/trucks
- Day-linked requirements
- Vehicle payload/usable-volume data
- Physical vs packed volume
- Weight/volume utilization totals
- Logistics reports/manifests

---

## Batch 10 — Mood Boards

- Board model
- Sections
- Image cards
- Asset links
- Tags
- Source URLs
- Entity linking
- Standalone/local assets
- Provider-neutral optional reference-image search adapter

---

## Parallel Track — Collaboration Productionization

Begin this track **after Batch 3A validates the sync direction**. It may then proceed in parallel with Batches 4–10.

Do not wait for every technical module to be finished; instead, connect each new domain to collaboration only after that domain's persistent model is stable.

Work includes:

- Production collaboration interface/provider
- Server application
- Database
- Shared asset store
- Realtime sync
- Authentication/guest access
- Presence
- Sync existing local comments/review threads
- Mentions/notifications where configured
- Permissions
- Project sharing
- Offline sync/reconnect hardening
- Docker deployment
- Backups/restore
- Security/public-deployment gate

Suggested staging:

```text
C1  Sync/server skeleton + one core project/plan document
C2  Shared assets + auth + project ACLs
C3  Sharing + comments + presence + guest links
C4  Offline/reconnect hardening + version compatibility
C5  Integrate stable Script/Schedule/Technical/Mood-board documents as they land
C6  Security/backup/deployment hardening for public use
```

The collaboration workstream must not rewrite unstable feature domains merely to make them syncable; use the provider/document interfaces established in the foundation.

---

# 42. Definition of Done

A feature is not done because it renders.

Where applicable it must include:

```text
✓ Domain types
✓ Canonical relationship / referential-integrity behavior
✓ Persistence
✓ Migration
✓ Undo/redo
✓ Copy/paste
✓ Touch behavior
✓ Keyboard behavior
✓ Export behavior
✓ Tests
✓ Dark/light themes
✓ Standalone mode
✓ Collaboration compatibility
✓ Offline/reconnect behavior where relevant
✓ Project-package/export behavior where relevant
✓ Documentation
```

Technical calculations additionally require:

```text
✓ Input validation
✓ Missing-data behavior
✓ Unit tests
✓ Explicit units
✓ Safety disclaimer where relevant
```

---

# 43. Asset Agent Checklist

For every existing floor-plan symbol:

```text
[ ] Identify category
[ ] Keep / Minor Redesign / Full Redesign / Remove
[ ] Check dimensions/default size
[ ] Check rotation behavior
[ ] Check visual clarity at 25%
[ ] Check visual clarity at 50%
[ ] Check visual clarity at 100%
[ ] Check visual clarity at 200%
[ ] Add search keywords
[ ] Add connector ports if appropriate
[ ] Test dark/light theme visibility
[ ] Test print/export
```

Live/broadcast/truss symbols should receive particular scrutiny.

---

# 44. QA Scenarios

Maintain representative test projects.

## Narrative film fixture

Contains:

- Imported screenplay
- Multiple scenes
- Recurring location
- Characters
- Shots
- Storyboards
- Schedule
- Call sheet

## Concert fixture

Contains:

- Venue master plan
- Stage
- FOH tower
- Cameras
- PA
- Truss
- Fixtures
- DMX
- Power
- Cables
- Run of Show
- Crew sheet
- Logistics

No script.

## Broadcast fixture

Contains:

- Studio/arena
- Camera positions
- CCUs
- Router
- Vision mixer
- Replay
- Cable graph
- Signal-flow graph

No screenplay required.

## Simple floor-plan fixture

Contains:

- Apartment
- Kitchen
- Bathroom
- Furniture
- Hand-drawn annotations

No script, schedule, account, or server.

This scenario must always remain supported.

## Collaboration conflict fixture

Two users/devices:

- Open same shared project.
- Go offline independently.
- Move different floor-plan elements.
- Edit different schedule blocks.
- Add comments.
- Reconnect in different orders.

Expected:

- Independent edits survive.
- No project corruption.
- Presence data is not persisted as project history.
- Local undo does not remove unrelated remote work.
- Missing assets recover/retry cleanly.

## Migration fixture

Maintain saved examples from every released schema version.

Expected:

- Old file opens.
- Migration is deterministic.
- Core shots/script/plan relationships remain intact.
- Export after migration produces current schema.

---

# 45. GitHub Pages / Static Build Contract

The static build should continue to support, where technically reasonable:

- Floor plans
- Blocking
- Shots
- Storyboards
- Script
- Script breakdown
- Scheduling
- Production days
- Call-sheet generation
- Run of Show
- Equipment
- Static OFL fixture database
- DMX planning
- Power planning
- Cable planning
- Signal planning
- Truss weight summaries
- Logistics calculations
- Mood boards using local assets
- Local comments / review notes
- Exports
- IndexedDB project library
- Offline/local operation
- PWA/app-shell caching after implemented

Server-only features:

- User accounts
- Shared projects
- Realtime collaboration
- Shared assets
- Invitations
- Permissions
- Server backup
- Presence
- Shared comments/notifications

The frontend must detect whether collaboration services are configured.

A GitHub Pages/static build may technically connect to a separately hosted collaboration API if explicitly configured, but GitHub Pages itself does **not** provide the backend. Standalone behavior must remain the default when no collaboration endpoint is present.

CI should test project-subpath routing/base URLs so the app does not accidentally assume it is hosted at `/`.

### Static-host deep-link strategy

Share/project links must be refresh-safe on static hosts.

Choose and test one supported strategy, for example:

- Hash-based client routing for static builds, or
- A generated static-host `404.html`/redirect fallback where appropriate

Integrated server deployments may use normal history-fallback routes.

Do not ship a share link that works only when navigated to from inside the SPA but 404s when opened directly from an email/message.

---

# 46. Product Philosophy

The application should never become script-centric.

Narrative workflow:

```text
Script
→ Script Scene
→ Location
→ Setup
→ Shot
→ Production Day
```

Concert workflow:

```text
Venue
→ Stage / Plan
→ Cameras / Lighting / Audio
→ Cues
→ Run of Show
→ Production Day
```

Broadcast workflow:

```text
Venue / Studio
→ Camera Plan
→ Technical Connections
→ Signal Flow
→ Schedule
```

Simple planning workflow:

```text
Blank Plan
→ Draw
→ Add Cameras / Furniture / Notes
→ Export
```

All are equally valid first-class workflows.

---

## 46.1 Explicitly Deferred Decisions / Do Not Decide Silently

These decisions are intentionally **not** finalized by this plan:

- Product rebrand/name
- Open-source vs closed/commercial licensing direction
- Exact future product tiers
- Exact CRDT/local-first library
- Exact collaboration backend framework
- Exact authentication implementation
- Exact database ORM/query layer
- Exact drag/drop library
- Whether to add a frontend state library such as Zustand
- Which optional online reference-image provider(s) to support
- Which weather/map/sun provider(s) to support
- Final GDTF/MVR compatibility scope

Agents may research/propose these choices but must not bake a major irreversible choice into the architecture without an explicit project decision.

---

## 46.2 Third-Party Data / Licensing Hygiene

Because the future distribution model is undecided:

- Keep a machine-readable or documented list of third-party code/data dependencies.
- Record licenses/attribution obligations for bundled datasets and symbols.
- Do not copy manufacturer or third-party artwork unless its use is permitted.
- Prefer our own generic production-plan SVG symbols.
- Keep imported/source data provenance where practical.
- Review distribution/licensing implications before public/commercial release milestones.

This is especially important for fixture databases, standard interchange files, reference imagery and any future bundled media.

---

## 46.3 Decision Log

Keep this table updated when a deferred architectural choice is actually made.

| Decision | Status | Notes |
|---|---|---|
| Product remains script-optional | LOCKED | Core requirement |
| Modular workspace presets | LOCKED | Presets affect UX, not data validity |
| Standalone/static mode remains first-class | LOCKED | GitHub Pages-compatible where technically reasonable |
| IndexedDB replaces localStorage as primary project/media store | LOCKED DIRECTION | Migration implementation still required |
| Collaboration is self-hostable and does not require external SaaS | LOCKED | Exact stack deferred |
| Shared project state separated from local preferences, local session state and ephemeral presence | LOCKED | Collaboration foundation |
| Large assets stored outside main synchronized project state | LOCKED | Asset references only |
| OFL used through an adapter/internal FixtureProfile | LOCKED | OFL is not the plan-symbol library |
| Production-plan symbols are our own coherent SVG system | LOCKED | Generic, readable, source-safe |
| Rebrand | DEFERRED | Do not rename repo/schema yet |
| Current repository license metadata | CURRENT BASELINE | GPL-3.0; agents must not change silently |
| Future product licensing/business model | DEFERRED | Requires separate legal/product decision |
| Exact CRDT/local-first library | DEFERRED | Research/benchmark before commitment |
| Exact backend/auth stack | DEFERRED | Must satisfy self-host/security goals |
| Exact optional image/weather/map providers | DEFERRED | Provider adapters only |

---

# 47. Final Guiding Principle

> **Everything is optional, but everything can connect.**

A screenplay can create scenes.

A scene can use a location.

A location can provide a reusable master plan.

A setup can use that plan.

A shot can link to a setup and script line.

A fixture can link to an OFL-derived fixture profile.

The fixture profile can provide DMX footprint, dimensions, weight, power and connectors.

Those values can feed:

- DMX patching
- Rigging load summaries
- Power planning
- Cable requirements
- Logistics

The schedule determines when those resources are required.

Collaboration allows multiple departments to work on those same production entities without duplicating information.

None of this requires a screenplay to exist.

---

# 48. Immediate Next Action

Before major feature implementation begins, complete **Batch 1** and create/verify:

1. `AGENTS.md`
2. Central ID service
3. Deep-clone/remap tests
4. Project schema version
5. Migration framework
6. Domain folder skeleton
7. Storage interfaces
8. IndexedDB project/asset storage
9. Test infrastructure
10. CI validation
11. Collaboration-ready document-boundary design note
12. Brand-neutral configuration
13. Existing-feature regression test checklist
14. `AGENTS.md` distilled from this master plan
15. Core relationship/ownership rules for Shot ↔ Setup ↔ ScriptScene ↔ Segment ↔ ScheduleBlock
16. Explicit legacy `SceneSetup` migration test fixtures
17. Autosave/save-state contract
18. Validation framework with duplicate/dangling-reference checks

Only then begin parallel feature agents.

This prevents future work from extending the current legacy structures into an unmaintainable monolith.


---

# 49. Discussion Coverage / Traceability Checklist

This section exists specifically so future reviewers can confirm that the implementation plan still reflects the original product decisions.

| Discussed requirement | Covered in plan |
|---|---|
| Software works without a screenplay | Core rules, core model, QA fixtures, workspace presets |
| Existing demo/sample project path remains available | Existing-feature regression + QA |
| Current quick Camera A + Actor A + Shot 1 workflow retained via Shot Planning preset | Workspace presets + regression contract |
| Film / documentary / commercial workflows | Product vision + presets |
| Plan / Create / Schedule / Technical / Logistics / Collaborate module families | Product module families |
| Concert filming workflow | Concert assets, Run of Show, technical modules |
| Broadcast / OB workflow | Broadcast assets, signal/cable, technical plans |
| Standalone blank floor plan | Presets + QA + static contract |
| Reusable locations / venues | Master Locations / Venues |
| Script character autocomplete | Script Intelligence |
| Script location autocomplete | Script Intelligence |
| Character breakdown reports | Script Intelligence |
| Location breakdown reports | Script Intelligence |
| Scene / department breakdown | Script Intelligence |
| Breakdown can create/link plans/setups | Breakdown-to-production actions |
| Scheduling scenes/setups/shots | Scheduling / Stripboard |
| Drag/drop onto production days | Scheduling UI |
| Film call sheets | Call Sheets / Production Sheets |
| Concert/broadcast crew sheets | Call Sheets / Production Sheets |
| Day Out Of Days | Script/Scheduling reports |
| Run of Show | Production Day / Run of Show |
| On-set/show-day tracking | Future operational mode |
| Open Fixture Library integration | Fixture integration |
| OFL weight/dimensions/power/connectors/modes | FixtureProfile |
| OFL is data, not our icon library | Fixture visual rule |
| Our own coherent fixture symbols | Asset Library + fixture symbol mapping |
| Custom fixtures | Fixture integration |
| Future GDTF interoperability | Fixture interoperability |
| Future MVR interoperability | Fixture interoperability |
| Visual DMX universe | DMX 2.0 |
| Exact fixture-mode channel footprint | FixtureProfile + DMX |
| Existing DMX allocator bugs fixed | DMX allocator tests |
| Art-Net / sACN mapping | Protocol-aware universe mapping |
| Truss redesign / more truss pieces | Truss Builder |
| Truss fixture weight totals | Rigging Weight Planning |
| No false structural safety claim | Rigging safety boundary |
| Equipment weight and volume | Logistics |
| Cases / racks / pallets / vans / trucks | Logistics |
| Schedule-linked gear requirements | Logistics + day derived data |
| Cable route planning | Cable Management 2.0 |
| Cable length + slack | Cable Management 2.0 |
| Cable manifest | Cable Management 2.0 |
| Real port-to-port connections | Technical Port System |
| Signal-flow diagrams | Signal Flow |
| Power planning | Power Planning 2.0 |
| European + US supply profiles | Power Planning 2.0 |
| No model-number-as-wattage guessing | Power migration rule |
| Concert-stage asset makeover | Concert Asset Redesign |
| FOH / mixing tower | Concert Asset Redesign |
| Concert backline / performer stage assets | Concert Asset Redesign |
| Monitor World | Concert Asset Redesign |
| PA / delay / subs | Concert Asset Redesign |
| Broadcast asset makeover | Broadcast Asset Redesign |
| More kitchen floor-plan assets | Domestic assets |
| More bathroom floor-plan assets | Domestic assets |
| Free drawing on iPad/stylus | Floor Plan Engine 2.0 |
| Pencil/finger gesture coexistence | Drawing requirements |
| Touch context menu | Floor Plan Engine 2.0 |
| Lock/unlock/copy/paste from context menu | Context menu actions |
| Open in Inspector from context menu | Context menu actions |
| Mood boards | Mood Boards |
| Optional reference-image search providers | Mood-board provider adapter |
| No dependency on a third-party still library | Mood-board rules |
| Collaboration via shareable project link | Sharing |
| Realtime multi-user editing | Local-first realtime sync |
| Collaboration assumptions validated early with a two-client/offline spike | Batch 3A collaboration architecture spike |
| Production collaboration can proceed in parallel after the spike rather than waiting for all technical modules | Collaboration Productionization parallel track |
| Own/self-hostable collaboration server | Collaboration server |
| No mandatory Firebase/SaaS | Architecture rules |
| Comments attached to production entities | Comments and Review |
| Presence / selections / follow user | Presence |
| Permissions | Permissions |
| Offline editing and reconnect sync | Offline Collaboration |
| Assets outside synchronized project JSON | Asset storage |
| Asset dedup/content addressing | Storage Architecture |
| GitHub Pages remains useful | Static Build Contract |
| Server-only collaboration features separated | Static Build Contract |
| IndexedDB migration | Storage Architecture |
| PWA/offline application shell | Storage Architecture |
| Current giant context gets decomposed | Phase 0 |
| Stable globally unique IDs, including script/AV entities | Phase 0 |
| Duplicate nested IDs fixed | Phase 0 |
| Schema migrations | Phase 0 |
| Tests / stronger CI | Phase 0 |
| Product rebrand deferred | Header + deferred decisions |
| Architecture remains rename-neutral | Branding neutrality |
| AI agents receive icon audit responsibilities | Asset Agent Checklist |
| AI agents receive ownership/dependency rules | Agent Workstreams + coordination |
| Future continuity | Future Continuity Module |
| Future sun planning | Future Sun Planning |
| Reusable production templates | Future Templates |
| Non-script production segments / songs / acts | Core Production Domain + Run of Show |
| Script order remains separate from shooting order | Scheduling / Stripboard |
| Classic compact stripboard / one-line schedule | Scheduling / Stripboard |
| Named setup/master-plan revisions (“freeze”) | Master Locations / Named Revisions |
| Department breakdown reports | Script Intelligence |
| Reusable composite floor-plan assemblies | Floor Plan Engine / Asset Library |
| Exact truss profile/self-weight data | Truss Builder |
| Rigging loads include PA/video/scenery, not only lights | Truss Builder / Rigging |
| Generic equipment profile separate from plan placement | Core Production Domain |
| Plan elements link to canonical characters/people/equipment/fixtures/breakdown items instead of relying on names | Core Production Domain / Semantic plan links |
| Physical connector separated from carried protocol | Technical Port / Connection System |
| DMX auto-patch strategies and mode-change warnings | DMX 2.0 |
| Physical vs packed logistics volume | Equipment Logistics |
| Derived call-sheet data + editable overrides | Call Sheets / Production Sheets |
| Published call-sheet stable revisions | Call Sheets / Named Revisions |
| Guest collaboration without mandatory permanent account | Sharing |
| Static frontend + optional separate server deployment | Collaboration Architecture / Static Contract |
| Share/deep links work when opened directly on static hosts | Static Build Contract |
| Import-as-copy vs restore semantics avoid ID collisions | Storage / Project-package import |
| Human-readable shared project history | Collaboration / Activity History |
| Autosave/recovery/save status | Storage Architecture |
| Optional local file/folder project provider | Storage Architecture |
| Collaboration account identity separate from cast/crew Person | Core Production Domain / Collaboration |
| Company-move travel-time calculation as optional provider | Scheduling / Stripboard |
| Power / rigging / logistics technical reports | Technical planning modules |
| Semantic domain validation after collaborative merge | Local-First Realtime Sync |
| Canonical units with metric/imperial display conversion | Core Production Domain |
| On-set/show-day mode works without collaboration server | Future On-Set / Show-Day Mode |
| Comments/review notes work in standalone mode and sync when shared | Comments and Review |
| Current GPL-3.0 license is baseline; future licensing decision deferred | Repository Baseline / Decision Log |

If a future revision removes or materially changes one of these rows, document why in the decision log/release notes rather than silently dropping the requirement.
