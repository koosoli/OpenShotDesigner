import React from 'react';
import type { EquipmentCategory } from '../../types';
import type { GearBrandOption, GearModelOption } from '../../domain/fixtures';

/**
 * Only the lighting department has a real-fixture database behind it. Every
 * other category gets an empty profile list, which makes the merge helpers
 * fall through to the curated department names unchanged.
 */
export const usesFixtureDatabase = (category: EquipmentCategory): boolean => category === 'lighting';

/** `<optgroup>`s separating the curated department names from database entries. */
export const BrandOptions: React.FC<{ options: GearBrandOption[] }> = ({ options }) => {
  const department = options.filter((option) => option.fromDepartment);
  const database = options.filter((option) => !option.fromDepartment);
  const optionClass = 'bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold';
  const label = (option: GearBrandOption) =>
    option.profileCount > 0 ? `${option.brand} (${option.profileCount})` : option.brand;
  if (database.length === 0) {
    return (
      <>
        {department.map((option) => (
          <option key={option.brand} value={option.brand} className={optionClass}>
            {label(option)}
          </option>
        ))}
      </>
    );
  }
  return (
    <>
      <optgroup label="Department catalog">
        {department.map((option) => (
          <option key={option.brand} value={option.brand} className={optionClass}>
            {label(option)}
          </option>
        ))}
      </optgroup>
      <optgroup label={`Fixture database (${database.length} makers)`}>
        {database.map((option) => (
          <option key={option.brand} value={option.brand} className={optionClass}>
            {label(option)}
          </option>
        ))}
      </optgroup>
    </>
  );
};

/** Model options, marking the ones that carry database data with a ◆. */
export const ModelOptions: React.FC<{ options: GearModelOption[] }> = ({ options }) => {
  const optionClass = 'bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold';
  const linked = options.filter((option) => option.profile);
  const plain = options.filter((option) => !option.profile);
  if (linked.length === 0) {
    return (
      <>
        {plain.map((option) => (
          <option key={option.model} value={option.model} className={optionClass}>
            {option.model}
          </option>
        ))}
      </>
    );
  }
  return (
    <>
      <optgroup label="Fixture database — DMX & specs included">
        {linked.map((option) => (
          <option key={option.model} value={option.model} className={optionClass}>
            ◆ {option.model}
            {option.profile!.modes.length > 0 ? ` — ${option.profile!.modes.length} DMX mode${option.profile!.modes.length === 1 ? '' : 's'}` : ''}
          </option>
        ))}
      </optgroup>
      {plain.length > 0 && (
        <optgroup label="Department catalog — name only">
          {plain.map((option) => (
            <option key={option.model} value={option.model} className={optionClass}>
              {option.model}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
};
