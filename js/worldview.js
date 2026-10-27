/* Aeon - the World map mode (docs/WORLD_SKETCH.md, step 3).

   Draws the world sketch (sketch.js) over the biome map for the shown year: the grid of squares,
   each lived square's land washed in the colour of the age it has reached, the peoples' seats,
   trade routes opened so far, and the arrows of migrations, invasions, raids and colonisations
   (the last few centuries' strong, older ones faint). The world timeline beside the map lists
   every contact; hovering one picks it out on the map, clicking one goes to its year.
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
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 135;
  }
  ctx.putImageData(img, 0, 0);
  v.wash = cv; v.washStep = t;
  return cv;
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

  /* the base map a little paler, so the sketch reads over it */
  ctx.fillStyle = "rgba(243, 228, 196, 0.35)";
  ctx.fillRect(X(0), Y(0), W * s, H * s);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(washOf(world, v, t), X(0), Y(0), W * s, H * s);

  /* the grid */
  ctx.strokeStyle = "rgba(58, 38, 20, 0.55)"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (const q of sk.squares) {
    if (q.col > 0) { ctx.moveTo(Math.round(X(q.x0)) + 0.5, Y(q.y0)); ctx.lineTo(Math.round(X(q.x0)) + 0.5, Y(q.y1)); }
    if (q.row > 0) { ctx.moveTo(X(q.x0), Math.round(Y(q.y0)) + 0.5); ctx.lineTo(X(q.x1), Math.round(Y(q.y0)) + 0.5); }
  }
  ctx.stroke(); ctx.setLineDash([]);

  /* the contacts up to the year: trade routes as thin lines, the rest as arrows */
  const pick = opts.highlight || null;
  const line = function (c, alpha, width, head) {
    const a = v.anchors[v.index[c.from]], b = v.anchors[v.index[c.to]];
    let bx = b[0];
    if (Math.abs(bx - a[0]) > W / 2) bx += bx > a[0] ? -W : W;      /* the short way round */
    const x1 = X(a[0]), y1 = Y(a[1]), x2 = X(bx), y2 = Y(b[1]);
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
    if (c === pick) continue;
    if (c.kind === "dark-age") { if (year - c.year < 200) dark[c.to] = true; continue; }
    if (c.kind === "trade") { if (opts.trade !== false) line(c, 0.55, 1.2, false); continue; }
    const age = year - c.year, recent = age < RECENT;
    line(c, recent ? 0.95 : 0.28, recent ? 2.5 : 1.3, true);
  }
  if (pick) {
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

  /* a label per lived square: its age and its leading people */
  const ages = world.pack.ages || [];
  ctx.font = "13px " + (getComputedStyle(document.documentElement).getPropertyValue("--ae-pixel") || "Georgia, serif");
  ctx.textBaseline = "top";
  sk.squares.forEach(function (q, si) {
    const k = sk.curves[si].age[t];
    if (k < 0) return;
    const ps = peoplesIn(world, si, year);
    const lead = ps.filter(function (p) { return p.arrived == null; }).sort(function (a, b) { return b.cells - a.cells; })[0] || ps[0];
    const age = ages[k] ? ages[k].short || ages[k].name : "Age " + (k + 1);
    const l1 = age + (dark[q.id] ? " · dark age" : ""), l2 = lead ? lead.name + (ps.length > 1 ? " +" + (ps.length - 1) : "") : "";
    /* a small square on screen gets the age alone, a smaller one just its colour chip */
    const room = (q.x1 - q.x0) * s - 8, two = room >= 150, one = room >= 70;
    const w = one ? Math.min(room, Math.max(ctx.measureText(l1).width, two ? ctx.measureText(l2).width : 0) + 10) : 9, h = two ? 34 : one ? 19 : 9;
    const x = X(q.x0) + 4, y = Y(q.y0) + 4;
    ctx.fillStyle = "rgba(243, 228, 196, 0.9)"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#3a2614"; ctx.lineWidth = 1; ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), h);
    ctx.fillStyle = ageColor(k); ctx.fillRect(x + 1, y + 1, one ? 4 : 8, h - 1);
    if (!one) return;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = dark[q.id] ? "#8e1d1d" : "#3a2614"; ctx.fillText(l1, x + 8, y + 3);
    if (two) { ctx.fillStyle = "#6b4a2a"; ctx.fillText(l2, x + 8, y + 18); }
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
function fillLegend(L, world, el) {
  L.textContent = "";
  L.appendChild(el("b", { text: "Ages" }));
  (world.pack.ages || []).forEach(function (a, k) {
    const i = el("i", { class: "ae-legend-chip" }); i.style.background = ageColor(k);
    L.appendChild(i); L.appendChild(el("span", { text: a.short || a.name }));
  });
  L.appendChild(el("b", { text: " Contacts", style: "margin-left:8px" }));
  ["trade", "migration", "invasion", "raid", "colonisation"].forEach(function (kd) {
    const i = el("i", { class: "ae-legend-chip" }); i.style.background = KIND[kd].color;
    L.appendChild(i); L.appendChild(el("span", { text: KIND[kd].label }));
  });
}

/* the world timeline: every contact of the sketch, those after the shown year dimmed */
function Timeline(host, world, opts, el) {
  const sk = world.sketch, pack = world.pack;
  const root = el("div", { class: "wv-line" });
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
      const row = el("div", { class: "wv-row" + (c.kind === "trade" || c.kind === "dark-age" ? " minor" : ""),
        onclick: function () { opts.onSetYear(c.year); },
        onmouseenter: function () { opts.onHighlight(c); },
        onmouseleave: function () { opts.onHighlight(null); } },
        sw, el("span", { class: "wv-year", text: pack.yearLabel(c.year) }),
        el("span", { class: "wv-text", text: c.text.replace("In " + pack.yearLabel(c.year) + " ", "").replace(/^./, function (m) { return m.toUpperCase(); }) }));
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

AEON.worldView = { draw: draw, squareAt: squareAt, fillTip: fillTip, fillLegend: fillLegend, Timeline: Timeline };

})();
