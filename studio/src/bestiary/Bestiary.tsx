// ── THE BESTIARY — every planet's creatures, from its address. ──
// The GENOME is engine data (worlds/bestiary.json): planet laws roll at genesis
// and bend every species' body plan through authored formulas. This page just
// draws what the engine decided — parts picked by stat indices, tuned by
// continuous stats. Same address = same laws = same creatures, for everyone,
// forever. The renderer owns pixels; the engine owns the life.
import { useEffect, useRef, useState } from 'react';
import { createWorld, type EntityDto } from '../owos';
import baseSpec from '../../../worlds/bestiary.json';
import { drawCreature, partsOf, commonName, taxonName, speciesKey, speciesRarity } from '../design/creature';
import './bestiary.css';

const SYL_A = ['mor', 'vel', 'tan', 'kir', 'sol', 'bram', 'fen', 'lux', 'dro', 'nim', 'qua', 'zeph'];
const SYL_B = ['ath', 'ille', 'ock', 'ern', 'yph', 'and', 'ilk', 'oss', 'ume', 'ari', 'ex', 'ora'];
function nameOf(species: number, gene: number): string {
  const h = Math.abs(Math.floor(species * 7919 + gene * 104729));
  const n = SYL_A[h % SYL_A.length] + SYL_B[Math.floor(h / 10) % SYL_B.length] + (h % 3 === 0 ? SYL_A[Math.floor(h / 100) % SYL_A.length] : '');
  return n[0].toUpperCase() + n.slice(1);
}
function planetName(gene: number, seed: number): string {
  const h = Math.abs(Math.floor(gene * 104729 + seed * 31));
  const n = SYL_A[(h >> 2) % SYL_A.length] + SYL_B[(h >> 5) % SYL_B.length];
  return n[0].toUpperCase() + n.slice(1) + '-' + (seed % 1000);
}

interface Species { e: EntityDto; name: string }

export default function Bestiary() {
  const [seed, setSeed] = useState<number>(() => {
    const p = new URLSearchParams(location.search).get('p');
    return p ? Math.abs(parseInt(p, 10)) || 79873 : 79873;
  });
  const [input, setInput] = useState(String(seed));
  const [planet, setPlanet] = useState<EntityDto | null>(null);
  const [species, setSpecies] = useState<Species[]>([]);
  const canvases = useRef<Map<number, HTMLCanvasElement>>(new Map());

  useEffect(() => {
    let dead = false;
    (async () => {
      const w = await createWorld({ ...(baseSpec as object), rng_seed: seed });
      try {
        const s = w.snapshot();
        if (dead) return;
        const p = s.entities.find((e) => e.kind === 'planet') ?? null;
        const sp = s.entities
          .filter((e) => e.kind === 'species')
          .map((e) => ({ e, name: nameOf(e.stats.species ?? 0, e.stats.gene ?? 0) }));
        setPlanet(p);
        setSpecies(sp);
        history.replaceState(null, '', `?p=${seed}`);
      } finally {
        w.dispose();
      }
    })();
    return () => { dead = true; };
  }, [seed]);

  useEffect(() => {
    for (const { e } of species) {
      const cv = canvases.current.get(e.id);
      if (cv) drawCreature(cv, e.stats);
    }
  }, [species]);

  const L = planet?.stats ?? {};
  const flyers = species.filter((s) => (s.e.stats.flyer ?? 0) > 0.5).length;
  const word = (v: number, lo: string, mid: string, hi: string) => (v < 0.35 ? lo : v < 0.68 ? mid : hi);

  return (
    <div className="bst">
      <header>
        <p className="bst-crumb"><a href="/">← notherworld</a></p>
        <h1>bestiary</h1>
        <p className="bst-pitch">
          Type a planet address. Its laws — air, gravity, heat — were fixed the moment the universe
          rolled, and they shaped every creature on it. Same address, same beasts, for every visitor,
          forever. Nothing here is stored: the engine re-derives this planet's life from its number.
        </p>
        <div className="bst-controls">
          <input value={input} onChange={(ev) => setInput(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === 'Enter') setSeed(Math.abs(parseInt(input, 10)) || 1); }} />
          <button onClick={() => setSeed(Math.abs(parseInt(input, 10)) || 1)}>visit</button>
          <button onClick={() => { const n = Math.floor(Math.random() * 999999); setInput(String(n)); setSeed(n); }}>⟳ random planet</button>
        </div>
      </header>

      {planet && (
        <section className="bst-planet">
          <h2>{planetName(L.name_gene ?? 0, seed)} <span className="bst-addr">№ {seed}</span></h2>
          <p className="bst-laws">
            {word(L.air ?? 0.5, 'thin air', 'temperate air', 'dense air')} ·{' '}
            {word(L.gravity ?? 0.5, 'light gravity', 'earthlike gravity', 'crushing gravity')} ·{' '}
            {word(L.heat ?? 0.5, 'frozen', 'mild', 'scorching')} ·{' '}
            {word(L.lush ?? 0.5, 'sparse life', 'living', 'teeming')}
          </p>
          <p className="bst-comp">
            {species.length} species · {flyers} flyers ({species.length ? Math.round((flyers / species.length) * 100) : 0}%) —{' '}
            {(L.air ?? 0.5) > 0.68 ? 'the dense air keeps life on the ground' : (L.air ?? 0.5) < 0.35 ? 'thin air, a sky full of wings' : 'a mixed sky'}
            {(L.heat ?? 0.5) < 0.35 ? ' · the cold breeds thick fur' : ''}
            {(L.gravity ?? 0.5) > 0.68 ? ' · gravity keeps everything small and low' : ''}
          </p>
        </section>
      )}

      <section className="bst-grid">
        {species.map(({ e }) => {
          const st = e.stats;
          const tags = [
            (st.flyer ?? 0) > 0.5 ? 'flyer' : 'strider',
            (st.diet ?? 0) > 0.72 ? 'predator' : 'grazer',
            (st.nocturnal ?? 0) > 0.5 ? 'nocturnal' : 'diurnal',
            (st.temper ?? 0) > 0.66 ? 'fierce' : (st.temper ?? 0) < 0.33 ? 'docile' : 'wary',
          ];
          return (
            <div key={e.id} className="bst-card">
              <canvas width={40} height={40}
                ref={(cv) => { if (cv) { canvases.current.set(e.id, cv); drawCreature(cv, st); } }} />
              <strong style={{ textTransform: 'capitalize' }}>{commonName(st)}</strong>
              <em style={{ opacity: 0.55, fontSize: 11 }}>{taxonName(speciesKey(st))}</em>
              <div className="bst-parts">{(() => {
                const p = partsOf(st);
                return `${p.torso} · ${p.head}${p.legs !== 'plain' ? ` · ${p.legs} legs` : ''}${p.tail !== 'none' ? ` · ${p.tail} tail` : ''}${p.pattern !== 'plain' ? ` · ${p.pattern}` : ''}`;
              })()}</div>
              <div className="bst-tags">
                <span className={`bst-tag bst-tag-rarity`} style={{ opacity: 0.9 }}>{speciesRarity(st).tier}</span>
                {tags.map((t) => <span key={t} className={`bst-tag bst-tag-${t}`}>{t}</span>)}
              </div>
            </div>
          );
        })}
      </section>

      <footer className="bst-foot">
        The genome is <a href="https://github.com/notherworld/notherworld/blob/main/worlds/bestiary.json">a data file</a> —
        planet laws bend trait formulas, the engine rolls it deterministically, this page only draws.
      </footer>
    </div>
  );
}
