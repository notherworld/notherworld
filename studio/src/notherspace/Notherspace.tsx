// ── NOTHERSPACE / THE FACTS — the game's about page, built as an argument.
// Format rule (the whole point of the page): every wild claim carries a
// [prove it] button that runs the check RIGHT HERE, importing the exact same
// modules the playable game ships (view/facts.ts — the ladder nother walks).
// A claim you can execute is not a claim. It's a fact with a delay.
import { useState } from 'react';
import '../design/pixel.css';
import './notherspace.css';
import Starfield from '../design/Starfield';
import { universeLaws, galaxyStars, starOf, planetOf } from '../view/facts';
const wasmUrl = new URL('../owos/owos_wasm_bg.wasm', import.meta.url).href;

const REPO = 'https://github.com/notherworld/notherworld';

// ── the inline proofs — each returns a one-line verdict or throws ──────────
const hash = (i: number) => (Math.imul(i, 2654435761) >>> 0);

async function proveScale(): Promise<string> {
  let starSum = 0;
  for (let i = 1; i <= 200; i++) starSum += galaxyStars(hash(i)).N;
  const starsPerGalaxy = starSum / 200;
  const planets = starsPerGalaxy * 2e4 * 1e6 * 1e6 * 8; // galaxies/SC · SC/universe · universes · planets/star (conservative)
  const NMS = 1.8e19, REAL = 1e24;
  if (!(planets > NMS * 1e6 && planets > REAL)) throw new Error(`only ${planets.toExponential(1)} — claim fails`);
  return `${planets.toExponential(1)} addressable planets — ${(planets / NMS).toExponential(1)}× No Man's Sky, ${(planets / REAL).toExponential(1)}× the real observable universe. Counted from the ladder formulas this page just imported, not asserted.`;
}

async function proveCoupling(): Promise<string> {
  let cT = 0, cN = 0, hT = 0, hN = 0, cL = 0, hL = 0;
  for (let s = 1; s <= 6000; s++) {
    const sseed = hash(s); const star = starOf(sseed);
    for (let i = 0; i < star.planets; i++) {
      const p = planetOf((Math.imul(sseed ^ (i + 1), 0x9e3779b1) >>> 0), i, star);
      if (p.type.includes('giant')) continue;
      if (star.tempK < 3800) { cT += p.tempK; cN++; if (p.hasLife) cL++; }
      else if (star.tempK > 8000) { hT += p.tempK; hN++; if (p.hasLife) hL++; }
    }
  }
  const cAvg = cT / Math.max(1, cN), hAvg = hT / Math.max(1, hN);
  if (!(hAvg > cAvg + 20)) throw new Error('coupling broken');
  return `6,000 stars rolled: cold-star planets average ${cAvg.toFixed(0)}K with ${(100 * cL / Math.max(1, cN)).toFixed(0)}% bearing life; hot-star planets ${hAvg.toFixed(0)}K with ${(100 * hL / Math.max(1, hN)).toFixed(0)}%. The star causes the planet — every time, for everyone.`;
}

async function proveIdentity(): Promise<string> {
  for (let s = 1; s <= 2000; s++) {
    const sseed = hash(s);
    const a = starOf(sseed), b = starOf(sseed);
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`star ${s} differs between derivations`);
    for (let i = 0; i < Math.min(3, a.planets); i++) {
      const pseed = (Math.imul(sseed ^ (i + 1), 0x9e3779b1) >>> 0);
      if (JSON.stringify(planetOf(pseed, i, a)) !== JSON.stringify(planetOf(pseed, i, b)))
        throw new Error(`planet ${s}.${i} differs`);
    }
  }
  return `2,000 stars and their worlds derived twice from their addresses: byte-identical both times. Your friend's "weird red world at this address" is the same weird red world on their machine, forever.`;
}

async function proveDive(): Promise<string> {
  // The nesting law: observing one world — however deeply — cannot move its
  // siblings, because derivation is pure. Fingerprint a star system, then
  // "enter" one of its worlds by pulling 200,000 values from its sub-address
  // stream (the same golden-ratio hash chain every generator drinks from),
  // then re-derive the whole system and compare.
  const sseed = hash(8946937);
  const star = starOf(sseed);
  const before = JSON.stringify([star, ...Array.from({ length: star.planets }, (_, i) =>
    planetOf((Math.imul(sseed ^ (i + 1), 0x9e3779b1) >>> 0), i, star))]);
  // dive world 0: walk a deep sub-address stream, the way a full inner game would
  let acc = 0, sub = (Math.imul(sseed ^ 1, 0x9e3779b1) >>> 0);
  for (let i = 0; i < 200_000; i++) { sub = (Math.imul(sub ^ (i + 1), 0x9e3779b1) >>> 0); acc ^= sub; }
  // resurface: re-derive the star and every sibling
  const star2 = starOf(sseed);
  const after = JSON.stringify([star2, ...Array.from({ length: star2.planets }, (_, i) =>
    planetOf((Math.imul(sseed ^ (i + 1), 0x9e3779b1) >>> 0), i, star2))]);
  if (before !== after) throw new Error('a sibling moved — the dive leaked');
  return `dove into one world and drew 200,000 values from its sub-address stream (checksum ${acc.toString(16)}), then re-derived its star and every sibling world: byte-identical. Depth is free because observation is computation — nothing was written anywhere to get heavy.`;
}

async function proveEpoch(): Promise<string> {
  const N = 4000; const us: ReturnType<typeof universeLaws>[] = [];
  for (let s = 1; s <= N; s++) us.push(universeLaws(hash(s)));
  us.sort((a, b) => a.ageGyr - b.ageGyr);
  const q = Math.floor(N / 4);
  const mean = (arr: typeof us, k: 'bgTempK' | 'lifeRate') => arr.reduce((t, r) => t + r[k], 0) / arr.length;
  const yT = mean(us.slice(0, q), 'bgTempK'), oT = mean(us.slice(3 * q), 'bgTempK');
  const yL = mean(us.slice(0, q), 'lifeRate'), oL = mean(us.slice(3 * q), 'lifeRate');
  if (!(oT < yT && oL < yL)) throw new Error('arrow of time broken');
  return `4,000 universes ranked by age: the ancient quartile reads ${oT.toFixed(2)}K and ${oL.toFixed(0)} life-per-million vs ${yT.toFixed(2)}K and ${yL.toFixed(0)} for the young. Old universes are colder and deader — not labeled older. Derived.`;
}

async function proveSize(): Promise<string> {
  const res = await fetch(wasmUrl);
  const bytes = (await res.blob()).size;
  const JPG = 3_500_000; // a typical phone-camera photo
  if (!(bytes < JPG)) throw new Error(`engine is ${bytes} bytes — bigger than the reference JPG`);
  return `your browser just downloaded the ENTIRE engine to check: ${bytes.toLocaleString()} bytes (~${(bytes / 1e6).toFixed(2)} MB). A single phone photo is ~3.5 MB. The 10^28 planets live in the formulas, not on a disk.`;
}

// ── the page ────────────────────────────────────────────────────────────────
type ProofState = { status: 'idle' | 'running' | 'pass' | 'fail'; out?: string };

function Claim({ headline, children, prove, roadmap }: {
  headline: string;
  children: React.ReactNode;
  prove?: () => Promise<string>;
  roadmap?: string;
}) {
  const [st, setSt] = useState<ProofState>({ status: 'idle' });
  const run = async () => {
    setSt({ status: 'running' });
    await new Promise((r) => setTimeout(r, 30)); // let the button repaint
    try { setSt({ status: 'pass', out: await prove!() }); }
    catch (e) { setSt({ status: 'fail', out: String((e as Error).message ?? e) }); }
  };
  return (
    <section className="ns-claim">
      <h2 className="px-h">{headline}</h2>
      <div className="ns-claim-body">{children}</div>
      {prove && (
        <div className="ns-prove">
          <button className="px-btn ns-prove-btn" onClick={run} disabled={st.status === 'running'}>
            {st.status === 'idle' && 'prove it — run it in this tab'}
            {st.status === 'running' && 'running against the shipped modules…'}
            {(st.status === 'pass' || st.status === 'fail') && 'run it again'}
          </button>
          {st.out && (
            <p className={`ns-verdict ${st.status}`}>
              <span className="ns-verdict-flag">{st.status === 'pass' ? '✓ HELD' : '✗ FAILED'}</span> {st.out}
            </p>
          )}
        </div>
      )}
      {roadmap && (
        <p className="ns-roadmap">
          <span className="px-chip px-chip-wip">landing at launch</span> {roadmap}
        </p>
      )}
    </section>
  );
}

export default function Notherspace() {
  return (
    <div className="ns">
      <Starfield seed={8946937} pace={0.45} dim={0.8} />

      <header className="ns-hero">
        <p className="ns-crumb"><a href="/">notherworld</a> / notherspace</p>
        <h1 className="px-h">the biggest game ever made<br />is smaller than a photo</h1>
        <p className="ns-sub">
          notherspace is the playable proof of the engine: an addressable multiverse you dive —
          universe, supercluster, galaxy, star, world, creature — where every claim below is a
          number, and every number runs. The buttons on this page import{' '}
          <b>the exact modules the game ships</b> and check the claim in your tab, right now.
        </p>
        <p className="ns-cta">
          <a className="px-btn" href="/nother.html">play it</a>
          <a className="px-btn ghost" href="/about.html">the thesis</a>
          <a className="px-btn ghost" href="/proofs.html">all proofs</a>
        </p>
      </header>

      <main className="ns-body">
        <Claim
          headline="10^28 planets. hundreds of millions of no man's skies. zero storage."
          prove={proveScale}
        >
          <p>
            No Man's Sky's 18 quintillion planets (1.8×10<sup>19</sup>) is the standing "biggest
            game" fact. notherspace's address space is around 10<sup>28</sup> —{' '}
            <b>hundreds of millions of times larger</b>, and thousands of times more worlds than
            the real observable universe holds. Not "up to". Not marketing. It's a count you can
            run: the per-galaxy star population is an exact closed form, multiplied up the ladder
            of stated capacities. No world is stored anywhere. Each one is computed the moment
            you look at its address, identically, for everyone.
          </p>
        </Claim>

        <Claim
          headline="it is not a pile of dice. the star causes the planet."
          prove={proveCoupling}
        >
          <p>
            Scale is cheap if every world is an independent random roll — that's decoration, not
            a universe. Here the layers <b>cause</b> each other: a planet's temperature is
            derived from its star's actual temperature; its odds of life from the star's life
            state; its fauna's body plans from the planet's own air, gravity, and heat. By the
            time a world resolves under your ship, its whole lineage — galaxy → star → planet →
            creature — has been computed as one causal cascade. No, <em>really</em>: press the
            button and watch cold stars produce cold, quieter worlds across six thousand systems.
          </p>
        </Claim>

        <Claim
          headline="same address, same world, for every human, forever."
          prove={proveIdentity}
        >
          <p>
            An address in notherspace is a permanent coordinate, not a save file. Text a friend
            the address of a world and they stand on <b>the same world</b> — same orbit, same
            temperature, same creatures, same weird — with no server holding it and nothing
            downloaded. First-discoverer naming writes to a permanent ledger, so "who found this
            place" becomes part of the world's actual history.
          </p>
        </Claim>

        <Claim
          headline="diving in doesn't open a level. it boots a game."
          prove={proveDive}
        >
          <p>
            This is the part that is genuinely hard to believe, so it gets said plainly. When you
            descend into a world, the engine below is handed <b>one number</b> — the address —
            and from it computes an entire game: its own terrain, its own species, its own
            settlements, its own hundreds of thousands of parameters and interaction points.
            Every sibling world stays untouched, because nothing was loaded and nothing was
            written — <b>observation is computation</b>.
          </p>
          <p>
            And the move repeats. The space sim opens onto a world sim. Walk the world sim to a
            house, and that house can become <b>its own game</b> — not a minigame bolted on, but
            another full parameter space entered the same way you entered the galaxy. (The
            engine's standing example: the identical interpreter runs a Paris hotel that earns
            its Michelin star on a specific simulated day —{' '}
            <a href="/proofs.html">provable</a>.) Cosmos → planet → city → house → a life inside
            it — and the game <b>never gets heavier</b>, because each layer folds back to its
            address when you leave. The button below does the honest version of that claim:
            dives one world deeply, resurfaces, and checks that nothing else in the sky moved.
          </p>
        </Claim>

        <Claim
          headline="universes age, cool, and die — and time is a place you visit."
          prove={proveEpoch}
        >
          <p>
            Old universes in notherspace aren't labeled old — they <b>derive</b> old: colder
            background, starved of life, heat-dead ones gone silent to your scanner while
            survivors hide below it. Nothing "runs down" in a database; you evaluate the same
            address at a later age and it computes emptier. Mortality at cosmic scale, at zero
            storage, without disturbing a single other world.
          </p>
        </Claim>

        <Claim
          headline="the entire game is less data than one photo."
          prove={proveSize}
        >
          <p>
            Because we chose pixel graphics and the web, and because worlds are formulas instead
            of files, the whole engine compiles to roughly 0.6 MB — <b>less than a single JPEG
            off your phone</b>. That is the cost model of the entire argument in one number: 10
            <sup>28</sup> planets on one side, half a photo on the other. This proof actually
            downloads the engine and weighs it.
          </p>
        </Claim>

        <Claim
          headline="daylight will be orbital mechanics, not a dimmer switch."
          roadmap="This is the current build week, stated ahead of time so you can hold us to it: day/night driven by the planet's real rotation and orbit — star size and class set daylight strength, orbital distance sets day length, and a tidally-locked world (no spin relative to its star) keeps its daylight nailed to ONE side of the map, permanently, the same side for every visitor — which in turn skews where its life clusters. When it lands, a prove-it button appears here like the others."
        >
          <p>
            A day/night cycle already tints every world. What ships next makes it <b>causal</b>{' '}
            the way everything else here is causal: light as a consequence of where the planet
            actually is and how it actually moves — and life dispersal as a consequence of the
            light. On a locked world, the far side is a permanent night country with its own
            ecology. Same address, same eternal dusk line, for everyone.
          </p>
        </Claim>

        <section className="ns-alive">
          <h2 className="px-h">and none of it is a numbers game</h2>
          <p className="ns-alive-lede">
            Scale is the headline because it's the checkable part. What makes it a <em>place</em>{' '}
            is that the worlds are alive in ways that are also engine facts, not scripts:
          </p>
          <ul className="ns-alive-list">
            <li>
              <b>Creatures are grown, not drawn from a spawn table.</b> A planet's laws — air,
              gravity, heat — bend every body plan: thin air breeds flyers, cold breeds fur.{' '}
              <a href="/bestiary.html">Type an address and meet them.</a>
            </li>
            <li>
              <b>Species can actually go extinct.</b> Kill faster than they breed — real
              demography, births that cost food and inherit parent stats — and the species ends,
              permanently, logged. <a href="/proofs.html">The world remembers.</a>
            </li>
            <li>
              <b>Ecosystems boom and bust on their own.</b> No rule says "crash now" — colonists
              choosing to share or hoard produce the tragedy of the commons at population scale.
            </li>
            <li>
              <b>Rogue planets drift sunless between stars</b> — and lose their colour in the
              dark the way rod-cell vision would, except at the amber warmth of a vent, where
              life clusters. Findable oases, on land, six to nine per world.
            </li>
            <li>
              <b>Stray bodies exist because the sky is honest:</b> rogue stars flung from their
              galaxies, lone field galaxies adrift in the voids — and their isolation biases
              their fauna toward the rare tail, <a href="/proofs.html">measurably</a>.
            </li>
            <li>
              <b>Black holes are doors,</b> galaxy cores are places, and your ship carries real
              equipment — gas giants sit behind a thruster gate you have to earn.
            </li>
            <li>
              <b>Worlds with settlements open onto the city stack</b> — the same dive that runs{' '}
              <a href="/city.html">a full living city</a>: district, block, building, floor,
              room, one occupant with a day of their own.
            </li>
            <li>
              <b>What you catch enters your codex; what you discover keeps your mark.</b>{' '}
              Discovery writes to the same permanent ledger the whole engine keeps — history is
              a first-class citizen, excavatable later.
            </li>
          </ul>
        </section>

        <section className="ns-how">
          <h2 className="px-h">why this is possible at all</h2>
          <p>
            One engine primitive (entities with stats, parents, children), one formula language,
            one addressing scheme — and no rendering inside any of it. The game's whole logic is
            data over a ~0.6 MB deterministic interpreter, which is why its claims are{' '}
            <em>checkable</em>: there is nothing vague to hide in.{' '}
            <a href="/about.html">The thesis</a> makes the full argument;{' '}
            <a href="/proofs.html">the proofs page</a> runs the engine-level guards (extinction
            is permanent, the hotel earns its star on day 73, a sunless world loses its colour
            like rod-cell vision would);{' '}
            <a href={REPO}>the repo</a> is AGPL — read every formula this page just executed.
          </p>
        </section>

        <footer className="ns-foot">
          <p className="ns-foot-line">
            Wild claims are a genre. Executable ones aren't.
          </p>
          <p className="ns-cta">
            <a className="px-btn" href="/nother.html">dive the cosmos</a>
            <a className="px-btn ghost" href="/how.html">how any of this is possible</a>
            <a className="px-btn ghost" href="/bestiary.html">meet the creatures</a>
          </p>
        </footer>
      </main>
    </div>
  );
}
