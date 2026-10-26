// World 2 mechanics: the vine and coin heaven above the clouds, the jumpspring, swimming enemies (Blooper,
// Cheep-cheeps) and their frenzies, flying Cheep-cheeps over the 2-3 bridges, and Mario's air bubbles under water.
// Mario's own swimming and climbing are in player.js.
(function () {
  const SMB = window.SMB;
  const TS = 16, W = 256, H = 240;
  const A = () => SMB.Assets;
  const S = () => SMB.Sound;
  const Enemy = SMB.Enemies.Enemy;
  // Deterministic pseudo-random numbers (repeatable runs).
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const rndInt = (n) => Math.floor(rnd() * n) % n;

  // ------------------------------------------------------------------ vine
  // Sprouts from a block (0.5 px per frame) up past the top of the screen. Mario grabs it by touching it in the air
  // or by pressing up; climbing off the top of the screen takes him to the area in the level's `vineTo`.
  class Vine {
    constructor(game, tx, ty, opts) {
      opts = opts || {};
      this.game = game; this.type = 'vine';
      this.x = tx * TS; this.w = 16;
      this.bottom = opts.bottom !== undefined ? opts.bottom : ty * TS;
      this.top = opts.top !== undefined ? opts.top : this.bottom;
      this.minTop = opts.minTop !== undefined ? opts.minTop : -32;
      this.dead = false;
    }
    update(game) {
      if (this.top > this.minTop) this.top = Math.max(this.minTop, this.top - 0.5);
      const p = game.player;
      if (p.dead || p.vine || !p.control || game.state !== 'play' || p.vineCool > 0) return;
      const touch = p.x + p.w > this.x + 3 && p.x < this.x + 13 && p.y < this.bottom - 2 && p.y + p.h > this.top + 4;
      if (touch && (!p.onGround || SMB.Input.isDown('up'))) {
        p.grabVine(this);
        game.log('vine', { x: Math.round(p.x) });
      }
    }
    draw(ctx, camX) {
      const img = A().get('sprites/vine');
      const x = Math.round(this.x - camX);
      if (x < -16 || x > W) return;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, Math.round(this.top), 16, Math.max(0, Math.round(this.bottom - this.top))); ctx.clip();
      for (let y = this.top, i = 0; y < this.bottom; y += 16, i++) {
        if (!A().drawStrip(ctx, img, i === 0 ? 0 : 1, 16, 16, x, Math.round(y))) {
          ctx.fillStyle = '#00a800'; ctx.fillRect(x + 7, Math.round(y), 2, 16);
          ctx.fillStyle = '#80d010'; ctx.fillRect(x + (i & 1 ? 9 : 3), Math.round(y) + 4, 4, 4);
        }
      }
      ctx.restore();
    }
  }
  SMB.Vine = Vine;

  // ------------------------------------------------------------------ jumpspring
  // A platform: landing on it squeezes it over 12 frames (Mario rides it down and up), then launches him with
  // speed -7, or -12 if A was pressed while it was squeezed. Gravity is 0x70/256 for that jump (NES values).
  const SPRING_OFFS = [0, 8, 16, 8, 0];
  class Jumpspring {
    constructor(d) {
      this.x = d.x * TS; this.base = d.y * TS; this.y = this.base;
      this.w = 16; this.h = 8;
      this.ctrl = 0; this.timer = 0; this.force = -7;
      this.dx = 0; this.dy = 0;
    }
    onLand(p) {
      if (this.ctrl || p.springLock || p.dead) return;
      this.ctrl = 1; this.timer = 3; this.force = -7;
      p.springLock = this; p.vx = 0; p.vy = 0;
      p.game.log('spring', { x: this.x / TS });
    }
    update(game) {
      const oy = this.y, p = game.player;
      if (this.ctrl) {
        if (this.ctrl >= 2 && SMB.Input.pressed('A') && p.control) this.force = -12;
        this.y = this.base + SPRING_OFFS[this.ctrl];
        if (p.springLock === this) { p.y = this.y - p.h; p.onGround = true; }
        if (this.ctrl === 4) {
          this.ctrl = 0;
          if (p.springLock === this) {
            p.springLock = null;
            p.vy = this.force; p.onGround = false;
            p.jumping = SMB.Input.isDown('A');
            p.gravHold = p.gravFall = 0x70 / 256;
            p.airFrame = true; p.airMax = SMB.PHYS.maxWalk;
            game.log('springjump', { force: this.force });
          }
        } else if (--this.timer <= 0) { this.timer = 4; this.ctrl++; }
      }
      this.dx = 0; this.dy = this.y - oy;
    }
    draw(ctx, camX) {
      const x = Math.round(this.x - camX);
      if (x < -16 || x > W) return;
      const off = this.y - this.base;
      if (!A().drawStrip(ctx, A().get('sprites/jumpspring'), off / 8, 16, 32, x, this.base)) {
        A().placeholder(ctx, x + 1, Math.round(this.y), 14, 4, '#d82800');
        ctx.fillStyle = '#fcfcfc'; ctx.fillRect(x + 5, Math.round(this.y) + 4, 6, this.base + 28 - Math.round(this.y) - 4);
        A().placeholder(ctx, x + 1, this.base + 28, 14, 4, '#d82800');
      }
    }
  }
  SMB.Jumpspring = Jumpspring;

  // ------------------------------------------------------------------ Blooper
  // Rises in spurts toward Mario's side (speed 0,1,2,1,0 px per frame, 8 frames each), then sinks 1 px every
  // other frame for 42 frames and on until it is no longer above Mario. Fireballs and stars beat it.
  class Blooper extends Enemy {
    constructor(game, d) {
      super(game, d);
      this.w = 12; this.h = 20;
      this.x = d.x * TS + 2; this.y = (d.y + 1) * TS - 24 + 2;
      this.stompable = false; this.stationary = true;
      this.phase = 'float'; this.timer = 0; this.speed = 0; this.slowing = false;
      this.vx = 0; this.facing = -1;
    }
    get firePoints() { return 200; }
    update() {
      if (this.dying) return this.updateDying();
      const p = this.game.player;
      this.anim++;
      if (rnd() < 1 / 64) this.facing = p.cx < this.x + this.w / 2 ? -1 : 1;
      if (this.phase === 'swim') {
        if ((this.anim & 7) === 0) {
          if (!this.slowing) { if (++this.speed >= 2) this.slowing = true; }
          else if (--this.speed <= 0) { this.speed = 0; this.phase = 'float'; this.timer = 42; }
        }
        if (this.y > 32) this.y -= this.speed;
        this.x += this.facing * this.speed;
      } else {
        if ((this.anim & 1) === 0) this.y += 1;
        if (this.timer > 0) this.timer--;
        else if (this.y + 16 >= p.y) {
          this.phase = 'swim'; this.speed = 0; this.slowing = false;
          this.facing = p.cx < this.x + this.w / 2 ? -1 : 1;
        }
      }
      this.y = Math.min(this.y, 13 * TS - this.h - 2);
    }
    draw(ctx, camX) {
      const x = Math.round(this.x - 2 - camX), y = Math.round(this.y - 2);
      const fr = this.phase === 'swim' ? 0 : 1;
      if (!A().drawStrip(ctx, A().get('sprites/blooper'), fr, 16, 24, x, y, false, this.flip)) {
        A().placeholder(ctx, x + 2, y + (fr ? 6 : 0), 12, fr ? 18 : 24, '#fcfcfc');
      }
    }
  }

  // ------------------------------------------------------------------ Cheep-cheeps
  // Swimming: drifts left (grey 0.25, red 0.5 px per frame) and bobs 15 px up and down.
  class CheepSwim extends Enemy {
    constructor(game, d) {
      super(game, d);
      this.w = 14; this.h = 12;
      this.x = d.x * TS + 1; this.y = d.py !== undefined ? d.py : (d.y + 1) * TS - 14;
      this.color = d.color || 'grey';
      this.vx = this.color === 'red' ? -0.5 : -0.25; this.facing = -1;
      this.baseY = this.y; this.bob = 0.125;
      this.stompable = false; this.stationary = true;
    }
    get firePoints() { return 200; }
    update() {
      if (this.dying) return this.updateDying();
      this.anim++;
      this.x += this.vx;
      this.y += this.bob;
      if (Math.abs(this.y - this.baseY) >= 15) this.bob = -this.bob;
    }
    draw(ctx, camX) {
      const x = Math.round(this.x - 1 - camX), y = Math.round(this.y - 2);
      if (!A().drawStrip(ctx, A().get('sprites/cheep_' + this.color), (this.anim >> 3) & 1, 16, 16, x, y, this.vx < 0, this.flip)) {
        A().placeholder(ctx, x + 1, y + 2, 14, 12, this.color === 'red' ? '#d82800' : '#bcbcbc');
      }
    }
  }

  // Flying (2-3): leaps from below the screen near Mario at -5 px per frame, gravity 13/256; can be stomped.
  const FLY_X = [0x80, 0x30, 0x40, 0x80, 0x30, 0x50, 0x50, 0x70, 0x20, 0x40, 0x80, 0xa0, 0x70, 0x40, 0x90, 0x68];
  const FLY_VX = [0x0e, 0x05, 0x06, 0x0e, 0x1c, 0x20, 0x10, 0x0c, 0x1e, 0x22, 0x18, 0x14];
  class CheepFly extends Enemy {
    constructor(game, d) {
      super(game, d);
      this.w = 14; this.h = 12;
      this.x = d.px; this.y = H + 8;
      this.vx = d.vx; this.vy = -5; this.facing = this.vx < 0 ? -1 : 1;
      this.color = 'red'; this.stationary = true; this.frenzy = true;
    }
    get firePoints() { return 200; }
    update() {
      if (this.dying) { this.vy = Math.min(4, this.vy + 0.25); this.y += this.vy; if (this.y > H + 16) this.dead = true; return; }
      this.anim++;
      this.x += this.vx;
      this.y += this.vy;
      this.vy = Math.min(5, this.vy + 13 / 256);
      if (this.vy > 0 && this.y > H + 16) this.dead = true;
    }
    stomp() { this.dying = true; this.flip = true; this.vx = 0; this.vy = 0; return 'stomp'; }
    draw(ctx, camX) {
      const x = Math.round(this.x - 1 - camX), y = Math.round(this.y - 2);
      if (!A().drawStrip(ctx, A().get('sprites/cheep_red'), (this.anim >> 2) & 1, 16, 16, x, y, this.facing < 0, this.flip)) {
        A().placeholder(ctx, x + 1, y + 2, 14, 12, '#d82800');
      }
    }
  }

  SMB.extraEnemies = Object.assign(SMB.extraEnemies || {}, {
    blooper: (g, d) => new Blooper(g, d),
    cheep: (g, d) => new CheepSwim(g, d),
    redcheep: (g, d) => new CheepSwim(g, Object.assign({}, d, { color: 'red' })),
  });

  // ------------------------------------------------------------------ air bubbles (Mario under water)
  class Bubble {
    constructor(x, y) { this.x = x; this.y = y; this.dead = false; this.t = 0; }
    update() { this.t++; this.y -= 0.75; if (this.y < 2.5 * TS) this.dead = true; }
    draw(ctx, camX) {
      const x = Math.round(this.x - camX + Math.sin(this.t / 6) * 1.5), y = Math.round(this.y);
      if (!A().drawStrip(ctx, A().get('sprites/bubble'), 0, 8, 8, x, y)) {
        ctx.fillStyle = '#fcfcfc'; ctx.fillRect(x + 2, y + 2, 4, 4);
      }
    }
  }

  // ------------------------------------------------------------------ frenzies
  // def.frenzies: [{kind: 'cheep' | 'flying_cheep', x0, x1}] - active while the screen's right edge is between
  // columns x0 and x1, as the original triggers them.
  const SWIM_Y = [0x40, 0x30, 0x90, 0x50, 0x20, 0x60, 0xa0, 0x70];
  const FLY_TIMER = [0x10, 0x60, 0x20, 0x48];
  function updateFrenzies(game, p) {
    const fr = game.area.def.frenzies;
    if (!fr) return;
    const edge = (game.camX + W) / TS;
    const st = game.frenzyState || (game.frenzyState = { t: 0, swimY: 0 });
    for (const f of fr) {
      if (edge < f.x0 || edge >= (f.x1 || Infinity)) continue;
      const mine = game.enemies.filter((e) => e.frenzy && !e.dying).length;
      if (--st.t > 0) continue;
      if (f.kind === 'cheep') {
        st.t = 32;
        if (mine >= 3) continue;
        const e = new CheepSwim(game, { type: 'cheep', x: 0, y: 0, color: rnd() < 0.5 ? 'red' : 'grey' });
        e.x = game.camX + W + 8; e.y = e.baseY = SWIM_Y[st.swimY++ % SWIM_Y.length];
        e.frenzy = true;
        game.enemies.push(e);
      } else {
        st.t = FLY_TIMER[rndInt(4)];
        if (mine >= 3) continue;
        const a = rndInt(4);
        const moving = Math.abs(p.vx) > 0;
        const base = !moving ? 0 : (p.vx > 0 && p.vx < 0x19 / 16 ? 4 : 8);
        let s0 = base + a;
        if (rndInt(4) !== 0) s0 = rndInt(16);
        let vx = FLY_VX[base + a] / 16;
        if (!moving && (s0 & 2)) vx = -vx;
        const px = (s0 & 2) ? p.x + FLY_X[s0] : p.x - FLY_X[s0];
        game.enemies.push(new CheepFly(game, { type: 'flycheep', px, vx }));
      }
    }
  }

  // ------------------------------------------------------------------ game hooks
  const G = SMB.Game.prototype;

  SMB.playHooks.push(function (p) {
    const def = this.area.def;
    // Climbing off the top of the screen: up to coin heaven.
    if (p.vine && def.vineTo && p.y + p.h < 24) {
      this.log('vineexit', { to: def.vineTo.area });
      this.power = p.power;
      this.loadArea(this.levelId, def.vineTo.area, { vine: true });
      return true;
    }
    // Falling out of coin heaven lands Mario back in the course.
    if (p.y > H && def.fallTo) {
      this.log('fallto', { to: def.fallTo.area, x: def.fallTo.x });
      this.power = p.power;
      this.loadArea(this.levelId, def.fallTo.area, { x: def.fallTo.x, drop: true });
      this.state = 'play';
      this.playAreaMusic();
      return true;
    }
    updateFrenzies(this, p);
    // Air bubbles from Mario's mouth.
    if (def.water && !p.dead && (this.frame % 80) === 0) {
      this.effects.push(new Bubble(p.x + (p.facing > 0 ? p.w : -4), p.y + 2));
    }
    return false;
  });

  // Entering an area by vine: Mario climbs up out of the clouds on a vine at column vineEntry.x, then steps off.
  SMB.areaHooks.push(function (area, entry) {
    this.frenzyState = null;
    const ve = area.def.vineEntry;
    if (!entry || !entry.vine || !ve) return;
    const v = new Vine(this, ve.x, 0, { top: ve.top * TS, bottom: H + 16, minTop: ve.top * TS });
    this.hazards.push(v);
    const p = this.player;
    p.grabVine(v);
    p.facing = 1; p.x = v.x - 7; p.y = H;
    p.control = false;
    this.camX = 0;
    this.state = 'vineentry';
    S().stopMusic();
  });

  const prevCustom = G.updateCustom;
  G.updateCustom = function () {
    if (this.state === 'vineentry') return this.updateVineEntry();
    if (prevCustom) return prevCustom.call(this);
  };
  G.updateVineEntry = function () {
    const p = this.player;
    p.y -= 0.875;
    if ((this.frame & 7) === 0) p.climbFrame ^= 1;
    for (const pl of this.platforms) pl.update(this);
    for (const h of this.hazards) h.update(this);
    if (p.y + p.h <= 192) {
      // Step off to the right of the vine onto the clouds.
      const vx = p.vine ? p.vine.x : 64;
      p.letGoVine();
      p.facing = 1; p.x = vx + 16; p.control = true;
      this.state = 'play';
      this.playAreaMusic();
      this.log('start', { level: this.levelId, area: this.area.name });
    }
  };

  SMB.World2 = { Vine, Jumpspring, Blooper, CheepSwim, CheepFly, Bubble };
})();
