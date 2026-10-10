import React, { useMemo, useState } from 'react';
import { requestScheduleView } from '../../utils/uiPrefs';
import { cachedScriptBreakdown } from '../../domain/script/breakdownCache';
import { PanelTitle } from '../common/PanelHeader';
import { ArrowRight, Clapperboard, ListOrdered, MapPin, Package, Users } from 'lucide-react';
import type { ScriptLine, SceneSetup } from '../../types';
import type { ScriptScene } from '../../domain/script';
import { characterColor } from '../../domain/script';
import { deriveCharacterReport, formatPageEighths } from '../../domain/reports';
import { parseSceneHeading } from '../../domain/script/logic';
import { BreakdownSheetsReport } from './BreakdownSheetsReport';
import { BreakdownIcon, DoodIcon } from '../icons/ProductionIcons';
import { PdfExportButton } from '../common/PdfExportButton';
import { setCharacterColorCommand } from '../../domain/commands';
import { SceneListReport } from './SceneListReport';
import { PropsReport } from './PropsReport';
import { SCOUT_STATUS } from '../locations/LocationScoutSection';
import { emptySetup } from '../../utils/projectLibrary';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { SetLocationLink } from '../locations/SetLocationLink';
import { BreakdownElementsPanel } from './BreakdownElementsPanel';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';

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
  const { project, updateProjectMeta, runCommand, setActiveSetupId, activeSetup, allShots, avScriptRows } = useFloorPlan();
  const [exporting, setExporting] = useState(false);

  /** Download just the report on screen (scene list, characters, locations or elements). */
  const exportCurrentReport = async () => {
    if (report !== 'scenes' && report !== 'characters' && report !== 'locations' && report !== 'elements') return;
    setExporting(true);
    try {
      const { downloadSectionPdf } = await import('../../utils/pdf/exportStudio');
      await downloadSectionPdf('scriptreports', {
        project,
        activeSetup,
        scriptLines: lines,
        avScriptRows,
        allShots,
        scriptReportSections: { scenes: false, characters: false, locations: false, elements: false, dood: false, [report]: true },
      });
    } finally {
      setExporting(false);
    }
  };
  const { setActiveRightTab } = useWorkspaceUI();
  const [report, setReport] = useState<'scenes' | 'sheets' | 'characters' | 'locations' | 'elements' | 'props'>('scenes');

  const breakdown = useMemo(
    () => cachedScriptBreakdown(lines, project.characters, project.locations),
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

  const setCharacterColor = (characterId: string, color: string) => {
    runCommand(setCharacterColorCommand, { characterId, color, fallbackCharacters: breakdown.characters }, { domain: 'script' });
  };

  const totalEighths = breakdown.scenes
    .filter((scene) => !scene.omitted)
    .reduce((sum, scene) => sum + (scene.pageLengthEighths ?? 0), 0);

  const card = isLight
    ? 'border-slate-200 bg-white shadow-sm'
    : 'border-slate-800 bg-slate-900/80';
  const muted = 'text-ink-muted';

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
    updateProjectMeta((prev) => ({ setups: [...prev.setups, setup], activeSetupId: setup.id }));
    setActiveRightTab('shots');
  };

  const createMissingSetups = (scenes: ScriptScene[], locationId?: string) => {
    const additions = scenes
      .filter((scene) => !matchingSetup(scene))
      .map((scene) => buildSetup(scene, locationId));
    if (additions.length === 0) return;
    updateProjectMeta((prev) => ({
      setups: [...prev.setups, ...additions],
      activeSetupId: additions[0].id,
    }));
    setActiveRightTab('shots');
  };

  if (breakdown.scenes.length === 0) {
    return (
      <div className={`flex-1 grid place-items-center p-8 bg-surface-sunken`}>
        <div className="max-w-md text-center">
          <Clapperboard className="w-10 h-10 mx-auto mb-3 text-violet-400" />
          <h3 className="font-semibold">No scene breakdown yet</h3>
          <p className={`text-sm mt-1 ${muted}`}>Add screenplay scene headings and character cues. Reports update live while you write.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 overflow-auto p-4 sm:p-6 bg-surface-sunken`}>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <PanelTitle
              icon={<BreakdownIcon />}
              title="Breakdown reports"
              subtitle={`${breakdown.scenes.length} scenes · ${formatPageEighths(totalEighths)} pages · ${characterReports.length} speaking characters · ${breakdown.locations.length} locations`}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
          {(report === 'scenes' || report === 'characters' || report === 'locations' || report === 'elements') && (
            <PdfExportButton onClick={() => { void exportCurrentReport(); }} disabled={exporting} title="Download only this report as a PDF" />
          )}
          <div className={`flex flex-wrap p-1 rounded-xl border border-line bg-surface`}>
            <button onClick={() => setReport('scenes')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex gap-1.5 items-center ${report === 'scenes' ? 'bg-accent text-white' : muted}`} title="Every scene with its length in eighths of a page">
              <ListOrdered className="w-3.5 h-3.5" /> Scenes
            </button>
            <button onClick={() => setReport('sheets')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex gap-1.5 items-center ${report === 'sheets' ? 'bg-accent text-white' : muted}`} title="One breakdown sheet per scene, coloured like its strip">
              <BreakdownIcon className="w-3.5 h-3.5" /> Sheets
            </button>
            <button onClick={() => setReport('characters')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex gap-1.5 items-center ${report === 'characters' ? 'bg-accent text-white' : muted}`}>
              <Users className="w-3.5 h-3.5" /> Characters
            </button>
            <button onClick={() => setReport('locations')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex gap-1.5 items-center ${report === 'locations' ? 'bg-accent text-white' : muted}`}>
              <MapPin className="w-3.5 h-3.5" /> Locations
            </button>
            <button onClick={() => setReport('elements')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex gap-1.5 items-center ${report === 'elements' ? 'bg-accent text-white' : muted}`} title="Props, wardrobe, vehicles and effects tagged in the script">
              <BreakdownIcon className="w-3.5 h-3.5" /> Elements
            </button>
            <button onClick={() => setReport('props')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex gap-1.5 items-center ${report === 'props' ? 'bg-accent text-white' : muted}`} title="Props (or any department) with scenes, shoot days and characters">
              <Package className="w-3.5 h-3.5" /> Props
            </button>
            <button onClick={() => { requestScheduleView('dood'); setActiveRightTab('schedule'); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex gap-1.5 items-center ${muted}`} title="Day out of days — part of the Schedule, since it is worked out from the shooting days">
              <DoodIcon className="w-3.5 h-3.5" /> DOOD <ArrowRight className="w-3 h-3 opacity-60" aria-hidden />
            </button>
          </div>
          </div>
        </div>

        {report === 'sheets' ? (
          <BreakdownSheetsReport lines={lines} scenes={breakdown.scenes} characters={breakdown.characters} isLight={isLight} />
        ) : report === 'scenes' ? (
          <SceneListReport lines={lines} scenes={breakdown.scenes} characters={breakdown.characters} isLight={isLight} />
        ) : report === 'props' ? (
          <PropsReport lines={lines} scenes={breakdown.scenes} characters={breakdown.characters} isLight={isLight} />
        ) : report === 'elements' ? (
          <BreakdownElementsPanel lines={lines} scenes={breakdown.scenes} isLight={isLight} />
        ) : report === 'characters' ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {characterReports.map((entry) => (
              <article key={entry.character?.id} className={`rounded-2xl border p-4 ${card}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-2.5">
                    {entry.character && (
                      <label
                        className="relative w-9 h-9 rounded-xl grid place-items-center cursor-pointer shrink-0 text-white font-bold text-sm"
                        style={{ backgroundColor: characterColor(entry.character.id, breakdown.characters) }}
                        title="Highlighter colour on the script page — click to change"
                      >
                        {entry.character.canonicalName.slice(0, 1)}
                        <input
                          type="color"
                          aria-label={`Highlighter colour for ${entry.character.canonicalName}`}
                          value={characterColor(entry.character.id, breakdown.characters)}
                          onChange={(event) => setCharacterColor(entry.character!.id, event.target.value)}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </label>
                    )}
                    <div>
                      <h3 className="text-sm font-bold">{entry.character?.canonicalName}</h3>
                      <p className={`text-[11px] ${muted}`}>{entry.castPerson?.displayName || 'Cast not assigned'}</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-400">{entry.scenes.length} scenes</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {entry.scenes.map((scene) => (
                    <span key={scene.id} title={scene.omitted ? `${scene.heading} (omitted)` : scene.heading} className={`px-2 py-1 rounded-md border text-[10px] font-mono ${scene.omitted ? 'line-through opacity-50' : ''} border-line-strong bg-surface-sunken`}>
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
                          <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${location.locationId ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                            {location.locationId ? 'Project location' : 'Script only'}
                          </span>
                        </div>
                        <p className={`text-[11px] mt-0.5 ${muted}`}>{location.scenes.length} scenes · {intCount} INT · {extCount} EXT</p>
                        {(() => {
                          // Places scouted for this set, with where they stand.
                          const names = new Set([location.name, ...parsedScenes.map(({ parsed }) => parsed.location ?? '')].map((name) => name.trim().toLowerCase()).filter(Boolean));
                          const candidates = (project.locations ?? []).filter((candidate) =>
                            candidate.scout?.candidateFor && names.has(candidate.scout.candidateFor.trim().toLowerCase()));
                          if (candidates.length === 0) return null;
                          return (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              <span className={`text-[10px] ${muted}`}>Candidates:</span>
                              {candidates.map((candidate) => (
                                <button
                                  key={candidate.id}
                                  type="button"
                                  onClick={() => setActiveRightTab('locations')}
                                  title={`${candidate.scout?.status ?? 'unscouted'}${candidate.scout?.rating ? ` · ${candidate.scout.rating}/5` : ''} — open in Locations`}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${candidate.scout?.status ? SCOUT_STATUS[candidate.scout.status].className : 'bg-surface-muted text-ink-soft'}`}
                                >
                                  {candidate.name}{candidate.scout?.rating ? ` ${'★'.repeat(candidate.scout.rating)}` : ''}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <SetLocationLink setName={location.name} isLight={isLight} />
                      {location.locationId && (
                        <button onClick={() => setActiveRightTab('locations')} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold border-line-strong`}>Open location</button>
                      )}
                      {missingCount > 0 && (
                        <button onClick={() => createMissingSetups(location.scenes, location.locationId)} className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center gap-1.5">
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
                            <span className={`text-xs font-medium truncate ${scene.omitted ? 'line-through opacity-50' : ''}`}>{scene.heading}</span>
                            {scene.omitted && (
                              <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-rose-400">Omitted</span>
                            )}
                          </div>
                          <button onClick={() => createOrOpenSetup(scene, location.locationId)} className={`shrink-0 px-2.5 py-1 rounded-lg border text-[10px] font-semibold flex items-center gap-1 border-line-strong`}>
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
