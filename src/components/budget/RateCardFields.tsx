import React, { useId, useState } from 'react';
import { RATE_BASIS_LABELS, VAT_PRESETS } from '../../domain/budget';
import type { RateBasis, RateCard } from '../../domain/budget';

interface VatSelectProps {
  /** Absent = the production default. */
  value: number | undefined;
  defaultPercent: number;
  onChange: (percent: number | undefined) => void;
  className: string;
  ariaLabel?: string;
  /** Lets a caption label the select with htmlFor. */
  id?: string;
}

const CUSTOM = '__custom__';
const DEFAULT = '__default__';

/**
 * A VAT rate picker that knows the rates a production meets — Luxembourg's
 * four, the neighbours', and none — but never refuses a number it has not
 * heard of. "Default" means the project setting, so changing that setting
 * changes every rate that did not pin its own.
 */
export const VatSelect: React.FC<VatSelectProps> = ({ value, defaultPercent, onChange, className, ariaLabel, id }) => {
  const known = VAT_PRESETS.some((preset) => preset.rates.some((rate) => rate.percent === value));
  const [custom, setCustom] = useState(value !== undefined && !known);
  const selected = value === undefined ? DEFAULT : custom || !known ? CUSTOM : String(value);
  return (
    <div className="flex items-center gap-1">
      <select
        id={id}
        value={selected}
        aria-label={ariaLabel ?? 'VAT rate'}
        onChange={(event) => {
          const next = event.target.value;
          if (next === DEFAULT) {
            setCustom(false);
            onChange(undefined);
          } else if (next === CUSTOM) {
            setCustom(true);
            onChange(value ?? defaultPercent);
          } else {
            setCustom(false);
            onChange(Number(next));
          }
        }}
        className={className}
      >
        <option value={DEFAULT}>Default ({defaultPercent}%)</option>
        {VAT_PRESETS.map((preset) => (
          <optgroup key={preset.code} label={preset.country}>
            {preset.rates.map((rate) => (
              <option key={`${preset.code}-${rate.percent}-${rate.label}`} value={String(rate.percent)}>
                {rate.percent}% · {rate.label}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={CUSTOM}>Other…</option>
      </select>
      {selected === CUSTOM && (
        <input
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={value ?? ''}
          aria-label="Custom VAT percentage"
          onChange={(event) => onChange(event.target.value === '' ? 0 : Math.max(0, Number(event.target.value)))}
          className={`${className} !w-16`}
        />
      )}
    </div>
  );
};

interface RateCardFieldsProps {
  value: RateCard | undefined;
  onChange: (value: RateCard | undefined) => void;
  currency: string;
  defaultVatPercent: number;
  inputCls: string;
  labelCls: string;
  /** Shown above the amount; "Rate" by default. */
  label?: string;
}

/**
 * Amount, basis and VAT for one rate. Clearing the amount clears the whole
 * card: a person with no amount is unpriced, not priced at zero (rule 13).
 */
export const RateCardFields: React.FC<RateCardFieldsProps> = ({
  value,
  onChange,
  currency,
  defaultVatPercent,
  inputCls,
  labelCls,
  label = 'Rate',
}) => {
  const basis: RateBasis = value?.basis ?? 'day';
  const vatId = useId();
  const patch = (updates: Partial<RateCard>, amount = value?.amount) => {
    if (amount === undefined || !Number.isFinite(amount)) {
      onChange(undefined);
      return;
    }
    const next: RateCard = { amount, basis: updates.basis ?? basis };
    const vat = 'vatPercent' in updates ? updates.vatPercent : value?.vatPercent;
    if (vat !== undefined) next.vatPercent = vat;
    onChange(next);
  };
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 col-span-2">
      <label className="block space-y-1">
        <span className={labelCls}>{label} ({currency}, net)</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            step={1}
            inputMode="decimal"
            value={value?.amount ?? ''}
            placeholder="450"
            onChange={(event) => patch({}, event.target.value === '' ? undefined : Math.max(0, Number(event.target.value)))}
            className={inputCls}
          />
          <select
            value={basis}
            aria-label="Rate basis"
            onChange={(event) => patch({ basis: event.target.value as RateBasis })}
            className={`${inputCls} !w-auto`}
          >
            {(Object.keys(RATE_BASIS_LABELS) as RateBasis[]).map((key) => (
              <option key={key} value={key}>{RATE_BASIS_LABELS[key]}</option>
            ))}
          </select>
        </div>
      </label>
      <div className="block space-y-1">
        <label htmlFor={vatId} className={`block ${labelCls}`}>VAT</label>
        <VatSelect
          id={vatId}
          value={value?.vatPercent}
          defaultPercent={defaultVatPercent}
          onChange={(percent) => patch({ vatPercent: percent })}
          className={`${inputCls} !w-auto`}
        />
      </div>
    </div>
  );
};
