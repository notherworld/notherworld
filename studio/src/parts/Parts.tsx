// ── PARTS — the authoring bench for the creature compositor. ──
// Every registry entry drawn in isolation on a neutral base, plus size/height
// sweeps and a random-composite row. When you add a part to
// design/creature.ts, it appears here immediately — this page is how you judge
// whether a new part reads at 40×40 before it ships to a million planets.
import { useEffect, useRef } from 'react';
import { drawCreature, drawSilhouette, TORSOS, HEADS, PATTERNS, type Stats } from '../design/creature';
import './parts.css';

/** the ZOOM-CONSISTENCY check: portrait (close) and silhouette (block view)
 *  drawn from the SAME stats — the creature must read as itself in both. */
function PairCard({ label, stats }: { label: string; stats: Stats }) {
  const big = useRef<HTMLCanvasElement>(null);
  const small = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (big.current) drawCreature(big.current, stats);
    const cv = small.current;
    if (cv) {
      const ctx = cv.getContext('2d')!;
      ctx.clearRect(0, 0, 16, 16);
      drawSilhouette((x, y, w, h, c) => {
        ctx.fillStyle = c;
        ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
      }, 8, 14, stats, 1.2);
    }
  }, [stats]);
  return (
    <div className="pt-card">
      <div className="pt-pair">
        <canvas ref={big} width={40} height={40} />
        <canvas ref={small} width={16} height={16} className="pt-mini" />
      </div>
      <strong>{label}</strong>
      <span className="pt-sub">portrait · block view</span>
    </div>
  );
}

const BASE: Stats = {
  species: 3, gene: 0.42, flyer: 0, size: 0.55, height: 0.5, leglen: 0.5,
  fur: 0.2, torso: 0, head: 0, pattern: 0, hue: 0.58, hue2: 0.12, temper: 0.4,
};

function Card({ label, stats, sub }: { label: string; stats: Stats; sub?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawCreature(ref.current, stats); }, [stats]);
  return (
    <div className="pt-card">
      <canvas ref={ref} width={40} height={40} />
      <strong>{label}</strong>
      {sub && <span className="pt-sub">{sub}</span>}
    </div>
  );
}

export default function Parts() {
  const sizes = [0.15, 0.35, 0.55, 0.8, 1.0];
  const rando = (i: number): Stats => ({
    ...BASE,
    species: i, gene: (i * 0.61803) % 1,
    torso: i % TORSOS.length, head: (i * 3) % HEADS.length, pattern: (i * 2) % PATTERNS.length,
    size: 0.2 + ((i * 0.37) % 0.8), height: 0.15 + ((i * 0.53) % 0.85),
    flyer: i % 4 === 0 ? 1 : 0, fur: (i * 0.29) % 1, leglen: 0.2 + ((i * 0.47) % 0.8),
    hue: (i * 0.161) % 1, hue2: (i * 0.161 + 0.4) % 1,
  });

  return (
    <div className="pt">
      <p className="pt-crumb"><a href="/">← notherworld</a> · <a href="/bestiary.html">bestiary</a></p>
      <h1>creature parts</h1>
      <p className="pt-pitch">
        The compositor's part registries (<code>studio/src/design/creature.ts</code>), each drawn in
        isolation on a neutral base. Add a part to a registry and it appears here — judge it at
        40×40 before it ships to a million planets. Genome permanent, portrayal versioned:
        append parts, never reorder.
      </p>

      <h2>torsos <span className="pt-count">{TORSOS.length}</span></h2>
      <div className="pt-grid">
        {TORSOS.map((t, i) => <Card key={t.name} label={t.name} sub={`index ${i}`} stats={{ ...BASE, torso: i }} />)}
      </div>

      <h2>heads <span className="pt-count">{HEADS.length}</span></h2>
      <div className="pt-grid">
        {HEADS.map((h, i) => <Card key={h.name} label={h.name} sub={`index ${i}`} stats={{ ...BASE, head: i }} />)}
      </div>

      <h2>patterns <span className="pt-count">{PATTERNS.length}</span></h2>
      <div className="pt-grid">
        {PATTERNS.map((p, i) => <Card key={p.name} label={p.name} sub={`index ${i}`} stats={{ ...BASE, pattern: i }} />)}
      </div>

      <h2>size sweep <span className="pt-count">mass 0.15 → 1</span></h2>
      <div className="pt-grid">
        {sizes.map((s) => <Card key={s} label={`size ${s}`} stats={{ ...BASE, size: s }} />)}
      </div>

      <h2>height sweep <span className="pt-count">stature 0.1 → 1 (same mass)</span></h2>
      <div className="pt-grid">
        {[0.1, 0.3, 0.5, 0.75, 1.0].map((h) => <Card key={h} label={`height ${h}`} stats={{ ...BASE, height: h }} />)}
      </div>

      <h2>flyers &amp; fur</h2>
      <div className="pt-grid">
        <Card label="flyer" stats={{ ...BASE, flyer: 1 }} />
        <Card label="furred" stats={{ ...BASE, fur: 0.9 }} />
        <Card label="furred flyer" stats={{ ...BASE, flyer: 1, fur: 0.9 }} />
        <Card label="fierce eye" stats={{ ...BASE, temper: 0.9 }} />
      </div>

      <h2>random composites <span className="pt-count">how parts play together</span></h2>
      <div className="pt-grid">
        {Array.from({ length: 12 }, (_, i) => <Card key={i} label={`№ ${i + 1}`} stats={rando(i + 1)} />)}
      </div>

      <h2>zoom consistency <span className="pt-count">same stats, both tiers — same soul</span></h2>
      <div className="pt-grid">
        {Array.from({ length: 6 }, (_, i) => <PairCard key={i} label={`№ ${i + 1}`} stats={rando(i + 1)} />)}
      </div>
    </div>
  );
}
