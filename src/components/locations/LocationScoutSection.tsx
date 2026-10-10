import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Compass, ImagePlus, MapPin, Star, Trash2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { ScoutIcon } from '../icons/ProductionIcons';
import type { Location, LocationScout, LocationScoutPhoto, LocationScoutStatus } from '../../domain/locations';
import { forgetAssetUrl, storeImageAsset, useImageRefSrc } from '../../utils/assetImages';
import { readPhotoExif } from '../../utils/exif';

export const SCOUT_STATUS: Record<LocationScoutStatus, { label: string; className: string }> = {
  candidate: { label: 'Candidate', className: 'bg-slate-500/15 text-slate-500' },
  shortlisted: { label: 'Shortlisted', className: 'bg-amber-500/15 text-warn' },
  approved: { label: 'Approved', className: 'bg-emerald-500/15 text-ok' },
  rejected: { label: 'Rejected', className: 'bg-rose-500/15 text-rose-500' },
};

/** The practical questions of a recce, in the order a tech scout asks them. */
export const SCOUT_FIELDS: Array<{ key: keyof LocationScout & string; label: string; placeholder: string }> = [
  { key: 'power', label: 'Power', placeholder: 'House power, distro, generator spot' },
  { key: 'parking', label: 'Parking', placeholder: 'Trucks, crew cars, permits' },
  { key: 'restrooms', label: 'Restrooms', placeholder: 'On site, honeywagon needed?' },
  { key: 'holding', label: 'Holding / base camp', placeholder: 'Cast holding, catering, green room' },
  { key: 'access', label: 'Access / load-in', placeholder: 'Stairs, lifts, door widths, hours' },
  { key: 'sound', label: 'Sound', placeholder: 'Traffic, flight path, HVAC, neighbours' },
  { key: 'light', label: 'Light', placeholder: 'Window directions, sun path, practicals' },
  { key: 'cellSignal', label: 'Cell signal / wifi', placeholder: 'Carrier bars, wifi' },
  { key: 'permits', label: 'Permits', placeholder: 'Film office, police, road closures' },
  { key: 'fee', label: 'Fee / terms', placeholder: 'Day rate, prep/wrap days, deposit' },
];

interface LocationScoutSectionProps {
  location: Location;
  /** Merge an update into the latest copy of this location. */
  onUpdate: (update: (location: Location) => Location) => void;
  /** Place the location's map pin. */
  onSetPin: (point: { lat: number; lng: number }) => void;
  isLight: boolean;
  inputClass: string;
  mutedText: string;
  subCardClass: string;
  /** Slugline locations from the script, offered for "Candidate for". */
  setNames?: string[];
}

const ScoutPhotoThumb: React.FC<{ assetId: string; caption?: string; onOpen: () => void }> = ({ assetId, caption, onOpen }) => {
  const src = useImageRefSrc(assetId);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full aspect-[4/3] rounded-md overflow-hidden bg-slate-200 dark:bg-slate-800 cursor-zoom-in"
      title={caption || 'View photo'}
    >
      {src ? <img src={src} alt={caption || 'Scout photo'} className="w-full h-full object-cover" /> : null}
    </button>
  );
};

const PhotoViewer: React.FC<{
  assetIds: string[];
  index: number;
  photos: Record<string, LocationScoutPhoto>;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}> = ({ assetIds, index, photos, onIndexChange, onClose }) => {
  const assetId = assetIds[index];
  const src = useImageRefSrc(assetId);
  const meta = photos[assetId] ?? {};
  const count = assetIds.length;
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') onIndexChange((index + 1) % count);
      else if (event.key === 'ArrowLeft') onIndexChange((index - 1 + count) % count);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, count, onIndexChange, onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Scout photo" className="fixed inset-0 z-[120] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 p-2 rounded-full text-white/80 hover:bg-white/10"><X className="w-5 h-5" /></button>
      <div className="flex items-center gap-2 max-w-6xl w-full" onClick={(event) => event.stopPropagation()}>
        {count > 1 && <button type="button" aria-label="Previous photo" onClick={() => onIndexChange((index - 1 + count) % count)} className="p-2 rounded-full text-white/80 hover:bg-white/10"><ChevronLeft className="w-6 h-6" /></button>}
        <figure className="flex-1 min-w-0 text-center">
          {src && <img src={src} alt={meta.caption || 'Scout photo'} className="mx-auto max-h-[78vh] max-w-full rounded-lg shadow-2xl" />}
          <figcaption className="mt-2 text-sm text-white/85">
            {meta.caption || <span className="text-white/50">No caption</span>}
            <span className="block text-[11px] text-white/50 mt-0.5">
              {[meta.takenAt?.replace('T', ' '), meta.heading !== undefined ? `facing ${meta.heading}°` : null, `${index + 1} / ${count}`].filter(Boolean).join(' · ')}
            </span>
          </figcaption>
        </figure>
        {count > 1 && <button type="button" aria-label="Next photo" onClick={() => onIndexChange((index + 1) % count)} className="p-2 rounded-full text-white/80 hover:bg-white/10"><ChevronRight className="w-6 h-6" /></button>}
      </div>
    </div>,
    document.body,
  );
};

/**
 * Location scouting: a status for the shortlist, the recce answers, and a
 * photo set. Photos go to the asset store (rule 26); the date, GPS position
 * and camera heading are read from each photo's EXIF before the store
 * re-encodes it, so a scout's phone photos place themselves.
 */
export const LocationScoutSection: React.FC<LocationScoutSectionProps> = ({
  location,
  onUpdate,
  onSetPin,
  isLight: _isLight,
  inputClass,
  mutedText,
  subCardClass,
  setNames = [],
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const scout = location.scout ?? {};
  const photos = scout.photos ?? {};
  const photoIds = location.referenceAssetIds ?? [];

  const patchScout = (updates: Partial<LocationScout>) =>
    onUpdate((current) => {
      const next: LocationScout = { ...(current.scout ?? {}), ...updates };
      for (const key of Object.keys(next) as Array<keyof LocationScout>) {
        if (next[key] === undefined || next[key] === '') delete next[key];
      }
      return { ...current, scout: Object.keys(next).length ? next : undefined };
    });

  const patchPhoto = (assetId: string, updates: Partial<LocationScoutPhoto>) =>
    onUpdate((current) => ({
      ...current,
      scout: {
        ...(current.scout ?? {}),
        photos: { ...(current.scout?.photos ?? {}), [assetId]: { ...(current.scout?.photos?.[assetId] ?? {}), ...updates } },
      },
    }));

  const addPhotos = async (files: File[]) => {
    setBusy(true);
    setError(null);
    const added: Array<{ assetId: string; meta: LocationScoutPhoto }> = [];
    try {
      for (const file of files) {
        const exif = await readPhotoExif(file);
        const { assetId } = await storeImageAsset(file, { maxSize: 1600, quality: 0.84, source: `scout:${file.name}` });
        const meta: LocationScoutPhoto = {};
        if (exif.takenAt) meta.takenAt = exif.takenAt;
        if (exif.lat !== undefined && exif.lng !== undefined) {
          meta.lat = exif.lat;
          meta.lng = exif.lng;
        }
        if (exif.heading !== undefined) meta.heading = exif.heading;
        added.push({ assetId, meta });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'A photo could not be read.');
    } finally {
      setBusy(false);
    }
    if (added.length === 0) return;
    onUpdate((current) => {
      const ids = [...(current.referenceAssetIds ?? [])];
      const nextPhotos = { ...(current.scout?.photos ?? {}) };
      for (const { assetId, meta } of added) {
        if (!ids.includes(assetId)) ids.push(assetId);
        nextPhotos[assetId] = { ...(nextPhotos[assetId] ?? {}), ...meta };
      }
      return { ...current, referenceAssetIds: ids, scout: { ...(current.scout ?? {}), photos: nextPhotos } };
    });
    // No pin yet: the first photo that knows where it was taken places one.
    if (location.lat === undefined || location.lng === undefined) {
      const located = added.find(({ meta }) => meta.lat !== undefined && meta.lng !== undefined);
      if (located) onSetPin({ lat: located.meta.lat!, lng: located.meta.lng! });
    }
  };

  const removePhoto = (assetId: string) => {
    forgetAssetUrl(assetId);
    onUpdate((current) => {
      const nextPhotos = { ...(current.scout?.photos ?? {}) };
      delete nextPhotos[assetId];
      return {
        ...current,
        referenceAssetIds: (current.referenceAssetIds ?? []).filter((id) => id !== assetId),
        scout: current.scout ? { ...current.scout, photos: nextPhotos } : current.scout,
      };
    });
  };

  const pill = (active: boolean) =>
    `px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
      active
        ? 'bg-accent text-white border-sky-500'
        : 'border-line-strong text-ink-soft hover:bg-surface-hover'
    }`;

  return (
    <div className={`rounded-lg border p-2 space-y-2 ${subCardClass}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <ScoutIcon className="w-3.5 h-3.5 text-accent-ink" />
        <span className="text-xs font-bold">Scouting</span>
        <div className="flex gap-1 flex-wrap ml-auto" role="radiogroup" aria-label={`Scout status for ${location.name}`}>
          {(Object.keys(SCOUT_STATUS) as LocationScoutStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={scout.status === status}
              onClick={() => patchScout({ status: scout.status === status ? undefined : status })}
              className={pill(scout.status === status)}
            >
              {SCOUT_STATUS[status].label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className={`text-[11px] font-medium ${mutedText}`}>Candidate for set</span>
        <input
          value={scout.candidateFor ?? ''}
          onChange={(e) => patchScout({ candidateFor: e.target.value || undefined })}
          placeholder="Script location this place could play, e.g. LIVING ROOM"
          list={`scout-sets-${location.id}`}
          aria-label={`Set ${location.name} is a candidate for`}
          className={inputClass}
        />
        <datalist id={`scout-sets-${location.id}`}>
          {setNames.map((name) => <option key={name} value={name} />)}
        </datalist>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="flex flex-col gap-1">
          <span className={`text-[11px] font-medium ${mutedText}`}>Scouted on</span>
          <input type="date" value={scout.scoutedOn ?? ''} onChange={(e) => patchScout({ scoutedOn: e.target.value || undefined })} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={`text-[11px] font-medium ${mutedText}`}>Scouted by</span>
          <input value={scout.scoutedBy ?? ''} onChange={(e) => patchScout({ scoutedBy: e.target.value || undefined })} placeholder="Location manager" className={inputClass} />
        </label>
        <div className="flex flex-col gap-1">
          <span className={`text-[11px] font-medium ${mutedText}`}>Rating</span>
          <div className="flex items-center min-h-[36px]" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={scout.rating === value}
                aria-label={`${value} star${value === 1 ? '' : 's'}`}
                onClick={() => patchScout({ rating: scout.rating === value ? undefined : value })}
                className="p-0.5"
              >
                <Star className={`w-4 h-4 ${scout.rating !== undefined && value <= scout.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SCOUT_FIELDS.map((field) => (
          <label key={field.key} className="flex flex-col gap-1">
            <span className={`text-[11px] font-medium ${mutedText}`}>{field.label}</span>
            <input
              value={(scout[field.key] as string | undefined) ?? ''}
              onChange={(e) => patchScout({ [field.key]: e.target.value || undefined })}
              placeholder={field.placeholder}
              aria-label={`${field.label} for ${location.name}`}
              className={inputClass}
            />
          </label>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium ${mutedText}`}>Photos ({photoIds.length})</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (files.length) void addPhotos(files);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold disabled:opacity-50 border-line-strong hover:bg-surface-hover`}
          >
            <ImagePlus className="w-3.5 h-3.5" /> {busy ? 'Adding…' : 'Add photos'}
          </button>
        </div>
        {error && <p className="text-[11px] text-rose-500">{error}</p>}
        {photoIds.length === 0 ? (
          <p className={`text-[11px] italic ${mutedText}`}>
            Add scout photos. Phone photos with location data drop the map pin for you.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photoIds.map((assetId, index) => {
              const meta = photos[assetId] ?? {};
              return (
                <div key={assetId} className="space-y-1">
                  <div className="relative group/photo">
                    <ScoutPhotoThumb assetId={assetId} caption={meta.caption} onOpen={() => setViewing(index)} />
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover/photo:opacity-100 focus-within:opacity-100">
                      {meta.lat !== undefined && meta.lng !== undefined && (
                        <button
                          type="button"
                          onClick={() => onSetPin({ lat: meta.lat!, lng: meta.lng! })}
                          title="Move the map pin to where this photo was taken"
                          aria-label="Use photo location as map pin"
                          className="p-1 rounded bg-black/60 text-white hover:bg-black/80"
                        >
                          <MapPin className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(assetId)}
                        title="Remove photo"
                        aria-label="Remove photo"
                        className="p-1 rounded bg-black/60 text-white hover:bg-rose-600"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    {meta.heading !== undefined && (
                      <span className="absolute bottom-1 left-1 flex items-center gap-0.5 px-1 rounded bg-black/60 text-white text-[10px]" title="Camera heading">
                        <Compass className="w-3 h-3" style={{ transform: `rotate(${meta.heading - 45}deg)` }} />
                        {meta.heading}°
                      </span>
                    )}
                  </div>
                  <input
                    value={meta.caption ?? ''}
                    onChange={(e) => patchPhoto(assetId, { caption: e.target.value || undefined })}
                    placeholder={meta.takenAt ? meta.takenAt.replace('T', ' ').slice(0, 16) : 'Caption'}
                    aria-label="Photo caption"
                    className={`${inputClass} !min-h-[28px] !text-[11px]`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      {viewing !== null && photoIds[viewing] && (
        <PhotoViewer assetIds={photoIds} index={viewing} photos={photos} onIndexChange={setViewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
};
