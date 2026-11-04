# ConstructCAD Live 3D

Build the optional local renderer from the Cineplan root.

    cargo build --manifest-path tools/constructcad-render/Cargo.toml

Open Live 3D in the local Vite editor. The pane displays **ConstructCAD** once
it receives a frame from the native renderer. The companion uses ConstructCAD
`cc_render::Renderer3D` and `cc_core::CameraState` at the pinned revision in
Cargo.toml. Cineplan converts its plan solids to the renderer's triangle mesh.
Wall modeling, assets, editing, and project storage use Cineplan's model.

The local Vite server starts the worker when needed and accepts frame requests
from the loopback interface. The worker keeps the last uploaded scene on the GPU and returns raw RGBA frames.
The SVG view is available when the companion or
GPU is unavailable and in the standalone static build.

The companion is GPL-3.0-only. Its separate Cargo dependencies provide the
upstream renderer, its GPU and vector types, and local JSON transport.
