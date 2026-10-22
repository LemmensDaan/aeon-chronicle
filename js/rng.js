/* Aeon — seeded deterministic RNG. The only source of randomness in the project.
   Math.random() must never appear anywhere else. */
(function () {
"use strict";

const AEON = window.AEON = window.AEON || {};

/* sfc32 — small, fast, good distribution, 128-bit state. */
function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/* Mix an arbitrary string or number into four well-distributed 32-bit seeds. */
function scramble(seed) {
  let h = 1779033703 ^ String(seed).length;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const out = [];
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    out.push(h >>> 0);
  }
  return out;
}

function RNG(seed) {
  const s = scramble(seed == null ? 0 : seed);
  const core = sfc32(s[0], s[1], s[2], s[3]);
  for (let i = 0; i < 12; i++) core();   // warm up

  let spareGauss = null;

  const api = {
    seed: seed,

    next: core,

    /* float in [a,b) — or [0,a) with one argument */
    range: function (a, b) {
      if (b === undefined) { b = a; a = 0; }
      return a + core() * (b - a);
    },

    /* inclusive integer in [a,b] — or [0,a] with one argument */
    int: function (a, b) {
      if (b === undefined) { b = a; a = 0; }
      return Math.floor(a + core() * (b - a + 1));
    },

    chance: function (p) { return core() < p; },

    pick: function (arr) {
      if (!arr || !arr.length) return undefined;
      return arr[Math.floor(core() * arr.length)];
    },

    /* pick n distinct elements */
    sample: function (arr, n) {
      const copy = api.shuffle(arr);
      return copy.slice(0, Math.min(n, copy.length));
    },

    shuffle: function (arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(core() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },

    /* weighted pick. items may be [{weight}] or paired with a weight function. */
    weighted: function (items, weightFn) {
      if (!items || !items.length) return undefined;
      let total = 0;
      const w = new Array(items.length);
      for (let i = 0; i < items.length; i++) {
        const v = weightFn ? weightFn(items[i]) : (items[i].weight || 0);
        w[i] = v > 0 ? v : 0;
        total += w[i];
      }
      if (total <= 0) return api.pick(items);
      let r = core() * total;
      for (let i = 0; i < items.length; i++) {
        r -= w[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },

    /* standard normal, Box-Muller with a cached spare */
    gauss: function () {
      if (spareGauss !== null) { const v = spareGauss; spareGauss = null; return v; }
      let u = 0, v = 0, s = 0;
      do {
        u = core() * 2 - 1;
        v = core() * 2 - 1;
        s = u * u + v * v;
      } while (s >= 1 || s === 0);
      const f = Math.sqrt(-2 * Math.log(s) / s);
      spareGauss = v * f;
      return u * f;
    },

    /* normal clamped to [lo,hi] — handy for trait rolls */
    trait: function (mean, spread, lo, hi) {
      const v = (mean === undefined ? 0.5 : mean) + api.gauss() * (spread === undefined ? 0.18 : spread);
      return Math.max(lo === undefined ? 0 : lo, Math.min(hi === undefined ? 1 : hi, v));
    },

    /* a derived, independent stream — lets a subsystem draw without disturbing
       the parent sequence, while staying fully deterministic */
    fork: function (label) {
      return RNG(String(seed) + "/" + label + "/" + Math.floor(core() * 4294967296));
    },
  };

  return api;
}

AEON.RNG = RNG;

})();
