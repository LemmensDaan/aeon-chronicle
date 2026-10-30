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
/* playback speed in days per second (whole ticks are taken as the time adds up), so it is the
   same on any screen; the slow speeds leave time for the event animations (mapfx.js). At a year
   a second or slower the seasons show on the map; faster, it shows the land as it mostly is. */
const YEAR_DAYS = 365, SEASON_SPEED = YEAR_DAYS;
let playSpeed = 50 * YEAR_DAYS;
const SPEEDS = [[1, "1 day/s"], [10, "10 days/s"], [30, "1 month/s"], [91, "1 season/s"], [365, "1 yr/s"],
  [5 * 365, "5 yr/s"], [25 * 365, "25 yr/s"], [50 * 365, "50 yr/s"], [100 * 365, "100 yr/s"]];
/* playOwed: the years played since the shown tick began, so the date is playbackYear + playOwed;
   kept over a pause, dropped when the year is set by hand */
let playLast = 0, playOwed = 0;
function season() { return playSpeed <= SEASON_SPEED ? ((playOwed % 1) + 1) % 1 : null; }
/* the season north of the equator, for the status line */
const SEASON_NAMES = ["midwinter", "late winter", "early spring", "spring", "late spring", "early summer",
  "midsummer", "late summer", "early autumn", "autumn", "late autumn", "early winter"];
function seasonName(f) { return SEASON_NAMES[Math.floor(((f - 0.05 + 1 / 24 + 1) % 1) * 12) % 12]; }
/* the map animations stand still while playback is paused (mapfx.js keeps their clock) */
let fxFrozen = false;
/* how often great moments slow history down (mapfx.js setPace), and the realm being followed */
let pace = "some", followed = null;
/* the camera follows the action: while a great moment holds the year, the map zooms in (to at
   least CAM_P device pixels a map pixel) and glides over to it */
let camera = true;
const CAM_P = 3;
let rafId = 0;
let mapMode = "political";
/* the World mode (worldview.js): the contact picked out from the world timeline, and the timeline */
let worldPick = null, worldLine = null;
/* The planet and its regions (js/region.js): the app opens on the planet, which has the world
   sketch and no history of its own; opening a square makes its region and plays its history.
   Opened regions are kept for the session. */
let planet = null, regionCache = {};
function onPlanet() { return !!planet && world === planet; }
const PLANET_MODES = ["world", "ages", "biome", "elevation", "habitability"];
/* the modes drawn from the world sketch */
function sketchMode() { return mapMode === "world" || mapMode === "ages"; }
const REGION_MODES = ["political", "diplomacy", "biome", "population", "elevation", "habitability"];
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
    planet = AEON.createWorld({ packId: packId, seed: isNaN(n) ? seed : n, planetOnly: true });
  } catch (e) {
    console.error(e);
    alert("World generation failed: " + e.message);
    return;
  }
  regionCache = {};
  const hash = location.hash;
  dom.setup.classList.add("hidden");
  dom.app.classList.remove("hidden");
  const ym = /year=(-?\d+)/.exec(hash), rm = /region=(\d+),(\d+)/.exec(hash), mm = /mode=([a-z]+)/.exec(hash);
  showPlanet(ym ? Number(ym[1]) : null, mm ? mm[1] : null);
  if (rm && planet.sketch) {
    const si = planet.sketch.squares.findIndex(function (q) { return q.id === rm[1] + "," + rm[2]; });
    if (si >= 0 && planet.sketch.squares[si].peoples.length) openRegion(si, mm ? mm[1] : null);
  }
}

/* the link to what is shown: the world, its region, the map mode and the year */
function writeHash() {
  if (!planet) return;
  let h = "#pack=" + planet.packId + "&seed=" + encodeURIComponent(planet.seed);
  if (!onPlanet() && world.square) h += "&region=" + world.square.id;
  h += "&mode=" + mapMode + "&year=" + playbackYear;
  history.replaceState(null, "", h);
}

/* the planet: its sketch in the World mode, and the world timeline in the sidebar */
function showPlanet(year, mode) {
  stopRegion();
  world = planet; AEON.world = planet;
  view = { zoom: 1, panX: 0, panY: 0 };
  selectedRegion = null; hoverRegion = null;
  mapMode = mode && PLANET_MODES.indexOf(mode) >= 0 ? mode : "world";
  simulating = false;
  buildApp();
  setPlaybackYear(year != null ? year : playbackYear || planet.startYear);
}

/* a region: made and played the first time, kept after */
function openRegion(si, mode) {
  const year = playbackYear;
  stopRegion();
  let rw = regionCache[si];
  if (!rw) {
    try { rw = regionCache[si] = AEON.createRegion(planet, si); }
    catch (e) { console.error(e); alert("The region could not be made: " + e.message); return; }
  }
  world = rw; AEON.world = rw;
  view = { zoom: 1, panX: 0, panY: 0 };
  selectedRegion = null; hoverRegion = null;
  mapMode = mode && REGION_MODES.indexOf(mode) >= 0 ? mode : "political";
  buildApp();
  if (rw._played) { buildChronicle(); setPlaybackYear(year); }
  else { playbackYear = year; simulateAll(); }
}

/* leave whatever is running in the shown world */
function stopRegion() {
  playing = false;
  cancelAnimationFrame(rafId);
  cancelAnimationFrame(fxRaf); fxRaf = 0;
  toggleStats(false);
  hideTip();
}

function simulateAll() {
  simulating = true;
  const total = Math.round((world.endYear - world.startYear) / world.timeStep);
  let done = Math.round((world.year - world.startYear) / world.timeStep);
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
      world._played = true;
      dom.progress.classList.add("hidden");
      simulating = false;
      onSimulationComplete();
    }
  }
  rafId = requestAnimationFrame(chunk);
}

function onSimulationComplete() {
  buildChronicle();
  setPlaybackYear(playbackYear || world.startYear);
}

/* ---------------------------------------------------------- playback --- */

let playbackYear = 0;
let simulating = false;
let scrubbing = false, scrubTimer = 0;

/* the world as it stood in the scrubbed year; the live world while generating */
function shown() { return simulating || onPlanet() || !AEON.viewAt ? world : AEON.viewAt(world, playbackYear); }

function visibleWorld() {
  return world;
}

/* the season in the status line, while playback is slow enough to show it */
function addSeasonStat() {
  dom.seasonStat = el("span", { class: "ae-stat", title: "The season north of the equator; the south has the opposite one" }, el("b"), el("i", { text: "season" }));
  dom.status.appendChild(dom.seasonStat);
  seasonStatus();
}
function seasonStatus() {
  if (!dom.seasonStat) return;
  const f = season(), name = f == null ? "" : seasonName(f);
  dom.seasonStat.classList.toggle("hidden", f == null);
  if (dom.seasonStat.firstChild.textContent !== name) dom.seasonStat.firstChild.textContent = name;
}

function updateStatus() {
  if (!world) return;
  if (onPlanet()) return planetStatus();
  const s = AEON.summary(world);
  dom.status.innerHTML = "";
  dom.status.appendChild(el("span", { class: "ae-stat" },
    el("b", { text: world.pack.yearLabel(playbackYear) }), el("i", { text: "year" })));
  addSeasonStat();
  dom.status.appendChild(el("span", { class: "ae-stat" },
    el("b", { text: String(countAliveAt(playbackYear)) }), el("i", { text: "powers" })));
  dom.status.appendChild(el("span", { class: "ae-stat" },
    el("b", { text: s.events.toLocaleString() }), el("i", { text: "events" })));
  dom.status.appendChild(el("span", { class: "ae-stat" },
    el("b", { text: s.polities.toLocaleString() }), el("i", { text: "polities in all" })));
  dom.status.appendChild(el("span", { class: "ae-stat" },
    el("b", { text: s.artifacts.toLocaleString() }), el("i", { text: "artifacts" })));
}

/* on the planet: the year, the peoples living then, and the clashes and crossings so far */
function planetStatus() {
  const sk = planet.sketch, y = playbackYear;
  let peoples = 0, contacts = 0;
  for (const p of sk.peoples) if (p.arrived == null || p.arrived <= y) peoples++;
  for (const c of sk.contacts) if (c.year <= y && c.kind !== "trade" && c.kind !== "dark-age") contacts++;
  dom.status.innerHTML = "";
  const stat = function (v, t) { dom.status.appendChild(el("span", { class: "ae-stat" }, el("b", { text: v }), el("i", { text: t }))); };
  stat(planet.pack.yearLabel(y), "year");
  addSeasonStat();
  stat(String(sk.squares.filter(function (q) { return q.peoples.length; }).length), "lands");
  stat(String(peoples), "peoples");
  stat(String(contacts), "clashes and crossings");
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
  if (how !== "play") playOwed = 0;
  const fx = AEON.mapfx && !simulating && !onPlanet() && ambientOn() ? AEON.mapfx : null;
  if (fx) {
    if (how === "play") fx.collect(world, from, playbackYear);
    else if (how === "scrub") fx.clear();
    else fx.moment(world, playbackYear);
  }
  dom.scrub.value = String(playbackYear);
  updateStatus();
  drawMap();
  if (!onPlanet() && AEON.chronicle && AEON.chronicle.setYear) AEON.chronicle.setYear(playbackYear);
  if (AEON.stats && AEON.stats.isOpen()) AEON.stats.setYear(playbackYear);
  if (worldLine) worldLine.setYear(playbackYear);
  if (how !== "play") { runFx(); writeHash(); }
}

function cameraStep(dt) {
  const rid = AEON.mapfx && AEON.mapfx.focusPoint();
  if (rid == null || !dom.canvas || !AEON.render.pixelScale) return;
  const ps = AEON.render.pixelScale(dom.canvas, world, view.zoom);
  if (ps.P < CAM_P) view.zoom = ps.zoomFor(CAM_P);
  const r = world.regions[rid], cell = cellSize(), w = dom.canvas.clientWidth, h = dom.canvas.clientHeight;
  const tx = w / 2 - (r.x + 0.5) * cell, ty = h / 2 - (r.y + 0.5) * cell, k = Math.min(1, dt / 350);
  view.panX += (tx - view.panX) * k; view.panY += (ty - view.panY) * k;
  clampView();
}

/* a moment jumped to while playback is not running plays out: its animations move on and are
   redrawn every frame until they end, unless playback is paused again */
let fxRaf = 0;
function runFx() {
  if (fxRaf || playing || !AEON.mapfx) return;
  fxFrozen = false;
  let last = 0;
  const step = function (t) {
    fxRaf = 0;
    if (playing || fxFrozen) return;
    AEON.mapfx.advance(last ? t - last : 16);
    last = t;
    drawMap();
    if (AEON.mapfx.live()) fxRaf = requestAnimationFrame(step);
  };
  if (AEON.mapfx.live()) fxRaf = requestAnimationFrame(step);
}

/* Great moments: the years of the chronicle's major events (importance 4 and up), and every
   event of a followed realm, for the previous / next buttons */
function momentYears() {
  const ys = {};
  if (onPlanet()) {
    for (const c of planet.sketch.contacts) if (c.kind !== "trade") ys[c.year] = true;
    return Object.keys(ys).map(Number).sort(function (a, b) { return a - b; });
  }
  for (const e of world.chronicle) {
    if (e.importance >= 4) ys[e.year] = true;
    else if (followed && e.importance >= 2 && e.actors.some(function (a) { return a.kind === "polity" && a.id === followed; })) ys[e.year] = true;
  }
  return Object.keys(ys).map(Number).sort(function (a, b) { return a - b; });
}
function jumpMoment(dir) {
  const ys = momentYears();
  let y = null;
  if (dir > 0) { for (const v of ys) if (v > playbackYear) { y = v; break; } }
  else for (let i = ys.length - 1; i >= 0; i--) if (ys[i] < playbackYear) { y = ys[i]; break; }
  if (y == null) return;
  playing = false; dom.playBtn.textContent = "▶";
  setPlaybackYear(y);
}
/* follow a realm (null: none): its changes always get their animation and slow history down */
function followRealm(pid) {
  followed = pid && world.polities[pid] ? pid : null;
  if (AEON.mapfx) AEON.mapfx.follow(followed);
  if (dom.follow) {
    dom.follow.replaceChildren();
    dom.follow.classList.toggle("hidden", !followed);
    if (followed) {
      const p = world.polities[followed], sw = el("i", { class: "ae-tip-swatch" });
      sw.style.background = p.color;
      dom.follow.appendChild(sw);
      dom.follow.appendChild(el("span", { text: "Following " + p.name }));
      dom.follow.appendChild(el("button", { class: "ae-follow-x", text: "✕", title: "Stop following", onclick: function () { followRealm(null); } }));
    }
  }
}
AEON.follow = followRealm;
AEON.following = function () { return followed; };

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
  fxFrozen = !playing;
  if (playing) { playLast = 0; loop(); } else drawMap();
}

function loop(now) {
  if (!playing) return;
  now = now || performance.now();
  const dt = playLast ? now - playLast : 0;
  playLast = now;
  /* the animations move on with the frame; the years owed since the last frame (at most a
     quarter second's worth after a stall) only while no great moment holds the year still */
  if (AEON.mapfx) AEON.mapfx.advance(dt);
  if (camera) cameraStep(dt);
  /* at the seasonal speeds a tick lasts long enough for its animations: the days go on */
  if (playSpeed <= SEASON_SPEED || !(AEON.mapfx && AEON.mapfx.holding())) playOwed += Math.min(0.25, dt / 1000) * playSpeed / YEAR_DAYS;
  const ticks = Math.floor(playOwed / world.timeStep);
  if (ticks > 0) {
    playOwed -= ticks * world.timeStep;
    setPlaybackYear(playbackYear + ticks * world.timeStep, "play");
  } else { drawMap(); seasonStatus(); }                    /* the animations still move */
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
  elevation: ["Elevation", "0 m", "3,000 m +"],
};
function realmAt(rid) { const r = rid != null && shown().regions[rid]; return r && r.owner != null ? r.owner : null; }
/* the realm the diplomacy map is about: the one under the cursor, else the selected land's, else
   the followed realm (null: none, and the map shows every war and vassal) */
function diploFocus() {
  const v = shown(), pick = function (rid) { const r = rid != null && v.regions[rid]; return r && r.owner != null ? r.owner : null; };
  return pick(hoverRegion) || pick(selectedRegion) || followed || null;
}
function updateLegend() {
  const L = dom.legend, spec = LEGENDS[mapMode], ramp = AEON.mapRamps && AEON.mapRamps[mapMode];
  if (!L) return;
  if (sketchMode() && AEON.worldView) {
    if (L._mode !== mapMode) { L._mode = mapMode; AEON.worldView.fillLegend(L, world, el, mapMode === "ages"); }
    L.classList.remove("hidden");
    return;
  }
  if (mapMode === "diplomacy" && AEON.stanceColors) {
    const f = diploFocus(), key = "diplomacy|" + f;
    if (L._mode === key) { L.classList.remove("hidden"); return; }
    L._mode = key;
    L.textContent = "";
    const S = AEON.stanceColors, item = function (k, t) { const i = el("i", { class: "ae-legend-chip" }); i.style.background = S[k]; L.appendChild(i); L.appendChild(el("span", { text: t })); };
    if (f) {
      item("self", ""); L.appendChild(el("b", { text: world.polities[f].name }));
      item("war", "at war"); item("alliance", "allied"); item("lord", "its lord"); item("vassal", "vassal"); item("truce", "truce"); item("friend", "trade, marriage");
    } else L.appendChild(el("b", { text: "Point at a realm to see how the others stand with it" }));
    L.classList.remove("hidden");
    return;
  }
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
    const worldMode = sketchMode();
    AEON.render.draw(dom.canvas, shown(), {
      mode: worldMode ? "biome" : mapMode,
      focus: mapMode === "diplomacy" ? diploFocus() : null,
      /* the provinces of the realm under the cursor (else the selected land's) are outlined */
      provincesOf: realmAt(hoverRegion) || realmAt(selectedRegion),
      year: playbackYear,
      hoverRegion: hoverRegion,
      selectedRegion: selectedRegion,
      showRivers: true,
      showRoads: true,
      time: ambientOn() ? performance.now() : null,
      season: season(),
      /* the date in days and the speed in days a second, for the storms and the ships (seasons.js) */
      day: (playbackYear + playOwed) * YEAR_DAYS, speed: playSpeed,
      zoom: view.zoom, panX: view.panX, panY: view.panY,
    });
    if (worldMode && AEON.worldView) AEON.worldView.draw(dom.canvas, world, simulating ? world.year : playbackYear, { highlight: worldPick, pick: dom.squarePlaque && dom.squarePlaque._si, ages: mapMode === "ages" });
    if (!onPlanet() && AEON.worldView) {
      AEON.worldView.drawBeyond(dom.canvas, world);
      AEON.worldView.drawArrivals(dom.canvas, world, simulating ? world.year : playbackYear);
    }
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
  dom.progress = el("div", { class: "ae-progress hidden" },
    dom.progressLabel,
    el("div", { class: "ae-progress-track" }, dom.progressBar));
  mapWrap.appendChild(dom.progress);

  const modes = onPlanet() ? (AEON.worldView && world.sketch ? PLANET_MODES : PLANET_MODES.slice(1)) : REGION_MODES;
  const modeBar = el("div", { class: "ae-modes" });
  modes.forEach(function (m) {
    modeBar.appendChild(el("button", {
      class: "ae-mode" + (m === mapMode ? " on" : ""), text: m,
      onclick: function (e) {
        mapMode = m;
        toggleStats(false);
        modeBar.querySelectorAll(".ae-mode").forEach(function (b) { b.classList.remove("on"); });
        e.target.classList.add("on");
        writeHash();
        drawMap();
      },
    }));
  });

  dom.legend = el("div", { class: "ae-legend hidden" });
  mapWrap.appendChild(dom.legend);

  /* a square picked on the planet, with the button that opens its region */
  dom.squarePlaque = el("div", { class: "wv-pick hidden" });
  mapWrap.appendChild(dom.squarePlaque);

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

  const speedSel = el("select", { class: "ae-select", title: "Playback speed (a year a second or slower shows the seasons)",
    onchange: function (e) { playSpeed = Number(e.target.value); seasonStatus(); drawMap(); } });
  SPEEDS.forEach(function (v) {
    const o = el("option", { value: String(v[0]), text: v[1] });
    if (v[0] === playSpeed) o.selected = true;
    speedSel.appendChild(o);
  });
  /* how often history slows down so a great moment can play out */
  const paceSel = el("select", { class: "ae-select", title: "Slow down for great moments",
    onchange: function (e) { pace = e.target.value; if (AEON.mapfx) AEON.mapfx.setPace(pace); } });
  [["off", "Never slow"], ["some", "Slow sometimes"], ["all", "Slow for all major"]].forEach(function (v) {
    const o = el("option", { value: v[0], text: v[1] });
    if (v[0] === pace) o.selected = true;
    paceSel.appendChild(o);
  });
  if (AEON.mapfx) AEON.mapfx.setPace(pace);
  dom.follow = el("div", { class: "ae-follow hidden" });
  const camBtn = el("button", { class: "ae-btn on", text: "◎", title: "The map follows the action (great moments)",
    onclick: function () { camera = !camera; camBtn.classList.toggle("on", camera); } });

  dom.status = el("div", { class: "ae-status" });

  const transport = el("div", { class: "ae-transport" },
    dom.playBtn, dom.scrub, dom.follow, speedSel, paceSel, camBtn,
    el("button", { class: "ae-btn", text: "‹", title: "Previous great moment", onclick: function () { jumpMoment(-1); } }),
    el("button", { class: "ae-btn", text: "›", title: "Next great moment", onclick: function () { jumpMoment(1); } }),
    el("button", { class: "ae-btn", text: "⏮", title: "Back to the beginning",
      onclick: function () { playing = false; dom.playBtn.textContent = "▶"; setPlaybackYear(world.startYear); } }),
    el("button", { class: "ae-btn", text: "⏭", title: "Jump to the end",
      onclick: function () { playing = false; dom.playBtn.textContent = "▶"; setPlaybackYear(world.endYear); } }));

  dom.chronicleHost = el("div", { class: "ae-chronicle" });
  /* on the planet the sidebar holds the world timeline instead of a chronicle */
  worldLine = null; worldPick = null;
  if (onPlanet() && AEON.worldView && world.sketch) {
    worldLine = AEON.worldView.Timeline(dom.chronicleHost, world, {
      side: true,
      onSetYear: function (y) { playing = false; dom.playBtn.textContent = "▶"; setPlaybackYear(y); },
      onHighlight: function (c) { worldPick = c; drawMap(); },
      onFocus: focusContact,
    }, el);
  }

  const header = el("header", { class: "ae-header" },
    el("div", { class: "ae-brand" },
      el("span", { class: "ae-brand-mark", text: "◷" }),
      AEON.pixelLabel ? AEON.pixelLabel("Aeon", "#8a3a22", 3) : el("span", { text: "AEON" })),
    el("div", { class: "ae-worldname" },
      el("b", { text: world.pack.name }),
      el("span", { text: "seed " + world.seed + (onPlanet() ? " · the world" : " · region " + world.square.id) })),
    dom.status,
    el("div", { class: "ae-header-actions" },
      onPlanet() ? null : el("button", { class: "ae-btn", text: "Back to the world", title: "The whole planet and its timeline; this region is kept",
        onclick: function () { showPlanet(playbackYear, "world"); } }),
      onPlanet() ? null : dom.statsBtn = el("button", { class: "ae-btn", text: "Statistics", title: "How the region's people and land were shared out",
        onclick: function () { toggleStats(); } }),
      onPlanet() ? null : el("button", { class: "ae-btn", text: "Export", onclick: exportChronicle }),
      el("button", { class: "ae-btn", text: "New world", onclick: function () {
        stopRegion();
        planet = null; regionCache = {};
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

/* a contact clicked in the world timeline: the map shows both ends of its arrow, in the World
   mode */
function focusContact(c) {
  if (!dom.canvas || !AEON.worldView) return;
  if (!sketchMode()) {
    mapMode = "world";
    dom.app.querySelectorAll(".ae-mode").forEach(function (b) { b.classList.toggle("on", b.textContent === "world"); });
  }
  const e = AEON.worldView.contactEnds(world, c), R = AEON.render;
  const dx = Math.abs(e[1][0] - e[0][0]) + 16, dy = Math.abs(e[1][1] - e[0][1]) + 16;
  const cw = openWidth(), ch = dom.canvas.clientHeight;
  view.zoom = 1;
  const want = Math.max(1, Math.min(12, Math.min(cw / dx, ch / dy) / cellSize()));
  if (R.pixelScale) {
    /* the largest whole-pixel scale at which both ends fit */
    const fit = R.pixelScale(dom.canvas, world, 1), u = fit.s / fit.P;
    let P = R.pixelScale(dom.canvas, world, want).P;
    while (P > fit.P && (P * u * dx > cw || P * u * dy > ch)) P--;
    view.zoom = fit.zoomFor(P);
  } else view.zoom = want;
  const cell = cellSize();
  view.panX = cw / 2 - (e[0][0] + e[1][0]) / 2 * cell;
  view.panY = ch / 2 - (e[0][1] + e[1][1]) / 2 * cell;
  writeHash();
  drawMap();
}

function wireMap() {
  const c = dom.canvas;
  let dragging = false, lastX = 0, lastY = 0, moved = 0;

  c.addEventListener("mousedown", function (e) {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
  });
  /* the window's listeners are set once per map, not added again each time the app is rebuilt */
  window.removeEventListener("mouseup", wireMap.up);
  wireMap.up = function () { dragging = false; };
  window.addEventListener("mouseup", wireMap.up);
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
    if (onPlanet()) { pickSquare(id); return; }
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

  window.removeEventListener("resize", drawMap);
  window.addEventListener("resize", drawMap);
}

/* a square picked on the planet: what it is, and the button that opens it */
function pickSquare(rid) {
  const P = dom.squarePlaque, si = AEON.worldView ? AEON.worldView.squareAt(planet, rid) : null;
  if (si == null || !planet.sketch.squares[si].peoples.length) { P.classList.add("hidden"); P._si = null; drawMap(); return; }
  const q = planet.sketch.squares[si], kept = regionCache[si] && regionCache[si]._played;
  P._si = si;
  P.replaceChildren(
    el("b", { text: "Square " + q.id }),
    el("span", { text: AEON.worldView.squareLine(planet, si, playbackYear) }),
    el("button", { class: "ae-btn primary", text: kept ? "Open this region" : "Open this region (plays its history)", onclick: function () { openRegion(si); } }),
    el("button", { class: "ae-btn", text: "✕", title: "Close", onclick: function () { P.classList.add("hidden"); P._si = null; drawMap(); } }));
  P.classList.remove("hidden");
  drawMap();
}

let tipEl = null;
function showTip(e, id) {
  if (id == null) { hideTip(); return; }
  const view = shown();
  const r = view.regions[id];
  if (!r) { hideTip(); return; }
  if (r.beyond && !onPlanet()) {
    if (!tipEl) { tipEl = el("div", { class: "ae-tip" }); document.body.appendChild(tipEl); }
    const k = "beyond@" + id;
    if (tipEl._for !== k) { tipEl._for = k; tipEl.replaceChildren(el("div", { class: "ae-tip-name", text: "Beyond this region" }), el("div", { class: "dim", text: AEON.worldView ? AEON.worldView.beyondLine(world, r) : "Another land" })); }
    tipEl.style.display = "block";
    tipEl.style.left = (e.clientX + 18) + "px"; tipEl.style.top = (e.clientY + 18) + "px";
    return;
  }
  if (!tipEl) { tipEl = el("div", { class: "ae-tip" }); document.body.appendChild(tipEl); }
  const key = id + "@" + view.year + mapMode;
  if (tipEl._for !== key) {
    tipEl._for = key;
    if (sketchMode() && AEON.worldView) { tipEl.replaceChildren(); if (!AEON.worldView.fillTip(tipEl, world, id, playbackYear, el)) fillTip(view, r); }
    else fillTip(view, r);
  }
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
    /* its land that year: regions, and the provinces (core.js makeProvinces) they lie in */
    let regions = 0;
    const provs = {};
    for (const x of view.regions) if (x.owner === owner.id) { regions++; if (x.province != null) provs[x.province] = true; }
    const np = Object.keys(provs).length;
    const bits = [regions + (regions === 1 ? " region" : " regions") + (np ? " in " + np + (np === 1 ? " province" : " provinces") : "")];
    if (live && owner.population) bits.unshift(owner.population.toLocaleString() + " people");
    const form = AEON.typeAt(world, owner, year), kind = form ? form.name : owner.archetypeName;
    bits.push((kind ? kind + ", " : "") + "since " + pack.yearLabel(owner.founded));
    tipEl.appendChild(el("div", { class: "dim", text: bits.join(" · ") }));
    /* how it stood with the others that year: wars, its lord, its vassals, its allies */
    if (AEON.treatiesOf) {
      const by = { war: [], lord: [], vassal: [], alliance: [] };
      for (const t of AEON.treatiesOf(world, owner, year)) {
        const o = world.polities[t.a === owner.id ? t.b : t.a];
        if (!o) continue;
        const k = t.kind === "tribute" ? (t.a === owner.id ? "lord" : "vassal") : t.kind;
        if (by[k] && by[k].indexOf(o.name) < 0) by[k].push(o.name);
      }
      const say = [];
      if (by.war.length) say.push("at war with " + by.war.join(", "));
      if (by.lord.length) say.push("vassal of " + by.lord.join(", "));
      if (by.vassal.length) say.push(by.vassal.length === 1 ? "lord of " + by.vassal[0] : "lord of " + by.vassal.length + " vassals");
      if (by.alliance.length) say.push("allied with " + by.alliance.join(", "));
      if (say.length) tipEl.appendChild(el("div", { class: "dim", text: say.join(" · ") }));
    }
    const forces = AEON.forcesAt(owner, year);
    if (forces) tipEl.appendChild(el("div", { class: "dim", text: forces.army.toLocaleString() + " soldiers · " + forces.navy.toLocaleString() + (forces.navy === 1 ? " ship" : " ships") +
      (forces.income ? " · " + forces.income.toLocaleString() + " " + AEON.currency(world).many + " a year" : "") }));
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
  /* its features; old ruins under a standing settlement are said by "built on the ruins" instead */
  const feats = (r.features || []).filter(function (f) { return !(s && f === "ruins"); });
  if (feats.length) more.push(feats.join(", "));
  /* the wonders standing here in the shown year */
  const ws = AEON.wondersAt ? AEON.wondersAt(world, r.id, year) : [];
  for (const a of ws) tipEl.appendChild(el("div", { class: "ae-tip-wonder", text: "Wonder: " + a.name + ", raised " + pack.yearLabel(a.created) }));
  /* a ruin standing here, a town built on one, and the sacks this place has suffered */
  const ruin = !s && AEON.ruinAt ? AEON.ruinAt(world, r.id, year) : null;
  if (ruin) tipEl.appendChild(el("div", { text: "Ruins" + (ruin.name ? " of " + ruin.name : "") + ", destroyed " + pack.yearLabel(ruin.since) }));
  if (s && s.onRuins && s.onRuins !== s.name) more.push("built on the ruins of " + s.onRuins);
  const sacks = AEON.sacksAt ? AEON.sacksAt(world, r.id, year) : [];
  if (sacks.length) {
    const last = sacks[sacks.length - 1], by = last.by != null && world.polities[last.by];
    more.push((sacks.length === 1 ? "sacked once" : "sacked " + sacks.length + " times") + ", last " + (last.kind === "razed" ? "razed" : "plundered") + (by ? " by " + by.name : "") + " in " + pack.yearLabel(last.year));
  }
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
    lines.push("- " + AEON.dateLabel(world, ev) + " — " + stars + ev.text + stars);
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
