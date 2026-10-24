# Brief: technology you can see, knowledge that can be lost

For an agent picking this up fresh. Read `HANDOFF.md` first (start with "Where we are", the working
agreement and "Verification"), then this.

## What exists (2026-10-24)

- **Named technologies** per pack: `pack.technologies` in `packs/historical.js` (22: bronze, writing,
  wheel, war chariot, sail, irrigation; iron, alphabet, coinage, oared warship; cement and the arch,
  paved roads, siege engines, astronomy; heavy plough, stirrup, compass, banking; gunpowder,
  printing, ocean-going ship, joint-stock company) and `packs/fantasy.js` (20, from bronze-and-bone
  smithing to reckoning engines). Each: `{ id, name, age, needs, effects: { army, navy, growth,
  wealth }, verb }`.
- **The engine** (`js/core.js`, section "technologies"): `techTick()` each 5-year tick; a realm of the
  technology's age that knows its `needs` learns it from contacts (neighbours and every non-war
  treaty partner, 12% each a tick, at most 60%) or, if nobody knows it yet, alone (rarely). Kept in
  `p.techs` (id -> year) and `p.techLog` ({ year, tech, first }). The first discovery in the world is
  a chronicle event `discovery`. `techFactor(world, p, key)` multiplies battle quality (army/navy),
  land capacity (growth) and output (wealth). `AEON.techsOf(world, p, year)`.
- **Shown** only as a "Technologies" list on a realm's encyclopedia page.
- **Old flavour events**, not tied to the named technologies: historical `invention` (picks from
  `INVENTIONS` by era), `printing-press`, `gunpowder-adopted`, `lost-technique-rediscovered`,
  `library-destroyed` (its `TECH_LOST` texts and `h.lostTech`); fantasy `school-founded`.

## What Daan wants (his answers, 2026-10-24)

1. **Technology visible on the map.** The sprites should change with what a realm knows: e.g. the war
   band (mapfx.js `band()`: soldiers, banner) carries bronze, then iron, then pikes and muskets once
   gunpowder is known; ships (mapfx.js `SHIP`, fleets) change from oared boats to sails, galleons,
   steam-ships (fantasy); perhaps settlements (pixelmap.js `VILLAGE`, `TOWN`, `CITY`, `PALACE`) gain
   a detail by age. Keep the house style: small pixel sprites outlined in ink (INK `#2a1a0e`), no
   look-alikes of existing games (Daan rejected AoE-like shields). Read the sprite code in
   `js/mapfx.js` (sprites near the top, `band`, `drawShip`) and `js/pixelmap.js` (`sprite`, `blit`).
2. **Knowledge can be lost.** When a realm falls, is razed, or its library burns, some of what it
   alone knew can be lost to the world, and be rediscovered later. Today a technology once known
   can never be lost. The historical pack already tells such stories (`library-destroyed`,
   `lost-technique-rediscovered`, `TECH_LOST`): make them real.
3. **Tie the old events to the named technologies.** `invention`, `printing-press`,
   `gunpowder-adopted` should be the discovery (or adoption) of the matching named technology, so the
   chronicle's story and the realm's `techs` agree; the core `discovery` event and these should not
   both fire for one technology.

## How to work (Daan's agreement)

- **Sample first for anything visual.** Daan picks designs from sample pages: make a
  `samples/tech-sprites.html` (like `samples/animations.html`: panels, `?only=N` for one panel large,
  `?t=ms` to freeze a frame) with 3-4 variants of each new sprite, show him, wait for his picks, and
  only then wire the chosen ones into the map.
- **One piece at a time**, verified, committed and pushed (author daan.lemmens@hotmail.com, no Claude
  co-author line), then stop and report briefly.
- **Engine changes change every seed's history**; say so. View-only changes must keep histories
  identical (check a seed's chronicle hash before and after).
- Line endings: the files are CRLF in the working tree; edit with the Edit tool or node scripts
  that keep them.

## Sprite picks (samples/tech-sprites.html)

- **Round 1 (2026-10-24).** Bands: the soldiers of panel 1 (today's soldier, weapons only, no
  helmets) with panel 3's standards unchanged (bronze bull's head, iron eagle over a cloth, pikes' flag
  with a cross, muskets' regimental colour). The iron sword is good; the bronze weapon should look
  like a bronze sword; pikes could be better; muskets do not read at this scale. No helmets, not
  panel 4's whole-band formations. Ships: the oared boat with stroking oars (panel 8), the sail ship
  with a coloured sail (panel 6), the galleon and the steam-ship with pale sails (panel 7); every
  ship bobs and leaves a wake; the steam-ship smokes (round 2: no turning wheel, just the smoke).
- **Round 2 (2026-10-24).** Pikes: sloped forward (all at one angle). Muskets: shouldered, stock down
  (firing from the levelled pose with a flash and smoke). Bronze: none of the four yet. The standard
  bearer must march at the back of the band, facing the enemy (the map's `band()` puts him in front,
  facing backwards: fix that when wiring in).

- **Round 3 (2026-10-24).** Bronze: A, the iron sword's shape in bronze with a dark guard. Flags
  trailing behind the bearer (panel 2). Wired into the map (step 2 below is done).

## Suggested order

1. The sample page of tech sprites (war bands by age or technology; ships by technology).
2. **Done (2026-10-24).** After his picks: draw a realm's band and fleet by what it knew that year (`AEON.techsOf(world,
   p, year)` from the view's year).
3. Lost knowledge in the engine (a technology held by few realms can die with them; rediscovery as
   for a first discovery), with chronicle entries.
4. The old events tied to the named technologies.
