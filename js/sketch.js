/* Aeon - the world sketch (docs/WORLD_SKETCH.md).

   A coarse plan of the whole world made once per seed: the planet cut into a grid of squares,
   the land and sea links between them, and the peoples living in each at the start. Later steps
   add development curves and dated contacts between squares; a region's detailed history will
   follow the sketch.

   The sketch has its own random stream (seed + ":sketch") and only reads the terrain, so making
   it never changes a history. It is kept on world.sketch (not enumerable, like world._gen). */
(function () {
"use strict";

const AEON = window.AEON = window.AEON || {};

const COLS = 6, ROWS = 4;
const OPEN_SEA = 0.04;          /* a square with less land than this is open sea */
const SEA_REACH = 120;          /* longest sea lane recorded, in cells */
const SEAT_GAP = 6;             /* peoples' seats at least this many cells apart */

AEON.makeSketch = function (world) {
  const W = world.width, H = world.height, R = world.regions, N = W * H;
  const rng = AEON.RNG(world.seed + ":sketch");
  const pack = world.pack;
  const wx = (x) => ((x % W) + W) % W;
  const land = (r) => !r.barren;                      /* dry land, not sea or lake */
  const sea = (r) => r.barren && !r.lake;
  const colW = W / COLS, rowH = H / ROWS;
  const squareOf = (x, y) => Math.min(ROWS - 1, Math.floor(y / rowH)) * COLS + Math.min(COLS - 1, Math.floor(x / colW));

  /* ---- squares ---- */
  const squares = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    squares.push({
      id: c + "," + r, col: c, row: r,
      x0: Math.round(c * colW), x1: Math.round((c + 1) * colW), y0: Math.round(r * rowH), y1: Math.round((r + 1) * rowH),
      cells: 0, land: 0, habitable: 0, coast: 0, river: 0, mountains: 0, biomes: {}, openSea: false, peoples: [],
    });
  }
  const sqOf = new Int16Array(N);
  for (const reg of R) {
    const s = squares[squareOf(reg.x, reg.y)];
    sqOf[reg.id] = squares.indexOf(s);
    s.cells++;
    if (!land(reg)) continue;
    s.land++;
    s.biomes[reg.biome] = (s.biomes[reg.biome] || 0) + 1;
    if (reg.habitability > 0.35) s.habitable++;
    if (reg.river > 0) s.river++;
    if (reg.biome === "mountain" || reg.biome === "ice") s.mountains++;
    if (reg.neighbors.some((n) => sea(R[n]))) s.coast++;
  }
  for (const s of squares) {
    s.openSea = s.land < OPEN_SEA * s.cells;
    for (const b of Object.keys(s.biomes)) s.biomes[b] = Math.round(1000 * s.biomes[b] / (s.land || 1)) / 1000;
  }

  /* ---- land links: neighbouring squares with land on both sides of their border ---- */
  const links = [];
  const linkOf = {};
  const addLink = (a, b, kind) => {
    const k = Math.min(a, b) + "|" + Math.max(a, b) + "|" + kind;
    if (!linkOf[k]) { linkOf[k] = { a: Math.min(a, b), b: Math.max(a, b), kind: kind, width: 0, rough: 0, lane: 0 }; links.push(linkOf[k]); }
    return linkOf[k];
  };
  for (const reg of R) {
    if (!land(reg)) continue;
    for (const n of reg.neighbors) {
      if (n < reg.id) continue;
      const o = R[n];
      if (!land(o) || sqOf[n] === sqOf[reg.id]) continue;
      const l = addLink(sqOf[reg.id], sqOf[n], "land");
      l.width++;
      if (reg.biome === "mountain" || reg.biome === "ice" || o.biome === "mountain" || o.biome === "ice") l.rough++;
    }
  }
  for (const l of links) l.rough = Math.round(100 * l.rough / l.width) / 100;

  /* ---- sea links: the shortest lane over open water from one square's coast to another's ---- */
  const shoreOf = [];
  for (let s = 0; s < squares.length; s++) shoreOf.push([]);
  for (const reg of R) if (sea(reg) && reg.neighbors.some((n) => land(R[n]))) shoreOf[sqOf[reg.id]].push(reg.id);
  const dist = new Int16Array(N);
  for (let s = 0; s < squares.length; s++) {
    if (!shoreOf[s].length) continue;
    dist.fill(-1);
    const q = shoreOf[s].slice();
    for (const c of q) dist[c] = 0;
    const best = {};
    for (let h = 0; h < q.length; h++) {
      const c = q[h], d = dist[c];
      if (d >= SEA_REACH) break;
      const t = sqOf[c];
      if (t !== s && R[c].neighbors.some((n) => land(R[n])) && !(t in best)) best[t] = d;
      for (const n of R[c].neighbors) if (dist[n] < 0 && sea(R[n])) { dist[n] = d + 1; q.push(n); }
    }
    for (const t of Object.keys(best)) {
      if (+t < s) continue;                          /* each pair once, from the lower square */
      addLink(s, +t, "sea").lane = best[t];
    }
  }

  /* ---- peoples at the start ---- */
  const archetypes = pack.archetypes || [];
  const peoples = [];
  const seatOk = (reg) => land(reg) && reg.habitability > 0.2;
  for (let si = 0; si < squares.length; si++) {
    const s = squares[si];
    if (s.openSea) continue;
    const want = Math.max(1, Math.min(4, Math.round(s.habitable / 40)));
    /* seats: the best sites in the square (rivers and coasts count), apart from each other */
    const cand = [];
    for (let y = s.y0; y < s.y1; y++) for (let x = s.x0; x < s.x1; x++) {
      const reg = R[y * W + wx(x)];
      if (!seatOk(reg)) continue;
      const coastal = reg.neighbors.some((n) => sea(R[n]));
      cand.push({ reg: reg, score: reg.habitability * (reg.river > 0 ? 1.3 : 1) * (coastal ? 1.1 : 1) * (0.85 + 0.3 * rng.next()) });
    }
    if (!cand.length) continue;
    cand.sort((a, b) => b.score - a.score);
    const seats = [];
    for (const c of cand) {
      if (seats.length >= want) break;
      if (seats.some((o) => Math.hypot(o.x - c.reg.x, o.y - c.reg.y) < SEAT_GAP)) continue;
      seats.push(c.reg);
    }
    /* each people holds the square's land nearest its seat (by steps over land) */
    const owner = new Map(), q = [];
    seats.forEach((reg, k) => { owner.set(reg.id, k); q.push(reg.id); });
    for (let h = 0; h < q.length; h++) {
      for (const n of R[q[h]].neighbors) {
        if (owner.has(n) || !land(R[n]) || sqOf[n] !== si) continue;
        owner.set(n, owner.get(q[h])); q.push(n);
      }
    }
    seats.forEach(function (seat, k) {
      const area = { cells: 0, coast: 0, biomes: {} };
      for (const [id, o] of owner) {
        if (o !== k) continue;
        const reg = R[id];
        area.cells++;
        area.biomes[reg.biome] = (area.biomes[reg.biome] || 0) + 1;
        if (reg.neighbors.some((n) => sea(R[n]))) area.coast++;
      }
      const arch = pickArchetype(rng, archetypes, seat, area);
      const naming = nameOf(world, rng, seat, arch);
      const groundShare = arch && arch.ground ? arch.ground.reduce((t, b) => t + (area.biomes[b] || 0), 0) / (area.cells || 1) : 0;
      const kind = arch && arch.ground && arch.ground.indexOf("grassland") >= 0 && groundShare > 0.4 ? "nomads"
                 : seat.habitability >= 0.55 ? "kingdom" : "tribes";
      const p = {
        id: "s" + peoples.length, name: naming.name, adjective: naming.adjective || naming.name, culture: naming.culture || null,
        archetype: arch ? arch.id : null, square: s.id, seat: seat.id, cells: area.cells, kind: kind,
      };
      peoples.push(p);
      s.peoples.push(p.id);
    });
  }

  const sketch = { cols: COLS, rows: ROWS, squares: squares, links: links, peoples: peoples };
  Object.defineProperty(world, "sketch", { enumerable: false, configurable: true, writable: true, value: sketch });
  return sketch;
};

/* the land decides the people: archetypes whose home ground fills the area, sea-going ones on
   long coasts, river ones on a river seat; anything else stays possible */
function pickArchetype(rng, archetypes, seat, area) {
  if (!archetypes.length) return null;
  const share = (list) => list.reduce((t, b) => t + (area.biomes[b] || 0), 0) / (area.cells || 1);
  const coast = area.coast / (area.cells || 1);
  return rng.weighted(archetypes, function (a) {
    if (/successor/.test(a.id)) return 0;         /* no one is anyone's heir at the start */
    let w = 1;
    if (a.ground) w += 6 * share(a.ground);
    if ((a.navy || 1) >= 1.5) w += 6 * coast;
    if (/river/.test(a.id) && seat.river > 0) w += 1.2;
    return w;
  });
}

/* the pack's own namer, on the sketch's random stream */
function nameOf(world, rng, region, arch) {
  const fn = world.pack.names && world.pack.names.polity;
  if (typeof fn !== "function") return { name: "Unnamed", adjective: "Unnamed" };
  try { return fn(rng, { world: world, region: region, archetype: arch }); }
  catch (e) { return { name: "Unnamed", adjective: "Unnamed" }; }
}

})();
