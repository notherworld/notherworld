// SHELL TEMP: stat flash — a light that pops whenever a counting stat ticks up.
// Muzzle flash off `shots`, splash off `casts`, forge-spark off `crafted` — any
// monotonic counter becomes a moment of light.
// CONTRACT: host feeds the current value of ONE counting stat each frame.

import * as THREE from 'three';

export function createStatFlash(scene: THREE.Scene, opts?: { color?: number; intensity?: number; y?: number }) {
  const light = new THREE.PointLight(opts?.color ?? 0xffd9a0, 0, 18);
  light.position.set(0, opts?.y ?? 1.4, 0);
  scene.add(light);
  let prev = 0;
  return {
    update(count: number, at?: THREE.Vector3) {
      if (count > prev) { light.intensity = opts?.intensity ?? 30; prev = count; if (at) light.position.copy(at).setY(opts?.y ?? 1.4); }
      light.intensity *= 0.85;
    },
    dispose() { scene.remove(light); },
  };
}
