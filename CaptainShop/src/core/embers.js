// Drifting ember particles on the background <canvas>. Ported 1:1.
// The canvas node is preserved across renders by the morph engine.
window.App = window.App || {};
(function (App) {

  function newEmber(mid) {
    const warm = Math.random() < 0.8;
    return {
      x: Math.random() * 2560,
      y: mid ? Math.random() * 1440 : 1460,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -(0.3 + Math.random() * 1.2),
      r: 1 + Math.random() * 2.4,
      op: 0.2 + Math.random() * 0.5,
      col: warm ? '238,185,95' : '140,175,205',
      life: 0,
      max: 350 + Math.random() * 500,
      seed: Math.random() * 900
    };
  }

  let raf = 0;

  App.startEmbers = function (getCanvas) {
    const cv = getCanvas();
    if (!cv) { setTimeout(() => App.startEmbers(getCanvas), 300); return; }
    if (raf) return;
    const ctx = cv.getContext('2d');
    const embers = Array.from({ length: 60 }, () => newEmber(true));
    const step = () => {
      ctx.clearRect(0, 0, 2560, 1440);
      for (const e of embers) {
        e.x += e.vx + Math.sin((e.y + e.seed) * 0.004) * 0.4;
        e.y += e.vy;
        e.life++;
        const a = Math.min(1, e.life / 60) * Math.max(0, 1 - e.life / e.max) * e.op;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, 6.2832);
        ctx.fillStyle = 'rgba(' + e.col + ',' + a.toFixed(3) + ')';
        ctx.fill();
        if (e.life > e.max || e.y < -20) Object.assign(e, newEmber(false));
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };

})(window.App);
