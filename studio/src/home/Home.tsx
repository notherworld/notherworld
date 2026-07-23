// ── HOME — the connective hub, pixel edition. Organizes everything the repo
// contains: the thesis, playable demos, the lab surfaces, and the engine.
// Pure static links — no engine boot, loads instantly, never breaks mid-surgery.
import '../design/pixel.css';
import './home.css';
import Starfield from '../design/Starfield';

type Card = {
  href: string;
  title: string;
  blurb: string;
  tag?: 'demo' | 'experiment' | 'tool' | 'wip';
};

const PLAY: Card[] = [
  {
    href: '/nother.html',
    title: 'notherspace',
    blurb:
      'An addressable multiverse. Every star is a permanent coordinate — dive from the cosmic web to a single world, same address, same place, every visitor. See the facts page for what that actually means.',
    tag: 'demo',
  },
  {
    href: '/terra.html',
    title: 'terra',
    blurb:
      'Land on a living world. Terrain, settlements, and people materialize as you descend — and keep living when you look away.',
    tag: 'demo',
  },
  {
    href: '/city.html',
    title: 'veranholm',
    blurb:
      'A living city, dived through the scope tree: city → district → block → building → floor → room → one occupant.',
    tag: 'demo',
  },
  {
    href: '/drop.html',
    title: 'the drop',
    blurb:
      'Proximity-reveal worldgen. A glider descends; districts crystallize from mist to full detail by distance. Re-roll for a different city.',
    tag: 'demo',
  },
  {
    href: '/bestiary.html',
    title: 'bestiary',
    blurb:
      "Type a planet's address and meet its creatures. Its laws — air, gravity, heat — shaped every body plan, and the same number grows the same beasts for every visitor, forever.",
    tag: 'demo',
  },
];

const LAB: Card[] = [
  {
    href: '/parts.html',
    title: 'creature parts',
    blurb:
      "The compositor's part registries drawn in isolation — torsos, heads, patterns, size and stature sweeps. The authoring bench for growing the bestiary.",
    tag: 'tool',
  },
  {
    href: '/lab.html',
    title: 'partition lab',
    blurb:
      'Every spatial partition style side by side — voronoi, subdivide, grid, cluster, relational — over live engine data.',
    tag: 'experiment',
  },
  {
    href: '/temple.html',
    title: 'temple',
    blurb:
      'The surface-template workbench: geology → weather → circulation → society knobs, recompiled into a world as you turn them.',
    tag: 'experiment',
  },
  {
    href: '/studio.html',
    title: 'studio',
    blurb:
      'Author a world as data — rules, behaviors, events, generators — and watch it run live as you edit. Export the JSON; it runs anywhere the engine does.',
    tag: 'tool',
  },
  {
    href: '/proofs.html',
    title: 'proofs',
    blurb:
      "The engine's determinism guards, running live in your browser — same seed, same world, to the exact tick, against numbers baselined on the native build.",
    tag: 'tool',
  },
];

const REPO = 'https://github.com/notherworld/notherworld';

export default function Home() {
  return (
    <div className="home">
      <Starfield />

      <header className="home-hero px-scan">
        <div className="home-hero-inner">
          <h1 className="px-h home-mark">notherworld</h1>
          <p className="home-tag">
            <span className="home-tag-line">a world is not a file.</span>{' '}
            <span className="home-tag-line home-tag-accent px-cursor">a world is an address.</span>
          </p>
          <p className="home-pitch">
            Every game ever shipped <b>stores</b> its world and streams it back to you.
            This engine <b>computes</b> its worlds from addresses — deterministically, at
            the storage cost of a formula — nests full games inside full games on one
            primitive, and proves a game's entire logic in seconds, before it has
            graphics. That is not a feature difference. It is a different branch of the
            tree.
          </p>
          <p className="home-cta">
            <a className="px-btn" href="/about.html">read the thesis</a>
            <a className="px-btn ghost" href="/nother.html">dive the cosmos</a>
            <a className="px-btn ghost" href="/how.html">how it works</a>
            <a className="px-btn ghost" href="/proofs.html">run the proofs</a>
          </p>
        </div>
      </header>

      <a className="home-thesis-strip px-card px-cut" href="/about.html">
        <span className="px-chip px-chip-thesis">the claim</span>
        <span className="home-thesis-text">
          The address is the asset: why the cost model of game worlds — store it, stream
          it, fake the depth — may simply be the wrong default. With receipts you can
          re-run in this browser.
        </span>
        <span className="home-thesis-arrow" aria-hidden>▶</span>
      </a>

      <a className="home-thesis-strip home-facts-strip px-card px-cut" href="/notherspace.html">
        <span className="px-chip px-chip-demo">the facts</span>
        <span className="home-thesis-text">
          notherspace: 10²⁸ planets — hundreds of millions of No Man's Skies — causally
          coupled, at less data than one photo. Every claim on the page has a button that
          proves it in your browser.
        </span>
        <span className="home-thesis-arrow" aria-hidden>▶</span>
      </a>

      <a className="home-thesis-strip home-ai-strip px-card px-cut" href="/about.html#ai">
        <span className="px-chip px-chip-tool">for ai world builders</span>
        <span className="home-thesis-text">
          Generative world models hallucinate their logic — objects forget they exist, cause
          and effect drift. This engine is the fix for exactly that half: a factual, provable
          simulation state your model only has to <em>portray</em>, never invent. AGPL, with
          commercial licenses available.
        </span>
        <span className="home-thesis-arrow" aria-hidden>▶</span>
      </a>

      <Section title="play" cards={PLAY} />
      <Section title="lab" cards={LAB} />

      <footer className="home-foot">
        <nav className="home-links">
          <a href={REPO}>github</a>
          <a href={`${REPO}/blob/main/docs/AUTHORING.md`}>build your first world</a>
          <a href={`${REPO}/blob/main/docs/ENGINE.md`}>engine reference</a>
          <a href={`${REPO}/blob/main/docs/EMBED.md`}>embed in your game</a>
        </nav>
        <p>
          Free and open source (AGPL-3.0). Worlds you author are yours.{' '}
          <a href={`${REPO}/blob/main/worlds`}>Steal the templates.</a>{' '}
          Building something the AGPL can't cover? Commercial licenses available —{' '}
          <a href={`${REPO}/issues`}>open an issue</a>.
        </p>
      </footer>
    </div>
  );
}

function Section({ title, cards }: { title: string; cards: Card[] }) {
  return (
    <section className="home-section">
      <h2 className="px-h">{title}</h2>
      <div className="home-grid">
        {cards.map((c) => (
          <a key={c.href} className="home-card px-card px-cut" href={c.href}>
            <div className="home-card-head">
              <span className="home-card-title">{c.title}</span>
              {c.tag && <span className={`px-chip px-chip-${c.tag}`}>{c.tag}</span>}
            </div>
            <p className="home-card-blurb">{c.blurb}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
