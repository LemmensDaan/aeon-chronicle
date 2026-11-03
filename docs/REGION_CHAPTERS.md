# Region chapters: design

2026-10-30, plan revised 2026-11-03 (two layers). Steps 1-3 of the build order are done.

## Why

With the seasons on the map, 10 days a second is the speed that feels right: merchants, caravans,
ships, snow and harvests all move at a pace you can take in. But the region history moves at a
kingdom's pace, about one change per realm per decade. At 10 days/s that is minutes of nothing,
and at 5 yr/s, where history feels alive, the seasons are gone. Playback tricks (a separate
season clock, easing into the seasons around great moments) were tried and dropped: they stretch
the timeline, they don't fill it.

So the two levels get one job each:

- **The world** keeps the epic: the sketch's 4500 years, coarse, with the seasons sweeping over
  the continents. It is the grand history.
- **A region** plays a **chapter**: a short stretch of its history (a generation or two), run live
  at a fine grain, so something can happen every few seconds at 10 days/s.

## Decisions (Daan, 2026-10-30)

1. **Chapters are offered, not automatic.** The world history preselects a region's chapters from
   its contacts and curves ("the steppe invasion of 1180 BC", "the rise of ..."); you pick one.
2. **The region wins.** A chapter's outcome is written back into the world from its date on; the
   world after that point is a forecast that is redone. This also leaves room for interactivity.
3. **Tribes have influence, not borders.** A tribe has a sphere that fades with distance and can
   overlap its neighbours' and a kingdom's land. Kingdoms and up keep hard borders.
4. **10 days a second is the speed the chapter is designed for**, but live play must offer 1, 2, 5
   and 10 days/s so the best playable speed can be found (2 and 5 days/s added to the speed list
   2026-10-30). Replaying slower and faster must still work (see "Speed and replay").
5. **Peoples start where history has brought them**, not from zero: tribes, chiefdoms,
   city-states, kingdoms and empires side by side, as the sketch's development says.
6. **Wars are shown as they unfold** (the levy gathering, the march, the camp, the siege, the
   supply train) and **campaigns follow the seasons**: they advance in the campaigning season,
   stop for winter, fleets wait for good weather.
7. **The engine gets two layers (2026-11-03).** Step 3 showed that dating the 5-year tick's
   changes to the month is not enough: the tick itself makes nothing happen for minutes at the
   chapter speeds. Daan does not want 5-year ticks. The engine becomes a yearly slow layer and a
   monthly fast layer (section "Two layers"), even though this changes every history.

## Two layers

At 5 days/s a month lasts 6 s and a year 73 s; at 10 days/s, 3 s and 36.5 s. A chapter feels
alive when something visible happens about once a month in the region: a beat every 3-10 s.
Today's engine gives about 2 events a year per region (region 4,2, 710-785: 148 events in 75
years, 5 land takes), so it is about six times too sparse, and its events are the wrong grain:
what is missing is not more conquests but smaller, more frequent things. The engine thinks at
the scale of kingdoms; a chapter is watched at the scale of armies, courts and towns. So, as
Crusader Kings and Total War do, the slow things stay slow and fast things come in under them.

**The slow layer: yearly.** Population, technology, learning and ages, realm types, wealth,
dynasties, the decision to go to war (and what for), alliances, the sketch's pull and contacts.
These change over decades and nobody watches them month by month. The tick goes from 5 years to
1: every per-tick rate is rescaled to a year (some already scale with `world.timeStep`; the rest,
in core.js and in both packs' events, are found and divided), and the event budget per tick is
spread so a year holds a fifth of today's tick. This changes every history; the outcome over
centuries should stay alike (checked with the region and worldgen harnesses: realm counts, sizes,
ages reached, how many wars).

**The fast layer: monthly.** What happens month by month in real history and can be watched:

- **Campaigns.** The slow layer decides "X makes war on Y for these provinces"; the fast layer
  carries it out. An army is an engine object (size from `AEON.fieldArmy`, a position, supplies,
  a goal): the levy gathers at the capital, marches along the roads, camps, lays siege, fights
  (the battle model of military step 2), takes or loses towns, goes into winter quarters. Land
  changes hands a province or a town at a time, when a siege ends or a battle is won, so a war
  of a few years is dozens of visible steps instead of one jump. The weather of the month and the
  square decides: snow and mud stop the march, a frozen river can be crossed, storms keep fleets
  in port, winter sends levies home. Peace ends the campaign on the terms the war reached.
- **Court and diplomacy.** A ruler falls ill and dies, an heir is born or comes of age, a regency,
  a marriage, an envoy riding between capitals, a treaty sealed, a province restless and then in
  revolt. Mostly small, but frequent, and the dynasties of the slow layer are made of them.
- **Raids and tribes.** Raiders ride out after the harvest; herders move between summer and
  winter pastures (section 4).
- **Harvest, famine and plague.** A bad harvest after a wet summer, famine the next spring, a
  plague that spreads along roads and sea lanes region by region.

Together, about one visible event per month per region. The fast layer runs only in a chapter
(and in "Whole history" played at the seasonal speeds); the world sketch and fast playback keep
the slow layer alone, so a region's whole history stays a matter of seconds.

**The grand scheme inside a chapter.** A chapter opens with its stakes: the world history knows
how it ends ("the Verergrianite treaty"), so the chapter asks its question (who will hold the
coast?), and a strip shows where it lies in the 4500 years. Foreign powers press on the edge, and
the arrivals the sketch has coming are announced before they come. Optional: quiet months pass a
little faster and playback slows when armies meet; a convenience, not the fix.

## 1. Chapters

**Where they come from.** The sketch already holds, per square, a development curve, ages, power
and dated contacts. A chapter is a window around something worth watching:

- a contact into or out of the square: invasion, migration, colonisation, a great raid
- a turn in the curves: a rise (power climbing fast), a collapse or dark age, a new age reached

Each gets a title, a start a few years before the moment and a length.

**Length.** At 10 days/s a year takes 36.5 s: 30 years is about 18 minutes, 80 years about 50.
Chapters are 30-80 years by default, chosen to cover the build-up and the aftermath. "Keep going"
at the end continues the region live past the chapter (decision 2 makes that fine).

**Where you pick them.** On the world timeline (markers per region) and in the region's panel
before it opens. A region can have several chapters; a played one is marked.

## 2. The starting map

(Superseded by build step 2 as done: the start is the engine's own history up to the chapter's
date, computed in a second or two. Kept for the record.)

At the chapter's start the region is made as today (map, rivers, cells), then filled from the
sketch at that date instead of from the starting peoples:

- each people's **tier** from its development and power: band, tribe, chiefdom, city-state,
  kingdom, empire (the pack names them; fantasy: clans, warbands, holds, ...). This grows out of
  the realm types of military step 3.
- **territory:** hard land for chiefdoms and up, sized by power; a sphere for tribes (section 4)
- **towns, roads, ports and wonders** to match the development
- **foreign powers** on the edge where the sketch has a stronger neighbour: a frontier, not a
  whole realm (worldview.js already draws what lies beyond)
- **the backstory** as chronicle entries: "what came before", written from the sketch

## 3. The live engine

(Partly superseded: the monthly ticks are now the fast layer of "Two layers", the slow layer
ticks yearly; a worker and a head start wait for interactivity, since a region computes in
seconds. Kept for the record.)

The region's history is no longer run in full before it plays. It runs while you watch.

**Ticks are months.** A campaign moves on, a siege holds or breaks, herds move, a harvest comes
in. At 10 days/s that is a tick every 3 seconds, so the map can change every few seconds. Most
of today's yearly mechanics (growth, tech, stability, diplomacy) keep their rates, scaled to the
month or run on the tick that closes a season or a year.

**A head start.** The engine runs a little ahead of what is shown, in a Web Worker: a few months
at 10 days/s. The animations need it. Today `mapfx.js` knows the outcome before it plays (the
fleet sails before the land changes, the war band marches up before a take). Live, the battle is
decided in May and the army sets out on screen in March.

**Everything is still logged** as today (ownerLog, battleLog, chronicle, ...), so:

- scrubbing back works as it does now (`AEON.viewAt` from the logs)
- jumping forward simulates at full speed up to that date
- the chronicle, atlas and statistics grow as the chapter plays

**Same seed, same chapter.** Each tick draws from an RNG seeded by (seed, region, chapter, month),
so a chapter replays the same unless you change something. Changing something (later:
interactivity) drops the head start and runs on from that month.

**Campaigns.** A war becomes a campaign: an army with a position, supplies and a goal. Each month
it marches, camps, besieges or fights (the battle model of military step 2 decides). The weather
of that month and square matters: snow and mud stop the march, storms keep fleets in port, a
frozen river can be crossed. Winter sends levies home. That is where the seasons start to change
history, not just the look of it.

## 4. Tribes

- **Sphere:** an influence value per cell, highest around the tribe's camps and pastures and fading
  with distance. Spheres overlap: two tribes, or a tribe inside a kingdom's land. The map draws it
  as a soft tint or hatching, no border line.
- **Seasonal life:** herders move between summer and winter pastures, raid after the harvest, and
  gather for the great meetings. All seasonal movement, like the merchants.
- **Growth:** a sphere grows with herds and raids. A tribe that settles, or a chiefdom that unites
  tribes, turns its strongest influence into land. A kingdom can push a tribe out or make it pay
  tribute; a strong tribe can overrun a kingdom (the steppe invasion done from below).

## 5. On the map at 10 days a second

What makes a chapter feel political between land changes, all from the engine's own state:

- the levy gathering at a capital, the army on the roads, camps, siege rings around towns
- supply trains following the army, refugees leaving burned land
- envoys riding between capitals while a treaty is made
- tribal camps and herds moving with the seasons, raiders riding out
- and what exists already: land changing hands, crowns, laurels, fleets, merchants, caravans

## Speed and replay

The chapter is designed for 10 days/s, but every speed must work:

- **Slower** (1 day/s): the animations already interpolate between ticks; nothing else changes.
- **Faster:** the worker must keep its head start. A month tick is cheap (one region, ~15,000
  cells), but at 5 yr/s that is 60 ticks a second. The head start is measured in seconds of
  playback, not months, so it grows with the speed. If the worker falls behind, playback waits
  for it, and the waiting shows as a gentle slow-down, not a freeze.
- **Above the seasonal speeds** the map shows the land as it mostly is (as now), and the
  animations thin out as now (`mapfx` budget).
- **Replay** of a played stretch reads the logs only, so it runs at any speed and scrubs freely.
  Jumping forward past the played part simulates at full speed first, with a progress bar.

## Writing back to the world (the region wins)

When you leave a chapter (or close it), its outcome goes back to the sketch at the chapter's end
date: who holds what share of the square, its development, its peoples' tiers and power, the
contacts it made with other squares. The sketch is then rerun from that date on. So:

- the sketch must stay cheap to rerun from any century (it is, today: well under a second)
- a later chapter in another region reads the changed world
- the world timeline shows the changed history, with the played chapters marked as "seen"

## What stays

The world level, the planet and region maps, rivers and climate, the battle model, army and fleet
musters, war aims and razing, realm types, the seasons, all the map art and animations, the
chronicle pages and statistics (fed as the chapter plays). The packs keep their own names and
events.

## What changes

- the engine: a yearly slow layer instead of the 5-year tick, and a monthly fast layer for
  campaigns, court and diplomacy, raids, harvests and plague (core.js, both packs, ui.js
  playback, mapfx)
- wars: campaigns with armies as engine objects on the map
- tribes: spheres of influence
- every region history and its chronicle text (said here once: this changes all histories)

## Build order

Each step is checked on seed 7 at 10 days/s before the next.

1. **Chapters on the world level** — **done 2026-10-30**. `AEON.chaptersOf(world, si)` in sketch.js
   picks them; the square's plaque lists them, world-timeline rows they are about get a ▶. The
   region still runs today's whole history, and playback, the slider and the jumps keep to the
   chapter's window ("Whole history" in the header leaves it; links carry `&chapter=k`). This
   shows quickly whether 30-80 years at 10 days/s is the right length.
2. **Start where history has brought the region** — **done 2026-10-30, differently than planned.**
   Measured: a region's whole 4500 years take about 2 s to compute; the old 30 s wait was the map
   being redrawn every frame. So a chapter starts from the engine's own history up to its date,
   computed fast (ui.js `simulateAll(to)`: 100 ms slices, the map redrawn every 0.5 s), and only
   as far as the chapter's end; "Whole history" plays on from there. That start is consistent by
   construction (towns, roads, provinces, wars and treaties in progress, realm types from tribal
   confederations to empires), every chapter of a region shares one history, and the backstory is
   the region's own chronicle. A start made up from the sketch alone was dropped: it could not
   match this. Tribes with spheres of influence stay a later step (7).
3. **Changes by the month** — **done 2026-11-02, differently than planned.** True monthly ticks
   would mean rescaling every rate in core.js and both packs (growth, expansion, event budgets,
   cooldowns), which changes every history; and a worker is not needed while a region's whole
   history takes a second or two. So the engine keeps its 5-year tick and its rules, and each
   change gets its month within the tick: core.js `dateTick` dates land changing hands (by the
   event it came with; a realm's natural spread a month of its own), settlements (with their
   land), new ages and capital moves (`e[3]` on ownerLog/settleLog, `.date` on ageLog/capitalLog).
   `AEON.viewAt` takes a fractional year; at 1 yr/s and slower the map shows the month (ui.js
   `viewTime()`) and mapfx animates each change on its date (`collectTo`); faster, all as before.
   Histories are byte-identical (checked: seed 7 region 4,2 historical, seed 42 region 2,1
   fantasy). The map's caches key on `view.stateKey` (the tick plus how many of the next tick's
   changes have come), so a month without changes redraws nothing.
   "Live" (head start, rerun on intervention) waits for interactivity: with a region computing in
   seconds, an intervention can rerun it from the start with the intervention applied.
   **Finding:** region 4,2's chapter 710-785 has 57 map animations (5 land takes) and 148
   chronicle events: at 10 days/s one animation every ~48 s, one event every ~18 s. The engine is
   too quiet per month for 10 days/s. That led to the two layers (decision 7); the steps below
   replace the old 4-8 (2026-11-03).
4. **The yearly slow layer** — **done 2026-11-03.** Both packs tick yearly (`timeStep: 1`). core.js
   keeps its rates as set for five years (`RATE_YEARS`) and rescales them to the tick:
   `chanceTick` (a chance per five years to the same rate per tick: peace, alliances sought,
   coalitions, vassal revolts and absorption, expansion), amounts in proportion (tech, prestige,
   growth as a power), decays as a power (hired troops and ships, prosperity), the event budget
   as a quota (eventsPerTick x 1/5, the fraction drawn), the consolidation and coalition turns,
   figure turns and world rolls at a fifth; alliances lapse on about one look in five years.
   region.js: the learning pull per tick, newcomer campaigns in as many ticks as their five-year
   turns. The slowest bookkeeping (money and spending, relations drift, learning and forgetting
   technology) runs for each realm once in five years, on a year of its own (`onTurn`), at the
   five-year rates: it needs no yearly resolution and it was half the cost. Open treaties are kept
   in a list (`AEON.openTreaties`) instead of walking every treaty ever made. stats.js samples
   five-year steps. Changes every history. Checked over 32 regions (8 seeds x 2 squares, both
   packs) against the five-year tick: events, battles, land changing hands, realms, land held,
   largest realm, towns, vassals and alliances within a few percent; wars -12% (historical) and
   +2% (fantasy); no event type in the top 40 off by more than 20%. A region's whole history
   computes in about 1.8-2.1 times the old time (Node: 4.5 s -> ~8.5 s for region 4,2). Not yet
   checked in the browser.
5. **Campaigns (the fast layer begins).** The monthly tick inside a chapter; wars carried out by
   armies as engine objects: levy, march, camp, siege, battle, winter quarters, land taken a
   province or town at a time, weather of the month deciding; drawn on the map (merges the old
   steps "wars shown as they unfold" and "campaigns by season"). The biggest step, and the one
   that fixes "nothing is happening".
6. **Court and diplomacy, raids, harvests and plague** on the monthly tick: deaths, heirs,
   regencies, marriages, envoys, revolts; raids after the harvest; bad harvests, famine, plague
   spreading by road and sea. Plus the chapter's stakes and the strip in the 4500 years.
7. **Tribes.** Spheres, seasonal pastures, raids, settling into land.
8. **The region wins.** Write the outcome back; rerun the sketch from that date.
9. **Interactivity:** to be designed (see below).

## Open questions

- **Interactivity:** what can you do? Pick a realm and play it, nudge events, only watch?
  The engine leaves room for any of these (state you can change, the head start can be dropped),
  but the answer decides how much a player sees and controls.
- **Fantasy:** the tier names and what a tribe is there (clans, warbands; elves and dwarves with
  their own kind of sphere?).
- **Chapter titles:** how they are named (pack phrasing) and how many a region offers.
- **The game (`../PLAN.md`):** a chapter's start (a mixed map at a chosen date) looks like a good
  start for the game too; check that the shared generator plan allows it.
