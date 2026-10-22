/* Aeon chronicle: style.js. The chronicle's stylesheet, injected once on mount.
 * Part of the chronicle browser; see js/chronicle/base.js for how the parts fit together. */
(function () {
"use strict";
var AEON = window.AEON, C = AEON._chronicle;

/* ---------- CSS ---------- */
var DARK_VARS = "--ch-bg:#1b1916;--ch-panel:#242120;--ch-ink:#e8e1d2;--ch-mute:#a1988a;--ch-rule:#3b362f;--ch-accent:#e58b5c;--ch-link:#86bcdb;--ch-hi:#3a3322;--ch-i5:#f0a27a;";
var CSS = [
".ch-root{--ch-bg:#f6f2e8;--ch-panel:#fffdf6;--ch-ink:#2a2621;--ch-mute:#766d61;--ch-rule:#ddd3c0;--ch-accent:#8a3b1e;--ch-link:#1d5878;--ch-hi:#f0e5c6;--ch-i5:#7a1f12;" +
  "--ch-serif:Georgia,'Iowan Old Style','Palatino Linotype',Palatino,'Book Antiqua','Times New Roman',serif;--ch-sans:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;" +
  "display:flex;flex-direction:column;height:100%;min-height:480px;background:var(--ch-bg);color:var(--ch-ink);font-family:var(--ch-serif);font-size:17px;line-height:1.65;box-sizing:border-box;position:relative;overflow:hidden}",
":root[data-theme='dark'] .ch-root{" + DARK_VARS + "}",
"@media (prefers-color-scheme:dark){:root:not([data-theme]) .ch-root{" + DARK_VARS + "}}",
".ch-root *{box-sizing:border-box}",
".ch-bar{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--ch-rule);background:var(--ch-panel);font-family:var(--ch-sans);font-size:14px;line-height:1.3}",
".ch-btn{font:inherit;color:var(--ch-ink);background:transparent;border:1px solid var(--ch-rule);border-radius:4px;padding:4px 10px;cursor:pointer}",
".ch-btn:hover:not(:disabled){background:var(--ch-hi)}.ch-btn:disabled{opacity:.35;cursor:default}",
".ch-btn.ch-on{background:var(--ch-ink);color:var(--ch-bg);border-color:var(--ch-ink)}",
".ch-btn:focus-visible,.ch-link:focus-visible,.ch-input:focus-visible{outline:2px solid var(--ch-link);outline-offset:1px}",
".ch-tabs{display:flex;gap:4px}.ch-grow{flex:1}",
".ch-input{font:inherit;color:var(--ch-ink);background:var(--ch-bg);border:1px solid var(--ch-rule);border-radius:4px;padding:4px 8px;min-width:0}",
".ch-search{width:min(260px,100%)}",
".ch-main{flex:1;min-height:0;position:relative;display:flex;flex-direction:column}",
".ch-pane{flex:1;min-height:0;overflow:auto;padding:0 18px 60px}",
".ch-page{max-width:46rem;margin:0 auto;padding-top:26px}",
".ch-page.ch-wide{max-width:60rem}",
".ch-link{color:var(--ch-link);text-decoration:none;border-bottom:1px dotted currentColor;cursor:pointer}",
".ch-link:hover{background:var(--ch-hi)}",
".ch-link.ch-k-polity{border-bottom:2px solid var(--ch-pc,currentColor)}",
"h1.ch-h1{font-size:2.1rem;line-height:1.2;margin:.2em 0 .1em;font-weight:600;letter-spacing:.01em}",
"h2.ch-h2{font-size:1.25rem;margin:2em 0 .5em;padding-bottom:.25em;border-bottom:1px solid var(--ch-rule);font-weight:600;font-variant:small-caps;letter-spacing:.06em}",
".ch-kicker{font-family:var(--ch-sans);font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:var(--ch-mute)}",
".ch-sub{color:var(--ch-mute);font-style:italic;margin:0 0 .6em}",
".ch-swatch{display:inline-block;width:.8em;height:.8em;border-radius:2px;margin-right:.4em;vertical-align:baseline;border:1px solid rgba(0,0,0,.3)}",
".ch-fate{margin:1em 0;padding:.9em 1.2em;border-left:4px solid var(--ch-accent);background:var(--ch-hi);font-size:1.2rem;font-style:italic}",
".ch-epitaph{margin:1em 0;padding:.6em 1.2em;border-left:3px solid var(--ch-mute);font-style:italic;font-size:1.1rem}",
".ch-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px 18px;margin:1em 0;font-family:var(--ch-sans);font-size:14px;line-height:1.35}",
".ch-stat b{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ch-mute);font-weight:500}",
".ch-bars{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-family:var(--ch-sans);font-size:13px;align-items:center;max-width:26rem}",
".ch-barx{height:8px;background:var(--ch-rule);border-radius:4px;overflow:hidden}.ch-barx i{display:block;height:100%;background:var(--ch-accent)}",
".ch-table{width:100%;border-collapse:collapse;font-size:15px;line-height:1.4}",
".ch-table th{text-align:left;font-family:var(--ch-sans);font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--ch-mute);font-weight:500;padding:4px 8px;border-bottom:1px solid var(--ch-rule)}",
".ch-table td{padding:6px 8px;border-bottom:1px solid var(--ch-rule);vertical-align:top}",
".ch-empty{color:var(--ch-mute);font-style:italic;padding:.6em 0}",
".ch-chips{display:flex;flex-wrap:wrap;gap:6px;margin:.4em 0}",
".ch-chip{font-family:var(--ch-sans);font-size:12px;border:1px solid var(--ch-rule);border-radius:10px;padding:0 9px;color:var(--ch-mute);background:transparent;cursor:default;line-height:1.7}",
".ch-spark{display:block;width:100%;max-width:32rem;height:auto;color:var(--ch-accent)}",
".ch-axis{display:flex;justify-content:space-between;max-width:32rem;font-family:var(--ch-sans);font-size:12px;color:var(--ch-mute)}",
".ch-strata{display:flex;height:34px;border:1px solid var(--ch-rule);border-radius:3px;overflow:hidden;margin:.6em 0}",
".ch-strata>div{height:100%;min-width:2px;border-right:1px solid rgba(0,0,0,.25)}",
".ch-strata>div.ch-gap{background:repeating-linear-gradient(45deg,transparent 0 5px,var(--ch-rule) 5px 6px)}",
".ch-legend{display:flex;flex-wrap:wrap;gap:4px 16px;font-family:var(--ch-sans);font-size:13px}",
".ch-chain{list-style:none;margin:1em 0;padding:0 0 0 1.6em;border-left:2px solid var(--ch-rule)}",
".ch-chain li{position:relative;padding:0 0 1.1em .4em}",
".ch-chain li:before{content:'';position:absolute;left:-2.2em;top:.55em;width:.7em;height:.7em;border-radius:50%;background:var(--ch-accent);border:2px solid var(--ch-bg)}",
".ch-chain .ch-verb{font-family:var(--ch-sans);font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--ch-accent)}",
".ch-ul{list-style:none;margin:0;padding:0}",
".ch-ul li{padding:.35em 0;border-bottom:1px solid var(--ch-rule)}",
".ch-more{margin:1em 0}",
".ch-tlwrap{flex:1;min-height:0;display:flex;flex-direction:column}",
".ch-filters{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--ch-rule);font-family:var(--ch-sans);font-size:13px;background:var(--ch-panel)}",
".ch-filters label{display:flex;align-items:center;gap:6px}",
".ch-brushrow{width:100%;display:flex;align-items:center;gap:10px}",
".ch-brush{position:relative;flex:1;height:34px;border:1px solid var(--ch-rule);border-radius:3px;cursor:crosshair;touch-action:none;user-select:none;display:flex;align-items:flex-end;background:var(--ch-bg)}",
".ch-brush>i{flex:1;background:var(--ch-mute);opacity:.55;min-height:1px;pointer-events:none}",
".ch-brush>b{position:absolute;top:0;bottom:0;background:var(--ch-accent);opacity:.22;border-left:2px solid var(--ch-accent);border-right:2px solid var(--ch-accent);pointer-events:none}",
".ch-tl{flex:1;min-height:0;overflow:auto;position:relative}",
".ch-tlin{position:relative;max-width:50rem;margin:0 auto}",
".ch-row{position:absolute;left:0;right:0;padding:0 16px}",
".ch-era{padding:44px 0 14px;border-bottom:3px double var(--ch-accent)}",
".ch-era h2{margin:0;font-size:1.9rem;line-height:1.2;font-weight:600;color:var(--ch-accent)}",
".ch-era p{margin:.2em 0 0;color:var(--ch-mute);font-style:italic}",
".ch-cent{padding:22px 0 6px 110px;font-family:var(--ch-sans);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ch-mute)}",
".ch-ev{display:flex;gap:14px;padding:5px 0}",
".ch-yr{flex:0 0 96px;text-align:right;font-family:var(--ch-sans);font-size:13px;line-height:1.9;color:var(--ch-mute);border-bottom:0;text-decoration:none;font-variant-numeric:tabular-nums;cursor:pointer}",
".ch-yr:hover{color:var(--ch-link);background:none}",
".ch-body{flex:1;min-width:0;max-width:70ch}",
".ch-txt{margin:0;overflow-wrap:break-word}",
".ch-tags{display:flex;flex-wrap:wrap;gap:4px 8px;margin-top:2px}",
".ch-tg{font:inherit;font-family:var(--ch-sans);font-size:11px;color:var(--ch-mute);background:none;border:0;padding:0;cursor:pointer}.ch-tg:hover{color:var(--ch-link);text-decoration:underline}",
".ch-i1 .ch-txt{font-size:14.5px;line-height:1.5;color:var(--ch-mute)}",
".ch-i1 .ch-yr{font-size:11.5px;line-height:2.1;opacity:.8}",
".ch-i2 .ch-txt{font-size:16px}",
".ch-i3 .ch-txt{font-size:17.5px}",
".ch-i4 .ch-txt{font-size:20px;font-weight:600;line-height:1.45}",
".ch-i4{padding-top:12px}.ch-i4 .ch-yr{color:var(--ch-ink);line-height:2.2}",
".ch-i5{padding:18px 0 14px;margin:6px 0;border-top:1px solid var(--ch-i5);border-bottom:1px solid var(--ch-i5)}",
".ch-i5 .ch-txt{font-size:25px;line-height:1.35;font-weight:700;color:var(--ch-i5)}",
".ch-i5 .ch-yr{color:var(--ch-i5);font-weight:700;font-size:15px;line-height:2.4}",
".ch-i5 .ch-link{color:inherit}",
".ch-count{color:var(--ch-mute);margin-left:auto}",
".ch-gwrap{flex:1;min-height:0;display:flex;flex-direction:column}",
".ch-gview{flex:1;min-height:0;position:relative;overflow:hidden}",
".ch-gview canvas{position:absolute;left:0;top:0;width:100%;height:100%;touch-action:none;cursor:grab;display:block}",
".ch-gstatus{padding:6px 14px;border-top:1px solid var(--ch-rule);font-family:var(--ch-sans);font-size:13px;line-height:1.5;color:var(--ch-mute);min-height:2.6em}",
".ch-gk{display:inline-flex;align-items:center;gap:6px}.ch-gk canvas{display:block;flex:none}",
".ch-btn.ch-gk:not(.ch-on){opacity:.5}",
".ch-row2{display:flex;gap:10px;align-items:baseline;padding:.55em 0;border-bottom:1px solid var(--ch-rule)}",
".ch-row2 .ch-line{color:var(--ch-mute);font-size:15px;line-height:1.45}",
".ch-res{display:block;padding:.4em .6em;margin:0 -.6em;border-radius:4px;cursor:pointer;line-height:1.4;text-decoration:none;color:var(--ch-ink)}",
".ch-res.ch-sel,.ch-res:hover{background:var(--ch-hi)}",
".ch-res small{display:block;color:var(--ch-mute);font-size:14px}",
".ch-res mark{background:var(--ch-hi);color:inherit;font-weight:700;text-decoration:underline}",
".ch-story p{margin:0 0 1.1em;max-width:70ch}",
".ch-story .ch-lede{font-size:1.25rem}",
".ch-story .ch-lede:first-letter{font-size:3.4em;float:left;line-height:.85;padding:.06em .1em 0 0;color:var(--ch-accent)}",
".ch-story h2.ch-h2{font-size:1.5rem;font-variant:normal;letter-spacing:0;color:var(--ch-accent)}",
".ch-lead{color:var(--ch-mute);font-size:.9em}",
".ch-tools{display:flex;gap:8px;margin:1.4em 0;flex-wrap:wrap;font-family:var(--ch-sans)}",
"@media (max-width:640px){.ch-yr{flex-basis:64px}.ch-cent{padding-left:78px}.ch-i5 .ch-txt{font-size:21px}.ch-pane{padding:0 12px 60px}}"
].join("\n");

function injectStyle() {
  if (document.getElementById("ch-style")) return;
  var st = document.createElement("style");
  st.id = "ch-style";
  st.appendChild(document.createTextNode(CSS));
  (document.head || document.documentElement).appendChild(st);
}

/* shared with the later parts */
C.injectStyle = injectStyle;
})();
