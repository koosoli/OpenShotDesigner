import React, { useMemo, useState } from 'react';
import { Database, Plus, Search, Trash2, X } from 'lucide-react';
import type { LightElement } from '../../types';
import {
  fixtureBoundingVolumeLitres,
  fixtureModeById,
  OFFLINE_FIXTURE_DB_MANIFEST,
  OFFLINE_FIXTURE_PROFILES,
  searchFixtureProfiles,
} from '../../domain/fixtures';
import type { FixtureProfile } from '../../domain/fixtures';
import {
  buildCustomFixtureProfile,
  deleteCustomFixtureProfile,
  loadCustomFixtureProfiles,
  upsertCustomFixtureProfile,
} from '../../domain/fixtures/customProfiles';

interface FixtureProfilePickerProps {
  light: LightElement;
  onChange: (updates: Partial<LightElement>) => void;
  isLight: boolean;
}

const CONNECTOR_LABELS: Record<string, string> = {
  XLR5: '5-pin DMX',
  XLR3: '3-pin DMX',
  RJ45: 'RJ45 (Art-Net/sACN ready)',
  OTHER: 'Proprietary',
};

/**
 * Real-fixture data picker (plan Â§17): search the bundled offline OFL
 * snapshot plus locally authored profiles, apply one to this light, choose
 * its DMX personality, and read the technical card. One profile feeds the DMX
 * patch bay (channel footprint), power planning (explicit watts â€” never the
 * model name) and surfaces weight/dimensions for rigging & logistics.
 */
export const FixtureProfilePicker: React.FC<FixtureProfilePickerProps> = ({ light, onChange, isLight }) => {
  const [customVersion, setCustomVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [draft, setDraft] = useState({
    manufacturer: '',
    model: '',
    categories: '',
    weightKg: '',
    powerWatts: '',
    widthMm: '',
    heightMm: '',
    depthMm: '',
    modesText: '',
  });

  const allProfiles = useMemo<FixtureProfile[]>(() => {
    void customVersion;
    return [...OFFLINE_FIXTURE_PROFILES, ...loadCustomFixtureProfiles()];
  }, [customVersion]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return searchFixtureProfiles(allProfiles, query).slice(0, 8);
  }, [allProfiles, query]);

  const profile =
    allProfiles.find((candidate) => candidate.id === light.fixtureProfileId) ?? null;
  const mode = profile ? fixtureModeById(profile, light.fixtureModeId) : undefined;

  const applyProfile = (next: FixtureProfile, modeId?: string) => {
    const chosen = fixtureModeById(next, modeId ?? next.modes[0]?.id);
    onChange({
      brand: next.manufacturer,
      fixtureModel: next.model,
      fixtureProfileId: next.id,
      fixtureModeId: chosen?.id,
      dmxModeName: chosen?.channelCount ? chosen.name : undefined,
      dmxChannelCount: chosen?.channelCount || undefined,
    });
    setQuery('');
  };

  const detachProfile = () => {
    onChange({
      fixtureProfileId: undefined,
      fixtureModeId: undefined,
      dmxModeName: undefined,
      dmxChannelCount: undefined,
    });
  };

  const saveDraft = () => {
    const built = buildCustomFixtureProfile({
      manufacturer: draft.manufacturer,
      model: draft.model,
      categories: draft.categories,
      weightKg: Number(draft.weightKg) || undefined,
      powerWatts: Number(draft.powerWatts) || undefined,
      widthMm: Number(draft.widthMm) || undefined,
      heightMm: Number(draft.heightMm) || undefined,
      depthMm: Number(draft.depthMm) || undefined,
      modesText: draft.modesText,
    });
    if (!built) return;
    upsertCustomFixtureProfile(built);
    setCustomVersion((v) => v + 1);
    setShowCustomForm(false);
    applyProfile(built);
  };

  const inputCls = `w-full border rounded-lg p-1.5 text-xs ${
    isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
  }`;
  const mutedCls = isLight ? 'text-slate-500' : 'text-slate-400';
  const cardCls = `rounded-lg border p-2 space-y-2 ${
    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
  }`;

  const volumeLitres = profile ? fixtureBoundingVolumeLitres(profile) : undefined;
  const connector = profile?.portDefinitions?.[0]?.connectorType;
  const isManualSource = profile?.source?.provider === 'manual';

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
          <Database className="w-3.5 h-3.5 text-violet-500" /> Real fixture data
        </span>
        <button
          onClick={() => setShowCustomForm((v) => !v)}
          title={showCustomForm ? 'Close custom fixture editor' : 'Author a fixture that is not in OFL'}
          className={`p-1 rounded ${isLight ? 'hover:bg-slate-200' : 'hover:bg-slate-800'} ${mutedCls}`}
        >
          {showCustomForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </div>

      {profile && (
        <p className="text-[10px]" style={{ color: isLight ? '#0369a1' : '#7dd3fc' }}>
          Linked: <b>{profile.manufacturer} {profile.model}</b>
        </p>
      )}

      {/* Search & apply */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search manufacturer / modelâ€¦"
          className={`${inputCls} !pl-7`}
          aria-label="Search fixture database"
        />
        {results.length > 0 && (
          <ul className={`absolute z-20 mt-1 w-full max-h-52 overflow-y-auto custom-scrollbar rounded-lg border shadow-lg ${
            isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
          }`}>
            {results.map((candidate) => (
              <li key={candidate.id}>
                <button
                  onClick={() => applyProfile(candidate)}
                  className="w-full text-left px-2 py-1.5 text-[11px] hover:bg-sky-500/15"
                >
                  <span className="font-bold">{candidate.manufacturer}</span> {candidate.model}
                  {candidate.modes.length > 0 && (
                    <span className="opacity-50"> Â· {candidate.modes.length} modes</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Mode selector for a linked profile */}
      {profile && profile.modes.length > 0 && (
        <label className="block space-y-1">
          <span className={`text-[10px] font-semibold ${mutedCls}`}>DMX personality</span>
          <select
            value={mode?.id ?? ''}
            onChange={(e) => applyProfile(profile, e.target.value)}
            className={inputCls}
          >
            {profile.modes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} â€” {m.channelCount} ch
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Technical card */}
      {profile && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          {profile.dimensions && (profile.dimensions.widthMm || profile.dimensions.heightMm || profile.dimensions.depthMm) ? (
            <>
              <dt className={mutedCls}>Size</dt>
              <dd className="font-mono">
                {[profile.dimensions.widthMm, profile.dimensions.heightMm, profile.dimensions.depthMm]
                  .filter((v): v is number => typeof v === 'number')
                  .join(' Ã— ')}{' '}
                mm
              </dd>
            </>
          ) : null}
          {profile.weightKg !== undefined && (
            <>
              <dt className={mutedCls}>Weight</dt>
              <dd className="font-mono">{profile.weightKg} kg</dd>
            </>
          )}
          {profile.powerWatts !== undefined && (
            <>
              <dt className={mutedCls}>Power</dt>
              <dd className="font-mono">{profile.powerWatts} W</dd>
            </>
          )}
          {volumeLitres !== undefined && (
            <>
              <dt className={mutedCls}>Volume â‰ˆ</dt>
              <dd className="font-mono">{volumeLitres.toFixed(1)} L (bounding)</dd>
            </>
          )}
          {connector && (
            <>
              <dt className={mutedCls}>Control</dt>
              <dd>{CONNECTOR_LABELS[connector] ?? connector}</dd>
            </>
          )}
          <dt className={mutedCls}>Source</dt>
          <dd className="truncate" title={`${profile.source?.provider ?? 'unknown'} Â· ${profile.source?.license ?? ''}`}>
            {isManualSource ? 'Manual entry' : `${profile.source?.provider ?? '?'} snapshot`}
            {!isManualSource && profile.source?.license ? ` Â· ${profile.source.license}` : ''}
          </dd>
        </dl>
      )}

      {profile && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={detachProfile}
            className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${
              isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
            }`}
          >
            Detach profile
          </button>
          {isManualSource && (
            <button
              onClick={() => {
                deleteCustomFixtureProfile(profile.id);
                setCustomVersion((v) => v + 1);
                detachProfile();
              }}
              className="px-2 py-1 rounded-lg border border-rose-500/40 text-rose-500 text-[10px] font-bold flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Delete custom
            </button>
          )}
        </div>
      )}

      {/* Custom fixture editor */}
      {showCustomForm && (
        <div className="space-y-1.5 border-t border-inherit pt-2">
          <p className={`text-[10px] ${mutedCls}`}>
            Author gear that is not in OFL yet. Saved locally with your workspace templates.
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <input value={draft.manufacturer} onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value })} placeholder="Manufacturer *" className={inputCls} />
            <input value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} placeholder="Model *" className={inputCls} />
            <input value={draft.weightKg} onChange={(e) => setDraft({ ...draft, weightKg: e.target.value })} placeholder="Weight kg" type="number" min="0" step="0.1" className={inputCls} />
            <input value={draft.powerWatts} onChange={(e) => setDraft({ ...draft, powerWatts: e.target.value })} placeholder="Power W" type="number" min="0" step="1" className={inputCls} />
            <input value={draft.widthMm} onChange={(e) => setDraft({ ...draft, widthMm: e.target.value })} placeholder="Width mm" type="number" min="0" className={inputCls} />
            <input value={draft.heightMm} onChange={(e) => setDraft({ ...draft, heightMm: e.target.value })} placeholder="Height mm" type="number" min="0" className={inputCls} />
            <input value={draft.depthMm} onChange={(e) => setDraft({ ...draft, depthMm: e.target.value })} placeholder="Depth mm" type="number" min="0" className={inputCls} />
            <input value={draft.categories} onChange={(e) => setDraft({ ...draft, categories: e.target.value })} placeholder="Categories (comma)" className={inputCls} />
          </div>
          <textarea
            value={draft.modesText}
            onChange={(e) => setDraft({ ...draft, modesText: e.target.value })}
            placeholder={'DMX modes, one per line:\nBasic = 8\nExtended 16-bit = 22'}
            rows={3}
            className={`${inputCls} resize-y font-mono`}
          />
          <button
            onClick={saveDraft}
            disabled={!draft.manufacturer.trim() || !draft.model.trim()}
            className="px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-bold disabled:opacity-40"
          >
            Save & apply to this light
          </button>
        </div>
      )}

      <p className={`text-[9px] leading-snug ${mutedCls}`}>
        Snapshot {OFFLINE_FIXTURE_DB_MANIFEST.snapshotId} Â· {OFFLINE_FIXTURE_DB_MANIFEST.count} fixtures Â·{' '}
        {(OFFLINE_FIXTURE_DB_MANIFEST.license || '').slice(0, 40)} Â· works offline.
      </p>
    </div>
  );
};
