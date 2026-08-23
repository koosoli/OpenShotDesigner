import React, { useState } from 'react';
import { Map as MapIcon, RefreshCw, Trash2 } from 'lucide-react';
import type { ProductionDay } from '../../domain/scheduling';
import type { CallSheetLocation } from '../../domain/reports';
import { createId } from '../../domain/ids';
import { forgetAssetUrl, useAssetImageSrc } from '../../utils/assetImages';
import { captureLocationMap } from '../../utils/staticMapImage';

type LocationMap = NonNullable<NonNullable<ProductionDay['callSheet']>['locationMaps']>[number];

interface LocationMapCaptureProps {
  day: ProductionDay;
  /** Locations resolved for this day; every pinned one can be mapped. */
  locations: CallSheetLocation[];
  patchCallSheet: (updates: NonNullable<ProductionDay['callSheet']>) => void;
  isLight: boolean;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Per-sheet OpenStreetMap pictures, one per pinned location.
 *
 * Capturing is an explicit act rather than something every sheet does on open.
 * OSM's tiles come off volunteer-funded servers and their usage policy asks
 * that they not be fetched in bulk; a few tiles per location when someone asks
 * for them is a reasonable use, a live map on every day of a fifteen-day board
 * is not (rule 29).
 *
 * Once captured a picture is in the asset store, so the sheet prints and
 * travels offline — which is the point, since it is read at the location. The
 * location's name is burned into the picture and stored beside it, so a day
 * that moves between two places prints two maps that each say which is which.
 */
export const LocationMapCapture: React.FC<LocationMapCaptureProps> = ({
  day,
  locations,
  patchCallSheet,
  isLight,
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enabled = day.callSheet?.showLocationMap ?? false;
  const maps = day.callSheet?.locationMaps ?? [];
  const pinned = locations.filter((location) => typeof location.lat === 'number' && typeof location.lng === 'number');
  const unpinned = locations.filter((location) => !pinned.includes(location));

  const setMaps = (next: LocationMap[]) =>
    // Writing the per-location list retires the pre-v21 single map.
    patchCallSheet({ ...(day.callSheet ?? {}), locationMaps: next, mapAssetId: undefined, showLocationMap: true });

  const capture = async (location: CallSheetLocation) => {
    setBusy(location.name);
    setError(null);
    const result = await captureLocationMap({
      lat: location.lat as number,
      lng: location.lng as number,
      label: location.name,
    });
    if (result.status === 'ok') {
      const previous = maps.find((map) => sameName(map.locationName, location.name));
      if (previous) forgetAssetUrl(previous.assetId);
      if (day.callSheet?.mapAssetId) forgetAssetUrl(day.callSheet.mapAssetId);
      const next: LocationMap = {
        id: previous?.id ?? createId('map'),
        locationName: location.name,
        lat: location.lat as number,
        lng: location.lng as number,
        assetId: result.assetId,
      };
      setMaps([...maps.filter((map) => map !== previous), next]);
    } else {
      setError(result.reason);
    }
    setBusy(null);
  };

  const remove = (map: LocationMap) => {
    forgetAssetUrl(map.assetId);
    setMaps(maps.filter((candidate) => candidate.id !== map.id));
  };

  const button = `text-[10px] font-semibold px-2 py-1 rounded-lg border ${
    isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
  }`;

  // A map captured for a place no longer on the day is still listed, so it can
  // be removed on purpose rather than silently kept on the printout.
  const orphans = maps.filter((map) => !locations.some((location) => sameName(location.name, map.locationName)));

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-slate-500">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => patchCallSheet({ showLocationMap: event.target.checked })}
          className="accent-cyan-600"
        />
        <MapIcon className="w-3 h-3" /> Location maps on this sheet
      </label>

      {enabled && (
        <>
          {pinned.map((location) => {
            const map = maps.find((candidate) => sameName(candidate.locationName, location.name));
            return (
              <MapRow
                key={location.name}
                name={location.name}
                address={location.address}
                assetId={map?.assetId ?? (!maps.length ? day.callSheet?.mapAssetId : undefined)}
                busy={busy === location.name}
                onCapture={() => capture(location)}
                onRemove={map ? () => remove(map) : undefined}
                button={button}
              />
            );
          })}
          {unpinned.map((location) => (
            <p key={location.name} className="text-[9px] text-amber-600">
              <b>{location.name}</b> has no pin yet — {location.address ? 'on the Locations page, geocode its address or drop a pin' : 'link it to a project location, then pin it on the Locations page'}.
            </p>
          ))}
          {orphans.map((map) => (
            <MapRow
              key={map.id}
              name={map.locationName}
              address="No longer on this day"
              assetId={map.assetId}
              busy={false}
              onRemove={() => remove(map)}
              button={button}
            />
          ))}

          {error && <p className="text-[9px] text-rose-500">{error}</p>}
          <p className="text-[9px] text-slate-500">
            {maps.length ? 'Stored with the project — prints and travels offline.' : 'Fetched once from OpenStreetMap; the place name and attribution are part of the picture.'}
          </p>
        </>
      )}
    </div>
  );
};

interface MapRowProps {
  name: string;
  address?: string;
  assetId?: string;
  busy: boolean;
  onCapture?: () => void;
  onRemove?: () => void;
  button: string;
}

const MapRow: React.FC<MapRowProps> = ({ name, address, assetId, busy, onCapture, onRemove, button }) => {
  const src = useAssetImageSrc(assetId);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="min-w-0 flex-1 truncate">
          <b>{name}</b>
          {address && <span className="text-slate-500"> — {address}</span>}
        </span>
        {onCapture && (
          <button type="button" onClick={onCapture} disabled={busy} className={button}>
            <span className="flex items-center gap-1">
              <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} />
              {busy ? 'Fetching…' : assetId ? 'Refresh' : 'Fetch map'}
            </span>
          </button>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className={button} title={`Remove the map of ${name}`} aria-label={`Remove the map of ${name}`}>
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
      {src && <img src={src} alt={`Captured map of ${name}`} className="w-full rounded-lg" />}
    </div>
  );
};
