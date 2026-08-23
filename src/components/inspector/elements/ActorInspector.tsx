/**
 * The actor element inspector.
 *
 * Lifted out of `InspectorPanel`, which held twelve of these in one switch and
 * had reached 4,600 lines because every new field was one more branch in a file
 * nobody could read end to end (AGENTS.md: one file per variant).
 *
 * Follows `LightInspector`: it reads what it needs from context directly rather
 * than taking a long prop list, since a twenty-prop list is only a copy of the
 * context with extra steps.
 */

import React, { useId } from 'react';
import { inspectorSelectClass } from '../shared/InspectorPrimitives';
import { deriveScriptBreakdown } from '../../../domain/script/logic';
import type { ActorElement } from '../../../types';
import { ACTOR_COLOR_PALETTE } from '../../../constants/presets';
import { Compass, MessageCircle, User } from 'lucide-react';
import { RubricSection, WaypointListEditor } from '../shared/InspectorPrimitives';
import { collectCharacterDialogue } from '../../../domain/script/logic';
import { createId } from '../../../domain/ids';
import { useFloorPlan } from '../../../context/FloorPlanContext';

interface ActorInspectorProps {
  actor: ActorElement;
  isLight: boolean;
}

export const ActorInspector: React.FC<ActorInspectorProps> = ({ actor, isLight }) => {
  const fieldId = useId();
  const selectClass = inspectorSelectClass(isLight);
  const { activeSetup, project, updateElement, playback, updateSetupMeta, displaySettings, updateDisplaySettings } = useFloorPlan();
  // Script characters (persisted catalog merged with cues detected in the
  // attached screenplay) for linking actor markers; empty when no script.
  const scriptCharacters = React.useMemo(
    () => deriveScriptBreakdown(
      project.scriptLines || [],
      project.characters || [],
      project.locations || [],
    ).characters,
    [project.scriptLines, project.characters, project.locations],
  );
      const updateActorSpeech = (beat: number, text: string) => {
        const cues = actor.speechCues || [];
        const existing = cues.find((cue) => cue.beat === beat);
        const next = text.length === 0
          ? cues.filter((cue) => cue.beat !== beat)
          : existing
            ? cues.map((cue) => cue.id === existing.id ? { ...cue, text } : cue)
            : [...cues, { id: createId('speech'), beat, text }];
        updateElement(actor.id, { speechCues: next });
      };
      const linkedCharacter = scriptCharacters.find((c) => c.id === actor.characterId);
      const nameMatchedCharacter = !linkedCharacter && (actor.characterName || '').trim()
        ? scriptCharacters.find((c) =>
            c.canonicalName === actor.characterName?.trim().toUpperCase() ||
            c.aliases.some((alias) => alias.toUpperCase() === actor.characterName?.trim().toUpperCase()))
        : undefined;
      const effectiveCharacter = linkedCharacter ?? nameMatchedCharacter;
      const scriptedLines = effectiveCharacter
        ? collectCharacterDialogue(
            project.scriptLines || [],
            effectiveCharacter.canonicalName,
            effectiveCharacter.aliases,
          )
        : [];
      return (
        <div className="space-y-3 pt-1">
          {/* Rubric 1: Character & Stance */}
          <RubricSection
            title="Character & Stance"
            icon={<User className="w-3.5 h-3.5 text-emerald-500" />}
            badge={
              actor.characterName ? (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-bold truncate max-w-[100px]">
                  {actor.characterName}
                </span>
              ) : undefined
            }
            defaultOpen={true}
            isLight={isLight}
          >
            <div>
              <span className="opacity-60 block mb-1">Script Character</span>
              {scriptCharacters.length > 0 ? (
                <select
                  aria-label="Script Character"
                  value={actor.characterId || ''}
                  onChange={(event) => {
                    const picked = scriptCharacters.find((c) => c.id === event.target.value);
                    updateElement(actor.id, {
                      characterId: picked?.id,
                      ...(picked ? { characterName: picked.canonicalName } : {}),
                    });
                  }}
                  className={selectClass}
                >
                  <option value="">Not from script / free text</option>
                  {scriptCharacters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.canonicalName}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[10px] opacity-50 leading-snug">
                  No script attached - name the character freely below.
                </p>
              )}
            </div>

            <div>
              <label htmlFor={`${fieldId}-character-name-id`} className="opacity-60 block mb-1">Character Name / ID</label>
              <input id={`${fieldId}-character-name-id`}
                type="text"
                value={actor.characterName || ''}
                placeholder="e.g. SARAH (Lead Detective)"
                onChange={(e) => updateElement(actor.id, { characterName: e.target.value })}
                className={`w-full border rounded-lg p-2 ${
                  isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              />
            </div>

            {/* Color Marker */}
            <div>
              <span id={`${fieldId}-avatar-color-group`} className="opacity-60 block mb-1">Avatar Color</span>
              <div role="group" aria-labelledby={`${fieldId}-avatar-color-group`} className="flex gap-2">
                {ACTOR_COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => updateElement(actor.id, { color: c })}
                    title={`Avatar color ${c}`}
                    aria-label={`Avatar color ${c}`}
                    aria-pressed={actor.color === c}
                    style={{ backgroundColor: c }}
                    className={`w-6 h-6 rounded-full border ${
                      actor.color === c ? 'border-white ring-2 ring-emerald-400' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Actor Stance */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => updateElement(actor.id, { isStanding: true })}
                className={`py-2 text-xs font-semibold rounded-lg border transition-colors ${
                  actor.isStanding
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                    : isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                Standing
              </button>
              <button
                onClick={() => updateElement(actor.id, { isStanding: false })}
                className={`py-2 text-xs font-semibold rounded-lg border transition-colors ${
                  !actor.isStanding
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                    : isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                Seated / Chair
              </button>
            </div>

            {/* Blocking Action & Dialogue notes */}
            <div>
              <label htmlFor={`${fieldId}-actor-action-dialogue-notes`} className="opacity-60 block mb-1">Actor Action / Dialogue Notes</label>
              <textarea id={`${fieldId}-actor-action-dialogue-notes`}
                value={actor.actionNotes || ''}
                onChange={(e) => updateElement(actor.id, { actionNotes: e.target.value })}
                placeholder="e.g. Enters through front door on Beat 1, confronts Sarah on Beat 2..."
                rows={2}
                className={`w-full border rounded-lg p-2 focus:border-emerald-500 ${
                  isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              />
            </div>
          </RubricSection>

          <RubricSection
            title="Speech by Beat"
            icon={<MessageCircle className="w-3.5 h-3.5 text-emerald-500" />}
            badge={
              <button
                type="button"
                onClick={() => updateDisplaySettings({ showSpeechBubbles: !displaySettings.showSpeechBubbles })}
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                  displaySettings.showSpeechBubbles
                    ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                    : isLight ? 'bg-slate-100 text-slate-500 border-slate-300' : 'bg-slate-900 text-slate-500 border-slate-700'
                }`}
              >
                Bubbles {displaySettings.showSpeechBubbles ? 'on' : 'off'}
              </button>
            }
            defaultOpen={true}
            isLight={isLight}
          >
            <p className="text-[10px] opacity-60 mb-2">
              Dialogue follows the timeline even when the actor does not move. Empty beats stay silent.
              {effectiveCharacter && scriptedLines.length > 0
                ? ` Scripted lines for ${effectiveCharacter.canonicalName} can be picked per beat.`
                : ''}
            </p>
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {Array.from({ length: Math.max(1, playback.totalBeats) }, (_, index) => index + 1).map((beat) => {
                const cue = (actor.speechCues || []).find((item) => item.beat === beat);
                const active = Math.round(playback.currentBeat) === beat;
                return (
                  <div
                    key={beat}
                    className={`rounded-lg border ${
                      active
                        ? 'border-emerald-500/60 bg-emerald-500/10'
                        : isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'
                    }`}
                  >
                    <div className="flex items-center gap-2 p-1.5">
                      <span className={`w-7 text-[10px] font-mono font-bold ${active ? 'text-emerald-500' : 'opacity-50'}`}>B{beat}</span>
                      <input
                        type="text"
                        value={cue?.text || ''}
                        onChange={(event) => updateActorSpeech(beat, event.target.value)}
                        placeholder={beat === 1 ? 'What does the actor say?' : 'Silent beat'}
                        aria-label={`${actor.name} speech at beat ${beat}`}
                        className={`flex-1 min-w-0 border rounded-md px-2 py-1 text-[11px] ${
                          isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-900 text-slate-200 border-slate-700'
                        }`}
                      />
                    </div>
                    {scriptedLines.length > 0 && (
                      <select
                        value=""
                        onChange={(event) => {
                          const pickedLine = scriptedLines.find((line) => line.lineId === event.target.value);
                          if (pickedLine) updateActorSpeech(beat, pickedLine.text);
                        }}
                        aria-label={`Pick a scripted line for ${actor.name} at beat ${beat}`}
                        className={`w-full px-2 py-1 mb-1.5 mx-1 text-[10px] rounded-md border cursor-pointer ${
                          isLight ? 'bg-white text-slate-600 border-slate-300' : 'bg-slate-900 text-slate-400 border-slate-700'
                        }`}
                        style={{ width: 'calc(100% - 0.5rem)' }}
                      >
                        <option value="">Pick line from script...</option>
                        {scriptedLines.map((line, lineIndex) => (
                          <option key={line.lineId} value={line.lineId}>
                            {(line.sceneNumber ? `Sc${line.sceneNumber} ` : '') +
                              `#${lineIndex + 1} ` +
                              (line.text.length > 58 ? `${line.text.slice(0, 55)}...` : line.text)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </RubricSection>

          {/* Rubric 2: Waypoints & Movement */}
          {(() => {
            const nextBeat = Math.max(2, ...(actor.path || []).map((wp) => wp.beat + 1));
            const handleAddActorWp = () => {
              const existingPath = actor.path || [];
              const lastPoint = existingPath.length > 0
                ? existingPath[existingPath.length - 1]
                : { x: actor.x, y: actor.y, rotation: actor.rotation || 0 };
              const angleRad = ((lastPoint.rotation || 0) * Math.PI) / 180;
              const offsetDist = 50;
              const newWp = {
                id: createId('wp'),
                x: Math.round(lastPoint.x + Math.cos(angleRad) * offsetDist),
                y: Math.round(lastPoint.y + Math.sin(angleRad) * offsetDist),
                rotation: lastPoint.rotation || 0,
                beat: nextBeat,
                dialogueCue: '',
              };
              updateElement(actor.id, { path: [...existingPath, newWp] });
              if (nextBeat > (activeSetup.totalBeats || 1)) {
                updateSetupMeta({ totalBeats: nextBeat });
              }
            };

            return (
              <RubricSection
                title="Waypoints & Trajectory"
                icon={<Compass className="w-3.5 h-3.5 text-sky-500" />}
                defaultOpen={true}
                isLight={isLight}
                headerRight={
                  <button
                    type="button"
                    title={`Add actor waypoint (Beat ${nextBeat})`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handleAddActorWp();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white transition-all cursor-pointer select-none"
                  >
                    + Waypoint
                  </button>
                }
              >
                {/* Add Waypoint Button */}
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    handleAddActorWp();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className={`w-full py-2 border rounded-lg text-xs font-semibold cursor-pointer select-none active:scale-[0.98] transition-transform ${
                    isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100' : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700'
                  }`}
                >
                  + Add Actor Waypoint (Beat {nextBeat})
                </button>

            {/* Editable waypoint list */}
            <WaypointListEditor
              elementId={actor.id}
              path={actor.path || []}
              baseRotation={actor.rotation}
              accentClass="text-emerald-500"
              isLight={isLight}
            />
          </RubricSection>
        );
      })()}
    </div>
  );
};
