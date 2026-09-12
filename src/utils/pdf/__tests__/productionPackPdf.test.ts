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

    const { documents, failures } = await renderProductionPackPdfs(
      {} as SectionPdfContext,
      undefined,
      render,
    );

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

/**
 * Isolation without silence.
 *
 * A failing section must not cost the producer the rest of the pack — but the
 * old behaviour returned only the successes, so a ZIP missing its call sheet
 * looked exactly like a complete one. You hand it out, and the gap turns up on
 * the shooting day.
 */
describe('Production Pack reports what it could not render', () => {
  const failingRender = (failOn: string[]) => async (section: SectionPdfKind): Promise<RenderedPdf> => {
    if (failOn.includes(section)) throw new Error(`No source for ${section}`);
    return { filename: `my-film_${section}.pdf`, bytes: new Uint8Array([1]) };
  };

  it('names every section it dropped, and why', async () => {
    const { documents, failures } = await renderProductionPackPdfs(
      {} as SectionPdfContext,
      undefined,
      failingRender(['floorplan', 'storyboard']),
    );

    expect(failures.map((failure) => failure.section).sort()).toEqual(
      ['floorplan', 'storyboard'].sort(),
    );
    expect(failures[0].reason).toContain('No source for');
    // The rest of the pack still arrives.
    expect(documents.length).toBeGreaterThan(0);
  });

  it('reports an empty failure list when the pack is complete', async () => {
    const { failures } = await renderProductionPackPdfs(
      {} as SectionPdfContext,
      undefined,
      failingRender([]),
    );
    expect(failures).toEqual([]);
  });

  it('turns a non-Error throw into a readable reason', async () => {
    const { failures } = await renderProductionPackPdfs(
      {} as SectionPdfContext,
      undefined,
      async (section) => {
        if (section === 'equipment') throw 'not an Error object';
        return { filename: `x_${section}.pdf`, bytes: new Uint8Array([1]) };
      },
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBe('Unknown error');
  });
});
