# 3D snapshots and lighting preview

Scope: plan/canvas and print/export workstreams (implementation plan sections
6, 7, 38 and 45). The export studio's floor-plan and complete-package options
can include a separate 3D image sheet. It uses the scene's session-local orbit
angle, tilt, pan, zoom and lighting settings, with adjustment controls in the
studio. Browser print, direct floor-plan PDF and the production pack use the
same snapshot. The PDF retains the blueprint as its first page.

Live 3D offers **Simulate lighting**, ambient light and shared beam-tilt controls.
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

Data model and migration: no persisted fields or schema changes. All controls
belong to local session UI state; snapshot bytes belong only to the current
export operation. Nothing enters project history, shared state or presence.
No dependencies added; standalone/offline and subpath builds use bundled code.

Validation: domain tests cover blackout/non-emitters, visibility, colour,
direction/elevation, falloff, window openings, finite mesh and projection axes.
PDF tests cover the optional second sheet and corrupt-image isolation. A browser
journey exercises lighting controls, orbit inheritance, print visibility and a
two-page PDF download; the existing optical viewfinder journey stays covered.
