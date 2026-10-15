/**
 * A screenplay from Celtx (.celtx, a zip holding the script as HTML) or from
 * an HTML export. Celtx marks each paragraph with its element as a class —
 * `sceneheading`, `action`, `character`, `dialog`, `parenthetical`,
 * `transition`, `shot` — which is read directly.
 */
import { strFromU8, unzipSync } from 'fflate';
import { elementForStyleName, fdxFromElements } from './output';
import type { ImportedElement } from './output';

/** Elements from screenplay HTML, or [] when its paragraphs carry no element classes. */
export const elementsFromScreenplayHtml = (html: string): ImportedElement[] => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: ImportedElement[] = [];
  for (const paragraph of Array.from(doc.querySelectorAll('p, div'))) {
    if (paragraph.querySelector('p, div')) continue;
    const type = Array.from(paragraph.classList).map(elementForStyleName).find(Boolean);
    const text = (paragraph.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (type && text) out.push({ type, text });
  }
  return out;
};

/** The script of a .celtx project, as Final Draft XML for the importer ('' when none is found). */
export const screenplayFromCeltx = (data: Uint8Array): string => {
  const files = unzipSync(data, { filter: (file) => /\.html?$/i.test(file.name) });
  // The script document comes first; any other HTML (notes, catalogues) after.
  const names = Object.keys(files).sort((a, b) => Number(!/script/i.test(a)) - Number(!/script/i.test(b)));
  for (const name of names) {
    const elements = elementsFromScreenplayHtml(strFromU8(files[name]));
    if (elements.length > 0) return fdxFromElements(elements);
  }
  return '';
};
