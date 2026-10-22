# Aeon — Engine & Pack Contract

**Aeon** generates a world, simulates thousands of years of its history, and hands you the
encyclopedia it wrote along the way.

The simulation engine is **genre-agnostic**. It knows about regions, polities, figures,
artifacts and events — not about knights or starships. Everything with flavour lives in a
**pack**: a file under `packs/` that supplies names, biomes, eras, archetypes and an event
table. Swapping the pack swaps the genre.

**READ THIS ENTIRE FILE BEFORE WRITING CODE.**

---

## 1. Hard constraints (non-negotiable)

1. **No build step, no bundler, no npm, no TypeScript.** Plain ES2020 JavaScript.
2. **No ES modules.** No `import` / `export` / `type="module"`. The page runs from `file://`,
   where modules and `fetch()` are blocked.
3. **No network access.** No `fetch`, no CDN `<script>`, no external fonts or images.
   Everything is generated in code or drawn on canvas.
4. Wrap every file in an IIFE: `(function(){ "use strict"; ... })();`
5. The only globals are `AEON` (the engine) and whatever the engine explicitly exposes.
6. **Determinism is sacred.** The same seed must always produce the same world and the same
   history. Never call `Math.random()` — use the supplied `rng` everywhere. A single stray
   `Math.random()` breaks reproducibility and shareable seeds.
7. **Never mutate world state outside of an event's `run()`** or the worldgen phase.
8. Syntax-check before you finish: `node --check <your file>` must pass.

---

## 2. The world data model

The engine builds and owns this. Packs read it and mutate it only through helpers.

### 2.1 `world`

```js
{
  seed: 1234567,            // integer
  packId: "fantasy",
  scale: "planet",          // galaxy-scale worlds live in the galaxy-generator project
  year: -2000,              // current simulated year
  startYear, endYear, timeStep,   // timeStep = years per tick
  width, height,            // region grid dimensions
  regions: [Region],        // flat array; region.id === its index
  polities: { [id]: Polity },
  figures:  { [id]: Figure },
  artifacts:{ [id]: Artifact },
  chronicle: [Event],       // append-only, chronological
  era: "bronze",            // current era id
}
```

### 2.2 `Region` — a province

```js
{
  id, x, y,
  name,                     // named lazily when it first matters
  elevation,                // 0..1   height; ocean <= 0.5
  temperature,              // 0..1
  moisture,                 // 0..1
  biome,                    // a key from pack.biomes
  habitability,             // 0..1   drives population ceiling
  resources: { food, metal, exotic },   // each 0..1
  barren,                   // true for ocean and lakes
  owner,                    // polity id, or null
  population,               // integer
  settlement,               // null | { name, tier: 1..4, founded }
  features: [],             // pack-defined: "ley-line", "nebula", "ruins", ...
  neighbors: [regionId],
}
```

### 2.3 `Polity` — a kingdom, republic, horde, star empire

```js
{
  id, name, adjective, archetypeId,
  founded, ended,           // ended = null while alive
  capital,                  // regionId
  regions: [regionId],
  traits: { aggression, piety, curiosity, stability, cunning },  // each 0..1
  tech,                     // 0..1, advances over time
  population, wealth, military, prestige,
  ruler,                    // figure id, or null
  rulers: [figureId],       // historical
  relations: { [polityId]: -1..1 },   // negative = hostile
  color,                    // hex, assigned by the engine
  fate,                     // null | a sentence written when it ends
}
```

### 2.4 `Figure` — a ruler, hero, heresiarch, admiral, scientist

```js
{
  id, name, title, role,
  polityId, born, died,     // died = null while alive
  traits: { ambition, wisdom, cruelty, charisma },  // each 0..1
  deeds: [eventId],
  epitaph,                  // written at death
}
```

### 2.5 `Artifact` — a relic, a wonder, a megastructure, a lost text

```js
{ id, name, kind, created, creatorId, location /* regionId */, power, legend, destroyed }
```

### 2.6 `Event` — one line of history

```js
{
  id, year, type,           // type = the EventDef id that produced it
  packId,
  importance: 1..5,         // 5 = world-defining; drives filtering and font size
  actors: [{ kind: "polity"|"figure"|"artifact"|"region", id }],
  regionId,                 // null if not geographic
  text,                     // generated prose, one or two sentences
  tags: [],                 // "war", "plague", "founding", ...
}
```

---

## 3. Writing a pack

One file per genre at `packs/<id>.js`:

```js
(function(){
"use strict";

AEON.registerPack({
  id: "fantasy",
  name: "Age of Myth",
  icon: "🐉",
  blurb: "One sentence shown on the genre picker.",
  scale: "planet",              // the only scale here
  startYear: -2000,
  endYear: 1200,
  timeStep: 5,                  // years per simulation tick
  seedPolities: 9,              // how many to start with

  yearLabel: function (y) { return y < 0 ? (-y) + " BR" : y + " AR"; },

  biomes: { ... },              // see §3.1
  eras: [ ... ],                // see §3.2
  archetypes: [ ... ],          // see §3.3
  names: { ... },               // see §3.4
  events: [ ... ],              // see §4 — the heart of the pack
  flavor: { ... },              // optional prose pools
});

})();
```

### 3.1 `biomes`

Maps a biome key to its presentation and its effect on habitability. The engine's worldgen
classifies each region by elevation/temperature/moisture and then asks the pack to name it.

```js
biomes: {
  tundra:    { name: "Tundra",     color: "#b8c6d9", habitability: 0.18 },
  forest:    { name: "Deep Wood",  color: "#2f6b3f", habitability: 0.78 },
  // ... cover: barren (ocean), ice, tundra, taiga, grassland, forest,
  //            jungle, savanna, desert, mountain, swamp
}
```

### 3.1b `ages` (optional)

Levels a realm reaches on its own, unlike `eras`, which turn for the whole world at a date.

```js
ages: [
  { id: "bronze", name: "The Bronze Age", short: "Bronze", at: 0 },     // where every realm starts
  { id: "iron",   name: "The Iron Age",   short: "Iron",   at: 940 },
]
```

`at` is **learning**: the engine adds `tech x years` to each realm every tick, so it keeps rising
after `tech` saturates. A new realm starts from the learning of whoever held its land before it
(a successor keeps its parent's age), or from half the median on empty land. The engine logs each
crossing in `polity.ageLog` (`[{ age, year, inherited? }]`); `AEON.ageAt(world, polityId, year)`
reads it. Nothing in the simulation reads learning, so adding or tuning ages never changes a
history. Calibrate `at` to the median realm's learning at the year an age should typically begin.

### 3.1c `settlementTiers` (optional)

Names for settlement tiers 1..4; the default is `["", "village", "town", "city", "great city"]`.
Packs may change `region.settlement.tier` freely inside events: the engine notices once a tick and
logs it (`world.settleLog`), so statistics and past-year views stay right.

### 3.1d `wonderKinds` (optional)

Artifact kinds that are buildings: they stay where they were made (`location`), never get carried
off, and count as **wonders** on the map and in the statistics. An artifact can also be marked a
wonder on its own with `art.wonder = true`. A wonder stands from `created` until `destroyed`.

### 3.2 `eras`

An ordered ladder. The engine advances the era by year, and events can gate on it.

```js
eras: [
  { id: "bronze",    name: "The Bronze Age",  from: -2000 },
  { id: "iron",      name: "The Iron Age",    from: -600  },
  { id: "classical", name: "The High Age",    from: 200   },
]
```

### 3.3 `archetypes`

Starting flavours for polities. `traitBias` is added to a random base and clamped.

```js
archetypes: [
  { id: "kingdom",  name: "Kingdom",  traitBias: { aggression: .1, stability: .2 },
    blurb: "A hereditary crown and a long memory." },
]
```

### 3.4 `names`

Procedural name generators. **Every one takes `rng` as its first argument** and must be
deterministic. Build them from syllable tables and templates — write enough source material
that a 3000-year history does not repeat itself. This is where a pack earns its keep.

```js
names: {
  polity:     function (rng, ctx) { return { name: "Valmoria", adjective: "Valmorian" }; },
  figure:     function (rng, ctx) { return "Aerath the Younger"; },
  place:      function (rng, ctx) { return "Thornmere"; },
  settlement: function (rng, ctx) { return "Greyharbour"; },
  artifact:   function (rng, ctx) { return "The Dimming Crown"; },
}
```

`ctx` carries `{ world, polity, region }` where relevant, so names can inherit culture — a
city in a Valmorian province should sound Valmorian. Doing this well is most of what makes
a generated world feel real.

---

## 4. Events — the heart of a pack

An event is a rule: when its preconditions hold, it may fire, mutate the world, and write a
line of history.

```js
{
  id: "war-declared",
  scope: "polity",        // "polity" | "world" | "figure"
  weight: 10,             // relative likelihood among eligible events
  minEra: "iron",         // optional era gate
  maxEra: null,
  cooldown: 40,           // optional: years before this can fire again for the same subject

  test: function (ctx) { return ctx.polity.military > 0.3 && ctx.rivals().length > 0; },

  run: function (ctx) {
    const foe = ctx.pick(ctx.rivals());
    ctx.polity.relations[foe.id] = -1;
    return {
      importance: 3,
      tags: ["war"],
      actors: [ctx.actor(ctx.polity), ctx.actor(foe)],
      regionId: ctx.polity.capital,
      text: ctx.polity.name + " declared war upon " + foe.name + ", citing " +
            ctx.choice(CASUS_BELLI) + ".",
    };
  },
}
```

Return `null` from `run()` to abort silently (e.g. a precondition that only became false
once you looked closer).

### 4.1 `ctx` — what an event is given

| Member | Description |
| --- | --- |
| `ctx.world` | the whole world object |
| `ctx.rng` | the seeded RNG — **the only source of randomness** |
| `ctx.polity` | the subject (scope `"polity"`) |
| `ctx.figure` | the subject (scope `"figure"`) |
| `ctx.year` | current year |
| `ctx.era` | current era id |
| `ctx.pick(arr)` | random element (uses `rng`) |
| `ctx.choice(arr)` | alias of `pick`, reads better for prose pools |
| `ctx.chance(p)` | `true` with probability `p` |
| `ctx.int(a, b)` | random integer in `[a,b]` |
| `ctx.rivals()` | living polities bordering or hostile to the subject |
| `ctx.neighbors(polity)` | living polities adjacent to it |
| `ctx.regionsOf(polity)` | its regions |
| `ctx.actor(obj)` | wraps a polity/figure/artifact/region as an `actors[]` entry |
| `ctx.newFigure(polity, role)` | creates and registers a figure, returns it |
| `ctx.newArtifact(opts)` | creates and registers an artifact |
| `ctx.transfer(region, toPolity)` | moves a region between owners, updates both |
| `ctx.foundSettlement(region, tier)` | names and places a settlement |
| `ctx.siteSuitability(region)` | how well a place can hold people, 0..1 (biome, height, habitability) |
| `ctx.maxTier(region)` | the largest settlement the place can hold; `foundSettlement` clamps to it |
| `ctx.pickSite(regions)` | a region to found a settlement in, weighted by suitability; `null` if none can hold one |
| `ctx.endPolity(polity, fate)` | kills a polity, writes its fate, frees its regions |
| `ctx.kill(figure, epitaph)` | kills a figure |
| `ctx.spawnPolity(region, archetypeId)` | births a new polity |
| `ctx.name(kind, extra)` | calls the pack's name generator for `kind` |

### 4.2 What makes a good event table

- **Aim for 40-70 events per pack.** Fewer and the history repeats; more is welcome.
- Cover the full arc: founding, expansion, golden ages, succession, schism, plague, famine,
  war, conquest, rebellion, collapse, ruins, rediscovery.
- **Write consequences, not just announcements.** An event that only prints a sentence is
  decoration; one that moves a border, kills a ruler, or seeds an artifact that a later
  event can find is history.
- **Let events reference the past.** `ctx.world.chronicle` is readable — an event that
  avenges a defeat from 300 years ago is worth ten generic battles.
- Vary importance honestly: most events are 1-2; a dynasty falling is 4; an extinction or
  first contact is 5.
- Prose should be **dry and specific**, in the register of a real chronicle. Concrete nouns,
  invented specifics, no winking at the reader. "The Dimming Crown was carried out of
  Thornmere by a servant whose name was not recorded" beats "something crazy happened!".

---

## 5. Checklist before reporting back

- [ ] File is `packs/<id>.js`, one IIFE, `"use strict"`.
- [ ] `node --check` passes.
- [ ] No `import`/`export`/`fetch`/external URLs/`Math.random()`.
- [ ] Every name generator takes `rng` first and is deterministic.
- [ ] 40+ events, most of which change world state rather than only narrating.
- [ ] Biome keys cover the full set listed in §3.1.
- [ ] Prose reads like a chronicle, not like a game log.
