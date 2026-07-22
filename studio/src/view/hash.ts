// Deterministic scatter for ANY renderer over the engine: a stable hash →
// [0,1), seeded by entity id + salt. Same inputs, same result, forever — the
// render-layer counterpart of the engine's seeded RNG. Never use Math.random()
// in a view; everything visual that varies must vary BY id.
export function h(id: number, salt = 0): number {
  let z = (id * 2654435761 + salt * 40503 + 0x9e3779b9) >>> 0;
  z ^= z >>> 15; z = Math.imul(z, 0x85ebca6b) >>> 0;
  z ^= z >>> 13; z = Math.imul(z, 0xc2b2ae35) >>> 0;
  z ^= z >>> 16;
  return (z >>> 0) / 4294967296;
}
