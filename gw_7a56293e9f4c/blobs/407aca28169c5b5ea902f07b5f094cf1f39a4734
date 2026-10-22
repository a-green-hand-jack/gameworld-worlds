// Snake rules, independent of drawing and input. Exposed as window.SnakeLogic.
(function (root) {
  'use strict';

  var DIRS = {
    up:    { x: 0,  y: -1 },
    down:  { x: 0,  y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1,  y: 0 }
  };
  var OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  function createGame(opts) {
    opts = opts || {};
    var cols = opts.cols || 20;
    var rows = opts.rows || 20;
    var random = opts.random || Math.random;
    var startLength = opts.startLength || 3;

    var g = {
      cols: cols,
      rows: rows,
      snake: [],        // [{x, y}], head first
      dir: 'right',     // direction of the last move
      queue: [],        // buffered turns, applied one per tick
      food: null,
      score: 0,
      over: false,
      won: false,
      cause: null,      // 'wall' | 'self' | 'full'
      ate: false        // true on the tick the snake ate
    };

    g.reset = function () {
      var y = Math.floor(rows / 2);
      var x = Math.floor(cols / 2) - 2;
      g.snake = [];
      for (var i = 0; i < startLength; i++) g.snake.push({ x: x - i, y: y });
      g.dir = 'right';
      g.queue = [];
      g.score = 0;
      g.over = false;
      g.won = false;
      g.cause = null;
      g.ate = false;
      g.food = placeFood();
      return g;
    };

    // Queue a turn. Turning back onto the snake's own neck and repeating the
    // current heading are ignored; at most two turns wait for coming ticks.
    g.turn = function (name) {
      if (!DIRS[name] || g.over) return false;
      var last = g.queue.length ? g.queue[g.queue.length - 1] : g.dir;
      if (name === last || name === OPPOSITE[last]) return false;
      if (g.queue.length >= 2) return false;
      g.queue.push(name);
      return true;
    };

    g.step = function () {
      if (g.over) return g;
      if (g.queue.length) g.dir = g.queue.shift();
      var d = DIRS[g.dir];
      var head = g.snake[0];
      var next = { x: head.x + d.x, y: head.y + d.y };
      g.ate = false;

      if (next.x < 0 || next.y < 0 || next.x >= cols || next.y >= rows) {
        return end('wall');
      }
      var grow = g.food && next.x === g.food.x && next.y === g.food.y;
      // Without growing, the tail leaves its cell this tick, so the head may enter it.
      var body = grow ? g.snake : g.snake.slice(0, -1);
      for (var i = 0; i < body.length; i++) {
        if (body[i].x === next.x && body[i].y === next.y) return end('self');
      }
      g.snake.unshift(next);
      if (grow) {
        g.score += 1;
        g.ate = true;
        g.food = placeFood();
        if (!g.food) { g.won = true; return end('full'); }
      } else {
        g.snake.pop();
      }
      return g;
    };

    function end(cause) {
      g.over = true;
      g.cause = cause;
      return g;
    }

    function placeFood() {
      var free = [];
      var taken = {};
      for (var i = 0; i < g.snake.length; i++) taken[g.snake[i].x + ',' + g.snake[i].y] = true;
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          if (!taken[x + ',' + y]) free.push({ x: x, y: y });
        }
      }
      if (!free.length) return null;
      return free[Math.floor(random() * free.length)];
    }

    return g.reset();
  }

  root.SnakeLogic = { createGame: createGame, DIRS: DIRS, OPPOSITE: OPPOSITE };
})(typeof window !== 'undefined' ? window : globalThis);
