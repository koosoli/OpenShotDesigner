# Open Shot Designer

<div align="center">

<img src="logo/big.png" alt="Open Shot Designer" width="320" />

[![Sponsor on GitHub](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/koosoli)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-support-ffdd00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/koosoli)
[![Live Demo](https://img.shields.io/badge/Live_Demo-Try_it_now-00C853)](https://koosoli.github.io/OpenShotDesigner/)

</div>

A free, open-source 2D film floor plan, **lined script**, and shot list designer. Import your screenplay, line it for coverage, block scenes, plan camera moves, and export production-ready paperwork — entirely in your browser.

**Try it live:** <https://koosoli.github.io/OpenShotDesigner/>

---

## Features

### Lined script

- **Import a real screenplay** — `.fountain`, Final Draft `.fdx`, or plain `.txt`, plus a paste box for a quick scene. Everything is reformatted into **standard Hollywood layout** (Courier, 60-column page, scene headings flush left, dialogue and character cues on the proper indents).
- **Scene numbers detected automatically** — from production-draft sluglines (`8   INT. LOFT - NIGHT   8`), Fountain forced numbers (`#8A#`), or the Final Draft scene-number attribute. New shots inherit the detected scene number.
- **Highlight anything to make a shot** — select as little as a single word or as much as several speeches; the selection becomes a shot with its own camera on the floor plan, and the classic **vertical lining line** is drawn beside the text with the shot number in a bubble.
- **Line shots you already have** — the script icon on any shot in the shot list jumps to the script and asks you to highlight the covered text, or pick the shot from "Line existing shot…" in the selection bar.
- **Descriptions on the lining** — whatever you type (or set as the shot's framing note) is written along the line, the way it is on a hand-lined script.
- **Proper lining conventions** — lines start and end on a crossbar, and only get an arrowhead when you mark the shot as *continuing on the next page*. Any stretch where the subject leaves frame can be drawn as a **squiggle**, down to a few words.
- **Adjustable coverage** — drag the round handles on a selected lining to extend or shorten it, or grow it to the current selection.
- **One script, every scene** — the screenplay belongs to the production, so it stays open when you add or switch scenes, and the lined script shows the coverage of *all* scenes at once. Clicking a lining jumps to the scene that owns it.

### Floor plan & blocking

- **Top-down floor plan canvas** — drag actors, cameras, and props onto a scaled room; move, resize, and rotate anything.
- **Waypoint animation** — set multiple waypoints for actors and cameras, add rotation per waypoint, and watch a ghost preview of the move along the path.
- **Camera coverage** — FOV cones with configurable angle, focal length, and distance; easy match-frame blocking.
- **Reference images** — overlay set photos or blueprints as background images, with drag, resize, aspect-lock, opacity, and per-image visibility toggles.
- **Props & lighting** — furniture presets (tables, chairs, doors, windows…), light sources with beam wedges, C-stand flags, and measurement lines.
- **Display & label controls** — toggle per-category labels, colors, and declutter options (waypoints, paths, FOV cones, light beams).
- **Multi-select & align** — select several elements to align or distribute them evenly.

### Shot list

- **Cards or production table** — two views of the same list, with inline editing of shot number, name, camera, size, lens, movement, angle, takes, and status.
- **All scenes on demand** — off by default; switch it on to see and edit every scene's shots in one list, each tagged with its scene. Selecting a shot from another scene switches to it.
- **Insert between shots** — inserting after a shot always creates a *new* shot with its own camera on the floor plan (as a letter, `1A`, or with the rest renumbered) — it never overwrites the neighbouring setup.
- **Synced with the canvas** — selecting a camera selects its shot, and deleting a camera removes its shots and their linings.

### Small screens & touch

- **Adaptive toolbars** — controls shrink on tablets; on phones the tool palette keeps the primary tools and moves the rest into a "More tools" flyout, and the navbar's secondary controls collapse into an overflow menu. The palette fits its height instead of scrolling.
- **Bottom-sheet panels** — on phones the shot list / script / inspector become a bottom sheet with peek, half, and full heights.
- **Touch gestures** — two-finger pinch to zoom and pan the floor plan, with the point under your fingers staying put.

### Everything else

- **Undo / redo** — full history with keyboard shortcuts.
- **Export** — lined script, blueprint PNG (up to 3× with a stamped title block), print view (PDF via browser), CSV shot list (per scene or full production), and JSON project backup/restore.
- **Dark & light themes** — everything persists locally in your browser.

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

## Usage

1. **Choose the active scene** from the scene list, or add a new one.
2. **Import your screenplay** in the Script tab (`.fountain`, `.fdx`, `.txt`, or paste it) — it is reformatted into standard screenplay layout.
3. **Add a room** — draw a floor plan outline or drop a reference image.
4. **Line the script** — highlight the text a shot covers and press **Make Shot**; a camera lands on the floor plan and a lining line appears next to the text. Use **Line existing shot…** to attach a shot you already created.
5. **Block the scene** — drag elements, resize/rotate them, and add waypoints to plan moves.
6. **Refine the coverage** — drag a lining's handles to extend it, add a squiggle where the subject is out of frame, and mark shots that continue onto the next page.
7. **Polish & present** — tweak display settings, then export the lined script, blueprint PNG, PDF, or CSV for your crew.

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
| `Esc` | Deselect / close overlays |

## Export Formats

| Format | What you get |
| --- | --- |
| **Lined script** | The screenplay with every scene's linings, shot bubbles, and descriptions. Prints the **lined portions only** by default (with `⋯` where material is skipped) — switch to "Full screenplay" for the whole script |
| **PNG** | High-resolution blueprint render (1×/2×/3×) with a title block |
| **Print view (PDF)** | Page-ready layout — print or "Save as PDF" from your browser |
| **CSV** | Shot list spreadsheet (per scene, or all scenes in one file) |
| **JSON** | Full project backup — import to restore or share |

## Project Structure

```
src/
├── components/
│   ├── canvas/        # Floor plan canvas, actors, cameras, props, lighting, grid
│   ├── script/        # Screenplay parser, lined script page, script panel
│   ├── toolbar/       # Top navbar, left tool palette
│   ├── shotlist/      # Shot list (cards + production table)
│   ├── inspector/     # Right sidebar: scene inspector, waypoints
│   ├── export/        # Print view & export modal
│   └── ...
├── context/           # Global state (project, screenplay, selection, history)
├── constants/         # Presets (framing, props, lighting)
├── utils/             # Export helpers (PNG, CSV, JSON), responsive breakpoints
└── types/             # Shared TypeScript types
```

## License

Released under the [GNU General Public License v3.0](LICENSE).

## Support

Open Shot Designer is free — if it helps your productions, consider supporting development:

- [Sponsor on GitHub](https://github.com/sponsors/koosoli)
- [Buy Me a Coffee](https://buymeacoffee.com/koosoli)
