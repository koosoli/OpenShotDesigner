import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConstructCadFrame } from './useConstructCadFrame';
import type { PreviewSolid } from '../../domain/plan/assetPreview';

interface FrameRequest { yaw: number; width: number; height: number }
const solids: PreviewSolid[] = [{ wallId: 'test', color: '#64748b', corners: [] }];

describe('interactive native preview scheduling', () => {
  const pending: { request: FrameRequest; finish: () => void }[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    pending.length = 0;
    vi.stubGlobal('ImageData', class {
      constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
    });
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise<Response>(resolve => {
      const request = JSON.parse(options.body as string) as FrameRequest;
      pending.push({ request, finish: () => resolve({ ok: true, status: 200,
        arrayBuffer: async () => new ArrayBuffer(request.width * request.height * 4) } as Response) });
    })));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  const tick = async (ms = 20) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
  const finish = async (index: number) => { await act(async () => { pending[index].finish(); }); };

  it('shows completed lightweight frames during continuous movement, then sharpens after release', async () => {
    const { result, rerender } = renderHook(({ yaw, dragging }) => useConstructCadFrame(solids, yaw, 36, dragging, 1200),
      { initialProps: { yaw: 0, dragging: true } });
    await tick();
    expect(pending[0].request.width).toBe(256);
    rerender({ yaw: 10, dragging: true });
    await finish(0);
    // The pointer has advanced, but a completed preview must still be painted.
    expect(result.current?.width).toBe(256);
    await tick();
    rerender({ yaw: 20, dragging: true });
    await finish(1);
    await tick(300);
    expect(pending.every(p => p.request.width === 256)).toBe(true);
    rerender({ yaw: 20, dragging: false });
    await finish(2);
    await tick(100);
    await finish(pending.length - 1);
    await tick();
    expect(pending.at(-1)?.request).toMatchObject({ width: 1200, yaw: 20 });
    await finish(pending.length - 1);
    expect(result.current?.width).toBe(1200);
  });

  it('does not paint an old sharp camera frame after release at a different angle', async () => {
    const { result, rerender } = renderHook(({ yaw, dragging }) => useConstructCadFrame(solids, yaw, 36, dragging, 1200),
      { initialProps: { yaw: 0, dragging: false } });
    await tick();
    expect(pending[0].request.width).toBe(1200);
    rerender({ yaw: 50, dragging: true });
    rerender({ yaw: 60, dragging: false });
    await finish(0);
    expect(result.current).toBeUndefined();
    await tick(100);
    await finish(pending.length - 1);
    await tick();
    expect(pending.at(-1)?.request).toMatchObject({ yaw: 60, width: 1200 });
    await finish(pending.length - 1);
    expect(result.current?.width).toBe(1200);
  });
});
