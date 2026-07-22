// Deterministic top-down layout for the city dive. The engine owns STRUCTURE
// (the tree + stats); this file owns WHERE things sit in 2D — stably, seeded by
// entity id, so a building is always in the same spot and the view doesn't jump.
// Positions are in a 0..100 "stage" coordinate space the renderer maps to pixels.

import type { EntityDto } from '../owos';

export type Rect = { x: number; y: number; w: number; h: number };
export type Placed = { e: EntityDto; rect: Rect };

// The stable id-seeded hash lives in the shared view kit now; re-exported so
// existing demo imports keep working.
export { h } from '../view/hash';
import { h } from '../view/hash';

// Building "use" from the engine's use_roll stat → a type + colour + label.
// This is the block's *makeup* — real data, just themed here.
export type Use = { key: string; label: string; color: string; glyph: string };
const USES: Use[] = [
  { key: 'resi',   label: 'apartments',      color: '#7ba5d8', glyph: '🏢' },
  { key: 'shop',   label: 'shops',           color: '#e0a458', glyph: '🛍️' },
  { key: 'cafe',   label: 'café / bar',      color: '#d98c6a', glyph: '☕' },
  { key: 'clinic', label: "doctor's office", color: '#7fce9b', glyph: '➕' },
  { key: 'school', label: 'school',          color: '#c98fd0', glyph: '🎓' },
  { key: 'office', label: 'offices',         color: '#9aa7bd', glyph: '💼' },
];
export function useOf(e: EntityDto): Use {
  // `use` is the ENGINE's computed land use (0..5) — chosen by the plot's
  // preference score over its situation (area, road_access, wealth) with
  // district-scale scarcity feedback (clinics/schools/offices self-limit per
  // district). Indices match USES order. Falls back to the old random use_roll
  // bands only for pre-`use` worlds / the first frame before rules populate it.
  const u = e.stats.use;
  if (u != null) return USES[Math.max(0, Math.min(5, Math.round(u)))];
  const r = e.stats.use_roll ?? h(e.id, 7);
  if (r < 0.42) return USES[0];
  if (r < 0.58) return USES[1];
  if (r < 0.70) return USES[2];
  if (r < 0.82) return USES[3];
  if (r < 0.90) return USES[4];
  return USES[5];
}

// ---- per-level layouts (all return children placed in 0..100 space) ----

// Pack N items into a rough grid that fills the stage, with seeded jitter so it
// reads organic, not gridded. Used for districts and blocks.
function packGrid(items: EntityDto[], pad: number, jitter: number): Placed[] {
  const n = items.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cw = (100 - pad * 2) / cols;
  const ch = (100 - pad * 2) / rows;
  return items.map((e, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const jx = (h(e.id, 1) - 0.5) * cw * jitter;
    const jy = (h(e.id, 2) - 0.5) * ch * jitter;
    const sw = cw * (0.62 + 0.3 * h(e.id, 3));
    const sh = ch * (0.62 + 0.3 * h(e.id, 4));
    return { e, rect: {
      x: pad + c * cw + (cw - sw) / 2 + jx,
      y: pad + r * ch + (ch - sh) / 2 + jy,
      w: sw, h: sh,
    } };
  });
}

// Districts: big soft territories filling the map.
export function layoutDistricts(items: EntityDto[]): Placed[] {
  return packGrid(items, 4, 0.25);
}

// Blocks: parcels within a district, tighter.
export function layoutBlocks(items: EntityDto[]): Placed[] {
  return packGrid(items, 6, 0.2);
}

// Buildings on a block: footprints along street frontage — a row/grid of lots.
export function layoutBuildings(items: EntityDto[]): Placed[] {
  const n = items.length;
  const cols = Math.min(n, Math.ceil(Math.sqrt(n * 1.5)));
  const rows = Math.ceil(n / cols);
  const pad = 8, gap = 3;
  const cw = (100 - pad * 2 - gap * (cols - 1)) / cols;
  const ch = (100 - pad * 2 - gap * (rows - 1)) / rows;
  return items.map((e, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    // footprint scales a little with number of floors → taller buildings read bigger
    const floors = Math.max(1, Math.round(e.stats.floors ?? 1));
    const bulk = 0.6 + Math.min(0.35, floors * 0.05);
    const sw = cw * bulk, sh = ch * (0.55 + 0.4 * h(e.id, 5));
    return { e, rect: {
      x: pad + c * (cw + gap) + (cw - sw) / 2,
      y: pad + r * (ch + gap) + (ch - sh),   // bottom-align to the "street"
      w: sw, h: sh,
    } };
  });
}

// Floors: horizontal slabs stacked vertically (an elevation cutaway).
export function layoutFloors(items: EntityDto[]): Placed[] {
  const sorted = [...items].sort((a, b) => (b.stats.level ?? 0) - (a.stats.level ?? 0));
  const n = sorted.length;
  const pad = 6, gap = 2;
  const fh = (100 - pad * 2 - gap * (n - 1)) / n;
  return sorted.map((e, i) => ({ e, rect: {
    x: pad, y: pad + i * (fh + gap), w: 100 - pad * 2, h: fh,
  } }));
}

// Rooms: a real FLOORPLAN — two banks of rooms with a CORRIDOR between them
// (interior circulation, the same trend as streets between lots). The door
// chain runs through the corridor; sizes weighted by each room's `size` stat.
export const CORRIDOR = 12; // corridor thickness in stage units
export function layoutRooms(items: EntityDto[]): Placed[] {
  const n = items.length;
  const pad = 5, gap = 1.5;
  const banks: EntityDto[][] = n >= 4
    ? [items.slice(0, Math.ceil(n / 2)), items.slice(Math.ceil(n / 2))]
    : [items];
  const bankH = (100 - pad * 2 - CORRIDOR) / banks.length;
  const out: Placed[] = [];
  banks.forEach((bank, bi) => {
    const weights = bank.map((e) => 0.6 + (e.stats.size ?? 0.5));
    const total = weights.reduce((a, b) => a + b, 0);
    let x = pad;
    bank.forEach((e, i) => {
      const w = (100 - pad * 2 - gap * (bank.length - 1)) * (weights[i] / total);
      // single bank: rooms on top, corridor along the bottom (an entrance hall)
      const y = bi === 0 ? pad : pad + bankH + CORRIDOR;
      out.push({ e, rect: { x, y, w, h: bankH } });
      x += w + gap;
    });
  });
  return out;
}
// the corridor band's rect (between the banks / along the bottom) for rendering
export function corridorRect(items: EntityDto[]): Rect {
  const pad = 5;
  const banks = items.length >= 4 ? 2 : 1;
  const bankH = (100 - pad * 2 - CORRIDOR) / banks;
  return { x: pad, y: pad + bankH, w: 100 - pad * 2, h: CORRIDOR };
}

// The center point of a rect (for placing an occupant pawn / gliding).
export function center(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
