import { expect, test } from '@playwright/test';
import type { PreviewLight, Vec3 } from '../src/domain/plan/sceneLighting';
import type { ViewfinderPose } from '../src/domain/camera/viewfinderScene';
import type { WallElement, WindowElement } from '../src/types';

test('tiled lighting renders a late fixture through a window and retains wall shadows', async ({ page }, testInfo) => {
  await page.goto('/__lighting_probe__');
  const result = await page.evaluate(async () => {
    const rendererPath = '/src/components/viewfinder/viewfinderWebGL.ts';
    const meshPath = '/src/domain/plan/scenePreviewMesh.ts';
    const lightingPath = '/src/domain/plan/sceneLighting.ts';
    const wallPath = '/src/domain/plan/wallPreview.ts';
    const { createViewfinderRenderer }: typeof import('../src/components/viewfinder/viewfinderWebGL') = await import(rendererPath);
    const { buildScenePreviewMesh }: typeof import('../src/domain/plan/scenePreviewMesh') = await import(meshPath);
    const { buildLightBlockers }: typeof import('../src/domain/plan/sceneLighting') = await import(lightingPath);
    const { buildWallPreview }: typeof import('../src/domain/plan/wallPreview') = await import(wallPath);

    const grid = { unit: 'm' as const, pixelsPerUnit: 1000, size: 20, snap: true, showGrid: true };
    const wall: WallElement = {
      id: 'wall', name: 'Window wall', type: 'wall', x: 0, x2: 0, y: -1600, y2: 1600, rotation: 0, thickness: 100,
    };
    const opening: WindowElement = {
      id: 'window', name: 'Window', type: 'window', x: 0, y: 0, rotation: 90, width: 800, depth: 100, hostWallId: 'wall',
    };
    const otherWalls = Array.from({ length: 13 }, (_, i) => ({
      ...wall, id: `wall${i}`, x: -3300 + i * 500, x2: -3050 + i * 500, y: 2800, y2: 2800,
    }));
    const elements = [...otherWalls, wall, opening];
    const solids = buildWallPreview(elements, undefined, grid, true);
    const blockers = buildLightBlockers(solids, elements);
    const beam: PreviewLight = {
      id: 'key', position: [-1500, 0, 2600], direction: [Math.SQRT1_2, 0, -Math.SQRT1_2],
      color: [1, .7, .5], intensity: 1, innerCos: .94, outerCos: .8, omni: false, assumed: false,
    };
    const lights: PreviewLight[] = [
      ...Array.from({ length: 15 }, (_, i) => ({
        ...beam, id: `fill${i}`, position: [-3500 + 500 * i, 0, 1300] as Vec3,
        direction: [0, 0, 1] as Vec3,
      })),
      beam,
    ];
    const mesh = buildScenePreviewMesh(solids, { lights, blockers, ambient: .05 });
    const lit = mesh.lit!;
    const fallback = { ...mesh, lit: { ...lit, tiled: undefined } };
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 320;
    const renderer = createViewfinderRenderer(canvas);
    if (!renderer) throw new Error('Chromium did not initialize WebGL.');
    const gl = canvas.getContext('webgl')!;
    const pose: ViewfinderPose = {
      eye: [0, 0, 12000], right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1],
      tanHalfHorizontal: 1 / 3, barrelDistortion: 0, orthographicSpan: 8000,
    };
    function readRed(x: number, y: number) {
      const pixel = new Uint8Array(4);
      gl.readPixels(Math.floor((x / 8000 + .5) * canvas.width), Math.floor((y / 8000 + .5) * canvas.height),
        1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return pixel[0];
    }
    renderer.draw(fallback, pose);
    const capped = readRed(1500, 0);
    renderer.draw(mesh, pose);
    if (!renderer.supportsTiledLighting) throw new Error('Chromium did not initialize the tiled shader.');
    const throughWindow = readRed(1500, 0);
    const behindWall = readRed(1500, 1150);
    renderer.draw(mesh, { ...pose, orthographicSpan: undefined });
    const throughViewfinder = readRed(1500, 0);
    const reaimed: PreviewLight = { ...beam, direction: [-Math.SQRT1_2, 0, -Math.SQRT1_2] };
    renderer.draw(buildScenePreviewMesh(solids, {
      lights: [...lights.slice(0, -1), reaimed], blockers, ambient: .05,
    }), pose);
    const afterReaim = readRed(1500, 0);

    function elapsed(draw: (frame: number) => void) {
      const times = [];
      for (let i = 0; i < 14; i++) {
        const start = performance.now();
        draw(i);
        gl.finish();
        if (i > 1) times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      return { medianMs: times[6], p95Ms: times[11] };
    }
    const panned = (frame: number): ViewfinderPose => ({ ...pose, eye: [frame * 10, 0, pose.eye[2]] });
    const cappedPan = elapsed(frame => { renderer.draw(fallback, panned(frame)); });
    const tiledPan = elapsed(frame => { renderer.draw(mesh, panned(frame)); });
    const aimUpdate = elapsed(i => {
      const tilt = .65 + i * .01;
      const updated = { ...beam, direction: [Math.cos(tilt), 0, -Math.sin(tilt)] as Vec3 };
      renderer.draw(buildScenePreviewMesh(solids, { lights: [...lights.slice(0, -1), updated], blockers, ambient: .05 }), pose);
    });
    const candidates = Array.from({ length: 64 }, (_, tile) => lit.tiled!.data[tile * 4 + 1]);
    const casterCandidates = Array.from({ length: 64 }, (_, tile) => lit.tiled!.data[tile * 4 + 3]);
    const fixtureFace = {
      wallId: beam.id, color: '#808080', emitting: true,
      corners: [0, 20].flatMap(z => [[-200, -200], [200, -200], [200, 200], [-200, 200]]
        .map(([x, y]) => ({ x: x + 1500, y, z }))),
    };
    renderer.draw(buildScenePreviewMesh([fixtureFace], { lights: [], blockers: [], ambient: 0 }), pose);
    const fixtureOff = readRed(1500, 0);
    const glowingMesh = buildScenePreviewMesh([fixtureFace], {
      lights: lights.map(light => ({ ...light, direction: [0, 0, 1] })), blockers: [], ambient: 0,
    });
    renderer.draw(glowingMesh, pose);
    const fixtureOn = readRed(1500, 0);
    const board = {
      wallId: 'reflector', color: '#e0e0e0', reflecting: true,
      corners: [490, 500].flatMap(x => [[-350, 950], [350, 950], [350, 1650], [-350, 1650]]
        .map(([y, z]) => ({ x, y, z }))),
    };
    const bounceKey: PreviewLight = {
      ...beam, position: [2200, 0, 1300], direction: [-1, 0, 0], outerCos: .98, innerCos: .99,
    };
    const bounceLighting = { lights: [...lights.slice(0, -1), bounceKey], blockers, ambient: 0 };
    const boardScene = [...solids, board];
    renderer.draw(buildScenePreviewMesh(boardScene, bounceLighting), pose);
    const directOnly = readRed(1500, 0);
    renderer.draw(buildScenePreviewMesh(boardScene, { ...bounceLighting, bounce: true }), pose);
    const bounced = readRed(1500, 0);
    const measureBoard = (bounce: boolean) => elapsed(i => {
      const direction: Vec3 = [-Math.cos(i * .002), Math.sin(i * .002), 0];
      renderer.draw(buildScenePreviewMesh(boardScene, {
        ...bounceLighting, bounce, lights: [...bounceLighting.lights.slice(0, -1), { ...bounceKey, direction }],
      }), pose);
    });
    const boardDirect = measureBoard(false);
    const boardBounce = measureBoard(true);
    const gpu = gl.getExtension('WEBGL_debug_renderer_info');
    const device = gpu ? String(gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL)) : 'unavailable';
    const error = gl.getError();
    renderer.dispose();
    return {
      capped, throughWindow, behindWall, throughViewfinder, afterReaim, fixtureOn, fixtureOff, error, device,
      directOnly, bounced, boardDirect, boardBounce,
      cappedPan, tiledPan, aimUpdate, lights: lights.length, blockers: blockers.length,
      meanTileLights: candidates.reduce((sum, count) => sum + count, 0) / candidates.length,
      meanTileBlockers: casterCandidates.reduce((sum, count) => sum + count, 0) / casterCandidates.length,
    };
  });

  await testInfo.attach('lighting probe', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  console.log(JSON.stringify(result));
  expect(result.error).toBe(0);
  expect(result.throughWindow).toBeGreaterThan(result.capped + 30);
  expect(result.behindWall).toBeCloseTo(result.capped, 0);
  expect(result.afterReaim).toBeCloseTo(result.capped, 0);
  expect(result.fixtureOff).toBe(0);
  expect(result.fixtureOn).toBeGreaterThan(220);
  expect(result.directOnly).toBe(0);
  expect(result.bounced).toBeGreaterThan(20);
  expect(Math.abs(result.throughViewfinder - result.throughWindow)).toBeLessThan(6);
});
