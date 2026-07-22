// ── DETERMINISTIC LEXICON — the shared naming/flavor kit for every zoom level.
//
// Same (seed, salt) → same word, for every visitor, forever. This is the thesis at
// the text layer: a coordinate reads identically to two people who never met. Every
// level (multiverse cell, galaxy, star, place, person) draws its words from HERE so
// the whole thing feels like one authored voice — and so we only grow ONE word list.
//
// EXPAND FREELY: add entries to a table, or add a new named table + a compose recipe.
// The only rule that matters: NEVER reorder or delete existing entries in a shipped
// table — an address's words are picked by `floor(rnd * len)`, so changing length or
// order re-rolls every existing universe's name. Append to the end only.

import { h } from './hash';

export type WordTable = readonly string[];
export type Lexicon = Record<string, WordTable>;

// Draw one entry from a table by a salted deterministic roll on `seed` (view/hash `h`).
export const pickWord = (table: WordTable, seed: number, salt: number): string =>
  table[Math.floor(h(seed, salt) * table.length)];

// The tables. Grouped loosely; a level uses whichever fit its voice.
export const WORDS = {
  // temporal / life-stage qualifiers ("a young …", "an ancient …")
  age: [
    'a young', 'an ancient', 'a dying', 'a newborn', 'a restless', 'a dreaming',
    'a fevered', 'a patient', 'a forgotten', 'a becoming', 'a sleeping', 'a first-lit',
  ],
  // material / elemental adjectives — the "species" of a thing
  species: [
    'spiral', 'ember', 'brine', 'lattice', 'hollow', 'verdant', 'glass', 'iron',
    'coral', 'ash', 'tidal', 'clockwork', 'moth', 'salt', 'amber', 'thorn',
    'cinder', 'mirror', 'velvet', 'basalt',
  ],
  // the noun a place/expanse IS
  expanse: [
    'cosmos', 'expanse', 'reach', 'deep', 'weave', 'bloom', 'drift', 'chorus',
    'furnace', 'garden', 'archive', 'tide', 'engine', 'hush', 'sprawl', 'lattice',
  ],
  // a defining trait clause — the line that makes each one feel authored
  trait: [
    'spun from one long noon', 'where the stars run backwards', 'thick with unnamed moons',
    'that hums when observed', 'still cooling from its birth', 'lousy with quiet gods',
    'folded in on itself', 'where gravity forgets', 'salted with dead suns',
    'greening at the edges', 'that dreams of the others', 'wound too tight',
    'endlessly raining light', 'holding one held breath', 'with a warm, arterial glow',
    'that has never been read', 'where noon never came', 'run through with old song',
  ],
  // syllables for composing coined proper names (a galaxy / star / place)
  onset: ['vel', 'mor', 'ash', 'kai', 'ther', 'oss', 'ryn', 'lune', 'cael', 'dru', 'sev', 'ith'],
  coda: ['ara', 'is', 'oth', 'une', 'yr', 'en', 'os', 'ael', 'ith', 'or', 'ne', 'ux'],
} satisfies Lexicon;

// ── COMPOSE RECIPES — one per "thing that needs a name/description". Add as levels grow.

// Multiverse cell: a two-line flavor blurb. "a young spiral cosmos, / where gravity forgets"
export function describeUniverse(seed: number): string {
  return `${pickWord(WORDS.age, seed, 301)} ${pickWord(WORDS.species, seed, 302)} ${pickWord(WORDS.expanse, seed, 303)},\n  ${pickWord(WORDS.trait, seed, 304)}`;
}

// A coined proper name — syllable-composed, Title-cased. For galaxies/stars/places inside a universe.
export function properName(seed: number, salt = 0): string {
  const a = pickWord(WORDS.onset, seed, 401 + salt), b = pickWord(WORDS.coda, seed, 402 + salt);
  const name = a + b;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Galaxy: a named rung of the address ladder. "Velara — an ember bloom, wound too tight"
export function describeGalaxy(seed: number): string {
  return `${pickWord(WORDS.species, seed, 501)} ${pickWord(WORDS.expanse, seed, 502)},\n  ${pickWord(WORDS.trait, seed, 503)}`;
}

// Supercluster: the cosmic-web rung above galaxies. Distinct salts, same voice.
export function describeSuper(seed: number): string {
  return `${pickWord(WORDS.species, seed, 551)} ${pickWord(WORDS.expanse, seed, 552)},\n  ${pickWord(WORDS.trait, seed, 553)}`;
}
