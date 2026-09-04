import type { ProductionDay } from './types';

/**
 * Additive-only export options. All fields are optional so existing callers
 * keep working unchanged; persisting reminders is deliberately NOT added to
 * the domain types (this stays a pure export concern).
 */
export interface CalendarExportOptions {
  /** IANA zone name (e.g. "Europe/Berlin"). Absent = floating local time. */
  timeZone?: string;
  /**
   * Minutes before the event start to trigger a display alarm. Absent (the
   * default) = no VALARM. The domain stores no reminder data, so this is the
   * only alarm source and it never touches persisted types.
   */
  alarmMinutesBefore?: number;
}

const escapeIcs = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

const compactDate = (date: string): string => date.replaceAll('-', '');
const compactTime = (time: string | undefined): string | null => {
  const match = time?.match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}${match[2]}00` : null;
};

const addDay = (date: string): string => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};

/** UTC stamp for DTSTAMP, computed locally (offline-safe, no network). */
const toDtStamp = (now: Date): string =>
  `${now.toISOString().replaceAll('-', '').replaceAll(':', '').split('.')[0]}Z`;

/**
 * SEQUENCE source: the domain tracks revisions only for issued call-sheet
 * copies (`callSheet.issues[].revision`), so the latest issue revision is the
 * sequence; days never issued stay at a stable 0.
 */
const sequenceForDay = (day: ProductionDay): number => {
  const issues = day.callSheet?.issues;
  if (!issues || issues.length === 0) return 0;
  return Math.max(...issues.map((issue) => issue.revision));
};

/** Best location signal available on the day; absent means "omit LOCATION". */
const locationForDay = (day: ProductionDay): string | null => {
  const unitBase = day.callSheet?.unitBase?.trim();
  return unitBase ? unitBase : null;
};

const utf8Length = (char: string): number => new TextEncoder().encode(char).length;

/**
 * RFC 5545 section 3.1 line folding: no content line may exceed 75 octets;
 * overlong lines are split and continued as CRLF followed by a single space.
 * Splits on UTF-8 byte boundaries so multi-byte characters stay intact.
 */
export const foldIcsLine = (line: string): string => {
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of line) {
    const size = utf8Length(char);
    if (currentBytes + size > 75 && current.length > 0) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += size;
  }
  chunks.push(current);
  return chunks.join('\r\n ');
};

const dateTimeProp = (
  prop: 'DTSTART' | 'DTEND',
  date: string,
  time: string,
  timeZone: string | undefined,
): string =>
  timeZone
    ? `${prop};TZID=${timeZone}:${compactDate(date)}T${time}`
    : `${prop}:${compactDate(date)}T${time}`;

const alarmLines = (summary: string, alarmMinutesBefore: number | undefined): string[] => {
  if (alarmMinutesBefore === undefined || !Number.isInteger(alarmMinutesBefore) || alarmMinutesBefore < 0) {
    return [];
  }
  return [
    'BEGIN:VALARM',
    `TRIGGER:-PT${alarmMinutesBefore}M`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(summary)}`,
    'END:VALARM',
  ];
};

const eventLines = (
  uid: string,
  title: string,
  day: ProductionDay,
  start: string | undefined,
  end: string | undefined,
  description: string,
  options: CalendarExportOptions | undefined,
  dtStamp: string,
): string[] => {
  const date = day.date as string;
  const startTime = compactTime(start);
  const endTime = compactTime(end);
  const timeZone = options?.timeZone?.trim() ? options.timeZone.trim() : undefined;
  // Stable deterministic UID: re-exporting the same event/project id yields
  // the same UID, so importers update instead of duplicating.
  const lines = [
    'BEGIN:VEVENT',
    `UID:${escapeIcs(uid)}`,
    `DTSTAMP:${dtStamp}`,
    `SEQUENCE:${sequenceForDay(day)}`,
    `SUMMARY:${escapeIcs(title)}`,
  ];
  if (startTime) {
    lines.push(dateTimeProp('DTSTART', date, startTime, timeZone));
    if (endTime) {
      lines.push(
        dateTimeProp('DTEND', endTime <= startTime ? addDay(date) : date, endTime, timeZone),
      );
    }
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(date)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(addDay(date))}`);
  }
  const location = locationForDay(day);
  if (location) lines.push(`LOCATION:${escapeIcs(location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeIcs(description)}`);
  lines.push(...alarmLines(title, options?.alarmMinutesBefore));
  lines.push('END:VEVENT');
  return lines;
};

const calendar = (name: string, events: string[][]): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OpenShotDesigner//Production Calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcs(name)}`,
    ...events.flat(),
    'END:VCALENDAR',
    '',
  ]
    .map(foldIcsLine)
    .join('\r\n');

export const shootingDaysToIcs = (
  days: readonly ProductionDay[],
  productionTitle: string,
  options?: CalendarExportOptions,
): string => {
  const dtStamp = toDtStamp(new Date());
  return calendar(
    productionTitle,
    days
      .filter((day): day is ProductionDay & { date: string } => Boolean(day.date))
      .map((day) =>
        eventLines(
          `${day.id}@openshotdesigner`,
          `${productionTitle} — ${day.name}`,
          day,
          day.crewCall,
          day.plannedWrap,
          day.notes ?? '',
          options,
          dtStamp,
        ),
      ),
  );
};

export const personalCallsToIcs = (
  days: readonly ProductionDay[],
  productionTitle: string,
  personId: string,
  personName: string,
  options?: CalendarExportOptions,
): string => {
  const dtStamp = toDtStamp(new Date());
  return calendar(
    `${productionTitle} — ${personName}`,
    days.flatMap((day) => {
      if (!day.date) return [];
      const call = day.callSheet?.personCalls?.find((entry) => entry.personId === personId);
      const time = call?.time ?? day.crewCall;
      if (!time) return [];
      return [
        eventLines(
          `${day.id}-${personId}@openshotdesigner`,
          `${productionTitle} — ${day.name} call`,
          day,
          time,
          day.plannedWrap,
          call?.note ?? '',
          options,
          dtStamp,
        ),
      ];
    }),
  );
};
