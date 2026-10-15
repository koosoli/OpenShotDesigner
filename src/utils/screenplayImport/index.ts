/**
 * Screenplays in formats the importer does not read itself — PDF, Word,
 * Celtx, HTML — turned into text it does (Final Draft XML when the format
 * knows each paragraph's element, indented text when it only knows where the
 * words sit). Loaded on demand from the script panel.
 *
 * The approach follows ScriptCraft's importers (MIT/Apache-2.0,
 * https://github.com/NoJuanNobody/scriptcraft): read the structure a format
 * has, and fall back to a screenplay's columns when it has none.
 */
import { elementsFromScreenplayHtml, screenplayFromCeltx } from './celtx';
import { screenplayFromDocx } from './docx';
import { fdxFromElements, fountainTitleBlock } from './output';
import { readPdfPages } from './pdf';
import { screenplayFromPdfPages } from './pdfText';

/** File extensions this module converts. */
export const CONVERTIBLE_SCREENPLAY = /\.(pdf|docx|celtx|html?)$/i;

export interface ConvertedScreenplay {
  /** Text for `parseScreenplay`. */
  raw: string;
  /** A file name whose extension tells `parseScreenplay` how to read `raw`. */
  name: string;
}

const withExtension = (name: string, extension: string) => `${name.replace(/\.[^.]+$/, '')}.${extension}`;

/** Convert a PDF, Word, Celtx or HTML screenplay; null when nothing usable was found in it. */
export const convertScreenplayFile = async (file: File): Promise<ConvertedScreenplay | null> => {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const data = new Uint8Array(await file.arrayBuffer());
  if (extension === 'pdf') {
    const { text, titlePage } = screenplayFromPdfPages(await readPdfPages(data.buffer));
    if (!text.trim()) return null;
    return { raw: `${fountainTitleBlock(titlePage)}${text}`, name: withExtension(file.name, 'txt') };
  }
  if (extension === 'docx') {
    const { raw, extension: as } = screenplayFromDocx(data);
    return raw.trim() ? { raw, name: withExtension(file.name, as) } : null;
  }
  if (extension === 'celtx') {
    const raw = screenplayFromCeltx(data);
    return raw ? { raw, name: withExtension(file.name, 'fdx') } : null;
  }
  if (extension === 'html' || extension === 'htm') {
    const elements = elementsFromScreenplayHtml(new TextDecoder().decode(data));
    return elements.length ? { raw: fdxFromElements(elements), name: withExtension(file.name, 'fdx') } : null;
  }
  return null;
};
