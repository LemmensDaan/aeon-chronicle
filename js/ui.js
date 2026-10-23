/* Aeon — application shell: genre picker, generation, playback, map wiring. */
(function () {
"use strict";

const AEON = window.AEON = window.AEON || {};

function el(tag, props) {
  const n = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
  }
  for (let i = 2; i < arguments.length; i++) {
    const c = arguments[i];
    if (c == null || c === false) continue;
    if (Array.isArray(c)) { c.forEach(function (x) { if (x) n.appendChild(x.nodeType ? x : document.createTextNode(String(x))); }); continue; }
    n.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
}
AEON.el = el;

let world = null;
let playing = false;
/* playback speed in years per second (whole ticks are taken as the time adds up), so it is the
   same on any screen; the slow speeds leave time for the event animations (mapfx.js) */
let playSpeed = 50;
const SPEEDS = [10, 25, 50, 100, 300, 1200];
let playLast = 0, playOwed = 0;
let rafId = 0;
let mapMode = "political";
let view = { zoom: 1, panX: 0, panY: 0 };
let hoverRegion = null, selectedRegion = null;

const dom = {};

/* ------------------------------------------------------------- setup --- */

function mountSetup() {
  const packs = Object.keys(AEON.packs).map(function (k) { return AEON.packs[k]; });
  const host = dom.setup;
  host.innerHTML = "";

  if (!packs.length) {
    host.appendChild(el("div", { class: "ae-empty" },
      el("h2", { text: "No genre packs loaded." }),
      el("p", { text: "Check the console — a pack file failed to load." })));
    return;
  }

  let chosenPack = packs[0].id;
  const cards = el("div", { class: "ae-packs" });

  packs.forEach(function (p) {
    const card = el("button", { class: "ae-pack" + (p.id === chosenPack ? " on" : ""), onclick: function () {
      chosenPack = p.id;
      cards.querySelectorAll(".ae-pack").forEach(function (c) { c.classList.remove("on"); });
      card.classList.add("on");
      syncSpan();
    } },
      el("div", { class: "ae-pack-icon", text: p.icon || "🌍" }),
      el("div", { class: "ae-pack-name", text: p.name }),
      el("div", { class: "ae-pack-blurb", text: p.blurb || "" }),
      el("div", { class: "ae-pack-meta", text:
        p.yearLabel(p.startYear) + " → " + p.yearLabel(p.endYear) }));
    cards.appendChild(card);
  });

  const seedInput = el("input", { class: "ae-input", type: "text", value: String(Math.floor(Math.random() * 1e9)) });
  const spanLabel = el("div", { class: "ae-span" });
  function syncSpan() {
    const p = AEON.packs[chosenPack];
    const ticks = Math.round((p.endYear - p.startYear) / p.timeStep);
    spanLabel.textContent = (p.endYear - p.startYear).toLocaleString() + " years · " +
      ticks.toLocaleString() + " turns · " + p.events.length + " event types";
  }
  syncSpan();

  host.appendChild(el("div", { class: "ae-setup-inner" },
    el("h1", { class: "ae-title", "aria-label": "Aeon" }, AEON.pixelLabel ? AEON.pixelLabel("Aeon", "#8a3a22", 9) : "AEON"),
    el("p", { class: "ae-tagline", text: "Generate a world. Simulate its history. Read what happened." }),
    el("div", { class: "ae-label", text: "Choose a history" }),
    cards,
    el("div", { class: "ae-seedrow" },
      el("div", { style: "flex:1" },
        el("div", { class: "ae-label", text: "Seed" }),
        seedInput),
      el("button", { class: "ae-btn", text: "🎲", title: "Random seed", onclick: function () {
        seedInput.value = String(Math.floor(Math.random() * 1e9));
      } })),
    spanLabel,
    el("button", { class: "ae-btn primary big", text: "Forge the world", onclick: function () {
      start(chosenPack, seedInput.value.trim() || "0");
    } })));
}

/* -------------------------------------------------------- generation --- */

function start(packId, seed) {
  const n = Number(seed);
  try {
    world = AEON.createWorld({ packId: packId, seed: isNaN(n) ? seed : n });
  } catch (e) {
    console.error(e);
    alert("World generation failed: " + e.message);
    return;
  }
  AEON.world = world;
  const extras = (location.hash.match(/(year=-?\d+|mode=[a-z]+)/g) || []).map(function (s) { return "&" + s; }).join("");
  history.replaceState(null, "", "#pack=" + packId + "&seed=" + encodeURIComponent(seed) + extras);
  dom.setup.classList.add("hidden");
  dom.app.classList.remove("hidden");

  view = { zoom: 1, panX: 0, panY: 0 };
  selectedRegion = null;
  mapMode = "political";
  const mm = /mode=([a-z]+)/.exec(location.hash);
  if (mm && AEON.render && AEON.render.modes.indexOf(mm[1]) >= 0) mapMode = mm[1];
  buildApp();
  simulateAll();
}

function simulateAll() {
  simulating = true;
  const total = Math.round((world.endYear - world.startYear) / world.timeStep);
  let done = 0;
  dom.progress.classList.remove("hidden");

  function chunk() {
    const t0 = performance.now();
    while (performance.now() - t0 < 22 && world.year < world.endYear) {
      AEON.tick(world);
      done++;
    }
    const pct = Math.min(100, (done / total) * 100);
    dom.progressBar.style.width = pct.toFixed(1) + "%";
    dom.progressLabel.textContent =
      "Simulating " + world.pack.yearLabel(world.year) + " — " +
      world.chronicle.length.toLocaleString() + " events recorded";
    drawMap();

    if (world.year < world.endYear) {
      rafId = requestAnimationFrame(chunk);
    } else {
      AEON.finish(world);
      dom.progress.classList.add("hidden");
      simulating = false;
      onSimulationComplete();
    }
  }
  rafId = requestAnimationFrame(chunk);
}

function onSimulationComplete() {
  const ym = /year=(-?\d+)/.exec(location.hash);
  buildChronicle();
  setPlaybackYear(ym ? Number(ym[1]) : world.startYear);
}

/* ---------------------------------------------------------- playback --- */

let playbackYear = 0;
let simulating = false;
let scrubbing = false, scrubTimer = 0;

/* the world as it stood in the scrubbed year; the live world while generating */
function shown() { return simulating || !AEON.viewAt ? world : AEON.viewAt(world, playbackYear); }

function visibleWorld() {
  return world;
}

function updateStatus() {
  if (!world) return;
  const s = AEON.summary(world);
  dom.status.innerHTML = "";
  dom.status.appendChild(el("span", { class: "ae-stat" },
    el("b", { text: world.pack.yearLabel(playbackYear) }), el("i", { text: "year" })));
  dom.status.appendChild(el("span", { class: "ae-stat" },
    el("b", { text: String(countAliveAt(playbackYear)) }), el("i", { text: "powers" })));
  dom.status.appendChild(el("span", { class: "ae-stat" },
    el("b", { text: s.events.toLocaleString() }), el("i", { text: "events" })));
  dom.status.appendChild(el("span", { class: "ae-stat" },
    el("b", { text: s.polities.toLocaleString() }), el("i", { text: "polities in all" })));
  dom.status.appendChild(el("span", { class: "ae-stat" },
    el("b", { text: s.artifacts.toLocaleString() }), el("i", { text: "artifacts" })));
}

function countAliveAt(year) {
  let n = 0;
  for (const id in world.polities) {
    const p = world.polities[id];
    if (p.founded <= year && (p.ended == null || p.ended > year)) n++;
  }
  return n;
}

/* how: "play" while playback runs (its changes are animated as it passes them), "scrub" while
   the slider is dragged (the moment plays once it settles), otherwise a jump, which plays the
   moment straight away (mapfx.js) */
function setPlaybackYear(y, how) {
  const from = playbackYear;
  playbackYear = Math.max(world.startYear, Math.min(world.endYear, y));
  const fx = AEON.mapfx && !simulating && ambientOn() ? AEON.mapfx : null;
  if (fx) {
    if (how === "play") fx.collect(world, from, playbackYear);
    else if (how === "scrub") fx.clear();
    else fx.moment(world, playbackYear);
  }
  dom.scrub.value = String(playbackYear);
  updateStatus();
  drawMap();
  if (AEON.chronicle && AEON.chronicle.setYear) AEON.chronicle.setYear(playbackYear);
  if (AEON.stats && AEON.stats.isOpen()) AEON.stats.setYear(playbackYear);
  if (how !== "play") runFx();
}

/* while animations are playing and playback is not, redraw every frame until they end */
let fxRaf = 0;
function runFx() {
  if (fxRaf || playing || !AEON.mapfx) return;
  const step = function () {
    fxRaf = 0;
    if (playing) return;
    drawMap();
    if (AEON.mapfx.live()) fxRaf = requestAnimationFrame(step);
  };
  if (AEON.mapfx.live()) fxRaf = requestAnimationFrame(step);
}

/* the statistics sheet, laid over the map */
function toggleStats(force) {
  if (!AEON.stats) return;
  const open = force != null ? force : !AEON.stats.isOpen();
  if (!open) { AEON.stats.close(); if (dom.statsBtn) dom.statsBtn.classList.remove("on"); return; }
  if (AEON.stats.isOpen()) return;
  hideTip();
  AEON.stats.open(dom.mapWrap, world, {
    getYear: function () { return playbackYear; },
    onSetYear: function (y) { setPlaybackYear(y); },
    onShowPolity: function (id) { if (AEON.chronicle && AEON.chronicle.show) AEON.chronicle.show("polity", id); },
    onShowEvent: function (id) { if (AEON.chronicle && AEON.chronicle.show) AEON.chronicle.show("event", id); },
    onShowArtifact: function (id) { if (AEON.chronicle && AEON.chronicle.show) AEON.chronicle.show("artifact", id); },
    onClose: function () { toggleStats(false); },
  });
  if (dom.statsBtn) dom.statsBtn.classList.add("on");
}

function togglePlay() {
  playing = !playing;
  dom.playBtn.textContent = playing ? "⏸" : "▶";
  if (playing) { playLast = 0; playOwed = 0; loop(); } else { drawMap(); runFx(); }
}

function loop(now) {
  if (!playing) return;
  now = now || performance.now();
  /* years owed since the last frame, at most a quarter second's worth after a stall */
  playOwed += Math.min(0.25, playLast ? (now - playLast) / 1000 : 0) * playSpeed;
  playLast = now;
  const ticks = Math.floor(playOwed / world.timeStep);
  if (ticks > 0) {
    playOwed -= ticks * world.timeStep;
    setPlaybackYear(playbackYear + ticks * world.timeStep, "play");
  } else drawMap();                                        /* the animations still move */
  if (playbackYear >= world.endYear) { playing = false; dom.playBtn.textContent = "▶"; drawMap(); runFx(); return; }
  rafId = requestAnimationFrame(loop);
}

/* --------------------------------------------------------------- map --- */

/* The map's ambient animation (shore foam, sea glints, cloud shadows) runs at about 11 frames a
   second while nothing else is redrawing it, and never for readers who ask for reduced motion. */
const AMBIENT_MS = 90;
const reducedMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
function ambientOn() { return !(reducedMotion && reducedMotion.matches); }
let ambientTimer = null;
function startAmbient() {
  if (ambientTimer || !ambientOn()) return;
  ambientTimer = setInterval(function () {
    if (!world || simulating || playing || scrubbing || document.hidden) return;
    if (AEON.stats && AEON.stats.isOpen()) return;
    drawMap();
  }, AMBIENT_MS);
}

/* the legend for a data mode: its name, the ramp, and what the two ends mean */
const LEGENDS = {
  population: ["People", "few", "many"],
  habitability: ["Habitability", "harsh", "kind"],
  elevation: ["Elevation", "coast", "peaks"],
};
function updateLegend() {
  const L = dom.legend, spec = LEGENDS[mapMode], ramp = AEON.mapRamps && AEON.mapRamps[mapMode];
  if (!L) return;
  if (!spec || !ramp) { L.classList.add("hidden"); return; }
  if (L._mode === mapMode) { L.classList.remove("hidden"); return; }
  L._mode = mapMode;
  L.textContent = "";
  L.appendChild(el("b", { text: spec[0] }));
  const bar = el("span", { class: "ae-legend-ramp" });
  for (const c of ramp) { const i = el("i"); i.style.background = c; bar.appendChild(i); }
  L.appendChild(el("span", { text: spec[1] }));
  L.appendChild(bar);
  L.appendChild(el("span", { text: spec[2] }));
  L.classList.remove("hidden");
}

function drawMap() {
  if (!world || !AEON.render) return;
  updateLegend();
  clampView();
  try {
    AEON.render.draw(dom.canvas, shown(), {
      mode: mapMode,
      year: playbackYear,
      hoverRegion: hoverRegion,
      selectedRegion: selectedRegion,
      showRivers: true,
      showRoads: true,
      time: ambientOn() ? performance.now() : null,
      zoom: view.zoom, panX: view.panX, panY: view.panY,
    });
  } catch (e) {
    console.error("[aeon] render failed", e);
  }
}

/* ------------------------------------------------------------- shell --- */

function buildApp() {
  dom.app.innerHTML = "";

  dom.canvas = el("canvas", { class: "ae-canvas" });
  const mapWrap = dom.mapWrap = el("div", { class: "ae-mapwrap" }, dom.canvas);

  dom.progressBar = el("i");
  dom.progressLabel = el("div", { class: "ae-progress-label" });
  dom.progress = el("div", { class: "ae-progress" },
    dom.progressLabel,
    el("div", { class: "ae-progress-track" }, dom.progressBar));
  mapWrap.appendChild(dom.progress);

  const modes = ["political", "biome", "population", "elevation", "habitability"];
  const modeBar = el("div", { class: "ae-modes" });
  modes.forEach(function (m) {
    modeBar.appendChild(el("button", {
      class: "ae-mode" + (m === mapMode ? " on" : ""), text: m,
      onclick: function (e) {
        mapMode = m;
        toggleStats(false);
        modeBar.querySelectorAll(".ae-mode").forEach(function (b) { b.classList.remove("on"); });
        e.target.classList.add("on");
        drawMap();
      },
    }));
  });

  dom.legend = el("div", { class: "ae-legend hidden" });
  mapWrap.appendChild(dom.legend);

  dom.playBtn = el("button", { class: "ae-btn round", text: "▶", onclick: togglePlay });
  dom.scrub = el("input", { class: "ae-scrub", type: "range",
    min: String(world.startYear), max: String(world.endYear), step: String(world.timeStep),
    value: String(world.startYear) });
  dom.scrub.addEventListener("input", function () {
    playing = false; dom.playBtn.textContent = "▶";
    scrubbing = true;
    clearTimeout(scrubTimer);
    scrubTimer = setTimeout(function () {
      scrubbing = false;
      if (AEON.mapfx && ambientOn()) AEON.mapfx.moment(world, playbackYear);
      drawMap(); runFx();
    }, 160);
    setPlaybackYear(Number(dom.scrub.value), "scrub");
  });

  const speedSel = el("select", { class: "ae-select", title: "Years per second", onchange: function (e) { playSpeed = Number(e.target.value); } });
  SPEEDS.forEach(function (v) {
    const o = el("option", { value: String(v), text: v + " yr/s" });
    if (v === playSpeed) o.selected = true;
    speedSel.appendChild(o);
  });

  dom.status = el("div", { class: "ae-status" });

  const transport = el("div", { class: "ae-transport" },
    dom.playBtn, dom.scrub, speedSel,
    el("button", { class: "ae-btn", text: "⏮", title: "Back to the beginning",
      onclick: function () { playing = false; dom.playBtn.textContent = "▶"; setPlaybackYear(world.startYear); } }),
    el("button", { class: "ae-btn", text: "⏭", title: "Jump to the end",
      onclick: function () { playing = false; dom.playBtn.textContent = "▶"; setPlaybackYear(world.endYear); } }));

  dom.chronicleHost = el("div", { class: "ae-chronicle" });

  const header = el("header", { class: "ae-header" },
    el("div", { class: "ae-brand" },
      el("span", { class: "ae-brand-mark", text: "◷" }),
      AEON.pixelLabel ? AEON.pixelLabel("Aeon", "#8a3a22", 3) : el("span", { text: "AEON" })),
    el("div", { class: "ae-worldname" },
      el("b", { text: world.pack.name }),
      el("span", { text: "seed " + world.seed })),
    dom.status,
    el("div", { class: "ae-header-actions" },
      dom.statsBtn = el("button", { class: "ae-btn", text: "Statistics", title: "How the world's people and land were shared out",
        onclick: function () { toggleStats(); } }),
      el("button", { class: "ae-btn", text: "Export", onclick: exportChronicle }),
      el("button", { class: "ae-btn", text: "New world", onclick: function () {
        toggleStats(false);
        playing = false;
        cancelAnimationFrame(rafId);
        dom.app.classList.add("hidden");
        dom.setup.classList.remove("hidden");
        mountSetup();
      } })));

  dom.app.appendChild(header);
  dom.app.appendChild(el("div", { class: "ae-main" },
    el("div", { class: "ae-left" }, modeBar, mapWrap, transport),
    dom.chronicleHost));

  wireMap();
  updateStatus();
  requestAnimationFrame(function () { fitView(); drawMap(); });
  startAmbient();
}

function buildChronicle() {
  if (!AEON.chronicle || !AEON.chronicle.mount) {
    dom.chronicleHost.appendChild(el("div", { class: "ae-empty" },
      el("p", { text: "The chronicle module failed to load." })));
    return;
  }
  try {
    AEON.chronicle.mount(dom.chronicleHost, world, {
      onFocusRegion: function (rid) {
        selectedRegion = rid;
        const r = world.regions[rid];
        if (r) centerOn(r);
        drawMap();
      },
      onSelectPolity: function (pid) {
        const p = world.polities[pid];
        if (p && p.capital != null) {
          selectedRegion = p.capital;
          centerOn(world.regions[p.capital]);
          drawMap();
        }
      },
      onSetYear: function (y) { setPlaybackYear(y); },
    });
  } catch (e) {
    console.error("[aeon] chronicle failed to mount", e);
  }
}

/* CSS pixels per cell. The pixel renderer snaps zoom to whole device pixels, so ask it. */
function cellSize() {
  const R = AEON.render;
  if (R.pixelScale) return R.pixelScale(dom.canvas, world, view.zoom).s;
  return Math.min(dom.canvas.clientWidth / world.width, dom.canvas.clientHeight / world.height) * view.zoom;
}

/* start with the whole map in view, centred, at a crisp whole-pixel scale */
function fitView() {
  const R = AEON.render;
  view = { zoom: 1, panX: 0, panY: 0 };
  if (R.pixelScale) {
    const ps = R.pixelScale(dom.canvas, world, 1);
    view.zoom = ps.zoomFor(ps.P);
  }
  const s = cellSize();
  view.panX = (openWidth() - world.width * s) / 2;
  view.panY = (dom.canvas.clientHeight - world.height * s) / 2;
}

/* how much of the canvas is open map: the chronicle panel floats over its right side */
function openWidth() {
  const cw = dom.canvas.clientWidth, ch = dom.chronicleHost;
  if (!ch) return cw;
  const left = ch.getBoundingClientRect().left - dom.canvas.getBoundingClientRect().left;
  return left > 200 && left < cw ? left : cw;
}

/* keep the map on screen: it can't be dragged past its edges, and it is centred
   along any axis where it is smaller than the view */
function clampView() {
  if (!dom.canvas) return;
  const s = cellSize(), cw = openWidth(), ch = dom.canvas.clientHeight;
  const mw = world.width * s, mh = world.height * s;
  view.panX = mw <= cw ? (cw - mw) / 2 : Math.min(0, Math.max(cw - mw, view.panX));
  view.panY = mh <= ch ? (ch - mh) / 2 : Math.min(0, Math.max(ch - mh, view.panY));
}

function centerOn(region) {
  if (!region || !dom.canvas) return;
  const w = dom.canvas.clientWidth, h = dom.canvas.clientHeight;
  const cell = cellSize();
  view.panX = w / 2 - (region.x + 0.5) * cell;
  view.panY = h / 2 - (region.y + 0.5) * cell;
}

function wireMap() {
  const c = dom.canvas;
  let dragging = false, lastX = 0, lastY = 0, moved = 0;

  c.addEventListener("mousedown", function (e) {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener("mouseup", function () { dragging = false; });
  c.addEventListener("mousemove", function (e) {
    const r = c.getBoundingClientRect();
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      view.panX += dx; view.panY += dy;
      lastX = e.clientX; lastY = e.clientY;
      c.style.cursor = "grabbing";
      drawMap();
      return;
    }
    if (!AEON.render.hitTest) return;
    const id = AEON.render.hitTest(c, world, e.clientX - r.left, e.clientY - r.top, {
      zoom: view.zoom, panX: view.panX, panY: view.panY,
    });
    /* over the map the brackets round the cell are the cursor; off it, the usual pointer */
    c.style.cursor = id != null ? "none" : "";
    if (id !== hoverRegion) { hoverRegion = id; drawMap(); showTip(e, id); }
    else showTip(e, id);
  });
  c.addEventListener("mouseleave", function () {
    hoverRegion = null; hideTip(); drawMap();
  });
  c.addEventListener("click", function (e) {
    if (moved > 5) return;
    const r = c.getBoundingClientRect();
    const id = AEON.render.hitTest ? AEON.render.hitTest(c, world, e.clientX - r.left, e.clientY - r.top, {
      zoom: view.zoom, panX: view.panX, panY: view.panY,
    }) : null;
    selectedRegion = id;
    drawMap();
    if (id != null && AEON.chronicle && AEON.chronicle.show) AEON.chronicle.show("region", id);
  });
  c.addEventListener("wheel", function (e) {
    e.preventDefault();
    const r = c.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let nz, k;
    if (AEON.render.pixelScale) {
      /* one wheel notch = one more (or fewer) device pixel per map pixel */
      const ps = AEON.render.pixelScale(c, world, view.zoom);
      const P2 = Math.max(1, Math.min(24, ps.P + (e.deltaY < 0 ? 1 : -1)));
      if (P2 === ps.P) return;
      nz = ps.zoomFor(P2); k = P2 / ps.P;
    } else {
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      nz = Math.max(0.5, Math.min(12, view.zoom * factor));
      k = nz / view.zoom;
    }
    view.panX = mx - (mx - view.panX) * k;
    view.panY = my - (my - view.panY) * k;
    view.zoom = nz;
    drawMap();
  }, { passive: false });

  window.addEventListener("resize", drawMap);
}

let tipEl = null;
function showTip(e, id) {
  if (id == null) { hideTip(); return; }
  const view = shown();
  const r = view.regions[id];
  if (!r) { hideTip(); return; }
  if (!tipEl) { tipEl = el("div", { class: "ae-tip" }); document.body.appendChild(tipEl); }
  const key = id + "@" + view.year;
  if (tipEl._for !== key) { tipEl._for = key; fillTip(view, r); }
  tipEl.style.display = "block";
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  tipEl.style.left = (e.clientX + 18 + w > window.innerWidth ? e.clientX - 12 - w : e.clientX + 18) + "px";
  tipEl.style.top = Math.max(4, Math.min(e.clientY + 18, window.innerHeight - h - 4)) + "px";
}
/* the plaque's contents: the realm that holds the cell in the shown year and who rules it,
   then the place itself. Population is only known for the end of the record. */
function fillTip(view, r) {
  const year = view.year, live = year >= world.year, pack = world.pack;
  const owner = r.owner != null ? view.polities[r.owner] : null;
  const biome = (pack.biomes && pack.biomes[r.biome]) || {};
  tipEl.replaceChildren();
  if (owner) {
    const sw = el("i", { class: "ae-tip-swatch" });
    sw.style.background = owner.color;
    tipEl.appendChild(el("div", { class: "ae-tip-name" }, sw, el("span", { text: owner.name })));
    const f = AEON.rulerAt ? AEON.rulerAt(world, owner.id, year) : null;
    tipEl.appendChild(el("div", { text: f ? (f.title ? f.title + " " : "") + f.name + ", reigning" : "No ruler at present" }));
    let provinces = 0;
    for (const x of view.regions) if (x.owner === owner.id) provinces++;
    const bits = [provinces + (provinces === 1 ? " province" : " provinces")];
    if (live && owner.population) bits.unshift(owner.population.toLocaleString() + " people");
    bits.push((owner.archetypeName ? owner.archetypeName + ", " : "") + "since " + pack.yearLabel(owner.founded));
    tipEl.appendChild(el("div", { class: "dim", text: bits.join(" · ") }));
    const age = AEON.ageAt ? AEON.ageAt(world, owner.id, year) : null;
    if (age && age.age) tipEl.appendChild(el("div", { class: "dim", text: age.age.name }));
    tipEl.appendChild(el("div", { class: "ae-tip-rule" }));
  }
  const s = r.settlement, place = (s && s.name) || r.name;
  tipEl.appendChild(el("div", { class: "ae-tip-place", text: place || biome.name || r.biome || "Unclaimed land" }));
  /* with no name of its own the place is titled by its biome, so don't repeat it */
  const where = [s ? (AEON.settlementType ? AEON.settlementType(view, r.id) : AEON.tierName(pack, s.tier)) : null, place ? biome.name || r.biome : null].filter(Boolean);
  if (s && r.name && r.name !== s.name) where.push("in " + r.name);
  if (where.length) tipEl.appendChild(el("div", { class: "dim", text: where.join(" · ") }));
  const more = [];
  if (live && r.population) more.push(r.population.toLocaleString() + " souls");
  if (r.features && r.features.length) more.push(r.features.join(", "));
  /* the wonders standing here in the shown year */
  const ws = AEON.wondersAt ? AEON.wondersAt(world, r.id, year) : [];
  for (const a of ws) tipEl.appendChild(el("div", { class: "ae-tip-wonder", text: a.name + ", raised " + pack.yearLabel(a.created) }));
  if (more.length) tipEl.appendChild(el("div", { class: "dim", text: more.join(" · ") }));
}
function hideTip() { if (tipEl) tipEl.style.display = "none"; }

/* ------------------------------------------------------------ export --- */

function exportChronicle() {
  const lines = [];
  const p = world.pack;
  lines.push("# " + p.name + " — seed " + world.seed);
  lines.push("");
  const s = AEON.summary(world);
  lines.push("_" + s.events.toLocaleString() + " recorded events, " + s.polities +
             " polities, " + s.figures + " figures, " + s.artifacts + " artifacts._");
  lines.push("");
  let era = null;
  for (const ev of world.chronicle) {
    if (ev.type === "era-change") { lines.push(""); lines.push("## " + ev.text); lines.push(""); continue; }
    const stars = ev.importance >= 4 ? "**" : "";
    lines.push("- " + p.yearLabel(ev.year) + " — " + stars + ev.text + stars);
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "aeon-" + world.packId + "-" + world.seed + ".md";
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* -------------------------------------------------------------- boot --- */

function boot() {
  dom.setup = document.getElementById("setup");
  dom.app = document.getElementById("app");

  /* the parchment look has a single theme; the old light/dark toggle is hidden by its stylesheet */
  let saved = null;
  try { saved = localStorage.getItem("aeon.theme"); } catch (e) {}
  if (saved && !AEON.pixelLabel) document.documentElement.setAttribute("data-theme", saved);
  const tog = document.getElementById("themeToggle");
  if (tog) tog.addEventListener("click", function () {
    const cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", cur);
    try { localStorage.setItem("aeon.theme", cur); } catch (e) {}
    drawMap();
  });

  mountSetup();

  /* deep link: #pack=fantasy&seed=42 forges that exact world straight away */
  const pm = /pack=([a-z]+)/.exec(location.hash), sm = /seed=([^&]+)/.exec(location.hash);
  if (pm && AEON.packs[pm[1]]) start(pm[1], sm ? decodeURIComponent(sm[1]) : "0");
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

})();
