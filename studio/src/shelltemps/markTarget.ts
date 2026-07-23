// SHELL TEMP: mark target — click an entity to make it the actor's quarry.
// The shell only raycasts and writes a stat + holds an intent; the WORLD's own
// retarget action swings the quarry edge. Input injection, never game logic.
// CONTRACT (soul side): requires pack_stalker (or equivalent) — a `marked` stat
// on the clickable kind, and a `retarget` action on the actor
// (unlink quarry + link quarry:<kind>@max:target.marked).

import * as THREE from 'three';
import type { World } from '../owos';

export function createMarkTarget(opts: {
  dom: HTMLElement;
  camera: THREE.Camera;
  pool: Map<number, THREE.Object3D>; // clickable meshes keyed by entity id (userData not required)
  getWorld: () => World | null;
  holdTicks?: number; // ticks to keep the mark warm past rollup→broadcast lag
}) {
  const ray = new THREE.Raycaster();
  let pending: { id: number; ticks: number } | null = null;
  const hold = opts.holdTicks ?? 4;

  const onClick = (ev: MouseEvent) => {
    const w = opts.getWorld();
    if (!w) return;
    const rect = opts.dom.getBoundingClientRect();
    const mx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    // matrices are normally refreshed by render(); update explicitly so clicks
    // also land when the tab is throttled and no frame has drawn recently
    (opts.camera as THREE.PerspectiveCamera).updateMatrixWorld();
    for (const g of opts.pool.values()) g.updateMatrixWorld(true);
    ray.setFromCamera(new THREE.Vector2(mx, my), opts.camera);
    const hits = ray.intersectObjects([...opts.pool.values()], true);
    if (!hits.length) return;
    // walk up to the pooled root to find the entity id
    let o: THREE.Object3D | null = hits[0].object;
    const roots = new Map([...opts.pool.entries()].map(([id, g]) => [g, id] as const));
    while (o && !roots.has(o)) o = o.parent;
    if (!o) return;
    const id = roots.get(o)!;
    w.set(id, 'marked', 1);
    pending = { id, ticks: hold };
  };
  opts.dom.addEventListener('click', onClick);

  return {
    /** call once per sim tick BEFORE stance intents; true = it consumed the intent slot */
    tickIntent(actorId: number): boolean {
      const w = opts.getWorld();
      if (!w || !pending || pending.ticks <= 0) return false;
      w.set(pending.id, 'marked', 1); // keep the mark warm against its decay rule
      w.setIntent(actorId, 'retarget');
      pending.ticks--;
      if (pending.ticks <= 0) pending = null;
      return true;
    },
    dispose() { opts.dom.removeEventListener('click', onClick); },
  };
}
