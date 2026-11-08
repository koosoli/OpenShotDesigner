import { useEffect, useMemo, useRef, useState } from 'react';
import { createId } from '../../domain/ids';
import type { PreviewSolid } from '../../domain/plan/assetPreview';

export function useConstructCadFrame(solids: PreviewSolid[], yaw: number, pitch: number, orbiting: boolean, targetPixels = 1280) {
  const [frame, setFrame] = useState<ImageData>();
  const scene = useMemo(() => ({ id: createId('preview'), solids }), [solids]);
  const camera = useMemo(() => ({ scene, yaw, pitch, targetPixels }), [scene, yaw, pitch, targetPixels]);
  const [settled, setSettled] = useState(camera);
  useEffect(() => {
    if (orbiting) return;
    const timer = setTimeout(() => setSettled(camera), 90);
    return () => clearTimeout(timer);
  }, [camera, orbiting]);
  const size = orbiting || settled !== camera ? 256 : Math.max(640, Math.min(2048, Math.round(targetPixels)));
  const request = useMemo(() => ({ scene, yaw, pitch, width: size, height: size, interactive: orbiting }), [scene, yaw, pitch, size, orbiting]);
  const latest = useRef(request);
  const wake = useRef<() => void>(() => {});

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const controller = new AbortController();
    let busy = false;
    let scheduled = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let uploaded: typeof scene | undefined;
    let submitted: typeof request | undefined;
    let recovered: typeof request | undefined;

    async function render() {
      const pending = latest.current;
      if (busy || !pending.scene.solids.length || pending === submitted || controller.signal.aborted) return;
      busy = true;
      submitted = pending;
      const needsUpload = uploaded !== pending.scene;
      try {
        const response = await fetch('/__cineplan_constructcad_frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scene_id: pending.scene.id,
            solids: needsUpload ? pending.scene.solids : undefined,
            // ConstructCAD's camera turns the other way round than the Live 3D orbit, so the
            // same drag gives the same rotation in both views.
            yaw: -pending.yaw,
            pitch: pending.pitch,
            width: pending.width,
            height: pending.height,
          }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 429) {
          submitted = undefined;
          retry = setTimeout(() => {
            retry = undefined;
            schedule();
          }, 65);
          return;
        }
        if (response.ok) {
          const pixels = new Uint8ClampedArray(await response.arrayBuffer());
          if (controller.signal.aborted) return;
          if (pixels.length !== pending.width * pending.height * 4) throw new Error('Invalid renderer frame size');
          uploaded = pending.scene;
          // During a drag, display completed lightweight frames even if the pointer
          // has moved ahead. Exact-camera gating would starve continuous motion.
          // After release, only the final camera may replace the settled view.
          if (pending === latest.current || (latest.current.interactive && pending.width === 256 && pending.scene === latest.current.scene)) setFrame(new ImageData(pixels, pending.width, pending.height));
        } else if (!needsUpload && recovered !== pending && (response.status === 409 || response.status === 502)) {
          recovered = pending;
          uploaded = undefined;
          submitted = undefined;
        } else {
          uploaded = undefined;
          setFrame(undefined);
        }
      } catch {
        uploaded = undefined;
        if (!controller.signal.aborted) setFrame(undefined);
      } finally {
        busy = false;
        schedule();
      }
    }

    function schedule() {
      if (controller.signal.aborted || busy || scheduled || retry || latest.current === submitted || !latest.current.scene.solids.length) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = 0;
        void render();
      });
    }

    wake.current = schedule;
    schedule();
    return () => {
      wake.current = () => {};
      clearTimeout(retry);
      cancelAnimationFrame(scheduled);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    latest.current = request;
    wake.current();
  }, [request]);

  return solids.length ? frame : undefined;
}
