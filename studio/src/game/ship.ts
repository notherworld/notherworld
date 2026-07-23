// ── THE SHIP — the player's equipment layer (FEATURES §7: "build once, unlocks
// scanner-fidelity, gas-giant hover, catch-rig, difficulty"). DETERMINISM-SAFE BY
// DESIGN: ship stats gate ACCESS and distort INSTRUMENTS; they never change a
// world's laws. The universe is identical for every player — what differs is how
// truly you can read it (scanner), where you can physically go (thrusters), and
// how well you can act when you get there (capture rig).
//
// PERSISTENCE follows the charter/discovered pattern: one localStorage key, read
// at boot, written on change. The HOSTED swap (server-owned ship + economy) is a
// storage swap, not a redesign — same shape as the discovery canon.
//
// THE ECONOMY: catches earn ⬡ data, scaled by species rarity — the taxonomy layer
// (design/creature.ts speciesRarity) is the price list. First-discoveries pay a
// premium, so the discovery game IS the progression game: rarer finds → better
// instruments → truer readings + deeper access → rarer finds.

import { SCANNER_FIDELITY } from '../view/facts';

export interface Ship {
  data: number;      // ⬡ data — the currency, earned by documenting life
  scanner: number;   // tier index into SCANNER_TIERS
  hover: number;     // tier index into HOVER_TIERS
  rig: number;       // tier index into RIG_TIERS
}

export interface Tier { name: string; cost: number; value: number; blurb: string }

// ── SCANNER — fidelity per tier. ⚠ MONOTONICITY (facts.ts invariant): these are
// THRESHOLDS against the same fixed roll h(seed,918), so each tier's lying set is
// a strict subset of the tier below — an upgrade clears lies, never mints new
// ones. Tier 0 value MUST equal facts.ts SCANNER_FIDELITY (imported, not copied).
export const SCANNER_TIERS: Tier[] = [
  { name: 'stock scanner', cost: 0, value: SCANNER_FIDELITY, blurb: '~1.5% of readings silently lie' },
  { name: 'tuned array', cost: 400, value: 0.995, blurb: 'lies drop to ~0.5% — re-scan old worlds' },
  { name: 'deep resolver', cost: 1600, value: 0.999, blurb: '~0.1% — almost every reading is true' },
  { name: 'truthsight lattice', cost: 6400, value: 1.0, blurb: 'the instrument never lies again' },
];

// ── THRUSTERS — hover rating vs a giant's storm gravity (facts.ts giantGravity,
// 0.55–1.0). If your hover can't out-hold the gravity you can't descend: the
// storm layer is a TRAVERSAL gate, and the aerial biome behind it stays latent.
export const HOVER_TIERS: Tier[] = [
  { name: 'landing thrusters', cost: 0, value: 0, blurb: 'rocky worlds and moons only' },
  { name: 'storm skids', cost: 600, value: 0.72, blurb: 'descend into the calmer giants' },
  { name: 'pressure keel', cost: 2400, value: 0.88, blurb: 'most storm layers open up' },
  { name: 'deepwind anchor', cost: 9000, value: 1.01, blurb: 'no gravity refuses you' },
];

// ── CAPTURE RIG — flat bonus added to p(catch) on terra. Softens shyness and
// rarity; never reaches certainty (a legendary still fights you).
export const RIG_TIERS: Tier[] = [
  { name: 'bare hands', cost: 0, value: 0, blurb: 'catching is what it is' },
  { name: 'weighted net', cost: 300, value: 0.08, blurb: '+8% on every attempt' },
  { name: 'lure kit', cost: 1200, value: 0.16, blurb: '+16% — the shy come closer' },
  { name: 'stasis snare', cost: 4800, value: 0.25, blurb: '+25% — even legendaries hesitate' },
];

export type Track = 'scanner' | 'hover' | 'rig';
export const TRACKS: Record<Track, { label: string; icon: string; tiers: Tier[] }> = {
  scanner: { label: 'scanner', icon: '📡', tiers: SCANNER_TIERS },
  hover: { label: 'thrusters', icon: '🜂', tiers: HOVER_TIERS },
  rig: { label: 'capture rig', icon: '⌖', tiers: RIG_TIERS },
};

export const SHIP_KEY = 'nother_ship';
const DEFAULT: Ship = { data: 0, scanner: 0, hover: 0, rig: 0 };
export function loadShip(): Ship {
  try {
    const raw = localStorage.getItem(SHIP_KEY);
    if (!raw) return { ...DEFAULT };
    const s = JSON.parse(raw) as Partial<Ship>;
    const t = (v: unknown, hi: number) => Math.max(0, Math.min(hi, Math.round(Number(v) || 0)));
    return {
      data: Math.max(0, Number(s.data) || 0),
      scanner: t(s.scanner, SCANNER_TIERS.length - 1),
      hover: t(s.hover, HOVER_TIERS.length - 1),
      rig: t(s.rig, RIG_TIERS.length - 1),
    };
  } catch { return { ...DEFAULT }; }
}
export function saveShip(s: Ship): void {
  try { localStorage.setItem(SHIP_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export const fidelityOf = (s: Ship): number => SCANNER_TIERS[s.scanner].value;
export const hoverOf = (s: Ship): number => HOVER_TIERS[s.hover].value;
export const rigBonusOf = (s: Ship): number => RIG_TIERS[s.rig].value;

// ── PAYOUTS — rarity is the price list (tier names from design/creature.ts
// speciesRarity). First-species is the finite, exhaustible "oh snap" → premium;
// first-breed is the collecting layer → modest bonus.
const CATCH_PAY: Record<string, number> = {
  common: 5, uncommon: 12, rare: 30, 'very rare': 75, legendary: 200,
};
export function earnForCatch(rarityTier: string, firstSpecies: boolean, firstBreed: boolean): number {
  return (CATCH_PAY[rarityTier] ?? 5) + (firstSpecies ? 150 : 0) + (firstBreed && !firstSpecies ? 25 : 0);
}

// buy the NEXT tier on a track; mutates + persists on success.
export function tryUpgrade(s: Ship, track: Track): boolean {
  const tiers = TRACKS[track].tiers;
  const next = s[track] + 1;
  if (next >= tiers.length || s.data < tiers[next].cost) return false;
  s.data -= tiers[next].cost;
  s[track] = next;
  saveShip(s);
  return true;
}
