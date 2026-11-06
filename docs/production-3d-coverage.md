# Production asset preview coverage

The normal asset preview entry point resolves the shared library symbol ID or
the existing prop type to procedural geometry. Existing placements acquire
these models when the project opens. Live 3D and the virtual viewfinder consume
the same geometry, including the static SVG preview.

This pass prioritizes the stage, audio, grip and common location assets that
previously used a generic block.

- Stages, risers, runways, barriers, truss towers, goalposts, straight box,
  triangular and ladder trusses, junctions, base plates and circular truss.
- Speakers, suspended arrays, subwoofers, delay towers, monitor wedges,
  mixing consoles, DJ booths, microphones, drums, keyboards and amplifiers.
- Video screens, monitor walls, vision mixers, CCU positions and commentary desks.
- Boom poles, C-stands, flag stands, tripods, carts, backdrops, apple boxes and sandbags.
- Coffee tables, stools, director chairs, sectional sofas, counters, televisions,
  plants, trees, stairs, fridges, stoves, sanitary fixtures, radiators and columns.

Furniture, cameras, lights, vehicles and the offer equipment retain their
existing dedicated models. These are generic planning silhouettes with
illustrative elevations. A kit or technical rack represents its placement,
without specifying its internal inventory or technical capacity.

Every current shared-library symbol and legacy prop now resolves to a model or
furniture assembly, checked by `assetCoverage.test.ts`. This includes modifiers,
cable ramps, hand props and remaining domestic fixtures. Unknown/custom symbol
IDs retain a generic fallback. Models are illustrative planning geometry.

Dolly cameras now have a wheeled platform, pedestal and push handle. Eight wheels
in four bogies match the plan track's rail spacing at the current grid calibration;
their treads sit on the rail tops. The saved `Dana Dolly` rig identifier remains
compatible. The model is a generic track dolly, not a manufacturer-specific replica.
The slider has its own elevated rails, carriage and support stands.
Jib/TechnoCrane cameras have wheeled bases, columns, booms and counterweights.
Straight/curved dolly tracks, roads and routed cables are included in the same
scene consumed by Live 3D and the viewfinder. Their endpoints, curve, visibility,
unit conversion and elevation come from the existing plan data. Detached doors
and windows remain visible; hosted panels continue through the wall system.

Every selected object has a **Height above ground** slider and numeric field
directly below its name in the inspector.
It is a vertical offset from normal placement, displayed in the plan's units and
stored in millimetres. For example, a fabric sheet at 3 m has its bottom at 3 m.
It affects the shared 3D geometry and the virtual camera position. Wall openings
move with their wall, with any opening-specific offset applied to the cut and
panel together. The normal 2D plan remains a top view.

Schema 41 adds optional `elevationMm` to plan elements. Old projects retain their
existing placements. Symbol IDs, project storage, copy/paste and collaboration
continue through the existing asset path, with no additional dependencies.

Library labels remain horizontal and sit below the rotated footprint. Named
fixture variants share the standard fixture artwork in search, canvas and print.

The local ConstructCAD preview uses 256-pixel frames during camera movement and
requests a sharper frame after release and a 90 ms pause. Completed lightweight
frames are displayed while the pointer advances, avoiding frame starvation.
Sharp frames from older camera positions cannot replace the released view.
Settled resolution follows the
viewport, device pixel ratio and zoom up to 2048 pixels. The browser viewfinder renders up to
1920 pixels on its longer side, with storyboard media stored through the normal
image asset pipeline.

Task notes: this work covers the plan/asset preview and inspector workstream.
The only persisted model addition is optional `elevationMm`, migrated from
schema 40 to 41 with legacy-placement coverage. New asset definitions are shared
library metadata, not embedded project media. No dependencies were added.
Height belongs to shared project state; camera interaction and render resolution
remain local session state. The browser fallback and static/subpath builds remain
available without the native companion. Validation covers asset geometry,
physical placement, elevation and migration, upright labels at five rotations,
the viewfinder capture path, lint and production/Pages builds. A local native
drag smoke check displayed 27 distinct images across 30 pointer moves using only
256-pixel requests, then completed an 818-pixel frame approximately 152 ms after
release. These are samples, not hardware-independent performance guarantees.
The model coverage and scheduling follow-up adds no persisted fields, migrations,
dependencies or shared interaction state. Hook regressions cover continuous
movement and rejection of stale sharp frames; asset tests cover the entire
built-in catalog, camera rigs, path geometry and detached/hosted openings.
