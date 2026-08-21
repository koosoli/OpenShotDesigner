import React, { useMemo, useState } from 'react';
import { ArrowRight, Clapperboard, MapPin, Plus, UserRound, Users } from 'lucide-react';
import type { ScriptLine, SceneSetup } from '../../types';
import type { ScriptScene } from '../../domain/script';
import { createId } from '../../domain/ids';
import { deriveCharacterReport } from '../../domain/reports';
import { deriveScriptBreakdown, parseSceneHeading } from '../../domain/script/logic';
import { emptySetup } from '../../utils/projectLibrary';
import { useFloorPlan } from '../../context/FloorPlanContext';

interface ScriptReportsPanelProps {
  lines: ScriptLine[];
  isLight: boolean;
}

const setupTimeOfDay = (scene: ScriptScene): SceneSetup['timeOfDay'] => {
  const isNight = /NIGHT|DUSK|MIDNIGHT|NIGHTFALL/i.test(scene.timeOfDay || '');
  const isExterior = scene.intExt === 'EXT';
  return `${isNight ? 'Night' : 'Day'} ${isExterior ? 'EXT' : 'INT'}`;
};

export const ScriptReportsPanel: React.FC<ScriptReportsPanelProps> = ({ lines, isLight }) => {
  const {
    project,
    updateProjectMeta,
    setActiveSetupId,
    setActiveRightTab,
  } = useFloorPlan();
  const [report, setReport] = useState<'characters' | 'locations'>('characters');

  const breakdown = useMemo(
    () => deriveScriptBreakdown(lines, project.characters || [], project.locations || []),
    [lines, project.characters, project.locations],
  );

  const characterReports = useMemo(
    () => breakdown.characters
      .map((character) => deriveCharacterReport(character.id, {
        scriptScenes: breakdown.scenes,
        characters: breakdown.characters,
        people: project.people,
        castAssignments: project.castAssignments,
      }))
      .filter((entry) => entry.scenes.length > 0)
      .sort((a, b) => b.scenes.length - a.scenes.length ||
        (a.character?.canonicalName || '').localeCompare(b.character?.canonicalName || '')),
    [breakdown, project.people, project.castAssignments],
  );

  const card = isLight
    ? 'border-slate-200 bg-white shadow-sm'
    : 'border-slate-800 bg-slate-900/80';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';

  const matchingSetup = (scene: ScriptScene): SceneSetup | undefined =>
    project.setups.find((setup) =>
      setup.sceneNumber === scene.sceneNumber &&
      (!scene.locationId || setup.locationId === scene.locationId)
    );

  const buildSetup = (scene: ScriptScene, locationId?: string): SceneSetup => {
    const setup = emptySetup(`Scene ${scene.sceneNumber} · ${scene.heading}`);
    return {
      ...setup,
      sceneNumber: scene.sceneNumber,
      location: scene.heading,
      locationId,
      timeOfDay: setupTimeOfDay(scene),
    };
  };

  const createOrOpenSetup = (scene: ScriptScene, locationId?: string) => {
    const existing = matchingSetup(scene);
    if (existing) {
      setActiveSetupId(existing.id);
      setActiveRightTab('shots');
      return;
    }
    const setup = buildSetup(scene, locationId);
    updateProjectMeta({ setups: [...project.setups, setup], activeSetupId: setup.id });
    setActiveRightTab('shots');
  };

  const createLocation = (name: string) => {
    const location = {
      id: createId('loc'),
      name,
      type: 'location' as const,
      referenceAssetIds: [],
    };
    updateProjectMeta({ locations: [...(project.locations || []), location] });
    return location.id;
  };

  const createMissingSetups = (scenes: ScriptScene[], locationId?: string) => {
    const additions = scenes
      .filter((scene) => !matchingSetup(scene))
      .map((scene) => buildSetup(scene, locationId));
    if (additions.length === 0) return;
    updateProjectMeta({
      setups: [...project.setups, ...additions],
      activeSetupId: additions[0].id,
    });
    setActiveRightTab('shots');
  };

  if (breakdown.scenes.length === 0) {
    return (
      <div className={`flex-1 grid place-items-center p-8 ${isLight ? 'bg-slate-50' : 'bg-slate-950'}`}>
        <div className="max-w-md text-center">
          <Clapperboard className="w-10 h-10 mx-auto mb-3 text-violet-400" />
          <h3 className="font-semibold">No scene breakdown yet</h3>
          <p className={`text-sm mt-1 ${muted}`}>Add screenplay scene headings and character cues. Reports update live while you write.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 overflow-auto p-4 sm:p-6 ${isLight ? 'bg-slate-50' : 'bg-slate-950'}`}>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${muted}`}>Live script intelligence</p>
            <h2 className="text-xl font-semibold mt-1">Breakdown reports</h2>
            <p className={`text-xs mt-1 ${muted}`}>{breakdown.scenes.length} scenes · {characterReports.length} speaking characters · {breakdown.locations.length} locations</p>
          </div>
          <div className={`flex p-1 rounded-xl border ${isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'}`}>
            <button onClick={() => setReport('characters')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex gap-1.5 items-center ${report === 'characters' ? 'bg-violet-600 text-white' : muted}`}>
              <Users className="w-3.5 h-3.5" /> Characters
            </button>
            <button onClick={() => setReport('locations')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex gap-1.5 items-center ${report === 'locations' ? 'bg-violet-600 text-white' : muted}`}>
              <MapPin className="w-3.5 h-3.5" /> Locations
            </button>
          </div>
        </div>

        {report === 'characters' ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {characterReports.map((entry) => (
              <article key={entry.character?.id} className={`rounded-2xl border p-4 ${card}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 grid place-items-center"><UserRound className="w-4 h-4" /></div>
                    <div>
                      <h3 className="text-sm font-bold">{entry.character?.canonicalName}</h3>
                      <p className={`text-[11px] ${muted}`}>{entry.castPerson?.displayName || 'Cast not assigned'}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-400">{entry.scenes.length} scenes</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {entry.scenes.map((scene) => (
                    <span key={scene.id} title={scene.heading} className={`px-2 py-1 rounded-md border text-[10px] font-mono ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-950'}`}>
                      SC {scene.sceneNumber}
                    </span>
                  ))}
                </div>
                <p className={`mt-3 text-[10px] ${muted}`}>First {entry.firstSceneNumber} · Last {entry.lastSceneNumber}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {breakdown.locations.map((location) => {
              const parsedScenes = location.scenes.map((scene) => ({ scene, parsed: parseSceneHeading(scene.heading) }));
              const intCount = parsedScenes.filter(({ parsed }) => parsed.intExt === 'INT').length;
              const extCount = parsedScenes.filter(({ parsed }) => parsed.intExt === 'EXT').length;
              const missingCount = location.scenes.filter((scene) => !matchingSetup(scene)).length;
              return (
                <article key={location.key} className={`rounded-2xl border p-4 ${card}`}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 grid place-items-center"><MapPin className="w-4 h-4" /></div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold">{location.name}</h3>
                          <span className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded ${location.locationId ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                            {location.locationId ? 'Project location' : 'Script only'}
                          </span>
                        </div>
                        <p className={`text-[11px] mt-0.5 ${muted}`}>{location.scenes.length} scenes · {intCount} INT · {extCount} EXT</p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {!location.locationId && (
                        <button onClick={() => createLocation(location.name)} className="px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 text-xs font-semibold flex items-center gap-1.5 hover:bg-amber-500/10">
                          <Plus className="w-3.5 h-3.5" /> Create location
                        </button>
                      )}
                      {location.locationId && (
                        <button onClick={() => setActiveRightTab('locations')} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>Open location</button>
                      )}
                      {missingCount > 0 && (
                        <button onClick={() => createMissingSetups(location.scenes, location.locationId)} className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center gap-1.5">
                          <Clapperboard className="w-3.5 h-3.5" /> Create {missingCount} scene{missingCount === 1 ? '' : 's'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 divide-y divide-slate-700/20">
                    {location.scenes.map((scene) => {
                      const existing = matchingSetup(scene);
                      return (
                        <div key={scene.id} className="py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="text-[10px] font-bold text-violet-400 mr-2">SC {scene.sceneNumber}</span>
                            <span className="text-xs font-medium truncate">{scene.heading}</span>
                          </div>
                          <button onClick={() => createOrOpenSetup(scene, location.locationId)} className={`shrink-0 px-2.5 py-1 rounded-lg border text-[10px] font-semibold flex items-center gap-1 ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>
                            {existing ? 'Open scene' : 'Create scene'} <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
