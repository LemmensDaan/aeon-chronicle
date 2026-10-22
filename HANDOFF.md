# Aeon — handoff

Read this first when resuming. State as of 2026-10-18.

> **2026-10-22: see `../PLAN.md` first.** Chronicle (website) and the game (standalone) will share
> one terrain generator. The current focus is fine-tuning the world generator here in chronicle; it
> gets extracted into a shared package afterwards.

## What it is

A world-and-history generator that runs in the browser from `file://`. No server, no build step, no
npm, no network. It generates a planet, simulates thousands of years of
history on it, and then lets you scrub through time on a map and read an encyclopedia it wrote.

Open `aeon/chronicle/index.html`. Deep link: `index.html#pack=historical&seed=42&year=-1500&mode=political`.

**Split off (2026-10-22):** the sci-fi pack ("The Long Dark"), the galaxy generator and the old 2D
renderer moved to their own project, `random-shit-go/galaxy-generator`. This repo is planets only.
`samples/lowpoly.html` stays: it is the approved low-poly style for the globe, despite its title.

**Split off (2026-10-22):** the alternate-history pack ("What If") moved to its own project,
`random-shit-go/alt-history-generator`, a full copy of this app at `dce3a84`.

**Direction (Daan, 2026-10-22):** Aeon becomes *one* world generator with settings on the setup
page, such as how many empires to start with and how much magic: none / low / medium / high (so
historical and fantasy become two ends of one generator). Not started; the two packs stay as
they are until then.

## Working agreement with Daan

- **One piece at a time.** Do one focused piece, verify it, report briefly, then stop and wait. No
  parallel subagent fan-outs — he's tracking token usage.
- Answer questions as questions; don't turn "can we X?" into a build.
- He likes things he can see. Verify visual work by screenshot (see Verification below).

## File map

| File | Role |
|---|---|
| `index.html`, `css/app.css` | shell page and styles |
| `js/rng.js` | seeded sfc32 RNG. **`Math.random()` is banned** in engine and packs; determinism is a contract |
| `js/core.js` | genre-agnostic engine: regions, polities, figures, artifacts, events, chronicle |
| `js/planetgen.js` | planet terrain (I wrote this; see below) |
| `js/worldgen.js` | dispatches to `planetgen`; still holds an old planet fallback |
| `js/pixelmap.js` | **pixel map renderer** (`AEON.render`), also the 5x7 pixel font |
| `js/stats.js`, `css/stats.css` | the statistics sheet over the map (see below) |
| `js/chronicle/*.js` | the encyclopedia, in parts loaded in order: `base` (state, helpers, indexes, derived data, navigation), `style` (injected CSS), `timeline`, `pages` (entity pages), `atlas` (atlas + search), `story`, `graph`, `shell` (render, mount, public API). Plain scripts, not modules (file://); each part imports from `AEON._chronicle` at the top and exports at the bottom. Parts only import from earlier parts; `render()` is called upward as `C.render()`. A new shared helper must be added to its part's export line |
| `js/ui.js` | app shell: genre picker, generation, playback/scrubbing, deep links, export |
| `packs/*.js` | two genre packs: `historical` (86 events) and `fantasy` (82) |
| `PACK_API.md` | the contract packs are written against |
| `samples/pixel.html`, `samples/lowpoly.html` | the two approved style samples; `smooth.html` was rejected |

## How the engine works

- A pack supplies names (culture-consistent grammars), biomes, eras, archetypes and an event table.
  Each turn the engine grows populations, expands borders, ages rulers, and fires a **budget of
  ~7 polity events per turn** (`pack.eventsPerTick`), so chronicles stay readable.
- Events read their own past through `ctx.past()`, `ctx.pastByTag()` and `ctx.pastByType()`; the
  last two are indexed. That's how prophecies get fulfilled and revenge wars cite old defeats.
- **History playback:** every ownership change is logged as `[year, region, owner]` in
  `world.ownerLog`. `AEON.viewAt(world, year)` returns a world-shaped view of any year (checkpoints
  every 4,000 entries, ~4 ms). The UI draws the view, not the live world.
- `AEON.summary()` is memoised. It used to be quadratic — 1.76 s a call, every frame.
- A full history simulates in about 1–2 s. Typical output: 1,000–8,500 events.

## Terrain (`js/planetgen.js`)

Pipeline: irregular plates (noisy flood fill) → continental cores inside some plates → boundary
interactions (collision ranges, Andean margins + trenches, island arcs, rifts, mid-ocean ridges,
hotspot chains) → erosion along a drainage tree → temperature (latitude, altitude, ocean currents)
→ three-cell winds advecting moisture with rain shadows → lakes vs dry basins by water balance →
rivers (systems pruned to 4+ cells) → Whittaker biomes.

- The map **wraps east–west** and spans 75°S–75°N. Anything drawing neighbour-to-neighbour lines
  must unwrap x across the seam (see `near` in the river drawing in `pixelmap.js`).
- **Lakes** are `barren: true, lake: true`, with elevation = surface level (> 0.5). Ocean is
  elevation ≤ 0.5. Don't decide "water" from elevation alone.
- Debug layers are on `world._gen` (non-enumerable): plates, uplift, temperature, rainfall, wind,
  accumulation, lakes.
- **Seam:** after elevation is final, the planet is rolled east-west so the wrap seam runs through
  the most open water (`world.seamShift` = columns rolled). Every layer later stages read is rolled
  with it; a new early layer that a later stage uses must be added to that roll list.
- The seam roll changed every seed's map, so worlds from before 2026-10-22 don't reproduce.
- Tried and rejected (2026-10-22): polar caps (sinking land + pack ice along the top/bottom rows).
  Daan found the ice band looked like clouds and prefers land running off the north/south edges.
- **Ragged climate edges (2026-10-23):** land temperature gets low-frequency noise (`planetgen.js`,
  before the final clamp), so the tundra and desert edges stop following the parallels.
- **Soft frontier:** realms expand into any land above habitability 0.03, weighted by habitability
  squared, instead of stopping dead at 0.12. That cutoff drew a straight line along the tundra edge
  where civilisation ended. Historical realms now hold ~75% of the tundra by 1500 AD (was ~8%).
  Both changes alter every seed.
- Generation takes about 0.4 s. A typical world: 3–9% mountains, roughly 20% desert, 1–4% ice.

## Visual direction (decided)

- **Per-genre themes:** yes.
- **Low poly + pixel together:** low poly for the world view (rotating faceted globe), pixel for the
  working history map. **Smooth/atlas style is rejected.**
- Daan likes the pixel *look* but **not the RPG menu boxes** (blue gradient windows).
- **Pixel UI style chosen: F · Parchment** in `samples/pixel-ui.html` (2026-10-18). Torn, aged parchment
  sheets drawn at map resolution (`sheet()`), faded brown ink, pixel-font headings + Georgia body text,
  red ribbon bookmark on the active tab, wax seal for the realm, red drop cap, fleuron rules, manicule
  as the timeline marker, folio number. He called it rudimentary but approved; polish comes later.
  Rejected: Glass HUD; Tome (leather) was "too busy". Styles A/C/D/E stay in the sample for reference.

## Next pieces (Daan picks the order)

1. ~~Pixel UI restyle~~ — done: style F, see above. Port it into the app with the map renderer.
2. ~~Pixel map renderer in the app~~ — done (`js/pixelmap.js`, see below).
2b. ~~Parchment shell (style F) in the app~~ — done: `css/parchment.css` overrides `app.css` and the
   chronicle's injected `.ch-` styles; `js/parchment.js` makes the pixel textures (`--pp-*` vars) and
   `AEON.pixelLabel()`. Single theme now; the light/dark toggle is hidden.
3. **Low-poly globe in the app** — world view with borders.
4. **Worldgen inspector page** — plates, wind, rain, rivers and biomes as side-by-side layers, from
   `world._gen`.

## Pixel map renderer (`js/pixelmap.js`)

- Terrain is painted once per world into a virtual canvas at 4 px per cell (600x380), then blitted at
  a **whole number of device pixels per map pixel**, so pixels stay square. Zoom snaps to those steps:
  `AEON.render.pixelScale(canvas, world, zoom)` gives `{P, s, zoomFor(P)}`, and `ui.js` uses it for the
  wheel, `centerOn` and the initial fit (`fitView`).
- The planet wraps east-west, so the map tiles horizontally; hit testing wraps x too.
- Per year/mode it composes realm tint (dithered) + two-pixel borders; water never counts as a border,
  so coasts stay clean. ~16 ms per year change; the terrain build is ~0.4 s once.
- Settlements are drawn in screen space: capitals as keeps in the realm colour, towns and hamlets
  as you zoom in, with greedy collision avoidance. **No names are drawn on the map** (decided
  2026-10-22): realm and place names only appear in the hover tooltip. The realm-name and
  town-name drawing was removed; it is in git history before that date if wanted back.
- Note: the Write/Edit tools turned `̀` escapes into literal characters, which broke the script on a
  page without a charset. `fold()` filters by char code instead; keep this file ASCII.

## Graph view (`js/chronicle/graph.js`)

- Obsidian-style graph as a fifth chronicle tab (`{ v: "graph", focus? }` nav entries). Two names are
  tied by a thread when one chronicle entry names both; rulers are tied to their realm (`polityId`),
  makers to their artifacts (`creatorId`). Threads between polities in `derived().wars` are red.
- Kinds toggle: polities (wax seals), figures (ink dots), artifacts (red lozenges), places (ruled
  squares), events (red stars, off by default, filtered by importance, max 300). Places/events off by default.
- Whole-world mode takes "the N most named" with each kind getting a share per round (`G_SHARE`),
  because realms are named far more than anyone else. Every entity page has "Show its threads in the
  graph", which opens a local graph one or two threads out.
- Force layout is d3-like (O(n²) charge, fine up to ~700 nodes), positions persist across rebuilds;
  canvas colours come from the `--ch-*` variables, so it follows the parchment theme.
- While the graph is open the host gets `.ch-graphing` and widens to 64vw (`app.css`).

## Map cursor, tooltip and font (2026-10-22)

- Over a map cell the system cursor is hidden and corner **brackets** (white, with a drop shadow) mark
  the hovered cell; the selected cell gets red brackets one pixel further out. Both are drawn in
  `pixelmap.js` (`brackets`), copied from the game project's overlay. The old red square is gone.
- The tooltip is a light-parchment plaque in **Pixelify Sans**: realm (swatch, name), its ruler in
  the shown year, provinces, type and founding year; then the place. Population only shows at the end
  year, because the engine only keeps it for the present.
- **Pixelify Sans** (OFL, `css/pixelify-OFL.txt`) is embedded as data URIs in `css/pixelify.css`,
  since browsers may refuse font files over file://. Used via `--ae-pixel` for the map tabs, the
  and the tooltip. The 5x7 canvas font in `pixelmap.js` now only serves `AEON.pixelLabel()` headings.
- Rulers by year: the engine stamps `figure.crowned` / `figure.reignOf` on each tick for the current
  ruler (heirs crowned inside pack events get stamped a tick late). `AEON.rulerAt(world, pid, year)`
  answers who reigned; a death followed by a crowning within two ticks counts as continuous.
- The labels checkbox was removed along with the map names.

## Statistics sheet (`js/stats.js`, `css/stats.css`)

Inspired by Age of Empires II's end-of-game statistics, but in Aeon's own parchment style (Daan:
"don't blatantly copy it"). The **Statistics** button in the header lays a parchment sheet over the map.

- **Step 1 (done 2026-10-22):** tabs Population and Territory, each a 100%-stacked chart over time,
  drawn in 2px pixel columns. Bands are the **8 greatest realms** (most people-years) plus one
  "Other realms" band; the same 8 on both tabs. Data comes from `polity.sizeHistory` (one entry per tick).
- Realms keep their **map colours**. Those fail chroma and some neighbour checks of the dataviz
  validator, so bands are stacked in the order that maximises neighbour separation (OKLab, normal +
  protan/deutan/tritan), with a 2px parchment gap; a still-close neighbour, and the second realm of
  any repeated colour (the engine palette cycles 18), is hatched. Legend, direct labels, the hover
  readout and a table view name everything.
- Hover: crosshair snapped to a tick, readout of every band (and the largest realms hiding in
  "Other"). Click the chart: sets the map's year (red line). Battle markers (crossed swords): only
  battles a named realm fought, importance 5 then 4, spaced apart, at most 24; click opens the entry.
- Historical worlds have ~85 realms, so its "Other realms" band is large (~70%); that is honest.

**Next steps, in order, one commit each** (Daan's notes from 2026-10-22):
2. ~~**Ages per realm**~~ done 2026-10-22. `pack.ages` (see PACK_API 3.1b) on a non-feedback
   `learning` counter in `core.js` (`advanceAge`), calibrated so the median realm reaches each age
   when the matching era begins. Historical: Bronze → Iron → Classical → Medieval → Powder;
   (alt-history, since split off, used its seven eras); fantasy has its own ladder (Hearths → Runes → Towers → Charters →
   Clockwork) because its eras are events. Shown as numbered pixel pennants on the chart (our own
   style, not AoE's shields), in the readouts, the map tooltip, the table and the polity page.
3. ~~**Settlement growth**~~ done 2026-10-22. Tiers are named village / town / city / great city
   (`AEON.SETTLEMENT_TIERS`, `AEON.tierName`; a pack may set `settlementTiers`). Packs change tiers
   inside events, so the engine scans once a tick and logs `world.settleLog` `[year, region, tier]`
   (0 = gone) and keeps razed/replaced settlement objects (`_pastSettle`). `viewAt` now shows each
   settlement at the size it had that year, and razed ones before they fell. Region pages list the
   growth; polity pages count cities; the sheet has a **Cities** tab (tier 3+, replayed from
   `ownerLog` + `settleLog`). Alt-history packs never change a tier, so there cities are capitals.
4. ~~**Wonders**~~ done 2026-10-22. A wonder is an artifact that never moves, marked `wonder: true`
   or by a kind in `pack.wonderKinds` (`AEON.isWonder`, `AEON.wonders`, `AEON.wondersAt`).
   Historical already built and destroyed wonders and great libraries (~450 a world), so it only
   declares `wonderKinds` and its histories are unchanged. Fantasy got two new events,
   `great-work-raised` (what is built follows the realm's age: long halls and moonwells up to
   orreries and iron lighthouses) and `great-work-falls` (dragons, gods, siege, fire, and more
   often as magic drains, the enchantment running out): ~70 a world, a third lost. **This changed
   fantasy histories.** Fantasy's relic helpers (`artList`) skip wonders. Map: a gilded obelisk
   beside the cell from 2x zoom; tooltip lists them; sheet: a Wonders tab and raised/lost markers. Alt-history is split off; its megaproject idea (Volkshalle, a Gibraltar
   bridge or dam) is in that project's HANDOFF.

## Settlements on the map (2026-10-22)

- Four **types**: village (tier 1), town (2), city (3 and 4) and **capital**, meaning a living
  realm's seat that year, whatever its size (`AEON.settlementType`, `AEON.capitalOf`). Daan asked to
  rename "great city" to "capital"; tier 4 still exists for the packs but now reads "city".
- **Sprites** grow with the square root of the zoom (`drawOverlay` in `pixelmap.js`), so a zoomed
  map fills up without markers swelling as fast as the land. Cities show from the normal zoom.
- **Roads** (`drawRoads`): per realm, a tree grown from the capital by the shortest overland links,
  plus the capital's roads to its three nearest settlements; never across water, at most 14 cells.
  Drawn into the map at map resolution, so they zoom like rivers and follow the year. Style by the
  smaller end: dotted where a village is involved, solid between towns and cities, paved between
  cities and capitals. Only shown with the **roads** toggle on the mode strip (off by default:
  Daan found them busy).
- **Sprites:** the Rooftops set from `samples/settlements.html` (Daan's pick), with the city made
  smaller than the capital. Keep the sample page: Daan also likes the Walls and towers set, and it
  holds eight road styles.
- **Scenery** (peaks, trees) is drawn in screen space at the settlements' scale (`drawScenery`),
  cached as one layer at low zoom. It used to be painted into the terrain and grew with the land.
- **One wonder per city or capital** (`ctx.wonderSite`); this changed historical histories too.

## Map modes (2026-10-22)

- **Biome**: terrain only, no realms. **Political**: realm wash and borders. **Population** and
  **Habitability**: their data with thin borders. **Elevation**: land colours, no borders (Daan wants
  more variation there, especially in the sea, when the world gets more realistic).
- Population is spread over a realm's land by `AEON.popWeight` (habitability, times a lot more for
  a settlement, most for the capital), in the engine for the present and in `compose` for any past
  year (from `polity.sizeHistory` via `AEON.populationAt`). Log scale stretched between the 5th
  and 99th percentile. Nothing in the simulation reads region populations.
- Data modes use one hue light to dark (`RAMPS`, exposed as `AEON.mapRamps`) and show a legend
  plaque in the map's lower left corner.

## Ambient animation (2026-10-23)

From `samples/pixel.html`, which Daan loved: shore foam shimmering between two pale tones, glints on
the deep sea, dithered cloud shadows drifting east and wrapping round (`drawAmbient` in
`pixelmap.js`; foam/glint/cloud lists built once in the cache). `ui.js` redraws the map every 90 ms
while nothing else does, pauses while the statistics sheet is open or the tab is hidden, and never
runs with prefers-reduced-motion. Water keeps Aeon's colours (the sample was "very blue").

## The quiet layout (`css/plaques.css`, 2026-10-23)

Daan liked the parchment styling but found the full-width bars and the 480 px chronicle column "very
aggressive". As in `samples/pixel-ui.html` (style F), the map now fills the window and the UI floats
over it as small plaques: a slim header, the mode tabs under it, a slim timeline at the bottom, and a
420 px chronicle panel on the right (`--chron-w`; the graph widens it to 56vw and the header hides its
year figures to make room). Each plaque is a small sheet of parchment torn on all four sides (`--pp-sheet`, drawn by `parchment.js`
and used as a 9-slice `border-image`). A first version with straight inked rules was rejected ("I want
the parchment UI back").
`ui.js` fits and centres the map in the open area left of the panel (`openWidth`). The DOM is
unchanged, so this is all one stylesheet loaded last.

## A sparser world (2026-10-23)

Daan found the map too busy (too many realms, towns and events, settlements in the mountains) and
asked that biome, elevation and habitability decide where settlements go.
- `AEON.siteSuitability(region)` (0..1): habitability, cut hard for ice, mountains, tundra, dry
  desert and swamp, and cut further with height. `AEON.maxTier` caps a settlement by it (mountain or
  ice: village; poor land: town; good land: city). `foundSettlement` clamps to the cap and the
  once-a-tick settlement scan trims anything above it (packs raise tiers directly). Founding on new
  land is likelier on good sites; pack events pick sites with `ctx.pickSite` (weighted by
  suitability squared) and read `ctx.maxTier`.
- Fewer realms and events: `seedPolities` 7 (both packs), `eventsPerTick` 5, historical living cap
  30 (40 for the greeting event), fantasy 20.
- Seeds 42/7/1234 average: historical 88 → 41 realms, 625 → 408 settlements, 9.6% → 1.1% of them in
  mountains, 8,392 → 6,528 events; fantasy 54 → 44 realms, 512 → 359 settlements, 8.0% → 4.3%.
  Changes every seed.

## Known loose ends

- The map doesn't refit when the chronicle widens for the graph (its zoom snaps to whole pixel steps,
  so a narrower map letterboxes). ui.js only redraws on resize.

- The fantasy namer produces duplicate settlement names (two Thornmouths, two Nantgarths in seed 7).

- `worldgen.js` still contains the old planet generator as a fallback; it can be deleted.
- The pixel sample doesn't wrap its bilinear terrain sampling at the seam (tiny edge discontinuity).
- The chronicle (`js/chronicle/shell.js`) doesn't export `setYear`, so the encyclopedia doesn't follow the scrubber. The UI
  checks for it, so adding it is safe.
- The historical pack keeps 58–80 polities alive at once (its own soft cap), so its maps are busy.

## Verification

- Syntax: `node --check` on every file.
- Headless engine runs: load `js/*.js` and `packs/*.js` into a `vm` context with `window = ctx`, then
  call `AEON.createWorld({packId, seed})` and `AEON.runAll(world)`.
- Screenshots with Edge — **always** use an isolated profile and disable extensions:
  `"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu
  --disable-extensions --no-first-run --user-data-dir=<scratch dir> --hide-scrollbars
  --window-size=1300,820 --virtual-time-budget=20000 --screenshot=<file.png> "file:///D:/.../index.html#pack=...&seed=..."`
  Under `--virtual-time-budget`, `performance.now()` doesn't advance during synchronous code — for
  timing, build the world synchronously at page load and use `--dump-dom` without virtual time.
