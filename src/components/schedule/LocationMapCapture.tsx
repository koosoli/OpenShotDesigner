import React, { useState } from 'react';
import { Map as MapIcon, RefreshCw, Trash2 } from 'lucide-react';
import type { ProductionDay } from '../../domain/scheduling';
import type { CallSheetLocation } from '../../domain/reports';
import { forgetAssetUrl, useAssetImageSrc } from '../../utils/assetImages';
import { captureLocationMap } from '../../utils/staticMapImage';

interface LocationMapCaptureProps {
  day: ProductionDay;
  /** Locations resolved for this day; the first pinned one is mapped. */
  locations: CallSheetLocation[];
  patchCallSheet: (updates: NonNullable<ProductionDay['callSheet']>) => void;
  isLight: boolean;
}

/**
 * Per-sheet OpenStreetMap picture.
 *
 * Capturing is an explicit act rather than something every sheet does on open.
 * OSM's tiles come off volunteer-funded servers and their usage policy asks
 * that they not be fetched in bulk; a few tiles per location when someone asks
 * for them is a reasonable use, a live map on every day of a fifteen-day board
 * is not (rule 29).
 *
 * Once captured the picture is in the asset store, so the sheet prints and
 * travels offline — which is the point, since it is read at the location.
 */
export const LocationMapCapture: React.FC<LocationMapCaptureProps> = ({
  day,
  locations,
  patchCallSheet,
  isLight,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const src = useAssetImageSrc(day.callSheet?.mapAssetId);

  const pinned = locations.find(
    (location) => typeof location.lat === 'number' && typeof location.lng === 'number',
  );
  const enabled = day.callSheet?.showLocationMap ?? false;

  const capture = async () => {
    if (!pinned) return;
    setBusy(true);
    setError(null);
    const result = await captureLocationMap({
      lat: pinned.lat as number,
      lng: pinned.lng as number,
    });
    if (result.status === 'ok') {
      if (day.callSheet?.mapAssetId) forgetAssetUrl(day.callSheet.mapAssetId);
      patchCallSheet({ mapAssetId: result.assetId, showLocationMap: true });
    } else {
      setError(result.reason);
    }
    setBusy(false);
  };

  const clear = () => {
    if (day.callSheet?.mapAssetId) forgetAssetUrl(day.callSheet.mapAssetId);
    patchCallSheet({ mapAssetId: undefined });
  };

  const button = `text-[10px] font-semibold px-2 py-1 rounded-lg border ${
    isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
  }`;

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-slate-500">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => patchCallSheet({ showLocationMap: event.target.checked })}
          className="accent-cyan-600"
        />
        <MapIcon className="w-3 h-3" /> Location map on this sheet
      </label>

      {enabled && (
        <>
          {!pinned ? (
            <p className="text-[9px] text-amber-600">
              Pin this day’s location on the Locations page first — a map needs coordinates.
            </p>
          ) : (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={capture} disabled={busy} className={button}>
                <span className="flex items-center gap-1">
                  <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} />
                  {busy ? 'Fetching…' : day.callSheet?.mapAssetId ? 'Refresh map' : 'Fetch map'}
                </span>
              </button>
              {day.callSheet?.mapAssetId && (
                <button type="button" onClick={clear} className={button} title="Remove the captured map">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {error && <p className="text-[9px] text-rose-500">{error}</p>}

          {src && <img src={src} alt="Captured location map" className="w-full rounded-lg" />}

          {day.callSheet?.mapAssetId ? (
            <p className="text-[9px] text-slate-500">
              Stored with the project — prints and travels offline.
            </p>
          ) : (
            pinned && (
              <p className="text-[9px] text-slate-500">
                Fetched once from OpenStreetMap; attribution is part of the picture.
              </p>
            )
          )}
        </>
      )}
    </div>
  );
};
