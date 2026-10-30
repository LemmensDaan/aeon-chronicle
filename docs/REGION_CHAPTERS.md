# Region chapters: design

2026-10-30. A design to agree on before building. Nothing is built yet.

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
4. **10 days a second is the speed the chapter is designed for.** Replaying slower and faster must
   still work (see "Speed and replay").
5. **Peoples start where history has brought them**, not from zero: tribes, chiefdoms,
   city-states, kingdoms and empires side by side, as the sketch's development says.
6. **Wars are shown as they unfold** (the levy gathering, the march, the camp, the siege, the
   supply train) and **campaigns follow the seasons**: they advance in the campaigning season,
   stop for winter, fleets wait for good weather.

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

- region history: from a full pre-run to a live engine with a monthly tick, a worker and a head
  start (core.js, ui.js playback, mapfx timing)
- a region's start: from the sketch's state at a date, with tiers, not from the founding peoples
- wars: campaigns with armies on the map
- tribes: spheres of influence
- every region history and its chronicle text (said here once: this changes all histories)

## Build order

Each step is checked on seed 7 at 10 days/s before the next.

1. **Chapters on the world level.** Pick them from the sketch, list them on the timeline and in
   the region panel. The region still runs today's history, cut to the chapter's window. This
   shows quickly whether 30-80 years at 10 days/s is the right length.
2. **Start from the sketch at a date.** Peoples with tiers and land sized by power, towns and roads
   to match, foreign frontiers, a backstory.
3. **The live engine.** Monthly ticks in a worker with a head start; logs as now; scrubbing back,
   jumping forward; speed and replay as above. Same history rules, only finer.
4. **Wars shown as they unfold.** Levy, march, camp, siege, supply, from the engine's state.
5. **Campaigns by season.** Armies as engine objects, weather of the month stops or slows them.
6. **Tribes.** Spheres, seasonal pastures, raids, settling into land.
7. **The region wins.** Write the outcome back; rerun the sketch from that date.
8. **Interactivity:** to be designed (see below).

## Open questions

- **Interactivity:** what can you do? Pick a realm and play it, nudge events, only watch?
  The engine leaves room for any of these (state you can change, the head start can be dropped),
  but the answer decides how much a player sees and controls.
- **Fantasy:** the tier names and what a tribe is there (clans, warbands; elves and dwarves with
  their own kind of sphere?).
- **Chapter titles:** how they are named (pack phrasing) and how many a region offers.
- **The game (`../PLAN.md`):** a chapter's start (a mixed map at a chosen date) looks like a good
  start for the game too; check that the shared generator plan allows it.
