# Open Shot Designer

<div align="center">

<img src="logo/big.png" alt="Open Shot Designer" width="320" />

[![Sponsor on GitHub](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/koosoli)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-support-ffdd00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/koosoli)
[![Live Demo](https://img.shields.io/badge/Live_Demo-Try_it_now-00C853)](https://koosoli.github.io/OpenShotDesigner/)

</div>

A free, open-source prep suite for directors and DPs: **lined script**, **floor plan**, **shot list**, and **storyboard** in one browser tab. Import a screenplay, line it for coverage, block the scene, plan the camera moves, shoot storyboard frames with your own camera, and export production-ready paperwork. No account, no backend — everything lives in your browser.

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

Line a speech in the script and a camera lands on the floor plan, a row appears in the shot list, and a frame appears on the board. Delete that camera and all three go with it.

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
- **Waypoint animation** — set multiple waypoints for actors and cameras, add rotation per waypoint, and watch a ghost preview of the move along the path.
- **Camera coverage** — FOV cones with configurable angle, focal length, and distance; easy match-frame blocking.
- **Storyboard thumbnails on the plan** — a shot's artwork sits beside its camera on a leader line and can be dragged anywhere on the canvas.
- **Basic shapes & architectural walls** — walls, doors, windows, rectangles, circles, ellipses, triangles, diamonds, and stars for blocking zones and callout areas.
- **Reference images** — overlay set photos or blueprints as background images with drag, resize, opacity, and visibility toggles.
- **Props & lighting** — furniture presets, light sources with beam wedges, C-stand flags, and measurement lines.
- **Production logo** — upload a logo in the inspector's Production Info; stamped on printed plans, call sheets, and PNG blueprints.

### Viewfinder & storyboard camera

- **Simulated optical finder** — the framing for any camera, with rule of thirds, crosshair, 90% action / 80% title safe, and a cinema HUD.
- **Shows the storyboard** — when the shot has artwork it fills the frame (toggle it with **Board**), so the drawing and the blocking can be compared side by side.
- **Live camera** — opens the device's own camera (laptop webcam, phone or iPad, front/rear switchable) inside the frame, with every guide drawn on top. A round shutter sits on the picture; **Space** or **Enter** fires it too.
- **Freeze, then keep** — capture locks the finder on the exact moment taken (**CAPTURED FRAME**, with **Retake** to go back live) and stores it, cropped to the camera's aspect ratio, as that shot's storyboard. If the camera has no shot yet, one is created for it automatically.
- **Editable camera settings** — iris/T-stop, ISO, shutter angle (with the matching shutter speed), frame rate, ND, sensor, aspect ratio and camera height are editable from the HUD *and* from the camera inspector, and are stored per camera.
- **Photos stay small** — every storyboard image (captured, dropped, or picked from a file) is downscaled on the way in, so a phone-sized photo can't blow the browser's storage.

### Shot list

- **Cards or production table** — two views of the same list, with inline editing of shot number, name, camera, size, lens, movement, angle, takes, and status.
- **All scenes on demand** — off by default; switch it on to see and edit every scene's shots in one list, each tagged with its scene. Selecting a shot from another scene switches to it.
- **Insert between shots** — inserting after a shot always creates a *new* shot with its own camera on the floor plan (as a letter, `1A`, or with the rest renumbered) — it never overwrites the neighbouring setup.
- **Camera assignment keeps your blocking** — the CAM dropdown lists every camera letter on the floor plan (A, B, C…) plus **"+ New camera"**. Switching a shot from A to B re-letters the camera already blocked for that shot **where it stands** — the camera never respawns somewhere else, and camera B's own position is untouched. If other shots share that camera position, it is copied in place for this shot alone.
- **Synced with the canvas** — selecting a camera selects its shot, and deleting a camera removes its shots and their linings.

### Storyboard board

- **A tab of its own** — "Board" sits between Shot List and Script: the scene as a wall of frames, one per shot.
- **Same data as everything else** — "Add frame" creates a shot *and* drops its camera on the floor plan; shots added in the shot list or lined from the script appear here automatically, blank until artwork is attached.
- **Artwork** — drop an image on a frame (or click it to browse), toggle fill/fit, replace, or clear it. Frames without art stay blank on purpose. Each frame also has a viewfinder button, so you can open that shot's finder and shoot the frame with the device camera.
- **A frame per camera keyframe** — a shot gets one frame for every position its camera holds: **Start**, one per waypoint (**Beat 2**, **Beat 3**…), and **End**. They sit side by side on the card with the move named above them, are boarded independently, and all of them print. Frames can be added from three places: the board, the **camera inspector** (one uploader per keyframe), or the picture button on each waypoint row. On the floor plan every frame's thumbnail hangs off the camera position it belongs to, and the viewfinder has a Frame switch (with a green dot on the keyframes already boarded) so a capture lands exactly where you mean. Adding or removing a waypoint never re-shuffles the artwork already attached.
- **Rearrange freely** — drag a frame by its handle to arrange the board. The board keeps its **own** order: rearranging frames never reshuffles the shot list.
- **Descriptions in place** — edit the shot name and description on the frame; they are the same fields the shot list and lined script show.
- **Aspect ratio** — switch the whole board between 16:9, 2.39:1, 1.85:1, 4:3, and 9:16; frames (and the storyboard thumbnails on the floor plan) reframe to match.
- **Export from the tab** — the board's Export button opens the print studio straight on the storyboard contact sheet. The Script and Shot List tabs have the same shortcut to their own export.

### Small screens & touch

- **Adaptive toolbars** — controls shrink on tablets; on phones the tool palette keeps the primary tools and moves the rest into a "More tools" flyout, and the navbar's secondary controls collapse into an overflow menu. The palette fits its height instead of scrolling.
- **Bottom-sheet panels** — on phones the shot list / board / script / inspector become a bottom sheet with peek, half, and full heights.
- **Touch gestures** — two-finger pinch to zoom and pan the floor plan, with the point under your fingers staying put. Tap the first and last line to select script text without a keyboard.

### Everything else

- **Undo / redo** — full history with keyboard shortcuts.
- **Dark & light themes** — everything persists locally in your browser.
- **Exports** — lined script, storyboard, blueprint PNG, print/PDF, CSV and JSON; see the table below.

## Usage

1. **Create or open a project** from the dashboard (the grid button in the top bar) — it opens automatically the first time you run the app.
2. **Choose the active scene** from the scene list, or add a new one.
3. **Import your screenplay** in the Script tab (`.fountain`, `.fdx`, `.txt`, or paste it) — it is reformatted into standard screenplay layout.
4. **Add a room** — draw a floor plan outline or drop a reference image.
5. **Line the script** — highlight the text a shot covers and press **Make Shot**; a camera lands on the floor plan and a lining line appears next to the text. Use **Line existing shot…** to attach a shot you already created.
6. **Block the scene** — drag elements, resize/rotate them, and add waypoints to plan moves.
7. **Refine the coverage** — drag a lining's handles to extend it, add a squiggle where the subject is out of frame, and mark shots that continue onto the next page.
8. **Fill the board** — drop artwork on the frames, or open the viewfinder and shoot them with your camera on the recce.
9. **Polish & present** — tweak display settings, then export the lined script, storyboard, blueprint PNG, PDF, or CSV for your crew.

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
| **PNG** | High-resolution blueprint render (1×/2×/3×) with a title block carrying your production logo |
| **Print view (PDF)** | Page-ready layout — print or "Save as PDF" from your browser |
| **CSV** | Shot list spreadsheet (per scene, or all scenes in one file) |
| **JSON** | Full project backup — import to restore or share |

Everything is stored in your browser's `localStorage`, so **download a JSON backup** before clearing site data or moving to another machine.

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
│   ├── canvas/        # Floor plan: actors, cameras, props, lighting, grid, storyboard thumbs
│   ├── script/        # Screenplay parser, lined script page, script panel
│   ├── storyboard/    # Storyboard board tab
│   ├── shotlist/      # Shot list (cards + production table)
│   ├── viewfinder/    # Simulated finder + live device camera
│   ├── inspector/     # Scene, element and production inspector
│   ├── dashboard/     # Project dashboard (create / open / manage productions)
│   ├── timeline/      # Blocking playback bar
│   ├── toolbar/       # Top navbar, left tool palette, quick search
│   └── export/        # Print & export studio
├── context/           # Global state (project, screenplay, selection, history)
├── constants/         # Presets (framing, props, lighting, exposure)
├── utils/             # Project library, storyboard order, export helpers, image tools, breakpoints
└── types/             # Shared TypeScript types
```

## License

Released under the [GNU General Public License v3.0](LICENSE).

## Support

Open Shot Designer is free — if it helps your productions, consider supporting development:

- [Sponsor on GitHub](https://github.com/sponsors/koosoli)
- [Buy Me a Coffee](https://buymeacoffee.com/koosoli)
