window.__err=[];window.addEventListener("error",function(e){__err.push(e.message+" @"+e.filename+":"+e.lineno)});setTimeout(function(){var d=document.createElement("pre");d.id="dbg";d.textContent=location.href+" | "+__err.join(" ; ");document.body.appendChild(d)},20000);
var Q = new URLSearchParams(location.search);
(function poll() {
  if (!(document.querySelector(".ch-root") && window.AEON && AEON.chronicle)) return setTimeout(poll, 100);
  if (Q.get("focus")) {
    var f = Q.get("focus").split(":");
    AEON.chronicle.show(f[0], f[1]);
    setTimeout(function () {
      var b = [].find.call(document.querySelectorAll(".ch-btn"), function (x) { return /threads in the graph/.test(x.textContent); });
      if (b) b.click();
    }, 50);
  } else AEON.chronicle.show("graph");
  if (Q.get("ev")) setTimeout(function () {
    [].find.call(document.querySelectorAll(".ch-gk"), function (x) { return /Events/.test(x.textContent); }).click();
  }, 150);
  if (Q.get("hover")) setTimeout(function () {
    var cv = document.querySelector(".ch-gview canvas"), r = cv.getBoundingClientRect();
    var o = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true };
    cv.dispatchEvent(new PointerEvent("pointermove", o));
  }, 15000);
})();
