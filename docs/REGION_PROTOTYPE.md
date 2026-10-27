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

### Step 2, the region's history (2026-10-27, planet and histories unchanged)

`AEON.createRegion(world, squareIndex)` (js/region.js) makes a world of its own for a square:
the region map, its own random stream (seed + ":history:" + square), and a history the ordinary
engine plays (`AEON.tick` / `AEON.runAll`), following the sketch:

- **The beyond band** is drawn but held by no one: its land is marked barren (and lake, so it
  is not a shore), keeping its biome in `r.beyondBiome`; the square's cells have no links to it.
- **Starting realms**: each sketch people gets a realm at its seat, named as in the sketch, and
  more realms of its culture in the land nearest its seat. In all as many as the square's good
  land is worth against the planet's, up to the pack's seedPolities (median 13 of 16).
- **Ages**: each turn a realm's learning is pulled towards the square's curve (8% of the gap
  from behind, 25% from ahead, as the engine's growth keeps pushing). The region reaches each
  age within the century the sketch names for it.
- **Incoming contacts**, in the sketch's year, at the border facing their homeland or on the
  coast facing it:
  - trade: a chronicle line
  - raids that only plundered: up to three towns there plundered
  - newcomers: a realm of their own, with their homeland's learning and a stronger army. Over
    3-10 turns they take the share of the land the outcome says (foothold 3%, settled 8%, colony
    15%, partial 35%, conquest 75%), outward from where they came in. If they are wiped out
    before that, a fresh wave comes. Repelled newcomers are driven out after 15 years. Then the
    engine is free.
  - more of a people already there join their kin
- **Outgoing contacts**: a chronicle line from the realm on the side facing the target, and
  some of its people gone.
- **Dark ages**: every realm loses knowledge (`AEON.techShock`), with a chronicle line.
- **Room**: a region has about 2.8 times the planet map's land, so its realms spread that many
  times faster (`world.expandTries`, read by core.js's natural expansion; 1 on the planet).
- core.js: `newWorld()` split out of createWorld, `AEON._core` exposes the engine's pieces,
  and the tick calls `world.onTick` if a world has one. The planet's maps and the histories of
  seeds 7 and 42 in both packs are unchanged.

Harness: `node tools/region-history.js` (18 seeds x the 3 largest lived squares;
`--pack fantasy`, `--show <square>` prints a region's chronicle). Results in
tools/out/regions/history.txt. Over 54 historical regions (min / median / max):

| | |
|---|---|
| realms at the start / at the peak / at the end | 7 / 13 / 16, 45 / 47 / 49, 8 / 10 / 38 |
| inner land held at the end (planet map, seed 7: 84%) | 58% / 72% / 100% |
| largest realm's share of the land at the end | 13% / 30% / 83% |
| sketch contacts told in the chronicle | all, in every region |
| campaigns holding the sketch's share at their end | all but one (a foothold on a small island, 9%) |
| fresh waves needed | none |
| newcomers lasting after their campaign | 25 / 630 / 4,145 years |
| age reached, region minus the sketch's century | -5 / 60 / 145 years (p10 20, p90 100) |
| make the region / play its history | 0.34 s / 7.6 s |

Fantasy (6 seeds, 18 regions): 12 realms at the start, 29 at the peak, 16 at the end; 38% of
the land held at the end (planet map, seed 7: 43%); ages -195 / 40 / 95 years; 3.1 s a history.

From seed 42, square 3,1:

> 2660 BC: Skolremustgardian herders came over the south border with their herds at Trobang
> Baliq, in the lands of Nashimia. 2645 BC: The Skolremustgardian newcomers settled the country
> round Trobang Baliq, and stayed. ... 5 AD: A dark age fell on the land. ... 1425 AD:
> Skolremustgard sent ships south-east across the open sea to the lands of Tidalghuular.

Known limits:

- A newcomer's campaign spreads over connected land only, so newcomers landing on a small
  island hold just that island.
- After their campaign the engine may destroy newcomers quickly (25 years at the least), so a
  region can tell "conquered" and then lose the conquerors soon after.
- Region histories are not in the app yet (step 3).

### Step 3, regions in the app (2026-10-27)

- **The old whole-planet history is gone** (decision 4). "Forge the world" makes the planet and
  its sketch (`createWorld({ planetOnly: true })`: no realms of its own) and opens straight away
  on the World mode. The planet's modes are world, biome, elevation and habitability; the header
  shows the year, the inhabited lands, the peoples living then and the clashes and crossings so
  far; the world timeline fills the right sidebar. Play, scrub and the great-moment buttons
  step through the sketch's years and contacts.
- **Opening a region**: click a square in the World mode. A plaque names it (age, peoples) with
  **Open this region**; the first time it makes the region and plays its history with the usual
  progress bar, after that it opens at once (regions are kept for the session; one left half
  played resumes). A region is the app as before: political, diplomacy and the other modes, the
  chronicle, statistics and export. **Back to the world** returns to the planet in the same year.
- **The beyond band** is drawn over the region as the neighbouring land, dimmed and hatched, with
  a dark rule along the square's edge; hovering it names the land beyond.
- The link keeps the place: `#pack=historical&seed=7&region=4,2&mode=political&year=500` opens
  that region in that year.

**Conquest toned down (Daan: a conquest is not full control of a land).** Two changes to step 2:

- A sketch outcome now takes much less outright, over longer (a turn is 5 years): foothold 2%
  over 4 turns, settled 5% over 6, colony 8% over 10, partial 12% over 12, conquest 25% over 20.
  The share is of the land people hold at the time (at least a tenth of the land), so an early
  conquest of a thinly settled land is a small one. After a conquest the realms beaten, and those
  whose capitals lie near the conquerors' new lands, become their vassals; the engine decides
  how long that lasts. A campaign that runs out of land on its own landmass goes on across the
  water to the nearest land. Seed 7's "Narmanat conquered Saneustirnis" (2724 BC) is now 3% of
  the land and two vassals; seed 42's conquests in the 2300s BC take 2-4% and five to twelve
  vassals.
- **Overreach** (core.js, worlds with `world.reach`; regions use 0.3): a realm holding more
  than half the reach starts to overreach, fully at the reach (30% of the land). Its conquests
  mostly stall, its vassals are no longer folded in and break away more easily, and it spreads
  into empty land more slowly. The largest realm in a region now peaks at 21-36% of the land
  (median 31%), down from up to 80%. Big powers rise over centuries and fall back: seed 99's
  largest held 27% at 0 AD and 17% by 500 AD. The planet has no reach, so its history engine is
  unchanged (same-seed planet histories still identical).

Over 54 historical regions with these rules (`node tools/region-history.js`): realms 13 at the
start, 47 at the peak, 11 at the end; 73% of the land held at the end; largest realm 12-34% at
the end; every sketch contact told; every campaign held its share; ages 60 years into the
sketch's century (median). Making a region takes 0.3-0.9 s and its history 6-13 s here (in the
app a little longer, as the map is drawn while it plays).
