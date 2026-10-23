/* Aeon chronicle: shell.js. The shell: render, mount, and the public AEON.chronicle API. Loaded last.
 * Part of the chronicle browser; see js/chronicle/base.js for how the parts fit together. */
(function () {
"use strict";
var AEON = window.AEON, C = AEON._chronicle;
var S = C.S, h = C.h, add = C.add, clear = C.clear, ent = C.ent, indexEvents = C.indexEvents,
  curEntry = C.curEntry, saveScroll = C.saveScroll, go = C.go, stepNav = C.stepNav,
  onRootClick = C.onRootClick, injectStyle = C.injectStyle, tlRender = C.tlRender,
  buildTimeline = C.buildTimeline, tlUpdate = C.tlUpdate, pagePolity = C.pagePolity,
  pageFigure = C.pageFigure, pageArtifact = C.pageArtifact, pageRegion = C.pageRegion,
  pageEvent = C.pageEvent, pageAtlas = C.pageAtlas, pageSearch = C.pageSearch, setSel = C.setSel,
  pageStory = C.pageStory, gBuildUI = C.gBuildUI, gControls = C.gControls, gShow = C.gShow, gHost = C.gHost;

/* ---------- shell ---------- */
function render() {
  var en = curEntry();
  if (!en || !S.root) return;
  S.live = null;
  var tab = en.v === "entity" ? "" : en.v;
  Object.keys(S.tabs).forEach(function (k) { S.tabs[k].className = "ch-btn" + (k === tab ? " ch-on" : ""); });
  S.backBtn.disabled = S.pos <= 0;
  S.fwdBtn.disabled = S.pos >= S.nav.length - 1;
  gHost(en.v === "graph");
  S.gWrap.style.display = en.v === "graph" ? "flex" : "none";
  if (en.v === "graph") {
    S.pane.style.display = "none";
    S.tlWrap.style.display = "none";
    if (!S.gUI) gBuildUI();
    gControls(en);
    gShow(en);
    return;
  }
  if (en.v === "timeline") {
    S.pane.style.display = "none";
    S.tlWrap.style.display = "flex";
    if (!S.tl) { buildTimeline(); S.tlWrap.appendChild(S.tl.el); }
    else if (S.tl.dirty) { S.tl.dirty = false; tlUpdate(); }
    tlRender();
    return;
  }
  S.tlWrap.style.display = "none";
  S.pane.style.display = "";
  clear(S.pane);
  var pg;
  if (en.v === "story") pg = pageStory();
  else if (en.v === "atlas") pg = pageAtlas();
  else if (en.v === "search") pg = pageSearch(en.q || "");
  else if (en.kind === "polity") pg = pagePolity(en.id);
  else if (en.kind === "figure") pg = pageFigure(en.id);
  else if (en.kind === "artifact") pg = pageArtifact(en.id);
  else if (en.kind === "event") pg = pageEvent(en.id);
  else pg = pageRegion(en.id);
  if (en.v === "entity" && pg.firstChild && ent(en.kind, en.id)) {
    var gt = h("div", "ch-tools"), gb = h("button", "ch-btn", "Show its threads in the graph");
    gb.type = "button";
    gb.addEventListener("click", function () { go({ v: "graph", focus: { kind: en.kind, id: en.id } }); });
    gt.appendChild(gb);
    /* a realm can be followed on the map: its changes always play and slow history down (ui.js) */
    if (en.kind === "polity" && AEON.follow) {
      var on = AEON.following && AEON.following() === en.id, fb = h("button", "ch-btn", on ? "Stop following it on the map" : "Follow it on the map");
      fb.type = "button";
      fb.addEventListener("click", function () { AEON.follow(on ? null : en.id); render(); });
      gt.appendChild(fb);
    }
    pg.insertBefore(gt, pg.firstChild.nextSibling);
  }
  S.pane.appendChild(pg);
  S.pane.scrollTop = en.scroll || 0;
}
function refresh() {
  S.timer = null;
  if (!S.root || !S.world) return;
  var en = curEntry();
  if (!en) return;
  if (S.tl) { if (en.v === "timeline") tlUpdate(); else S.tl.dirty = true; }
  if (en.v === "timeline") return;
  if (en.v === "graph") { gControls(en); gShow(en); return; }
  if (S.live && en.v === "atlas") { S.live(); return; }
  if (en.v === "search" && document.activeElement === S.searchEl) return;
  saveScroll();
  render();
}

function mount(container, world, hooks) {
  S.world = world; S.hooks = hooks || {}; S.ix = null; S.cache = null; S.tl = null; S.nav = []; S.pos = -1;
  S.gUI = null; S.g = null; S.gm = null;
  if (S.gRaf) { cancelAnimationFrame(S.gRaf); S.gRaf = 0; }
  if (S.timer) { clearTimeout(S.timer); S.timer = null; }
  indexEvents();
  injectStyle();
  clear(container);
  var root = S.root = h("div", "ch-root");
  root.setAttribute("role", "region"); root.setAttribute("aria-label", "Chronicle");
  var bar = S.bar = h("div", "ch-bar");
  S.backBtn = h("button", "ch-btn", "←"); S.fwdBtn = h("button", "ch-btn", "→");
  S.backBtn.type = S.fwdBtn.type = "button";
  S.backBtn.title = "Back (Alt+Left)"; S.fwdBtn.title = "Forward (Alt+Right)";
  S.backBtn.addEventListener("click", function () { stepNav(-1); });
  S.fwdBtn.addEventListener("click", function () { stepNav(1); });
  var tabs = h("div", "ch-tabs");
  [["story", "The Story"], ["timeline", "Timeline"], ["atlas", "Atlas"], ["graph", "Graph"]].forEach(function (t) {
    var b = h("button", "ch-btn", t[1]); b.type = "button";
    b.addEventListener("click", function () { go({ v: t[0] }); });
    S.tabs[t[0]] = b; tabs.appendChild(b);
  });
  var sb = S.tabs.search = h("button", "ch-btn", "Search"); sb.type = "button";
  sb.addEventListener("click", function () { S.searchEl.focus(); if (curEntry().v !== "search") go({ v: "search", q: S.searchEl.value }); });
  tabs.appendChild(sb);
  var si = S.searchEl = h("input", "ch-input ch-search"); si.type = "search"; si.placeholder = "Search names and text… ( / )";
  si.setAttribute("aria-label", "Search the chronicle");
  si.addEventListener("input", function () {
    var en = { v: "search", q: si.value };
    go(en, curEntry().v === "search");
  });
  si.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowDown") { ev.preventDefault(); setSel(S.sel + 1); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); setSel(S.sel - 1); }
    else if (ev.key === "Enter") { var it = (S.resItems || [])[S.sel]; if (it && curEntry().v === "search") { ev.preventDefault(); it.click(); si.blur(); } }
    else if (ev.key === "Escape") { si.value = ""; si.blur(); if (curEntry().v === "search") stepNav(-1); }
  });
  add(bar, S.backBtn, S.fwdBtn, tabs, h("span", "ch-grow"), si);
  S.pane = h("div", "ch-pane"); S.tlWrap = h("div", "ch-tlwrap"); S.tlWrap.style.display = "none";
  S.gWrap = h("div", "ch-gwrap"); S.gWrap.style.display = "none";
  var main = h("div", "ch-main");
  add(main, S.pane, S.tlWrap, S.gWrap);
  add(root, bar, main);
  root.addEventListener("click", onRootClick);
  root.addEventListener("keydown", function (ev) {
    var tag = ev.target && ev.target.tagName;
    if (ev.altKey && ev.key === "ArrowLeft") { ev.preventDefault(); stepNav(-1); }
    else if (ev.altKey && ev.key === "ArrowRight") { ev.preventDefault(); stepNav(1); }
    else if (ev.key === "/" && tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") { ev.preventDefault(); si.focus(); }
  });
  container.appendChild(root);
  go({ v: "story" });
}

function update(world) {
  if (!S.root) return;
  if (world) S.world = world;
  indexEvents();
  if (!S.timer) S.timer = setTimeout(refresh, 400);
}

function show(kind, id) {
  if (!S.root || !S.world) return;
  if (kind === "settlement") kind = "region";
  if (kind === "timeline" || kind === "story" || kind === "atlas" || kind === "graph") { go({ v: kind }); return; }
  var num = +id;
  go({ v: "entity", kind: kind, id: isNaN(num) ? id : num });
}

AEON.chronicle = { mount: mount, update: update, show: show };

/* shared with the later parts */
C.render = render;
})();
