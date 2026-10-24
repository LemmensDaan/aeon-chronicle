/* Aeon - map animations (the picks from samples/animations.html).

   While history plays, the changes playback passes are shown as short animations on the map:
   land changing hands flickers between the old and new colours before it settles (where it was
   taken by force, a war band first marches up to the border, defenders come out to meet it and
   a scuffle boils up between them), new land flashes in, a breakaway realm's capital is
   crowned, the crown arcs over when a capital moves, laurels with the age's numeral pop up over
   a capital (I when a realm is founded), wonders rise out of the ground and fall into their
   dust, and razed settlements burn down to a smoking ruin. Setting the year by scrubbing or by
   a link plays that tick's changes once. At sea, fleets sail from a port along open water: an
   invasion fleet runs up on the beach before the land changes hands, a colony ship lands its
   settlers before the new land flashes in, and a raid meets the defenders' ships in a battle
   in which a ship burns and sinks before both sides turn for home.

   Everything is read from the world's logs (ownerLog, capitalLog, ageLog, settleLog and the
   wonders), so the animations change no history. Durations are wall-clock time, so they read
   the same at every speed; when playback passes more than can be shown, only the most
   important changes get an animation and the rest of the new land just flashes.

   pixelmap.js calls draw() twice a frame: "under" (at map resolution, below the settlements)
   and "over" (sprites, in screen space at the settlements' scale). */
(function () {
"use strict";

const AEON = window.AEON = window.AEON || {};

const INK = "#2a1a0e", HALO = "#efe2bf", GOLD = "#e0b84f", LIGHT = "255,244,214";
const PAL = { k: INK, w: "#efe6d6", r: "#b5452e", g: "#b7b1a4", b: "#7a4a22", y: GOLD, G: "#4f8a3a" };
function sprite(rows, pal) { return { rows: rows, pal: pal, w: rows[0].length, h: rows.length }; }
const CROWN = sprite(["k.k.k", "kykyk", "kyyyk", "kkkkk"], PAL);
/* ruins of a village, a town and a city: grey stone (Daan, 2026-10-24: not brown) */
const RUIN_PAL = { k: INK, g: "#b7b1a4", d: "#8a8478" };
const RUINS = [null,
  sprite(["..k....", ".kd.k..", "kddkdk.", "kkkkkkk"], RUIN_PAL),
  sprite(["......k....", ".....kg....", "..k..kg..k.", ".kdk.kgk.kd", "kddkkkgkkdk", "kkkkkkkkkkk"], RUIN_PAL),
  sprite(["k........k.", "kg.k.....kg", "kgkgk..k.kg", "kggg.k.kgkg", "kg.gg.kgg.g", "kkkkkkkkkkk"], RUIN_PAL)];
const RUBBLE = sprite(["....k......", "..kwk.k.kk.", ".kwgwkwkwgk", "kwgwwgwwgwk", "kkkkkkkkkkk"], PAL);
/* the laurels with the age's numeral, I to V */
const NUMERAL = [["..k..", "..k..", "..k.."], [".k.k.", ".k.k.", ".k.k."], ["k.k.k", "k.k.k", "k.k.k"],
                 ["k.k.k", "k.k.k", "k..k."], [".k.k.", ".k.k.", "..k.."]];
const LAURELS = NUMERAL.map(function (N) {
  return sprite(["..GG...GG..", ".GG.....GG.", "GG." + N[0] + ".GG", "G.." + N[1] + "..G", "GG." + N[2] + ".GG", ".GG.....GG.", "..GG.r.GG..", "....rrr...."], PAL);
});

/* how long each kind plays, in milliseconds */
const DUR = { flash: 600, take: 1300, split: 2600, lost: 1100, crown: 1500, age: 2000, rise: 1900, fall: 2600, burn: 2800 };
/* a take by force: the war band marches for MARCH ms, the scuffle lasts a second, then the land
   flickers and settles (ms from the start, set per animation in changes()) */
const MARCH = 900;
/* the sea events of both packs, by type */
/* how long the invaders march inland from their beachhead, in ms */
const INLAND = 900;
const SEA = { "overseas-invasion": "invade", "sea-crossing": "invade", "overseas-colony": "colony", "far-shore-settled": "colony", "naval-raid": "raid" };
/* at most this many animations besides flashes at once, and new ones come at about RATE a
   second (a scrub or a jump may start up to MOMENT at once) */
const MAX_LIVE = 8, RATE = 4, BURST = 5, MOMENT = 10;

let live = [], tokens = BURST, lastCollect = 0;

/* The animations' own clock, in milliseconds: ui.js moves it on (advance) while history plays, and
   while a moment it jumped to plays out; when playback is paused it stands still, and so does
   every animation, mid-step. */
let clock = 0;
function now() { return clock; }
function advance(ms) { clock += Math.max(0, Math.min(ms, 250)); }

/* Time that slows for great moments: a major change (prio MAJOR and up), or any change of a
   followed realm, can hold the year still until its animation has played (holding()). How
   often: pace "off" never, "all" for every major change, "some" while a bank of held time
   lasts (HOLD_RATE seconds earned per year of history, at most HOLD_MAX), so a whole history
   keeps to a few minutes. A followed realm's changes hold whatever the bank says (but not when
   the pace is "off"). */
const MAJOR = 5, HOLD_RATE = 0.02, HOLD_MAX = 8;
let pace = "some", followed = null, bank = HOLD_MAX;
function setPace(p) { pace = p; }
function follow(pid) { followed = pid || null; }
/* where the newest great moment that holds the year is happening (a region id), for the camera */
function focusPoint() {
  const t = now();
  for (let i = live.length - 1; i >= 0; i--) {
    const f = live[i];
    if (!f.hold || t >= f.start + f.dur) continue;
    const at = f.at != null ? f.at : f.cells ? f.cells[0] : f.to != null && f.kind === "crown" ? f.to : null;
    if (at != null) return at;
  }
  return null;
}
function holding() {
  const t = now();
  prune(t);
  for (const f of live) if (f.hold && t < f.start + f.dur) return true;
  return false;
}
function hash(a, b) { let h = Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
function lerp(a, b, p) { return a + (b - a) * p; }

/* ------------------------------------------------------------ reading the logs */
/* the first index in a year-sorted list whose year is after y */
function after(list, y, yearOf) {
  let lo = 0, hi = list.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (yearOf(list[m]) > y) hi = m; else lo = m + 1; }
  return lo;
}
const Y0 = function (e) { return e[0]; }, YK = function (e) { return e.year; };
/* how many soldiers march for each side when `to` takes land from `from` in (y0, y1]: one to
   five by their share of the men in the battle that won it (world.battleLog), or null when no
   battle took it (a vassal folded in, a cession, a purchase): then no war band marches */
function bands(w, y0, y1, to, from) {
  const B = w.battleLog || [];
  for (let k = after(B, y0, Y0); k < B.length && B[k][0] <= y1; k++) {
    const b = B[k];
    if (b[7] || !((b[6] && b[1] === to && b[2] === from) || (!b[6] && b[1] === from && b[2] === to))) continue;
    const mt = b[1] === to ? b[3] : b[4], mf = b[1] === to ? b[4] : b[3], s = mt + mf || 1;
    return [Math.max(1, Math.min(5, Math.round(6 * mt / s))), Math.max(1, Math.min(5, Math.round(6 * mf / s)))];
  }
  return null;
}

/* the owner each ownerLog entry replaced, kept up to date as the log grows */
const prevs = new WeakMap();
function prevOwners(w) {
  let p = prevs.get(w);
  if (!p) { p = { n: 0, prev: [], cur: new Array(w.regions.length).fill(null) }; prevs.set(w, p); }
  const log = w.ownerLog;
  for (; p.n < log.length; p.n++) { const e = log[p.n]; p.prev.push(p.cur[e[1]]); p.cur[e[1]] = e[2]; }
  return p.prev;
}

/* every change in the years (y0, y1], as candidate animations with a priority */
function changes(w, y0, y1) {
  const out = [], P = w.polities, born = function (p) { return p && p.founded > y0 && p.founded <= y1; };
  const wait = sailings(w, y0, y1, out), view = AEON.viewAt ? AEON.viewAt(w, y1) : null;
  /* land: grouped by who it passed from and to */
  const log = w.ownerLog, prev = prevOwners(w), groups = {};
  for (let k = after(log, y0, Y0); k < log.length && log[k][0] <= y1; k++) {
    const from = prev[k], to = log[k][2];
    if (from === to) continue;
    const key = from + ">" + to;
    (groups[key] || (groups[key] = { from: from, to: to, cells: [] })).cells.push(log[k][1]);
  }
  for (const key in groups) {
    const g = groups[key], fp = P[g.from], tp = P[g.to], n = g.cells.length;
    let delay = 0;
    for (const rid of g.cells) if (wait[rid]) delay = Math.max(delay, wait[rid]);
    const flash = { kind: "flash", cells: g.cells, color: tp && tp.color, delay: delay };
    if (g.to == null) out.push({ prio: 1 + Math.log2(1 + n), fx: { kind: "lost", cells: g.cells, from: g.from, to: null }, alt: null });
    else if (g.from == null) out.push({ prio: 0, fx: flash });
    else if (born(tp)) out.push({ prio: 4 + Math.log2(1 + n), fx: { kind: "split", cells: g.cells, from: g.from, to: g.to, capital: AEON.capitalAt(tp, y1) }, alt: flash });
    else {
      /* where the war band comes from: the attacker's land next to what it took, if any */
      let at = g.cells[0], origin = null;
      if (view) for (const rid of g.cells) {
        for (const nb of w.regions[rid].neighbors) if (view.regions[nb].owner === g.to && g.cells.indexOf(nb) < 0) { origin = nb; break; }
        if (origin != null) { at = rid; break; }
      }
      const men = bands(w, y0, y1, g.to, g.from), m = origin != null && men ? MARCH : 0;
      out.push({ prio: (delay ? 5 : 2) + Math.log2(1 + n), alt: flash, fx: { kind: "take", cells: g.cells, from: g.from, to: g.to, at: at, origin: origin, delay: delay,
        march: m, dur: m + 3300, flick: [m + 1000, m + 2100], colTo: tp && tp.color, colFrom: fp && fp.color, nTo: men ? men[0] : 3, nFrom: men ? men[1] : 2,
        lookTo: looksOf(w, tp, y1).band, lookFrom: looksOf(w, fp, y1).band } });
    }
  }
  for (const id in P) {
    const p = P[id];
    if (p.founded > y1) continue;
    /* capitals moving (the first entry is the founding) */
    const cl = p.capitalLog || [];
    for (let k = Math.max(1, after(cl, y0, YK)); k < cl.length && cl[k].year <= y1; k++)
      out.push({ prio: 5, fx: { kind: "crown", pid: id, from: cl[k - 1].capital, to: cl[k].capital } });
    /* ages: the one a realm is founded in, and each it reaches (not one it falls back into) */
    const al = p.ageLog || [];
    if (!w.pack.ages || !al.length) continue;
    for (let k = after(al, y0, YK); k < al.length && al[k].year <= y1; k++) {
      if ((al[k].inherited && !born(p)) || al[k].fell) continue;
      out.push({ prio: al[k].inherited ? 3 : 4.5, fx: { kind: "age", pid: id, age: al[k].age, year: al[k].year } });
    }
  }
  /* wonders raised and lost */
  if (AEON.wonders) for (const a of AEON.wonders(w)) {
    if (a.location == null) continue;
    if (a.created > y0 && a.created <= y1) out.push({ prio: 4.5, fx: { kind: "rise", id: a.id, at: a.location } });
    if (a.destroyed != null && a.destroyed > y0 && a.destroyed <= y1) out.push({ prio: 4, fx: { kind: "fall", id: a.id, at: a.location } });
  }
  /* settlements razed: the size they had before; a city burning is a great moment */
  const sl = w.settleLog || [], SK = w.sackLog || [];
  for (let k = after(sl, y0, Y0); k < sl.length && sl[k][0] <= y1; k++) {
    if (sl[k][2] !== 0) continue;
    const before = AEON.tierAt(w, sl[k][1], sl[k][0] - 1);
    if (before <= 0) continue;
    const who = [];
    for (let j = after(SK, y0, Y0); j < SK.length && SK[j][0] <= y1; j++) if (SK[j][1] === sl[k][1]) who.push(SK[j][2], SK[j][3]);
    out.push({ prio: before >= 3 ? 5 : 2 + before * 0.5, who: who, fx: { kind: "burn", at: sl[k][1], tier: Math.min(3, before) } });
  }
  for (const c of out) if (!c.who) c.who = [c.fx.from, c.fx.to, c.fx.pid];
  return out;
}

function start(c, t) {
  const f = c.fx;
  f.start = t + (f.delay || 0); f.dur = f.dur || DUR[f.kind];
  if (!f.flick && FLICKER[f.kind]) f.flick = [0, f.dur * FLICKER[f.kind]];
  live.push(f);
}
function majors() { let n = 0; for (const f of live) if (f.kind !== "flash") n++; return n; }

/* the changes playback has just passed: the most important animated, within the budget */
function collect(w, y0, y1) {
  const t = now();
  tokens = Math.min(BURST, tokens + (lastCollect ? (t - lastCollect) / 1000 * RATE : BURST));
  lastCollect = t;
  bank = Math.min(HOLD_MAX, bank + Math.max(0, y1 - y0) * HOLD_RATE);
  place(changes(w, y0, y1), t, false);
}
/* one moment, played once: after a scrub or a jump */
function moment(w, y) {
  live = [];
  place(changes(w, y - w.timeStep, y), now(), true);
}
function mine(c) { return followed != null && (c.who || []).indexOf(followed) >= 0; }
function place(list, t, isMoment) {
  /* a followed realm's changes first, then by priority */
  list.sort(function (a, b) { return (mine(b) ? 1 : 0) - (mine(a) ? 1 : 0) || b.prio - a.prio; });
  let room = isMoment ? MOMENT : Math.min(Math.floor(tokens), MAX_LIVE - majors());
  for (const c of list) {
    if (c.fx.kind === "flash") { start(c, t); continue; }
    if (room > 0 || mine(c)) {
      start(c, t); room--; if (!isMoment) tokens--;
      if (!isMoment && pace !== "off" && (c.prio >= MAJOR || mine(c))) {
        const secs = (c.fx.dur + (c.fx.delay || 0)) / 1000;
        if (mine(c) || pace === "all") c.fx.hold = true;
        else if (bank >= secs) { c.fx.hold = true; bank -= secs; }
      }
    }
    else if (c.alt) start({ fx: c.alt }, t);
  }
}
function clear() { live = []; }
function prune(t) { live = live.filter(function (f) { return t < f.start + f.dur; }); }

/* ------------------------------------------------------------ the sea */
/* Sea lanes are found on a grid of 2x2 map-pixel blocks: a block is water when none of its
   pixels is land, and its depth is how many blocks it lies from land. Lanes keep to depth 2 or
   more; they leave from the port's own block and end on the target's, so ships run aground. */
const B = 2, LANE_DEPTH = 2;
const seas = new WeakMap();
function seaOf(c) {
  let S = seas.get(c);
  if (S) return S;
  const bw = Math.floor(c.VW / B), bh = Math.floor(c.VH / B), N = bw * bh, depth = new Int16Array(N).fill(-1), q = [];
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let dry = false;
    for (let j = 0; j < B && !dry; j++) for (let i = 0; i < B; i++) if (c.land[(by * B + j) * c.VW + bx * B + i]) { dry = true; break; }
    if (dry) { depth[by * bw + bx] = 0; q.push(by * bw + bx); }
  }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], x = k % bw, y = (k - x) / bw;
    const nb = [y * bw + (x + 1) % bw, y * bw + (x + bw - 1) % bw, y > 0 ? k - bw : -1, y < bh - 1 ? k + bw : -1];
    for (const n of nb) if (n >= 0 && depth[n] < 0) { depth[n] = depth[k] + 1; q.push(n); }
  }
  S = { bw: bw, bh: bh, depth: depth };
  seas.set(c, S);
  return S;
}
function regionBlocks(c, S, rid) {
  const seen = {}, out = [];
  for (const i of regionPixels(c, rid)) {
    const x = i % c.VW, y = (i - x) / c.VW, k = Math.floor(y / B) * S.bw + Math.floor(x / B);
    if (!seen[k]) { seen[k] = true; out.push(k); }
  }
  return out;
}
/* from a region's own blocks out through the shallows to water of a depth: the chain of blocks */
function toOpenSea(c, S, rid, minDepth) {
  const from = regionBlocks(c, S, rid), prev = new Map(), q = [];
  for (const k of from) { prev.set(k, -1); q.push(k); }
  for (let h = 0; h < q.length && h < 4000; h++) {
    const k = q[h];
    if (S.depth[k] >= (minDepth || LANE_DEPTH + 1)) {
      const chain = [];
      for (let j = k; j >= 0; j = prev.get(j)) chain.unshift(j);
      return chain;
    }
    const x = k % S.bw, y = (k - x) / S.bw;
    const nb = [y * S.bw + (x + 1) % S.bw, y * S.bw + (x + S.bw - 1) % S.bw, y > 0 ? k - S.bw : -1, y < S.bh - 1 ? k + S.bw : -1];
    for (const n of nb) if (n >= 0 && S.depth[n] > 0 && !prev.has(n)) { prev.set(n, k); q.push(n); }
  }
  return null;
}
/* the lane from one region to another, in map pixels (x unwrapped, so it may run off an edge);
   with openEnd (a block) it ends out at sea there instead */
function seaLane(c, fromRid, toRid, openEnd) {
  const S = seaOf(c), a = toOpenSea(c, S, fromRid), b = openEnd != null ? [openEnd] : toOpenSea(c, S, toRid);
  if (!a || !b) return null;
  const s = a[a.length - 1], e = b[b.length - 1], prev = new Int32Array(S.bw * S.bh).fill(-1), q = [s];
  prev[s] = s;
  for (let h = 0; h < q.length && prev[e] < 0; h++) {
    const k = q[h], x = k % S.bw, y = (k - x) / S.bw;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ny = y + dy;
      if ((!dx && !dy) || ny < 0 || ny >= S.bh) continue;
      const n = ny * S.bw + (x + dx + S.bw) % S.bw;
      if (prev[n] < 0 && S.depth[n] >= LANE_DEPTH) { prev[n] = k; q.push(n); }
    }
  }
  if (prev[e] < 0) return null;
  const mid = [];
  for (let k = e; ; k = prev[k]) { mid.unshift(k); if (k === s) break; }
  const blocks = a.concat(mid.slice(1), b.slice(0, -1).reverse());
  if (blocks.length < 2) return null;
  const pts = [];
  for (const k of blocks) {
    let x = (k % S.bw) * B + B / 2;
    const y = Math.floor(k / S.bw) * B + B / 2;
    if (pts.length) { const px = pts[pts.length - 1][0]; while (x - px > c.VW / 2) x -= c.VW; while (px - x > c.VW / 2) x += c.VW; }
    pts.push([x, y]);
  }
  /* smoothed, ends kept */
  return pts.map(function (p, k) {
    if (k < 2 || k > pts.length - 3) return p;
    let sx = 0, sy = 0, n = 0;
    for (let d = -3; d <= 3; d++) { const r = pts[Math.max(0, Math.min(pts.length - 1, k + d))]; sx += r[0]; sy += r[1]; n++; }
    return [sx / n, sy / n];
  });
}
function sailTime(path) { return Math.max(1400, Math.min(3200, path.length * B * 14)); }
/* a realm's coastal regions nearest to a target, at the year shown (skipping some regions) */
function portsFor(w, view, pid, target, skip) {
  const R = w.regions, tr = R[target], out = [];
  for (let i = 0; i < R.length; i++) {
    if (view.regions[i].owner !== pid || i === target || (skip && skip[i])) continue;
    if (!R[i].neighbors.some(function (n) { return R[n].barren; })) continue;
    let dx = Math.abs(R[i].x - tr.x); dx = Math.min(dx, w.width - dx);
    out.push([dx * dx + (R[i].y - tr.y) ** 2, i]);
  }
  return out.sort(function (a, b) { return a[0] - b[0]; }).slice(0, 6).map(function (e) { return e[1]; });
}
/* the first of those ports with a lane to the target (one on a lake has none) */
function laneFrom(c, ports, target, openEnd) {
  for (const port of ports) { const lane = seaLane(c, port, target, openEnd); if (lane) return lane; }
  return null;
}
/* the sea events in (y0, y1] as animations; returns, per region they change, how long the land
   change should wait for the ships */
function sailings(w, y0, y1, out) {
  const wait = {}, c = AEON.render && AEON.render.cacheOf ? AEON.render.cacheOf(w) : null, ix = w._typeIndex;
  if (!c || !ix || !AEON.viewAt) return wait;
  const view = AEON.viewAt(w, y1), P = w.polities;
  for (const type in SEA) {
    const list = ix[type];
    if (!list) continue;
    for (let k = after(list, y0, YK); k < list.length && list[k].year <= y1; k++) {
      /* a crossing beaten back plays as a fight at sea that the attacker loses; those events
         name the defender first */
      const ev = list[k], rep = ev.tags.indexOf("repelled") >= 0, kind = rep ? "raid" : SEA[type], pol = ev.actors.filter(function (a) { return a.kind === "polity"; });
      const p = pol[rep ? 1 : 0] && P[pol[rep ? 1 : 0].id], target = ev.regionId;
      if (!p || target == null) continue;
      /* not from land taken in this same crossing */
      const skip = {};
      if (kind === "invade") for (let j = after(w.ownerLog, y0, Y0); j < w.ownerLog.length && w.ownerLog[j][0] <= y1; j++) if (w.ownerLog[j][2] === p.id) skip[w.ownerLog[j][1]] = true;
      const ports = portsFor(w, view, p.id, target, skip), lane = laneFrom(c, ports, target, null);
      if (!lane) continue;
      const sail = sailTime(lane);
      if (kind === "colony") {
        wait[target] = sail;
        out.push({ prio: 6, who: [p.id], fx: { kind: kind, dur: sail + 1500, fleets: [{ path: lane, color: p.color, look: looksOf(w, p, y1), n: 1, segs: [[0, sail, 0, 1]] }], sail: sail, at: target } });
        continue;
      }
      if (kind === "invade") {
        /* the first wave lands and pitches a camp; the second lands behind it; then the men march
           inland and the land change (the scuffle, the flicker) follows */
        const second = sail * 0.6, landed2 = second + sail, inland = landed2 + 200;
        wait[target] = inland + INLAND;
        out.push({ prio: 6, who: [p.id, pol[1] && pol[1].id], fx: { kind: kind, dur: inland + INLAND + 600, sail: sail, landed2: landed2, inland: inland, at: target, fleets: [
          { path: lane, color: p.color, look: looksOf(w, p, y1), n: 3, segs: [[0, sail, 0, 1]] },
          { path: lane, color: p.color, look: looksOf(w, p, y1), n: 2, off: 14, segs: [[second, landed2, 0, 1]] }] } });
        continue;
      }
      /* a raid: the defenders sail out from their nearest port, and the fleets meet in open water
         off the raided coast, each stopping a little short of the other */
      const q = pol[rep ? 0 : 1] && P[pol[rep ? 0 : 1].id], homes = q ? portsFor(w, view, q.id, target, null) : [];
      const deep = toOpenSea(c, seaOf(c), target, 6), spot = deep && deep[deep.length - 1];
      const alane = spot != null && laneFrom(c, ports, null, spot), dlane = spot != null && homes.length && laneFrom(c, homes, null, spot);
      const loser = rep ? 0 : hash(k, 5) < 0.5 ? 0 : 1;
      if (alane && dlane && alane.length > 4 && dlane.length > 4) {
        const sa = Math.max(0.3, (alane.length - 4) / (alane.length - 1)), sd = Math.max(0.3, (dlane.length - 4) / (dlane.length - 1));
        out.push({ prio: 6, who: [p.id, q.id], fx: { kind: "battle", dur: 6000, loser: loser, fleets: [
          { path: alane, color: p.color, look: looksOf(w, p, y1), n: 3, segs: [[0, 2000, 0, sa], [3900, 5800, sa, loser === 0 ? 0 : sa]] },
          { path: dlane, color: q.color, look: looksOf(w, q, y1), n: 2, segs: [[0, 2000, 0, sd], [3900, 5800, sd, loser === 1 ? 0 : sd]] }] } });
      } else {
        out.push({ prio: 5, who: [p.id, q && q.id], fx: { kind: "raid", dur: 5800, at: target, fleets: [{ path: lane, color: p.color, look: looksOf(w, p, y1), n: 3, segs: [[0, 2400, 0, 1], [3900, 5800, 1, 0]] }] } });
      }
    }
  }
  return wait;
}
function isLive() { prune(now()); return live.length > 0; }
/* regions in a change of hands, for the map to draw (pixelmap compose): { rid: { from, to,
   phase } }, or null. Before its flicker (ships still sailing, the war band still marching or
   fighting) land keeps the old owner (phase -1); f.flick is that window in ms from the start. */
const FLICKER = { split: 0.5, lost: 0.7 };
function contested() {
  const t = now();
  let out = null;
  for (const f of live) {
    if (!f.flick || t >= f.start + f.flick[1]) continue;
    const rel = t - f.start, phase = rel < f.flick[0] ? -1 : Math.floor((rel - f.flick[0]) / 140) & 1;
    for (const rid of f.cells) (out || (out = {}))[rid] = { from: f.from, to: f.to, phase: phase };
  }
  return out;
}
/* a breakaway realm's new seat is drawn as the town it was until the crown comes down on it */
const CROWNED = 0.6;
function asTown(rid) {
  const t = now();
  for (const f of live) if (f.kind === "split" && f.capital === rid && t >= f.start && t < f.start + f.dur * CROWNED) return true;
  return false;
}
/* a wonder that is rising is drawn here, not by the map */
function hides(id) { for (const f of live) if (f.kind === "rise" && f.id === id) return true; return false; }
/* a place still burning: the map leaves its ruin to the animation until the fire is out */
function burning(rid) { for (const f of live) if (f.kind === "burn" && f.at === rid) return true; return false; }

/* ------------------------------------------------------------ drawing helpers (sprite pixels) */
function px(g, x, y, col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
function twinkle(g, x, y, a) {
  if (a < 0 || a >= 1) return;
  const f = Math.min(3, Math.floor(a * 4));
  g.fillStyle = f === 3 ? "rgba(255,248,225,.55)" : "#fff8e1";
  if (f < 3) g.fillRect(x, y, 1, 1);
  for (let d = f === 3 ? 2 : 1; d <= [0, 1, 2, 3][f]; d++) { g.fillRect(x - d, y, 1, 1); g.fillRect(x + d, y, 1, 1); g.fillRect(x, y - d, 1, 1); g.fillRect(x, y + d, 1, 1); }
}
/* the game project's speech bubble, its tail pointing down at (x, y) */
function bubble(g, x, y, edge, t, w, h, inner) {
  const lift = t < 90 ? -3 : t < 180 ? 1 : Math.floor(t / 500) % 2;
  const left = Math.round(x - w / 2), top = y - h - 3 + lift;
  g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(left + 1, top + 1, w, h);
  g.fillStyle = edge; g.fillRect(left, top, w, h); g.fillRect(x - 2, top + h, 3, 1); g.fillRect(x - 1, top + h + 1, 1, 2);
  g.fillStyle = HALO; g.fillRect(left + 1, top + 1, w - 2, h - 2); g.fillRect(x - 1, top + h - 1, 1, 2);
  inner(left, top);
}
/* a cartoon scuffle: a boiling dust cloud with fists and blades poking out, and stars */
function brawl(g, t, r) {
  const f = Math.floor(t / 90), C = [];
  for (let k = 0; k < 6; k++) {
    const a = k / 5 * 6.28 + hash(k, f) * 0.8, d = k ? r * 0.5 : 0;
    C.push([Math.cos(a) * d + (hash(k, f + 3) - 0.5) * 1.5, Math.sin(a) * d * 0.7, r * (0.48 + 0.2 * hash(k, f + 7))]);
  }
  const inside = function (x, y) { return C.some(function (c) { return (x + 0.5 - c[0]) ** 2 + (y + 0.5 - c[1]) ** 2 <= c[2] * c[2]; }); };
  for (let y = -r - 2; y <= r + 2; y++) for (let x = -r - 3; x <= r + 3; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1);
    px(g, x, y, edge ? INK : y > r * 0.25 ? "#cdbf9c" : "#efe4c8");
  }
  for (let k = 0; k < 3; k++) {
    const a = hash(k, f + 11) * 6.28, ux = Math.cos(a), uy = Math.sin(a);
    let d = 0;
    while (d < r + 4 && inside(Math.round(ux * d), Math.round(uy * d))) d++;
    for (let s = 0; s < 3; s++) px(g, Math.round(ux * (d + s)), Math.round(uy * (d + s)), s === 2 ? (k === 0 ? "#c9ced6" : "#e8c9a0") : INK);
  }
  for (let k = 0; k < 2; k++) {
    const a = hash(k, f + 21) * 6.28, x = Math.round(Math.cos(a) * (r + 2)), y = Math.round(Math.sin(a) * (r + 1));
    g.fillStyle = GOLD; g.fillRect(x, y - 1, 1, 3); g.fillRect(x - 1, y, 3, 1);
  }
}
function flames(g, x, y, w, t) {
  for (let i = 0; i < w; i++) {
    const h = Math.floor(hash(i, Math.floor(t / 90) + x) * 4);
    if (!h) continue;
    g.fillStyle = "#e8742a"; g.fillRect(x + i, y - h, 1, h);
    px(g, x + i, y - 1, GOLD);
  }
}
function smoke(g, x, y, t, n, spread, fade) {
  for (let k = 0; k < n; k++) {
    const age = (t / 1400 + hash(k, 1)) % 1;
    g.fillStyle = "rgba(70,62,58," + (0.65 * (1 - age) * fade).toFixed(2) + ")";
    const s = age > 0.45 ? 2 : 1;
    g.fillRect(Math.round(x + (hash(k, 2) - 0.5) * spread + Math.sin(age * 6 + k) * 1.5), Math.round(y - age * 14), s, s);
  }
}
function dust(g, x, y, w, t) {
  g.fillStyle = "rgba(230,215,180,.85)";
  for (let k = 0; k < 8; k++) g.fillRect(x + Math.round(hash(k, Math.floor(t / 120)) * w), y + Math.round(hash(k + 9, Math.floor(t / 120)) * 3) - 1, 1, 1);
}

/* ------------------------------------------------------------ drawing */
/* each region's map pixels, built once per terrain cache */
const pixLists = new WeakMap();
function regionPixels(c, rid) {
  let L = pixLists.get(c);
  if (!L) {
    L = {};
    for (let i = 0; i < c.cellOf.length; i++) if (c.land[i]) (L[c.cellOf[i]] || (L[c.cellOf[i]] = [])).push(i);
    pixLists.set(c, L);
  }
  return L[rid] || [];
}
/* paint some regions' land, every pixel or every other 4-pixel block (phase 0 or 1) */
function paint(g, env, cells, style, phase) {
  const c = env.c, VW = c.VW, P = env.P;
  g.fillStyle = style;
  for (const rid of cells) for (const i of regionPixels(c, rid)) {
    const x = i % VW, y = (i - x) / VW;
    if (phase != null && (((x >> 2) + (y >> 2) + phase) & 1)) continue;
    g.fillRect(env.X0 + x * P, env.Y0 + y * P, P, P);
  }
}
/* contested land: while its blocks flicker (drawn by the map, see contested()), nothing here;
   then a flash of light as it settles */
function settle(g, env, f) {
  const rel = env.now - f.start, until = f.flick[1];
  if (rel < until) return;
  const b = (rel - until) / (f.dur - until);
  paint(g, env, f.cells, "rgba(" + LIGHT + "," + (0.42 * (1 - b)).toFixed(3) + ")", null);
}

/* the ink tear along a breakaway's border with the realm it leaves, jumping about a pixel */
function tear(g, env, f) {
  const c = env.c, VW = c.VW, P = env.P, view = env.world.regions;
  if (!f.tearPx) {
    const mine = {};
    for (const rid of f.cells) mine[rid] = true;
    f.tearPx = [];
    for (const rid of f.cells) for (const i of regionPixels(c, rid)) {
      const x = i % VW, y = (i - x) / VW;
      if (y & 1) continue;
      for (const j of [y * VW + (x + 1) % VW, y * VW + (x + VW - 1) % VW, i - VW, i + VW]) {
        if (j < 0 || j >= c.cellOf.length || !c.land[j]) continue;
        const n = c.cellOf[j];
        if (!mine[n] && view[n].owner === f.from) { f.tearPx.push(i); break; }
      }
    }
  }
  const k = Math.floor((env.now - f.start) / 120);
  g.fillStyle = INK;
  for (const i of f.tearPx) {
    const x = i % VW, y = (i - x) / VW;
    g.fillRect(env.X0 + (x + (hash(y, k) > 0.5 ? 1 : 0)) * P, env.Y0 + y * P, P, 2 * P);
  }
}
function drawUnder(g, env, f, a) {
  if (env.mode !== "political") return;
  if (f.kind === "flash") paint(g, env, f.cells, "rgba(" + LIGHT + "," + (0.45 * (1 - a)).toFixed(3) + ")", null);
  else if (f.kind === "take" || f.kind === "split") settle(g, env, f);
  if (f.kind === "split" && env.now - f.start < f.flick[1]) tear(g, env, f);
}

/* ------------------------------------------------------------ what a realm knows, on its soldiers and ships
   (Daan's picks from samples/tech-sprites.html). The look is read from the named technologies the
   realm knew that year (AEON.techsOf); pikes come with the fourth age once a realm has iron. */
const LOOKS = {
  historical: { bronze: "bronze", iron: "iron", gunpowder: "musket", sail: "sail", galleon: "galleon" },
  fantasy: { smithing: "bronze", "star-iron": "iron", "black-powder": "musket", "sea-charts": "sail", galleons: "galleon", "steam-ships": "steam" },
};
const BAND_RANK = ["plain", "bronze", "iron", "pike", "musket"], SHIP_RANK = ["oared", "sail", "galleon", "steam"];
const PIKE_AGE = 3;
function ageAt(p, y) {
  const al = p.ageLog || [];
  let a = al.length ? al[0].age : 0;
  for (const e of al) if (e.year <= y) a = e.age;
  return a;
}
/* { band, ship }: how p's war bands and fleets look in year y */
function looksOf(w, p, y) {
  const L = LOOKS[w.packId] || {}, out = { band: "plain", ship: "oared" };
  if (!p || !AEON.techsOf) return out;
  for (const t of AEON.techsOf(w, p, y)) {
    const look = L[t.id];
    if (BAND_RANK.indexOf(look) > BAND_RANK.indexOf(out.band)) out.band = look;
    if (SHIP_RANK.indexOf(look) > SHIP_RANK.indexOf(out.ship)) out.ship = look;
  }
  if (out.band === "iron" && ageAt(p, y) >= PIKE_AGE) out.band = "pike";
  return out;
}

/* soldiers in their realm's tabards (f), two walking frames each; q bright bronze, E its dark guard,
   n a musket's dark barrel, B its stock */
const MAN_PAL = { k: INK, w: "#e8c9a0", f: "#888", F: "#555", s: "#c9ced6", i: "#8f969e", q: "#e3a94f", E: "#8a5a22", e: "#c08a3a",
                  b: "#7a4a22", B: "#4e2f16", n: "#3b3236", y: GOLD };
const STAND = [".kk..", ".k.k.", "k...k"], STRIDE = [".kk..", "..k..", ".kk.."];
function man(top, legs) {
  const rows = top.concat(legs || STAND), w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
  return sprite(rows.map(function (r) { return r + ".".repeat(w - r.length); }), MAN_PAL);
}
function kind(top, gap) { return { frames: [man(top, STAND), man(top, STRIDE)], gap: gap }; }
const BANDS = {
  plain: kind(["....s", ".kk.s", ".kwks", "kffks", ".ffk."], 5),                   /* the spear, before bronze */
  bronze: kind(["....q", "....q", ".kk.q", ".kwkq", "kffEEE", ".ffkk"], 6),       /* the iron sword's shape, in bronze */
  iron: kind(["....s", "....s", ".kk.s", ".kwks", "kffiii", ".ffkk"], 6),
  pike: kind([".........s", "........b", ".......b", "......b", ".kk..b", ".kwkb", "kffk", ".ffk"], 4),   /* sloped forward */
  musket: kind(["....k", "....n", "....n", ".kk.n", ".kwkn", "kffkB", ".ffBB"], 5),  /* shouldered, stock down */
};
/* a musketeer firing: the musket levelled, the muzzle 8 pixels on and 5 up from the feet */
const AIM = man([".kk.....", ".kwk....", "kffBnnnk", ".ffk...."]);
/* the bearer marches behind his band, facing the enemy, the pole on his back side (column 0) */
const BEARER = [man(["k...", "kkk.", "kkwk", "kffk", "kff."], ["kkk..", "kk.k.", "k...k"]),
                man(["k...", "kkk.", "kkwk", "kffk", "kff."], ["kkk..", "k.k..", "kkk.."])];
/* the standard of the age over him (at: the pole's column); its flag trails behind as he marches */
const STANDARDS = {
  plain: { sp: sprite(["kfff", "kfff", "kff.", "k..."], MAN_PAL), at: 0 },
  bronze: { sp: sprite(["e...e", "ee.ee", ".eye.", "..e..", "..k..", "..k.."], MAN_PAL), at: 2 },              /* a horned bull's head */
  iron: { sp: sprite(["..y..", ".y.y.", "..k..", "kkkkk", ".fff.", ".fFf.", ".fff.", "..k..", "..k.."], MAN_PAL), at: 2 },  /* an eagle over a cloth */
  pike: { sp: sprite(["kffff", "kfFff", "kFFFF", "kfFff", "kffff", "k...."], MAN_PAL), at: 0 },                 /* a flag with a cross */
  musket: { sp: sprite(["y.....", "kffFFf", "kfFFff", "kFFfff", "kffffF", "k....."], MAN_PAL), at: 0 },         /* a regimental colour */
};
function shade(hex) {
  const n = parseInt((hex || "#888888").slice(1), 16), d = function (v) { return Math.round(v * 0.55 + 42 * 0.45); };
  return "rgb(" + d((n >> 16) & 255) + "," + d((n >> 8) & 255) + "," + d(n & 255) + ")";
}
/* a puff of musket smoke from (x, y), a (0-1) along its life */
function puff(g, x, y, a) {
  if (a < 0 || a >= 1) return;
  if (a < 0.12) { px(g, x, y, "#ffd27a"); px(g, x + 1, y, "#e8742a"); }
  g.fillStyle = "rgba(232,226,214," + (0.9 * (1 - a)).toFixed(2) + ")";
  for (let k = 0; k < 5; k++) {
    const r = 1 + a * 3;
    g.fillRect(Math.round(x + 1 + a * 5 + (hash(k, 5) - 0.3) * r), Math.round(y - a * 3 + (hash(k, 6) - 0.5) * r), a > 0.4 ? 2 : 1, 1);
  }
}
/* a few soldiers of a look in their realm's colour, walking (or standing) and facing dir (1 right,
   -1 left), with a standard bearer behind them when banner is set; (x, y) is the leader's feet.
   Standing musketeers fire in turn. */
function band(g, env, x, y, n, color, dir, t, walking, banner, look) {
  const K = BANDS[look] || BANDS.plain, over = { f: color || "#888", F: shade(color) }, step = walking ? Math.floor(t / 160) % 2 : 0;
  g.save(); g.translate(Math.round(x), Math.round(y)); g.scale(env.u * dir, env.u);
  if (banner) {
    const st = STANDARDS[look] || STANDARDS.plain, b = BEARER[(step + 1) % 2], bx = -2 - (n - 1) * K.gap - 6;
    env.blit(g, b, bx, -b.h - 1, 1, over);
    g.save(); g.translate(2 * bx + 1, 0); g.scale(-1, 1);       /* the flag trails: mirrored about the pole */
    env.blit(g, st.sp, bx - st.at, -b.h - 1 - st.sp.h, 1, over);
    g.restore();
  }
  for (let i = n - 1; i >= 0; i--) {                           /* back to front: the leader on top */
    const xi = -2 - i * K.gap, yi = i % 2;
    if (look === "musket" && !walking) {
      const a = ((t - i * 700) % 2100 + 2100) % 2100;           /* each man fires once every 2.1 s */
      if (a < 700) { env.blit(g, AIM, xi, yi - AIM.h, 1, over); puff(g, xi + 8, yi - 5, a / 700); continue; }
    }
    const sp = K.frames[(step + i) % 2];
    env.blit(g, sp, xi, yi - sp.h, 1, over);
  }
  g.restore();
}
/* one soldier of a look, standing, feet at (x, y) in the current sprite frame */
function soldier(g, env, look, x, y, over) { const sp = (BANDS[look] || BANDS.plain).frames[0]; env.blit(g, sp, x, y - sp.h, 1, over); }

/* ships, bow to the right (f: the realm's colour): the oared boat (its oars stroke), the sail ship
   with a coloured sail, the galleon and the steam-ship (it smokes) with pale sails and the realm's stripe */
const SHIP_PAL = { k: INK, f: "#888", F: "#555", b: "#7a4a22", B: "#4e2f16", c: "#efe6d6", d: "#c9bc9a", i: "#8f969e", y: GOLD };
const OARED = [".....k.......", ".....kff.....", ".....k.......", "k....k......k", "kb...k.....bk", "kbbbbbbbbbbbk", ".kbbbbbbbbbk.", "..kBkBkBkBk.."];
const SHIPS = {
  oared: [".k.k.k.k.k...", "..k.k.k.k.k..", "...k.k.k.k.k."].map(function (oars) { return sprite(OARED.concat([oars]), SHIP_PAL); }),
  sail: [sprite(["......k......", "....kkkkk....", "...kfffffk...", "...kfFFffk...", "...kfffffk...", "....kkkkk....",
                 "k.....k.....k", "kbbbbbbbbbbbk", ".kbbbbbbbbbk.", "..kkkkkkkkk.."], SHIP_PAL)],
  galleon: [sprite(["....kff..kff...", "...kck..kck....", "...kcd..kcd....", "..kcccd.kcccd..", "..kccdd.kccdd..", "..kcccd.kcccd..",
                    "kkk.k....k.....", "kbk.k....k...kk", "kbkkkkkkkkkkkk.", "kfffffffffffffk", ".kbbybbbybbbbk.", "..kkkkkkkkkkk.."], SHIP_PAL)],
  steam: [sprite(["......kk......", "......ff......", "......kk......", "...kkkkkkkkk..", "...kccccccck..", "...kkkkkkkkk..",
                  "kkkkk.kkk.kkkk", "kfffkiiikffffk", ".kbbkiiikbbbk.", "..kkkkkkkkkk.."], SHIP_PAL)],
};
const FLAG = sprite(["kff", "kff", "k..", "k..", "k.."], { k: INK, f: "#888" });
/* the camp a landing party pitches at the water's edge: a standard and two tents */
const CAMP = sprite(["kff.......", "kf....k...", "k....kck..", "k...kccdk.", "k..kcccddk", "kkkkkkkkkk"], { k: INK, f: "#888", c: "#ddd0aa", d: "#9a8a64" });
const FOAM = "#a6dbff";
/* where a fleet is along its lane at a time: [fraction, moving, direction] */
function fleetAt(fl, t) {
  let s = fl.segs[0][2];
  for (const g of fl.segs) {
    if (t < g[0]) return [s, false, 1];
    if (t <= g[1]) return [lerp(g[2], g[3], ease((t - g[0]) / (g[1] - g[0]))), g[2] !== g[3], g[3] >= g[2] ? 1 : -1];
    s = g[3];
  }
  return [s, false, 1];
}
/* each ship of a fleet: its screen position and lane index (ships follow one another) */
function shipsOf(env, fl, t) {
  const at = fleetAt(fl, t), n = fl.path.length - 1, out = [];
  for (let k = 0; k < fl.n; k++) {
    const i = Math.max(0, Math.min(n, Math.round(at[0] * n - (k * 5 + (fl.off || 0)) * at[2])));
    const p = fl.path[i], mx = ((p[0] % env.c.VW) + env.c.VW) % env.c.VW;
    out.push({ i: i, x: env.X0 + mx * env.P, y: env.Y0 + p[1] * env.P, moving: at[1], dir: at[2], k: k });
  }
  return out;
}
/* which way a ship's bow points on the screen: along its lane in the direction it sails, kept
   while it lies still (fl.face, per ship) */
function facing(env, fl, sh) {
  const face = fl.face || (fl.face = {}), P = fl.path, VW = env.c.VW;
  if (sh.moving) {
    const a = P[sh.i], b = P[Math.max(0, Math.min(P.length - 1, sh.i + 2 * sh.dir))];
    let dx = ((b[0] - a[0]) % VW + VW) % VW;
    if (dx > VW / 2) dx -= VW;
    if (dx) face[sh.k] = dx > 0 ? 1 : -1;
  }
  return face[sh.k] || 1;
}
function drawShip(g, env, fl, sh, t, sink) {
  const kind = (fl.look && fl.look.ship) || "oared", frames = SHIPS[kind] || SHIPS.oared;
  const sp = kind === "oared" && sh.moving ? frames[Math.floor((t + sh.k * 130) / 220) % 3] : frames[0];
  if (sink >= sp.h) return;
  if (sh.moving) {                                         /* the wake, behind the ship */
    g.fillStyle = FOAM;
    for (let m = 2; m < 9; m += 2) if ((m / 2 + Math.floor(t / 150)) % 2) {
      const q = fl.path[Math.max(0, Math.min(fl.path.length - 1, sh.i - m * sh.dir))], mx = ((q[0] % env.c.VW) + env.c.VW) % env.c.VW;
      g.fillRect(Math.round(env.X0 + mx * env.P), Math.round(env.Y0 + q[1] * env.P + env.u), env.u, env.u);
    }
  }
  const bob = Math.sin(t / 300 + sh.k * 1.7) > 0.4 ? 1 : 0, half = sp.w >> 1, top = 1 - sp.h + bob;
  frameAt(g, env, sh.x, sh.y, function () {
    g.scale(facing(env, fl, sh), 1);
    if (sink > 0) { g.save(); g.beginPath(); g.rect(-half - 2, top - 4, sp.w + 4, sp.h + 5); g.clip(); }
    env.blit(g, sp, -half, top + Math.round(sink || 0), 1, { f: fl.color || "#888", F: shade(fl.color) });
    if (sink > 0) g.restore();
    if (kind === "steam" && !(sink > 0)) for (let k = 0; k < 6; k++) {   /* smoke from the funnel, drifting aft */
      const a = ((t + sh.k * 300) / 1600 + k / 6) % 1;
      g.fillStyle = "rgba(70,62,58," + (0.8 * (1 - a)).toFixed(2) + ")";
      const s = a > 0.4 ? 2 : 1;
      g.fillRect(6 - half - Math.round(a * 7), Math.round(top - 1 - a * 9), s, s);
    }
  });
}
/* the sprite-pixel frame around a point on the screen: (0, 0) there, one unit per sprite pixel */
function frameAt(g, env, x, y, draw) {
  g.save(); g.translate(Math.round(x), Math.round(y)); g.scale(env.u, env.u); draw(); g.restore();
}
function drawOver(g, env, f, a) {
  const R = env.world.regions, t = env.now - f.start, S = env.sprites, blit = env.blit;
  const centre = function (rid) { const r = R[rid]; return [env.sx(r.x + 0.5), env.sy(r.y + 0.5)]; };
  if (f.kind === "take") {
    /* the war band marches up from the attacker's side, the defenders come out from the other,
       and they meet in a scuffle on the border; distances in sprite pixels, so it reads at any zoom */
    const B = centre(f.at), A = f.origin != null ? centre(f.origin) : null, u = env.u;
    let dx = 1, dy = 0;
    if (A && Math.abs(A[0] - B[0]) < env.c.VW * env.P / 2) { const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1; dx = (B[0] - A[0]) / L; dy = (B[1] - A[1]) / L; }
    const meet = [B[0] - dx * 2 * u, B[1] - dy * 2 * u], dir = dx >= 0 ? 1 : -1;
    if (f.march && t < f.march) {
      const q = ease(t / f.march), back = 26 * u * (1 - q) + 5 * u, d = 14 * u * (1 - ease((t - f.march * 0.3) / (f.march * 0.7))) + 5 * u;
      band(g, env, meet[0] - dx * back, meet[1] - dy * back, f.nTo || 3, f.colTo, dir, t, true, true, f.lookTo);
      band(g, env, meet[0] + dx * d, meet[1] + dy * d, f.nFrom || 2, f.colFrom, -dir, t + 80, t > f.march * 0.3, false, f.lookFrom);
    } else if (t < f.march + 1000) {
      frameAt(g, env, meet[0], meet[1] - 3 * u, function () { brawl(g, t, 6); });
    }
    /* once it settles, the victor's flag goes up on the land */
    if (t >= f.flick[1]) frameAt(g, env, B[0], B[1], function () {
      blit(g, FLAG, 0, -5 - Math.round(3 * ease((t - f.flick[1]) / 300)), 1, { f: f.colTo || "#888" });
      twinkle(g, 1, -9, (t - f.flick[1] - 200) / 700);
    });
  } else if (f.kind === "split" && f.capital != null) {
    /* the crown comes down on the new realm's seat (drawn as a town until it lands, see asTown),
       which then shows its flag in a bubble */
    const p = centre(f.capital), top = -Math.ceil(S.PALACE.h / 2) - CROWN.h, nc = env.world.polities[f.to];
    frameAt(g, env, p[0], p[1], function () {
      if (a > 0.35 && a < CROWNED) blit(g, CROWN, -2, Math.round(lerp(top - 14, top, ease((a - 0.35) / (CROWNED - 0.35)))), 1);
      twinkle(g, 0, top, (a - CROWNED) / 0.2);
      if (a > CROWNED + 0.05) bubble(g, 0, -Math.ceil(S.PALACE.h / 2) - 1, INK, t - (CROWNED + 0.05) * f.dur, 9, 9, function (l, tp) {
        blit(g, FLAG, l + 3, tp + 2, 1, { f: (nc && nc.color) || "#888" });
      });
    });
  } else if (f.kind === "crown") {
    const A = centre(f.from), B = centre(f.to), p = ease(a / 0.85);
    const lift = Math.min(80, Math.hypot(B[0] - A[0], B[1] - A[1]) * 0.35) + 8 * env.u;
    const x = lerp(A[0], B[0], p), y = lerp(A[1], B[1], p) - Math.sin(p * Math.PI) * lift - (S.PALACE.h / 2 + 5) * env.u;
    frameAt(g, env, x, y, function () {
      if (a < 0.85) blit(g, CROWN, -2, -2, 1);
      if (a < 0.85 && Math.floor(t / 100) % 2) twinkle(g, -4, 2, (t / 100) % 1);
      twinkle(g, 0, 0, (a - 0.85) / 0.15);
    });
  } else if (f.kind === "age") {
    const p = env.world.polities[f.pid];
    if (!p || p.capital == null || !R[p.capital]) return;
    const c = centre(p.capital), sp = LAURELS[Math.min(4, f.age)];
    if (a > 0.9) return;
    frameAt(g, env, c[0], c[1], function () {
      bubble(g, 0, -Math.ceil(S.PALACE.h / 2) - 1, GOLD, t, sp.w + 6, sp.h + 6, function (l, tp) { blit(g, sp, l + 3, tp + 3, 1); });
    });
  } else if (f.kind === "rise" || f.kind === "fall") {
    if (env.pc < 2) return;
    /* where the map draws a standing wonder: right of the cell's marker, on its ground line */
    const r = R[f.at], W = env.wonderSprite ? env.wonderSprite(f.id) : S.WONDER, x = env.sx(r.x + 0.5) + (S.PALACE.w / 2 + 2) * env.u, y = env.sy(r.y + 0.5) + 3 * env.u;
    frameAt(g, env, x, y, function () {
      if (f.kind === "rise") {
        const h = Math.round(W.h * ease(a / 0.7));
        if (h > 0) { g.save(); g.beginPath(); g.rect(0, -h, W.w, h); g.clip(); blit(g, W, 0, -W.h, 1); g.restore(); }
        if (a < 0.7) dust(g, -1, 0, W.w + 2, t);
        twinkle(g, W.w >> 1, -W.h - 2, (a - 0.7) / 0.3);
      } else {
        const drop = Math.round(W.h * ease((a - 0.25) / 0.35));
        const shake = a > 0.1 && a < 0.25 ? Math.floor(t / 60) % 2 : 0;
        if (drop < W.h) { g.save(); g.beginPath(); g.rect(-2, -W.h - 2, W.w + 4, W.h + 2); g.clip(); blit(g, W, shake, -W.h + drop, 1); g.restore(); }
        if (a > 0.25 && a < 0.7) { dust(g, -3, 0, W.w + 6, t); dust(g, -1, -3, W.w + 2, t + 50); }
        if (a > 0.5) { g.globalAlpha = Math.min(1, (1 - a) / 0.25); blit(g, RUBBLE, (W.w - RUBBLE.w) >> 1, -RUBBLE.h, 1); g.globalAlpha = 1; }
      }
    });
  } else if (f.fleets) {
    drawSea(g, env, f, a, t);
  } else if (f.kind === "burn") {
    const minTier = env.pc >= 4 ? 1 : env.pc >= 2 ? 2 : 3;
    if (f.tier < minTier) return;
    const sp = [null, S.VILLAGE, S.TOWN, S.CITY][f.tier], ruin = RUINS[f.tier], c = centre(f.at);
    const x = Math.round(c[0] - sp.w * env.u / 2), y = Math.round(c[1] - sp.h * env.u / 2);
    frameAt(g, env, x, y, function () {
      if (a < 0.45) {
        blit(g, sp, 0, 0, 1);
        flames(g, 1, 3 + (a < 0.15 ? 1 : 0), a < 0.15 ? Math.ceil(sp.w / 3) : sp.w - 2, t + f.at);
        if (a > 0.35) dust(g, -1, sp.h - 1, sp.w + 2, t);
      } else {
        /* the ruin stays: once the fire is out pixelmap.js draws it on (AEON.ruinAt) */
        blit(g, ruin, (sp.w - ruin.w) >> 1, sp.h - ruin.h, 1);
        if (a < 0.55) dust(g, -2, sp.h - 1, sp.w + 4, t);
      }
      smoke(g, sp.w >> 1, 2, t + f.at * 37, a < 0.45 ? 8 : 4, sp.w - 2, Math.min(1, (1 - a) / 0.3));
    });
  }
}

function drawSea(g, env, f, a, t) {
  const R = env.world.regions, fade = Math.min(1, (f.dur - t) / 300);
  g.globalAlpha = Math.max(0, fade);
  const ships = f.fleets.map(function (fl) { return shipsOf(env, fl, t); });
  f.fleets.forEach(function (fl, j) {
    ships[j].forEach(function (sh) {
      const sinking = f.kind === "battle" && j === f.loser && sh.k === 0 ? Math.max(0, (t - 3000) / 1400) * 9 : 0;
      if (sinking > 0 && t < 4600) frameAt(g, env, sh.x, sh.y, function () { flames(g, -2, -4 + Math.round(sinking), 5, t); });
      drawShip(g, env, fl, sh, t, sinking);
      if (sinking >= 9 && t < 5600) frameAt(g, env, sh.x, sh.y, function () {
        const r = ((t - 4400) % 900) / 900;
        px(g, Math.round(-4 - r * 5), 1, FOAM); px(g, Math.round(4 + r * 5), 1, FOAM);
        for (let d = 0; d < 4; d++) px(g, -4 + Math.round(hash(d, 8) * 8 + (t - 4400) / 500), d % 2, "#7a4a22");
      });
    });
  });
  if (f.kind === "battle" && t > 2000 && t < 3900) {         /* the exchange of shot */
    const all = ships[0].concat(ships[1]), v = Math.floor(t / 260), pa = (t % 260) / 260;
    const src = all[v % all.length], dst = (v % 2 ? ships[0] : ships[1])[v % (v % 2 ? ships[0].length : ships[1].length)];
    if (src && dst && src !== dst) {
      g.fillStyle = "rgba(235,230,220,.8)"; g.fillRect(Math.round(src.x), Math.round(src.y - 4 * env.u), 2 * env.u, 2 * env.u);
      g.fillStyle = INK; g.fillRect(Math.round(lerp(src.x, dst.x, pa)), Math.round(lerp(src.y, dst.y, pa) - (3 + Math.sin(pa * Math.PI) * 4) * env.u), env.u, env.u);
    }
    const m = ships[0][0];
    frameAt(g, env, m.x, m.y - 6 * env.u, function () { smoke(g, 0, 0, t, 8, 16, 1); });
  }
  if ((f.kind === "invade" || f.kind === "colony") && t > f.sail && t < f.sail + 900) {
    /* the men step off the bow onto the beach */
    const sh = ships[0][0], r = R[f.at], tx = env.sx(r.x + 0.5), ty = env.sy(r.y + 0.5), q = ease((t - f.sail) / 900);
    const x = lerp(sh.x, tx, q), y = lerp(sh.y, ty, q);
    frameAt(g, env, x, y, function () {
      const look = f.fleets[0].look && f.fleets[0].look.band, over = { f: f.fleets[0].color || "#888" };
      soldier(g, env, look, -2, 0, over);
      if (f.kind === "invade") soldier(g, env, look, -7, 1, over);
    });
  }
  if (f.kind === "invade") {
    const L = f.fleets[0].path, E = L[L.length - 1], S0 = L[Math.max(0, L.length - 7)], col = f.fleets[0].color || "#888", look = f.fleets[0].look && f.fleets[0].look.band;
    const ex = env.X0 + (((E[0] % env.c.VW) + env.c.VW) % env.c.VW) * env.P, ey = env.Y0 + E[1] * env.P;
    /* the camp on the beachhead, from the first landing to the end */
    if (t > f.sail + 400) frameAt(g, env, ex, ey, function () { env.blit(g, CAMP, -5, -6, 1, { f: col }); twinkle(g, -4, -8, (t - f.sail - 400) / 700); });
    /* the second wave steps off, then the band marches inland */
    if (t > f.landed2 && t < f.inland) {
      const sh = shipsOf(env, f.fleets[1], t)[0];
      frameAt(g, env, lerp(sh.x, ex, ease((t - f.landed2) / 200)), lerp(sh.y, ey, ease((t - f.landed2) / 200)), function () { soldier(g, env, look, -2, 0, { f: col }); });
    }
    if (t >= f.inland && t < f.inland + INLAND) {
      let dx = E[0] - S0[0], dy = E[1] - S0[1];
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      const q = ease((t - f.inland) / INLAND), d = (4 + 20 * q) * env.u;
      band(g, env, ex + dx * d, ey + dy * d, 3, col, dx >= 0 ? 1 : -1, t, true, true, look);
    }
  }
  if (f.kind === "colony" && t > f.sail + 600) {
    const r = R[f.at];
    frameAt(g, env, env.sx(r.x + 0.5), env.sy(r.y + 0.5), function () {
      env.blit(g, FLAG, 0, -5 - Math.round(3 * ease((t - f.sail - 600) / 400)), 1, { f: f.fleets[0].color || "#888" });
      twinkle(g, 1, -9, (t - f.sail - 900) / 800);
    });
  }
  if (f.kind === "raid" && t > 2400 && t < 4600) {           /* the raided coast burns */
    const r = R[f.at];
    frameAt(g, env, env.sx(r.x + 0.5), env.sy(r.y + 0.5), function () { flames(g, -3, 0, 6, t); smoke(g, 0, -2, t, 6, 6, 1); });
  }
  g.globalAlpha = 1;
}

/* env (from pixelmap.js): world (the shown view), c (terrain cache), P, X0, Y0, u, pc, sx, sy,
   mode, sprites, blit */
function draw(g, env, layer) {
  const t = now();
  prune(t);
  env.now = t;
  for (const f of live) {
    if (t < f.start) continue;                               /* waiting for its ships */
    const a = Math.max(0, Math.min(1, (t - f.start) / f.dur));
    if (layer === "under") drawUnder(g, env, f, a); else drawOver(g, env, f, a);
  }
}

AEON.mapfx = { collect: collect, moment: moment, clear: clear, advance: advance, holding: holding, focusPoint: focusPoint, setPace: setPace, follow: follow, live: isLive, hides: hides, burning: burning, ruinSprite: function (tier) { return RUINS[Math.max(1, Math.min(3, tier))]; }, laurels: function (age) { return LAURELS[Math.max(0, Math.min(4, age))]; }, asTown: asTown, contested: contested, draw: draw, _live: function () { return live; } };

})();
