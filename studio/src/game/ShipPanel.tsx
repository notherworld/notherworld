// ── THE SHIP PANEL — one shared HUD widget for nother (orbit) and terra (surface):
// your ⬡ data balance + the three upgrade tracks. Buying mutates the Ship in place
// (the caller owns the ref), persists via ship.ts, and reports the change up so
// each page can re-derive whatever the new equipment touches (nother: scanner
// readings on newly derived sheets; terra: the catch bonus applies instantly).
import { useState } from 'react';
import { type Ship, type Track, TRACKS, tryUpgrade } from './ship';

export function ShipPanel({ ship, onChange, onClose, note }: {
  ship: Ship; onChange: () => void; onClose: () => void;
  note?: string;   // page-specific footnote (e.g. nother's "re-derive on travel")
}) {
  const [, bump] = useState(0);
  const buy = (track: Track) => {
    if (tryUpgrade(ship, track)) { bump((v) => v + 1); onChange(); }
  };
  return (
    <div style={{
      position: 'fixed', right: 12, bottom: 12, width: 300, zIndex: 44,
      background: 'rgba(10,12,22,0.94)', border: '1px solid rgba(255,255,255,0.16)',
      borderRadius: 10, padding: '10px 12px', backdropFilter: 'blur(4px)',
      font: '12.5px/1.45 ui-monospace, monospace', color: '#cdd3e0',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>⬡ ship</strong>
        <span style={{ marginLeft: 'auto', marginRight: 8, color: '#ffd24a' }}>⬡ {Math.floor(ship.data).toLocaleString()} data</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8891a8', cursor: 'pointer', font: 'inherit' }}>✕</button>
      </div>
      {(Object.keys(TRACKS) as Track[]).map((track) => {
        const { label, icon, tiers } = TRACKS[track];
        const cur = tiers[ship[track]];
        const next = tiers[ship[track] + 1];
        const afford = next && ship.data >= next.cost;
        return (
          <div key={track} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span style={{ opacity: 0.7, marginRight: 6 }}>{icon} {label}</span>
              <b style={{ marginLeft: 'auto' }}>{cur.name}</b>
            </div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>{cur.blurb}</div>
            {next ? (
              <button onClick={() => buy(track)} disabled={!afford} style={{
                marginTop: 4, width: '100%', textAlign: 'left', cursor: afford ? 'pointer' : 'default',
                background: afford ? 'rgba(255,210,74,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${afford ? 'rgba(255,210,74,0.45)' : 'rgba(255,255,255,0.10)'}`,
                borderRadius: 6, padding: '4px 8px', color: afford ? '#ffd24a' : '#6b7288', font: 'inherit', fontSize: 11.5,
              }}>
                ▲ {next.name} · ⬡ {next.cost.toLocaleString()} — <span style={{ opacity: 0.75 }}>{next.blurb}</span>
              </button>
            ) : (
              <div style={{ marginTop: 4, fontSize: 11, color: '#7be0a0' }}>◆ maxed</div>
            )}
          </div>
        );
      })}
      <div style={{ fontSize: 10.5, opacity: 0.5 }}>
        data comes from documenting life — rarer catches and first discoveries pay more.
        {note ? ` ${note}` : ''}
      </div>
    </div>
  );
}
