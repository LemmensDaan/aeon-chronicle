/* Aeon - parchment look (style F). Draws the small pixel textures the stylesheet uses
   (paper grain, torn edges, the manicule) and exposes them as CSS variables, and offers
   pixelLabel() for headings set in the map's pixel font. Everything is drawn at one
   pixel per texel and shown at 2x with image-rendering: pixelated, to match the map. */
(function () {
"use strict";

const AEON = window.AEON = window.AEON || {};

const PAPER = "#e9d6ad", INK = "#3a2614";
const RIM = ["#946a3c", "#b38b57", "#cba875", "#dcc293"];

function hash(a, b) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function canvas(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  draw(function (col, x, y, ww, hh) { g.fillStyle = col; g.fillRect(x, y, ww || 1, hh || 1); });
  return c.toDataURL();
}

/* paper grain: flat paper with a few darker and lighter fibres */
const paper = canvas(24, 24, function (f) {
  f(PAPER, 0, 0, 24, 24);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const r = hash(x + 7, y * 3 + 1);
    if (r < 0.035) f("#dcc597", x, y);
    else if (r > 0.985) f("#f2e3c0", x, y);
  }
});

/* a torn edge, drawn for the bottom of a sheet: paper at the top, a burnt rim along the
   tear, transparent below it. The tear depth varies in runs, so it reads as torn, not
   zig-zagged. The other three edges are this tile rotated. */
const EW = 40, EH = 6;
function biteAt(x) {
  const a = Math.floor(x / 3), t = (x % 3) / 3;
  const v = hash(a, 11) * (1 - t) + hash((a + 1) % Math.ceil(EW / 3), 11) * t;
  return v < 0.3 ? 0 : v < 0.6 ? 1 : v < 0.85 ? 2 : 3;
}
function edgeTile(rot) {
  const w = rot % 2 ? EH : EW, h = rot % 2 ? EW : EH;
  return canvas(w, h, function (f) {
    for (let x = 0; x < EW; x++) {
      const stop = EH - 1 - biteAt(x);              // last paper row in this column
      for (let y = 0; y <= stop; y++) {
        const d = stop - y;
        const col = d < RIM.length && (d < 2 || hash(x, y) < 0.7) ? RIM[d] : PAPER;
        /* rot 0: bottom edge; 1: left; 2: top; 3: right */
        if (rot === 0) f(col, x, y);
        else if (rot === 2) f(col, x, EH - 1 - y);
        else if (rot === 1) f(col, EH - 1 - y, x);
        else f(col, y, x);
      }
    }
  });
}

/* a whole small sheet torn on all four sides, for border-image (9-slice, slice EH): the plaques
   that float over the map. Each side tears to its own pattern; the middle is plain grained paper. */
const SS = 36;
function sheetBite(side, i) {
  const n = Math.ceil(SS / 3), a = Math.floor(i / 3), t = (i % 3) / 3;
  const v = hash(a % n, 11 + side) * (1 - t) + hash((a + 1) % n, 11 + side) * t;
  return v < 0.3 ? 0 : v < 0.6 ? 1 : v < 0.85 ? 2 : 3;
}
const sheet = canvas(SS, SS, function (f) {
  for (let y = 0; y < SS; y++) for (let x = 0; x < SS; x++) {
    const d = Math.min(y - sheetBite(2, x), SS - 1 - y - sheetBite(0, x), x - sheetBite(1, y), SS - 1 - x - sheetBite(3, y));
    if (d < 0) continue;                               // torn away
    let col;
    if (d < RIM.length && (d < 2 || hash(x, y) < 0.7)) col = RIM[d];
    else { const r = hash(x + 7, y * 3 + 1); col = r < 0.035 ? "#dcc597" : r > 0.985 ? "#f2e3c0" : PAPER; }
    f(col, x, y);
  }
});

/* the manicule: a pointing hand with a red cuff, pointing down at the year */
const manicule = canvas(9, 11, function (f) {
  const rows = [".kkkkkkk.", ".krrrrrk.", ".kkkkkkk.", "kpppppppk", "kpkpkpkpk", "kpppppppk",
                ".kkkpkkk.", "...kpk...", "...kpk...", "...kpk...", "....k...."];
  const pal = { k: INK, r: "#8e1d1d", p: "#f2e3c0" };
  rows.forEach(function (r, y) { for (let x = 0; x < 9; x++) if (r[x] !== ".") f(pal[r[x]], x, y); });
});

const root = document.documentElement.style;
root.setProperty("--pp-paper", "url(" + paper + ")");
root.setProperty("--pp-sheet", "url(" + sheet + ")");
root.setProperty("--pp-edge-b", "url(" + edgeTile(0) + ")");
root.setProperty("--pp-edge-l", "url(" + edgeTile(1) + ")");
root.setProperty("--pp-edge-t", "url(" + edgeTile(2) + ")");
root.setProperty("--pp-edge-r", "url(" + edgeTile(3) + ")");
root.setProperty("--pp-manicule", "url(" + manicule + ")");

/* A label set in the map's pixel font, `scale` CSS pixels per font pixel. The text stays
   available to screen readers and to find-in-page via aria-label and a title. */
AEON.pixelLabel = function (str, color, scale) {
  const F = AEON.pixelFont, s = F ? F.fold(str) : String(str).toUpperCase();
  const c = document.createElement("canvas");
  scale = scale || 2;
  if (!F) { c.width = 1; c.height = 1; return c; }
  c.width = Math.max(1, F.width(s, 1)); c.height = 7;
  F.draw(c.getContext("2d"), s, 0, 0, color || INK, 1);
  c.className = "pp-label";
  c.style.width = c.width * scale + "px";
  c.style.height = c.height * scale + "px";
  c.setAttribute("role", "img");
  c.setAttribute("aria-label", str);
  return c;
};

})();
