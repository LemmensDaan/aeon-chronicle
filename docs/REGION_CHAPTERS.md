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
   **5a done 2026-11-03: armies on the map, the weather deciding when.** js/campaigns.js. The
   engine half (core.js dateTick calls `AEON.campaigns.dateWar`): a year's war events (tagged
   "war", a place, two realms) are dated to the months the square's weather allows a campaign
   (`climate`: twelve weights from the middle land's warmest and coldest months, the south's
   seasons turned round, the rains of a warm monsoon summer; where it never warms, the three
   warmest months), each at a place in the season drawn from the event itself; the year's other
   events keep their order between them. Land, towns and battles take those dates as before. No
   random stream is touched: over 32 regions (8 seeds x 2 squares, both packs) every count
   (events, wars, battles, land changing hands, realms, towns, alliances, event types) is the
   same as step 4; only dates move (and the war lengths read from them). The map half
   (`AEON.campaigns.armiesAt(world, date)`, drawn by mapfx.js `armies`, at the seasonal speeds
   only): each realm at war has an army whose year is read from that year's events. It winters
   in quarters (its own land nearest the front), musters when the season opens, marches to each
   place it fought to be there on the month it was fought, lies two months before a town it
   besieges (smoke over the camp), stands to fight at a battle, watches the border in a year
   without fighting (moving along it every two months or so), and goes home when the war ends.
   On water it is a ship. Vassal levies and allies show only where they fight. Worked out per
   year when shown and cached; nothing is stored. In a 75-year chapter an army is on the map
   about 60-80% of the time, moving a fifth to a third of it.
   **5b done 2026-11-03: the armies decide where and when, and take towns by siege.** Replaces
   5a's after-the-fact dating. js/campaigns.js, hooked into core.js:
   - *Months in the tick.* Each turn of a region's tick has a month (ordinary turns spread over
     the year, extra war turns in the season still to come); what it records is dated to that
     month's end; what follows the turns (peace, alliances, the sketch) goes between the last of
     them and the year's end.
   - *Armies are engine objects* (world.armies): one per side of each war (vassal levies march
     with their lord's), marching monthly at 16 cells a month (less in mountains, forest, marsh,
     tundra, and in the mud of the season's edges) to the front, camping there; the attacker
     besieges the greatest enemy town within three cells. Out of season they go to winter
     quarters and sieges are lifted. Peace sends them home.
   - *The packs ask the armies* (ctx.ready, ctx.front, ctx.siegeOf, ctx.siegeMonths). War events
     are marked `campaign` (historical: conquest, battle, decisive-battle, siege; fantasy:
     border-battle, siege-and-sack, war-won): out of season they cannot happen, in season they are
     likelier by the year's share of season (so roughly as many per year); a war is fought only
     where its army is in the field, at the place nearest it; a town is stormed only when its
     siege has run its months (a village one, a town two, a city three or four), and the
     chronicle tells the months. A battle moves the armies (winner onto the field, loser back
     towards home).
   - *Armies' own turns*, since a realm has a turn only every few decades in a region: a siege
     ready to storm brings its realm's siege event one month in four; camping beside the enemy's
     army, its battle event one month in fifty. A siege half a year overdue is lifted.
   - *The record* (world.armyLog, about 1-2 entries per army-year) is what the map draws.
   Over 32 regions (8 seeds x 2 squares, both packs) against 5a: wars -9% (historical) and -6%
   (fantasy); battles 5.8x and 1.5x; land changing hands +23% and -1%; realms alive at the end,
   land held and the largest realm about the same; towns -11% (historical; more sieges and
   sacks), tribute +64% and +27%, technology lost +40% (historical; lost land shakes learning),
   war declarations -25% (historical: armies worn down by sieges declare less). Compute +16-28%.
   *War chapters* (2026-11-04): the sketch knows only what passes between squares, so no chapter
   picked from it is about a region's own wars. The square plaque has "Find its wars": it
   computes the region's whole history in the background (about ten seconds) and lists its
   fiercest wars (`AEON.campaigns.warChapters`: each war with its allies, scored by battles and
   sieges and three times for land taken; the best four that do not overlap, a year either side,
   at most 25 years). A chapter's chronicle now stops at the chapter's end even when the history
   has been computed further.
   Still to do: supplies and attrition, the weather of a month (a hard winter, a wet summer)
   rather than of the climate, fleets kept in port by storms, and overseas invasions and raids
   carried by armies (they still happen as single events).
6. **Court and diplomacy, raids, harvests and plague** on the monthly tick: deaths, heirs,
   regencies, marriages, envoys, revolts; raids after the harvest; bad harvests, famine, plague
   spreading by road and sea. Plus the chapter's stakes and the strip in the 4500 years.
   **6a done 2026-11-04 (a first pass).**
   - *Raids* (engine, campaigns.js `raids`): in the season's last two months (late in the year
     where there is no winter) a realm may raid a hostile neighbour it has no treaty with
     (relations below -0.3), one chance in twenty a month (more for an aggressive realm, decided by
     the date, not the random stream): a border town's stores burned, its owner's prosperity
     -0.01, relations -0.04. world.raidLog. 0.1-0.5 raids a region-year. Over 32 regions against
     5b: historical within 8% everywhere (largest realm +15%), fantasy alliances +40% (raided
     realms seek allies), the rest within 5%.
   - *The months' happenings* (js/months.js, read from the computed history, changing nothing):
     envoys riding between capitals the month before a treaty is made, and once a year for each
     treaty in force (tribute carried to the lord, gifts between allies, trade envoys, kin visiting
     after a marriage); a bride's train; a ruler lying sick before a natural succession; a plague's
     pall creeping out from a stricken town over a year; a failed harvest the autumn before a
     famine; the armies' news (levies called up, sieges laid, winter quarters, going home, a
     realm's told once a month); raids. Drawn by mapfx.js `months` (riders, a candle, palls,
     raiders and burning stores), and the latest is shown in a news line over the map. Region 4,2:
     0.6-1.4 a month in most chapters, a quarter to a half of the months quiet; early chapters with
     few realms and treaties stay sparse (0.03-0.3).
   - *A chapter's opening card*: "A chapter" or "A war", the title and years, its question (from
     the sketch moment: "Will the land hold against the X invaders?", "Will the peace with the X
     hold?", "Who will win the war of ...?"), and a strip of the world's whole history with the
     chapter and the ages the square reached marked; Begin starts playback. The plaques over the
     map are centred on the map left of the chronicle.
   **6b done 2026-11-04.**
   - *The year's weather* (campaigns.js `weather`, `harvest`): how wet the summer and how hard the
     winter, hashed from the square and the year. A hard winter shortens the campaign season and a
     wet summer bogs it down (`climate(world, year)`). The harvest: about 5% of years fail, 4% are
     poor, 17% rich. A failed harvest makes famine six times likelier (a poor one twice, a rich one
     a third; pack events marked `harvest: true`) and raids 1.8 times (poor 1.3).
   - *Unrest* (js/fastlayer.js): a town taken from another realm stays restless for up to six
     years (a town taken in war the more); now and then it riots (world.unrestLog; the owner's
     stability -0.003), and while a realm holds restless towns its revolt events (`revolt: true`)
     are likelier and break out in them (`ctx.restless()`).
   - *Plague as a contagion* (fastlayer.js): a pack's plague event starts it in its town; month by
     month it spreads to towns within ten squares by road (the nearer the likelier) and from port
     to port across the water; at most three towns a month and 24 in all, each costing its realm
     0.3% of its people per settlement tier; it dies out after a quiet season, and a new one waits
     three years. world.plagueLog.
   - *Happenings*: the harvest and a hard winter told; the plague town by town (a pall over each, a
     month's towns told together); riots; arrivals announced some months ahead ("Word comes of a X
     host gathering beyond the border", from the sketch's invasions, migrations, colonists and
     raiders). A treaty's yearly riders go every year; the news tells of a tribute about one year in
     eight, of other treaties one in four, and of at most two a year; a long siege is told once
     a year.
   - Over 32 regions against 6a: wars -6%/-5%, battles +2%/0%, land changing hands -3%/+2%,
     alliances +21%/+7%, largest realm -9%/+17%, the rest within 10% (historical/fantasy);
     compute about +3% (fastlayer). Region 4,2: 0.4-1.25 told happenings a month, a third to two
     thirds of the months quiet.
   Not yet: regencies as engine events, foreign powers pressing on the edge (only their arrivals
   are announced).
7. **Tribes.** Spheres, seasonal pastures, raids, settling into land.
   **Done 2026-11-04 (a first pass; Daan: the herder peoples are tribes, in both packs).**
   - *Who* (js/tribes.js, `pack.tribal`): a herder people placed from the sketch at its seat (the
     steppe folk and hill clans; fantasy: the hill-clans and druidic circles). Its other realms,
     breakaways and newcomers stay realms.
   - *The sphere*: a tribe holds only its winter camp (its seat). Every land cell within its
     reach of the camp or its summer pasture, reached over land, has an influence from 1 at the
     camp to 0 at the reach; the reach follows its people, 4 to 15 cells. Spheres overlap each
     other and realms' land. It lives off its sphere's herds (core.js capacity): open grazing in
     full, land a realm holds at a quarter, all thinner than tilled land.
   - *Neighbours and war*: its neighbours are the realms holding land in its sphere and the tribes
     whose spheres meet it (core.js neighborScan); in war it fights for the realm land in its
     sphere, and a realm for its camp (`AEON.tribes.front`, the packs' frontiers). It raids
     2.5 times as readily as a realm, the towns in its sphere, and its herds grow with the loot.
   - *Realms and the sphere*: a realm settles open land in a sphere the less readily the stronger
     the tribe's hold, and each farm sours the tribe against it.
   - *Driven out*: losing its camp, a tribe moves its tents to the far side of its sphere with
     less reach and fewer people ("tribe-driven"); it ends only if nowhere is left.
   - *Settling* ("tribe-settled"): a tribe that has taken a town or four cells in war, or late in
     history has grown very large, turns its strongest influence (0.5 and up, at most 40 cells)
     into land and becomes a realm.
   - *On the map*: the sphere as hatching in the tribe's colour, stronger on open land, no border;
     at the seasonal speeds the herds drift out to the summer pasture in the six kindest months
     of the year and back, with tents on the pasture in summer; the news tells now and then of
     the flocks driven up to the summer pastures.
   - Measured over 8 regions a pack (seeds 1, 7, 42, 99, the two most peopled squares): 5
     historical tribes (2 settled, 3 conquered, living about 1400 years; 2% of the raids, 18 times
     driven from their camps), 4 fantasy ones (all settled within a few centuries). Seed 7: a
     tribe in 10 of its squares, most settled by 1000 BC. Over 32 regions against 6b everything
     within 8% in both packs.
   Not yet: tribes uniting into a confederation, a realm making a tribe pay tribute for its
   pastures, newcomers arriving as tribes; the hatching and herds have not yet been judged at full
   size (a camp on a region's edge has half a sphere).
8. **The region wins** — **done 2026-11-04.**
   - *When*: leaving a chapter (to the world, to "Whole history", or to another region) after its
     playback reached the end (ui.js `writeBack`). A chapter left half-way writes nothing.
   - *What*: region.js `AEON.regionOutcome` reads the square at the chapter's end: its realms'
     learning (weighed by people), how united it is (the share of the held land the strongest
     realm rules with its vassals, against the pack's usual share: 0.22 historical, 0.1 fantasy,
     measured at chapter ends; that share is the sketch's cohesion 1, twice it 1.5, half 0.5),
     each of its peoples' land (so the people with the most land leads the square's contacts
     from then on, newcomers too), and the newcomers who hold no land any more (their contact
     is told as driven back).
   - *Rerun*: sketch.js `AEON.rewriteSketch` makes the sketch again with all write-backs, each
     setting its square's state at the first century after its year. Everything up to the year
     is kept as it was (the contacts, with the region's outcomes); after it is a new forecast.
     The sketch's dice are now drawn per century from a stream per square, per link and per tie
     (Daan, 2026-11-04), so a change reaches only squares it touches: in tests 0 to 17 squares,
     0 to 56 contacts changed after the year. This changed every world's sketch once: over 24
     worlds a pack, ages and contact counts stay within about 10%; over 32 regions against step 7
     the region outcomes stay within 12% (battles -7% / -12%, techs lost -21% in historical).
   - *Order* (Daan, 2026-11-04): a write-back drops those with a later year; their chapters stay
     marked as seen.
   - *Regions*: those already worked out past the year are dropped and made again when opened;
     those short of it take the new contacts from where they stand, so "Whole history" plays on
     into the new forecast.
   - *Shown*: "✓ seen" on a played chapter, and a line in the square's panel saying from which
     year the world follows what happened there. The world timeline and map show the new sketch.
   - A rerun takes about 0.1 s.
   - *Kept*: the write-backs and seen marks are saved in the browser per pack and seed, and made
     again in the order of their years when the world opens (this gives the same sketch, checked
     on seed 7). "Forget watched chapters" on the world's header takes the world back to its own
     history. They are not in the link, so a shared link shows the world's own history.
   Not yet: the region's own contacts with other squares (it makes none of its own yet).
9. **Interactivity** (Daan, 2026-11-04: nudges first, playing a realm later on top of them; the
   world follows the changes at the chapter's end).
   **9a, nudges — done 2026-11-04.** In a chapter, "✎ Change" in the playback bar opens a
   panel: pick a realm on the map, then what happens to it from the month shown:
   - *its ruler dies* (the throne stands empty until the next year, stability falls)
   - *it declares war on* a neighbour (the pack's own war, with allies called to arms)
   - *it makes peace with* a realm it is at war with (the pack's own peace)
   - *a revolt breaks out in it* (the gravest of the pack's own revolts that can happen there:
     a province breaking away, a peasant revolt, a rising put down)
   - *plague strikes it* (its chief town; the contagion spreads as any other, step 6b)
   How: js/nudges.js. A change is kept with the square ({kind, realm, other, date}) and the region
   is played again from a copy of itself taken the year before the chapter (region.js
   `AEON.regionSnapshot` / `regionRestore`, a deep copy that keeps the random stream's place:
   rng.js `state` / `setState`). The change comes in its month of its year's turn (campaigns.js
   `setMonth`), so all before it happens exactly as it did (checked: the chronicle before the
   change is identical, and a chapter played on from the copy is identical to one played from the
   start). It takes about 2.5 s (about 20 s from the region's start; a chapter opened on a region
   already worked out past its start has no copy, so its first change takes that long). The
   panel lists the chapter's changes, with "Undo the last change". The changes are told in the
   chronicle (tagged "nudge"), saved with the write-backs, and made again when the region is.
   At the chapter's end the outcome is written back as in step 8. A write-back that changes
   another square's world after its year drops the changes made there after it.
   Not yet: more kinds of change (a marriage, an alliance, a good or bad harvest).
   **9b, playing a realm — done 2026-11-06** (Daan: standing orders and a stop at the biggest
   decisions, both). In the change panel, "Play this realm"; the camera follows it, and the panel
   opens on it.
   - *Standing orders*: warlike, as its rulers would, peaceful. A change like any other (kind
     "stance"), from the month given: its temper (traits.aggression) moves to 0.85 or 0.15 at
     least / most, war events weigh 2.5 or 0.25 times in its turns (core.js fireOne), it answers
     an ally's call more or less readily, and makes peace more slowly or quickly. Measured over 12
     realms a pack (seed 7, three squares, a chapter each): historical wars 3 (as its rulers
     would) / 12 (warlike) / 4 (peaceful), war-years 4 / 62 / 3; fantasy wars 5 / 4 / 1,
     war-years 29 / 47 / 8.
   - *Decisions*: playback stops when the realm played is about to go to war (by its own event),
     answer an ally's call, make peace (the war's end by core.js warClock) or swear an alliance
     (allianceTick or an event), with a card: the season and year, the question, yes or no. Yes
     plays on; no is a refusal (kind "veto": the event in that month for that realm, the call,
     the peace or the alliance in that year), and the region is made again from the snapshot
     without it, back to that month. A refused peace can come again the next year. Coalitions
     and a vassal's levies are not asked. nudges.js `decisions` reads them from the treaties
     (`t.src`, the event that made one; `t.peaceBy`). About one decision a realm a chapter or
     less; mostly peace.
   - Kept with the square (planet._play, planet._decided) and saved; histories without changes
     are exactly as before (checked).
   Not yet: decisions on marriages and vassals; choosing a war's aims; the realm played over
   several chapters at once.

## Open questions

- **Interactivity:** what can you do? Pick a realm and play it, nudge events, only watch?
  The engine leaves room for any of these (state you can change, the head start can be dropped),
  but the answer decides how much a player sees and controls.
- **Fantasy:** the tier names and what a tribe is there (clans, warbands; elves and dwarves with
  their own kind of sphere?).
- **Chapter titles:** how they are named (pack phrasing) and how many a region offers.
- **The game (`../PLAN.md`):** a chapter's start (a mixed map at a chosen date) looks like a good
  start for the game too; check that the shared generator plan allows it.
