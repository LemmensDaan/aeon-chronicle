/* Aeon - map animations (the picks from samples/animations.html).

   While history plays, the changes playback passes are shown as short animations on the map:
   land changing hands flickers between the old and new colours before it settles (with a
   scuffle where it was taken by force), new land flashes in, a breakaway realm's capital is
   crowned, the crown arcs over when a capital moves, laurels with the age's numeral pop up over
   a capital (I when a realm is founded), wonders rise out of the ground and fall into their
   dust, and razed settlements burn down to a smoking ruin. Setting the year by scrubbing or by
   a link plays that tick's changes once.

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
const RUINS = [null,
  sprite(["..k....", ".kb.k..", "kbbkbk.", "kkkkkkk"], PAL),
  sprite(["......k....", ".....kg....", "..k..kg..k.", ".kbk.kgk.kb", "kbbkkkgkkbk", "kkkkkkkkkkk"], PAL),
  sprite(["k........k.", "kg.k.....kg", "kgkgk..k.kg", "kggg.k.kgkg", "kg.gg.kgg.g", "kkkkkkkkkkk"], PAL)];
const RUBBLE = sprite(["....k......", "..kwk.k.kk.", ".kwgwkwkwgk", "kwgwwgwwgwk", "kkkkkkkkkkk"], PAL);
/* the laurels with the age's numeral, I to V */
const NUMERAL = [["..k..", "..k..", "..k.."], [".k.k.", ".k.k.", ".k.k."], ["k.k.k", "k.k.k", "k.k.k"],
                 ["k.k.k", "k.k.k", "k..k."], [".k.k.", ".k.k.", "..k.."]];
const LAURELS = NUMERAL.map(function (N) {
  return sprite(["..GG...GG..", ".GG.....GG.", "GG." + N[0] + ".GG", "G.." + N[1] + "..G", "GG." + N[2] + ".GG", ".GG.....GG.", "..GG.r.GG..", "....rrr...."], PAL);
});

/* how long each kind plays, in milliseconds */
const DUR = { flash: 600, take: 1300, split: 1500, lost: 1100, crown: 1500, age: 2000, rise: 1900, fall: 2600, burn: 2800 };
/* at most this many animations besides flashes at once, and new ones come at about RATE a
   second (a scrub or a jump may start up to MOMENT at once) */
const MAX_LIVE = 8, RATE = 4, BURST = 5, MOMENT = 10;

let live = [], tokens = BURST, lastCollect = 0;

function now() { return performance.now(); }
function hash(a, b) { let h = Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
function lerp(a, b, p) { return a + (b - a) * p; }
function rgba(hex, a) { const n = parseInt(String(hex || "#888888").slice(1), 16); return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }

/* ------------------------------------------------------------ reading the logs */
/* the first index in a year-sorted list whose year is after y */
function after(list, y, yearOf) {
  let lo = 0, hi = list.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (yearOf(list[m]) > y) hi = m; else lo = m + 1; }
  return lo;
}
const Y0 = function (e) { return e[0]; }, YK = function (e) { return e.year; };

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
    const flash = { kind: "flash", cells: g.cells, color: tp && tp.color };
    if (g.to == null) out.push({ prio: 1 + Math.log2(1 + n), fx: { kind: "lost", cells: g.cells, color: fp && fp.color }, alt: null });
    else if (g.from == null) out.push({ prio: 0, fx: flash });
    else if (born(tp)) out.push({ prio: 4 + Math.log2(1 + n), fx: { kind: "split", cells: g.cells, color: fp && fp.color, capital: AEON.capitalAt(tp, y1) }, alt: flash });
    else out.push({ prio: 2 + Math.log2(1 + n), fx: { kind: "take", cells: g.cells, color: fp && fp.color, at: g.cells[0] }, alt: flash });
  }
  for (const id in P) {
    const p = P[id];
    if (p.founded > y1) continue;
    /* capitals moving (the first entry is the founding) */
    const cl = p.capitalLog || [];
    for (let k = Math.max(1, after(cl, y0, YK)); k < cl.length && cl[k].year <= y1; k++)
      out.push({ prio: 5, fx: { kind: "crown", from: cl[k - 1].capital, to: cl[k].capital } });
    /* ages: the one a realm is founded in, and each it reaches */
    const al = p.ageLog || [];
    if (!w.pack.ages || !al.length) continue;
    for (let k = after(al, y0, YK); k < al.length && al[k].year <= y1; k++) {
      if (al[k].inherited && !born(p)) continue;
      out.push({ prio: al[k].inherited ? 3 : 4.5, fx: { kind: "age", pid: id, age: al[k].age, year: al[k].year } });
    }
  }
  /* wonders raised and lost */
  if (AEON.wonders) for (const a of AEON.wonders(w)) {
    if (a.location == null) continue;
    if (a.created > y0 && a.created <= y1) out.push({ prio: 4.5, fx: { kind: "rise", id: a.id, at: a.location } });
    if (a.destroyed != null && a.destroyed > y0 && a.destroyed <= y1) out.push({ prio: 4, fx: { kind: "fall", id: a.id, at: a.location } });
  }
  /* settlements razed: the size they had before */
  const sl = w.settleLog || [];
  for (let k = after(sl, y0, Y0); k < sl.length && sl[k][0] <= y1; k++) {
    if (sl[k][2] !== 0) continue;
    const before = AEON.tierAt(w, sl[k][1], sl[k][0] - 1);
    if (before > 0) out.push({ prio: 2 + before * 0.5, fx: { kind: "burn", at: sl[k][1], tier: Math.min(3, before) } });
  }
  return out;
}

function start(c, t) { c.fx.start = t; c.fx.dur = DUR[c.fx.kind]; live.push(c.fx); }
function majors() { let n = 0; for (const f of live) if (f.kind !== "flash") n++; return n; }

/* the changes playback has just passed: the most important animated, within the budget */
function collect(w, y0, y1) {
  const t = now();
  tokens = Math.min(BURST, tokens + (lastCollect ? (t - lastCollect) / 1000 * RATE : BURST));
  lastCollect = t;
  place(changes(w, y0, y1), t, false);
}
/* one moment, played once: after a scrub or a jump */
function moment(w, y) {
  live = [];
  place(changes(w, y - w.timeStep, y), now(), true);
}
function place(list, t, isMoment) {
  list.sort(function (a, b) { return b.prio - a.prio; });
  let room = isMoment ? MOMENT : Math.min(Math.floor(tokens), MAX_LIVE - majors());
  for (const c of list) {
    if (c.fx.kind === "flash") { start(c, t); continue; }
    if (room > 0) { start(c, t); room--; if (!isMoment) tokens--; }
    else if (c.alt) start({ fx: c.alt }, t);
  }
}
function clear() { live = []; }
function prune(t) { live = live.filter(function (f) { return t < f.start + f.dur; }); }
function isLive() { prune(now()); return live.length > 0; }
/* a wonder that is rising is drawn here, not by the map */
function hides(id) { for (const f of live) if (f.kind === "rise" && f.id === id) return true; return false; }

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
/* contested land: blocks flicker between the old colour and the new (Daan's pick from the
   split), then a flash of light as it settles */
function contested(g, env, f, a, flickerUntil) {
  const t = env.now - f.start;
  if (a < flickerUntil) {
    if (f.color) paint(g, env, f.cells, rgba(f.color, 0.62), Math.floor(t / 140) & 1);
  } else {
    const b = (a - flickerUntil) / (1 - flickerUntil);
    paint(g, env, f.cells, "rgba(" + LIGHT + "," + (0.42 * (1 - b)).toFixed(3) + ")", null);
  }
}

function drawUnder(g, env, f, a) {
  if (env.mode !== "political") return;
  if (f.kind === "flash") paint(g, env, f.cells, "rgba(" + LIGHT + "," + (0.45 * (1 - a)).toFixed(3) + ")", null);
  else if (f.kind === "take") contested(g, env, f, a, 0.55);
  else if (f.kind === "split") contested(g, env, f, a, 0.5);
  else if (f.kind === "lost" && f.color) paint(g, env, f.cells, rgba(f.color, (0.62 * (1 - a)).toFixed(3)), Math.floor((env.now - f.start) / 140) & 1);
}

/* the sprite-pixel frame around a point on the screen: (0, 0) there, one unit per sprite pixel */
function frameAt(g, env, x, y, draw) {
  g.save(); g.translate(Math.round(x), Math.round(y)); g.scale(env.u, env.u); draw(); g.restore();
}
function drawOver(g, env, f, a) {
  const R = env.world.regions, t = env.now - f.start, S = env.sprites, blit = env.blit;
  const centre = function (rid) { const r = R[rid]; return [env.sx(r.x + 0.5), env.sy(r.y + 0.5)]; };
  if (f.kind === "take" && a < 0.6) {
    const p = centre(f.at);
    frameAt(g, env, p[0], p[1], function () { brawl(g, t, 6); });
  } else if (f.kind === "split" && f.capital != null) {
    /* the crown comes down on the new realm's seat */
    const p = centre(f.capital), top = -Math.ceil(S.PALACE.h / 2) - CROWN.h;
    frameAt(g, env, p[0], p[1], function () {
      if (a > 0.35 && a < 0.75) blit(g, CROWN, -2, Math.round(lerp(top - 14, top, ease((a - 0.35) / 0.4))), 1);
      twinkle(g, 0, top, (a - 0.75) / 0.25);
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
    const r = R[f.at], W = S.WONDER, x = env.sx(r.x + 0.5) + 5.5 * env.u, y = env.sy(r.y + 0.5) + 3 * env.u;
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
        g.globalAlpha = Math.min(1, (1 - a) / 0.3);
        blit(g, ruin, (sp.w - ruin.w) >> 1, sp.h - ruin.h, 1);
        g.globalAlpha = 1;
        if (a < 0.55) dust(g, -2, sp.h - 1, sp.w + 4, t);
      }
      smoke(g, sp.w >> 1, 2, t + f.at * 37, a < 0.45 ? 8 : 4, sp.w - 2, Math.min(1, (1 - a) / 0.3));
    });
  }
}

/* env (from pixelmap.js): world (the shown view), c (terrain cache), P, X0, Y0, u, pc, sx, sy,
   mode, sprites, blit */
function draw(g, env, layer) {
  const t = now();
  prune(t);
  env.now = t;
  for (const f of live) {
    const a = Math.max(0, Math.min(1, (t - f.start) / f.dur));
    if (layer === "under") drawUnder(g, env, f, a); else drawOver(g, env, f, a);
  }
}

AEON.mapfx = { collect: collect, moment: moment, clear: clear, live: isLive, hides: hides, draw: draw };

})();
