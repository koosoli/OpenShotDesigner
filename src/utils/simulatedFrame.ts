/**
 * Render the SIMULATED viewfinder (actor silhouettes + props in the camera's
 * field of view) to a raster image so it can be stored as storyboard art.
 *
 * The drawing mirrors what `ViewfinderModal` shows on screen: a studio
 * gradient, back-to-front subjects scaled by distance, name pills and the
 * requested framing guides. Pure canvas work — no React, no DOM queries.
 */

export interface SimulatedSubject {
  kind: 'actor' | 'prop';
  label: string;
  /** −1 (frame left) … +1 (frame right). */
  normalizedX: number;
  /** Distance from the camera in plan units; larger = smaller on screen. */
  distance: number;
  color?: string;
  /** Single letter drawn on an actor's head. */
  badge?: string;
}

export interface SimulatedFrameOptions {
  aspectRatio: number;
  subjects: SimulatedSubject[];
  width?: number;
  showRuleOfThirds?: boolean;
  showSafeAreas?: boolean;
  showCrosshair?: boolean;
  /** Burned into the bottom strip, e.g. "CAM A · 35mm · 2.39:1". */
  caption?: string;
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

/**
 * Draw the simulated frame and return it as a JPEG data URL, or null when a
 * 2D context is unavailable (headless/blocked canvas).
 */
export const renderSimulatedFrame = (options: SimulatedFrameOptions): string | null => {
  const width = options.width ?? 1280;
  const height = Math.max(1, Math.round(width / (options.aspectRatio || 16 / 9)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Studio backdrop: dark ceiling, floor band, subtle horizon.
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#020617');
  sky.addColorStop(0.55, '#0f172a');
  sky.addColorStop(1, '#020617');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  const floorTop = height * 0.6;
  const floor = ctx.createLinearGradient(0, floorTop, 0, height);
  floor.addColorStop(0, '#0f172a');
  floor.addColorStop(1, '#020617');
  ctx.fillStyle = floor;
  ctx.fillRect(0, floorTop, width, height - floorTop);
  ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.lineWidth = Math.max(1, width / 900);
  ctx.beginPath();
  ctx.moveTo(0, floorTop);
  ctx.lineTo(width, floorTop);
  ctx.stroke();

  // Subjects: farthest first so nearer ones overlap correctly.
  const ordered = [...options.subjects].sort((a, b) => b.distance - a.distance);
  const baseline = height * 0.86;
  for (const subject of ordered) {
    const scale = Math.max(0.3, Math.min(2.2, 190 / Math.max(1, subject.distance))) * (width / 900);
    const centreX = width / 2 + subject.normalizedX * (width * 0.44);
    const color = subject.color || (subject.kind === 'actor' ? '#3b82f6' : '#64748b');

    if (subject.kind === 'actor') {
      const headR = 26 * scale;
      const torsoW = 46 * scale;
      const torsoH = 62 * scale;
      const torsoY = baseline - torsoH;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.92;
      roundRect(ctx, centreX - torsoW / 2, torsoY, torsoW, torsoH, torsoW * 0.42);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(centreX, torsoY - headR * 0.9, headR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1, 2 * scale * 0.6);
      ctx.stroke();
      if (subject.badge) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${Math.round(headR * 1.05)}px Arial, Helvetica, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(subject.badge, centreX, torsoY - headR * 0.9);
      }
      // Name pill above the head
      ctx.font = `700 ${Math.round(13 * scale)}px Arial, Helvetica, sans-serif`;
      const textW = ctx.measureText(subject.label).width;
      const pillH = 20 * scale;
      const pillY = torsoY - headR * 2.1 - pillH;
      ctx.fillStyle = color;
      roundRect(ctx, centreX - textW / 2 - 8 * scale, pillY, textW + 16 * scale, pillH, pillH / 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(subject.label, centreX, pillY + pillH / 2);
    } else {
      const boxW = 84 * scale;
      const boxH = 54 * scale;
      const boxY = baseline - boxH;
      ctx.fillStyle = 'rgba(51,65,85,0.85)';
      roundRect(ctx, centreX - boxW / 2, boxY, boxW, boxH, 8 * scale);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148,163,184,0.9)';
      ctx.lineWidth = Math.max(1, 2 * scale * 0.6);
      ctx.stroke();
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `600 ${Math.round(12 * scale)}px Arial, Helvetica, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(subject.label, centreX, boxY + boxH / 2);
    }
  }

  if (options.subjects.length === 0) {
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.font = `700 ${Math.round(width / 40)}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EMPTY FRAME', width / 2, height / 2);
  }

  if (options.showRuleOfThirds) {
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = Math.max(1, width / 1000);
    for (let i = 1; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo((width / 3) * i, 0);
      ctx.lineTo((width / 3) * i, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (height / 3) * i);
      ctx.lineTo(width, (height / 3) * i);
      ctx.stroke();
    }
  }

  if (options.showSafeAreas) {
    const inset = (fraction: number, stroke: string) => {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(1, width / 900);
      ctx.strokeRect(width * fraction, height * fraction, width * (1 - fraction * 2), height * (1 - fraction * 2));
    };
    inset(0.05, 'rgba(250,204,21,0.45)');
    inset(0.1, 'rgba(34,211,238,0.45)');
  }

  if (options.showCrosshair) {
    ctx.strokeStyle = 'rgba(239,68,68,0.75)';
    ctx.lineWidth = Math.max(1, width / 900);
    const arm = width / 60;
    ctx.beginPath();
    ctx.moveTo(width / 2 - arm, height / 2);
    ctx.lineTo(width / 2 + arm, height / 2);
    ctx.moveTo(width / 2, height / 2 - arm);
    ctx.lineTo(width / 2, height / 2 + arm);
    ctx.stroke();
  }

  if (options.caption) {
    const barH = Math.round(height * 0.07);
    ctx.fillStyle = 'rgba(2,6,23,0.72)';
    ctx.fillRect(0, height - barH, width, barH);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `600 ${Math.round(barH * 0.46)}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(options.caption, width * 0.02, height - barH / 2);
  }

  try {
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
};
