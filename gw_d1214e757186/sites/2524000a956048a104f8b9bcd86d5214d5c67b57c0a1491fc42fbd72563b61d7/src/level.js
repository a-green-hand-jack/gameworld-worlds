// Tile map, level builder and the runtime level (one "area": main course, coin room, ...).
(function () {
  const SMB = (window.SMB = window.SMB || {});
  const TS = 16; // tile size
  const ROWS = 15;

  const T = {
    EMPTY: 0, GROUND: 1, BRICK: 2, QUESTION: 3, USED: 4, BLOCK: 5,
    PIPE_TL: 6, PIPE_TR: 7, PIPE_L: 8, PIPE_R: 9,
    SP_MT: 10, SP_MB: 11, SP_BT: 12, SP_BB: 13, SP_JT: 14, SP_JB: 15,
    COIN: 16, HIDDEN: 17, POLE_TOP: 18, POLE: 19,
    TREE_L: 20, TREE_M: 21, TREE_R: 22, TRUNK: 23, BRIDGE: 24, CHAIN: 25, AXE: 26, LAVA_TOP: 27, LAVA: 28,
    INVIS_WALL: 29,
  };

  // name: image under tiles/<theme>/, frames: strip frames, solid: blocks movement
  const INFO = [];
  function def(id, name, solid, frames, color) { INFO[id] = { name, solid, frames: frames || 1, color }; }
  def(T.EMPTY, null, false);
  def(T.GROUND, 'ground', true, 1, '#c84c0c');
  def(T.BRICK, 'brick', true, 1, '#b85020');
  def(T.QUESTION, 'question', true, 3, '#f8b800');
  def(T.USED, 'used', true, 1, '#885818');
  def(T.BLOCK, 'block', true, 1, '#a0522d');
  def(T.PIPE_TL, 'pipe_tl', true, 1, '#00a800');
  def(T.PIPE_TR, 'pipe_tr', true, 1, '#00a800');
  def(T.PIPE_L, 'pipe_l', true, 1, '#00a800');
  def(T.PIPE_R, 'pipe_r', true, 1, '#00a800');
  def(T.SP_MT, 'pipe_side_mouth_t', true, 1, '#00a800');
  def(T.SP_MB, 'pipe_side_mouth_b', true, 1, '#00a800');
  def(T.SP_BT, 'pipe_side_body_t', true, 1, '#00a800');
  def(T.SP_BB, 'pipe_side_body_b', true, 1, '#00a800');
  def(T.SP_JT, 'pipe_side_join_t', true, 1, '#00a800');
  def(T.SP_JB, 'pipe_side_join_b', true, 1, '#00a800');
  def(T.COIN, 'coin', false, 3, '#f8d800');
  def(T.HIDDEN, null, false);
  def(T.POLE_TOP, 'flag_ball', false, 1, '#00a800');
  def(T.POLE, 'flag_pole', false, 1, '#80d010');
  def(T.TREE_L, 'treetop_l', true, 1, '#00a800');
  def(T.TREE_M, 'treetop_m', true, 1, '#00a800');
  def(T.TREE_R, 'treetop_r', true, 1, '#00a800');
  def(T.TRUNK, 'trunk', false, 1, '#a05000');
  def(T.BRIDGE, 'bridge', true, 1, '#c84c0c');
  def(T.CHAIN, 'chain', false, 1, '#888888');
  def(T.AXE, 'axe', false, 3, '#d0d0d0');
  def(T.LAVA_TOP, 'lava_top', false, 1, '#f83800');
  def(T.LAVA, 'lava', false, 1, '#d82800');
  def(T.INVIS_WALL, null, true);

  // ---------------------------------------------------------------- builder
  class Builder {
    constructor(width, opts) {
      this.w = width;
      this.tiles = new Uint8Array(width * ROWS);
      this.contents = {};   // "x,y" -> 'coin' | 'power' | 'star' | '1up' | 'coins' (multi-coin brick) | 'vine'
      this.enemies = [];
      this.scenery = [];
      this.pipes = [];      // enterable pipes
      this.lifts = [];
      this.firebars = [];
      this.triggers = [];
      this.opts = opts || {};
    }
    set(x, y, t) { if (x >= 0 && x < this.w && y >= 0 && y < ROWS) this.tiles[y * this.w + x] = t; }
    get(x, y) { return (x >= 0 && x < this.w && y >= 0 && y < ROWS) ? this.tiles[y * this.w + x] : 0; }
    fill(x0, x1, y0, y1, t) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) this.set(x, y, t); return this; }
    ground(x0, x1, top) { return this.fill(x0, x1, top === undefined ? 13 : top, 14, T.GROUND); }
    row(x0, x1, y, t) { return this.fill(x0, x1, y, y, t); }
    bricks(x0, x1, y) { return this.row(x0, x1, y, T.BRICK); }
    brick(x, y, content) { this.set(x, y, T.BRICK); if (content) this.contents[x + ',' + y] = content; return this; }
    q(x, y, content) { this.set(x, y, T.QUESTION); this.contents[x + ',' + y] = content || 'coin'; return this; }
    hidden(x, y, content) { this.set(x, y, T.HIDDEN); this.contents[x + ',' + y] = content || 'coin'; return this; }
    block(x, y) { this.set(x, y, T.BLOCK); return this; }
    coins(x0, x1, y) { return this.row(x0, x1, y, T.COIN); }
    // Vertical pipe whose mouth is at row `top`, standing on the ground (rows top..bottom).
    pipe(x, top, bottom, enter) {
      bottom = bottom === undefined ? 12 : bottom;
      this.set(x, top, T.PIPE_TL); this.set(x + 1, top, T.PIPE_TR);
      for (let y = top + 1; y <= bottom; y++) { this.set(x, y, T.PIPE_L); this.set(x + 1, y, T.PIPE_R); }
      if (enter) this.pipes.push(Object.assign({ x, y: top, dir: 'down' }, enter));
      return this;
    }
    // Sideways pipe with its mouth facing left at (x, y..y+1), joined to a vertical pipe at x+2 going up to row 0.
    sidePipe(x, y, enter, bodyLen) {
      bodyLen = bodyLen === undefined ? 1 : bodyLen;
      this.set(x, y, T.SP_MT); this.set(x, y + 1, T.SP_MB);
      for (let i = 1; i <= bodyLen; i++) { this.set(x + i, y, T.SP_BT); this.set(x + i, y + 1, T.SP_BB); }
      const jx = x + bodyLen + 1;
      this.set(jx, y, T.SP_JT); this.set(jx, y + 1, T.SP_JB);
      for (let yy = 0; yy < y; yy++) { this.set(jx, yy, T.PIPE_L); this.set(jx + 1, yy, T.PIPE_R); }
      this.set(jx + 1, y, T.PIPE_R); this.set(jx + 1, y + 1, T.PIPE_R);
      if (enter) this.pipes.push(Object.assign({ x, y, dir: 'right' }, enter));
      return this;
    }
    stairsUp(x, n, height, base) { // columns x..x+n-1, heights 1..n (capped at `height`)
      base = base === undefined ? 12 : base;
      for (let i = 0; i < n; i++) { const h = Math.min(i + 1, height || n); this.fill(x + i, x + i, base - h + 1, base, T.BLOCK); }
      return this;
    }
    stairsDown(x, n, base) {
      base = base === undefined ? 12 : base;
      for (let i = 0; i < n; i++) { const h = n - i; this.fill(x + i, x + i, base - h + 1, base, T.BLOCK); }
      return this;
    }
    column(x, top, base, t) { return this.fill(x, x, top, base === undefined ? 12 : base, t || T.BLOCK); }
    enemy(type, x, y, opts) { this.enemies.push(Object.assign({ type, x, y }, opts || {})); return this; }
    scene(name, x, y) { this.scenery.push({ name, x, y }); return this; }
    flagpole(x) {
      this.set(x, 12, T.BLOCK);
      this.set(x, 2, T.POLE_TOP);
      for (let y = 3; y <= 11; y++) this.set(x, y, T.POLE);
      this.flag = { x };
      return this;
    }
    // End-of-level castle (5 tiles wide): small = rows 8-12, big = rows 2-12.
    castle(x, big) { this.castleX = x; this.castleY = big ? 2 : 8; this.scene(big ? 'castle_big' : 'castle_small', x, this.castleY); return this; }
    // Repeat the overworld background pattern (hills, bushes, clouds) every 48 tiles.
    overworldScenery(fromX, toX, skip) {
      const pat = [
        ['hill_large', 0, 10.8125], ['cloud_1', 8, 3], ['bush_3', 11, 12], ['hill_small', 16, 11.8125],
        ['cloud_1', 19, 2], ['bush_1', 23, 12], ['cloud_3', 27, 3], ['cloud_2', 36, 2], ['bush_2', 41, 12],
      ];
      for (let base = 0; base < toX; base += 48) {
        for (const [n, dx, y] of pat) {
          const x = base + dx;
          if (x < fromX || x > toX) continue;
          if (skip && skip(n, x)) continue;
          this.scene(n, x, y);
        }
      }
      return this;
    }
  }
  // Build from 15 strings of one char per column (generated level data, see tools/gen_levels.py).
  const CHAR = {
    '.': T.EMPTY, '#': T.GROUND, 'B': T.BRICK, '?': T.QUESTION, 'U': T.USED, 'X': T.BLOCK,
    '[': T.PIPE_TL, ']': T.PIPE_TR, '{': T.PIPE_L, '}': T.PIPE_R,
    'm': T.SP_MT, 'n': T.SP_MB, 's': T.SP_BT, 't': T.SP_BB, 'j': T.SP_JT, 'k': T.SP_JB,
    'o': T.COIN, 'h': T.HIDDEN, 'P': T.POLE_TOP, '|': T.POLE, 'F': T.BLOCK,
    '<': T.TREE_L, '=': T.TREE_M, '>': T.TREE_R, 'T': T.TRUNK, 'b': T.BRIDGE, 'c': T.CHAIN, 'a': T.AXE,
    'L': T.LAVA_TOP, 'l': T.LAVA,
  };
  Builder.fromRows = function (rows, opts) {
    const b = new Builder(rows[0].length, opts);
    for (let y = 0; y < ROWS && y < rows.length; y++) {
      const r = rows[y];
      for (let x = 0; x < r.length; x++) {
        const t = CHAR[r[x]];
        if (t === undefined) throw new Error('unknown tile char ' + r[x] + ' at ' + x + ',' + y);
        if (t) b.tiles[y * b.w + x] = t;
      }
    }
    return b;
  };

  // ---------------------------------------------------------------- runtime area
  class Area {
    constructor(def, b) {
      this.def = def;
      this.name = def.name;
      this.theme = def.theme || 'overworld';
      this.bg = def.bg || '#5c94fc';
      this.music = def.music || 'overworld';
      this.w = b.w;
      this.tiles = b.tiles;
      this.contents = b.contents;
      this.enemyDefs = b.enemies;
      this.scenery = b.scenery;
      this.pipes = b.pipes;
      this.lifts = b.lifts;
      this.firebars = b.firebars;
      this.flag = b.flag || null;
      this.castleX = b.castleX;
      this.castleY = b.castleY === undefined ? 8 : b.castleY;
      this.camMax = def.camMax ? def.camMax * TS : 0; // right edge the camera stops at (px), 0 = area end
      this.start = def.start || { x: 2.5, y: 12 };
      this.bumps = {};       // "x,y" -> frames left of bump animation
      this.coinHits = {};    // multi-coin brick state
      this.pxWidth = b.w * TS;
      this.scrollLock = def.scrollLock || false; // single-screen rooms
      this.axe = b.axe || null;
      this.bridge = b.bridge || null;
      this.extra = b.extra || {};
    }
    get(x, y) {
      if (y >= ROWS) return T.EMPTY;
      // The area's ends are walls all the way up, so nothing runs past them above the screen.
      if (x < 0 || x >= this.w) return T.INVIS_WALL;
      if (y < 0) return T.EMPTY;
      return this.tiles[y * this.w + x];
    }
    set(x, y, t) { if (x >= 0 && x < this.w && y >= 0 && y < ROWS) this.tiles[y * this.w + x] = t; }
    solid(x, y) {
      const t = this.get(x, y);
      return !!INFO[t].solid;
    }
    // Solid test for a pixel position.
    solidAtPx(px, py) { return this.solid(Math.floor(px / TS), Math.floor(py / TS)); }
    content(x, y) { return this.contents[x + ',' + y]; }
  }

  SMB.TS = TS;
  SMB.ROWS = ROWS;
  SMB.T = T;
  SMB.TILE_INFO = INFO;
  SMB.LevelBuilder = Builder;
  SMB.Area = Area;
  SMB.LevelDefs = SMB.LevelDefs || {};
})();
