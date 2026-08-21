/**
 * Locations panel (plan §4.1, §13).
 *
 * CRUD for canonical Location entities plus the master-plan indicator per
 * location (§13): a location can designate one scene setup as its reusable
 * master plan. Jumping switches to that setup; copying master elements is a
 * detach-style snapshot (§13.1) offered from the Inspector, not here.
 */
import React, { useMemo, useState } from 'react';
import { MapPin, Plus, Trash2, Crosshair } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { createId } from '../../domain/ids';
import type { LocationType } from '../../domain/locations';

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

  const updateLocation = (id: string, updates: Partial<{ name: string; type: LocationType; address?: string; parentLocationId?: string; notes?: string }>) => {
    updateProjectMeta({
      locations: locations.map((l) =>
        l.id === id ? { ...l, ...updates } : l
      ),
    });
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
