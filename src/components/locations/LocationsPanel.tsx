/**
 * Locations panel (plan §4.1, §13).
 *
 * CRUD for canonical Location entities plus the master-plan indicator per
 * location (§13): a location can designate one scene setup as its reusable
 * master plan. Jumping switches to that setup; copying master elements is a
 * detach-style snapshot (§13.1) offered from the Inspector, not here.
 */
import React, { useMemo, useState } from 'react';
import { ExternalLink, MapPin, Navigation, Plus, Trash2, Crosshair, X } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { createId } from '../../domain/ids';
import {
  geocodeLocation,
  locationMapLinkUrl,
  locationOsmLinkUrl,
  locationPoint,
  locationQuery,
  reverseGeocode,
} from '../../domain/locations';
import type { GeoPoint } from '../../domain/locations';
import type { LocationType } from '../../domain/locations';
import { OsmMiniMap } from './OsmMiniMap';

const LOCATION_TYPES: LocationType[] = ['location', 'studio', 'stage', 'venue', 'arena', 'outdoor', 'other'];

const TYPE_LABELS: Record<LocationType, string> = {
  location: 'Location',
  studio: 'Studio',
  stage: 'Stage',
  venue: 'Venue',
  arena: 'Arena',
  outdoor: 'Outdoor',
  other: 'Other',
};

export const LocationsPanel: React.FC = () => {
  const {
    project,
    theme,
    updateProjectMeta,
    setActiveSetupId,
    setActiveRightTab,
  } = useFloorPlan();
  const isLight = theme === 'light';

  const locations = useMemo(() => project.locations ?? [], [project.locations]);
  const people = useMemo(() => project.people ?? [], [project.people]);

  /** Link / unlink a contact to a location (people stay canonical, rule 37). */
  const toggleContact = (loc: { id: string; contactIds?: string[] }, personId: string) => {
    const current = loc.contactIds ?? [];
    const next = current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId];
    updateProjectMeta({
      locations: (project.locations ?? []).map((candidate) =>
        candidate.id === loc.id ? { ...candidate, contactIds: next } : candidate,
      ),
    });
  };

  /** setup id that is the declared master plan for each location id. */
  const masterSetupByLocation = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const s of project.setups) {
      if (s.masterPlanForLocationId && !map.has(s.masterPlanForLocationId)) {
        map.set(s.masterPlanForLocationId, { id: s.id, name: s.name });
      }
    }
    return map;
  }, [project.setups]);

  /** Setups referencing a location via the semantic link (§4.13). */
  const setupsUsingLocation = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of project.setups) {
      if (s.locationId) map.set(s.locationId, (map.get(s.locationId) ?? 0) + 1);
    }
    return map;
  }, [project.setups]);

  // New-location form state (session-only UI state — rule 38).
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<LocationType>('location');
  /** Per-location geocode session state (rule 38: never persisted). */
  const [geocodingId, setGeocodingId] = useState<string | null>(null);
  const [geocodeMessage, setGeocodeMessage] = useState<{ id: string; text: string } | null>(null);

  const addLocation = () => {
    const location = {
      id: createId('loc'),
      name: newName.trim() || `New ${TYPE_LABELS[newType].toLowerCase()}`,
      type: newType,
      referenceAssetIds: [],
    };
    updateProjectMeta({ locations: [...locations, location] });
    setNewName('');
    setNewType('location');
  };

  const updateLocation = (id: string, updates: Partial<{ name: string; type: LocationType; address?: string; parentLocationId?: string; notes?: string; lat?: number; lng?: number }>) => {
    updateProjectMeta({
      locations: locations.map((l) =>
        l.id === id ? { ...l, ...updates } : l
      ),
    });
  };

  /** Resolve the location's address (or name) into a map pin via OSM Nominatim. */
  const locateOnMap = async (loc: { id: string; name: string; address?: string }) => {
    if (geocodingId) return;
    setGeocodeMessage(null);
    setGeocodingId(loc.id);
    try {
      const result = await geocodeLocation(locationQuery(loc));
      switch (result.status) {
        case 'ok':
          updateLocation(loc.id, { lat: result.point.lat, lng: result.point.lng });
          setGeocodeMessage({ id: loc.id, text: 'Pin placed from OpenStreetMap.' });
          break;
        case 'not_found':
          setGeocodeMessage({ id: loc.id, text: 'No match found — refine the address and retry.' });
          break;
        case 'unavailable':
          setGeocodeMessage({ id: loc.id, text: result.message });
          break;
      }
    } finally {
      setGeocodingId(null);
    }
  };

  /**
   * A pin dropped on the map fills in the address (reverse geocoding) unless
   * the user already typed one; "Use pin address" overwrites on demand.
   */
  const pickPin = async (loc: { id: string; address?: string }, picked: { lat: number; lng: number }, overwrite = false) => {
    updateLocation(loc.id, { lat: picked.lat, lng: picked.lng });
    if (loc.address && !overwrite) {
      setGeocodeMessage({ id: loc.id, text: 'Pin moved. Use “Address from pin” to replace the typed address.' });
      return;
    }
    setGeocodingId(loc.id);
    setGeocodeMessage({ id: loc.id, text: 'Looking up the address for this pin…' });
    try {
      const result = await reverseGeocode(picked);
      if (result.status === 'ok') {
        updateProjectMeta({
          locations: (project.locations ?? []).map((l) => (l.id === loc.id ? { ...l, lat: picked.lat, lng: picked.lng, address: result.address } : l)),
        });
        setGeocodeMessage({ id: loc.id, text: 'Address filled in from the pin (OpenStreetMap).' });
      } else {
        setGeocodeMessage({ id: loc.id, text: result.status === 'not_found' ? 'Pin placed — no address known for this spot.' : result.message ?? 'Address lookup unavailable.' });
      }
    } finally {
      setGeocodingId(null);
    }
  };

  /**
   * Delete a location: child locations are re-parented to top level and every
   * semantic link (setup.locationId / masterPlanForLocationId, §4.13) is
   * cleared so no dangling references remain.
   */
  const deleteLocation = (id: string) => {
    updateProjectMeta({
      locations: locations
        .filter((l) => l.id !== id)
        .map((l) =>
          l.parentLocationId === id ? { ...l, parentLocationId: undefined } : l
        ),
      setups: project.setups.map((s) =>
        s.locationId === id || s.masterPlanForLocationId === id
          ? { ...s, locationId: undefined, masterPlanForLocationId: undefined }
          : s
      ),
    });
  };

  const jumpToMasterPlan = (setupId: string) => {
    setActiveSetupId(setupId);
    setActiveRightTab('shots');
  };

  // --- Shared styles (LogisticsPanel/PowerPanel conventions) ---
  const cardClass = isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700';
  const subCardClass = isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800';
  const mutedText = isLight ? 'text-slate-500' : 'text-slate-400';
  const headingText = isLight ? 'text-slate-700' : 'text-slate-300';
  const inputClass = `min-h-[36px] px-2 py-1 rounded-lg border text-xs w-full transition-colors ${
    isLight
      ? 'bg-white border-slate-300 text-slate-800 focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500'
      : 'bg-slate-950 border-slate-700 text-slate-100 focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500'
  }`;
  const iconBtnClass = `flex items-center justify-center min-w-[36px] min-h-[36px] rounded-lg transition-colors flex-shrink-0 ${
    isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/70' : 'text-slate-400 hover:text-white hover:bg-slate-800'
  }`;
  const primaryBtnClass = `flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg text-xs font-semibold transition-colors flex-shrink-0 disabled:opacity-40 ${
    isLight ? 'bg-sky-600 text-white hover:bg-sky-700' : 'bg-sky-600 text-white hover:bg-sky-500'
  }`;
  const secondaryBtnClass = `flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg text-xs font-semibold border transition-colors flex-shrink-0 disabled:opacity-40 ${
    isLight
      ? 'border-slate-300 text-slate-700 hover:bg-slate-200/70'
      : 'border-slate-700 text-slate-300 hover:bg-slate-800'
  }`;
  const chipClass = `px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
    isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-300'
  }`;

  return (
    <div className={`h-full overflow-y-auto p-3 space-y-3 select-none ${isLight ? 'bg-white' : 'bg-slate-900'}`}>
      <div className={`flex items-center justify-between pb-2 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        <h2 className={`text-sm font-bold flex items-center gap-1.5 ${headingText}`}>
          <MapPin className="w-4 h-4 text-sky-500" />
          Locations
          <span className={chipClass}>{locations.length}</span>
        </h2>
      </div>

      {/* New location */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addLocation();
          }}
          placeholder="New location name"
          aria-label="New location name"
          className={`${inputClass} flex-1 min-w-[140px]`}
        />
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as LocationType)}
          aria-label="New location type"
          className={`${inputClass} !w-auto`}
        >
          {LOCATION_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
        <button onClick={addLocation} title="Add location" aria-label="Add location" className={primaryBtnClass}>
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {locations.length === 0 && (
        <p className={`text-[11px] italic ${mutedText}`}>
          No locations yet. Add practical locations, studios, stages or venues — a screenplay is never required.
        </p>
      )}

      <ul className="space-y-2">
        {locations.map((loc) => {
          const master = masterSetupByLocation.get(loc.id);
          const usageCount = setupsUsingLocation.get(loc.id) ?? 0;
          return (
            <li key={loc.id} className={`rounded-xl border p-2.5 space-y-2 ${cardClass}`}>
              <div className="flex items-center gap-1.5 flex-wrap">
                <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
                <input
                  value={loc.name}
                  onChange={(e) => updateLocation(loc.id, { name: e.target.value })}
                  placeholder="Location name"
                  aria-label={`Name for ${loc.name}`}
                  className={`${inputClass} flex-1 min-w-[120px] font-semibold`}
                />
                <select
                  value={loc.type}
                  onChange={(e) => updateLocation(loc.id, { type: e.target.value as LocationType })}
                  aria-label={`Type for ${loc.name}`}
                  className={`${inputClass} !w-auto`}
                >
                  {LOCATION_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
                <button
                  onClick={() => deleteLocation(loc.id)}
                  title={`Delete ${loc.name}`}
                  aria-label={`Delete ${loc.name}`}
                  className={`${iconBtnClass} hover:!text-red-500`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className={`text-[10px] font-medium ${mutedText}`}>Address</span>
                  <input
                    value={loc.address ?? ''}
                    onChange={(e) => updateLocation(loc.id, { address: e.target.value || undefined })}
                    placeholder="Street, city"
                    aria-label={`Address for ${loc.name}`}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={`text-[10px] font-medium ${mutedText}`}>Parent location</span>
                  <select
                    value={loc.parentLocationId ?? ''}
                    onChange={(e) => updateLocation(loc.id, { parentLocationId: e.target.value || undefined })}
                    aria-label={`Parent location for ${loc.name}`}
                    className={inputClass}
                  >
                    <option value="">— none (top level) —</option>
                    {locations.filter((l) => l.id !== loc.id).map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Map (OpenStreetMap default — keyless, standalone-safe; Google Maps link-out) */}
              {(() => {
                const point = locationPoint(loc);
                return (
                  <div className={`rounded-lg border p-2 space-y-2 ${subCardClass}`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Navigation className={`w-3 h-3 flex-shrink-0 ${point ? 'text-emerald-500' : 'text-slate-400'}`} />
                      <span className={`text-[10px] font-medium flex-1 min-w-0 ${mutedText}`}>
                        {point ? `Pinned at ${loc.lat?.toFixed(5)}, ${loc.lng?.toFixed(5)}` : 'No map pin yet'}
                      </span>
                      <button
                        onClick={() => locateOnMap(loc)}
                        disabled={geocodingId === loc.id}
                        title="Find this address on the map (OpenStreetMap)"
                        aria-label={`Find ${loc.name} on the map`}
                        className={`${secondaryBtnClass} !min-h-[28px] !px-2 !text-[10px] disabled:opacity-50`}
                      >
                        {geocodingId === loc.id ? 'Locating…' : 'Find on map'}
                      </button>
                      {point && (
                        <>
                          <a
                            href={locationMapLinkUrl(loc)}
                            target="_blank"
                            rel="noreferrer"
                            title="Open in Google Maps"
                            aria-label={`Open ${loc.name} in Google Maps`}
                            className={`${iconBtnClass} !min-w-[28px] !min-h-[28px] !w-7 !h-7`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <a
                            href={locationOsmLinkUrl(loc)}
                            target="_blank"
                            rel="noreferrer"
                            title="Open in OpenStreetMap"
                            aria-label={`Open ${loc.name} in OpenStreetMap`}
                            className={`${iconBtnClass} !min-w-[28px] !min-h-[28px] !w-7 !h-7 font-mono !text-[9px] font-bold`}
                          >
                            OSM
                          </a>
                          <button
                            onClick={() => updateLocation(loc.id, { lat: undefined, lng: undefined })}
                            title="Clear map pin"
                            aria-label={`Clear map pin for ${loc.name}`}
                            className={`${iconBtnClass} !min-w-[28px] !min-h-[28px] !w-7 !h-7 hover:!text-red-500`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                    {point ? (
                      <>
                        <OsmMiniMap
                          point={point}
                          height={200}
                          onPick={(picked) => void pickPin(loc, picked)}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-[9px] ${mutedText}`}>Drag to pan · click to move the pin · buttons zoom.</p>
                          <button
                            onClick={() => void pickPin(loc, point, true)}
                            disabled={geocodingId === loc.id}
                            className={`${secondaryBtnClass} !min-h-[24px] !px-2 !text-[9px] disabled:opacity-50`}
                            title="Replace the address field with the pin's postal address"
                          >
                            Address from pin
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <OsmMiniMap point={null} height={160} onPick={(picked) => void pickPin(loc, picked)} />
                        <p className={`text-[9px] leading-snug ${mutedText}`}>
                          Click the map to drop a pin — the address fills in automatically — or enter an address above and use “Find on map”. The pin follows the location into the scheduler and call sheets.
                        </p>
                      </>
                    )}
                    {geocodeMessage?.id === loc.id && (
                      <p className="text-[9px] italic text-sky-600 dark:text-sky-300">{geocodeMessage.text}</p>
                    )}
                    {point && (
                      <p className="text-[8px] text-slate-400">
                        Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap</a> contributors
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Location contacts (people domain) — the same people the call
                  sheet and crew list use; never a second copy of the details. */}
              <div className="flex flex-col gap-1">
                <span className={`text-[10px] font-medium ${mutedText}`}>Site contacts</span>
                {people.length === 0 ? (
                  <p className={`text-[10px] italic ${mutedText}`}>
                    Add people in the Contacts module to link a site manager, owner or security here.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {people.map((person) => {
                      const linked = (loc.contactIds ?? []).includes(person.id);
                      return (
                        <button
                          key={person.id}
                          onClick={() => toggleContact(loc, person.id)}
                          title={[person.role, person.phone, person.email].filter(Boolean).join(' · ') || person.displayName}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                            linked
                              ? 'bg-sky-600 text-white border-sky-500'
                              : isLight
                                ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {person.displayName}
                        </button>
                      );
                    })}
                  </div>
                )}
                {(loc.contactIds ?? []).length > 0 && (
                  <p className={`text-[9px] ${mutedText}`}>
                    {(loc.contactIds ?? [])
                      .map((id) => people.find((person) => person.id === id))
                      .filter((person): person is NonNullable<typeof person> => !!person)
                      .map((person) => [person.displayName, person.phone].filter(Boolean).join(' · '))
                      .join(' — ')}
                  </p>
                )}
              </div>

              <label className="flex flex-col gap-1">
                <span className={`text-[10px] font-medium ${mutedText}`}>Notes</span>
                <textarea
                  value={loc.notes ?? ''}
                  onChange={(e) => updateLocation(loc.id, { notes: e.target.value || undefined })}
                  placeholder="Parking, access, power, contacts…"
                  aria-label={`Notes for ${loc.name}`}
                  rows={2}
                  className={`${inputClass} resize-y`}
                />
              </label>

              {/* Master plan indicator (plan §13) */}
              <div className={`rounded-lg border px-2 py-1.5 flex items-center gap-2 flex-wrap ${subCardClass}`}>
                {master ? (
                  <>
                    <span className={`text-[11px] flex items-center gap-1 min-w-0 ${headingText}`}>
                      <Crosshair className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                      Master plan:
                      <span className="truncate max-w-[160px]" title={master.name}>{master.name}</span>
                    </span>
                    <button
                      onClick={() => jumpToMasterPlan(master.id)}
                      title="Open this setup as the active scene"
                      aria-label={`Open master plan for ${loc.name}`}
                      className={secondaryBtnClass}
                    >
                      Open
                    </button>
                  </>
                ) : (
                  <span className={`text-[11px] italic ${mutedText}`}>
                    No master plan yet — open a scene assigned here and use “Make this setup the master plan” in the Inspector.
                  </span>
                )}
              </div>

              <p className={`text-[10px] ${mutedText}`}>
                {usageCount === 0
                  ? 'No scenes linked to this location.'
                  : `${usageCount} ${usageCount === 1 ? 'scene' : 'scenes'} linked.`}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
