/* Koppen-Geiger by the standard rules on 12 months (Peel et al. 2007), with Koppen's -3 C between
   C and D as planetgen uses. Summer is April-September in the north. t: 12 monthly means in C,
   p: 12 monthly totals in mm, lat: degrees. Shared by the Earth tests. */
"use strict";

function koppenMonthly(t, p, lat) {
  const MAT = t.reduce((s, v) => s + v, 0) / 12, MAP = p.reduce((s, v) => s + v, 0);
  const Thot = Math.max(...t), Tcold = Math.min(...t);
  const sumIdx = lat >= 0 ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2];
  const winIdx = lat >= 0 ? [9, 10, 11, 0, 1, 2] : [3, 4, 5, 6, 7, 8];
  const Ps = sumIdx.reduce((s, k) => s + p[k], 0), Pw = MAP - Ps;
  const Pdry = Math.min(...p), Psdry = Math.min(...sumIdx.map((k) => p[k])), Pwdry = Math.min(...winIdx.map((k) => p[k]));
  const Pswet = Math.max(...sumIdx.map((k) => p[k])), Pwwet = Math.max(...winIdx.map((k) => p[k]));
  if (Thot < 10) return Thot < 0 ? "EF" : "ET";
  const pth = 20 * MAT + (Ps >= 0.7 * MAP ? 280 : Pw >= 0.7 * MAP ? 0 : 140);
  if (MAP < pth) return (MAP < pth / 2 ? "BW" : "BS") + (MAT >= 18 ? "h" : "k");
  if (Tcold >= 18) return Pdry >= 60 ? "Af" : Pdry >= 100 - MAP / 25 ? "Am" : Psdry < Pwdry ? "As" : "Aw";
  const second = Psdry < 40 && Psdry < Pwwet / 3 ? "s" : Pwdry < Pswet / 10 ? "w" : "f";
  const warm10 = t.filter((v) => v >= 10).length;
  const third = Thot >= 22 ? "a" : warm10 >= 4 ? "b" : Tcold < -38 ? "d" : "c";
  return (Tcold > -3 ? "C" : "D") + second + third;
}

module.exports = { koppenMonthly };
