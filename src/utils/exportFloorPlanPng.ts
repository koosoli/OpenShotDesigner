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

    // Stamp a production title block along the top of the image
    const barH = Math.round(70 * scale);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, barH);

    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(17 * scale)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(opts.title, Math.round(16 * scale), Math.round(24 * scale));

    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 ${Math.round(11 * scale)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText(opts.subtitle, Math.round(16 * scale), Math.round(47 * scale));
    if (opts.meta && opts.meta.length > 0) {
      ctx.fillText(
        opts.meta.join('  •  '),
        Math.round(16 * scale),
        Math.round(61 * scale)
      );
    }

    const link = document.createElement('a');
    link.download = opts.fileName;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
  img.src = svgUrl;
}