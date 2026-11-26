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

## 0. Keep the version with history

Before any of this starts, the current game (terrain plus the civilisation history) is kept
as it is:

- A git tag, `history-v1`, on the last commit before the change of direction (`e04aec1`), and
  a branch, `feature/history`, that starts from it. The branch can still take fixes, and history can be merged
  back from it later (step 7).
- Whether the generator becomes a separate app or stays in this one is not decided yet. Until
  it is, work goes on in this repository, on `main`, and the history code stays in place but
  unused rather than deleted.

## Tech stack

The project is plain HTML, CSS and JavaScript, with no build step, and it runs in the browser.
Recommendation: keep that.

- **Stay in JavaScript.** Moving to TypeScript means a build step; it can come later, or file
  by file through JSDoc type comments, which need no build.
- **Heavy work goes to Web Workers.** The deep-time run and the zoom tiles are computed in
  background threads, so the page stays responsive and shows progress.
- **WebAssembly only if needed.** If a worker is still too slow, the hottest loop (for example
  the plate step) can be rewritten in Rust or C and compiled to WebAssembly. Not before
  measuring.

## 1. The real-Earth climate test (M, in progress)

Run the climate model on Earth's real terrain and score it against observations: temperature,
seasonal range, rain, summer rain share, sea surface temperature and Köppen classes. It gives
one honest score that every later change must not make worse. `tools/earth-fetch.js`,
`tools/earth-climate.js`.

## 2. The planet's interior, as a heat budget (M)

The interior is described by a few numbers, not simulated. No 3D mantle model: too slow, and
it would not show on the map. Instead:

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
- Mountain heights from physics, replacing the fitted heights and widths of the young ranges
  (GEN_VERSION 8 matched them to Earth's land heights by hand):
  - each cell tracks its crust's thickness, which squeezing at a collision builds up;
  - the height follows from the crust floating on the mantle (isostasy): about 1/6 of the extra
    thickness, from the densities of crust (2.7) and mantle (3.3);
  - a limit from the rock's strength under the planet's gravity: maximum height about
    strength / (density × gravity), so a planet with 3× Earth's gravity has ranges about a third
    as high, and above the limit the crust spreads into a plateau (Tibet);
  - ranges wear down with age, and faster where the climate's rain falls (Taiwan, the Southern
    Alps) than where it is dry.
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
- **Water is not local.** Where a river runs depends on all the land upstream, so a tile cannot
  work out its rivers alone. Work out drainage for a whole continent (or basin) at a coarse
  level, and let tiles only add small streams and ponds. Lessons from fixing the region maps
  (2026-11-23, HANDOFF "Region rivers keep the planet's whole course"): the parent's big rivers
  and lakes must always appear in the child; finer noise must not dig sea pockets inland; a
  parent river needs a channel lower than the land beside it that never rises downstream; a
  river that leaves a tile's edge must be an outlet there, not a dam; and a hollow on a parent
  river's course is never a dead end.

## 7. History comes back (later)

Civilisations, step by step, on the era and the world the user picked.

**What Daan found with the region chapters (2026-11-23)**, the last history work before the
change of direction (`docs/REGION_CHAPTERS.md`, on `feature/history`):
- Having to pick a chapter (a period) to see an event, and "Find its wars" before you can see a
  war, adds steps and gives no overview. Not user friendly.
- Grid squares cut through active kingdoms, so a kingdom and its wars get split between two
  regions. The detailed maps themselves were liked: that is where you see things change.
- 10 days a second is the most that still shows the seasons; 5 days a second may be better.

**The arithmetic that any design must live with.** At 5 days a second a year takes 73 s, so a
4,500-year history would take about 90 hours. You can't watch the whole history at the
seasons' pace; something must decide which years are played slowly.

**Direction discussed (not yet decided in detail):**
- **Watch mode:** the world history plays fast, with one timeline of all its major events
  (wars included, no searching). Clicking an event zooms the map to where it happens and slows
  to day speed for its length: about a season before to a few months after, or a whole war
  (a 3-year war is about 4 minutes at 5 days/s). Automatic slow-downs can be turned off.
- **Play a realm** as its own mode: nothing computed ahead. The engine runs just ahead of
  playback, so it only has to keep up with about a year per 73 s instead of computing a whole
  chapter first (opening a chapter took one to two minutes). This also ends the wait when a
  decision remakes the story.
- **Detail where you look.** The coarse history runs everywhere; the fine (monthly) layer runs
  only for the area in view: the realms involved plus their neighbours, not a fixed square. With
  the zoomable world of step 6 there are no region borders to cut a kingdom.
- **Still open:** does a period watched in detail change the world after it (today's "the
  region wins" write-back), or is it a replay that changes nothing? And how large an area can
  run in detail before the wait gets too long?

**Worth reusing from `feature/history`:** the two-layer engine (a yearly slow layer for
population, learning, dynasties and decisions to go to war; a monthly fast layer for campaigns,
sieges, court, raids, harvests and plague, in `campaigns.js`, `fastlayer.js`, `months.js`);
tribes with a sphere of influence instead of borders (`tribes.js`); foreign powers pressing on
an edge; changing history and playing a realm's decisions (`nudges.js`). These were built for
grid squares and must be moved onto the zoomable world.

## Decisions so far, and what is still open

**Grid: a hex sphere (leaning yes).** A geodesic grid of hexagons, with 12 pentagons, as on a
football. It is correct on a sphere: every cell is about the same size, there are no
squeezed poles, and plates can rotate cleanly. It also gives the map its own look. The flat
map is then a projection of the sphere, and a globe view becomes possible.

**Timeline: 500 million years by default (proposal).**
- One supercontinent cycle (a supercontinent forming, breaking up and forming again) takes
  about 400 to 600 million years. 500 Myr shows one full cycle, so every world has at least
  one Pangaea-like era.
- Earth's own: Pangaea formed about 335 Myr ago and broke up from about 200 Myr ago. Rodinia
  was about 1,000 to 750 Myr ago.
- A "long" option of about 1,000 Myr for two cycles, if the cost allows.
- Snapshots every 5 Myr: 100 frames for 500 Myr.
- Open: confirm 500 Myr.

**How long making a world may take (proposal).** Terraria takes from a few seconds to a
couple of minutes per world, and people roll several. So two speeds:
- **Quick preview, about 1 to 3 s:** the whole timeline at low resolution. Fast enough to roll
  many seeds and keep the one that looks good.
- **Full world, about 30 to 60 s with a progress bar:** the chosen seed at full resolution, in
  workers. Zoom tiles are then built on demand as you look around.
- Because generation is deterministic, the full world is the same planet as its preview, only
  sharper.
- Open: check these targets once step 3 has a first version to measure.

**Still open:**
- A separate app or one app with a history mode (step 0).
- Whether the timeline is computed fully up front or era by era on demand.
