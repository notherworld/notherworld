// SHELL TEMP: HUD kit — meters, chronicle feed, end banner. Every number shown
// is an engine stat the host passes in; the kit renders, never computes.
// CONTRACT: engine-generic (works with any world's stats + log + win flag).

import type { NotableDto } from '../owos';

export function Meter({ label, v, warn }: { label: string; v: number; warn?: boolean }) {
  return (
    <div className={`hunt-meter ${warn && v > 0.3 ? 'hot' : ''}`}>
      <b>{label}</b>
      <div><i style={{ width: `${Math.min(v, 1) * 100}%` }} /></div>
    </div>
  );
}

export function Chronicle({ log, last = 5 }: { log: NotableDto[]; last?: number }) {
  return (
    <div className="hunt-chron">
      {log.slice(-last).map((n, i) => <div key={i}><em>t{n.tick}</em> {n.message}</div>)}
    </div>
  );
}

export function EndBanner({ over, won, winTitle, loseTitle, winSub, loseSub, restartLabel, onRestart }: {
  over: boolean; won: boolean;
  winTitle: string; loseTitle: string; winSub: string; loseSub: string;
  restartLabel: string; onRestart: () => void;
}) {
  if (!over) return null;
  return (
    <div className={`hunt-banner ${won ? 'won' : 'lost'}`}>
      <h1>{won ? winTitle : loseTitle}</h1>
      <p>{won ? winSub : loseSub}</p>
      <button onClick={onRestart}>{restartLabel}</button>
    </div>
  );
}
