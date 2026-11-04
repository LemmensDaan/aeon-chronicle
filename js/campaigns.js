/* Campaigns (docs/REGION_CHAPTERS.md, step 5): in a region, wars are fought by armies that take the
   field in the campaign season and go into winter quarters when the frost (or the rains) close it.

   - The months. A region's yearly tick runs through the year: each turn the tick gives a realm
     has a month (core.js AEON.tick: the ordinary turns spread over the year, the extra war turns
     in the season still to come), and what it records is dated to that month's end; what comes
     after the turns (peace, alliances, the sketch's arrivals) is dated between the last of them
     and the year's end.
   - The weather. The square's months for war (`climate`): weights from the middle land's warmest
     and coldest months, the south's seasons the other way round, the rains of a warm monsoon
     summer. A pack's war events (marked `campaign: true`) happen only in the season's months, and
     are that much likelier in them, so wars are fought about as often but only in summer where
     winters are hard.
   - The armies, engine objects (world.armies). Each side of a war has one: it musters at its
     capital, marches each month (slower over mountains, through forest and marsh, and in the mud
     of the season's edges) to the front (its land on the border: the attacker's nearest the
     enemy's capital, the defender's facing the attacker's army), camps there, and the attacker
     lays siege to an enemy town near it (a village holds out a month, a city three or four). When
     the season closes it goes into winter quarters (its own town nearest), lifting any siege. The
     packs' war events ask it (ctx.ready, ctx.front, ctx.siegeOf): a war is fought only where its
     army is in the field, at the place nearest it, and a town falls only when its siege has run
     its months. A battle (core.js AEON.battle) moves the armies: the winner onto the field, the
     loser back towards home. Peace sends them home.
   - The armies' own turns. A realm has a turn only every few decades in a region, too seldom for
     a siege of months, so an army has turns of its own: its realm's siege event (a pack's
     `campaign: "siege"`) when the town it besieges is ready to storm (one month in four), its
     battle event (`campaign: "battle"`) when it camps facing the enemy's army (one month in
     fifty). Conquests and decisive battles, which end wars, stay on the realm's own turns. A siege that drags on half a year past
     its time is lifted, and that town left alone for two years.
   - Raids. After the harvest (the season's last two months; in lands without a winter, late in
     the year) a realm may raid a hostile neighbour it has no treaty with (relations below -0.3):
     a village or town on their border is plundered of its stores, its owner's prosperity falls a
     little and its people remember (relations -0.04), which brings wars nearer. One chance in
     twenty a raid month, more for an aggressive realm; decided by the date, not the world's random
     stream. Recorded in world.raidLog [date, raider, raided, from region, region].
   - The record (world.armyLog): [date, army, realm, region, state, foe] whenever an army moves or
     changes what it does, and once at each year's start; the map draws from it (armiesAt).

   Off (a planet, a five-year tick, a pack with campaigns: false) everything here answers as if
   there were no armies, and the packs behave as before. */
(function () {
"use strict";
const AEON = window.AEON = window.AEON || {};
const MIDWINTER = 0.05, ACTIVE = 0.35, SPEED = 16, REACH = 6, STORM = 0.25, CLASH = 0.02;

function hidden(o, k, v) { Object.defineProperty(o, k, { value: v, enumerable: false, configurable: true, writable: true }); return v; }
function baseOf(w) { return w._view === w ? Object.getPrototypeOf(w) : w; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
/* a number in [0, 1) from a few integers, the same every time (no random stream) */
function hash(a, b, c) {
  let h = Math.imul((a | 0) + 1, 374761393) ^ Math.imul((b | 0) + 7, 668265263) ^ Math.imul((c | 0) + 13, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function median(list) { const v = list.slice().sort(function (a, b) { return a - b; }); return v.length ? v[v.length >> 1] : null; }

function on(world) { return !!(world && world.square && world.timeStep === 1 && world.pack && world.pack.campaigns !== false); }

/* ------------------------------------------------------------ the weather of the months */
/* the square's months for war: weights (0: no army takes the field; 1: the best of the year) from
   the middle land's warmest and coldest months, the south's seasons the other way round, and the
   rains of a monsoon summer in the warm lands; `active` the months a campaign is on. With a
   tick year, that year's (its weather: a hard winter shortens the season, a wet summer bogs it
   down, a mild year lengthens it) */
function climate(world, year) {
  world = baseOf(world);
  if (year != null) return yearClimate(world, year);
  if (world._campClimate) return world._campClimate;
  const land = world.regions.filter(function (r) { return !r.barren && !r.beyond && r.warmC != null; });
  const pick = function (k, d) { const m = median(land.map(function (r) { return r[k]; }).filter(function (v) { return v != null; })); return m == null ? d : m; };
  const warm = pick("warmC", 20), cold = pick("coldC", 5), wet = pick("summerRain", 0.5), midY = pick("y", world.height / 2);
  const sq = world.square, pl = world.planet;
  const south = sq && pl ? sq.py0 + (midY + 0.5) / sq.K >= pl.height / 2 : false;
  const w = [], temp = [];
  for (let m = 0; m < 12; m++) {
    const l = (((m + 0.5) / 12 - MIDWINTER + (south ? 0.5 : 0)) % 1 + 1) % 1, c = Math.cos(2 * Math.PI * l);
    const T = (warm + cold) / 2 - (warm - cold) / 2 * c;
    let k = clamp((T - 2) / 10, 0, 1);
    if (warm > 22 && wet > 0.6) k *= 1 - Math.max(0, -c) * Math.min(0.85, (wet - 0.6) * 3);
    w.push(k); temp.push(T);
  }
  /* where it never warms enough, the three warmest months */
  if (w.reduce(function (a, b) { return a + b; }, 0) < 1.5) {
    const top = temp.slice().sort(function (a, b) { return b - a; })[2];
    for (let m = 0; m < 12; m++) w[m] = temp[m] >= top ? 1 : 0;
  }
  return hidden(world, "_campClimate", season12(w, south));
}
/* the months on, the raiding months (the last two of the season, late in the year without a
   winter) and how much likelier war is in each month on */
function season12(w, south) {
  const active = w.map(function (k) { return k >= ACTIVE; }), n = active.filter(Boolean).length;
  let raid = [8, 9];
  if (n < 12) {
    let end = -1;
    for (let m = 0; m < 12; m++) if (active[m] && !active[(m + 1) % 12]) { end = m; break; }
    if (end >= 0) raid = [(end + 11) % 12, end];
  }
  return { w: w, active: active, south: south, boost: 12 / Math.max(1, n), raid: raid };
}

/* ------------------------------------------------------------ the weather of a year */
/* how wet its summer and how hard its winter were (each about -1..1, mostly near 0), from the
   square and the year alone (not the world's random stream), so the map and the engine agree */
function seedOf(world) {
  if (world._wxSeed != null) return world._wxSeed;
  let h = 7;
  for (const ch of String(world.seed) + ":" + (world.square ? world.square.id : "")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return hidden(world, "_wxSeed", h >>> 0);
}
function weather(world, year) {
  world = baseOf(world);
  const s = seedOf(world) % 1000003, g = function (a) { return (hash(year, s, a) + hash(year, s, a + 1) + hash(year, s, a + 2)) / 1.5 - 1; };
  return { wet: g(11), cold: g(21) };
}
/* the harvest a year's weather gave: q (1 a fair one), and "failed", "poor", "fair" or "good" */
function harvest(world, year) {
  const x = weather(world, year);
  /* about one year in twenty fails, one in twenty is poor, one in six good */
  const q = 1 - 1.5 * Math.max(0, x.wet - 0.55) - 1.5 * Math.max(0, -x.wet - 0.6) - 0.8 * Math.max(0, x.cold - 0.6);
  const kind = q < 0.85 ? "failed" : q < 0.95 ? "poor" : Math.abs(x.wet) < 0.15 && x.cold < 0 ? "good" : "fair";
  return { q: q, kind: kind, wet: x.wet, cold: x.cold };
}
function yearClimate(world, year) {
  const cache = world._campYearC || hidden(world, "_campYearC", {});
  if (cache[year]) return cache[year];
  const base = climate(world), x = weather(world, year), w = [];
  for (let m = 0; m < 12; m++) w.push(clamp(base.w[m] - 0.3 * x.cold - 0.3 * Math.max(0, x.wet) * base.w[m], 0, 1));
  let out = season12(w, base.south);
  if (!out.active.some(Boolean)) out = base;
  for (const k in cache) if (Math.abs(+k - year) > 3) delete cache[k];
  return (cache[year] = out);
}

/* ------------------------------------------------------------ the months of a tick */
function y0(world) { return world.year - 1; }
/* the tick begins (after the realms' own spread): the armies at the year's start, written down */
function beginYear(world) {
  world._month = 0; hidden(world, "_armyMonth", 0);
  const d = y0(world) + 1e-6;
  for (const a of armies(world)) note(world, a, d);
}
/* an ordinary turn, k of n: a month spread over the year, never before the last one */
function slot(world, k, n) { setMonth(world, Math.min(11, Math.floor((k + hash(world.year, k, 1)) / Math.max(1, n) * 12))); }
/* an extra war turn: a month of the season still to come (else the month it is) */
function later(world, k) {
  const C = climate(world, world.year), from = world._month || 0, open = [];
  for (let m = from; m < 12; m++) if (C.active[m]) open.push(m);
  setMonth(world, open.length ? open[Math.floor(hash(world.year, k, 2) * open.length)] : from);
}
function setMonth(world, m) {
  if (world._month == null) return;
  m = Math.max(m, world._month);
  advance(world, m);
  world._month = m;
}
/* the turns are over: the armies march out the year; what follows has no month of its own */
function endYear(world) {
  advance(world, 11);
  world._month = null;
}
/* the open month's end as a date (what is recorded in it), or null after the turns */
function dateNow(world) { return world._month == null ? null : y0(world) + (world._month + 1) / 12; }
/* is it a month for war? (core.js fireOne, for events marked campaign) */
function season(world) { return world._month == null || climate(world, world.year).active[world._month]; }

/* core.js dateTick: events recorded in a month keep its date; the others go between them, in
   their order */
function dateYear(world, from) {
  const C = world.chronicle, Y0 = y0(world);
  let lo = from - 1, loD = Y0;
  for (let j = from; j <= C.length; j++) {
    if (j < C.length && C[j].date == null) continue;
    const hiD = j < C.length ? Math.max(loD, C[j].date) : Y0 + 1, g = j - lo - 1;
    for (let k = 1; k <= g; k++) C[lo + k].date = clamp(Math.round((loD + k / (g + 1) * (hiD - loD)) * 12) / 12, Math.max(loD, Y0 + 1 / 12), Math.max(hiD, Y0 + 1 / 12));
    if (j < C.length) { lo = j; loD = hiD; }
  }
}
/* and after the treaties are dated: musters and returns made after the turns take their dates */
function closeYear(world) {
  const T = world._campPend;
  if (!T) return;
  for (const e of T) {
    const t = e[6];
    e[0] = e[4] === "home" ? (t.endDate != null ? t.endDate : world.year) : (t.startDate != null ? t.startDate : world.year);
    e.length = 6;
  }
  T.length = 0;
}

/* ------------------------------------------------------------ the armies */
function armies(world) { return world.armies || (world.armies = []); }
function note(world, a, date) {
  const e = [date, a.id, a.pid, a.rid, a.state, a.foe];
  (world.armyLog || (world.armyLog = [])).push(e);
  if (date == null) { e.push(a.t); (world._campPend || hidden(world, "_campPend", [])).push(e); }
}
/* a war begins: an army for each side at its capital (a vassal's levy marches with its lord's) */
function warBegun(world, t) {
  if (!on(world) || t.kind !== "war" || t.levy) return;
  for (const s of [[t.a, t.b], [t.b, t.a]]) {
    const p = world.polities[s[0]], r = p && !p.ended && world.regions[p.capital];
    if (!r) continue;
    const a = { id: t.id + ":" + p.id, war: t.id, pid: p.id, foe: s[1], attacker: s[0] === t.a, x: r.x, y: r.y, rid: r.id, state: "muster", goal: null, since: null };
    hidden(a, "t", t);
    armies(world).push(a);
    note(world, a, dateNow(world));
  }
}
/* a war ends: its armies go home */
function warEnded(world, t) {
  const A = world.armies;
  if (!A || t.kind !== "war") return;
  for (let i = A.length - 1; i >= 0; i--) {
    const a = A[i];
    if (a.war !== t.id) continue;
    a.state = "home";
    note(world, a, dateNow(world));
    A.splice(i, 1);
  }
}
function armyOf(world, p, foe) {
  const A = world.armies;
  if (!A || !p || !foe) return null;
  for (const a of A) if (a.pid === p.id && a.foe === foe.id) return a;
  return null;
}

/* how hard a cell is to march through */
function going(r) {
  if (!r) return 1;
  if (r.biome === "mountain") return 0.45;
  if (r.biome === "ice" || r.biome === "tundra") return 0.6;
  if (r.biome === "forest" || r.biome === "jungle" || r.biome === "swamp" || r.biome === "taiga") return 0.7;
  return 1;
}
function cellAt(world, x, y) {
  const W = world.width, H = world.height;
  return world.regions[clamp(Math.round(y), 0, H - 1) * W + clamp(Math.round(x), 0, W - 1)];
}
function d2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function nearest(world, list, x, y) {
  const R = world.regions;
  let best = null, bd = Infinity;
  for (const id of list) { const r = R[id], d = d2(r.x, r.y, x, y); if (d < bd) { bd = d; best = id; } }
  return best;
}

/* a war's front, worked out again when the map changes: p's land on its border with foe */
function frontOf(world, p, foe) {
  const cache = world._campFront || hidden(world, "_campFront", {}), key = p.id + ">" + foe.id, n = world.ownerLog ? world.ownerLog.length : 0;
  const c = cache[key];
  if (c && c.n === n) return c.cells;
  const R = world.regions, cells = [];
  for (const id of p.regions) {
    const r = R[id];
    if (!r || r.beyond) continue;
    for (const k of r.neighbors || []) if (R[k] && R[k].owner === foe.id) { cells.push(id); break; }
  }
  cache[key] = { n: n, cells: cells };
  return cells;
}
/* where an army makes for in the season: the attacker its border nearest the enemy's capital,
   the defender its border facing the attacker's army (no border: its land nearest them) */
function goalOf(world, a, p, foe) {
  const R = world.regions, F = frontOf(world, p, foe);
  const them = a.attacker ? null : armyOf(world, foe, p);
  const to = them || R[a.attacker ? foe.capital : p.capital] || R[p.capital];
  return nearest(world, F.length ? F : p.regions, to.x, to.y);
}
/* winter quarters: its own town nearest */
function quarters(world, a, p) {
  const R = world.regions, towns = p.regions.filter(function (id) { return R[id] && R[id].settlement; });
  return nearest(world, towns.length ? towns : p.regions, a.x, a.y);
}
/* an enemy town within three marches of where it stands, the greatest, to besiege */
function siegeTarget(world, a, foe) {
  const R = world.regions, seen = {}, q = [[a.rid, 0]];
  seen[a.rid] = true;
  let best = null;
  for (let h = 0; h < q.length; h++) {
    const id = q[h][0], dd = q[h][1], r = R[id];
    if (r.owner === foe.id && r.settlement && !(a.lifted && world.year - (a.lifted[id] || -1e9) < 2) && (best == null || r.settlement.tier > R[best].settlement.tier)) best = id;
    if (dd >= 3) continue;
    for (const k of r.neighbors || []) if (!seen[k] && R[k] && !R[k].barren) { seen[k] = true; q.push([k, dd + 1]); }
  }
  return best;
}
/* months a town holds out */
function holds(r) { const t = r && r.settlement ? r.settlement.tier : 0; return t <= 1 ? 1 : t === 2 ? 2 : t + 1; }

/* the armies' months, up to and including month m of the tick */
function advance(world, m) {
  const A = armies(world);
  let k = world._armyMonth || 0;
  const C = climate(world, world.year), R = world.regions, P = world.polities;
  for (; k <= m; k++) {
    if (AEON.fast) AEON.fast.month(world, k, y0(world) + (k + 0.5) / 12);
    const act = C.active[k], mud = C.w[k] < 0.6, d = y0(world) + (k + 0.85) / 12;
    if (C.raid.indexOf(k) >= 0) raids(world, k);
    /* over a copy: an army's turn may end wars and begin others */
    for (const a of A.slice()) {
      if (A.indexOf(a) < 0) continue;
      const p = P[a.pid], foe = P[a.foe];
      if (!p || p.ended || !foe || foe.ended || !p.regions.length) { a.state = "home"; note(world, a, d); A.splice(A.indexOf(a), 1); continue; }
      const was = a.rid + "|" + a.state;
      let goal;
      if (!act) {
        if (a.state !== "winter" && a.state !== "quarters") a.goal = quarters(world, a, p);
        a.state = "quarters"; a.since = null;
        goal = a.goal;
      } else if (a.state === "siege" && R[a.goal] && R[a.goal].owner === foe.id) goal = a.goal;
      else {
        a.since = null;
        goal = a.goal = goalOf(world, a, p, foe);
        a.state = "march";
      }
      if (goal != null) {
        const g = R[goal], dist = Math.sqrt(d2(a.x, a.y, g.x, g.y)), step = SPEED * going(R[a.rid]) * (mud ? 0.6 : 1);
        if (dist <= step) { a.x = g.x; a.y = g.y; }
        else { a.x += (g.x - a.x) * step / dist; a.y += (g.y - a.y) * step / dist; }
        a.rid = cellAt(world, a.x, a.y).id;
        if (dist <= step) {
          if (!act) a.state = "winter";
          else if (a.since != null) a.state = "siege";
          else {
            a.state = "camp";
            /* at the front, the attacker sits down before a town near it */
            const s = a.attacker ? siegeTarget(world, a, foe) : null;
            if (s != null) { const t = R[s]; a.goal = s; a.x = t.x; a.y = t.y; a.rid = s; a.state = "siege"; a.since = d; }
          }
        }
      }
      /* its own turn: a siege ready to storm, the enemy's army camped close by */
      if (act && a.state === "siege" && a.since != null) {
        const age = (d - a.since) * 12, r = R[a.goal];
        if (age >= holds(r) - 0.01 && world.rng.chance(STORM)) turn(world, p, k, "siege");
        else if (age > holds(r) + 6) { (a.lifted || (a.lifted = {}))[a.goal] = world.year; a.state = "camp"; a.since = null; }
      } else if (act && a.state === "camp") {
        const them = armyOf(world, foe, p);
        if (them && them.state === "camp" && d2(a.x, a.y, them.x, them.y) <= 9 && world.rng.chance(CLASH)) turn(world, p, k, "battle");
      }
      if (A.indexOf(a) < 0) continue;
      if (a.rid + "|" + a.state !== was) note(world, a, d);
    }
  }
  world._armyMonth = k;
}
/* the raids of month k of the tick */
const RAID = 0.05;
function raids(world, k) {
  const P = world.polities, R = world.regions, d = y0(world) + (k + 0.5) / 12, mon = world.year * 12 + k;
  /* hunger rides out: more raids after a poor harvest */
  const hk = harvest(world, world.year).kind, hungry = hk === "failed" ? 1.8 : hk === "poor" ? 1.3 : 1;
  for (const id in P) {
    const p = P[id];
    if (p.ended || !p.regions.length) continue;
    const agg = p.traits && p.traits.aggression != null ? p.traits.aggression : 0.5;
    /* a tribe rides out readily, to the towns in its sphere, and its herds grow with the loot (tribes.js) */
    const tribe = p.tribe && AEON.tribes ? AEON.tribes : null;
    for (const q of AEON.neighborsOf(world, p)) {
      if ((p.relations[q.id] || 0) >= -0.3 || AEON.treatyBetween(world, p, q, null)) continue;
      if (hash(num(p.id), num(q.id), mon) >= RAID * (0.5 + agg) * hungry * (tribe ? 2.5 : 1)) continue;
      const towns = tribe ? AEON.tribes.front(world, p, q).filter(function (r) { return r.settlement; }).map(function (r) { return r.id; })
        : frontOf(world, q, p).filter(function (rid) { return R[rid].settlement; });
      if (!towns.length) continue;
      const rid = towns[Math.floor(hash(num(q.id), mon, 7) * towns.length)], r = R[rid];
      let from = tribe ? p.capital : rid;
      if (!tribe) for (const n of r.neighbors || []) if (R[n] && R[n].owner === p.id) { from = n; break; }
      if (tribe) p.population = Math.round(p.population * 1.004);
      q.relations[p.id] = Math.max(-1, (q.relations[p.id] || 0) - 0.04);
      q.prosperity = Math.max(0, (q.prosperity || 0) - 0.01);
      (world.raidLog || (world.raidLog = [])).push([d, p.id, q.id, from, rid]);
    }
  }
}
function num(id) { return +String(id).replace(/\D/g, "") || 0; }

function turn(world, p, k, kind) {
  if (!AEON.campaignTurn) return;
  const keep = world._month;
  world._month = k;
  AEON.campaignTurn(world, p, kind);
  world._month = keep;
}

/* ------------------------------------------------------------ what the packs ask */
/* may p fight foe now? a month for war, and its army in the field near the front (no army: the
   month alone) */
function ready(world, p, foe) {
  if (!on(world)) return true;
  if (!season(world)) return false;
  const a = armyOf(world, p, foe);
  if (!a || a.state === "camp" || a.state === "siege") return true;
  if (a.state !== "march" || a.goal == null) return false;
  const g = world.regions[a.goal];
  return d2(a.x, a.y, g.x, g.y) <= REACH * REACH;
}
/* the place in list (regions) nearest p's army against foe, or null (no army: the pack picks) */
function front(world, p, foe, list) {
  if (!on(world) || !list || !list.length) return null;
  const a = armyOf(world, p, foe);
  if (!a) return null;
  let best = null, bd = Infinity;
  for (const r of list) { const d = d2(r.x, r.y, a.x, a.y); if (d < bd) { bd = d; best = r; } }
  return best;
}
/* the town p's army has besieged long enough to storm; null while there is none, undefined where
   p has no army against foe (the pack picks its town) */
function siegeOf(world, p, foe) {
  if (!on(world)) return undefined;
  if (!season(world)) return null;
  const a = armyOf(world, p, foe);
  if (!a) return undefined;
  if (a.state !== "siege" || a.since == null) return null;
  const r = world.regions[a.goal], now = dateNow(world);
  if (!r || r.owner !== foe.id || now == null || (now - a.since) * 12 < holds(r) - 0.01) return null;
  return r;
}
/* how many months p's army has lain before the town it besieges (null: no siege) */
function siegeMonths(world, p, foe) {
  const a = on(world) ? armyOf(world, p, foe) : null, now = dateNow(world);
  return a && a.state === "siege" && a.since != null && now != null ? Math.max(1, Math.round((now - a.since) * 12)) : null;
}
/* a battle was fought at r (core.js AEON.battle): the winner's army stands on the field, the
   loser's falls back towards home (a crushing defeat the farther), lifting its siege */
function fought(world, att, def, r, won, margin) {
  if (!on(world) || !world.armies || !world.armies.length || !r) return;
  const W = won ? att : def, L = won ? def : att, now = dateNow(world), d = now != null ? now - 0.05 / 12 : null;
  const aw = armyOf(world, W, L), al = armyOf(world, L, W), near = function (a) { return d2(a.x, a.y, r.x, r.y) <= 4 * REACH * REACH; };
  if (aw && aw.state !== "siege" && near(aw)) { aw.x = r.x; aw.y = r.y; aw.rid = r.id; aw.state = "camp"; aw.goal = r.id; note(world, aw, d); }
  if (al && near(al)) {
    const home = world.regions[L.capital] || r, back = margin === "crushing" ? 12 : 6, dist = Math.sqrt(d2(al.x, al.y, home.x, home.y));
    if (dist > 0.5) { const f = Math.min(1, back / dist); al.x += (home.x - al.x) * f; al.y += (home.y - al.y) * f; al.rid = cellAt(world, al.x, al.y).id; }
    al.state = "camp"; al.since = null; al.goal = al.rid;
    note(world, al, d);
  }
}

/* ------------------------------------------------------------ the map */
/* the log by calendar year (dates in (Y, Y+1]), kept up as it grows */
function yearIndex(world) {
  const L = world.armyLog || [], ix = world._campIx || hidden(world, "_campIx", { n: 0, by: {} });
  if (ix.n > L.length) { ix.n = 0; ix.by = {}; }
  for (; ix.n < L.length; ix.n++) {
    const e = L[ix.n];
    if (e[0] == null) break;
    const Y = Math.floor(e[0] - 1e-9);
    (ix.by[Y] || (ix.by[Y] = [])).push(e);
  }
  return ix.by;
}
/* the armies on the map at a date: [{ pid, foe, x, y (region cells, centred), state, moving, dir, n }] */
function armiesAt(world, date) {
  world = baseOf(world);
  if (!on(world) || date == null || !world.armyLog) return [];
  const Y = Math.floor(date), by = yearIndex(world), R = world.regions, P = world.polities, track = {};
  for (const e of (by[Y] || []).slice().sort(function (a, b) { return a[0] - b[0]; })) (track[e[1]] || (track[e[1]] = [])).push(e);
  const out = [];
  for (const id in track) {
    const T = track[id];
    if (T[0][0] > date) continue;
    let k = 0;
    while (k < T.length - 1 && T[k + 1][0] <= date) k++;
    const A = T[k];
    if (A[4] === "home") continue;
    const B = T[k + 1], ra = R[A[3]], rb = B && B[4] !== "home" ? R[B[3]] : ra;
    if (!ra || !rb) continue;
    /* marching between two entries a month or less apart; else standing until the later one */
    const span = B ? B[0] - A[0] : 0, f = B && span > 0 && span <= 0.1 ? clamp((date - A[0]) / span, 0, 1) : 0;
    const moving = rb !== ra && f > 0;
    const x = ra.x + (rb.x - ra.x) * f, y = ra.y + (rb.y - ra.y) * f;
    const fp = P[A[5]], fc = (fp && R[AEON.capitalAt(fp, Y)]) || rb;
    const dir = moving ? (rb.x >= ra.x ? 1 : -1) : (fc.x >= x ? 1 : -1);
    const state = moving ? "march" : A[4] === "quarters" ? "winter" : A[4] === "siege" || A[4] === "winter" ? A[4] : "camp";
    out.push({ pid: A[2], foe: A[5], x: x + 0.5, y: y + 0.5, state: state, moving: moving, dir: dir, n: state === "siege" ? 3 : 2 });
  }
  return out;
}

/* ------------------------------------------------------------ the wars worth watching */
/* A region's own wars are not in the world sketch (it knows only what passes between squares), so
   the chapters picked from it are invasions, treaties, marriages and voyages. Once a region's
   history is computed, its fiercest wars make chapters too: each war (with the allies called into
   it) scored by its battles and sieges, and twice for each fight that took land; the best few
   that do not overlap, from a year before the war to a year after it, at most WAR_MAX years. */
const WAR_CHAPTERS = 4, WAR_MAX = 25;
function warChapters(world) {
  world = baseOf(world);
  const C = world.chronicle, P = world.polities, T = (world.treaties || []).filter(function (t) { return t.kind === "war"; });
  const lead = {}, wars = [];
  for (const t of T) {
    const head = t.leader && T.filter(function (x) { return x.id === t.leader; })[0];
    const w = head && lead[head.id];
    if (w) { w.pairs.push(t); w.to = Math.max(w.to, t.endDate != null ? t.endDate : t.end != null ? t.end : world.year); continue; }
    const nw = { t: t, pairs: [t], from: t.startDate != null ? t.startDate : t.start, to: t.endDate != null ? t.endDate : t.end != null ? t.end : world.year, score: 0, fights: 0 };
    lead[t.id] = nw; wars.push(nw);
  }
  /* the war events by realm pair, in date order */
  const byPair = {};
  for (const e of C) {
    if ((e.tags || []).indexOf("war") < 0 || /declared|call|defends/.test(e.type)) continue;
    const ps = (e.actors || []).filter(function (a) { return a && a.kind === "polity"; }).map(function (a) { return a.id; });
    if (ps.length < 2) continue;
    const k = ps[0] < ps[1] ? ps[0] + "|" + ps[1] : ps[1] + "|" + ps[0];
    (byPair[k] || (byPair[k] = [])).push(e);
  }
  for (const w of wars) {
    for (const t of w.pairs) {
      const k = t.a < t.b ? t.a + "|" + t.b : t.b + "|" + t.a;
      for (const e of byPair[k] || []) {
        const d = e.date != null ? e.date : e.year;
        if (d < w.from - 0.01 || d > w.to + 0.01) continue;
        w.fights++;
        w.score += (e.tags.indexOf("territory") >= 0 || e.tags.indexOf("conquest") >= 0 ? 3 : 1) * (e.importance || 1) / 2;
      }
    }
  }
  const out = [], start = world.startYear, end = world.endYear;
  for (const w of wars.filter(function (x) { return x.fights >= 3; }).sort(function (x, z) { return z.score - x.score; })) {
    if (out.length >= WAR_CHAPTERS) break;
    const from = Math.max(start, Math.floor(w.from) - 1), to = Math.min(end, Math.max(from + 6, Math.min(from + WAR_MAX, Math.ceil(w.to) + 1)));
    if (out.some(function (c) { return from < c.to && to > c.from; })) continue;
    const a = P[w.t.a], b = P[w.t.b];
    const title = w.t.name ? w.t.name.charAt(0).toUpperCase() + w.t.name.slice(1)
      : "The war of " + (a ? a.name.replace(/^The /, "the ") : "a realm") + " and " + (b ? b.name.replace(/^The /, "the ") : "a realm");
    out.push({ from: from, to: to, year: w.from, title: title, ask: "Who will win " + title.charAt(0).toLowerCase() + title.slice(1) + ", and what will it cost?", contacts: [], also: [w.fights + " battles, sieges and conquests" + (w.pairs.length > 1 ? ", " + (w.pairs.length - 1) + " allies called in" : "")], war: true });
  }
  return out.sort(function (x, z) { return x.from - z.from; });
}

AEON.campaigns = {
  warChapters: warChapters, weather: weather, harvest: harvest,
  on: on, climate: climate, beginYear: beginYear, slot: slot, later: later, endYear: endYear, season: season,
  dateYear: dateYear, closeYear: closeYear, dateNow: dateNow, warBegun: warBegun, warEnded: warEnded,
  ready: ready, front: front, siegeOf: siegeOf, siegeMonths: siegeMonths, fought: fought, armiesAt: armiesAt,
};
})();
