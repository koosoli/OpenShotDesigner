use std::io::{self, BufRead, Write};

use cc_core::CameraState;
use cc_render::{Renderer3D, SceneMesh, Vertex};
use glam::{DVec3, Vec3};
use serde::Deserialize;

#[derive(Deserialize)]
struct Point {
    x: f32,
    y: f32,
    z: f32,
}

#[derive(Deserialize)]
struct Solid {
    color: String,
    corners: Vec<Point>,
}

#[derive(Deserialize)]
struct Frame {
    scene_id: String,
    solids: Option<Vec<Solid>>,
    yaw: f64,
    pitch: f64,
    width: u32,
    height: u32,
}

fn scene(solids: Vec<Solid>) -> (SceneMesh, DVec3, f64) {
    let mut mesh = SceneMesh::default();
    let mut min = Vec3::splat(f32::INFINITY);
    let mut max = Vec3::splat(f32::NEG_INFINITY);
    for solid in solids {
        let points: Vec<_> = solid
            .corners
            .into_iter()
            .map(|p| Vec3::new(p.x, -p.y, p.z) / 1000.0)
            .collect();
        for &point in &points {
            min = min.min(point);
            max = max.max(point);
        }
        let hex = solid
            .color
            .strip_prefix('#')
            .filter(|color| color.len() == 6);
        let rgb = hex
            .and_then(|color| u32::from_str_radix(color, 16).ok())
            .unwrap_or(0x64748b);
        let channel = |shift: u32| (((rgb >> shift) & 255) as f32 / 255.0).powf(2.2);
        let color = [channel(16), channel(8), channel(0), 1.0];
        let sides = points.len() / 2;
        let mut faces: Vec<Vec<usize>> =
            vec![(0..sides).collect(), (sides..2 * sides).rev().collect()];
        faces.extend((0..sides).map(|index| {
            let next = (index + 1) % sides;
            vec![sides + index, sides + next, next, index]
        }));
        for face in faces {
            let [a, b, c] = [points[face[0]], points[face[1]], points[face[2]]];
            let normal = (b - a).cross(c - a).normalize_or_zero().to_array();
            let start = mesh.vertices.len() as u32;
            mesh.vertices.extend(
                face.iter()
                    .map(|&index| Vertex::plain(points[index].to_array(), normal, color)),
            );
            for index in 1..face.len() as u32 - 1 {
                mesh.indices
                    .extend([start, start + index, start + index + 1]);
            }
        }
    }
    (
        mesh,
        ((min + max) / 2.0).as_dvec3(),
        (max - min).length() as f64 / 2.0,
    )
}

struct UploadedScene {
    id: String,
    target: DVec3,
    radius: f64,
}

fn render(
    renderer: &mut Renderer3D,
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    uploaded: &mut Option<UploadedScene>,
    frame: Frame,
) -> Result<Vec<u8>, String> {
    if let Some(solids) = frame.solids {
        if solids.is_empty() || solids.len() > 10000 {
            return Err("Scene must contain 1 to 10000 solids".into());
        }
        if solids
            .iter()
            .any(|solid| !(6..=128).contains(&solid.corners.len()) || solid.corners.len() % 2 != 0)
        {
            return Err("Expected a prism with matching bottom and top vertices".into());
        }
        let (mesh, target, radius) = scene(solids);
        renderer.upload(device, &mesh);
        *uploaded = Some(UploadedScene {
            id: frame.scene_id.clone(),
            target,
            radius,
        });
    }
    let Some(scene) = uploaded.as_ref().filter(|scene| scene.id == frame.scene_id) else {
        return Err("scene_missing".into());
    };
    let size = [frame.width.clamp(16, 2048), frame.height.clamp(16, 2048)];
    let aspect = f64::from(size[0]) / f64::from(size[1]);
    let camera = CameraState {
        target: scene.target,
        yaw_deg: frame.yaw,
        pitch_deg: frame.pitch.clamp(5.0, 89.0),
        distance: (scene.radius * 2.8 / aspect.min(1.0)).clamp(0.5, 4000.0),
    };
    renderer
        .render_to_rgba(device, queue, size, &camera)
        .ok_or_else(|| "ConstructCAD frame readback failed".into())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let instance = wgpu::Instance::default();
    let adapter =
        pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions::default()))?;
    let (device, queue) =
        pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor::default()))?;
    let mut renderer = Renderer3D::new(&device);
    let mut uploaded = None;
    let mut output = io::BufWriter::new(io::stdout().lock());
    for line in io::stdin().lock().lines() {
        let result = serde_json::from_str::<Frame>(&line?)
            .map_err(|error| error.to_string())
            .and_then(|frame| render(&mut renderer, &device, &queue, &mut uploaded, frame));
        // A zero-length frame asks the client to resend its scene.
        match result {
            Ok(pixels) => {
                output.write_all(&(pixels.len() as u32).to_le_bytes())?;
                output.write_all(&pixels)?;
            }
            Err(error) => {
                if error != "scene_missing" {
                    eprintln!("{error}");
                }
                output.write_all(&0_u32.to_le_bytes())?;
            }
        }
        output.flush()?;
    }
    Ok(())
}
