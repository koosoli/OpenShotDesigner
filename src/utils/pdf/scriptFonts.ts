import { StandardFonts } from 'pdf-lib';
import type { PDFDocument, PDFFont } from 'pdf-lib';
import { isWinAnsiPrintable, sanitizePdfText } from './text';

export interface ScriptFonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  clean: (text: string) => string;
}
const files = ['CourierBadi-Regular.ttf', 'CourierBadi-Bold.ttf', 'CourierBadi-Italic.ttf', 'CourierBadi-BoldItalic.ttf'] as const;
const fontRequests = new Map<string, Promise<Uint8Array>>();
// eslint-disable-next-line no-control-regex -- Explicitly remove control and bidi formatting characters from printable text.
const normalize = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');

async function fontBytes(file: string): Promise<Uint8Array> {
  const url = `${import.meta.env.BASE_URL}fonts/courier-badi/${file}`;
  let request = fontRequests.get(url);
  if (!request) {
    request = fetch(url, { credentials: 'omit', redirect: 'error' }).then(async (response) => {
      if (!response.ok) throw new Error('The bundled screenplay font could not be loaded. Open the screenplay once while online, then retry the export.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength < 1000 || bytes.byteLength > 2 * 1024 * 1024) throw new Error('Invalid bundled screenplay font.');
      return bytes;
    }).catch((error: unknown) => { fontRequests.delete(url); throw error; });
    fontRequests.set(url, request);
  }
  return request;
}

/** Fontkit and TTF files load on Unicode export, not in the application entry bundle. */
export async function embedScriptFonts(doc: PDFDocument, texts: readonly string[]): Promise<ScriptFonts> {
  const unicode = texts.some((text) => [...normalize(text)].some((c) => c !== '\n' && !isWinAnsiPrintable(c)));
  let fonts: PDFFont[];
  if (unicode) {
    const [fontkit, bytes] = await Promise.all([import('@pdf-lib/fontkit'), Promise.all(files.map(fontBytes))]);
    doc.registerFontkit(fontkit.default);
    fonts = await Promise.all(bytes.map((data) => doc.embedFont(data, { subset: true })));
  } else {
    fonts = await Promise.all([StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique].map((name) => doc.embedFont(name)));
  }
  const [regular, bold, italic, boldItalic] = fonts;
  const supported = unicode ? new Set(regular.getCharacterSet()) : null;
  const clean = (text: string) => {
    if (!supported) return sanitizePdfText(text);
    const value = normalize(text);
    const missing = [...new Set([...value].filter((c) => c !== '\n' && !supported.has(c.codePointAt(0)!)))];
    if (missing.length) throw new Error(`The screenplay font cannot print ${missing.slice(0, 6).map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase()}`).join(', ')}. Export cancelled to preserve your text; use FDX or Fountain instead.`);
    return value;
  };
  texts.forEach(clean);
  return { regular, bold, italic, boldItalic, clean };
}
