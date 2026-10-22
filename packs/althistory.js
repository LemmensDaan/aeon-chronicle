/* What If - an alternate-history pack for Aeon.
   One small accident early in the run (the "point of divergence") is recorded in the
   chronicle with the tag "divergence"; later events find it by tag and cite it. */
(function () {
"use strict";

/* ===================================================================== */
/* 1. Utilities                                                           */
/* ===================================================================== */

const ERA_ORDER = ["sail", "powder", "mechanical", "steam", "electric", "atomic", "late"];
const EMPTY = [];

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function num(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function alive(p) { return !!p && p.ended == null; }
function hash(s) {
  let h = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function fill(tpl, map) {
  return tpl.replace(/\{(\w+)\}/g, function (m, k) { return map[k] != null ? map[k] : m; });
}
function joinList(a) {
  if (a.length === 0) return "nobody";
  if (a.length === 1) return a[0];
  if (a.length === 2) return a[0] + " and " + a[1];
  return a.slice(0, -1).join(", ") + ", and " + a[a.length - 1];
}
function eraIdx(id) { return ERA_ORDER.indexOf(id); }
function livePolities(world) {
  const out = [];
  for (const k in world.polities) { const p = world.polities[k]; if (alive(p)) out.push(p); }
  return out;
}
function scale(p, key, f, max) {
  const v = (p[key] || 0) * f;
  p[key] = Math.max(0, Math.min(max == null ? 1e15 : max, v));
}
function nudge(p, key, d) { p.traits[key] = clamp((p.traits[key] || 0) + d, 0, 1); }
function tech(p, d) { p.tech = clamp((p.tech || 0) + d, 0, 1); }
function setRel(a, b, v) { a.relations[b.id] = v; b.relations[a.id] = v; }
function shiftRel(a, b, d) {
  const v = clamp((a.relations[b.id] || 0) + d, -1, 1);
  a.relations[b.id] = v; b.relations[a.id] = v;
}
function rulerOf(world, p) { return p && p.ruler != null ? world.figures[p.ruler] || null : null; }
function capName(world, p) {
  const r = world.regions[p.capital];
  if (!r) return p.name;
  return (r.settlement && r.settlement.name) || r.name || p.name;
}
function regName(ctx, reg, p) {
  if (!reg.name) reg.name = N.place(ctx.rng, { world: ctx.world, polity: p || null, region: reg });
  return reg.name;
}
function polRegions(world, p) {
  const out = [];
  for (let i = 0; i < p.regions.length; i++) { const r = world.regions[p.regions[i]]; if (r) out.push(r); }
  return out;
}
function borderRegion(ctx, loser, winner) {
  const w = ctx.world, regs = polRegions(w, loser), edge = [], any = [];
  for (let i = 0; i < regs.length; i++) {
    const r = regs[i];
    if (r.id === loser.capital) continue;
    any.push(r);
    for (let j = 0; j < r.neighbors.length; j++) {
      const nb = w.regions[r.neighbors[j]];
      if (nb && nb.owner === winner.id) { edge.push(r); break; }
    }
  }
  if (edge.length) return ctx.pick(edge);
  return any.length ? ctx.pick(any) : null;
}
function unowned(world) {
  const out = [];
  for (let i = 0; i < world.regions.length; i++) {
    const r = world.regions[i];
    if (!r.barren && r.owner == null) out.push(r);
  }
  return out;
}
function otherPolities(ctx, p, pred) {
  const nb = ctx.neighbors(p).filter(function (q) { return alive(q) && q.id !== p.id && (!pred || pred(q)); });
  if (nb.length) return nb;
  return livePolities(ctx.world).filter(function (q) { return q.id !== p.id && (!pred || pred(q)); });
}
function styled(world, p) {
  const f = rulerOf(world, p);
  if (!f) return "the government of " + p.name;
  return (f.title ? f.title + " " : "") + f.name;
}
/* Install a successor (or first) ruler for a polity. */
function crown(ctx, p, role, title) {
  const f = ctx.newFigure(p, role || "ruler");
  f.title = title || archTitle(p);
  f.born = ctx.year - ctx.int(18, 45);
  p.ruler = f.id;
  if (p.rulers.indexOf(f.id) < 0) p.rulers.push(f.id);
  return f;
}

/* ---- chronicle index: incremental, so tests stay cheap ---- */
let CACHE = { world: null, n: 0, tags: {}, types: {}, div: null };
function index(world) {
  const c = world.chronicle;
  if (CACHE.world !== world || CACHE.n > c.length) CACHE = { world: world, n: 0, tags: {}, types: {}, div: null };
  for (; CACHE.n < c.length; CACHE.n++) {
    const e = c[CACHE.n], tg = e.tags || EMPTY;
    for (let i = 0; i < tg.length; i++) (CACHE.tags[tg[i]] || (CACHE.tags[tg[i]] = [])).push(e);
    (CACHE.types[e.type] || (CACHE.types[e.type] = [])).push(e);
  }
  return CACHE;
}
function withTag(world, tag) { return index(world).tags[tag] || EMPTY; }
function firstTag(world, tag) { const a = withTag(world, tag); return a.length ? a[0] : null; }
function lastTag(world, tag) { const a = withTag(world, tag); return a.length ? a[a.length - 1] : null; }
function tagv(ev, prefix) {
  const tg = ev.tags || EMPTY;
  for (let i = 0; i < tg.length; i++) if (tg[i].indexOf(prefix) === 0) return tg[i].slice(prefix.length);
  return null;
}
function tagvAll(ev, prefix) {
  const out = [], tg = ev.tags || EMPTY;
  for (let i = 0; i < tg.length; i++) if (tg[i].indexOf(prefix) === 0) out.push(tg[i].slice(prefix.length));
  return out;
}
function hasTech(world, name) { return withTag(world, "tech:" + name).length > 0; }
function actorOf(ev, kind, nth) {
  let k = 0;
  for (let i = 0; i < ev.actors.length; i++) {
    if (ev.actors[i].kind === kind) { if (k === (nth || 0)) return ev.actors[i].id; k++; }
  }
  return null;
}
function involves(ev, polityId) {
  for (let j = 0; j < ev.actors.length; j++) if (ev.actors[j].kind === "polity" && ev.actors[j].id === polityId) return true;
  return false;
}
/* most recent tagged event within `within` years (optionally involving a polity) */
function recent(world, tag, year, within, polityId) {
  const a = withTag(world, tag);
  for (let i = a.length - 1; i >= 0; i--) {
    const e = a[i];
    if (year - e.year > within) break;
    if (polityId == null || involves(e, polityId)) return e;
  }
  return null;
}
function evAbout(world, tag, polityId) {
  const a = withTag(world, tag);
  for (let i = a.length - 1; i >= 0; i--) if (involves(a[i], polityId)) return a[i];
  return null;
}
function borderTags(treaty, fromId, toId, regId) {
  return ["border-change", "treaty:" + treaty, "from:" + fromId, "to:" + toId, "reg:" + regId, "bc:" + treaty + "|" + fromId + "|" + toId + "|" + regId];
}

/* ===================================================================== */
/* 2. Names: culture families                                             */
/* ===================================================================== */

function syl(rng, a, b) { return rng.pick(a) + rng.pick(b); }

const EPITHETS = ["the Prudent", "the Cautious", "the Fortunate", "the Pious", "the Magnificent", "the Younger",
  "the Stammerer", "the Patient", "the Builder", "the Unready", "the Careful", "the Lawgiver", "the Mild",
  "the Thrifty", "the Reluctant", "the Learned", "the Gouty", "the Debtor", "the Bald", "the Restorer"];

const CULTURES = {
  romance: {
    band: 0, adjFull: false, order: "west", monarch: "King",
    stems: ["Cast", "Ar", "Mont", "Vel", "Lus", "Sard", "Tess", "Alv", "Corv", "Bel", "Ost", "Mar", "Gal", "Nav", "Ter", "Val", "Pic", "Lor"],
    suf: [["ia", "ine"], ["ona", "onese"], ["ara", "aran"], ["ena", "enese"], ["onia", "onian"], ["aria", "arine"]],
    male: ["Alfonso", "Ramiro", "Henrique", "Fernando", "Sancho", "Duarte", "Afonso", "Rodrigo", "Manuel", "Gaspar", "Lorenzo", "Cosimo", "Ercole", "Tiago", "Bernardo", "Vasco"],
    female: ["Isabel", "Beatriz", "Leonor", "Ines", "Teresa", "Joana", "Catalina", "Violante", "Matilde", "Giulia", "Ottavia", "Lucrezia"],
    famA: ["Mon", "Cas", "Ver", "Sal", "Pal", "Cor", "Ben", "Gal", "Ort", "Quin", "Zam", "Lar"],
    famB: ["tero", "tillo", "dano", "vedo", "ales", "rano", "sana", "mendi", "reda", "ndez"],
    townA: ["Villa", "San", "Santa", "Puerto", "Monte", "Castel", "Ponte", "Torre", "Rio", "Val", "Porto", "Fonte"],
    townB: ["Nova", "Clara", "Brava", "Real", "Seca", "Verde", "Mayor", "Ferrara", "Aguda", "Blanca", "Rocha", "Alta"],
    spaced: true,
    dynA: ["Tess", "Aviz", "Corv", "Sant", "Mend", "Ferr", "Bar", "Alb"], dynB: ["ardi", "ini", "anca", "ada", "eri", "oza"], dynFmt: "the House of {x}"
  },
  germanic: {
    band: 1, adjFull: true, order: "west", monarch: "Duke",
    stems: ["Hol", "Bran", "Sax", "Fries", "Thur", "Hess", "Wend", "Eld", "Mark", "Ober", "Nord", "Rhen", "Lauen", "Alt", "Gott", "Kar"],
    suf: [["land", "ish"], ["mark", "ish"], ["burg", "er"], ["stein", "er"], ["gau", "ish"], ["hold", "ish"], ["furt", "er"], ["wald", "ish"]],
    male: ["Albrecht", "Friedrich", "Maximilian", "Ludwig", "Wilhelm", "Gustav", "Johann", "Konrad", "Ernst", "Heinrich", "Otto", "Sigismund", "Leopold", "Matthias"],
    female: ["Margarete", "Elisabeth", "Ursula", "Anna", "Sophia", "Katharina", "Dorothea", "Adelheid", "Brigitte", "Magdalena"],
    famA: ["Wolf", "Eisen", "Stein", "Falken", "Berg", "Linden", "Rosen", "Ham", "Hoh", "Brand"],
    famB: ["berger", "mann", "feld", "hauer", "stedt", "ner", "ler", "bach"],
    townA: ["Ober", "Nieder", "Alt", "Neu", "Hohen", "Stein", "Rothen", "Wolfen", "Linden", "Eisen", "Falken", "Gruen", "Born", "Wald"],
    townB: ["burg", "furt", "heim", "stadt", "dorf", "bach", "bruck", "berg", "hausen", "munster"],
    dynA: ["Wolfen", "Habs", "Wetten", "Zoll", "Eisen", "Hohen", "Falken", "Rosen"], dynB: ["burg", "ung", "stein", "enau", "bach"], dynFmt: "the House of {x}"
  },
  slavic: {
    band: 2, adjFull: false, order: "west", monarch: "King",
    stems: ["Pol", "Mor", "Bohr", "Vel", "Zar", "Lit", "Rus", "Dra", "Kras", "Sver", "Vyst", "Gran", "Zhel", "Mir"],
    suf: [["ova", "ovan"], ["ia", "ian"], ["nia", "nian"], ["avia", "avian"], ["ovia", "ovian"], ["grad", "grader"]],
    male: ["Vladislav", "Stanislav", "Bogdan", "Casimir", "Dragomir", "Svatopluk", "Boleslav", "Mirko", "Radomir", "Jaromir", "Zbigniew", "Przemysl"],
    female: ["Zofia", "Jadwiga", "Milica", "Anastasia", "Ludmila", "Vera", "Katarina", "Ilona", "Dobrava"],
    famA: ["Dub", "Bor", "Kam", "Zel", "Star", "Nov", "Kras", "Vysh"],
    famB: ["ovic", "ovsky", "enko", "ski", "ak", "ek"],
    townA: ["Nov", "Star", "Bel", "Cher", "Kras", "Zlat", "Vysh", "Dub", "Bor", "Pod", "Zel", "Kam"],
    townB: ["grad", "ov", "sk", "ice", "pol", "gorod", "ets"],
    dynA: ["Dub", "Piast", "Vlad", "Jagi", "Zlat", "Bor", "Mir"], dynB: ["ovic", "iello", "avid", "ovich"], dynFmt: "the House of {x}"
  },
  nearEast: {
    band: 3, adjFull: true, order: "west", monarch: "Shah",
    stems: ["Kar", "Ak", "Sel", "Qiz", "Bay", "Tur", "Hor", "Shir", "Zand", "Aq", "Mar", "Hamid", "Dul", "Qara"],
    suf: [["istan", "i"], ["abad", "i"], ["an", "i"], ["shahr", "i"], ["ar", "i"]],
    male: ["Mehmed", "Suleyman", "Ismail", "Tahmasp", "Selim", "Abbas", "Murad", "Bayezid", "Nadir", "Hasan", "Rustem", "Kemal", "Orhan", "Davud"],
    female: ["Hurrem", "Safiye", "Mihrimah", "Gulbahar", "Zeynep", "Ayse", "Dilara", "Nurbanu", "Kosem"],
    famTail: ["Pasha", "Bey", "Agha", "Mirza", "Khan", "Effendi"],
    townA: ["Kara", "Yeni", "Ak", "Sari", "Eski", "Kizil", "Dar", "Bagh", "Shir", "Mar", "Hisar"],
    townB: ["hisar", "kale", "abad", "pazar", "shehir", "ova", "kent", "bagh"],
    dynA: ["Aq", "Kara", "Seld", "Zand", "Hamid", "Safav", "Tur"], dynB: ["id", "oglu", "ari", "yun"], dynFmt: "the {x} dynasty"
  },
  southAsia: {
    band: 4, adjFull: true, order: "west", monarch: "Maharaja",
    stems: ["Vij", "Mal", "Kal", "Gond", "Chol", "Ahom", "Raj", "Mysor", "Mar", "Bund", "Sind", "Kamr", "Utk", "Sur"],
    suf: [["pura", "i"], ["nagar", "i"], ["kal", "i"], ["desh", "i"], ["wadi", "i"], ["garh", "i"], ["pur", "i"]],
    male: ["Krishnadeva", "Shivaji", "Akbar", "Rajendra", "Harihara", "Narasimha", "Madhava", "Bhoja", "Pratap", "Devaraya", "Jayasimha", "Ramachandra"],
    female: ["Rani", "Mirabai", "Jahanara", "Lakshmi", "Padmini", "Gauri", "Ahalya", "Kalyani", "Savitri"],
    famTail: ["Rao", "Singh", "Nayak", "Varma", "Deva", "Gowda", "Pillai", "Raya"],
    townA: ["Sri", "Maha", "Nava", "Hari", "Kashi", "Ranga", "Deva", "Bhima", "Chandra", "Surya", "Gopal"],
    townB: ["pur", "nagar", "pattanam", "kot", "garh", "wada", "palli", "puram"],
    dynA: ["Sura", "Chola", "Kaka", "Hoysa", "Vaka", "Pala", "Rastra", "Gaha"], dynB: ["kuta", "vamsa", "la", "tiya"], dynFmt: "the {x} dynasty"
  },
  sinic: {
    band: 5, adjFull: true, order: "east", monarch: "Emperor",
    stems: ["Dai", "Yan", "Min", "Zhen", "Han", "Lu", "Shu", "Jin", "Qi", "Wei", "Yue", "Chu"],
    suf: [["yue", ""], ["guo", ""], ["shu", ""], ["an", ""], ["ning", ""], ["hai", ""], ["chang", ""]],
    male: ["Mingtai", "Wenhao", "Jianyun", "Zhihui", "Baorong", "Taixuan", "Yihao", "Wenming", "Hongyun", "Zhirong"],
    female: ["Meihui", "Xiurong", "Yunhui", "Baoyi", "Lanxuan", "Suyun"],
    fam: ["Zhu", "Li", "Wang", "Chen", "Lin", "Xu", "Hu", "Song", "Gao", "Zheng"],
    townA: ["Jiang", "Qing", "Bei", "Nan", "Dong", "Xi", "Fu", "Ping", "Chang", "Yun", "Long", "Tai"],
    townB: ["zhou", "jing", "cheng", "kou", "hai", "shan", "an", "fu"],
    dynA: ["Zhen", "Yong", "Tai", "Jia", "Hong", "Wan", "Chong"], dynB: ["ning", "yuan", "le", "sheng"], dynFmt: "the {x} dynasty"
  },
  japonic: {
    band: 6, adjFull: true, order: "east", monarch: "Emperor",
    stems: ["Aki", "Sato", "Take", "Hira", "Mori", "Naka", "Kita", "Ozu", "Fuji", "Tama", "Kuro", "Shira"],
    suf: [["shima", ""], ["no", ""], ["hama", ""], ["yama", ""], ["ura", ""], ["zaki", ""], ["kawa", ""]],
    male: ["Ieyasu", "Hideyori", "Nobuhide", "Tsunayoshi", "Yoshimune", "Takauji", "Mitsuhide", "Toshiie", "Katsuyori", "Nagamasa", "Sadamune", "Shingen", "Motonari", "Kagetora"],
    female: ["Masako", "Akiko", "Chiyo", "Hanako", "Tomoe", "Sumire"],
    famA: ["Hase", "Take", "Mori", "Hira", "Kuro", "Naga", "Shima", "Ota", "Kita"],
    famB: ["gawa", "da", "mura", "bayashi", "moto", "hara", "saki", "numa"],
    townA: ["Kita", "Minami", "Higashi", "Nishi", "Oo", "Shiro", "Aka", "Ao", "Sakura", "Matsu", "Kuma"],
    townB: ["machi", "jima", "saka", "gawa", "minato", "yama", "bara"],
    dynA: ["Hase", "Take", "Naga", "Hira", "Shima", "Ota", "Ashi"], dynB: ["gawa", "da", "moto", "kaga", "saki"], dynFmt: "the {x} house"
  }
};
const CULTURE_IDS = Object.keys(CULTURES).sort(function (a, b) { return CULTURES[a].band - CULTURES[b].band; });

const NAME_CULT = {};   // polity name -> culture id, filled when polities are named
let FORCE_CULTURE = null;  // set briefly while spawning a polity that should share its parent's culture
const ARCH_NAME = {};      // archetype id -> display name, filled at registration
function setArch(p, id) { p.archetypeId = id; p.archetypeName = ARCH_NAME[id] || id; }
const PPU = 40;            // persons per engine population unit, used only in stated figures
function people(units) { return num(units * PPU); }
function cultureOf(p) {
  if (!p) return "romance";
  if (p.culture && CULTURES[p.culture]) return p.culture;
  if (p.name && NAME_CULT[p.name]) return NAME_CULT[p.name];
  return CULTURE_IDS[hash(p.name || "x") % CULTURE_IDS.length];
}
function setCulture(p, c) { p.culture = c; NAME_CULT[p.name] = c; }
function cultureAt(ctx, rng) {
  if (ctx && ctx.polity) return cultureOf(ctx.polity);
  if (ctx && ctx.region && ctx.region.owner != null && ctx.world && ctx.world.polities[ctx.region.owner]) return cultureOf(ctx.world.polities[ctx.region.owner]);
  if (ctx && ctx.region && ctx.world && ctx.world.width) {
    let b = Math.floor(ctx.region.x / ctx.world.width * CULTURE_IDS.length);
    if (rng.chance(0.3)) b += rng.pick([-1, 1]);
    return CULTURE_IDS[clamp(b, 0, CULTURE_IDS.length - 1)];
  }
  return rng.pick(CULTURE_IDS);
}

function townIn(rng, cid) {
  const c = CULTURES[cid] || CULTURES.romance;
  return c.spaced ? rng.pick(c.townA) + " " + rng.pick(c.townB) : syl(rng, c.townA, c.townB);
}
function townOf(rng, p) { return townIn(rng, cultureOf(p)); }
function familyIn(rng, cid) {
  const c = CULTURES[cid];
  if (c.fam) return rng.pick(c.fam);
  if (c.famTail) return rng.pick(c.famTail);
  return syl(rng, c.famA, c.famB);
}
function personIn(rng, cid, female) {
  const c = CULTURES[cid];
  const given = rng.pick(female ? c.female : c.male);
  if (c.order === "east") return familyIn(rng, cid) + " " + given;
  if (cid === "nearEast" || cid === "southAsia") return given + " " + familyIn(rng, cid);
  const r = rng.next();
  if (r < 0.4) return given + " " + rng.pick(EPITHETS);
  if (r < 0.75) return given + " " + familyIn(rng, cid);
  return given + " of " + townIn(rng, cid);
}
function dynastyIn(rng, cid) {
  const c = CULTURES[cid] || CULTURES.romance;
  return fill(c.dynFmt, { x: syl(rng, c.dynA, c.dynB) });
}
function polityIn(rng, cid) {
  const c = CULTURES[cid];
  const stem = rng.pick(c.stems), s = rng.pick(c.suf);
  const name = stem + s[0];
  return { name: name, adjective: (c.adjFull ? name : stem) + s[1], culture: cid };
}
function treatyName(rng, cid) { return "Treaty of " + townIn(rng, cid); }
function congressName(rng, cid) { return "Congress of " + townIn(rng, cid); }

const TRADES = ["Spice", "Fur", "Silk", "Pepper", "Indigo", "Sugar", "Salt", "Whale-Oil", "Tea", "Cinnabar", "Cinnamon", "Saltpetre", "Cod", "Ivory", "Cotton", "Rubber"];
function companyName(rng, place) {
  const t = rng.pick(TRADES);
  return rng.pick([
    "The Honourable " + place + " " + t + " Company",
    "The United " + t + " Company of " + place,
    "The " + place + " Adventurers' Company",
    "The Chartered " + place + " and " + rng.pick(TRADES) + " Society",
    "The Company of Merchants Trading to " + place
  ]);
}
const SHIPS = {
  romance: ["Santa Clara", "Estrela do Mar", "La Fortunada", "San Gabriel", "Boa Viagem", "Vitoria", "Nao da Esperanca", "Santa Ines"],
  germanic: ["Adler", "Schwarzer Falke", "Goldene Hoffnung", "Windsbraut", "Meerfrau", "Eiserne Treue", "Sankt Michael", "Nordstern"],
  slavic: ["Zhar-Ptitsa", "Sviatoi Nikolai", "Orel", "Volna", "Zvezda Severa", "Bogatyr", "Lebed", "Sokol"],
  nearEast: ["Mansur", "Bahr-i Safid", "Zafer", "Gulsah", "Sahin", "Kaptan-i Derya", "Fetih", "Nasreddin"],
  southAsia: ["Jaladurga", "Ganga Lahari", "Sagara Kanya", "Vijaya", "Nauka Raja", "Lakshmi Prabha", "Samudra", "Chandrika"],
  sinic: ["Treasure Pearl", "Eastern Dawn", "Calm Sea", "Jade Dragon", "Peaceful Harvest", "Rising Tide", "Southern Crane", "Golden Carp"],
  japonic: ["Nippon Maru", "Daiichi Seiko Maru", "Hayabusa Maru", "Kaiten Maru", "Sakura Maru", "Tsurugi Maru", "Kotobuki Maru", "Shirasagi Maru"]
};
function shipIn(rng, cid) { return rng.pick(SHIPS[cid] || SHIPS.romance); }
function shipOf(rng, p) { return shipIn(rng, cultureOf(p)); }

/* The pack-facing name generators (all take rng first). */
const N = {
  polity: function (rng, ctx) {
    const cid = FORCE_CULTURE || cultureAt(ctx, rng);
    const o = polityIn(rng, cid);
    NAME_CULT[o.name] = cid;
    return o;
  },
  figure: function (rng, ctx) {
    const nm = personIn(rng, cultureAt(ctx, rng), false), role = ctx && ctx.role;
    let title;
    if (!role || role === "ruler") title = ctx && ctx.polity ? archTitle(ctx.polity) : "Ruler";
    else title = cap(role);
    return { name: nm, title: title };
  },
  place: function (rng, ctx) { return townIn(rng, cultureAt(ctx, rng)); },
  settlement: function (rng, ctx) { return townIn(rng, cultureAt(ctx, rng)); },
  artifact: function (rng, ctx) {
    const t = townIn(rng, cultureAt(ctx, rng));
    return rng.pick([
      "The " + t + " Memorandum", "The Orrery of " + t, "The " + t + " Charter", "The Great Atlas of " + t,
      "The Ledger of " + t, "The " + t + " Press Bible", "The Astrolabe of " + t, "The " + t + " Concordat",
      "The Standard of " + t, "The Salt Roll of " + t
    ]);
  },
  dynasty: function (rng, ctx) { return dynastyIn(rng, cultureAt(ctx, rng)); },
  treaty: function (rng, ctx) { return treatyName(rng, cultureAt(ctx, rng)); },
  company: function (rng, ctx) { return companyName(rng, townIn(rng, cultureAt(ctx, rng))); },
  ship: function (rng, ctx) { return shipIn(rng, cultureAt(ctx, rng)); },
  town: function (rng, ctx) { return townIn(rng, cultureAt(ctx, rng)); }
};

function archTitle(p) {
  switch (p.archetypeId) {
    case "composite_monarchy": case "elective_kingdom": return CULTURES[cultureOf(p)].monarch;
    case "maritime_republic": return "Doge";
    case "chartered_company": return "Governor-General";
    case "confederation": return "Lord President";
    case "sultanate": return "Sultan";
    case "shogunate": return "Shogun";
    case "merchant_league": return "Syndic";
    case "revolutionary_republic": return "First Citizen";
    case "colonial_dominion": return "Governor-General";
    case "autocratic_empire": return "Emperor";
    default: return "Chief Magistrate";
  }
}

/* ===================================================================== */
/* 3. Flavour pools                                                       */
/* ===================================================================== */

const CASUS_BELLI = [
  "an unpaid dowry", "the violation of a fishing treaty", "an insult delivered to an ambassador at a christening",
  "the harbouring of a pretender", "a disputed tithe of salt", "the arrest of a consul on a charge of smuggling",
  "the desecration of a border shrine", "a customs line drawn eleven miles too far inland",
  "a precedence dispute at a funeral", "the seizure of a grain fleet", "an unanswered letter of some length",
  "a debt on a wedding that never took place", "the sinking of a packet-boat by a ship of uncertain flag",
  "the alleged poisoning of a cousin", "a mine whose seam was found to cross a frontier",
  "the clipping of the coinage by a neighbour", "a quarrel over which prince should be addressed as Serene",
  "the claim of an ancient charter that nobody could locate", "the refusal of a salute at sea",
  "the dismissal of a court physician", "a rebellion fed, as was alleged, from across the river",
  "a pilgrim road closed to foreign pilgrims", "the arrest of surveyors who had been measuring the wrong hill",
  "the theft of a relic by persons unknown and well-connected", "a plot to marry a princess to the wrong cousin"
];
const SLOGANS = [
  "Bread, and the Assembly", "No Tithe Without a Vote", "The Crown Is a Contract", "Liberty, Weights, and Measures",
  "A Plough for Every Hand", "Down with the Salt Tax", "The Nation Is Awake", "Let the Guilds Speak",
  "One Law, One Measure, One People", "The Land to Those Who Till It", "Neither Altar Nor Throne",
  "Eight Hours of Work, Eight of Rest", "The Engine Belongs to Everyone", "Peace, Land, and Postage",
  "We Were Promised a Constitution", "The Treasury Is Empty and So Are We", "Reason Is Not a Foreign Doctrine",
  "No Taxation Without a Newspaper", "The Harvest Is Ours", "A Vote for Every Household"
];
const HEADLINES = [
  "{p} MOBILISES; {q} CALLS IT PROVOCATION", "GRAIN PRICE DOUBLES IN {p}; MINISTER CITES WEATHER",
  "TREATY WITH {q} WAS SECRET, SAYS OPPOSITION; GOVERNMENT SAYS IT WAS MERELY PRIVATE",
  "{p} AMBASSADOR RECALLED FROM {q} FOR CONSULTATIONS", "FIFTEEN KILLED AS TROOPS FIRE ON CROWD IN {p}",
  "THE WAR WILL BE OVER BY HARVEST, SAYS {p} STAFF", "{q} FLEET SEEN OFF THE COAST; ADMIRALTY CALLS IT A COINCIDENCE",
  "BANK OF {p} SUSPENDS PAYMENTS", "NEW MACHINE REPLACES FORTY WEAVERS IN {p}", "{q} BORDER TOWN RENAMED BY DECREE",
  "STRIKE SPREADS TO ALL PORTS OF {p}", "{p} AND {q} AGREE TO DISAGREE, AT LENGTH", "RULER OF {p} ILL; DOCTORS DIVIDED",
  "EMIGRANT SHIPS LEAVE {p} FULL FOR THIRD WEEK", "ELECTION IN {p}: THE ANSWER TO A DIFFERENT QUESTION",
  "SPEECH IN {q} ASSEMBLY QUOTED OUT OF CONTEXT, THEN IN CONTEXT", "SECOND-CLASS PASSENGERS REVOLT ON {p} MAIL STEAMER",
  "CENSUS OF {p} FINDS FOUR MILLION MORE PEOPLE THAN THE TREASURY WAS TAXING",
  "{p} SAYS IT WANTS NOTHING MORE THAN WHAT WAS ALWAYS ITS OWN", "GENERAL STAFF OF {q} DENIES PLANS IT DOES HAVE"
];
const LAST_WORDS = [
  "Tell the treasurer the accounts are not as I left them.", "I had hoped to see the bridge finished.",
  "Open the window; the guns are still firing and I would like to know who is winning.",
  "Do not let them bury me in the cathedral. It is damp.", "Have the physicians been paid? Then let them stay.",
  "I forgive my brother, in writing, and with witnesses.", "It was the weather. It has always been the weather.",
  "Somebody fetch the confessor, and somebody else fetch the lawyer.", "The treaty is sound. The treaty was always sound.",
  "Who is going to explain this to the Estates?", "I am not afraid. I am merely overdrawn.",
  "Put the heir in the next room and keep him away from the Chancellor.", "Tell the admiral I was wrong about the shoals.",
  "Let it be recorded that I did not sign under compulsion. Let it also be recorded that I was not asked twice.",
  "Take the map off the wall; it is upside down and has been for years.", "Is it morning? Then the telegram has not come.",
  "Why is it so loud? Oh. Yes. Of course.", "Do not name a square after me. Name a drain.",
  "I leave the realm to my son, and my debts to the realm.", "Tell them it was a good harvest.",
  "The clocks in this house have never agreed. Let them go on disagreeing.", "I would have liked one more winter.",
  "Send for the engineer. No, not the priest. The engineer.", "Let the record show that I read the whole memorandum.",
  "I was always told it would be over by now."
];
const TREATY_TOWNS = ["Aldenmoor", "Santa Ferrara", "Wolfsbrunn", "Karahisar", "Pont-Clair", "Nishigawa", "Vyshgrad", "Hallstead",
  "Montevera", "Ranganagar", "Eskishehir", "Brandfurt", "Kitamachi", "Zlatov", "Fonteclara", "Tessmouth", "Ostburg", "Sarihisar"];
const DYNASTIES = ["the House of Aldermark", "the Tessardi", "the House of Wolfenburg", "the Karaoglu", "the Zlatovic line",
  "the Hasegawa", "the Surakuta", "the Brandmark family", "the House of Corvini", "the Zhenning", "the Montaldi", "the House of Ferrand"];
const CONFESSIONS = ["Evangelical", "Reformed", "Brethren", "Covenanted", "Remonstrant", "Observant", "Congregational", "Moderate"];
const CREEDS = { romance: "Confession", germanic: "Confession", slavic: "Confession", nearEast: "Observance", southAsia: "Doctrine", sinic: "Doctrine", japonic: "Doctrine" };

/* ===================================================================== */
/* 4. Event table                                                         */
/* ===================================================================== */

const EVENTS = [];
function ev(def) { EVENTS.push(def); }

/* A shared conflict resolver: who wins, how many die, does a border move.
   Convention used by every war event: actors[0] is the winner, actors[1] the loser. */
function conflict(ctx, a, b, o) {
  const r = ctx.rng;
  const sa = (a.military + 0.1) * (0.7 + r.next() * 0.6) * (1 + a.tech);
  const sb = (b.military + 0.1) * (0.7 + r.next() * 0.6) * (1 + b.tech);
  const win = sa >= sb ? a : b, lose = win === a ? b : a;
  const deadUnits = (a.population + b.population) * o.frac * (0.7 + r.next() * 0.6);
  lose.population = Math.max(60, Math.round(lose.population - deadUnits * 0.6));
  win.population = Math.max(60, Math.round(win.population - deadUnits * 0.4));
  scale(win, "prestige", 1.08); scale(lose, "prestige", 0.88);
  nudge(lose, "stability", -0.05); nudge(win, "aggression", 0.02);
  setRel(a, b, o.rel == null ? -0.4 : o.rel);
  let reg = null;
  if (o.take !== false && lose.regions.length > 1) {
    reg = borderRegion(ctx, lose, win);
    if (reg) { regName(ctx, reg, lose); ctx.transfer(reg, win); }
  }
  return { win: win, lose: lose, dead: Math.round(deadUnits * PPU), reg: reg, treaty: treatyName(r, cultureOf(lose)) };
}
/* Detach a region into a new polity (a revolt, a partition, a secession). */
function breakaway(ctx, reg, archId, from, culture) {
  if (livePolities(ctx.world).length > 30) return null;
  const owner = reg.owner != null ? ctx.world.polities[reg.owner] : null;
  if (owner && (owner.regions.length < 2 || reg.id === owner.capital)) return null;
  const units = reg.population || 0;
  if (owner) ctx.transfer(reg, null);
  FORCE_CULTURE = culture || (from ? cultureOf(from) : null);
  let np = null;
  try { np = ctx.spawnPolity(reg, archId); } finally { FORCE_CULTURE = null; }
  if (!np) return null;
  np.tech = Math.max(np.tech, (from ? from.tech : owner ? owner.tech : 0.1) * 0.9);
  np.population = Math.max(np.population, Math.round(units));
  reg.population = Math.round(np.population * 0.6);
  if (owner) { owner.population = Math.max(60, owner.population - Math.round(units)); setRel(np, owner, -0.3); }
  return np;
}
function bcMoves(e) {
  const out = [], list = tagvAll(e, "bc:");
  for (let i = 0; i < list.length; i++) {
    const s = list[i].split("|");
    out.push({ treaty: s[0], from: s[1], to: s[2], reg: Number(s[3]), year: e.year, ev: e });
  }
  return out;
}

/* ===================================================================== */
/* 5. The point of divergence                                             */
/*    Stored as a chronicle entry tagged "divergence" (type               */
/*    "point-of-divergence", importance 5) with actors                    */
/*    [polity P, figure F, polity Q, artifact A] and tags                 */
/*    div:<kind>, town:<name>, thing:<text>. getDiv() finds it again.     */
/*    Each consequence is tagged "div-consequence", "lk:<key>" and        */
/*    "link:<label>" so later links can cite earlier links.               */
/* ===================================================================== */

const DIV = {
  fever: {
    role: "heir",
    artifact: function (d) { return "The Fever Roll of " + d.town; },
    make: function (d) {
      return "In " + d.year + ", " + d.F + ", the only surviving heir of " + d.dyn + " in " + d.P + ", was taken ill at " + d.town +
        " with a fever that the physicians gave three days. The court, which had already opened discreet correspondence with the cadet branch resident in " +
        d.Q + ", spent a week in private mourning and a second week in private embarrassment when the fever broke. " + d.F +
        " was nine years old and remembered none of it.";
    },
    cause: function (d) { return d.F + ", heir of " + d.P + ", survived the fever of " + d.year; },
    ifnot: function (d) { return "the crown of " + d.P + " would have passed to the cadet branch in " + d.Q; },
    short: function (d) { return "the unbroken line of " + d.P; },
    match: function (d) { return "the line of " + d.P + " was still in a condition to make marriages, and it made one with " + d.Q + ", whose own succession was uncertain"; },
    industry: function (d) { return "the long, uninterrupted reign of the line had left a treasury in order and a university unbroken, so that engineers were paid and listened to"; }
  },
  storm: {
    role: "admiral",
    artifact: function (d) { return "The Logbook of " + d.F; },
    make: function (d) {
      return "In " + d.year + ", a fleet of nine ships sailed under " + d.F + " to look for a western passage that the court of " + d.P +
        " privately doubted. Off Cape " + d.town + " a gale lasting nine days scattered it. Four ships were lost with all hands; the remainder, driven south and west, raised a coast that no chart in " +
        d.P + " showed, and that the pilots of " + d.Q + " had been quietly working towards for a decade. " + d.F +
        " wrote in the log that the landfall was entirely the weather's doing, an entry later copied into a good many school primers.";
    },
    cause: function (d) { return "the " + d.P + " fleet under " + d.F + " was scattered off Cape " + d.town + " in " + d.year; },
    ifnot: function (d) { return "the western coast would have been raised by the pilots of " + d.Q + " within a generation, and held by " + d.Q; },
    short: function (d) { return "the western landfall"; },
    match: function (d) { return d.P + " held a distant coast that " + d.Q + " wanted a share of, and bought peace with a marriage whose dowry was trading rights on it"; },
    industry: function (d) { return "the western coast supplied cotton, timber and a captive market at prices no rival could match"; }
  },
  treaty: {
    role: "envoy",
    artifact: function (d) { return "The Instrument of " + d.town; },
    make: function (d) {
      return "In " + d.year + ", " + d.P + " and " + d.Q + " concluded the Treaty of " + d.town + ", a full twelve months before their plenipotentiaries had expected to finish. The haste was accidental: " +
        d.F + ", the envoy of " + d.P + ", whose passage home was booked for the spring, simply declined to reopen the last clause. That clause, a mutual guarantee of each realm's succession, was thought to be of no importance, since neither ruler was ill.";
    },
    cause: function (d) { return "the Treaty of " + d.town + " was signed in " + d.year + ", a year before anyone intended, with its guarantee of succession intact"; },
    ifnot: function (d) { return "no guarantee would have been in force when the succession in " + d.Q + " fell due"; },
    short: function (d) { return "the guarantee of " + d.town; },
    match: function (d) { return "the guarantee of " + d.town + " had given " + d.P + " and " + d.Q + " a generation of habitual cooperation, which ripened into a marriage"; },
    industry: function (d) { return "the guarantee had kept the " + d.Q + " frontier quiet for a century, and the money not spent on fortresses went into canals"; }
  },
  inventor: {
    role: "inventor",
    artifact: function (d) { return "The Notebooks of " + d.F; },
    make: function (d) {
      return "In " + d.year + ", " + d.F + ", a journeyman of " + d.town + " in " + d.P + ", died of a lung fever at the age of twenty-three. For six years " + d.F +
        " had been working on " + d.thing + "; the drawings were sold with the effects, and a clerk used the best of them to line a trunk. Nobody in " +
        d.P + " knew enough to reconstruct the idea, and nobody in " + d.Q + " knew there was anything to reconstruct.";
    },
    cause: function (d) { return d.F + " of " + d.town + " died at twenty-three in " + d.year + ", and " + d.thing + " died with the drawings"; },
    ifnot: function (d) { return d.P + " would have had " + d.thing + " sixty years ahead of its neighbours"; },
    short: function (d) { return "the lost method of " + d.town; },
    match: function (d) { return d.P + ", no longer thought to be ahead in anything, was valued by " + d.Q + " chiefly as a market, and the marriage was negotiated on that basis"; },
    industry: function (d) { return "the method of " + d.town + " had to be bought, then copied, then reinvented, so that " + d.P + " imported its machines and its mechanics from " + d.Q + " for two generations"; }
  },
  quarantine: {
    role: "harbourmaster",
    artifact: function (d) { return "The Harbour Minute of " + d.town; },
    make: function (d) {
      return "In " + d.year + ", the carrack " + d.ship + " stood off " + d.town + " in " + d.P + " with a fever aboard and eleven of her crew in the hold. The harbour council, advised by " + d.F +
        ", the harbourmaster, that the ship should be admitted, voted by a single voice to turn her away. She sailed on to a port in " + d.Q + ", where the council voted the other way.";
    },
    cause: function (d) { return "the harbour council of " + d.town + " turned away the " + d.ship + " in " + d.year + " by a single vote"; },
    ifnot: function (d) { return "the pestilence would have entered by " + d.town + ", and the cities of " + d.P + " would have buried a third of their number"; },
    short: function (d) { return "the unburied cities of " + d.P; },
    match: function (d) { return "the cities of " + d.P + " were full and prosperous, and " + d.Q + ", whose own were not, sought a match"; },
    industry: function (d) { return "the great cities of " + d.P + " had kept their population through the plague years, and so had a labour market ready for the mills"; }
  }
};
const DIV_KINDS = Object.keys(DIV);
const THINGS = ["a method of casting type from a single matrix", "a self-regulating bellows for blast furnaces",
  "a screw-cutting lathe of unusual accuracy", "a firearm lock that struck its own sparks"];

function getDiv(world) {
  const c = index(world);
  if (c.div) return c.div;
  const evs = c.tags["divergence"];
  if (!evs || !evs.length) return null;
  const e = evs[0], kind = tagv(e, "div:"), K = DIV[kind];
  if (!K) return null;
  const p = world.polities[actorOf(e, "polity", 0)], q = world.polities[actorOf(e, "polity", 1)], f = world.figures[actorOf(e, "figure", 0)];
  const d = {
    ev: e, kind: kind, K: K, year: e.year, p: p, q: q, f: f,
    P: p ? p.name : "the realm", Q: q ? q.name : "its neighbour", F: f ? f.name : "the heir",
    town: tagv(e, "town:") || "the port", thing: tagv(e, "thing:") || "the method", ship: tagv(e, "ship:") || "carrack",
    dyn: tagv(e, "dyn:") || "the ruling house"
  };
  c.div = d;
  return d;
}
function lk(world, key) { const a = withTag(world, "lk:" + key); return a.length ? a[0] : null; }
function linkTags(key, label, extra) { return ["div-consequence", "lk:" + key, "link:" + label].concat(extra || []); }
function cite(e) { return tagv(e, "link:") + " of " + e.year; }
function links(world) { return withTag(world, "div-consequence"); }
function because(d) { return "Because " + d.K.cause(d); }

/* test builder for consequence events: divergence exists, its polity lives, within a window of years,
   with prerequisite and exclusion links */
function dtest(ctx, lo, hi, need, not) {
  const d = getDiv(ctx.world);
  if (!d || !alive(d.p)) return false;
  const dt = ctx.year - d.year;
  if (dt < lo || dt > hi) return false;
  if (need && !lk(ctx.world, need)) return false;
  if (not && lk(ctx.world, not)) return false;
  return true;
}
function qOf(ctx, d) {
  if (alive(d.q)) return d.q;
  const o = otherPolities(ctx, d.p);
  return o.length ? o[0] : null;
}

ev({
  id: "point-of-divergence", scope: "world", weight: 1000, minEra: "sail", maxEra: "sail", cooldown: 9999,
  test: function (ctx) {
    return ctx.year >= 1402 && !firstTag(ctx.world, "divergence") && livePolities(ctx.world).length >= 2;
  },
  run: function (ctx) {
    const w = ctx.world, r = ctx.rng;
    const pool = livePolities(w).filter(function (p) { return p.regions.length >= 1; });
    if (pool.length < 2) return null;
    const P = ctx.pick(pool);
    const Qs = otherPolities(ctx, P);
    if (!Qs.length) return null;
    const Q = ctx.pick(Qs);
    const kind = ctx.pick(DIV_KINDS), K = DIV[kind];
    const F = ctx.newFigure(P, K.role);
    const town = townOf(r, P);
    const d = {
      year: ctx.year, P: P.name, Q: Q.name, F: F.name, town: town, dyn: dynastyIn(r, cultureOf(P)),
      thing: ctx.pick(THINGS), ship: shipOf(r, P)
    };
    F.born = ctx.year - (kind === "inventor" ? 23 : kind === "fever" ? 9 : ctx.int(35, 55));
    if (kind === "fever") F.title = "Prince";
    let text = K.make(d);
    if (kind === "inventor") ctx.kill(F, "Died of a lung fever in " + d.town + " at twenty-three, leaving drawings that nobody could read.");
    if (kind === "treaty") setRel(P, Q, 0.5);
    if (kind === "storm") scale(P, "wealth", 0.95);
    if (kind === "fever") nudge(P, "stability", 0.05);
    const art = ctx.newArtifact({
      name: K.artifact(d), kind: "document", created: ctx.year, creator: F, region: w.regions[P.capital],
      power: 0.1, legend: "The record of the accident of " + ctx.year + " that historians of " + P.name + " later treated as the point at which the world divided. " + K.ifnot(d).replace(/^./, function (c) { return c.toUpperCase(); }) + "."
    });
    const reg = w.regions[P.capital];
    if (reg && reg.features && reg.features.indexOf("point-of-divergence") < 0) reg.features.push("point-of-divergence");
    const actors = [ctx.actor(P), ctx.actor(F), ctx.actor(Q)];
    if (art) actors.push(ctx.actor(art));
    return {
      importance: 5, regionId: P.capital, actors: actors, text: text,
      tags: ["divergence", "div:" + kind, "town:" + town, "thing:" + d.thing, "ship:" + d.ship, "dyn:" + d.dyn]
    };
  }
});

/* ---------- consequences of the divergence ---------- */

ev({
  id: "div-first-consequence", scope: "world", weight: 30, cooldown: 9999,
  test: function (ctx) { return dtest(ctx, 6, 90, null, "first"); },
  run: function (ctx) {
    const w = ctx.world, d = getDiv(w), P = d.p, Q = qOf(ctx, d), r = ctx.rng;
    if (!Q) return null;
    let text = because(d) + ", ";
    let regionId = P.capital;
    const actors = [ctx.actor(P), ctx.actor(Q)];
    if (d.kind === "fever") {
      const old = rulerOf(w, P);
      if (d.f && d.f.died == null) {
        if (old && old.id !== d.f.id && old.died == null) ctx.kill(old, ctx.pick(LAST_WORDS));
        d.f.title = archTitle(P); d.f.born = d.f.born || ctx.year - 20;
        P.ruler = d.f.id; if (P.rulers.indexOf(d.f.id) < 0) P.rulers.push(d.f.id);
        nudge(P, "stability", 0.1); scale(P, "prestige", 1.05);
        text += d.F + " acceded to the throne of " + P.name + " in " + ctx.year + " in the ordinary way, and not, as half the chancelleries of the continent had expected, as a name on a memorial. The councillors who had been preparing for the other outcome were dismissed within the month, and went to " + Q.name + ".";
        actors.push(ctx.actor(d.f));
      } else {
        nudge(P, "stability", 0.05);
        text += "the line of " + P.name + " had run on through " + d.F + "'s collaterals and was still the line the Estates knew when " + d.F + " died; the cadet branch in " + Q.name + " went on waiting, with diminishing conviction.";
      }
    } else if (d.kind === "storm") {
      const free = unowned(w);
      if (free.length) {
        const reg = ctx.pick(free);
        regName(ctx, reg, P);
        ctx.transfer(reg, P);
        ctx.foundSettlement(reg, 1);
        regionId = reg.id;
        actors.push(ctx.actor(reg));
        text += "the coast the survivors reached, afterwards called " + reg.name + ", was claimed for " + P.name + " and not for " + Q.name + ", whose pilots had been charting towards it. The first governor arrived in " + ctx.year + " with a commission, forty colonists, and no idea what grew there.";
      } else {
        scale(P, "wealth", 1.15);
        text += "the western landfall gave " + P.name + " a trading station that " + Q.name + " had planned to build itself, and the revenue began almost at once.";
      }
      shiftRel(P, Q, -0.2); scale(Q, "prestige", 0.95);
    } else if (d.kind === "treaty") {
      const old = rulerOf(w, Q);
      if (old && old.died == null) ctx.kill(old, ctx.pick(LAST_WORDS));
      const heir = crown(ctx, Q, "ruler");
      setRel(P, Q, 0.8); scale(P, "prestige", 1.06); nudge(Q, "stability", -0.05);
      actors.push(ctx.actor(heir));
      text += "it was in force when the ruler of " + Q.name + " died in " + ctx.year + ", and its guarantee bound the succession: " + heir.name + " took the crown with a " + P.name + " garrison in the capital, and every subsequent act of " + Q.name + "'s foreign policy was read in " + P.name + " first.";
    } else if (d.kind === "inventor") {
      tech(P, -0.03); tech(Q, 0.03); scale(P, "wealth", 0.95);
      text += "the workshops of " + P.name + " went on without " + d.thing + ", and in " + ctx.year + " a smith in " + Q.name + " worked out, independently and rather expensively, a method that was almost as good. " + Q.name + " took the patent; " + P.name + " took a licence.";
    } else {
      scale(Q, "population", 0.84); scale(Q, "wealth", 0.9); shiftRel(P, Q, -0.15);
      text += "the pestilence came ashore in " + Q.name + ", not " + P.name + ", and the dead of " + Q.name + "'s ports in the next three years were counted at about one in six. The physicians of " + P.name + " published a pamphlet claiming credit for the quarantine; the council of " + d.town + " published a rejoinder noting the vote.";
    }
    return { importance: 3, regionId: regionId, actors: actors, text: text, tags: ["div-consequence", "lk:first", "link:first consequence"] };
  }
});

ev({
  id: "div-dynastic-match", scope: "world", weight: 25, minEra: "sail", maxEra: "mechanical", cooldown: 9999,
  test: function (ctx) { return dtest(ctx, 18, 170, "first", "match"); },
  run: function (ctx) {
    const d = getDiv(ctx.world), P = d.p, Q = qOf(ctx, d);
    if (!Q) return null;
    shiftRel(P, Q, 0.4); scale(P, "prestige", 1.04); scale(Q, "prestige", 1.02);
    const bride = personIn(ctx.rng, cultureOf(Q), true);
    return {
      importance: 3, regionId: P.capital, actors: [ctx.actor(P), ctx.actor(Q)],
      text: because(d) + ", " + d.K.match(d) + ". In " + ctx.year + " " + styled(ctx.world, P) + " married " + bride + " of " + Q.name +
        ", and the marriage contract, which ran to ninety-one clauses, was the first document in the archives of " + P.name + " to mention the other realm without the word 'rival'.",
      tags: linkTags("match", "match with " + Q.name)
    };
  }
});

ev({
  id: "div-union-of-crowns", scope: "world", weight: 25, minEra: "powder", maxEra: "steam", cooldown: 9999,
  test: function (ctx) { return dtest(ctx, 30, 260, "match", "union"); },
  run: function (ctx) {
    const w = ctx.world, d = getDiv(w), P = d.p, Q = qOf(ctx, d), m = lk(w, "match");
    if (!Q || Q.regions.length < 2) return null;
    const reg = borderRegion(ctx, Q, P) || null;
    if (!reg) return null;
    regName(ctx, reg, Q);
    ctx.transfer(reg, P);
    setRel(P, Q, 0.6); scale(P, "prestige", 1.08); scale(Q, "prestige", 0.93); nudge(Q, "stability", -0.06);
    const act = "Act of Union of " + townOf(ctx.rng, P);
    return {
      importance: 4, regionId: reg.id, actors: [ctx.actor(P), ctx.actor(Q), ctx.actor(reg)],
      text: because(d) + ", the " + cite(m) + " was a live prospect rather than a genealogical curiosity. When the crown of " + Q.name + " fell vacant in " + ctx.year +
        ", its Estates recognised the claim of " + P.name + ", and the province of " + reg.name + " passed to " + P.name + " under the " + act + ". The Estates of " + Q.name + " noted for the record that the arrangement was personal and not constitutional.",
      tags: linkTags("union", "union of crowns", borderTags(act, Q.id, P.id, reg.id).concat(["union"]))
    };
  }
});

ev({
  id: "div-succession-war", scope: "world", weight: 25, minEra: "powder", maxEra: "steam", cooldown: 9999,
  test: function (ctx) { return dtest(ctx, 36, 300, "union", "war"); },
  run: function (ctx) {
    const w = ctx.world, d = getDiv(w), P = d.p, u = lk(w, "union");
    const rivals = otherPolities(ctx, P, function (x) { return x.id !== (d.q && d.q.id); });
    if (!rivals.length) return null;
    const R = ctx.pick(rivals);
    const o = conflict(ctx, P, R, { frac: 0.03, rel: -0.5 });
    const name = "War of the " + P.adjective + " Succession";
    const tags = linkTags("war", name);
    tags.push("war", "succession-war");
    if (o.reg) Array.prototype.push.apply(tags, borderTags(o.treaty, o.lose.id, o.win.id, o.reg.id));
    return {
      importance: 4, regionId: o.reg ? o.reg.id : P.capital, actors: [ctx.actor(o.win), ctx.actor(o.lose)],
      text: because(d) + ", the " + cite(u) + " existed, and " + R.name + " refused to recognise it. The " + name + " lasted " + ctx.int(3, 7) + " campaigning seasons of manoeuvre between armies of pike and shot, and cost " + num(o.dead) +
        " dead, most of them of disease. " + o.win.name + " prevailed" + (o.reg ? "; the " + o.treaty + " moved " + (o.reg.name || "a border province") + " from " + o.lose.name + " to " + o.win.name : "") + ". Both sides afterwards issued medals.",
      tags: tags
    };
  }
});

ev({
  id: "div-union-dissolves", scope: "world", weight: 25, minEra: "mechanical", maxEra: "electric", cooldown: 9999,
  test: function (ctx) {
    if (!dtest(ctx, 60, 360, "union", "dissolution")) return false;
    return ctx.year - lk(ctx.world, "union").year >= 40;
  },
  run: function (ctx) {
    const w = ctx.world, d = getDiv(w), P = d.p, u = lk(w, "union");
    const reg = w.regions[Number(tagv(u, "reg:"))];
    const Q = w.polities[tagv(u, "from:")];
    if (!reg || reg.owner !== P.id) return null;
    let heirs;
    if (P.regions.length < 2 || reg.id === P.capital) return null;
    if (alive(Q)) { ctx.transfer(reg, Q); heirs = Q; }
    else {
      heirs = breakaway(ctx, reg, "composite_monarchy", P);
      if (!heirs) return null;
    }
    setRel(P, heirs, -0.3); scale(P, "prestige", 0.92); nudge(P, "stability", -0.05);
    const yrs = ctx.year - u.year;
    return {
      importance: 4, regionId: reg.id, actors: [ctx.actor(P), ctx.actor(heirs), ctx.actor(reg)],
      text: because(d) + ", the " + cite(u) + " had lasted " + yrs + " years, and it ended in an afternoon. The laws of succession in the two realms had always differed on whether a crown could pass through the female line; in " + ctx.year +
        " the question was finally asked, and the answers were incompatible. " + reg.name + " went to " + heirs.name + " under the " + "Partition of " + townOf(ctx.rng, P) + ", which both sides described as a restoration.",
      tags: linkTags("dissolution", "dissolution of the union", borderTags("Partition", P.id, heirs.id, reg.id))
    };
  }
});

ev({
  id: "div-confession", scope: "world", weight: 22, minEra: "sail", maxEra: "steam", cooldown: 9999,
  test: function (ctx) { return dtest(ctx, 20, 220, null, "confession") && hasTech(ctx.world, "printing"); },
  run: function (ctx) {
    const w = ctx.world, d = getDiv(w), P = d.p, cid = cultureOf(P);
    const creed = townOf(ctx.rng, P) + " " + (cid === "nearEast" ? "Observance" : (cid === "southAsia" || cid === "sinic" || cid === "japonic") ? "Doctrine" : "Confession");
    const pro = ctx.chance(0.5);
    nudge(P, "piety", pro ? 0.15 : -0.1); nudge(P, "stability", pro ? -0.05 : 0.02);
    return {
      importance: 3, regionId: P.capital, actors: [ctx.actor(P)],
      text: because(d) + ", " + d.K.short(d) + " met the pamphlet age as a settled power with a state church and a printed catechism, and not as a succession dispute. In " + ctx.year + " " + styled(w, P) +
        (pro ? " adopted the " + creed + " and secularised the monasteries of " + capName(w, P) + "." : " declined the " + creed + ", and a hundred and forty pamphlets in its favour were burned in the square of " + capName(w, P) + " on a wet Thursday."),
      tags: linkTags("confession", "confession of " + P.name, ["reformation", pro ? "reformed:" + P.id : "refused:" + P.id])
    };
  }
});

ev({
  id: "div-charter", scope: "world", weight: 22, minEra: "powder", maxEra: "mechanical", cooldown: 9999,
  test: function (ctx) { return dtest(ctx, 40, 240, "first", "charter"); },
  run: function (ctx) {
    const w = ctx.world, d = getDiv(w), P = d.p, r = ctx.rng;
    const free = unowned(w);
    let reg = free.length ? ctx.pick(free) : null;
    if (reg) { regName(ctx, reg, P); ctx.transfer(reg, P); ctx.foundSettlement(reg, 1); }
    else reg = w.regions[P.capital];
    const name = companyName(r, regName(ctx, reg, P));
    const art = ctx.newArtifact({
      name: "The Charter of " + name.replace(/^The /, ""), kind: "charter", created: ctx.year, creator: d.f,
      region: reg, power: 0.3, legend: "A monopoly charter granted by the crown of " + P.name + " in " + ctx.year + "."
    });
    scale(P, "wealth", 1.1);
    return {
      importance: 3, regionId: reg.id, actors: [ctx.actor(P), ctx.actor(reg)].concat(art ? [ctx.actor(art)] : []),
      text: because(d) + ", " + d.K.short(d) + " had both the revenue and the confidence to grant a monopoly. In " + ctx.year + " the crown of " + P.name + " chartered " + name +
        " to trade, govern, tax and, at need, make war within the limits of " + reg.name + ". The charter ran to forty pages, none of which defined 'at need'.",
      tags: linkTags("charter", "charter of " + name, ["charter", "charter:" + (art ? art.id : "none"), "metro:" + P.id, "company:" + name])
    };
  }
});

ev({
  id: "div-revolution", scope: "world", weight: 22, minEra: "mechanical", maxEra: "steam", cooldown: 9999,
  test: function (ctx) { return dtest(ctx, 150, 460, "first", "revolution"); },
  run: function (ctx) {
    const w = ctx.world, d = getDiv(w), P = d.p, f = lk(w, "first"), m = lk(w, "match");
    const old = rulerOf(w, P);
    if (old && old.died == null) ctx.kill(old, ctx.pick(LAST_WORDS));
    setArch(P, "revolutionary_republic");
    P.ruler = null;
    const leader = crown(ctx, P, "revolutionary", "First Citizen");
    nudge(P, "stability", -0.2); scale(P, "prestige", 0.9);
    const slogan = ctx.pick(SLOGANS);
    return {
      importance: 4, regionId: P.capital, actors: [ctx.actor(P), ctx.actor(leader)],
      text: because(d) + ", the line of " + P.name + " had reigned without interruption since the " + cite(f) + (m ? " and had married into " + (alive(d.q) ? d.Q : "a neighbouring crown") + " at the " + cite(m) : "") +
        ", which meant that in " + ctx.year + " there was one dynasty to blame for everything. The crowds of " + capName(w, P) + " carried banners reading '" + slogan + "'; " + leader.name +
        " proclaimed a republic within the week and was, by general agreement, the least bloodthirsty man in the committee.",
      tags: linkTags("revolution", "revolution in " + P.name, ["revolution", "political-revolution", "revolution:" + P.id])
    };
  }
});

ev({
  id: "div-industry", scope: "world", weight: 22, minEra: "steam", cooldown: 9999,
  test: function (ctx) { return dtest(ctx, 200, 520, "first", "industry") && hasTech(ctx.world, "steam-engine"); },
  run: function (ctx) {
    const w = ctx.world, d = getDiv(w), P = d.p, behind = d.kind === "inventor";
    tech(P, behind ? -0.04 : 0.05);
    scale(P, "wealth", behind ? 0.9 : 1.25);
    scale(P, "population", behind ? 1 : 1.08);
    return {
      importance: 3, regionId: P.capital, actors: [ctx.actor(P)],
      text: because(d) + ", " + d.K.industry(d) + ". By " + ctx.year + " the " + P.adjective + " industrial economy " + (behind ? "ran decades behind its neighbours and knew it" : "was the largest outside the great empires and was entirely unsurprised") +
        ". The cause was traced, in the official history, to " + d.K.short(d) + ", although nobody who was alive in " + d.year + " would have recognised the claim.",
      tags: linkTags("industry", "industrial divergence")
    };
  }
});

ev({
  id: "div-revenge", scope: "world", weight: 22, minEra: "steam", maxEra: "atomic", cooldown: 9999,
  test: function (ctx) {
    if (!dtest(ctx, 120, 560, null, "revenge")) return false;
    const w = ctx.world, ww = lk(w, "war");
    if (!ww) return false;
    const loser = w.polities[actorOf(ww, "polity", 1)];
    return alive(loser) && ctx.year - ww.year >= 80;
  },
  run: function (ctx) {
    const w = ctx.world, d = getDiv(w), P = d.p, ww = lk(w, "war");
    const L = w.polities[actorOf(ww, "polity", 1)], W = w.polities[actorOf(ww, "polity", 0)];
    if (!alive(L) || !alive(W) || L.id === W.id) return null;
    const o = conflict(ctx, L, W, { frac: 0.05, rel: -0.6 });
    const tr = tagv(ww, "treaty:");
    const tags = linkTags("revenge", "war of revenge", ["war", "revenge"]);
    if (o.reg) Array.prototype.push.apply(tags, borderTags(o.treaty, o.lose.id, o.win.id, o.reg.id));
    return {
      importance: 4, regionId: o.reg ? o.reg.id : L.capital, actors: [ctx.actor(L), ctx.actor(W)],
      text: because(d) + ", the " + tagv(ww, "link:") + " of " + ww.year + " was fought at all, and " + L.name + " had spent " + (ctx.year - ww.year) + " years remembering how it ended" + (tr ? " (the " + tr + " was taught in its schools as an injury)" : "") +
        ". In " + ctx.year + " it went to war with " + W.name + " for the avowed purpose of reversing it. " + num(o.dead) + " were killed. " + o.win.name + " won" + (o.reg ? ", and the " + o.treaty + " altered the border again" : "") + ", which settled nothing that had been in dispute.",
      tags: tags
    };
  }
});

ev({
  id: "div-bicentenary", scope: "world", weight: 20, cooldown: 9999,
  test: function (ctx) { return dtest(ctx, 200, 399, null, "bicentenary"); },
  run: function (ctx) {
    const w = ctx.world, d = getDiv(w), P = d.p, n = links(w).length;
    scale(P, "prestige", 1.05); nudge(P, "stability", 0.03);
    return {
      importance: 3, regionId: P.capital, actors: [ctx.actor(P), ctx.actor(d.ev && w.artifacts ? firstArtifact(w, d) : P)].filter(Boolean),
      text: "In " + ctx.year + " " + P.name + " marked the bicentenary of the " + DIV[d.kind].artifact(d).replace(/^The /, "") + " with a procession, a commemorative stamp, and a monument at " + d.town +
        ". Everything since, the speakers held, followed from the fact that " + d.K.cause(d) + "; the chain of consequences ran to " + n + " recorded links. The principal speaker declined to say what he thought would have happened otherwise, and was applauded for it.",
      tags: linkTags("bicentenary", "bicentenary")
    };
  }
});

ev({
  id: "div-quincentenary", scope: "world", weight: 20, cooldown: 9999,
  test: function (ctx) { return dtest(ctx, 400, 9999, null, "quincentenary"); },
  run: function (ctx) {
    const w = ctx.world, d = getDiv(w), P = d.p;
    scale(P, "prestige", 1.04);
    return {
      importance: 3, regionId: P.capital, actors: [ctx.actor(P)],
      text: "The four-hundredth anniversary of the accident of " + d.year + " was kept in " + P.name + " in " + ctx.year + ". Historians held that " + d.K.cause(d) + ", and that otherwise " + d.K.ifnot(d) + ". Three committees produced three programmes; the one adopted was the one with the fewest dates in it.",
      tags: linkTags("quincentenary", "quatercentenary")
    };
  }
});

function firstArtifact(world, d) {
  const id = actorOf(d.ev, "artifact", 0);
  return id != null ? world.artifacts[id] : null;
}

ev({
  id: "div-atomic", scope: "world", weight: 22, minEra: "atomic", cooldown: 9999,
  test: function (ctx) { return dtest(ctx, 300, 9999, null, "atomic") && hasTech(ctx.world, "fission"); },
  run: function (ctx) {
    const w = ctx.world, d = getDiv(w), P = d.p, ind = lk(w, "industry");
    tech(P, 0.06); scale(P, "military", 1.25, 1.5); scale(P, "prestige", 1.15);
    nudge(P, "aggression", 0.05);
    return {
      importance: 4, regionId: P.capital, actors: [ctx.actor(P)],
      text: "In " + ctx.year + " " + P.name + " fired a fission device in the " + pickDesert(ctx) + ". " + because(d) + ", " + (ind ? "the " + cite(ind) + " had set the shape of its foundries and universities, " : "") +
        "and the programme's senior physicist, whose grandfather had been a clerk in " + d.town + ", observed that the whole thing had been a very long way round. The test was announced as a scientific experiment and understood as a diplomatic note.",
      tags: linkTags("atomic", "fission programme", ["nuclear"])
    };
  }
});
function pickDesert(ctx) { return ctx.pick(["high desert", "salt flats", "southern archipelago", "frozen northern range", "dry lake"]); }

ev({
  id: "div-claim", scope: "world", weight: 24, minEra: "electric", cooldown: 9999,
  test: function (ctx) {
    if (!dtest(ctx, 200, 9999, "dissolution", "claim")) return false;
    const w = ctx.world, dis = lk(w, "dissolution"), reg = w.regions[Number(tagv(dis, "reg:"))];
    return !!reg && reg.owner != null && reg.owner !== getDiv(w).p.id && alive(w.polities[reg.owner]) && ctx.year - dis.year >= 60;
  },
  run: function (ctx) {
    const w = ctx.world, d = getDiv(w), P = d.p, dis = lk(w, "dissolution"), u = lk(w, "union");
    const reg = w.regions[Number(tagv(dis, "reg:"))], O = w.polities[reg.owner];
    if (!reg || !alive(O) || O.id === P.id) return null;
    shiftRel(P, O, -0.5);
    let ceded = false;
    if (P.military > O.military * 1.4 && ctx.chance(0.5)) { ctx.transfer(reg, P); ceded = true; }
    const tags = linkTags("claim", "claim on " + (reg.name || "the province"), ["irredentism"]);
    if (ceded) Array.prototype.push.apply(tags, borderTags("Annexation", O.id, P.id, reg.id));
    return {
      importance: 3, regionId: reg.id, actors: [ctx.actor(P), ctx.actor(O), ctx.actor(reg)],
      text: because(d) + ", the " + cite(u) + " had made " + reg.name + " a crown province of " + P.name + " for " + (dis.year - u.year) + " years, and " + P.adjective +
        " nationalists, a century and a half after the " + cite(dis) + ", discovered that this had been an injustice. In " + ctx.year + " the government of " + P.name + " formally demanded the province from " + O.name + ", citing the Act of Union and, in smaller type, the harbour." +
        (ceded ? " " + O.name + " ceded it under protest, with the army of " + P.name + " already on the road." : " " + O.name + " replied that the Partition had been signed by both parties; the exchange of notes ran to eleven volumes."),
      tags: tags
    };
  }
});

ev({
  id: "div-historians", scope: "world", weight: 18, minEra: "mechanical", cooldown: 9999,
  test: function (ctx) { return dtest(ctx, 120, 9999, null, "historians") && links(ctx.world).length >= 3; },
  run: function (ctx) {
    const w = ctx.world, d = getDiv(w), P = d.p, ls = links(w), a = ls[0], b = ls[ls.length - 1];
    scale(P, "prestige", 1.03);
    return {
      importance: 2, regionId: P.capital, actors: [ctx.actor(P)],
      text: "A school of historians in " + P.name + " argued in " + ctx.year + " that everything from the " + cite(a) + " to the " + cite(b) + " followed from one cause: that " + d.K.cause(d) +
        ". A rival school replied that the fever, fleet, treaty or vote was incidental and that the result would have come anyway, a position it defended in six volumes none of which explained why it had not.",
      tags: linkTags("historians", "historians' quarrel")
    };
  }
});

ev({
  id: "div-summary", scope: "world", weight: 30, minEra: "late", cooldown: 9999,
  test: function (ctx) { return dtest(ctx, 300, 9999, null, "summary") && links(ctx.world).length >= 5; },
  run: function (ctx) {
    const w = ctx.world, d = getDiv(w), P = d.p, ls = links(w);
    const parts = ls.slice(0, 8).map(function (e) { return cite(e); });
    scale(P, "prestige", 1.05);
    return {
      importance: 4, regionId: P.capital, actors: [ctx.actor(P)],
      text: "In " + ctx.year + " a commission of the " + P.adjective + " academy published the counted consequences of the accident of " + d.year + ": " + joinList(parts) + (ls.length > 8 ? ", and " + (ls.length - 8) + " more" : "") +
        ". The commission's premise was that " + d.K.cause(d) + "; had it not, it concluded, " + d.K.ifnot(d) + ". The report was received with courtesy and filed under the year it began.",
      tags: linkTags("summary", "reckoning")
    };
  }
});

/* ===================================================================== */
/* 6. General events                                                      */
/*    Convention: war events list actors [winner, loser].                 */
/* ===================================================================== */

function rivalOf(ctx, p) { const r = ctx.rivals(p).filter(alive); return r.length ? ctx.pick(r) : null; }
function monarchic(p) { return ["composite_monarchy", "elective_kingdom", "sultanate", "shogunate", "autocratic_empire"].indexOf(p.archetypeId) >= 0; }
function lose(p, frac) { const u = Math.round(p.population * frac); p.population = Math.max(60, p.population - u); return u; }
function gain(p, frac) { const u = Math.round(p.population * frac); p.population += u; return u; }
function headline(ctx, p, q) { return fill(ctx.pick(HEADLINES), { p: p.name.toUpperCase(), q: (q ? q.name : "abroad").toUpperCase() }); }
function newRuler(ctx, p, epitaph) {
  const old = rulerOf(ctx.world, p);
  if (old && old.died == null) ctx.kill(old, epitaph || ctx.pick(LAST_WORDS));
  return crown(ctx, p, "ruler");
}
const ARMS = {
  sail: "men-at-arms, pikemen and a few hired arquebusiers", powder: "pike and shot",
  mechanical: "regiments in line with flintlock and bayonet", steam: "rifled infantry fed by railway",
  electric: "machine-guns, wire and howitzers", atomic: "armour, aircraft and radio", late: "drones, satellites and a great deal of paperwork"
};
function warHead(ctx, p, foe) {
  return p.name + " declared war on " + foe.name + ", citing " + ctx.choice(CASUS_BELLI) + ". ";
}

/* ---------- dynastic politics ---------- */

ev({
  id: "marriage-unites-crowns", scope: "polity", weight: 2, minEra: "sail", maxEra: "mechanical", cooldown: 70,
  test: function (ctx) { return monarchic(ctx.polity) && ctx.polity.regions.length >= 2; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity;
    const cands = ctx.neighbors(p).filter(function (q) { return q.regions.length <= Math.min(4, p.regions.length) && (p.relations[q.id] || 0) > -0.3 && monarchic(q); });
    if (!cands.length || !ctx.chance(0.45)) return null;
    const q = ctx.pick(cands), qc = cultureOf(q), regs = q.regions.slice();
    const bride = personIn(ctx.rng, qc, true), ruler = styled(w, p);
    ctx.endPolity(q, "Its crown passed by marriage to the house of " + p.name + ", and it was thereafter governed as a province of a larger realm.");
    regs.forEach(function (id) { const r = w.regions[id]; regName(ctx, r, q); ctx.transfer(r, p); });
    setArch(p, "composite_monarchy"); nudge(p, "stability", -0.04); scale(p, "prestige", 1.2);
    const first = w.regions[regs[0]];
    const tags = ["marriage", "personal-union", "union-of:" + q.id, "uc:" + qc, "qn:" + q.name, "reg:" + regs[0]];
    tags.push.apply(tags, borderTags("Marriage Contract", q.id, p.id, regs[0]));
    return {
      importance: 4, regionId: first.id, actors: [ctx.actor(p), ctx.actor(q), ctx.actor(first)], tags: tags,
      text: ruler + " of " + p.name + " married " + bride + ", the last of her line in " + q.name + ", and the Estates of " + q.name + " discovered on her father's death that the marriage contract had been drafted with unusual care. " +
        regs.length + " provinces passed to " + p.name + " without a battle, which several chancelleries described as a scandal and two as an opportunity."
    };
  }
});

ev({
  id: "personal-union-dissolves", scope: "polity", weight: 4, minEra: "powder", maxEra: "late", cooldown: 30,
  test: function (ctx) { return withTag(ctx.world, "personal-union").length > 0 && ctx.polity.regions.length >= 3; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, us = withTag(w, "personal-union");
    let u = null;
    for (let i = 0; i < us.length; i++) {
      if (actorOf(us[i], "polity", 0) === p.id && ctx.year - us[i].year >= 45 && !withTag(w, "dissolved:" + us[i].id).length) { u = us[i]; break; }
    }
    if (!u || !ctx.chance(0.25)) return null;
    const reg = w.regions[Number(tagv(u, "reg:"))];
    if (!reg || reg.owner !== p.id) return null;
    const np = breakaway(ctx, reg, "composite_monarchy", p, tagv(u, "uc:"));
    if (!np) return null;
    nudge(p, "stability", -0.06); scale(p, "prestige", 0.9);
    return {
      importance: 4, regionId: reg.id, actors: [ctx.actor(p), ctx.actor(np), ctx.actor(reg)],
      tags: ["dissolution", "dissolved:" + u.id].concat(borderTags("Partition", p.id, np.id, reg.id)),
      text: "The personal union of " + p.name + " and " + (tagv(u, "qn:") || "its partner") + ", made by the marriage of " + u.year + ", ended in " + ctx.year + " after " + (ctx.year - u.year) +
        " years, when a disputed succession gave the northern provinces a crown of their own. " + np.name + " was restored as a separate realm under " + (rulerOf(w, np) ? rulerOf(w, np).name : "a cadet prince") +
        ". Both courts kept the other's arms quartered on their own for another generation, as a reminder."
    };
  }
});

ev({
  id: "inheritance-splits-realm", scope: "polity", weight: 1.5, minEra: "sail", maxEra: "steam", cooldown: 80,
  test: function (ctx) { return monarchic(ctx.polity) && ctx.polity.regions.length >= 4; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity;
    if (!ctx.chance(0.4)) return null;
    const old = rulerOf(w, p);
    const regs = polRegions(w, p).filter(function (r) { return r.id !== p.capital; });
    if (!regs.length) return null;
    const reg = ctx.pick(regs);
    regName(ctx, reg, p);
    const np = breakaway(ctx, reg, p.archetypeId === "elective_kingdom" ? "elective_kingdom" : "composite_monarchy", p);
    if (!np) return null;
    setRel(p, np, 0.2); nudge(p, "stability", -0.05); scale(p, "prestige", 0.9);
    if (old && old.died == null) ctx.kill(old, ctx.pick(LAST_WORDS));
    return {
      importance: 3, regionId: reg.id, actors: [ctx.actor(p), ctx.actor(np), ctx.actor(reg)], tags: ["inheritance", "partition"],
      text: (old ? old.name : "The ruler") + " of " + p.name + " died leaving two sons and a custom of equal division, and the realm was parted in " + ctx.year + ". " + reg.name + " became the seat of " + np.name +
        ", whose first act was to dispute the new frontier with its elder brother; the dispute, to the surprise of everyone concerned, was submitted to lawyers."
    };
  }
});

ev({
  id: "succession-war", scope: "polity", weight: 2, minEra: "powder", maxEra: "steam", cooldown: 50,
  test: function (ctx) { return monarchic(ctx.polity) && ctx.rivals().length > 0; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, q = rivalOf(ctx, p);
    if (!q || !monarchic(q) || !ctx.chance(0.35)) return null;
    const old = rulerOf(w, p), gm = personIn(ctx.rng, cultureOf(q), true);
    const o = conflict(ctx, p, q, { frac: 0.012, rel: -0.5 });
    const war = "War of the " + p.adjective + " Succession";
    const tags = ["war", "succession-war"];
    if (o.reg) tags.push.apply(tags, borderTags(o.treaty, o.lose.id, o.win.id, o.reg.id));
    return {
      importance: 3, regionId: o.reg ? o.reg.id : p.capital, actors: [ctx.actor(o.win), ctx.actor(o.lose)], tags: tags,
      text: "When " + (old ? old.name : "the ruler") + " of " + p.name + " left no son, " + q.name + " advanced a claim through a grandmother, " + gm + ", and the " + war + " followed. It was fought by " + ARMS[ctx.era] +
        " and cost " + num(o.dead) + " dead. " + o.win.name + " prevailed" + (o.reg ? "; under the " + o.treaty + " " + o.reg.name + " changed hands" : "; the " + o.treaty + " restored the frontier and left the question of the grandmother to historians") + "."
    };
  }
});

ev({
  id: "regency", scope: "polity", weight: 2, cooldown: 45,
  test: function (ctx) { return monarchic(ctx.polity) && ctx.polity.ruler != null; },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, old = rulerOf(w, p);
    if (!old || age(ctx, old) < 38 || !ctx.chance(0.3)) return null;
    const heir = newRuler(ctx, p);
    heir.born = ctx.year - ctx.int(4, 11);
    nudge(p, "stability", -0.07);
    return {
      importance: 2, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(heir)], tags: ["regency"],
      text: (old.name) + " died in " + ctx.year + " and was succeeded at the age of " + (ctx.year - heir.born) + " by " + heir.name + ". The regency, shared between the dowager and the chancellor, lasted nine years and was remembered chiefly for the number of fountains it commissioned."
    };
  }
});
function age(ctx, f) { return ctx.year - f.born; }

ev({
  id: "elective-diet", scope: "polity", weight: 4, cooldown: 36,
  test: function (ctx) { return ctx.polity.archetypeId === "elective_kingdom"; },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, q = rivalOf(ctx, p);
    const old = rulerOf(w, p);
    if (!old || age(ctx, old) < 50) return null;
    const heir = newRuler(ctx, p);
    const foreign = q && ctx.chance(0.5);
    if (foreign) { shiftRel(p, q, 0.3); heir.name = personIn(ctx.rng, cultureOf(q), false); }
    nudge(p, "stability", foreign ? -0.04 : 0.02);
    const yes = ctx.int(48, 140), no = ctx.int(30, yes - 1), bought = ctx.int(3, 19);
    return {
      importance: 3, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(heir)].concat(foreign ? [ctx.actor(q)] : []), tags: ["election"],
      text: "The Diet of " + p.name + " met at " + capName(w, p) + " in " + ctx.year + " and elected " + heir.name + (foreign ? ", a candidate of " + q.name + "," : "") + " by " + yes + " votes to " + no +
        ", of which " + bought + " were later conceded to have been purchased. The losing party issued a protest of eleven pages, which was read aloud and then entered in the minutes."
    };
  }
});

ev({
  id: "palace-coup", scope: "polity", weight: 3, minEra: "sail", cooldown: 40,
  test: function (ctx) { return ["sultanate", "shogunate", "autocratic_empire"].indexOf(ctx.polity.archetypeId) >= 0; },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world, old = rulerOf(w, p);
    if (!old || !ctx.chance(0.3)) return null;
    const who = p.archetypeId === "shogunate" ? "the shogunal retainers" : p.archetypeId === "sultanate" ? "the palace guard" : "the household regiments";
    const heir = newRuler(ctx, p, "Deposed in " + ctx.year + ", and afterwards reported to have died of grief.");
    nudge(p, "stability", -0.1); nudge(p, "aggression", 0.03);
    return {
      importance: 3, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(heir)], tags: ["coup"],
      text: "In " + ctx.year + " " + who + " of " + p.name + " deposed " + old.name + " in a single night, with remarkably little noise, and installed " + heir.name + ". The new ruler's first decree confirmed all appointments made by his predecessor, and his second revoked them."
    };
  }
});

/* ---------- colonial expansion ---------- */

ev({
  id: "colonial-expedition", scope: "polity", weight: 4, minEra: "sail", maxEra: "steam", cooldown: 14,
  test: function (ctx) { return ctx.polity.tech > 0.1 && unowned(ctx.world).length > 0; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, free = unowned(w);
    if (!free.length || !ctx.chance(0.55)) return null;
    const reg = ctx.pick(free), ship = shipOf(ctx.rng, p);
    regName(ctx, reg, p);
    ctx.transfer(reg, p); ctx.foundSettlement(reg, 1);
    nudge(p, "curiosity", 0.02);
    return {
      importance: 2, regionId: reg.id, actors: [ctx.actor(p), ctx.actor(reg)], tags: ["colony", "expansion"],
      text: "The " + ship + " landed " + ctx.int(60, 400) + " settlers of " + p.name + " at " + reg.name + " in " + ctx.year + ", with instructions to build a fort, a church and a customs house in that order. " +
        (ctx.chance(0.5) ? "The customs house was finished first." : "Nobody had asked the people already living there, a procedural gap the colonial office later described as an oversight.")
    };
  }
});

ev({
  id: "exploration-voyage", scope: "polity", weight: 2, minEra: "sail", maxEra: "mechanical", cooldown: 20,
  test: function (ctx) { return ctx.polity.tech > 0.08; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, free = unowned(w);
    if (!free.length) return null;
    const reg = ctx.pick(free), cid = cultureOf(p), cap = personIn(ctx.rng, cid, false), ship = shipIn(ctx.rng, cid);
    regName(ctx, reg, p);
    if (reg.features.indexOf("charted") < 0) reg.features.push("charted");
    tech(p, 0.01); scale(p, "prestige", 1.04); nudge(p, "curiosity", 0.03);
    return {
      importance: 2, regionId: reg.id, actors: [ctx.actor(p), ctx.actor(reg)], tags: ["voyage"],
      text: "The " + ship + ", under " + cap + ", returned to " + capName(w, p) + " in " + ctx.year + " with a chart of the coast of " + reg.name + ", forty-one fewer crew than she had sailed with, and a cargo whose value was disputed by the three syndicates that had financed it."
    };
  }
});

ev({
  id: "company-chartered", scope: "polity", weight: 1.5, minEra: "powder", maxEra: "steam", cooldown: 35,
  test: function (ctx) { return ctx.polity.wealth > 0.3 && ctx.polity.tech > 0.15; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, r = ctx.rng;
    const free = unowned(w);
    let reg = free.length ? ctx.pick(free) : null;
    if (!reg) { const rs = polRegions(w, p).filter(function (x) { return x.id !== p.capital; }); if (!rs.length) return null; reg = ctx.pick(rs); }
    else { regName(ctx, reg, p); ctx.transfer(reg, p); ctx.foundSettlement(reg, 1); }
    const name = companyName(r, regName(ctx, reg, p));
    const art = ctx.newArtifact({ name: "The Charter of " + name.replace(/^The /, ""), kind: "charter", region: reg, power: 0.3,
      legend: "A monopoly charter granted by " + p.name + " in " + ctx.year + "." });
    return {
      importance: 3, regionId: reg.id, actors: [ctx.actor(p), ctx.actor(reg), ctx.actor(art)],
      tags: ["charter", "charter:" + art.id, "metro:" + p.id, "company:" + name, "colony"],
      text: "In " + ctx.year + " the crown of " + p.name + " granted " + name + " a monopoly of trade in " + reg.name + ", with the right to maintain forts, raise troops, coin money and, in the language of the charter, 'do all else needful'. The Company's first dividend was paid in " + (ctx.year + ctx.int(4, 11)) + "."
    };
  }
});

ev({
  id: "company-becomes-state", scope: "polity", weight: 5, minEra: "mechanical", maxEra: "late", cooldown: 20,
  test: function (ctx) { return withTag(ctx.world, "charter").length > 0; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, cs = withTag(w, "charter");
    let c = null;
    for (let i = 0; i < cs.length; i++) {
      if (tagv(cs[i], "metro:") === p.id && ctx.year - cs[i].year >= 40 && !withTag(w, "company-state:" + cs[i].id).length) { c = cs[i]; break; }
    }
    if (!c || !ctx.chance(0.35)) return null;
    const reg = w.regions[c.regionId];
    if (!reg || reg.owner !== p.id) return null;
    const np = breakaway(ctx, reg, "chartered_company", p);
    if (!np) return null;
    const cname = tagv(c, "company:");
    scale(p, "prestige", 0.95);
    const divChain = c.tags.indexOf("div-consequence") >= 0 && getDiv(w);
    return {
      importance: 4, regionId: reg.id, actors: [ctx.actor(p), ctx.actor(np), ctx.actor(reg)], tags: ["company-state", "founding", "company-state:" + c.id],
      text: cname + ", chartered by " + p.name + " in " + c.year + " to carry on trade, ceased in " + ctx.year + " to carry on trade only. Its governors had taxed, judged and garrisoned for " + (ctx.year - c.year) +
        " years, and when the metropole attempted to revoke the charter it found there was nobody in " + reg.name + " who remembered whom to send the notice to. The territory was thereafter the state of " + np.name + "." +
        (divChain ? " The company was, in the strict sense, a creature of the divergence: " + because(divChain).toLowerCase() + "." : "")
    };
  }
});

ev({
  id: "colony-revolt", scope: "polity", weight: 3, minEra: "powder", maxEra: "steam", cooldown: 45,
  test: function (ctx) { return withTag(ctx.world, "colony").length > 0 && ctx.polity.regions.length >= 3; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, cs = withTag(w, "colony"), mine = [];
    for (let i = 0; i < cs.length; i++) {
      const r = w.regions[cs[i].regionId];
      if (r && r.owner === p.id && r.id !== p.capital && ctx.year - cs[i].year >= 40) mine.push({ r: r, e: cs[i] });
    }
    if (!mine.length || !ctx.chance(0.35)) return null;
    const m = ctx.pick(mine), np = breakaway(ctx, m.r, "colonial_dominion", p);
    if (!np) return null;
    nudge(p, "stability", -0.08); scale(p, "prestige", 0.9);
    return {
      importance: 4, regionId: m.r.id, actors: [ctx.actor(p), ctx.actor(np), ctx.actor(m.r)], tags: ["revolt", "colony-revolt", "founding"],
      text: "The colonists of " + m.r.name + ", settled from " + p.name + " in " + m.e.year + ", declared themselves a separate state in " + ctx.year + " under the banner '" + ctx.pick(SLOGANS) + "'. " +
        p.name + " sent a fleet and a commissioner; the fleet was late and the commissioner was persuasive in the wrong direction. By the third year " + np.name + " was a fact that " + p.name + " declined to recognise for as long as was convenient."
    };
  }
});

ev({
  id: "colony-outgrows-metropole", scope: "polity", weight: 6, minEra: "mechanical", cooldown: 9999,
  test: function (ctx) { return withTag(ctx.world, "colony-revolt").length > 0; },
  run: function (ctx) {
    const w = ctx.world, c = ctx.polity, rs = withTag(w, "colony-revolt");
    let rev = null;
    for (let i = 0; i < rs.length; i++) if (actorOf(rs[i], "polity", 1) === c.id) { rev = rs[i]; break; }
    if (!rev) return null;
    const m = w.polities[actorOf(rev, "polity", 0)];
    if (!alive(m) || c.population <= m.population * 1.05 || ctx.year - rev.year < 40) return null;
    scale(c, "prestige", 1.2); scale(m, "prestige", 0.85); nudge(c, "aggression", 0.05); nudge(m, "stability", -0.06);
    setRel(c, m, 0.1);
    return {
      importance: 4, regionId: c.capital, actors: [ctx.actor(c), ctx.actor(m)], tags: ["outgrew"],
      text: "The census of " + ctx.year + " found " + people(c.population) + " people in " + c.name + " and " + people(m.population) + " in " + m.name + ", the state from which it had broken away in " + rev.year +
        ". Ministers of " + m.name + " observed that population was not a measure of importance. The ministers of " + c.name + ", who had been observing the same thing in the opposite direction for a century, agreed."
    };
  }
});

ev({
  id: "decolonisation", scope: "polity", weight: 5, minEra: "atomic", maxEra: "late", cooldown: 20,
  test: function (ctx) { return withTag(ctx.world, "colony").length > 0 && ctx.polity.regions.length >= 3; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, cs = withTag(w, "colony"), mine = [];
    for (let i = 0; i < cs.length; i++) {
      const r = w.regions[cs[i].regionId];
      if (r && r.owner === p.id && r.id !== p.capital && ctx.year - cs[i].year >= 120) mine.push({ r: r, e: cs[i] });
    }
    if (!mine.length || !ctx.chance(0.4)) return null;
    const m = ctx.pick(mine), np = breakaway(ctx, m.r, "colonial_dominion", p);
    if (!np) return null;
    setRel(p, np, 0.3);
    return {
      importance: 3, regionId: m.r.id, actors: [ctx.actor(p), ctx.actor(np), ctx.actor(m.r)], tags: ["decolonisation", "founding"],
      text: "The flag of " + p.name + " was lowered at " + m.r.name + " in " + ctx.year + ", " + (ctx.year - m.e.year) + " years after the colony was planted. The ceremony was attended by a prince of " + p.name + " who spoke of friendship, and by a crowd that had been waiting for the part where the flag came down. " + np.name + " joined the assembly of states that afternoon."
    };
  }
});

/* ---------- revolutions and reaction ---------- */

ev({
  id: "political-revolution", scope: "polity", weight: 2, minEra: "mechanical", maxEra: "late", cooldown: 80,
  test: function (ctx) { return monarchic(ctx.polity) && ctx.polity.traits.stability < 0.55 && hasTech(ctx.world, "printing"); },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity;
    if (!ctx.chance(0.4)) return null;
    const old = rulerOf(w, p), slogan = ctx.pick(SLOGANS);
    if (old && old.died == null) ctx.kill(old, "Executed after a trial whose verdict had been settled in the first week.");
    setArch(p, "revolutionary_republic");
    const leader = crown(ctx, p, "revolutionary", "First Citizen");
    nudge(p, "stability", -0.15); nudge(p, "aggression", 0.1);
    return {
      importance: 4, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(leader)], tags: ["revolution", "political-revolution", "revolution:" + p.id, "slogan:" + slogan],
      text: "Crowds in " + capName(w, p) + " carrying banners that read '" + slogan + "' occupied the arsenal in " + ctx.year + ". " + (old ? old.name : "The ruler") + " was tried and executed within the year, and " + leader.name +
        " proclaimed a republic of citizens. Pamphlets reached the provinces in four days, a fact the ministry had not thought to prevent. The calendar was reformed in the second spring."
    };
  }
});

ev({
  id: "reaction-restores-order", scope: "polity", weight: 8, minEra: "mechanical", maxEra: "late", cooldown: 60,
  test: function (ctx) { return !!recent(ctx.world, "revolution", ctx.year, 45, ctx.polity.id) && ctx.polity.archetypeId === "revolutionary_republic"; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, rev = recent(w, "revolution", ctx.year, 45, p.id);
    if (!rev || ctx.year - rev.year < 6) return null;
    const heir = newRuler(ctx, p, "Died in the arms of a revolution that had grown tired of him.");
    setArch(p, "composite_monarchy");
    heir.title = archTitle(p);
    nudge(p, "stability", 0.12); nudge(p, "piety", 0.08);
    return {
      importance: 4, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(heir)], tags: ["reaction"],
      text: "The republic founded in " + rev.year + " under the slogan '" + (tagv(rev, "slogan:") || "liberty") + "' ended in " + ctx.year + ", when the army, which had grown fond of order, invited " + heir.name +
        " to take the crown. The restoration kept the metric weights, the civil code and the tax assessment of the revolution, and abolished its calendar, its holidays and its name."
    };
  }
});

ev({
  id: "agricultural-revolution", scope: "polity", weight: 3, minEra: "powder", maxEra: "steam", cooldown: 9999,
  test: function (ctx) { return ctx.polity.tech > 0.15; },
  run: function (ctx) {
    const p = ctx.polity, u = gain(p, 0.12);
    nudge(p, "stability", -0.03);
    return {
      importance: 3, regionId: p.capital, actors: [ctx.actor(p)], tags: ["agrarian"],
      text: "Fodder crops, four-course rotation and the enclosure of the common fields raised the yield of " + p.name + " by about a third in the decades before " + ctx.year + ". The population rose by " + people(u) +
        ". The tenants evicted by the enclosures went to the towns, where there was, as it happened, work."
    };
  }
});

ev({
  id: "industrial-revolution", scope: "polity", weight: 5, minEra: "mechanical", cooldown: 9999,
  test: function (ctx) { return hasTech(ctx.world, "steam-engine") && ctx.polity.tech > 0.3; },
  run: function (ctx) {
    const p = ctx.polity, u = gain(p, 0.2);
    tech(p, 0.04); nudge(p, "stability", -0.05); nudge(p, "curiosity", 0.04);
    return {
      importance: 4, regionId: p.capital, actors: [ctx.actor(p)], tags: ["industrial", "industrial:" + p.id],
      text: "The mills of " + p.name + " were by " + ctx.year + " burning " + num(ctx.int(2, 30) * 100000) + " tonnes of coal a year and employing children at a wage that the factory inspectors, when they were eventually appointed, described as modest. The towns grew by " + people(u) +
        " people in a generation. The pig-iron output of " + capName(ctx.world, p) + " was said to exceed that of the rest of the continent, which was true of at least one of its sectors."
    };
  }
});

ev({
  id: "general-strike", scope: "polity", weight: 2, minEra: "steam", maxEra: "late", cooldown: 40,
  test: function (ctx) { return !!evAbout(ctx.world, "industrial", ctx.polity.id); },
  run: function (ctx) {
    const p = ctx.polity, n = ctx.int(2, 9) * 100000;
    if (!ctx.chance(0.4)) return null;
    nudge(p, "stability", -0.08); lose(p, 0.002);
    const slogan = ctx.pick(SLOGANS);
    return {
      importance: 3, regionId: p.capital, actors: [ctx.actor(p)], tags: ["strike"],
      text: "A general strike closed the mills, the docks and the trams of " + p.name + " for nineteen days in " + ctx.year + "; " + num(n) + " workers stopped work under the banner '" + slogan +
        "'. Troops fired on a crowd at " + capName(ctx.world, p) + " on the ninth day and killed " + ctx.int(11, 140) + ". The strike ended with an eight-hour day in some trades, an inquiry in all of them, and a statue."
    };
  }
});

ev({
  id: "levee-en-masse", scope: "polity", weight: 4, minEra: "mechanical", maxEra: "steam", cooldown: 9999,
  test: function (ctx) { return hasTech(ctx.world, "flintlock") && (ctx.polity.archetypeId === "revolutionary_republic" || ctx.polity.traits.aggression > 0.6); },
  run: function (ctx) {
    const p = ctx.polity, u = lose(p, 0.003);
    nudge(p, "aggression", 0.1);
    return {
      importance: 3, regionId: p.capital, actors: [ctx.actor(p)], tags: ["conscription"],
      text: "In " + ctx.year + " " + p.name + " declared every unmarried man between eighteen and twenty-five liable to service, and called up " + people(u) + " of them. The professional officers observed that the new armies could not march in step. They could, however, be fed by requisition and replaced by decree, which proved the more useful qualities."
    };
  }
});

/* ---------- religion ---------- */

ev({
  id: "reformation", scope: "polity", weight: 4, minEra: "sail", maxEra: "mechanical", cooldown: 9999,
  test: function (ctx) { return hasTech(ctx.world, "printing") && ctx.polity.traits.piety > 0.3; },
  run: function (ctx) {
    const p = ctx.polity, cid = cultureOf(p), w = ctx.world;
    if (!ctx.chance(0.5)) return null;
    const creed = townOf(ctx.rng, p) + " " + CREEDS[cid];
    nudge(p, "piety", 0.12); nudge(p, "stability", -0.06);
    const pre = ctx.pick(CONFESSIONS);
    return {
      importance: 4, regionId: p.capital, actors: [ctx.actor(p)], tags: ["reformation", "reformed:" + p.id],
      text: "A preacher at " + capName(w, p) + " nailed forty-one propositions to the door of the cathedral in " + ctx.year + ", and a printer in the next street had them in a thousand hands by Sunday. The " + creed + " spread through " + p.name +
        " in a decade; " + ctx.int(300, 900) + " monasteries were closed, " + pre + " catechisms were printed, and the ruler, after consulting the treasury, discovered a conviction."
    };
  }
});

ev({
  id: "counter-reformation", scope: "polity", weight: 4, minEra: "powder", maxEra: "mechanical", cooldown: 9999,
  test: function (ctx) { return withTag(ctx.world, "reformation").length > 0 && !withTag(ctx.world, "reformed:" + ctx.polity.id).length && ctx.polity.traits.piety > 0.45; },
  run: function (ctx) {
    const p = ctx.polity, r = lastTag(ctx.world, "reformation");
    nudge(p, "piety", 0.1); nudge(p, "stability", 0.04);
    const q = ctx.world.polities[actorOf(r, "polity", 0)];
    if (alive(q)) shiftRel(p, q, -0.3);
    return {
      importance: 3, regionId: p.capital, actors: [ctx.actor(p)].concat(alive(q) ? [ctx.actor(q)] : []), tags: ["counter-reformation"],
      text: "In reply to the movement that began in " + r.year + (alive(q) ? " in " + q.name : "") + ", " + p.name + " convened a synod in " + ctx.year + " which restated the old doctrine in terms so clear that the number of people who could subscribe to it fell by a tenth. An index of forbidden books was published; it was the best-selling book of the decade."
    };
  }
});

ev({
  id: "confessional-war", scope: "polity", weight: 3, minEra: "powder", maxEra: "mechanical", cooldown: 60,
  test: function (ctx) { return withTag(ctx.world, "reformation").length > 0 && ctx.rivals().length > 0; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, q = rivalOf(ctx, p);
    if (!q) return null;
    const pr = withTag(w, "reformed:" + p.id).length > 0, qr = withTag(w, "reformed:" + q.id).length > 0;
    if (pr === qr || !ctx.chance(0.45)) return null;
    const o = conflict(ctx, p, q, { frac: 0.06, rel: -0.7 });
    const tags = ["war", "confessional-war"];
    if (o.reg) tags.push.apply(tags, borderTags(o.treaty, o.lose.id, o.win.id, o.reg.id));
    return {
      importance: 4, regionId: o.reg ? o.reg.id : p.capital, actors: [ctx.actor(o.win), ctx.actor(o.lose)], tags: tags,
      text: "The confessional war between " + p.name + " and " + q.name + " began in " + ctx.year + " over a question of whether a ruler's creed was the creed of his subjects. It was fought by " + ARMS.powder + ", and by mercenaries who changed sides when pay fell due. " +
        "Disease, plunder and famine killed " + num(o.dead) + " before the " + o.treaty + (o.reg ? " gave " + o.reg.name + " to " + o.win.name : " restored what had been") + "; whole villages in the contested provinces were not repopulated for a generation."
    };
  }
});

ev({
  id: "toleration-edict", scope: "polity", weight: 3, minEra: "powder", maxEra: "steam", cooldown: 90,
  test: function (ctx) { return withTag(ctx.world, "reformation").length > 0 && (withTag(ctx.world, "confessional-war").length > 0 || ctx.polity.traits.stability > 0.6); },
  run: function (ctx) {
    const p = ctx.polity, w = ctx.world;
    if (!ctx.chance(0.4)) return null;
    nudge(p, "stability", 0.1); nudge(p, "piety", -0.06); nudge(p, "curiosity", 0.04);
    return {
      importance: 3, regionId: p.capital, actors: [ctx.actor(p)], tags: ["toleration"],
      text: "By the Edict of " + townOf(ctx.rng, p) + " of " + ctx.year + ", " + styled(w, p) + " permitted subjects of all recognised confessions to worship in private, hold land and be buried in consecrated ground, and forbade anyone to describe the edict as a concession. Congregations were assigned a fixed number of windows."
    };
  }
});

/* ---------- technology as an event driver ---------- */

function techEvent(o) {
  ev({
    id: "tech-" + o.id, scope: "world", weight: o.weight || 22, minEra: o.era || "sail", cooldown: 9999,
    test: function (ctx) {
      if (ctx.year < o.year || hasTech(ctx.world, o.id)) return false;
      const need = o.need || [];
      for (let i = 0; i < need.length; i++) if (!hasTech(ctx.world, need[i])) return false;
      return true;
    },
    run: function (ctx) {
      const w = ctx.world, live = livePolities(w).sort(function (a, b) { return b.tech - a.tech; });
      if (!live.length) return null;
      const pio = live[Math.min(live.length - 1, ctx.int(0, 2))], f = ctx.newFigure(pio, o.role || "inventor");
      live.forEach(function (p) { tech(p, o.diff || 0.02); if (o.pop) p.population = Math.round(p.population * o.pop); if (o.curiosity) nudge(p, "curiosity", o.curiosity); });
      tech(pio, o.boost || 0.03);
      return {
        importance: o.imp || 3, regionId: pio.capital, actors: [ctx.actor(pio), ctx.actor(f)], tags: ["technology", "tech:" + o.id],
        text: o.text(pio, f, ctx)
      };
    }
  });
}
techEvent({ id: "printing", year: 1430, era: "sail", diff: 0.015, curiosity: 0.03, imp: 4,
  text: function (p, f, ctx) { return "In " + ctx.year + " " + f.name + " of " + capName(ctx.world, p) + " pulled the first sheets from a press of cast type. Within a generation there were presses in " + ctx.int(30, 90) + " cities; the price of a book fell to a tenth, and the number of people who could be argued with in writing rose accordingly."; } });
techEvent({ id: "flintlock", year: 1580, era: "powder", diff: 0.02,
  text: function (p, f, ctx) { return "The armourer " + f.name + " delivered to " + p.name + " in " + ctx.year + " a musket whose lock struck its own sparks and needed no burning match. It misfired one time in five, which was held to be a great improvement; the pike began its slow retirement."; } });
techEvent({ id: "inoculation", year: 1640, era: "powder", pop: 1.05, diff: 0.01, role: "physician",
  text: function (p, f, ctx) { return "The physician " + f.name + " of " + p.name + " reported in " + ctx.year + " that a scratch charged with matter from a mild case of the pox protected against the severe form. The method was denounced from four pulpits and adopted in three palaces; in the following decade the population of the inoculating states rose by about a twentieth."; } });
techEvent({ id: "steam-engine", year: 1712, era: "mechanical", need: ["printing"], diff: 0.025, boost: 0.05, imp: 4,
  text: function (p, f, ctx) { return "In " + ctx.year + " " + f.name + " set a beam engine to pump a flooded mine near " + capName(ctx.world, p) + ". It burned more coal in a day than the mine produced in an hour; this was improved. Within two generations the engine drove looms, forges and ships, and the word 'horsepower' appeared in the language."; } });
techEvent({ id: "railways", year: 1815, era: "steam", need: ["steam-engine"], diff: 0.03, boost: 0.04, imp: 4, role: "engineer",
  text: function (p, f, ctx) { return "The line from " + capName(ctx.world, p) + " to the coast, built by the engineer " + f.name + " and opened in " + ctx.year + ", carried " + num(ctx.int(2, 9) * 1000) + " passengers in its first month and a boiler explosion in its second. Armies, grain and gossip now moved at thirty miles an hour."; } });
techEvent({ id: "telegraph", year: 1832, era: "steam", need: ["steam-engine"], diff: 0.025,
  text: function (p, f, ctx) { return f.name + " transmitted a message of nine words along a copper wire in " + p.name + " in " + ctx.year + ", and the reply arrived before the sender had put down the pen. Ministries began to dispatch orders to ambassadors who, for the first time, could not claim not to have received them."; } });
techEvent({ id: "internal-combustion", year: 1885, era: "electric", need: ["steam-engine"], diff: 0.025, boost: 0.04, role: "engineer",
  text: function (p, f, ctx) { return "The workshop of " + f.name + " in " + p.name + " produced in " + ctx.year + " a carriage driven by a petroleum engine of one cylinder, which stalled on its first public run in front of the minister. The fuel was cheap, the engine light, and the cavalry officers watching were unanimous that it would never replace the horse."; } });
techEvent({ id: "radio", year: 1900, era: "electric", need: ["telegraph"], diff: 0.025,
  text: function (p, f, ctx) { return "In " + ctx.year + " " + f.name + " transmitted speech across " + ctx.int(20, 300) + " miles of empty air from a mast outside " + capName(ctx.world, p) + ". The ministry of posts claimed a monopoly the same week. Within a decade ships at sea, governments and the opposition had receivers, and the speeches got longer."; } });
techEvent({ id: "flight", year: 1903, era: "electric", need: ["internal-combustion"], diff: 0.025, imp: 4, role: "aviator",
  text: function (p, f, ctx) { return "The aviator " + f.name + " flew " + ctx.int(40, 260) + " yards in a powered machine of " + p.name + " in " + ctx.year + ", for twelve seconds, at a height of about a man. Ministries of war sent observers. Ministries of finance sent observers to observe the observers."; } });
techEvent({ id: "fission", year: 1938, era: "atomic", need: ["radio"], diff: 0.03, boost: 0.06, imp: 5, role: "physicist",
  text: function (p, f, ctx) { return "The physicist " + f.name + " of " + p.name + " demonstrated a sustained chain reaction in a pile of graphite and uranium under a disused stadium in " + ctx.year + ". The first message sent was a single sentence announcing that it worked; the second was a request for more funding. Ministries of every power understood both."; } });
techEvent({ id: "computing", year: 2005, era: "late", need: ["fission"], diff: 0.03, imp: 4, role: "engineer",
  text: function (p, f, ctx) { return "By " + ctx.year + " the networks that " + f.name + " had specified in " + p.name + " carried most of the world's commerce, correspondence and rumour. The first outage lasted eleven hours and was reported in every newspaper that was still printed."; } });

ev({
  id: "tech-diffusion", scope: "polity", weight: 5, minEra: "sail", cooldown: 20,
  test: function (ctx) { return withTag(ctx.world, "technology").length > 0 && ctx.polity.tech < 0.7; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, t = lastTag(w, "technology"), live = livePolities(w);
    let avg = 0; live.forEach(function (x) { avg += x.tech; }); avg /= live.length;
    if (p.tech > avg - 0.03) return null;
    tech(p, 0.03);
    const name = tagv(t, "tech:").replace(/-/g, " ");
    return {
      importance: 1, regionId: p.capital, actors: [ctx.actor(p)], tags: ["diffusion"],
      text: "In " + ctx.year + " " + p.name + " adopted the " + name + " first demonstrated in " + t.year + ", sending a delegation abroad to buy the secret and a second delegation to find out what the first had paid for."
    };
  }
});

/* ---------- economics ---------- */

ev({
  id: "mercantilist-tariffs", scope: "polity", weight: 2, minEra: "sail", maxEra: "steam", cooldown: 30,
  test: function (ctx) { return ctx.rivals().length > 0; },
  run: function (ctx) {
    const p = ctx.polity, q = rivalOf(ctx, p);
    if (!q) return null;
    shiftRel(p, q, -0.2); nudge(p, "cunning", 0.03); scale(p, "prestige", 1.02);
    return {
      importance: 2, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(q)], tags: ["tariff"],
      text: "In " + ctx.year + " " + p.name + " forbade the import of " + ctx.pick(["finished cloth", "refined sugar", "foreign-built ships", "printed books", "worked iron", "tea"]) + " from " + q.name + " and required that colonial produce be carried only in ships of " + p.name +
        ". The wealth of a nation, the preamble explained, was the quantity of bullion it contrived to keep. " + q.name + " replied in kind within the season."
    };
  }
});

ev({
  id: "speculative-bubble", scope: "polity", weight: 2, minEra: "mechanical", maxEra: "electric", cooldown: 70,
  test: function (ctx) { return ctx.polity.wealth > 0.35 && hasTech(ctx.world, "printing"); },
  run: function (ctx) {
    const p = ctx.polity, r = ctx.rng;
    if (!ctx.chance(0.35)) return null;
    const scheme = companyName(r, townOf(r, p));
    scale(p, "prestige", 1.1); nudge(p, "stability", 0.03);
    return {
      importance: 3, regionId: p.capital, actors: [ctx.actor(p)], tags: ["bubble", "bubble:" + p.id, "scheme:" + scheme],
      text: "Shares in " + scheme + " rose in " + ctx.year + " from par to " + ctx.int(6, 14) + " times par on the strength of a prospectus that described its business as 'an undertaking of great advantage, to be revealed'. Servants, bishops and two ministers of " + p.name +
        " subscribed. The Exchange of " + capName(ctx.world, p) + " stayed open until midnight for the first time in its history."
    };
  }
});

ev({
  id: "bubble-crash", scope: "polity", weight: 14, minEra: "mechanical", cooldown: 40,
  test: function (ctx) { const b = recent(ctx.world, "bubble", ctx.year, 14, ctx.polity.id); return !!b && ctx.year - b.year >= 3; },
  run: function (ctx) {
    const p = ctx.polity, b = recent(ctx.world, "bubble", ctx.year, 14, p.id);
    nudge(p, "stability", -0.12); lose(p, 0.01); scale(p, "prestige", 0.85);
    return {
      importance: 3, regionId: p.capital, actors: [ctx.actor(p)], tags: ["crash"],
      text: "The shares of " + (tagv(b, "scheme:") || "the great company") + ", which had stood at fourteen times par in " + b.year + ", fell in " + ctx.year + " to a quarter of par in eleven days. " + ctx.int(4, 40) + " banks of " + p.name +
        " failed. A parliamentary inquiry concluded that the fraud had been carried out in public, with the knowledge of everyone concerned, and recommended that it not be repeated."
    };
  }
});

ev({
  id: "famine", scope: "polity", weight: 4, minEra: "sail", maxEra: "steam", cooldown: 28,
  test: function (ctx) { return ctx.polity.population > 800; },
  run: function (ctx) {
    const p = ctx.polity, agr = !!evAbout(ctx.world, "agrarian", p.id);
    if (!ctx.chance(agr ? 0.25 : 0.5)) return null;
    const u = lose(p, ctx.range(0.05, 0.16));
    nudge(p, "stability", -0.07);
    return {
      importance: 3, regionId: p.capital, actors: [ctx.actor(p)], tags: ["famine"],
      text: "Three wet summers ruined the harvests of " + p.name + " between " + (ctx.year - 4) + " and " + ctx.year + ". Bread cost five times its usual price; " + people(u) + " people died of hunger and the fevers that followed it. The granaries of " + capName(ctx.world, p) + " were opened in the third year, a decision described as prudent by those who had made it."
    };
  }
});

ev({
  id: "plague-outbreak", scope: "polity", weight: 4, minEra: "sail", maxEra: "steam", cooldown: 30,
  test: function (ctx) { return !hasTech(ctx.world, "inoculation") && ctx.polity.population > 800; },
  run: function (ctx) {
    const p = ctx.polity;
    if (!ctx.chance(0.5)) return null;
    const u = lose(p, ctx.range(0.06, 0.2));
    nudge(p, "piety", 0.04);
    return {
      importance: 3, regionId: p.capital, actors: [ctx.actor(p)], tags: ["plague"],
      text: "Pestilence came to " + p.name + " by sea in " + ctx.year + " and took " + people(u) + " lives before it burned out. Cordons were drawn around " + capName(ctx.world, p) + " eleven weeks after it had entered. Processions were held, and in the following year the processions were held to have been the cause of the second wave."
    };
  }
});

ev({
  id: "mass-migration", scope: "polity", weight: 1.2, minEra: "steam", maxEra: "late", cooldown: 30,
  test: function (ctx) { return ctx.polity.population > 3000; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, cands = livePolities(w).filter(function (q) { return q.id !== p.id && (q.archetypeId === "colonial_dominion" || q.archetypeId === "revolutionary_republic" || q.population < p.population); });
    if (!cands.length) return null;
    const q = ctx.pick(cands), u = lose(p, ctx.range(0.03, 0.08));
    q.population += Math.round(u * 0.85); nudge(q, "curiosity", 0.02);
    return {
      importance: 3, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(q)], tags: ["migration"],
      text: "Between " + (ctx.year - 10) + " and " + ctx.year + " " + people(u) + " people left " + p.name + " for " + q.name + ", in steamers whose owners had calculated the berth to the inch. Letters home asked for money, and then, in later years, for sausages. The census of " + q.name + " recorded them under seventeen different spellings."
    };
  }
});

ev({
  id: "great-depression", scope: "world", weight: 10, minEra: "electric", cooldown: 9999,
  test: function (ctx) { return ctx.year >= 1925; },
  run: function (ctx) {
    const w = ctx.world, live = livePolities(w), b = lastTag(w, "bubble");
    live.forEach(function (p) { lose(p, 0.015); nudge(p, "stability", -0.08); nudge(p, "aggression", 0.04); });
    return {
      importance: 4, actors: live.slice(0, 3).map(function (p) { return ctx.actor(p); }), tags: ["depression"],
      text: "Beginning in " + ctx.year + ", a collapse of credit spread through every telegraph exchange and every connected bank. Unemployment reached " + ctx.int(20, 33) + " per cent in the industrial states, and the price of wheat fell below the cost of the sack. " +
        (b ? "Economists noted that the structure of the crash resembled the bubble of " + b.year + " in everything except size. " : "") + "Governments that had been moderate became decisive, which was not always an improvement."
    };
  }
});

ev({
  id: "customs-union", scope: "polity", weight: 1, minEra: "steam", maxEra: "late", cooldown: 60,
  test: function (ctx) { return ctx.neighbors().length > 0; },
  run: function (ctx) {
    const p = ctx.polity, q = ctx.pick(ctx.neighbors());
    if (!q || (p.relations[q.id] || 0) < -0.2) return null;
    setRel(p, q, Math.min(0.8, (p.relations[q.id] || 0) + 0.4)); tech(p, 0.01); tech(q, 0.01);
    return {
      importance: 2, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(q)], tags: ["customs-union"],
      text: p.name + " and " + q.name + " abolished the tolls on their common frontier in " + ctx.year + ", saving the merchants of both a sum equal to the salary of an army corps. The customs officers were reassigned, mostly to the other side."
    };
  }
});

/* ---------- war that scales ---------- */

ev({
  id: "cabinet-war", scope: "polity", weight: 7, minEra: "sail", maxEra: "mechanical", cooldown: 14,
  test: function (ctx) { return ctx.rivals().length > 0; },
  run: function (ctx) {
    const p = ctx.polity, foe = rivalOf(ctx, p);
    if (!foe || !ctx.chance(0.45)) return null;
    const o = conflict(ctx, p, foe, { frac: ctx.range(0.002, 0.006), take: ctx.chance(0.5), rel: -0.3 });
    const tags = ["war", "cabinet-war"];
    if (o.reg) tags.push.apply(tags, borderTags(o.treaty, o.lose.id, o.win.id, o.reg.id)); else tags.push("treaty:" + o.treaty);
    return {
      importance: 2, regionId: o.reg ? o.reg.id : p.capital, actors: [ctx.actor(o.win), ctx.actor(o.lose)], tags: tags,
      text: warHead(ctx, p, foe) + "Two small armies of " + ARMS[ctx.era] + " marched, besieged and went into winter quarters for " + ctx.int(2, 5) + " seasons; " + num(o.dead) + " died, most of them of dysentery. " +
        "By the " + o.treaty + " " + (o.reg ? o.reg.name + " passed to " + o.win.name : o.win.name + " obtained an indemnity and an apology, both conditional") + "."
    };
  }
});

ev({
  id: "naval-engagement", scope: "polity", weight: 2, minEra: "sail", maxEra: "steam", cooldown: 20,
  test: function (ctx) { return ctx.rivals().length > 0 && ctx.polity.tech > 0.1; },
  run: function (ctx) {
    const p = ctx.polity, q = rivalOf(ctx, p);
    if (!q) return null;
    const a = shipOf(ctx.rng, p), b = shipOf(ctx.rng, q);
    const win = (p.tech + ctx.rng.next() * 0.3) >= (q.tech + ctx.rng.next() * 0.3) ? p : q, los = win === p ? q : p;
    const n = ctx.int(2, 9);
    scale(win, "prestige", 1.07); scale(los, "prestige", 0.94); shiftRel(p, q, -0.3);
    lose(los, 0.0015);
    return {
      importance: 2, regionId: p.capital, actors: [ctx.actor(win), ctx.actor(los)], tags: ["naval"],
      text: "The squadrons of " + p.name + " under the " + a + " and of " + q.name + " under the " + b + " met off the coast in " + ctx.year + " and exchanged fire for " + ctx.int(3, 11) + " hours. " + n + " ships were sunk or taken and " + num(ctx.int(8, 60) * 100) +
        " seamen drowned or burned. " + win.name + " claimed the victory in both capitals, and was, on the evidence of the afternoon, partly justified."
    };
  }
});

ev({
  id: "conscript-war", scope: "polity", weight: 4, minEra: "mechanical", maxEra: "electric", cooldown: 25,
  test: function (ctx) { return withTag(ctx.world, "conscription").length > 0 && ctx.rivals().length > 0; },
  run: function (ctx) {
    const p = ctx.polity, foe = rivalOf(ctx, p);
    if (!foe || !ctx.chance(0.4)) return null;
    const o = conflict(ctx, p, foe, { frac: 0.03, rel: -0.5 });
    const tags = ["war", "conscript-war"];
    if (o.reg) tags.push.apply(tags, borderTags(o.treaty, o.lose.id, o.win.id, o.reg.id)); else tags.push("treaty:" + o.treaty);
    return {
      importance: 4, regionId: o.reg ? o.reg.id : p.capital, actors: [ctx.actor(o.win), ctx.actor(o.lose)], tags: tags,
      text: warHead(ctx, p, foe) + "The armies were raised by conscription and fed by rail, and met in a single decisive campaign of " + ctx.int(7, 15) + " weeks. " + num(o.dead) + " were killed. " +
        "The " + o.treaty + (o.reg ? " transferred " + o.reg.name + " to " + o.win.name : " changed nothing in the map") + ", and both general staffs concluded that the next war would be won by whoever mobilised faster."
    };
  }
});

ev({
  id: "balance-of-power-coalition", scope: "polity", weight: 5, minEra: "powder", maxEra: "late", cooldown: 50,
  test: function (ctx) {
    const live = livePolities(ctx.world); let tot = 0; live.forEach(function (x) { tot += x.regions.length; });
    return ctx.polity.regions.length >= 5 && ctx.polity.regions.length >= 1.8 * tot / live.length && ctx.rivals().length >= 2;
  },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity;
    const mem = ctx.shuffle(ctx.rivals()).slice(0, 3);
    if (mem.length < 2 || !ctx.chance(0.5)) return null;
    mem.forEach(function (m) { setRel(m, p, -0.6); });
    let sum = 0; mem.forEach(function (m) { sum += (m.military + 0.1) * (1 + m.tech) * 0.75; });
    const mine = (p.military + 0.1) * (1 + p.tech);
    const names = joinList(mem.map(function (m) { return m.name; }));
    if (mine > sum * 1.2) {
      scale(p, "prestige", 1.1); lose(p, 0.01); mem.forEach(function (m) { lose(m, 0.008); });
      return {
        importance: 3, regionId: p.capital, actors: [ctx.actor(p)].concat(mem.map(function (m) { return ctx.actor(m); })), tags: ["war", "coalition"],
        text: "In " + ctx.year + " " + names + " formed a coalition against " + p.name + ", whose growth had alarmed all of them equally and for different reasons. The coalition broke before the second campaign, when each member discovered the others' private terms with " + p.name + ". " + p.name + " remained, and was disliked."
      };
    }
    const tags = ["war", "coalition"], lost = [];
    mem.forEach(function (m, i) {
      if (p.regions.length < 3) return;
      const reg = borderRegion(ctx, p, m);
      if (!reg) return;
      regName(ctx, reg, p); ctx.transfer(reg, m); lost.push(reg.name + " to " + m.name);
      if (i === 0) tags.push.apply(tags, borderTags("Peace of the Coalition", p.id, m.id, reg.id));
    });
    lose(p, 0.02); scale(p, "prestige", 0.8); nudge(p, "stability", -0.08);
    return {
      importance: 4, regionId: p.capital, actors: [ctx.actor(mem[0]), ctx.actor(p)].concat(mem.slice(1).map(function (m) { return ctx.actor(m); })), tags: tags,
      text: "In " + ctx.year + " " + names + " combined to check the power of " + p.name + ", which had grown to " + p.regions.length + " provinces. The coalition's armies of " + ARMS[ctx.era] + " won the war in two campaigns; the peace stripped " + p.name + " of " + (lost.length ? joinList(lost) : "its pretensions") + ". The victors' alliance dissolved on the day the treaty was signed."
    };
  }
});

function totalWar(ctx, label, frac) {
  const w = ctx.world, r = ctx.rng, live = livePolities(w).sort(function (a, b) { return b.population - a.population; });
  if (live.length < 4) return null;
  const part = live.slice(0, Math.min(6, live.length)), A = [], B = [];
  part.forEach(function (p, i) { (i === 0 || i === 3 || i === 4 ? A : B).push(p); });
  const str = function (g) { let s = 0; g.forEach(function (p) { s += (p.military + 0.1) * (1 + p.tech) * (0.7 + r.next() * 0.6); }); return s; };
  const aWins = str(A) >= str(B), winners = aWins ? A : B, losers = aWins ? B : A;
  let dead = 0;
  part.forEach(function (p) {
    dead += lose(p, frac * (winners.indexOf(p) >= 0 ? 0.7 : 1.1) * (0.8 + r.next() * 0.4));
    nudge(p, "stability", -0.12); nudge(p, "aggression", 0.05);
  });
  A.forEach(function (a) { B.forEach(function (b) { setRel(a, b, -0.8); }); });
  const tr = treatyName(r, cultureOf(winners[0])), moves = [];
  losers.forEach(function (L) {
    if (L.regions.length < 3) return;
    const W = ctx.pick(winners), reg = borderRegion(ctx, L, W);
    if (reg) { regName(ctx, reg, L); ctx.transfer(reg, W); moves.push({ L: L, W: W, reg: reg }); }
  });
  const worst = losers.slice().sort(function (a, b) { return a.traits.stability - b.traits.stability; })[0];
  let fell = null;
  if (monarchic(worst)) {
    const old = rulerOf(w, worst);
    if (old && old.died == null) ctx.kill(old, "Abdicated in " + ctx.year + " by telegram, at the request of the army.");
    setArch(worst, "revolutionary_republic"); crown(ctx, worst, "revolutionary", "First Citizen"); fell = worst;
  }
  const tags = ["war", "total-war", "world-war", "treaty:" + tr];
  losers.forEach(function (L) { tags.push("loser:" + L.id); });
  moves.forEach(function (m) { tags.push("border-change", "bc:" + tr + "|" + m.L.id + "|" + m.W.id + "|" + m.reg.id); });
  const as = recent(w, "assassination", ctx.year, 12), pact = lastTag(w, "alliance");
  const persons = Math.round(dead * PPU), mil = Math.round(persons * 0.55);
  const text = label + " began in " + ctx.year + (as ? " with the assassination of " + (tagv(as, "victim:") || "a ruler") + " in " + as.year : " over a frontier incident that nobody afterwards remembered clearly") +
    ". The alliances of " + (pact ? pact.year : "the previous generation") + " did the rest, as they had been designed to. " + joinList(A.map(function (p) { return p.name; })) + " fought " + joinList(B.map(function (p) { return p.name; })) +
    " with " + ARMS[ctx.era] + ". Military dead numbered " + num(mil) + "; civilian dead numbered " + num(persons - mil) + ". " + joinList(winners.map(function (p) { return p.name; })) + " prevailed" +
    (moves.length ? "; the " + tr + " moved " + moves.length + " frontier" + (moves.length > 1 ? "s" : "") + "." : ".") + (fell ? " The ruling house of " + fell.name + " did not survive the peace." : "");
  return {
    importance: 5, regionId: winners[0].capital,
    actors: winners.concat(losers).map(function (p) { return ctx.actor(p); }), tags: tags, text: text
  };
}
ev({
  id: "industrial-total-war", scope: "world", weight: 40, minEra: "electric", cooldown: 9999,
  test: function (ctx) { return ctx.year >= 1905 && hasTech(ctx.world, "railways") && hasTech(ctx.world, "telegraph") && !firstTag(ctx.world, "total-war"); },
  run: function (ctx) { return totalWar(ctx, ctx.pick(["The Great War", "The War of the Alliances", "The General War"]), 0.07); }
});
ev({
  id: "second-total-war", scope: "world", weight: 40, minEra: "electric", cooldown: 9999,
  test: function (ctx) {
    const f = firstTag(ctx.world, "total-war");
    return !!f && ctx.year - f.year >= 18 && ctx.year >= 1935 && hasTech(ctx.world, "radio") && hasTech(ctx.world, "flight") && withTag(ctx.world, "total-war").length === 1;
  },
  run: function (ctx) {
    const w = ctx.world, f = firstTag(w, "total-war"), cg = lastTag(w, "congress");
    const e = totalWar(ctx, "The Second General War", 0.09);
    if (!e) return null;
    const ls = tagvAll(f, "loser:").map(function (id) { return w.polities[id]; }).filter(alive);
    e.text += " It was widely held in " + (ls.length ? ls[0].name : "the defeated states") + " to be the continuation of the war of " + f.year + (cg && cg.year > f.year ? ", whose settlement at the " + tagv(cg, "treaty:") + " had been taught as a humiliation for a generation" : "") + ".";
    if (hasTech(w, "fission") && ctx.year >= 1944) e.text += " In its last month two cities were destroyed by single bombs, with a combined death toll of " + num(ctx.int(130, 260) * 1000) + ".";
    return e;
  }
});
ev({
  id: "cold-confrontation", scope: "world", weight: 8, minEra: "atomic", cooldown: 50,
  test: function (ctx) { return hasTech(ctx.world, "fission") && livePolities(ctx.world).length >= 3; },
  run: function (ctx) {
    const live = livePolities(ctx.world).sort(function (a, b) { return b.population - a.population; });
    const a = live[0], b = live[1];
    setRel(a, b, -0.75); nudge(a, "aggression", 0.04); nudge(b, "aggression", 0.04); tech(a, 0.02); tech(b, 0.02);
    return {
      importance: 4, regionId: a.capital, actors: [ctx.actor(a), ctx.actor(b)], tags: ["cold-war"],
      text: "From " + ctx.year + " " + a.name + " and " + b.name + " stood in a confrontation that neither wished to turn hot and neither knew how to end. Between them they held enough fission weapons to destroy every city on both their maps " + ctx.int(3, 11) + " times; the figure was published, and was discussed mostly by people who could not affect it. Their wars were fought in the territories of others, at the others' expense."
    };
  }
});

ev({
  id: "assassination", scope: "polity", weight: 2, minEra: "steam", maxEra: "atomic", cooldown: 40,
  test: function (ctx) { return ctx.polity.ruler != null && monarchic(ctx.polity); },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, q = rivalOf(ctx, p), old = rulerOf(w, p);
    if (!old || !q || !ctx.chance(0.3)) return null;
    const heir = newRuler(ctx, p, "Shot in an open carriage, in " + capName(w, p) + ", on a bright morning.");
    shiftRel(p, q, -0.4); nudge(p, "stability", -0.1);
    return {
      importance: 4, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(q), ctx.actor(heir)], tags: ["assassination", "victim:" + old.name],
      text: old.name + " of " + p.name + " was shot in " + capName(w, p) + " in " + ctx.year + " by a student who had been given the pistol by a society with a name nobody could subsequently agree on. The telegraph carried the news to every capital in forty minutes. " + p.name + " blamed " + q.name + "; " + q.name + " expressed regret in terms that were held to be insufficient."
    };
  }
});

ev({
  id: "arms-race", scope: "polity", weight: 1, minEra: "electric", maxEra: "late", cooldown: 25,
  test: function (ctx) { return ctx.rivals().length > 0; },
  run: function (ctx) {
    const p = ctx.polity, q = rivalOf(ctx, p);
    if (!q) return null;
    nudge(p, "aggression", 0.05); tech(p, 0.01); shiftRel(p, q, -0.2);
    return {
      importance: 2, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(q)], tags: ["arms-race"],
      text: "The naval estimates of " + p.name + " were doubled in " + ctx.year + " in reply to those of " + q.name + ", which had been doubled in reply to those of " + p.name + ". Each side described its programme as purely defensive, and its rival's as a menace. The cost of one heavy ship equalled the annual budget of the schools."
    };
  }
});

ev({
  id: "press-campaign", scope: "polity", weight: 1.2, minEra: "steam", maxEra: "late", cooldown: 20,
  test: function (ctx) { return hasTech(ctx.world, "printing") && ctx.rivals().length > 0; },
  run: function (ctx) {
    const p = ctx.polity, q = rivalOf(ctx, p);
    if (!q) return null;
    shiftRel(p, q, -0.25); nudge(p, "aggression", 0.03);
    return {
      importance: 1, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(q)], tags: ["press"],
      text: "The newspapers of " + capName(ctx.world, p) + " ran in " + ctx.year + " a campaign against " + q.name + " whose first headline read '" + headline(ctx, p, q) + "'. Circulation doubled; so did the number of questions in the assembly."
    };
  }
});

/* ---------- diplomacy ---------- */

ev({
  id: "alliance-pact", scope: "polity", weight: 1.5, minEra: "powder", maxEra: "late", cooldown: 25,
  test: function (ctx) { return ctx.neighbors().length > 0 || ctx.rivals().length > 0; },
  run: function (ctx) {
    const p = ctx.polity, q = ctx.pick(otherPolities(ctx, p));
    if (!q || (p.relations[q.id] || 0) < -0.3) return null;
    setRel(p, q, Math.min(0.9, (p.relations[q.id] || 0) + 0.45));
    const tr = treatyName(ctx.rng, cultureOf(p));
    return {
      importance: 2, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(q)], tags: ["alliance", "pact:" + p.name + "|" + q.name, "treaty:" + tr],
      text: p.name + " and " + q.name + " signed the " + tr + " in " + ctx.year + ", promising each other aid if either were attacked by a named third party. The third party was not named in the published text. The military annexe, which was not published, ran to nine pages and named it twice."
    };
  }
});

ev({
  id: "secret-treaty", scope: "polity", weight: 3, minEra: "mechanical", maxEra: "electric", cooldown: 40,
  test: function (ctx) { return ctx.polity.traits.cunning > 0.35; },
  run: function (ctx) {
    const p = ctx.polity, q = ctx.pick(otherPolities(ctx, p));
    if (!q || !ctx.chance(0.4)) return null;
    const tr = treatyName(ctx.rng, cultureOf(q));
    setRel(p, q, Math.min(0.9, (p.relations[q.id] || 0) + 0.4));
    return {
      importance: 2, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(q)], tags: ["secret-treaty", "secret:" + q.id, "treaty:" + tr],
      text: "At " + tr.replace("Treaty of ", "") + " in " + ctx.year + " the ministers of " + p.name + " and " + q.name + " signed a convention whose existence both governments afterwards denied. Its third article divided the territory of a neighbour that had not been consulted. The only copy kept in " + p.name + " was filed under 'Household'."
    };
  }
});

ev({
  id: "secret-treaty-revealed", scope: "polity", weight: 12, minEra: "steam", maxEra: "late", cooldown: 20,
  test: function (ctx) { return withTag(ctx.world, "secret-treaty").length > 0; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, st = withTag(w, "secret-treaty");
    let t = null;
    for (let i = 0; i < st.length; i++) {
      if (involves(st[i], p.id) && ctx.year - st[i].year >= 10 && ctx.year - st[i].year <= 70 && !withTag(w, "revealed:" + st[i].id).length) { t = st[i]; break; }
    }
    if (!t || !ctx.chance(0.5)) return null;
    const q = w.polities[tagv(t, "secret:")];
    livePolities(w).forEach(function (x) { if (x.id !== p.id && x.id !== (q && q.id)) shiftRel(x, p, -0.25); });
    nudge(p, "stability", -0.06); scale(p, "prestige", 0.9);
    return {
      importance: 3, regionId: p.capital, actors: [ctx.actor(p)].concat(q ? [ctx.actor(q)] : []), tags: ["revealed:" + t.id, "scandal"],
      text: "A clerk's memoir, published in " + ctx.year + ", disclosed the " + tagv(t, "treaty:") + " of " + t.year + " between " + p.name + " and " + (q ? q.name : "a neighbour") + ", and with it the secret article. Every government that had been described in it, and several that had not, summoned its ambassador. The memoir's author was prosecuted for libel and, when the original was produced, for accuracy."
    };
  }
});

ev({
  id: "peace-treaty", scope: "polity", weight: 5, minEra: "sail", cooldown: 15,
  test: function (ctx) { return !!recent(ctx.world, "war", ctx.year, 6, ctx.polity.id); },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, e = recent(w, "war", ctx.year, 6, p.id);
    const q = w.polities[actorOf(e, "polity", 0) === p.id ? actorOf(e, "polity", 1) : actorOf(e, "polity", 0)];
    if (!alive(q) || (p.relations[q.id] || 0) > 0.05 || ctx.year - e.year < 2) return null;
    setRel(p, q, 0.05); nudge(p, "aggression", -0.03);
    const tr = treatyName(ctx.rng, cultureOf(q));
    return {
      importance: 2, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(q)], tags: ["peace", "treaty:" + tr],
      text: "The " + tr + " of " + ctx.year + " ended the state of hostility between " + p.name + " and " + q.name + " that had followed the war of " + e.year + ". It was ratified in both capitals with salutes, and in both public archives with a certain relief that nobody would be asked to sign anything else."
    };
  }
});

ev({
  id: "congress-redraws-map", scope: "world", weight: 10, minEra: "mechanical", cooldown: 30,
  test: function (ctx) {
    const tags = ["total-war", "coalition", "confessional-war", "succession-war", "conscript-war"];
    for (let i = 0; i < tags.length; i++) if (recent(ctx.world, tags[i], ctx.year, 6)) return true;
    return false;
  },
  run: function (ctx) {
    const w = ctx.world, live = livePolities(w);
    if (live.length < 4 || !ctx.chance(0.6)) return null;
    const host = ctx.pick(live), name = congressName(ctx.rng, cultureOf(host)), tr = "Final Act of the " + name;
    const moves = [], tags = ["congress", "treaty:" + tr, "border-change"];
    const n = ctx.int(2, 4);
    for (let k = 0; k < n; k++) {
      const L = ctx.pick(live.filter(function (p) { return p.regions.length >= 3 && alive(p); }));
      if (!L) break;
      const nb = ctx.neighbors(L);
      if (!nb.length) continue;
      const W = ctx.pick(nb), reg = borderRegion(ctx, L, W);
      if (!reg) continue;
      regName(ctx, reg, L); ctx.transfer(reg, W);
      moves.push(reg.name + " from " + L.name + " to " + W.name);
      tags.push("bc:" + tr + "|" + L.id + "|" + W.id + "|" + reg.id);
    }
    if (!moves.length) return null;
    return {
      importance: 4, regionId: host.capital, actors: [ctx.actor(host)], tags: tags,
      text: "The " + name + " sat for " + ctx.int(7, 22) + " months in " + capName(w, host) + " in " + ctx.year + ", and its plenipotentiaries, who had been instructed to restore the balance, redrew the frontiers of the continent by unanimous vote: " + joinList(moves) + ". None of the populations affected were consulted. The Final Act was signed at a ball, in good humour, by men who did not expect to live to see how it worked."
    };
  }
});

/* ---------- memory: old kingdoms, old borders, old injuries ---------- */

ev({
  id: "unification-movement", scope: "polity", weight: 2, minEra: "steam", maxEra: "late", cooldown: 80,
  test: function (ctx) { return ctx.neighbors().length > 0; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, cid = cultureOf(p);
    const kin = ctx.neighbors().filter(function (q) { return cultureOf(q) === cid && q.regions.length <= p.regions.length && q.regions.length <= 6; });
    if (!kin.length) return null;
    const q = ctx.pick(kin);
    let med = null, mYear = ctx.int(1040, 1290);
    const prior = withTag(w, "uc-name:" + cid);
    if (prior.length) { med = tagv(prior[0], "medieval:"); mYear = Number(tagv(prior[0], "medieval-year:")); }
    else med = "Kingdom of " + polityIn(ctx.rng, cid).name;
    nudge(p, "aggression", 0.06); nudge(p, "stability", 0.03);
    const absorb = p.military > q.military * 1.15 && ctx.chance(0.5);
    const tags = ["unification", "uc-name:" + cid, "medieval:" + med, "medieval-year:" + mYear];
    let tail = " " + q.name + " declined the invitation, citing the same history from a different chapter.";
    if (absorb) {
      const regs = q.regions.slice();
      ctx.endPolity(q, "Absorbed into " + p.name + " in a movement of national unification, to general acclamation in " + p.name + " and a long silence in " + q.name + ".");
      regs.forEach(function (id) { const r = w.regions[id]; ctx.transfer(r, p); });
      tags.push.apply(tags, borderTags("Act of Unification", q.id, p.id, regs[0]));
      tail = " " + q.name + " was absorbed within " + ctx.int(2, 6) + " years, by plebiscite in the provinces where the vote was held and by proclamation elsewhere.";
    }
    return {
      importance: 4, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(q)], tags: tags,
      text: "A movement in " + p.name + " in " + ctx.year + " called for the reunion of all speakers of one language under the banner of the " + med + ", which had last held them together in " + mYear + ", for a little under a generation. Its poets, historians and a society of gymnasts taught that the intervening " + (ctx.year - mYear) + " years had been an interruption." + tail
    };
  }
});

ev({
  id: "irredentist-claim", scope: "polity", weight: 2, minEra: "steam", maxEra: "late", cooldown: 60,
  test: function (ctx) { return withTag(ctx.world, "border-change").length > 0; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, evs = withTag(w, "border-change"), found = [];
    for (let i = 0; i < evs.length; i++) {
      const age = ctx.year - evs[i].year;
      if (age < 150 || age > 420) continue;
      bcMoves(evs[i]).forEach(function (m) {
        const reg = w.regions[m.reg];
        if (m.from === p.id && reg && reg.owner != null && reg.owner !== p.id && alive(w.polities[reg.owner])) found.push(m);
      });
    }
    if (!found.length) return null;
    const m = ctx.pick(found), reg = w.regions[m.reg], O = w.polities[reg.owner];
    shiftRel(p, O, -0.4); nudge(p, "aggression", 0.05);
    let took = false;
    if (p.military > O.military * 1.4 && O.regions.length > 1 && ctx.chance(0.4)) { ctx.transfer(reg, p); took = true; }
    const tags = ["irredentism"];
    if (took) tags.push.apply(tags, borderTags("Annexation", O.id, p.id, reg.id));
    return {
      importance: 3, regionId: reg.id, actors: [ctx.actor(p), ctx.actor(O), ctx.actor(reg)], tags: tags,
      text: "In " + ctx.year + " the government of " + p.name + " published a map showing the frontier as it had stood before the " + m.treaty + " of " + m.year + ", " + (ctx.year - m.year) + " years earlier, and described the province of " + reg.name +
        " as 'temporarily administered' by " + O.name + ". " + (took ? "The army crossed the line a month later, and the map was reissued with the line removed." : O.name + " replied that the treaty was older than anyone alive and that so, therefore, was the claim; the exchange of notes was published in six languages.")
    };
  }
});

ev({
  id: "war-of-revenge", scope: "polity", weight: 2.5, minEra: "mechanical", maxEra: "late", cooldown: 60,
  test: function (ctx) { return withTag(ctx.world, "war").length > 0 && ctx.polity.traits.aggression > 0.4; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, wars = withTag(w, "war");
    let hit = null;
    for (let i = wars.length - 1; i >= 0; i--) {
      const e = wars[i], age = ctx.year - e.year;
      if (age < 20) continue;
      if (age > 220) break;
      if (actorOf(e, "polity", 1) === p.id && actorOf(e, "polity", 0) !== p.id && alive(w.polities[actorOf(e, "polity", 0)]) && !withTag(w, "avenged:" + e.id).length) { hit = e; break; }
    }
    if (!hit || !ctx.chance(0.5)) return null;
    const foe = w.polities[actorOf(hit, "polity", 0)], tr = tagv(hit, "treaty:");
    const o = conflict(ctx, p, foe, { frac: 0.04, rel: -0.6 });
    const tags = ["war", "revenge", "avenged:" + hit.id];
    if (o.reg) tags.push.apply(tags, borderTags(o.treaty, o.lose.id, o.win.id, o.reg.id));
    return {
      importance: 4, regionId: o.reg ? o.reg.id : p.capital, actors: [ctx.actor(o.win), ctx.actor(o.lose)], tags: tags,
      text: "In " + ctx.year + " " + p.name + " went to war with " + foe.name + " to avenge its defeat of " + hit.year + (tr ? " and the " + tr + " that had followed it, a text printed on the first page of every " + p.adjective + " primer" : "") +
        ". Mobilisation was greeted with songs, and the songs were about the previous war. " + num(o.dead) + " died. " + o.win.name + " won" + (o.reg ? ", and " + o.reg.name + " changed hands" : "") + "; " + o.lose.name + " began at once to remember it."
    };
  }
});

ev({
  id: "treaty-repudiated", scope: "polity", weight: 1.5, minEra: "electric", maxEra: "late", cooldown: 80,
  test: function (ctx) { return withTag(ctx.world, "border-change").length > 0 && ctx.polity.traits.aggression > 0.45; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, evs = withTag(w, "border-change");
    for (let i = evs.length - 1; i >= 0; i--) {
      const age = ctx.year - evs[i].year;
      if (age < 8) continue;
      if (age > 60) break;
      const ms = bcMoves(evs[i]);
      for (let j = 0; j < ms.length; j++) {
        const m = ms[j], W = w.polities[m.to];
        if (m.from === p.id && alive(W) && W.id !== p.id) {
          shiftRel(p, W, -0.5); nudge(p, "aggression", 0.1); nudge(p, "stability", 0.04);
          return {
            importance: 3, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(W)], tags: ["repudiation"],
            text: "In " + ctx.year + " " + styled(w, p) + " announced in a broadcast that " + p.name + " no longer considered itself bound by the " + m.treaty + " of " + m.year + ", which had been imposed on it, the speaker said, at a moment of weakness. " + W.name + " protested; the other powers noted the protest and agreed to take no action, in view of the weather."
          };
        }
      }
    }
    return null;
  }
});

ev({
  id: "commemoration", scope: "polity", weight: 1.5, minEra: "mechanical", maxEra: "late", cooldown: 70,
  test: function (ctx) { return withTag(ctx.world, "war").length > 0; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, ws = withTag(w, "war");
    let e = null;
    for (let i = 0; i < ws.length; i++) {
      if (ctx.year - ws[i].year >= 200 && involves(ws[i], p.id)) { e = ws[i]; break; }
    }
    if (!e || !ctx.chance(0.5)) return null;
    scale(p, "prestige", 1.06); nudge(p, "stability", 0.04);
    const foe = w.polities[actorOf(e, "polity", 0) === p.id ? actorOf(e, "polity", 1) : actorOf(e, "polity", 0)];
    return {
      importance: 2, regionId: p.capital, actors: [ctx.actor(p)], tags: ["commemoration"],
      text: "In " + ctx.year + " " + p.name + " marked the " + (ctx.year - e.year) + "th anniversary of the war of " + e.year + (foe ? " with " + foe.name : "") + " with a monument, a march past and a postage stamp. Veterans, the official programme noted, would have been unable to attend."
    };
  }
});

/* ---------- Near-Eastern and East-Asian paths through modernity ---------- */

ev({
  id: "opened-by-gunboats", scope: "polity", weight: 5, minEra: "steam", maxEra: "electric", cooldown: 9999,
  test: function (ctx) { return ["sultanate", "shogunate", "autocratic_empire"].indexOf(ctx.polity.archetypeId) >= 0 && ctx.polity.regions.length >= 3; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, live = livePolities(w).sort(function (a, b) { return b.tech - a.tech; });
    const pio = live[0];
    if (!pio || pio.id === p.id || pio.tech < p.tech + 0.12) return null;
    const reg = borderRegion(ctx, p, pio), tr = "Treaty of " + townOf(ctx.rng, p);
    if (!reg) return null;
    regName(ctx, reg, p); ctx.transfer(reg, pio);
    tech(p, 0.05); nudge(p, "stability", -0.1); scale(pio, "prestige", 1.05);
    return {
      importance: 4, regionId: reg.id, actors: [ctx.actor(pio), ctx.actor(p), ctx.actor(reg)], tags: ["unequal-treaty", "treaty:" + tr].concat(borderTags(tr, p.id, pio.id, reg.id)),
      text: "A squadron of steam-driven iron ships of " + pio.name + " anchored off " + capName(w, p) + " in " + ctx.year + " and delivered a letter. The " + tr + " that resulted opened the ports of " + p.name + " to foreign trade, fixed its tariffs by agreement, and ceded " + reg.name + " as a treaty port. The court afterwards described the arrangement as friendly, and set about acquiring iron ships."
    };
  }
});

ev({
  id: "modernising-reform", scope: "polity", weight: 4, minEra: "steam", maxEra: "electric", cooldown: 9999,
  test: function (ctx) { return ["sultanate", "shogunate"].indexOf(ctx.polity.archetypeId) >= 0 && !!evAbout(ctx.world, "unequal-treaty", ctx.polity.id); },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, tr = evAbout(w, "unequal-treaty", p.id);
    if (ctx.year - tr.year < 6 || !ctx.chance(0.5)) return null;
    const was = p.archetypeId === "shogunate" ? "the shogunate" : "the sultanate";
    setArch(p, "composite_monarchy");
    const old = rulerOf(w, p);
    const heir = newRuler(ctx, p, "Retired by a reform council to a palace with no telegraph.");
    tech(p, 0.12); nudge(p, "curiosity", 0.1); nudge(p, "stability", -0.04);
    return {
      importance: 4, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(heir)], tags: ["reform", "modernisation"],
      text: "In " + ctx.year + ", " + (ctx.year - tr.year) + " years after the " + tagv(tr, "treaty:") + ", a council of reformers abolished " + was + " in " + p.name + ", replaced the retainers with a conscript army, laid a railway to the coast and sent " + ctx.int(40, 300) +
        " students abroad with instructions to return knowing everything. " + heir.name + " was proclaimed sovereign of a constitutional state, a form of government that no one at court had previously found necessary."
    };
  }
});

ev({
  id: "scientific-academy", scope: "polity", weight: 1.2, minEra: "mechanical", maxEra: "late", cooldown: 60,
  test: function (ctx) { return ctx.polity.tech > 0.3; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, reg = w.regions[p.capital];
    const art = ctx.newArtifact({ kind: "treatise", region: reg, power: 0.4, legend: "A founding memorandum of " + p.name + "'s academy, " + ctx.year + "." });
    tech(p, 0.02); nudge(p, "curiosity", 0.04);
    return {
      importance: 2, regionId: p.capital, actors: [ctx.actor(p), ctx.actor(art)], tags: ["academy"],
      text: "The Academy of " + capName(w, p) + " was chartered in " + ctx.year + " 'for the improvement of natural knowledge and the confusion of error', and its first publication, " + art.name + ", was a measurement of the length of the capital's longest street. It was, by the standards of the time, rigorous."
    };
  }
});

ev({
  id: "railway-boom", scope: "polity", weight: 6, minEra: "steam", maxEra: "electric", cooldown: 9999,
  test: function (ctx) { return hasTech(ctx.world, "railways") && ctx.polity.tech > 0.3; },
  run: function (ctx) {
    const p = ctx.polity, u = gain(p, 0.1);
    tech(p, 0.02);
    return {
      importance: 3, regionId: p.capital, actors: [ctx.actor(p)], tags: ["railway-boom"],
      text: "A railway mania in " + p.name + " laid " + num(ctx.int(3, 40) * 1000) + " kilometres of track between " + (ctx.year - 12) + " and " + ctx.year + ", a third of it through country where no train was ever expected to run. Grain reached the ports for half the cost, regiments could be at the frontier in a day, and the population grew by " + people(u) + "."
    };
  }
});

/* ---------- the late modern ---------- */

ev({
  id: "referendum-secession", scope: "polity", weight: 3, minEra: "atomic", maxEra: "late", cooldown: 40,
  test: function (ctx) { return ctx.polity.regions.length >= 4; },
  run: function (ctx) {
    const w = ctx.world, p = ctx.polity, rs = polRegions(w, p).filter(function (r) { return r.id !== p.capital; });
    if (!rs.length || !ctx.chance(0.3)) return null;
    const reg = ctx.pick(rs), np = breakaway(ctx, reg, "confederation", p);
    if (!np) return null;
    setRel(p, np, 0.1);
    return {
      importance: 3, regionId: reg.id, actors: [ctx.actor(p), ctx.actor(np), ctx.actor(reg)], tags: ["secession", "founding"],
      text: "A referendum held in " + reg.name + " in " + ctx.year + " returned " + ctx.int(52, 61) + " per cent in favour of leaving " + p.name + " on a turnout of " + ctx.int(71, 88) + " per cent. The government of " + p.name + " called the question unconstitutional, then agreed to count the result, then agreed to honour it. " + np.name + " applied for membership of everything the same afternoon."
    };
  }
});

ev({
  id: "supranational-union", scope: "world", weight: 8, minEra: "atomic", cooldown: 9999,
  test: function (ctx) { return livePolities(ctx.world).length >= 4; },
  run: function (ctx) {
    const w = ctx.world, live = livePolities(w), seed = ctx.pick(live), nb = ctx.neighbors(seed).slice(0, 2);
    if (nb.length < 2) return null;
    const all = [seed].concat(nb);
    all.forEach(function (a) { all.forEach(function (b) { if (a !== b) setRel(a, b, 0.85); }); tech(a, 0.02); nudge(a, "stability", 0.05); });
    setArch(seed, "confederation");
    const name = "Union of " + seed.name;
    return {
      importance: 4, regionId: seed.capital, actors: all.map(function (p) { return ctx.actor(p); }), tags: ["union", "supranational"],
      text: "In " + ctx.year + " " + joinList(all.map(function (p) { return p.name; })) + " pooled their customs, their coal and the right to declare war on one another, and called the result the " + name + ". The founding treaty was written by three generations of lawyers whose grandfathers had killed each other's grandfathers, a fact the preamble addressed in its third paragraph."
    };
  }
});

ev({
  id: "energy-crisis", scope: "world", weight: 8, minEra: "late", cooldown: 9999,
  test: function (ctx) { return hasTech(ctx.world, "internal-combustion"); },
  run: function (ctx) {
    const live = livePolities(ctx.world);
    live.forEach(function (p) { nudge(p, "stability", -0.05); });
    return {
      importance: 3, actors: live.slice(0, 2).map(function (p) { return ctx.actor(p); }), tags: ["crisis"],
      text: "In " + ctx.year + " the price of liquid fuel quadrupled in a single winter. Every state that had built its roads for the internal combustion engine discovered what that meant. Speed limits were introduced, and in several capitals the bicycle returned for a season, in a spirit of reproach."
    };
  }
});

ev({
  id: "global-pandemic", scope: "world", weight: 8, minEra: "late", cooldown: 40,
  test: function (ctx) { return ctx.year >= 2010; },
  run: function (ctx) {
    const live = livePolities(ctx.world), inoc = hasTech(ctx.world, "inoculation");
    live.forEach(function (p) { lose(p, 0.004); nudge(p, "stability", -0.04); });
    return {
      importance: 4, actors: live.slice(0, 3).map(function (p) { return ctx.actor(p); }), tags: ["plague", "pandemic"],
      text: "A respiratory disease crossed every frontier in " + ctx.year + " in the baggage of air travellers, and killed " + num(ctx.int(2, 9) * 1000000) + " people in " + ctx.int(2, 4) + " years. " + (inoc ? "The principle of inoculation was four centuries old; the difficulty was one of distribution and trust. " : "") + "Borders closed, airlines stopped, and a generation learned to conduct its business through glass."
    };
  }
});

ev({
  id: "climate-displacement", scope: "polity", weight: 1.2, minEra: "late", cooldown: 40,
  test: function (ctx) { return ctx.year >= 2030 && ctx.polity.population > 3000; },
  run: function (ctx) {
    const p = ctx.polity, u = lose(p, ctx.range(0.01, 0.04));
    nudge(p, "stability", -0.05);
    const q = rivalOf(ctx, p);
    if (q) q.population += Math.round(u * 0.6);
    return {
      importance: 3, regionId: p.capital, actors: [ctx.actor(p)].concat(q ? [ctx.actor(q)] : []), tags: ["climate"],
      text: "By " + ctx.year + " the sea had taken the lower districts of " + capName(ctx.world, p) + ", and " + people(u) + " people from the flooded coast and the failed harvests of " + p.name + " had moved inland or abroad" + (q ? ", most of them to " + q.name : "") +
        ". A commission established in " + (ctx.year - 30) + " to consider the problem published its final report in the same week, having been overtaken."
    };
  }
});

/* ===================================================================== */
/* 7. Registration                                                        */
/* ===================================================================== */

const ARCHETYPES = [
  { id: "composite_monarchy", name: "Composite Monarchy", traitBias: { stability: 0.1, piety: 0.05 }, blurb: "Several crowns worn by one head, each with its own laws and its own grievances." },
  { id: "maritime_republic", name: "Maritime Republic", traitBias: { cunning: 0.2, curiosity: 0.1, aggression: -0.05 }, blurb: "A trading city governed by those who own the ships." },
  { id: "chartered_company", name: "Chartered Company", traitBias: { cunning: 0.2, aggression: 0.1, piety: -0.15 }, blurb: "A commercial monopoly that has discovered it can also tax." },
  { id: "confederation", name: "Confederation", traitBias: { stability: -0.05, curiosity: 0.05 }, blurb: "Sovereign cantons that agree on very little, loudly, and on defence, quietly." },
  { id: "sultanate", name: "Sultanate", traitBias: { aggression: 0.15, piety: 0.15, stability: 0.05 }, blurb: "A dynastic empire of tax-farms, slave-soldiers and scrupulous bureaucrats." },
  { id: "shogunate", name: "Shogunate", traitBias: { stability: 0.2, curiosity: -0.1, aggression: -0.05 }, blurb: "A military government ruling in the name of a court that has not ruled for centuries." },
  { id: "elective_kingdom", name: "Elective Kingdom", traitBias: { stability: -0.15, cunning: 0.1 }, blurb: "A crown awarded by a diet of nobles, who do not intend to be generous twice." },
  { id: "merchant_league", name: "Merchant League", traitBias: { cunning: 0.15, curiosity: 0.1, aggression: -0.1 }, blurb: "Free cities bound by a common coinage and a common distrust of kings." },
  { id: "revolutionary_republic", name: "Revolutionary Republic", traitBias: { aggression: 0.2, stability: -0.2, curiosity: 0.1 }, blurb: "A state founded on principle, and therefore in a hurry." },
  { id: "colonial_dominion", name: "Colonial Dominion", traitBias: { curiosity: 0.1, stability: -0.05, aggression: 0.05 }, blurb: "Settlers' states, loyal in principle and increasingly in doubt." },
  { id: "autocratic_empire", name: "Autocratic Empire", traitBias: { aggression: 0.1, stability: 0.1, curiosity: -0.05 }, blurb: "A single throne over many peoples and a very large map." }
];
ARCHETYPES.forEach(function (a) { ARCH_NAME[a.id] = a.name; });

AEON.registerPack({
  id: "althistory",
  name: "What If",
  icon: "🔀",
  blurb: "An early-modern world in which one small accident, an ill heir, a scattered fleet or a treaty signed a year early, propagates through eight centuries of consequences.",
  scale: "planet",
  startYear: 1400,
  endYear: 2200,
  timeStep: 2,
  seedPolities: 12,

  yearLabel: function (y) { return String(y); },

  biomes: {
    barren:    { name: "Open Ocean",       color: "#1d3a5f", habitability: 0.0 },
    ice:       { name: "Polar Ice",        color: "#e4edf5", habitability: 0.03 },
    tundra:    { name: "Frozen Steppe",    color: "#b8c6d9", habitability: 0.15 },
    taiga:     { name: "Boreal Forest",    color: "#3d6b53", habitability: 0.4 },
    grassland: { name: "Arable Plain",     color: "#9cb86a", habitability: 0.9 },
    forest:    { name: "Old Woodland",     color: "#3f7a45", habitability: 0.75 },
    jungle:    { name: "Tropical Coast",   color: "#1f6b3a", habitability: 0.55 },
    savanna:   { name: "Dry Savanna",      color: "#c9b45a", habitability: 0.5 },
    desert:    { name: "Desert",           color: "#d8c38a", habitability: 0.15 },
    mountain:  { name: "Highlands",        color: "#8a8478", habitability: 0.3 },
    swamp:     { name: "Fenland",          color: "#5a6b4a", habitability: 0.3 }
  },

  eras: [
    { id: "sail",       name: "The Age of Sail",           from: 1400 },
    { id: "powder",     name: "The Age of Powder",         from: 1560 },
    { id: "mechanical", name: "The Mechanical Age",        from: 1690 },
    { id: "steam",      name: "The Age of Steam and Steel", from: 1790 },
    { id: "electric",   name: "The Electric Age",          from: 1880 },
    { id: "atomic",     name: "The Atomic Age",            from: 1945 },
    { id: "late",       name: "The Late Modern",           from: 1990 }
  ],

  archetypes: ARCHETYPES,

  names: N,

  events: EVENTS,

  flavor: {
    casusBelli: CASUS_BELLI,
    slogans: SLOGANS,
    headlines: HEADLINES,
    lastWords: LAST_WORDS,
    epitaphs: LAST_WORDS,
    treatyTowns: TREATY_TOWNS,
    dynasties: DYNASTIES,
    confessions: CONFESSIONS
  }
});

})();
