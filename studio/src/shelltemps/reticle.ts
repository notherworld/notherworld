// SHELL TEMP: readiness reticle — a ground ring that tracks a target and turns
// gold when the shot/strike is ready. The shell REPEATS the world's own gates in
// display form; it never decides them.
// CONTRACT: host computes `ready` / `inRange` from the same stats its soul's
// action gates use (e.g. patience/alarm/distance), and hands in a position.

import * as THREE from 'three';

export function createReticle(scene: THREE.Scene, opts?: { radius?: number }) {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(opts?.radius ?? 0.85, 0.06, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0x9aa4ae, transparent: true, opacity: 0.9 }),
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.visible = false;
  scene.add(mesh);
  return {
    update(target: THREE.Vector3 | null, state: { ready: boolean; inRange: boolean }, t: number) {
      if (!target) { mesh.visible = false; return; }
      mesh.visible = true;
      mesh.position.copy(target).setY(0.1);
      mesh.rotation.z = t * 0.001;
      (mesh.material as THREE.MeshBasicMaterial).color.set(
        state.ready ? 0xf0c869 : state.inRange ? 0xd8e2ec : 0x707a84);
      mesh.scale.setScalar(state.ready ? 1 + 0.12 * Math.sin(t * 0.008) : 1);
    },
    dispose() { scene.remove(mesh); },
  };
}
