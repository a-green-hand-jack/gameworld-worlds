// Snake: grid movement, arrow-key turning, food grows the snake by one cell and
// scores one point, walls and the snake's own body end the game.
(function () {
  'use strict';

  const COLS = 20;
  const ROWS = 20;
  const TICK_MS = 120;          // time per grid step
  const START_LENGTH = 3;

  const DIRS = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
  };

  const assets = window.SnakeAssets;
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const CELL = canvas.width / COLS;
  const el = {
    hud: document.getElementById('hud'),
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    title: document.getElementById('title-screen'),
    logo: document.getElementById('title-logo'),
    titleText: document.getElementById('title-text'),
    pause: document.getElementById('pause-screen'),
    over: document.getElementById('gameover-screen'),
    overTitle: document.getElementById('gameover-title'),
    finalScore: document.getElementById('final-score'),
    bestLine: document.getElementById('best-line'),
    start: document.getElementById('start-button'),
    restart: document.getElementById('restart-button'),
  };

  const game = {
    state: 'title',   // 'title' | 'playing' | 'paused' | 'over'
    snake: [],        // head first, cells {x, y}
    dir: DIRS.ArrowRight,
    queue: [],        // pending turns, applied one per step
    food: null,
    score: 0,
    best: 0,
    won: false,
    deathCause: null, // 'wall' | 'self' | null
    cols: COLS,
    rows: ROWS,
    tickMs: TICK_MS,
    auto: true,       // tests set false and call step() themselves
  };
  try { game.best = Number(localStorage.getItem('snake.best')) || 0; } catch (e) { /* no storage */ }

  function css(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function freeCells() {
    const taken = new Set(game.snake.map((c) => c.x + ',' + c.y));
    const cells = [];
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (!taken.has(x + ',' + y)) cells.push({ x, y });
    return cells;
  }

  function placeFood() {
    const cells = freeCells();
    game.food = cells.length ? cells[Math.floor(Math.random() * cells.length)] : null;
  }

  function reset() {
    const y = Math.floor(ROWS / 2);
    const x = Math.floor(COLS / 4) + START_LENGTH - 1;
    game.snake = [];
    for (let i = 0; i < START_LENGTH; i++) game.snake.push({ x: x - i, y });
    game.dir = DIRS.ArrowRight;
    game.queue = [];
    game.score = 0;
    game.won = false;
    game.deathCause = null;
    placeFood();
  }

  function show(state) {
    game.state = state;
    el.title.hidden = state !== 'title';
    el.pause.hidden = state !== 'paused';
    el.over.hidden = state !== 'over';
    el.hud.hidden = state === 'title';
    updateHud();
    const btn = state === 'title' ? el.start : state === 'over' ? el.restart : null;
    if (btn) btn.focus({ preventScroll: true });
    else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function updateHud() {
    el.score.textContent = String(game.score);
    el.best.textContent = String(game.best);
  }

  function startGame() {
    reset();
    show('playing');
    lastTime = performance.now();
    acc = 0;
    assets.play('start');
    assets.music(true);
    draw();
  }

  function endGame(cause) {
    game.deathCause = cause;
    const newBest = game.score > game.best;
    if (newBest) {
      game.best = game.score;
      try { localStorage.setItem('snake.best', String(game.best)); } catch (e) { /* no storage */ }
    }
    el.overTitle.textContent = game.won ? 'You Win!' : 'Game Over';
    el.finalScore.textContent = String(game.score);
    el.bestLine.textContent = newBest && game.score > 0 ? 'New best score!' : 'Best: ' + game.best;
    assets.music(false);
    assets.play('gameover');
    show('over');
  }

  function turn(key) {
    const d = DIRS[key];
    const last = game.queue.length ? game.queue[game.queue.length - 1] : game.dir;
    if (d === last) return;
    if (d.x === -last.x && d.y === -last.y) return; // no reversing into the neck
    if (game.queue.length < 2) game.queue.push(d);
  }

  // One grid step. Returns false when the step ended the game.
  function step() {
    if (game.state !== 'playing') return false;
    if (game.queue.length) game.dir = game.queue.shift();
    const head = game.snake[0];
    const next = { x: head.x + game.dir.x, y: head.y + game.dir.y };

    if (next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS) {
      endGame('wall');
      return false;
    }
    const eating = game.food && next.x === game.food.x && next.y === game.food.y;
    // The tail moves away this step unless the snake grows, so its cell is free.
    const body = eating ? game.snake : game.snake.slice(0, -1);
    if (body.some((c) => c.x === next.x && c.y === next.y)) {
      endGame('self');
      return false;
    }
    game.snake.unshift(next);
    if (eating) {
      game.score += 1;
      assets.play('eat');
      placeFood();
      if (!game.food) { game.won = true; updateHud(); draw(); endGame(null); return false; }
    } else {
      game.snake.pop();
    }
    updateHud();
    return true;
  }

  // ---- drawing ----

  function angleOf(d) { return Math.atan2(d.y, d.x); }

  function drawSprite(img, cell, angle) {
    const cx = cell.x * CELL + CELL / 2;
    const cy = cell.y * CELL + CELL / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.drawImage(img, -CELL / 2, -CELL / 2, CELL, CELL);
    ctx.restore();
  }

  function drawBoard() {
    const tile = assets.images.tile;
    if (tile) {
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) ctx.drawImage(tile, x * CELL, y * CELL, CELL, CELL);
      return;
    }
    ctx.fillStyle = css('--board', '#18202c');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = css('--grid', '#1e2836');
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if ((x + y) % 2 === 0) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
  }

  function drawFood() {
    if (!game.food) return;
    if (assets.images.food) { drawSprite(assets.images.food, game.food, 0); return; }
    ctx.fillStyle = css('--danger', '#e85d5d');
    ctx.beginPath();
    ctx.arc(game.food.x * CELL + CELL / 2, game.food.y * CELL + CELL / 2, CELL * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSnake() {
    const s = game.snake;
    for (let i = s.length - 1; i >= 0; i--) {
      const c = s[i];
      // Direction the segment travels: from the next segment toward this one.
      let dir;
      if (i === 0) dir = game.dir;
      else dir = { x: s[i - 1].x - c.x, y: s[i - 1].y - c.y };
      const isHead = i === 0;
      const isTail = i === s.length - 1 && i > 0;
      const img = isHead ? assets.images.head : isTail ? (assets.images.tail || assets.images.body) : assets.images.body;
      if (img) { drawSprite(img, c, angleOf(dir)); continue; }

      const pad = isHead ? 1 : 2;
      ctx.fillStyle = isHead ? css('--accent', '#6bd36b') : (i % 2 ? '#4fb84f' : '#58c258');
      ctx.fillRect(c.x * CELL + pad, c.y * CELL + pad, CELL - pad * 2, CELL - pad * 2);
      if (isHead) {
        // eyes, placed toward the travel direction
        ctx.fillStyle = '#0b1a0b';
        const cx = c.x * CELL + CELL / 2, cy = c.y * CELL + CELL / 2;
        const fx = dir.x * CELL * 0.18, fy = dir.y * CELL * 0.18;
        const sx = -dir.y * CELL * 0.2, sy = dir.x * CELL * 0.2;
        for (const k of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(cx + fx + sx * k, cy + fy + sy * k, CELL * 0.09, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function draw() {
    drawBoard();
    if (game.state !== 'title') {
      drawFood();
      drawSnake();
    }
  }

  // ---- loop and input ----

  let lastTime = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(now - lastTime, 250);
    lastTime = now;
    if (game.state === 'playing' && game.auto) {
      acc += dt;
      while (acc >= game.tickMs && game.state === 'playing') {
        acc -= game.tickMs;
        step();
      }
    }
    draw();
    requestAnimationFrame(frame);
  }

  function togglePause() {
    if (game.state === 'playing') { show('paused'); assets.music(false); }
    else if (game.state === 'paused') { show('playing'); lastTime = performance.now(); acc = 0; assets.music(true); }
  }

  document.addEventListener('keydown', (e) => {
    const k = e.key;
    if (DIRS[k]) {
      e.preventDefault();
      if (game.state === 'playing') turn(k);
      return;
    }
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      if (game.state === 'title' || game.state === 'over') {
        e.preventDefault();
        startGame();
      } else if (game.state === 'paused') {
        e.preventDefault();
        togglePause();
      }
      return;
    }
    if (k === 'p' || k === 'P' || k === 'Escape') { togglePause(); return; }
    if (k === 'm' || k === 'M') {
      assets.muted = !assets.muted;
      try { localStorage.setItem('snake.muted', assets.muted ? '1' : '0'); } catch (err) { /* no storage */ }
      assets.music(game.state === 'playing');
    }
  });
  // Buttons start the game on click; keyboard Enter/Space is handled above, so the
  // button's own key activation is suppressed to avoid starting twice.
  for (const b of [el.start, el.restart]) {
    b.addEventListener('click', (e) => { if (e.detail !== 0) startGame(); });
  }
  window.addEventListener('blur', () => { if (game.state === 'playing') togglePause(); });

  // Test hooks: read state, place food, advance steps deterministically.
  window.SnakeGame = {
    game,
    step,
    start: startGame,
    setFood(x, y) { game.food = { x, y }; draw(); },
    setSnake(cells, dirKey) { game.snake = cells.map((c) => ({ x: c.x, y: c.y })); game.dir = DIRS[dirKey || 'ArrowRight']; game.queue = []; draw(); },
  };

  assets.ready.then(() => {
    if (assets.images.logo) {
      el.logo.src = assets.images.logo.src;
      el.logo.hidden = false;
      el.titleText.hidden = true;
    }
    reset();
    show('title');
    draw();
  });
  reset();
  show('title');
  requestAnimationFrame(frame);
})();
