// SHELL TEMP: sim loop — the game clock every shell needs. Fixed-step accumulator
// pumped from the host's rAF, with a coarse interval fallback so the world keeps
// turning when the tab is hidden (rAF pauses; setInterval only throttles).
// CONTRACT: engine-generic — no stat names. The host supplies doStep().

export interface SimLoop {
  /** call from your rAF callback every frame */
  pump: () => void;
  dispose: () => void;
}

export function createSimLoop(tickMs: number, doStep: () => void): SimLoop {
  let last = performance.now();
  const pump = () => {
    let n = 0;
    while (performance.now() - last >= tickMs && n < 5) { doStep(); last += tickMs; n++; }
    if (performance.now() - last >= tickMs) last = performance.now(); // long hide: drop backlog
  };
  const timer = window.setInterval(pump, 500);
  return { pump, dispose: () => clearInterval(timer) };
}
