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

This is a qualitative direct-light preview. It does not calculate calibrated
lux, exposure, bounce, translucent transmission through geometry, volumetric
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
