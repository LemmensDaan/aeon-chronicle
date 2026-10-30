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
  /* how quickly a square's land lets it develop, against the median lived square (1): good land
     and river floodplains count, the amount of land does not (that is its power, not its pace) */
  {
    const qual = (s) => (s.habitable + 2 * s.river) / (s.land || 1);
    const qs = squares.filter((s) => !s.openSea).map(qual).sort((a, b) => a - b);
    const med = qs.length ? qs[(qs.length / 2) | 0] || 1e-6 : 1;
    for (const s of squares) s.fertile = s.openSea ? 0 : Math.round(100 * clamp(0.6 + 0.4 * qual(s) / med, 0.5, 1.6)) / 100;
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
                 : s.fertile >= 1 && seat.habitability >= 0.55 ? "kingdom" : "tribes";
      const p = {
        id: "s" + peoples.length, name: naming.name, adjective: naming.adjective || naming.name, culture: naming.culture || null,
        archetype: arch ? arch.id : null, square: s.id, seat: seat.id, cells: area.cells, kind: kind,
      };
      peoples.push(p);
      s.peoples.push(p.id);
    });
  }

  const sketch = { cols: COLS, rows: ROWS, squares: squares, links: links, peoples: peoples };
  runSketch(world, sketch, rng);
  runTies(world, sketch);
  Object.defineProperty(world, "sketch", { enumerable: false, configurable: true, writable: true, value: sketch });
  return sketch;
};

/* ------------------------------------------------------------------ the sketch's history --
   Century by century, every lived square develops on the pack's own "learning" scale (the
   engine's: pack.ages[k].at is where age k begins), so the sketch's ages line up with a
   realm's. The median square reaches the last age near the end of the timeline; good land
   develops faster; knowledge leaks along links from more developed neighbours, more so once
   they trade; now and then a dark age knocks a square back. Power is people x development x
   cohesion. Contacts follow from the links, the ages (sea reach) and the power ratio. */
const SEA_BY_AGE = [6, 15, 40, 999, 999];        /* longest sea crossing, in cells, by age */
const STEP = 100;

function runSketch(world, sk, rng) {
  const pack = world.pack, ages = pack.ages && pack.ages.length ? pack.ages : [{ at: 0 }];
  const atLast = ages[ages.length - 1].at || 1000;
  const start = pack.startYear, end = pack.endYear, span = end - start;
  const years = [];
  for (let y = start; y < end; y += STEP) years.push(y);
  const R0 = 0.8 * atLast / (0.95 * span);   /* 0.72: the leak from neighbours supplies the rest */               /* learning a year for the median square */
  const ageOf = (L) => { let k = 0; while (k + 1 < ages.length && L >= ages[k + 1].at) k++; return k; };
  const reachOf = (L) => SEA_BY_AGE[Math.min(SEA_BY_AGE.length - 1, ageOf(L))];
  const sq = sk.squares, lived = sq.map((s) => s.peoples.length > 0);
  const byId = {};
  sk.peoples.forEach((p) => { byId[p.id] = p; });
  const n = sq.length;
  const L = new Float64Array(n), coh = new Float64Array(n).fill(1), pace = new Float64Array(n);
  for (let i = 0; i < n; i++) if (lived[i]) { pace[i] = sq[i].fertile * (0.75 + 0.5 * rng.next()); L[i] = 0; }
  const traded = {}, lastHostile = {}, struck = {};
  const key = (a, b) => Math.min(a, b) + "|" + Math.max(a, b);
  const nomadic = (i) => sq[i].peoples.length && sq[i].peoples.filter((id) => byId[id].kind === "nomads").length * 2 >= sq[i].peoples.length;
  const sailors = (i) => sq[i].peoples.some((id) => { const a = (pack.archetypes || []).find((x) => x.id === byId[id].archetype); return a && (a.navy || 1) >= 1.5; });
  const power = (i) => lived[i] ? sq[i].habitable * (1 + ageOf(L[i]) + (L[i] - ages[ageOf(L[i])].at) / ((ages[ageOf(L[i]) + 1] || { at: atLast * 1.3 }).at - ages[ageOf(L[i])].at || 1)) * coh[i] : 0;
  const leader = (i) => sq[i].peoples.map((id) => byId[id]).sort((a, b) => b.cells - a.cells)[0];
  const curves = sq.map(() => ({ learning: [], age: [], power: [] }));
  const contacts = [];
  const contact = (c) => { contacts.push(c); return c; };

  for (let t = 0; t < years.length; t++) {
    const y0 = years[t], frac = (y0 - start) / span;
    /* develop: own pace rising through the timeline (as the engine's tech does), plus knowledge
       leaking from more developed linked squares */
    const gain = new Float64Array(n);
    for (let i = 0; i < n; i++) if (lived[i]) gain[i] = R0 * STEP * pace[i] * (0.4 + 1.2 * frac) * (0.6 + 0.4 * coh[i]);
    for (const l of sk.links) {
      if (!lived[l.a] || !lived[l.b]) continue;
      const open = l.kind === "land" ? (l.width >= 2 ? 1 : 0.5) * (1 - 0.6 * l.rough)
                 : l.lane <= Math.max(reachOf(L[l.a]), reachOf(L[l.b])) ? (l.lane <= 15 ? 0.6 : l.lane <= 40 ? 0.25 : 0.05) : 0;
      if (!open) continue;
      const w = open * (traded[key(l.a, l.b)] ? 0.12 : 0.05);
      if (L[l.a] > L[l.b]) gain[l.b] += w * (L[l.a] - L[l.b]); else gain[l.a] += w * (L[l.b] - L[l.a]);
    }
    for (let i = 0; i < n; i++) {
      if (!lived[i]) continue;
      L[i] += gain[i];
      coh[i] = clamp(coh[i] + (rng.next() - 0.5) * 0.25 + (1 - coh[i]) * 0.15, 0.4, 1.6);
      /* a dark age: the square falls back part of the way; more likely when cohesion is low */
      if (ageOf(L[i]) >= 1 && rng.chance(0.012 + 0.03 * Math.max(0, 1 - coh[i]))) {
        const was = ageOf(L[i]);
        L[i] = Math.max(0, L[i] - (ages[was].at - ages[was - 1].at) * (0.3 + 0.4 * rng.next()));
        coh[i] = Math.max(0.4, coh[i] - 0.3);
        contact({ year: y0 + rng.int(0, STEP - 1), kind: "dark-age", from: sq[i].id, to: sq[i].id, by: null, outcome: ageOf(L[i]) < was ? "fell-back" : "shaken", strength: 0 });
      }
    }

    /* contacts along every link */
    const hit = {};
    for (const l of rng.shuffle(sk.links)) {
      if (!lived[l.a] || !lived[l.b]) continue;
      const k = key(l.a, l.b);
      for (const [a, b] of [[l.a, l.b], [l.b, l.a]]) {
        const byLand = l.kind === "land";
        if (!byLand && l.lane > reachOf(L[a])) continue;
        const aa = ageOf(L[a]), ab = ageOf(L[b]);
        /* first trade: both past their first age, or the stronger one reaching out by sea */
        if (!traded[k] && aa >= 1 && ab >= 1 && rng.chance(byLand ? 0.5 : l.lane <= 40 ? 0.3 : 0.06)) {
          traded[k] = true;
          contact({ year: y0 + rng.int(0, STEP - 1), kind: "trade", from: sq[a].id, to: sq[b].id, by: leader(a).id, via: l.kind, outcome: "opened", strength: 0 });
          continue;
        }
        if (hit[b] || (lastHostile[k] && y0 - lastHostile[k] < 300) || (struck[b] && y0 - struck[b] < 200)) continue;
        const pa = power(a), pb = power(b) || 1, ratio = pa / pb;
        const gap = (L[a] - L[b]) / ((ages[1] && ages[1].at) || 1);
        let kind = null, chance = 0;
        if (!byLand && aa >= 3 && aa - ab >= 1 && l.lane > 15) { kind = "colonisation"; chance = 0.07 * (aa - ab); }
        else if (byLand && nomadic(a) && ratio > 0.9) { kind = "migration"; chance = 0.03 * Math.min(2, ratio); }
        else if (ratio >= 1.8) {
          kind = byLand ? "invasion" : "raid";
          chance = 0.014 * Math.min(3, ratio - 0.8) * (byLand ? 1 : sailors(a) ? 1.2 : 0.4);
        }
        if (!kind || !rng.chance(chance)) continue;
        const roll = ratio * (0.6 + 0.8 * rng.next());
        let outcome;
        if (kind === "migration") outcome = roll < 1.2 ? "repelled" : roll < 3.5 ? "settled" : "conquest";
        else if (kind === "colonisation") outcome = roll < 1.5 ? "foothold" : roll < 4 ? "colony" : "conquest";
        else if (kind === "raid") outcome = roll < 2.2 ? "repelled" : roll < 5 ? "raided" : "foothold";
        else outcome = roll < 2 ? "repelled" : roll < 3 ? "raided" : roll < 4.5 ? "partial" : "conquest";
        const c = contact({ year: y0 + rng.int(0, STEP - 1), kind: kind, from: sq[a].id, to: sq[b].id, by: leader(a).id, against: leader(b).id,
                            via: l.kind, outcome: outcome, strength: Math.round(100 * ratio) / 100 });
        hit[b] = true; lastHostile[k] = y0; struck[b] = y0;
        /* consequences: newcomers who stay become a people of the square; conquest carries the
           conqueror's knowledge and shakes the conquered; a failed attack costs the attacker */
        if (outcome === "repelled") { coh[a] = Math.max(0.4, coh[a] - 0.1); continue; }
        if (outcome === "raided") { coh[b] = Math.max(0.4, coh[b] - 0.15); continue; }
        if (outcome === "settled" || outcome === "foothold" || outcome === "colony" || outcome === "partial" || outcome === "conquest") {
          const from = leader(a);
          const np = { id: "s" + sk.peoples.length, name: from.name, adjective: from.adjective, culture: from.culture, archetype: from.archetype,
                       square: sq[b].id, seat: null, cells: 0, kind: from.kind, arrived: c.year, from: from.id, how: kind + ":" + outcome };
          sk.peoples.push(np); byId[np.id] = np; sq[b].peoples.push(np.id);
          c.people = np.id;
          const share = { settled: 0.3, foothold: 0.15, colony: 0.3, partial: 0.5, conquest: 0.85 }[outcome];
          if (L[a] > L[b]) L[b] += (L[a] - L[b]) * share * 0.6;
          coh[b] = Math.max(0.4, coh[b] - 0.4 * share);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      curves[i].learning.push(Math.round(L[i]));
      curves[i].age.push(lived[i] ? ageOf(L[i]) : -1);
      curves[i].power.push(Math.round(power(i)));
    }
  }
  contacts.sort((x, y) => x.year - y.year);
  for (const c of contacts) c.text = storyOf(world, sk, byId, c);
  sk.years = years;
  sk.curves = curves;
  sk.contacts = contacts;
  /* each square: the year it reached each age (first time), for the regions to follow */
  sk.squares.forEach((s, i) => {
    s.ageYears = ages.map((a, k) => { const t = curves[i].age.findIndex((v) => v >= k); return lived[i] && t >= 0 ? years[t] : null; });
  });
}

/* The sketch's peaceful ties, after its history and on a random stream of their own (seed +
   ":sketch-ties"), so they change none of its contacts: a peace some years after a war that
   ended short of conquest (a treaty when land was shared out, else a truce), marriages between
   the ruling houses of neighbours at peace (now and then the crowns join: a union), and trading
   leagues of seafaring squares with several trade partners. They are contacts like the rest
   (peace, marriage, league), told in the world chronicle and the regions. */
const HOSTILE = { invasion: 1, raid: 1, migration: 1, colonisation: 1 };
function runTies(world, sk) {
  const rng = AEON.RNG(world.seed + ":sketch-ties"), pack = world.pack, end = pack.endYear;
  const sq = sk.squares, byId = {}, idx = {};
  sk.peoples.forEach((p) => { byId[p.id] = p; });
  sq.forEach((q, i) => { idx[q.id] = i; });
  const leader = (i) => sq[i].peoples.map((id) => byId[id]).sort((a, b) => b.cells - a.cells)[0];
  const stepAt = (y) => Math.max(0, Math.min(sk.years.length - 1, Math.floor((y - sk.years[0]) / STEP)));
  const ageAt = (i, y) => sk.curves[i].age[stepAt(y)], powerAt = (i, y) => sk.curves[i].power[stepAt(y)];
  const key = (a, b) => Math.min(a, b) + "|" + Math.max(a, b);
  const ties = [], hostileYears = {};
  for (const c of sk.contacts) if (HOSTILE[c.kind]) (hostileYears[key(idx[c.from], idx[c.to])] || (hostileYears[key(idx[c.from], idx[c.to])] = [])).push(c.year);
  /* peace after a war that did not end in conquest */
  for (const c of sk.contacts) {
    if (!HOSTILE[c.kind] || c.outcome === "conquest" || !rng.chance(0.55)) continue;
    const y = c.year + rng.int(3, 25);
    if (y >= end) continue;
    const treaty = c.outcome === "partial" || c.outcome === "foothold" || c.outcome === "settled" || c.outcome === "colony";
    ties.push({ year: y, kind: "peace", from: c.from, to: c.to, by: c.by, against: c.against, via: c.via, outcome: treaty ? "treaty" : "truce", strength: 0, after: c.kind });
  }
  /* marriages and unions between neighbours (by land, or a short sea crossing) at peace */
  const wed = {};
  for (const y0 of sk.years) for (const l of sk.links) {
    if (l.kind === "sea" && l.lane > 15) continue;
    const a = l.a, b = l.b, k = key(a, b);
    if (!sq[a].peoples.length || !sq[b].peoples.length || ageAt(a, y0) < 1 || ageAt(b, y0) < 1) continue;
    if (wed[k] != null && y0 - wed[k] < 300) continue;
    if ((hostileYears[k] || []).some((h) => h > y0 - 150 && h < y0 + STEP)) continue;
    if (!rng.chance(0.025)) continue;
    const pa = powerAt(a, y0) || 1, pb = powerAt(b, y0) || 1;
    const union = ageAt(a, y0) >= 2 && ageAt(b, y0) >= 2 && Math.max(pa, pb) / Math.min(pa, pb) < 1.5 && rng.chance(0.25);
    const [x, z] = rng.chance(0.5) ? [a, b] : [b, a];
    wed[k] = y0;
    ties.push({ year: y0 + rng.int(0, STEP - 1), kind: "marriage", from: sq[x].id, to: sq[z].id, by: leader(x).id, against: leader(z).id, via: l.kind, outcome: union ? "union" : "alliance", strength: 0 });
  }
  /* trading leagues: a seafaring square past its second age with several trade partners */
  const leagued = {};
  for (const y0 of sk.years) for (let i = 0; i < sq.length; i++) {
    if (leagued[i] || !sq[i].peoples.length || ageAt(i, y0) < 2 || !sq[i].coast) continue;
    const partners = sk.contacts.filter((c) => c.kind === "trade" && c.via === "sea" && c.year < y0 + STEP && (c.from === sq[i].id || c.to === sq[i].id));
    if (partners.length < 2 || !rng.chance(0.04 * partners.length)) continue;
    const t = partners[partners.length - 1], other = t.from === sq[i].id ? t.to : t.from;
    leagued[i] = true;
    ties.push({ year: Math.max(y0, t.year) + rng.int(0, 40), kind: "league", from: sq[i].id, to: other, by: leader(i).id, against: leader(idx[other]).id, via: "sea", outcome: "league", strength: 0 });
  }
  for (const c of ties) if (c.year < end) { c.text = storyOf(world, sk, byId, c); sk.contacts.push(c); }
  sk.contacts.sort((x, y) => x.year - y.year);
}

/* one line for the world chronicle */
function storyOf(world, sk, byId, c) {
  const P = (id) => (id && byId[id] ? byId[id] : null);
  const by = P(c.by), against = P(c.against);
  const yr = (y) => (world.pack.yearLabel ? world.pack.yearLabel(y) : y < 0 ? -y + " BC" : y + " AD");
  const people = (p) => (p ? p.name : "a people");
  const adj = (p) => (p ? p.adjective : "foreign");
  const land = (id) => { const p = sk.peoples.find((q) => q.square === id && !q.arrived); return p ? "the lands of " + p.name : "square " + id; };
  const at = "In " + yr(c.year) + " ";
  switch (c.kind) {
    case "dark-age": return at + "a dark age fell on " + land(c.to) + (c.outcome === "fell-back" ? ", and much that had been known was lost." : ".");
    case "trade": return at + (c.via === "sea" ? adj(by) + " ships first came to trade with " : adj(by) + " traders first reached ") + land(c.to) + ".";
    case "migration": return at + adj(by) + " herders moved into " + land(c.to) + ({ repelled: ", but were driven back.", settled: " and settled there.", conquest: " and took it for their own." }[c.outcome] || ".");
    case "colonisation": return at + adj(by) + " fleets crossed the open sea to " + land(c.to) + ({ foothold: " and held a strip of its coast.", colony: " and founded colonies there.", conquest: " and conquered it." }[c.outcome] || ".");
    case "raid": return at + adj(by) + " sea-raiders struck " + land(c.to) + ({ repelled: ", and were beaten off.", raided: " and sailed home with plunder.", foothold: " and stayed on its shore." }[c.outcome] || ".");
    case "invasion": return at + people(by) + " invaded " + land(c.to) + ({ repelled: ", and " + people(against) + " threw them back.", raided: " and plundered its borderlands.", partial: " and took part of it.", conquest: " and conquered it." }[c.outcome] || ".");
    case "peace": return at + people(by) + " and " + people(against) + (c.outcome === "treaty" ? " made peace, and settled who held what." : " swore a truce.");
    case "marriage": return at + (c.outcome === "union" ? "a marriage joined the crowns of " + people(by) + " and " + people(against) + "." : "the ruling houses of " + people(by) + " and " + people(against) + " were joined by a marriage.");
    case "league": return at + "the " + adj(by) + " merchants and the " + adj(against) + " formed a trading league.";
  }
  return at + people(by) + " met " + land(c.to) + ".";
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* A region's chapters (docs/REGION_CHAPTERS.md): the stretches of its history worth watching,
   picked from the sketch. A moment is a clash or crossing into the square (or one of its own
   that went abroad and stayed), a dark age, a new age reached, or the century its power rose
   most. A chapter is CHAPTER years from LEAD years before its moment; moments close together
   share one, up to CHAPTER_MAX years. The best MAX_CHAPTERS are kept, in order of time. The
   peaceful ties (runTies) and the first ships over the sea count as much as the smaller wars;
   an age reached counts least. */
const CHAPTER = 50, LEAD = 15, CHAPTER_MAX = 80, MAX_CHAPTERS = 6;
const SCORE = { invasion: 4, colonisation: 3.5, migration: 3, raid: 2, peace: 2.5, marriage: 2.5, league: 3 };
const OUTCOME = { conquest: 1.5, partial: 1.2, colony: 1.2, settled: 1.2, foothold: 1, raided: 1, repelled: 0.8, treaty: 1.2, union: 1.4 };
const chapterCache = new WeakMap();
AEON.chaptersOf = function (world, si) {
  const sk = world.sketch, q = sk && sk.squares[si];
  if (!q || !q.peoples.length || !sk.curves) return [];
  let cache = chapterCache.get(sk);
  if (!cache) chapterCache.set(sk, cache = {});
  if (cache[si]) return cache[si];
  const pack = world.pack, ages = pack.ages || [], start = pack.startYear, end = pack.endYear;
  const byId = {};
  sk.peoples.forEach((p) => { byId[p.id] = p; });
  const adj = (id) => (byId[id] ? byId[id].adjective : "foreign"), name = (id) => (byId[id] ? byId[id].name : "a people");
  const moments = [];
  for (const c of sk.contacts) {
    if (c.kind === "dark-age") {
      if (c.to === q.id) moments.push({ year: c.year, score: c.outcome === "fell-back" ? 3 : 1.5, title: "The dark age", contact: c });
      continue;
    }
    const into = c.to === q.id, out = c.from === q.id && c.to !== q.id;
    if (!into && !(out && c.outcome !== "repelled")) continue;
    const a = adj(c.by), other = adj(into ? c.by : c.against);
    /* trade: only the first ships over the sea count, as exploration */
    if (c.kind === "trade") {
      if (c.via === "sea") moments.push({ year: c.year, score: into ? 1.8 : 2, title: into ? "The first " + a + " ships" : "The " + a + " voyages", contact: c });
      continue;
    }
    const tie = { peace: c.outcome === "treaty" ? "The " + other + " treaty" : "The " + other + " truce",
                  marriage: c.outcome === "union" ? "The union with the " + other + " crown" : "The " + other + " marriage",
                  league: "The " + a + " trading league" }[c.kind];
    const title = tie || (into
      ? { invasion: "The " + a + " invasion", migration: "The " + a + " migration", colonisation: "The " + a + " colonists", raid: "The " + a + " sea-raids" }[c.kind]
      : { invasion: "The " + a + " war abroad", migration: "The " + a + " herders move on", colonisation: "The " + a + " fleets sail", raid: "The " + a + " raiders sail" }[c.kind]);
    moments.push({ year: c.year, score: (SCORE[c.kind] || 2) * (OUTCOME[c.outcome] || 1) * (into || tie ? 1 : 0.7), title: title, contact: c });
  }
  /* a new age reached (in the century the curve says, taken at its middle) */
  (q.ageYears || []).forEach((y, k) => {
    if (k >= 1 && y != null && ages[k]) moments.push({ year: y + STEP / 2, score: 1, title: "The coming of the " + ages[k].name.replace(/^the /i, "") });
  });
  /* the century its power rose most: the rise of its leading people */
  const pw = sk.curves[si].power;
  let best = 0, bt = -1;
  for (let t = 1; t < pw.length; t++) if (pw[t] - pw[t - 1] > best) { best = pw[t] - pw[t - 1]; bt = t; }
  if (bt >= 0) {
    const y = sk.years[bt] + STEP / 2;
    const lead = q.peoples.map((id) => byId[id]).filter((p) => p && (p.arrived == null || p.arrived <= y)).sort((x, z) => z.cells - x.cells)[0];
    if (lead) moments.push({ year: y, score: 2.5, title: "The rise of " + name(lead.id) });
  }
  moments.sort((x, z) => x.year - z.year);
  const out = [];
  for (const m of moments) {
    const last = out[out.length - 1], from = Math.max(start, m.year - LEAD);
    if (last && m.year <= last.to && Math.min(end, m.year + CHAPTER - LEAD) - last.from <= CHAPTER_MAX) {
      last.to = Math.max(last.to, Math.min(end, m.year + CHAPTER - LEAD));
      last.moments.push(m); last.score += m.score;
      if (m.score > last.top.score) { last.top = m; last.title = m.title; last.year = m.year; }
      continue;
    }
    out.push({ from: from, to: Math.min(end, from + CHAPTER), year: m.year, title: m.title, score: m.score, top: m, moments: [m] });
  }
  /* the best, one of each title */
  const kept = [], titles = {};
  for (const c of out.slice().sort((x, z) => z.score - x.score)) {
    if (kept.length >= MAX_CHAPTERS) break;
    if (titles[c.title]) continue;
    titles[c.title] = true; kept.push(c);
  }
  kept.sort((x, z) => x.from - z.from);
  return (cache[si] = kept.map((c) => ({ from: c.from, to: c.to, year: c.year, title: c.title,
    contacts: c.moments.map((m) => m.contact).filter(Boolean), also: c.moments.filter((m) => m !== c.top).map((m) => m.title) })));
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
