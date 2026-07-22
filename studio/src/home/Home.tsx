// ── HOME — the connective hub. One page that organizes everything this repo
// contains: playable demos, the lab/experiment surfaces, the authoring studio,
// and the engine itself. Pure static links — no engine boot on this page, so it
// loads instantly and never breaks when a demo is mid-surgery.
import './home.css';

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
      'An addressable multiverse. Every star is a permanent coordinate — dive from the cosmic web to a single world, same address, same place, every visitor.',
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
];

const LAB: Card[] = [
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
      <header className="home-hero">
        <h1>notherworld</h1>
        <p className="home-pitch">
          A deterministic living-world simulation engine — <em>the brain, not the
          renderer</em>. Worlds are authored as data and keep existing when you
          look away. Same seed, same world, forever: under a web page, Unreal,
          Godot, or Unity.
        </p>
        <p className="home-links">
          <a href={REPO}>github</a>
          <span aria-hidden> · </span>
          <a href={`${REPO}/blob/main/docs/AUTHORING.md`}>build your first world</a>
          <span aria-hidden> · </span>
          <a href={`${REPO}/blob/main/docs/ENGINE.md`}>engine reference</a>
          <span aria-hidden> · </span>
          <a href={`${REPO}/blob/main/docs/EMBED.md`}>embed in your game</a>
        </p>
      </header>

      <Section title="play" cards={PLAY} />
      <Section title="lab" cards={LAB} />

      <footer className="home-foot">
        <p>
          Free and open source (AGPL-3.0). Worlds you author are yours.{' '}
          <a href={`${REPO}/blob/main/worlds`}>Steal the templates.</a>
        </p>
      </footer>
    </div>
  );
}

function Section({ title, cards }: { title: string; cards: Card[] }) {
  return (
    <section className="home-section">
      <h2>{title}</h2>
      <div className="home-grid">
        {cards.map((c) => (
          <a key={c.href} className="home-card" href={c.href}>
            <div className="home-card-head">
              <span className="home-card-title">{c.title}</span>
              {c.tag && <span className={`home-tag home-tag-${c.tag}`}>{c.tag}</span>}
            </div>
            <p className="home-card-blurb">{c.blurb}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
