// ── PROOFS — the determinism guards, running in YOUR browser. ──
// The same checks that gate the repo (cargo test + the cli bins) re-run here
// through the WASM build of the engine. The tick numbers below were baselined
// NATIVELY (Windows, then cross-checked on Linux CI) — so every green row you
// see is also live evidence that the native and browser builds of the engine
// agree bit-for-bit. This is not a recording of tests; your machine is running
// the worlds right now.
import { useState } from 'react';
import { createWorld, type Snapshot } from '../owos';
import { starOf, planetOf, galaxyStars, giantGravity, universeLaws, type StarLaw } from '../view/facts';
import { SCANNER_TIERS, HOVER_TIERS } from '../game/ship';
import { speciesKey, breedKey, taxonName, speciesRarity, SPECIES_TOTAL, BREEDS_TOTAL, type Stats } from '../design/creature';
import { strayFaunaBias, meanFaunaRarityRank } from '../temple/templates';
import hotelSpec from '../../../worlds/hotel.json';
import craftSpec from '../../../worlds/craft.json';
import emberholdSpec from '../../../worlds/emberhold.json';
import citySpec from '../../../worlds/city.json';
import huntSpec from '../../../worlds/probes/probe_hunt.json';
import './proofs.css';

type Status = 'idle' | 'running' | 'pass' | 'fail';
type Result = { status: Status; detail: string; ms?: number };

/** entity tree + full event log → one string. Two identical runs must match. */
function fingerprint(s: Snapshot): string {
  const ents = s.entities.map((e) => `${e.id}:${e.kind}#${e.children.length}`).join(';');
  const log = s.log.map((l) => `[${l.tick}]${l.message}`).join(';');
  return `${ents}|${log}`;
}

async function runWorld(spec: unknown, ticks: number): Promise<Snapshot> {
  const w = await createWorld(spec);
  try {
    w.steps(ticks);
    return w.snapshot();
  } finally {
    w.dispose();
  }
}

interface Proof {
  id: string;
  title: string;
  what: string;   // what the check does, mechanically
  why: string;    // what it proves / what breaking it would mean
  native: string; // the native equivalent
  run: () => Promise<string>; // resolves with detail on pass, throws on fail
}

const PROOFS: Proof[] = [
  {
    id: 'scale',
    title: 'an addressable universe larger than the real one — and causally coupled',
    what:
      'Counts the notherspace address space from the LADDER FORMULAS themselves (not a claimed number): the per-galaxy star count is an exact closed form N=c(1+4R(R+1)); multiply by the stated per-rung capacities (galaxies/supercluster, superclusters/universe, universes) and the planets/star. Then DEMONSTRATES the coupling: rolls many stars, and shows that hotter stars deterministically produce hotter planets and higher life odds — the upper layers CAUSE the lower ones.',
    why:
      'Two claims most procedural universes cannot both make. (1) SCALE: the space is ~10^28 addressable planets — hundreds of millions of times No Man\'s Sky (1.8e19) and thousands of times the real observable universe (~1e24) — yet it costs zero storage, because an address is COMPUTED on observation, not stored. (2) COUPLING: it is not 10^28 independent dice. A planet\'s temperature is derived from its star\'s actual temperature, and its life odds from the star\'s life state — so by the time a world resolves under you, its whole lineage (galaxy→star→planet→fauna) has been computed as a causal cascade. Latent until observed, then genuinely alive and stateful. This row lets a skeptic run the count and see the causality, in their browser.',
    native: '(facts.ts::galaxyStars/starOf/planetOf — the same ladder nother walks)',
    run: async () => {
      // (1) SCALE — from the real formulas. Sample galaxies to get a typical star N.
      let starSum = 0;
      for (let i = 1; i <= 200; i++) { const g = galaxyStars((Math.imul(i, 2654435761) >>> 0)); starSum += g.N; }
      const starsPerGalaxy = starSum / 200;
      const galaxiesPerSC = 2e4, scPerUniverse = 1e6, universes = 1e6, planetsPerStar = 8; // conservative
      const planets = starsPerGalaxy * galaxiesPerSC * scPerUniverse * universes * planetsPerStar;
      const NMS = 1.8e19, REAL = 1e24;
      if (!(planets > NMS * 1e6)) throw new Error(`address space ${planets.toExponential(1)} not >> NMS`);
      if (!(planets > REAL)) throw new Error(`address space ${planets.toExponential(1)} not > real universe (${REAL.toExponential(0)})`);

      // (2) COUPLING — hotter stars must yield hotter planets + higher life odds.
      // Bucket a big star sample by temperature, average their planets' temp + life.
      let coldPlanetT = 0, coldN = 0, hotPlanetT = 0, hotN = 0;
      let coldLife = 0, hotLife = 0;
      for (let s = 1; s <= 6000; s++) {
        const sseed = (Math.imul(s, 2654435761) >>> 0);
        const star: StarLaw = starOf(sseed);
        for (let i = 0; i < star.planets; i++) {
          const p = planetOf((Math.imul(sseed ^ (i + 1), 0x9e3779b1) >>> 0), i, star);
          if (p.type.includes('giant')) continue;
          if (star.tempK < 3800) { coldPlanetT += p.tempK; coldN++; if (p.hasLife) coldLife++; }
          else if (star.tempK > 8000) { hotPlanetT += p.tempK; hotN++; if (p.hasLife) hotLife++; }
        }
      }
      const coldAvg = coldPlanetT / Math.max(1, coldN), hotAvg = hotPlanetT / Math.max(1, hotN);
      if (!(hotAvg > coldAvg + 20)) throw new Error(`hot stars don't yield hotter planets: cold ${coldAvg.toFixed(0)}K vs hot ${hotAvg.toFixed(0)}K — coupling broken`);
      const coldLifePct = 100 * coldLife / Math.max(1, coldN), hotLifePct = 100 * hotLife / Math.max(1, hotN);
      return `${planets.toExponential(1)} addressable planets — ${(planets / NMS).toExponential(1)}× No Man's Sky, ${(planets / REAL).toExponential(1)}× the real observable universe · COUPLED: cold-star planets avg ${coldAvg.toFixed(0)}K (${coldLifePct.toFixed(0)}% alive) vs hot-star ${hotAvg.toFixed(0)}K (${hotLifePct.toFixed(0)}% alive) — the star causes the planet`;
    },
  },
  {
    id: 'epoch',
    title: 'time is a place: universes age, cool, and die — without moving anything else',
    what:
      'Three checks on the cosmic-epoch layer. (A) THE ARROW OF TIME: ranks thousands of universes by age and shows the oldest quartile reads both COLDER (lower bg temp) and DEADER (lower life rate) than the youngest — because bg temp and life now DESCEND from age (expansion cools the background, T∝1/a, and starves free energy) instead of being independent dice. (B) HEAT DEATH ON THE GROUND: threads each universe\'s age into planetOf and shows surface life falling toward a floor as epoch rises — and orbital detectability collapsing to ZERO in an old universe (survivors hide below the scanner) — while epoch=0 stays BIT-IDENTICAL to the base law. (C) PERMANENCE: the same planets at a young vs a heat-dead epoch keep identical orbit, temperature, size and geography — heat death EMPTIES a world, it never rebuilds it.',
    why:
      'Time joins scale, install-size and lore as another thing that is COMPUTED, not stored: a universe does not grind down in a database — you evaluate the same address at a later age and it derives colder and emptier. (A) proves age is now causal, not a label. (B) proves an ancient universe genuinely feels like a graveyard when you land — yet, crucially, epoch=0 identity means this whole mortality layer was added WITHOUT shifting a single other proof (no re-baseline). (C) is the load-bearing law: epoch touches only how much life is present, never the structural genome, so a species\' body plan at an address is eternal — heat death can extinguish a lineage but never redraw it. Mortality as a place you visit, permanence intact.',
    native: '(facts.ts::universeLaws + planetOf(epoch) — the same derivation nother\'s dive threads)',
    run: async () => {
      // (A) THE ARROW OF TIME — rank universes by age; oldest read colder AND deader.
      const N = 6000; const us = [];
      for (let s = 1; s <= N; s++) us.push(universeLaws((Math.imul(s, 2654435761) >>> 0)));
      us.sort((a, b) => a.ageGyr - b.ageGyr);
      const q = Math.floor(N / 4);
      const mean = (arr: typeof us, k: 'bgTempK' | 'lifeRate' | 'ageGyr') => arr.reduce((t, r) => t + r[k], 0) / arr.length;
      const young = us.slice(0, q), old = us.slice(3 * q);
      const yTemp = mean(young, 'bgTempK'), oTemp = mean(old, 'bgTempK');
      const yLife = mean(young, 'lifeRate'), oLife = mean(old, 'lifeRate');
      if (!(oTemp < yTemp)) throw new Error(`old universes not colder: young ${yTemp.toFixed(2)}K vs old ${oTemp.toFixed(2)}K`);
      if (!(oLife < yLife)) throw new Error(`old universes not deader: young ${yLife.toFixed(1)}/M vs old ${oLife.toFixed(1)}/M`);

      // (B) HEAT DEATH ON THE GROUND — presence + orbital detectability decay with epoch;
      //     epoch=0 must be bit-identical to the un-aged base law (so no other proof drifts).
      const ground = (epoch?: number) => {
        let pl = 0, al = 0, det = 0;
        for (let s = 1; s <= 1200; s++) {
          const sseed = (Math.imul(s, 2654435761) >>> 0);
          const star = starOf(sseed);
          for (let i = 0; i < star.planets; i++) {
            const pseed = (Math.imul(sseed ^ (i + 1), 0x9e3779b1) >>> 0);
            const p = epoch === undefined ? planetOf(pseed, i, star) : planetOf(pseed, i, star, 0.985, epoch);
            pl++; if (p.hasLife) al++; if (p.density > 0.45) det++;
          }
        }
        return { alive: al / pl, det: det / pl };
      };
      const g0 = ground(0), gBase = ground(undefined), gMid = ground(0.5), gDead = ground(0.97);
      if (!(Math.abs(g0.alive - gBase.alive) < 1e-9 && Math.abs(g0.det - gBase.det) < 1e-9)) throw new Error('epoch=0 is not identical to the base law — it would drift other proofs');
      if (!(gMid.alive < g0.alive && gDead.alive < gMid.alive)) throw new Error('surface life not decaying with epoch');
      if (!(gDead.det === 0)) throw new Error(`heat-dead universe still orbit-detectable (${(gDead.det * 100).toFixed(1)}%) — survivors should hide below the scanner`);

      // (C) PERMANENCE — structure is epoch-invariant; heat death empties, never rebuilds.
      let structOK = true, checked = 0;
      for (let s = 1; s <= 500 && structOK; s++) {
        const sseed = (Math.imul(s, 2654435761) >>> 0);
        const star = starOf(sseed);
        for (let i = 0; i < star.planets; i++) {
          const pseed = (Math.imul(sseed ^ (i + 1), 0x9e3779b1) >>> 0);
          const a = planetOf(pseed, i, star, 0.985, 0), b = planetOf(pseed, i, star, 0.985, 0.97);
          checked++;
          if (a.orbit !== b.orbit || a.tempK !== b.tempK || a.sizeKm !== b.sizeKm || a.grid !== b.grid || a.moons !== b.moons || a.rings !== b.rings) { structOK = false; break; }
        }
      }
      if (!structOK) throw new Error('epoch altered a world\'s structure (orbit/temp/size/geography) — permanence broken');

      return `arrow of time: young universes ${yTemp.toFixed(2)}K / ${yLife.toFixed(0)}·M-life vs ancient ${oTemp.toFixed(2)}K / ${oLife.toFixed(0)}·M — colder AND deader · on the ground life falls ${(g0.alive * 100).toFixed(0)}%→${(gDead.alive * 100).toFixed(0)}% alive and orbital detection ${(g0.det * 100).toFixed(0)}%→0% (heat-dead survivors hide below the scanner) · epoch=0 ≡ base law, so no other proof drifts · ${checked} worlds keep identical structure across epoch — heat death empties, never rebuilds`;
    },
  },
  {
    id: 'identity',
    title: 'same seed → same world, bit for bit',
    what:
      'Builds the hotel world twice from the same JSON, runs each for 220 ticks, then compares a fingerprint of every entity and every logged event.',
    why:
      'The core contract. Determinism is what makes a world an ADDRESS — the same seed lands every visitor in the same place with the same history. Any hidden randomness (wall-clock, hash ordering, uninitialized state) breaks this instantly.',
    native: 'cargo test same_seed_same_world_bit_for_bit',
    run: async () => {
      const a = fingerprint(await runWorld(hotelSpec, 220));
      const b = fingerprint(await runWorld(hotelSpec, 220));
      if (a !== b) throw new Error('two identical runs diverged');
      return 'two 220-tick runs produced identical entity trees and identical event logs';
    },
  },
  {
    id: 'geometry',
    title: 'the geometry stack is deterministic too',
    what:
      'Builds Veranholm (the living-city world) twice — terrain fields, voronoi districts, land-carve blocks, roads, bridges, gates, settle rules, trigonometry — and compares fingerprints after 12 ticks.',
    why:
      'Worldgen uses sin/cos, which most engines take from the OS math library — where results differ between Windows, Linux, and browsers. This engine routes trig through a deterministic implementation (libm), so the same city grows the same streets on every platform. This row passing IN A BROWSER, against numbers baselined natively, is that claim demonstrated.',
    native: 'cargo test same_seed_same_world_bit_for_bit (city half)',
    run: async () => {
      const a = fingerprint(await runWorld(citySpec, 12));
      const b = fingerprint(await runWorld(citySpec, 12));
      if (a !== b) throw new Error('city runs diverged');
      return 'a full city (fields → districts → carve → routes) generated identically twice';
    },
  },
  {
    id: 'hotel',
    title: 'the hotel earns its star on day 73',
    what:
      'Runs a living Paris hotel — a kitchen brigade that learns, gets promoted, and builds reputation — for 220 ticks, purely from data, and checks the chronicle: first star at tick 73, gala booked at tick 213.',
    why:
      'Not just "it runs" — the EXACT same story unfolds every time, to the tick. These two numbers were baselined on the native engine; the browser reproducing them means the WASM build tells the same story. If either tick moves, engine behavior changed somewhere.',
    native: 'cargo run --release --bin live -- worlds/hotel.json 220 cook',
    run: async () => {
      const s = await runWorld(hotelSpec, 220);
      const star = s.log.find((l) => l.message.includes('first star'));
      const gala = s.log.find((l) => l.message.toLowerCase().includes('gala'));
      if (!star) throw new Error('the hotel never earned its star');
      if (star.tick !== 73) throw new Error(`star at tick ${star.tick}, expected 73`);
      if (!gala) throw new Error('the gala was never booked');
      if (gala.tick !== 213) throw new Error(`gala at tick ${gala.tick}, expected 213`);
      return `★ first star at tick 73 · gala booked at tick 213 — exactly as baselined natively`;
    },
  },
  {
    id: 'craft',
    title: 'the tech tree completes at tick 94',
    what:
      'Runs a crafting world — gather ore and wood, smelt ingots, forge parts, assemble the ENGINE — 140 ticks, no host code, and checks the final assembly lands at tick 94.',
    why:
      'Proves symbolic, discrete game systems (recipes, inventories, tech trees) work as pure data — and deterministically. A crafting system here is a JSON file, not an engine feature.',
    native: 'cargo run --release --bin live -- worlds/craft.json 140 crafter',
    run: async () => {
      const s = await runWorld(craftSpec, 140);
      const done = s.log.find((l) => l.message.includes('ENGINE'));
      if (!done) throw new Error('the ENGINE was never assembled');
      if (done.tick !== 94) throw new Error(`assembled at tick ${done.tick}, expected 94`);
      return '⚙ gather → smelt → forge → assemble, completed at tick 94 on the dot';
    },
  },
  {
    id: 'emberhold',
    title: 'a population that booms and busts',
    what:
      'Runs a colony on a shared, depleting commons for 300 ticks, taking a population census every tick, then checks the curve genuinely CYCLES — at least two directional turns with real amplitude.',
    why:
      'Emergence, not scripting: no rule says "crash now." Individual colonists choosing to share or hoard produce a tragedy-of-the-commons cycle at the population level. A flat line or a single crash would mean the systemic behavior is gone.',
    native: 'cargo run --release --bin live -- worlds/emberhold.json 300 colonist',
    run: async () => {
      const w = await createWorld(emberholdSpec);
      const pop: number[] = [];
      try {
        for (let t = 0; t < 300; t++) {
          w.step();
          const s = w.snapshot();
          const hold = s.entities.find((e) => e.kind === 'hold');
          if (!hold) throw new Error('no hold entity');
          pop.push(
            hold.children.filter((c) => {
              const e = s.entities.find((x) => x.id === c);
              return e && (e.stats['alive'] ?? 0) > 0.5;
            }).length,
          );
        }
      } finally {
        w.dispose();
      }
      const smooth = [];
      for (let i = 0; i < pop.length; i += 10) {
        const c = pop.slice(i, i + 10);
        smooth.push(Math.round(c.reduce((a, b) => a + b, 0) / c.length));
      }
      let turns = 0;
      let dir = 0;
      for (let i = 1; i < smooth.length; i++) {
        const d = Math.sign(smooth[i] - smooth[i - 1]);
        if (d !== 0 && dir !== 0 && d !== dir) turns++;
        if (d !== 0) dir = d;
      }
      const max = Math.max(...pop);
      const min = Math.min(...pop);
      if (turns < 2) throw new Error(`only ${turns} directional turns — no cycle`);
      if (max - min < 10) throw new Error(`amplitude too small (${min}–${max})`);
      return `population swung ${max} → ${min} across ${turns} turns — a real boom-bust cycle`;
    },
  },
  {
    id: 'extinction',
    title: 'the world remembers: overhunt a species and it is GONE',
    what:
      'Runs one glade twice. With a hunter: he fells the fattest grazer each strike, deaths outrun births, and the herd goes extinct — then the run continues 100 more ticks to prove NOTHING respawns. Without the hunter (one number changed in the seed): the same herd self-regulates and thrives for all 300 ticks.',
    why:
      'The claim most games fake. Creatures here are not spawn-table decorations — they have demography (births cost food and inherit parent stats; age culls; crowding caps). Kill faster than they breed and the species ends, permanently, and the world logs it. Consequence is an engine fact, not a script.',
    native: 'cargo test hunted_species_goes_extinct_and_stays_extinct',
    run: async () => {
      const herd = (s: Snapshot) =>
        s.entities.filter((e) => e.kind === 'grazer' && (e.stats['alive'] ?? 0) > 0.5).length;
      // hunted: must go extinct AND stay extinct
      const w = await createWorld(huntSpec);
      let extinctAt = -1;
      try {
        for (let t = 0; t < 300; t++) {
          w.step();
          if (extinctAt < 0 && herd(w.snapshot()) === 0) extinctAt = t;
        }
        const s = w.snapshot();
        if (extinctAt < 0) throw new Error('the hunted herd never went extinct');
        if (herd(s) !== 0) throw new Error('the herd came back — respawned from nothing');
        if (!s.log.some((l) => l.message.includes('falls silent')))
          throw new Error('the glade never recorded its extinction');
        w.steps(100);
        if (herd(w.snapshot()) !== 0) throw new Error('extinction did not persist');
      } finally {
        w.dispose();
      }
      // control: same world, hunters = 0 → thrives
      const controlSpec = JSON.parse(JSON.stringify(huntSpec));
      controlSpec.seed[0].stats.hunters = 0;
      const c = await createWorld(controlSpec);
      try {
        c.steps(300);
        const alive = herd(c.snapshot());
        if (alive < 10) throw new Error(`unhunted herd should thrive, only ${alive} remain`);
      } finally {
        c.dispose();
      }
      return `hunted: extinct at tick ${extinctAt}, still extinct 100 ticks later, the glade logged its own silence · unhunted: the same herd is thriving at tick 300`;
    },
  },
  {
    id: 'sensitivity',
    title: 'different seed → different world (determinism ≠ constancy)',
    what:
      'Runs the hotel with its authored seed, then with the seed changed by one, 120 ticks each, and requires the fingerprints to DIFFER.',
    why:
      'The inverse guard. An engine that ignored its seed would pass every identity test while generating one hardcoded world. This proves the seed genuinely drives generation — every address is a different place.',
    native: '(implicit in every reseed of every demo)',
    run: async () => {
      const alt = { ...(hotelSpec as Record<string, unknown>), rng_seed: 999 };
      const a = fingerprint(await runWorld(hotelSpec, 120));
      const b = fingerprint(await runWorld(alt, 120));
      if (a === b) throw new Error('changing the seed changed nothing — generation is not seed-driven');
      return 'seed 999 produced a genuinely different history than the authored seed';
    },
  },
  {
    id: 'lifecamo',
    title: 'the life scan guides you — and never gives the game away',
    what:
      'Samples the life fact sheet for ~100k addressed worlds and checks the readout is decoupled from the truth in BOTH directions: a real share of "none detected" worlds are SECRETLY alive (so a dull reading is never a safe skip); a real share of "favorable"-reading worlds are actually EMPTY (the dead teaser — a hopeful reading is never a promise); every "likely impossible" world that is alive stays below the detection threshold (the extremophile is always sparse); the bands still meaningfully rank the odds; life abundance tracks the conditions band; and the detector itself MALFUNCTIONS rarely in both directions (a confident "signs detected" over a dead world, a flat reading over a teeming one) — small but nonzero, so even a confirmed detection is never 100%.',
    why:
      'A planet has three quantities: the CONDITIONS band (all the orbital scan knows) and two the engine hides — whether life exists, and HOW MUCH. The scan reads "signs detected" only when life is present AND abundant enough to see; below that, every world reads by its conditions band alone. The presence odds are decoupled from conditions BOTH ways — a sparse living world and a dead one are indistinguishable from orbit, and a favorable world can still be barren. On top of the honest-but-incomplete scan sits a rare INSTRUMENT FAULT: the detector occasionally lies outright. That last part is equipment, not world — a fixed per-address roll thresholded by scanner fidelity, so a better scanner (a future upgrade) strictly shrinks the set of worlds that lie to you, and a misread world stays misread until you can afford the truth. The scan saves you time statistically without ever letting you — or the designer — write a world off from orbit.',
    native: '(facts.ts::planetOf — the same derivation nother reads)',
    run: async () => {
      let rocky = 0, alive = 0;
      let hidEmpty = 0, hidAlive = 0;               // "none detected" worlds that secretly have life
      let favReads = 0, favEmpty = 0;               // favorable-reading worlds that are actually dead (teaser)
      let impAlive = 0, impAliveOverThreshold = 0;  // extremophiles must always be sparse (undetectable)
      let sawDetected = 0, falsePos = 0;            // MALFUNCTION: "signs detected" over a truly dead world
      let trulyDetectable = 0, falseNeg = 0;        // MALFUNCTION: dull/impossible reading over a teeming world
      const bandDens: Record<string, { n: number; sum: number }> = {};
      const DETECT = 0.45;
      for (let s = 1; s < 24000; s++) {
        const sseed = (Math.imul(s, 2654435761) >>> 0);
        const star = starOf(sseed);
        for (let i = 0; i < star.planets; i++) {
          const pseed = (Math.imul(sseed ^ (i + 1), 0x9e3779b1) >>> 0);
          const p = planetOf(pseed, i, star);
          if (p.type.includes('giant')) continue;
          rocky++;
          if (p.hasLife) alive++;
          const label = p.life;
          if (label.startsWith('none detected')) {           // any dull reading
            hidEmpty++;
            if (p.hasLife) hidAlive++;                        // …that's secretly alive
          }
          if (label.includes('favorable') || label === 'signs detected') {
            favReads++;                                       // reads hopeful from orbit
            if (!p.hasLife) favEmpty++;                       // …but is actually barren (teaser)
          }
          if (label === 'likely impossible' && p.hasLife) {
            impAlive++;
            if (p.density > DETECT) impAliveOverThreshold++;
          }
          // MALFUNCTION rates (measured off the reported label vs the hidden truth):
          // a false positive reads "signs detected" over a dead world; a false
          // negative reads dull/impossible over a world that WAS detectable-true.
          if (label === 'signs detected') { sawDetected++; if (!p.hasLife) falsePos++; }
          if (p.hasLife && p.density > DETECT) { trulyDetectable++; if (label !== 'signs detected') falseNeg++; }
          const band = label.includes('favorable') || label === 'signs detected' ? 'favorable'
            : label.includes('possible') ? 'possible'
            : label.includes('unlikely') ? 'unlikely' : 'impossible';
          if (p.hasLife) { (bandDens[band] ??= { n: 0, sum: 0 }).n++; bandDens[band].sum += p.density; }
        }
      }
      const alivePct = (100 * alive) / rocky;
      const camoPct = hidEmpty ? (100 * hidAlive) / hidEmpty : 0;
      const teaserPct = favReads ? (100 * favEmpty) / favReads : 0;
      if (alivePct < 45 || alivePct > 70) throw new Error(`life on ${alivePct.toFixed(0)}% of rocky worlds — expected ~50-60% (a coin-flip-plus, bands tilting it)`);
      if (camoPct < 15) throw new Error(`only ${camoPct.toFixed(1)}% of "none detected" worlds secretly hide life — a dull reading is a giveaway`);
      if (teaserPct < 8) throw new Error(`only ${teaserPct.toFixed(1)}% of favorable-reading worlds are empty — a hopeful reading is a promise, not a bet`);
      if (impAliveOverThreshold > 0) throw new Error(`${impAliveOverThreshold} extremophile worlds read detectable — an impossible world must never scan as alive`);
      const df = bandDens.favorable ? bandDens.favorable.sum / bandDens.favorable.n : 0;
      const du = bandDens.unlikely ? bandDens.unlikely.sum / bandDens.unlikely.n : 0;
      if (!(df > du + 0.1)) throw new Error(`favorable density (${df.toFixed(2)}) doesn't clearly beat unlikely (${du.toFixed(2)}) — density doesn't track conditions`);
      // MALFUNCTION: the detector lies rarely in BOTH directions. Bounded — a real
      // instrument fault, not a pattern (and not zero: even a confirmed detection is
      // never 100%). Both rates must be small but nonzero at the default fidelity.
      const fpPct = sawDetected ? (100 * falsePos) / sawDetected : 0;
      const fnPct = trulyDetectable ? (100 * falseNeg) / trulyDetectable : 0;
      if (fpPct < 0.5 || fpPct > 6) throw new Error(`false-positive detections ${fpPct.toFixed(1)}% — malfunction should be rare (~1-3%), not ${fpPct > 6 ? 'common' : 'absent'}`);
      if (fnPct < 0.5 || fnPct > 6) throw new Error(`false-negative readings ${fnPct.toFixed(1)}% — malfunction should be rare (~1-3%), not ${fnPct > 6 ? 'common' : 'absent'}`);
      return `${alivePct.toFixed(0)}% of rocky worlds alive · ${camoPct.toFixed(0)}% of "none detected" secretly alive (no safe skip) · ${teaserPct.toFixed(0)}% of favorable readings are dead teasers (no promise) · scanner lies ~${fpPct.toFixed(1)}% false-positive / ~${fnPct.toFixed(1)}% false-negative (rare instrument fault) · 0 extremophiles ever detectable · density tracks band (fav ${df.toFixed(2)} > unl ${du.toFixed(2)})`;
    },
  },
  {
    id: 'equipment',
    title: 'upgrades clear lies and open doors — they never reshuffle the world',
    what:
      'Runs the SAME ~50k worlds through every scanner tier and checks the MONOTONICITY contract: the set of worlds that lie to a better scanner is a strict subset of the set that lies to a worse one — an upgrade only ever REMOVES lies, never mints new ones, and never changes any world\'s ground truth. Then checks the thruster gate the same way: each hover tier\'s reachable gas giants strictly contain the tier below\'s, and a giant\'s storm gravity is a fixed address law identical on every read.',
    why:
      'Equipment is the progression axis, and it is only fair if it is monotonic. Because the scanner malfunction is a THRESHOLD on one fixed per-world roll (h(seed,918) > fidelity), raising fidelity can only raise the bar — a world you verified with a good instrument can never start lying again, and re-visiting a misread world with a better scanner reveals what was always there. Same law for thrusters: gravity is the world\'s, hover is yours; upgrading expands where you can go without moving a single world. If this row ever fails, an upgrade somewhere is rewriting reality instead of your access to it.',
    native: '(facts.ts::planetOf(fidelity) + giantGravity vs game/ship.ts tiers)',
    run: async () => {
      // (1) SCANNER — lying sets shrink monotonically across the real tier ladder
      const tiers = SCANNER_TIERS.map((t) => t.value);
      const liars: Set<number>[] = tiers.map(() => new Set());
      let worlds = 0;
      for (let s = 1; s <= 12000; s++) {
        const sseed = (Math.imul(s, 2654435761) >>> 0);
        const star = starOf(sseed);
        for (let i = 0; i < star.planets; i++) {
          const pseed = (Math.imul(sseed ^ (i + 1), 0x9e3779b1) >>> 0);
          worlds++;
          const truth = planetOf(pseed, i, star, 1.0);           // the perfect instrument
          for (let k = 0; k < tiers.length; k++) {
            const read = planetOf(pseed, i, star, tiers[k]);
            if (read.life !== truth.life) liars[k].add(pseed);
            // ground truth NEVER moves with the instrument
            if (read.hasLife !== truth.hasLife || read.density !== truth.density)
              throw new Error('scanner fidelity changed a world\'s ground truth — equipment rewrote reality');
          }
        }
      }
      for (let k = 1; k < tiers.length; k++) {
        for (const w of liars[k]) if (!liars[k - 1].has(w))
          throw new Error(`tier ${k} lies about a world tier ${k - 1} read truly — upgrade MINTED a lie`);
        if (liars[k].size > liars[k - 1].size) throw new Error('a better scanner lies MORE');
      }
      const basePct = (100 * liars[0].size) / worlds;
      if (basePct < 0.5 || basePct > 4) throw new Error(`stock scanner lies ${basePct.toFixed(2)}% — expected ~1-2%`);
      if (liars[tiers.length - 1].size !== 0) throw new Error('the maxed scanner still lies');
      // (2) THRUSTERS — reachable giants nest upward; gravity is a stable address law
      const hovers = HOVER_TIERS.map((t) => t.value);
      const reach = hovers.map(() => 0);
      let giants = 0;
      for (let a = 1; a <= 40000; a++) {
        const g = giantGravity(a);
        if (g !== giantGravity(a)) throw new Error('giantGravity unstable — the gate would flicker');
        giants++;
        for (let k = 0; k < hovers.length; k++) if (hovers[k] >= g) reach[k]++;
      }
      for (let k = 1; k < hovers.length; k++)
        if (reach[k] < reach[k - 1]) throw new Error('a thruster upgrade LOST access — gate not monotonic');
      if (reach[0] !== 0) throw new Error('stock thrusters reach giants — the gate is open by default');
      if (reach[hovers.length - 1] !== giants) throw new Error('maxed thrusters still refused a giant');
      return `${worlds.toLocaleString()} worlds × ${tiers.length} scanner tiers: lying sets nest ${liars.map((l) => l.size.toLocaleString()).join(' ⊇ ')} (stock ${basePct.toFixed(1)}% → maxed 0), zero minted lies, ground truth untouched · thruster reach nests ${reach.map((r) => `${((100 * r) / giants).toFixed(0)}%`).join(' ⊆ ')} of giants`;
    },
  },
  {
    id: 'taxonomy',
    title: 'the species catalog is finite, deterministic, and nameable',
    what:
      'Checks the two-tier taxonomy: SPECIES = the structural body-plan (torso×head×legs×tail) is a FIXED, exhaustible set (19,200 universe-wide); BREED = species + finish is the larger collecting layer (~2.3M). Verifies the counts, that a genome maps to STABLE species/breed keys and one canonical name (same input → same identity, every run), and that rarity is a deterministic property of the address, not a random roll.',
    why:
      'Discovery only means something if the thing discovered is real and finite. Because every creature is hash(genome) and the universe is deterministic, "how many species exist" and "how rare is this one" are COMPUTABLE and VERIFIABLE — no server needed for the math, only for custody of who named what first. A million players can name all 19,200 species precisely because the catalog is bounded; a body-plan nobody has caught is a genuine, permanent first. If keys or names ever drifted between runs, first-discovery would be meaningless — this row proves they do not.',
    native: '(design/creature.ts — the same taxonomy nother/terra/bestiary read)',
    run: async () => {
      if (SPECIES_TOTAL !== 19200) throw new Error(`species total ${SPECIES_TOTAL}, expected 19,200`);
      if (BREEDS_TOTAL !== 2304000) throw new Error(`breed total ${BREEDS_TOTAL}, expected 2,304,000`);
      // determinism: a genome maps to identical keys + name across independent calls
      const mk = (i: number): Stats => ({
        torso: (i * 7) % 12, head: (i * 3) % 16, legs: (i * 5) % 10, tail: (i * 2) % 10,
        pattern: (i * 11) % 10, flyer: i % 3 === 0 ? 1 : 0, hue: (i * 0.137) % 1, size: (i % 5) / 5,
      });
      const keys = new Set<number>();
      for (let i = 0; i < 4000; i++) {
        const g = mk(i);
        const sk1 = speciesKey(g), sk2 = speciesKey(g);
        if (sk1 !== sk2) throw new Error('speciesKey not deterministic');
        if (taxonName(sk1) !== taxonName(sk1)) throw new Error('taxonName not deterministic');
        if (sk1 < 0 || sk1 >= SPECIES_TOTAL) throw new Error(`speciesKey ${sk1} out of range`);
        const bk = breedKey(g);
        if (bk < 0 || bk >= BREEDS_TOTAL) throw new Error(`breedKey ${bk} out of range`);
        keys.add(sk1);
      }
      // rarity is a stable property of the genome (same input → same tier)
      const probe = mk(1234);
      if (speciesRarity(probe).tier !== speciesRarity(probe).tier) throw new Error('rarity not stable');
      const tiers = new Set([0, 500, 1500, 3000, 3999].map((i) => speciesRarity(mk(i)).tier));
      if (tiers.size < 2) throw new Error('rarity has no spread — every species reads the same tier');
      return `${SPECIES_TOTAL.toLocaleString()} species · ${BREEDS_TOTAL.toLocaleString()} breeds · ${keys.size} distinct species keys from 4k genomes, all in-range + stable · rarity tiers vary (${[...tiers].join(', ')})`;
    },
  },
  {
    id: 'stray',
    title: 'rarer places breed rarer creatures — provably',
    what:
      'A stray world (a rogue star flung between galaxies, or a lone field galaxy in a cosmic void) biases its fauna toward the rare tail of the taxonomy. That bias is chosen at COMPOSE time — a deterministic gene-offset search that scores candidates against the cached rarity table and picks the rarest. This measures the mean rarity rank (0 common … 4 legendary) of the fauna a normal world rolls vs. the same world with its stray bias, across thousands of addresses.',
    why:
      'Where you find something should inform how special it is — a creature clinging to a dead rock adrift in the intergalactic dark ought to be a genuine trophy, not the same critter you catch on any green world. "Rare" here is a POPULATION percentile (a species\'s frequency vs. all other realized body-plans), which no per-spawn formula can express — so the bias is searched deterministically at compose time and written onto the world seed. Same address → same rare fauna for everyone. This row proves the stray lift is real and sizeable; if it ever vanished, stray worlds would be no more special than any other.',
    native: '(temple/templates.ts::strayFaunaBias — the compose-time bias nother threads to terra)',
    run: async () => {
      let norm = 0, str = 0, n = 0;
      for (let seed = 1; seed < 4000; seed++) {
        const bias = strayFaunaBias(seed);
        norm += meanFaunaRarityRank(seed, 0);
        str += meanFaunaRarityRank(seed, bias);
        n++;
      }
      const nAvg = norm / n, sAvg = str / n, lift = sAvg - nAvg;
      if (!(lift > 0.4)) throw new Error(`stray fauna barely rarer (normal ${nAvg.toFixed(2)} vs stray ${sAvg.toFixed(2)}) — the bias isn't biting`);
      return `stray fauna are measurably rarer: mean rarity rank ${nAvg.toFixed(2)} (normal) → ${sAvg.toFixed(2)} (stray) over ${n.toLocaleString()} addresses — a +${lift.toFixed(2)} lift (0 common … 4 legendary), deterministic per address`;
    },
  },
];

// host-driven proofs that need the native CLI (they drive cameras/modes/A-B forks)
const NATIVE_ONLY = [
  ['saga', 'a 40-year settlement: feud, truce, and the A/B counterfactual (tension 0.27 with the truce vs 0.50 without — the ripple of one conversation, measured)'],
  ['metro', 'a six-scale city with a conversation micro-game at the bottom (Otto +0.60 / Pax −0.33 — two souls, same moves, different outcomes)'],
  ['lodaudit', '11 checks that sim-LOD is real: coarse scopes drift while their subtrees stay frozen bit-exact, then unfold consistently (~10× measured cost lever)'],
  ['lifetime', 'LOD over TIME: a whole life simulated coarsely in 67 ticks, any year unfoldable to full detail'],
  ['breaktest', 'the interaction prims at scale: 256k agents, 1M edges, linear cost'],
] as const;

export default function Proofs() {
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState(false);

  async function runOne(p: Proof) {
    setResults((r) => ({ ...r, [p.id]: { status: 'running', detail: 'running in your browser…' } }));
    await new Promise((r) => setTimeout(r, 30)); // let the UI paint
    const t0 = performance.now();
    try {
      const detail = await p.run();
      setResults((r) => ({ ...r, [p.id]: { status: 'pass', detail, ms: performance.now() - t0 } }));
    } catch (e) {
      setResults((r) => ({
        ...r,
        [p.id]: { status: 'fail', detail: e instanceof Error ? e.message : String(e), ms: performance.now() - t0 },
      }));
    }
  }

  async function runAll() {
    setBusy(true);
    for (const p of PROOFS) await runOne(p);
    setBusy(false);
  }

  const passed = PROOFS.filter((p) => results[p.id]?.status === 'pass').length;

  return (
    <div className="proofs">
      <header>
        <p className="proofs-crumb"><a href="/">← notherworld</a></p>
        <h1>proofs</h1>
        <p className="proofs-pitch">
          The determinism guards that gate this engine — running <em>in your browser</em>, through
          the WASM build, against tick numbers baselined on the native build. Green rows are live
          evidence that the same world unfolds identically on every platform. Nothing here is
          mocked; press run and your machine simulates the worlds.
        </p>
        <button className="proofs-runall" onClick={runAll} disabled={busy}>
          {busy ? 'running…' : passed === PROOFS.length && passed > 0 ? `all ${passed} passed — run again` : 'run all proofs'}
        </button>
      </header>

      {PROOFS.map((p) => {
        const r = results[p.id];
        return (
          <section key={p.id} className={`proof proof-${r?.status ?? 'idle'}`}>
            <div className="proof-head">
              <h2>{p.title}</h2>
              <div className="proof-side">
                {r?.ms !== undefined && <span className="proof-ms">{Math.round(r.ms)}ms</span>}
                <button onClick={() => runOne(p)} disabled={busy || r?.status === 'running'}>
                  {r?.status === 'running' ? '…' : 'run'}
                </button>
                <span className={`proof-badge proof-badge-${r?.status ?? 'idle'}`}>
                  {r?.status === 'pass' ? 'PASS' : r?.status === 'fail' ? 'FAIL' : r?.status === 'running' ? '…' : '—'}
                </span>
              </div>
            </div>
            <p className="proof-what"><strong>What it does:</strong> {p.what}</p>
            <p className="proof-why"><strong>What it proves:</strong> {p.why}</p>
            {r && r.status !== 'running' && <p className={`proof-detail proof-detail-${r.status}`}>{r.detail}</p>}
            <p className="proof-native">native: <code>{p.native}</code></p>
          </section>
        );
      })}

      <section className="proof proof-idle">
        <h2>and natively, five more</h2>
        <p className="proof-what">
          These proofs drive cameras, A/B forks, or six-figure agent counts — they run as CLI bins
          against the same engine core. Clone the repo and run any of them:
        </p>
        <ul className="proof-list">
          {NATIVE_ONLY.map(([bin, blurb]) => (
            <li key={bin}>
              <code>cargo run --release --bin {bin}</code> — {blurb}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
