import type { VectorPoint } from "../model/types";

export interface Pt {
  x: number;
  y: number;
}

/** Ramer–Douglas–Peucker: drop points that don't change the shape much */
export function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const d2 = (p: Pt, a: Pt, b: Pt) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l = dx * dx + dy * dy;
    let t = l ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l : 0;
    t = Math.max(0, Math.min(1, t));
    const x = a.x + t * dx - p.x, y = a.y + t * dy - p.y;
    return x * x + y * y;
  };
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = d2(pts[i], pts[a], pts[b]);
      if (d > best) {
        best = d;
        bi = i;
      }
    }
    if (best > eps * eps) {
      keep[bi] = true;
      stack.push([a, bi], [bi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Catmull–Rom → Bézier handles, so a freehand stroke comes out smooth */
export function smooth(pts: Pt[], closed = false): VectorPoint[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = pts[i - 1] ?? (closed ? pts[n - 1] : p);
    const next = pts[i + 1] ?? (closed ? pts[0] : p);
    const tx = (next.x - prev.x) / 6, ty = (next.y - prev.y) / 6;
    const out: VectorPoint = { x: p.x, y: p.y };
    if ((i > 0 || closed) && n > 2) {
      out.ix = p.x - tx;
      out.iy = p.y - ty;
    }
    if ((i < n - 1 || closed) && n > 2) {
      out.ox = p.x + tx;
      out.oy = p.y + ty;
    }
    return out;
  });
}

/** bounding box of points (and their handles) */
export function bounds(pts: VectorPoint[]) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of pts) {
    for (const [x, y] of [[p.x, p.y], [p.ix, p.iy], [p.ox, p.oy]] as [number | undefined, number | undefined][]) {
      if (x === undefined || y === undefined) continue;
      x1 = Math.min(x1, x);
      y1 = Math.min(y1, y);
      x2 = Math.max(x2, x);
      y2 = Math.max(y2, y);
    }
  }
  return { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
}

export function shift(pts: VectorPoint[], dx: number, dy: number): VectorPoint[] {
  return pts.map((p) => ({
    x: p.x + dx,
    y: p.y + dy,
    ...(p.ix !== undefined ? { ix: p.ix + dx, iy: (p.iy ?? 0) + dy } : {}),
    ...(p.ox !== undefined ? { ox: p.ox + dx, oy: (p.oy ?? 0) + dy } : {}),
  }));
}

/** snap a value to the nearest candidate within a threshold */
export function snap(v: number, candidates: number[], threshold: number): { v: number; hit: number | null } {
  let best: number | null = null, dist = threshold;
  for (const c of candidates) {
    const d = Math.abs(c - v);
    if (d <= dist) {
      dist = d;
      best = c;
    }
  }
  return best === null ? { v, hit: null } : { v: best, hit: best };
}

export const intersects = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
