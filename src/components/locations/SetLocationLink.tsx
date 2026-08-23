import React from 'react';
import { MapPin } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { createId } from '../../domain/ids';
import { linkSetNameToLocation, locationForSetName, unlinkSetName } from '../../domain/locations';

interface SetLocationLinkProps {
  /** The set as the script names it — the location part of a scene heading. */
  setName: string;
  isLight: boolean;
  /** Compact chip for a script line; the default is a labelled control. */
  compact?: boolean;
}

const CREATE = '__create__';
const NONE = '__none__';

/**
 * Link the set a scene heading names to a project location, in one control.
 *
 * The association used to live only on Script → Reports → Locations, a step
 * nothing pointed at, so the usual way to discover it was a call sheet that
 * said "address not entered". This is the same action — an alias on the
 * location, see `domain/locations/linking.ts` — offered wherever the set name
 * appears: on the heading itself and on the sheet that needs the address.
 */
export const SetLocationLink: React.FC<SetLocationLinkProps> = ({ setName, isLight, compact }) => {
  const { project, updateProjectMeta } = useFloorPlan();
  const locations = project.locations ?? [];
  const linked = locationForSetName(locations, setName);
  if (!setName.trim()) return null;

  const choose = (value: string) => {
    if (value === NONE) {
      updateProjectMeta({ locations: unlinkSetName(locations, setName) });
      return;
    }
    if (value === CREATE) {
      const location = { id: createId('loc'), name: setName.trim(), type: 'location' as const, referenceAssetIds: [] };
      updateProjectMeta({ locations: [...locations, location] });
      return;
    }
    updateProjectMeta({ locations: linkSetNameToLocation(locations, setName, value) });
  };

  const tone = linked
    ? isLight ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300'
    : isLight ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-amber-700/60 bg-amber-950/40 text-amber-300';

  return (
    <label
      className={`inline-flex items-center gap-1 rounded-md border ${tone} ${compact ? 'px-1 py-0 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'} font-semibold max-w-full`}
      title={linked ? `Linked to ${linked.name}${linked.address ? ` — ${linked.address}` : ' (no address yet)'}` : 'Not linked to a project location: the call sheet has no address or map pin for it'}
    >
      <MapPin className="w-3 h-3 shrink-0" />
      <select
        value={linked?.id ?? NONE}
        onChange={(event) => choose(event.target.value)}
        aria-label={`Location for ${setName}`}
        className="bg-transparent outline-none cursor-pointer min-w-0 max-w-[180px] truncate"
      >
        <option value={NONE}>{linked ? 'Unlink' : 'Link location…'}</option>
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}{location.address ? ` — ${location.address}` : ''}
          </option>
        ))}
        {!locations.some((location) => location.name.trim().toLowerCase() === setName.trim().toLowerCase()) && (
          <option value={CREATE}>＋ Create “{setName.trim()}”</option>
        )}
      </select>
    </label>
  );
};
