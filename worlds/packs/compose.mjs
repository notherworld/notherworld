#!/usr/bin/env node
// compose.mjs — the pack composer. A GAME = packs + aliases + glue, nothing else.
//
// Packs are world-JSON fragments authored in GENERIC vocabulary (arena/beast/actor).
// A manifest instantiates them: aliases rename the kinds (arena→glade, beast→deer),
// arrays concatenate in pack order, and `extra` holds the game's own glue (its win
// condition flavor, extra actions, whatever). The output is a PLAIN world file the
// engine loads like any other — the engine never learns packs exist. Composition
// is an AUTHORING-layer concept, exactly like carved_plot_lots templates.
//
// Usage: node worlds/packs/compose.mjs worlds/packs/hunt.manifest.json worlds/hunt2.json

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [manifestPath, outPath] = process.argv.slice(2);
if (!manifestPath || !outPath) {
  console.error('usage: compose.mjs <manifest.json> <out-world.json>');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const here = dirname(manifestPath);
const aliases = manifest.aliases ?? {};
const SECTIONS = ['generators', 'rules', 'rollups', 'broadcasts', 'actions', 'events'];

// alias a kind name wherever kinds live: on/spawn/parent fields, and ":kind"
// references inside effect stat strings ("quarry:beast" → "quarry:deer",
// "quarry:beast@max:..." keeps its pick suffix untouched)
function aliasKind(k) { return aliases[k] ?? k; }
function aliasStatRef(s) {
  // only edge-target refs contain a kind: "edge:kind" or "edge:kind@pick..."
  const m = s.match(/^([^:@]+):([^:@]+)(@.*)?$/);
  if (!m) return s;
  return `${m[1]}:${aliasKind(m[2])}${m[3] ?? ''}`;
}
function aliasEntry(e) {
  const out = { ...e };
  if (out.on) out.on = aliasKind(out.on);
  if (out.spawn) out.spawn = aliasKind(out.spawn);
  if (out.parent) out.parent = aliasKind(out.parent);
  if (out.effects) out.effects = out.effects.map((f) =>
    f.stat && (f.op === 'link' || f.op === 'claim') ? { ...f, stat: aliasStatRef(f.stat) } : f);
  if (out.do) out.do = out.do.map((f) =>
    f.stat && (f.op === 'link' || f.op === 'claim') ? { ...f, stat: aliasStatRef(f.stat) } : f);
  return out;
}

const world = { _note: manifest._note ?? `composed from packs: ${manifest.packs.join(', ')}` };
if (manifest.rng_seed !== undefined) world.rng_seed = manifest.rng_seed;
world.seed = manifest.seed; // the manifest owns the root scope + starting stats
for (const s of SECTIONS) world[s] = [];

const provided = [];
for (const packName of manifest.packs) {
  const pack = JSON.parse(readFileSync(join(here, `${packName}.json`), 'utf8'));
  if (pack._contract?.provides) provided.push(...pack._contract.provides.map((p) => `${packName}: ${p}`));
  for (const s of SECTIONS) {
    for (const e of pack[s] ?? []) world[s].push(aliasEntry(e));
  }
}
// the game's own glue (already in FINAL vocabulary, not generic)
for (const s of SECTIONS) {
  for (const e of manifest.extra?.[s] ?? []) world[s].push(e);
}
for (const s of SECTIONS) if (!world[s].length) delete world[s];

writeFileSync(outPath, JSON.stringify(world, null, 2) + '\n');
console.log(`composed ${outPath} from ${manifest.packs.length} packs`);
for (const p of provided) console.log(`  · ${p}`);
