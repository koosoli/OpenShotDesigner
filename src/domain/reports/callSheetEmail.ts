/**
 * Sending an issued call sheet by email, without a server: a `mailto:` draft
 * BCC'd to everyone on the sheet who has an address, with the essentials in
 * the body. The PDF is downloaded alongside for the sender to attach — a
 * mailto link cannot carry an attachment.
 */
import type { CallSheetData } from './callSheet';

export interface CallSheetEmailInput {
  productionTitle: string;
  sheet: CallSheetData;
  /** Email address per person id. */
  emailOf: (personId: string) => string | undefined;
}

export interface CallSheetEmail {
  href: string;
  recipients: string[];
  /** People on the sheet with no address on file. */
  missing: string[];
}

export const callSheetEmail = (input: CallSheetEmailInput): CallSheetEmail => {
  const { sheet } = input;
  const recipients = new Set<string>();
  const missing: string[] = [];
  for (const person of [...sheet.cast, ...sheet.crew]) {
    const email = person.id ? input.emailOf(person.id)?.trim() : undefined;
    if (email && /@/.test(email)) recipients.add(email);
    else if (!missing.includes(person.displayName)) missing.push(person.displayName);
  }
  const revision = sheet.revision !== undefined ? ` (Rev ${sheet.revision})` : '';
  const subject = `${input.productionTitle} — call sheet ${sheet.dayName}${sheet.date ? `, ${sheet.date}` : ''}${revision}`;
  const location = sheet.locations.map((entry) => [entry.name, entry.address].filter(Boolean).join(', ')).filter(Boolean).join(' / ');
  const body = [
    `Call sheet for ${sheet.dayName}${sheet.date ? ` (${sheet.date})` : ''}${revision}.`,
    sheet.crewCall ? `General crew call: ${sheet.crewCall}` : undefined,
    location ? `Location: ${location}` : undefined,
    '',
    'The call sheet PDF is attached. Please reply to confirm you have received it.',
  ].filter((line) => line !== undefined).join('\n');
  const params = [
    recipients.size ? `bcc=${encodeURIComponent([...recipients].join(','))}` : '',
    `subject=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(body)}`,
  ].filter(Boolean).join('&');
  return { href: `mailto:?${params}`, recipients: [...recipients], missing };
};
