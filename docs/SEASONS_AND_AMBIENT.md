# Seasons and ambient life — animation list

The brief for sample pages (like `samples/water-animations.html`) to pick from before anything goes
into the app. Started 2026-10-29.

## The clock they run on

- Playback runs on one calendar (`ui.js`): speeds from 1 day a second to 100 years a second. The
  date is `playbackYear + playOwed`; `season` is its share of the year, 0 on the first of January.
- At **1 year a second or slower** the seasons show (`opts.season` reaches `pixelmap.js draw()`).
  Faster, `season` is `null` and the map shows the land **as it mostly is** (the held state). Every
  seasonal effect needs both: a cycle over the year, and a held look.
- North and south have opposite seasons. Mid-winter is `MIDWINTER = 0.05` (about 20 January) in the
  north, half a year later in the south. A region knows its planet rows through `world.square`.
- Things that move within a day (current, ripples, glints, foam, clouds) stay on the wall clock.
- The guideline is the water: lakes and rivers ice over from the shore for a share of the year set
  by the coldest month (`coldC`), and break into floes on the way out (`pixelmap.js drawWater`).

## What each cell already knows

`tempC` (mean), `warmC` and `coldC` (warmest and coldest month), `rainMm`, `summerRain` (share of the
rain in summer: monsoons), `climate` (Köppen), `biome`, `heightM`, `elevation`, `moisture`,
`river`, `lake`, coastal or not, and the planet's winds and ocean currents. Enough to decide where
and when each effect happens without new generation.

## Seasonal (on the calendar)

| Effect | Where | When | Held look (fast playback) |
|---|---|---|---|
| Lake and river ice | `coldC` below 0 | winter, longer the colder | frozen where winter is over half the year — **done** |
| Snow cover | land with `coldC` below about -2, mountains above the snowline | creeps in from the peaks and the poles in autumn, melts back in spring | snow only where it lies most of the year (high peaks, polar land) |
| Snowfall | where snow is building | falling flakes in winter, drifting with the wind | none |
| Autumn woods | broadleaf and mixed forest (not conifers, not tropics) | early to late autumn: green → gold → red → bare | green |
| Spring blossom | temperate woods, orchards near settlements, meadows | a short burst in spring | none |
| Golden plains | grassland, steppe, farmland | dry and ripening in late summer; green in spring | the biome's own colour |
| Wet and dry season | savanna and monsoon land (`summerRain` high) | green in the rains, brown in the dry season | in between |
| Phytoplankton blooms | cool coastal sea, upwelling coasts, river mouths | spring and early summer: green-turquoise swirls | none |
| Sea ice | polar seas | grows in winter, shrinks in summer | the summer minimum |
| Storms | the stormy seasons (winter storms, monsoon, hurricane belts) | rare, drifting with the winds | none |

## Ambient life (not seasonal, but on the calendar)

- **Merchant ships** on the trade lanes between ports; fewer in winter where the sea freezes.
- **Caravans** on the roads: camels in desert and steppe, ox carts and mules elsewhere.
- **Fishing boats** off the coasts and on big lakes, out by day; none on frozen water.
- **Fleets and armies** (`mapfx.js`) slowed down to calendar time: a march of a few days to weeks,
  depending on how far the garrison is (step 3).

## Later: natural events that change history

Volcanoes, earthquakes, tsunamis, tornadoes, asteroids, floods, droughts, harsh winters. Each one
needs an engine event (step 2: events dated within their tick) and its own animation. The seasons
can feed them: frozen rivers that armies cross, campaigns in summer, sailing in good weather.

## For the sample pages

- One small piece of map in the game's palette (as in `samples/water-animations.html`), with a
  **date slider and a speed control**, so each effect can be judged over a whole year and at the
  held state.
- Put north and south side by side once, to check the opposite seasons.
- Name each panel so Daan can pick them by number.

## Picks so far (Daan, 2026-10-29 to 10-30)

From `samples/seasons.html` and `samples/ambient-life.html` (three rounds):

- **In:** snow cover with snowfall; autumn woods; golden plains (grassland as slow into winter as
  out of it; farmland as striped fields, hedgerows still open); wet and dry season with the rains
  and the revised lightning; phytoplankton blooms; sea ice; the north/south and mixed panels.
- **Settled 2026-10-30:** the orchard as sprites (`samples/seasonal-sprites.html`), farmland as
  striped fields without hedgerows, sheaves on the fields after the harvest (sprites).
- **Storms, still open:** hurricanes stay top-down (the whirling version: dark under it, streaks
  spiralling in to a calm eye, the sea washing over the coast); seen from the side they looked
  wrong. Tornadoes are seen from the side, a twisting funnel with dust and debris at its foot, but
  with no cloud and no fill: the funnel made only of particles whirling up it (dust or rain colours).
- **Set aside for later:** winter gales. Well made (fronts sweeping in from the west, dark with
  rain or snow, whitecaps under them; `FX.gales` in `samples/seasons-kit.js`), but would players
  read them as gales?
- **Ambient:** merchant ships and caravans in; before the ice or snow they make for the nearest
  harbour or town and wait there; fishing boats stay out (no day and night: it flickered at 1 day/s)
  and are pulled up on the shore before the ice.

## Sprites and the land

The map has two layers (`pixelmap.js`): the **land**, painted at map resolution and growing fully
with the zoom (biomes, water, roads, ice), and **sprites**, drawn at the settlements' scale
(`spriteUnit`) and growing only with its square root (settlements, peaks, trees, ships). The rule is
thing versus surface, not whether it can be clicked: peaks and trees are sprites too.

- **Surfaces stay land:** ground colour through the year, snow on the ground, ice, fields (the
  patchwork has to tile and follow the farmland's outline).
- **Things are sprites:** trees, orchard trees, peaks, ships, fishing boats, caravans, sheaves.
- **The seasons work on both:** the ground changes colour, and the sprites change palette or frame
  (trees gold, red, bare and snowy; peaks whiter down their slopes; roofs under snow). Land-only
  autumn woods would barely show, since the woods are mostly their tree sprites.

`samples/seasonal-sprites.html` tries this with the app's own sprites.
