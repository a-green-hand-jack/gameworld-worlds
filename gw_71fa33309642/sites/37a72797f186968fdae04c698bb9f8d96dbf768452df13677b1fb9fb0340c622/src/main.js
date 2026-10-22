// Boot: load assets, scale the 256x240 canvas by an integer, run the logic at a fixed 60 Hz.
(function () {
  const SMB = window.SMB;
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  function fit() {
    const s = Math.max(1, Math.floor(Math.min(window.innerWidth / 256, window.innerHeight / 240)));
    canvas.style.width = 256 * s + 'px';
    canvas.style.height = 240 * s + 'px';
  }
  window.addEventListener('resize', fit);
  fit();

  const game = new SMB.Game(ctx);
  SMB.game = game;

  const STEP = 1000 / 60;
  let acc = 0, last = performance.now();
  function loop(now) {
    acc += Math.min(250, now - last);
    last = now;
    let steps = 0;
    while (acc >= STEP && steps < 5) { game.update(); acc -= STEP; steps++; }
    if (steps === 5) acc = 0;
    game.draw();
    requestAnimationFrame(loop);
  }

  // Tests can drive the game deterministically with ?manual (no rAF loop): SMB.step(n).
  SMB.step = function (n) { for (let i = 0; i < (n || 1); i++) game.update(); game.draw(); };

  Promise.all([SMB.Assets.load(), SMB.Sound.load()]).then(() => {
    game.toTitle();
    if (!/[?&]manual/.test(location.search)) requestAnimationFrame(loop);
    else game.draw();
    SMB.loaded = true;
  });
})();
