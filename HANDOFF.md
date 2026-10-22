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
| `js/chronicle/*.js` | the encyclopedia, in parts loaded in order: `base` (state, helpers, indexes, derived data, navigation), `style` (injected CSS), `timeline`, `pages` (entity pages), `atlas` (atlas + search), `story`, `graph`, `shell` (render, mount, public API). Plain scripts, not modules (file://); each part imports from `AEON._chronicle` at the top and exports at the bottom. Parts only import from earlier parts; `render()` is called upward as `C.render()`. A new shared helper must be added to its part's export line |
| `js/ui.js` | app shell: genre picker, generation, playback/scrubbing, deep links, export |
| `packs/*.js` | three genre packs: `historical` (86 events), `fantasy` (82), `althistory` (88) |
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
- Map labels should become dark ink to match the parchment (currently white with outlines).

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
- Labels and settlements are drawn in screen space in dark ink with a parchment halo: realm names
  (red ink, split at " OF ") always; capitals as keeps in the realm colour; town names from 3 CSS px per
  map pixel up, more tiers as you zoom. Greedy collision avoidance, largest first.
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
