# TEMPLATE CATALOG — the core systems to author as data templates

*The society/economy/activities blueprint: what to TEMPLATE (reusable JSON
recipes over existing prims — same mechanism as `carved_plot_lots`) to finish
Atlas-as-a-game and PIXELANTA. A template is captured know-how, not engine
code: the engine never learns what a "shop" is. Every template ships with a
`live`/probe gate before anything renders it (the house rule).*

*Precedent markers: ✅ = the pattern already runs somewhere (cited); 🆕 = new
composition of existing prims; ⚠️ = touches a KNOWN untested prim shape
(CLAUDE.md: discrete inventory, scheduled-at-time events) — probe FIRST, be
ready to discover a prim gap honestly.*

---

## 0. `clock` — the one everything else reads 🆕 (build FIRST)
World-scope `hour`/`day`/`season` stats advanced by rules; `is_night`,
`is_workday` derived. Drives schedules, venue hours, the renderer's day/night
grade (the atmosphere pass reads the SAME stat the sim uses — one truth).
*Prims: rules only. Trivial, but sequenced first because everything gates on it.*

## 1. People & daily life (`society.json` core)

- **`person`** ✅ (metro/afterhours occupants): needs as decaying stats
  (energy/hunger/social), utility-AI actions (sleep/eat/work/socialize/wander),
  `home` + `work` anchors as edges, movement via `move` along door-chains and
  routes. The player is a `person` with intents exposed — no player-only system.
- **`schedule`** 🆕: actions phase-gated on clock (`work` scores high when
  `is_workday && at_work_hours`). NOT scheduled-at-time events (⚠️ shape) —
  continuous clock-gates sidestep the untested prim.
- **`household`** 🆕: family scope under a home; rollups (income, food);
  spawn-inheritance for kids (prim exists ✅).
- **`relationships`** ✅ (saga's feud/warmth/tension): edges formed by
  co-location (`co:` effects), decayed by absence; kin/friend/rival kinds.
- **`status`** ✅ (regime's emergent overthrow): reputation = rollup of
  relationship edges + wealth; leadership emerges from status, never assigned.
  This is the kingdoms/crews substrate.

## 2. Economy

- **`goods`** ✅ (the drain-rollup prim was built for this): stock as flow
  stats — producers add, consumers drain, per-tick truth. Aggregate goods
  ("food", "merch"), NOT discrete items (⚠️ — probe discrete separately later;
  don't block the economy on it).
- **`jobs`** 🆕: workplace claims workers (edges), wage = flow from business
  income stat → person money stat. Unemployment emerges when businesses fail.
- **`prices`** ✅ (scarcity recipe at district scale): price =
  f(stock, demand, district wealth); the proven rollup-suppression pattern
  applied to commerce. THE stat the war-trickle clip reads.
- **`merchant`** 🆕 (the information carrier): a person who BUYS where cheap,
  travels real routes, SELLS where dear; stock rides the entity. Distant
  disruption reaches you as HIS prices — no event feed. (DEMO_ULTIMATE_SPEC §6
  depends on exactly this template.)
- **`property`** ✅ (plot lifecycle + Claim ledger exist): add `value` =
  f(district wealth, road_access, work) + a transfer action writing the ledger.
  PIXELANTA's real-estate loop is this template alone.

## 3. Activities & places

- **`venue`** 🆕 (the big one for vibe): any draw-place — restaurant, club,
  church, barbershop, park, studio. Open-hours (clock-gated), capacity, `draw`
  stat; people choose venues by utility (distance + preference + busy). ATL
  culture is largely VENUE culture — this template carries the flag.
- **`gathering`** 🆕: rising-edge event when a venue crosses a busy threshold →
  spawns a short-lived `scene` scope (block party, service, game night) that
  boosts relationship formation. Emergent, not scheduled (⚠️ dodge).
- **`crew`** 🆕 (kingdoms-lite, PIXELANTA-scale): shared claims + member edges
  + territory rollup + status. Same grammar as kingdoms in the spec, sized to
  neighborhoods.

## 4. World services

- **`vehicle`** 🆕: a mover entity on route paths (cars on lanes, MARTA as a
  chain-route with a scheduled mover). Speed = the streaming governor (the
  plane/travel-gating law). Parked cars = street furniture spawned per lot.
- **`transit-line`** 🆕: chain route + stops as gates; riders board via move.
- **`weather/seasons`** ✅ (cloud/rain fields + hysteresis run today): template
  the seasonal modulation of fields (moisture shift, daylight length).
- **`travel-gate`** 🆕: unlock stats (ticket bought / airport restored) gating
  cross-tile movement — diegetic loading, per the spec.

## 5. Player glue

- **`player`** 🆕: a `person` with `set_intent` surfaced to input; camera
  follows; needs on the HUD. Claims/purchases/work through the SAME actions
  the sim's people use.
- **`claim/purchase`** ✅ (ledger + work lifecycle): player-initiated versions
  of what the sim already does.

---

## Build order (each gated by a probe before render work)

1. `clock` → 2. `person`+`schedule` (probe: a day-cycle of a block's people —
   sleep/work/eat visible in `live`) → 3. `venue` (probe: evening crowds form)
   → 4. `goods`+`prices` (probe: a shop's stock drains, price rises) →
   5. `merchant` (probe: price gap narrows between two districts as he runs)
   → 6. `jobs`, `relationships`, `status` → 7. `crew` → 8. `vehicle`/transit →
   9. `travel-gate` + `player`.

Steps 1–5 make Atlas feel ALIVE (people with days, lit venues at night,
prices that mean something) — that's the demo finish line. Steps 6–9 are
PIXELANTA's game loop. Everything is `society.json` + templates; the engine
stays frozen unless a probe honestly finds a prim gap (⚠️ candidates: discrete
items, at-time scheduling — both dodged by design above, tested separately).
