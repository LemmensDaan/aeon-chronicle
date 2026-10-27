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

  The sketch's outcome steers the strength. The region's own result is what its chronicle
  tells.
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

The whole-planet history still runs at load until the planet screen replaces it (the step after
this one). Until then, the world mode and the regions sit beside it.

## Questions for Daan

1. **Straight edges.** Borders stop at the square's edge, with hatched "beyond" land past it.
   Fine for the prototype? (Recommended: yes. Nicer region shapes come with the grid tuning
   later.)
2. **The sketch's outcome: steer or force?** If the sketch says "conquered" and the defenders
   win inside the region, the two disagree. (Recommended: steer strongly, so they agree most of
   the time, and let the region's result be its story. Forcing makes the region's wars
   scripted.)
3. **Starting realms per square.** Several realms per sketch people, scaled by habitable land,
   up to today's 14-16. Or only the sketch's 1-4 peoples, with the engine founding more over
   time? (Recommended: several per people; one realm alone in a region is dull for centuries.)
4. **The old whole-planet history at load.** It costs about 10 seconds and is replaced later.
   Keep it until the planet screen? (Recommended: yes, so nothing breaks in between.)
