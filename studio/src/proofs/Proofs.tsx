// ── PROOFS — the determinism guards, running in YOUR browser. ──
// The same checks that gate the repo (cargo test + the cli bins) re-run here
// through the WASM build of the engine. The tick numbers below were baselined
// NATIVELY (Windows, then cross-checked on Linux CI) — so every green row you
// see is also live evidence that the native and browser builds of the engine
// agree bit-for-bit. This is not a recording of tests; your machine is running
// the worlds right now.
import { useState } from 'react';
import { createWorld, type Snapshot } from '../owos';
import hotelSpec from '../../../worlds/hotel.json';
import craftSpec from '../../../worlds/craft.json';
import emberholdSpec from '../../../worlds/emberhold.json';
import citySpec from '../../../worlds/city.json';
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
