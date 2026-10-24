/* Aeon - the statistics sheet: how the world's people and land were shared out over time.

   A parchment sheet laid over the map. One 100%-stacked chart per measure (population,
   territory, cities, wonders, armies, fleets, wealth): the eight greatest realms of the record as named bands, every other realm
   folded into one "Other realms" band at the bottom. Great battles are marked on the band
   of the realm that fought them. The chart follows the map's year (a red line) and setting
   the year is a click on the chart.

   Realms keep their map colours, so the chart reads against the map. Those colours were
   not chosen to sit side by side, so the bands are stacked in the order that keeps
   neighbours furthest apart (OKLab, normal vision and the three colour-blindnesses), with a
   2px parchment gap between them, and any neighbour that is still too close is hatched.
   Identity never rests on colour alone: legend, direct labels, the hover readout and a
   table view all name the realms.

   Drawn in pixel columns, two CSS pixels wide, to match the pixel map.

   API: AEON.stats.open(host, world, hooks) / close() / isOpen() / setYear(y)
   hooks: onShowPolity(id), onShowEvent(id), onSetYear(y), getYear() */
(function () {
"use strict";

const AEON = window.AEON = window.AEON || {};

const TOP = 8;
const INK = "#2a1a0e", SOFT = "#6b4a2a", PAPER = "#e9d6ad", RIBBON = "#8e1d1d";
const OTHER = "#b9a27c";                       /* neutral: the folded tail */
const COL = 2;                                 /* CSS pixels per chart column */
const GAP = 2;                                 /* CSS pixels of parchment between bands */
const MEASURES = [
  { id: "pop", tab: "Population", title: "Share of the world's people", unit: "people", key: "pop" },
  { id: "size", tab: "Territory", title: "Share of the world's land", unit: "provinces", key: "size" },
  { id: "cities", tab: "Cities", title: "Share of the world's cities", unit: "cities", one: "city", key: "cities" },
  { id: "wonders", tab: "Wonders", title: "Share of the world's wonders", unit: "wonders", one: "wonder", key: "wonders" },
  { id: "army", tab: "Armies", title: "Share of the world's soldiers", unit: "soldiers", one: "soldier", key: "army" },
  { id: "navy", tab: "Fleets", title: "Share of the world's ships", unit: "ships", one: "ship", key: "navy" },
  { id: "income", tab: "Wealth", title: "Share of the world's income", unit: "a year", key: "income" },
];
function units(m, n) {
  if (m.id === "income" && S && AEON.currency) return fmt(n) + " " + AEON.currency(S.world).many + "/yr";
  return fmt(n) + " " + (Math.round(n) === 1 && m.one ? m.one : m.unit);
}

/* ------------------------------------------------------------ colour distance */
/* sRGB hex -> OKLab, and colour-blindness simulation (Machado et al. 2009, severity 1) */
function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function rgbLin(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}
function oklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
const CVD = [
  [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],   // protan
  [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],    // deutan
  [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],   // tritan
];
function views(hex) {
  const c = rgbLin(hex), out = [oklab(c[0], c[1], c[2])];
  for (const M of CVD) {
    const v = M.map(function (row) { return Math.max(0, Math.min(1, row[0] * c[0] + row[1] * c[1] + row[2] * c[2])); });
    out.push(oklab(v[0], v[1], v[2]));
  }
  return out;
}
function dE(a, b) { return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
/* how well two neighbouring fills separate, as a fraction of the targets: normal vision
   >= 15, every colour-blindness >= 8. Under 1 means the pair needs a texture. */
function separation(a, b) {
  const va = views(a), vb = views(b);
  let s = dE(va[0], vb[0]) / 15;
  for (let k = 1; k < 4; k++) s = Math.min(s, dE(va[k], vb[k]) / 8);
  return s;
}

/* the stacking order (top to bottom, "Other" always last) that maximises the worst
   neighbouring separation; ties keep the ranking order. At most 8! = 40320 orders. */
function bestOrder(colors) {
  const n = colors.length, S = [];
  for (let i = 0; i <= n; i++) {
    S.push([]);
    for (let j = 0; j <= n; j++) S[i].push(i === j ? 0 : separation(i < n ? colors[i] : OTHER, j < n ? colors[j] : OTHER));
  }
  let best = null, bestScore = -1;
  const perm = [], used = new Array(n).fill(false);
  (function walk(worst) {
    if (worst <= bestScore) return;                /* can't beat what we have */
    if (perm.length === n) {
      const w = Math.min(worst, n ? S[perm[n - 1]][n] : Infinity);
      if (w > bestScore) { bestScore = w; best = perm.slice(); }
      return;
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const w = perm.length ? Math.min(worst, S[perm[perm.length - 1]][i]) : worst;
      used[i] = true; perm.push(i);
      walk(w);
      perm.pop(); used[i] = false;
    }
  })(Infinity);
  /* hatched: a band still too close to the one below it, and the second realm of any colour
     the engine handed out twice (its palette cycles), even when they are not neighbours */
  const hatch = new Array(n).fill(false);
  const ord = best || [];
  for (let k = 0; k < ord.length; k++) {
    const below = k + 1 < ord.length ? ord[k + 1] : n;
    if (S[ord[k]][below] < 1) hatch[ord[k]] = true;
    for (let j = 0; j < k; j++) if (colors[ord[j]].toLowerCase() === colors[ord[k]].toLowerCase()) hatch[ord[k]] = true;
  }
  return { order: ord, hatch: hatch };
}

/* ------------------------------------------------------------ data */
function buildData(world) {
  const step = world.timeStep, pols = Object.keys(world.polities).map(function (id) { return world.polities[id]; });
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pols) for (const s of p.sizeHistory) { if (s.year < y0) y0 = s.year; if (s.year > y1) y1 = s.year; }
  if (!isFinite(y0)) return null;
  const T = Math.round((y1 - y0) / step) + 1;
  const series = {};
  for (const m of MEASURES) series[m.id] = { total: new Float64Array(T) };
  const per = {}, cities = cityCounts(world, y0, step, T), wonders = wonderReplay(world, y0, step, T);
  for (const p of pols) {
    const v = { pop: new Float64Array(T), size: new Float64Array(T), cities: cities[p.id] || new Float64Array(T),
                wonders: wonders.counts[p.id] || new Float64Array(T), army: new Float64Array(T), navy: new Float64Array(T), income: new Float64Array(T) };
    for (let t = 0; t < T; t++) { series.cities.total[t] += v.cities[t]; series.wonders.total[t] += v.wonders[t]; }
    let popYears = 0;
    for (const s of p.sizeHistory) {
      const t = Math.round((s.year - y0) / step);
      v.pop[t] = s.pop; v.size[t] = s.size; v.army[t] = s.army || 0; v.navy[t] = s.navy || 0; v.income[t] = s.income || 0;
      series.pop.total[t] += s.pop; series.size.total[t] += s.size;
      series.army.total[t] += v.army[t]; series.navy.total[t] += v.navy[t]; series.income.total[t] += v.income[t];
      popYears += s.pop;
    }
    per[p.id] = { p: p, v: v, weight: popYears };
  }
  /* the eight greatest realms: most people-years across the whole record */
  const ranked = pols.filter(function (p) { return p.sizeHistory.length; })
    .sort(function (a, b) { return per[b.id].weight - per[a.id].weight || (a.id < b.id ? -1 : 1); });
  const top = ranked.slice(0, TOP);
  const ord = bestOrder(top.map(function (p) { return p.color; }));
  const bands = ord.order.map(function (i) { return { p: top[i], v: per[top[i].id].v, hatch: ord.hatch[i] }; });
  const topIds = {};
  bands.forEach(function (b) { topIds[b.p.id] = true; });
  return { y0: y0, step: step, T: T, series: series, per: per, bands: bands, topIds: topIds, rest: ranked.length - bands.length,
           battles: pickBattles(world), wonderMarks: wonders.marks };
}
/* cities (tier 3 and up) each realm held at every tick, replaying who owned which region
   (world.ownerLog) alongside how big each settlement was (world.settleLog) */
function cityCounts(world, y0, step, T) {
  const N = world.regions.length, owner = new Array(N).fill(null), tier = new Int8Array(N);
  const OL = world.ownerLog || [], SL = world.settleLog || [], cur = {}, out = {};
  let a = 0, b = 0;
  const bump = function (pid, d) { if (pid != null) cur[pid] = (cur[pid] || 0) + d; };
  for (let t = 0; t < T; t++) {
    const y = y0 + t * step;
    while (a < OL.length && OL[a][0] <= y) {
      const r = OL[a][1], o = OL[a][2]; a++;
      if (tier[r] >= 3 && owner[r] !== o) { bump(owner[r], -1); bump(o, 1); }
      owner[r] = o;
    }
    while (b < SL.length && SL[b][0] <= y) {
      const r = SL[b][1], ti = SL[b][2]; b++;
      const was = tier[r] >= 3, is = ti >= 3;
      if (was !== is) bump(owner[r], is ? 1 : -1);
      tier[r] = ti;
    }
    for (const pid in cur) if (cur[pid] > 0) (out[pid] || (out[pid] = new Float64Array(T)))[t] = cur[pid];
  }
  return out;
}
/* wonders standing in each realm's land at every tick (they never move, but their land changes
   hands), and every raising and loss with the realm that held the place at the time */
function wonderReplay(world, y0, step, T) {
  const N = world.regions.length, owner = new Array(N).fill(null), here = new Int16Array(N);
  const OL = world.ownerLog || [], evs = [], cur = {}, counts = {}, marks = [];
  for (const a of (AEON.wonders ? AEON.wonders(world) : [])) {
    if (a.location == null) continue;
    evs.push([a.created, a.location, 1, a]);
    if (a.destroyed != null) evs.push([a.destroyed, a.location, -1, a]);
  }
  evs.sort(function (x, y) { return x[0] - y[0] || y[2] - x[2]; });
  const bump = function (pid, d) { if (pid != null) cur[pid] = (cur[pid] || 0) + d; };
  let i = 0, j = 0;
  for (let t = 0; t < T; t++) {
    const y = y0 + t * step;
    while (i < OL.length && OL[i][0] <= y) {
      const r = OL[i][1], o = OL[i][2]; i++;
      if (here[r] && owner[r] !== o) { bump(owner[r], -here[r]); bump(o, here[r]); }
      owner[r] = o;
    }
    while (j < evs.length && evs[j][0] <= y) {
      const e = evs[j++];
      here[e[1]] += e[2]; bump(owner[e[1]], e[2]);
      marks.push({ kind: e[2] > 0 ? "built" : "lost", a: e[3], year: e[0], owner: owner[e[1]] });
    }
    for (const pid in cur) if (cur[pid] > 0) (counts[pid] || (counts[pid] = new Float64Array(T)))[t] = cur[pid];
  }
  return { counts: counts, marks: marks };
}
/* great battles: every world-defining one, then the major ones while there is room */
function pickBattles(world) {
  const WAR = /^(war|battle|siege|sack|sacked|capital-sacked|conquest|invasion|civil-war|holy-war|religious-war|mage-war|total-war|world-war|succession-war|cabinet-war)$/;
  return world.chronicle.filter(function (e) {
    return (e.importance || 1) >= 4 && (e.tags || []).some(function (t) { return WAR.test(t); });
  }).sort(function (a, b) { return (b.importance || 1) - (a.importance || 1) || a.year - b.year; });
}

/* ------------------------------------------------------------ sprites */
/* crossed swords, 9x9: steel blades, brown hilts; outlined in ink when drawn */
const SWORDS = [
  "s.......s",
  "ss.....ss",
  ".ss...ss.",
  "..ss.ss..",
  "...sss...",
  "..ss.ss..",
  ".hh...hh.",
  "hh.....hh",
  "h.......h",
];
const SWORD_PAL = { s: "#e6e9ec", h: "#7a4a22" };
function drawSwords(ctx, x, y, u) {
  const paint = function (dx, dy, col) {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const ch = SWORDS[r][c];
      if (ch === ".") continue;
      ctx.fillStyle = col || SWORD_PAL[ch];
      ctx.fillRect(x + (c + dx) * u, y + (r + dy) * u, u, u);
    }
  };
  ctx.globalAlpha = 0.45; paint(1, 1, "#000"); ctx.globalAlpha = 1;
  for (const d of [[-1, 0], [1, 0], [0, -1], [0, 1]]) paint(d[0], d[1], INK);
  paint(0, 0, null);
}
/* a realm entering a new age: the map's laurels with the age's numeral (mapfx.js), on a small
   gold-edged parchment plaque like the map's bubble, LAUREL_W x LAUREL_H; age counts from 0 */
const LAUREL_W = 15, LAUREL_H = 12;
function drawLaurels(ctx, x, y, u, age) {
  ctx.globalAlpha = 0.45; ctx.fillStyle = "#000"; ctx.fillRect(x + u, y + u, LAUREL_W * u, LAUREL_H * u);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#e0b84f"; ctx.fillRect(x, y, LAUREL_W * u, LAUREL_H * u);
  ctx.fillStyle = "#efe2bf"; ctx.fillRect(x + u, y + u, (LAUREL_W - 2) * u, (LAUREL_H - 2) * u);
  const sp = AEON.mapfx && AEON.mapfx.laurels && AEON.mapfx.laurels(age);
  if (sp && AEON.render && AEON.render.blit) AEON.render.blit(ctx, sp, x + ((LAUREL_W - sp.w) >> 1) * u, y + ((LAUREL_H - sp.h) >> 1) * u, u, null);
}
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
/* a wonder raised (a gilded obelisk) and a wonder lost (its broken stump) */
const OBELISK = ["...k...", "..kyk..", "..kwk..", "..kwk..", ".kwwwk.", ".kwwwk.", "kkkkkkk"];
const STUMP = [".......", ".......", "..k....", "..kgk.k", "..kgkgk", ".kgggkg", "kkkkkkk"];
const MONU_PAL = { k: INK, y: "#e0b84f", w: "#efe6d6", g: "#9a948a" };
function drawMonument(ctx, rows, x, y, u) {
  ctx.globalAlpha = 0.45; ctx.fillStyle = "#000";
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) if (rows[r][c] !== ".") ctx.fillRect(x + (c + 1) * u, y + (r + 1) * u, u, u);
  ctx.globalAlpha = 1;
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
    const ch = rows[r][c];
    if (ch === ".") continue;
    ctx.fillStyle = MONU_PAL[ch]; ctx.fillRect(x + c * u, y + r * u, u, u);
  }
}
let hatchPattern = null;
function hatchFor(ctx, dpr) {
  if (hatchPattern && hatchPattern.dpr === dpr) return hatchPattern.p;
  const s = Math.max(4, Math.round(6 * dpr)), c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d"), w = Math.max(1, Math.round(dpr));
  g.fillStyle = "rgba(42, 26, 14, .38)";
  for (let i = 0; i < s; i++) g.fillRect(i, s - 1 - i, w, w);      /* one pixel diagonal, 45 degrees */
  hatchPattern = { dpr: dpr, p: ctx.createPattern(c, "repeat") };
  return hatchPattern.p;
}

/* ------------------------------------------------------------ the sheet */
let S = null;

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = String(text);
  return e;
}
function fmt(n) {
  n = Math.round(n);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
  if (n >= 1e4) return Math.round(n / 1e3) + "k";
  return n.toLocaleString();
}
function pct(v) { return v >= 0.995 ? "100%" : v < 0.005 ? (v > 0 ? "<1%" : "0%") : Math.round(v * 100) + "%"; }

function open(host, world, hooks) {
  close();
  const data = buildData(world);
  const el = h("div", "st-sheet");
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Statistics");
  S = { host: host, world: world, hooks: hooks || {}, data: data, el: el, measure: MEASURES[0], table: false,
        hoverT: null, hoverBand: null, hoverMarker: null, markers: [], geo: null };
  host.appendChild(el);
  build();
  return S;
}
function close() {
  if (!S) return;
  if (S.ro) S.ro.disconnect();
  if (S.tip && S.tip.parentNode) S.tip.parentNode.removeChild(S.tip);
  if (S.el.parentNode) S.el.parentNode.removeChild(S.el);
  S = null;
}
function isOpen() { return !!S; }
function setYear() { if (S && !S.table) draw(); }

function build() {
  const el = S.el, w = S.world, pack = w.pack;
  el.textContent = "";
  const head = h("div", "st-head");
  const title = h("div", "st-title");
  title.appendChild(AEON.pixelLabel ? AEON.pixelLabel("Statistics", "#8a3a22", 3) : h("span", null, "Statistics"));
  head.appendChild(title);
  const tabs = h("div", "st-tabs");
  MEASURES.forEach(function (m) {
    const b = h("button", "st-tab" + (m === S.measure ? " on" : ""), m.tab);
    b.type = "button";
    b.addEventListener("click", function () { S.measure = m; build(); });
    tabs.appendChild(b);
  });
  head.appendChild(tabs);
  const back = h("button", "ae-btn st-close", "Back to the map");
  back.type = "button";
  back.addEventListener("click", function () { if (S.hooks.onClose) S.hooks.onClose(); else close(); });
  head.appendChild(back);
  el.appendChild(head);

  if (!S.data) { el.appendChild(h("p", "st-empty", "No realm has risen yet, so there is nothing to count.")); return; }

  const sub = h("div", "st-sub");
  sub.appendChild(h("span", "st-subtitle", S.measure.title));
  sub.appendChild(h("span", "st-span", pack.yearLabel(S.data.y0) + " – " + pack.yearLabel(S.data.y0 + (S.data.T - 1) * S.data.step)));
  const tb = h("button", "st-toggle", S.table ? "Show as chart" : "Show as table");
  tb.type = "button";
  tb.addEventListener("click", function () { S.table = !S.table; build(); });
  sub.appendChild(tb);
  el.appendChild(sub);

  if (S.table) { el.appendChild(table()); return; }

  const body = h("div", "st-body");
  body.appendChild(legend());
  const plot = h("div", "st-plot"), cv = h("canvas", "st-canvas");
  cv.setAttribute("role", "img");
  cv.setAttribute("aria-label", S.measure.title + ", stacked by realm over time. The same numbers are in the table view.");
  plot.appendChild(cv);
  const axis = h("div", "st-axis");
  plot.appendChild(axis);
  body.appendChild(plot);
  el.appendChild(body);

  const keys = h("div", "st-keys");
  const k1 = h("span", "st-key"), sw = h("canvas");
  sw.width = sw.height = 22; sw.style.width = sw.style.height = "22px";
  drawSwords(sw.getContext("2d"), 1, 1, 2);
  k1.appendChild(sw); k1.appendChild(h("span", null, "Great battle"));
  const k2 = h("span", "st-key"); k2.appendChild(h("i", "st-yearkey")); k2.appendChild(h("span", null, "Year shown on the map (click the chart to change it)"));
  const k3 = h("span", "st-key"); k3.appendChild(h("i", "st-swatch st-hatch")); k3.appendChild(h("span", null, "Hatched: a colour close to its neighbour"));
  const ages = w.pack.ages;
  if (ages) {
    const k4 = h("span", "st-key"), pc = h("canvas");
    pc.width = 2 * LAUREL_W + 4; pc.height = 2 * LAUREL_H + 4; pc.style.width = pc.width + "px"; pc.style.height = pc.height + "px";
    drawLaurels(pc.getContext("2d"), 1, 1, 2, 1);
    k4.appendChild(pc);
    k4.appendChild(h("span", null, "New age: " + ages.map(function (a, i) { return (ROMAN[i] || i + 1) + " " + (a.short || a.name); }).join(" · ")));
    keys.appendChild(k4);
  }
  if (S.data.wonderMarks.length) {
    [["Wonder raised", OBELISK], ["Wonder lost", STUMP]].forEach(function (k) {
      const kk = h("span", "st-key"), cv2 = h("canvas");
      cv2.width = 18; cv2.height = 18; cv2.style.width = cv2.style.height = "18px";
      drawMonument(cv2.getContext("2d"), k[1], 1, 1, 2);
      kk.appendChild(cv2); kk.appendChild(h("span", null, k[0]));
      keys.appendChild(kk);
    });
  }
  keys.appendChild(k1); keys.appendChild(k2);
  if (S.data.bands.some(function (b) { return b.hatch; })) keys.appendChild(k3);
  el.appendChild(keys);

  S.cv = cv; S.axis = axis; S.plot = plot;
  if (!S.tip) { S.tip = h("div", "ae-tip st-tip"); document.body.appendChild(S.tip); }
  S.tip.style.display = "none";
  wire(cv);
  if (S.ro) S.ro.disconnect();
  if (window.ResizeObserver) { S.ro = new ResizeObserver(function () { draw(); }); S.ro.observe(plot); }
  draw();
}

function swatch(color, hatch) {
  const s = h("i", "st-swatch" + (hatch ? " st-hatch" : ""));
  s.style.backgroundColor = color;
  return s;
}
function legend() {
  const box = h("ol", "st-legend"), pack = S.world.pack;
  S.legendRows = [];
  S.data.bands.forEach(function (b, i) {
    const li = h("li", "st-row"), p = b.p;
    li.appendChild(swatch(p.color, b.hatch));
    const txt = h("span", "st-rowtext");
    txt.appendChild(h("span", "st-name", p.name.replace(/^The /, "")));
    txt.appendChild(h("span", "st-life", pack.yearLabel(p.founded) + " – " + (p.ended != null ? pack.yearLabel(p.ended) : "present")));
    li.appendChild(txt);
    li.tabIndex = 0;
    li.title = "Open " + p.name + " in the chronicle";
    li.addEventListener("mouseenter", function () { S.hoverBand = i; draw(); });
    li.addEventListener("mouseleave", function () { S.hoverBand = null; draw(); });
    li.addEventListener("click", function () { if (S.hooks.onShowPolity) S.hooks.onShowPolity(p.id); });
    li.addEventListener("keydown", function (e) { if (e.key === "Enter") li.click(); });
    box.appendChild(li);
    S.legendRows.push(li);
  });
  const li = h("li", "st-row st-other");
  li.appendChild(swatch(OTHER, false));
  const txt = h("span", "st-rowtext");
  txt.appendChild(h("span", "st-name", "Other realms"));
  txt.appendChild(h("span", "st-life", S.data.rest + " more, folded together"));
  li.appendChild(txt);
  li.addEventListener("mouseenter", function () { S.hoverBand = -1; draw(); });
  li.addEventListener("mouseleave", function () { S.hoverBand = null; draw(); });
  box.appendChild(li);
  return box;
}

/* stack the bands for one tick: [{y, h}] in CSS pixels from the plot's top, top band first */
function stackAt(t, H) {
  const d = S.data, key = S.measure.key, tot = d.series[S.measure.id].total[t] || 0;
  const out = [];
  let acc = 0, named = 0;
  for (const b of d.bands) {
    const share = tot ? b.v[key][t] / tot : 0;
    out.push({ y: acc * H, h: share * H, share: share, value: b.v[key][t] });
    acc += share; named += b.v[key][t];
  }
  const os = tot ? Math.max(0, 1 - acc) : 0;
  out.push({ y: acc * H, h: os * H, share: os, value: Math.max(0, tot - named) });
  return { rows: out, total: tot };
}

function draw() {
  if (!S || !S.cv || !S.data) return;
  const cv = S.cv, d = S.data, dpr = window.devicePixelRatio || 1;
  const W = S.plot.clientWidth, H = Math.max(120, S.plot.clientHeight - 40);
  if (!W) return;
  const cols = Math.max(2, Math.floor(W / COL)), Wc = cols * COL;
  cv.style.width = Wc + "px"; cv.style.height = H + "px";
  const pw = Math.round(Wc * dpr), ph = Math.round(H * dpr);
  if (cv.width !== pw) cv.width = pw;
  if (cv.height !== ph) cv.height = ph;
  const ctx = cv.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pw, ph);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, pw, ph);
  const tickOf = function (c) { return Math.min(d.T - 1, Math.round(c / (cols - 1) * (d.T - 1))); };
  const xOf = function (t) { return t / (d.T - 1) * (cols - 1) * COL; };
  S.geo = { cols: cols, H: H, W: Wc, tickOf: tickOf, xOf: xOf };
  const gap = Math.round(GAP * dpr), cw = Math.round(COL * dpr), hatch = hatchFor(ctx, dpr);
  const colors = d.bands.map(function (b) { return b.p.color; }).concat([OTHER]);
  const hatched = d.bands.map(function (b) { return b.hatch; }).concat([false]);
  const focus = S.hoverBand;                         /* a legend row being hovered dims the rest */

  for (let c = 0; c < cols; c++) {
    const st = stackAt(tickOf(c), H), x = Math.round(c * COL * dpr);
    st.rows.forEach(function (r, i) {
      const y0 = Math.round(r.y * dpr), y1 = Math.round((r.y + r.h) * dpr);
      const top = y0 + (i ? Math.floor(gap / 2) : 0), bot = y1 - (i < st.rows.length - 1 ? Math.ceil(gap / 2) : 0);
      if (bot <= top) return;
      const bandIdx = i < d.bands.length ? i : -1;
      ctx.globalAlpha = focus != null && focus !== bandIdx ? 0.35 : 1;
      ctx.fillStyle = colors[i];
      ctx.fillRect(x, top, cw, bot - top);
      if (hatched[i]) { ctx.fillStyle = hatch; ctx.fillRect(x, top, cw, bot - top); }
    });
  }
  ctx.globalAlpha = 1;

  directLabels(ctx, dpr, cols, H);
  markers(ctx, dpr, H);

  /* the year on the map: a red ribbon down the chart */
  const yr = S.hooks.getYear ? S.hooks.getYear() : null;
  if (yr != null) {
    const t = Math.max(0, Math.min(d.T - 1, Math.round((yr - d.y0) / d.step)));
    const x = Math.round(xOf(t) * dpr), rw = Math.max(2, Math.round(2 * dpr));
    ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(x + rw, 0, Math.round(dpr), ph);
    ctx.fillStyle = RIBBON; ctx.fillRect(x - Math.floor(rw / 2), 0, rw, ph);
  }
  /* the hover crosshair */
  if (S.hoverT != null) {
    const x = Math.round(xOf(S.hoverT) * dpr);
    ctx.fillStyle = INK; ctx.globalAlpha = 0.7; ctx.fillRect(x, 0, Math.max(1, Math.round(dpr)), ph); ctx.globalAlpha = 1;
  }
  axisLabels(cols);
}

/* realm names inside their bands, where a band is thick enough to hold one */
function directLabels(ctx, dpr, cols, H) {
  const d = S.data, fam = "\"Pixelify Sans\", Georgia, serif";
  ctx.font = Math.round(13 * dpr) + "px " + fam;
  ctx.textBaseline = "middle";
  d.bands.concat([null]).forEach(function (b, i) {
    let best = -1, bc = 0, by = 0;
    for (let c = 0; c < cols; c += 3) {
      const r = stackAt(S.geo.tickOf(c), H).rows[i];
      if (r.h > best) { best = r.h; bc = c; by = r.y + r.h / 2; }
    }
    if (best < 18) return;
    const name = b ? b.p.name.replace(/^The /, "") : "Other realms";
    const tw = ctx.measureText(name).width / dpr;
    const x = Math.max(4, Math.min(cols * COL - tw - 4, bc * COL - tw / 2));
    ctx.lineJoin = "round"; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = "rgba(243, 228, 196, .85)";
    ctx.strokeText(name, x * dpr, by * dpr);
    ctx.fillStyle = INK; ctx.fillText(name, x * dpr, by * dpr);
  });
}

/* markers on the bands of the named realms. First the ages each entered (in the band's upper
   part), then battles: only those a named realm fought, most important first, kept well
   apart and capped so they stay highlights rather than texture. */
const MAX_MARKERS = 24, MAX_WONDERS = 20, MARKER_ROOM = 22;          /* CSS pixels kept clear round each battle */
function markers(ctx, dpr, H) {
  const d = S.data, u = Math.max(1, Math.round(2 * dpr)), size = 9 * u, room = Math.round(MARKER_ROOM * dpr), boxes = [];
  const bandOf = {}, hit = function (b) { return boxes.some(function (o) { return b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]; }); };
  d.bands.forEach(function (b, i) { bandOf[b.p.id] = i; });
  S.markers = [];
  const ages = S.world.pack.ages;
  if (ages) d.bands.forEach(function (b, bi) {
    for (const e of b.p.ageLog || []) {
      if (e.inherited || e.fell) continue;
      const t = Math.round((e.year - d.y0) / d.step);
      if (t < 0 || t >= d.T) continue;
      const r = stackAt(t, H).rows[bi];
      if (!r || r.h < 4) continue;
      /* the plaque sits over its year in the band's upper part; kept inside the chart at the top edge */
      const x = Math.round(S.geo.xOf(t) * dpr - LAUREL_W * u / 2), y = Math.max(u, Math.round((r.y + r.h * 0.3) * dpr - LAUREL_H * u));
      const box = [x - u, y - u, x + (LAUREL_W + 1) * u, y + (LAUREL_H + 1) * u];
      if (hit(box)) continue;
      boxes.push(box);
      ctx.globalAlpha = S.hoverBand != null && S.hoverBand !== bi ? 0.35 : 1;
      drawLaurels(ctx, x, y, u, e.age);
      ctx.globalAlpha = 1;
      S.markers.push({ kind: "age", p: b.p, age: e.age, year: e.year, box: [box[0] / dpr, box[1] / dpr, box[2] / dpr, box[3] / dpr] });
    }
  });
  /* wonders raised and lost, in the band's lower part, at most MAX_WONDERS, spaced apart */
  let wonders = 0;
  for (const m of d.wonderMarks) {
    if (wonders >= MAX_WONDERS) break;
    const bi = m.owner != null && bandOf[m.owner] != null ? bandOf[m.owner] : -1;
    if (bi < 0) continue;
    const t = Math.round((m.year - d.y0) / d.step);
    if (t < 0 || t >= d.T) continue;
    const r = stackAt(t, H).rows[bi];
    if (!r || r.h < 4) continue;
    const x = Math.round(S.geo.xOf(t) * dpr - 3.5 * u), y = Math.min(Math.round(H * dpr) - 8 * u, Math.round((r.y + r.h * 0.72) * dpr - 3.5 * u));
    const box = [x - u, y - u, x + 8 * u, y + 8 * u], far = [box[0] - room / 2, box[1] - room / 3, box[2] + room / 2, box[3] + room / 3];
    if (boxes.some(function (o) { return far[0] < o[2] && far[2] > o[0] && far[1] < o[3] && far[3] > o[1]; })) continue;
    boxes.push(box);
    ctx.globalAlpha = S.hoverBand != null && S.hoverBand !== bi ? 0.35 : 1;
    drawMonument(ctx, m.kind === "built" ? OBELISK : STUMP, x, y, u);
    ctx.globalAlpha = 1;
    S.markers.push({ kind: "wonder", m: m, box: [box[0] / dpr, box[1] / dpr, box[2] / dpr, box[3] / dpr] });
    wonders++;
  }
  let battles = 0;
  for (const e of d.battles) {
    if (battles >= MAX_MARKERS) break;
    const t = Math.round((e.year - d.y0) / d.step);
    if (t < 0 || t >= d.T) continue;
    let bi = -1;
    for (const a of e.actors || []) if (a.kind === "polity" && bandOf[a.id] != null) { bi = bandOf[a.id]; break; }
    if (bi < 0) continue;
    const r = stackAt(t, H).rows[bi];
    if (!r || r.h < 4) continue;
    const cx = S.geo.xOf(t) * dpr, cy = (r.y + r.h / 2) * dpr;
    const x = Math.round(cx - size / 2), y = Math.round(cy - size / 2);
    const b = [x - u, y - u, x + size + u, y + size + u], far = [b[0] - room, b[1] - room / 2, b[2] + room, b[3] + room / 2];
    if (boxes.some(function (o) { return far[0] < o[2] && far[2] > o[0] && far[1] < o[3] && far[3] > o[1]; })) continue;
    boxes.push(b);
    ctx.globalAlpha = S.hoverBand != null && S.hoverBand !== (bi < d.bands.length ? bi : -1) ? 0.35 : 1;
    drawSwords(ctx, x, y, u);
    ctx.globalAlpha = 1;
    S.markers.push({ kind: "battle", e: e, box: [b[0] / dpr, b[1] / dpr, b[2] / dpr, b[3] / dpr] });
    battles++;
  }
}

function axisLabels(cols) {
  const d = S.data, ax = S.axis, pack = S.world.pack, n = Math.max(2, Math.min(9, Math.floor(cols * COL / 110)));
  ax.textContent = "";
  ax.style.width = cols * COL + "px";
  for (let k = 0; k < n; k++) {
    const t = Math.round(k / (n - 1) * (d.T - 1)), x = S.geo.xOf(t);
    const lab = h("span", "st-tick");
    lab.style.left = x + "px";
    lab.style.transform = k === 0 ? "none" : k === n - 1 ? "translateX(-100%)" : "translateX(-50%)";
    lab.appendChild(h("b", null, pack.yearLabel(d.y0 + t * d.step)));
    lab.appendChild(h("span", null, units(S.measure, d.series[S.measure.id].total[t])));
    ax.appendChild(lab);
  }
}

/* ------------------------------------------------------------ hover and click */
function wire(cv) {
  const local = function (e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const markerAt = function (p) {
    for (const m of S.markers) if (p.x >= m.box[0] && p.x <= m.box[2] && p.y >= m.box[1] && p.y <= m.box[3]) return m;
    return null;
  };
  cv.addEventListener("mousemove", function (e) {
    if (!S || !S.geo) return;
    const p = local(e), g = S.geo, c = Math.max(0, Math.min(g.cols - 1, Math.floor(p.x / COL)));
    S.hoverMarker = markerAt(p);
    S.hoverT = S.hoverMarker ? null : g.tickOf(c);
    cv.style.cursor = S.hoverMarker ? "pointer" : "crosshair";
    draw();
    tip(e, p);
  });
  cv.addEventListener("mouseleave", function () {
    if (!S) return;
    S.hoverT = null; S.hoverMarker = null;
    S.tip.style.display = "none";
    draw();
  });
  cv.addEventListener("click", function (e) {
    if (!S || !S.geo) return;
    const p = local(e), m = markerAt(p);
    if (m) {
      if (S.hooks.onSetYear) S.hooks.onSetYear(m.kind === "age" ? m.year : m.kind === "wonder" ? m.m.year : m.e.year);
      if (m.kind === "age") { if (S.hooks.onShowPolity) S.hooks.onShowPolity(m.p.id); }
      else if (m.kind === "wonder") { if (S.hooks.onShowArtifact) S.hooks.onShowArtifact(m.m.a.id); }
      else if (S.hooks.onShowEvent) S.hooks.onShowEvent(m.e.id);
      return;
    }
    const t = S.geo.tickOf(Math.max(0, Math.min(S.geo.cols - 1, Math.floor(p.x / COL))));
    if (S.hooks.onSetYear) S.hooks.onSetYear(S.data.y0 + t * S.data.step);
  });
}

/* the readout: every band at the hovered year, top to bottom, or one battle */
function tip(e, p) {
  const d = S.data, el = S.tip, pack = S.world.pack;
  el.textContent = "";
  if (S.hoverMarker && S.hoverMarker.kind === "age") {
    const m = S.hoverMarker, ages = S.world.pack.ages;
    el.appendChild(h("div", "ae-tip-name", m.p.name + " entered " + ages[m.age].name));
    el.appendChild(h("div", null, pack.yearLabel(m.year) + " · age " + (ROMAN[m.age] || m.age + 1) + " of " + (ROMAN[ages.length - 1] || ages.length)));
    el.appendChild(h("div", "dim", "Click to open the realm in the chronicle"));
  } else if (S.hoverMarker && S.hoverMarker.kind === "wonder") {
    const m = S.hoverMarker.m, owner = m.owner != null ? S.world.polities[m.owner] : null;
    el.appendChild(h("div", "ae-tip-name", (m.kind === "built" ? "Wonder raised: " : "Wonder lost: ") + m.a.name));
    el.appendChild(h("div", null, pack.yearLabel(m.year) + (owner ? " · " + owner.name : "")));
    el.appendChild(h("div", "dim", "Click to open it in the chronicle"));
  } else if (S.hoverMarker) {
    const ev = S.hoverMarker.e;
    el.appendChild(h("div", "ae-tip-name", "Great battle, " + pack.yearLabel(ev.year)));
    const t = String(ev.text || "");
    el.appendChild(h("div", null, t.length > 170 ? t.slice(0, 168).replace(/\s+\S*$/, "") + "…" : t));
    el.appendChild(h("div", "dim", "Click to read it in the chronicle"));
  } else if (S.hoverT != null) {
    const t = S.hoverT, st = stackAt(t, 1);
    el.appendChild(h("div", "ae-tip-name", pack.yearLabel(d.y0 + t * d.step)));
    el.appendChild(h("div", "dim", "World: " + units(S.measure, st.total)));
    const list = h("div", "st-tiplist");
    d.bands.forEach(function (b, i) {
      const r = st.rows[i];
      if (!r.value) return;
      const row = h("div", "st-tiprow" + (S.hoverBand === i ? " on" : ""));
      row.appendChild(swatch(b.p.color, b.hatch));
      row.appendChild(h("span", "st-tipname", b.p.name.replace(/^The /, "")));
      const ag = AEON.ageAt ? AEON.ageAt(S.world, b.p.id, d.y0 + t * d.step) : null;
      if (ag && ag.age) row.appendChild(h("span", "st-tipage", ag.age.short || ag.age.name));
      row.appendChild(h("span", "st-tipval", fmt(r.value) + " · " + pct(r.share)));
      list.appendChild(row);
    });
    const o = st.rows[d.bands.length];
    if (o.value) {
      const row = h("div", "st-tiprow");
      row.appendChild(swatch(OTHER, false));
      row.appendChild(h("span", "st-tipname", "Other realms"));
      row.appendChild(h("span", "st-tipval", fmt(o.value) + " · " + pct(o.share)));
      list.appendChild(row);
      /* the largest realms hiding in the fold */
      const key = S.measure.key, hidden = [];
      for (const id in d.per) if (!d.topIds[id] && d.per[id].v[key][t]) hidden.push(d.per[id]);
      hidden.sort(function (a, b) { return b.v[key][t] - a.v[key][t]; });
      if (hidden.length) list.appendChild(h("div", "dim st-tipfold", "largest: " + hidden.slice(0, 3).map(function (x) {
        return x.p.name.replace(/^The /, "") + " " + pct(x.v[key][t] / st.total);
      }).join(", ")));
    }
    if (!list.childNodes.length) list.appendChild(h("div", "dim", "No realm stood yet."));
    el.appendChild(list);
  } else { el.style.display = "none"; return; }
  el.style.display = "block";
  const w = el.offsetWidth, hh = el.offsetHeight;
  el.style.left = (e.clientX + 18 + w > window.innerWidth ? e.clientX - 14 - w : e.clientX + 18) + "px";
  el.style.top = Math.max(4, Math.min(e.clientY + 18, window.innerHeight - hh - 4)) + "px";
}

/* ------------------------------------------------------------ the table view */
function table() {
  const d = S.data, pack = S.world.pack, key = S.measure.key, unit = S.measure.unit;
  const wrap = h("div", "st-tablewrap"), tb = h("table", "st-table"), hr = h("tr");
  const ages = S.world.pack.ages;
  ["Realm", "Lived", "Peak " + (S.measure.id === "income" ? "income" : unit), "Peak share", "Peak year"].concat(ages ? ["Furthest age"] : []).forEach(function (c) { hr.appendChild(h("th", null, c)); });
  tb.appendChild(hr);
  d.bands.forEach(function (b) {
    let pk = 0, pt = 0, ps = 0;
    for (let t = 0; t < d.T; t++) {
      const v = b.v[key][t], tot = d.series[S.measure.id].total[t];
      if (v > pk) { pk = v; pt = t; }
      if (tot && v / tot > ps) ps = v / tot;
    }
    const tr = h("tr"), name = h("td"), btn = h("button", "st-link", b.p.name);
    btn.type = "button";
    btn.addEventListener("click", function () { if (S.hooks.onShowPolity) S.hooks.onShowPolity(b.p.id); });
    name.appendChild(swatch(b.p.color, b.hatch)); name.appendChild(btn);
    tr.appendChild(name);
    tr.appendChild(h("td", null, pack.yearLabel(b.p.founded) + " – " + (b.p.ended != null ? pack.yearLabel(b.p.ended) : "present")));
    tr.appendChild(h("td", "st-num", pk.toLocaleString()));
    tr.appendChild(h("td", "st-num", pct(ps)));
    tr.appendChild(h("td", null, pack.yearLabel(d.y0 + pt * d.step)));
    if (ages) {
      const last = b.p.ageLog && b.p.ageLog[b.p.ageLog.length - 1], a = last && ages[last.age];
      tr.appendChild(h("td", null, a ? a.name + (last.inherited ? " (from its founding)" : ", " + pack.yearLabel(last.year)) : ""));
    }
    tb.appendChild(tr);
  });
  wrap.appendChild(tb);
  wrap.appendChild(h("p", "st-note", d.rest + " other realms are folded into “Other realms” on the chart. Battles marked: those these realms fought, the world-defining ones first, at most " + MAX_MARKERS + "."));
  return wrap;
}

AEON.stats = { open: open, close: close, isOpen: isOpen, setYear: setYear, _order: bestOrder, _separation: separation, _cityCounts: cityCounts, _wonderReplay: wonderReplay };

})();
