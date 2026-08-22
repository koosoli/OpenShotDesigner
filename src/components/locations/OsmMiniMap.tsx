import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { GeoPoint } from '../../domain/locations';

/**
 * Minimal keyless OpenStreetMap "slippy map" for picking a location pin by
 * clicking. Tile data © OpenStreetMap contributors (tile usage policy);
 * degrades to a placeholder when offline. Interaction model mirrors the
 * floor-plan canvas: pointer/touch drag pans, click/tap drops the pin,
 * buttons (or wheel) zoom.
 */

const TILE_SIZE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 18;

const lngToWorldX = (lng: number, zoom: number): number =>
  ((lng + 180) / 360) * TILE_SIZE * Math.pow(2, zoom);

const latToWorldY = (lat: number, zoom: number): number => {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * TILE_SIZE * Math.pow(2, zoom);
};

const worldXToLng = (x: number, zoom: number): number =>
  (x / (TILE_SIZE * Math.pow(2, zoom))) * 360 - 180;

const worldYToLat = (y: number, zoom: number): number => {
  const n = Math.PI - 2 * Math.PI * (y / (TILE_SIZE * Math.pow(2, zoom)));
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

interface OsmMiniMapProps {
  point: GeoPoint | null;
  /** Called after a click/tap that was NOT a drag. */
  onPick?: (point: GeoPoint) => void;
  height?: number;
}

export const OsmMiniMap: React.FC<OsmMiniMapProps> = ({ point, onPick, height = 200 }) => {
  const [zoom, setZoom] = useState(15);
  const [center, setCenter] = useState<GeoPoint>(point ?? { lat: 51.165691, lng: 10.451526 }); // DE centroid default
  const [size, setSize] = useState({ w: 300, h: height });
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startCenter: GeoPoint; moved: boolean } | null>(null);

  // Follow an externally set pin until the user pans manually.
  useEffect(() => {
    if (point && !dragging) setCenter(point);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.lat, point?.lng]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const report = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const worldCenterX = lngToWorldX(center.lng, zoom);
  const worldCenterY = latToWorldY(center.lat, zoom);
  const originX = worldCenterX - size.w / 2;
  const originY = worldCenterY - size.h / 2;

  const tiles = useMemo(() => {
    const n = Math.pow(2, zoom);
    const x0 = Math.floor(originX / TILE_SIZE);
    const y0 = Math.floor(originY / TILE_SIZE);
    const x1 = Math.floor((originX + size.w) / TILE_SIZE);
    const y1 = Math.floor((originY + size.h) / TILE_SIZE);
    const out: Array<{ key: string; url: string; left: number; top: number }> = [];
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        if (ty < 0 || ty >= n) continue;
        const wrappedX = ((tx % n) + n) % n;
        out.push({
          key: `${zoom}/${tx}/${ty}`,
          url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${Math.min(ty, n - 1)}.png`,
          left: tx * TILE_SIZE - originX,
          top: ty * TILE_SIZE - originY,
        });
      }
    }
    return out;
  }, [originX, originY, size.w, size.h, zoom]);

  const clientToLatLng = useCallback(
    (clientX: number, clientY: number): GeoPoint | null => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const px = originX + (clientX - rect.left);
      const py = originY + (clientY - rect.top);
      return {
        lng: worldXToLng(px, zoom),
        lat: worldYToLat(py, zoom),
      };
    },
    [originX, originY, zoom]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startCenter: center, moved: false };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 5) drag.moved = true;
    if (!drag.moved) return;
    setCenter({
      lng: worldXToLng(lngToWorldX(drag.startCenter.lng, zoom) - dx, zoom),
      lat: worldYToLat(latToWorldY(drag.startCenter.lat, zoom) - dy, zoom),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (drag && !drag.moved && onPick) {
      const picked = clientToLatLng(e.clientX, e.clientY);
      if (picked) onPick({ lat: Number(picked.lat.toFixed(6)), lng: Number(picked.lng.toFixed(6)) });
    }
  };

  const markerScreen =
    point && point.lat >= worldYToLat(originY + size.h, zoom) && point.lat <= worldYToLat(originY, zoom)
      ? {
          left: lngToWorldX(point.lng, zoom) - originX,
          top: latToWorldY(point.lat, zoom) - originY,
        }
      : null;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-md border border-slate-300 select-none"
      style={{ height, cursor: dragging ? 'grabbing' : 'crosshair', touchAction: 'none', background: '#dbeafe' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
        setDragging(false);
      }}
      role="application"
      aria-label="OpenStreetMap picker — drag to pan, click to drop the pin"
    >
      {tiles.map((tile) => (
        <img
          key={tile.key}
          src={tile.url}
          alt=""
          draggable={false}
          loading="lazy"
          style={{ position: 'absolute', left: tile.left, top: tile.top, width: TILE_SIZE, height: TILE_SIZE, pointerEvents: 'none', userSelect: 'none' }}
        />
      ))}

      {markerScreen && (
        <div
          style={{ left: markerScreen.left, top: markerScreen.top, pointerEvents: 'none' }}
          className="absolute -translate-x-1/2 -translate-y-full"
        >
          <svg width="22" height="30" viewBox="0 0 22 30">
            <path d="M11 0C4.9 0 0 4.9 0 11c0 8 11 19 11 19s11-11 11-19C22 4.9 17.1 0 11 0z" fill="#e11d48" stroke="#0f172a" strokeWidth="1.5" />
            <circle cx="11" cy="11" r="4" fill="#fff" />
          </svg>
        </div>
      )}

      <div className="absolute top-1 right-1 flex flex-col gap-1 z-10">
        <button
          onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(MAX_ZOOM, z + 1)); }}
          className="w-7 h-7 bg-white/95 border border-slate-300 rounded shadow flex items-center justify-center text-slate-700"
          aria-label="Zoom in"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(MIN_ZOOM, z - 1)); }}
          className="w-7 h-7 bg-white/95 border border-slate-300 rounded shadow flex items-center justify-center text-slate-700"
          aria-label="Zoom out"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="absolute bottom-0 inset-x-0 bg-white/80 text-[8px] text-slate-600 px-1 py-px z-10 pointer-events-none">
        Click to drop the pin · Map data © OpenStreetMap contributors
      </div>

      {!navigator.onLine && (
        <div className="absolute inset-0 grid place-items-center bg-slate-100/90 text-[10px] text-slate-500 z-10">
          Map tiles unavailable offline — coordinates still editable below.
        </div>
      )}
    </div>
  );
};
