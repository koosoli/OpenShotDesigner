import { useState } from 'react';
import type { GridSettings, Vector2D } from '../../types';
import { wallEndpointAtLength } from '../../domain/plan/wallDimensions';

interface Props {
  start: Vector2D;
  cursor: Vector2D | null;
  grid: GridSettings;
  onPlace: (end: Vector2D) => void;
  onFinish: () => void;
}

export function WallChainControls({ start, cursor, grid, onPlace, onFinish }: Props) {
  const [length, setLength] = useState('');
  const [bearing, setBearing] = useState('');
  return (
    <form
      aria-label="Wall chain controls"
      className="absolute top-12 left-1/2 z-30 flex max-w-[96%] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-sky-500 bg-slate-950 px-3 py-2 text-xs text-sky-100 shadow-lg"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.stopPropagation();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const radians = Number(bearing) * Math.PI / 180;
        const direction = bearing === '' ? cursor : { x: start.x + Math.cos(radians), y: start.y + Math.sin(radians) };
        if (!direction) return;
        const end = wallEndpointAtLength(start, direction, Number(length), grid.pixelsPerUnit);
        if (end) {
          onPlace(end);
          setLength('');
        }
      }}
    >
      <label className="flex items-center gap-1.5">
        Length ({grid.unit})
        <input
          type="number"
          step="any"
          min={0}
          value={length}
          onChange={(event) => setLength(event.target.value)}
          className="w-20 rounded border border-slate-500 bg-slate-800 px-2 py-1 text-white"
        />
      </label>
      <label className="flex items-center gap-1.5">
        Angle (deg)
        <input type="number" step="any" value={bearing} onChange={(event) => setBearing(event.target.value)}
          placeholder="Cursor" className="w-20 rounded border border-slate-500 bg-slate-800 px-2 py-1 text-white" />
      </label>
      <button type="submit" disabled={(!cursor && bearing === '') || !(Number(length) > 0)} className="rounded bg-sky-700 px-2 py-1 disabled:opacity-50">Place segment</button>
      <button type="button" onClick={onFinish} className="rounded border border-slate-500 px-2 py-1">Finish chain</button>
    </form>
  );
}
