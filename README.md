# Open Shot Designer

<div align="center">

<img src="logo/big.png" alt="Open Shot Designer" width="320" />

[![Sponsor on GitHub](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/koosoli)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-support-ffdd00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/koosoli)
[![Live Demo](https://img.shields.io/badge/Live_Demo-Try_it_now-00C853)](https://koosoli.github.io/OpenShotDesigner/)

</div>

A free, open-source 2D film floor plan & shot list designer. Block scenes, plan camera moves, and export production-ready blueprints — entirely in your browser.

**Try it live:** <https://koosoli.github.io/OpenShotDesigner/>

---

## Features

- **Top-down floor plan canvas** — drag actors, cameras, and props onto a scaled room; move, resize, and rotate anything.
- **Waypoint animation** — set multiple waypoints for actors and cameras, add rotation per waypoint, and watch a ghost preview of the move along the path.
- **Camera coverage** — FOV cones with configurable angle, focal length, and distance; easy match-frame blocking.
- **Reference images** — overlay set photos or blueprints as background images, with drag, resize, aspect-lock, opacity, and per-image visibility toggles.
- **Props & lighting** — furniture presets (tables, chairs, doors, windows…), light sources with beam wedges, and measurement lines.
- **Display & label controls** — toggle per-category labels, colors, and declutter options (waypoints, paths, FOV cones, light beams).
- **Multi-select & align** — select several elements to align or distribute them evenly.
- **Shot list timeline** — add, reorder, and time shots; export a production-ready shot list.
- **Undo / redo** — full history with keyboard shortcuts.
- **Export** — PNG (up to 3× with a stamped title block), print view (PDF via browser), CSV shot list (per scene or full production), and JSON project backup/restore.
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
2. **Add a room** — draw a floor plan outline or drop a reference image.
3. **Drop in actors & cameras** — select a tool from the left toolbar and click to place elements on the canvas.
4. **Block the scene** — drag elements, resize/rotate them, and add waypoints to plan moves.
5. **Build your shot list** — select a camera and add shots with framing presets.
6. **Polish & present** — tweak display settings, then export PNG/PDF/CSV for your crew.

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
| **PNG** | High-resolution blueprint render (1×/2×/3×) with a title block |
| **Print view (PDF)** | Page-ready layout — print or "Save as PDF" from your browser |
| **CSV** | Shot list spreadsheet (per scene, or all scenes in one file) |
| **JSON** | Full project backup — import to restore or share |

## Project Structure

```
src/
├── components/
│   ├── canvas/        # Floor plan canvas, actors, cameras, props, lighting, grid
│   ├── toolbar/       # Top navbar, left tool palette
│   ├── inspector/     # Right sidebar: scene inspector, shots, waypoints
│   ├── export/        # Print view & export modal
│   └── ...
├── context/           # Global state (project, selection, history, display settings)
├── constants/         # Presets (framing, props, lighting)
├── utils/             # Export helpers (PNG, CSV, JSON)
└── types/             # Shared TypeScript types
```

## License

Released under the [GNU General Public License v3.0](LICENSE).

## Support

Open Shot Designer is free — if it helps your productions, consider supporting development:

- [Sponsor on GitHub](https://github.com/sponsors/koosoli)
- [Buy Me a Coffee](https://buymeacoffee.com/koosoli)