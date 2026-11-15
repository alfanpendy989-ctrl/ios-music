// Ikon bergaya SF Symbols, digambar langsung ke Canvas 2D.
type Ctx = CanvasRenderingContext2D;

export function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Segitiga dengan sudut membulat (isi + garis tepi round-join). */
function roundedPolygon(ctx: Ctx, pts: [number, number][], round: number): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = round;
  ctx.strokeStyle = ctx.fillStyle;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** play.fill — `size` = tinggi ikon. */
export function drawPlay(ctx: Ctx, cx: number, cy: number, size: number): void {
  const round = size * 0.14;
  const h = size - round;
  const w = h * 0.86;
  const x0 = cx - w * 0.4;
  roundedPolygon(
    ctx,
    [
      [x0, cy - h / 2],
      [x0 + w, cy],
      [x0, cy + h / 2],
    ],
    round,
  );
}

/** pause.fill */
export function drawPause(ctx: Ctx, cx: number, cy: number, size: number): void {
  const bw = size * 0.3;
  const gap = size * 0.2;
  const r = size * 0.07;
  roundRectPath(ctx, cx - gap / 2 - bw, cy - size / 2, bw, size, r);
  ctx.fill();
  roundRectPath(ctx, cx + gap / 2, cy - size / 2, bw, size, r);
  ctx.fill();
}

/** forward.fill (dir = 1) / backward.fill (dir = -1) — `size` = lebar ikon. */
export function drawSkip(ctx: Ctx, cx: number, cy: number, size: number, dir: 1 | -1): void {
  const round = size * 0.09;
  const tw = size / 2 - round / 2;
  const th = size * 0.56;
  for (const start of [-size / 2 + round / 2, round / 4]) {
    const xa = cx + dir * start;
    const xb = cx + dir * (start + tw);
    roundedPolygon(
      ctx,
      [
        [xa, cy - th / 2],
        [xb, cy],
        [xa, cy + th / 2],
      ],
      round,
    );
  }
}

/** speaker.fill dengan `waves` gelombang; x = tepi kiri, `size` = tinggi. */
export function drawSpeaker(ctx: Ctx, x: number, cy: number, size: number, waves: number): void {
  const s = size;
  const round = s * 0.1;
  roundedPolygon(
    ctx,
    [
      [x + round / 2, cy - s * 0.17],
      [x + s * 0.24, cy - s * 0.17],
      [x + s * 0.5, cy - s * 0.42],
      [x + s * 0.5, cy + s * 0.42],
      [x + s * 0.24, cy + s * 0.17],
      [x + round / 2, cy + s * 0.17],
    ],
    round,
  );
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.1;
  const ox = x + s * 0.42;
  for (let i = 0; i < waves; i++) {
    const rad = s * (0.36 + i * 0.22);
    const ang = 0.62 - i * 0.04;
    ctx.beginPath();
    ctx.arc(ox, cy, rad, -ang, ang);
    ctx.stroke();
  }
  ctx.restore();
}

/** airplayaudio — segitiga dengan lingkaran konsentris. */
export function drawAirplay(ctx: Ctx, cx: number, cy: number, size: number): void {
  const s = size;
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.085;
  const oy = cy + s * 0.02;
  const radii = [0.2, 0.34, 0.48];
  radii.forEach((k, i) => {
    const open = 0.2 + i * 0.03;
    ctx.beginPath();
    ctx.arc(cx, oy, s * k, Math.PI * (1 - open), Math.PI * (2 + open));
    ctx.stroke();
  });
  ctx.restore();
  const round = s * 0.07;
  roundedPolygon(
    ctx,
    [
      [cx, oy + s * 0.08],
      [cx + s * 0.27, oy + s * 0.44],
      [cx - s * 0.27, oy + s * 0.44],
    ],
    round,
  );
}

/** Cover bawaan ketika lagu tidak punya artwork. */
export function makePlaceholderCover(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 800;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 800, 800);
  g.addColorStop(0, '#fb5c74');
  g.addColorStop(0.55, '#fa233b');
  g.addColorStop(1, '#7a1a8a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 800, 800);
  // not balok
  ctx.fillStyle = '#fff1f3';
  ctx.strokeStyle = '#fff1f3';
  ctx.lineWidth = 34;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(340, 540);
  ctx.lineTo(340, 270);
  ctx.lineTo(560, 220);
  ctx.lineTo(560, 490);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(340, 270);
  ctx.lineTo(560, 220);
  ctx.lineTo(560, 290);
  ctx.lineTo(340, 340);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  for (const [x, y] of [
    [285, 545],
    [505, 495],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x, y, 72, 56, -0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}
