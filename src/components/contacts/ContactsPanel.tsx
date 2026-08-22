import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  Mail,
  Phone,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import type { Person, PersonKind } from '../../domain/people';
import {
  KEY_CREW_ROLES,
  PERSON_KINDS,
  PERSON_KIND_LABELS,
  PRODUCTION_DEPARTMENTS,
  assignCast,
  assignKeyCrew,
  keyCrewMember,
  projectHeadFieldsFor,
  callSheetPhone,
  castPersonForCharacter,
  filterPeople,
  groupPeopleByDepartment,
  parsePeopleCsv,
  peopleToCsv,
  personInitials,
  removePerson,
  unassignCast,
  upsertPerson,
  usesProductionPhone,
} from '../../domain/people';
import { deriveScriptBreakdown } from '../../domain/script/logic';
import { createId } from '../../domain/ids';

const KIND_TINT: Record<PersonKind, string> = {
  crew: 'bg-sky-500/15 text-sky-500',
  cast: 'bg-emerald-500/15 text-emerald-500',
  talent: 'bg-emerald-500/15 text-emerald-500',
  contact: 'bg-slate-500/15 text-slate-500',
  client: 'bg-violet-500/15 text-violet-500',
  artist: 'bg-pink-500/15 text-pink-500',
  other: 'bg-slate-500/15 text-slate-500',
};

const EMPTY_DRAFT = (): Person => ({ id: createId('person'), displayName: '', kind: 'crew' });

interface PersonFormProps {
  draft: Person;
  onChange: (next: Person) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  isLight: boolean;
}

const PersonForm: React.FC<PersonFormProps> = ({ draft, onChange, onSave, onCancel, onDelete, isLight }) => {
  const inputCls = `min-h-[34px] w-full rounded-md border px-2 py-1 text-xs outline-none ${
    isLight ? 'border-slate-300 bg-white text-slate-800 focus:border-sky-400' : 'border-slate-700 bg-slate-950 text-slate-200 focus:border-sky-500'
  }`;
  const labelCls = `text-[9px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`;
  const field = (key: keyof Person, label: string, placeholder?: string, type = 'text') => (
    <label className="block space-y-1">
      <span className={labelCls}>{label}</span>
      <input
        type={type}
        value={(draft[key] as string | undefined) ?? ''}
        onChange={(e) => onChange({ ...draft, [key]: e.target.value || undefined })}
        placeholder={placeholder}
        className={inputCls}
      />
    </label>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className={`rounded-xl border p-3 space-y-2 ${isLight ? 'border-sky-200 bg-sky-50/60' : 'border-sky-900/60 bg-sky-950/20'}`}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1 col-span-2 sm:col-span-1">
          <span className={labelCls}>Name *</span>
          <input
            autoFocus
            value={draft.displayName}
            onChange={(e) => onChange({ ...draft, displayName: e.target.value })}
            placeholder="Full name"
            className={inputCls}
            required
          />
        </label>
        <label className="block space-y-1">
          <span className={labelCls}>Type</span>
          <select value={draft.kind ?? 'other'} onChange={(e) => onChange({ ...draft, kind: e.target.value as PersonKind })} className={inputCls}>
            {PERSON_KINDS.map((kind) => (
              <option key={kind} value={kind}>{PERSON_KIND_LABELS[kind]}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className={labelCls}>Department</span>
          <input
            list="contacts-departments"
            value={draft.department ?? ''}
            onChange={(e) => onChange({ ...draft, department: e.target.value || undefined })}
            placeholder="Camera, Sound…"
            className={inputCls}
          />
          <datalist id="contacts-departments">
            {PRODUCTION_DEPARTMENTS.map((department) => <option key={department} value={department} />)}
          </datalist>
        </label>
        {field('role', 'Role / position', 'Gaffer, 1st AD, Lead…')}
        {field('phone', 'Phone', '+1 555 0100', 'tel')}
        {/* A number issued for this job only — a rented handset, a department
            line. When present it is what the call sheet prints, because that is
            the number the unit should ring today. */}
        {field('productionPhone', 'Production phone', 'Unit handset / SIM', 'tel')}
        {field('email', 'Email', 'name@example.com', 'email')}
        {field('company', 'Company / agency')}
        {field('rate', 'Rate', '€450/day')}
        <div className="col-span-2">{field('address', 'Address', 'Street, postcode, city')}</div>
        <div className="col-span-2">{field('emergencyContact', 'Emergency contact', 'Name · phone')}</div>
        {/* Lodging for away shoots — every part optional on its own, because a
            production often knows the hotel before the dates or the reverse. */}
        {field('hotelName', 'Hotel', 'Hotel Astoria')}
        <div className="grid grid-cols-2 gap-2">
          {field('hotelCheckIn', 'Check-in', '', 'date')}
          {field('hotelCheckOut', 'Check-out', '', 'date')}
        </div>
        <div className="col-span-2">{field('hotelAddress', 'Hotel address', 'Street, postcode, city')}</div>
      </div>
      <label className="block space-y-1">
        <span className={labelCls}>Notes</span>
        <textarea
          value={draft.notes ?? ''}
          onChange={(e) => onChange({ ...draft, notes: e.target.value || undefined })}
          rows={2}
          className={`${inputCls} resize-y`}
          placeholder="Dietary needs, pickup, allergies, union…"
        />
      </label>
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={!draft.displayName.trim()} className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold disabled:opacity-40">
          Save
        </button>
        <button type="button" onClick={onCancel} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'}`}>
          Cancel
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="ml-auto px-2.5 py-1.5 rounded-lg border border-rose-500/40 text-rose-500 text-xs font-bold flex items-center gap-1 hover:bg-rose-500/10">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        )}
      </div>
    </form>
  );
};

/**
 * Production contacts / crew list (plan §4.5). People are project-level shared
 * state; cast ↔ character links live in `castAssignments`. Everything here
 * works without a screenplay — the cast section simply stays empty.
 */
export const ContactsPanel: React.FC = () => {
  const { project, updateProjectMeta, scriptLines, theme, openExportModal } = useFloorPlan();
  const isLight = theme === 'light';
  const people = useMemo(() => project.people ?? [], [project.people]);
  const castAssignments = useMemo(() => project.castAssignments ?? [], [project.castAssignments]);

  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<PersonKind | 'all'>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [editing, setEditing] = useState<Person | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const departments = useMemo(
    () => [...new Set(people.map((person) => (person.department ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [people],
  );
  const visible = useMemo(
    () => filterPeople(people, { query, kind: kindFilter, department: departmentFilter }),
    [people, query, kindFilter, departmentFilter],
  );
  const groups = useMemo(() => groupPeopleByDepartment(visible), [visible]);

  // Characters: persisted catalog merged with cues discovered in the script.
  const breakdown = useMemo(
    () => deriveScriptBreakdown(scriptLines, project.characters ?? [], project.locations ?? []),
    [scriptLines, project.characters, project.locations],
  );
  // Any person can play a character (assignCast accepts every id); order the
  // dropdown cast-first, then talent, then everyone else, alphabetical within
  // each group.
  const performers = useMemo(
    () =>
      [...people].sort((a, b) => {
        const rankOf = (person: Person) => (person.kind === 'cast' ? 0 : person.kind === 'talent' ? 1 : 2);
        return rankOf(a) - rankOf(b) || a.displayName.localeCompare(b.displayName);
      }),
    [people],
  );

  const savePerson = () => {
    if (!editing) return;
    updateProjectMeta({ people: upsertPerson(people, editing) });
    setEditing(null);
    setIsNew(false);
  };

  const deletePerson = (personId: string) => {
    if (!window.confirm('Remove this contact? Cast assignments and location contact links to them are cleared too.')) return;
    const next = removePerson(
      {
        people,
        castAssignments,
        locations: project.locations ?? [],
        tasks: project.tasks ?? [],
        productionDays: project.productionDays ?? [],
      },
      personId,
    );
    updateProjectMeta({
      people: next.people,
      castAssignments: next.castAssignments,
      locations: next.locations as typeof project.locations,
      tasks: next.tasks as typeof project.tasks,
      productionDays: next.productionDays as typeof project.productionDays,
    });
    if (editing?.id === personId) {
      setEditing(null);
      setIsNew(false);
    }
  };

  const setCast = (characterId: string, personId: string) => {
    // Persist the merged catalog so discovered character ids stay stable.
    updateProjectMeta({
      characters: breakdown.characters,
      castAssignments: personId ? assignCast(castAssignments, characterId, personId) : unassignCast(castAssignments, characterId),
    });
  };

  /**
   * Assign (or vacate) a key production role. Director / DP additionally mirror
   * into the legacy project fields the exports render, so the crew page and the
   * scene inspector can never drift apart.
   */
  const assignRole = (roleKey: string, personId: string) => {
    const nextPeople = assignKeyCrew(people, roleKey, personId);
    const heads = projectHeadFieldsFor(nextPeople);
    const role = KEY_CREW_ROLES.find((entry) => entry.key === roleKey);
    const patch: Parameters<typeof updateProjectMeta>[0] = { people: nextPeople };
    if (role?.projectField) {
      // Vacating a role blanks the mirrored field rather than leaving a stale
      // name behind; filling it writes the assigned person's name.
      patch[role.projectField] = heads[role.projectField] ?? '';
    }
    updateProjectMeta(patch);
  };

  /** Heads named only as free text in the project details, with nobody linked. */
  const { director: legacyDirector, cinematographer: legacyCinematographer } = project;
  const legacyOnlyHeads = useMemo(() => {
    // Read through a narrow map of just the two mirrored fields, so this memo
    // depends on those and not on the whole project object.
    const legacy: Record<string, string | undefined> = {
      director: legacyDirector,
      cinematographer: legacyCinematographer,
    };
    return KEY_CREW_ROLES.filter((role) => role.projectField)
      .filter((role) => !keyCrewMember(people, role.key))
      .map((role) => {
        const name = (legacy[role.projectField as string] ?? '').trim();
        return name ? `${role.label}: ${name}` : '';
      })
      .filter(Boolean);
  }, [people, legacyDirector, legacyCinematographer]);

  const exportCsv = () => {
    const blob = new Blob([peopleToCsv(people)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(project.title || 'production').replace(/[^a-z0-9]+/gi, '-')}-contacts.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const imported = parsePeopleCsv(String(reader.result ?? ''));
      if (imported.length === 0) {
        setImportMessage('No contacts found — the first row must be a header (Name, Department, Role, Phone, Email…).');
        return;
      }
      updateProjectMeta({ people: [...people, ...imported] });
      setImportMessage(`Imported ${imported.length} contact${imported.length === 1 ? '' : 's'}.`);
    };
    reader.readAsText(file);
  };

  const mutedCls = isLight ? 'text-slate-500' : 'text-slate-400';
  const inputCls = `min-h-[34px] rounded-md border px-2 py-1 text-xs outline-none ${
    isLight ? 'border-slate-200 bg-white text-slate-800 focus:border-sky-400' : 'border-slate-700 bg-slate-950/60 text-slate-200 focus:border-sky-500'
  }`;
  const btnCls = `min-h-[34px] flex items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${
    isLight ? 'bg-slate-200/80 text-slate-700 hover:bg-slate-300/80' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
  }`;

  return (
    <div className={`h-full overflow-y-auto custom-scrollbar p-3 space-y-3 ${isLight ? 'bg-white' : 'bg-slate-900'}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) importCsv(file);
        }}
      />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-[0.18em] ${mutedCls}`}>Production contacts</p>
          <h2 className="text-lg font-semibold mt-0.5 flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-500" /> Crew, cast &amp; contacts
          </h2>
          <p className={`text-[11px] ${mutedCls}`}>
            {people.length} people · {castAssignments.length} cast assignment{castAssignments.length === 1 ? '' : 's'} · used by call sheets, DOOD and crew lists
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => {
              setEditing(EMPTY_DRAFT());
              setIsNew(true);
            }}
            className="min-h-[34px] flex items-center gap-1.5 rounded-md px-3 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" /> Add person
          </button>
          <button onClick={() => fileInputRef.current?.click()} className={btnCls} title="Import a CSV (Name, Type, Department, Role, Phone, Email…)">
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </button>
          <button onClick={exportCsv} disabled={people.length === 0} className={`${btnCls} disabled:opacity-40`}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={() => openExportModal('crew')} disabled={people.length === 0} className={`${btnCls} disabled:opacity-40`} title="Printable contact list grouped by department">
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      {importMessage && (
        <p className={`text-[11px] flex items-center gap-2 ${mutedCls}`}>
          {importMessage}
          <button onClick={() => setImportMessage(null)} className="p-0.5"><X className="w-3 h-3" /></button>
        </p>
      )}

      {editing && isNew && (
        <PersonForm draft={editing} onChange={setEditing} onSave={savePerson} onCancel={() => { setEditing(null); setIsNew(false); }} isLight={isLight} />
      )}

      {/* Key crew: the named heads paperwork refers to by role. Assignments are
          stored as the person's role title (single source of truth), and the
          two legacy project fields the exports read are mirrored on change. */}
      <section className={`rounded-xl border p-3 space-y-2 ${isLight ? 'border-slate-200 bg-slate-50/70' : 'border-slate-800 bg-slate-950/40'}`}>
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className={`text-[10px] font-black uppercase tracking-wider ${mutedCls}`}>Key crew</h3>
          <p className={`text-[10px] ${mutedCls}`}>
            Director and DP here are the same fields as the scene inspector and every export.
          </p>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {KEY_CREW_ROLES.map((role) => {
            const holder = keyCrewMember(people, role.key);
            return (
              <label key={role.key} className="flex items-center gap-2">
                <span className={`w-[42%] shrink-0 text-[10px] font-semibold ${mutedCls}`}>{role.label}</span>
                <select
                  value={holder?.id ?? ''}
                  onChange={(e) => assignRole(role.key, e.target.value)}
                  className={`${inputCls} flex-1 min-w-0`}
                >
                  <option value="">— unassigned —</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName || 'Unnamed'}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
        {people.length === 0 && (
          <p className={`text-[10px] ${mutedCls}`}>Add people first — then assign them to the roles above.</p>
        )}
        {(legacyOnlyHeads.length > 0) && (
          <p className={`text-[10px] ${mutedCls}`}>
            {legacyOnlyHeads.join(' · ')} — typed directly into the project details and not yet linked to
            anyone on this list. Add them as a person to link phone, email and call times.
          </p>
        )}
      </section>

      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, role, company…" className={`${inputCls} w-full !pl-7`} />
        </div>
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as PersonKind | 'all')} className={inputCls}>
          <option value="all">All types</option>
          {PERSON_KINDS.map((kind) => <option key={kind} value={kind}>{PERSON_KIND_LABELS[kind]}</option>)}
        </select>
        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className={inputCls}>
          <option value="all">All departments</option>
          {departments.map((department) => <option key={department} value={department}>{department}</option>)}
        </select>
      </div>

      {people.length === 0 ? (
        <div className={`rounded-xl border border-dashed p-8 text-center ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>
          <UserRound className="w-8 h-8 mx-auto mb-2 text-sky-500" />
          <p className="text-sm font-semibold">No contacts yet</p>
          <p className={`text-xs mt-1 ${mutedCls}`}>Add crew, cast and vendors here. They flow into call sheets, the crew list and the day-out-of-days automatically.</p>
        </div>
      ) : groups.length === 0 ? (
        <p className={`text-xs ${mutedCls}`}>No contacts match the current filter.</p>
      ) : (
        groups.map((group) => (
          <section key={group.department} className="space-y-1.5">
            <h3 className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-2 ${mutedCls}`}>
              {group.department}
              <span className={`font-mono text-[9px] px-1.5 rounded-full ${isLight ? 'bg-slate-200 text-slate-600' : 'bg-slate-800 text-slate-400'}`}>{group.people.length}</span>
            </h3>
            {group.people.map((person) =>
              editing && !isNew && editing.id === person.id ? (
                <PersonForm
                  key={person.id}
                  draft={editing}
                  onChange={setEditing}
                  onSave={savePerson}
                  onCancel={() => setEditing(null)}
                  onDelete={() => deletePerson(person.id)}
                  isLight={isLight}
                />
              ) : (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => {
                    setEditing({ ...person });
                    setIsNew(false);
                  }}
                  className={`w-full text-left rounded-xl border px-3 py-2 flex items-center gap-3 transition-colors ${
                    isLight ? 'border-slate-200 bg-white hover:border-sky-300' : 'border-slate-800 bg-slate-950/40 hover:border-sky-700'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-full grid place-items-center text-[11px] font-black flex-shrink-0 ${KIND_TINT[person.kind ?? 'other']}`}>
                    {personInitials(person)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{person.displayName}</span>
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${KIND_TINT[person.kind ?? 'other']}`}>
                        {PERSON_KIND_LABELS[person.kind ?? 'other']}
                      </span>
                    </span>
                    <span className={`block text-[11px] truncate ${mutedCls}`}>
                      {[person.role, person.company].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 flex-shrink-0">
                    {/* The call button dials whatever the call sheet prints, so
                        the list and the paperwork can never disagree. */}
                    {callSheetPhone(person) && (
                      <a
                        href={`tel:${callSheetPhone(person)!.replace(/\s+/g, '')}`}
                        onClick={(e) => e.stopPropagation()}
                        title={
                          usesProductionPhone(person)
                            ? `${callSheetPhone(person)} — production number, used on call sheets`
                            : callSheetPhone(person)
                        }
                        className={`p-1.5 rounded-md ${isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}
                      >
                        <Phone
                          className={`w-3.5 h-3.5 ${usesProductionPhone(person) ? 'text-amber-500' : 'text-emerald-500'}`}
                        />
                      </a>
                    )}
                    {person.email && (
                      <a href={`mailto:${person.email}`} onClick={(e) => e.stopPropagation()} title={person.email} className={`p-1.5 rounded-md ${isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}>
                        <Mail className="w-3.5 h-3.5 text-sky-500" />
                      </a>
                    )}
                  </span>
                </button>
              ),
            )}
          </section>
        ))
      )}

      {breakdown.characters.length > 0 && (
        <section className={`rounded-xl border p-3 space-y-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/40'}`}>
          <h3 className="text-xs font-bold flex items-center gap-2">
            <UserRound className="w-3.5 h-3.5 text-emerald-500" /> Cast assignments
            <span className={`text-[10px] font-normal ${mutedCls}`}>character → performer (drives DOOD &amp; call-sheet cast)</span>
          </h3>
          {performers.length === 0 && (
            <p className={`text-[11px] ${mutedCls}`}>Any person in the directory can be assigned to a character; cast and talent are listed first. Add people to get started.</p>
          )}
          <div className="grid gap-1.5 sm:grid-cols-2">
            {breakdown.characters.map((character) => {
              const assigned = castPersonForCharacter(castAssignments, people, character.id);
              return (
                <label key={character.id} className="flex items-center gap-2 text-xs">
                  <span className="font-bold uppercase tracking-wide truncate min-w-0 flex-1">{character.canonicalName}</span>
                  <select value={assigned?.id ?? ''} onChange={(e) => setCast(character.id, e.target.value)} className={`${inputCls} w-40`}>
                    <option value="">— unassigned —</option>
                    {performers.map((person) => {
                      const hint = person.role ?? person.department;
                      return (
                        <option key={person.id} value={person.id}>
                          {hint ? `${person.displayName} - ${hint}` : person.displayName}
                        </option>
                      );
                    })}
                  </select>
                </label>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
