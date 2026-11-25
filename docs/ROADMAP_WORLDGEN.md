# Roadmap: the world generator first

Decided 2026-11-25. The civilisation history is backlogged. The goal is a world generator that is
as physically accurate as is practical, with a timeline of the planet's deep past and a map you
can zoom into. History comes back later, step by step, on top of the era the user picks.

Sizes: **S** a few hours, **M** about a day, **L** several days, **XL** weeks.

## Principles

- **Simulated, not invented.** The seed sets the starting conditions and a few random events
  (where a rift opens, where a plume rises). Everything after that follows from rules. The same
  seed always gives the same planet and the same history.
- **Users set causes, not results.** At the start the user picks the seed, tilt, day length,
  sea volume, moon size and planet size (capped, about 0.5 to 1.5 Earth). These can't change
  afterwards. Winds, coasts and climate come out of the physics; nobody paints them.
- **Measured.** Every change is checked with the realism harnesses (`tools/worldgen-report.js`,
  and the real-Earth climate test) before and after.

## 1. The real-Earth climate test (M, in progress)

Run the climate model on Earth's real terrain and score it against observations: temperature,
seasonal range, rain, summer rain share, sea surface temperature and Köppen classes. It gives
one honest score that every later change must not make worse. `tools/earth-fetch.js`,
`tools/earth-climate.js`.

## 2. The planet's interior, as a heat budget (M)

No 3D mantle simulation: too slow, and it would not show on the map. Instead:

- **Heat** starts high and falls over time, faster for a small planet. It sets the plates'
  speed, how much volcanism there is and how thick new crust is. An old or small planet goes
  quiet, like Mars.
- **Mantle plumes** rise at seeded places and times: hotspot chains, and now and then a large
  igneous province (flood basalts like the Deccan Traps) that can split a continent and change
  the climate for a while.
- **Boundary volcanism** comes from the plates: arcs over subduction zones, rifts, ridges.
- **The core** is one fact: a magnetic field or not, which decides whether the planet keeps its
  atmosphere.

## 3. Plates that move through deep time (XL, the backbone)

- Plates rotate about Euler poles on the sphere, driven by the heat budget.
- Continents collide and join (sutures, plateaus, foreland basins); rifts split them; old ocean
  floor sinks at trenches; new floor forms at ridges, so ocean depth follows its age.
- Erosion and isostasy run alongside: ranges wear down, worn ranges stay as old orogens.
- Run over about 500 million years, with snapshots every 5 to 10 million years. The slider
  blends between snapshots so scrolling is smooth.
- Today's map is just the last frame.

## 4. Climate for any era (M)

The climate model only needs the terrain, so it runs on any snapshot. Every map mode
(temperature, rain, winds, currents, Köppen, biomes, plates, elevation) works while scrolling
the timeline. A place can be rainforest at -20 Myr and desert at -10 Myr because its plate
moved. Later: ice ages from the era's continents and orbit.

## 5. Planet settings and moons (M-L)

- Tilt: seasons and the width of the climate belts.
- Day length: the number of wind cells (a fast spin gives more, narrower belts).
- Sea volume: how much of the planet is land.
- Planet size: gravity (how high mountains can stand), how long the planet stays active, the
  grid. Capped for physics and cost.
- Moons: a large one keeps the tilt steady; without one the tilt drifts and the seasons swing.
  Tides shape coasts and slowly lengthen the day over the timeline.

## 6. A zoomable world (L-XL)

- The world is cut into tiles at several zoom levels; each level splits a tile into four.
- Only the tiles in view are built and drawn, for the era in view. Panning into an unbuilt area
  shows a loading image while its tiles are made.
- **Detail is derived, not invented freely.** A tile starts from its parent's height, climate
  and rivers and adds finer noise and erosion that stay true to them. Its seed is the world
  seed plus its position, so a place looks the same every time you come back, and the zoomed
  view never contradicts the overview.
- Because only the visible part is built, an Earth-sized planet is possible. The deepest zoom
  gets a floor, about a few hundred metres a pixel.
- This replaces today's regions.

## 7. History comes back (later)

Civilisations, step by step, on the era and the world the user picked.

## Open questions

- Grid: keep the flat 150 x 95 grid for the overview, or move to a sphere mesh (needed for
  Euler-pole plates and the poles)? Step 3 will probably force a sphere.
- How far back the timeline goes, and how much a full run may cost (seconds? a minute with a
  progress bar?).
- Whether the timeline is computed up front or on demand.
