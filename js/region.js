/* Aeon - a region's history (docs/REGION_PROTOTYPE.md, step 2).

   AEON.createRegion(world, squareIndex) makes a world of its own for one square of the world
   sketch: the map from AEON.regiongen, and a history the ordinary engine plays out (AEON.tick,
   AEON.runAll), following the sketch:
   - the starting realms are the sketch's peoples in the square, several realms a people, as
     many in all as the square's good land is worth (up to the pack's seedPolities)
   - each realm's learning is pulled towards the square's development curve, so the region
     reaches its ages near the years the sketch gives
   - the sketch's contacts arrive in their years: newcomers over the border facing where they
     came from, or on the coast; their campaign takes the share of the land the sketch's outcome
     says, with fresh waves if they are wiped out before it is done, so the world history holds;
     after it the engine is free
   - expeditions leave for other squares, trade opens, dark ages fall, as the sketch says
   The "beyond" margin is drawn but held by no one. The region has its own random stream
   (seed + ":history:" + square), so it never changes the planet or another region. */
(function () {
"use strict";

const AEON = window.AEON = window.AEON || {};

/* share of the gap to the sketch's learning closed each turn: gently from behind, firmly from
   ahead, since the engine's own growth keeps pushing realms forward */
const PULL = 0.08, PULL_AHEAD = 0.25;
const SHARE = { foothold: 0.03, settled: 0.08, colony: 0.15, partial: 0.35, conquest: 0.75 };
const TURNS = { foothold: 3, settled: 4, colony: 5, partial: 7, conquest: 10, repelled: 3 };
const DIRS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];

AEON.createRegion = function (planet, si) {
  const C = AEON._core, sk = planet.sketch, sq = sk.squares[si], pack = planet.pack;
  const map = AEON.regiongen(planet, si);
  const seed = planet.seed;
  const rng = AEON.RNG(seed + ":history:" + sq.id);
  const world = C.newWorld(pack, seed, rng, map.width, map.height);
  world.regions = map.regions;
  const R = world.regions;
  for (const r of R) {
    if (r.owner === undefined) r.owner = null;
    if (r.population === undefined) r.population = 0;
    if (!r.features) r.features = [];
    if (!r.settlement) r.settlement = null;
    /* the land beyond the square: drawn, never held, and not a shore */
    if (r.beyond && !r.barren) { r.beyondBiome = r.biome; r.barren = true; r.lake = true; r.habitability = 0; }
  }
  for (const r of R) if (!r.beyond) r.neighbors = r.neighbors.filter(function (n) { return !R[n].beyondBiome; });
  Object.defineProperty(world, "_gen", { enumerable: false, configurable: true, writable: true, value: map._gen });
  Object.defineProperty(world, "planet", { enumerable: false, configurable: true, writable: true, value: planet });
  world.square = { id: sq.id, index: si, K: map.K, px0: map.px0, py0: map.py0 };

  /* its realms spread as many times faster as it has more land than the planet map */
  const landOf = function (rs) { return rs.filter(function (r) { return !r.barren; }).length; };
  world.expandTries = Math.max(1, Math.round(landOf(R) / Math.max(1, landOf(planet.regions))));

  C.makeProvinces(world);
  seedFromSketch(world, planet, si);
  C.logSettlements(world);

  const contacts = sk.contacts.filter(function (c) { return c.to === sq.id || c.from === sq.id; });
  world._sketch = { si: si, next: 0, contacts: contacts, campaigns: [], log: [] };
  Object.defineProperty(world, "onTick", { enumerable: false, configurable: true, writable: true, value: onTick });
  return world;
};

/* ------------------------------------------------------------ helpers -- */

function inner(world) { return world.regions.filter(function (r) { return !r.beyond && !r.barren; }); }
function ageFor(pack, L) { const a = pack.ages || []; let k = 0; while (k + 1 < a.length && L >= a[k + 1].at) k++; return k; }
/* the sketch's learning for a square in a year: each century's value is where the square stands
   at its end (it starts from 0), so the region crosses an age within the century the sketch
   names for it */
function curveAt(sk, si, year) {
  const ys = sk.years, L = sk.curves[si].learning, step = (ys[1] - ys[0]) || 100;
  const t = (year - ys[0]) / step;
  if (t <= 0) return 0;
  if (t >= ys.length) return L[L.length - 1];
  const k = Math.floor(t), lo = k === 0 ? 0 : L[k - 1];
  return lo + (L[k] - lo) * (t - k);
}
function peopleById(sk, id) { return sk.peoples.find(function (p) { return p.id === id; }) || null; }
function landOf(sk, sqId) { const p = sk.peoples.find(function (q) { return q.square === sqId && !q.arrived; }); return p ? "the lands of " + p.name : "the lands beyond"; }
/* where another square lies, as a unit vector on the region map and a compass word */
function directionTo(sk, from, to) {
  const a = sk.squares[from], b = sk.squares[to], cols = sk.cols;
  let dc = b.col - a.col;
  if (dc > cols / 2) dc -= cols; if (dc < -cols / 2) dc += cols;
  const dr = b.row - a.row, len = Math.hypot(dc, dr) || 1;
  const ang = Math.atan2(dr, dc);
  return { x: dc / len, y: dr / len, word: DIRS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8] };
}
const nameIn = function (p) { return p.name.replace(/^The /, "the "); };
/* a place by its name, else by its land ("the steppe") */
function placeName(r, world) {
  if (r.settlement && r.settlement.name) return r.settlement.name;
  if (r.name) return r.name;
  const b = world && world.pack.biomes && world.pack.biomes[r.biome];
  return b ? "the " + b.name.toLowerCase().replace(/^the /, "") : "the open country";
}
function coastal(world, r) { return r.neighbors.some(function (n) { const q = world.regions[n]; return q.barren && !q.lake; }); }

/* the inner land cells on the side facing a direction (the top share by how far they lie that way) */
function facing(world, dir, cells, share) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of cells) { x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x); y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = Math.max(1, (x1 - x0) / 2), hh = Math.max(1, (y1 - y0) / 2);
  const sc = cells.map(function (r) { return { r: r, s: ((r.x - cx) / hw) * dir.x + ((r.y - cy) / hh) * dir.y }; });
  sc.sort(function (a, b) { return b.s - a.s; });
  return sc.slice(0, Math.max(5, Math.round(sc.length * share))).map(function (o) { return o.r; });
}

/* --------------------------------------------------------- the start --- */

function seedFromSketch(world, planet, si) {
  const C = AEON._core, sk = planet.sketch, sq = sk.squares[si], pack = world.pack, rng = world.rng;
  const land = inner(world);
  const firsts = sq.peoples.map(function (id) { return peopleById(sk, id); }).filter(function (p) { return p && !p.arrived; });
  if (!firsts.length || !land.length) return;
  /* as many realms as the square's good land is worth, against the planet's */
  const good = (rs) => rs.filter(function (r) { return !r.barren && r.habitability > 0.35; }).length;
  const want = Math.max(firsts.length, Math.min(pack.seedPolities, Math.round(pack.seedPolities * good(land) / Math.max(1, good(planet.regions)))));
  /* each people's seat, and its lands: the inner land nearest its seat */
  const seatOf = firsts.map(function (p) {
    const cand = land.filter(function (r) { return r.planet === p.seat; });
    const pool = cand.length ? cand : land;
    return pool.slice().sort(function (a, b) { return b.habitability - a.habitability; })[0];
  });
  const terr = firsts.map(function () { return []; });
  for (const r of land) {
    let best = 0, bd = Infinity;
    seatOf.forEach(function (s, k) { const d = Math.hypot(s.x - r.x, s.y - r.y); if (d < bd) { bd = d; best = k; } });
    terr[best].push(r);
  }
  /* realms per people, by good land, one at least each */
  const goodOf = terr.map(good), tot = goodOf.reduce(function (a, b) { return a + b; }, 0) || 1;
  const count = goodOf.map(function (g) { return Math.max(1, Math.round(want * g / tot)); });
  const chosen = [];
  const MIN = 11;
  const spawn = function (people, region, first) {
    const arch = people.archetype && pack.archetypes.some(function (a) { return a.id === people.archetype; }) ? people.archetype : null;
    const p = C.spawnPolity(world, region, first ? arch : null);
    if (first) { p.name = people.name; p.adjective = people.adjective; }
    else {
      const archObj = pack.archetypes.find(function (a) { return a.id === p.archetypeId; });
      const n = C.callName(world, "polity", { region: region, archetype: archObj, culture: people.culture });
      if (n && n.name) { p.name = n.name; p.adjective = n.adjective || n.name; }
    }
    if (people.culture) p.culture = people.culture;
    p.people = people.id;
    chosen.push(region);
    return p;
  };
  firsts.forEach(function (people, k) {
    spawn(people, seatOf[k], true);
    const cand = rng.shuffle(terr[k].filter(function (r) { return r.habitability > 0.35; })
      .sort(function (a, b) { return b.habitability - a.habitability; }).slice(0, count[k] * 12));
    let made = 1;
    for (const r of cand) {
      if (made >= count[k]) break;
      if (chosen.some(function (c) { return Math.hypot(c.x - r.x, c.y - r.y) < MIN; })) continue;
      spawn(people, r, false); made++;
    }
  });
}

/* ---------------------------------------------------------- each turn -- */

function onTick(world) {
  const S = world._sketch, planet = world.planet, sk = planet.sketch, si = S.si;
  /* learning held near the square's curve */
  const target = curveAt(sk, si, world.year);
  for (const p of AEON._core.living(world)) {
    if (p.learning == null) continue;
    p.learning = Math.round((p.learning + (target - p.learning) * (p.learning > target ? PULL_AHEAD : PULL)) * 1000) / 1000;
  }
  /* the sketch's contacts that have come due */
  while (S.next < S.contacts.length && S.contacts[S.next].year <= world.year) {
    const c = S.contacts[S.next++];
    try { contact(world, c); } catch (e) { console.warn("[aeon] region contact failed", e); }
  }
  for (const cp of S.campaigns.slice()) campaignTick(world, cp);
}

function record(world, type, importance, text, actors, regionId, c) {
  const ev = AEON.recordEvent(world, type, { importance: importance, tags: ["sketch", "contact"], actors: actors || [], regionId: regionId, text: text });
  if (ev && c) { ev.sketch = { kind: c.kind, outcome: c.outcome, from: c.from, to: c.to, year: c.year }; world._sketch.log.push(ev.id); }
  return ev;
}

function contact(world, c) {
  const sk = world.planet.sketch, si = world._sketch.si, sq = sk.squares[si];
  const index = (id) => sk.squares.findIndex(function (s) { return s.id === id; });
  const yl = world.pack.yearLabel ? world.pack.yearLabel(c.year) : c.year;
  if (c.kind === "dark-age") {
    for (const p of AEON._core.living(world)) AEON.techShock(world, p, 0.5, "in the dark age");
    record(world, "sketch-dark-age", 4, "A dark age fell on the land. Trade dwindled, cities shrank, and much that had been known was lost.", [], null, c);
    return;
  }
  if (c.from === sq.id) return depart(world, c, directionTo(sk, si, index(c.to)));
  const dir = directionTo(sk, si, index(c.from));
  const by = peopleById(sk, c.by) || { name: "Strangers", adjective: "Foreign" };
  const land = inner(world);
  /* where they come in: the border facing them, or by sea the coast facing them */
  let pool = c.via === "sea" ? land.filter(function (r) { return coastal(world, r); }) : land;
  if (!pool.length) pool = land;
  const side = facing(world, dir, pool, c.via === "sea" ? 0.12 : 0.04);
  const best = side.slice().sort(function (a, b) { return b.habitability - a.habitability; }).slice(0, 6);
  const entry = world.rng.weighted(best, function (r) { return r.habitability + 0.05; }) || side[0];
  const holder = entry.owner ? world.polities[entry.owner] : nearestRealm(world, entry);
  const D = holder ? nameIn(holder) : "the land";
  const from = dir.word === "north" || dir.word === "south" || dir.word === "east" || dir.word === "west" ? "the " + dir.word : "the " + dir.word;

  if (c.kind === "trade") {
    record(world, "sketch-trade", 2, (c.via === "sea" ? by.adjective + " ships came from " + from + " to trade at " + placeName(entry, world) : by.adjective + " traders came over the border from " + from + " to " + placeName(entry, world)) +
      (holder ? ", in the lands of " + D : "") + ".", holder ? [{ kind: "polity", id: holder.id }] : [], entry.id, c);
    return;
  }
  if (c.kind === "raid" && c.outcome === "raided" || c.kind === "invasion" && c.outcome === "raided") {
    const hit = side.filter(function (r) { return r.owner && r.settlement; }).slice(0, 3);
    for (const r of hit) AEON.plunder(world, r, null);
    record(world, "sketch-raid", 3, (c.kind === "raid" ? by.adjective + " sea-raiders came ashore on the " + dir.word + " coast" : "A " + by.adjective + " host crossed the " + dir.word + " border") +
      (hit.length ? " and plundered " + hit.map(function (r) { return placeName(r, world); }).join(", ") : "") + (holder ? ", in the lands of " + D : "") + ", and went home with their loot.", holder ? [{ kind: "polity", id: holder.id }] : [], entry.id, c);
    return;
  }

  /* newcomers: a realm of their own at the entry, and a campaign for the share the sketch gives */
  const people = peopleById(sk, c.people) || by;
  const p = newcomer(world, people, entry, c, index(c.from));
  /* more of a people already living here: they come to their kin */
  const kinOf = function (q) { const hp = q && q.people && peopleById(sk, q.people); return !!hp && hp.name === by.name; };
  const kin = kinOf(holder);
  const arrive = kin ? "More " + by.adjective + " " + (c.kind === "migration" ? "herders" : c.via === "sea" ? "ships" : "settlers") + " came from " + from + " to join their kin" : {
    migration: by.adjective + " herders came over the " + dir.word + " border with their herds",
    invasion: "A " + by.adjective + " host crossed the " + dir.word + " border",
    raid: by.adjective + " sea-raiders came ashore on the " + dir.word + " coast",
    colonisation: by.adjective + " ships from across the open sea landed on the " + dir.word + " coast",
  }[c.kind] || "Strangers came from " + from;
  record(world, "sketch-arrival", c.outcome === "conquest" ? 5 : 4, arrive + " at " + placeName(entry, world) + (holder ? ", in the lands of " + D : "") + ".",
    [{ kind: "polity", id: p.id }].concat(holder ? [{ kind: "polity", id: holder.id }] : []), entry.id, c);

  const share = SHARE[c.outcome] || 0;
  const order = spread(world, entry, Math.round(share * land.length));
  world._sketch.campaigns.push({ c: c, people: people, p: p, entry: entry, cells: order, turns: TURNS[c.outcome] || 4,
    left: TURNS[c.outcome] || 4, waves: 1, losers: {}, from: index(c.from), holder: holder ? holder.id : null, prev: {} });
}

/* the land the newcomers mean to take: inner land outward from where they came in */
function spread(world, entry, n) {
  const R = world.regions, seen = {}, q = [entry.id];
  seen[entry.id] = true;
  for (let h = 0; h < q.length && q.length < n; h++) {
    for (const nb of R[q[h]].neighbors) {
      const r = R[nb];
      if (seen[nb] || r.barren || r.beyond) continue;
      seen[nb] = true; q.push(nb);
    }
  }
  return q.slice(0, Math.max(1, n));
}

function nearestRealm(world, r) {
  let best = null, bd = Infinity;
  for (const p of AEON._core.living(world)) {
    const c = world.regions[p.capital], d = Math.hypot(c.x - r.x, c.y - r.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function newcomer(world, people, region, c, fromIndex) {
  const C = AEON._core, pack = world.pack, sk = world.planet.sketch;
  const arch = people.archetype && pack.archetypes.some(function (a) { return a.id === people.archetype; }) ? people.archetype : null;
  const was = region.owner;
  const p = C.spawnPolity(world, region, arch);
  p.name = people.name; p.adjective = people.adjective || people.name;
  if (people.culture) p.culture = people.culture;
  p.people = people.id; p.newcomer = c.kind;
  /* they bring what their homeland knew, and arms to match */
  p.learning = Math.round(curveAt(sk, fromIndex, world.year));
  p.age = ageFor(pack, p.learning);
  p.ageLog = [{ age: p.age, year: world.year, inherited: true }];
  let top = 0;
  for (const q of C.living(world)) if (q !== p) top = Math.max(top, q.tech);
  p.tech = Math.min(1, Math.max(p.tech, top * 1.1));
  p.population = Math.round(p.population * (c.outcome === "conquest" ? 4 : c.outcome === "partial" ? 2.5 : 1.5));
  if (was && was !== p.id && world.polities[was]) {
    /* spawnPolity takes the cell without telling its holder */
    const from = world.polities[was], i = from.regions.indexOf(region.id);
    if (i >= 0) from.regions.splice(i, 1);
    if (from.capital === region.id) from.capital = from.regions.length ? from.regions[0] : from.capital;
    if (!from.regions.length && !from.ended) C.endPolity(world, from, "Its last land was taken by newcomers from beyond.");
  }
  return p;
}

/* one turn of a campaign: the next stretch of the land changes hands; a wiped-out host is
   followed by a fresh wave; at the end the outcome is told */
function campaignTick(world, cp) {
  const C = AEON._core, R = world.regions, c = cp.c;
  if (cp.p.ended && cp.left > 0 && c.outcome !== "repelled") {
    const at = R[cp.cells.find(function (id) { return R[id].owner !== cp.p.id; }) || cp.entry.id];
    cp.p = newcomer(world, cp.people, at, c, cp.from);
    cp.waves++;
    record(world, "sketch-wave", 3, "More " + cp.people.adjective + " newcomers came after the first, and took " + placeName(at, world) + ".", [{ kind: "polity", id: cp.p.id }], at.id, null);
  }
  cp.left--;
  if (c.outcome === "repelled") {
    if (cp.left > 0) return;
    const p = cp.p, holder = cp.holder && world.polities[cp.holder] && !world.polities[cp.holder].ended ? world.polities[cp.holder] : nearestRealm(world, cp.entry);
    if (!p.ended) {
      const cells = p.regions.slice();
      C.endPolity(world, p, "Driven back the way it came.");
      if (holder) for (const id of cells) C.transferRegion(world, R[id], holder);
    }
    record(world, "sketch-repelled", 3, (holder ? holder.name : "The people of the land") + (holder && holder.people && peopleById(world.planet.sketch, holder.people).name === cp.people.name ? " would not make room for the newcomers of its own people, and sent them back from " : " drove the " + cp.people.adjective + " newcomers out of ") + placeName(cp.entry, world) + ".",
      holder ? [{ kind: "polity", id: holder.id }] : [], cp.entry.id, c);
    world._sketch.campaigns.splice(world._sketch.campaigns.indexOf(cp), 1);
    return;
  }
  /* this turn's stretch */
  const per = Math.ceil(cp.cells.length / cp.turns);
  let taken = 0, cities = [];
  for (const id of cp.cells) {
    if (taken >= per) break;
    const r = R[id];
    if (r.owner === cp.p.id) continue;
    const from = r.owner && world.polities[r.owner];
    if (from) cp.losers[from.id] = true;
    if (r.settlement && from && from.capital === r.id) cities.push(placeName(r, world) + " (" + from.name + ")");
    C.transferRegion(world, r, cp.p);
    taken++;
  }
  if (cities.length) record(world, "sketch-campaign", 3, cp.p.name + " took " + cities.slice(0, 3).join(", ") + ".", [{ kind: "polity", id: cp.p.id }], null, null);
  if (cp.left > 0) return;
  const held = cp.p.ended ? 0 : cp.p.regions.length;
  const losers = Object.keys(cp.losers).map(function (id) { return world.polities[id]; }).filter(Boolean);
  const names = losers.slice(0, 4).map(nameIn).join(", ") + (losers.length > 4 ? " and " + (losers.length - 4) + " more" : "");
  const end = {
    settled: "The " + cp.people.adjective + " newcomers settled the country round " + placeName(cp.entry, world) + ", and stayed.",
    foothold: "The " + cp.people.adjective + " newcomers held on to a strip of coast round " + placeName(cp.entry, world) + ".",
    colony: cp.p.name + " had grown into a colony of " + held + " provinces round " + placeName(cp.entry, world) + ".",
    partial: cp.p.name + " held " + held + " provinces taken from " + (names || "the people of the land") + ".",
    conquest: cp.p.name + " had made itself master of the land" + (names ? ": " + names + " fell to it" : "") + ".",
  }[c.outcome];
  record(world, "sketch-outcome", c.outcome === "conquest" ? 5 : 3, end, [{ kind: "polity", id: cp.p.id }], cp.entry.id, c);
  cp.done = world.year;
  world._sketch.campaigns.splice(world._sketch.campaigns.indexOf(cp), 1);
  (world._sketch.done || (world._sketch.done = [])).push({ c: c, p: cp.p.id, held: held, waves: cp.waves, year: world.year });
}

/* an expedition leaving for another square: told from the realm on the side facing it */
function depart(world, c, dir) {
  const sk = world.planet.sketch, land = inner(world);
  let pool = c.via === "sea" ? land.filter(function (r) { return coastal(world, r) && r.owner; }) : land.filter(function (r) { return r.owner; });
  if (!pool.length) pool = land.filter(function (r) { return r.owner; });
  if (!pool.length) return;
  const side = facing(world, dir, pool, 0.1), count = {};
  for (const r of side) count[r.owner] = (count[r.owner] || 0) + 1;
  const pid = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })[0], p = world.polities[pid];
  if (!p) return;
  const target = landOf(sk, c.to);
  const text = {
    trade: p.name + "'s " + (c.via === "sea" ? "ships" : "traders") + " reached " + target + ", to the " + dir.word + ", and trade between them began.",
    migration: "Herders of " + nameIn(p) + " drove their herds " + dir.word + " into " + target + ".",
    invasion: p.name + " sent a host " + dir.word + " against " + target + ".",
    raid: "Sea-raiders of " + nameIn(p) + " sailed " + dir.word + " to fall on " + target + ".",
    colonisation: p.name + " sent ships " + dir.word + " across the open sea to " + target + ".",
  }[c.kind];
  if (!text) return;
  if (c.kind !== "trade") p.population = Math.round(p.population * 0.97);
  record(world, "sketch-departure", c.kind === "trade" ? 2 : 3, text, [{ kind: "polity", id: p.id }], null, c);
}

})();
