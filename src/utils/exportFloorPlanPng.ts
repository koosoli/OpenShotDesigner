/**
 * Serializes an SVG element to a PNG download.
 * Used by the Export & Print studio for the 2D floor plan blueprint.
 */
export function exportSvgAsPng(
  svg: SVGSVGElement,
  opts: {
    scale?: number;
    fileName: string;
    title: string;
    subtitle: string;
    meta?: string[];
    /** Production logo (data URL) drawn at the left of the title block. */
    logo?: string;
  }
): void {
  const scale = opts.scale || 2;

  const rect = svg.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(rect.width));
  clone.setAttribute('height', String(rect.height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  // Inline the Tailwind font utilities used by the export SVG so they survive
  // serialization to a standalone image (external CSS is not applied to it).
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent =
    '.font-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}' +
    '.font-black{font-weight:900}' +
    '.font-bold{font-weight:700}' +
    '.font-semibold{font-weight:600}' +
    '.font-medium{font-weight:500}';
  clone.insertBefore(styleEl, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

  /** Draw the stamped title block, with the production logo when there is one. */
  const drawTitleBlock = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    logo: HTMLImageElement | null
  ) => {
    const barH = Math.round(70 * scale);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, barH);

    let textX = Math.round(16 * scale);
    if (logo) {
      const logoH = Math.round(44 * scale);
      const logoW = Math.round((logo.width / (logo.height || 1)) * logoH);
      const logoX = Math.round(16 * scale);
      ctx.drawImage(logo, logoX, Math.round((barH - logoH) / 2), logoW, logoH);
      textX = logoX + logoW + Math.round(14 * scale);
    }

    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(17 * scale)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(opts.title, textX, Math.round(24 * scale));

    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 ${Math.round(11 * scale)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText(opts.subtitle, textX, Math.round(47 * scale));
    if (opts.meta && opts.meta.length > 0) {
      ctx.fillText(opts.meta.join('  •  '), textX, Math.round(61 * scale));
    }
  };

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(rect.width * scale);
    canvas.height = Math.ceil(rect.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const save = () => {
      const link = document.createElement('a');
      link.download = opts.fileName;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };

    // Stamp a production title block along the top of the image
    if (opts.logo) {
      const logo = new Image();
      logo.onload = () => {
        drawTitleBlock(ctx, canvas, logo);
        save();
      };
      // A logo that fails to load must not cost the user their export
      logo.onerror = () => {
        drawTitleBlock(ctx, canvas, null);
        save();
      };
      logo.src = opts.logo;
      return;
    }

    drawTitleBlock(ctx, canvas, null);
    save();
  };
  img.src = svgUrl;
}