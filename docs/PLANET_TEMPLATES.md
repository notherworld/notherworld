# PLANET TEMPLATES — extracting Atlas's cores into a skinnable, law-driven surface system

*The design doc for the final rung: any planet / moon / asteroid in notherspace
resolves to an Atlas-style living surface whose LAWS derive from its address chain.
Written before implementation so the hard ideas are settled once. Companion to
ENGINE.md (the data vocabulary), DEMO_RENDER_HANDOFF.md (the render laws), and the
memory `notherspace-address-ladder` (the top half, BUILT).*

**The one-line goal:** planet Kailon of Androminor is ALWAYS a lava world with its
own palette, weather, and creatures — for every visitor, forever — and building a
new kind of world is a DATA exercise, never a fork of Atlas.

---

## 0. What "template" means here (and what it does not)

A planet template is NOT a new engine feature and NOT a copy of Atlas. It is three
existing mechanisms pointed at each other:

1. the loader's **`templates` deep-merge** (ENGINE.md §4 — already shipped) and the
   planned **spec compose** (multi-file merge with an identical-build probe);
2. Atlas's render layer with its **meaning tables extracted to data** (finishing
   render law #5: "meaning drives looks via stats, not hardcoding");
3. the notherspace **facts-are-laws chain** (`studio/src/view/facts.ts`), which
   already rolls each body's type, temperature, life tier, and bias from its address.

Nothing here adds a prim. If an idea below seems to need one, re-read ENGINE.md §7's
discipline first: author a world that proves the gap, then add the smallest prim.

## 1. HARD IDEA #1 — the SKIN schema (render side)

Atlas hardcodes meaning: terrain palette ramps, `useOf` (use → color/label),
water/river color, rain look, sprite tints. Extract these into ONE `skin` object
that ships INSIDE the world spec (the host reads the spec as data — same pattern as
"render recipes are the host's side of the pair", ENGINE.md §4 templates note):

```jsonc
"skin": {
  "terrain":  { "low": "#0b3a2e", "mid": "#3f7d4e", "high": "#c9d8c5", "sea": "#123a52" },
  "water":    { "hue": 145, "label": "the green rivers" },      // green rivers = numbers
  "weather":  { "rain_tint": "#e8d44d", "rain_label": "yellow rain" },
  "beings":   { "skin_hues": [90, 110], "label": "the green folk" },
  "flora":    { "hues": [200, 260], "density": 1.4 },
  "glyphs":   { /* use → color/label rows — today's useOf table, as data */ }
}
```

Rules:
- The renderer keeps ONE code path. It never branches on "planet type" — it reads
  `skin` values. If a look can't be expressed by the schema, extend the SCHEMA
  (append-only, like the lexicon), don't special-case the renderer.
- Defaults = today's Atlas look, so `city.json` without a `skin` renders unchanged
  (the identical-build/identical-render guarantee is the regression test).
- Sprite variety (jumbo spiders vs pawns) = a `beings.form` key selecting from a
  small set of body-plans the renderer owns (pawn / beast / swarm …), each tinted
  and scaled by data. New body-plans are added to the renderer rarely; new SPECIES
  are data (form + hues + size + gait speed).

## 2. HARD IDEA #2 — the LAWS overlay (spec side)

A world spec becomes `base template ⊕ laws overlay ⊕ skin`, merged by the loader
(deep-merge, overlay wins — the mechanism `templates` already implements, promoted
to file level). The overlay is where physics diverges:

- **"It ALWAYS rains here"** = override the cloud/rain field formula with a
  constant-high expression. One line of JSON. (Remember the ENGINE.md broadcast +
  event-vs-rule gotchas — weather flags must be RULES so they run at every fidelity.)
- **Lava world** = re-meaning the fields: `water` field becomes "lava" only in the
  skin's labels/colors; the ENGINE never knows (its algebra is meaning-free — the
  "REMEMBER WHAT THESE PRIMS ARE NOT" law). Danger fields, heat stats, and
  route costs (`cost: 1 + 40*field(lava,fx,fy)`) make it BEHAVE volcanic.
- **Biome balance** (more/fewer forests, oceans) = the field formulas' constants.
- **Society on/off** (Hard idea #4 below) = which overlay files merge at all.

Merge order is fixed and documented: `surface_base.json` (structure: scope tree,
generators, circulation) → `type overlay` (lava/ocean/verdant/asteroid …) →
`life overlay` (none/critters/society) → `skin`. Later files win. A probe asserts
compose determinism (same files → bit-identical world), extending `packprobe`/
`cityprobe` style guards.

## 3. HARD IDEA #3 — the ADDRESS → TEMPLATE derivation (the bridge)

The chain already exists in `facts.ts` — the surface system CONSUMES it, never
re-rolls it:

```
universeFacts(seed).bias      → weights the type-overlay choice for every body in it
planetOf(seed, i, star)       → type (lava/ocean/living/…) = WHICH type overlay
                              → tempK, orbit → field constants (ice line, humidity)
starOf(seed)                  → light color for the skin's daylight grade
planetOf(...).life            → WHICH life overlay (none / critters / society)
mix(planet address chain)     → the surface world's rng_seed
```

Rules:
- **The fact sheet is the contract.** Whatever the hover card promised at the
  system rung (type, temp, life) MUST be what the surface delivers — same salts,
  same seeds, the galaxyCoreOf pattern ("the sheet promised it; the center
  delivers it"). Any drift here breaks the whole demo's credibility.
- Derivation lives in ONE module (`facts.ts` or a sibling `laws.ts`) so upgrading a
  fact into a deeper law never touches two places.
- Creature species roll from the address too: `speciesOf(seed, biome)` picks a
  body-plan + palette + temperament from append-only tables → "jumbo spiders" is
  a row, not a build.

## 4. HARD IDEA #4 — society is EARNED, not default

Only some worlds carry societies .
The life tier already rolled at the system rung gates the merge:

- `life: none`        → geology only: terrain, weather, routes. No agents. Cheap.
- `life: microbial`   → critter layer: wandering fauna (behavior JSON), no economy.
- `life: verdant`     → the full society overlay (TEMPLATE_CATALOG.md's ladder:
                        clock → person/schedule → venue → goods → merchant) with
                        the species' skin.

This is also the perf story: most addresses resolve to cheap worlds; the expensive
society sim only exists where the address chain earned it — LOD at the LAWS level,
same philosophy as sim-LOD at the scope level.

## 5. Sequence (when implementation starts)

0. **THE WORKBENCH FIRST — `studio/temple.html`, the design zone.** A lab page
   (precedent: `lab.html`) that renders ONE surface from `base ⊕ overlay ⊕ skin`
   with instant iteration controls: a template picker, a seed field (FIXED while
   designing — determinism is the point), skin sliders/color fields that hot-apply,
   and a side-by-side compare slot (ice mountain vs lava mountain vs crystal
   mountain = the SAME elevated terrain, different ground makeup — prove it by
   flipping only the overlay). No ladder-diving to test: a world designer works here,
   Opus mass-produces here, and the SAME code path ships as the planet surface
   (the workbench is not a fork — it IS the extraction, step 1-3, with knobs).
   When the template look locks, the knobs' output is saved as the overlay/skin
   JSON and the procedural chain (address → laws) takes over frfr.
1. **Extract the skin**: move Atlas's hardcoded tables behind a `skin` reader with
   today's values as defaults; assert pixel-identical render on `city.json`.
2. **Spec compose**: file-level merge in the loader + determinism probe.
3. **Two proof overlays**, maximally apart: a lava world (no life) and a verdant
   world (green rivers, yellow rain, green folk) from the SAME base. The wow
   screenshot is these side by side with their address paths.
4. **Wire the bridge**: clicking a planet in notherspace hands `(address chain →
   rng_seed, type, life, skin)` to the Atlas surface. The ladder is closed.
5. THEN mass-produce: Opus goes wide on overlays/species/skins — pure data, guarded
   by the compose probe + the fact-sheet contract. (Asteroids/moons use a slimmer
   `surface_base` — smaller scope tree, no districts — same schema.)

**Guards throughout:** the untouched-`city.json`-renders-identically check, the
compose determinism probe, and the standing sweep (`saga` 0.27, `lodaudit` 11 PASS,
`packprobe`) after any loader change.

---

## 6. THE FINALIZED CONTRACT — engine vs renderer hooks (temple v3 codifies it)

The demo's thesis, stated once and enforced everywhere: **the engine is PURE
DATA** — entities, laws, fields, routes are JSON through a meaning-free
interpreter — and the renderer is a set of NAMED HOOKS that interpret engine data
through an overridable template. Nothing else exists. The split:

| | ENGINE (owos — never knows meaning) | RENDERER HOOKS (the pairing, all template-overridable) |
|---|---|---|
| ground | `fields` formulas → elevation/moisture | terrain ramp, hillshade, shoreline foam |
| transitions | field algebra (`shore = and(land, near(water,r))`) | WHAT a shore IS (sand/pebble/cliff/shard/shelf) + WHICH BAND it materializes at |
| growth | moisture field | flora density law × flora color (green here, violet two galaxies over) |
| weather | cloud/rain fields + rules | what falls + its color ("always rains, and rain is yellow here") |
| circulation | `routes` + cost formulas (lattice-lock = a cost LAW, not a road type) | road color/weight per band |
| settlement | partitions, carves, `region_at` | district tint, lot fill, roof/building form |
| buildings/beings | entities + behaviors (society overlay) | construction-plan + body-plan pick, color, size, pace |

Rules of the contract (temple `src/temple/templates.ts` is the reference impl):
- **One render path.** Hooks read template data; they never branch on world type.
- **Extending = adding a hook or a form to a hook's small enum** (a new beach
  kind, a new body-plan). Overriding = data. Neither forks the renderer.
- **Levels gate**: `society: 'none'` strips settlement/circulation/beings from
  the SPEC (the engine never lays them) and hides their controls. Dead worlds
  are cheap by construction.
- **Zoom-earned fidelity is a LAW**: each detail declares the band it
  materializes at (temple: `transitions.band`; flora densifies at district band).

**The Atlas-detail PORT BACKLOG** (Opus's canvas — pull each hardcoded fidelity
layer from `DEMO_RENDER_HANDOFF.md` into a hook, one at a time, additive):
shoreline mud/reeds/wet stones → transition sub-kinds · yard tufts/pebbles →
flora forms · worn door→street paths · fences (picket vs stone by use) → a
boundary hook · curbs/cracks/centre lines → road dressing by band · clustered
trees w/ shadows → flora canopy form · boulders · roofs/parapets/HVAC → building
form tables · furniture-by-use → interior hook · pawns → being forms (biped/
beast/swarm/arachnid/amorph shipped as the starter enum).

## 7½. STATUS — the charter is BUILT (v1) and it is ONE SYSTEM

Implemented 2026-07-22, the tie the demo is about:
- `view/facts.ts` owns `BASE_DISTS` — the LITERAL constants the derivation
  formulas read (cloudy 0.3, belts 0.75; life = physics-gated). Temple's charter
  sliders initialize FROM them and save overrides TO localStorage; notherspace
  calls `setDists(charter)` at boot — every fact sheet, belt count, and life roll
  in the visitor's notherverse obeys. No parallel systems: supercluster to the
  man, one derivation chain.
- Charter = `{ tpl, strength, dists }` — the surface template as the universe's
  default makeup, `strength` = how often bodies obey it, `dists` = the dials
  (life %, heavy-atmosphere %, belt %). Variance chain in `templeFor()`: ~7% of
  GALAXIES run the charter inverted; every SYSTEM re-ratios strength ×0.7–1.3;
  each BODY still rolls — most worlds are yours, some stay alien.
- **⤓ explore closes the ladder**: click a planet/moon/rock in nother → warp
  (the wormhole animation) → `temple.html#x=…` arrival AS that body: natural
  type from its physics, charter-tilted, seeded by its address chain. Universe →
  … → surface, one unbroken click-path. (The next rung — surface → block →
  BEING, "down to a pig" — is the Opus render phase over the same machinery.)
- Planet SIZE is law: `planetOf` rolls `sizeKm` → `grid` (`surface N×N regions`
  on the sheet) — a big planet is literally more surface. The GLOBE WRAP (top
  tile row meets bottom — torus topology) is designed, not built: it lives in the
  tile-streaming layer (Atlas `ensureTile` camera), wrap = modulo tile coords at
  grid N, with the wrap seam hidden by a DATA law (a date-line ocean: elevation
  masked below sea level along the seam column via `mod(fx…)` — pure DSL, no
  engine change). Build it in the Atlas streaming session, with git.

## 7. UNIVERSE CHARTERS — "launch your ENTIRE own universe"

The same override pattern, one level up: today `facts.ts` rolls distributions
from fixed constants (IMF tail, ore weights, planet-type bands, galaxy density).
A **charter** is a data object that overrides those distributions for one
universe: `{ planetTypeWeights: {lava: 5, …}, oreWeights: {gold: 8, …},
starIMF: …, galaxyDensity: …, floraPalette: [hues] }` — so someone launches a
universe where 95% of planets run red and gold is the common ore, and it is
STILL deterministic: charter + address → same world for every visitor. Design
constraints (settle before building): charters attach at the UNIVERSE rung
(everything below inherits); the charter serializes into the share-link (or a
registry keyed by universe addr); `facts.ts` functions grow an optional charter
param with today's constants as the default charter — one file, additive.
Temple is the authoring UI precedent; a "charter tab" is its universe-scale twin.
