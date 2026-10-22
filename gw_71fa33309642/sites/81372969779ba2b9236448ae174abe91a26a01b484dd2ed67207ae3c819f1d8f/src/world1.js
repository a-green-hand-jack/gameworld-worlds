// World 1-2 to 1-4 mechanics: lifts, firebars, podoboos, Bowser and his flames, the bridge and axe, Toad,
// lava, the warp zone and the auto-walk into the pipe at the start of 1-2.
(function () {
  const SMB = window.SMB;
  const TS = 16, W = 256, H = 240;
  const T = SMB.T;
  const A = () => SMB.Assets;
  const S = () => SMB.Sound;
  // Deterministic pseudo-random numbers (repeatable runs).
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  // ------------------------------------------------------------------ lifts
  // kind: 'up' / 'down' (constant speed, wrapping top <-> bottom), 'vert' / 'horiz' (back and forth over `range`
  // tiles), 'fall' (drops while Mario stands on it).
  class Lift {
    constructor(d) {
      this.kind = d.kind;
      this.x = d.x * TS; this.y = d.y * TS;
      this.w = (d.width || 3) * TS; this.h = 8;
      this.x0 = this.x; this.y0 = this.y;
      this.range = (d.range || 4) * TS;
      this.speed = d.speed || 1;
      this.t = d.phase || 0;
      this.dx = 0; this.dy = 0;
      this.vy = 0;
    }
    update(game) {
      const ox = this.x, oy = this.y;
      const p = game.player;
      const ridden = p.riding === this && !p.dead;
      if (this.kind === 'up' || this.kind === 'down') {
        this.y += this.kind === 'up' ? -this.speed : this.speed;
        if (this.y < -this.h - 8) this.y = H + 8;
        if (this.y > H + 8) this.y = -this.h - 8;
      } else if (this.kind === 'vert' || this.kind === 'horiz') {
        // Ease in and out like the NES lifts: full travel in `range` px, about one px per frame at mid-travel.
        this.t += this.speed * Math.PI / this.range;
        const off = (1 - Math.cos(this.t)) / 2 * this.range;
        if (this.kind === 'vert') this.y = this.y0 + off; else this.x = this.x0 + off;
      } else if (this.kind === 'fall') {
        if (ridden) this.vy = Math.min(2, this.vy + 0.1875); else this.vy = 0;
        this.y += this.vy;
      }
      this.dx = this.x - ox; this.dy = this.y - oy;
      if (ridden && this.dy < 20) {
        // Carry Mario; walls still stop him sideways.
        const save = p.vx; p.vx = this.dx; const vy = p.vy; p.vy = 0;
        SMB.moveAndCollide(game.area, p);
        p.vx = save; p.vy = vy;
        p.y = this.y - p.h; p.onGround = true;
      }
    }
    draw(ctx, camX) {
      const img = A().get('sprites/lift');
      for (let i = 0; i < this.w; i += 8) {
        const x = Math.round(this.x + i - camX), y = Math.round(this.y);
        if (x < -8 || x > W) continue;
        if (!A().drawStrip(ctx, img, 0, 8, 8, x, y)) A().placeholder(ctx, x, y, 8, 8, '#f8b800');
      }
    }
  }
  SMB.Lift = Lift;

  // ------------------------------------------------------------------ firebar (enemy-like hazard)
  // Rotates around the centre of its block; one revolution every `period` frames. Touching any ball hurts Mario.
  class Firebar {
    constructor(game, d) {
      this.game = game; this.type = 'firebar';
      this.cx = d.x * TS + 8; this.cy = d.y * TS + 8;
      this.len = d.long ? 12 : 6;
      this.dir = d.ccw ? -1 : 1;
      this.period = d.period || 160;
      this.angle = d.angle !== undefined ? d.angle : 0; // radians, 0 = pointing right
      this.x = this.cx - this.len * 8; this.y = this.cy - this.len * 8; this.w = this.len * 16; this.h = this.len * 16;
      this.hazard = true; this.stationary = true; this.stompable = false; this.fireproof = true;
      this.anim = 0; this.dead = false; this.dying = false;
    }
    balls() {
      const out = [];
      for (let i = 0; i < this.len; i++) out.push([this.cx + Math.cos(this.angle) * i * 8, this.cy + Math.sin(this.angle) * i * 8]);
      return out;
    }
    update() {
      this.anim++;
      this.angle += this.dir * 2 * Math.PI / this.period;
    }
    hits(p) {
      for (const [bx, by] of this.balls()) {
        if (bx + 3 > p.x && bx - 3 < p.x + p.w && by + 3 > p.y && by - 3 < p.y + p.h) return true;
      }
      return false;
    }
    knockOff() {}
    draw(ctx, camX) {
      const img = A().get('sprites/fireball');
      const fr = (this.anim >> 2) & 3;
      for (const [bx, by] of this.balls()) {
        const x = Math.round(bx - 4 - camX), y = Math.round(by - 4);
        if (!A().drawStrip(ctx, img, fr, 8, 8, x, y)) A().placeholder(ctx, x + 1, y + 1, 6, 6, '#f83800');
      }
    }
  }

  // ------------------------------------------------------------------ podoboo (lava bubble)
  class Podoboo {
    constructor(game, d) {
      this.game = game; this.type = 'podoboo';
      this.w = 12; this.h = 14;
      this.x = d.x * TS + 2; this.baseY = H + 8; this.y = this.baseY;
      this.top = (d.top !== undefined ? d.top : 5) * TS;
      this.vy = 0; this.wait = d.delay || 30;
      this.hazard = true; this.stationary = true; this.stompable = false; this.fireproof = true;
      this.dead = false; this.dying = false; this.anim = 0;
    }
    update() {
      this.anim++;
      if (this.wait > 0) { this.wait--; this.y = this.baseY; if (this.wait === 0) this.vy = -Math.sqrt(2 * 0.1875 * (this.baseY - this.top)); return; }
      this.y += this.vy; this.vy += 0.1875;
      if (this.y >= this.baseY) { this.y = this.baseY; this.wait = 90; }
    }
    hits(p) { return SMB.overlap(this, p); }
    knockOff() {}
    draw(ctx, camX) {
      if (this.y >= H) return;
      const x = Math.round(this.x - 2 - camX), y = Math.round(this.y - 1);
      const img = A().get('sprites/podoboo');
      if (!A().drawStrip(ctx, img, 0, 16, 16, x, y, false, this.vy > 0)) {
        // No podoboo sprite: draw the fire-burst frame scaled into place, else a plain placeholder.
        if (!A().drawStrip(ctx, A().get('sprites/fire_burst'), 1, 16, 16, x, y)) A().placeholder(ctx, x + 2, y + 1, 12, 14, '#f83800');
      }
    }
  }

  // ------------------------------------------------------------------ Bowser and his flames
  class BowserFlame {
    constructor(game, x, y, targetY) {
      this.game = game; this.type = 'bowserfire';
      this.x = x; this.y = y; this.w = 24; this.h = 8; this.targetY = targetY;
      this.vx = -1;
      this.hazard = true; this.stationary = true; this.stompable = false; this.fireproof = true;
      this.dead = false; this.dying = false; this.anim = 0;
    }
    update() {
      this.anim++;
      this.x += this.vx;
      if (this.y < this.targetY) this.y = Math.min(this.targetY, this.y + 0.5);
      if (this.y > this.targetY) this.y = Math.max(this.targetY, this.y - 0.5);
      if (this.x + this.w < this.game.camX - 16) this.dead = true;
    }
    hits(p) { return this.x + 4 < p.x + p.w && this.x + this.w - 2 > p.x && this.y + 2 < p.y + p.h && this.y + this.h - 2 > p.y; }
    knockOff() {}
    draw(ctx, camX) {
      const x = Math.round(this.x - camX), y = Math.round(this.y);
      if (!A().drawStrip(ctx, A().get('sprites/bowser_fire'), (this.anim >> 3) & 1, 24, 8, x, y)) A().placeholder(ctx, x, y + 1, 24, 6, '#f83800');
    }
  }

  class Bowser {
    constructor(game, d) {
      this.game = game; this.type = 'bowser';
      this.w = 28; this.h = 30;
      this.x = d.x * TS + 2; this.y = (d.y + 1) * TS - this.h;
      this.homeX = this.x;
      this.vx = -0.5; this.vy = 0;
      this.facing = -1;
      this.hp = 5;
      this.stompable = false; this.fireproof = true; this.starProof = true;
      this.dead = false; this.dying = false; this.anim = 0;
      this.fireT = 90; this.jumpT = 120; this.moveT = 0;
      this.fakeType = d.fake || 'goomba';
      this.frozen = false;
      this.mouth = 0;
    }
    get firePoints() { return 5000; }
    update() {
      const g = this.game, p = g.player;
      this.anim++;
      if (this.dying) {
        this.vy = Math.min(4, this.vy + 0.25); this.y += this.vy;
        if (this.y > H + 40) this.dead = true;
        return;
      }
      if (this.frozen) return;
      // Pace back and forth around the start point, facing Mario.
      if (++this.moveT > 64) { this.moveT = 0; this.vx = this.x > this.homeX ? -0.5 : (this.x < this.homeX - 48 ? 0.5 : (rnd() < 0.5 ? -0.5 : 0.5)); }
      this.facing = p.cx < this.x + this.w / 2 ? -1 : 1;
      this.vy = Math.min(4, this.vy + 0.125);
      SMB.moveAndCollide(g.area, this);
      if (this.hitWall) this.vx = -this.vx;
      if (this.onGround && --this.jumpT <= 0) { this.vy = -2.5; this.jumpT = 100 + Math.floor(rnd() * 120); }
      if (this.y > H) { this.dead = true; return; }
      // Breathe fire toward Mario's height (rows 8..11 of the screen).
      if (--this.fireT <= 0 && this.facing < 0) {
        this.fireT = 120 + Math.floor(rnd() * 90);
        this.mouth = 20;
        const ty = Math.max(7 * TS, Math.min(11 * TS, Math.round((p.y + p.h - 16) / 8) * 8));
        g.enemies.push(new BowserFlame(g, this.x - 18, this.y + 4, ty));
        S().play('bowser_fire');
      }
      if (this.mouth > 0) this.mouth--;
    }
    fireHit() {
      if (this.dying) return;
      if (--this.hp <= 0) {
        // Five fireballs: he turns out to be an impostor and falls off the bridge.
        this.dying = true; this.flip = true; this.vy = -2;
        this.game.addScore(5000, this.x, this.y);
        S().play('bowser_fall');
        this.game.log('bowser', { by: 'fire' });
      }
    }
    knockOff() { /* stars and shells do not hurt him */ }
    draw(ctx, camX) {
      const x = Math.round(this.x - 2 - camX), y = Math.round(this.y - 2);
      if (this.dying && this.fakeType === 'goomba') {
        if (!A().drawStrip(ctx, A().get('sprites/goomba'), 0, 16, 16, x + 8, y + 16, false, true)) A().placeholder(ctx, x + 8, y + 16, 16, 16, '#a04000');
        return;
      }
      const walk = (this.anim >> 4) & 1;
      const fr = (this.mouth > 0 ? 2 : 0) + walk;
      if (!A().drawStrip(ctx, A().get('sprites/bowser'), fr, 32, 32, x, y, this.facing < 0, !!this.flip)) A().placeholder(ctx, x + 2, y + 2, 28, 30, '#00a800');
    }
  }

  // Before Bowser is on screen his flames fly in from the right edge (1-4 from the flame marker on).
  class FlameGen {
    constructor(game, d) {
      this.game = game; this.type = 'flamegen';
      this.x = d.x * TS; this.y = -32; this.w = 1; this.h = 1;
      this.hazard = true; this.stationary = true; this.stompable = false; this.fireproof = true;
      this.dead = false; this.dying = false; this.t = 60;
    }
    update() {
      const g = this.game, p = g.player;
      this.x = g.camX + 8; // travels with the screen
      if (g.enemies.some((e) => e.type === 'bowser')) { this.dead = true; return; }
      if (--this.t > 0) return;
      this.t = 150 + Math.floor(rnd() * 120);
      const ty = Math.max(4 * TS, Math.min(12 * TS, Math.round((p.y + p.h - 16) / 8) * 8 + (rnd() < 0.5 ? -16 : 0)));
      g.enemies.push(new BowserFlame(g, g.camX + W + 8, ty, ty));
      S().play('bowser_fire');
    }
    hits() { return false; }
    knockOff() {}
    draw() {}
  }

  // ------------------------------------------------------------------ Toad
  class Toad {
    constructor(game, d) {
      this.game = game; this.type = 'toad';
      this.x = d.x * TS; this.w = 16; this.h = 24; this.y = (d.y + 1) * TS - this.h;
      this.stationary = true; this.hazard = true; this.stompable = false; this.fireproof = true;
      this.dead = false; this.dying = false;
    }
    update() {}
    hits() { return false; }
    knockOff() {}
    draw(ctx, camX) {
      const x = Math.round(this.x - camX), y = Math.round(this.y);
      if (!A().drawStrip(ctx, A().get('sprites/toad'), 0, 16, 24, x, y)) A().placeholder(ctx, x + 2, y, 12, 24, '#fcfcfc');
    }
  }

  SMB.extraEnemies = Object.assign(SMB.extraEnemies || {}, {
    firebar: (g, d) => new Firebar(g, d),
    podoboo: (g, d) => new Podoboo(g, d),
    bowser: (g, d) => new Bowser(g, d),
    toad: (g, d) => new Toad(g, d),
    flamegen: (g, d) => new FlameGen(g, d),
  });
  SMB.World1 = { Lift, Firebar, Podoboo, Bowser, BowserFlame, FlameGen, Toad };

  // ------------------------------------------------------------------ game hooks
  const G = SMB.Game.prototype;

  // Lava: touching it is death (like a pit).
  G.checkLava = function (p) {
    const c0 = Math.floor(p.x / TS), c1 = Math.floor((p.x + p.w - 1) / TS);
    const r = Math.floor((p.y + p.h - 4) / TS);
    for (let c = c0; c <= c1; c++) {
      const t = this.area.get(c, r);
      if (t === T.LAVA_TOP || t === T.LAVA) { this.killPlayer(true); return true; }
    }
    return false;
  };

  // The axe at the end of a castle: the bridge collapses, Bowser falls, Mario walks to Toad.
  G.checkAxe = function (p) {
    const ax = this.area.axe;
    if (!ax || this.state !== 'play') return false;
    if (p.x + p.w > ax.x * TS + 2 && p.x < ax.x * TS + 14 && p.y < (ax.y + 1) * TS && p.y + p.h > ax.y * TS) {
      this.startAxe();
      return true;
    }
    return false;
  };

  G.startAxe = function () {
    const p = this.player, ax = this.area.axe, br = this.area.bridge;
    this.state = 'axe';
    this.axeState = { phase: 'collapse', t: 0, next: br ? br.x1 : -1 };
    p.control = false; p.vx = 0; p.vy = 0; p.star = 0;
    S().stopMusic();
    this.area.set(ax.x, ax.y, T.EMPTY);
    if (br && br.chain) this.area.set(br.chain.x, br.chain.y, T.EMPTY);
    this.bowser = this.enemies.find((e) => e.type === 'bowser' && !e.dying) || null;
    if (this.bowser) this.bowser.frozen = true;
    this.enemies = this.enemies.filter((e) => e.type === 'bowser' || e.type === 'toad');
    this.log('axe', { time: this.time });
  };

  G.updateCustom = function () {
    if (this.state === 'axe') return this.updateAxe();
  };

  G.updateAxe = function () {
    const a = this.axeState, p = this.player, br = this.area.bridge;
    a.t++;
    if (a.phase === 'collapse') {
      // Mario stands still on the far side while the bridge drops from the axe end, one tile every 4 frames.
      if (a.t % 4 === 0 && br && a.next >= br.x0) {
        this.area.set(a.next, br.y, T.EMPTY);
        S().play('break');
        a.next--;
      }
      if (!br || a.next < br.x0) {
        a.phase = 'fall'; a.t = 0;
        if (this.bowser && !this.bowser.dying) { this.bowser.dying = true; this.bowser.fakeType = null; this.bowser.vy = 0; S().play('bowser_fall'); }
      }
    } else if (a.phase === 'fall') {
      if (this.bowser) this.bowser.update();
      if (a.t >= 90) {
        a.phase = 'walk'; a.t = 0;
        S().playMusic('world_clear', false);
        p.autoRight = true;
      }
    } else if (a.phase === 'walk') {
      // Remaining time goes into the score while Mario walks to Toad.
      if (this.time > 0) { const n = Math.min(this.time, 2); this.time -= n; this.score += 50 * n; }
      this.spawnEnemies();
      const toad = this.enemies.find((e) => e.type === 'toad');
      const stopX = toad ? toad.x - 24 : this.area.pxWidth - 64;
      p.update();
      if (p.x >= stopX) { p.x = stopX; p.vx = 0; p.autoRight = false; }
      this.updateCamera();
      if (p.x >= stopX && p.onGround && this.time <= 0) { a.phase = 'message'; a.t = 0; }
    } else if (a.phase === 'message') {
      p.update();
      if (a.t > 420 || (a.t > 240 && SMB.Input.pressed('start'))) {
        this.saveTop();
        this.nextLevel();
      }
    }
    this.updateEffects();
  };

  // The message shown at the end of a castle.
  G.drawCastleMessage = function (ctx) {
    const a = this.axeState;
    if (!a || a.phase !== 'message') return;
    SMB.Text.center(ctx, 'THANK YOU MARIO!', 80);
    if (a.t > 90) {
      SMB.Text.center(ctx, 'BUT OUR PRINCESS IS IN', 112);
      SMB.Text.center(ctx, 'ANOTHER CASTLE!', 128);
    }
  };

  // Warp zone: running along the ceiling past `unlockX` lets the camera scroll on to `camMax`; when the screen
  // reaches the zone, show the banner and the world numbers above the pipes.
  G.updateWarpZone = function () {
    const wz = this.area.def.warpZone;
    if (!wz || this.warpShown === this.area) return;
    const p = this.player;
    if (wz.unlockX && p.x >= wz.unlockX * TS && p.y + p.h <= wz.ceilingY * TS + 1) this.area.camMax = wz.camMax * TS;
    if (this.camX + W >= wz.triggerX * TS) {
      this.warpShown = this.area;
      // Enemies on screen disappear, as in the original.
      for (const e of this.enemies) if (!e.hazard) e.dead = true;
      this.log('warpzone');
    }
  };
  G.drawWarpZone = function (ctx, camX) {
    const wz = this.area.def.warpZone;
    if (!wz || this.warpShown !== this.area) return;
    SMB.Text.draw(ctx, 'WELCOME TO WARP ZONE!', wz.textX * TS - camX, wz.textY * TS);
    for (const pp of wz.pipes) SMB.Text.draw(ctx, String(pp.world), pp.x * TS + 12 - camX, (pp.y - 1) * TS + 4);
  };
})();
