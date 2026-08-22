# Open Shot Designer

<div align="center">

<img src="logo/big.png" alt="Open Shot Designer" width="320" />

[![Sponsor on GitHub](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/koosoli)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-support-ffdd00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/koosoli)
[![Live Demo](https://img.shields.io/badge/Live_Demo-Try_it_now-00C853)](https://koosoli.github.io/OpenShotDesigner/)

</div>

A free, open-source production planning suite for directors, DPs and ADs: **lined script**, **floor plan**, **shot list**, **storyboard** and **equipment manifest**, plus **scheduling**, **call sheets**, **crew and cast**, **locations**, **task board**, **mood boards**, **logistics**, **rigging** and **power** — all in one browser tab. Import a screenplay, line it for coverage, block the scene, plan the camera moves, shoot storyboard frames with your own camera, schedule the shoot, and export production-ready paperwork. No account, no backend — everything lives in your browser.

A screenplay is optional: nothing outside the script tools requires one, so concert, broadcast, event and pure technical floor plans work the same way.

**Try it live:** <https://koosoli.github.io/OpenShotDesigner/>

---

## How it fits together

A shot exists in four places at once, and every view edits the same thing:

| View | What it is | How it connects |
| --- | --- | --- |
| **Script** | The screenplay, lined for coverage | Each lining *is* a shot |
| **Board** | One storyboard frame per shot | Same shots, its own frame order |
| **Shot List** | The production table / coverage cards | Same shots, its own running order |
| **Floor plan** | Cameras, actors, props, lights | Each shot's camera is a position on the plan |
| **Equipment** | Production gear manifest | Cameras, lights, props & track on the plan become line items |
| **Schedule** | Stripboard, calendar, call sheets, coverage | Scenes *and* setups are schedulable; call sheets derive from the day |
| **Crew** | Crew, cast & contacts | Key roles feed the paperwork; cast link to script characters |

Line a speech in the script and a camera lands on the floor plan, a row appears in the shot list, and a frame appears on the board. Delete that camera and all three go with it.

---

## A look around

Every screenshot below is the app running the bundled example production — the
one you get by ticking **"Start with the example scenes"**, or from
**Templates → Fill empty modules with examples** in a project you already have.

### Block the scene, and the shot list writes itself

![Floor plan and shot list](docs/screenshots/floor-plan.png)

Cameras, actors, lights, props and walls on a scaled plan, with movement paths
drawn as you set them. Each camera on the plan *is* a row in the shot list — and
a lining in the script, and a frame on the board.

### Line the script for coverage

![Lined script](docs/screenshots/lined-script.png)

Import a screenplay, highlight what a shot covers, and the classic vertical
lining appears next to the text while a camera lands on the plan.

### Storyboard, from drawings or your own camera

![Storyboard](docs/screenshots/storyboard.png)

One frame per shot — and one per camera keyframe, so a move is boarded at its
start, each waypoint and its end. Drop artwork in, or shoot the frame through
the simulated viewfinder with the device camera on the recce.

### The gear list builds itself from the plan

![Equipment manifest](docs/screenshots/equipment.png)

Every camera becomes an expandable package with the scene's actual lenses and
rig; lights carry their Kelvin, intensity and beam angle; track, props and
cables all appear automatically. Export as a truck manifest or a spreadsheet.

### Schedule it like an AD

![Stripboard scheduling](docs/screenshots/schedule.png)

A real strip board: shooting days, drag-or-tap placement from the unscheduled
pool, time estimates, meal and company-move banners, day totals and conflict
warnings. Scenes, setups *and* individual shots are all schedulable — so a
project with no screenplay schedules just as well.

### Issue the call sheet

![Call sheet](docs/screenshots/call-sheet.png)

A live paper preview with readiness warnings: crew call, locations with map
links, scheduled cast, weather, parking, nearest hospital, safety bulletin,
transport and per-person pick-ups, and a next-day look-ahead.

And this is what comes out of the printer — the same data, laid out for paper:

![Printed call sheet](docs/screenshots/call-sheet-print.png)

### Crew, cast and the key roles

![Crew and cast](docs/screenshots/crew.png)

Assign Director, DP, 1st AD, Gaffer and the rest by role — the same fields the
scene inspector and every export read, so they cannot drift apart. Cast link to
screenplay characters, which are detected from the script automatically.

### Power, per truss and per phase

![Power planning](docs/screenshots/power.png)

Sources, circuits and consumers with headroom, load broken down per truss run
and per distro zone, and 3-phase leg assignment with a balance readout. Unknown
wattages stay unknown — they are never counted as zero.

### Locations, on a real map

![Locations](docs/screenshots/locations.png)

Drop a pin and the address fills itself in, or geocode from the address. Keyless
OpenStreetMap, so it works in the static build with no API key.

### Mood boards and the task board

![Mood board](docs/screenshots/moodboard.png)

![Task board](docs/screenshots/tasks.png)

Boards from local files or URLs with a free-form collage and dominant-colour
palette extraction; and a kanban with due dates, priorities, checklists and crew
assignees grouped by department.

### Print the whole package

![Export and print studio](docs/screenshots/export.png)

Floor plan, shot list, gear manifest, DMX patch, storyboards, lined script,
breakdown reports, sides, stripboard, coverage matrix, contact list and mood
board — in one print job, with your production logo on the paperwork.

## Features

### Projects & Setup

- **Project dashboard** — every production you have worked on in this browser, with scene and shot counts, whether it carries a screenplay, and when it was last saved. Reachable any time from the grid button in the top bar (or "All projects" in the overflow menu on small screens).
- **Instant blocking bootstrap** — every new project and scene setup immediately starts with **Camera A** and **Actor A** pre-positioned in direct line of sight with default **Shot 1 (Medium Shot)**, so you can begin blocking immediately.
- **Start with sample scenes** — tick the box to start from the bundled example scenes: a dialogue master + shot/reverse and a two-camera interrogation, complete with pre-lined screenplays.
- **Manage them** — open, rename, duplicate, download as a project file, or delete, straight from the dashboard.
- **Import lands beside your work** — importing a `.json` project file adds it as its own project instead of overwriting the one you have open.
- **Safe storage** — each project is stored under its own key, so one production with heavy embedded storyboards can't push the others out.

### Lined Script & Screenplay Suite

- **Lined Coverage view** — standard Hollywood layout (Courier, 60-column page) with fluid auto-scaling that dynamically fills available panel or fullscreen space.
- **Screenplay Editor** — write and format scripts directly inside the browser with authentic 12pt Hollywood Courier formatting.
  - **Natural Enter flow** — `Scene Heading` ➔ `Action` ➔ `Character` ➔ `Parenthetical` ➔ `Dialogue` ➔ `Action`.
  - **Smart blank conversions** — pressing <kbd>Enter</kbd> on empty cues seamlessly converts Parentheticals to Dialogue, empty Characters to Action, and empty Actions to Scene Headings.
  - **Tab cycling** — press <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> to cycle across all 6 screenplay element types.
  - **Fountain mode** — toggle between WYSIWYG Page View and raw Fountain syntax markdown code.
- **AV Script (2-Column Audio/Visual)** — dedicated production AV table for commercials, documentaries, and multicam setups. Synchronized bidirectionally with floor plan cameras and lined coverage.
- **Scene numbers detected automatically** — from production-draft sluglines (`8   INT. LOFT - NIGHT   8`), Fountain forced numbers (`#8A#`), or Final Draft scene attributes.
- **Highlight anything to make a shot** — select as little as a single word or multiple speeches; the selection creates a shot on the floor plan with classic vertical lining lines.
- **Persistent text selection** — text highlights remain active and preserved across panel interactions.
- **Adjustable coverage** — drag round handles on a selected lining to extend or shorten it, or grow it to the current selection.

### Floor plan & blocking

- **Top-down floor plan canvas** — drag actors, cameras, and props onto a scaled room; move, resize, and rotate anything.
- **Full screen overlay** — dedicated full screen toggle (`Maximize2` / `Minimize2` or <kbd>Esc</kbd> to exit) across Shot List, Storyboard Board, Script, and Inspector.
- **Waypoint animation** — set waypoints for actors, cameras, props **and lights**, add rotation per waypoint, and watch a ghost preview of the move along the path. Fixtures move too: followspots track, practicals ride a dolly, and an event rig repositions between numbers.
- **Group animation** — group any selection (right-click → Group) to rotate it rigidly around a shared pivot and animate the whole group with keyframes. The motion path draws on the plan as a dashed run with numbered, draggable keyframe dots.
- **Camera coverage** — FOV cones with configurable angle, focal length, and distance; easy match-frame blocking.
- **Storyboard thumbnails on the plan** — a shot's artwork sits beside its camera on a leader line and can be dragged anywhere on the canvas.
- **Basic shapes & architectural walls** — walls, doors, windows, rectangles, circles, ellipses, triangles, diamonds, and stars for blocking zones and callout areas.
- **Reference images** — overlay set photos or blueprints as background images with drag, resize, opacity, and visibility toggles.
- **Props & lighting** — furniture presets, light sources with beam wedges, measurement lines, and the full grip range of C-stand modifiers: solid, silk, net and cutter flags plus **cucoloris (cookie)**, **branchaloris** and **barn doors / framing shutters** with an adjustable cut angle.
- **Streets & roads** — draw a carriageway with real width the way you draw a dolly track: straight or curved, six surfaces (asphalt, concrete, cobble, gravel, dirt, rail/tram), lane dividers, centre markings including a zebra crossing, optional pavements and a street name laid along the run.
- **Readable by default** — camera FOV cones and light beams start switched off so a fresh plan is legible; both are one toggle away in Inspector → Display.
- **Production logo** — upload a logo in the inspector's Production Details or on the call sheet; stamped on printed plans, call sheets, reports and PNG blueprints.

### Shot list

- **Cards or production table** — two views of the same list, with inline editing of shot number, name, camera, size, lens, movement, angle, takes, and status.
- **All scenes on demand** — off by default; switch it on to see and edit every scene's shots in one list, each tagged with its scene. Selecting a shot from another scene switches to it.
- **Insert between shots** — inserting after a shot always creates a *new* shot with its own camera on the floor plan (as a letter, `1A`, or with the rest renumbered) — it never overwrites the neighbouring setup.
- **Camera assignment keeps your blocking** — the CAM dropdown lists every camera letter on the floor plan (A, B, C…) plus **"+ New camera"**. Switching a shot from A to B re-letters the camera already blocked for that shot **where it stands** — the camera never respawns somewhere else, and camera B's own position is untouched. If other shots share that camera position, it is copied in place for this shot alone.
- **Synced with the canvas** — selecting a camera selects its shot, and deleting a camera removes its shots and their linings.

### Storyboard & viewfinder camera

- **A tab of its own** — "Board" sits between Shot List and Script: the scene as a wall of frames, one per shot.
- **Same data as everything else** — "Add frame" creates a shot *and* drops its camera on the floor plan; shots added in the shot list or lined from the script appear here automatically, blank until artwork is attached.
- **Artwork** — drop an image on a frame (or click it to browse), toggle fill/fit, replace, or clear it. Frames without art stay blank on purpose. Each frame also has a viewfinder button, so you can open that shot's finder and shoot the frame with the device camera.
- **A frame per camera keyframe** — a shot gets one frame for every position its camera holds: **Start**, one per waypoint (**Beat 2**, **Beat 3**…), and **End**. They sit side by side on the card with the move named above them, are boarded independently, and all of them print. Frames can be added from three places: the board, the **camera inspector** (one uploader per keyframe), or the picture button on each waypoint row. On the floor plan every frame's thumbnail hangs off the camera position it belongs to, and the viewfinder has a Frame switch (with a green dot on the keyframes already boarded) so a capture lands exactly where you mean. Adding or removing a waypoint never re-shuffles the artwork already attached.
- **Rearrange freely** — drag a frame by its handle to arrange the board. The board keeps its **own** order: rearranging frames never reshuffles the shot list.
- **Descriptions in place** — edit the shot name and description on the frame; they are the same fields the shot list and lined script show.
- **Aspect ratio** — switch the whole board between 16:9, 2.39:1, 1.85:1, 4:3, and 9:16; frames (and the storyboard thumbnails on the floor plan) reframe to match.
- **Export from the tab** — the board's Export button opens the print studio straight on the storyboard contact sheet. The Script and Shot List tabs have the same shortcut to their own export.
- **Simulated optical finder** — the framing for any camera, with rule of thirds, crosshair, 90% action / 80% title safe, and a cinema HUD.
- **Shows the storyboard** — when the shot has artwork it fills the frame (toggle it with **Board**), so the drawing and the blocking can be compared side by side.
- **Live camera** — opens the device's own camera (laptop webcam, phone or iPad, front/rear switchable) inside the frame, with every guide drawn on top. A round shutter sits on the picture; **Space** or **Enter** fires it too.
- **Freeze, then keep** — capture locks the finder on the exact moment taken (**CAPTURED FRAME**, with **Retake** to go back live) and stores it, cropped to the camera's aspect ratio, as that shot's storyboard. If the camera has no shot yet, one is created for it automatically.
- **Editable camera settings** — iris/T-stop, ISO, shutter angle (with the matching shutter speed), frame rate, ND, sensor, aspect ratio and camera height are editable from the HUD *and* from the camera inspector, and are stored per camera.
- **Photos stay small** — every storyboard image (captured, dropped, or picked from a file) is downscaled on the way in, so a phone-sized photo can't blow the browser's storage.

### Equipment manifest

- **Derived straight from the plan** — every camera letter on the floor plan becomes one expandable **Camera package** (batteries, media, monitor, wireless TX, follow focus) carrying the scene's actual lenses, rigs, and sensor; lights become fixtures with their Kelvin, intensity, and beam angle; props, dolly track, and rig systems all appear automatically.
- **Current scene or whole production** — switch between the active scene's manifest and an **All Scenes master truck package** that rolls every setup's gear into one list.
- **Spreadsheet or cards** — a production-table data grid (default) or department rubric cards, both editable inline.
- **Find anything fast** — search gear, brands, models, and packages, or filter by color-coded department (Camera, Lighting, Grip, Sound, Power & Media, Cables, Props, Expendables, Other) with live unit counts.
- **Fast Add presets** — one-click common production gear (batteries, SD cards, cables, tape, clamps…) straight into the scene, plus a full department **brand/model catalog** and camera package presets when you add custom gear.
- **Expandable kits** — camera packages open into their line items; add accessories, edit quantities, roles, and specs, or reset a scene back to the floor plan defaults.
- **Export & print** — download the manifest as an Excel/CSV spreadsheet (per scene or all scenes) or print a production-ready truck manifest from the export studio.

### Scheduling & call sheets

- **Stripboard** — an AD's strip board with shooting days, drag-or-tap placement from a searchable unscheduled pool, editable time estimates, day breaks, meal/move/rehearsal banners, per-day totals and conflict warnings.
- **Schedule what you actually have** — screenplay scenes *and* floor-plan setups are both schedulable, and so are individual shots or multi-selected shot groups, so a project with no script schedules just as well.
- **Production calendar** — a ranged timeline of prep, shoot, post and delivery, plus a month grid with event categories, status and assignees.
- **Call sheets** — a day picker with a live paper preview and readiness warnings: crew call, locations with map links, scheduled cast, weather, parking, nearest hospital, safety bulletin, **transport and per-person pick-ups** (time, who, from where), general notes and a next-day look-ahead.
- **Coverage matrix** — plan what every camera is responsible for at each moment. Rows follow the run-of-show cue list or are added freely; columns are discovered from the cameras on the plan.
- **Printable** — stripboard, calendar, coverage and each day's call sheet all print, with the production logo and strip colours.

### Crew, cast & contacts

- **Crew tab** — people with department, role, phone, email, company, rate, address, emergency contact and **hotel booking** (name, address, check-in/out), grouped by department.
- **Key crew** — assign Director, DP, Producer, 1st AD, Gaffer, Key Grip, Sound Mixer and more by role. Director and DP are the same fields the scene inspector and every export use, so the two can never drift apart.
- **Cast ↔ characters** — link a performer to a screenplay character; characters are auto-detected from the attached script, and casting works with no script at all.
- **CSV in and out**, plus a printable contact list with a cast list and an accommodation table.

### Locations, tasks, mood boards & logistics

- **Locations** — sites with type, address, notes and contacts; drop a pin on a keyless OpenStreetMap and the address fills itself in (or geocode from the address), with link-outs to OSM and Google Maps.
- **Task board** — a kanban with due dates, priorities, labels, checklists and **crew assignees grouped by department**, with drag and touch moves.
- **Mood boards** — boards, sections and cards from local files or URLs, a free-form collage you arrange by dragging, dominant-colour palette extraction, and printing.
- **Logistics** — cases and containers with tare weight, payload and volume, packed items, and utilisation that propagates unknowns instead of inventing zeros.

### Technical: DMX, rigging & power

- **Fixture database** — brand/model pickers merging curated film fixtures with an Open Fixture Library snapshot and your own profiles; linking a model brings measured watts, weight, size and DMX modes. Wattage is never guessed from a model name.
- **DMX patching** — universes, start addresses and explicit mode footprints, with 512-crossing, overlap and overflow detection, plus a printable patch sheet.
- **Rigging** — truss profiles and runs, motors, hang points and suspended loads with per-truss load totals. Unknown weights stay unknown.
- **Power** — sources, circuits and consumers with headroom, **load per truss run and per distribution zone**, and **3-phase leg assignment with a phase-balance readout**. A leg nobody assigned is excluded rather than silently loaded onto L1.
- **Cable runs** — lengths follow the drawn route, and a run attached to a device that moves is measured at its furthest position, so the cable is long enough for the take rather than for the mark.
- All of it is a planning aid, not an electrical or structural certification.

### Reports & exports

- **Script breakdown** — scenes, characters, locations and a day-out-of-days report.
- **Sides** — per-day or per-selection sides with a character filter, in Courier.
- **Complete package** — one print job with the floor plan, shot list, equipment manifest, DMX patch, storyboards, lined script, breakdown reports, sides, stripboard, coverage matrix, contact list and mood board. Sections with no data are skipped.

### Small screens & touch

- **Adaptive toolbars** — controls shrink on tablets; on phones the tool palette keeps the primary tools and moves the rest into a "More tools" flyout, and the navbar's secondary controls collapse into an overflow menu. The palette fits its height instead of scrolling.
- **Bottom-sheet panels** — on phones the shot list / board / script / inspector become a bottom sheet with peek, half, and full heights.
- **Touch gestures** — two-finger pinch to zoom and pan the floor plan, with the point under your fingers staying put. Tap the first and last line to select script text without a keyboard.

### Everything else

- **Undo / redo** — full history with keyboard shortcuts.
- **Dark & light themes** — everything persists locally in your browser.
- **Exports** — lined script, storyboard, blueprint PNG, print/PDF, CSV, JSON and a complete production package; see the table below.
- **Works offline** — a service worker caches the app shell, and nothing needs a server.
- **Show only what you need** — workspace presets and per-tab switches hide the modules a given production does not use.

## Usage

1. **Create or open a project** from the dashboard (the grid button in the top bar) — it opens automatically the first time you run the app.
2. **Choose the active scene** from the scene list, or add a new one.
3. **Import your screenplay** in the Script tab (`.fountain`, `.fdx`, `.txt`, or paste it) — it is reformatted into standard screenplay layout.
4. **Add a room** — draw a floor plan outline or drop a reference image.
5. **Line the script** — highlight the text a shot covers and press **Make Shot**; a camera lands on the floor plan and a lining line appears next to the text. Use **Line existing shot…** to attach a shot you already created.
6. **Block the scene** — drag elements, resize/rotate them, and add waypoints to plan moves.
7. **Refine the coverage** — drag a lining's handles to extend it, add a squiggle where the subject is out of frame, and mark shots that continue onto the next page.
8. **Fill the board** — drop artwork on the frames, or open the viewfinder and shoot them with your camera on the recce.
9. **Build the crew** — add people on the Crew tab and assign the key roles; Director and DP flow straight into every export.
10. **Schedule it** — drag scenes, setups or shots onto shooting days in the Schedule tab, then fill in each day's call sheet.
11. **Polish & present** — tweak display settings, then export the lined script, storyboard, blueprint PNG, PDF, CSV, or the complete package for your crew.

New to it? **Templates → Fill empty modules with examples** loads a worked example production into whatever the current project is still missing — crew, shooting days, call sheets, locations, tasks, mood board, rigging and power. It only fills what is empty and never touches anything you have already made.

## Lining a script — quick reference

| Action | How |
| --- | --- |
| Make a shot from the script | Select any text (a word to several speeches) → **Make Shot** |
| Line a shot that already exists | Script icon on the shot in the shot list, or **Line existing shot…** in the selection bar |
| Select on touch | Tap the first line, tap the last line |
| Extend / shorten a lining | Select the lining, drag the round handle at either end (or **Extend to selection**) |
| Mark out-of-frame | Select the lining, highlight the stretch → **Squiggle selection** |
| Continue onto the next page | Select the lining → **Continues next page** (adds the arrowhead) |
| Describe the shot on the line | Type in the lining's description field, or set the shot's framing note |
| Remove a lining | Hover the lining → trash icon (removes the shot too), or **Unline** to keep the shot |

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `?` | Toggle the keyboard shortcuts overlay |
| `Ctrl/⌘ + Z` | Undo |
| `Ctrl/⌘ + Shift + Z` | Redo |
| `Delete` / `Backspace` | Delete selected element |
| `Ctrl/⌘ + D` | Duplicate selected element(s) |
| `R` | Rotate (per selected waypoint) |
| `Shift + Space` | Quick asset search |
| `Space` / `Enter` | Shutter, while the viewfinder's live camera is running |
| `Esc` | Deselect / close overlays |

## Export Formats

| Format | What you get |
| --- | --- |
| **Lined script** | The screenplay with every scene's linings, shot bubbles, and descriptions. Prints the **lined portions only** by default (with `⋯` where material is skipped) — switch to "Full screenplay" for the whole script |
| **Storyboard** | Contact sheet of the scene's frames in board order, with shot number, camera, description, and blank frames where there is no art yet |
| **Equipment manifest** | Scene or all-scenes master truck package — print sheet (PDF) or CSV/Excel spreadsheet |
| **PNG** | High-resolution blueprint render (1×/2×/3×) with a title block carrying your production logo |
| **Print view (PDF)** | Page-ready layout — print or "Save as PDF" from your browser |
| **CSV** | Shot list spreadsheet (per scene, or all scenes in one file) |
| **Call sheet** | Per-day sheet with crew call, locations, cast, transport & pick-ups, weather, safety and a next-day look-ahead |
| **Stripboard / calendar / coverage** | The schedule as an AD board, a calendar, or the multi-camera coverage grid |
| **Script reports** | Breakdown by scene, character and location, plus a day-out-of-days |
| **Sides** | Per-day or per-selection sides in Courier, filterable by character |
| **Contact list** | Departments, cast list and accommodation table |
| **DMX patch** | Universe patch sheet with modes, start/end addresses and footprints |
| **Complete package** | Everything above that has data, in one print job |
| **JSON** | Full project backup — import to restore or share |

Projects are stored in your browser's IndexedDB (with a `localStorage` fallback) and images live in a content-addressed asset store, so **download a JSON backup** before clearing site data or moving to another machine.

## Tech Stack

- [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Vite 6](https://vitejs.dev)
- [Tailwind CSS v4](https://tailwindcss.com)
- [lucide-react](https://lucide.dev) icons
- Zero backend — all data lives in your browser's `localStorage`.

## Getting Started

```bash
# install dependencies
npm install

# start the dev server (http://localhost:3000)
npm run dev

# type-check
npm run lint

# production build
npm run build

# regenerate the README screenshots (needs the dev server running)
node scripts/capture-screenshots.mjs

# preview the production build locally
npm run preview
```

> Note: the existing `node_modules` may already be present; if not, `npm install` will set everything up.

## Deploying to GitHub Pages

This repo includes a ready-to-use workflow (`.github/workflows/deploy.yml`). It builds the app with the correct base path and publishes it to GitHub Pages on every push to `main`.

To activate it:

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Done — every push to `main` redeploys automatically to <https://koosoli.github.io/OpenShotDesigner/>.

## Project Structure

```
src/
├── components/
│   ├── canvas/        # Floor plan: actors, cameras, props, lighting, roads, grid, storyboard thumbs
│   ├── script/        # Screenplay parser, lined script page, script panel
│   ├── storyboard/    # Storyboard board tab
│   ├── shotlist/      # Shot list (cards + production table)
│   ├── equipment/     # Equipment manifest (spreadsheet + cards, presets, packages)
│   ├── schedule/      # Stripboard, calendar, call sheets, coverage matrix
│   ├── contacts/      # Crew, cast & contacts with key-role assignment
│   ├── locations/     # Locations with a keyless OpenStreetMap picker
│   ├── tasks/         # Task board
│   ├── moodboard/     # Mood boards, collage, palette
│   ├── logistics/     # Cases, containers, packed items
│   ├── rigging/       # Truss runs, motors, suspended loads
│   ├── power/         # Sources, circuits, per-truss load, phase balance
│   ├── reports/       # Printable call sheets, stripboard, sides, breakdown, contact list
│   ├── viewfinder/    # Simulated finder + live device camera
│   ├── inspector/     # Plan & scene settings, and the selected-element inspector
│   ├── dashboard/     # Project dashboard (create / open / manage productions)
│   ├── timeline/      # Blocking playback bar
│   ├── toolbar/       # Top navbar, left tool palette, quick search
│   └── export/        # Print & export studio
├── domain/            # Business logic, framework-free and unit-tested
│   ├── people/        # Crew, cast, key production roles
│   ├── script/        # Breakdown, sides, omission, line reconciliation
│   ├── scheduling/    # Days, blocks, calendar, coverage, printable stripboard
│   ├── reports/       # Call sheet, crew sheet, day-out-of-days derivation
│   ├── fixtures/      # Fixture catalog, OFL adapter, custom profiles
│   ├── cable/         # Routed run length incl. device movement, signal flow
│   ├── power/         # Load, headroom, grouping, phase balance
│   ├── rigging/       # Truss loads
│   ├── plan/          # Group animation, freehand, visibility, speech
│   ├── migrations/    # Versioned, lossless project schema migrations
│   └── …              # locations, logistics, moodboard, tasks, assets, storage
├── context/           # Global state (project, screenplay, selection, history)
├── constants/         # Presets (framing, props, lighting, exposure)
├── utils/             # Project library, storyboard order, export helpers, image tools, breakpoints
└── types/             # Shared TypeScript types
```

Business logic lives in `src/domain/` rather than in components, every persisted
schema change ships a versioned migration with a fixture test, and missing
technical data stays `unknown` instead of being substituted with `0`. See
[`AGENTS.md`](AGENTS.md) for the full architectural rules.

## License

Released under the [GNU General Public License v3.0](LICENSE).

## Support

Open Shot Designer is free — if it helps your productions, consider supporting development:

- [Sponsor on GitHub](https://github.com/sponsors/koosoli)
- [Buy Me a Coffee](https://buymeacoffee.com/koosoli)
