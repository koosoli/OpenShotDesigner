import React from 'react';
import { Camera, Plus, Trash2, X } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  CONTINUITY_DEPARTMENTS,
  CONTINUITY_DEPARTMENT_LABELS,
  continuityConflicts,
  scriptDayOf,
  subjectNameOf,
} from '../../domain/continuity';
import type { ContinuityDepartment, ContinuityNote } from '../../domain/continuity';
import { createId } from '../../domain/ids';
import { parseOption } from '../../domain/optionValue';
import { loadStoryboardImageFile } from '../../utils/image';
import { ProjectImage } from '../common/ProjectImage';
import { PlanningWarnings } from '../common/PlanningWarnings';

/**
 * The continuity binder: wardrobe, hair, make-up and props (plan §36).
 *
 * Its own component rather than another section of `ContinuityPanel`, which is
 * already past the size where a file stops being readable. The take log and
 * the binder are two jobs that happen to be done by the same person — the log
 * records what was shot, the binder what it looked like — and they share
 * nothing but the panel they live behind.
 *
 * Everything derived comes from `domain/continuity/binder.ts` (rule 4). This
 * file is the form and the list.
 */

export interface ContinuityBinderProps {
  isLight: boolean;
}

const DEPARTMENT_TINT: Record<ContinuityDepartment, string> = {
  wardrobe: 'text-violet-500',
  hair: 'text-amber-500',
  makeup: 'text-rose-500',
  props: 'text-sky-500',
};

export const ContinuityBinder: React.FC<ContinuityBinderProps> = ({ isLight }) => {
  const { project, updateProjectMeta } = useFloorPlan();
  const fieldId = React.useId();

  const notes = React.useMemo(() => project.continuityNotes ?? [], [project.continuityNotes]);
  const characters = React.useMemo(() => project.characters ?? [], [project.characters]);
  const scriptScenes = React.useMemo(() => project.scriptScenes ?? [], [project.scriptScenes]);

  const [department, setDepartment] = React.useState<ContinuityDepartment | 'all'>('all');
  const [uploading, setUploading] = React.useState(false);

  const sources = React.useMemo(
    () => ({ notes, characters, scriptScenes }),
    [notes, characters, scriptScenes],
  );

  const conflicts = React.useMemo(
    () =>
      continuityConflicts(sources).map((conflict) => ({
        severity: 'warning' as const,
        message: conflict.message,
      })),
    [sources],
  );

  const visible = React.useMemo(
    () => (department === 'all' ? notes : notes.filter((note) => note.department === department)),
    [notes, department],
  );

  /**
   * Functional update throughout. Two edits in one tick — typing while an
   * upload settles — must not have the second read a stale project and discard
   * the first; that exact bug has shipped in this codebase before.
   */
  const mutate = (fn: (previous: ContinuityNote[]) => ContinuityNote[]) =>
    updateProjectMeta((previous) => ({ continuityNotes: fn(previous.continuityNotes ?? []) }));

  const updateNote = (id: string, patch: Partial<ContinuityNote>) =>
    mutate((previous) =>
      previous.map((note) => (note.id === id ? { ...note, ...patch } : note)),
    );

  const deleteNote = (id: string) => mutate((previous) => previous.filter((note) => note.id !== id));

  /**
   * A new note inherits the department currently filtered to, and nothing
   * else. Carrying a description forward would be the same mistake the take
   * log avoids: a wrong look that nobody reads twice is worse than a blank.
   */
  const addNote = () =>
    mutate((previous) => [
      ...previous,
      {
        id: createId('cnote'),
        department: department === 'all' ? 'wardrobe' : department,
        description: '',
      },
    ]);

  const attachPhotos = async (noteId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      // Stored in the asset store and referenced by id, never inlined
      // (rules 17 and 26): a feature's binder runs to hundreds of photographs,
      // and embedding them would put megabytes into every autosave.
      const assetIds = await Promise.all(
        [...files].map((file) => loadStoryboardImageFile(file)),
      );
      mutate((previous) =>
        previous.map((note) =>
          note.id === noteId
            ? { ...note, photoAssetIds: [...(note.photoAssetIds ?? []), ...assetIds] }
            : note,
        ),
      );
    } finally {
      setUploading(false);
    }
  };

  const detachPhoto = (noteId: string, assetId: string) =>
    mutate((previous) =>
      previous.map((note) => {
        if (note.id !== noteId) return note;
        const photoAssetIds = (note.photoAssetIds ?? []).filter((id) => id !== assetId);
        // The asset itself is left in the store. Deleting it here would remove
        // a picture another note may reference, and the asset store's own
        // ownership model is not wired up yet (see the audit's open item 9).
        const { photoAssetIds: _dropped, ...rest } = note;
        return photoAssetIds.length > 0 ? { ...rest, photoAssetIds } : rest;
      }),
    );

  const surfaceClass = isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700';
  const mutedText = isLight ? 'text-slate-500' : 'text-slate-400';
  const inputClass = `min-h-[32px] px-2 py-1 rounded-lg border text-xs w-full transition-colors ${
    isLight
      ? 'bg-slate-50 border-slate-300 text-slate-800'
      : 'bg-slate-950 border-slate-700 text-slate-200'
  }`;
  const iconBtnClass = `flex items-center justify-center min-w-[32px] min-h-[32px] rounded-lg transition-colors flex-shrink-0 ${
    isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-300'
  }`;

  return (
    <div className="flex flex-col gap-2">
      <PlanningWarnings
        title="Continuity conflicts"
        clearMessage={
          'Compared every character’s wardrobe, hair, make-up and props against the other notes ' +
          'on the same script day. Nothing differs — which is that one question answered, not a ' +
          'verdict on the continuity.'
        }
        issues={conflicts}
        isLight={isLight}
      />

      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Named apart from a row's own Department select: a screen reader
            hearing two "Department" controls cannot tell the filter from the
            field it filters. */}
        <label className={`text-[10px] font-semibold ${mutedText}`} htmlFor={`${fieldId}-dept`}>
          Filter by department
        </label>
        <select
          id={`${fieldId}-dept`}
          value={department}
          onChange={(event) =>
            setDepartment(
              event.target.value === 'all'
                ? 'all'
                : parseOption(CONTINUITY_DEPARTMENTS, event.target.value, 'wardrobe'),
            )
          }
          className={`${inputClass} !w-auto`}
        >
          <option value="all">All departments</option>
          {CONTINUITY_DEPARTMENTS.map((value) => (
            <option key={value} value={value}>
              {CONTINUITY_DEPARTMENT_LABELS[value]}
            </option>
          ))}
        </select>
        <button
          onClick={addNote}
          className={`flex items-center gap-1.5 px-3 min-h-[32px] rounded-lg text-xs font-semibold ml-auto ${
            isLight ? 'bg-sky-600 text-white' : 'bg-sky-600 text-white'
          }`}
        >
          <Plus className="w-3.5 h-3.5" /> Note
        </button>
      </div>

      {visible.length === 0 ? (
        <p className={`text-[11px] p-3 rounded-lg border border-dashed ${mutedText}`}>
          No continuity notes yet. A note records how one character looked in one scene —
          the coat, the parting, the level in the glass — and is keyed on SCRIPT DAY so a
          scene shot three weeks later can be checked against it.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visible.map((note) => {
            const day = scriptDayOf(note, scriptScenes);
            return (
              <li key={note.id} className={`flex flex-col gap-1.5 p-2 rounded-lg border ${surfaceClass}`}>
                <div className="flex items-center gap-1.5">
                  <select
                    value={note.department}
                    aria-label="Department"
                    onChange={(event) =>
                      updateNote(note.id, {
                        department: parseOption(
                          CONTINUITY_DEPARTMENTS,
                          event.target.value,
                          note.department,
                        ),
                      })
                    }
                    className={`${inputClass} !w-28 font-semibold ${DEPARTMENT_TINT[note.department]}`}
                  >
                    {CONTINUITY_DEPARTMENTS.map((value) => (
                      <option key={value} value={value}>
                        {CONTINUITY_DEPARTMENT_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  {/* Linked to a script character where there is a script, and
                      free text where there is not (rule 1). The two never
                      disagree: setting one clears the other. */}
                  {characters.length > 0 ? (
                    <select
                      value={note.characterId ?? ''}
                      aria-label="Character"
                      onChange={(event) =>
                        updateNote(note.id, {
                          characterId: event.target.value || undefined,
                          characterName: undefined,
                        })
                      }
                      className={`${inputClass} !w-32`}
                    >
                      <option value="">Not linked</option>
                      {characters.map((character) => (
                        <option key={character.id} value={character.id}>
                          {character.canonicalName}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {!note.characterId && (
                    <input
                      value={note.characterName ?? ''}
                      aria-label="Who this is about"
                      onChange={(event) =>
                        updateNote(note.id, { characterName: event.target.value || undefined })
                      }
                      placeholder="Who"
                      className={`${inputClass} !w-24`}
                    />
                  )}
                  <input
                    value={note.sceneNumber ?? ''}
                    aria-label="Scene"
                    onChange={(event) =>
                      updateNote(note.id, { sceneNumber: event.target.value || undefined })
                    }
                    placeholder="Sc"
                    className={`${inputClass} !w-14 font-mono`}
                  />
                  <input
                    value={note.scriptDay ?? ''}
                    aria-label="Script day"
                    title={
                      day && !note.scriptDay
                        ? `Inherited from the scene: ${day}`
                        : 'The story day — D1, N3. What makes out-of-order shooting checkable.'
                    }
                    onChange={(event) =>
                      updateNote(note.id, { scriptDay: event.target.value || undefined })
                    }
                    placeholder={day ?? 'Day'}
                    className={`${inputClass} !w-16 font-mono`}
                  />
                  <button
                    onClick={() => deleteNote(note.id)}
                    title="Delete this note"
                    aria-label="Delete this note"
                    className={iconBtnClass}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <input
                  value={note.description}
                  aria-label={`What ${subjectNameOf(note, characters)} looked like`}
                  onChange={(event) => updateNote(note.id, { description: event.target.value })}
                  placeholder="Navy overcoat, top button undone, scarf in left pocket"
                  className={inputClass}
                />
                <input
                  value={note.changeNote ?? ''}
                  aria-label="What changes during the scene"
                  onChange={(event) =>
                    updateNote(note.id, { changeNote: event.target.value || undefined })
                  }
                  placeholder="Changes during the scene — coat comes off at the door"
                  className={inputClass}
                />

                <div className="flex items-center gap-1.5 flex-wrap">
                  {(note.photoAssetIds ?? []).map((assetId) => (
                    <span key={assetId} className="relative">
                      <ProjectImage
                        imageRef={assetId}
                        alt={`Continuity photo for ${subjectNameOf(note, characters)}`}
                        className="w-14 h-14 object-cover rounded-md border border-slate-500/40"
                      />
                      <button
                        onClick={() => detachPhoto(note.id, assetId)}
                        title="Remove this photo from the note"
                        aria-label="Remove this photo from the note"
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                  <label
                    className={`${iconBtnClass} cursor-pointer border border-dashed ${
                      isLight ? 'border-slate-300' : 'border-slate-700'
                    }`}
                    title="Attach continuity photos"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={uploading}
                      onChange={(event) => {
                        void attachPhotos(note.id, event.target.files);
                        // Cleared so re-picking the same file fires onChange again.
                        event.target.value = '';
                      }}
                      className="hidden"
                    />
                    <span className="sr-only">Attach continuity photos</span>
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
