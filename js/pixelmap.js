/* Aeon - pixel map renderer for planets (style F: an old atlas drawn in pixels).

   The map is painted once per world into a virtual canvas at PPC pixels per cell, then
   blitted to the screen at a whole number of device pixels per map pixel, so pixels stay
   square at every zoom. The map is drawn once; ui.js keeps the pan inside its edges.
   Settlements and the cursor brackets are drawn afterwards in screen space, so they keep a
   readable size when zoomed and more settlements appear as you zoom in. No names are drawn
   on the map; the tooltip names what is under the cursor.

   View convention (shared with ui.js): screen = pan + grid * s, where s is CSS pixels per
   cell. Here s is snapped so that s * dpr / PPC is a whole number; pixelScale() exposes
   the snapping so ui.js can zoom and centre with the same numbers. */
(function () {
"use strict";

const AEON = window.AEON = window.AEON || {};
const PPC = 4;
const MODES = ["political", "diplomacy", "biome", "population", "elevation", "habitability"];
/* the diplomacy mode's colours: how each realm stands with the realm in focus (AEON.stancesAt) */
/* (Daan, 2026-10-24: truce silver, trade gold; the realm in focus a pale cream wash, so it is never
   mistaken for one of the stances; he tried a thick ink border round it and dropped it) */
const STANCE = { self: "#f4ecd8", war: "#b5452e", lord: "#7a4f9a", vassal: "#3f8f8a", alliance: "#4f8a3a", truce: "#c9ced6", friend: "#e0b84f", none: "#a49a88" };
AEON.stanceColors = STANCE;

/* ------------------------------------------------------------ palette */
const P = {
  deep: "#16295f", mid: "#1f4294", shallow: "#3570c4", foam: "#a6dbff", river: "#3570c4",
  sand: ["#d4b56c", "#e6cd88", "#f3e2a6"],
  grassland: ["#4a9438", "#5fae45", "#80c95a"], forest: ["#215a2a", "#2c7436", "#3b8f44"],
  jungle: ["#1b663d", "#25804f", "#349b60"], savanna: ["#949539", "#b0af4a", "#cbc865"],
  desert: ["#c2924c", "#d9b066", "#eacb88"], swamp: ["#384e30", "#48633e", "#5c794e"],
  taiga: ["#2a5143", "#356453", "#477a65"], tundra: ["#7b8b74", "#94a48c", "#b2bfa7"],
  ice: ["#b4c5db", "#d3dfed", "#f1f6fc"], mountain: ["#584c42", "#796a5b", "#9a8b79"],
  snow: ["#c3cddb", "#e3eaf2", "#ffffff"],
};
/* stepped ramps for the data modes, in the parchment-and-ink family */
/* Each data mode is one hue, light to dark, so more always reads as darker. Elevation keeps its
   land-colour ramp. */
const RAMPS = {
  population:   ["#efe2bf", "#e2c493", "#d4a06e", "#c27a52", "#a5523d", "#80302a", "#581818"],
  elevation:    ["#3f7a3a", "#7d9b4c", "#b9ab68", "#a0805a", "#7a6656", "#e8e4dc"],
  habitability: ["#efe6c8", "#dfe0a8", "#bfd38a", "#93be6e", "#64a258", "#3e8044", "#245c32"],
};
AEON.mapRamps = RAMPS;
const INK = "#2a1a0e", DESK = "#2a1d12";
const RIBBON = "#8e1d1d", CURSOR = "#fff8e1";   /* selection and hover brackets */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = function (x, y) { return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16; };
const HEX = {};
function rgb(h) {
  if (HEX[h]) return HEX[h];
  const n = parseInt(h.slice(1), 16);
  return (HEX[h] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
}

/* ------------------------------------------------------------ pixel font */
const GLYPHS = {
  A: [14,17,17,31,17,17,17], B: [30,17,17,30,17,17,30], C: [14,17,16,16,16,17,14], D: [28,18,17,17,17,18,28],
  E: [31,16,16,30,16,16,31], F: [31,16,16,30,16,16,16], G: [14,17,16,23,17,17,15], H: [17,17,17,31,17,17,17],
  I: [14,4,4,4,4,4,14], J: [7,2,2,2,2,18,12], K: [17,18,20,24,20,18,17], L: [16,16,16,16,16,16,31],
  M: [17,27,21,21,17,17,17], N: [17,17,25,21,19,17,17], O: [14,17,17,17,17,17,14], P: [30,17,17,30,16,16,16],
  Q: [14,17,17,17,21,18,13], R: [30,17,17,30,20,18,17], S: [15,16,16,14,1,1,30], T: [31,4,4,4,4,4,4],
  U: [17,17,17,17,17,17,14], V: [17,17,17,17,17,10,4], W: [17,17,17,21,21,21,10], X: [17,17,10,4,10,17,17],
  Y: [17,17,10,4,4,4,4], Z: [31,1,2,4,8,16,31],
  "0": [14,17,19,21,25,17,14], "1": [4,12,4,4,4,4,14], "2": [14,17,1,2,4,8,31], "3": [31,2,4,2,1,17,14],
  "4": [2,6,10,18,31,2,2], "5": [31,16,30,1,1,17,14], "6": [6,8,16,30,17,17,14], "7": [31,1,2,4,8,8,8],
  "8": [14,17,17,14,17,17,14], "9": [14,17,17,15,1,2,12],
  " ": [0,0,0,0,0,0,0], ".": [0,0,0,0,0,12,12], ",": [0,0,0,0,12,4,8], "-": [0,0,0,31,0,0,0],
  "'": [4,4,8,0,0,0,0], "!": [4,4,4,4,4,0,4], "?": [14,17,1,2,4,0,4], ":": [0,12,12,0,12,12,0],
  "/": [1,1,2,4,8,16,16], "(": [2,4,8,8,8,4,2], ")": [8,4,2,2,2,4,8],
};
function fold(s) {
  /* drop combining accents (U+0300-U+036F) so accented letters fall back to their base letter */
  return String(s).normalize("NFD").split("").filter(function (ch) { const k = ch.charCodeAt(0); return k < 768 || k > 879; }).join("").toUpperCase();
}
function textWidth(s, u, gap) { return s.length * (5 + (gap || 1)) * u - (gap || 1) * u; }
function text(ctx, s, x, y, color, u, gap) {
  const step = (5 + (gap || 1)) * u;
  ctx.fillStyle = color;
  for (let n = 0; n < s.length; n++) {
    const g = GLYPHS[s[n]];
    if (!g) continue;
    for (let r = 0; r < 7; r++) {
      const bits = g[r];
      if (!bits) continue;
      for (let c = 0; c < 5; c++) if (bits & (16 >> c)) ctx.fillRect(x + n * step + c * u, y + r * u, u, u);
    }
  }
}

/* ------------------------------------------------------------ sprites */
function sprite(rows, pal) { return { rows: rows, pal: pal, w: rows[0].length, h: rows.length }; }
function blit(ctx, sp, x, y, u, over) {
  for (let j = 0; j < sp.h; j++) for (let i = 0; i < sp.w; i++) {
    const ch = sp.rows[j][i];
    if (ch === ".") continue;
    ctx.fillStyle = (over && over[ch]) || sp.pal[ch];
    ctx.fillRect(x + i * u, y + j * u, u, u);
  }
}
const PEAK = sprite(["....k....", "...kwk...", "..kwwlk..", "..kwlldk.", ".kllddddk", "klllddddk", "kkkkkkkkk"],
  { k: "#2a2420", w: "#ffffff", l: "#a39482", d: "#6b5d4f" });
const PINE = sprite(["..k..", ".kgk.", ".kgk.", "kgggk", ".kbk."], { k: "#14301f", g: "#2f6e45", b: "#5a3d22" });
const TREE = sprite([".kkk.", "kgglk", "kgggk", ".kbk."], { k: "#13361b", g: "#3a8f42", l: "#6cc160", b: "#5a3d22" });
const PALM = sprite(["kg.gk", ".ggg.", "..b..", "..b.."], { k: "#14451f", g: "#2fa055", b: "#7a5a2e" });
/* the settlements, Daan's picks from samples/settlement-sprites.html (2026-10-28): every roof in
   its realm's colour (f, F are replaced when drawn), a cottage for the village, houses behind a
   stockade for the town, a belfry over a low wall for the city, and for the capital a wide keep with
   the realm's banner hung down its face, houses behind its wall. Wood h light, b dark; c sailcloth,
   e a lighthouse's red stripe, o its fire; d and i are the ships' (mapfx.js SHIPS) */
const ROOF = { k: INK, w: "#efe6d6", g: "#b7b1a4", b: "#7a4a22", B: "#4e2f16", h: "#a8743c", f: "#3a6ea5", F: "#244a73", y: "#e0b84f",
               c: "#efe6d6", d: "#c9bc9a", i: "#8f969e", e: "#b5452e", o: "#e8742a" };
const rep = function (ch, n) { return new Array(n + 1).join(ch); };
const alt = function (n, a, b) { let s = ""; for (let i = 0; i < n; i++) s += i % 2 ? b : a; return s; };
/* several sprites laid into one, later parts over earlier ones; the first part is the settlement
   itself: bx, by, bw, bh say where it lies in the whole; ax is the column (in the first part's frame)
   that stands on the water's edge or on the river */
function composed(parts, ax) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of parts) { x0 = Math.min(x0, p[1]); y0 = Math.min(y0, p[2]); x1 = Math.max(x1, p[1] + p[0].w); y1 = Math.max(y1, p[2] + p[0].h); }
  const grid = [];
  for (let j = y0; j < y1; j++) grid.push(new Array(x1 - x0).fill("."));
  for (const p of parts) for (let j = 0; j < p[0].h; j++) for (let i = 0; i < p[0].w; i++) {
    const ch = p[0].rows[j][i];
    if (ch !== ".") grid[p[2] + j - y0][p[1] + i - x0] = ch;
  }
  const sp = sprite(grid.map(function (r) { return r.join(""); }), ROOF);
  sp.ax = (ax || 0) - x0; sp.bx = -x0; sp.by = -y0; sp.bw = parts[0][0].w; sp.bh = parts[0][0].h;
  return sp;
}
/* the same, mirrored, for water on the left */
function mirrored(sp) {
  const m = sprite(sp.rows.map(function (r) { return r.split("").reverse().join(""); }), sp.pal);
  m.ax = sp.w - 1 - sp.ax; m.bx = sp.w - sp.bx - sp.bw; m.by = sp.by; m.bw = sp.bw; m.bh = sp.bh;
  return m;
}
/* a house behind a wall shows only its roof and a row of plaster over it */
const LOW5 = sprite([".kkk.", "kffFk", "kwwwk"], ROOF);
const LOW7 = sprite(["..kkk..", ".kffFk.", "kfffFFk", "kwwwwwk"], ROOF);
const HOUSE5 = sprite(["..k..", ".kfk.", "kffFk", "kwwwk", "kwkwk", "kkkkk"], ROOF);
const HOUSE7 = sprite(["...k...", "..kfk..", ".kffFk.", "kfffFFk", "kwkwkwk", "kwwwwwk", "kkkkkkk"], ROOF);
function wall(n, h) {
  const rows = [alt(n, "k", "."), rep("k", n)], c = n >> 1;
  while (rows.length < h - 1) rows.push("k" + rep("g", n - 2) + "k");
  rows.push(rep("k", n));
  rows[h - 3] = rows[h - 3].slice(0, c - 1) + "kkk" + rows[h - 3].slice(c + 2);
  rows[h - 2] = rows[h - 2].slice(0, c - 2) + "kbbbk" + rows[h - 2].slice(c + 3);
  return sprite(rows, ROOF);
}
/* a low wall: merlons, coping, a stone face with a brown dot for its gate, a foot */
function lowWall(n) {
  const face = "k" + rep("g", n - 2) + "k", c = n >> 1;
  return sprite([alt(n, "k", "."), rep("k", n), face.slice(0, c) + "b" + face.slice(c + 1), rep("k", n)], ROOF);
}
const KEEP = sprite([alt(7, "k", "."), rep("k", 7), "kgkkkgk", "kgfffgk", "kgfffgk", "kgfFfgk", "kgfgfgk", "kgggggk", "kgggggk", "kkkkkkk"], ROOF);
const BELFRY = sprite([".k.", "kfk", "kFk", "kkk", "kyk", "kkk", "kgk", "kgk", "kgk", "kkk"], ROOF);
const STOCKADE = sprite([alt(11, "k", "."), "khbhkkkhbhk", "khbhkBkhbhk", rep("k", 11)], ROOF);
const VILLAGE = sprite(["...k...", "..kfk..", ".kffFk.", "kfffFFk", ".kwkwk.", ".kkkkk."], ROOF);
const TOWN = composed([[LOW5, 0, 3], [LOW7, 4, 2], [STOCKADE, 0, 5]]);
const CITY = composed([[LOW7, 0, 3], [LOW5, 6, 4], [BELFRY, 5, 0], [lowWall(11), 0, 6]]);
const PALACE = composed([[LOW5, 0, 5], [LOW5, 10, 5], [KEEP, 4, 1], [wall(15, 5), 0, 7]]);

/* by the water: on the open sea a quay with a light at its tip and the realm's own ship (the one its
   fleets sail, mapfx.js) bobbing beside it; on a river a watermill, or a bridge where a road crosses
   the river there (both banks built for a town or city); on a lake houses on stilts and punts */
const DOT = sprite(["."], ROOF);
const ROWBOAT = sprite(["k...k", "kbbbk", ".kkk."], ROOF);
const PUNT = sprite(["..k...", ".kwk..", "..k...", "kbbbbk", ".kkkk."], ROOF);
const LIGHT_S = sprite([".k.", "kok", "kkk", "kwk", "kek", "kwk", "kek", "kgk", "kkk"], ROOF);
const LIGHT_L = sprite(["..k..", ".kok.", "kkkkk", ".kwk.", ".kek.", ".kwk.", ".kek.", ".kwk.", "kgggk", "kkkkk"], ROOF);
const BRIDGE_S = sprite(["kkkkkkk", "bbbbbbb", "b.....b"], ROOF);
const BRIDGE_M = sprite(["kkkkkkkkk", "ggggggggg", "ggkkkkkgg", "gk.....kg", "kk.....kk"], ROOF);
const BRIDGE_L = sprite(["kkkkkkkkkkk", "ggggggggggg", "gkkkgggkkkg", "k...kgk...k", "k...kgk...k"], ROOF);
const MILL = sprite(["..k..", ".kfk.", "kffFk", "kwwwk", "kwkwk", "kkkkk"], ROOF);
const BIGMILL = sprite(["...k...", "..kfk..", ".kffFk.", "kfffFFk", "kwwkwwk", "kwwkbwk", "kkkkkkk"], ROOF);
/* the wheel turns clockwise in four frames 22.5 degrees apart */
const WHEELS = [[".hkh.", "hhkhh", "kkkkk", "hhkhh", ".hkh."], [".hhk.", "khkhh", "hkkkh", "hhkhk", ".khh."],
                [".hhh.", "hkhkh", "hhkhh", "hkhkh", ".hhh."], [".khh.", "hhkhk", "hkkkh", "khkhh", ".hhk."]].map(function (r) { return sprite(r, ROOF); });
const STILT = sprite(["..k..", ".kfk.", "kffFk", "kwkwk", "kkkkk", "b...b", "b...b"], ROOF);
const STILT_W = sprite(["...k...", "..kfk..", ".kffFk.", "kfffFFk", "kwkwkwk", "kkkkkkk", "b.b.b.b", "b.b.b.b"], ROOF);
const WALK = sprite(["kkkkk", "bbbbb", "b...b"], ROOF);
function quay(n, stone) { return sprite(stone ? [rep("k", n), rep("g", n), alt(n, "k", "g")] : [rep("k", n), rep("b", n), Array.from({ length: n }, function (_, i) { return i % 3 ? "." : "k"; }).join("")], ROOF); }
/* the ship lies behind the quay, alongside it, the light on the quay's tip past its bow; bob lowers
   the ship a pixel (an empty pixel holds the frame, so the settlement never moves) */
function harbour(base, ship, light, stone, bob) {
  const q = quay(ship.w + 1 + light.w, stone), qx = base.w, qy = base.h - q.h + 1;
  return composed([[base, 0, 0], [DOT, qx + 1, qy + 2 - ship.h], [ship, qx + 1, qy + 2 - ship.h + bob], [base, 0, 0], [q, qx, qy], [light, qx + q.w - light.w, qy + 1 - light.h]], qx);
}
function waterSprite(kind, tier, shipKind, bob, wheel) {
  const B = [null, VILLAGE, TOWN, CITY][tier];
  if (kind === "sea") {
    if (tier === 1) return composed([[B, 0, 0], [DOT, 8, 2], [ROWBOAT, 8, 2 + bob]], 7);
    const ship = AEON.mapfx && AEON.mapfx.shipSprite ? AEON.mapfx.shipSprite(shipKind) : ROWBOAT;
    return tier === 2 ? harbour(B, ship, LIGHT_S, false, bob) : harbour(B, ship, LIGHT_L, true, bob);
  }
  if (kind === "mill") {
    const W = WHEELS[wheel];
    if (tier === 1) return composed([[B, 0, 0], [MILL, 7, 0], [W, 10, 1]], 12);
    if (tier === 2) return composed([[B, 0, 0], [MILL, B.w, B.h - 6], [W, B.w + 3, B.h - 5]], B.w + 5);
    return composed([[B, 0, 0], [BIGMILL, B.w, B.h - 7], [W, B.w + 5, B.h - 5]], B.w + 7);
  }
  if (kind === "bridge") {
    if (tier === 1) return composed([[B, 0, 0], [BRIDGE_S, 6, 3]], 9);
    if (tier === 2) return composed([[B, 0, 0], [BRIDGE_M, B.w - 1, B.h - 5], [HOUSE5, B.w + 7, B.h - 6]], B.w + 3);
    return composed([[B, 0, 0], [BRIDGE_L, B.w - 1, B.h - 5], [HOUSE5, B.w + 9, B.h - 6], [HOUSE7, B.w + 13, B.h - 7]], B.w + 4);
  }
  /* lake */
  if (tier === 1) return composed([[B, 0, 0], [STILT, 8, -1], [PUNT, 14, 1]], 7);
  if (tier === 2) return composed([[B, 0, 0], [WALK, B.w - 1, B.h - 3], [STILT, B.w + 3, B.h - 8], [STILT, B.w + 8, B.h - 7], [PUNT, B.w + 14, B.h - 5]], B.w);
  return composed([[B, 0, 0], [WALK, B.w - 1, B.h - 3], [STILT_W, B.w + 3, B.h - 9], [STILT, B.w + 10, B.h - 8], [PUNT, B.w + 16, B.h - 6], [ROWBOAT, B.w + 9, B.h]], B.w);
}
const WATER_SPRITES = new Map();
function waterSpriteCached(kind, tier, shipKind, bob, wheel, left) {
  const key = kind + tier + shipKind + bob + wheel + (left ? "L" : "R");
  let sp = WATER_SPRITES.get(key);
  if (!sp) { sp = waterSprite(kind, tier, shipKind, bob, wheel); if (left) sp = mirrored(sp); WATER_SPRITES.set(key, sp); }
  return sp;
}
/* a realm colour, darkened for the shaded side of its banner */
function darker(hex) { const c = rgb(hex || "#888888"); return "rgb(" + Math.round(c[0] * 0.62) + "," + Math.round(c[1] * 0.62) + "," + Math.round(c[2] * 0.62) + ")"; }
/* wonders: the designs of samples/animations.html (round 2 and the Greek / Roman set), in sand
   stone (x lit, s shaded, t seams, n shadow), bronze (e), gold (y) and fire (o). Which one a wonder
   gets is read from its name (wonderSprite), so the designs change no history. */
const STONE = { k: INK, w: "#efe6d6", r: "#b5452e", b: "#7a4a22", y: "#e0b84f", o: "#e8742a", x: "#e3d3ad", s: "#b59d70", t: "#8a7a5a", n: "#4a3c2c", e: "#a87a3a" };
const WONDERS = {
  ziggurat: sprite(["....kyk....", "...kkkkk...", "...kxxsk...", "..kkkkkkk..", "..kxxxxsk..", ".kkkkkkkkk.", ".kxxkbkxsk.", "kkkkkkkkkkk"], STONE),
  lighthouse: sprite(["..oyo..", ".koyok.", ".kkkkk.", "..kxk..", "..krk..", "..kxk..", "..krk..", ".kxxsk.", ".krrrk.", ".kxxsk.", "kxxbxsk", "kkkkkkk"], STONE),
  hall: sprite(["......y......", "....kkkkk....", "...kxxxxsk...", "..kxxxxxssk..", ".kkkkkkkkkkk.", ".kxkxkxkxkxk.", ".kxkxkxkxkxk.", ".kxkxkbkxkxk.", "kkkkkkkkkkkkk"], STONE),
  temple: sprite(["......kkkk......", "....kkxxxxkk....", "..kkxxxxxxxxkk..", ".kkkkkkkkkkkkkk.", ".kxxxxxxxxxxxxk.", ".kkkkkkkkkkkkkk.", ".xsnxsnxsnxsnxs.", ".xsnxsnxsnxsnxs.", ".xsnxsnxsnxsnxs.", ".xsnxsnxsnxsnxs.", "kkkkkkkkkkkkkkkk", "kxxxxxxxxxxxxxsk", "kkkkkkkkkkkkkkkk"], STONE),
  colosseum: sprite(["..kkkkkkkkk....", ".kxkxkxkxkxk...", "kxxxxxxxxxxxkk.", "kxkxkxkxkxkxkxk", "kxxxxxxxxxxxxsk", "kxkxkxkxkxkxkxk", "kxxxxxxxxxxxxsk", "kkkkkkkkkkkkkkk"], STONE),
  arch: sprite(["...kykyk...", "kkkkkkkkkkk", "kxxxxyxxxsk", "kkkkkkkkkkk", "kxxkkkkkxsk", "kxk.....ksk", "kxk.....ksk", "kxk.....ksk", "kxk.....ksk", "kkk.....kkk"], STONE),
  colossus: sprite(["o......", "y.kyk..", "k.kek..", "kkkekk.", "..keek.", "..keek.", "..keek.", "..kekek", "..kekek", ".kkkkkk", ".kxxsk.", ".kxxsk.", "kkkkkkk"], STONE),
  obelisk: sprite(["....k....", "...kyk...", "..kyyok..", "..kxxsk..", "..kxtsk..", "..kxxsk..", "..kxxsk..", "..ktxsk..", "..kxxsk..", "..kxxsk..", "..kxtsk..", "..kxxsk..", ".kkkkkkk.", ".kxxxxsk.", "kkkkkkkkk", "kxxxxxxsk", "kkkkkkkkk"], STONE),
};
/* the design for a wonder's name, first match wins; anything else is an obelisk */
const WONDER_DESIGN = [
  [/ziggurat|tomb|barrow|granary/i, "ziggurat"],
  [/lighthouse|harbour|sea-wall/i, "lighthouse"],
  [/colossus|giant/i, "colossus"],
  [/hippodrome|walls|citadel|fortress|arsenal/i, "colosseum"],
  [/arch|gate|aqueduct|bridge|processional/i, "arch"],
  [/temple|colonnade|bourse|charterhouse/i, "temple"],
  [/hall|basilica|cathedral|library|palace|observatory|orrery|gardens/i, "hall"],
];
function wonderSprite(a) {
  const name = (a && a.name) || "";
  for (const d of WONDER_DESIGN) if (d[0].test(name)) return WONDERS[d[1]];
  return WONDERS.obelisk;
}
const WONDER = WONDERS.obelisk;

/** A well-mixed value in [0,1) per cell id; salt gives independent values for the same cell. */
function cellRand(id, salt) {
  let h = Math.imul(id + 1, 2654435761) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ------------------------------------------------------------ terrain, once per world */
const caches = new WeakMap();
/* viewAt() returns an object that inherits from the world; share one cache between them */
function baseOf(w) { return w._view === w ? Object.getPrototypeOf(w) : w; }

function getCache(w) {
  const base = baseOf(w);
  let c = caches.get(base);
  if (!c) { c = buildTerrain(base); caches.set(base, c); }
  return c;
}

function buildTerrain(world) {
  const W = world.width, H = world.height, R = world.regions, VW = W * PPC, VH = H * PPC, N = VW * VH;
  const cellAt = function (fx, fy) {
    const x = ((Math.floor(fx) % W) + W) % W, y = Math.max(0, Math.min(H - 1, Math.floor(fy)));
    return R[y * W + x];
  };
  const elev = function (fx, fy) {
    const x = fx - 0.5, y = Math.max(0, Math.min(H - 1, fy - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0, y1 = Math.min(y0 + 1, H - 1);
    const e = function (i, j) { return R[j * W + ((i % W) + W) % W].elevation; };
    return (e(x0, y0) * (1 - tx) + e(x0 + 1, y0) * tx) * (1 - ty) + (e(x0, y1) * (1 - tx) + e(x0 + 1, y1) * tx) * ty;
  };

  /* lakes: the lake cells blended between their centres and the line drawn through the half-way
     mark, wobbled by a little noise, so the shore curves instead of following the cells' squares
     (a region's "beyond" land is flagged lake to keep it dry; it is no lake here) */
  const isLake = function (r) { return r.lake && !r.beyondBiome ? 1 : 0; };
  const lakeAt = function (fx, fy) {
    const x = fx - 0.5, y = Math.max(0, Math.min(H - 1, fy - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0, y1 = Math.min(y0 + 1, H - 1);
    const l = function (i, j) { return isLake(R[j * W + ((i % W) + W) % W]); };
    return (l(x0, y0) * (1 - tx) + l(x0 + 1, y0) * tx) * (1 - ty) + (l(x0, y1) * (1 - tx) + l(x0 + 1, y1) * tx) * ty;
  };
  /* smooth value noise in [0,1), f lattice points a cell, wrapping east-west with the map */
  const vnoise = function (fx, fy, f, salt) {
    const x = fx * f, y = fy * f, x0 = Math.floor(x), y0 = Math.floor(y), P = W * f;
    const sx = x - x0, sy = y - y0, tx = sx * sx * (3 - 2 * sx), ty = sy * sy * (3 - 2 * sy);
    const v = function (i, j) { return cellRand(((i % P) + P) % P * 65536 + j, salt); };
    return (v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx) * (1 - ty) + (v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx) * ty;
  };

  /* lake: 1 on a lake's water, so it is drawn as one (no surf, no beach on its shore) */
  const E = new Float32Array(N), land = new Uint8Array(N), lake = new Uint8Array(N), cellOf = new Int32Array(N);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const i = y * VW + x, fx = (x + 0.5) / PPC, fy = (y + 0.5) / PPC, c = cellAt(fx, fy);
    E[i] = elev(fx, fy);
    cellOf[i] = c.id;
    if (c.beyondBiome) { land[i] = 0; lake[i] = 1; continue; }
    lake[i] = lakeAt(fx, fy) > 0.35 + vnoise(fx, fy, 2, 41) * 0.3 ? 1 : 0;
    land[i] = E[i] > 0.5 && !lake[i] ? 1 : 0;
  }
  /* round the coast's corners: a narrow inlet or neck of land a cell or two wide comes out of the
     blend with square corners, so each pixel takes what most of a small disc round it is, twice;
     straight runs of coast keep their line (lakes and their shores stay as drawn, and so does
     the middle of every cell, so a one-cell island or channel is never rounded away) */
  const mid = function (v) { const m = v % PPC; return m === (PPC >> 1) - 1 || m === PPC >> 1; };
  for (let pass = 0; pass < 2; pass++) {
    const prev = land.slice();
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
      const i = y * VW + x;
      if (lake[i] || (mid(x) && mid(y))) continue;
      let n = 0, k = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const ny = y + dy;
        if ((dx === 2 || dx === -2) && (dy === 2 || dy === -2)) continue;
        if (ny < 0 || ny >= VH) continue;
        const j = ny * VW + (x + dx + VW) % VW;
        if (lake[j]) continue;
        n++; k += prev[j];
      }
      if (n) land[i] = 2 * k > n ? 1 : 2 * k < n ? 0 : prev[i];
    }
  }
  /* water at sea level that never reaches the open sea is a lake to the eye: a body of it
     touching neither the map's top or bottom (nor, in a region, its sides) and smaller than a
     hundredth of the map */
  {
    const seen = new Uint8Array(N), q = new Int32Array(N), wraps = !world.square;
    for (let s = 0; s < N; s++) {
      if (land[s] || lake[s] || seen[s]) continue;
      let n = 0, open = false;
      q[n++] = s; seen[s] = 1;
      for (let h = 0; h < n; h++) {
        const c = q[h], x = c % VW, y = (c - x) / VW;
        if (y === 0 || y === VH - 1 || (!wraps && (x === 0 || x === VW - 1))) open = true;
        for (let k = 0; k < 4; k++) {
          const ny = y + (k === 2) - (k === 3), nx = x + (k === 0) - (k === 1);
          if (ny < 0 || ny >= VH || (!wraps && (nx < 0 || nx >= VW))) continue;
          const j = ny * VW + (nx + VW) % VW;
          if (!land[j] && !lake[j] && !seen[j]) { seen[j] = 1; q[n++] = j; }
        }
      }
      if (!open && n < N / 100) for (let h = 0; h < n; h++) lake[q[h]] = 1;
    }
  }

  const px = new Uint8ClampedArray(N * 4);
  const put = function (i, h) { const c = rgb(h); px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255; };
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const i = y * VW + x, e = E[i], t = bayer(x, y);
    if (!land[i]) {
      if (lake[i]) {
        /* lakes (Daan, 2026-10-28, from samples/settlement-sprites.html): shallow along the shore,
           dithered into mid-blue further out, no stripes and no surf */
        let d = 8;
        for (let dy = -7; dy <= 7 && d > 1; dy++) for (let dx = -7; dx <= 7; dx++) {
          const ny = y + dy, dd = Math.max(Math.abs(dx), Math.abs(dy));
          if (dd < d && ny >= 0 && ny < VH && land[ny * VW + (x + dx + VW) % VW]) d = dd;
        }
        put(i, d <= 2 ? P.shallow : d <= 7 && t >= (d - 2) / 5 ? P.shallow : P.mid);
        continue;
      }
      let coast = false;
      for (let dy = -1; dy <= 1 && !coast; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ny = y + dy;
        if (ny >= 0 && ny < VH && land[ny * VW + (x + dx + VW) % VW]) { coast = true; break; }
      }
      const d = 0.5 - e;
      /* the surf: foam dithered over the shallows, not a solid ring (the waves animate on top) */
      put(i, coast ? (t < 0.5 ? P.foam : P.shallow) : d < 0.018 + t * 0.012 ? P.shallow : d < 0.075 + t * 0.03 ? P.mid : P.deep);
      continue;
    }
    /* jitter the biome lookup with the dither matrix so biome borders break up into pixels */
    const c = cellAt((x + 0.5) / PPC + (t - 0.5) * 0.9, (y + 0.5) / PPC + (bayer(y + 1, x + 2) - 0.5) * 0.9);
    const biome = c.barren ? "grassland" : c.biome;
    const eNW = E[Math.max(0, y - 1) * VW + (x + VW - 1) % VW], eSE = E[Math.min(VH - 1, y + 1) * VW + (x + 1) % VW];
    let lvl = Math.min(2, Math.floor(Math.max(0, Math.min(0.999, 0.55 + (eNW - eSE) * 38)) * 2 + t));
    /* beaches: land touching the sea is sand, low ground a pixel further in and the lowest a few
       pixels in, except under mountains, ice and swamp; lake shores stay green, and low ground
       inland is its own land a shade lighter, not sand */
    let sea = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const ny = y + dy, j = ny * VW + (x + dx + VW) % VW;
      if (ny < 0 || ny >= VH || land[j] || lake[j]) continue;
      const dd = Math.max(Math.abs(dx), Math.abs(dy));
      if (!sea || dd < sea) sea = dd;
    }
    const low = e < 0.506 && biome !== "ice" && biome !== "swamp";
    const beach = sea && biome !== "mountain" && biome !== "ice" && biome !== "swamp" &&
      (sea === 1 ? e < 0.56 : sea === 2 ? e < 0.515 + t * 0.01 : low);
    if (low && !beach) lvl = Math.min(2, lvl + 1);
    if (beach) put(i, P.sand[lvl]);
    else if (biome === "mountain" && e > 0.86) put(i, P.snow[lvl]);
    else put(i, (P[biome] || P.grassland)[lvl]);
  }

  const terrain = document.createElement("canvas");
  terrain.width = VW; terrain.height = VH;
  const g = terrain.getContext("2d");
  const img = g.createImageData(VW, VH);
  img.data.set(px);
  g.putImageData(img, 0, 0);

  /* rivers: curves through jittered cell centres, midpoint to midpoint, so they meander */
  g.fillStyle = P.river;
  const centre = function (r) {
    const h = Math.sin(r.id * 12.9898) * 43758.5453, j = h - Math.floor(h);
    return [r.x * PPC + 2 + (j - 0.5) * 2.4, r.y * PPC + 2 + ((j * 7.3) % 1 - 0.5) * 2.4];
  };
  const near = function (p, ref) { return p[0] - ref[0] > VW / 2 ? [p[0] - VW, p[1]] : ref[0] - p[0] > VW / 2 ? [p[0] + VW, p[1]] : p; };
  const plot = function (x, y, s) { g.fillRect(((Math.round(x) % VW) + VW) % VW, Math.round(y), s, s); };
  for (const r of R) {
    if (!r.river || r.flowTo < 0) continue;
    const t = R[r.flowTo], s = r.river > world.riverThreshold * 6 ? 2 : 1;
    const a = centre(r), b = near(centre(t), a), m1 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const u = t.flowTo >= 0 && t.river ? R[t.flowTo] : null;
    const m2 = u ? (function () { const c = near(centre(u), b); return [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2]; })() : b;
    const hasUp = r.neighbors.some(function (n) { return R[n].flowTo === r.id && R[n].river; });
    if (!hasUp) for (let k = 0; k <= 6; k++) plot(a[0] + (m1[0] - a[0]) * k / 6, a[1] + (m1[1] - a[1]) * k / 6, s);
    for (let k = 0; k <= 10; k++) {
      const q = k / 10, iq = 1 - q;
      plot(iq * iq * m1[0] + 2 * iq * q * b[0] + q * q * m2[0], iq * iq * m1[1] + 2 * iq * q * b[1] + q * q * m2[1], s);
    }
  }

  /* scenery: peaks, woods -- sparse, so borders and settlements stay readable. Which
     cells get one, and the small offset inside the cell, come from a hash of the cell
     id: a formula linear in x and y would line them up along diagonals. */
  const props = [];
  for (const r of R) {
    if (r.barren || r.lake) continue;
    const k = cellRand(r.id, 1);
    const jx = Math.floor(cellRand(r.id, 2) * 3) - 1, jy = Math.floor(cellRand(r.id, 3) * 3) - 1;
    const x = r.x * PPC + jx, y = r.y * PPC + jy;
    /* [sprite, cell x, cell y, sort key, jitter x, jitter y] */
    if (r.biome === "mountain" && k < 0.4) props.push([PEAK, r.x, r.y, y, jx, jy]);
    else if ((r.biome === "forest" || r.biome === "jungle") && k < 0.55) props.push([r.biome === "jungle" ? PALM : TREE, r.x, r.y, y, jx, jy]);
    else if (r.biome === "taiga" && k < 0.5) props.push([PINE, r.x, r.y, y, jx, jy]);
    /* the odd lone tree out on open land */
    else if ((r.biome === "grassland" || r.biome === "savanna") && k < 0.05) props.push([TREE, r.x, r.y, y, jx, jy]);
  }
  props.sort(function (a, b) { return a[3] - b[3]; });

  /* what the ambient animation needs: the foam pixels along the shore, a scatter of deep-sea
     pixels that glint, and a few clouds. All picked by hash, so a world always looks the same. */
  const foam = [], glints = [];
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const i = y * VW + x;
    if (land[i] || lake[i]) continue;
    let coast = false;
    for (let dy = -1; dy <= 1 && !coast; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ny = y + dy;
      if (ny >= 0 && ny < VH && land[ny * VW + (x + dx + VW) % VW]) { coast = true; break; }
    }
    if (coast) foam.push(i);
    else if (E[i] < 0.47 && cellRand(i, 21) < 0.0025) glints.push([i, cellRand(i, 22) * 6.28, 1.5 + cellRand(i, 23) * 2]);
  }
  const clouds = [];
  for (let k = 0; k < Math.round(VW / 70); k++) clouds.push({ x: cellRand(k, 31) * VW, y: 10 + cellRand(k, 32) * (VH - 40), w: 26 + Math.floor(cellRand(k, 33) * 30), s: 3 + cellRand(k, 34) * 5 });

  const frame = document.createElement("canvas");
  frame.width = VW; frame.height = VH;
  return {
    W: W, H: H, VW: VW, VH: VH, land: land, cellOf: cellOf, terrain: terrain, props: props, propLayer: null,
    foam: foam, glints: glints, clouds: clouds,
    terrainPx: g.getImageData(0, 0, VW, VH).data,
    frame: frame, fctx: frame.getContext("2d"), fimg: frame.getContext("2d").createImageData(VW, VH), key: null,
  };
}

/* elevation in metres, in fixed bands, the same for every world and region: under 200 m,
   200-500, 500-1,000, 1,000-2,000, 2,000-3,000, above 3,000 (one ramp colour each) */
const ELEV_BANDS = [200, 500, 1000, 2000, 3000];
AEON.elevBands = ELEV_BANDS;
function elevBand(r) {
  const h = r.heightM != null ? r.heightM : Math.max(0, (r.elevation - 0.5015) / 0.4985) * 5000;
  let k = 0;
  while (k < ELEV_BANDS.length && h >= ELEV_BANDS[k]) k++;
  return k;
}

/* ------------------------------------------------------------ the frame for a year and mode */
/* contest (from mapfx.js), when given: regions changing hands, { rid: { from, to, phase } }. They
   keep the old owner's borders while their 2-pixel blocks, border pixels too (most such land is a
   single cell, which is mostly border), flicker between the two colours. */
function compose(c, w, mode, roads, contest, focus, provOf) {
  const key = mode + "|" + w.year + "|" + (w.ownerLog ? w.ownerLog.length : 0) + "|" + (roads ? 1 : 0) + "|" + (mode === "diplomacy" ? focus : "") + "|" + (provOf || "");
  if (c.key === key && !contest) return c.frame;
  c.key = contest ? null : key;
  const VW = c.VW, VH = c.VH, R = w.regions, land = c.land, cellOf = c.cellOf;
  const d = c.fimg.data;
  d.set(c.terrainPx);

  if (mode === "population" || mode === "elevation" || mode === "habitability") {
    const ramp = RAMPS[mode].map(rgb), n = ramp.length;
    /* population in the shown year: each realm's people (from its history) spread over the land it
       held then by AEON.popWeight, on a log scale stretched between the 5th and 99th percentile
       of the settled land, so towns and capitals stand out from the countryside */
    let popOf = null, lo = 0, hi = 1;
    if (mode === "population") {
      popOf = new Float64Array(R.length);
      const sum = {}, cap = {};
      for (const id in w.polities) { const p = w.polities[id]; if (p.ended == null) cap[p.capital] = true; }
      for (const r of R) if (r.owner != null) sum[r.owner] = (sum[r.owner] || 0) + AEON.popWeight(r, !!cap[r.id]);
      const logs = [];
      for (const r of R) {
        if (r.owner == null) continue;
        const p = w.polities[r.owner], total = p ? (AEON.populationAt(p, w.year) || p.population || 0) : 0;
        popOf[r.id] = total * AEON.popWeight(r, !!cap[r.id]) / (sum[r.owner] || 1);
        if (popOf[r.id] > 0) logs.push(Math.log(popOf[r.id]));
      }
      logs.sort(function (a, b) { return a - b; });
      if (logs.length) { lo = logs[Math.floor(logs.length * 0.05)]; hi = logs[Math.floor((logs.length - 1) * 0.99)]; }
      if (hi <= lo) hi = lo + 1;
    }
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
      const i = y * VW + x;
      if (!land[i]) continue;
      const r = R[cellOf[i]];
      const t = mode === "population" ? (popOf[r.id] > 0 ? 0.08 + 0.92 * (Math.log(popOf[r.id]) - lo) / (hi - lo) : 0)
              : mode === "elevation" ? 0 : (r.habitability || 0);
      const k = mode === "elevation" ? Math.min(n - 1, elevBand(r))
              : Math.max(0, Math.min(n - 1, Math.floor(Math.max(0, Math.min(1, t)) * (n - 1) + bayer(x, y))));
      /* keep a whisper of the terrain shading underneath */
      const col = ramp[k], a = 0.82;
      d[i * 4] += (col[0] - d[i * 4]) * a; d[i * 4 + 1] += (col[1] - d[i * 4 + 1]) * a; d[i * 4 + 2] += (col[2] - d[i * 4 + 2]) * a;
    }
  }

  /* realms, in the political and diplomacy modes: a dithered wash of the realm colour (in the
     diplomacy mode, of how it stands with the realm in focus) and a two-pixel border where owners
     meet. Water never counts as a different owner, so coasts stay clean. */
  const diplo = mode === "diplomacy", tint = mode === "political" || diplo, borders = tint;
  if (tint) {
    const own = new Array(R.length);
    for (let k = 0; k < R.length; k++) own[k] = contest && contest[k] ? contest[k].from : R[k].owner;
    const cols = {}, stance = diplo && AEON.stancesAt ? AEON.stancesAt(baseOf(w), focus, w.year) : null;
    const colorOf = function (id) {
      if (cols[id]) return cols[id];
      const p = w.polities[id];
      return (cols[id] = rgb(stance ? STANCE[stance[id] || "none"] : (p && p.color) || "#888888"));
    };
    const at = function (x, y, o) {
      if (y < 0 || y >= VH) return o;
      const j = y * VW + ((x + VW) % VW);
      return land[j] ? own[cellOf[j]] : o;
    };
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
      const i = y * VW + x;
      if (!land[i]) continue;
      const o = own[cellOf[i]], ct = contest && contest[cellOf[i]];
      if (o == null && !ct) continue;
      const edge = o != null && (at(x + 1, y, o) !== o || at(x - 1, y, o) !== o || at(x, y + 1, o) !== o || at(x, y - 1, o) !== o);
      const edge2 = o != null && !edge && (at(x + 2, y, o) !== o || at(x - 2, y, o) !== o || at(x, y + 2, o) !== o || at(x, y - 2, o) !== o);
      /* the provinces of the realm under the cursor: a one-pixel line where two of its provinces meet */
      if (provOf != null && o === provOf && !(ct && ct.phase >= 0)) {
        const pv = R[cellOf[i]].province, pr = function (x2, y2) {
          if (y2 < 0 || y2 >= VH) return pv;
          const j = y2 * VW + ((x2 + VW) % VW);
          return land[j] && own[cellOf[j]] === o ? R[cellOf[j]].province : pv;
        };
        if (pr(x + 1, y) !== pv || pr(x, y + 1) !== pv) {
          const cl = colorOf(o);
          d[i * 4] = cl[0] * 0.45; d[i * 4 + 1] = cl[1] * 0.45; d[i * 4 + 2] = cl[2] * 0.45;
          continue;
        }
      }
      const show = ct && ct.phase >= 0 && (((x >> 1) + (y >> 1) + ct.phase) & 1) ? ct.to : o;
      if (show == null) continue;
      const cl = colorOf(show);
      if (ct && ct.phase >= 0) {
        /* flickering land: solid blocks of the two colours, so the change reads on a single cell */
        const k = edge ? 0.5 : 0.9;
        d[i * 4] += (cl[0] * (edge ? 0.5 : 1) - d[i * 4]) * k; d[i * 4 + 1] += (cl[1] * (edge ? 0.5 : 1) - d[i * 4 + 1]) * k; d[i * 4 + 2] += (cl[2] * (edge ? 0.5 : 1) - d[i * 4 + 2]) * k;
      } else if (edge) {
        const k = tint ? 0.5 : 0.62;
        d[i * 4] = cl[0] * k; d[i * 4 + 1] = cl[1] * k; d[i * 4 + 2] = cl[2] * k;
      } else if (tint || (borders && edge2)) {
        const a = edge2 ? 0.62 : !tint ? 0 : bayer(x, y) < 0.5 ? 0.66 : 0.44;
        d[i * 4] += (cl[0] - d[i * 4]) * a; d[i * 4 + 1] += (cl[1] - d[i * 4 + 1]) * a; d[i * 4 + 2] += (cl[2] - d[i * 4 + 2]) * a;
      }
    }
  }
  if (roads) drawRoads(c, w, d);
  c.fctx.putImageData(c.fimg, 0, 0);
  return c.frame;
}

/* roads: within each realm its settlements are joined into a tree, grown out from the capital
   by the shortest overland links, and the capital also sends a road to each of its nearest
   neighbours, so roads fan out from the seat. A road never crosses water and is at most
   ROAD_MAX cells long. Drawn into the map at map resolution as a track with a slight bend, so it zooms with the land like the rivers do. */
/* Every road is the same solid brown track (Daan, 2026-10-24: the cobbled roads between cities and
   capitals showed up only now and then, so one style for all). */
const ROAD = [96, 68, 38], ROAD_MAX = 14, CAPITAL_SPOKES = 3;
/* the roads of a year's view, as pairs of regions [a, b]; worked out once per view (the overlay
   reads them too: a river settlement a road crosses gets a bridge) */
const ROAD_LINKS = new WeakMap();
function roadLinks(w) {
  let out = ROAD_LINKS.get(w);
  if (out) return out;
  out = [];
  const R = w.regions, W = w.width, by = {};
  for (let k = 0; k < R.length; k++) {
    const r = R[k];
    if (r.settlement && r.owner != null && !r.barren) (by[r.owner] || (by[r.owner] = [])).push(k);
  }
  const dxw = function (a, b) { let dd = b - a; if (dd > W / 2) dd -= W; if (dd < -W / 2) dd += W; return dd; };
  const dist2 = function (a, b) { const dx = dxw(R[a].x, R[b].x), dy = R[b].y - R[a].y; return dx * dx + dy * dy; };
  const overland = function (a, b) {
    const dx = dxw(R[a].x, R[b].x), dy = R[b].y - R[a].y, n = Math.max(Math.abs(dx), Math.abs(dy));
    for (let s = 1; s < n; s++) {
      const x = ((Math.round(R[a].x + dx * s / n) % W) + W) % W, y = Math.round(R[a].y + dy * s / n);
      if (R[y * W + x].barren) return false;
    }
    return true;
  };
  for (const id in by) {
    const nodes = by[id];
    if (nodes.length < 2) continue;
    const p = w.polities[id], cap = p && nodes.indexOf(p.capital) >= 0 ? p.capital : nodes[0];
    const linked = {}, key = function (a, b) { return a < b ? a + "-" + b : b + "-" + a; };
    const tree = [cap], rest = nodes.filter(function (n) { return n !== cap; });
    while (rest.length) {
      let bd = Infinity, bi = -1, from = -1;
      for (let i = 0; i < rest.length; i++) for (const t of tree) { const dd = dist2(t, rest[i]); if (dd < bd) { bd = dd; bi = i; from = t; } }
      const to = rest.splice(bi, 1)[0];
      tree.push(to);
      if (bd <= ROAD_MAX * ROAD_MAX && overland(from, to)) { linked[key(from, to)] = true; out.push([from, to]); }
    }
    nodes.filter(function (n) { return n !== cap; })
      .sort(function (a, b) { return dist2(cap, a) - dist2(cap, b); }).slice(0, CAPITAL_SPOKES)
      .forEach(function (n) {
        if (!linked[key(cap, n)] && dist2(cap, n) <= ROAD_MAX * ROAD_MAX && overland(cap, n)) { linked[key(cap, n)] = true; out.push([cap, n]); }
      });
  }
  ROAD_LINKS.set(w, out);
  return out;
}
function drawRoads(c, w, d) {
  const R = w.regions, W = w.width, VW = c.VW, VH = c.VH, land = c.land;
  const dxw = function (a, b) { let dd = b - a; if (dd > W / 2) dd -= W; if (dd < -W / 2) dd += W; return dd; };
  const dot = function (x, y, col) {
    x = ((Math.round(x) % VW) + VW) % VW; y = Math.round(y);
    if (y < 0 || y >= VH) return;
    const i = y * VW + x;
    if (!land[i]) return;                                      /* on land only */
    d[i * 4] += (col[0] - d[i * 4]) * 0.85; d[i * 4 + 1] += (col[1] - d[i * 4 + 1]) * 0.85; d[i * 4 + 2] += (col[2] - d[i * 4 + 2]) * 0.85;
  };
  const line = function (x0, y0, x1, y1, k0) {
    const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let s = 0; s <= n; s++) dot(x0 + (x1 - x0) * s / n, y0 + (y1 - y0) * s / n, ROAD);
    return k0 + n;
  };
  const road = function (a, b) {
    const ax = R[a].x * PPC + PPC / 2, ay = R[a].y * PPC + PPC / 2;
    const bx = ax + dxw(R[a].x, R[b].x) * PPC, by2 = R[b].y * PPC + PPC / 2;
    const len = Math.hypot(bx - ax, by2 - ay) || 1, bend = (cellRand(a * 7919 + b, 11) - 0.5) * 5;
    const mx = (ax + bx) / 2 - (by2 - ay) / len * bend, my = (ay + by2) / 2 + (bx - ax) / len * bend;
    line(mx, my, bx, by2, line(ax, ay, mx, my, 0));
  };
  for (const l of roadLinks(w)) road(l[0], l[1]);
}

/* ------------------------------------------------------------ ambient animation */
/* After samples/pixel.html: the shore foam shimmers between two pale tones, glints come and go on
   the deep sea, and dithered cloud shadows drift east across the map and wrap round. Drawn at map
   resolution (P device pixels per map pixel), clipped to the map, for a time in milliseconds. */
const FOAM_A = "#a6dbff", FOAM_B = "#dcefff", GLINT = "#cfeaff";
function drawAmbient(ctx, c, v, X0, now) {
  const P = v.P, VW = c.VW, Y0 = v.Y0, t = now / 1000, tick = Math.floor(t * 1.6);
  ctx.save();
  ctx.beginPath(); ctx.rect(X0, Y0, VW * P, c.VH * P); ctx.clip();
  ctx.fillStyle = tick % 2 ? FOAM_A : FOAM_B;
  for (let k = 0; k < c.foam.length; k++) {
    const i = c.foam[k];
    if ((i * 7 + tick) % 3 === 0) ctx.fillRect(X0 + (i % VW) * P, Y0 + ((i / VW) | 0) * P, P, P);
  }
  ctx.fillStyle = GLINT;
  for (const g of c.glints) if (Math.sin(t * g[2] + g[1]) > 0.97) ctx.fillRect(X0 + (g[0] % VW) * P, Y0 + ((g[0] / VW) | 0) * P, P, P);
  ctx.fillStyle = "rgba(10, 14, 40, .2)";
  for (const cl of c.clouds) {
    const cx = ((cl.x + t * cl.s) % (VW + 80)) - 40;
    for (let j = 0; j < 10; j++) for (let i = 0; i < cl.w; i++) {
      const dx = (i - cl.w / 2) / (cl.w / 2), dy = (j - 5) / 5;
      if (dx * dx + dy * dy < 1 && bayer(i, j) < 0.55) ctx.fillRect(X0 + Math.round(cx + i) * P, Y0 + Math.round(cl.y + j) * P, P, P);
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------ scenery */
/* Peaks and woods, drawn in screen space at the settlements' scale (u device pixels per sprite
   pixel), so they grow with the zoom as gently as the settlements do instead of with the land.
   At low zoom they are cached as one layer the size of the map; zoomed in, only the ones in view
   are drawn. */
function drawScenery(ctx, c, v, u, X0) {
  const cell = PPC * v.P, cw = ctx.canvas.width, ch = ctx.canvas.height;
  const at = function (p) {
    return [Math.round((p[1] + 0.5) * cell + p[4] * u * 1.5 - p[0].w * u / 2), Math.round((p[2] + 0.5) * cell + p[5] * u * 1.5 - p[0].h * u + u * 2)];
  };
  const mw = c.VW * v.P, mh = c.VH * v.P;
  if (mw <= 4096) {
    const key = u + "|" + v.P;
    if (!c.propLayer || c.propLayer.key !== key) {
      const layer = document.createElement("canvas");
      layer.width = mw; layer.height = mh;
      const g = layer.getContext("2d");
      for (const p of c.props) { const q = at(p); blit(g, p[0], q[0], q[1], u); }
      c.propLayer = { key: key, canvas: layer };
    }
    ctx.drawImage(c.propLayer.canvas, X0, v.Y0);
    return;
  }
  for (const p of c.props) {
    const q = at(p), x = X0 + q[0], y = v.Y0 + q[1];
    if (x < -p[0].w * u || y < -p[0].h * u || x > cw || y > ch) continue;
    blit(ctx, p[0], x, y, u);
  }
}

/* ------------------------------------------------------------ view */
function fitScale(canvas, world) {
  const cssW = canvas.clientWidth || 300, cssH = canvas.clientHeight || 150;
  return Math.min(cssW / world.width, cssH / world.height);
}
/* P = device pixels per map pixel, always a whole number; s = CSS pixels per cell */
function pixelScale(canvas, world, zoom) {
  const dpr = window.devicePixelRatio || 1;
  const raw = fitScale(canvas, world) * (zoom || 1) * dpr / PPC;
  const Pn = Math.max(1, Math.round(raw + 1e-6));
  return { P: Pn, s: Pn * PPC / dpr, dpr: dpr, zoomFor: function (p) { return p * PPC / (fitScale(canvas, world) * dpr); } };
}
function makeView(canvas, world, opts) {
  const ps = pixelScale(canvas, world, opts && opts.zoom);
  return {
    cssW: canvas.clientWidth || 300, cssH: canvas.clientHeight || 150, dpr: ps.dpr, P: ps.P, s: ps.s,
    ox: (opts && opts.panX) || 0, oy: (opts && opts.panY) || 0,
  };
}

/* ------------------------------------------------------------ settlements and the cursor */
/* No names are drawn on the map: places and realms are named in the tooltip on hover. */
/* device pixels per sprite pixel: sprites grow with zoom, but only with its square root, so a
   zoomed-in map fills up without the markers swelling as fast as the land */
/* which water a settlement stands by, and on which side: the open sea first, then a river through
   its cell (a bridge if a road crosses the river there: roads leave the cell on both sides of the
   river's line; else a watermill), then a lake shore. null when it stands by none. */
function waterOf(w, r) {
  const R = w.regions, W = w.width;
  const dxw = function (a, b) { let dd = b - a; if (dd > W / 2) dd -= W; if (dd < -W / 2) dd += W; return dd; };
  let sea = 0, seaX = 0, lake = 0, lakeX = 0;
  for (const n of r.neighbors || []) {
    const q = R[n];
    if (!q || !q.barren) continue;
    if (q.lake) { lake++; lakeX += dxw(r.x, q.x); } else { sea++; seaX += dxw(r.x, q.x); }
  }
  if (sea) return { kind: "sea", left: seaX < 0 };
  if (r.river && r.flowTo != null && r.flowTo >= 0 && R[r.flowTo]) {
    const f = R[r.flowTo], rx = dxw(r.x, f.x), ry = f.y - r.y;
    let pos = false, neg = false;
    for (const l of roadLinks(w)) {
      const o = l[0] === r.id ? l[1] : l[1] === r.id ? l[0] : -1;
      if (o < 0) continue;
      const cr = rx * (R[o].y - r.y) - ry * dxw(r.x, R[o].x);
      if (cr > 0) pos = true; else if (cr < 0) neg = true;
    }
    return { kind: pos && neg ? "bridge" : "mill", left: cellRand(r.id, 5) < 0.5 };
  }
  if (lake) return { kind: "lake", left: lakeX < 0 };
  return null;
}
/* how much of a water sprite's piece (the columns beyond its water column, along the settlement's
   ground line) lies over water on the map */
function wetShare(c, v, X0, sp, x, y, u) {
  const left = sp.ax > sp.bx + sp.bw / 2 ? false : sp.ax < sp.bx;    /* mirrored: the piece is left of the settlement */
  const i0 = left ? 0 : sp.ax, i1 = left ? sp.ax : sp.w - 1, yb = y + (sp.by + sp.bh - 1) * u + (u >> 1);
  const my = Math.floor((yb - v.Y0) / v.P);
  if (my < 0 || my >= c.VH) return 0;
  let wet = 0, n = 0;
  for (let i = i0; i <= i1; i++) {
    const mx = ((Math.floor((x + i * u + (u >> 1) - X0) / v.P) % c.VW) + c.VW) % c.VW;
    n++;
    if (!c.land[my * c.VW + mx]) wet++;
  }
  return n ? wet / n : 0;
}
function spriteUnit(v) { return Math.max(1, Math.round(Math.min(6, Math.max(1, Math.sqrt(v.P / v.dpr) * 1.15)) * v.dpr)); }
function drawOverlay(ctx, w, c, v, opts, tiles) {
  const dpr = v.dpr, pc = v.P / dpr;                         // CSS pixels per map pixel
  const u = spriteUnit(v);
  const cell = PPC * v.P, R = w.regions;
  const boxes = [];
  const free = function (b) {
    for (const o of boxes) if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return false;
    return true;
  };
  /* everything is placed once on the first tile and drawn on each visible copy */
  const drawn = [];
  const sx = function (gx) { return tiles[0] + gx * cell; }, sy = function (gy) { return v.Y0 + gy * cell; };
  drawScenery(ctx, c, v, u, tiles[0]);

  /* settlements: capitals always; towns and villages appear as the map is zoomed in */
  const capitals = {};
  for (const id in w.polities) { const p = w.polities[id]; if (!p.ended && p.capital != null) capitals[p.capital] = p; }
  const minTier = pc >= 4 ? 1 : pc >= 2 ? 2 : 3;
  const sites = [];
  for (let k = 0; k < R.length; k++) {
    const s = R[k].settlement, cap = capitals[k];
    if (cap) sites.push({ r: R[k], cap: cap, tier: 9, rank: 1000 + cap.regions.length });
    else if (s && s.tier >= minTier && R[k].owner != null) sites.push({ r: R[k], tier: s.tier, rank: s.tier });
  }
  /* capitals first, the biggest realms' first, then cities, towns, villages; nothing is drawn
     on top of another marker, so where capitals crowd together only the greater ones show */
  sites.sort(function (a, b) { return b.rank - a.rank || a.r.id - b.r.id; });
  /* wonders standing in the shown year: a small monument beside the cell, at every zoom; placed
     right after the capitals (wonders stand in capitals, or in cities that once were), so no town
     takes their room */
  const placeWonders = function () {
    if (!AEON.wonders) return;
    const base = baseOf(w), year = w.year, seen = {};
    for (const a of AEON.wonders(base)) {
      if (a.location == null || a.created > year || (a.destroyed != null && a.destroyed <= year) || seen[a.location]) continue;
      if (AEON.mapfx && AEON.mapfx.hides(a.id)) continue;      /* still rising: mapfx.js draws it */
      seen[a.location] = true;
      const r = R[a.location], sp = wonderSprite(a);
      /* just right of the capital's palace on the same cell (clear of it: a marker never covers
         another), standing on the same ground line */
      const x = Math.round(sx(r.x + 0.5) + (PALACE.w / 2 + 2) * u), y = Math.round(sy(r.y + 0.5) + 3 * u - sp.h * u);
      const b = [x - u, y - u, x + (sp.w + 1) * u, y + (sp.h + 1) * u];
      if (!free(b)) continue;
      boxes.push(b);
      drawn.push(function (dx) { blit(ctx, sp, x + dx, y, u, null); });
    }
  };
  let wondersPlaced = false;
  const time = opts.time != null ? opts.time : 0, looks = {};
  for (const st of sites) {
    if (!wondersPlaced && st.rank < 1000) { placeWonders(); wondersPlaced = true; }
    /* a breakaway's new seat stays the town it was until mapfx.js has crowned it */
    const town = st.cap && AEON.mapfx && AEON.mapfx.asTown(st.r.id), tier = town ? (st.r.settlement ? st.r.settlement.tier : 2) : st.tier;
    const capital = st.cap && !town, plain = capital ? PALACE : tier >= 3 ? CITY : tier === 2 ? TOWN : VILLAGE;
    const owner = capital ? st.cap : w.polities[st.r.owner];
    const roofs = owner && owner.color ? { f: owner.color, F: darker(owner.color) } : null;
    const cx = sx(st.r.x + 0.5), cy = sy(st.r.y + 0.5);
    /* by the water, if it fits; else the plain sprite (a wonder may stand where the quay would) */
    const tries = [];
    const wt = capital ? null : waterOf(w, st.r);
    if (wt) {
      const t3 = Math.min(3, tier);
      let shipKind = "sail";
      if (wt.kind === "sea" && t3 > 1 && owner) {
        if (!looks[owner.id]) looks[owner.id] = AEON.mapfx && AEON.mapfx.looks ? AEON.mapfx.looks(baseOf(w), owner, w.year).ship : "sail";
        shipKind = looks[owner.id];
      }
      const bob = Math.sin(time / 300 + st.r.id * 1.7) > 0.4 ? 1 : 0, wheel = Math.floor(time / 160) % 4;
      const at = function (left) {
        const sp = waterSpriteCached(wt.kind, t3, shipKind, wt.kind === "sea" ? bob : 0, wt.kind === "mill" ? wheel : 0, left);
        /* a quay or stilts reach out from the settlement on its cell; a wheel or a bridge stands
           on the river, which runs through the cell's middle */
        const x = wt.kind === "mill" || wt.kind === "bridge" ? Math.round(cx - (sp.ax + 0.5) * u) : Math.round(cx - sp.bw * u / 2) - sp.bx * u;
        return [sp, x, Math.round(cy - sp.bh * u / 2) - sp.by * u];
      };
      if (wt.kind === "sea" || wt.kind === "lake") {
        /* the quay and its ship, or the stilts, must stand on water: try the side the water lies
           on, then the other; if neither is mostly water (the shore runs east-west here), none */
        for (const left of [wt.left, !wt.left]) {
          const tr = at(left);
          if (wetShare(c, v, tiles[0], tr[0], tr[1], tr[2], u) >= 0.6) { tries.push(tr); break; }
        }
      } else tries.push(at(wt.left));
    }
    tries.push([plain, Math.round(cx - plain.w * u / 2), Math.round(cy - plain.h * u / 2)]);
    for (const tr of tries) {
      const sp = tr[0], x = tr[1], y = tr[2];
      const b = [x - u, y - u, x + (sp.w + 1) * u, y + (sp.h + 1) * u];
      if (!free(b)) continue;
      boxes.push(b);
      drawn.push(function (dx) { blit(ctx, sp, x + dx, y, u, roofs); });
      break;
    }
  }

  /* ruins: where a settlement was destroyed and nothing has been built since, its ruin stays on
     the map (AEON.ruinsAt), standing where the settlement stood and shown at the zoom its size
     would be; drawn after the living settlements, so they never cover one */
  if (AEON.ruinsAt && AEON.mapfx && AEON.mapfx.ruinSprite) {
    const SP = [null, VILLAGE, TOWN, CITY];
    for (const ru of AEON.ruinsAt(baseOf(w), w.year)) {
      const k = ru.rid;
      if (R[k].settlement || Math.min(3, ru.tier) < minTier || AEON.mapfx.burning(k)) continue;
      const t = Math.min(3, ru.tier), sp = SP[t], ruin = AEON.mapfx.ruinSprite(t);
      const x = Math.round(sx(R[k].x + 0.5) - sp.w * u / 2) + ((sp.w - ruin.w) >> 1) * u, y = Math.round(sy(R[k].y + 0.5) - sp.h * u / 2) + (sp.h - ruin.h) * u;
      const b = [x - u, y - u, x + (ruin.w + 1) * u, y + (ruin.h + 1) * u];
      if (!free(b)) continue;
      boxes.push(b);
      drawn.push(function (dx) { blit(ctx, ruin, x + dx, y, u, null); });
    }
  }


  if (!wondersPlaced) placeWonders();

  /* hover and selection: pixel corner brackets round the cell, with a drop shadow (as in the
     game project). The selection sits one pixel further out, so both show on the same cell. */
  const brackets = function (id, color, pad) {
    if (id == null || !R[id]) return;
    const r = R[id], x = Math.round(sx(r.x)), y = Math.round(sy(r.y));
    const x0 = x - pad - u, y0 = y - pad - u, x1 = x + cell + pad, y1 = y + cell + pad;
    const arm = Math.max(3 * u, Math.round(cell / 3 / u) * u);
    const corners = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]];
    const paint = function (dx, dy, col) {
      ctx.fillStyle = col;
      for (const k of corners) {
        ctx.fillRect(k[0] + dx + (k[2] < 0 ? -arm + u : 0), k[1] + dy, arm, u);
        ctx.fillRect(k[0] + dx, k[1] + dy + (k[3] < 0 ? -arm + u : 0), u, arm);
      }
    };
    drawn.push(function (dx) { paint(dx + u, u, "rgba(0,0,0,.55)"); paint(dx, 0, color); });
  };
  brackets(opts.selectedRegion, RIBBON, 2 * u);
  brackets(opts.hoverRegion, CURSOR, u);

  for (const f of drawn) f(0);
}

/* ------------------------------------------------------------ public API */
function draw(canvas, world, opts) {
  opts = opts || {};
  if (!canvas || !world || !world.regions || !world.regions.length) return;
  const v = makeView(canvas, world, opts);
  const pw = Math.round(v.cssW * v.dpr), ph = Math.round(v.cssH * v.dpr);
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  canvas._aeonView = v;

  const fxOn = AEON.mapfx && AEON.mapfx.live(), mode = opts.mode || "political";
  const c = getCache(world), frame = compose(c, world, mode, !!opts.showRoads, fxOn && (mode === "political" || mode === "diplomacy") ? AEON.mapfx.contested() : null, opts.focus || null, opts.provincesOf != null ? opts.provincesOf : null);
  ctx.fillStyle = DESK; ctx.fillRect(0, 0, pw, ph);
  const mw = c.VW * v.P, mh = c.VH * v.P;
  const X0 = Math.round(v.ox * v.dpr);
  v.Y0 = Math.round(v.oy * v.dpr);
  /* one copy of the map, laid on the desk like a sheet, with an ink rule around it */
  ctx.fillStyle = INK;
  ctx.fillRect(X0 - 1, v.Y0 - 1, mw + 2, mh + 2);
  ctx.drawImage(frame, X0, v.Y0, mw, mh);
  if (opts.time != null) drawAmbient(ctx, c, v, X0, opts.time);
  /* the event animations (mapfx.js): land changes below the settlements, sprites above them */
  const fx = AEON.mapfx && AEON.mapfx.live() ? AEON.mapfx : null;
  const cell = PPC * v.P, env = fx && {
    world: world, c: c, P: v.P, X0: X0, Y0: v.Y0, u: spriteUnit(v), pc: v.P / v.dpr, mode: opts.mode || "political",
    sx: function (gx) { return X0 + gx * cell; }, sy: function (gy) { return v.Y0 + gy * cell; },
    sprites: { VILLAGE: VILLAGE, TOWN: TOWN, CITY: CITY, PALACE: PALACE, WONDER: WONDER }, blit: blit,
    wonderSprite: function (id) { return wonderSprite(baseOf(world).artifacts[id]); },
  };
  if (fx) fx.draw(ctx, env, "under");
  drawOverlay(ctx, world, c, v, opts, [X0]);
  if (fx) fx.draw(ctx, env, "over");
}

function hitTest(canvas, world, px, py, opts) {
  if (!canvas || !world || !world.regions || !world.regions.length) return null;
  const v = makeView(canvas, world, opts || { zoom: 1 });
  const W = world.width, H = world.height;
  const gx = Math.floor((px - v.ox) / v.s), gy = Math.floor((py - v.oy) / v.s);
  if (gy < 0 || gy >= H || gx < 0 || gx >= W) return null;
  return gy * W + gx;
}

AEON.render = { draw: draw, modes: MODES, hitTest: hitTest, pixelScale: pixelScale, cacheOf: getCache, wonderSprite: wonderSprite, blit: blit };
AEON.pixelFont = { draw: text, width: textWidth, fold: fold };

})();
