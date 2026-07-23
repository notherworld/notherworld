// THE GLADE — the soul-first experiment's shell. The ENTIRE game (individual
// hearing/boldness per deer, wind-carried alarm, fear, stalking, win/lose) was
// authored as worlds/hunt.json and proven winnable AND losable headless with the
// generic `live` driver BEFORE this file existed. This shell renders stats and
// forwards player intent — it contains ZERO game rules. Three.js is just a skin;
// swap it for a terminal and the hunt still happens, tick for tick.

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createWorld, World, type Snapshot, type EntityDto } from '../owos';
import huntJson from '../worlds/hunt.json';

const DUSK = 180; // matches the world's lose event (gt(day,179.5))
const RADIUS = 26; // world-units for distance=1 — the renderer's own scale choice

type Stance = 'wait_still' | 'creep' | 'ai';

// stable per-id bearing — portrayal only (the engine has no space here; the
// renderer owns pixels, so WHERE a deer stands on screen is the shell's call)
function bearing(id: number): number {
  return (id * 2.399963229728653) % (Math.PI * 2); // golden angle — even spread, stable per id
}

export default function Hunt() {
  const mountRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  // player-first: YOU hunt by default; "AI hunts" is the spectator mode
  const [stance, setStance] = useState<Stance>('wait_still');
  const stanceRef = useRef<Stance>('wait_still');
  const shootQueued = useRef(false);
  // hold the mark for a few ticks: marked must survive its decay rule long
  // enough for rollup→broadcast to reach the hunter's retarget score gate
  const retarget = useRef<{ ticks: number; deerId: number } | null>(null);
  const [seed, setSeed] = useState(47);
  const [err, setErr] = useState('');

  useEffect(() => { stanceRef.current = stance; }, [stance]);

  // ── boot world + scene once per seed ──────────────────────────────────────
  useEffect(() => {
    let dead = false;
    let raf = 0;

    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fb4c9);
    scene.fog = new THREE.Fog(0x8fb4c9, 24, 78);

    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 200);
    camera.position.set(0, 9, 20);
    camera.lookAt(0, 0.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(12, 18, 8);
    scene.add(sun, new THREE.AmbientLight(0xbfd4e8, 0.9));

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(80, 48),
      new THREE.MeshLambertMaterial({ color: 0x3f6b35 }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // treeline — instanced pines in a ring beyond the meadow
    const pine = new THREE.ConeGeometry(1.1, 4.2, 6);
    const pineMat = new THREE.MeshLambertMaterial({ color: 0x1e3d24 });
    const trees = new THREE.InstancedMesh(pine, pineMat, 140);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 140; i++) {
      const a = (i / 140) * Math.PI * 2 + Math.sin(i * 13.7) * 0.12;
      const r = 30 + ((i * 7919) % 100) / 100 * 22;
      const s = 0.8 + ((i * 104729) % 100) / 100 * 1.4;
      m.makeScale(s, s, s).setPosition(Math.cos(a) * r, 2.1 * s, Math.sin(a) * r);
      trees.setMatrixAt(i, m);
    }
    scene.add(trees);

    // hunter — a still, dark figure at the meadow's heart
    const hunter = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 4, 8), new THREE.MeshLambertMaterial({ color: 0x4a3826 }));
    body.position.y = 0.95;
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.34, 8), new THREE.MeshLambertMaterial({ color: 0x2e2418 }));
    hat.position.y = 1.75;
    hunter.add(body, hat);
    scene.add(hunter);

    // deer pool — body + head + white tail per deer, keyed by entity id
    const deerMeshes = new Map<number, THREE.Group>();
    const mkDeer = () => {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.8, 4, 8), new THREE.MeshLambertMaterial({ color: 0x8a5a33 }));
      b.rotation.z = Math.PI / 2;
      b.position.y = 0.72;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), new THREE.MeshLambertMaterial({ color: 0x7a4e2b }));
      head.position.set(0.72, 1.05, 0);
      const tail = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      tail.position.set(-0.72, 0.85, 0);
      tail.name = 'tail';
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: 0x6e4525 }));
      legs.position.y = 0.28;
      // generous invisible hit-sphere so clicking a deer is forgiving
      const hit = new THREE.Mesh(new THREE.SphereGeometry(1.7, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.8;
      g.add(b, head, tail, legs, hit);
      return g;
    };

    // quarry line — the hunter's mark, drawn from the engine's edge, not guessed
    const quarryLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: 0xd8c27a, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.7 }),
    );
    scene.add(quarryLine);

    // aim reticle — floats over the engine's quarry; gold when the shot is ready
    const reticle = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.06, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x9aa4ae, transparent: true, opacity: 0.9 }),
    );
    reticle.rotation.x = Math.PI / 2;
    reticle.visible = false;
    scene.add(reticle);

    // muzzle flash — fires when the ENGINE's shots stat ticks up
    const flash = new THREE.PointLight(0xffd9a0, 0, 18);
    flash.position.set(0, 1.4, 0);
    scene.add(flash);
    let prevShots = 0;

    // smoothed portrayal state per deer — kills render jitter without touching sim
    const smooth = new Map<number, { pos: THREE.Vector3; fear: number }>();
    const targets = new Map<number, THREE.Vector3>();
    let latest: Snapshot | null = null;

    // ── click a deer to MARK it: the shell only writes a stat; the WORLD's own
    // retarget action swings the quarry edge (quarry:deer@max:target.marked).
    // Input injection, not game logic — the aim decision lives in hunt.json.
    const ray = new THREE.Raycaster();
    const onClick = (ev: MouseEvent) => {
      if (!worldRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const mx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const my = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      // matrices are normally refreshed by render(); update explicitly so clicks
      // also work when the tab is throttled and no frame has drawn recently
      camera.updateMatrixWorld();
      for (const g of deerMeshes.values()) g.updateMatrixWorld(true);
      ray.setFromCamera(new THREE.Vector2(mx, my), camera);
      const hits = ray.intersectObjects([...deerMeshes.values()], true);
      if (hits.length) {
        let o: THREE.Object3D | null = hits[0].object;
        while (o && o.userData.deerId === undefined) o = o.parent;
        if (o) {
          worldRef.current.set(o.userData.deerId, 'marked', 1);
          retarget.current = { ticks: 4, deerId: o.userData.deerId };
        }
      }
    };
    renderer.domElement.addEventListener('click', onClick);

    (async () => {
      try {
        const w = await createWorld(JSON.stringify({ ...(huntJson as object), rng_seed: seed }));
        if (dead) { w.dispose(); return; }
        worldRef.current = w;
        latest = w.snapshot();
        setSnap(latest);

        // sim stepping happens in the rAF loop below (accumulator) — setInterval
        // gets throttled in background tabs and would freeze the hunt
      } catch (e) {
        setErr(String(e));
      }
    })();

    // ── the game clock: 5 engine ticks/sec via rAF accumulator ───────────────
    const TICK_MS = 200;
    let lastStep = performance.now();
    const doStep = () => {
      if (!worldRef.current) return;
      const s0 = latest ?? worldRef.current.snapshot();
      const over = s0.entities.find((e) => e.kind === 'glade')?.stats.over ?? 0;
      if (over > 0.5) return; // world says the hunt ended; the shell obeys
      const h = s0.entities.find((e) => e.kind === 'hunter');
      if (h) {
        const st = stanceRef.current;
        const hasQuarry = s0.edges.some((ed) => ed.kind === 'quarry' && s0.entities.some((e) => e.id === ed.to));
        if (shootQueued.current) { worldRef.current.setIntent(h.id, 'shoot'); shootQueued.current = false; }
        else if (retarget.current && retarget.current.ticks > 0) {
          worldRef.current.set(retarget.current.deerId, 'marked', 1);
          worldRef.current.setIntent(h.id, 'retarget');
          retarget.current.ticks--;
          if (retarget.current.ticks <= 0) retarget.current = null;
        }
        else if (st === 'ai') worldRef.current.clearIntent(h.id);
        // player mode: a dead/missing quarry re-marks itself before the stance
        // resumes — otherwise the forced stance starves the world's mark_quarry
        // and the aim line never comes back after a kill
        else if (!hasQuarry) worldRef.current.setIntent(h.id, 'mark_quarry');
        else worldRef.current.setIntent(h.id, st);
      }
      worldRef.current.step();
      latest = worldRef.current.snapshot();
      (window as unknown as { __hunt?: Snapshot }).__hunt = latest; // dev-tools peek
      // ensure meshes HERE, not in the render loop — clicks must find deer even
      // when rAF is throttled (hidden tab), or the raycast pool sits empty
      for (const e of latest.entities) {
        if (e.kind !== 'deer' || deerMeshes.has(e.id)) continue;
        const g = mkDeer();
        g.userData.deerId = e.id;
        const a0 = bearing(e.id);
        const r0 = (e.stats.distance ?? 0.5) * RADIUS + 3;
        g.position.set(Math.cos(a0) * r0, 0, Math.sin(a0) * r0);
        deerMeshes.set(e.id, g);
        scene.add(g);
      }
      setSnap(latest);
    };

    // pump the accumulator — called by rAF when visible, and by a coarse
    // interval fallback when the tab is hidden (rAF pauses, setInterval only
    // throttles — together they keep the glade turning either way)
    const pump = () => {
      if (!worldRef.current) return;
      let n = 0;
      while (performance.now() - lastStep >= TICK_MS && n < 5) { doStep(); lastStep += TICK_MS; n++; }
      if (performance.now() - lastStep >= TICK_MS) lastStep = performance.now(); // long hide: drop backlog
    };
    const pumpTimer = window.setInterval(pump, 500);

    // ── render loop: step on schedule, then read stats and draw ──────────────
    const animate = (t: number) => {
      raf = requestAnimationFrame(animate);
      pump();
      if (latest) {
        const glade = latest.entities.find((e) => e.kind === 'glade');
        const day = glade?.stats.day ?? 0;

        // dusk falls with the world's OWN clock — sky/fog/light read `day`
        const dusk = Math.min(day / DUSK, 1);
        const sky = new THREE.Color(0x8fb4c9).lerp(new THREE.Color(0x2a2438), dusk * dusk);
        scene.background = sky;
        (scene.fog as THREE.Fog).color = sky;
        sun.intensity = 2.2 * (1 - 0.8 * dusk);

        const live = new Set<number>();
        for (const e of latest.entities) {
          if (e.kind !== 'deer') continue;
          live.add(e.id);
          const g = deerMeshes.get(e.id);
          if (!g) continue; // created in doStep
          const a = bearing(e.id);
          const r = (e.stats.distance ?? 0.5) * RADIUS + 3;
          targets.set(e.id, new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
          const tgt = targets.get(e.id)!;
          // smoothed portrayal: deadzone swallows per-tick drift jitter; easing
          // carries real moves (graze-approach, flee) without bounce
          let sm = smooth.get(e.id);
          if (!sm) { sm = { pos: tgt.clone(), fear: e.stats.fear ?? 0 }; smooth.set(e.id, sm); }
          if (sm.pos.distanceTo(tgt) > 0.45) sm.pos.lerp(tgt, 0.035);
          sm.fear += ((e.stats.fear ?? 0) - sm.fear) * 0.05;
          g.position.copy(sm.pos);
          g.lookAt(hunter.position.x, 0, hunter.position.z);
          if (sm.fear > 0.55) g.rotation.y += Math.PI; // turned to run
          // the white tail IS the fear stat — flag up and flashing when afraid
          const tail = g.getObjectByName('tail') as THREE.Mesh;
          const fear = sm.fear;
          tail.position.y = 0.85 + fear * 0.5;
          tail.scale.setScalar(1 + fear * (0.8 + 0.6 * Math.sin(t * 0.02)));
          // grazing head-bob when calm and feeding
          if (e.last_action === 'graze') g.children[1].position.y = 0.55 + 0.1 * Math.sin(t * 0.01 + e.id);
          else g.children[1].position.y = 1.05;
        }
        // fallen deer leave the field
        for (const [id, g] of deerMeshes) if (!live.has(id)) { scene.remove(g); deerMeshes.delete(id); smooth.delete(id); }

        // quarry mark from the ENGINE's edge list — steady line + readiness ring.
        // "Ready" mirrors the world's OWN shoot gates (patience/alarm) plus the
        // hit formula's range gate — the shell repeats the truth, never decides it.
        const q = latest.edges.find((ed) => ed.kind === 'quarry');
        const qg = q && deerMeshes.get(q.to);
        const qe = q && latest.entities.find((e) => e.id === q.to);
        const hu = latest.entities.find((e) => e.kind === 'hunter');
        if (qg && qe && hu) {
          quarryLine.visible = true;
          quarryLine.geometry.setFromPoints([new THREE.Vector3(0, 1.2, 0), qg.position.clone().setY(0.8)]);
          quarryLine.computeLineDistances();
          reticle.visible = true;
          reticle.position.copy(qg.position).setY(0.1);
          reticle.rotation.z = t * 0.001;
          const inRange = (qe.stats.distance ?? 1) < 0.3;
          const ready = inRange && (hu.stats.patience ?? 0) > 0.5 && (glade?.stats.alarm ?? 1) < 0.28;
          (reticle.material as THREE.MeshBasicMaterial).color.set(ready ? 0xf0c869 : inRange ? 0xd8e2ec : 0x707a84);
          reticle.scale.setScalar(ready ? 1 + 0.12 * Math.sin(t * 0.008) : 1);
        } else { quarryLine.visible = false; reticle.visible = false; }

        // muzzle flash when the engine says a shot happened
        const shotsNow = hu?.stats.shots ?? 0;
        if (shotsNow > prevShots) { flash.intensity = 30; prevShots = shotsNow; }
        flash.intensity *= 0.85;

        // slow orbit camera
        const ca = t * 0.00006;
        camera.position.set(Math.sin(ca) * 20, 9, Math.cos(ca) * 20);
        camera.lookAt(0, 0.6, 0);
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
      clearInterval(pumpTimer);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      worldRef.current?.dispose();
      worldRef.current = null;
    };
  }, [seed]);

  // ── HUD: every number below is an engine stat, never shell state ───────────
  const glade = snap?.entities.find((e) => e.kind === 'glade');
  const hunter = snap?.entities.find((e) => e.kind === 'hunter');
  const deer = snap?.entities.filter((e) => e.kind === 'deer') ?? [];
  const kills = glade ? Math.round(8 - (glade.stats.herd ?? 8)) : 0;
  const day = glade?.stats.day ?? 0;
  const over = (glade?.stats.over ?? 0) > 0.5;
  const won = (glade?.stats.won ?? 0) > 0.5;
  const chron = (snap?.log ?? []).slice(-5);

  return (
    <div className="hunt">
      <div className="hunt-canvas" ref={mountRef} />

      {err && <div className="hunt-err">{err}</div>}

      <header className="hunt-top">
        <div className="hunt-title">BLACKFERN GLADE <span>· the soul-first experiment — the whole game is worlds/hunt.json; this page only draws it</span></div>
        <div className="hunt-clock">
          <div className="hunt-daybar"><i style={{ width: `${Math.min(day / DUSK, 1) * 100}%` }} /></div>
          <span>{day < DUSK ? `dusk in ${Math.max(DUSK - day, 0) | 0}` : 'dusk'}</span>
        </div>
      </header>

      <aside className="hunt-side">
        <div className="hunt-stat"><b>kills</b><span>{kills} / 3</span></div>
        <div className="hunt-stat"><b>herd</b><span>{deer.length}</span></div>
        <Meter label="alarm" v={glade?.stats.alarm ?? 0} warn />
        <Meter label="wind" v={glade?.stats.wind ?? 0} />
        <Meter label="patience" v={hunter?.stats.patience ?? 0} />
        <Meter label="stealth" v={hunter?.stats.stealth ?? 0} />
        <div className="hunt-deerlist">
          {deer.map((d) => <DeerRow key={d.id} d={d} />)}
        </div>
      </aside>

      <footer className="hunt-foot">
        <div className="hunt-stances">
          <button className={stance === 'ai' ? 'on' : ''} onClick={() => setStance('ai')}>AI hunts</button>
          <button className={stance === 'wait_still' ? 'on' : ''} onClick={() => setStance('wait_still')}>wait</button>
          <button className={stance === 'creep' ? 'on' : ''} onClick={() => setStance('creep')}>creep</button>
          <button className="shoot" disabled={over} onClick={() => { shootQueued.current = true; }}>SHOOT</button>
          <button onClick={() => setSeed((s) => s + 1)}>new glade</button>
          <span className="hunt-hint">click a deer to mark your quarry · gold ring = take the shot</span>
        </div>
        <div className="hunt-chron">
          {chron.map((n, i) => <div key={i}><em>t{n.tick}</em> {n.message}</div>)}
        </div>
      </footer>

      {over && (
        <div className={`hunt-banner ${won ? 'won' : 'lost'}`}>
          <h1>{won ? '★ THE FREEZER IS FULL' : 'EMPTY-HANDED'}</h1>
          <p>{won ? `three kills before dusk — day ${day | 0}` : 'dusk fell on Blackfern Glade'}</p>
          <button onClick={() => setSeed((s) => s + 1)}>hunt a new glade</button>
        </div>
      )}
    </div>
  );
}

function Meter({ label, v, warn }: { label: string; v: number; warn?: boolean }) {
  return (
    <div className={`hunt-meter ${warn && v > 0.3 ? 'hot' : ''}`}>
      <b>{label}</b>
      <div><i style={{ width: `${Math.min(v, 1) * 100}%` }} /></div>
    </div>
  );
}

// one line per living deer — the INDIVIDUALS the thesis promises: this one
// hears better, that one grazes bolder. All engine stats.
function DeerRow({ d }: { d: EntityDto }) {
  return (
    <div className="hunt-deer">
      <span className="nm">deer {d.id}</span>
      <span title="hearing">👂{Math.round((d.stats.hearing ?? 0) * 100)}</span>
      <span title="boldness">🦌{Math.round((d.stats.boldness ?? 0) * 100)}</span>
      <span title="fear" className={d.stats.fear > 0.6 ? 'afraid' : ''}>😨{Math.round((d.stats.fear ?? 0) * 100)}</span>
      <em>{d.last_action ?? ''}</em>
    </div>
  );
}

