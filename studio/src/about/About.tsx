// ── ABOUT — the thesis, public edition. A claim about an architecture, with a
// working existence proof and one honest caveat. Every load-bearing claim maps
// to a receipt the reader can re-run — mostly on /proofs.html, in this browser.
import '../design/pixel.css';
import './about.css';
import Starfield from '../design/Starfield';

const REPO = 'https://github.com/notherworld/notherworld';

type Receipt = { claim: string; proof: string; where: string; href: string };

const RECEIPTS: Receipt[] = [
  {
    claim: 'World computed from an address; size = address space, cost = the formula',
    proof: 'Star count derived live from the ladder’s closed form N=c(1+4R(R+1)) — not a stated number — then multiplied per rung, in your browser.',
    where: '/proofs — "an addressable universe larger than the real one"',
    href: '/proofs.html',
  },
  {
    claim: 'Upper scales CAUSE lower ones — not a cosmetic zoom',
    proof: 'Hotter stars deterministically produce hotter planets and higher life odds, rolled across thousands of stars.',
    where: '/proofs — same card, coupling half',
    href: '/proofs.html',
  },
  {
    claim: 'Same address, same world, for every visitor, forever',
    proof: 'Same JSON + seed run twice for 220 ticks → identical fingerprint of every entity and every event. Different seed → provably different history.',
    where: '/proofs — "same seed → same world, bit for bit"',
    href: '/proofs.html',
  },
  {
    claim: 'Bit-identical across shells and platforms',
    proof: 'The WASM build in your browser reproduces story beats baselined on the native engine — the hotel earns its star at tick 73 in both. Trig via libm; Linux CI cross-checks Windows baselines on every push.',
    where: '/proofs — geometry-stack card · CI',
    href: '/proofs.html',
  },
  {
    claim: 'The soul is provable headless, in seconds, with no renderer',
    proof: '~30 CLI proof binaries over pure-data worlds; a generic driver runs ANY world JSON with zero host logic; 21 native tests.',
    where: 'repo — cli/ + engine tests',
    href: `${REPO}/tree/main/cli`,
  },
  {
    claim: 'Subject-blind: the same engine runs a cosmos and a hotel',
    proof: 'A Paris hotel earns its Michelin star on a specific simulated day, every run — same interpreter as the cosmos, different JSON.',
    where: '/proofs — "the hotel earns its star on day 73"',
    href: '/proofs.html',
  },
  {
    claim: 'Laws shape life, statistically',
    proof: 'Thin-air planets breed more flyers; cold breeds fur — asserted across planet samples. Stray worlds’ fauna measurably rarer over thousands of addresses.',
    where: '/proofs — "rarer places breed rarer creatures"',
    href: '/proofs.html',
  },
  {
    claim: 'Consequence is permanent, not scripted',
    proof: 'Overhunt a species and it goes extinct through real demography — births, inheritance, age, crowding — logged and irreversible.',
    where: '/proofs — "the world remembers"',
    href: '/proofs.html',
  },
  {
    claim: 'Sim-LOD is real, not labels',
    proof: 'An 11-line audit proves folded scopes cost nothing while folded, yet resume consistently when observed.',
    where: 'repo — cargo run --bin lodaudit',
    href: `${REPO}/tree/main/cli`,
  },
  {
    claim: 'Deep nesting on one primitive',
    proof: 'A six-scale city with a conversation micro-game at the bottom: two characters, same moves, different outcomes (Otto +0.60 / Pax −0.33).',
    where: 'repo — cargo run --bin metro',
    href: `${REPO}/tree/main/cli`,
  },
  {
    claim: 'Sensory truth falls out of the laws',
    proof: 'A sunless world desaturates ≥80%, the way rod-cell vision would — and a heat vent keeps the one colour in the dark, where life clusters.',
    where: '/proofs — "a sunless world loses its colour"',
    href: '/proofs.html',
  },
  {
    claim: 'The whole engine is small',
    proof: 'The compiled WASM engine is ~612 KB. The worlds are JSON files you can read.',
    where: 'repo — studio/src/owos · worlds/',
    href: `${REPO}/tree/main/worlds`,
  },
];

export default function About() {
  return (
    <div className="about">
      <Starfield seed={683} pace={0.3} dim={0.65} />

      <header className="about-hero">
        <p className="about-crumb"><a href="/">notherworld</a></p>
        <p className="about-kicker">a claim about an architecture</p>
        <h1 className="px-h">the address<br />is the asset</h1>
        <p className="about-sub">
          On computed, nestable, subject-agnostic worlds — and why the cost model that
          all interactive software is built on may simply be the wrong default.
        </p>
        <p className="about-epigraph">
          Every claim on this page maps to a proof you can re-run, in this browser,
          in seconds. None of it asks to be believed.
        </p>
        <div className="about-scroll" aria-hidden>▼</div>
      </header>

      <article className="about-body">
        <Sec n="00" title="the claim in one paragraph">
          <p>
            Almost every interactive world ever shipped — games, sims, metaverses — stores its
            content and loads it. That single assumption silently caps how <em>deep</em> and how{' '}
            <em>large</em> a world can be, because every additional level of detail or scale is
            another pile of assets to build, store, and stream. The assumption is optional.
            Dropping it, together with two companion choices, changes not just how large a world
            can be but <em>how a game is made at all</em>:
          </p>
          <ol className="about-three">
            <li>
              <b>A world computed from an address</b> rather than stored — so scale and depth stop
              costing storage.
            </li>
            <li>
              <b>Every scale on one uniform primitive</b> — so nesting a full game inside a full
              game is <em>authoring, not engineering</em>, and repeats downward without bound.
            </li>
            <li>
              <b>Behavior as pure data over a tiny interpreter with no rendering inside it</b> —
              so the <em>soul</em> of a game (its logic, its whole tested correctness) exists and
              is <em>provable in seconds</em> before any graphics, and is bit-identical under any
              shell: pixels, Unreal, Godot, or a text terminal.
            </li>
          </ol>
          <p>
            Put together: a tower of fully-specified, independently-deep games — cosmos containing
            planet containing person containing cell — all live, all addressable, the whole tower
            the size of the <em>program</em>, not its content. There is a working two-level proof:
            a cosmos you dive into a living planet, both real games, the compiled engine ~0.6 MB,
            with <a href="/proofs.html">a page of claims you can re-run in this browser</a>. The
            engine does not know what a galaxy or a hotel room is. It knows entities, scales,
            formulas, and addresses. <b>The subject is data. The shell is a layer. The soul is
            provable.</b>
          </p>
        </Sec>

        <Sec n="01" title="the thing everyone quietly accepts">
          <p>
            Ask how big a game world is and you get an answer in gigabytes. That answer encodes a
            belief so deep nobody states it: <b>a world is a body of content that exists, and
            playing it is retrieving that content.</b> The price is felt at two frontiers.{' '}
            <b>Scale:</b> bigger worlds need more stored content, so studios fake it — skyboxes,
            impostors, invisible walls. <b>Depth:</b> a world <em>inside</em> a world needs a
            second body of content, so nobody ships more than about two real levels of nesting —
            the inner levels get faked into decoration: a "planet" that's a texture, a "person"
            who's a dialogue tree, a "cell" that's a cutscene.
          </p>
          <p>
            Both frontiers are the same wall: <b>content costs storage.</b> The wager of this
            piece: that wall is not a law of nature. It's a consequence of choosing to store.
          </p>
        </Sec>

        <Sec n="02" title="the alternative: the address is the asset">
          <blockquote>Do not store the world. Store a function from address to world.</blockquote>
          <p>
            Give every point a coordinate. Derive everything true about that point — its terrain,
            its inhabitants, its history — from the address, deterministically, the moment someone
            looks. Same address, same result, for every observer, forever. Nothing exists until
            observed; observing computes it; looking away lets it fold back to the address it came
            from. A galaxy of 60 billion stars is not 60 billion records — it's a formula and the
            integers. The world is <b>exactly as large as its address space, at the storage cost
            of the formula.</b>
          </p>
          <p>
            This much is old — procedural generation, seed-sharing, 64k demos all use pieces of
            it. What is usually <em>not</em> done is the next two properties, which turn a
            procedural trick into a medium.
          </p>
        </Sec>

        <Sec n="03" title="one primitive at every scale">
          <p>
            In most engines, each kind of thing is its own system — terrain, AI, economy, all
            separate code. Here, everything — a universe, a city, a person, a cell — is the same
            primitive: an <b>entity</b> with named numeric stats, a parent, and children. "Scale"
            is just depth in the tree. A rule is a formula that updates a stat; behavior is a
            formula that scores an action; generation is a formula that spawns children on reveal.
            Two consequences fall out:
          </p>
          <p>
            <b>A new level of the world is authoring, not engineering.</b> To add "you can zoom
            into a person and live their life," you don't write a life-simulation engine. You
            author entities and formulas that <em>mean</em> a life, in the interpreter that
            already runs the galaxy.
          </p>
          <p>
            <b>The engine is subject-blind.</b> Swap the data and the identical engine is now a
            Paris hotel that earns its first Michelin star on a specific simulated day,
            deterministically, every run — <a href="/proofs.html">a claim this site proves
            live</a>. This is not a space engine wearing other hats. Space was the first skin.
          </p>
        </Sec>

        <Sec n="04" title="nesting is one move, repeated">
          <p>
            Combine the two: because every scale is the same primitive and every point is an
            address, a lower level launches exactly the way you'd open any address — hand it a
            seed and let it compute itself. Diving from cosmos into planet is not a mode switch
            into a different engine. Each level can be a <b>full, independently-specified
            game</b>, and the level above enters it by address — and that level can do the same to
            the one below it. Cosmos launches planet launches city launches person launches cell —
            the tower as tall as you care to author, the <em>program</em> still the size of the
            program.
          </p>
          <p>
            To my knowledge this has never actually shipped — not because no one imagined it, but
            because the storage-and-separate-systems cost model made a third real level
            unaffordable, so every "nested" game faked its inner levels into decoration.
          </p>
        </Sec>

        <Sec n="05" title="authored versus procedural is a false dichotomy">
          <p>
            The oldest objection: <em>procedural means you stopped caring about the in-between.</em>{' '}
            But <b>a static, hand-authored scene is just a dynamic scene with its parameters
            pinned.</b> "Author it by hand" is the special case where you choose every value
            yourself and leave nothing to chance — so the bespoke scene is <em>inside</em> the
            space the dynamic engine expresses. The reverse is not true: a hand-placed scene
            cannot become living, tunable, addressable structure without being rebuilt.
          </p>
          <blockquote>
            Traditional level design is a strict subset of this. It supersedes rather than
            replaces.
          </blockquote>
          <p>
            What that unlocks is a dial no workflow has offered: author your hero's hometown in
            obsessive hand-placed detail; let procedural carry the woods he runs through; drop
            back into full authorship for the one clearing where the story turns — all in one
            addressable medium, tuning more where it matters and less where it doesn't, per scene,
            per rock, at will.
          </p>
        </Sec>

        <Sec n="06" title="the logic is the soul; graphics are a shell">
          <p>
            When everything is entities, stats, formulas, and addresses, the world's behavior is
            pure data through a tiny fixed interpreter — no pixels in it, no wall-clock in it. The
            first thing that buys is <b>proof</b>: every claim about the world is testable in
            seconds. "This planet's laws produce more flyers in thin air" is not a vibe — it's an
            assertion run across thousands of addresses that holds or fails.{' '}
            <a href="/proofs.html">This site ships a page of those, running live in your
            browser, against numbers baselined natively.</a> A soul you can prove is a soul you
            can trust before it has a body.
          </p>
          <p>
            <b>(a) The logic is bit-identical across shells.</b> The same run — same events, same
            numbers, to the tick — can be driven under a pixel renderer, a game engine, or a bare
            terminal. Already demonstrated across two shells: the browser's WASM build reproduces
            tick-exact story beats baselined on the native engine. The same core ships as a C ABI,
            so a game-engine shell is a host integration away — provably identical by the same
            fingerprint check.
          </p>
          <p>
            <b>(b) Design becomes describe-and-tune, not build-and-wait.</b> Author the working
            soul of a game — interactions, consequences, balance — as a headless run, in seconds,
            bit-identical to what the finished graphical game will do. When the shell is attached,
            the logic doesn't change; it was already the final logic. Depth stops being a
            feedback-loop cost.
          </p>
        </Sec>

        <Sec n="07" title="what this does to generative AI worlds" id="ai">
          <p>
            There is a newer class of "AI world models" — video-diffusion systems you can walk
            around inside. Their known failure is that they hallucinate <em>both</em> the look{' '}
            <em>and</em> the logic: objects forget they exist, cause and effect drift, the world
            quietly mutates every twenty seconds, because the model is feeding on its own dream.
          </p>
          <p>
            The split above fixes exactly that half. The engine is the <b>factual, provable
            current state</b> — entities, stats, events, a permanent ledger — and a generative
            visual model becomes just another <em>shell</em>. It never has to imagine <em>what is
            true</em>; only what the truth <em>looks like</em>, conditioned on a stable simulation
            every frame. The same move grounds LLM dialogue: a character speaks from ledger facts
            — what actually happened, to whom, at which tick — narrating state rather than
            inventing it. Hallucination is a problem for the shell layer only, and the shell layer
            is swappable. The soul never dreams.
          </p>
          <p>
            If you are building one of these systems — a world model, a generative game engine, a
            procedural-content platform — this is offered plainly: the missing half of your stack
            may already exist, deterministic and testable, in about 600 kilobytes. The engine is
            open source under AGPL-3.0; for products that can't ship under those terms,{' '}
            <b>commercial licensing is available</b> —{' '}
            <a href={`${REPO}/issues`}>open an issue on GitHub</a> and it will be seen.
          </p>
        </Sec>

        <Sec n="08" title='why "never shipped" is a careful claim'>
          <p>
            Procedural generation is not new (Elite, Dwarf Fortress, Minecraft, No Man's Sky).
            Deterministic shareable seeds are not new. Zoom-from-galaxy-to-surface is not new as a{' '}
            <em>visual</em>. The claimed novelty is narrower:
          </p>
          <blockquote>
            A tower of independently and fully specified games — each with its own large live
            parameter space — all on a single uniform primitive, all computed from a shareable
            address, each launched by the level above as one repeated move, each game's soul
            provable in seconds and bit-identical under any graphics shell, the whole tower's size
            bounded by the program rather than its content.
          </blockquote>
          <p>
            Every prior system drops at least one clause: it fakes the inner levels (Spore's
            minigames, planet-as-skin), or is deep at exactly one level (Dwarf Fortress), or its
            nesting is visual-only, or its logic and rendering are welded so the soul can't be
            run, proven, or re-shelled on its own. The contribution here is removing every one of
            those costs at once.
          </p>
        </Sec>

        <Sec n="09" title="the load-bearing caveat">
          <p>
            The plumbing to nest is proven two levels deep and genuinely free thereafter — same
            engine, same addressing, flat storage. But <b>each new game-level is still a game to{' '}
            <em>design</em>.</b> The megabytes stay flat as you go deeper; the design effort per
            layer does not. So the precise statement is not "the deepest game ever." It is:
          </p>
          <blockquote>
            Every <em>technical</em> reason that an infinitely deep, subject-agnostic tower of
            real games could not exist has been removed. What remains is authoring — the good work
            — and nothing structural stops it going as deep, as wide, and as strange as anyone
            cares to take it.
          </blockquote>
        </Sec>

        <Sec n="10" title="the consequence">
          <p>
            If the above is right, then storing a world is a choice you make for a reason, not a
            default you accept for free — and for anything structured and multi-scale (a body, a
            city, an economy, an ecosystem, a story), the reason evaporates. If the computed
            approach also gives you free nesting, flat size, shareable coordinates, and
            subject-agnosticism, the question inverts:
          </p>
          <blockquote>Why <em>would</em> you store it?</blockquote>
          <p>
            The two-level proof, the subject swap (space → hotel, same engine), and the flat
            storage are enough to make that question askable with a straight face. Once it is
            askable, it does not un-ask itself.
          </p>
          <p>
            The first PC application and the first web application did not differ in features or
            function. One was a program you installed; the other lived at an address anyone could
            visit. That was not an upgrade — it was a branch in the tree, and everything after
            grew from it. Stored worlds and computed, addressable, provable worlds differ the
            same way. The demo is small. The branch is not.
          </p>
        </Sec>

        <section className="about-receipts">
          <h2 className="px-h"><span className="about-n">##</span> the receipts</h2>
          <p className="about-receipts-lede">
            Every load-bearing claim above maps to a check that exists today. Most run live on{' '}
            <a href="/proofs.html">the proofs page</a> — in this browser, in seconds, against
            numbers baselined on the native build. The rest are one{' '}
            <span className="px-kbd">cargo run</span> away in{' '}
            <a href={REPO}>the repo</a>.
          </p>
          <div className="receipt-list">
            {RECEIPTS.map((r) => (
              <a key={r.claim} className="receipt" href={r.href}>
                <div className="receipt-claim">{r.claim}</div>
                <div className="receipt-proof">{r.proof}</div>
                <div className="receipt-where">{r.where}</div>
              </a>
            ))}
          </div>
          <p className="about-gap">
            Known gap, stated because a receipts list is only worth having if it's honest: the C
            ABI does not yet export a JSON world loader, so "run the authored cosmos under Unreal"
            is a host integration away, not done. The cross-shell bit-identity claim rests today
            on native ↔ WASM — which is live above, and checkable.
          </p>
        </section>

        <footer className="about-foot">
          <p>
            This isn't a product pitch. It's a claim about an architecture, with a working
            existence proof and one honest caveat.{' '}
            <b>The space game is the skin. This page is the thing.</b>
          </p>
          <p className="about-foot-cta">
            <a className="px-btn" href="/proofs.html">run the proofs</a>
            <a className="px-btn ghost" href="/how.html">how it works</a>
            <a className="px-btn ghost" href="/nother.html">dive the cosmos</a>
            <a className="px-btn ghost" href={REPO}>read the code</a>
          </p>
        </footer>
      </article>
    </div>
  );
}

function Sec({ n, title, children, id }: { n: string; title: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="about-sec" id={id}>
      <h2 className="px-h"><span className="about-n">{n}</span> {title}</h2>
      {children}
    </section>
  );
}
