/* Aeon - the World and Ages map modes (docs/WORLD_SKETCH.md, step 3).

   Draws the world sketch (sketch.js) over the biome map for the shown year: the grid of squares
   and the peoples' seats; in the World mode the trade routes opened so far and the arrows of
   migrations, invasions, raids and colonisations from seat to seat (the last few centuries'
   strong, older ones faint); in the Ages mode each lived square's land washed in the colour of
   the age it has reached. The world timeline beside the map lists every contact; hovering one
   picks it out on the map, clicking one goes to its year and shows both ends of its arrow.
   View only: nothing here changes the world or its history. */
(function () {
"use strict";

const AEON = window.AEON = window.AEON || {};

/* the age washes, from the first age to the last, in the parchment-and-ink family */
const AGE_COLORS = ["#c8782a", "#8f9a2a", "#2f8a7a", "#3f5fb0", "#8a3a9a"];
const KIND = {
  trade:        { color: "#2f6b3a", label: "trade" },
  migration:    { color: "#a8741a", label: "migration" },
  invasion:     { color: "#a32a1f", label: "invasion" },
  raid:         { color: "#6a1a3a", label: "raid" },
  colonisation: { color: "#1f4f8f", label: "colonisation" },
  "dark-age":   { color: "#3a2614", label: "dark age" },
};
const RECENT = 300;             /* years a contact's arrow stays strong */

function ageColor(k) { return AGE_COLORS[Math.max(0, Math.min(AGE_COLORS.length - 1, k))]; }
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }

/* the step of the sketch's timeline that holds a year */
function stepOf(sk, world, year) {
  const t = Math.floor((year - world.pack.startYear) / ((sk.years[1] - sk.years[0]) || 100));
  return Math.max(0, Math.min(sk.years.length - 1, t));
}

/* per world, worked out once: each square's index by id, the square of every cell, and an
   anchor per square for the arrows (the mean of its first peoples' seats, else its land) */
function prep(world) {
  const sk = world.sketch;
  if (sk._view) return sk._view;
  const W = world.width, H = world.height, R = world.regions;
  const index = {}, sqOf = new Int16Array(W * H).fill(-1);
  sk.squares.forEach(function (s, i) {
    index[s.id] = i;
    for (let y = s.y0; y < s.y1; y++) for (let x = s.x0; x < s.x1; x++) sqOf[y * W + x] = i;
  });
  const byId = {};
  for (const p of sk.peoples) byId[p.id] = p;
  const anchors = sk.squares.map(function (s) {
    let ax = 0, ay = 0, n = 0;
    for (const p of sk.peoples) if (p.square === s.id && p.seat != null) { ax += R[p.seat].x + 0.5; ay += R[p.seat].y + 0.5; n++; }
    if (!n) for (let y = s.y0; y < s.y1; y++) for (let x = s.x0; x < s.x1; x++) if (!R[y * W + x].barren) { ax += x + 0.5; ay += y + 0.5; n++; }
    return n ? [ax / n, ay / n] : [(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2];
  });
  const v = { index: index, sqOf: sqOf, byId: byId, anchors: anchors, wash: null, washStep: -1 };
  Object.defineProperty(sk, "_view", { enumerable: false, configurable: true, writable: true, value: v });
  return v;
}

/* the land of every lived square in the colour of its age at a step, one pixel a cell */
function washOf(world, v, t) {
  if (v.washStep === t && v.wash) return v.wash;
  const sk = world.sketch, W = world.width, H = world.height, R = world.regions;
  const cv = v.wash || document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(W, H), d = img.data;
  const rgb = AGE_COLORS.map(hexRgb);
  for (let i = 0; i < W * H; i++) {
    const s = v.sqOf[i];
    if (s < 0 || R[i].barren) continue;
    const k = sk.curves[s].age[t];
    if (k < 0) continue;
    const c = rgb[Math.min(rgb.length - 1, k)];
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 85;
  }
  ctx.putImageData(img, 0, 0);
  v.wash = cv; v.washStep = t;
  return cv;
}

/* where a contact's arrow starts and ends, in cells: the seat of the people who set out and the
   seat of the people they came to (for trade, the target square's leading first people); the
   end is moved a world's width over when the short way round crosses the edge */
function contactEnds(world, c) {
  const v = prep(world), R = world.regions, sk = world.sketch;
  const seatOf = function (pid, sq) {
    let p = pid && v.byId[pid];
    if (!p || p.seat == null) {
      p = sk.peoples.filter(function (q) { return q.square === sq && q.arrived == null && q.seat != null; })
        .sort(function (a, b) { return b.cells - a.cells; })[0];
    }
    return p ? [R[p.seat].x + 0.5, R[p.seat].y + 0.5] : v.anchors[v.index[sq]].slice();
  };
  const a = seatOf(c.by, c.from), b = seatOf(c.against, c.to);
  if (Math.abs(b[0] - a[0]) > world.width / 2) b[0] += b[0] > a[0] ? -world.width : world.width;
  return [a, b];
}

/* the peoples living in a square in a year: its first peoples and those who had arrived by then */
function peoplesIn(world, si, year) {
  const sk = world.sketch, s = sk.squares[si];
  return s.peoples.map(function (id) { return prep(world).byId[id]; }).filter(function (p) { return p.arrived == null || p.arrived <= year; });
}

function draw(canvas, world, year, opts) {
  const sk = world && world.sketch, vw = canvas && canvas._aeonView;
  if (!sk || !sk.curves || !vw) return;
  opts = opts || {};
  const v = prep(world), ctx = canvas.getContext("2d"), W = world.width, H = world.height;
  const s = vw.s, ox = vw.ox, oy = vw.oy, t = stepOf(sk, world, year);
  const X = function (x) { return ox + x * s; }, Y = function (y) { return oy + y * s; };
  ctx.save();
  ctx.setTransform(vw.dpr, 0, 0, vw.dpr, 0, 0);
  ctx.beginPath(); ctx.rect(X(0), Y(0), W * s, H * s); ctx.clip();

  /* the Ages mode washes the land in its age's colour and labels the ages; the World mode shows
     the peoples and their contacts */
  const agesMode = !!opts.ages;
  ctx.imageSmoothingEnabled = false;
  if (agesMode) ctx.drawImage(washOf(world, v, t), X(0), Y(0), W * s, H * s);

  /* the grid */
  ctx.strokeStyle = "rgba(58, 38, 20, 0.55)"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (const q of sk.squares) {
    if (q.col > 0) { ctx.moveTo(Math.round(X(q.x0)) + 0.5, Y(q.y0)); ctx.lineTo(Math.round(X(q.x0)) + 0.5, Y(q.y1)); }
    if (q.row > 0) { ctx.moveTo(X(q.x0), Math.round(Y(q.y0)) + 0.5); ctx.lineTo(X(q.x1), Math.round(Y(q.y0)) + 0.5); }
  }
  ctx.stroke(); ctx.setLineDash([]);
  /* the square picked to open */
  if (opts.pick != null && sk.squares[opts.pick]) {
    const q = sk.squares[opts.pick];
    ctx.strokeStyle = "#8e1d1d"; ctx.lineWidth = 3;
    ctx.strokeRect(X(q.x0) + 1.5, Y(q.y0) + 1.5, (q.x1 - q.x0) * s - 3, (q.y1 - q.y0) * s - 3);
  }

  /* the contacts up to the year: trade routes as thin lines, the rest as arrows */
  const pick = opts.highlight || null;
  const line = function (c, alpha, width, head) {
    const e = contactEnds(world, c);
    const x1 = X(e[0][0]), y1 = Y(e[0][1]), x2 = X(e[1][0]), y2 = Y(e[1][1]);
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const bend = Math.min(40, len * 0.18), mx = (x1 + x2) / 2 - dy / len * bend, my = (y1 + y2) / 2 + dx / len * bend;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = KIND[c.kind].color; ctx.lineWidth = width;
    ctx.setLineDash(c.kind === "trade" ? [3, 3] : c.kind === "raid" ? [7, 4] : []);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
    ctx.setLineDash([]);
    if (head) {
      const ang = Math.atan2(y2 - my, x2 - mx), hl = 5 + width * 2;
      ctx.fillStyle = KIND[c.kind].color;
      ctx.beginPath(); ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hl * Math.cos(ang - 0.45), y2 - hl * Math.sin(ang - 0.45));
      ctx.lineTo(x2 - hl * Math.cos(ang + 0.45), y2 - hl * Math.sin(ang + 0.45));
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  const dark = {};
  for (const c of sk.contacts) {
    if (c.year > year) break;
    if (c.kind === "dark-age") { if (year - c.year < 200) dark[c.to] = true; continue; }
    if (c === pick || agesMode) continue;
    if (c.kind === "trade") { if (opts.trade !== false) line(c, 0.55, 1.2, false); continue; }
    const age = year - c.year, recent = age < RECENT;
    line(c, recent ? 0.95 : 0.28, recent ? 2.5 : 1.3, true);
  }
  if (pick && !agesMode) {
    if (pick.kind === "dark-age") dark[pick.to] = true;
    else line(pick, 1, 4, pick.kind !== "trade");
  }

  /* the peoples' seats: first peoples as ink diamonds, newcomers in their contact's colour */
  const u = Math.max(3, Math.min(6, s * 0.9));
  sk.squares.forEach(function (q, si) {
    const ps = peoplesIn(world, si, year);
    let k = 0;
    for (const p of ps) {
      let px, py;
      if (p.seat != null) { px = X(world.regions[p.seat].x + 0.5); py = Y(world.regions[p.seat].y + 0.5); }
      else { const a = v.anchors[si]; px = X(a[0]) + 10 + 8 * (k % 3); py = Y(a[1]) + 10 + 8 * Math.floor(k / 3); k++; }
      ctx.fillStyle = p.arrived != null ? KIND[(p.how || "").split(":")[0]] ? KIND[p.how.split(":")[0]].color : "#3a2614" : "#3a2614";
      ctx.strokeStyle = "#f3e4c4"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py - u); ctx.lineTo(px + u, py); ctx.lineTo(px, py + u); ctx.lineTo(px - u, py); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  });

  /* a label per lived square: its age (Ages mode) or its leading people (World mode) */
  const ages = world.pack.ages || [];
  ctx.font = "13px " + (getComputedStyle(document.documentElement).getPropertyValue("--ae-pixel") || "Georgia, serif");
  ctx.textBaseline = "top";
  sk.squares.forEach(function (q, si) {
    const k = sk.curves[si].age[t];
    if (k < 0) return;
    const ps = peoplesIn(world, si, year);
    const lead = ps.filter(function (p) { return p.arrived == null; }).sort(function (a, b) { return b.cells - a.cells; })[0] || ps[0];
    const age = ages[k] ? ages[k].short || ages[k].name : "Age " + (k + 1);
    const l1 = agesMode ? age + (dark[q.id] ? " · dark age" : "") : lead ? lead.name + (ps.length > 1 ? " +" + (ps.length - 1) : "") : "";
    if (!l1) return;
    /* a small square on screen gets just a chip (its age's colour in the Ages mode) */
    const room = (q.x1 - q.x0) * s - 8, one = room >= 70;
    const w = one ? Math.min(room, ctx.measureText(l1).width + (agesMode ? 10 : 8)) : 9, h = one ? 19 : 9;
    const x = X(q.x0) + 4, y = Y(q.y0) + 4;
    ctx.fillStyle = "rgba(243, 228, 196, 0.9)"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#3a2614"; ctx.lineWidth = 1; ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), h);
    if (agesMode) { ctx.fillStyle = ageColor(k); ctx.fillRect(x + 1, y + 1, one ? 4 : 8, h - 1); }
    if (!one) return;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = agesMode && dark[q.id] ? "#8e1d1d" : "#3a2614"; ctx.fillText(l1, x + (agesMode ? 8 : 4), y + 3);
    ctx.restore();
  });
  ctx.restore();
}

/* the square a cell lies in, as an index (null off the map or in a sketch-less world) */
function squareAt(world, rid) {
  if (!world || !world.sketch || rid == null) return null;
  const s = prep(world).sqOf[rid];
  return s >= 0 ? s : null;
}

/* the hover plaque for a square in a year */
function fillTip(tip, world, rid, year, el) {
  const si = squareAt(world, rid);
  if (si == null) return false;
  const sk = world.sketch, q = sk.squares[si], pack = world.pack, t = stepOf(sk, world, year);
  const k = sk.curves[si].age[t], ages = pack.ages || [];
  tip.appendChild(el("div", { class: "ae-tip-name", text: "Square " + q.id }));
  if (k < 0) { tip.appendChild(el("div", { class: "dim", text: q.openSea ? "Open sea" : "No one lives here" })); return true; }
  tip.appendChild(el("div", { text: (ages[k] ? ages[k].name : "Age " + (k + 1)) + " in " + pack.yearLabel(year) }));
  const reached = (q.ageYears || []).map(function (y, i) { return y != null && i > 0 && y <= year ? (ages[i] ? ages[i].short : i) + " " + pack.yearLabel(y) : null; }).filter(Boolean);
  if (reached.length) tip.appendChild(el("div", { class: "dim", text: "Reached " + reached.join(" · ") }));
  tip.appendChild(el("div", { class: "ae-tip-rule" }));
  for (const p of peoplesIn(world, si, year)) {
    const how = p.arrived != null ? ", came by " + p.how.split(":")[0] + " in " + pack.yearLabel(p.arrived) : "";
    tip.appendChild(el("div", { text: p.name + " (" + p.kind + how + ")" }));
  }
  const last = sk.contacts.filter(function (c) { return c.year <= year && (c.to === q.id || c.from === q.id) && c.kind !== "trade"; }).pop();
  if (last) tip.appendChild(el("div", { class: "dim", text: "Last: " + last.text }));
  return true;
}

/* the legend plaque: the ages and the kinds of contact */
function fillLegend(L, world, el, ages) {
  L.textContent = "";
  if (ages) {
    L.appendChild(el("b", { text: "Ages" }));
    (world.pack.ages || []).forEach(function (a, k) {
      const i = el("i", { class: "ae-legend-chip" }); i.style.background = ageColor(k);
      L.appendChild(i); L.appendChild(el("span", { text: a.short || a.name }));
    });
    return;
  }
  L.appendChild(el("b", { text: "Contacts" }));
  ["trade", "migration", "invasion", "raid", "colonisation"].forEach(function (kd) {
    const i = el("i", { class: "ae-legend-chip" }); i.style.background = KIND[kd].color;
    L.appendChild(i); L.appendChild(el("span", { text: KIND[kd].label }));
  });
}

/* the world timeline: every contact of the sketch, those after the shown year dimmed; a contact
   a region's chapter is about has a button that plays it (opts.chapterFor, opts.onChapter) */
function Timeline(host, world, opts, el) {
  const sk = world.sketch, pack = world.pack;
  const root = el("div", { class: "wv-line" + (opts.side ? " wv-side" : "") });
  let showTrade = false, year = null;
  const list = el("div", { class: "wv-list" });
  const tradeBtn = el("button", { class: "ae-btn wv-chip", text: "trade", title: "Show first trade contacts too",
    onclick: function () { showTrade = !showTrade; tradeBtn.classList.toggle("on", showTrade); fill(); if (opts.onTrade) opts.onTrade(showTrade); } });
  const hostile = sk.contacts.filter(function (c) { return c.kind !== "trade" && c.kind !== "dark-age"; }).length;
  root.appendChild(el("div", { class: "wv-head" },
    el("b", { text: "World timeline" }),
    el("span", { class: "wv-count", text: hostile + " clashes and crossings" }),
    tradeBtn));
  root.appendChild(list);
  host.appendChild(root);
  const rows = [];
  function fill() {
    list.textContent = ""; rows.length = 0;
    for (const c of sk.contacts) {
      if (c.kind === "trade" && !showTrade) continue;
      const sw = el("i", { class: "wv-dot" }); sw.style.background = KIND[c.kind].color;
      const ch = opts.chapterFor ? opts.chapterFor(c) : null;
      const row = el("div", { class: "wv-row" + (c.kind === "trade" || c.kind === "dark-age" ? " minor" : ""),
        onclick: function () { opts.onSetYear(c.year); if (opts.onFocus) opts.onFocus(c); },
        onmouseenter: function () { opts.onHighlight(c); },
        onmouseleave: function () { opts.onHighlight(null); } },
        sw, el("span", { class: "wv-year", text: pack.yearLabel(c.year) }),
        el("span", { class: "wv-text", text: c.text.replace("In " + pack.yearLabel(c.year) + " ", "").replace(/^./, function (m) { return m.toUpperCase(); }) }),
        ch ? el("button", { class: "wv-play", text: "▶", title: "Play the chapter: " + ch.title,
          onclick: function (e) { e.stopPropagation(); opts.onChapter(ch.si, ch.k); } }) : null);
      row._year = c.year;
      rows.push(row); list.appendChild(row);
    }
    if (year != null) setYear(year, true);
  }
  function setYear(y, force) {
    if (y === year && !force) return;
    year = y;
    let last = null;
    for (const r of rows) { const past = r._year <= y; r.classList.toggle("future", !past); if (past) last = r; }
    for (const r of rows) r.classList.toggle("now", r === last);
    if (last) {
      const top = last.offsetTop - list.clientHeight / 2;
      list.scrollTop = Math.max(0, top);
    } else list.scrollTop = 0;
  }
  fill();
  return {
    setYear: setYear,
    show: function (on) { root.classList.toggle("hidden", !on); if (on && year != null) setYear(year, true); },
  };
}

/* one line about a square in a year: its age and its peoples */
function squareLine(world, si, year) {
  const sk = world.sketch, k = sk.curves[si].age[stepOf(sk, world, year)], ages = world.pack.ages || [];
  const ps = peoplesIn(world, si, year).map(function (p) { return p.name; });
  return (ages[k] ? ages[k].name : "") + " · " + ps.slice(0, 3).join(", ") + (ps.length > 3 ? " and " + (ps.length - 3) + " more" : "");
}

/* a region's "beyond" band (region.js): the neighbouring land, dimmed and hatched over the map,
   with a dark rule along the square's edge */
function drawBeyond(canvas, world) {
  const vw = canvas && canvas._aeonView;
  if (!vw || !world.square) return;
  const W = world.width, H = world.height;
  if (!world._beyondImg) {
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(W, H), d = img.data, biomes = world.pack.biomes || {};
    for (const r of world.regions) {
      if (!r.beyond) continue;
      const b = biomes[r.beyondBiome || (r.lake ? "lake" : "barren")];
      let c = r.beyondBiome && b ? hexRgb(b.color) : [45, 70, 105];
      const shade = (r.x + r.y) % 4 === 0 ? 0.5 : 0.72;
      const i = (r.y * W + r.x) * 4;
      d[i] = c[0] * shade; d[i + 1] = c[1] * shade; d[i + 2] = c[2] * shade; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    Object.defineProperty(world, "_beyondImg", { enumerable: false, configurable: true, writable: true, value: cv });
  }
  const ctx = canvas.getContext("2d"), s = vw.s;
  ctx.save();
  ctx.setTransform(vw.dpr, 0, 0, vw.dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  /* past the region's own grid, the planet's land fills the rest of the screen */
  const far = farOf(world);
  if (far) {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.rect(vw.ox, vw.oy, W * s, H * s); ctx.clip("evenodd");
    ctx.fillStyle = "#1c2a3c"; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(far.img, vw.ox + far.x * s, vw.oy + far.y * s, far.img.width * s, far.img.height * s);
    ctx.restore();
  }
  ctx.drawImage(world._beyondImg, vw.ox, vw.oy, W * s, H * s);
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (const r of world.regions) if (!r.beyond) { x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + 1); y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y + 1); }
  ctx.strokeStyle = "#3a2614"; ctx.lineWidth = 2;
  ctx.strokeRect(vw.ox + x0 * s, vw.oy + y0 * s, (x1 - x0) * s, (y1 - y0) * s);
  ctx.restore();
}

/* the planet around a region, FAR planet cells each way, one region cell a pixel (each planet
   cell a block of K), shaded and hatched like the beyond band; x is in region cells, from the
   region's left edge. Drawn only, made once per region. */
const FAR = 40;
function farOf(world) {
  const planet = world.planet, sq = world.square;
  if (!planet || !sq || !sq.K) return null;
  if (world._farImg) return world._farImg;
  const K = sq.K, PW = planet.width, PH = planet.height, biomes = world.pack.biomes || {};
  const gx0 = sq.px0 - FAR, gy0 = Math.max(0, sq.py0 - FAR);
  const gw = Math.round(world.width / K) + 2 * FAR, gy1 = Math.min(PH, sq.py0 + Math.round(world.height / K) + FAR), gh = gy1 - gy0;
  const cv = document.createElement("canvas");
  cv.width = gw * K; cv.height = gh * K;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(cv.width, cv.height), d = img.data;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    const px = (((gx0 + Math.floor(x / K)) % PW) + PW) % PW, r = planet.regions[(gy0 + Math.floor(y / K)) * PW + px];
    const b = r && !r.barren && biomes[r.biome];
    const c = b ? hexRgb(b.color) : [45, 70, 105];
    const shade = (x + y) % 4 === 0 ? 0.5 : 0.72, i = (y * cv.width + x) * 4;
    d[i] = c[0] * shade; d[i + 1] = c[1] * shade; d[i + 2] = c[2] * shade; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const v = { img: cv, x: -FAR * K, y: (gy0 - sq.py0) * K };
  Object.defineProperty(world, "_farImg", { enumerable: false, configurable: true, writable: true, value: v });
  return v;
}

/* a sketch square's centre in planet cells, its x moved a world's width over when nearer that way */
function squareCentre(sq, nearX, PW) {
  let x = (sq.x0 + sq.x1) / 2;
  if (nearX != null && Math.abs(x - nearX) > PW / 2) x += x > nearX ? -PW : PW;
  return [x, (sq.y0 + sq.y1) / 2];
}

/* In a region, the newcomers and raiders of the sketch come in with an arrow over the region's
   edge from their homeland's side, named, for ARRIVAL_YEARS after they land (the last third
   fading). Read from the chronicle's arrival and raid events (region.js record). */
const ARRIVAL_YEARS = 60;
function arrivalsOf(world) {
  const n = world.chronicle.length;
  if (world._arrivals && world._arrivals.n === n) return world._arrivals.list;
  const list = world.chronicle.filter(function (e) {
    return e.sketch && (e.type === "sketch-arrival" || e.type === "sketch-raid") && e.regionId != null && e.sketch.from !== world.square.id;
  });
  Object.defineProperty(world, "_arrivals", { enumerable: false, configurable: true, writable: true, value: { n: n, list: list } });
  return list;
}
function drawArrivals(canvas, world, year) {
  const vw = canvas && canvas._aeonView, planet = world.planet, sk = planet && planet.sketch, sqr = world.square;
  if (!vw || !sk || !sqr || !sqr.K) return;
  const here = sk.squares[sqr.index], K = sqr.K, PW = planet.width;
  /* the region's own land, in region cells */
  const ix0 = (here.x0 - sqr.px0) * K, ix1 = (here.x1 - sqr.px0) * K, iy0 = (here.y0 - sqr.py0) * K, iy1 = (here.y1 - sqr.py0) * K;
  const hc = squareCentre(here, null, PW), s = vw.s;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.setTransform(vw.dpr, 0, 0, vw.dpr, 0, 0);
  for (const e of arrivalsOf(world)) {
    const age = year - e.year;
    if (age < 0 || age > ARRIVAL_YEARS) continue;
    const from = sk.squares.find(function (q) { return q.id === e.sketch.from; });
    if (!from) continue;
    const oc = squareCentre(from, hc[0], PW);
    let dx = oc[0] - hc[0], dy = oc[1] - hc[1];
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    /* from the landing place back toward the homeland until well past the region's edge */
    const r = world.regions[e.regionId], ex = r.x + 0.5, ey = r.y + 0.5;
    let t = 0;
    while (t < 400 && (t < 40 || ex + dx * t > ix0 - 14 && ex + dx * t < ix1 + 14 && ey + dy * t > iy0 - 14 && ey + dy * t < iy1 + 14)) t += 1;
    const x1 = vw.ox + (ex + dx * t) * s, y1 = vw.oy + (ey + dy * t) * s, x2 = vw.ox + ex * s, y2 = vw.oy + ey * s;
    const col = (KIND[e.sketch.kind] || KIND.invasion).color;
    ctx.globalAlpha = age < ARRIVAL_YEARS * 2 / 3 ? 1 : 3 * (1 - age / ARRIVAL_YEARS);
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(243, 228, 196, 0.9)"; ctx.lineWidth = 8;
    ctx.setLineDash(e.sketch.kind === "raid" ? [12, 8] : []);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(y2 - y1, x2 - x1), hl = 16;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hl * Math.cos(ang - 0.42), y2 - hl * Math.sin(ang - 0.42));
    ctx.lineTo(x2 - hl * Math.cos(ang + 0.42), y2 - hl * Math.sin(ang + 0.42));
    ctx.closePath(); ctx.fill();
    /* its name and homeland on a plaque at the arrow's tail */
    const by = e.sketch.by && prep(planet).byId[e.sketch.by];
    const l1 = (by ? by.name + " " : "") + (KIND[e.sketch.kind] ? KIND[e.sketch.kind].label : e.sketch.kind), l2 = "from square " + from.id + ", " + (world.pack.yearLabel ? world.pack.yearLabel(e.year) : e.year);
    ctx.font = "bold 13px Georgia, serif";
    const w1 = ctx.measureText(l1).width;
    ctx.font = "12px Georgia, serif";
    const bw = Math.max(w1, ctx.measureText(l2).width) + 14, bh = 36;
    const bx = Math.max(4, Math.min(canvas.clientWidth - bw - 4, x1 - bw / 2)), by2 = Math.max(4, Math.min(canvas.clientHeight - bh - 4, y1 + (dy > 0 ? 10 : -bh - 10)));
    ctx.fillStyle = "rgba(243, 228, 196, 0.95)"; ctx.fillRect(bx, by2, bw, bh);
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(bx, by2, bw, bh);
    ctx.fillStyle = "#3a2614"; ctx.font = "bold 13px Georgia, serif"; ctx.fillText(l1, bx + 7, by2 + 15);
    ctx.fillStyle = "#6b4a2a"; ctx.font = "12px Georgia, serif"; ctx.fillText(l2, bx + 7, by2 + 30);
  }
  ctx.restore();
}

/* the planet one pixel a cell in its biomes' colours, the sea dark blue; made once */
function planetImg(planet) {
  if (planet._img) return planet._img;
  const W = planet.width, H = planet.height, biomes = planet.pack.biomes || {};
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(W, H), d = img.data;
  for (const r of planet.regions) {
    const b = !r.barren && biomes[r.biome], c = b ? hexRgb(b.color) : [38, 62, 98], i = (r.y * W + r.x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  Object.defineProperty(planet, "_img", { enumerable: false, configurable: true, writable: true, value: cv });
  return cv;
}

/* a small world map for a people that came to a region: the square they set out from, the
   region's square, and the way between (null when they are no newcomers) */
function homeMap(planet, peopleId) {
  const sk = planet && planet.sketch, v = sk && prep(planet), np = v && v.byId[peopleId];
  if (!np || np.arrived == null) return null;
  const origin = v.byId[np.from], from = origin && sk.squares[v.index[origin.square]], to = sk.squares[v.index[np.square]];
  if (!from || !to) return null;
  const k = 3, W = planet.width, H = planet.height, cv = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  cv.width = W * k * dpr; cv.height = H * k * dpr;
  cv.className = "wv-home";
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(planetImg(planet), 0, 0, W * k, H * k);
  ctx.strokeStyle = "rgba(243, 228, 196, 0.35)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath();
  for (const q of sk.squares) {
    if (q.col > 0) { ctx.moveTo(q.x0 * k + 0.5, q.y0 * k); ctx.lineTo(q.x0 * k + 0.5, q.y1 * k); }
    if (q.row > 0) { ctx.moveTo(q.x0 * k, q.y0 * k + 0.5); ctx.lineTo(q.x1 * k, q.y0 * k + 0.5); }
  }
  ctx.stroke(); ctx.setLineDash([]);
  const box = function (q, col) { ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.strokeRect(q.x0 * k + 1.5, q.y0 * k + 1.5, (q.x1 - q.x0) * k - 3, (q.y1 - q.y0) * k - 3); };
  box(from, "#f3e4c4"); box(to, "#c0392b");
  const how = (np.how || "").split(":")[0], col = (KIND[how] || KIND.invasion).color;
  const e = contactEnds(planet, { by: origin.id, from: from.id, to: to.id });
  /* the short way may cross the world's edge: the arrow is drawn once from each side */
  for (const off of [0, e[1][0] < 0 ? W : e[1][0] > W ? -W : 0].filter(function (o, i, a) { return a.indexOf(o) === i; })) {
    const x1 = (e[0][0] + off) * k, y1 = e[0][1] * k, x2 = (e[1][0] + off) * k, y2 = e[1][1] * k;
    ctx.strokeStyle = "#f3e4c4"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 10 * Math.cos(ang - 0.45), y2 - 10 * Math.sin(ang - 0.45));
    ctx.lineTo(x2 - 10 * Math.cos(ang + 0.45), y2 - 10 * Math.sin(ang + 0.45));
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = col; ctx.strokeStyle = "#f3e4c4"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(e[0][0] * k, e[0][1] * k, 4, 0, 7); ctx.fill(); ctx.stroke();
  const yl = planet.pack.yearLabel ? planet.pack.yearLabel(np.arrived) : np.arrived;
  const verb = { migration: "came over land", invasion: "invaded", raid: "came by sea as raiders", colonisation: "crossed the sea as colonists" }[how] || "came";
  const fig = document.createElement("figure"), cap = document.createElement("figcaption");
  fig.className = "wv-homefig";
  cap.textContent = "The " + np.name + " " + verb + " from the lands of square " + from.id + " (white) to square " + to.id + " (red) in " + yl +
    (e[1][0] < 0 || e[1][0] > W ? ", round the world's edge (the map wraps east to west)." : ".");
  fig.appendChild(cv); fig.appendChild(cap);
  return fig;
}

/* what lies beyond a region at a cell: the neighbouring square's first people */
function beyondLine(world, r) {
  const planet = world.planet, sk = planet && planet.sketch;
  if (!sk) return "Another land";
  const si = prep(planet).sqOf[r.planet];
  const q = si >= 0 ? sk.squares[si] : null;
  const p = q && sk.peoples.find(function (x) { return x.square === q.id && !x.arrived; });
  return r.barren && !r.beyondBiome ? "The open sea" : p ? "The lands of " + p.name + " (square " + q.id + ")" : "Land no one lives in";
}

AEON.worldView = { draw: draw, squareAt: squareAt, fillTip: fillTip, fillLegend: fillLegend, Timeline: Timeline,
  squareLine: squareLine, drawBeyond: drawBeyond, beyondLine: beyondLine, contactEnds: contactEnds,
  drawArrivals: drawArrivals, homeMap: homeMap };

})();
