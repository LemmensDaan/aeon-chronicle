/* The Mortal Age — grounded, low-fantasy human history, bronze to gunpowder.
   No magic, no monsters. A dry academic chronicle. */
(function () {
"use strict";

/* ====================================================================== *
 *  UTILITIES
 * ====================================================================== */

const ERA_IDX = { bronze: 0, iron: 1, classical: 2, lateantiquity: 3, medieval: 4, powder: 5 };
const CIDS = ["mediterranean", "steppe", "northern", "riverine", "highland", "eastern"];

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function yl(y) { return y < 0 ? (-y) + " BC" : (y || 1) + " AD"; }
function genderOfNum(n) { return ((((n * 2654435761) >>> 0) % 100) < 26) ? "f" : "m"; }
function fill(tpl, map) { return tpl.replace(/\{(\w+)\}/g, function (m, k) { return map[k] != null ? map[k] : ""; }); }
function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
function approx(n) {
  if (n >= 100000) return Math.round(n / 10000) * 10000;
  if (n >= 10000) return Math.round(n / 1000) * 1000;
  if (n >= 1000) return Math.round(n / 100) * 100;
  return Math.max(10, Math.round(n / 10) * 10);
}

/* ====================================================================== *
 *  CULTURES — six syllable grammars, each with its own morphology
 * ====================================================================== */

const CULTURES = {
  mediterranean: {
    on: ["b", "c", "d", "f", "g", "l", "l", "m", "m", "n", "p", "r", "r", "s", "s", "t", "t", "v", "v", "z", "br", "cr", "dr", "gr", "pr", "tr", "st", "th", "ph", "ch", "cl", "pl", "sp"],
    v: ["a", "a", "a", "e", "e", "i", "i", "o", "o", "u", "ae", "ia", "io", "eu"],
    cod: ["l", "n", "r", "s", "m"],
    end: ["n", "r", "s", "l", "m", "nt", "rt", "st", "x", "nd", "rn", "th"],
    mid: 0.4, vi: 0.15,
    polRules: [{ n: "ia", a: "ian" }, { n: "ia", a: "ian" }, { n: "ea", a: "ean" }, { n: "ium", a: "ian" }, { n: "is", a: "ite" }, { n: "ona", a: "onan" }, { n: "ica", a: "ican" }],
    placeSuf: ["ia", "ium", "ae", "ona", "ea", "opolis", "ica"],
    placeFmt: ["{S}{X}", "{S}{X}", "{S}{X}", "The {G} of {S}", "{S}ine {G}", "{S}{X}"],
    setSuf: ["polis", "ium", "ona", "ae", "ea", "ia", "anum"],
    setFmt: ["{S}{X}", "{S}{X}", "{S}{X}", "Port {S}", "New {S}", "{S}{X}"],
    mas: ["us", "os", "an", "ion", "o", "ius", "as", "ides"],
    fem: ["a", "ia", "ea", "ene", "is", "ina"],
    epi: ["the Lawgiver", "the Magnificent", "the Cautious", "the Tax-Gatherer", "Bloodless", "the Builder", "the Elder", "Vinegar", "the Orator", "the Unlucky"],
    geo: { hi: ["Heights", "Mountains", "Ridge"], dry: ["Wastes", "Barrens", "Drylands"], wood: ["Forest", "Woods"], plain: ["Plain", "Fields", "Downs"], wet: ["Marsh", "Fens", "Lagoon"], cold: ["Wilds", "Frontier"], any: ["Coast", "March", "Reach", "Shore", "Province"] },
    chief: ["Chieftain", "Chieftainess"], king: ["King", "Queen"], high: ["Basileus", "Basilissa"], imp: ["Emperor", "Empress"],
    gov: ["Strategos", "Proconsul", "Prefect"], cityE: ["Tyrant", "Wanax"], cityL: ["Archon", "Strategos"], sea: ["Archon", "Doge"],
  },
  steppe: {
    on: ["k", "kh", "g", "gh", "t", "d", "b", "ch", "j", "m", "n", "s", "sh", "y", "t", "k", "b", "tr"],
    v: ["a", "a", "a", "e", "i", "o", "u", "ai", "ui", "uu"],
    cod: ["r", "l", "n", "g", "t", "k"],
    end: ["n", "r", "g", "t", "k", "gh", "l", "m", "s", "ng"],
    mid: 0.45, vi: 0.08,
    polRules: [{ n: "ut", a: "ut" }, { n: "ar", a: "ari" }, { n: "ai", a: "ai" }, { n: "chin", a: "chin" }, { n: "en", a: "en" }, { n: "gut", a: "gut" }],
    placeSuf: ["gol", "nur", "tal", "khot", "sar", "tolgoi"],
    placeFmt: ["{S}{X}", "{S}{X}", "{G} {S}", "{S} {G}"],
    setSuf: ["ordu", "baliq", "khoto", "gol"],
    setFmt: ["{S} Ordu", "{S}{X}", "{S} Baliq", "{S} Winter-Camp"],
    mas: ["gai", "tai", "bek", "ghan", "dei", "mur", "chu", "ur"],
    fem: ["gul", "ai", "chin", "jin", "tu", "qan"],
    epi: ["the Swift", "Iron-Bow", "the Wolf", "Blood-Cup", "the Lame", "the Quiet", "Horse-Breaker", "the Oath-Taker"],
    geo: { hi: ["Ranges", "Ridge"], dry: ["Gobi", "Sands"], wood: ["Taiga", "Forest"], plain: ["Steppe", "Grasslands", "Pasture"], wet: ["Reeds", "Marsh"], cold: ["Tundra", "Waste"], any: ["Valley", "Flats", "Camps"] },
    chief: ["Beg", "Beg"], king: ["Khan", "Khatun"], high: ["Khagan", "Khatun"], imp: ["Khagan", "Khagan"],
    gov: ["Tarkhan", "Yabghu"], cityE: ["Beg", "Beg"], cityL: ["Beg", "Tarkhan"], sea: ["Beg", "Beg"],
  },
  northern: {
    on: ["b", "d", "f", "g", "h", "hr", "j", "k", "l", "m", "n", "r", "s", "sk", "sv", "st", "t", "th", "v", "vr", "y"],
    v: ["a", "a", "e", "i", "o", "o", "u", "y", "ei", "au"],
    cod: ["l", "r", "n", "g", "d", "s"],
    end: ["r", "n", "d", "lf", "rn", "nd", "k", "ld", "rd", "st", "m", "g"],
    mid: 0.4, vi: 0.12,
    polRules: [{ n: "land", a: "landic" }, { n: "mark", a: "markish" }, { n: "heim", a: "heimic" }, { n: "gard", a: "gardian" }, { n: "ings", a: "ing" }],
    placeSuf: ["by", "stad", "wick", "dale", "ness", "fell", "holm", "ford", "mere"],
    placeFmt: ["{S}{X}", "{S}{X}", "{S}{X}", "The {G} of {S}", "{S} {G}"],
    setSuf: ["by", "stad", "wick", "ford", "borg", "haven", "garth", "thorp"],
    setFmt: ["{S}{X}", "{S}{X}", "{S}{X}", "{S}borg", "{S}haven"],
    mas: ["ulf", "ar", "mund", "rik", "vald", "bjorn", "gar", "stein", "ric"],
    fem: ["hild", "dis", "a", "run", "wen", "gerd", "laug"],
    epi: ["Ironhand", "the Unready", "Redbeard", "Fork-Beard", "the Stout", "Skull-Splitter", "the Old", "Long-Shanks", "Ash-Hand", "Oath-Breaker"],
    patro: ["sson", "sdottir"],
    geo: { hi: ["Fell", "Mountains"], dry: ["Barrens"], wood: ["Wood", "Forest"], plain: ["Moor", "Lowlands"], wet: ["Fen", "Bog"], cold: ["Ice", "Wastes"], any: ["Firth", "Coast", "March"] },
    chief: ["Jarl", "Jarl"], king: ["King", "Queen"], high: ["High King", "High Queen"], imp: ["Overking", "Overqueen"],
    gov: ["Earl", "Reeve"], cityE: ["Jarl", "Jarl"], cityL: ["Lawspeaker", "Lawspeaker"], sea: ["Jarl", "Lawspeaker"],
  },
  riverine: {
    on: ["k", "kh", "m", "n", "t", "d", "s", "sh", "b", "h", "r", "z", "ur", "ish", "n", "m", "t"],
    v: ["a", "a", "a", "i", "u", "e", "u"],
    cod: ["r", "n", "m", "t", "s", "sh"],
    end: ["t", "r", "sh", "m", "n", "k", "s", "b"],
    mid: 0.45, vi: 0.12,
    polRules: [{ n: "at", a: "ati" }, { n: "ur", a: "uri" }, { n: "esh", a: "eshite" }, { n: "akka", a: "akkan" }, { n: "ra", a: "ran" }, { n: "u", a: "uan" }],
    placeSuf: ["ur", "at", "esh", "kar", "um", "ib"],
    placeFmt: ["{S}{X}", "{S}{X}", "The {G} of {S}", "{S}{X}"],
    setSuf: ["ur", "at", "esh", "kar", "um", "ib"],
    setFmt: ["{S}{X}", "Dur-{S}", "{S}-Kar", "{S}{X}"],
    mas: ["shur", "un", "atu", "maru", "ibi", "esh", "kar"],
    fem: ["ati", "ishu", "enna", "ara", "ame", "ut"],
    epi: ["Lord of the Flood", "the Measurer", "Granary-Keeper", "the Gracious", "Smiter of Nine Peoples", "the Silent", "Scourge of the Delta"],
    geo: { hi: ["Cliffs", "Heights"], dry: ["Red Land", "Waste"], wood: ["Reed-Groves"], plain: ["Floodplain", "Black Land", "Delta"], wet: ["Marshes", "Delta"], cold: ["Uplands"], any: ["River-Reach", "Bank", "Cataracts"] },
    chief: ["Ensi", "Ensi"], king: ["King", "Queen"], high: ["Great King", "Great Queen"], imp: ["God-King", "God-Queen"],
    gov: ["Satrap", "Nomarch"], cityE: ["Ensi", "Ensi"], cityL: ["Lugal", "Lugal"], sea: ["Ensi", "Lugal"],
  },
  highland: {
    on: ["k", "kh", "g", "gv", "dz", "tz", "ts", "tq", "q", "b", "m", "n", "r", "v", "z", "zh", "sh"],
    v: ["a", "a", "e", "i", "o", "u", "ia", "ue"],
    cod: ["r", "n", "l", "m", "kh", "t"],
    end: ["kh", "r", "n", "l", "m", "z", "sh", "ts", "t", "gh"],
    mid: 0.4, vi: 0.1,
    polRules: [{ n: "eti", a: "etian" }, { n: "ani", a: "an" }, { n: "ula", a: "ulan" }, { n: "ghe", a: "ghean" }, { n: "ia", a: "ian" }, { n: "astan", a: "astani" }],
    placeSuf: ["eti", "ari", "dzor", "vank", "gora", "uli"],
    placeFmt: ["{S}{X}", "{S}{X}", "{S} {G}", "{S} {G}"],
    setSuf: ["eti", "kert", "ashen", "gora", "vank"],
    setFmt: ["{S}{X}", "{S}{X}", "Upper {S}", "{S}kert"],
    mas: ["ari", "uk", "ghi", "ez", "ani", "ot", "vakh"],
    fem: ["ana", "eli", "ule", "ina", "ushe", "ele"],
    epi: ["the Stone-Hearted", "Goat-Lord", "the Feud-Keeper", "One-Eye", "the Hospitable", "the Avenger", "Pass-Holder"],
    geo: { hi: ["Pass", "Crags", "Heights", "Gorge"], dry: ["Scree"], wood: ["Beechwood"], plain: ["Valley", "Meadows"], wet: ["Bogs"], cold: ["Snows"], any: ["Hold", "Glen"] },
    chief: ["Clan-Chief", "Clan-Mother"], king: ["Prince", "Princess"], high: ["Grand Prince", "Grand Princess"], imp: ["King of Kings", "Queen of Queens"],
    gov: ["Eristav", "Warden"], cityE: ["Clan-Chief", "Clan-Mother"], cityL: ["Elder", "Elder"], sea: ["Elder", "Elder"],
  },
  eastern: {
    on: ["b", "ch", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p", "q", "s", "sh", "t", "w", "x", "y", "z", "zh"],
    v: ["a", "ai", "ao", "e", "ei", "i", "iu", "o", "ou", "u", "ui", "ua"],
    cod: ["n", "ng"],
    end: ["n", "ng", "", "n", "ng"],
    mid: 0.3, vi: 0.05, pmax: 1,
    polRules: [{ n: "zhou", a: "zhou" }, { n: "guo", a: "guo" }, { n: "yuan", a: "yuan" }, { n: "jing", a: "jing" }, { n: "shan", a: "shan" }, { n: "liang", a: "liang" }],
    placeSuf: ["zhou", "cheng", "shan", "jiang", "pu", "guan"],
    placeFmt: ["{S}{X}", "{S}{X}", "{S} {G}", "{S}{X}"],
    setSuf: ["zhou", "cheng", "fu", "jing", "pu"],
    setFmt: ["{S}{X}", "{S}{X}", "{S}cheng", "Great {S}"],
    mas: ["wei", "long", "an", "hui", "kai", "jun"],
    fem: ["mei", "lan", "ying", "hua", "xia", "ning"],
    epi: ["the Frugal", "the Stern", "of Bright Virtue", "the Mild", "Heaven's Chosen", "the Scholar", "the Sleepless"],
    geo: { hi: ["Range", "Heights"], dry: ["Desert", "Gravel Waste"], wood: ["Bamboo Forest", "Forest"], plain: ["Plain", "Fields"], wet: ["Lakes", "Wetlands"], cold: ["Cold Waste"], any: ["Coast", "Marches", "Prefecture"] },
    chief: ["Lord", "Lady"], king: ["King", "Queen"], high: ["Grand Duke", "Grand Duchess"], imp: ["Son of Heaven", "Daughter of Heaven"],
    gov: ["Governor", "Prefect"], cityE: ["Lord", "Lady"], cityL: ["Magistrate", "Magistrate"], sea: ["Magistrate", "Magistrate"],
  },
};

const BIOME_W = {
  grassland: [2, 3, 1, 1, 0.5, 2], savanna: [1.5, 2, 0.2, 3, 1, 0.5], forest: [2, 0.3, 3, 0.3, 1.5, 1.5],
  taiga: [0.3, 2, 4, 0.1, 1, 0.5], tundra: [0.1, 3, 3, 0.1, 0.3, 0.2], jungle: [0.5, 0.1, 0.1, 2, 1, 3],
  desert: [1, 2, 0.1, 4, 1, 0.5], mountain: [1, 1, 0.8, 0.5, 5, 1], swamp: [1, 0.2, 1, 3, 0.5, 2],
};
const ARCH_CULTURE = { steppe: "steppe", hillclans: "highland", riverkingdom: "riverine", maritime: "mediterranean" };

function pickCulture(rng, region, arch, force) {
  if (force && CULTURES[force]) return force;
  if (arch && ARCH_CULTURE[arch.id] && rng.chance(0.65)) return ARCH_CULTURE[arch.id];
  if (arch && arch.id === "empire" && rng.chance(0.5)) return rng.pick(["eastern", "mediterranean"]);
  const w = (region && BIOME_W[region.biome]) || [1, 1, 1, 1, 1, 1];
  const i = rng.weighted([0, 1, 2, 3, 4, 5], function (k) { return w[k]; });
  return CIDS[i];
}

function stem(rng, c, minS, maxS) {
  const n = rng.int(minS || 2, maxS || 3);
  let s = "";
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const on = (i === 0 && rng.chance(c.vi || 0.1)) ? "" : rng.pick(c.on);
    const co = last ? rng.pick(c.end) : (rng.chance(c.mid || 0.35) ? rng.pick(c.cod) : "");
    s += on + rng.pick(c.v) + co;
  }
  return cap(s);
}

function personal(rng, c, g) {
  return stem(rng, c, 1, c.pmax || 2) + rng.pick(g === "f" ? c.fem : c.mas);
}

function geoClass(biome) {
  switch (biome) {
    case "mountain": return "hi";
    case "desert": return "dry";
    case "forest": case "taiga": case "jungle": return "wood";
    case "grassland": case "savanna": return "plain";
    case "swamp": return "wet";
    case "tundra": case "ice": return "cold";
    default: return "any";
  }
}

function cultureOf(rng, ctx) {
  const w = ctx.world;
  if (ctx.polity && ctx.polity.culture) return ctx.polity.culture;
  const r = ctx.region;
  if (r && r.owner && w.polities[r.owner] && w.polities[r.owner].culture) return w.polities[r.owner].culture;
  return pickCulture(rng, r, null, ctx.culture);
}

const EPITHETS = ["the Younger", "the Pious", "the Lame", "the Fat", "the Stammerer", "the Careful", "the Bald", "the Cruel", "the Fortunate", "the Mild", "the Grim", "the Great", "the Short", "the Silent", "the Handsome", "the Bastard", "the Unready", "the Tall", "the Peaceful", "the Quarrelsome"];

const ROLE_TITLES = {
  scholar: [["Scribe", "Sage"], ["Scribe", "Sage"], ["Philosopher", "Sage"], ["Scholar", "Chronicler"], ["Master", "Chronicler"], ["Humanist", "Natural Philosopher"]],
  general: [["War-Leader"], ["War-Leader"], ["General", "Strategos"], ["General", "Count"], ["Marshal", "Constable"], ["Captain-General", "Condottiere"]],
  admiral: [["Sea-Captain"], ["Sea-Captain"], ["Navarch", "Admiral"], ["Admiral"], ["Admiral"], ["Admiral", "Captain-General of the Fleet"]],
  prophet: [["Prophet", "Seer"]], heresiarch: [["Heresiarch"]], architect: [["Master Builder"]],
  poet: [["Poet", "Bard"]], merchant: [["Merchant", "Factor"]], regent: [["Regent"]], pretender: [["Pretender"]],
  warlord: [["Warlord"]], heir: [["Prince", "Princess"]],
};

function titleFor(world, p, g) {
  if (!p) return "Ruler";
  const c = CULTURES[p.culture] || CULTURES.mediterranean;
  const e = ERA_IDX[world.era] || 0, f = g === "f" ? 1 : 0;
  const arch = p.archetypeId, big = p.regions.length;
  const emp = arch === "empire" || (world._hist && world._hist.emperor[p.id]);
  if (arch === "theocracy") return e <= 1 ? ["High Priest", "High Priestess"][f] : e === 2 ? "Hierophant" : e === 3 ? ["Patriarch", "Matriarch"][f] : "Pontiff";
  if (emp) return c.imp[f];
  if (arch === "maritime" && e >= 2) return c.sea[e >= 4 ? 1 : 0];
  if (arch === "citystate") return e <= 1 ? c.cityE[f] : c.cityL[e >= 4 ? 1 : 0];
  if (arch === "steppe") return big > 6 || e >= 3 ? c.high[f] : c.king[f];
  if (arch === "hillclans" && e < 4) return c.chief[f];
  if (big <= 2 && e <= 1) return c.chief[f];
  if (e >= 4 && big >= 5) return c.high[f];
  return c.king[f];
}

function faithName(rng, cid) {
  const c = CULTURES[cid] || CULTURES.mediterranean;
  const core = stem(rng, c, 1, 2);
  const forms = [
    "The Cult of " + core, "The Mysteries of " + core, "The " + core + "ine Rite",
    "The Way of the " + rng.pick(["Seven", "Nine", "Two", "Hollow", "Bright", "Silent", "Waking", "Drowned"]) + " " + rng.pick(["Lamps", "Gates", "Fathers", "Rivers", "Witnesses", "Mothers", "Names"]),
    "The Worship of " + core + " the " + rng.pick(["Granary-Keeper", "Sun-Bearer", "Judge", "Ferryman", "Lawgiver", "Tall One", "Healer"]),
    "The Teaching of " + personal(rng, c, rng.pick(["m", "f"])),
  ];
  return { name: rng.pick(forms), core: core };
}

const NAMES = {
  polity: function (rng, ctx) {
    ctx = ctx || {};
    const cid = pickCulture(rng, ctx.region, ctx.archetype, ctx.culture);
    const c = CULTURES[cid];
    const st = stem(rng, c, 2, 3), r = rng.pick(c.polRules);
    return { name: st + r.n, adjective: st + r.a, culture: cid, stem: st };
  },
  figure: function (rng, ctx) {
    const w = ctx.world, p = ctx.polity, role = ctx.role || "ruler";
    const c = CULTURES[(p && p.culture) || pickCulture(rng, null, null)];
    const g = genderOfNum(w._ids.figure - 1);
    let nm = personal(rng, c, g);
    if (c.patro && rng.chance(0.35)) nm += " " + stem(rng, c, 1, 2) + c.patro[g === "f" ? 1 : 0];
    else if (rng.chance(role === "ruler" ? 0.45 : 0.2)) nm += " " + rng.pick(c.epi.concat(EPITHETS));
    let title;
    if (role === "ruler") title = titleFor(w, p, g);
    else if (role === "governor") title = rng.pick(c.gov);
    else if (ROLE_TITLES[role]) {
      const rt = ROLE_TITLES[role], row = rt[Math.min(ERA_IDX[w.era] || 0, rt.length - 1)];
      title = row[Math.min(g === "f" ? 1 : 0, row.length - 1)];
    } else title = cap(role);
    return { name: nm, title: title };
  },
  place: function (rng, ctx) {
    const c = CULTURES[cultureOf(rng, ctx)];
    const reg = ctx.region;
    const gw = c.geo[geoClass(reg && reg.biome)] || c.geo.any;
    return fill(rng.pick(c.placeFmt), { S: stem(rng, c, 2, 2), X: rng.pick(c.placeSuf), G: rng.pick(gw) });
  },
  settlement: function (rng, ctx) {
    const c = CULTURES[cultureOf(rng, ctx)];
    return fill(rng.pick(c.setFmt), { S: stem(rng, c, 2, 3), X: rng.pick(c.setSuf) });
  },
  artifact: function (rng, ctx) {
    const c = CULTURES[(ctx.polity && ctx.polity.culture) || "mediterranean"];
    const adj = ctx.polity ? ctx.polity.adjective : stem(rng, c, 2, 2) + "ian";
    return rng.pick([
      "The " + adj + " Standard", "The Ledger of " + stem(rng, c, 2, 2),
      "The " + rng.pick(["Bronze", "Grey", "Ivory", "Salt", "Red"]) + " " + rng.pick(["Seal", "Tablet", "Cup", "Reliquary", "Gate", "Ewer"]),
      "The " + stem(rng, c, 1, 2) + " Codex",
    ]);
  },
};

/* ====================================================================== *
 *  FLAVOUR POOLS
 * ====================================================================== */

const EPITAPHS = [
  "Reigned twenty-two years and left the treasury lighter than found.",
  "Died in the autumn campaign; the army marched home with the body in a cart of salt.",
  "Was remembered chiefly for the roads, which outlasted the dynasty.",
  "Died of a fever in a borrowed bed, three days' ride from the capital.",
  "Left four heirs, two of whom survived the funeral.",
  "Was praised by the court historians and by no one else.",
  "Governed without brilliance and without cruelty, which was thought remarkable.",
  "Died in the middle of a sentence, according to the secretary who was taking it down.",
  "Won every battle but the last, which was against the kidneys.",
  "Built a wall that was never attacked and a treasury that was always emptied.",
  "Was buried with eleven horses, a number the priests had to be paid to find auspicious.",
  "The tax rolls were accurate during this reign, and nothing else is said for it.",
  "Had the misfortune to reign during a long drought and the added misfortune to be blamed for it.",
  "Was said to have wept at the sack of a city and to have taken a share of the proceeds.",
  "Outlived three physicians, four chancellors and the patience of the heir.",
  "Died hunting, which the court called an accident and the heir called a mercy.",
  "Rebuilt the temple of the city and was buried, at the priests' insistence, under its floor.",
  "Ruled thirty years, of which the last eleven were conducted by a eunuch.",
  "Left a will so ambiguous that two armies later claimed to be executing it.",
  "Was feared in the provinces, mocked in the capital, and mourned only in the stables.",
  "Won a great victory in youth and spent the rest of the reign explaining it.",
  "Died of wounds taken at a border skirmish too small to be named.",
  "Was mild in temper and slow in decision; both qualities were counted against the dead.",
  "Dismissed a good minister, took bad advice, and died before the consequences arrived.",
  "A just ruler, according to the one tablet that survives, which was commissioned by the family.",
  "Reigned long enough to be tired of it. The chroniclers record this as piety.",
  "Died in the winter palace with the stoves unlit, owing to a dispute over the price of wood.",
  "Taxed the salt, the hearth and the dead, in that order.",
  "Was succeeded at once, the only incident being that no one mentioned it.",
  "Lost two provinces and a child in the same year and was not seen to change expression.",
  "Left behind a code of laws, a ruined treasury, and a reputation for fairness that no contemporary shared.",
  "Was poisoned, in the opinion of the physician, who was himself dead by the following week.",
  "Spent a lifetime expanding the borders and a final year learning what they cost.",
  "Was buried in the old manner, with the household, which the later dynasty declined to repeat.",
  "Reigned through three famines and was thanked for none of the harvests between.",
  "Died young, leaving a legend that grew in proportion to what had not been attempted.",
  "Was pious, thrifty and unpopular, and in all three the equal of the previous ruler.",
  "Went out to meet an envoy and returned in a litter.",
  "Founded a school, closed a mint, and exiled the only man who understood either.",
  "Was brought low by a tooth. The court physicians advised against the remedy, and were not consulted.",
  "Died on a pilgrimage; the pilgrims continued, it is recorded, to the shrine.",
  "Governed through three councils and was dominated by the fourth.",
  "Is credited with the draining of the marshes and blamed for the fevers that followed.",
  "Held the realm together by being too cautious to break it.",
  "Saw the harvest in, signed the levy for the spring, and died that night. The levy was collected.",
  "Died of old age, which in that reign was an unusual achievement for a person of rank.",
  "Was buried in a plain tomb at the ruler's own request, for which the masons were not forgiven.",
  "Left the realm larger than found and the army smaller than needed.",
  "Reigned eight years, mostly in the saddle, and was lost at a ford whose name nobody recorded.",
  "Kept the peace with money and the money with taxes, and the taxes with the army.",
  "Was assassinated by someone close enough to be thanked for the tea.",
  "Commissioned an epic of the reign. The poet, being honest, was paid and then banished.",
  "Was celebrated for justice by the poor, who never attended the court, and condemned for it by those who did.",
  "Is remembered as the last ruler who could name every captain of the army.",
  "Was learned in the stars and uninformed about the harvest.",
  "Died in debt to the bankers of three cities, none of which attended the funeral.",
  "Preferred hawks to ministers, and left the ministers in power.",
  "Died at the age of sixty, having outlived the war, the plague, and every ally.",
  "Governed the realm as a household, and the household as a realm, and was equally resented by both.",
  "Spared the rebel cities and was repaid in the way such mercies are.",
  "Did less than the legend claims and more than the critics allow.",
  "Died before the great work was finished and was spared its cost overruns.",
  "Gave the order whose consequences the successors would spend two generations undoing.",
];

const CASUS_BELLI = [
  "an unpaid dowry", "the insult done to an ambassador at a banquet", "a boundary stone moved in the night",
  "the harbouring of a pretender", "a broken oath sworn on the river", "tribute eleven months in arrears",
  "the murder of a caravan master in disputed country", "an ancient claim to the northern pastures",
  "the desecration of a border shrine", "the seizure of grain ships in a time of dearth",
  "the refusal of a marriage that had been promised", "raids on the frontier villages that no one would acknowledge",
  "a quarrel over the tolls of a mountain pass", "the unavenged death of a hostage prince",
  "a disputed inheritance of two border estates", "a treaty clause read differently by each party",
  "the theft of the horses of a visiting envoy", "the diversion of a river for the benefit of the upstream farmers",
  "an insult carved on the lintel of a gate", "the sheltering of fugitive debtors",
  "a seer's declaration, delivered at a convenient moment", "the plunder of a wedding procession on the road",
  "an old grievance that had survived three treaties", "the fortification of a hill that both sides called theirs",
  "the unpunished killing of merchants at a fair", "a salt-pan whose ownership had never been settled",
  "the cutting of a royal grove for ship timber", "a letter of unusual rudeness, later said to have been forged",
  "the refusal to return a runaway governor", "a harvest-tax paid in coin of poor silver",
  "the arrest of a priest crossing the frontier", "the closing of a market that the neighbour had financed",
  "a prophecy that no one could afterwards locate", "the ruler's need for a war to hold the army together",
];

const PLAGUES = [
  "the Grey Sweat", "the Spotted Fever", "the Coughing Year", "the Black Swelling", "the Sleeping Sickness",
  "the Red Flux", "the Lung-Rot", "the Burning Pestilence", "the Dry Cough", "the White Tongue",
  "the Marsh Fever", "the Dancing Death", "the Blue Distemper", "the Yellow Fever of the Granaries",
  "the Great Mortality", "the Wasting", "the Weeping Boils", "the Tertian Sickness", "the Drowned Lung",
  "the Bloody Flux of the Camps", "the Camp Fever", "the Sweating Sickness", "the Seven-Day Plague",
  "the Itching Death", "the Winter Sickness", "the Hollow Cough", "the Crimson Boils",
];

const OMENS = [
  "a comet with a tail like a broom", "a calf born with two heads in the royal stables", "an eclipse at midday",
  "a spring that ran red for three days", "a flight of cranes flying south in midsummer", "a flock of starlings that blotted out the sun",
  "the sudden death of the sacred bull", "a river that ran backwards for a morning", "a hailstorm that killed the swans on the lake",
  "a fire in the granary that spared the seed-corn", "three suns observed at dawn by the border guard",
  "a child who spoke in the language of a country no one had visited", "the collapse of the oldest tree in the capital",
  "a rain of fish upon a market town", "a two-tailed star in the east", "a boy born with a tooth, in the royal household",
  "a swarm of locusts that stopped at the temple wall", "a lamb with an extra leg, offered at the winter sacrifice",
  "a standing stone that fell without cause", "a bell that rang unstruck during the harvest festival",
  "the unexplained silence of the oracle for a month", "a stag seen walking in the main street at dawn",
  "a bridge that gave way under no weight at all", "a sky red at midnight along the northern horizon",
  "a mule that foaled", "a well that went dry on the feast of the founder",
];

const CAUSES_OF_DEATH = [
  "a fever", "a fall from a horse", "a hunting accident", "poison in the wine", "an arrow at a minor skirmish",
  "a surfeit of lampreys", "the stone", "a stroke at table", "wounds taken at the siege", "dysentery in camp",
  "an infected tooth", "drowning at a ford", "a fall on the palace stairs", "the sweating sickness", "a cold caught on campaign",
  "a surgeon's error", "old age and a long winter", "grief, according to the court", "a quarrel with the guard",
];

const TREATIES = [
  "the Peace of {P}", "the Treaty of {P}", "the Accord of {P}", "the Concord of {P}", "the Settlement of {P}",
  "the Oaths at {P}", "the Compact of {P}", "the Convention of {P}", "the Truce at {P}", "the Articles of {P}",
  "the Peace of the Two Rivers at {P}", "the Treaty of the Salt Road, signed at {P}", "the Reconciliation of {P}",
  "the Armistice of {P}", "the Partition of {P}", "the Pacification of {P}", "the Exchange of Hostages at {P}",
  "the Peace of the Burnt Harvest, agreed at {P}", "the Edict of {P}", "the Oath on the Bridge at {P}",
];

const TECH_LOST = [
  ["the casting of large bronze vessels", "the reckoning of the river's rise", "the construction of vaulted tombs", "the weaving of the fine linen", "the working of tin-bronze to the old specification"],
  ["the smelting of high-grade steel", "the maintenance of the great canals", "the construction of the sea-going galley", "the engraving of the cylinder seals", "the casting of iron in large pieces"],
  ["the making of hydraulic concrete", "the building of the large aqueducts", "the surveying of roads", "the reading of the old script", "the keeping of the census", "the casting of bronze in the lost-wax method"],
  ["the engineering of the great domes", "the craft of the mosaic-layers", "the copying of secular texts", "the minting of fine coin", "the glassmaker's art", "the drilling of the artesian wells"],
  ["the casting of the great bells", "the building of the high vault", "the drafting of the long charters", "the working of the fine steel blades", "the grafting of the vine", "the making of the large windows"],
  ["the casting of the largest cannon", "the grinding of lenses", "the navigation of the long ocean crossing", "the engraving of the finest type", "the compounding of reliable powder"],
];

const ARCH_ORIGIN = {
  citystate: "when a dozen walled towns agreed to sit together each spring at {S}, and to bury their quarrels, or at least to adjourn them",
  riverkingdom: "when the villages along the flood-plain accepted a single measurer of the water, and with it a single claimant to the grain",
  steppe: "when the herding clans, having exhausted the quarrels that separated them, swore a common oath at {S}",
  maritime: "when the merchant houses of {S} elected a magistrate for a single year and found, for the next three hundred, that they could not agree on anyone else",
  theocracy: "around the shrine at {S}, whose priests held the granary and the calendar and in due course the law",
  hillclans: "in the hills above {S}, where the feuding clans first agreed on a common blood-price and on little else",
  empire: "when the scribes of {S} extended their system of registers over the neighbouring districts, and the soldiers followed the registers",
  successor: "when the officers of a collapsed order retained {S}, its treasury and its seals, and named themselves its heirs",
};

const BATTLE_LINES = [
  ["{W}'s chariots broke {L}'s line at {P} before the infantry had properly formed.", "At {P} the bronze-armoured spearmen of {W} held a ford against {L} until the evening, and {L} withdrew at night.", "{L}'s archers ran short of arrows at {P}; the rest followed from that."],
  ["At {P} the iron-bladed infantry of {W} cut through {L}'s bronze-armed levies as through reeds.", "{W} caught {L} crossing the river at {P} and killed those on the near bank.", "{L}'s cavalry charged the wrong flank at {P} and was not seen again before dark."],
  ["The disciplined files of {W} stood at {P} while {L}'s attack broke itself against them, and were then led forward.", "At {P} {W}'s engineers had dug the field before the battle, which {L} found during it.", "{L}'s heavy horse outran its own infantry at {P}, and the infantry was cut down alone."],
  ["At {P}, armoured lancers under {W} rode down {L}'s levy, which had not been paid since spring.", "{W} drew {L}'s foot into the marsh at {P}, where the horse could not reach it.", "{L}'s mercenaries at {P} learned during the battle that their wages had been used to bribe the wrong captain."],
  ["At {P}, dismounted knights of {W} held a ridge until {L}'s bowmen were spent.", "{W}'s crossbowmen shot down {L}'s charge at {P} from behind a line of stakes.", "In the mud of {P}, {L}'s heavy horse could not manoeuvre, and was taken by the foot."],
  ["At {P}, {W}'s pike block advanced behind its guns, and {L}'s cavalry, which had not seen the like, charged it twice.", "Cannon decided the field at {P}: {L}'s line did not survive the second volley.", "{L}'s arquebusiers fired too early at {P}, and were overrun before they could reload."],
];

const SIEGE_METHODS = [
  ["starved the town out over two summers", "took the walls by a ramp of baskets and earth", "bribed the keeper of a postern gate"],
  ["breached the wall with rams under hide roofs", "undermined a tower and fired the props", "stormed the town after a six-month blockade"],
  ["raised siege towers and torsion engines", "dug a mine under the gate and brought the wall down", "cut the aqueduct and waited"],
  ["took it by treachery at an unwatched gate", "reduced the walls with stone-throwing engines and a long winter", "sapped the walls under cover of a feigned retreat"],
  ["battered the gate with trebuchets for the better part of a year", "starved the garrison until the cats were gone", "sapped the curtain wall and fired the tunnel"],
  ["opened the walls with bombards in nineteen days", "mined the bastion and exploded it", "starved the city until the cannon were no longer needed"],
];

const NAVAL = ["penteconters", "long galleys", "dromons", "longships", "cogs", "war galleys"];

const WONDERS = [
  [["The {A} Ziggurat", "ziggurat"], ["The Great Granary of {P}", "granary"], ["The Tomb of the Kings at {P}", "tomb"], ["The Sun-Temple of {P}", "temple"]],
  [["The Lighthouse of {P}", "lighthouse"], ["The Great Walls of {P}", "walls"], ["The Processional Way of {P}", "road"], ["The Treasury Tower of {P}", "tower"]],
  [["The {A} Aqueduct", "aqueduct"], ["The Hippodrome of {P}", "hippodrome"], ["The Great Harbour of {P}", "harbour"], ["The Marble Colonnade of {P}", "colonnade"]],
  [["The Great Basilica of {P}", "basilica"], ["The Domed Hall of {P}", "hall"], ["The Sea-Walls of {P}", "walls"], ["The Palace of Mirrors at {P}", "palace"]],
  [["The Cathedral of {P}", "cathedral"], ["The Great Bridge of {P}", "bridge"], ["The Citadel of {P}", "citadel"], ["The Observatory at {P}", "observatory"]],
  [["The Arsenal of {P}", "arsenal"], ["The Star Fortress of {P}", "fortress"], ["The Bourse of {P}", "exchange"], ["The Great Cannon-Foundry at {P}", "foundry"]],
];

const LAW_MATERIAL = ["inscribed on clay cylinders", "cut into stelae of black basalt", "engraved on bronze tablets set up in the market", "copied onto forty rolls of papyrus", "written in a codex of two hundred leaves", "printed, in the later manner, in an edition of six hundred copies"];
const LAW_CLAUSES = ["a graduated schedule of fines for injury to freemen", "the death penalty for moving a boundary stone", "a rule that no debtor might be held for more than three years", "the first limits on the blood-feud", "the principle that a false witness should suffer the penalty of the accused", "a fixed price for bread in years of dearth", "the right of any free person to appeal to the ruler in person, which was exercised twice"];

const SCHOLAR_WORKS = [
  ["a table of the river's annual rise", "a treatise on the measurement of fields", "a ledger of the stars, kept for forty years"],
  ["a cosmology that placed the city at the centre of everything", "a treatise on the properties of iron", "a history of the kings in nine tablets"],
  ["a work on the causes of the winds", "a survey of the known world in eleven books", "a handbook of geometry and surveying", "a natural history of the provinces"],
  ["a compendium of the older learning, abridged", "a chronicle from the creation of the world to the author's own year", "a commentary on the commentaries"],
  ["a summa of every question that could reasonably be put", "an herbal in four hundred entries", "a treatise on the astrolabe", "a work on optics that was misunderstood for two centuries"],
  ["a treatise on the motion of projectiles", "an anatomy based on actual dissection", "a map of the world that included the western ocean, with confidence", "a manual of double-entry accounting"],
];

const INVENTIONS = [
  [["the ox-drawn plough", "plough"], ["the sailing ship with a true keel", "ship"], ["the potter's wheel in the temple workshops", "wheel"], ["the practice of leaving a field fallow in alternate years", "fallow"]],
  [["the iron ploughshare", "plough"], ["the water-wheel", "mill"], ["the signal beacon system", "beacon"], ["iron-tipped drills for the deep wells", "well"]],
  [["hydraulic cement", "cement"], ["the great water-mills", "mill"], ["the screw press", "press"], ["the paved road with side-drains", "road"]],
  [["the heavy plough and the three-field rotation", "plough"], ["the stirrup", "stirrup"], ["the lateen sail", "sail"], ["the horse collar", "collar"]],
  [["the windmill", "mill"], ["spectacles", "lens"], ["the mechanical clock", "clock"], ["the blast furnace", "furnace"]],
  [["the carrack and the long ocean voyage", "ship"], ["the printing of maps from copper plates", "map"], ["the deep-shaft silver mine with drainage engines", "mine"], ["the sharply improved manufacture of paper", "paper"]],
];

const REFORMS = [
  [["the chariot arm", 0.08], ["the composite bow", 0.07], ["the bronze scale-armoured infantry", 0.06]],
  [["the iron-bladed infantry", 0.08], ["the mounted archer", 0.07], ["the compulsory enrolment of free farmers", 0.06]],
  [["the close-ordered phalanx", 0.08], ["the legion of cohorts", 0.1], ["the professional engineer corps", 0.06]],
  [["the armoured lancer", 0.1], ["the mounted bowman", 0.08], ["the frontier militia settled on state land", 0.06]],
  [["the crossbow levy", 0.08], ["the hired company", 0.07], ["the stone castle on the old motte", 0.06]],
  [["the pike block", 0.1], ["the standing army paid from the customs", 0.12], ["the arquebus company", 0.1]],
];

const GOODS = [
  ["tin", "copper", "lapis", "cedar", "dyed wool", "salt fish", "amber"],
  ["iron ingots", "wine", "olive oil", "dyed cloth", "amber", "salt", "tin"],
  ["silk", "glass", "incense", "papyrus", "garum", "ivory", "pepper"],
  ["silk", "furs", "wax", "slaves", "spices", "glass", "relics"],
  ["alum", "furs", "woollen cloth", "spices", "sugar", "silk", "salt"],
  ["spices", "printed books", "sugar", "silver", "cannon", "fine cloth", "indigo"],
];

const RESOURCE_FINDS = [
  ["a seam of copper on the northern slope", "tin-bearing gravels in a river bed", "a bed of fine clay", "a salt spring"],
  ["an outcrop of iron ore", "a silver-bearing vein", "a salt dome", "a lead mine"],
  ["a rich silver lode", "a quarry of fine white marble", "a vein of gold in the river sands", "a bed of sulphur"],
  ["a source of fine clay for glass", "a reopened mine of the old empire", "an alluvial gold deposit", "a vein of silver in the hills"],
  ["a great silver lode in the hills", "a new salt-works on the coast", "a deposit of alum", "deposits of iron and coal"],
  ["a deep silver lode", "saltpetre beds in the caves", "a deposit of high-grade iron", "rich cod grounds on the banks"],
];

const SCHOLAR_TOPICS = ["the nature of kingship", "the causes of the plague", "the precise length of the year", "the foundations of law", "the movements of the planets", "the proper tax on salt", "the origin of rivers", "the number of the stars", "the duties of a magistrate", "the question of the soul"];
const EPIC_FORMS = ["The Lay of {X}", "The Song of {P}", "The {A} Cycle", "The Deeds of {X}", "The Lament for {P}", "The Book of {X}", "The Sorrows of {P}", "The Siege of {P}, in Verse"];
const EVICTION_REASONS = ["the harbour silted up", "the river changed its course", "salt rose in the fields", "the last spring failed", "the garrison was withdrawn and the merchants followed", "a fever carried off most of the households and the rest left"];
const CONVERSION_REASONS = [
  "after an illness that the old priests could not cure", "in the course of a marriage negotiation", "following a dream attributed to the ruler's mother",
  "after a plague that was observed to spare the new shrines", "in the hope of better terms with a powerful neighbour", "on the advice of a minister who was himself a recent convert",
  "after the failure of three harvests under the old rites",
];
const PLOTTERS = ["the household guard", "a cousin with prior claims", "the chief steward", "a physician with debts", "the Master of the Horse", "the ruler's own brother", "a disappointed general", "a concubine and her brother", "the keeper of the seals"];
const SECT_FORMS = ["The Strict Observance of {C}", "The Reformed Rite of {C}", "The Hidden Sodality of {C}", "The Penitents of {C}", "The Brethren of the Older {C}", "The Little Rite of {C}"];
const FEUD_CAUSES = ["a stolen bride", "a disputed well", "a dead goat that was not a goat", "an insult at a wedding", "a debt of eleven sheep", "a matter of precedence at a funeral", "a killing that neither family had intended"];
const FACTIONS = ["the army", "the household guard", "the great landowners", "the priesthood", "the merchants of the capital", "the eastern provinces", "the old nobility", "the palace eunuchs"];

/* ====================================================================== *
 *  WORLD-STATE HELPERS  (all mutation happens inside event run() calls)
 * ====================================================================== */

function H(w) {
  if (!w._hist) {
    w._hist = { wars: {}, tribute: {}, dynasty: {}, faiths: [], faithOf: {}, heirs: {}, regents: {}, pretenders: {}, greeted: {}, emperor: {},
      plagues: [], bonus: {}, fatigue: {}, excavated: {}, forged: {}, marriages: [], routes: [], defeats: {}, capLost: {}, lostTech: 0, holy: 0, press: {}, recovered: {} };
  }
  return w._hist;
}
function due(ctx, key, p, years) { const h = H(ctx.world); h.last = h.last || {}; const t = h.last[key + p.id]; return t == null || ctx.year - t >= years; }
function mark(ctx, key, p) { const h = H(ctx.world); h.last = h.last || {}; h.last[key + p.id] = ctx.year; }
/* too many realms for new ones to split off: the world's cap for this year (core.js realmCap),
   plus some slack for the few events that allow it */
function crowded(ctx, extra) { return ctx.living().length >= ctx.realmCap() + (extra || 0); }
function P(ctx) { return ctx.polity || (ctx.figure && ctx.world.polities[ctx.figure.polityId]) || null; }
function eIdx(ctx) { return ERA_IDX[ctx.era] || 0; }
function gOf(f) { return genderOfNum(parseInt(String(f.id).slice(1), 10)); }
function he(f) { return gOf(f) === "f" ? "she" : "he"; }
function He(f) { return gOf(f) === "f" ? "She" : "He"; }
function his(f) { return gOf(f) === "f" ? "her" : "his"; }
function who(f) { return f ? (f.title && f.title !== "ruler" ? f.title + " " : "") + f.name : "the ruler"; }
function rulerOf(ctx, p) { p = p || ctx.polity; return p && p.ruler ? ctx.world.figures[p.ruler] || null : null; }
function A() {
  const out = [], ctx = arguments[0];
  for (let i = 1; i < arguments.length; i++) { const a = ctx.actor(arguments[i]); if (a) out.push(a); }
  return out;
}
function res(importance, tags, actors, regionId, text) {
  return { importance: importance, tags: tags, actors: actors, regionId: regionId == null ? null : regionId, text: cap(text) };
}
function lcThe(s) { return s.replace(/^The /, "the "); }
function locName(r) { return r ? lcThe((r.settlement && r.settlement.name) || r.name || "an unnamed district") : "an unnamed district"; }
function provName(r) { return r ? lcThe(r.name || (r.settlement && r.settlement.name) || "an unnamed province") : "an unnamed province"; }
function seat(ctx, p) { return locName(ctx.world.regions[p.capital]); }
function coastal(ctx, r) { return r.neighbors.some(function (n) { return ctx.world.regions[n].barren; }); }
function relate(a, b, v) { a.relations[b.id] = v; b.relations[a.id] = v; }
function adjustT(p, k, d) { p.traits[k] = clamp(p.traits[k] + d, 0.03, 0.97); }
function loseFolk(p, frac) { const n = Math.round(p.population * frac); p.population = Math.max(60, p.population - n); return n; }
/* what a realm brings to a battle besides its men: drill, new weapons and zeal won in events */
function edge(w, p) { return 1 + (H(w).bonus[p.id] || 0); }
/* armed strength, for weighing realms against each other: its men (core.js AEON.armyOf, which
   war-weariness and past losses already thin, as much as reaches one front), their quality and its edge */
function strength(w, p) { return Math.max(1, AEON.fieldArmy(w, p)) * (0.5 + p.tech) * edge(w, p); }
function tire(w, p, d) { const h = H(w); h.fatigue[p.id] = clamp((h.fatigue[p.id] || 0) + d, 0, 0.35); }
function warKey(a, b) { return a.id < b.id ? a.id + "-" + b.id : b.id + "-" + a.id; }
function wars(ctx, p) {
  const h = H(ctx.world), out = [];
  for (const k in h.wars) {
    const wr = h.wars[k];
    if (wr.over || (wr.a !== p.id && wr.b !== p.id)) continue;
    const foe = ctx.world.polities[wr.a === p.id ? wr.b : wr.a];
    if (foe && !foe.ended) out.push({ war: wr, foe: foe });
  }
  return out;
}
function warBetween(ctx, a, b) { const wr = H(ctx.world).wars[warKey(a, b)]; return wr && !wr.over ? wr : null; }
function startWar(ctx, a, b, cause, extra) {
  const wr = { a: a.id, b: b.id, start: ctx.year, over: false, winsA: 0, winsB: 0, cause: cause, holy: false, name: warName(ctx, a, b) };
  if (extra) for (const k in extra) wr[k] = extra[k];
  H(ctx.world).wars[warKey(a, b)] = wr;
  AEON.treaty(ctx.world, "war", a, b, { name: wr.name, cause: cause, joined: !!(extra && extra.joined), leader: extra && extra.leader, coalition: extra && extra.coalition });
  AEON.remember(ctx.world, b, a, 0, "declared war on it, citing " + cause);
  AEON.endTreaty(ctx.world, AEON.treatyBetween(ctx.world, a, b, "trade"), "war");
  relate(a, b, -1);
  ctx.world.stats.wars++;
  return wr;
}
function endWar(ctx, wr) {
  wr.over = true; wr.end = ctx.year;
  const w = ctx.world, a = w.polities[wr.a], b = w.polities[wr.b];
  if (a && b) { AEON.endTreaty(w, AEON.treatyBetween(w, a, b, "war"), "peace"); AEON.makeTruce(w, a, b); }
  if (a && b) relate(a, b, -0.2);
  if (a) tire(w, a, -0.5);
  if (b) tire(w, b, -0.5);
}
/* how long a war lasted, in words (core.js AEON.warLength) */
function lasted(y) { return y == null ? "some years" : y < 1 ? "a single campaigning season" : y < 1.75 ? "a year" : Math.round(y) + " years"; }
function winsOf(wr, p) { return wr.a === p.id ? wr.winsA : wr.winsB; }
function addWin(wr, p) { if (wr.a === p.id) wr.winsA++; else wr.winsB++; }
function frontier(ctx, p, q) {
  const w = ctx.world;
  return ctx.regionsOf(q).filter(function (r) { return r.neighbors.some(function (n) { return w.regions[n].owner === p.id; }); });
}
/* What conquest does to a place: a settlement may be razed (a village burned out) or shrink,
   and a conqueror whose own seat is smaller may move its capital to the fallen one. */
function conquestToll(ctx, region, to, wasCapital) {
  const s = region.settlement;
  if (s && ctx.chance(wasCapital ? 0.12 : 0.2)) {
    if (s.tier <= 1) makeRuin(region);
    else s.tier--;
  }
  if (wasCapital && region.settlement && to && !to.ended) {
    const own = ctx.world.regions[to.capital], ownTier = own && own.settlement ? own.settlement.tier : 0;
    if (region.settlement.tier > ownTier && ctx.chance(0.5)) to.capital = region.id;
  }
}
function annex(ctx, region, to, fate) {
  const from = region.owner && ctx.world.polities[region.owner];
  if (from && from !== to) AEON.remember(ctx.world, from, to, -0.15, "took " + provName(region));
  const wasCapital = !!from && from.capital === region.id;
  if (from && from.regions.length === 1 && !from.ended) {
    ctx.endPolity(from, fate || "Its last province was taken and its name passed into the registers of the conqueror.");
  }
  ctx.transfer(region, to);
  conquestToll(ctx, region, to, wasCapital);
}
function makeRuin(region) {
  if (region.settlement) region.ruinName = region.settlement.name;
  if (region.features.indexOf("ruins") < 0) region.features.push("ruins");
  region.settlement = null;
}
function treatyName(ctx, region) { return fill(ctx.choice(TREATIES), { P: provName(region) }); }
function pickEra(tbl, ctx) { return tbl[Math.min(eIdx(ctx), tbl.length - 1)]; }
/* small, weak neighbours a realm could absorb */
function minorNeighbours(ctx, p) {
  const w = ctx.world, sp = strength(w, p), lim = Math.max(4, Math.round(p.regions.length / 3));
  return ctx.neighbors(p).filter(function (q) { return !q.ended && !AEON.lordOf(w, q) && q.regions.length <= lim && q.regions.length < p.regions.length && strength(w, q) < sp * 0.8; });
}
/* a coast across the sea from one of a realm's ports, held by a weaker realm it does not border */
function invasionTarget(ctx, p) {
  const w = ctx.world, all = ctx.regionsOf(p).filter(function (r) { return coastal(ctx, r); });
  if (!all.length) return null;
  const ports = all.filter(function (r, i) { return i % Math.ceil(all.length / 6) === 0; }), sp = strength(w, p);
  let best = null, bd = Infinity;
  for (const id in w.polities) {
    const q = w.polities[id];
    if (q === p || q.ended || strength(w, q) > sp * 0.8 || frontier(ctx, p, q).length) continue;
    for (const r of ctx.regionsOf(q)) {
      if (!coastal(ctx, r)) continue;
      for (const port of ports) { const d = dist(r, port); if (d < 30 && d < bd) { bd = d; best = { foe: q, region: r, port: port }; } }
    }
  }
  return best;
}
/* where a realm might move its seat: a city of its own bigger than the capital, or, in a realm at
   odds with itself, another city */
function newSeat(ctx, p) {
  const cur = ctx.world.regions[p.capital], t = cur && cur.settlement ? cur.settlement.tier : 0;
  const cs = ctx.regionsOf(p).filter(function (r) { return r.id !== p.capital && r.settlement && r.settlement.tier >= 3 && (r.settlement.tier > t || p.traits.stability < 0.35); });
  return cs.length ? cs.sort(function (a, b) { return b.settlement.tier - a.settlement.tier || a.id - b.id; })[0] : null;
}
function openLand(ctx, p) {
  const w = ctx.world, out = [];
  for (const r of ctx.regionsOf(p)) {
    for (const nid of r.neighbors) {
      const n = w.regions[nid];
      if (n && !n.barren && !n.owner && n.habitability > 0.18 && out.indexOf(n) < 0) out.push(n);
    }
  }
  return out;
}
const DYN_SUF = ["id", "ing", "ids", "ian", "ings"];
function newDynasty(ctx, p) {
  const c = CULTURES[p.culture] || CULTURES.mediterranean;
  const d = { name: stem(ctx.rng, c, 1, 2) + ctx.choice(DYN_SUF), founded: ctx.year, count: 1 };
  H(ctx.world).dynasty[p.id] = d;
  return d;
}
function dynOf(ctx, p) { return H(ctx.world).dynasty[p.id] || newDynasty(ctx, p); }
function ungreeted(ctx, p) { return !!(p && p.ruler && p.rulers.length > 1 && !H(ctx.world).greeted[p.ruler]); }
function predecessor(ctx, p) {
  const i = p.rulers.indexOf(p.ruler);
  return i > 0 ? ctx.world.figures[p.rulers[i - 1]] : null;
}
function greet(ctx, f) { H(ctx.world).greeted[f.id] = true; }
function adoptHeir(ctx, p, allowMinor) {
  const h = H(ctx.world), hid = h.heirs[p.id];
  const heir = hid && ctx.world.figures[hid];
  if (!heir || heir.died != null || heir.polityId !== p.id) return rulerOf(ctx, p);
  if (!allowMinor && ctx.year - heir.born < 14) return rulerOf(ctx, p);
  const blank = rulerOf(ctx, p);
  if (blank && blank.deeds.length === 0 && blank.id !== heir.id) delete ctx.world.figures[blank.id];
  p.ruler = heir.id;
  p.rulers[p.rulers.length - 1] = heir.id;
  heir.role = "ruler";
  heir.title = titleFor(ctx.world, p, gOf(heir));
  delete h.heirs[p.id];
  return heir;
}
function kinOf(ctx, f) {
  return ctx.choice(gOf(f) === "f" ? ["eldest daughter", "sister", "niece", "cousin", "granddaughter", "widow"] : ["eldest son", "younger son", "brother", "nephew", "cousin", "grandson"]);
}
function secessionGroup(ctx, p, frac) {
  const w = ctx.world, cap0 = w.regions[p.capital];
  const rs = ctx.regionsOf(p).filter(function (r) { return r.id !== p.capital; });
  if (!rs.length) return null;
  rs.sort(function (a, b) { return dist(b, cap0) - dist(a, cap0); });
  const seed = rs[0];
  rs.sort(function (a, b) { return dist(a, seed) - dist(b, seed); });
  const k = Math.max(1, Math.min(rs.length, Math.round(p.regions.length * frac)));
  return rs.slice(0, k);
}
function splitRealm(ctx, parent, regs, archId, share) {
  if (!regs || !regs.length || parent.regions.length <= regs.length) return null;
  regs = regs.slice().sort(function (a, b) { return ((b.settlement && b.settlement.tier) || 0) - ((a.settlement && a.settlement.tier) || 0); });
  const first = regs[0];
  ctx.transfer(first, null);
  let aid = archId || "successor";
  if (aid === "successor" && ctx.chance(0.55)) aid = archForBiome(ctx, first);
  const np = ctx.spawnPolity(first, aid);
  const nm = ctx.name("polity", { region: first, archetype: { id: aid }, culture: parent.culture });
  np.name = nm.name; np.adjective = nm.adjective; np.culture = nm.culture;
  for (let i = 1; i < regs.length; i++) ctx.transfer(regs[i], np);
  const moved = Math.round(parent.population * (share || 0.3));
  parent.population = Math.max(60, parent.population - moved);
  np.population = Math.max(600, moved);
  np.tech = parent.tech * 0.92;
  relate(np, parent, -0.6);
  return np;
}
function activeFaith(ctx, p) {
  const h = H(ctx.world), id = h.faithOf[p.id];
  if (id == null) return null;
  return h.faiths.filter(function (f) { return f.id === id; })[0] || null;
}
function activePlague(ctx) {
  const ps = H(ctx.world).plagues;
  return ps.length && !ps[ps.length - 1].over ? ps[ps.length - 1] : null;
}
function lastPolityActor(ev, w) {
  for (let i = ev.actors.length - 1; i >= 0; i--) if (ev.actors[i].kind === "polity") return w.polities[ev.actors[i].id] || null;
  return null;
}
function hasTag(ev, t) { return !!(ev.tags && ev.tags.indexOf(t) >= 0); }
function lostTechOf(ev) {
  for (let i = 0; i < ev.tags.length; i++) if (ev.tags[i].indexOf("lost:") === 0) return ev.tags[i].slice(5);
  return null;
}
function ruinsIn(ctx, p) { return ctx.regionsOf(p).filter(function (r) { return r.features.indexOf("ruins") >= 0 && !H(ctx.world).excavated[r.id]; }); }
function warName(ctx, a, b) {
  return ctx.choice([
    "the " + a.adjective + "-" + b.adjective + " War", "the War of the " + ctx.choice(["Border Fords", "Salt Road", "Two Crowns", "Broken Oath", "Burnt Harvests", "Contested Marches"]),
    "the " + ctx.choice(["Long", "Bitter", "Winter", "Grain", "Hostage"]) + " War between " + a.name + " and " + b.name,
  ]);
}
/* a battle between attacker a and defender b at region r (core.js AEON.battle): a realm fighting
   several wars has only part of its army in each */
function fight(ctx, a, b, r, frontierLen, extra) {
  const w = ctx.world, o = { region: r ? r.id : null, bonusA: edge(w, a), bonusD: edge(w, b), frontier: frontierLen || 1,
    shareA: 1 / Math.max(1, wars(ctx, a).length), shareD: 1 / Math.max(1, wars(ctx, b).length) };
  if (extra) for (const k in extra) o[k] = extra[k];
  return AEON.battle(w, a, b, o);
}
function bodies(o) { return approx(o.lost.L) + " of " + o.L.name + " and " + approx(o.lost.W) + " of " + o.W.name; }
function battleLine(ctx, W, L, r) { return fill(ctx.pick(BATTLE_LINES[Math.min(eIdx(ctx), 5)]), { W: W.name, L: L.name, P: provName(r) }); }
/* the attacker beaten: it withdraws, and a crushing defeat lets the defender follow it home */
function repelled(ctx, wr, At, D, site, o, lead, extraTags) {
  const w = ctx.world, h = H(w);
  if (wr) addWin(wr, D);
  tire(w, At, 0.06); loseFolk(At, ctx.range(0.005, 0.015)); D.prestige = clamp(D.prestige + 0.03, 0, 1);
  if (h.defeats[At.id] == null) h.defeats[At.id] = ctx.year;
  let back = null;
  if (o.pushBack && At.regions.length > 1) { const b = frontier(ctx, D, At); if (b.length) { back = ctx.pick(b); annex(ctx, back, D); } }
  const tags = ["war", "battle", "defeat", "repelled"].concat(extraTags || [], back ? ["territory"] : []);
  return res(back ? 4 : 3, tags, A(ctx, D, At), (back || site || ctx.world.regions[D.capital]).id,
    lead + " " + battleLine(ctx, D, At, site) + " " + bodies(o) + " were left on the field." +
    (back ? " " + D.name + " followed the beaten army home and took " + provName(back) + "." : " " + At.name + " withdrew, and the frontier stayed where it was."));
}
/* a victor that came for loot or vengeance, not land (core.js AEON.warAim): plunder carries off
   wealth and people and leaves the land with its owner; razing destroys the settlements, drives
   the people off and leaves the land to no one */
const LOOT = ["grain", "cattle", "temple plate", "bullion", "horses", "the treasury", "bronze and timber"];
function pillage(ctx, wr, W, L, regs, aim, lead) {
  const w = ctx.world, h = H(w), raze = aim === "raze";
  const names = regs.map(locName), list = names.length > 2 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names.join(" and ");
  let ruins = 0;
  for (const r of regs) {
    if (r.owner !== L.id) continue;
    const had = !!r.settlement;
    if (raze) AEON.raze(w, r, W); else AEON.plunder(w, r, W);
    if (had && !r.settlement) ruins++;
  }
  const n = loseFolk(L, raze ? ctx.range(0.02, 0.05) : ctx.range(0.01, 0.03));
  if (L.ended) L.fate = "Razed from the earth by " + W.name + " in " + yl(ctx.year) + "; its people were scattered and its land left empty.";
  else { tire(w, L, 0.08); adjustT(L, "stability", -0.04); }
  if (wr) { addWin(wr, W); addWin(wr, W); }
  W.prestige = clamp(W.prestige + 0.03, 0, 1);
  if (h.defeats[L.id] == null) h.defeats[L.id] = ctx.year;
  const tags = ["war", "defeat", "sacked", raze ? "razed" : "plunder"].concat(ruins ? ["ruin-made"] : [], raze ? ["territory"] : [], L.ended ? ["fall"] : []);
  return res(raze || L.ended ? 4 : 3, tags, A(ctx, W, L), regs[0].id, lead + " " +
    (raze ? W.name + " had not come for the land. Its army burned " + list + " to the ground and drove off the people, and the land was left empty, claimed by no one."
          : W.name + " did not stay to hold what it had won: its army plundered " + list + ", carried off " + ctx.choice(LOOT) + " and about " + approx(n) + " captives, and went home.") +
    (L.ended ? " " + L.name + " did not survive it." : ""));
}

/* ====================================================================== *
 *  EVENTS
 * ====================================================================== */

function archForBiome(ctx, r) {
  const e = eIdx(ctx), b = r.biome;
  let pool;
  if (b === "grassland" || b === "savanna") pool = ["steppe", "hillclans", "citystate", "riverkingdom"];
  else if (b === "mountain") pool = ["hillclans", "hillclans", "theocracy"];
  else if (b === "desert" || b === "swamp") pool = ["riverkingdom", "theocracy", "riverkingdom"];
  else pool = ["citystate", "hillclans", "theocracy", "riverkingdom"];
  if (coastal(ctx, r)) pool = pool.concat(["maritime", "maritime", "citystate"]);
  if (e >= 3) pool = pool.concat(["successor", "successor"]);
  return ctx.pick(pool);
}

const EVENTS = [

/* ---------------------------------------------------------- founding ---- */

{ id: "tribal-founding", scope: "world", weight: 3,
  test: function (ctx) { return !crowded(ctx) && ctx.world.regions.some(function (r) { return !r.barren && !r.owner && r.habitability > 0.35; }); },
  run: function (ctx) {
    const w = ctx.world;
    const free = w.regions.filter(function (r) { return !r.barren && !r.owner && r.habitability > 0.35; });
    const remote = free.filter(function (r) { return !r.neighbors.some(function (n) { return w.regions[n].owner; }); });
    const r = ctx.pick(remote.length ? remote : free);
    const arch = archForBiome(ctx, r);
    const np = ctx.spawnPolity(r, arch);
    return res(3, ["founding"], A(ctx, np, r), r.id,
      "The state of " + np.name + " enters the record " + fill(ARCH_ORIGIN[arch], { S: locName(r) }) + ".");
  } },

{ id: "colonise-empty", scope: "polity", weight: 7, cooldown: 15,
  test: function (ctx) { return openLand(ctx, ctx.polity).length > 0; },
  run: function (ctx) {
    const p = ctx.polity, open = openLand(ctx, p);
    const r = ctx.rng.weighted(open, function (x) { return x.habitability + 0.05; });
    ctx.transfer(r, p);
    const town = ctx.chance(0.4 * Math.min(1, ctx.siteSuitability(r) * 1.6)) ? ctx.foundSettlement(r, 1) : null;
    const t = ctx.pick([
      "Families from " + seat(ctx, p) + " moved into " + provName(r) + ", which had been empty of anything but game.",
      "Surveyors and a few hundred settlers claimed " + provName(r) + " for " + p.name + "; no one disputed it, there being no one to dispute.",
      p.adjective + " herdsmen wintered in " + provName(r) + " for the third year running and did not leave in spring.",
      "The ground at " + provName(r) + " was cleared and divided among veterans and the landless, who were glad of it.",
    ]);
    return res(1, ["colonisation", "settlement"], A(ctx, p, r), r.id, t + (town ? " A settlement, " + town.name + ", followed." : ""));
  } },

{ id: "overseas-colony", scope: "polity", weight: 5, minEra: "iron", cooldown: 60,
  test: function (ctx) { const p = ctx.polity; return p.tech > 0.22 && ctx.regionsOf(p).some(function (r) { return coastal(ctx, r); }); },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world;
    const ports = ctx.regionsOf(p).filter(function (r) { return coastal(ctx, r); });
    const from = ctx.pick(ports);
    const cand = w.regions.filter(function (r) { return !r.barren && !r.owner && r.habitability > 0.25 && dist(r, from) < 18 && coastal(ctx, r); });
    if (!cand.length) return null;
    const r = ctx.pick(cand);
    ctx.transfer(r, p);
    const town = ctx.foundSettlement(r, 2);
    return res(2, ["colonisation", "settlement"], A(ctx, p, r), r.id,
      "Ships from " + locName(from) + " carried settlers to " + provName(r) + ", where " + p.name + " founded " + (town ? town.name : "a colony") + ". The first winter killed a third of them, and the survivors sent home for more.");
  } },

{ id: "settlement-founded", scope: "polity", weight: 3, cooldown: 20,
  test: function (ctx) { return !!ctx.pickSite(ctx.regionsOf(ctx.polity).filter(function (r) { return !r.settlement && r.habitability > 0.2; })); },
  run: function (ctx) {
    const p = ctx.polity;
    const r = ctx.pickSite(ctx.regionsOf(p).filter(function (x) { return !x.settlement && x.habitability > 0.2; }));
    const s = ctx.foundSettlement(r, 1);
    const kind = pickEra([["a village of mud brick around a well"], ["a hill-fort and the village beneath it"], ["a garrison town on the main road"], ["a fortified market village"], ["a market town under a new charter"], ["a planned town with a grid of streets"]], ctx);
    return res(1, ["founding", "settlement"], A(ctx, p, r), r.id, s.name + " was founded in " + provName(r) + " by order of " + p.name + ": " + kind[0] + ".");
  } },

{ id: "settlement-grows", scope: "polity", weight: 3,
  test: function (ctx) { return ctx.regionsOf(ctx.polity).some(function (r) { return r.settlement && r.settlement.tier < ctx.maxTier(r); }); },
  run: function (ctx) {
    const p = ctx.polity;
    const c = ctx.regionsOf(p).filter(function (r) { return r.settlement && r.settlement.tier < ctx.maxTier(r) && ((r.settlement.tier < 3) || (r.settlement.tier === 3 && p.prestige > 0.35 && p.regions.length > 3)); });
    if (!c.length) return null;
    const r = ctx.pick(c), s = r.settlement;
    s.tier++;
    const names = ["", "a village", "a town", "a city", "a great city"];
    return res(s.tier >= 3 ? 2 : 1, ["growth", "settlement"], A(ctx, p, r), r.id,
      s.name + " outgrew its old walls and, by the registers of " + p.name + ", counted as " + names[s.tier] + ". New quarters were built beyond the gates, and the old gates were left standing in the middle of them.");
  } },

{ id: "golden-age", scope: "polity", weight: 2, cooldown: 120,
  test: function (ctx) { const p = ctx.polity; return p.traits.stability > 0.5 && p.wealth > 0.5 && p.prestige > 0.3 && p.tech > 0.2; },
  run: function (ctx) {
    const p = ctx.polity, r = rulerOf(ctx, p);
    p.prestige = clamp(p.prestige + 0.12, 0, 1); p.tech = clamp(p.tech + 0.02, 0, 1); adjustT(p, "curiosity", 0.05);
    return res(3, ["golden-age", "culture"], A(ctx, p, r), p.capital,
      "The decades of the rule of " + who(r) + " are afterwards remembered as the golden age of " + p.name + ": the harvests were adequate, the taxes were predictable, and the capital, " + seat(ctx, p) + ", acquired a reputation for conversation. " + ctx.choice(["It lasted exactly as long as the treasury.", "No one at the time thought to call it that.", "The poor, who were consulted by nobody, remembered it differently."]));
  } },

/* -------------------------------------------------------- succession ---- */

{ id: "order-restored", scope: "polity", weight: 15, cooldown: 15,
  test: function (ctx) { return ctx.polity.traits.stability < 0.4; },
  run: function (ctx) {
    const p = ctx.polity, rl = rulerOf(ctx, p);
    adjustT(p, "stability", 0.12); p.prestige = clamp(p.prestige + 0.02, 0, 1);
    const how = ctx.choice([
      "a reform of the tax rolls that reduced the burden on the poor and, more usefully, the opportunities of the collectors",
      "the dismissal of the tax-farmers, who were replaced by salaried officials, who were in turn replaced when they too became rich",
      "a general amnesty, followed by the quiet removal of those who did not accept it",
      "the appointment of a chancellor of unusual honesty, who lasted eleven years",
      "a council of the leading families, which met, agreed to a programme and then, remarkably, followed it",
      "the arrival of three good harvests in a row, which the court credited to its own policy"]);
    return res(2, ["order", "reform"], A(ctx, p, rl), p.capital,
      "Order was restored in " + p.name + " by " + how + ". " + who(rl) + " announced the end of the troubles; the troubles did not attend the announcement.");
  } },

{ id: "accession-orderly", scope: "polity", weight: 6,
  test: function (ctx) { return ungreeted(ctx, ctx.polity); },
  run: function (ctx) {
    const p = ctx.polity, prev = predecessor(ctx, p), f = adoptHeir(ctx, p);
    if (!f) return null;
    const d = dynOf(ctx, p); d.count++;
    greet(ctx, f); adjustT(p, "stability", 0.015);
    const age = prev && prev.died != null ? prev.died - prev.born : null;
    return res(1, ["succession", "dynasty"], A(ctx, p, f, prev), p.capital,
      (prev ? who(prev) : "The ruler") + " died" + (age ? " aged " + age : "") + ", and the throne of " + p.name + " passed to " + who(f) + ", the dead ruler's " + kinOf(ctx, f) + ", without incident." +
      (prev && prev.epitaph ? " The record's verdict on the late ruler: \"" + prev.epitaph + "\"" : ""));
  } },

{ id: "accession-regency", scope: "polity", weight: 5,
  test: function (ctx) { return ungreeted(ctx, ctx.polity); },
  run: function (ctx) {
    const p = ctx.polity, prev = predecessor(ctx, p), h = H(ctx.world);
    const hadHeir = !!h.heirs[p.id];
    const f = adoptHeir(ctx, p, true);
    if (!f) return null;
    if (!hadHeir) f.born = ctx.year - ctx.int(4, 11);
    const reg = ctx.newFigure(p, "regent");
    reg.born = ctx.year - ctx.int(30, 50);
    h.regents[p.id] = reg.id;
    greet(ctx, f); dynOf(ctx, p).count++; adjustT(p, "stability", -0.05);
    const rel = gOf(reg) === "f" ? ctx.choice(["mother", "aunt", "grandmother"]) : ctx.choice(["uncle", "chancellor", "senior general", "guardian"]);
    return res(2, ["succession", "regency"], A(ctx, p, f, reg, prev), p.capital,
      (prev ? who(prev) : "The ruler") + " left a child of " + (ctx.year - f.born) + " years, " + f.name + ", and " + reg.name + ", the child's " + rel + ", was named regent. Contemporaries observed that the regent's term would last exactly as long as the child's minority, and that the regent had observed it too.");
  } },

{ id: "regency-ends", scope: "polity", weight: 20,
  test: function (ctx) {
    const p = ctx.polity, id = H(ctx.world).regents[p.id], r = rulerOf(ctx, p);
    return !!(id && r && r.id !== id && ctx.year - r.born >= 16);
  },
  run: function (ctx) {
    const p = ctx.polity, h = H(ctx.world), reg = ctx.world.figures[h.regents[p.id]], r = rulerOf(ctx, p);
    delete h.regents[p.id];
    if (!reg || reg.died != null) return null;
    const roll = ctx.rng.range(0, 1);
    let how;
    if (roll < 0.6) how = "retired to " + his(reg) + " estates, where " + he(reg) + " wrote a justification of the regency that no one read";
    else if (roll < 0.85) how = "was sent into honourable exile, the honour being considerable and the exile complete";
    else { ctx.kill(reg, "Died of " + ctx.choice(CAUSES_OF_DEATH) + " a month after the end of the regency. The timing was remarked upon."); how = "died within the month of " + ctx.choice(CAUSES_OF_DEATH) + ", which the court received without surprise"; }
    adjustT(p, "stability", 0.04);
    return res(2, ["succession", "regency"], A(ctx, p, r, reg), p.capital,
      who(r) + " came of age at " + (ctx.year - r.born) + ", and the regency of " + p.name + " ended. " + who(reg) + " " + how + ".");
  } },

{ id: "regent-seizes-power", scope: "polity", weight: 4,
  test: function (ctx) {
    const p = ctx.polity, id = H(ctx.world).regents[p.id], r = rulerOf(ctx, p), reg = id && ctx.world.figures[id];
    return !!(reg && reg.died == null && r && r.id !== id && ctx.year - r.born < 17 && p.traits.cunning > 0.4);
  },
  run: function (ctx) {
    const p = ctx.polity, h = H(ctx.world), reg = ctx.world.figures[h.regents[p.id]], child = rulerOf(ctx, p);
    ctx.kill(child, "Died aged " + (ctx.year - child.born) + ", of a fever the regent had not been in a hurry to treat.");
    p.ruler = reg.id; p.rulers.push(reg.id);
    reg.role = "ruler"; reg.title = titleFor(ctx.world, p, gOf(reg));
    greet(ctx, reg); delete h.regents[p.id];
    const d = newDynasty(ctx, p); adjustT(p, "stability", -0.06);
    return res(4, ["usurpation", "dynasty", "succession"], A(ctx, p, reg, child), p.capital,
      "The child " + child.name + " died aged " + (ctx.year - child.born) + " of a fever, and the regent " + reg.name + " took the title of " + reg.title + " of " + p.name + " the same season, founding the House of " + d.name + ". The court physician, who had been treating the child, was not consulted about the fever and did not volunteer."
    );
  } },

{ id: "accession-disputed", scope: "polity", weight: 3,
  test: function (ctx) { return ungreeted(ctx, ctx.polity); },
  run: function (ctx) {
    const p = ctx.polity, prev = predecessor(ctx, p), f = rulerOf(ctx, p), h = H(ctx.world);
    const pre = ctx.newFigure(p, "pretender");
    h.pretenders[p.id] = pre.id;
    greet(ctx, f); dynOf(ctx, p).count++; adjustT(p, "stability", -0.07);
    return res(3, ["succession", "dispute"], A(ctx, p, f, pre, prev), p.capital,
      (prev ? who(prev) : "The ruler") + " died without naming an heir that both sides recognised. " + who(f) + " was acclaimed by " + ctx.choice(FACTIONS) + "; " + pre.name + ", who claimed the older right, was acclaimed by " + ctx.choice(FACTIONS) + ". The claim was never withdrawn, merely postponed.");
  } },

{ id: "accession-usurpation", scope: "polity", weight: 2.5,
  test: function (ctx) { const p = ctx.polity; return ungreeted(ctx, p) && (p.traits.stability < 0.55 || p.traits.cunning > 0.55); },
  run: function (ctx) {
    const p = ctx.polity, prev = predecessor(ctx, p), f = rulerOf(ctx, p);
    if (prev) prev.epitaph = "Found dead in a room bolted from the outside. The record notes a fever.";
    const d = newDynasty(ctx, p);
    greet(ctx, f); adjustT(p, "stability", -0.04);
    const was = ctx.choice(["a captain of the guard", "the Master of the Horse", "a provincial governor", "the late ruler's cupbearer", "the commander of the northern army", "a general with a loyal legion"]);
    return res(4, ["usurpation", "dynasty", "succession"], A(ctx, p, f, prev), p.capital,
      (prev ? who(prev) : "The ruler") + " was found dead in a locked room, of a cause the physicians attributed to the heart. " + who(f) + ", until then " + was + ", took the throne and the seals the same morning, and founded the House of " + d.name + ".");
  } },

{ id: "dynasty-extinct", scope: "polity", weight: 2,
  test: function (ctx) { const p = ctx.polity, d = H(ctx.world).dynasty[p.id]; return ungreeted(ctx, p) && !!d && d.count >= 4; },
  run: function (ctx) {
    const p = ctx.polity, old = H(ctx.world).dynasty[p.id], prev = predecessor(ctx, p), f = rulerOf(ctx, p);
    const nd = newDynasty(ctx, p);
    greet(ctx, f);
    return res(4, ["dynasty", "dynasty-end", "succession"], A(ctx, p, f, prev), p.capital,
      "With the death of " + (prev ? who(prev) : "the last of the line") + ", the House of " + old.name + " ended after " + old.count + " rulers and " + (ctx.year - old.founded) + " years. The throne of " + p.name + " went to " + who(f) + ", " + ctx.choice(["a general of the northern army", "a cousin through the female line", "the chief minister, acclaimed by the council", "the husband of the last ruler's sister"]) + ", who founded the House of " + nd.name + " and had the archives revised accordingly.");
  } },

{ id: "partition-between-heirs", scope: "polity", weight: 3, minEra: "classical",
  test: function (ctx) { return !crowded(ctx, 8) && ungreeted(ctx, ctx.polity) && ctx.polity.regions.length >= 4; },
  run: function (ctx) {
    const p = ctx.polity, prev = predecessor(ctx, p), f = rulerOf(ctx, p);
    const regs = secessionGroup(ctx, p, 0.4), np = splitRealm(ctx, p, regs, "successor", 0.4);
    if (!np) return null;
    greet(ctx, f); dynOf(ctx, p).count++;
    return res(4, ["secession", "partition", "dynasty"], A(ctx, p, np, f, prev), np.capital,
      (prev ? who(prev) : "The ruler") + " had several sons and no doctrine of primogeniture. " + who(f) + " kept " + seat(ctx, p) + " and the older provinces; the rest, centred on " + locName(ctx.world.regions[np.capital]) + ", became the separate realm of " + np.name + ". Both brothers swore it was temporary.");
  } },

{ id: "heir-born", scope: "figure", weight: 3, cooldown: 30,
  test: function (ctx) {
    const p = P(ctx), f = ctx.figure, age = ctx.year - f.born;
    return !!p && p.ruler === f.id && !H(ctx.world).heirs[p.id] && age >= 18 && age <= 55;
  },
  run: function (ctx) {
    const p = P(ctx), f = ctx.figure;
    const heir = ctx.newFigure(p, "heir");
    heir.born = ctx.year - ctx.int(0, 2);
    H(ctx.world).heirs[p.id] = heir.id;
    return res(1, ["birth", "dynasty"], A(ctx, p, f, heir), p.capital,
      "A " + (gOf(heir) === "f" ? "daughter" : "son") + " was born to " + who(f) + " of " + p.name + " and named " + heir.name + ". The celebrations lasted three days, and the first was entirely sincere.");
  } },

{ id: "ruler-assassinated", scope: "figure", weight: 1.2, cooldown: 80,
  test: function (ctx) { const p = P(ctx); return !!p && p.ruler === ctx.figure.id && (p.traits.stability < 0.4 || ctx.figure.traits.cruelty > 0.6); },
  run: function (ctx) {
    const p = P(ctx), f = ctx.figure, by = ctx.choice(PLOTTERS);
    ctx.kill(f, "Murdered by " + by + ", in the third hour of the night.");
    adjustT(p, "stability", -0.05);
    return res(3, ["assassination", "succession"], A(ctx, p, f), p.capital,
      who(f) + " of " + p.name + " was murdered in " + (ctx.choice(["the bath", "the bedchamber", "the stables", "the council room", "the garden"])) + " by " + by + ". The murderer was tried, which was thought to settle the matter, and executed, which was thought to settle the murderer.");
  } },

{ id: "ruler-dies-in-battle", scope: "figure", weight: 1.2,
  test: function (ctx) { const p = P(ctx); return !!p && p.ruler === ctx.figure.id && wars(ctx, p).length > 0; },
  run: function (ctx) {
    const p = P(ctx), f = ctx.figure, ws = wars(ctx, p), wf = ctx.pick(ws), foe = wf.foe;
    const place = ctx.name("place", { polity: foe });
    ctx.kill(f, "Fell at " + place + ", at the head of the army, with the standard still upright.");
    addWin(wf.war, foe); tire(ctx.world, p, 0.08); adjustT(p, "stability", -0.05);
    return res(4, ["battle", "war", "ruler-death"], A(ctx, p, foe, f), p.capital,
      who(f) + " of " + p.name + " was killed at " + place + " in the war with " + foe.name + ". The army, which had been winning, learned of it at dusk, and by morning was not winning.");
  } },

{ id: "ruler-abdicates", scope: "figure", weight: 0.8,
  test: function (ctx) { const p = P(ctx); return !!p && p.ruler === ctx.figure.id && ctx.year - ctx.figure.born > 50 && (eIdx(ctx) >= 3 || p.traits.piety > 0.6); },
  run: function (ctx) {
    const p = P(ctx), f = ctx.figure;
    ctx.kill(f, "Laid down the crown in old age and entered a cloister, where " + he(f) + " lived under another name and was reported to have been happier.");
    return res(2, ["abdication", "succession"], A(ctx, p, f), p.capital,
      who(f) + " abdicated the rule of " + p.name + " and withdrew to a cloister, taking nothing but a cell, a bed and the library. The chroniclers record that the court was relieved and the monastery was not.");
  } },

/* ------------------------------------------------------------ culture --- */

{ id: "ruler-builds-wonder", scope: "figure", weight: 1.5, cooldown: 160,
  test: function (ctx) { const p = P(ctx); return !!p && p.ruler === ctx.figure.id && p.wealth > 0.5 && p.tech > 0.15 && due(ctx, "wonder", p, 140) && !!ctx.wonderSite(p); },
  run: function (ctx) {
    const p = P(ctx), f = ctx.figure, r = ctx.wonderSite(p);
    mark(ctx, "wonder", p);
    const tpl = ctx.pick(WONDERS[Math.min(eIdx(ctx), 5)]);
    const art = ctx.newArtifact({ name: fill(tpl[0], { A: p.adjective, P: locName(r) }), kind: "wonder", region: r, creator: f, power: ctx.range(0.3, 0.8), legend: "A " + tpl[1] + " raised in the reign of " + who(f) + ", at a cost that the treasury recorded and the people remembered." });
    p.prestige = clamp(p.prestige + 0.06, 0, 1); adjustT(p, "stability", -0.01);
    return res(3, ["wonder", "artifact", "culture"], A(ctx, p, f, art), r.id,
      "In the reign of " + who(f) + ", " + lcThe(art.name) + " was completed at " + locName(r) + " after " + ctx.int(9, 40) + " years of work. It consumed, by the contemporary estimate, " + ctx.int(3, 12) + " years of the realm's revenue and " + approx(ctx.int(300, 4000)) + " lives, the latter figure not being the one carved on the dedication.");
  } },

{ id: "administrative-strain", scope: "polity", weight: 8, cooldown: 20,
  test: function (ctx) { return ctx.polity.traits.stability > 0.45 && ctx.polity.regions.length >= 3; },
  run: function (ctx) {
    const p = ctx.polity, big = p.regions.length;
    adjustT(p, "stability", -(0.05 + Math.min(big, 120) * 0.0006));
    const why = pickEra([
      ["the scribes could no longer keep the provincial accounts current", "the temple estates stopped paying their share"],
      ["the governors began to treat their provinces as inheritances", "the levy of free farmers had shrunk to a rumour"],
      ["the tax-farmers kept more than they remitted, and the treasury knew it", "the roads were not repaired and the messages arrived late"],
      ["the frontier garrisons were paid in promises", "the great estates stopped sending recruits"],
      ["the barons kept their castles and their grain and sent their regrets", "the royal justices were turned back at the manor gates"],
      ["the customs revenue fell short of the standing army's wages", "the provincial estates refused the new subsidy"]], ctx);
    return res(1, ["decline", "internal"], A(ctx, p), p.capital,
      "In " + p.name + " " + ctx.choice(why) + ". Officials in " + seat(ctx, p) + " noted that this was the " + ctx.choice(["third", "fourth", "sixth", "ninth", "latest"]) + " such report " + ctx.choice(["that year", "of the decade", "since the old ruler's death"]) + " and filed it with the others.");
  } },

{ id: "conquest", consolidate: true, scope: "polity", weight: 12,
  test: function (ctx) {
    const p = ctx.polity;
    return wars(ctx, p).some(function (x) { return strength(ctx.world, p) > strength(ctx.world, x.foe) * 1.3 && frontier(ctx, p, x.foe).length > 0; });
  },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, h = H(w);
    const wf = ctx.pick(wars(ctx, p).filter(function (x) { return strength(w, p) > strength(w, x.foe) * 1.3 && frontier(ctx, p, x.foe).length > 0; }));
    const L = wf.foe, W = p, fr = frontier(ctx, W, L), site = ctx.pick(fr);
    const o = fight(ctx, W, L, site, fr.length);
    if (!o.won) return repelled(ctx, wf.war, W, L, site, o, W.name + " marched to end " + (wf.war.name || "the war") + ".");
    /* the margin sets how far it goes: a crushing win takes a small realm whole, or a third of a
       large one's land; a clear one a little realm whole; a narrow one a province or two */
    const whole = L.regions.length <= (o.margin === "crushing" ? 12 : o.margin === "clear" ? 5 : 1);
    let regs;
    if (whole) regs = ctx.regionsOf(L);
    else regs = [site].concat(ctx.shuffle(fr.filter(function (x) { return x !== site; }))).slice(0, o.margin === "crushing" ? Math.max(2, Math.min(fr.length, Math.round(L.regions.length * 0.3))) : o.take);
    const n = regs.length, first = regs[0], capName = seat(ctx, L), rl = rulerOf(ctx, L);
    if (whole) {
      const oldCap = L.capital;
      ctx.endPolity(L, "Conquered by " + W.name + " in " + yl(ctx.year) + "; its ruler was killed or removed, and its provinces were entered in the registers of the victor.");
      for (const r of regs) { ctx.transfer(r, W); conquestToll(ctx, r, W, r.id === oldCap); }
    } else { for (const r of regs) annex(ctx, r, W); }
    endWar(ctx, wf.war); relate(W, L, 0);
    W.prestige = clamp(W.prestige + 0.08, 0, 1); adjustT(L, "stability", -0.1);
    if (h.defeats[L.id] == null) h.defeats[L.id] = ctx.year;
    const field = battleLine(ctx, W, L, site) + " " + bodies(o) + " were left on the field. ";
    return res(whole ? 5 : 4, whole ? ["conquest", "war", "defeat", "territory", "fall"] : ["conquest", "war", "defeat", "territory"], A(ctx, W, L, first), first.id,
      whole ? field + W.name + " completed the conquest of " + L.name + ", taking " + n + " " + (n === 1 ? "province" : "provinces") + " and the capital " + capName + ". " + (rl ? who(rl) + " " + ctx.choice(["was executed on the steps of the palace", "was carried off to the victor's capital and exhibited", "escaped across the frontier and was not heard of again", "was permitted to retire and died, by an administrative error, within the month"]) + ". " : "") + L.name + " thereafter appeared only in the genealogies of the victors and the complaints of its former tax-payers."
        : field + W.name + " drove " + (o.margin === "crushing" ? "deep " : "") + "into " + L.name + " and annexed " + n + " " + (n === 1 ? "province" : "provinces") + ", among them " + provName(first) + ". " + L.name + " survived, smaller and more cautious, with the conqueror's garrisons visible from its capital.");
  } },

{ id: "ruler-law-code", scope: "figure", weight: 1, cooldown: 120,
  test: function (ctx) { const p = P(ctx); return !!p && p.ruler === ctx.figure.id && p.tech > 0.1 && due(ctx, "law", p, 220); },
  run: function (ctx) {
    const p = P(ctx), f = ctx.figure, e = Math.min(eIdx(ctx), 5);
    mark(ctx, "law", p);
    const art = ctx.newArtifact({ name: "The " + p.adjective + " Code", kind: "law code", region: ctx.world.regions[p.capital], creator: f, power: ctx.range(0.3, 0.7), legend: "A code of laws promulgated by " + who(f) + ", " + LAW_MATERIAL[e] + "." });
    adjustT(p, "stability", 0.05); p.prestige = clamp(p.prestige + 0.03, 0, 1);
    return res(3, ["law", "artifact", "culture"], A(ctx, p, f, art), p.capital,
      who(f) + " promulgated " + lcThe(art.name) + ", " + ctx.int(60, 300) + " articles " + LAW_MATERIAL[e] + ". It fixed " + ctx.choice(LAW_CLAUSES) + " and, in an article that is quoted less often, " + ctx.choice(LAW_CLAUSES) + ".");
  } },

{ id: "epic-composed", scope: "polity", weight: 2, cooldown: 100,
  test: function (ctx) { return ctx.polity.tech > 0.15; },
  run: function (ctx) {
    const p = ctx.polity, poet = ctx.newFigure(p, "poet"), c = CULTURES[p.culture] || CULTURES.mediterranean;
    const r = ctx.world.regions[p.capital];
    const nm = fill(ctx.choice(EPIC_FORMS), { X: stem(ctx.rng, c, 1, 2), P: locName(r), A: p.adjective });
    const art = ctx.newArtifact({ name: nm, kind: "epic", region: r, creator: poet, power: ctx.range(0.2, 0.6), legend: "A poem of " + ctx.int(300, 4000) + " lines, recited at the festivals of " + p.name + "." });
    p.prestige = clamp(p.prestige + 0.03, 0, 1);
    return res(2, ["epic", "artifact", "culture"], A(ctx, p, poet, art), r.id,
      "The poet " + poet.name + " composed " + lcThe(nm) + ", which was recited at the winter festivals of " + p.name + " for " + ctx.int(2, 8) + " centuries afterwards, with additions. The earliest surviving text is already a revision.");
  } },

{ id: "scholar-flourishes", scope: "polity", weight: 4, cooldown: 40,
  test: function (ctx) { return ctx.polity.tech > 0.1 && ctx.polity.wealth > 0.35; },
  run: function (ctx) {
    const p = ctx.polity, s = ctx.newFigure(p, "scholar"), work = ctx.pick(pickEra(SCHOLAR_WORKS, ctx));
    p.tech = clamp(p.tech + 0.02, 0, 1);
    const acts = A(ctx, p, s);
    let extra = "";
    if (ctx.chance(0.5)) {
      const art = ctx.newArtifact({ name: "The " + s.name.split(" ")[0] + " Treatise", kind: "text", region: ctx.world.regions[p.capital], creator: s, power: ctx.range(0.2, 0.6), legend: "A work by " + s.name + ": " + work + "." });
      acts.push(ctx.actor(art)); extra = " A single copy was deposited in the capital; it was the only one made.";
    }
    return res(2, ["scholar", "culture"], acts, p.capital,
      s.title + " " + s.name + " of " + p.name + " completed " + work + ", having spent " + ctx.int(12, 40) + " years on it and the patronage of three rulers. Its conclusions on " + ctx.choice(SCHOLAR_TOPICS) + " were widely cited and rarely read." + extra);
  } },

{ id: "great-library", scope: "polity", weight: 1.5, minEra: "iron", cooldown: 400,
  test: function (ctx) {
    const p = ctx.polity;
    if (!(p.tech > 0.28 && p.wealth > 0.4 && p.prestige > 0.2) || !ctx.wonderSite(p)) return false;
    return !Object.keys(ctx.world.artifacts).some(function (k) { const a = ctx.world.artifacts[k]; return a.kind === "library" && !a.destroyed && ctx.world.regions[a.location] && ctx.world.regions[a.location].owner === p.id; });
  },
  run: function (ctx) {
    const p = ctx.polity, r = ctx.wonderSite(p);
    const art = ctx.newArtifact({ name: "The Great Library of " + locName(r), kind: "library", region: r, power: ctx.range(0.5, 0.9), legend: "A collection of " + approx(ctx.int(8000, 90000)) + " scrolls, assembled by decree and by theft." });
    p.tech = clamp(p.tech + 0.04, 0, 1); adjustT(p, "curiosity", 0.05); p.prestige = clamp(p.prestige + 0.08, 0, 1);
    return res(4, ["library", "artifact", "culture"], A(ctx, p, art), r.id,
      "The ruler of " + p.name + " ordered every ship entering the harbour of " + locName(r) + " searched for books. The books were copied, the copies returned, and the originals kept, and from this practice came " + art.name + ", which at its height held some " + approx(ctx.int(8000, 90000)) + " scrolls and employed more scribes than the army employed officers.");
  } },

{ id: "library-destroyed", scope: "world", weight: 1.5,
  test: function (ctx) { return Object.keys(ctx.world.artifacts).some(function (k) { const a = ctx.world.artifacts[k]; return a.kind === "library" && !a.destroyed; }); },
  run: function (ctx) {
    const w = ctx.world;
    const libs = Object.keys(w.artifacts).map(function (k) { return w.artifacts[k]; }).filter(function (a) { return a.kind === "library" && !a.destroyed; });
    const lib = ctx.pick(libs), r = w.regions[lib.location], owner = r && r.owner && w.polities[r.owner];
    const cause = ctx.choice(["a fire that began in a neighbouring bakery", "an army that had been told there was nothing of value inside", "a mob incited by a preacher who had read one book and disliked it", "the slow indifference of three successive treasurers, and then a fire", "an earthquake, followed by looters, followed by rain"]);
    lib.destroyed = ctx.year;
    const tech = ctx.choice(pickEra(TECH_LOST, ctx));
    if (owner) { owner.tech = clamp(owner.tech - 0.05, 0, 1); adjustT(owner, "curiosity", -0.05); }
    H(w).lostTech++;
    return res(4, ["destruction", "library", "lost-technique", "lost:" + tech], A(ctx, lib, owner), r ? r.id : null,
      lib.name + " was destroyed by " + cause + ". The loss was not noticed at once, being a loss of things nobody was reading; it was noticed within a generation, when " + tech + " could no longer be done by anyone alive.");
  } },

{ id: "wonder-destroyed", scope: "world", weight: 2,
  test: function (ctx) { return Object.keys(ctx.world.artifacts).some(function (k) { const a = ctx.world.artifacts[k]; return a.kind === "wonder" && !a.destroyed; }); },
  run: function (ctx) {
    const w = ctx.world;
    const ws = Object.keys(w.artifacts).map(function (k) { return w.artifacts[k]; }).filter(function (a) { return a.kind === "wonder" && !a.destroyed; });
    const a = ctx.pick(ws), r = w.regions[a.location], owner = r && r.owner && w.polities[r.owner];
    const cause = ctx.choice(["an earthquake", "a fire the wind carried", "the stone-robbers, who took it down over two generations", "a besieging army's engines", "an iconoclast mob", "a flood that undermined the foundations", "a lightning strike and a careless priest"]);
    a.destroyed = ctx.year;
    if (r && r.features.indexOf("ruins") < 0) r.features.push("ruins");
    if (owner) owner.prestige = clamp(owner.prestige - 0.06, 0, 1);
    return res(3, ["destruction", "wonder", "ruin-made"], A(ctx, a, owner), r ? r.id : null,
      a.name + " was destroyed by " + cause + ", " + (ctx.year - a.created) + " years after it was raised. The ruins were used as a quarry by people who had been proud of it.");
  } },

{ id: "astronomer-eclipse", scope: "polity", weight: 2,
  test: function (ctx) { return ctx.polity.tech > 0.1; },
  run: function (ctx) {
    const p = ctx.polity, s = ctx.newFigure(p, "scholar");
    p.tech = clamp(p.tech + 0.01, 0, 1); p.prestige = clamp(p.prestige + 0.03, 0, 1);
    const ws = wars(ctx, p);
    let tail = " The court was impressed, and the astronomer was thereafter not permitted to leave the city.";
    if (ws.length) {
      const wf = ws[0]; endWar(ctx, wf.war);
      tail = " It fell during a battle against " + wf.foe.name + ", and both armies, regarding it as a judgement, stopped fighting and went home.";
    }
    return res(2, ["astronomy", "scholar", "culture"], A(ctx, p, s), p.capital,
      s.title + " " + s.name + " of " + p.name + " predicted a solar eclipse to within a day, a feat that was repeated twice and then declared a coincidence." + tail);
  } },

{ id: "invention", scope: "polity", weight: 4, cooldown: 25,
  test: function (ctx) { return ctx.polity.tech > 0.05; },
  run: function (ctx) {
    const p = ctx.polity, inv = ctx.pick(pickEra(INVENTIONS, ctx));
    p.tech = clamp(p.tech + 0.03, 0, 1); p.population = Math.round(p.population * 1.025); adjustT(p, "stability", 0.012);
    const r = ctx.pick(ctx.regionsOf(p));
    r.resources.food = clamp(r.resources.food + 0.06, 0, 1);
    return res(2, ["invention", "technology"], A(ctx, p, r), r.id,
      cap(inv[0]) + " spread through " + provName(r) + " and the rest of " + p.name + " in the course of a single generation. Those who adopted it " + ctx.choice(["prospered", "outgrew their neighbours", "found that their children survived at a better rate", "paid less in tribute than they had expected"]) + "; those who did not, did not.");
  } },

{ id: "military-reform", scope: "polity", weight: 1.5, cooldown: 60,
  test: function (ctx) { return ctx.polity.military > 0.2; },
  run: function (ctx) {
    const p = ctx.polity, rf = ctx.pick(pickEra(REFORMS, ctx)), h = H(ctx.world);
    h.bonus[p.id] = Math.min(0.3, (h.bonus[p.id] || 0) + rf[1]);
    adjustT(p, "aggression", 0.03);
    return res(2, ["military", "reform"], A(ctx, p), p.capital,
      p.name + " adopted " + rf[0] + " as the core of its armies, paying for it with a new levy that was resented in proportion to its efficiency. The first campaign to use it was, by general agreement, short.");
  } },

{ id: "printing-press", scope: "polity", weight: 4, minEra: "powder", cooldown: 9999,
  test: function (ctx) { return ctx.polity.tech > 0.4 && !H(ctx.world).press[ctx.polity.id]; },
  run: function (ctx) {
    const p = ctx.polity, h = H(ctx.world);
    h.press[p.id] = true;
    const first = ctx.pastByType("printing-press", 1).length === 0;
    p.tech = clamp(p.tech + 0.05, 0, 1); adjustT(p, "curiosity", 0.06);
    return res(first ? 5 : 3, ["invention", "culture", "technology"], A(ctx, p), p.capital,
      (first ? "The first movable-type press in the record was set up at " + seat(ctx, p) + " in " + p.name + ". " : "A press was set up at " + seat(ctx, p) + " in " + p.name + ". ") +
      "Within a generation there were " + ctx.int(12, 60) + " presses, and the price of a book had fallen to that of a pair of boots. The first books printed were ledgers, indulgences and a very long poem; the first book to be banned was printed the same year.");
  } },

{ id: "gunpowder-adopted", scope: "polity", weight: 4, minEra: "powder", cooldown: 9999,
  test: function (ctx) { const g = H(ctx.world).gun; return ctx.polity.tech > 0.35 && !(g && g[ctx.polity.id]); },
  run: function (ctx) {
    const p = ctx.polity, h = H(ctx.world);
    if (!h.gun) h.gun = {};
    if (h.gun[p.id]) return null;
    h.gun[p.id] = true;
    const first = ctx.pastByType("gunpowder-adopted", 1).length === 0;
    h.bonus[p.id] = Math.min(0.3, (h.bonus[p.id] || 0) + 0.12);
    return res(first ? 5 : 3, ["military", "technology", "gunpowder"], A(ctx, p), p.capital,
      (first ? "The first recorded use of gunpowder artillery in the war of this world was at the arsenal of " + seat(ctx, p) + ". " : "") + p.name + " cast its first bombards, which burst in an unaccountable fraction of cases, killing the gunners and, on one occasion, a visiting ambassador. The engineers asked for more money. They received it, and the walls of every castle in the kingdom were thereafter, in principle, obsolete.");
  } },

/* ------------------------------------------------------------ economy --- */

{ id: "trade-route-opened", scope: "polity", weight: 5, cooldown: 30,
  test: function (ctx) { return ctx.neighbors().some(function (q) { return !warBetween(ctx, ctx.polity, q) && (ctx.polity.relations[q.id] || 0) > -0.4; }); },
  run: function (ctx) {
    const p = ctx.polity;
    const q = ctx.pick(ctx.neighbors().filter(function (x) { return !warBetween(ctx, p, x) && (p.relations[x.id] || 0) > -0.4; }));
    const goods = ctx.pick(pickEra(GOODS, ctx));
    AEON.remember(ctx.world, p, q, 0.25, "opened a trade in " + goods);
    if (!AEON.treatyBetween(ctx.world, p, q, "trade")) AEON.treaty(ctx.world, "trade", p, q, { goods: goods, until: ctx.year + 100 });
    p.population = Math.round(p.population * 1.015); q.population = Math.round(q.population * 1.015);
    p.prestige = clamp(p.prestige + 0.02, 0, 1); adjustT(p, "stability", 0.012);
    H(ctx.world).routes.push({ a: p.id, b: q.id, year: ctx.year });
    return res(2, ["trade", "diplomacy"], A(ctx, p, q), p.capital,
      "A regular trade in " + goods + " opened between " + seat(ctx, p) + " and " + seat(ctx, q) + ", the first caravan having been escorted by soldiers of both states, who spent the journey watching each other and noticing, with some reluctance, a profit.");
  } },

{ id: "trade-league", scope: "polity", weight: 2, minEra: "iron", cooldown: 120,
  test: function (ctx) {
    const p = ctx.polity;
    return p.wealth > 0.35 && ctx.neighbors().filter(function (q) { return !warBetween(ctx, p, q) && (p.relations[q.id] || 0) > -0.3; }).length >= 2;
  },
  run: function (ctx) {
    const p = ctx.polity;
    const ns = ctx.shuffle(ctx.neighbors().filter(function (q) { return !warBetween(ctx, p, q) && (p.relations[q.id] || 0) > -0.3; })).slice(0, 3);
    const all = [p].concat(ns);
    for (const a of all) { for (const b of all) if (a !== b) a.relations[b.id] = clamp((a.relations[b.id] || 0) + 0.3, -1, 1); a.population = Math.round(a.population * 1.02); a.prestige = clamp(a.prestige + 0.04, 0, 1); }
    const nm = ctx.choice(["The League of " + locName(ctx.world.regions[p.capital]), "The " + p.adjective + " Hanse", "The Concord of the Free Markets", "The Salt League", "The Union of Ports"]);
    H(ctx.world).routes.push({ a: p.id, b: ns[0].id, year: ctx.year, league: nm });
    for (const q of ns) { AEON.remember(ctx.world, p, q, 0, "joined it in " + nm.replace(/^The /, "the ")); AEON.treaty(ctx.world, "trade", p, q, { name: nm, until: ctx.year + 150 }); }
    return res(3, ["trade", "league", "diplomacy"], A.apply(null, [ctx].concat(all)), p.capital,
      nm + " was founded by " + all.map(function (x) { return x.name; }).join(", ") + ", which agreed to a common weight, a common measure and a common court for the settlement of disputes. The common court heard its first case within a month, and it was between two members.");
  } },

{ id: "debasement", scope: "polity", weight: 2, minEra: "classical", cooldown: 100,
  test: function (ctx) { return ctx.polity.wealth > 0.2; },
  run: function (ctx) {
    const p = ctx.polity, from = ctx.int(80, 98), to = ctx.int(35, 70);
    adjustT(p, "stability", -0.06); p.prestige = clamp(p.prestige - 0.02, 0, 1);
    return res(2, ["economy", "debasement"], A(ctx, p), p.capital,
      "The silver content of the coinage of " + p.name + " was reduced from " + from + " to " + to + " parts in a hundred, the difference being retained by the treasury. Prices rose within the year, and the ministers explained that this had nothing to do with the coin.");
  } },

{ id: "market-crash", scope: "polity", weight: 1.5, minEra: "iron", cooldown: 80,
  test: function (ctx) { return ctx.polity.wealth > 0.4; },
  run: function (ctx) {
    const p = ctx.polity;
    const deb = ctx.past(function (e) { return e.type === "debasement" && e.actors.some(function (a) { return a.id === p.id; }) && ctx.year - e.year < 70; }, 1)[0];
    loseFolk(p, 0.04); adjustT(p, "stability", -0.05);
    return res(3, ["economy", "crash"], A(ctx, p), p.capital,
      "A run on the moneylenders of " + seat(ctx, p) + " ruined " + ctx.int(6, 40) + " banking houses in a season, and with them the credit of the merchants who owed them. " +
      (deb ? "The coinage had been debased in " + yl(deb.year) + ", and the moneylenders had not forgotten it." : "No cause was agreed on; several were put forward by those who had been solvent.") + " The harvest of the following year was unexpectedly good, and no one learned anything.");
  } },

{ id: "resource-discovery", scope: "polity", weight: 3, cooldown: 50,
  test: function (ctx) { return ctx.regionsOf(ctx.polity).length > 0; },
  run: function (ctx) {
    const p = ctx.polity, r = ctx.pick(ctx.regionsOf(p));
    r.resources.metal = clamp(r.resources.metal + 0.25, 0, 1);
    if (r.features.indexOf("mine") < 0) r.features.push("mine");
    p.tech = clamp(p.tech + 0.01, 0, 1);
    return res(2, ["economy", "discovery"], A(ctx, p, r), r.id,
      "A shepherd in " + provName(r) + " found " + ctx.choice(pickEra(RESOURCE_FINDS, ctx)) + ". The shepherd was rewarded with a small pension; the crown with a very large one. Within a decade the district had a garrison, a mint and a hospital for the miners.");
  } },

/* --------------------------------------------------------- disasters ---- */

{ id: "famine", scope: "polity", weight: 3, cooldown: 25,
  test: function (ctx) { return ctx.polity.population > 2000; },
  run: function (ctx) {
    const p = ctx.polity, frac = ctx.range(0.05, 0.2), n = loseFolk(p, frac);
    adjustT(p, "stability", -0.02);
    const cause = ctx.choice(["a cold, wet summer that rotted the grain in the ear", "three years of drought", "locusts, followed by a hard frost", "a river that did not flood", "a late spring and an early autumn", "a blight that struck the root crops", "a war that took the farmers away at harvest"]);
    return res(frac > 0.14 ? 3 : 2, ["famine", "disaster"], A(ctx, p), p.capital,
      "Famine struck " + p.name + " after " + cause + ". About " + approx(n) + " people died, " + (frac > 0.14 ? "many in the roads leading to the cities, where the granaries were guarded" : "mostly the old and the very young") + ". The tax-farmers continued to collect.");
  } },

{ id: "earthquake", scope: "polity", weight: 2, cooldown: 60,
  test: function (ctx) { return ctx.regionsOf(ctx.polity).some(function (r) { return r.settlement; }); },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world;
    const r = ctx.pick(ctx.regionsOf(p).filter(function (x) { return x.settlement; }));
    const name = locName(r), n = loseFolk(p, ctx.range(0.01, 0.06));
    let tail, tags = ["earthquake", "disaster"];
    for (const k in w.artifacts) { const a = w.artifacts[k]; if (a.location === r.id && a.kind === "wonder" && !a.destroyed) { a.destroyed = ctx.year; tail = " " + a.name + " did not survive it."; } }
    if (r.settlement.tier > 1) { r.settlement.tier--; tail = (tail || "") + " The city was rebuilt on a smaller scale."; }
    else { makeRuin(r); tags.push("ruin-made"); tail = (tail || "") + " The town was never rebuilt; the survivors moved to the next valley."; }
    return res(3, tags, A(ctx, p, r), r.id,
      "An earthquake struck " + name + " on a still night and killed about " + approx(n) + " people in the falling of houses." + tail);
  } },

{ id: "flood", scope: "polity", weight: 2.5,
  test: function (ctx) { return ctx.regionsOf(ctx.polity).some(function (r) { return r.elevation < 0.6 && r.moisture > 0.4; }); },
  run: function (ctx) {
    const p = ctx.polity, r = ctx.pick(ctx.regionsOf(p).filter(function (x) { return x.elevation < 0.6 && x.moisture > 0.4; }));
    const n = loseFolk(p, ctx.range(0.02, 0.07));
    let tail = " The embankments were rebuilt by forced labour, which drowned a few more.";
    if (p.archetypeId === "riverkingdom") { r.resources.food = clamp(r.resources.food + 0.08, 0, 1); tail = " The silt it left behind was the best soil in " + p.name + " for a generation, a fact the priests announced as a blessing."; }
    return res(2, ["flood", "disaster"], A(ctx, p, r), r.id,
      "The river rose in " + provName(r) + " and carried away " + approx(n) + " people, the autumn seed and two bridges." + tail);
  } },

{ id: "volcanic-winter", scope: "world", weight: 0.6, cooldown: 300,
  test: function (ctx) { return ctx.living().length > 2; },
  run: function (ctx) {
    const w = ctx.world, v = ctx.pick(w.regions.filter(function (r) { return !r.barren; }));
    if (!v.name) v.name = ctx.name("place", { region: v });
    let hit = 0, dead = 0;
    for (const p of ctx.living()) {
      const c = w.regions[p.capital];
      if (c && dist(c, v) < 26) { dead += loseFolk(p, ctx.range(0.06, 0.14)); hit++; adjustT(p, "stability", -0.03); }
    }
    if (!hit) return null;
    return res(hit >= 5 ? 5 : 4, ["disaster", "volcano", "famine"], A(ctx, v), v.id,
      "A great eruption near " + provName(v) + " was followed by a dry fog that dimmed the sun for " + ctx.int(2, 4) + " summers. Snow fell in midsummer, the rivers froze at the wrong season, and the harvests of " + hit + " " + (hit === 1 ? "state" : "states") + " failed in succession. About " + approx(dead) + " people died of hunger, and the surviving chroniclers, who disagreed about everything else, agreed about the cold.");
  } },

{ id: "plague-outbreak", scope: "world", weight: 1.6,
  test: function (ctx) { return !activePlague(ctx) && ctx.living().some(function (p) { return p.population > 4000; }); },
  run: function (ctx) {
    const w = ctx.world, h = H(w);
    const big = ctx.living().filter(function (p) { return p.population > 4000; }).sort(function (a, b) { return b.population - a.population; }).slice(0, 3);
    const p = ctx.pick(big);
    const nm = ctx.chance(0.5) ? ctx.choice(PLAGUES) : "the " + p.adjective + " " + ctx.choice(["Pestilence", "Fever", "Sweat", "Flux", "Distemper"]);
    const n = loseFolk(p, ctx.range(0.06, 0.16));
    const inf = {}; inf[p.id] = ctx.year;
    h.plagues.push({ name: nm, start: ctx.year, origin: p.id, infected: inf, virulence: ctx.range(0.05, 0.13), over: false, deaths: n });
    const r = rulerOf(ctx, p);
    let tail = "";
    if (r && ctx.chance(0.2)) { ctx.kill(r, "Died of " + nm + " in the second month of the contagion."); tail = " The ruler, " + who(r) + ", was among the dead."; }
    return res(4, ["plague", "disaster"], A(ctx, p), p.capital,
      "A sickness the physicians of " + p.name + " called " + nm + " broke out at " + seat(ctx, p) + ". About " + approx(n) + " people died in the first season, " + ctx.choice(["and the burial pits were dug in advance", "and the survivors blamed the foreigners, the priests and the weather in turn", "and the dead outnumbered the gravediggers by a factor the records do not give"]) + "." + tail);
  } },

{ id: "plague-spreads", scope: "world", weight: 14,
  test: function (ctx) {
    const pl = activePlague(ctx);
    if (!pl) return false;
    return ctx.living().some(function (p) { return pl.infected[p.id] && ctx.neighbors(p).some(function (q) { return !pl.infected[q.id]; }); });
  },
  run: function (ctx) {
    const pl = activePlague(ctx), w = ctx.world;
    const pairs = [];
    for (const p of ctx.living()) if (pl.infected[p.id]) for (const q of ctx.neighbors(p)) if (!pl.infected[q.id]) pairs.push([p, q]);
    if (!pairs.length) return null;
    const pr = ctx.pick(pairs), from = pr[0], to = pr[1];
    pl.infected[to.id] = ctx.year;
    const n = loseFolk(to, pl.virulence * ctx.range(0.5, 1.1));
    pl.deaths += n;
    const route = ctx.choice(["with the caravans", "with an army returning from the frontier", "in the holds of grain ships", "with pilgrims on the road to the shrine", "with a bride and her retinue", "in the clothing of the dead, which was sold"]);
    let tail = "";
    const r = rulerOf(ctx, to);
    if (r && ctx.chance(0.12)) { ctx.kill(r, "Died of " + pl.name + "."); tail = " " + who(r) + " was among the dead."; }
    return res(3, ["plague", "disaster"], A(ctx, from, to), to.capital,
      pl.name + " crossed from " + from.name + " into " + to.name + " " + route + ", and killed about " + approx(n) + " people there before the year was out." + tail);
  } },

{ id: "plague-wanes", scope: "world", weight: 12,
  test: function (ctx) { const pl = activePlague(ctx); return !!pl && ctx.year - pl.start >= 20; },
  run: function (ctx) {
    const pl = activePlague(ctx);
    pl.over = true;
    const cnt = Object.keys(pl.infected).length, o = ctx.world.polities[pl.origin];
    return res(3, ["plague"], o ? A(ctx, o) : [], o ? o.capital : null,
      pl.name + " burned itself out after " + (ctx.year - pl.start) + " years, having reached " + cnt + " " + (cnt === 1 ? "state" : "states") + " and killed, by the reckoning of the later historians, perhaps " + approx(pl.deaths) + " people. The survivors were, in the short term, better fed.");
  } },

{ id: "omen-observed", scope: "polity", weight: 2,
  test: function (ctx) { return true; },
  run: function (ctx) {
    const p = ctx.polity, o = ctx.choice(OMENS);
    const d = (p.traits.piety > 0.5 ? 0.04 : -0.03) * (ctx.chance(0.5) ? 1 : -1);
    adjustT(p, "piety", 0.03); adjustT(p, "stability", d);
    return res(1, ["omen"], A(ctx, p), p.capital,
      "In " + p.name + " " + o + " was observed and recorded. The court astrologers disagreed about its meaning for " + ctx.int(2, 9) + " months, after which the matter was settled by the ruler's mood.");
  } },

/* ---------------------------------------------------------------- war ---- */

{ id: "war-declared", consolidate: true, scope: "polity", weight: 8, cooldown: 30,
  test: function (ctx) {
    const p = ctx.polity;
    return p.military > 0.2 && p.traits.aggression > 0.3 && wars(ctx, p).length < 2 &&
      ctx.rivals().some(function (r) { return !r.ended && !warBetween(ctx, p, r); });
  },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world;
    const c = ctx.rivals().filter(function (r) { return !r.ended && !warBetween(ctx, p, r); });
    const foe = ctx.rng.weighted(c, function (r) { return 1 / (0.4 + strength(w, r) / strength(w, p)); });
    const cb = ctx.choice(CASUS_BELLI);
    const wr = startWar(ctx, p, foe, cb);
    const rl = rulerOf(ctx, p);
    return res(3, ["war", "war-declared"], A(ctx, p, foe, rl), p.capital,
      who(rl) + " of " + p.name + " declared war on " + foe.name + ", citing " + cb + ". It was the first of the year's declarations that anyone believed, and the war that followed became known as " + wr.name + ".");
  } },

{ id: "religious-war", scope: "polity", weight: 3, cooldown: 80,
  test: function (ctx) {
    const p = ctx.polity, h = H(ctx.world), mine = h.faithOf[p.id];
    return p.traits.piety > 0.45 && mine != null && wars(ctx, p).length < 2 &&
      ctx.rivals().some(function (r) { return h.faithOf[r.id] != null && h.faithOf[r.id] !== mine && !warBetween(ctx, p, r); });
  },
  run: function (ctx) {
    const p = ctx.polity, h = H(ctx.world), mine = h.faithOf[p.id];
    const foe = ctx.pick(ctx.rivals().filter(function (r) { return h.faithOf[r.id] != null && h.faithOf[r.id] !== mine && !warBetween(ctx, p, r); }));
    const f = activeFaith(ctx, p), ff = activeFaith(ctx, foe);
    const wr = startWar(ctx, p, foe, "the error of " + ff.name, { holy: true });
    adjustT(p, "piety", 0.04); adjustT(foe, "piety", 0.04);
    return res(4, ["war", "religious-war", "religion"], A(ctx, p, foe), p.capital,
      p.name + ", adherent of " + f.name + ", took up arms against " + foe.name + ", where " + ff.name + " was professed. Each side believed it was defending the other from damnation; both were poor at explaining this to the peasants whose farms were burned. The conflict was called " + wr.name + ".");
  } },

{ id: "war-of-revenge", scope: "polity", weight: 6, cooldown: 120,
  test: function (ctx) {
    const p = ctx.polity, d = H(ctx.world).defeats[p.id];
    return d != null && ctx.year - d >= 60 && wars(ctx, p).length < 2 && p.military > 0.2;
  },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, h = H(w);
    const ev = ctx.past(function (e) {
      if (!hasTag(e, "defeat") || !e.actors[1] || e.actors[1].id !== p.id || ctx.year - e.year < 60 || ctx.year - e.year > 450) return false;
      const win = w.polities[e.actors[0].id];
      return !!win && !win.ended && !warBetween(ctx, p, win);
    }, 1)[0];
    delete h.defeats[p.id];
    if (!ev) return null;
    const foe = w.polities[ev.actors[0].id], rl = rulerOf(ctx, p), r = ev.regionId != null ? w.regions[ev.regionId] : null;
    const wr = startWar(ctx, p, foe, "the defeat of " + yl(ev.year), { revenge: ev.id });
    adjustT(p, "aggression", 0.06); p.prestige = clamp(p.prestige + 0.02, 0, 1);
    return res(4, ["war", "war-declared", "revenge", "memory"], A(ctx, p, foe, rl), r ? r.id : p.capital,
      (ctx.year - ev.year) + " years after the defeat of " + yl(ev.year) + (r ? " at " + provName(r) : "") + ", " + who(rl) + " of " + p.name + " told the assembled court that the debt to " + foe.name + " had never been discharged. The tale of the defeat had been taught in the schools of " + p.name + " for " + (ctx.year - ev.year < 50 ? "a generation" : Math.round((ctx.year - ev.year) / 28) + " generations") + ", and had grown with each telling. The war that followed was known as " + wr.name + ".");
  } },

{ id: "battle", scope: "polity", weight: 8,
  test: function (ctx) { return wars(ctx, ctx.polity).length > 0; },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, wf = ctx.pick(wars(ctx, p)), foe = wf.foe;
    const fr = frontier(ctx, p, foe), r = fr.length ? ctx.pick(fr) : null;
    const o = fight(ctx, p, foe, r, fr.length), W = o.W, L = o.L;
    const place = r ? provName(r) : ctx.name("place", { polity: foe });
    loseFolk(L, ctx.range(0.005, 0.015)); loseFolk(W, ctx.range(0.002, 0.008));
    tire(w, L, 0.05); tire(w, W, 0.02); addWin(wf.war, W);
    /* a rout on the defender's own ground costs it the province */
    const lost = o.won && o.margin === "crushing" && r && r.owner === L.id && L.regions.length > 1;
    if (lost) annex(ctx, r, W);
    return res(lost ? 3 : 2, lost ? ["war", "battle", "territory"] : ["war", "battle"], A(ctx, W, L), r ? r.id : null,
      fill(ctx.pick(BATTLE_LINES[Math.min(eIdx(ctx), 5)]), { W: W.name, L: L.name, P: place }) + " " + bodies(o) + " were left on the field." + (lost ? " " + cap(place) + " passed to " + W.name + "." : ""));
  } },

{ id: "decisive-battle", scope: "polity", weight: 5,
  test: function (ctx) { return wars(ctx, ctx.polity).some(function (x) { return frontier(ctx, ctx.polity, x.foe).length > 0; }); },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, h = H(w);
    const wf = ctx.pick(wars(ctx, p).filter(function (x) { return frontier(ctx, p, x.foe).length > 0; })), foe = wf.foe;
    const fr = frontier(ctx, p, foe), site = ctx.pick(fr);
    const o = fight(ctx, p, foe, site, fr.length);
    if (!o.won) return repelled(ctx, wf.war, p, foe, site, o, "The decisive battle of " + (wf.war.name || "the war") + " was fought at " + provName(site) + ".");
    const W = p, L = foe;
    const taken = [site].concat(ctx.shuffle(fr.filter(function (z) { return z !== site; }))).slice(0, o.take);
    const last = L.regions.length === taken.length;
    const names = taken.map(provName);
    const aim = AEON.warAim(w, W, L);
    if (aim !== "conquer") return pillage(ctx, wf.war, W, L, taken, aim, "The decisive battle of " + (wf.war.name || "the war") + " was fought at " + names[0] + ". " + battleLine(ctx, W, L, site) + " " + bodies(o) + " were left on the field.");
    for (const t of taken) { if (t.owner === L.id) annex(ctx, t, W); }
    loseFolk(L, ctx.range(0.01, 0.03)); tire(w, L, 0.1); tire(w, W, 0.03); addWin(wf.war, W); addWin(wf.war, W);
    adjustT(L, "stability", -0.03); W.prestige = clamp(W.prestige + 0.04, 0, 1);
    if (h.defeats[L.id] == null) h.defeats[L.id] = ctx.year;
    const tags = ["war", "battle", "defeat", "territory"];
    if (last) tags.push("fall");
    const list = names.length > 2 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names.join(" and ");
    return res(4, tags, A(ctx, W, L), taken[0].id,
      "The decisive battle of " + (wf.war.name || "the war") + " was fought at " + names[0] + ". " + battleLine(ctx, W, L, site) + " " + bodies(o) + " were left on the field. In the settlement that followed, " + list + " passed to " + W.name + "." + (last ? " " + L.name + " did not survive the loss." : ""));
  } },

{ id: "siege", scope: "polity", weight: 9,
  test: function (ctx) { const p = ctx.polity; return wars(ctx, p).some(function (x) { return frontier(ctx, p, x.foe).some(function (r) { return r.settlement; }); }); },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, h = H(w);
    const wf = ctx.pick(wars(ctx, p).filter(function (x) { return frontier(ctx, p, x.foe).some(function (r) { return r.settlement; }); })), L = wf.foe, W = p;
    const targets = frontier(ctx, W, L).filter(function (r) { return r.settlement; });
    const r = ctx.rng.weighted(targets, function (x) { return x.settlement.tier; });
    const o = fight(ctx, W, L, r, 1);
    if (!o.won) {
      tire(w, W, 0.05); loseFolk(W, 0.01); addWin(wf.war, L);
      const why = ctx.choice(["when plague broke out in the besiegers' camp", "when the autumn rains flooded the siege lines", "after the garrison burned the besiegers' engines in a night sortie", "when the besiegers' allies went home for the harvest", "when a relieving army was reported on the road, which turned out to be a rumour but was believed"]);
      return res(2, ["war", "siege", "repelled"], A(ctx, W, L), r.id,
        "The siege of " + locName(r) + " by " + W.name + " was raised after " + ctx.int(3, 20) + " months " + why + ". About " + approx(o.lost.L) + " of the besiegers did not go home. " + L.name + " held the city, and the besiegers, who had expected otherwise, went home by a different road.");
    }
    const name = locName(r), isCap = L.capital === r.id, last = L.regions.length === 1;
    const method = ctx.pick(SIEGE_METHODS[Math.min(eIdx(ctx), 5)]), yrs = ctx.int(1, 3);
    /* a city taken by storm is more often razed than a field won */
    const aim = AEON.warAim(w, W, L, { raze: 4 });
    if (aim !== "conquer") {
      if (isCap) h.capLost[L.id] = ctx.year;
      return pillage(ctx, wf.war, W, L, [r], aim, "After a siege of " + (yrs === 1 ? "one year" : yrs + " years") + ", " + W.name + " " + method + " and broke into " + name + (isCap ? ", the capital of " + L.name : "") + ".");
    }
    annex(ctx, r, W);
    loseFolk(L, ctx.range(0.01, 0.04)); tire(w, L, 0.07); addWin(wf.war, W); addWin(wf.war, W);
    if (h.defeats[L.id] == null) h.defeats[L.id] = ctx.year;
    if (isCap) h.capLost[L.id] = ctx.year;
    const tags = ["war", "siege", "defeat", "territory"];
    if (isCap) tags.push("capital-lost");
    if (last) tags.push("fall");
    return res(isCap ? 5 : 3, tags, A(ctx, W, L), r.id,
      "After a siege of " + (yrs === 1 ? "one year" : yrs + " years") + ", " + W.name + " " + method + " and took " + name + (isCap ? ", the capital of " + L.name : "") + "." +
" The garrison was spared, which surprised the garrison." + (last ? " With it, " + L.name + " ceased to exist." : ""));
  } },


{ id: "naval-raid", scope: "polity", weight: 3,
  test: function (ctx) {
    const p = ctx.polity;
    return ctx.regionsOf(p).some(function (r) { return coastal(ctx, r); }) &&
      ctx.rivals().some(function (q) { return ctx.regionsOf(q).some(function (r) { return coastal(ctx, r); }); });
  },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world;
    const foes = ctx.rivals().filter(function (q) { return ctx.regionsOf(q).some(function (r) { return coastal(ctx, r); }); });
    const foe = ctx.pick(foes), r = ctx.pick(ctx.regionsOf(foe).filter(function (x) { return coastal(ctx, x); }));
    AEON.remember(w, foe, p, -0.3, "raided " + locName(r));
    const ships = Math.max(3, Math.round(AEON.navyOf(w, p) * 0.4));
    /* a defender with a fleet of its own puts out to meet the raiders */
    if (AEON.navyOf(w, foe) >= 3) {
      const o = AEON.battle(w, p, foe, { sea: true, shareA: 0.4 });
      if (!o.won) return res(2, ["raid", "war", "naval", "repelled"], A(ctx, foe, p, r), r.id,
        "A fleet of " + ships + " " + NAVAL[Math.min(eIdx(ctx), 5)] + " out of " + p.name + " making for " + locName(r) + " was met at sea by the ships of " + foe.name + " and driven off. " + p.name + " lost " + o.lost.L + " " + (o.lost.L === 1 ? "ship" : "ships") + ", " + foe.name + " " + o.lost.W + ".");
    }
    let tail = " The raiders were gone by the time the militia assembled.";
    if (r.settlement && r.settlement.tier > 1 && ctx.chance(0.3)) { r.settlement.tier--; tail = " The harbour quarter was burned and not rebuilt for a generation."; }
    const n = loseFolk(foe, 0.01);
    return res(2, ["raid", "war"], A(ctx, p, foe, r), r.id,
      "A fleet of " + ships + " " + NAVAL[Math.min(eIdx(ctx), 5)] + " out of " + p.name + " raided " + locName(r) + " in " + foe.name + ", carrying off " + ctx.choice(["grain", "bullion", "temple plate", "cattle", "the harbour dues", "a great many people"]) + ". About " + approx(n) + " were killed or taken." + tail);
  } },

{ id: "steppe-invasion", scope: "polity", weight: 1.2, cooldown: 40,
  test: function (ctx) {
    const p = ctx.polity;
    return (p.archetypeId === "steppe" || p.traits.aggression > 0.7) && p.military > 0.25 &&
      ctx.rivals().some(function (q) { return q.archetypeId !== "steppe" && frontier(ctx, p, q).length > 0; });
  },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, h = H(w);
    const q = ctx.pick(ctx.rivals().filter(function (x) { return x.archetypeId !== "steppe" && frontier(ctx, p, x).length > 0; }));
    const fr = frontier(ctx, p, q), site = ctx.pick(fr);
    const o = fight(ctx, p, q, site, fr.length);
    if (!o.won) return repelled(ctx, warBetween(ctx, p, q), p, q, site, o, "The horsemen of " + p.name + " came out of the grassland in the spring and were brought to battle at " + provName(site) + ".", ["invasion"]);
    const taken = [site].concat(ctx.shuffle(fr.filter(function (z) { return z !== site; }))).slice(0, o.take);
    const last = q.regions.length === taken.length;
    const names = taken.map(provName);
    /* riders come for loot more often than for land */
    const aim = AEON.warAim(w, p, q, { conquer: 0.6 });
    if (aim !== "conquer") return pillage(ctx, warBetween(ctx, p, q), p, q, taken, aim, "The horsemen of " + p.name + " came out of the grassland in the spring, moving faster than any message could, and broke the levies of " + q.name + " at " + names[0] + "; " + bodies(o) + " died.");
    let ruin = false;
    for (const t of taken) {
      const big = t.settlement && t.settlement.tier >= 2;
      annex(ctx, t, p);
      if (big && ctx.chance(0.4)) { makeRuin(t); ruin = true; }
    }
    loseFolk(q, ctx.range(0.04, 0.09)); adjustT(q, "stability", -0.05); p.prestige = clamp(p.prestige + 0.05, 0, 1);
    if (h.defeats[q.id] == null) h.defeats[q.id] = ctx.year;
    const tags = ["invasion", "war", "defeat", "territory"];
    if (ruin) tags.push("ruin-made");
    if (last) tags.push("fall");
    const list = names.length > 2 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names.join(" and ");
    return res(4, tags, A(ctx, p, q), taken[0].id,
      "The horsemen of " + p.name + " came out of the grassland in the spring, moving faster than any message could, and took " + list + " from " + q.name + ". " +
      (ruin ? "A town that resisted was destroyed so thoroughly that its name is known from one other source only. " : "") + "The garrisons were not defeated so much as bypassed, and learned of it from the smoke; " + bodies(o) + " died." + (last ? " " + q.name + " ended there." : ""));
  } },

/* ---------------------------------------------- consolidation, overseas, capitals --- */

/* a great realm swallows a small neighbour, while the world has more realms than it is heading for */
{ id: "absorb-minor", consolidate: true, scope: "polity", weight: 30, cooldown: 20,
  /* only while the world has more realms than it is heading for; then it is the likeliest thing
     a great realm does, which is what pulls fifty states down to a dozen or so */
  test: function (ctx) {
    const p = ctx.polity;
    return p.regions.length >= 4 && ctx.living().length > ctx.realmCap() && minorNeighbours(ctx, p).length > 0;
  },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, c = minorNeighbours(ctx, p);
    const q = ctx.rng.weighted(c, function (x) { return 1 / x.regions.length; });
    /* it becomes a vassal; core.js folds it in decades later (vassalTick) */
    const capName = seat(ctx, q), rl = rulerOf(ctx, q), how = ctx.int(0, 2);
    AEON.makeVassal(w, q, p, { how: ["submission", "marriage", "purchase"][how] });
    p.prestige = clamp(p.prestige + 0.04, 0, 1);
    const txt = how === 0
      ? q.name + " submitted to " + p.name + " without a battle and became its vassal. " + (rl ? who(rl) : "Its ruler") + " received the envoys at " + capName + ", read the terms twice and signed them once; the " + q.adjective + " banners now flew beneath those of " + p.name + "."
      : how === 1
      ? "By a marriage and a treaty that took longer to draft than the wedding took to arrange, " + q.name + " passed under the protection of " + p.name + ". " + capName + " kept its council and lost its say."
      : p.name + " bought the allegiance of " + q.name + ": the price was " + ctx.int(3, 40) + " years of its revenue, paid in instalments the lords of " + capName + " were not alive to see completed.";
    return res(3, ["vassal", "diplomacy"], A(ctx, p, q, rl), q.capital, txt);
  } },

/* an army crosses the sea to take a weaker realm's coast */
{ id: "overseas-invasion", scope: "polity", weight: 3, minEra: "iron", cooldown: 60,
  /* the test only checks for a port; the search for a target happens when the fleet sails */
  test: function (ctx) { const p = ctx.polity; return p.tech > 0.3 && p.regions.length >= 6 && ctx.regionsOf(p).some(function (r) { return coastal(ctx, r); }); },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, t = invasionTarget(ctx, p);
    if (!t) return null;
    const q = t.foe, land = t.region, from = t.port;
    const wr = warBetween(ctx, p, q) || startWar(ctx, p, q, "the crossing to " + provName(land));
    /* the crossing: a defender with a fleet meets it at sea first */
    if (AEON.navyOf(w, q) >= 3) {
      const s = AEON.battle(w, p, q, { sea: true });
      if (!s.won) {
        addWin(wr, q); tire(w, p, 0.05);
        return res(3, ["war", "invasion", "naval", "repelled"], A(ctx, q, p, land), land.id,
          "A fleet from " + locName(from) + " carrying the army of " + p.name + " to " + provName(land) + " was met at sea by the ships of " + q.name + ". " + s.lost.L + " of the " + p.adjective + " ships were sunk or taken and the rest turned for home, " + q.name + " losing " + s.lost.W + ".");
      }
    }
    /* the landing: only part of the army can be carried over */
    const o = fight(ctx, p, q, land, 3, { shareA: 0.4 / Math.max(1, wars(ctx, p).length) });
    if (!o.won) return repelled(ctx, wr, p, q, land, o, "The army of " + p.name + " crossed the sea from " + locName(from) + " and landed at " + provName(land) + ".", ["invasion", "naval"]);
    const take = [land].concat(ctx.regionsOf(q).filter(function (r) { return r !== land && coastal(ctx, r) && dist(r, land) <= 3; }).slice(0, Math.min(2, o.take - 1)));
    for (const r of take) if (!q.ended) annex(ctx, r, p, "Its last coast was taken by a fleet from " + p.name + ".");
    p.prestige = clamp(p.prestige + 0.05, 0, 1); addWin(wr, p);
    return res(4, ["war", "invasion", "naval", "conquest", "territory"], A(ctx, p, q, land), land.id,
      "A fleet from " + locName(from) + " carried the army of " + p.name + " across the sea to " + provName(land) + ". " +
      (o.margin === "narrow" ? "The levies of " + q.name + " met it on the beach and held it there for a day before giving way." : ctx.choice(["The levies of " + q.name + " met it on the beach and did not stay there long.", "It landed unopposed, which the commanders took for luck and the chroniclers for treason.", "The landing cost a third of the ships; the rest of the campaign cost less."])) +
      " " + (take.length > 1 ? take.length + " coastal provinces" : cap(provName(land))) + " passed to " + p.name + ".");
  } },

/* a realm moves its seat: to a greater city of its own, or because a faction there won at court */
{ id: "capital-moved", scope: "polity", weight: 1.5, cooldown: 200,
  test: function (ctx) { return !!newSeat(ctx, ctx.polity); },
  run: function (ctx) {
    const p = ctx.polity, r = newSeat(ctx, p), old = ctx.world.regions[p.capital], oldName = locName(old);
    if (!r) return null;
    const bigger = (r.settlement.tier || 0) > ((old.settlement && old.settlement.tier) || 0);
    p.capital = r.id; adjustT(p, "stability", bigger ? 0.02 : -0.03);
    return res(3, ["capital", "internal"], A(ctx, p, r), r.id,
      bigger ? "The court of " + p.name + " moved from " + oldName + " to " + locName(r) + ", which had long since outgrown it. " + cap(oldName) + " kept its palaces and lost its importance."
             : "After a struggle at court that the losing side called a coup, the government of " + p.name + " was moved from " + oldName + " to " + locName(r) + ". " + cap(oldName) + " was left with the old dynasty, its temples and its grievances.");
  } },

{ id: "peace-treaty", scope: "polity", weight: 18,
  test: function (ctx) { return wars(ctx, ctx.polity).some(function (x) { return ctx.year - x.war.start >= 10; }); },
  /* also run by core.js warClock to end a war (ctx.war, ctx.warScore for its side a): the terms
     follow the war score */
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, h = H(w);
    let wf;
    if (ctx.war) {
      const foe0 = w.polities[ctx.war.a === p.id ? ctx.war.b : ctx.war.a], wr0 = foe0 && warBetween(ctx, p, foe0);
      if (!wr0) return null;
      wf = { war: wr0, foe: foe0 };
    } else wf = ctx.pick(wars(ctx, p).filter(function (x) { return ctx.year - x.war.start >= 10; }));
    const foe = wf.foe, wr = wf.war;
    const d = ctx.war ? Math.round(ctx.warScore * 4) * (ctx.war.a === p.id ? 1 : -1) : winsOf(wr, p) - winsOf(wr, foe);
    const nm = wr.name || "the war", len = lasted(AEON.warLength(w, ctx.war || AEON.treatyBetween(w, p, foe, "war")));
    const t = treatyName(ctx, w.regions[p.capital]);
    let text, tags = ["peace", "treaty"], reg = p.capital;
    if (Math.abs(d) >= 2) {
      const W = d > 0 ? p : foe, L = d > 0 ? foe : p;
      const fr = frontier(ctx, W, L);
      if (L.regions.length > 1 && fr.length && ctx.chance(0.5)) {
        const rg = ctx.pick(fr); reg = rg.id;
        text = t + " ended " + nm + " after " + len + ". " + L.name + " ceded " + provName(rg) + " to " + W.name + " and paid an indemnity in " + ctx.choice(["silver", "grain", "horses", "timber", "tin"]) + ".";
        annex(ctx, rg, W); tags.push("territory");
      } else {
        AEON.makeVassal(w, L, W, { name: t });
        text = t + " ended " + nm + " after " + len + ". " + L.name + " was made tributary to " + W.name + ", owing " + ctx.choice(["an annual payment of silver", "ten thousand measures of grain a year", "a yearly tribute of horses and hostages", "a tithe of the harvest"]) + ", and its ruler's heir was sent to the victor's court to be educated.";
        tags.push("tribute");
      }
    } else {
      text = t + " ended " + nm + " after " + len + " with no one the winner. Prisoners were exchanged, the frontier was left where it had been before the war, and both sides erected monuments to a victory.";
    }
    endWar(ctx, wr); relate(p, foe, 0.1);
    adjustT(p, "stability", 0.03); adjustT(foe, "stability", 0.03);
    return res(3, tags, A(ctx, p, foe), reg, text);
  } },

{ id: "war-exhaustion", scope: "polity", weight: 6,
  test: function (ctx) { return wars(ctx, ctx.polity).some(function (x) { return ctx.year - x.war.start >= 30; }); },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world;
    const wf = ctx.pick(wars(ctx, p).filter(function (x) { return ctx.year - x.war.start >= 30; }));
    const foe = wf.foe, wr = wf.war;
    const a = loseFolk(p, ctx.range(0.05, 0.09)), b = loseFolk(foe, ctx.range(0.05, 0.09));
    adjustT(p, "stability", -0.04); adjustT(foe, "stability", -0.04);
    endWar(ctx, wr);
    return res(3, ["war", "exhaustion", "peace"], A(ctx, p, foe), p.capital,
      "After " + (ctx.year - wr.start) + " years, " + (wr.name || "the war") + " between " + p.name + " and " + foe.name + " ended because neither could continue it. The two states had lost perhaps " + approx(a + b) + " people between them, in battle, in sieges and in the famines that followed the armies. There was no treaty; the commanders simply went home, and the border-guards remained.");
  } },

{ id: "tribute-demanded", scope: "polity", weight: 3,
  test: function (ctx) {
    const p = ctx.polity, h = H(ctx.world);
    return ctx.rivals().some(function (q) { return !warBetween(ctx, p, q) && !AEON.lordOf(ctx.world, q) && strength(ctx.world, p) > strength(ctx.world, q) * 1.35; });
  },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, h = H(w);
    const q = ctx.pick(ctx.rivals().filter(function (x) { return !warBetween(ctx, p, x) && !AEON.lordOf(w, x) && strength(w, p) > strength(w, x) * 1.35; }));
    AEON.makeVassal(w, q, p);
    AEON.remember(w, q, p, -0.3, "demanded tribute");
    const what = pickEra([["a yearly tribute of copper and cattle"], ["a yearly tribute of tin and hostages"], ["a yearly tribute in silver"], ["a yearly tribute of gold and horses"], ["an annual payment of silver and the right of passage for troops"], ["a yearly subsidy in coin"]], ctx)[0];
    return res(3, ["tribute", "diplomacy"], A(ctx, p, q), q.capital,
      p.name + " marched an army to the borders of " + q.name + " and demanded " + what + ". " + q.name + " paid, the alternative being worse, and recorded the sum in its books under a different heading.");
  } },

{ id: "tribute-collected", scope: "polity", weight: 3,
  test: function (ctx) {
    const p = ctx.polity, h = H(ctx.world);
    return AEON.vassalsOf(ctx.world, p).length > 0;
  },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, h = H(w);
    const q = ctx.pick(AEON.vassalsOf(w, p));
    p.prestige = clamp(p.prestige + 0.03, 0, 1); adjustT(q, "stability", -0.015);
    return res(1, ["tribute"], A(ctx, p, q), p.capital,
      "The yearly tribute of " + q.name + " arrived at " + seat(ctx, p) + " " + ctx.int(10, 90) + " days late and " + ctx.int(5, 30) + " per cent short. The envoy was received with every courtesy and informed of the difference.");
  } },

{ id: "tributary-revolt", scope: "polity", weight: 5,
  test: function (ctx) {
    const p = ctx.polity, lord = AEON.lordOf(ctx.world, p);
    return !!lord && !lord.ended && (p.traits.stability < 0.6 || strength(ctx.world, p) > strength(ctx.world, lord) * 0.8) && !warBetween(ctx, p, lord);
  },
  run: function (ctx) {
    const p = ctx.polity, lord = AEON.lordOf(ctx.world, p), tb = AEON.treatyBetween(ctx.world, p, lord, "tribute"), since = tb.start;
    AEON.endTreaty(ctx.world, tb, "revolt");
    const wr = startWar(ctx, p, lord, "the tribute that had become an insult");
    adjustT(p, "aggression", 0.05);
    return res(3, ["revolt", "war", "tribute"], A(ctx, p, lord), p.capital,
      p.name + " stopped sending tribute to " + lord.name + " after " + (ctx.year - since) + " years of paying it. The envoy of " + lord.name + " was sent home without a reply, which was understood in both capitals to be one. The war was called " + wr.name + ".");
  } },

{ id: "dynastic-marriage", scope: "polity", weight: 2.5, cooldown: 30,
  test: function (ctx) { return ctx.neighbors().some(function (q) { return !warBetween(ctx, ctx.polity, q) && (ctx.polity.relations[q.id] || 0) > -0.5; }); },
  run: function (ctx) {
    const p = ctx.polity;
    const q = ctx.pick(ctx.neighbors().filter(function (x) { return !warBetween(ctx, p, x) && (p.relations[x.id] || 0) > -0.5; }));
    AEON.remember(ctx.world, p, q, 0.45, "married into its ruling house");
    AEON.treaty(ctx.world, "marriage", p, q, { until: ctx.year + 80 });
    H(ctx.world).marriages.push({ a: p.id, b: q.id, year: ctx.year });
    const clause = ctx.choice(["any child of the marriage would inherit both thrones should the male lines fail", "the bride's dowry-province would revert to her family if she died childless", "neither house would give shelter to the other's rebels", "the first son would be raised at the court of the mother's father"]);
    return res(2, ["marriage", "diplomacy"], A(ctx, p, q, rulerOf(ctx, p), rulerOf(ctx, q)), p.capital,
      "A marriage was concluded between the ruling houses of " + p.name + " and " + q.name + ". The contract specified that " + clause + ". The negotiators, who had drafted the clause with some care, did not expect it to be read again.");
  } },

{ id: "claim-by-marriage", scope: "polity", weight: 4, cooldown: 100,
  test: function (ctx) {
    const p = ctx.polity;
    return H(ctx.world).marriages.some(function (m) { return (m.a === p.id || m.b === p.id) && ctx.year - m.year >= 25 && ctx.year - m.year <= 220; }) && wars(ctx, p).length < 2;
  },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world;
    const ev = ctx.past(function (e) {
      if (e.type !== "dynastic-marriage" || !e.actors.some(function (a) { return a.id === p.id; })) return false;
      const oid = (e.actors.filter(function (a) { return a.kind === "polity" && a.id !== p.id; })[0] || {}).id;
      const o = oid && w.polities[oid];
      return ctx.year - e.year >= 25 && ctx.year - e.year <= 220 && !!o && !o.ended && !warBetween(ctx, p, o);
    }, 1)[0];
    if (!ev) return null;
    const o = w.polities[ev.actors.filter(function (a) { return a.kind === "polity" && a.id !== p.id; })[0].id];
    if (strength(w, p) < strength(w, o) * 0.8) return null;
    const rl = rulerOf(ctx, p);
    const wr = startWar(ctx, p, o, "the marriage contract of " + yl(ev.year));
    return res(4, ["war", "claim", "diplomacy", "memory"], A(ctx, p, o, rl), o.capital,
      "Citing the marriage contract of " + yl(ev.year) + ", now " + (ctx.year - ev.year) + " years old, " + who(rl) + " of " + p.name + " announced that the crown of " + o.name + " was " + his(rl || { id: "f1" }) + " " + ctx.choice(["by right of the bride's line", "through a clause in the dowry", "through the female line", "by the plain sense of the contract"]) + ", and sent an army to collect it. The clause had been drafted in a different century by men with a different idea of what it would mean. The war was called " + wr.name + ".");
  } },

{ id: "rise-of-conqueror", scope: "polity", weight: 2, cooldown: 150,
  test: function (ctx) { return ctx.polity.traits.aggression > 0.4 && ctx.polity.military > 0.25; },
  run: function (ctx) {
    const p = ctx.polity, h = H(ctx.world), g = ctx.newFigure(p, "warlord");
    g.traits.ambition = clamp(g.traits.ambition + 0.25, 0, 1);
    h.bonus[p.id] = Math.min(0.3, (h.bonus[p.id] || 0) + 0.15); adjustT(p, "aggression", 0.12);
    return res(3, ["warlord", "military"], A(ctx, p, g), p.capital,
      "A commander named " + g.name + " rose out of the border garrisons of " + p.name + ", having won " + ctx.int(3, 9) + " small campaigns in a row and the loyalty of the men who fought them. " + ctx.choice(["He was sparing of his own soldiers and not of anyone else's.", "His army was fed, which counted for more than victory.", "He promised the soldiers land; the land belonged to other people."]) + " The ruler, observing this, promoted him.");
  } },

/* ----------------------------------------------------------- internal ---- */

{ id: "rebellion-crushed", scope: "polity", weight: 5, cooldown: 30,
  test: function (ctx) { return ctx.polity.traits.stability < 0.55; },
  run: function (ctx) {
    const p = ctx.polity, r = ctx.pick(ctx.regionsOf(p)), lead = ctx.name("figure", { polity: p, role: "rebel" });
    const n = loseFolk(p, ctx.range(0.01, 0.03)); adjustT(p, "stability", 0.05);
    return res(2, ["rebellion"], A(ctx, p, r), r.id,
      "A rising in " + provName(r) + " under " + (lead && lead.name || "a local landholder") + " was put down by the army of " + p.name + " after " + ctx.int(2, 14) + " months. About " + approx(n) + " died; " + ctx.int(20, 400) + " were executed afterwards " + ctx.choice(["along the main road, as a lesson", "in the market of " + locName(r), "by drowning, the rebels having been fond of the river"]) + ".");
  } },

{ id: "peasant-revolt", scope: "polity", weight: 3, cooldown: 60,
  test: function (ctx) { return ctx.polity.traits.stability < 0.5 && ctx.polity.population > 3000; },
  run: function (ctx) {
    const p = ctx.polity, lead = ctx.name("figure", { polity: p, role: "rebel" });
    const n = loseFolk(p, ctx.range(0.04, 0.1)); adjustT(p, "stability", 0.04);
    const host = ctx.choice(["the Hoe-Men", "the Barefoot", "the Red Kerchiefs", "the Tax-Burners", "the Grain Marchers", "the Ploughmen's Host"]);
    return res(3, ["revolt", "peasant"], A(ctx, p), p.capital,
      "A revolt of the peasantry broke out in " + p.name + " over " + ctx.choice(["a new levy on salt", "the enclosure of the common pasture", "the price of bread after the failed harvest", "forced labour on the capital's walls", "a tax on hearths"]) + ". " + host + ", led by " + (lead && lead.name || "a local carter") + ", burned " + ctx.int(10, 90) + " manor houses and the tax rolls kept in them. About " + approx(n) + " people died before the revolt was put down; the levy was afterwards withdrawn, an outcome which the rebels' surviving descendants considered adequate.");
  } },

{ id: "secession-province", scope: "polity", weight: 2.5, cooldown: 120,
  test: function (ctx) { return !crowded(ctx) && ctx.polity.traits.stability < 0.45 && ctx.polity.regions.length >= 3; },
  run: function (ctx) {
    const p = ctx.polity, regs = secessionGroup(ctx, p, 0.2);
    if (!regs) return null;
    const mountain = regs[0].biome === "mountain";
    const np = splitRealm(ctx, p, regs, mountain ? "hillclans" : "successor", 0.15);
    if (!np) return null;
    const gov = ctx.name("figure", { polity: np, role: "governor" });
    adjustT(p, "stability", 0.03);
    return res(4, ["secession", "rebellion"], A(ctx, p, np), np.capital,
      "The distant province of " + provName(ctx.world.regions[np.capital]) + " renounced its allegiance to " + p.name + " under its governor " + (gov && gov.title ? gov.title + " " : "") + (gov && gov.name || "") + ", who had not been paid for " + ctx.int(2, 6) + " years and had concluded that no one was coming. The new state, " + np.name + ", was recognised by no one and tolerated by everyone.");
  } },

{ id: "civil-war", scope: "polity", weight: 2, cooldown: 150,
  test: function (ctx) { const p = ctx.polity; return !crowded(ctx) && p.regions.length >= 3 && (p.traits.stability < 0.3 || !!H(ctx.world).pretenders[p.id]); },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, h = H(w);
    const regs = secessionGroup(ctx, p, 0.45), np = splitRealm(ctx, p, regs, "successor", 0.4);
    if (!np) return null;
    let pre = h.pretenders[p.id] && w.figures[h.pretenders[p.id]];
    if (!pre || pre.died != null) pre = ctx.newFigure(np, "pretender");
    delete h.pretenders[p.id];
    pre.polityId = np.id; pre.role = "ruler"; pre.title = titleFor(w, np, gOf(pre));
    np.ruler = pre.id; np.rulers = [pre.id]; greet(ctx, pre);
    const wr = startWar(ctx, np, p, "the throne of " + p.name);
    const rl = rulerOf(ctx, p);
    adjustT(p, "stability", 0.05);
    return res(4, ["civil-war", "secession", "war"], A(ctx, p, np, pre, rl), np.capital,
      "Civil war split " + p.name + " in two. " + pre.name + ", who claimed the throne by an older right than " + who(rl) + ", was proclaimed " + pre.title + " in " + locName(w.regions[np.capital]) + ", and the provinces of the " + ctx.choice(["east", "west", "north", "south", "hills", "coast"]) + " followed. The new realm called itself " + np.name + "; both sides called the other rebels. The conflict was known as " + wr.name + ".");
  } },

{ id: "fragmentation", scope: "polity", weight: 2.5, cooldown: 200,
  test: function (ctx) { return !crowded(ctx) && ctx.polity.regions.length >= 9 && ctx.polity.traits.stability < 0.5; },
  run: function (ctx) {
    const p = ctx.polity, before = p.regions.length, made = [];
    const k = ctx.int(2, 3);
    for (let i = 0; i < k; i++) {
      const regs = secessionGroup(ctx, p, 0.3);
      const np = splitRealm(ctx, p, regs, "successor", 0.25);
      if (np) made.push(np);
    }
    if (!made.length) return null;
    adjustT(p, "stability", 0.12); p.prestige *= 0.5;
    if (H(ctx.world).emperor[p.id]) { delete H(ctx.world).emperor[p.id]; p.archetypeId = "successor"; p.archetypeName = "Successor State"; }
    const nm = made.map(function (x) { return x.name; });
    return res(before >= 14 ? 5 : 4, ["collapse", "fragmentation", "secession"], A.apply(null, [ctx, p].concat(made)), p.capital,
      "The realm of " + p.name + ", stretched over " + before + " provinces and governed from " + seat(ctx, p) + ", could no longer pay its frontier garrisons. Its governors began to keep the revenue; its generals to keep the garrisons. Within " + ctx.int(5, 30) + " years it had broken into " + (made.length + 1) + " pieces: " + p.name + " itself, and " + nm.join(", ") + ". Everyone concerned claimed to be the legitimate heir to the whole.");
  } },

{ id: "capital-sacked", scope: "polity", weight: 1.2, cooldown: 150,
  test: function (ctx) {
    const p = ctx.polity;
    return !!ctx.world.regions[p.capital].settlement && (wars(ctx, p).length > 0 || ctx.rivals().some(function (q) { return q.traits.aggression > 0.6; }));
  },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world;
    const wf = wars(ctx, p);
    const att = wf.length ? ctx.pick(wf).foe : ctx.pick(ctx.rivals().filter(function (q) { return q.traits.aggression > 0.6; }));
    if (!att) return null;
    const r = w.regions[p.capital];
    const name = locName(r), tier = r.settlement.tier;
    const razed = tier <= 2 && p.regions.length > 1 && ctx.chance(0.35);
    AEON.logSack(w, r, att, razed ? "razed" : "plundered");
    let tags = ["sack", "capital-sacked", "war"], tail;
    const n = loseFolk(p, ctx.range(0.06, 0.14));
    p.tech = clamp(p.tech - 0.03, 0, 1); adjustT(p, "stability", -0.1); p.prestige *= 0.7;
    if (razed) {
      const alt = ctx.regionsOf(p).filter(function (x) { return x.id !== r.id && x.settlement; });
      makeRuin(r); tags.push("ruin-made");
      if (alt.length) p.capital = ctx.pick(alt).id;
      tail = " The city was not rebuilt. The court removed to " + seat(ctx, p) + ", and the old name was afterwards used by the people of " + att.name + " as a threat to children.";
    } else {
      if (tier > 1) r.settlement.tier--;
      tail = " The city was afterwards rebuilt, smaller, with higher walls and a lower opinion of its neighbours.";
    }
    return res(tier >= 3 ? 5 : 4, tags, A(ctx, att, p, r), r.id,
      "The forces of " + att.name + " entered " + name + ", the capital of " + p.name + ", and held it for " + ctx.int(3, 21) + " days. About " + approx(n) + " people were killed or enslaved; " + ctx.choice(["the temple treasuries were carried off in forty wagons", "the royal archives were burned for warmth", "the palace was stripped to its beams", "the great gates were taken as trophies"]) + "." + tail);
  } },

{ id: "dark-age", scope: "polity", weight: 4, cooldown: 200,
  test: function (ctx) { return ctx.polity.tech > 0.25 && ctx.polity.traits.stability < 0.3; },
  run: function (ctx) {
    const p = ctx.polity, h = H(ctx.world);
    const loss = ctx.range(0.06, 0.18), lost = ctx.choice(pickEra(TECH_LOST, ctx));
    p.tech = clamp(p.tech - loss, 0, 1); adjustT(p, "curiosity", -0.08); adjustT(p, "stability", 0.1);
    h.lostTech++;
    return res(4, ["dark-age", "lost-technique", "lost:" + lost], A(ctx, p), p.capital,
      "For about " + ctx.int(2, 6) + " generations after the troubles, no one in " + p.name + " could manage " + lost + ". The last masters of the craft had died in the famine or the wars, and their apprentices, who had been conscripted, did not return. The people continued to use the buildings and the tools of the earlier age and to attribute them, with increasing confidence, to giants.");
  } },

{ id: "city-abandoned", scope: "polity", weight: 2, cooldown: 40,
  test: function (ctx) {
    const p = ctx.polity;
    return p.regions.length >= 2 && ctx.regionsOf(p).some(function (r) { return r.settlement && r.settlement.tier <= 2 && r.id !== p.capital; });
  },
  run: function (ctx) {
    const p = ctx.polity;
    const r = ctx.pick(ctx.regionsOf(p).filter(function (x) { return x.settlement && x.settlement.tier <= 2 && x.id !== p.capital; }));
    const name = locName(r), why = ctx.choice(EVICTION_REASONS);
    makeRuin(r); loseFolk(p, 0.01);
    return res(2, ["abandonment", "ruin-made"], A(ctx, p, r), r.id,
      name + " in " + p.name + " was abandoned after " + why + ". Its stones were hauled away to other towns over the following century; the foundations remained, and the name was kept on the maps for another hundred years out of respect, or inertia.");
  } },

/* ------------------------------------------------------------ religion --- */

{ id: "prophet-arises", scope: "polity", weight: 2.5, cooldown: 80,
  test: function (ctx) { return ctx.polity.traits.piety > 0.35 && H(ctx.world).faiths.length < 14; },
  run: function (ctx) {
    const p = ctx.polity, h = H(ctx.world), fn = faithName(ctx.rng, p.culture);
    const f = ctx.newFigure(p, "prophet"), r = ctx.pick(ctx.regionsOf(p));
    const faith = { id: h.faiths.length + 1, name: fn.name, core: fn.core, founder: f.id, home: p.id, year: ctx.year, parent: null };
    h.faiths.push(faith);
    let tail;
    if (ctx.chance(0.4)) {
      ctx.kill(f, "Executed for blasphemy at " + locName(r) + ". The faith outlived the sentence.");
      tail = " The authorities had " + him2(f) + " put to death within the year, which provided the faith with its first martyr and its first doctrine.";
    } else { h.faithOf[p.id] = faith.id; adjustT(p, "piety", 0.08); tail = " The court of " + p.name + " adopted the new teaching within a decade, finding it consistent with existing policy."; }
    return res(4, ["religion", "faith-founded"], A(ctx, p, f, r), r.id,
      "A teacher named " + f.name + " began preaching " + fn.name + " at " + locName(r) + " in " + p.name + ", attracting first the poor, then the soldiers, then a few rather worried priests of the older cult." + tail);
  } },

{ id: "conversion", scope: "polity", weight: 4, cooldown: 60,
  test: function (ctx) {
    const p = ctx.polity, h = H(ctx.world);
    return h.faiths.length > 0 && ctx.neighbors().some(function (q) { return h.faithOf[q.id] != null && h.faithOf[q.id] !== h.faithOf[p.id]; });
  },
  run: function (ctx) {
    const p = ctx.polity, h = H(ctx.world);
    const q = ctx.pick(ctx.neighbors().filter(function (x) { return h.faithOf[x.id] != null && h.faithOf[x.id] !== h.faithOf[p.id]; }));
    const faith = activeFaith(ctx, q);
    if (!faith) return null;
    h.faithOf[p.id] = faith.id; adjustT(p, "piety", 0.05);
    relate(p, q, Math.max(p.relations[q.id] || 0, 0.3));
    const rl = rulerOf(ctx, p);
    return res(3, ["religion", "conversion"], A(ctx, p, q, rl), p.capital,
      who(rl) + " of " + p.name + " adopted " + faith.name + ", the faith of " + q.name + ", " + ctx.choice(CONVERSION_REASONS) + ". The temples of the old gods were not closed but were, over the next generation, simply not repaired.");
  } },

{ id: "schism", scope: "polity", weight: 1.2, cooldown: 120,
  test: function (ctx) { const p = ctx.polity; return !!activeFaith(ctx, p) && p.regions.length >= 3 && p.traits.piety > 0.45; },
  run: function (ctx) {
    const p = ctx.polity, h = H(ctx.world), f = activeFaith(ctx, p);
    const sect = { id: h.faiths.length + 1, name: fill(ctx.choice(SECT_FORMS), { C: f.core }), core: f.core, founder: null, home: p.id, year: ctx.year, parent: f.id };
    h.faiths.push(sect);
    const adopted = ctx.chance(0.5);
    if (adopted) h.faithOf[p.id] = sect.id;
    adjustT(p, "stability", -0.08);
    return res(3, ["religion", "schism"], A(ctx, p), p.capital,
      "A dispute over " + ctx.choice(["the nature of the first sacrifice", "the date of the festival", "whether the sacred texts had been corrupted in copying", "the authority of the priesthood over the ruler", "the correct reading of a single word in the liturgy"]) + " divided the followers of " + f.name + " in " + p.name + ". The dissenters formed " + sect.name + " and " + (adopted ? "were joined by the court, which found it convenient." : "were declared heretics by the court, which found it convenient."));
  } },

{ id: "heresy-suppressed", scope: "polity", weight: 1.2, cooldown: 120,
  test: function (ctx) { if (crowded(ctx)) return false; const p = ctx.polity; return !!activeFaith(ctx, p) && p.traits.piety > 0.55; },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, h = H(w), f = activeFaith(ctx, p);
    const sect = h.faiths.filter(function (s) { return s.parent === f.id; })[0];
    const nm = sect ? sect.name : "the " + ctx.choice(["Quietists", "Ascetics of the Lamp", "Followers of the Second Teacher", "Unwashed", "Silent Brethren"]);
    const n = loseFolk(p, ctx.range(0.005, 0.02));
    adjustT(p, "piety", 0.03); adjustT(p, "stability", 0.02);
    let tail = " The rest recanted, or learned to do so convincingly.";
    const open = openLand(ctx, p);
    if (open.length && !crowded(ctx) && ctx.chance(0.1)) {
      const r = ctx.pick(open), np = ctx.spawnPolity(r, "theocracy");
      const nn = ctx.name("polity", { region: r, archetype: { id: "theocracy" }, culture: p.culture });
      np.name = nn.name; np.adjective = nn.adjective; np.culture = nn.culture;
      relate(np, p, -0.5); if (sect) h.faithOf[np.id] = sect.id;
      tail = " Several thousand fled across the frontier and founded " + np.name + " at " + locName(r) + ", where they remained, unreconciled.";
      return res(4, ["religion", "heresy", "suppression", "founding"], A(ctx, p, np, r), r.id,
        "The priests of " + f.name + " in " + p.name + " suppressed " + nm + ". About " + approx(n) + " people were burned, hanged or drowned." + tail);
    }
    return res(3, ["religion", "heresy", "suppression"], A(ctx, p), p.capital,
      "The priests of " + f.name + " in " + p.name + " suppressed " + nm + ". About " + approx(n) + " people were burned, hanged or drowned." + tail);
  } },

{ id: "holy-site-founded", scope: "polity", weight: 1.5, cooldown: 250,
  test: function (ctx) { return ctx.polity.traits.piety > 0.45; },
  run: function (ctx) {
    const p = ctx.polity, r = ctx.pick(ctx.regionsOf(p)), f = activeFaith(ctx, p), c = CULTURES[p.culture] || CULTURES.mediterranean;
    if (r.features.indexOf("holy-site") < 0) r.features.push("holy-site");
    const art = ctx.newArtifact({ name: "The Shrine of " + stem(ctx.rng, c, 1, 2), kind: "shrine", region: r, power: ctx.range(0.3, 0.8), legend: "A shrine at " + provName(r) + " that drew pilgrims from " + ctx.int(3, 12) + " provinces." });
    H(ctx.world).holy++;
    p.prestige = clamp(p.prestige + 0.04, 0, 1);
    return res(3, ["religion", "holy-site", "artifact"], A(ctx, p, r, art), r.id,
      "Pilgrims began to visit " + provName(r) + " in " + p.name + " after " + ctx.choice(["a hermit's tomb was reported to cure the lame", "a spring that did not freeze in winter", "the burial there of a martyr of " + (f ? f.name : "the old cult"), "a reported vision to a shepherd girl", "the discovery of a very old altar in a field"]) + ". " + art.name + " was built there within a generation, and the roads to it improved by the same pilgrims' donations.");
  } },

{ id: "pilgrimage", scope: "polity", weight: 1.5, cooldown: 80,
  test: function (ctx) { return H(ctx.world).holy > 0 && ctx.polity.traits.piety > 0.45; },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world;
    const evs = ctx.pastByType("holy-site-founded", 10).filter(function (e) { return e.regionId != null; });
    if (!evs.length) return null;
    const ev = ctx.pick(evs), r = w.regions[ev.regionId], o = r.owner && w.polities[r.owner];
    const rl = rulerOf(ctx, p);
    if (!o || o === p) {
      p.prestige = clamp(p.prestige + 0.02, 0, 1);
      return res(2, ["religion", "pilgrimage", "memory"], A(ctx, p, r, rl), r.id, who(rl) + " of " + p.name + " walked the last " + ctx.int(5, 40) + " miles to the shrine at " + provName(r) + " barefoot, a distance that was recorded by the escort, who were not.");
    }
    if (ctx.chance(0.7)) {
      AEON.remember(w, p, o, 0.15, "welcomed its pilgrims at " + provName(r)); p.prestige = clamp(p.prestige + 0.02, 0, 1);
      return res(2, ["religion", "pilgrimage", "memory"], A(ctx, p, o, r), r.id, "A pilgrimage from " + p.name + " to the shrine at " + provName(r) + " in " + o.name + ", founded " + (ctx.year - ev.year) + " years before, passed without incident and brought a modest improvement in relations, which both courts attributed to piety.");
    }
    AEON.remember(w, p, o, -0.4, "let its pilgrims be attacked on the road to " + provName(r));
    return res(3, ["religion", "pilgrimage", "memory", "incident"], A(ctx, p, o, r), r.id, "Pilgrims from " + p.name + " were attacked on the road to the shrine at " + provName(r) + " in " + o.name + ", and " + ctx.int(20, 300) + " were killed. " + o.name + " said it was bandits; " + p.name + " said it was " + o.name + ". Relations did not recover for a generation.");
  } },

{ id: "imperial-proclamation", scope: "polity", weight: 0.8, minEra: "iron", cooldown: 9999,
  test: function (ctx) { const p = ctx.polity; return p.regions.length >= 20 && p.prestige > 0.5 && !H(ctx.world).emperor[p.id]; },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, h = H(w), rl = rulerOf(ctx, p);
    h.emperor[p.id] = true;
    const a = w.pack.archetypes.filter(function (x) { return x.id === "empire"; })[0];
    if ((p.archetypeId === "successor" || p.archetypeId === "citystate") && ctx.chance(0.6)) { p.archetypeId = "empire"; if (a) p.archetypeName = a.name; }
    if (rl) rl.title = titleFor(w, p, gOf(rl));
    p.prestige = clamp(p.prestige + 0.06, 0, 1);
    return res(4, ["empire", "title"], A(ctx, p, rl), p.capital,
      who(rl) + " was proclaimed ruler of " + p.regions.length + " provinces at " + seat(ctx, p) + ", the title having been chosen by a committee of scribes who had spent the previous year researching what the neighbours had been called. The provinces, which had been governed as separate kingdoms, were redescribed in the registers as one empire.");
  } },

{ id: "tyrant-seizes-power", scope: "polity", weight: 0.5, minEra: "iron", cooldown: 9999,
  test: function (ctx) { const p = ctx.polity; return (p.archetypeId === "citystate" || p.archetypeId === "maritime") && p.traits.stability < 0.3 && !!p.ruler; },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, rl = rulerOf(ctx, p);
    const was = p.archetypeId === "maritime" ? "maritime republic" : "league of free towns";
    const to = p.regions.length >= 3 ? "empire" : "successor";
    const a = w.pack.archetypes.filter(function (x) { return x.id === to; })[0];
    p.archetypeId = to; if (a) p.archetypeName = a.name;
    if (rl) rl.title = titleFor(w, p, gOf(rl));
    adjustT(p, "stability", 0.08);
    return res(3, ["constitutional", "usurpation"], A(ctx, p, rl), p.capital,
      "The " + was + " of " + p.name + ", which had survived forty years of faction and three of famine, handed the army to " + who(rl) + " for a single emergency. The emergency was not repeated and was never ended. The assemblies continued to meet and to vote, and the votes were counted by the army.");
  } },

{ id: "blood-feud", scope: "polity", weight: 4, cooldown: 40,
  test: function (ctx) { return ctx.polity.archetypeId === "hillclans"; },
  run: function (ctx) {
    const p = ctx.polity, rl = rulerOf(ctx, p), cause = ctx.choice(FEUD_CAUSES);
    const n = loseFolk(p, ctx.range(0.005, 0.02)); adjustT(p, "stability", -0.07);
    let tail = "";
    if (rl && ctx.chance(0.25)) { ctx.kill(rl, "Killed in the feud over " + cause + ", on the threshold of the house that had given hospitality."); tail = " " + who(rl) + " was among the dead."; }
    return res(2, ["feud", "internal"], A(ctx, p, rl), p.capital,
      "Two great clans of " + p.name + " fell into a blood-feud over " + cause + ". It lasted " + ctx.int(3, 25) + " years and cost about " + approx(n) + " lives, none of them with any bearing on the original grievance." + tail);
  } },

/* ------------------------------------------------------------- memory ---- */

{ id: "ruins-excavated", scope: "polity", weight: 2.5, cooldown: 60,
  test: function (ctx) { const p = ctx.polity; return p.tech > 0.2 && p.traits.curiosity > 0.35 && ruinsIn(ctx, p).length > 0; },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, h = H(w);
    const r = ctx.pick(ruinsIn(ctx, p));
    const ev = ctx.past(function (e) { return e.regionId === r.id && hasTag(e, "ruin-made"); }, 1)[0];
    if (ev && ctx.year - ev.year < 40) return null;
    h.excavated[r.id] = true;
    const fallen = ev ? lastPolityActor(ev, w) : null;
    p.tech = clamp(p.tech + 0.015, 0, 1); adjustT(p, "curiosity", 0.03); p.prestige = clamp(p.prestige + 0.03, 0, 1);
    const acts = A(ctx, p, r);
    let text;
    if (ev && fallen && fallen.id !== p.id) {
      const art = ctx.newArtifact({ name: "The " + fallen.adjective + " Hoard", kind: "relic", region: r, power: ctx.range(0.3, 0.7), legend: "Objects recovered from the ruins at " + provName(r) + ", identified as the work of " + fallen.name + "." });
      acts.push(ctx.actor(fallen), ctx.actor(art));
      text = "Diggers working at " + provName(r) + " in " + p.name + " uncovered the foundations of a city, a quantity of broken pottery and an inscription which scholars identified, after some argument, as a record of " + fallen.name + ". The city had been lost " + (ctx.year - ev.year) + " years earlier, in " + yl(ev.year) + ", and the memory of it had not survived in the locality. " + art.name + " was removed to " + seat(ctx, p) + " and is the best surviving evidence of that people.";
    } else if (ev && fallen) {
      text = "Diggers at " + provName(r) + " in " + p.name + " found the burned foundations of a city destroyed " + (ctx.year - ev.year) + " years earlier, in " + yl(ev.year) + ". The local people had been using the stones for their pig-pens and had not thought it worth mentioning.";
    } else {
      text = "Farmers at " + provName(r) + " in " + p.name + " turned up the foundations of a large town of unknown origin, with a paved street and a drain. Scholars at " + seat(ctx, p) + " identified it as the work of " + ctx.choice(["a people not otherwise known", "the founders of the nation, which is to say nobody", "an earlier age"]) + ", which was a way of saying nothing.";
    }
    return res(3, ["ruins", "discovery", "memory"], acts, r.id, text);
  } },

{ id: "reclaim-lost-capital", scope: "polity", weight: 6, cooldown: 150,
  test: function (ctx) { const d = H(ctx.world).capLost[ctx.polity.id]; return d != null && ctx.year - d >= 30 && ctx.polity.military > 0.2; },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, h = H(w);
    const ev = ctx.past(function (e) { return hasTag(e, "capital-lost") && e.actors[1] && e.actors[1].id === p.id; }, 1)[0];
    delete h.capLost[p.id];
    if (!ev || ev.regionId == null) return null;
    const r = w.regions[ev.regionId], rl = rulerOf(ctx, p);
    if (r.owner === p.id) return null;
    const holder = r.owner && w.polities[r.owner], name = locName(r) || provName(r);
    const was = (ctx.year - ev.year);
    if (!holder) {
      ctx.transfer(r, p); p.capital = r.id;
      if (r.features.indexOf("ruins") >= 0) { r.features.splice(r.features.indexOf("ruins"), 1); ctx.foundSettlement(r, 3); }
      return res(4, ["reclamation", "memory", "territory"], A(ctx, p, r, rl), r.id,
        "Having lost its capital " + was + " years before, in " + yl(ev.year) + ", " + p.name + " returned to the site under " + who(rl) + ", found it empty, and rebuilt it as the seat of the dynasty. The ruler's speech at the ceremony referred to the intervening years as \"the exile\".");
    }
    if (strength(w, p) > strength(w, holder) * 1.1) {
      annex(ctx, r, p); p.capital = r.id;
      p.prestige = clamp(p.prestige + 0.08, 0, 1); loseFolk(holder, 0.02);
      return res(5, ["reclamation", "memory", "territory", "war", "defeat"], A(ctx, p, holder, r, rl), r.id,
        who(rl) + " of " + p.name + " retook " + provName(r) + ", the old capital, " + was + " years after its loss to " + holder.name + ". The campaign was fought, in the words of the proclamation, \"to restore the hearth of our ancestors\", and the new seat of government was in the same building the dynasty had used before.");
    }
    if (warBetween(ctx, p, holder)) return null;
    const wr = startWar(ctx, p, holder, "the recovery of " + name, { revenge: ev.id });
    return res(4, ["war", "war-declared", "reclamation", "memory"], A(ctx, p, holder, r, rl), r.id,
      who(rl) + " of " + p.name + " declared that the capital lost in " + yl(ev.year) + " would be recovered, and sent the first army toward " + name + ", which " + holder.name + " now held. The war was known as " + wr.name + ".");
  } },

{ id: "forged-genealogy", scope: "polity", weight: 3, cooldown: 300,
  test: function (ctx) {
    const p = ctx.polity;
    return ctx.world.stats.collapses > 0 && !H(ctx.world).forged[p.id] && p.traits.cunning > 0.4 && p.prestige < 0.7 && !!p.ruler;
  },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, h = H(w), rl = rulerOf(ctx, p);
    const falls = ctx.pastByTag("fall", 40).map(function (e) { return lastPolityActor(e, w); }).filter(function (q) {
      return q && q.id !== p.id && q.ended && ctx.year - q.ended >= 40 && ctx.year - q.ended <= 700 && q.sizeHistory.some(function (s) { return s.size >= 3; });
    });
    if (!falls.length) return null;
    const q = ctx.pick(falls);
    const art = ctx.newArtifact({ name: "The Genealogy of the House of " + p.adjective, kind: "forgery", region: w.regions[p.capital], power: ctx.range(0.1, 0.4), legend: "A genealogy tracing the ruling house of " + p.name + " to the kings of " + q.name + ". It is a forgery." });
    h.forged[p.id] = { of: q.id, year: ctx.year };
    p.prestige = clamp(p.prestige + 0.1, 0, 1);
    return res(3, ["forgery", "genealogy", "memory"], A(ctx, p, q, rl, art), p.capital,
      "A genealogy produced at " + seat(ctx, p) + " traced the descent of " + who(rl) + " of " + p.name + " from the kings of " + q.name + ", an empire that had fallen " + (ctx.year - q.ended) + " years before and was by then admired in proportion to its absence. The document was supported by " + ctx.int(3, 9) + " charters in a convincingly archaic hand, and by the testimony of an abbot who had been paid.");
  } },

{ id: "forgery-exposed", scope: "polity", weight: 8,
  test: function (ctx) { const f = H(ctx.world).forged[ctx.polity.id]; return !!f && ctx.year - f.year >= 40; },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, h = H(w), f = h.forged[p.id];
    const ev = ctx.pastByType("forged-genealogy", 20).filter(function (e) { return e.actors.some(function (a) { return a.id === p.id; }); })[0] || ctx.pastByTag("forgery", 20).filter(function (e) { return e.actors.some(function (a) { return a.id === p.id; }); })[0];
    delete h.forged[p.id];
    const s = ctx.newFigure(p, "scholar"), q = w.polities[f.of];
    p.prestige = clamp(p.prestige - 0.1, 0, 1); adjustT(p, "stability", -0.04);
    return res(3, ["forgery", "scholar", "memory"], A(ctx, p, s, q), p.capital,
      s.title + " " + s.name + " demonstrated that the genealogy of the House of " + p.adjective + ", put about " + (ctx.year - (ev ? ev.year : f.year)) + " years earlier, claimed descent from " + (q ? q.name : "an extinct empire") + " in a script that had not been invented when the empire fell, and in a language that had not yet separated from its neighbour's. The ruling house continued to use the descent. The scholar was not prosecuted, only not invited.");
  } },

{ id: "lost-technique-rediscovered", scope: "polity", weight: 3, cooldown: 120,
  test: function (ctx) { const p = ctx.polity; return H(ctx.world).lostTech > 0 && p.tech < 0.75 && p.traits.curiosity > 0.4; },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, h = H(w);
    const evs = ctx.pastByTag("lost-technique", 25).filter(function (e) { return lostTechOf(e) && !h.recovered[e.id] && ctx.year - e.year >= 50; });
    if (!evs.length) return null;
    const ev = ctx.pick(evs), tech = lostTechOf(ev), q = lastPolityActor(ev, w);
    h.recovered[ev.id] = true;
    p.tech = clamp(p.tech + 0.05, 0, 1); adjustT(p, "curiosity", 0.02); p.prestige = clamp(p.prestige + 0.02, 0, 1);
    const s = ctx.newFigure(p, "scholar");
    return res(3, ["rediscovery", "memory", "technology"], A(ctx, p, s, q), p.capital,
      s.title + " " + s.name + " of " + p.name + ", working from a corrupt manuscript and the evidence of a ruined workshop, recovered " + tech + ", which had been lost since " + yl(ev.year) + ". It took " + ctx.int(8, 30) + " years, and the result was said to be inferior to the original. " + (q ? "The original had been the work of " + q.name + "." : ""));
  } },

{ id: "lost-text-recovered", scope: "polity", weight: 3, cooldown: 80,
  test: function (ctx) {
    const p = ctx.polity, w = ctx.world;
    return Object.keys(w.artifacts).some(function (k) {
      const a = w.artifacts[k], loc = w.regions[a.location], cr = a.creatorId && w.figures[a.creatorId];
      return (a.kind === "text" || a.kind === "epic" || a.kind === "law code") && !a.destroyed && loc && loc.owner === p.id && w.year - a.created >= 120 && (!cr || cr.polityId !== p.id);
    });
  },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world;
    const arts = Object.keys(w.artifacts).map(function (k) { return w.artifacts[k]; }).filter(function (a) {
      const loc = w.regions[a.location], cr = a.creatorId && w.figures[a.creatorId];
      return (a.kind === "text" || a.kind === "epic" || a.kind === "law code") && !a.destroyed && loc && loc.owner === p.id && w.year - a.created >= 120 && (!cr || cr.polityId !== p.id);
    });
    if (!arts.length) return null;
    const a = ctx.pick(arts), loc = w.regions[a.location];
    const ev = ctx.past(function (e) { return e.actors.some(function (x) { return x.kind === "artifact" && x.id === a.id; }); }, 1)[0];
    a.location = p.capital; a.power = clamp(a.power + 0.1, 0, 1);
    p.tech = clamp(p.tech + 0.02, 0, 1); p.prestige = clamp(p.prestige + 0.03, 0, 1);
    return res(3, ["rediscovery", "memory", "culture"], A(ctx, p, a, loc), loc.id,
      "A copy of " + lcThe(a.name) + ", composed " + (ctx.year - (ev ? ev.year : a.created)) + " years before and given up for lost, was found in " + ctx.choice(["the foundations of a granary", "a sealed jar in a monastery cellar", "the library of a family that had forgotten it owned one", "a wall cavity in the old palace"]) + " at " + provName(loc) + ". It was carried to " + seat(ctx, p) + " under escort, and a dozen copies were made at once, as an insurance against the people who had been careless with the first.");
  } },

];

/* ====================================================================== *
 *  THE PACK
 * ====================================================================== */

/* ---------------------------------------------------------------- technologies --- *
 * Named discoveries by age (core.js techTick): 0 Bronze, 1 Iron, 2 Classical, 3 Medieval, 4 Powder.
 * effects multiply: army / navy (quality in battle), growth (people the land feeds), wealth (what
 * people make). verb completes "the first realm in the record to ...". */
const TECHNOLOGIES = [
  { id: "bronze", name: "Bronze-working", age: 0, effects: { army: 1.1 }, verb: "cast bronze for blades and spear-points" },
  { id: "writing", name: "Writing", age: 0, effects: { wealth: 1.05 }, verb: "keep its accounts in writing" },
  { id: "wheel", name: "The wheel", age: 0, effects: { wealth: 1.03 }, verb: "put its loads on wheels" },
  { id: "chariot", name: "The war chariot", age: 0, needs: ["wheel", "bronze"], effects: { army: 1.1 }, verb: "take chariots into battle" },
  { id: "sail", name: "The sail", age: 0, effects: { navy: 1.2 }, verb: "rig its boats with sails" },
  { id: "irrigation", name: "Irrigation", age: 0, effects: { growth: 1.12 }, verb: "water its fields by canal" },
  { id: "iron", name: "Iron-working", age: 1, needs: ["bronze"], effects: { army: 1.15 }, verb: "smelt iron" },
  { id: "alphabet", name: "The alphabet", age: 1, needs: ["writing"], effects: { wealth: 1.05 }, verb: "write with an alphabet anyone could learn" },
  { id: "coinage", name: "Coinage", age: 1, effects: { wealth: 1.1 }, verb: "strike coins of a guaranteed weight" },
  { id: "trireme", name: "The oared warship", age: 1, needs: ["sail"], effects: { navy: 1.25 }, verb: "build oared warships with a ram" },
  { id: "cement", name: "Cement and the arch", age: 2, effects: { growth: 1.05, wealth: 1.05 }, verb: "build with cement and the arch" },
  { id: "roads", name: "Paved roads", age: 2, effects: { army: 1.05, wealth: 1.05 }, verb: "join its provinces with paved roads" },
  { id: "siege", name: "Siege engines", age: 2, needs: ["iron"], effects: { army: 1.1 }, verb: "batter walls with torsion engines" },
  { id: "astronomy", name: "Astronomy", age: 2, needs: ["alphabet"], effects: { navy: 1.1 }, verb: "steer by tables of the stars" },
  { id: "plough", name: "The heavy plough", age: 3, needs: ["iron"], effects: { growth: 1.15 }, verb: "turn heavy soils with a wheeled plough" },
  { id: "stirrup", name: "The stirrup", age: 3, effects: { army: 1.1 }, verb: "fight from the saddle with stirrups" },
  { id: "compass", name: "The compass", age: 3, needs: ["astronomy"], effects: { navy: 1.15 }, verb: "steer by a lodestone needle" },
  { id: "banking", name: "Banking", age: 3, needs: ["coinage"], effects: { wealth: 1.12 }, verb: "move money by letters of credit" },
  { id: "gunpowder", name: "Gunpowder", age: 4, effects: { army: 1.2 }, verb: "fight with powder and shot" },
  { id: "printing", name: "Printing", age: 4, needs: ["alphabet"], effects: { wealth: 1.05 }, verb: "print books with movable type" },
  { id: "galleon", name: "The ocean-going ship", age: 4, needs: ["compass"], effects: { navy: 1.3 }, verb: "build ships that could cross an ocean" },
  { id: "jointstock", name: "The joint-stock company", age: 4, needs: ["banking"], effects: { wealth: 1.12 }, verb: "found companies owned by shares" },
];

/* ---------------------------------------------------------------- realm types --- *
 * The form of state a realm has in its age, which it grows into and out of (core.js chooseType).
 * Ages: 0 Bronze, 1 Iron, 2 Classical, 3 Medieval, 4 Powder. fit(s) scores a realm (s.rel: times
 * the median realm's size, s.rank, s.coast: share of its land on the sea, s.navy in ships, s.heir:
 * a realm broken off another within 80 years, its kind in s.family and its traits); the generic
 * type of each age scores 1, a kind's own form about 2, empires and successors 3 and up. */
const SEAFOLK = ["maritime", "citystate"];
function great(s) { return s.rel >= 3 && s.rank <= 4; }
const REALM_TYPES = [
  /* every age: the heirs of a broken realm */
  { id: "successor-state", name: "Successor State", ages: [0, 4], army: 0.9,
    fit: function (s) { return s.heir && s.stability >= 0.35 ? 3.6 : 0; } },
  { id: "warlord-state", name: "Warlord State", ages: [0, 4], army: 1.2, plunder: 1.6,
    fit: function (s) { return s.heir && s.stability < 0.35 ? 3.8 : 0; } },
  /* Bronze */
  { id: "chiefdom", name: "Chiefdom", ages: [0, 0], navy: 0.8, expansion: 1.15, fit: function () { return 1; } },
  { id: "city-state", name: "City-State", ages: [0, 0], navy: 1.3, expansion: 0.8,
    fit: function (s) { return SEAFOLK.indexOf(s.family) >= 0 ? 2.2 : s.regions <= 8 && s.cities >= 1 ? 1.6 : 0; } },
  { id: "river-kingdom", name: "River Kingdom", ages: [0, 0], army: 1.1,
    fit: function (s) { return s.family === "riverkingdom" ? 2.2 : s.rel >= 1.5 ? 1.5 : 0; } },
  { id: "temple-state", name: "Temple State", ages: [0, 1], army: 0.9, shift: { piety: 0.03 },
    fit: function (s) { return s.family === "theocracy" ? 2.2 : s.piety > 0.65 ? 1.8 : 0; } },
  { id: "nomad-confederacy", name: "Nomad Confederacy", ages: [0, 1], army: 1.2, expansion: 1.3, plunder: 1.6,
    fit: function (s) { return s.family === "steppe" ? 3 : 0; } },
  { id: "great-kingdom", name: "Great Kingdom", ages: [0, 1], army: 1.15, expansion: 1.1, importance: 3,
    rise: "{N} had swallowed its neighbours one by one; no longer {aF} among equals, it was {aT}, and its ruler took the style of king of kings.",
    fit: function (s) { return great(s) ? 2.8 : 0; } },
  { id: "highland-confederacy", name: "Highland Confederacy", ages: [0, 2], army: 1.15, plunder: 1.3,
    fit: function (s) { return s.family === "hillclans" ? 2.2 : 0; } },
  /* Iron */
  { id: "kingdom", name: "Kingdom", ages: [0, 2], fit: function (s) { return s.age > 0 ? 1 : s.rel >= 1 ? 1.2 : 0; } },
  { id: "city-league", name: "City League", ages: [1, 1], navy: 1.3, expansion: 0.85,
    fit: function (s) { return SEAFOLK.indexOf(s.family) >= 0 ? 2.2 : s.cities >= 3 && s.rel < 1.2 ? 1.6 : 0; } },
  { id: "thalassocracy", name: "Thalassocracy", ages: [1, 2], navy: 1.5, army: 0.8, importance: 3,
    rise: "With more ships than any rival on its seas, {N} was by now less {aF} than {aT}, whose power lay in its harbours.",
    fit: function (s) { return s.coast >= 0.2 && s.navy >= 20 ? 2 + s.coast * 2 + (SEAFOLK.indexOf(s.family) >= 0 ? 0.5 : 0) : 0; } },
  { id: "satrapy-empire", name: "Satrapy Empire", ages: [1, 1], army: 1.15, expansion: 1.1, shift: { stability: 0.03 }, importance: 4,
    rise: "{N} had outgrown its old name of {F}: its provinces were now ruled by satraps who answered to a court that styled itself imperial.",
    fit: function (s) { return great(s) ? 3 : 0; } },
  /* Classical */
  { id: "republic", name: "Republic", ages: [2, 2], army: 0.9, navy: 1.1, shift: { stability: 0.02 },
    rise: "The assembly of {N} took the government from the crown; until then {aF}, it was now {aT}, and dated its years by its magistrates.",
    fit: function (s) { return SEAFOLK.indexOf(s.family) >= 0 ? 2.2 : s.stability > 0.55 && s.cunning > 0.55 && s.rel < 2 ? 1.8 : 0; } },
  { id: "hegemony", name: "Hegemony", ages: [2, 2], army: 1.1, expansion: 1.05,
    rise: "{N} now led a league of lesser states that paid it tribute and called it protection: {aF} no longer, it was {aT}.",
    fit: function (s) { return s.rel >= 1.8 && s.aggression > 0.5 ? 2.2 : 0; } },
  { id: "imperial-state", name: "Imperial State", ages: [2, 3], army: 1.2, expansion: 1.1, shift: { stability: 0.03 }, importance: 4,
    rise: "{N}, until then {aF}, was now an empire in all but the oldest of its titles, ruled through governors, roads and registers.",
    fit: function (s) { return great(s) ? 3 : 0; } },
  { id: "tribal-confederation", name: "Tribal Confederation", ages: [2, 2], army: 1.2, plunder: 1.5, expansion: 1.2,
    fit: function (s) { return s.family === "steppe" ? 2.6 : 0; } },
  /* Medieval */
  { id: "feudal-kingdom", name: "Feudal Kingdom", ages: [3, 3], army: 1.05, shift: { stability: -0.02 },
    rise: "The great lords of {N} now held their lands in return for service, and the realm, once {aF}, was {aT}.",
    fit: function () { return 1; } },
  { id: "caliphate", name: "Caliphate", ages: [3, 3], army: 1.1, expansion: 1.15, shift: { piety: 0.03 }, importance: 4,
    rise: "The ruler of {N} took the title of successor to the prophets, and the realm, until then {aF}, became {aT}.",
    fit: function (s) { return s.rel >= 2 && (s.family === "theocracy" ? 3.2 : s.piety > 0.6 ? 3 : 0); } },
  { id: "khanate", name: "Khanate", ages: [3, 4], army: 1.3, expansion: 1.2, plunder: 1.5, importance: 3,
    rise: "The clans of {N} raised their war-leader on a felt carpet as khan; {aF} no longer, it was {aT}.",
    fit: function (s) { return s.family === "steppe" ? 3 : 0; } },
  { id: "merchant-republic", name: "Merchant Republic", ages: [3, 3], navy: 1.6, army: 0.7,
    rise: "The great trading houses of {N} took the government into their counting-rooms; once {aF}, it was {aT}.",
    fit: function (s) { return SEAFOLK.indexOf(s.family) >= 0 && s.coast > 0.15 ? 2.5 : s.cunning > 0.65 && s.coast > 0.3 && s.rel < 1.5 ? 1.8 : 0; } },
  { id: "theocracy", name: "Theocracy", ages: [3, 4], army: 0.95, shift: { piety: 0.03 },
    fit: function (s) { return s.family === "theocracy" ? 2.2 : s.piety > 0.72 ? 1.8 : 0; } },
  { id: "principality", name: "Principality", ages: [3, 3], army: 0.9,
    fit: function (s) { return s.rel < 0.6 ? 1.6 : 0; } },
  /* Powder */
  { id: "absolute-monarchy", name: "Absolute Monarchy", ages: [4, 4], army: 1.1, shift: { stability: 0.03 },
    rise: "The crown of {N} gathered every power of the realm to itself, and the old {F} became {aT}.",
    fit: function () { return 1; } },
  { id: "colonial-empire", name: "Colonial Empire", ages: [4, 4], navy: 1.4, expansion: 1.1, importance: 4,
    rise: "The fleets of {N} carried its flag to shores its founders had never heard of; {aF} at home, it was {aT} abroad.",
    fit: function (s) { return s.coast >= 0.2 && s.navy >= 100 && s.rel >= 1 ? 3 : 0; } },
  { id: "gunpowder-empire", name: "Gunpowder Empire", ages: [4, 4], army: 1.25, expansion: 1.1, importance: 4,
    rise: "With cannon in its arsenals and governors in every province, {N}, until then {aF}, was {aT}.",
    fit: function (s) { return great(s) ? 3.1 : 0; } },
  { id: "constitutional-state", name: "Constitutional State", ages: [4, 4], army: 0.95, shift: { stability: 0.02 },
    rise: "{N} wrote its laws down and bound its rulers by them; once {aF}, it was {aT}.",
    fit: function (s) { return SEAFOLK.indexOf(s.family) >= 0 ? 2.2 : s.stability > 0.6 && s.curiosity > 0.55 ? 2 : 0; } },
];

function him2(f) { return gOf(f) === "f" ? "her" : "him"; }

AEON.registerPack({
  id: "historical",
  name: "The Mortal Age",
  icon: "🏛️",
  blurb: "Bronze to gunpowder: kings, plagues, treaties and ruins in a grounded, magic-free history.",
  scale: "planet",
  startYear: -3000,
  endYear: 1500,
  timeStep: 5,
  seedPolities: 16,
  eventsPerTick: 2,
  realmsAtStart: 50,
  realmsAtEnd: 10,

  yearLabel: yl,

  biomes: {
    barren:    { name: "Open Sea",         color: "#2d4a6b", habitability: 0 },
    ice:       { name: "Ice Waste",        color: "#e6eef5", habitability: 0.03 },
    tundra:    { name: "Frozen Steppe",    color: "#b8c4c8", habitability: 0.15 },
    taiga:     { name: "Boreal Forest",    color: "#3f6652", habitability: 0.38 },
    grassland: { name: "Plain",            color: "#a3b86a", habitability: 0.88 },
    forest:    { name: "Woodland",         color: "#4a7a45", habitability: 0.7 },
    jungle:    { name: "Fever Jungle",     color: "#2f6b3a", habitability: 0.42 },
    savanna:   { name: "Dry Grassland",    color: "#c4b36a", habitability: 0.6 },
    desert:    { name: "Desert",           color: "#d9c28a", habitability: 0.14 },
    mountain:  { name: "Highlands",        color: "#8a8478", habitability: 0.24 },
    swamp:     { name: "Fen",              color: "#5d7a63", habitability: 0.32 },
  },

  eras: [
    { id: "bronze",        name: "The Bronze Age",       from: -3000 },
    { id: "iron",          name: "The Iron Age",         from: -1200 },
    { id: "classical",     name: "The Classical Age",    from: -500 },
    { id: "lateantiquity", name: "Late Antiquity",       from: 300 },
    { id: "medieval",      name: "The Medieval Age",     from: 700 },
    { id: "powder",        name: "The Age of Powder",    from: 1300 },
  ],

  /* ages a realm advances through on its own (core.js advanceAge). `at` is learning, tech x
     years; each is the median realm's learning when that era begins, so the leaders get there
     centuries early and the laggards late. Late Antiquity is a period, not a level, so it is
     left out. */
  /* the artifact kinds that are buildings, standing where they were raised: the wonders */
  wonderKinds: ["wonder", "library"],

  ages: [
    { id: "bronze",    name: "The Bronze Age",    short: "Bronze",    at: 0 },
    { id: "iron",      name: "The Iron Age",      short: "Iron",      at: 940 },
    { id: "classical", name: "The Classical Age", short: "Classical", at: 1650 },
    { id: "medieval",  name: "The Medieval Age",  short: "Medieval",  at: 2800 },
    { id: "powder",    name: "The Age of Powder", short: "Powder",    at: 3400 },
  ],

  /* the money of the economy (core.js): a talent, about 26 kg of silver */
  currency: { one: "talent", many: "talents" },

  /* core.js joins a realm to a war (an ally's call to arms, a coalition): a war of the pack's own */
  joinWar: function (ctx, ally, enemy, extra) { startWar(ctx, ally, enemy, extra.cause || "an alliance", extra); },

  /* the resting level of two realms' relation, beyond core.js's own reasons: one faith warms them,
     rival faiths cool them */
  relationBase: function (w, a, b) {
    const h = w._hist, fa = h && h.faithOf[a.id], fb = h && h.faithOf[b.id];
    return fa != null && fa === fb ? 0.15 : fa != null && fb != null ? -0.05 : 0;
  },

  /* 0..1: how worn down a realm is by its wars, for core.js musterForces */
  warWeariness: function (w, p) { return w._hist ? (w._hist.fatigue[p.id] || 0) / 0.35 : 0; },
  realmTypes: REALM_TYPES,
  technologies: TECHNOLOGIES,

  archetypes: [
    { id: "citystate",    name: "City-State League",   army: 0.9, navy: 1.6, traitBias: { curiosity: 0.12, cunning: 0.1, stability: -0.05 }, blurb: "A cluster of walled towns, each jealous of the others and of the league that binds them." },
    { id: "riverkingdom", name: "River Kingdom",       army: 1,   navy: 0.6, traitBias: { stability: 0.2, piety: 0.15, aggression: -0.1 }, blurb: "A flood-plain state ruled by whoever can predict the river and keep the granaries." },
    { id: "steppe",       name: "Steppe Confederacy",  army: 2,   navy: 0.1, ground: ["grassland", "savanna", "desert"], traitBias: { aggression: 0.25, stability: -0.15, curiosity: -0.1 }, blurb: "Herding clans who are very good at war and very bad at agreeing about the next one." },
    { id: "maritime",     name: "Maritime Republic",   army: 0.6, navy: 3,   traitBias: { cunning: 0.2, curiosity: 0.1, aggression: -0.1 }, blurb: "Merchant houses, a magistrate elected for a year, and ships." },
    { id: "theocracy",    name: "Theocracy",           army: 1,   navy: 0.8, traitBias: { piety: 0.3, curiosity: -0.05 }, blurb: "A realm governed by the keepers of the shrine, the calendar and the granary." },
    { id: "hillclans",    name: "Hill Clans",          army: 1.4, navy: 0.3, ground: ["mountain"], traitBias: { aggression: 0.1, stability: -0.1, cunning: 0.05 }, blurb: "Highland lineages held together by feud, hospitality and a common dislike of taxes." },
    { id: "empire",       name: "Bureaucratic Empire", army: 1.2, navy: 1,   traitBias: { stability: 0.25, curiosity: 0.05, aggression: 0.1 }, blurb: "A realm of registers, roads and examinations, held together by paper and a standing army." },
    { id: "successor",    name: "Successor State",     army: 1.1, navy: 0.9, traitBias: { cunning: 0.15, stability: -0.05, aggression: 0.1 }, blurb: "The heirs, or claimed heirs, of an older order that no longer exists." },
  ],

  names: NAMES,
  events: EVENTS,

  flavor: {
    epitaphs: EPITAPHS,
    casusBelli: CASUS_BELLI,
    plagues: PLAGUES,
    omens: OMENS,
    causesOfDeath: CAUSES_OF_DEATH,
    treaties: TREATIES,
    feudCauses: FEUD_CAUSES,
  },
});

})();
