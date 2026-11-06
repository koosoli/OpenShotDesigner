import type { SectionPdfContext, RenderedPdf } from './exportStudio';
import { renderSvgToPngBytes } from '../exportFloorPlanPng';
import { createFloorPlanPdf, buildFloorPlanPdfFilename } from './floorPlanPdf';

/** The blueprint and optional 3D sheet share one export snapshot. */
export async function renderFloorPlanSection(ctx: SectionPdfContext,
  header: { title: string; date?: string; logoPngBytes?: Uint8Array }): Promise<RenderedPdf> {
  if (!ctx.floorPlanSvg) throw new Error('Open the floor plan section once so the blueprint can render.');
  const { activeSetup, project } = ctx;
  const png = await renderSvgToPngBytes(ctx.floorPlanSvg, {
    scale: 2, title: project.title, subtitle: `SCENE ${activeSetup.sceneNumber}: ${activeSetup.name}`,
  });
  const bytes = await createFloorPlanPdf({
    productionTitle: header.title, sceneName: `Scene ${activeSetup.sceneNumber}: ${activeSetup.name}`,
    ...(header.date ? { date: header.date } : {}),
    ...(png ? { imageBytes: png, mimeType: 'image/png' } : {}),
    scene3dSnapshot: ctx.scene3dSnapshot, orientation: 'landscape', logoPngBytes: header.logoPngBytes,
  });
  return { bytes, filename: buildFloorPlanPdfFilename({ productionTitle: header.title }) };
}
