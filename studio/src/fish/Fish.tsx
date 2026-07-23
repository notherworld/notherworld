// GREYWATER SHORE — the recombination proof, shell side. The soul is
// worlds/shore.json (5 reused hunt packs + the new lure pack, proven winnable
// AND losable headless). This page is COMPOSED FROM SHELL TEMPS shared with the
// hunt: simLoop, smoothPool, reticle (as the bobber's strike ring), statFlash
// (splash instead of muzzle), HUD kit. Zero game rules in here.
// NOTE: markTarget is NOT used — its contract requires pack_stalker's retarget,
// which this soul doesn't ship. Contracts are real: temps declare what souls
// they need, and the composer-of-shells (you, or an LLM) matches them.

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createWorld, World, type Snapshot } from '../owos';
import { createSimLoop } from '../shelltemps/simLoop';
import { createSmoothPool } from '../shelltemps/smoothPool';
import { createReticle } from '../shelltemps/reticle';
import { createStatFlash } from '../shelltemps/statFlash';
import { Meter, Chronicle, EndBanner } from '../shelltemps/hud';
import shoreJson from '../worlds/shore.json';
import '../hunt/hunt.css';

const DUSK = 180;
const RADIUS = 24;

type Stance = 'wait_out' | 'ai';

function bearing(id: number): number {
  return (id * 2.399963229728653) % (Math.PI * 2);
}

export default function Fish() {
  const mountRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [stance, setStance] = useState<Stance>('ai');
  const stanceRef = useRef<Stance>('ai');
  const castQueued = useRef(false);
  const [seed, setSeed] = useState(47);
  const [err, setErr] = useState('');

  useEffect(() => { stanceRef.current = stance; }, [stance]);

  useEffect(() => {
    let dead = false;
    let raf = 0;

    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fb8c4);
    scene.fog = new THREE.Fog(0x9fb8c4, 24, 80);

    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 200);
    camera.position.set(0, 10, 21);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
    sun.position.set(12, 18, 8);
    scene.add(sun, new THREE.AmbientLight(0xc6d8e4, 0.9));

    // the water — a broad dark disc; the shore ring beyond it
    const water = new THREE.Mesh(new THREE.CircleGeometry(46, 48), new THREE.MeshLambertMaterial({ color: 0x28556e }));
    water.rotation.x = -Math.PI / 2;
    scene.add(water);
    const shoreRing = new THREE.Mesh(new THREE.RingGeometry(46, 80, 48), new THREE.MeshLambertMaterial({ color: 0x5b6b4a }));
    shoreRing.rotation.x = -Math.PI / 2;
    shoreRing.position.y = 0.02;
    scene.add(shoreRing);

    // the pier + angler at the water's heart
    const pier = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 2.6), new THREE.MeshLambertMaterial({ color: 0x6b5030 }));
    pier.position.y = 0.25;
    scene.add(pier);
    const angler = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 4, 8), new THREE.MeshLambertMaterial({ color: 0x3a4a5c }));
    body.position.y = 1.15;
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.28, 8), new THREE.MeshLambertMaterial({ color: 0xc8b06a }));
    hat.position.y = 1.95;
    angler.add(body, hat);
    scene.add(angler);

    // the bobber — sits where the lure works; visible while the lure is live
    const bobber = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshLambertMaterial({ color: 0xd8524a }));
    bobber.visible = false;
    scene.add(bobber);
    const bobberAt = new THREE.Vector3(3.5, 0.12, 4.5); // portrayal: where the cast lands

    // ── SHELL TEMPS, composed ────────────────────────────────────────────────
    const smooth = createSmoothPool();
    const strikeRing = createReticle(scene); // the reticle temp, re-cast as the strike ring
    const splash = createStatFlash(scene, { color: 0xcfe8ff, intensity: 22, y: 0.6 }); // flash temp, listening to casts

    const fishMeshes = new Map<number, THREE.Group>();
    const mkFish = () => {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), new THREE.MeshLambertMaterial({ color: 0x7a92a8 }));
      b.scale.set(1.5, 0.55, 0.7);
      b.position.y = 0.12;
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 6), new THREE.MeshLambertMaterial({ color: 0x62788c }));
      tail.rotation.z = Math.PI / 2;
      tail.position.set(-0.75, 0.12, 0);
      tail.name = 'tail';
      g.add(b, tail);
      return g;
    };

    let latest: Snapshot | null = null;

    const doStep = () => {
      if (!worldRef.current) return;
      const s0 = latest ?? worldRef.current.snapshot();
      const over = s0.entities.find((e) => e.kind === 'shore')?.stats.over ?? 0;
      if (over > 0.5) return;
      const a = s0.entities.find((e) => e.kind === 'angler');
      if (a) {
        const st = stanceRef.current;
        if (castQueued.current) { worldRef.current.setIntent(a.id, 'cast'); castQueued.current = false; }
        else if (st === 'ai') worldRef.current.clearIntent(a.id);
        else worldRef.current.setIntent(a.id, st);
      }
      worldRef.current.step();
      latest = worldRef.current.snapshot();
      (window as unknown as { __fish?: Snapshot }).__fish = latest;
      // meshes ensured in-step (temp lesson: rAF may be throttled)
      for (const e of latest.entities) {
        if (e.kind !== 'fish' || fishMeshes.has(e.id)) continue;
        const g = mkFish();
        const a0 = bearing(e.id);
        const r0 = (e.stats.distance ?? 0.5) * RADIUS + 4;
        g.position.set(Math.cos(a0) * r0, 0, Math.sin(a0) * r0);
        fishMeshes.set(e.id, g);
        scene.add(g);
      }
      setSnap(latest);
    };
    const loop = createSimLoop(200, doStep);

    (async () => {
      try {
        const w = await createWorld(JSON.stringify({ ...(shoreJson as object), rng_seed: seed }));
        if (dead) { w.dispose(); return; }
        worldRef.current = w;
        latest = w.snapshot();
        setSnap(latest);
      } catch (e) { setErr(String(e)); }
    })();

    const animate = (t: number) => {
      raf = requestAnimationFrame(animate);
      loop.pump();
      if (latest) {
        const shore = latest.entities.find((e) => e.kind === 'shore');
        const angl = latest.entities.find((e) => e.kind === 'angler');
        const day = shore?.stats.day ?? 0;
        const dusk = Math.min(day / DUSK, 1);
        const sky = new THREE.Color(0x9fb8c4).lerp(new THREE.Color(0x232038), dusk * dusk);
        scene.background = sky;
        (scene.fog as THREE.Fog).color = sky;
        sun.intensity = 2.0 * (1 - 0.8 * dusk);

        const live = new Set<number>();
        for (const e of latest.entities) {
          if (e.kind !== 'fish') continue;
          live.add(e.id);
          const g = fishMeshes.get(e.id);
          if (!g) continue;
          const a = bearing(e.id);
          const r = (e.stats.distance ?? 0.5) * RADIUS + 4;
          const tgt = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
          const sm = smooth.get(e.id, tgt, e.stats.fear ?? 0);
          g.position.copy(sm.pos);
          g.position.y = 0.05 + 0.06 * Math.sin(t * 0.004 + e.id); // idle bob
          g.lookAt(bobberAt.x, 0, bobberAt.z);
          if (sm.fear > 0.55) g.rotation.y += Math.PI; // turned to flee
          const tail = g.getObjectByName('tail') as THREE.Mesh;
          tail.rotation.x = Math.sin(t * (0.01 + 0.02 * sm.fear) + e.id) * 0.5; // tail beats faster when afraid
        }
        for (const [id, g] of fishMeshes) if (!live.has(id)) { scene.remove(g); fishMeshes.delete(id); smooth.drop(id); }

        // the bobber + strike ring read the lure stat — display of the soul's truth
        const lure = angl?.stats.lure ?? 0;
        bobber.visible = lure > 0.25;
        bobber.position.copy(bobberAt);
        bobber.position.y = 0.12 + 0.05 * Math.sin(t * 0.006);
        const anyClose = latest.entities.some((e) =>
          e.kind === 'fish' && (e.stats.distance ?? 1) < 0.3 && (e.stats.fear ?? 1) < 0.5 && (e.stats.hunger ?? 0) > 0.3);
        strikeRing.update(bobber.visible ? bobberAt : null, { ready: anyClose && lure > 0.25, inRange: lure > 0.25 }, t);

        splash.update(angl?.stats.casts ?? 0, bobberAt);

        const ca = t * 0.00005;
        camera.position.set(Math.sin(ca) * 21, 10, Math.cos(ca) * 21);
        camera.lookAt(0, 0.4, 0);
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(animate);

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      loop.dispose();
      strikeRing.dispose();
      splash.dispose();
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      worldRef.current?.dispose();
      worldRef.current = null;
    };
  }, [seed]);

  const shore = snap?.entities.find((e) => e.kind === 'shore');
  const angl = snap?.entities.find((e) => e.kind === 'angler');
  const fish = snap?.entities.filter((e) => e.kind === 'fish') ?? [];
  const bucket = shore ? Math.round(8 - (shore.stats.school ?? 8)) : 0;
  const day = shore?.stats.day ?? 0;
  const over = (shore?.stats.over ?? 0) > 0.5;
  const won = (shore?.stats.won ?? 0) > 0.5;

  return (
    <div className="hunt">
      <div className="hunt-canvas" ref={mountRef} />
      {err && <div className="hunt-err">{err}</div>}

      <header className="hunt-top">
        <div className="hunt-title">GREYWATER SHORE <span>· recombination proof — 5 hunt packs + 1 new; shell composed from shared shell temps</span></div>
        <div className="hunt-clock">
          <div className="hunt-daybar"><i style={{ width: `${Math.min(day / DUSK, 1) * 100}%` }} /></div>
          <span>{day < DUSK ? `dusk in ${Math.max(DUSK - day, 0) | 0}` : 'dusk'}</span>
        </div>
      </header>

      <aside className="hunt-side">
        <div className="hunt-stat"><b>bucket</b><span>{bucket} / 5</span></div>
        <div className="hunt-stat"><b>school</b><span>{fish.length}</span></div>
        <Meter label="alarm" v={shore?.stats.alarm ?? 0} warn />
        <Meter label="wind" v={shore?.stats.wind ?? 0} />
        <Meter label="lure" v={angl?.stats.lure ?? 0} />
        <Meter label="patience" v={angl?.stats.patience ?? 0} />
        <div className="hunt-deerlist">
          {fish.map((d) => (
            <div className="hunt-deer" key={d.id}>
              <span className="nm">fish {d.id}</span>
              <span title="lure affinity">🪝{Math.round((d.stats.affinity ?? 0) * 100)}</span>
              <span title="boldness">🐟{Math.round((d.stats.boldness ?? 0) * 100)}</span>
              <span title="fear" className={d.stats.fear > 0.6 ? 'afraid' : ''}>😨{Math.round((d.stats.fear ?? 0) * 100)}</span>
              <em>{d.last_action ?? ''}</em>
            </div>
          ))}
        </div>
      </aside>

      <footer className="hunt-foot">
        <div className="hunt-stances">
          <button className={stance === 'ai' ? 'on' : ''} onClick={() => setStance('ai')}>AI fishes</button>
          <button className={stance === 'wait_out' ? 'on' : ''} onClick={() => setStance('wait_out')}>wait</button>
          <button className="shoot" disabled={over} onClick={() => { castQueued.current = true; }}>CAST</button>
          <button onClick={() => setSeed((s) => s + 1)}>new shore</button>
          <span className="hunt-hint">gold ring = a fish is circling the bobber</span>
        </div>
        <Chronicle log={snap?.log ?? []} />
      </footer>

      <EndBanner
        over={over} won={won}
        winTitle="★ FIVE IN THE BUCKET" loseTitle="THE WATER KEPT THEM"
        winSub={`the water gave — day ${day | 0}`} loseSub="dusk fell on Greywater Shore"
        restartLabel="fish a new shore" onRestart={() => setSeed((s) => s + 1)}
      />
    </div>
  );
}
