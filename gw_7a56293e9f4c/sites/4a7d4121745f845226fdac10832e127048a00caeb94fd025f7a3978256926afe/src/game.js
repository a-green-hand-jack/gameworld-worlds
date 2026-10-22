// Screens, input, timing and drawing for Snake.
(function () {
  'use strict';

  var CELL = 32, COLS = 20, ROWS = 20, HUD = 48;
  var W = COLS * CELL, H = ROWS * CELL + HUD;
  var START_INTERVAL = 130, MIN_INTERVAL = 70, SPEEDUP = 2; // ms per tick
  var RESTART_GUARD = 400; // ms after game over before play-again input counts

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var assets = window.SnakeAssets;
  var game = window.SnakeLogic.createGame({ cols: COLS, rows: ROWS });

  var state = 'title'; // 'title' | 'playing' | 'paused' | 'over'
  var best = loadBest();
  var acc = 0, last = 0, overAt = 0;
  var auto = true; // tests switch this off to step the game by hand

  function loadBest() {
    try { return parseInt(localStorage.getItem('snake.best'), 10) || 0; } catch (e) { return 0; }
  }
  function saveBest() {
    try { localStorage.setItem('snake.best', String(best)); } catch (e) {}
  }
  // ?speed=<ms> fixes the tick length (e.g. ?speed=30 for fast tests); otherwise the
  // game starts at START_INTERVAL and gets SPEEDUP ms faster per point.
  var fixedInterval = (function () {
    var m = /[?&]speed=(\d+)/.exec(location.search);
    return m ? Math.max(10, parseInt(m[1], 10)) : 0;
  })();
  function interval() {
    if (fixedInterval) return fixedInterval;
    return Math.max(MIN_INTERVAL, START_INTERVAL - SPEEDUP * game.score);
  }

  function start() {
    game.reset();
    state = 'playing';
    acc = 0;
    assets.play('start');
    assets.play('music', true);
  }

  function tick() {
    var before = game.score;
    game.step();
    if (game.ate && game.score > before) assets.play('eat');
    if (game.over) {
      state = 'over';
      overAt = performance.now();
      if (game.score > best) { best = game.score; saveBest(); }
      assets.stop('music');
      assets.play('gameover');
    }
  }

  // ---- input ----
  var KEY_DIR = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right'
  };

  function onKey(e) {
    var dir = KEY_DIR[e.key];
    var confirm = e.key === 'Enter' || e.key === ' ' || e.code === 'Space';
    if (dir || confirm) e.preventDefault();

    if (e.key === 'm' || e.key === 'M') {
      assets.muted = !assets.muted;
      if (assets.muted) assets.stop('music'); else if (state === 'playing') assets.play('music', true);
      return;
    }

    if (state === 'title') {
      if (confirm) start();
      else if (dir) { start(); game.turn(dir); }
    } else if (state === 'playing') {
      if (dir) {
        if (game.turn(dir)) assets.play('turn');
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        state = 'paused'; assets.stop('music');
      }
    } else if (state === 'paused') {
      if (confirm || e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        state = 'playing'; acc = 0; assets.play('music', true);
      }
    } else if (state === 'over') {
      if ((confirm || e.key === 'r' || e.key === 'R') && performance.now() - overAt > RESTART_GUARD) start();
    }
  }

  function onClick() {
    canvas.focus();
    if (state === 'title') start();
    else if (state === 'paused') { state = 'playing'; acc = 0; }
    else if (state === 'over' && performance.now() - overAt > RESTART_GUARD) start();
  }

  window.addEventListener('keydown', onKey);
  canvas.addEventListener('mousedown', onClick);
  window.addEventListener('blur', function () {
    if (state === 'playing') { state = 'paused'; assets.stop('music'); }
  });

  // ---- drawing ----
  var ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
  var HEAD_KEY = { up: 'headUp', down: 'headDown', left: 'headLeft', right: 'headRight' };

  function dirBetween(a, b) { // direction from cell a to neighbouring cell b
    if (b.x > a.x) return 'right';
    if (b.x < a.x) return 'left';
    if (b.y > a.y) return 'down';
    return 'up';
  }

  function cellX(x) { return x * CELL; }
  function cellY(y) { return HUD + y * CELL; }

  function drawSprite(img, x, y, angle) {
    ctx.save();
    ctx.translate(cellX(x) + CELL / 2, cellY(y) + CELL / 2);
    if (angle) ctx.rotate(angle);
    ctx.drawImage(img, -CELL / 2, -CELL / 2, CELL, CELL);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBoard() {
    var img = assets.images;
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        var alt = (x + y) % 2 === 1;
        if (img.tilePair) {
          var hw = img.tilePair.width / 2;
          ctx.drawImage(img.tilePair, alt ? hw : 0, 0, hw, img.tilePair.height, cellX(x), cellY(y), CELL, CELL);
        } else if (img.tile) {
          ctx.drawImage(img.tile, cellX(x), cellY(y), CELL, CELL);
        } else {
          ctx.fillStyle = alt ? '#1b2230' : '#18202c';
          ctx.fillRect(cellX(x), cellY(y), CELL, CELL);
        }
      }
    }
  }

  function drawFood() {
    var f = game.food;
    if (!f) return;
    if (assets.images.food) { drawSprite(assets.images.food, f.x, f.y, 0); return; }
    var cx = cellX(f.x) + CELL / 2, cy = cellY(f.y) + CELL / 2;
    var pulse = 1 + 0.06 * Math.sin(performance.now() / 150);
    ctx.fillStyle = '#e8483b';
    ctx.beginPath(); ctx.arc(cx, cy + 1, 8 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f7a59d';
    ctx.beginPath(); ctx.arc(cx - 3, cy - 2, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6dbb4a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 3, cy - 11); ctx.stroke();
  }

  // Corner sprite connects right and down; rotate it for the other three corners.
  var CORNER = { 'down,right': 0, 'down,left': Math.PI / 2, 'left,up': Math.PI, 'right,up': -Math.PI / 2 };

  function drawSnake() {
    var s = game.snake, img = assets.images, n = s.length;
    for (var i = n - 1; i >= 0; i--) {
      var c = s[i];
      if (i === 0) {
        var hd = n > 1 ? dirBetween(s[1], c) : game.dir;
        var dirHead = img[HEAD_KEY[hd]];
        if (dirHead) drawSprite(dirHead, c.x, c.y, 0);
        else if (img.head) drawSprite(img.head, c.x, c.y, ANGLE[hd]);
        else drawFallbackHead(c, hd);
      } else if (i === n - 1) {
        var td = dirBetween(c, s[i - 1]);
        if (img.tail) drawSprite(img.tail, c.x, c.y, ANGLE[td]);
        else if (img.body) drawSprite(img.body, c.x, c.y, ANGLE[td]);
        else drawFallbackSegment(c, i, n, true);
      } else {
        var a = dirBetween(c, s[i - 1]), b = dirBetween(c, s[i + 1]);
        var straight = a === window.SnakeLogic.OPPOSITE[b];
        if (straight && img.body) {
          drawSprite(img.body, c.x, c.y, (a === 'up' || a === 'down') ? Math.PI / 2 : 0);
        } else if (!straight && img.bodyTurn) {
          drawSprite(img.bodyTurn, c.x, c.y, CORNER[[a, b].sort().join(',')]);
        } else if (img.body) {
          drawSprite(img.body, c.x, c.y, 0);
        } else {
          drawFallbackSegment(c, i, n, false);
        }
      }
    }
  }

  function segColor(i, n) {
    var t = n > 1 ? i / (n - 1) : 0;
    var g = Math.round(200 - 70 * t), r = Math.round(90 - 40 * t);
    return 'rgb(' + r + ',' + g + ',90)';
  }

  function drawFallbackSegment(c, i, n, isTail) {
    var pad = isTail ? 4 : 2;
    ctx.fillStyle = segColor(i, n);
    roundRect(cellX(c.x) + pad, cellY(c.y) + pad, CELL - 2 * pad, CELL - 2 * pad, 6);
    ctx.fill();
  }

  function drawFallbackHead(c, dir) {
    ctx.fillStyle = '#7fe08a';
    roundRect(cellX(c.x) + 1, cellY(c.y) + 1, CELL - 2, CELL - 2, 8);
    ctx.fill();
    ctx.save();
    ctx.translate(cellX(c.x) + CELL / 2, cellY(c.y) + CELL / 2);
    ctx.rotate(ANGLE[dir]);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(4, -5, 3.2, 0, Math.PI * 2); ctx.arc(4, 5, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(5.5, -5, 1.6, 0, Math.PI * 2); ctx.arc(5.5, 5, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawHud() {
    ctx.fillStyle = '#0c1018';
    ctx.fillRect(0, 0, W, HUD);
    ctx.fillStyle = '#2a3242';
    ctx.fillRect(0, HUD - 2, W, 2);
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = '#f2f5f8';
    ctx.textAlign = 'left';
    ctx.fillText('Score: ' + game.score, 14, HUD / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9aa6b8';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('Best: ' + best + (assets.muted ? '   ♪ off' : ''), W - 14, HUD / 2);
  }

  function veil(alpha) {
    ctx.fillStyle = 'rgba(8, 10, 16, ' + alpha + ')';
    ctx.fillRect(0, HUD, W, H - HUD);
  }

  function text(str, y, size, color, weight) {
    ctx.font = (weight || 'bold') + ' ' + size + 'px system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, W / 2, y);
  }

  function drawImageCentered(img, cy, maxW, maxH) {
    var k = Math.min(maxW / img.width, maxH / img.height);
    var w = img.width * k, h = img.height * k;
    ctx.drawImage(img, (W - w) / 2, cy - h / 2, w, h);
  }

  function pulse() { return 'rgba(242, 245, 248, ' + (0.7 + 0.3 * Math.sin(performance.now() / 260)).toFixed(2) + ')'; }

  function drawTitle() {
    veil(0.85);
    var mid = HUD + (H - HUD) / 2;
    if (assets.images.logo) drawImageCentered(assets.images.logo, mid - 180, 560, 160);
    else text('SNAKE', mid - 180, 88, '#7fe08a');
    text('Eat the food, grow longer, don’t hit the walls or yourself.', mid - 70, 19, '#c8d0dc', 'normal');
    text('Arrow keys to turn', mid - 40, 19, '#c8d0dc', 'normal');
    text('Press Enter or Space to start', mid + 90, 28, pulse());
    if (best > 0) text('Best: ' + best, mid + 150, 20, '#9aa6b8', 'normal');
  }

  function drawPaused() {
    veil(0.6);
    var mid = HUD + (H - HUD) / 2;
    text('PAUSED', mid - 20, 56, '#f2f5f8');
    text('Press P, Enter or Space to resume', mid + 36, 20, '#c8d0dc', 'normal');
  }

  function drawOver() {
    veil(0.8);
    var mid = HUD + (H - HUD) / 2;
    var bestLine = game.score >= best && game.score > 0 ? 'New best!' : 'Best: ' + best;
    var panel = assets.images.gameover;
    if (panel && !game.won) {
      // The panel carries "GAME OVER" in its upper half; the score goes in its empty lower half.
      var top = mid - 140;
      ctx.drawImage(panel, (W - panel.width) / 2, top, panel.width, panel.height);
      text('Final score: ' + game.score, top + panel.height * 0.62, 32, '#f2f5f8');
      text(bestLine, top + panel.height * 0.84, 20, '#9aa6b8', 'normal');
    } else {
      if (game.won) text('YOU WIN!', mid - 100, 68, '#7fe08a');
      else text('GAME OVER', mid - 100, 68, '#e8483b');
      text('Final score: ' + game.score, mid - 10, 36, '#f2f5f8');
      text(bestLine, mid + 32, 20, '#9aa6b8', 'normal');
    }
    if (performance.now() - overAt > RESTART_GUARD) {
      text('Press Enter, Space or click to play again', mid + 120, 24, pulse());
    }
  }

  function render() {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    if (canvas.dataset.state !== state) canvas.dataset.state = state;
    if (canvas.dataset.score !== String(game.score)) canvas.dataset.score = String(game.score);
    drawHud();
    drawBoard();
    drawFood();
    drawSnake();
    if (state === 'title') drawTitle();
    else if (state === 'paused') drawPaused();
    else if (state === 'over') drawOver();
  }

  function frame(t) {
    var dt = last ? Math.min(t - last, 250) : 0;
    last = t;
    if (state === 'playing' && auto) {
      acc += dt;
      while (acc >= interval() && state === 'playing') {
        acc -= interval();
        tick();
      }
    }
    render();
    requestAnimationFrame(frame);
  }

  // Hooks for automated tests (tests/): read state and step the game by hand.
  window.__snake = {
    get state() { return state; },
    get game() { return game; },
    get best() { return best; },
    get assets() { return assets; },
    get score() { return game.score; },
    get snake() { return game.snake.map(function (c) { return { x: c.x, y: c.y }; }); },
    get food() { return game.food && { x: game.food.x, y: game.food.y }; },
    get grid() { return { cols: COLS, rows: ROWS, cell: CELL }; },
    get interval() { return interval(); },
    setAuto: function (on) { auto = !!on; acc = 0; },
    tick: function () { if (state === 'playing') tick(); render(); },
    render: render
  };

  canvas.focus();
  assets.readyOrTimeout(1500).then(function () { requestAnimationFrame(frame); });
  render();
})();
