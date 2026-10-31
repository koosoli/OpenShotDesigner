import { PROJECT_SCHEMA } from './projectSchema';

interface Schema {
  readonly kind: string; readonly value?: unknown; readonly choices?: readonly Schema[];
  readonly item?: Schema; readonly properties?: Readonly<Record<string, Schema>>;
  readonly required?: readonly string[]; readonly additional?: Schema;
}
export const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
export const MAX_JSON_NODES = 100_000;
const COLOR = /^(?:#[a-f\d]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d.,%+\-\s/]+\))$/i;

/** Bound and check BEFORE any indexing, reference repair, or renderer sees the values. */
export function assertSafeJson(root: unknown, production = false): void {
  const stack = [{ value: root, depth: 0, key: '' }];
  let nodes = 0;
  while (stack.length) {
    const { value, depth, key } = stack.pop()!;
    if (++nodes > MAX_JSON_NODES || depth > (production ? 32 : 16)) throw new Error('Shared data exceeds its complexity limit.');
    if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > (production && key === 'amount' ? 1e12 : 1e6))) throw new Error('Invalid shared number.');
    if (typeof value === 'string') {
      const limit = production && key === 'scriptText' ? 524_288 : 16_384;
      if (value.length > limit || (production ? /^(?:data:|blob:|javascript:|vbscript:|file:)/i : /^(?:data:|blob:|javascript:|https?:)/i).test(value.trim())) throw new Error('Unsupported shared string or media.');
      if ((/color$/i.test(key) || key === 'colorHex') && !COLOR.test(value)) throw new Error('Invalid shared color.');
    }
    if (typeof value === 'number' && /^(?:opacity|pressure|.*Opacity)$/.test(key) && (value < 0 || value > 1)) throw new Error('Invalid shared opacity or pressure.');
    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        const limit = key === 'modifiers' ? 32 : key === 'path' || key === 'speechCues' ? 1000 : 5000;
        if (value.length > limit) throw new Error('Shared collection is too large.');
      } else if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Invalid shared object.');
      for (const [childKey, child] of Object.entries(value)) {
        if (FORBIDDEN_KEYS.has(childKey) || childKey.length > 256) throw new Error('Invalid shared key.');
        stack.push({ value: child, depth: depth + 1, key: childKey });
      }
    }
  }
}

export function parseSharedJson(raw: string, production = false): unknown {
  const value: unknown = JSON.parse(raw, (key, child: unknown) => {
    if (FORBIDDEN_KEYS.has(key)) throw new Error('Invalid shared key.');
    return child;
  });
  assertSafeJson(value, production);
  return value;
}

function matches(value: unknown, schema: Schema, depth = 0): boolean {
  if (depth > 64) return false;
  switch (schema.kind) {
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'boolean': return typeof value === 'boolean';
    case 'literal': return value === schema.value;
    case 'ref': return matches(value, PROJECT_SCHEMA[schema.value as keyof typeof PROJECT_SCHEMA], depth + 1);
    case 'union': return schema.choices!.some((choice) => matches(value, choice, depth + 1));
    case 'array': return Array.isArray(value) && value.every((item) => matches(item, schema.item!, depth + 1));
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const record = value as Record<string, unknown>;
      if (schema.required!.some((key) => !Object.hasOwn(record, key) || record[key] === undefined)) return false;
      return Object.entries(record).every(([key, child]) => {
        const property = schema.properties![key];
        if (child === undefined && property && !schema.required!.includes(key)) return true;
        return !FORBIDDEN_KEYS.has(key) && !!(property ?? schema.additional) && matches(child, property ?? schema.additional!, depth + 1);
      });
    }
    default: return false;
  }
}

export function assertEditorType(value: unknown, name: keyof typeof PROJECT_SCHEMA): void {
  if (!matches(value, PROJECT_SCHEMA[name])) throw new Error(`Invalid shared ${name} structure.`);
}

export function assertAllowedKeys(value: object, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('Unexpected shared document field.');
}
