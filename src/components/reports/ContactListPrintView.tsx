import React from 'react';
import type { CastAssignment, Person } from '../../domain/people';
import { PERSON_KIND_LABELS, callSheetPhone, groupPeopleByDepartment, usesProductionPhone } from '../../domain/people';
import type { Character } from '../../domain/script';

interface ContactListPrintViewProps {
  people: Person[];
  characters?: Character[];
  castAssignments?: CastAssignment[];
  /** Hide rates on copies handed to the whole crew. */
  showRates?: boolean;
  /** Production logo (data URL) shown top-right above the tables. */
  logo?: string;
}

/**
 * Printable production contact list: departments in crew order, then the
 * cast list with character ↔ performer links. Derived on demand from
 * canonical project data (plan rule 37) — nothing is stored.
 */
export const ContactListPrintView: React.FC<ContactListPrintViewProps> = ({ people, characters = [], castAssignments = [], showRates = false, logo }) => {
  const groups = groupPeopleByDepartment(people);
  const castRows = characters
    .map((character) => {
      const assignment = castAssignments.find((candidate) => candidate.characterId === character.id);
      const person = assignment ? people.find((candidate) => candidate.id === assignment.personId) : undefined;
      return { character, person };
    })
    .sort((a, b) => a.character.canonicalName.localeCompare(b.character.canonicalName));

  /** Only people with something booked appear on the accommodation table. */
  const lodgingRows = people.filter(
    (person) => person.hotelName || person.hotelAddress || person.hotelCheckIn || person.hotelCheckOut,
  );

  const cell = 'border border-slate-300 px-2 py-1 align-top text-[10.5px]';
  const head = `${cell} bg-slate-100 font-bold uppercase tracking-wider text-[9px] text-slate-700`;

  return (
    <div className="space-y-6">
      {logo && (
        <div className="flex justify-end">
          <img src={logo} alt="Production logo" className="max-w-[42mm] max-h-[16mm] object-contain" />
        </div>
      )}
      <section className="print-section">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={head}>Name</th>
              <th className={head}>Role</th>
              <th className={head}>Type</th>
              <th className={head}>Phone</th>
              <th className={head}>Email</th>
              <th className={head}>Company</th>
              {showRates && <th className={head}>Rate</th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <React.Fragment key={group.department}>
                <tr>
                  <td colSpan={showRates ? 7 : 6} className="bg-slate-900 text-white px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em]">
                    {group.department}
                  </td>
                </tr>
                {group.people.map((person) => (
                  <tr key={person.id} className="break-inside-avoid">
                    <td className={`${cell} font-semibold`}>
                      {person.displayName}
                      {person.address && <div className="text-[9px] font-normal text-slate-500">{person.address}</div>}
                      {person.emergencyContact && <div className="text-[9px] font-normal text-slate-500">ICE: {person.emergencyContact}</div>}
                    </td>
                    <td className={cell}>{person.role ?? ''}</td>
                    <td className={cell}>{PERSON_KIND_LABELS[person.kind ?? 'other']}</td>
                    {/* The production's number is what the unit rings, so it
                        leads. The personal number stays underneath rather than
                        being replaced — the office still needs to reach people
                        after the handsets go back. */}
                    <td className={`${cell} font-mono whitespace-nowrap`}>
                      {callSheetPhone(person) ?? ''}
                      {usesProductionPhone(person) && person.phone && (
                        <div className="text-[9px] text-slate-500">own: {person.phone}</div>
                      )}
                    </td>
                    <td className={cell}>{person.email ?? ''}</td>
                    <td className={cell}>{person.company ?? ''}</td>
                    {showRates && <td className={`${cell} font-mono`}>{person.rate ?? ''}</td>}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </section>

      {castRows.length > 0 && (
        <section className="print-section">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1 mb-2">Cast list</h3>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={head}>Character</th>
                <th className={head}>Performer</th>
                <th className={head}>Phone</th>
                <th className={head}>Email</th>
              </tr>
            </thead>
            <tbody>
              {castRows.map(({ character, person }) => (
                <tr key={character.id} className="break-inside-avoid">
                  <td className={`${cell} font-bold uppercase`}>{character.canonicalName}</td>
                  <td className={cell}>{person?.displayName ?? <span className="text-slate-400">not cast</span>}</td>
                  <td className={`${cell} font-mono whitespace-nowrap`}>{person ? callSheetPhone(person) ?? '' : ''}</td>
                  <td className={cell}>{person?.email ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Accommodation gets its own section rather than more columns: only some
          people stay in a hotel, and the main table is already wide. */}
      {lodgingRows.length > 0 && (
        <section className="print-section">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b-2 border-slate-900 pb-1 mb-2">Accommodation</h3>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={head}>Name</th>
                <th className={head}>Hotel</th>
                <th className={head}>Address</th>
                <th className={head}>Check-in</th>
                <th className={head}>Check-out</th>
              </tr>
            </thead>
            <tbody>
              {lodgingRows.map((person) => (
                <tr key={person.id} className="break-inside-avoid">
                  <td className={`${cell} font-semibold`}>{person.displayName}</td>
                  <td className={cell}>{person.hotelName ?? ''}</td>
                  <td className={cell}>{person.hotelAddress ?? ''}</td>
                  <td className={`${cell} font-mono whitespace-nowrap`}>{person.hotelCheckIn ?? ''}</td>
                  <td className={`${cell} font-mono whitespace-nowrap`}>{person.hotelCheckOut ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-[9px] text-slate-500">Contact details are confidential to the production. Distribute only to the people who need them.</p>
    </div>
  );
};
