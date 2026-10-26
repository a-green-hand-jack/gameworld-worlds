// Enemies: Goomba, Koopa Troopa (+shell), Koopa Paratroopa, Piranha Plant, Bowser, Firebar.
(function () {
  const SMB = window.SMB;
  const TS = 16;
  const A = () => SMB.Assets;
  const GRAV = 0.375, MAXFALL = 4;
  const SPEED = 0.5;
  const SHELL_SPEED = 3;

  class Enemy {
    constructor(game, def) {
      this.game = game;
      this.type = def.type;
      this.dead = false;      // removed from the world
      this.dying = false;     // flipped / flattened, no interaction
      this.vx = -SPEED; this.vy = 0;
      this.facing = -1;
      this.anim = 0;
      this.stompable = true;
      this.fireproof = false;
      this.harmless = 0;
      this.flip = false;
    }
    // Default walker update: gravity, tile collision, turn at walls.
    walk(turnAtLedges) {
      this.vy = Math.min(MAXFALL, this.vy + GRAV);
      const vx0 = this.vx;
      SMB.moveAndCollide(this.game.area, this);
      if (this.hitWall) { this.vx = -vx0; }
      if (turnAtLedges && this.onGround) {
        const ahead = this.vx > 0 ? this.x + this.w + 1 : this.x - 1;
        const r = Math.floor((this.y + this.h + 1) / TS);
        if (!this.game.area.solid(Math.floor(ahead / TS), r)) { this.vx = -this.vx; this.x += this.vx; }
      }
      this.facing = this.vx > 0 ? 1 : -1;
      if (this.y > 260) this.dead = true;
    }
    // Knocked off the screen (fireball, shell, star, block bump).
    knockOff(dirX) {
      this.dying = true;
      this.flip = true;
      this.vy = -3;
      this.vx = (dirX || 1) * 0.6;
    }
    updateDying() {
      this.vy = Math.min(MAXFALL, this.vy + GRAV);
      this.x += this.vx; this.y += this.vy;
      if (this.y > 260) this.dead = true;
    }
    turnAround() { this.vx = -this.vx; this.facing = -this.facing; }
    // Points for knocking this enemy off with a fireball / bump.
    get firePoints() { return 100; }
  }

  // ------------------------------------------------------------------ Goomba
  class Goomba extends Enemy {
    constructor(game, def) {
      super(game, def);
      this.w = 14; this.h = 14;
      this.x = def.x * TS + 1; this.y = (def.y + 1) * TS - this.h;
      this.flatT = 0;
    }
    update() {
      if (this.flatT > 0) { if (--this.flatT === 0) this.dead = true; return; }
      if (this.dying) return this.updateDying();
      this.anim++;
      this.walk(false);
    }
    stomp() { this.dying = true; this.flatT = 30; this.vx = 0; }
    draw(ctx, camX) {
      const key = this.game.area.theme === 'underground' && A().get('sprites/goomba_ug') ? 'sprites/goomba_ug' : 'sprites/goomba';
      const fr = this.flatT > 0 ? 2 : (this.anim >> 3) & 1;
      const x = this.x - 1 - camX, y = this.y + this.h - 16;
      if (!A().drawStrip(ctx, A().get(key), fr, 16, 16, x, y, false, this.flip)) {
        A().placeholder(ctx, x, this.flatT > 0 ? y + 8 : y, 16, this.flatT > 0 ? 8 : 16, '#a04000');
      }
    }
  }

  // ------------------------------------------------------------------ Koopa Troopa / shell
  class Koopa extends Enemy {
    constructor(game, def) {
      super(game, def);
      this.color = def.color || 'green';
      this.w = 14; this.h = 22;
      this.x = def.x * TS + 1; this.y = (def.y + 1) * TS - this.h;
      this.state = 'walk';    // walk | shell | slide
      this.shellT = 0;
      this.chain = 0;
      this.wings = !!def.wings;
      this.fly = def.fly || null; // {range, period} vertical flight for red paratroopas
      if (this.fly) { this.baseY = this.y; this.vx = 0; this.flyT = 0; }
    }
    get firePoints() { return 200; }
    setShell() {
      const bottom = this.y + this.h;
      this.h = 14; this.y = bottom - this.h;
      this.state = 'shell'; this.vx = 0; this.shellT = 0; this.chain = 0; this.wings = false; this.fly = null;
    }
    update() {
      if (this.dying) return this.updateDying();
      if (this.harmless > 0) this.harmless--;
      this.anim++;
      if (this.state === 'walk') {
        if (this.fly) {
          this.flyT++;
          this.y = this.baseY + Math.sin(this.flyT * 2 * Math.PI / this.fly.period) * this.fly.range * TS / 2;
          this.facing = this.game.player.cx < this.x + this.w / 2 ? -1 : 1;
          return;
        }
        if (this.wings && this.onGround) { this.vy = -4.2; }
        if (this.wings) {
          this.vy = Math.min(MAXFALL, this.vy + 0.18);
          const vx0 = this.vx;
          SMB.moveAndCollide(this.game.area, this);
          if (this.hitWall) this.vx = -vx0;
          this.facing = this.vx > 0 ? 1 : -1;
          if (this.y > 260) this.dead = true;
          return;
        }
        this.walk(this.color === 'red');
      } else if (this.state === 'shell') {
        this.shellT++;
        this.vy = Math.min(MAXFALL, this.vy + GRAV);
        this.vx = 0;
        SMB.moveAndCollide(this.game.area, this);
        if (this.shellT >= 300) {
          // Climb back out of the shell.
          const bottom = this.y + this.h;
          this.h = 22; this.y = bottom - this.h;
          this.state = 'walk'; this.vx = this.game.player.cx < this.x ? -SPEED : SPEED;
        }
        if (this.y > 260) this.dead = true;
      } else { // slide
        this.vy = Math.min(MAXFALL, this.vy + GRAV);
        const vx0 = this.vx;
        SMB.moveAndCollide(this.game.area, this);
        if (this.hitWall) {
          this.vx = -vx0;
          if (this.game.onScreen(this)) SMB.Sound.play('bump');
        }
        if (this.y > 260) this.dead = true;
      }
    }
    stomp(player) {
      if (this.wings || this.fly) {
        this.wings = false;
        if (this.fly) { this.fly = null; this.vx = -SPEED; }
        this.vx = this.vx || -SPEED;
        return 'unwing';
      }
      if (this.state === 'walk' || this.state === 'slide') { this.setShell(); return 'shell'; }
      // A resting shell that is stomped gets kicked.
      this.kick(player);
      return 'kick';
    }
    kick(player) {
      const dir = player.cx < this.x + this.w / 2 ? 1 : -1;
      this.state = 'slide';
      this.vx = dir * SHELL_SPEED;
      this.harmless = 10;
      this.chain = 0;
      this.x += dir * 4;
    }
    draw(ctx, camX) {
      const flip = this.facing < 0; // sprites face right (docs/assets.md); mirror when walking left
      if (this.state === 'walk') {
        const key = 'sprites/' + (this.wings || this.fly ? 'parakoopa_' : 'koopa_') + this.color;
        const fr = (this.anim >> 3) & 1;
        const x = this.x - 1 - camX, y = this.y + this.h - 24;
        if (!A().drawStrip(ctx, A().get(key), fr, 16, 24, x, y, flip, this.flip)) {
          A().placeholder(ctx, x, y + 8, 16, 16, this.color === 'red' ? '#d82800' : '#00a800');
          A().placeholder(ctx, x + (flip ? 0 : 10), y, 6, 10, '#fcbc3c');
          if (this.wings || this.fly) A().placeholder(ctx, x + (flip ? 10 : 0), y + 4, 6, 6, '#fcfcfc');
        }
      } else {
        const key = 'sprites/shell_' + this.color;
        const fr = this.state === 'shell' && this.shellT > 220 && (this.shellT >> 3) & 1 ? 1 : 0;
        const x = this.x - 1 - camX, y = this.y + this.h - 16;
        if (!A().drawStrip(ctx, A().get(key), fr, 16, 16, x, y, false, this.flip)) {
          A().placeholder(ctx, x, y + 2, 16, 14, this.color === 'red' ? '#d82800' : '#00a800');
        }
      }
    }
  }

  // ------------------------------------------------------------------ Piranha Plant
  class Piranha extends Enemy {
    constructor(game, def) {
      super(game, def);
      this.w = 12; this.h = 22;
      this.pipeTop = def.y * TS;              // top of the pipe mouth (pixel)
      this.x = def.x * TS + 16 - this.w / 2;  // centred on a 2-tile pipe whose left column is def.x
      this.rise = 0;                          // how far out of the pipe (0..24)
      this.phase = 'wait'; this.t = 60;
      this.stompable = false;
      this.vx = 0;
      this.y = this.pipeTop;
    }
    get firePoints() { return 200; }
    update() {
      if (this.dying) { this.dead = true; return; }
      this.anim++;
      const p = this.game.player;
      if (this.phase === 'wait') {
        if (--this.t <= 0) {
          const near = Math.abs(p.cx - (this.x + this.w / 2)) < 33;
          if (near) this.t = 10; else this.phase = 'up';
        }
      } else if (this.phase === 'up') {
        this.rise = Math.min(24, this.rise + 0.5);
        if (this.rise >= 24) { this.phase = 'out'; this.t = 60; }
      } else if (this.phase === 'out') {
        if (--this.t <= 0) this.phase = 'down';
      } else if (this.phase === 'down') {
        this.rise = Math.max(0, this.rise - 0.5);
        if (this.rise <= 0) { this.phase = 'wait'; this.t = 60; }
      }
      this.y = this.pipeTop - this.rise;
      this.h = Math.max(1, this.rise - 2);
    }
    get hidden() { return this.rise < 3; }
    draw(ctx, camX) {
      if (this.rise <= 0) return;
      const x = this.x - 2 - camX, y = this.pipeTop - this.rise;
      ctx.save();
      ctx.beginPath(); ctx.rect(Math.round(x) - 2, 0, 20, Math.round(this.pipeTop)); ctx.clip();
      if (!A().drawStrip(ctx, A().get('sprites/piranha'), (this.anim >> 3) & 1, 16, 24, x, y)) {
        A().placeholder(ctx, x + 2, y, 12, 12, '#e40058');
        A().placeholder(ctx, x + 6, y + 12, 4, 12, '#00a800');
      }
      ctx.restore();
    }
  }

  SMB.Enemies = { Goomba, Koopa, Piranha, Enemy };
  SMB.makeEnemy = function (game, def) {
    switch (def.type) {
      case 'goomba': return new Goomba(game, def);
      case 'koopa': return new Koopa(game, def);
      case 'redkoopa': return new Koopa(game, Object.assign({}, def, { color: 'red' }));
      case 'parakoopa': return new Koopa(game, Object.assign({}, def, { wings: true }));
      case 'redparakoopa': return new Koopa(game, Object.assign({}, def, { color: 'red', fly: def.fly || { range: 4, period: 240 } }));
      case 'piranha': return new Piranha(game, def);
      default:
        if (SMB.extraEnemies && SMB.extraEnemies[def.type]) return SMB.extraEnemies[def.type](game, def);
        console.warn('unknown enemy', def.type); return null;
    }
  };
})();
