# 3D snapshots and lighting preview

Scope: plan/canvas and print/export workstreams (implementation plan sections
6, 7, 38 and 45). The export studio's floor-plan and complete-package options
can include a separate 3D image sheet. It uses the scene's session-local orbit
angle, tilt, pan, zoom and lighting settings, with adjustment controls in the
studio. Browser print, direct floor-plan PDF and the production pack use the
same snapshot. The PDF retains the blueprint as its first page.

Live 3D offers **Simulate lighting**, ambient light and shared beam-tilt controls.
The virtual viewfinder shares these scene-local settings, with the same controls
inside the finder. Its perspective mesh uses the selected beat for moving
subjects and lights. Storyboard capture includes the simulated lighting; device
camera feeds and attached artwork are unaffected. The normal unlit camera mode
retains the existing wall/background contrast treatment. Lighting controls are
disabled if the 3D camera renderer is unavailable.
The browser depth-buffered renderer shows relative colour/intensity, beam
spread, distance falloff, diffuse incidence and direct-light occlusion through
convex solid geometry. Wall openings are respected. Flags, fixtures and props
are not treated as emitting lights merely because they are on the plan.
Named library light symbols get explicitly illustrative preview settings.
Light objects use their existing dimmer, RGB/Kelvin colour, modifier appearance,
known modifier transmission, rotation and vertical offset. Fixture-source height
and shared tilt remain preview assumptions, not new technical source data.

This is a qualitative lighting preview. It does not calculate calibrated
lux, exposure, translucent transmission through geometry, volumetric
beams or manufacturer-specific photometric profiles. Missing technical values
are not written back as invented measurements. The normal native ConstructCAD
preview remains available when lighting mode is off. Lighting mode reuses the
existing browser/viewfinder WebGL renderer, with an orthographic projection.
The lit mesh is cached independently of camera motion. Dragging uses a smaller
frame; the released view uses a sharper frame.

No WebGL: the 3D snapshot falls back to a rasterized SVG scene. Lighting is
explicitly marked unavailable and the printed caption identifies its omission.

Preview/print controls belong to local session UI state; snapshot bytes belong
only to the current export operation. They do not enter project history,
shared state or presence.
No dependencies added; standalone/offline and subpath builds use bundled code.

Validation: domain tests cover blackout/non-emitters, visibility, colour,
direction/elevation, falloff, window openings, finite mesh and projection axes.
PDF tests cover the optional second sheet and corrupt-image isolation. A browser
journey exercises lighting controls, orbit inheritance, print visibility and a
two-page PDF download; the existing optical viewfinder journey stays covered.

## Individual fixture aim

The fixture inspector's **Beam aim** section provides pan and tilt sliders plus
numeric inputs, for regular light elements and named library-light symbols.
Pan is an offset in degrees from the fixture body's rotation. Positive tilt
aims down and negative tilt aims up. Explicit zero is horizontal. **Reset beam
pan** restores alignment with the body; **Use scene tilt** removes the per-fixture
override. Omnidirectional emitters ignore aim.

The 2D beam and its printed blueprint show the pan offset for regular fixtures.
Tilt changes the direct-light preview in Live 3D, the viewfinder and their image
captures. Library symbols keep their existing 2D body artwork. Body transforms
and technical power/DMX values are unchanged; MVR exports still carry the body
transform rather than these preview beam-aim values.

Data-model change: schema 42 adds optional `beamPanDeg` and `beamTiltDeg` to
light elements and library-symbol shapes. The deterministic v41-to-v42 migration
preserves existing IDs, paths, heights and metadata, without backfilling aim.
Old fixtures retain their body heading and inherit the scene preview tilt.
The generated collaboration schema accepts the same fields. Aim is canonical
shared project state, so existing undo/redo, duplication and JSON save/import
preserve it. No dependencies were added.

Tests cover angle composition, clamping, vertical beams, missing/explicit-zero
tilt, symbol fixtures, lossless migration, UI sliders/numbers, undo/redo and
reload/export. The default preview tilt remains a local session setting.

## Experimental tiled direct lighting

This prototype builds on the per-pixel WebGL lighting branch. When a scene
exceeds the uniform shader's limits, a compatible GPU can read lighting data
from a float texture. An 8 × 8 grid in plan coordinates assigns each tile
only the fixtures whose cones can reach it and the shadow casters that might
intersect those light rays. The test is conservative and keeps practicals in
every tile. The same shader evaluates the light and shadows in Live 3D,
viewfinder, and image capture. Solstice's tiled light pass informed the
experiment. [Solstice renderer](https://github.com/SamG-Coder/solstice/blob/e14ac55af929f89aa7b7fcb182c3830e15c80421/crates/solstice-render/src/renderer.rs)

The tiled path accepts up to 64 lights and 96 convex shadow casters, with up
to 32 planes per caster. Small scenes and devices without float textures or
high-precision fragments use the existing uniform path. Live 3D reports
omissions using the active path's limits. This experiment covers direct
lighting and convex occlusion.

The Chromium probe uses a window, 16 lights and 17 shadow casters. The
sixteenth fixture illuminates the floor through the window. The adjoining
wall keeps its shadow, and the perspective and orthographic renders match at
the tested floor position. The tile lists average 4.2 lights and 3.0 casters.
On the test RTX 3070 at 320 × 320, aim updates took 1.3–4.1 ms median and
2.2–4.8 ms at the 95th percentile across two runs of 12 measured frames each.
This synthetic measurement includes rebuilding and drawing the mesh. It
excludes React and PNG encoding. Integrated graphics and mobile performance
are unmeasured.

The renderer and tile data are transient. This experiment reuses the current
schema, adds no dependencies, and works with the standalone and subpath
builds. Unit tests cover conservative tile assignment, packing and overflow.
The Chromium probe checks late fixtures, window occlusion and both projections.

Enable **Bounce light** beside **Simulate lighting** to preview one diffuse
bounce from lit wall faces and reflector boards. Bounce is off by default.
It samples direct light on a limited set of surfaces and uses up to four
samples as broad fill, giving priority to boards. Surface colour, orientation,
and obstructions affect the result. The preview uses the same approximation in
Live 3D, the viewfinder, and captures. The bounce is transient render data
and reuses the existing lighting budget and project schema.
