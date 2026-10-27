# The region prototype: design

The next piece of the plan in `WORLDGEN_SCALE.md`, after the world sketch (`WORLD_SKETCH.md`):
open one square of the planet as a region with its own detailed map and history, following the
sketch. This is the design only. Nothing is built yet.

## The idea in one paragraph

The history engine already plays at country scale: its city sizes, armies and borders. What is
wrong today is the map it runs on, a whole planet. A region gives the engine a map of the right
size: one sketch square regenerated about five times finer. That makes a map with about as many
cells as today's, so history runs as fast as now. The engine runs mostly as it is, but:

- its starting realms come from the sketch's peoples in that square
- its technology is held near the square's development curve
- the sketch's contacts arrive as dated events: invaders over a land border, fleets on a coast,
  colonists, trade, dark ages
- its own fleets and armies leave for other squares on the sketch's dates

## 1. The region map

**Size.** A square is about 25 x 24 planet cells. Each planet cell becomes 5 x 5 region cells,
so a region is about 125 x 120 = 15,000 cells (today: 150 x 95 = 14,250). A region cell is about
53 x 35 km at the equator, narrower towards the poles, as the planet's cells are. A region spans
60° of longitude and 37.5° of latitude, about 6,700 x 4,200 km at the equator. That is a
continent's worth, so an empire across half of it is Rome-sized.

**What comes from the planet, and what is new.** The planet decides everything at its own
scale; the region adds the detail below that scale, without contradicting it.

- **Elevation:** the planet's elevation, smoothly upsampled, plus fine noise. Below the
  planet's mountain belts the noise is ridged, so a coarse mountain cell becomes ranges and
  valleys, not a flat block. Coasts get their wiggle from the same noise around the planet's
  coastline. A planet sea cell stays sea and a land cell stays mostly land, so the region
  matches the planet map.
- **Climate:** the planet's temperature (°C) and rain (mm) interpolated, with temperature
  corrected for the finer relief, so peaks are colder than the valleys beside them. There is no
  separate climate run: the planet's wind and rain belts are the truth.
- **Rivers:** planetgen's hydrology run again on the fine grid, so rivers find real valleys.
  Rivers that rise outside the square enter it with the planet's flow.
- **Biomes, habitability, resources:** planetgen's own functions, unchanged (the Whittaker
  classify from fix 3).

**The edges.** A region does not wrap. A band about 2 planet cells wide (10 region cells) of
the neighbouring squares is generated and drawn hatched as "beyond". The engine cannot own it;
it is where newcomers come from and where expeditions leave to. Borders will stop at a straight
line along the square's edge. That is the grid's oddity Daan accepted for now.

**Work in planetgen.** The stages after the climate (hydrology, biomes, regions) become
functions that take a grid with its neighbour lists and a wrap flag. The planet calls them as
before, and the planet's maps and histories must stay identical (checked by hash). A new
`AEON.regiongen(world, squareId)` builds the region grid from the planet's layers on
`world._gen` and calls them.

## 2. The region's history

A region is a world object like today's, with its own random stream (`seed + ":region:" +
square`), so the existing engine, map, chronicle, statistics and export all work on it
unchanged.

- **Starting realms.** Each sketch people in the square seeds the realms of its lands. The
  first realm takes the people's name, archetype and culture; the others are named by the pack's
  namer for the same culture. The count follows the square's habitable land, against the 16
  (historical) or 14 (fantasy) starting realms a map of this size gets today. A square with good
  land gets about as many; a desert square gets a few.
- **Technology on the sketch's curve.** Starting learning comes from the square's curve. Each
  turn, a realm far ahead of or behind the curve gets its tech nudged back towards it. The
  engine keeps its own spread between realms, but the region reaches each age near the year the
  sketch says, within about 150 years.
- **Incoming contacts**, at the edge or coast facing the source square, in the sketch's year:
  - **migration, invasion, raid:** a realm of the arriving people spawns in the "beyond" band
    or on the shore, with an army scaled to the sketch's strength and outcome. The engine's war
    and conquest rules play it out.
  - **colonisation:** a colony realm is founded on the coast, tied to the coloniser as its lord.
  - **trade:** a chronicle entry, and a trade bonus for the coastal or border realms.
  - **dark age:** the engine's fall-back for the realms of the square.

  **The world history stays correct** (decided by Daan): the sketch's outcome is where the
  region must end up; the region decides only how it gets there. The newcomers' strength is set
  from the outcome. If after about 50 years the region falls short (the invaders were beaten
  although the sketch says "conquered"), the engine sends further waves and weakens the defenders
  until the outcome is reached. If the newcomers do better than the sketch allows (they would
  conquer where the sketch says "repelled"), they stall and fall apart. Which cities fall, how
  long it takes and who holds out are the region's own story.
- **Outgoing contacts**: an expedition entry in the chronicle, the fleet or host setting out
  for the target square from the realm that holds the coast or border facing it, at a cost in
  ships or men. The arrival is told only by the target region, when it is opened.
- **Peoples arriving in the sketch** (a people that settled there earlier) are already in the
  square when their arrival year comes, as above.

## 3. In the app

In the world mode, clicking a square offers **Open this region**. The region is generated and
simulated (a few seconds, with the progress bar as now) and shown in the app as a normal world,
with a **Back to the world** button. An opened region is kept for the session, so going back
and forth is instant. The world timeline replaces the right sidebar in the world mode (Daan's
request), and the chronicle comes back in a region.

## Building it, one step at a time

1. **Region map.** Refactor planetgen's later stages to run on any grid (the planet unchanged,
   checked by hash), then `AEON.regiongen`. The harness renders each region next to its planet
   square for 18 seeds and a few squares each. It checks:
   - the land share and coastline against the planet
   - rivers that follow valleys
   - biome shares against the planet square
   - generation time
2. **Region history from the sketch.** Starting realms, tech held to the curve, incoming and
   outgoing contacts. The harness runs the history of 3 squares per seed and checks:
   - each age reached within ±150 years of the sketch
   - every incoming contact appearing in the chronicle
   - how often the region's result matches the sketch's outcome
   - realm counts and sizes at today's levels
   - run time
3. **Open and leave a region in the app.** The world timeline moves to the right sidebar.

The whole-planet history still runs at load until step 3, which drops it (decision 4).

## Decided (Daan, 2026-10-27)

1. **Straight edges** for the prototype: borders stop at the square's edge, with hatched
   "beyond" land past it. Nicer region shapes come with the grid tuning later.
2. **The sketch's outcome always holds**: the region is nudged until it does (see the incoming
   contacts above).
3. **Several starting realms per sketch people**, scaled by habitable land, up to today's
   14-16.
4. **The old whole-planet history is dropped in step 3**, once regions open in the app. From
   then on the app loads the planet and the sketch (about a second) and opens on the world view;
   a history is simulated when a region is opened. (The sketch is the world's fixed outline,
   regions are chapters written to it when opened, and the old history is a separate book written
   before the outline existed.)

## Progress

### Step 1, the region map (2026-10-27, planet and histories unchanged)

`AEON.regiongen(world, squareIndex)` (in js/planetgen.js, also `AEON.planetgen.region`) makes a
region: the square plus 2 planet cells of margin all round ("beyond", `r.beyond`), 5 x 5 cells a
planet cell. That is 145 x 140 cells (fewer at the poles' edge), 15,000 of them in the square
itself. It takes about 0.3 s.

- planetgen's hydrology, biomes and regions moved into `finish()`, which runs on any grid; the
  planet calls it as before. Its maps, sketches and the histories of seeds 7 and 42 in both packs
  are byte for byte the same.
- Elevation: the planet's (Catmull-Rom), plus fine noise. Near sea level the planet's land and
  sea hold, so shallow seas don't break into puddles or plains into ponds. Ridged noise in the
  mountain belts, centred so it adds peaks and valleys, not mountain land. The mountain line is
  set so the square has the planet's share of mountain land, and the planet's mountain cells
  stand a little above the plateaus round them. Two passes of valley cutting by the rivers.
- Climate: the planet's temperature and rain from its land cells, temperature corrected for the
  finer relief with the planet's own height term, plus a little local noise so the climate belts
  get ragged edges.
- Rivers: `finish()` on the fine grid, in planet-cell units of water. Rivers that rise outside
  the window flow in where the planet's rivers cross its edge. Hollows smaller than a planet
  cell are ponds the rivers run on through, not lakes.
- `r.planet` is the planet cell a region cell lies in.

Harness: `node tools/region-report.js` (18 seeds, the 3 largest lived squares each, PNGs and
summary.txt in tools/out/regions/). Over 54 regions (min / median / max):

| | |
|---|---|
| land share, planet vs region | 0.72 / 0.93 / 1 vs 0.72 / 0.93 / 1 |
| cells whose land or sea matches the planet | 0.98 / 0.99 / 1 |
| biome shares differing from the planet square | 1% / 3% / 11% |
| mountain land, planet vs region | 0 / 5% / 29% vs 0 / 5% / 29% |
| habitable land, planet vs region | 16% / 47% / 96% vs 13% / 45% / 96% |
| river cells lower than their neighbours (in valleys) | 86% / 93% / 100% |
| lake cells | 0 / 441 / 1779 |
| generation time | 254 / 307 / 536 ms |

Each PNG shows the planet's cells, the region's biomes and rivers, and the region's relief, with
the "beyond" margin darkened: `docs/worldgen/region-7-3_1.png` (a desert with a river and lakes
fed from the north), `region-99-1_2.png` (a plateau desert under a mountain belt),
`region-42-2_0.png` (tundra and taiga).

Known limits:

- Climate belts follow the planet's smoothly, so biome edges are curves with ragged noise, not
  shaped by the finer relief (no rain shadows of the finer ranges).
- Plates, faults and rifts are the planet's, cell by cell, so those features are blocky.
- Regions where the planet has big lakes get big lake districts.
