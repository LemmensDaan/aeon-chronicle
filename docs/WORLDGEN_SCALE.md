# World scale: planet or region?

2026-10-26. Follows `docs/WORLDGEN_REALISM.md` (the realism review). The decision is at the
top; the discussion that led to it follows.

## Decided (Daan, 2026-10-26)

- **The goal is one chronicle of the whole world**, told at two levels: a planet and regions.
- **Regions are a grid over the planet** for now (for example 6 x 4 squares); odd regions
  (mostly ocean, a continent cut in two) are tuned later.
- **A world sketch at load, about a second:** the peoples and kingdoms of every region at the
  start (names, cultures, capitals), a rough power and technology curve per region, and the
  contacts between regions with dates and rough outcomes (migrations, land and sea invasions,
  trade, colonisation), decided from those curves, the geography and chance.
- **A region's detailed history is generated when it is opened**, at today's cell count (so as
  fast as today), and kept. It must follow the sketch in both directions: region A tells its
  fleet sailing west in 1480, region B tells the strange ships landing on its coast in 1480 and
  decides inside B how far the newcomers get. Regions read only the sketch, never each other,
  so any visiting order tells the same story and every link reproduces.
- The world chronicle is the sketch's events plus the detail of every region opened so far.
- The separate game plays at the chronicle's scale and will adapt to it, so the region level is
  its playing field.
- **Order of work:** climate fixes 1-3 of the realism plan on today's planet (needed at both
  levels), then the world sketch, then one region prototype that follows it, then the planet
  screen with the grid. One piece at a time, each changing every seed's history.

## The findings in short

The review (18 seeds, `tools/worldgen-report.js`) found:

- **Strong:** plate tectonics (plate count and sizes, a third each convergent / divergent /
  transform boundaries, mountains along convergent margins, ranges 4,600-7,700 km long); the
  sea-level temperature by latitude (within 1.5 °C of Earth); the direction of the wind belts;
  catchment sizes and the share of land draining to no sea.
- **Weak:** rain stops about 2 cells from the coast (84% of land gets under a tenth of the coasts'
  rain), which a rank-forced moisture hides in the biome map; tropical biomes start at 12 °C
  instead of ~20 °C (too much savanna, too little jungle and taiga); no seasons (no monsoon,
  Mediterranean, wet-dry savanna); no vertical scale (land stretched to the highest cell,
  mountains are the top 10% of land, so some worlds get noise mountains and plateau continents);
  too much land (40% vs 29%), no continental shelves, very few lakes, weak ocean currents.
- A plan of 10 fixes is in the review. Fixes 1-3 (inland rain, absolute moisture, biomes in °C
  and mm) are climate physics and hold at any scale. Fixes 4, 5, 9 and 10 (heights, shelves,
  continental geology, the grid) depend on the scale chosen below.

## The scale problem

Physically the map is a whole planet: 150 x 95 cells over 360° x 150°, a cell 267 x 176 km at
the equator. The history engine plays it like a large country: 7 starting realms, about 50 at
the peak, 10-20 at the end, towns a few cells apart, an empire taking half the map. On Earth the
largest empires held about a quarter of the land, and pre-modern states were far smaller than a
continent. Either the world is too small for the history or the history too big for the world.

## The options

1. **Planet + region.** Generate the whole planet coarsely, as now. History plays in one region
   of it, about 5,000 x 3,500 km (3-4% of the surface, Europe plus the Mediterranean), generated
   again in detail: each coarse cell becomes about 7 x 7 cells of ~38 km, so the region has
   about as many cells as today's map and history runs as fast as now. The region inherits its
   latitude, winds, currents and coasts from the planet. The rest of the planet is the unknown
   world beyond the map edge. An empire across half the region is Rome-sized.
   Cost: a regional generator that respects the planet around it (several days), the planet
   stage stays as is (or coarser). See the mock-up `tools/out/region-idea.png` (seed 7, made by
   a scratch script).
2. **Whole planet, planet-sized history.** Hundreds of small realms on a much finer grid
   (~600 x 380). About 16x the cells, so the history simulation goes from ~10 s to minutes, and
   the map gets busier.
3. **A smaller planet.** Same grid and same look, but the planet shrinks so a cell covers less
   ground. Cheap, but not Earth-like, and a realm still spans tundra to jungle.
4. **Keep the current state with revisions** (Daan's question). Keep one whole-planet map with
   history on it, fix the climate (fixes 1-3 and more), and accept that realms are continental.

## Daan's ideas

- It would be more fun to see all the biomes and the tectonics over the whole planet. He sees
  that the planet-wide history does not fully work at scale.
- **Choose a region:** generate the planet as now, let the player pick a region to play or
  watch in detail, and afterwards go back to the planet and play or watch another region.

## Open questions

- Does a player get more from one whole-planet history (option 4) or from regional histories
  chosen on a planet (option 1 with region choice)?
- Are regions independent histories, or one shared world where regions know of each other
  (traders, invaders and colonists from beyond the edge, a far shore found)?
- What does the planet view show: biomes, plates, climate; anything of the history?
- What does this mean for the shared terrain package and the separate game (`../PLAN.md`)?
