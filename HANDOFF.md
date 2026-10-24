# Aeon — handoff

Read this first when resuming. Started 2026-10-18; current state in the next section.

> **2026-10-22: see `../PLAN.md` first.** Chronicle (website) and the game (standalone) will share
> one terrain generator. The current focus is fine-tuning the world generator here in chronicle; it
> gets extracted into a shared package afterwards.

## Where we are (2026-10-23) — start here

- **Repo:** this folder is a git repo, `github.com/LemmensDaan/aeon-chronicle`, branch `main`. Daan wants a
  commit and a push after every finished, verified step. (`../PLAN.md` still says chronicle is not a
  repo; that is out of date.)
- **Packs:** only `historical` and `fantasy`. The sci-fi pack moved to `../../galaxy-generator`, the
  alternate history to `../../alt-history-generator` (both plain copies, not repos). Daan's direction:
  Aeon becomes one world generator with setup options (number of starting empires; magic none / low /
  medium / high). Not started.
- **Map animations (2026-10-23):** `js/mapfx.js` plays the land-based picks on the real map.
  Read from the logs only (histories unchanged, checked on historical seed 7). Kinds: land taken
  (old-colour flicker, scuffle cloud), split (flicker, crown comes down on the new capital), new
  land (flash), land lost (fading flicker), capital move (crown arc), age reached / realm founded
  (laurels I-V bubble), wonder raised / lost, settlement razed (fire, ruin fades). Territory
  effects show in the political mode only; sprites in every mode. Wall-clock durations; at most 8
  at once, about 4 new a second, the rest of the new land just flashes. Playback calls
  `collect(world, from, to)` each frame; scrubbing (once it settles) and jumps call
  `moment(world, year)`, which plays that tick once; `ui.js runFx()` keeps redrawing while paused.
  No animations for readers who ask for reduced motion. At sea (from the events overseas-invasion /
  sea-crossing, overseas-colony / far-shore-settled, naval-raid): fleets sail from the realm's
  nearest coastal region along a lane found on 2x2-pixel water blocks (depth 2+ from land), run up
  on the target's beach, and the land change waits for them; a raid becomes a battle in open
  water off the raided coast when the foe has a port (a ship burns and sinks, both sides turn
  home), otherwise the coast burns. When no lane exists the land change plays as usual: the
  historical pack's coastal() counts lake shores, so some of its "overseas" invasions and colonies
  start from a lake (seed 7: 3 of 4 invasions, 8 of 19 colonies); the port-only engine change
  would fix that. Ruins now stay on the map (step 4 below).
  Playback speed is in years per second (ui.js SPEEDS: 10, 25, 50, 100, 300, 1200; default 50,
  so the 4500 years take 90 s); the old 1x and 4x were 300 and 1200 years a second, too fast to
  follow the animations.
- **Map fixes (2026-10-23):** political is the first mode and the default; the roads toggle is
  gone (roads always on); sea glints fewer and briefer; elevation shades by rank among the land
  (`elevRank`), so lowlands differ, not just the ranges; realm borders only in the political
  mode. Land changing hands is drawn by `compose()` itself (`AEON.mapfx.contested()`): it keeps the
  old owner's borders while its 4-pixel blocks flicker between the colours, then settles with a
  flash, as in the samples; land waiting for its ships keeps the old owner.
- **War band (2026-10-23):** a land take by force now plays as in the sample: a band of three under a
  banner marches up from the attacker's neighbouring land, two defenders come out to meet it, a
  scuffle on the border, then the flicker and the flash (mapfx.js `band()`, take timings MARCH +
  1000 + 700 ms). Most takes are a single region (fantasy: every border battle; historical: 58 of
  99), which is the engine, not the animation; Daan does not want bigger conquests yet.
- **Military plan (agreed 2026-10-23), one step at a time:** (1) army and fleet per realm, logged
  and shown — **done**; (2) battles by strength plus chance — **done**, the margin sets how much land changes
  hands, both sides lose men, war-band sizes follow the strengths, same model at sea; (3) realm
  types that change through the ages — **done** (by age + size + events: kingdom -> empire, collapse ->
  successor/warlord states, coastal city-state with a fleet -> thalassocracy), one shared mechanic
  with each pack's own names; (4) — **done** — war aims conquer / plunder / raze, a sack record per region,
  razing can empty land completely and leave ownerless ruins that can be resettled. Daan's picks:
  real soldier and ship counts, evolving types, shared mechanics, razing can empty land. After
  military: diplomacy, then technology and economy.
- **Step 1, army and fleet (2026-10-23, histories unchanged, checked 4 seeds):** core.js
  `musterForces()` sets `p.army` (men), `p.navy` (ships), `p.ports` at the end of each tick and logs
  army/navy in `sizeHistory`; `AEON.forcesAt(p, year)`. Army = 1.2% of the people x archetype
  `army` x temper (aggression) x readiness (stability, a ruler, pack `warWeariness`). Navy = hulls
  of sea ports (tier, capital +2; 0.25 per open shore region) x 5 x wealth x tech x archetype `navy`.
  Factors are in each pack's archetypes (steppe army 2 navy 0.1, maritime 0.6 / 3, etc.). Shown in
  the statistics sheet (Armies, Fleets tabs), the realm page (Army, Fleet replace the 0-1
  Military) and the map tooltip.
- **Step 2, battles (2026-10-23, changes every history):** core.js `AEON.battle()`: the men each
  side brings (`AEON.fieldArmy`: past 24 regions only sqrt(24/regions) of the army reaches a
  front; a realm at several wars splits it) x quality (0.5 + tech) x pack edge (historical:
  event bonuses; fantasy: relics) x ground (archetype `ground` x1.3; defender: mountain 1.5, high
  ground 1.2, forest/jungle/swamp/taiga 1.15, river 1.15, city walls 1.25, capital 1.15). Odds =
  sa^2 / (sa^2 + sd^2). Margin narrow / clear / crushing sets land taken (1, 1-2, a block up to 6)
  and losses; a crushing defence pushes back one region. Losses are owed (`armyDebt`,
  `navyDebt`) and healed 20% per 5 years. Historical: `strength()` and `fight()`, `repelled()`;
  conquest, battle, decisive-battle, siege (merged siege-succeeds/fails), steppe-invasion,
  overseas-invasion (sea battle, then a landing with 40% of the army), naval-raid all fight.
  Fantasy: `might()`, `fight()`; border-battle, siege-and-sack, relic-war, sea-crossing fight.
  Failed attacks are tagged "repelled". `p.military` still gates some event tests.
  Results (seeds 7/42/3): historical ends with 10-12 realms (was 20; pack realmsAtEnd is 10),
  attackers win ~62-67% on land; fantasy ends with 17-20, attackers win ~42-51% (defender
  terrain). Map: war bands follow the battle's men (1-5 a side, mapfx `bands()` reads
  world.battleLog), and a repelled crossing plays as a sea fight the attacker loses.
- **Step 3, realm types (2026-10-23, changes every history):** `pack.realmTypes` (PACK_API 3.3b),
  core.js `chooseType()` every tick: the best `fit(s)` among the types open in the realm's age
  (and to its kind), kept while within 0.5 of the best, for its first 30 years, and for 50 years
  after it stops fitting. Size is relative (`s.rel` against the median realm, `s.rank`), since
  region counts differ 10x between packs and ages. The archetype stays the realm's kind (events
  and names still use it); the type is `p.typeId` / `p.typeName`, logged in `p.typeLog`, with
  army / navy / expansion factors, a one-off trait shift, and `plunder` (unused until step 4).
  Successor / warlord states: `p.heirOf` (core.js inheritLearning, now also for one-region
  splits) within 80 years. Historical: 26 types (chiefdom, city-state, river kingdom, temple state,
  nomad confederacy, great kingdom, highland confederacy, kingdom, city league, thalassocracy,
  satrapy empire, republic, hegemony, imperial state, tribal confederation, feudal kingdom,
  caliphate, khanate, merchant republic, theocracy, principality, absolute monarchy, colonial
  empire, gunpowder empire, constitutional state, successor / warlord). Fantasy: 29, with each
  people's own forms (Clan-Delve -> Under-Kingdom -> Steam-Hold, Elder / Twilight Court, Barrow-Court
  -> Undying Dominion, Wyrm-Fief -> Dragon-Dominion, Tower-Tyranny -> Magisterium, Market-Moot ->
  Guild / Free Republic, Thanedom, Shrine-Hold -> Holy See), Over-Kingdom / Grand Empire, Sea-League;
  Sundered Crown / Reaver-Hold only for kingdoms, wizard realms and hill clans. Changes are events
  (importance 2, empires 4): about 50-100 a history. Shown in the map tooltip, the realm page
  (subtitle, "Forms of state") and the atlas. Six seeds end with 10-11 realms (one fantasy seed 20).
- **Step 4, plunder and razing (2026-10-23, changes every history):** core.js `AEON.warAim()`
  picks conquer / plunder / raze by weight (conquer 1; plunder 0.35 x type plunder x (0.4 +
  aggression) x early-age factor 1.4..0.6; raze 0.08 x plunder^2 x (0.3 + aggression); packs scale
  them). `AEON.plunder()`: settlement one size smaller (a village becomes a ruin), land kept by its
  owner. `AEON.raze()`: settlement a ruin, people gone, land to no one. Both log to
  world.sackLog ([year, rid, attacker, victim, kind]; `AEON.sacksAt`, `AEON.logSack`). Aims
  are asked on a won decisive battle, siege (raze x4) and steppe invasion (conquer x0.6) in
  historical (`pillage()`; capital-sacked logs its sack too) and a won border battle and every
  siege-and-sack (conquer 0, raze x4) in fantasy. About 20-30 sacks a history. Ruins:
  `AEON.ruinAt` / `AEON.ruinsAt` read them from the settleLog (any settlement that went and was
  not rebuilt), with the old name; pixelmap.js draws them where the settlement stood, after the
  living settlements and at the zoom of their size; the burn animation now leaves its ruin and
  the map carries it on (mapfx `burning()`, `ruinSprite()`). A settlement founded on a ruin
  remembers it (`settlement.onRuins`). Tooltip: "Ruins of X, destroyed ...", "built on the ruins
  of X", "sacked N times, last ..."; region page: a Sacked / Ruins section. Pack text numbers in
  fantasy now format in English ("1,210", not the browser's "1.210").
- **Diplomacy plan (agreed 2026-10-23), one step at a time:** (1) relations with memory, treaties,
  shared by both packs — **done**; (2) wars with goals, a war score from battles, peace terms from
  the score, truces of 20-40 years, weariness (most wars 5-40 years); (3) alliances that join wars
  (calls to arms, refusals, betrayal) and coalitions against a realm grown far beyond the rest;
  (4) tribute becomes vassalage (wealth to the overlord, troops in its wars, protection), vassals
  absorbed gradually or breaking free, replacing one-step absorb-minor / fealty-sworn; (5) a
  "Diplomacy" map mode (hover or select a realm: allies, vassals, enemies, truces), a treaties list
  on the realm page, a page per war. Daan's picks: shared for both packs, coalitions yes, vassals
  absorbed gradually, the map mode yes. After diplomacy: technology and economy.
- **Diplomacy step 1 (2026-10-23, changes every history):** core.js diplomacy section:
  world.treaties ({ id, kind, a, b, start, end, ended, until, ... }) and world.grievanceLog
  ([year, from, to, delta, reason]); `AEON.treaty / endTreaty / treatyBetween / treatiesOf /
  remember / memoriesBetween`; `driftRelations()` once a tick (resting level as in PACK_API,
  half-life 60 years, frozen at war); treaties with `until` lapse, a fallen realm's end;
  logSack makes the victim remember. Historical: wars (startWar / endWar) are war treaties and the
  declaration is remembered, war ends trade; land taken (annex), raids, tribute (treaty, revolt
  ends it), marriage (treaty, 80 years), trade routes (100) and leagues (150), pilgrims are
  remembered; `relationBase`: shared faith +0.15, rival faiths -0.05. Fantasy: `war()` /
  `peace()` helpers make every declaration a war treaty (war-declared, holy, mage and relic wars,
  sea crossings); alliance-sworn makes an alliance (100 years) and a marriage; tribute to a wyrm is
  a tribute treaty; land taken is remembered. Realm page: Relations lists strong feelings and every
  treaty in force with its last three memories (fixed the old broken links there). Results: wars
  still long (historical median 90-95 years; fantasy 380-440, as before: fantasy wars only end by
  a peace event) — step 2 is what shortens them. Fantasy ends with 10-20 realms (seeds 3, 42, 7).
- **Night of 2026-10-23 (Daan asleep):** he asked for: animations on the history clock, then the
  rest of diplomacy, then economy and technology, choosing defaults himself where needed and
  writing the questions down for him (QUESTIONS.md, answered and removed 2026-10-24). Wars should last at most about
  10 years, skirmishes far shorter, the long timescale kept: 5-year ticks with dated events
  inside them; only major events and a followed realm slow playback.
- **Animations on the history clock (2026-10-23, view only, histories unchanged):** mapfx.js keeps
  its own clock (`advance(ms)`), moved on by ui.js `loop()` while playing and by `runFx()` while a
  jumped-to moment plays; pausing freezes every animation mid-step (`fxFrozen`). Great moments
  hold the year still while they play (`holding()`): changes with prio >= 5 (MAJOR: big takes,
  splits, capital moves, sea events, a city burning) or of the followed realm; pace setting
  "Never slow" / "Slow sometimes" (bank: 0.02 s per year, max 8 s) / "Slow for all major". Follow:
  "Follow it on the map" on a realm's page (shell.js), a chip in the transport bar,
  `AEON.follow(pid)`; its changes always get an animation and always hold. ‹ › jump to the
  previous / next year with a chronicle entry of importance 4+ (or 2+ of the followed realm).
  Simulated at 50 yr/s (historical 7): never 90 s, sometimes 147 s, all 202 s; fantasy 64 / 103 /
  104 s. Headless Edge does not run requestAnimationFrame under virtual time, so playback was
  checked by simulating the ui.js loop in node (scratch pace.js), not in a browser; the built-in
  browser pane refused localhost and file:// while Daan was away.
- **Diplomacy step 2, short wars (2026-10-24, changes every history):** core.js `warClock()` each
  tick: every open war treaty may end (30% + 60% x |war score| + 35% once 4 years old; at 8 years
  it ends), through the pack's peace event run with ctx.war / ctx.warScore (`concludePeace`;
  pack.peaceEvent, default "peace-treaty"; core fallback "X and Y made peace"), then a truce of
  20-40 years (`AEON.makeTruce`; also from historical endWar and fantasy peace()). A war declared
  during a truce breaks it (a grievance). ctx.rivals() leaves out truce partners. `AEON.warScore`
  (-1..1 for side a): battles by margin (battleLog [8] is now the margin 1-3) and grievances
  since the war began. Dates: `dateTick()` spreads each tick's events over its 5 years to the
  month (ev.date; ev.year stays the tick's); treaties get startDate / endDate, wars `years`
  (`AEON.warLength`, at most 10). Open treaties are indexed (`openIndex`), sea-shore regions
  cached (`onSea`). Historical peace-treaty: terms from the score (d = round(score x 4)), "after
  N years" from warLength. Fantasy peace-treaty: a one-sided war (|score| >= 0.4) ends with a
  border province ceded or a 30-year tithe; the throttle never drops an engine-ended war. Results:
  wars last 0.3-10 years (median 6-7); historical ends with 10-11 realms, fantasy 10-18.
  Generation got slower: historical seed 7 about 9.5 s headless (was about 6).
- **Diplomacy step 3, alliances and coalitions (2026-10-24, changes every history):** core.js
  `callToArms()` (from AEON.treaty when a war that is not itself `joined` begins): each ally of the
  attacked joins (`joinWar`, through pack.joinWar so the pack keeps its own war records; a war
  `joined` with `leader` that ends when the leader's war does) if keen (likes the attacked
  better than the attacker by 0.2, aggression helps, a truce with the attacker -0.3) or sworn
  against the attacker (coalition / against); else it refuses (remembered, the alliance breaks
  half the time). `allianceTick()` each tick: estranged alliances lapse (relation < -0.2); a
  threatened realm (stronger hostile neighbour) may ally with a friendly neighbour (8% a tick,
  40-80 years, `against`); a coalition against a realm 4x the median and 2x the next (25% a tick,
  once a century per giant, up to 5 neighbours, pacts of 30 years, the strongest leads the war,
  the rest join it). Coalition wars give their attackers an extra consolidate turn each tick (up
  to 5). A war between allies betrays the alliance (remembered -0.5, event). ctx.rivals() leaves
  out allies and truce partners. Events: call-to-arms, call-refused, alliance, coalition,
  alliance-betrayed. Results: historical 4-8 calls answered, 7-18 coalitions a history, but a
  2,000-3,000-region empire still forms in most historical seeds (QUESTIONS.md 8).
- **Diplomacy step 4, vassals (2026-10-24, changes every history):** a "tribute" treaty (a pays b) is
  vassalage. core.js: `AEON.lordOf` (indexed "lord|id" in openIndex), `AEON.vassalsOf`,
  `AEON.makeVassal` (one lord at a time); `tributeTick` (vassal wealth -0.1, lord +0.03 each, max
  +0.15); callToArms: vassals join every war their lord fights (`levy`, no chronicle entry), a lord
  defends its vassal (80%, event lord-defends); `vassalTick`: absorbed after 30+ years if a third of
  the lord's size or less (25% a tick while over realmCap, else 6%; event vassal-absorbed), breaks
  free when as strong as 0.8 of its lord after 20 years or the lord fights 2+ wars (20%; half the
  time the lord goes to war; event vassal-breaks-free). Historical absorb-minor and fantasy
  fealty-sworn now make vassals; minorNeighbours / minorOf skip realms that already have a lord;
  historical h.tribute is gone (tribute events read AEON.lordOf / vassalsOf). Results: historical
  about 60-70 vassals absorbed and 20-30 breaking free a history, 10 realms at the end; fantasy
  about 10, ends with 16-21 realms.
- **Diplomacy step 5, seeing it (2026-10-24, view only):** pixelmap.js mode "diplomacy" (second in
  MODES and the mode bar): the political wash and borders, coloured by `AEON.stancesAt(world, focus,
  year)` (core.js; self / war / lord / vassal / alliance / truce / friend, colours in STANCE,
  `AEON.stanceColors`); focus from ui.js `diploFocus()` (hovered realm, else selected, else
  followed), passed as opts.focus and part of the frame key; legend lists the stances. Map tooltip:
  a line "at war with ... · vassal of ... · lord of ... · allied with ..." for the shown year. Realm
  page: "Wars and treaties" (all its treaties, newest first, 40 at most, dates from the events,
  war length, joined / levy / coalition, how it ended, links "how it began" / "how it ended"). No
  war pages yet (QUESTIONS.md 15).
- **Economy step 1 (2026-10-24, changes every history):** core.js `economyTick()` each tick (after
  driftRelations; it replaced the step-4 tributeTick): income = people (0.0015 a head x (0.4 + tech)
  x techFactor wealth) + (metal x 4 + exotic x 8 + port tiers x 6) x (0.5 + tech) + trade treaties
  (5% of people's make each, at most 4) +- vassal tribute (15% of the vassal's income); upkeep =
  army x 0.05 + navy x 0.8, x1.5 at war; treasury += (income - upkeep) x 5, capped at 3x income;
  below -2x income: bankruptcy (armyDebt += a third of full army, stability -0.08, treasury =
  -income, event "bankruptcy" at most once per 50 years). p.wealth +- 0.15 by treasury / (3 x
  income). Loot: logSack adds a year of the place's make (x2 razed) + tier x 20 to the attacker's
  treasury. p.income, p.upkeep, p.trade, p.tributeNet, p.treasury; income and treasury in
  sizeHistory and `AEON.forcesAt`. `AEON.currency(world)` (pack.currency: historical talents,
  fantasy crowns). Shown: statistics tab Wealth (share of income), realm page Income / Treasury
  (replacing the broken 0/1 Wealth), tooltip. `techFactor(world, p, key)` reads
  pack.technologies (next step).
- **Technology step 1 (2026-10-24, changes every history):** pack.technologies ({ id, name, age,
  needs, effects: { army, navy, growth, wealth }, verb }; historical 22, fantasy 20). core.js
  `techTick()` each tick (before economyTick): a realm of the technology's age that knows its needs
  learns it from contacts (`contactsOf`: neighbours and every non-war treaty partner; 12% each, max
  60%, +1%) or, if no one knows it, alone (0.4% + 2% x curiosity x tech); p.techs (id -> year),
  p.techLog ({ year, tech, first }); first in the world is an event "discovery"; each one +0.01
  tech. `techFactor(world, p, key)` multiplies: battle quality (army / navy, AEON.battle), capacity
  (growth), economy (wealth). `AEON.techsOf(world, p, year)`. Realm page: "Technologies".
- **Daan's feedback 2026-10-24 (morning):** slow time works; wants (1) the camera to pan to great
  moments (an option), (2) a battle at a kingdom's edge sometimes takes a big kingdom whole: work with
  provinces, (3) fantasy should consolidate like historical (chronicle length: later), (4) money spent
  on armies, fleets, wonders and population (prosperity -> growth -> more economy and military, on a
  longer scale), (5) grey ruins; wonders rarer, expensive, only for very prosperous realms and only in
  capitals (a capital that becomes a city keeps them), (6) one road style everywhere (the solid track).
- **Roads, ruins, wonders (2026-10-24):** pixelmap.js: every road the solid brown track (cobbles and
  dotted tracks gone). mapfx.js RUINS in grey (RUIN_PAL). Wonders: ctx.wonderSite is the capital
  only, and only if `AEON.canBuildWonder` (income >= 1.5x the median living realm's, treasury >= 2.5
  years' income); raising one costs 2.5 years' income (`AEON.payForWonder`, called by historical
  ruler-builds-wonder and great-library, fantasy great-work-raised). Destruction rarer: historical
  wonder-destroyed and fantasy great-work-falls weight 0.5, only for one at least 150 years old.
  Seed 7: historical 51 wonders (was 198), median life 275 years; fantasy 14 (was 29), 710 years.
- **Camera (2026-10-24, view only):** ui.js `cameraStep(dt)` in the playback loop while the ◎ button
  is on (default on): when a great moment holds the year (mapfx `focusPoint()`: the newest held
  animation's region), the map zooms in to at least CAM_P = 3 device pixels a map pixel and glides
  to it (a third of the way every 350 ms). Not seen in a real browser yet (no rAF headless).
- **Provinces (2026-10-24, changes every history):** core.js `makeProvinces()` at world creation (no
  rng): seats are the best sites (siteSuitability) taken best first at least PROV_GAP = 3 regions
  apart, every land region joins the seat it is fewest land steps from; islands without a seat get
  their own. About 500 provinces of 6-14 regions (median 10). world.provinces ({ id, seat, regions
  }), region.province; `AEON.provincePart(world, region, ownerId)`, `AEON.provinceCount`,
  `AEON.oneEach(world, list, n)` (one region per province). Both packs' annex() take the loser's
  whole part of the province; battles take up to 3 provinces (oneEach, crushing 3, else min(2, take));
  historical conquest takes a realm whole only if it holds 1 (clear) or 2 (crushing) provinces. Map:
  a war band marches only where a battle took the land (mapfx bands() returns null otherwise), so a
  vassal folded in or a cession just flickers.
- **Fantasy consolidation (2026-10-24):** fantasy "war-won" (consolidate, weight 12), the counterpart of
  historical conquest: at war with a neighbour 1.3x weaker (might), a battle at the border; won: a
  realm of 1-2 provinces whole, else 2-3 provinces, then peace. Fantasy ends with 10-15 realms (seeds
  7, 42, 3, 11), was 10-24.
- **Spending (2026-10-24, changes every history):** core.js `spend()` in economyTick, after the
  balance is added and before the treasury is capped at 3 years: reserve 1 year's income (2.5 for a
  realm at peace that could afford a wonder), the rest spent. At war or facing a stronger hostile
  neighbour 70% army, 20% navy (if coastal), 10% prosperity; at peace army (0.15 + aggression x 0.5)
  x 0.6, navy x 0.25, the rest prosperity. Soldiers 1 each (losses first, then p.armyExtra up to
  +33% of the levy, -10% a tick), ships 10 each (p.navyExtra up to +50%), prosperity 80 years'
  income for all of it (-4% a tick). Prosperity: capacity x (1 + 0.3 p), output per head x (1 +
  0.25 p). Realm page: Prosperity. Seed 7: prosperity 0.2-0.7 at the end; armyExtra mostly at its
  cap (surpluses are large; tune later).
- **Daan's answers 2026-10-24 (QUESTIONS.md, then removed):** (8) a giant that loses a coalition war
  breaks up; (14) diplomacy map: nothing coloured without a realm in focus, truce silver, trade gold;
  (15) a page per war and an overview of wars; (22, 23) technology shown on the map, knowledge lost,
  old invention events tied to the named ones: a brief for another agent (docs/TECH_VISUALS_BRIEF.md);
  wonders were not drawn on the map; (28) province borders when a realm is hovered / selected; (7)
  dates with seasons. Every other overnight choice stands as built.
- **Map, dates, break-ups (2026-10-24):** diplomacy mode: `AEON.stancesAt` returns nothing without a
  focus; STANCE truce #c9ced6 (silver), friend #e0b84f (gold); the realm in focus keeps its own
  colour. Wonders: pixelmap places them right after the capitals (placeWonders) at every zoom (they
  were only drawn from 2x zoom and lost their room to towns). Province outlines: compose(...,
  provOf): a one-pixel line in the realm's darkened colour where two of its provinces meet, for the
  realm under the cursor (else the selected land's; ui.js opts.provincesOf). Tooltip: "N regions in
  M provinces". Dates: `AEON.dateLabel(world, ev)` ("spring 1203 BC", seasons from pack.seasons,
  default winter / spring / summer / autumn), chronicle `C.when(e)` used in the story, timeline,
  event pages, atlas search, graph labels and the export. Break-ups: `campaign()` (start of warClock)
  fights one battle a tick for every open coalition war on the giant's border (armies split over
  open wars), a win takes 1-2 provinces; `concludePeace` stores t.score; a leader's coalition war
  ending at score >= 0.25 for the coalition calls `breakUp`: the giant's farthest third of
  provinces (not its capital's) form 2-3 new realms (spawnPolity, hostile, its heirs), event
  "empire-breaks-up" (importance 5). Historical seeds 7 / 42: 4 / 6 break-ups (seed 3: none); giants regrow.
- **War pages (2026-10-24, view only + battle dates):** encyclopedia kind "war" (base.js ent / warById /
  warName, shell.js route, pages.js `pageWar`): a war is its war treaty plus every war joined to it
  (`leader`), `warFamily` sorts their realms into attackers and defenders; sections Sides, battles
  (battleLog between the sides while it lasted, with men, winner and margin), Taken and destroyed
  (grievances took / raided / plundered / razed), Peace (how it ended, t.score), In the chronicle
  (entries naming a realm of each side). Atlas tab "Wars" (main wars newest first). The realm page's
  war treaties link to their war. Battles are dated: battleLog [9] the event index at the time, [10]
  the date given by dateTick (the event it came before or after).
- **Wonder fixes (2026-10-24):** a wonder in a standing capital was never drawn: it sat 5.5 sprite pixels
  right of the cell, overlapping the palace's box, and markers never cover each other. Now PALACE.w / 2
  + 2 sprite pixels right (pixelmap placeWonders and the mapfx rise / fall animation alike). Harbours,
  lighthouses and sea-walls (historical WONDERS) and the fantasy harbour / lighthouse great works only
  in a capital on the open sea. Tooltip: "Wonder: <name>, raised <year>"; the "ruins" feature is not
  listed under a standing settlement. Wonders still have one sprite (the obelisk); the designs of
  samples/animations.html round 2 are not wired in (Daan: not now).
- **Diplomacy focus look (2026-10-24, Daan's pick):** the realm in focus is a pale cream wash (STANCE.self
  #f4ecd8) with its ordinary border and its province lines (a thick ink border was tried and dropped); the legend leads with a cream chip and its name.
- **Technology on the map (2026-10-24, view only, histories unchanged: checked historical and fantasy
  seeds 7 and 42):** war bands and fleets look like what their realm knew that year (Daan's picks from
  `samples/tech-sprites.html`, round 3). mapfx.js `looksOf(w, p, year)` reads `AEON.techsOf`
  through a table per pack (`LOOKS`): band plain spear -> bronze sword (historical bronze, fantasy
  smithing) -> iron sword (iron, star-iron) -> pike sloped forward (iron and the fourth age) -> musket
  shouldered (gunpowder, black-powder); ship oared boat (stroking oars) -> sail (sail, sea-charts) ->
  galleon (galleon, galleons) -> steam-ship, fantasy only, smoking (steam-ships). The standard bearer
  now marches at the back of the band, facing the enemy, with the standard of the age (bull's head,
  eagle, flag with a cross, regimental colour) trailing behind him; standing musketeers fire in turn.
  Ships face the way they sail. Looks are read when the change is found (changes()), so a realm keeps
  its look for the whole animation. Historical realms learn the sail early (age 0), so their oared
  boat is rare. Next in `docs/TECH_VISUALS_BRIEF.md`: knowledge that can be lost, then the old events.
- **Waiting on Daan:** feedback on round 2 of `samples/animations.html` (`?t=ms` freezes a frame,
  `?only=N` shows panel N large). Round 1 feedback, now applied there: use the map's own cell borders
  (no straight lines); expansion in steps, not smooth; a split promotes a town to the new capital;
  land invasions get a scuffle cloud and the contested flicker before the change; ships sail only
  from ports and keep to open water; a sea landing takes a small beachhead with a camp at the water's
  edge, and a second wave takes the inland town; colonies start as a shore camp. New: naval battle
  with a ship burning and sinking, a settlement destroyed, a wonder destroyed. He disliked the age
  pennant and the obelisk wonder: round 2 offers four of each (sun / hourglass / laurels / book;
  ziggurat / lighthouse / domed hall / temple). He liked the split and the capital move.
  Round 3: the split has its round-one flicker back (he found the cell blinking jarring), and the
  invasions use it too. He dislikes the keep as the capital sprite: four capital designs to pick
  from (domed palace, citadel tower, great hall, crowned city). Five Greek / Roman wonders added
  (colosseum, triumphal arch, aqueduct, colossus, victory column). Every settlement kind has its own
  burn and ruin; ruins should stay on the map. His idea for the engine (changes histories): a
  collapse leaves empty land with no new capital, some settlements in it are destroyed and stay as
  ruins (named in the tooltip), and new settlements may be founded on ruins.
  Round 4 picks: the domed palace is every capital, on the map too (js/pixelmap.js PALACE; the
  other capital designs stay in the sample, shelved). New age: laurels with the age's numeral,
  I to V (both packs have five ages); age I shows when a realm is founded with its capital.
  Landing ships run up on the beach. Wonder designs are "not quite there yet": keep them for now,
  redesign later. Idea for later (engine): start a world with people in small settlements
  instead of ready-made kingdoms, so realms (and age I) arise during the history.
  Engine follow-up he asked for (changes histories): naval invasions and colonies only from coastal
  cities (maybe a distinct port sprite), landing as a small beachhead, then reinforcements to take
  more. After he picks, wire the animations into the map: play events as playback passes them, at
  a sensible rate, and play the moment's events once when the year is set by scrubbing.
- **Recent rounds, newest first** (each has its own section below): beaches back and two road styles
  (cobbles between cities and capitals, solid tracks elsewhere); more action and consolidation
  (~50 realms early, 10-20 at the end, annexation, overseas invasions and colonies, moving capitals,
  half the events); a sparser world (site suitability decides settlements); torn-parchment floating
  plaques over a full-bleed map; Rooftops settlement sprites; map modes; ambient sea animation;
  statistics sheet (population, territory, cities, wonders; ages and battles marked).
- **Things Daan rejected, don't bring back:** polar ice caps along the map edges; straight inked-rule
  plaques (he wants torn parchment); names drawn on the map (names live in the hover tooltip); dotted
  roads; the old red-square selector; AoE look-alikes (shields etc.) — own style only.
- **Every change to the engine or packs changes every seed's history**; say so when it happens.
  Changes that only read the world (logs, views, map, statistics) must keep histories identical:
  check with a same-seed run before and after.
- **Tooling notes:** Python is not installed (use node for scripts). Several files use CRLF; edit via
  node with the line ending preserved, or the Edit tool. Bash heredocs and `node -e '...'` break on
  apostrophes and eat backslashes: write longer scripts to a scratch file with the Write tool. Browser
  checks: a temporary `_t.html` copy of `index.html` with a hook script, run headless in Edge (see
  Verification); delete the temp files afterwards.

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
| `js/mapfx.js` | **map animations** (`AEON.mapfx`): events shown on the map as playback passes them (see "Map animations") |
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
  cities and capitals. Always shown (2026-10-23: Daan dropped the roads toggle; roads are on).
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

## More action, consolidation (2026-10-23)

Daan: more action within and between kingdoms; ~50 realms early, 10-20 standing at the end; half the
events; conquest may raze settlements; capitals may move; overseas invasions and colonies.
- `AEON.realmCap(world)`: `pack.realmsAtStart` falling to `realmsAtEnd` over the timeline (historical
  50 -> 10, fantasy 40 -> 10). Every realm-creating event is gated on it (`crowded`). While the world
  has more realms than the cap, the engine gives big realms up to three extra turns a tick, spent
  only on events marked `consolidate: true` (historical: absorb-minor, conquest, war-declared;
  fantasy: fealty-sworn, border-battle, war-declared).
- New events: historical absorb-minor, overseas-invasion, capital-moved; fantasy fealty-sworn,
  sea-crossing, far-shore-settled, seat-moved. Their tests stay cheap (the overseas search runs
  only when the event fires, over at most 6 ports).
- The toll of conquest (`conquestToll`, fantasy `annex`): a captured settlement may be razed or
  shrink; a conqueror with a smaller seat may move its capital to the captured one.
  `polity.capitalLog` and `AEON.capitalAt` keep past-year views right.
- Fewer events: 2 polity events and at most 1 figure event a tick; orderly accessions and heir births
  mostly go unrecorded (weights 34 -> 6, 10 -> 3).
- Settlements favour rivers (x1.35), sea coasts (x1.2), lake shores (x1.3) and woods (x1.1); founding
  on new land is rarer.
- Five seeds: historical peaks ~44 realms and ends ~19, 3,480 events (was 6,494), ~260 settlements;
  fantasy peaks ~28 and ends ~18, 1,705 events (was 3,038), ~215 settlements. Changes every seed.

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
