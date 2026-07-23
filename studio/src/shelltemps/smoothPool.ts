// SHELL TEMP: smooth pool — damped portrayal state per entity. Deadzone swallows
// per-tick sim jitter; easing carries real moves without bounce; a smoothed fear
// channel stops flip-flicker on "turned to run" poses.
// CONTRACT: engine-generic — host maps any stat into fear01 (or ignores it).

import * as THREE from 'three';

export interface SmoothState { pos: THREE.Vector3; fear: number }

export function createSmoothPool(opts?: { deadzone?: number; ease?: number; fearEase?: number }) {
  const deadzone = opts?.deadzone ?? 0.45;
  const ease = opts?.ease ?? 0.035;
  const fearEase = opts?.fearEase ?? 0.05;
  const pool = new Map<number, SmoothState>();
  return {
    /** advance id toward target; returns the smoothed state to draw from */
    get(id: number, target: THREE.Vector3, fear01 = 0): SmoothState {
      let s = pool.get(id);
      if (!s) { s = { pos: target.clone(), fear: fear01 }; pool.set(id, s); }
      if (s.pos.distanceTo(target) > deadzone) s.pos.lerp(target, ease);
      s.fear += (fear01 - s.fear) * fearEase;
      return s;
    },
    drop(id: number) { pool.delete(id); },
  };
}
