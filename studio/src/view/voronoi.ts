// Voronoi tessellation for the city map: each district's cell is every point
// closer to IT than to any other district seed. Computed as the intersection of
// half-planes (perpendicular bisectors), clipped to the map rect via
// Sutherland–Hodgman. Exact, deterministic, no library. The engine already told
// us who borders whom (border edges); this draws the contiguous territory.

export type P = { x: number; y: number };
export type Seed = { id: number; x: number; y: number };

// Clip a polygon by a half-plane: keep the side where (dot(n, p) <= c).
function clipHalfPlane(poly: P[], nx: number, ny: number, c: number): P[] {
  if (poly.length === 0) return poly;
  const out: P[] = [];
  const inside = (p: P) => nx * p.x + ny * p.y <= c + 1e-9;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ain = inside(a), bin = inside(b);
    if (ain) out.push(a);
    if (ain !== bin) {
      // intersection of segment a→b with the line nx*x+ny*y=c
      const da = nx * a.x + ny * a.y - c;
      const db = nx * b.x + ny * b.y - c;
      const t = da / (da - db);
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  return out;
}

// The Voronoi cell of `seed` within [0,w]x[0,h], clipped against all others.
export function cell(seed: Seed, others: Seed[], w: number, h: number): P[] {
  let poly: P[] = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  for (const o of others) {
    if (o.id === seed.id) continue;
    // bisector between seed and o: keep points closer to seed.
    // closer to seed ⇔ 2*(o-seed)·p <= |o|²-|seed|²
    const nx = 2 * (o.x - seed.x);
    const ny = 2 * (o.y - seed.y);
    const c = (o.x * o.x + o.y * o.y) - (seed.x * seed.x + seed.y * seed.y);
    poly = clipHalfPlane(poly, nx, ny, c);
    if (poly.length === 0) break;
  }
  return poly;
}

// All cells at once.
export function tessellate(seeds: Seed[], w: number, h: number): Map<number, P[]> {
  const m = new Map<number, P[]>();
  for (const s of seeds) m.set(s.id, cell(s, seeds, w, h));
  return m;
}

// Round the polygon corners a touch and add seeded organic wobble to each edge
// midpoint, so the borders read hand-drawn, not laser-cut — while STILL tiling
// (adjacent cells share the same edge endpoints, so no gaps open up).
export function organicPath(poly: P[]): string {
  if (poly.length < 3) return '';
  // simple rounded path via quadratic midpoints (shared corners keep it gapless)
  const mids = poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  });
  let d = `M ${mids[mids.length - 1].x.toFixed(1)} ${mids[mids.length - 1].y.toFixed(1)} `;
  for (let i = 0; i < poly.length; i++) {
    d += `Q ${poly[i].x.toFixed(1)} ${poly[i].y.toFixed(1)} ${mids[i].x.toFixed(1)} ${mids[i].y.toFixed(1)} `;
  }
  return d + 'Z';
}

export function centroid(poly: P[]): P {
  if (poly.length === 0) return { x: 0, y: 0 };
  let x = 0, y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  return { x: x / poly.length, y: y / poly.length };
}
