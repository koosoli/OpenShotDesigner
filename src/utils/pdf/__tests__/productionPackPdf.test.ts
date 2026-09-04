import { describe, expect, it } from 'vitest';
import { buildProductionPackZipFilename } from '../index';
import {
  renderProductionPackPdfs,
  type RenderedPdf,
  type SectionPdfContext,
  type SectionPdfKind,
} from '../exportStudio';

describe('Production Pack ZIP filenames', () => {
  it('uses a canonical safe outer archive filename', () => {
    expect(buildProductionPackZipFilename('Ocean’s 11: Director/Draft "2"')).toBe(
      'ocean-s-11-director-draft-2_production-pack.zip',
    );
    expect(buildProductionPackZipFilename('')).toBe('untitled-production_production-pack.zip');
  });
});

describe('Production Pack rendering', () => {
  it('keeps available PDFs when an optional section cannot render', async () => {
    const rendered: SectionPdfKind[] = [];
    const render = async (section: SectionPdfKind, _ctx: SectionPdfContext): Promise<RenderedPdf> => {
      rendered.push(section);
      if (section === 'floorplan') throw new Error('No live SVG');
      return { filename: `my-film_${section}.pdf`, bytes: new Uint8Array([1]) };
    };

    const documents = await renderProductionPackPdfs({} as SectionPdfContext, undefined, render);

    expect(rendered).toContain('floorplan');
    // These filenames become ZIP entry names without path rewriting.
    expect(documents.map((document) => document.filename)).toEqual([
      'my-film_shotlist.pdf',
      'my-film_equipment.pdf',
      'my-film_continuity.pdf',
      'my-film_camerareport.pdf',
      'my-film_soundreport.pdf',
      'my-film_storyboard.pdf',
    ]);
  });
});
