// Starfield — a living, deterministic pixel sky. Star PLACEMENT is seeded (the
// same seed lays the same sky for every visitor — that's the pitch); only the
// portrayal moves: three parallax drift layers, per-star twinkle, drifting
// nebula haze, and the occasional shooting star. Renderer-side motion only —
// exactly the engine's own law: the data is fixed, the shell brings it to life.
import { useEffect, useRef } from 'react';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Star = { x: number; y: number; c: string; base: number; tw: number; ph: number; cross: boolean };
type Layer = { stars: Star[]; speed: number };
type Comet = { x: number; y: number; vx: number; vy: number; life: number };
type Nebula = { x: number; y: number; r: number; hue: string; dx: number; dy: number };

const HUES = ['#c7cbd6', '#7c5cff', '#4dd4c8', '#f0c060', '#8fa3ff', '#ffffff', '#b48cff'];
const NEB = ['rgba(124,92,255,0.05)', 'rgba(77,212,200,0.035)', 'rgba(180,120,255,0.04)'];

// `pace` scales all motion (0.3 = contemplative, 1 = lively); `dim` scales brightness.
export default function Starfield({ seed = 4747, pace = 1, dim = 1 }: { seed?: number; pace?: number; dim?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const g = cv.getContext('2d')!;
    let w = 0, h = 0;
    let layers: Layer[] = [];
    let nebulae: Nebula[] = [];
    let comet: Comet | null = null;
    let cometCooldown = 3000; // ms until first comet
    let raf = 0;
    let last = performance.now();

    const build = () => {
      w = cv.width = Math.ceil(window.innerWidth / 3);
      h = cv.height = Math.ceil(window.innerHeight / 3);
      const rnd = mulberry32(seed);
      layers = [0.6, 1.6, 3.4].map((speed, li) => {
        const n = Math.floor((w * h) / (li === 0 ? 220 : li === 1 ? 420 : 900));
        const stars: Star[] = [];
        for (let i = 0; i < n; i++) {
          stars.push({
            x: rnd() * w,
            y: rnd() * h,
            c: HUES[Math.floor(rnd() * HUES.length)],
            base: 0.2 + rnd() * (0.3 + li * 0.25),
            tw: 0.5 + rnd() * 2.2,          // twinkle speed (rad/s)
            ph: rnd() * Math.PI * 2,        // twinkle phase
            cross: li === 2 && rnd() < 0.14, // only the near layer gets cross-stars
          });
        }
        return { stars, speed };
      });
      nebulae = NEB.map((hue) => ({
        x: rnd() * w, y: rnd() * h,
        r: (0.25 + rnd() * 0.3) * Math.max(w, h),
        hue, dx: (rnd() - 0.5) * 0.9, dy: (rnd() - 0.5) * 0.5,
      }));
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) * pace;
      last = now;
      const t = (now / 1000) * pace;
      g.clearRect(0, 0, w, h);

      // nebula haze — slow drifting radial glows
      for (const nb of nebulae) {
        nb.x = (nb.x + nb.dx * dt + w) % w;
        nb.y = (nb.y + nb.dy * dt + h) % h;
        const grad = g.createRadialGradient(nb.x, nb.y, 0, nb.x, nb.y, nb.r);
        grad.addColorStop(0, nb.hue);
        grad.addColorStop(1, 'transparent');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
      }

      // parallax star layers — deeper is slower and dimmer
      for (const layer of layers) {
        for (const s of layer.stars) {
          s.x -= layer.speed * dt;
          if (s.x < 0) { s.x += w; s.y = (s.y + 7) % h; }
          const a = s.base * dim * (0.55 + 0.45 * Math.sin(t * s.tw + s.ph));
          g.globalAlpha = a;
          g.fillStyle = s.c;
          const x = s.x | 0, y = s.y | 0;
          g.fillRect(x, y, 1, 1);
          if (s.cross) {
            g.globalAlpha = a * 0.55;
            g.fillRect(x - 1, y, 3, 1);
            g.fillRect(x, y - 1, 1, 3);
          }
        }
      }

      // the occasional shooting star
      cometCooldown -= dt * 1000;
      if (!comet && cometCooldown <= 0) {
        comet = {
          x: Math.random() * w * 0.8 + w * 0.2,
          y: Math.random() * h * 0.35,
          vx: -(90 + Math.random() * 70),
          vy: 28 + Math.random() * 24,
          life: 1,
        };
        cometCooldown = 4500 + Math.random() * 9000;
      }
      if (comet) {
        comet.x += comet.vx * dt;
        comet.y += comet.vy * dt;
        comet.life -= dt * 0.9;
        if (comet.life <= 0 || comet.x < -20) comet = null;
        else {
          const len = 14;
          for (let i = 0; i < len; i++) {
            g.globalAlpha = comet.life * (1 - i / len) * 0.9;
            g.fillStyle = i < 2 ? '#ffffff' : '#8fa3ff';
            g.fillRect((comet.x - comet.vx * i * 0.006) | 0, (comet.y - comet.vy * i * 0.006) | 0, 1, 1);
          }
        }
      }

      g.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };

    build();
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', build);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', build); };
  }, [seed, pace, dim]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        position: 'fixed', inset: 0, width: '100vw', height: '100vh',
        imageRendering: 'pixelated', zIndex: -1,
      }}
    />
  );
}
