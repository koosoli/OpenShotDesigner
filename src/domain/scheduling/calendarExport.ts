import type { ProductionDay } from './types';

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

const eventLines = (
  uid: string,
  title: string,
  date: string,
  start: string | undefined,
  end: string | undefined,
  description: string,
): string[] => {
  const startTime = compactTime(start);
  const endTime = compactTime(end);
  const lines = ['BEGIN:VEVENT', `UID:${escapeIcs(uid)}`, `SUMMARY:${escapeIcs(title)}`];
  if (startTime) {
    lines.push(`DTSTART:${compactDate(date)}T${startTime}`);
    if (endTime) {
      lines.push(`DTEND:${compactDate(endTime <= startTime ? addDay(date) : date)}T${endTime}`);
    }
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(date)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(addDay(date))}`);
  }
  if (description) lines.push(`DESCRIPTION:${escapeIcs(description)}`);
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
  ].join('\r\n');

export const shootingDaysToIcs = (
  days: readonly ProductionDay[],
  productionTitle: string,
): string =>
  calendar(
    productionTitle,
    days
      .filter((day): day is ProductionDay & { date: string } => Boolean(day.date))
      .map((day) =>
        eventLines(
          `${day.id}@openshotdesigner`,
          `${productionTitle} — ${day.name}`,
          day.date,
          day.crewCall,
          day.plannedWrap,
          day.notes ?? '',
        ),
      ),
  );

export const personalCallsToIcs = (
  days: readonly ProductionDay[],
  productionTitle: string,
  personId: string,
  personName: string,
): string =>
  calendar(
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
          day.date,
          time,
          day.plannedWrap,
          call?.note ?? '',
        ),
      ];
    }),
  );
