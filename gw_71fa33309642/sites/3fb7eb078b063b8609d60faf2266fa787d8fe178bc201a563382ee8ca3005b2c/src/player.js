// Mario: movement, jumping, power-ups, damage and the drawing of his frames.
(function () {
  const SMB = window.SMB;
  const P = SMB.PHYS;
  const TS = 16;
  // Frame indices in the 13-frame Mario strips (docs/assets.md).
  const F = { stand: 0, walk: [1, 2, 3], skid: 4, jump: 5, crouch: 6, death: 6, climb: [7, 8], swim: [9, 10, 11], throw: 12 };
  const STAR_COLORS = ['#f83800', '#00a800', '#fcfcfc', '#000000'];
  // Swimming (NES values): a stroke sets the vertical speed to -1.5; gravity is 13/256 while A is held on the way
  // up, else 10/256; near the water's surface (top above y=20) a stroke only stops him and gravity is 24/256.
  const SWIM = { stroke: -1.5, gravHold: 13 / 256, gravFall: 10 / 256, gravTop: 24 / 256, surface: 20, maxGround: 1, maxAir: 1.5 };

  class Player {
    constructor(game, x, y, power) {
      this.game = game;
      this.power = power || 0;   // 0 small, 1 super, 2 fire
      this.w = 12;
      this.setSize();
      this.x = x; this.y = y - this.h;
      this.vx = 0; this.vy = 0;
      this.facing = 1;
      this.onGround = false;
      this.jumping = false;      // rising from a jump (A gravity applies)
      this.gravHold = P.jumps[0][2]; this.gravFall = P.jumps[0][3];
      this.crouch = false;
      this.skidding = false;
      this.animT = 0; this.walkFrame = 0;
      this.invuln = 0;           // blink frames after damage
      this.star = 0;             // invincibility frames
      this.throwT = 0;
      this.dead = false;
      this.stompChain = 0;
      this.control = true;       // false during scripted sequences
      this.airMax = P.maxWalk;
      this.visible = true;
      this.behind = false;       // drawn behind tiles (pipes)
      this.climbFrame = 0;
      this.swimT = 0;            // frames since the last stroke may be repeated in mid-rise
      this.swimAnim = 0;
      this.vine = null;          // the vine Mario is climbing
      this.springLock = null;    // the jumpspring holding Mario while it compresses
    }

    setSize() {
      const big = this.power > 0 && !this.crouch;
      const nh = big ? 27 : 14;
      if (this.h !== undefined) this.y += this.h - nh;
      this.h = nh;
    }
    get big() { return this.power > 0; }
    get cx() { return this.x + this.w / 2; }
    get bottom() { return this.y + this.h; }

    update() {
      const I = SMB.Input;
      const g = this.game;
      if (this.invuln > 0) this.invuln--;
      if (this.star > 0) {
        this.star--;
        if (this.star === 0) g.resumeLevelMusic();
      }
      if (this.throwT > 0) this.throwT--;
      if (this.springLock) { this.vx = 0; this.vy = 0; return; }   // the jumpspring moves him (SMB.Jumpspring)
      if (this.vineCool > 0) this.vineCool--;
      if (this.vine) { this.updateClimb(); return; }
      const water = !!g.area.def.water;
      if (this.swimT > 0) this.swimT--;

      const left = this.control && I.isDown('left'), right = this.autoRight || (this.control && I.isDown('right'));
      const down = this.control && I.isDown('down');
      const runB = this.control && I.isDown('B');
      const aHeld = this.control && I.isDown('A');
      const dir = right ? 1 : left ? -1 : 0;

      // Crouch (big Mario only, on the ground).
      if (this.onGround) {
        const wantCrouch = down && this.big;
        if (wantCrouch !== this.crouch) {
          if (!wantCrouch && !this.canStandUp()) { /* stay crouched under a low ceiling */ }
          else { this.crouch = wantCrouch; this.setSize(); }
        }
      }

      // Fireballs.
      if (this.control && I.pressed('B') && this.power === 2 && !this.crouch) {
        if (g.countFireballs() < 2) {
          g.spawnFireball(this.facing > 0 ? this.x + this.w : this.x - 8, this.y + 4, this.facing);
          this.throwT = 8;
          SMB.Sound.play('fireball');
        }
      }

      // Horizontal movement.
      this.skidding = false;
      if (water) {
        // Under water: slow walking on the floor, a little faster swimming; no friction while swimming.
        const max = this.onGround ? SWIM.maxGround : SWIM.maxAir;
        if (this.onGround && this.crouch) this.decel(P.release);
        else if (dir !== 0) {
          const s = Math.abs(this.vx);
          if (this.vx === 0 || Math.sign(this.vx) === dir) this.vx = dir * (s > max ? Math.max(max, s - P.walkAcc) : Math.min(max, s + P.walkAcc));
          else { this.vx -= Math.sign(this.vx) * P.walkAcc * 2; if (Math.abs(this.vx) < 0.01) this.vx = 0; }
          this.facing = dir;
        } else if (this.onGround) this.decel(P.release);
      } else if (this.onGround) {
        if (this.crouch) {
          this.decel(P.release);
        } else if (dir !== 0) {
          if (this.vx === 0 || Math.sign(this.vx) === dir) {
            const max = runB ? P.maxRun : P.maxWalk;
            const acc = runB ? P.runAcc : P.walkAcc;
            const s = Math.abs(this.vx);
            if (s < P.minWalk) this.vx = dir * P.minWalk;
            else if (s < max) this.vx = dir * Math.min(max, s + acc);
            else if (s > max) this.vx = dir * Math.max(max, s - P.release);
            this.facing = dir;
          } else {
            this.skidding = true;
            this.facing = dir;
            const s = Math.abs(this.vx) - P.skid;
            if (s <= P.minWalk) { this.vx = 0; } else this.vx = Math.sign(this.vx) * s;
          }
        } else {
          this.decel(P.release);
        }
      } else if (dir !== 0) {
        const s = Math.abs(this.vx);
        const max = runB ? Math.max(this.airMax, P.maxWalk) : this.airMax;
        if (this.vx === 0 || Math.sign(this.vx) === dir) {
          const acc = s < P.maxWalk ? P.walkAcc : P.runAcc;
          if (s < max) this.vx = dir * Math.min(max, Math.max(s, 0) + acc);
        } else {
          const dec = s >= P.maxWalk ? P.runAcc : (this.takeoffSpeed >= 0x1D00 / 4096 ? P.release : P.walkAcc);
          this.vx -= Math.sign(this.vx) * dec;
          if (Math.abs(this.vx) < 0.01) this.vx = 0;
        }
      }

      // Jump.
      let justJumped = false;
      if (water) {
        // Swim stroke: from the floor at any time, in the water unless still rising from a stroke over 32 frames old.
        if (this.control && I.pressed('A') && (this.onGround || this.swimT > 0 || this.vy >= 0)) {
          this.swimT = 32;
          this.vy = this.y < SWIM.surface ? 0 : SWIM.stroke;
          this.jumping = this.vy < 0;
          this.onGround = false;
          this.swimAnim = 0;
          justJumped = true;
          SMB.Sound.play('swim');
        }
        if (!aHeld || this.vy >= 0) this.jumping = false;
        if (!justJumped) this.vy += this.y < SWIM.surface ? SWIM.gravTop : this.jumping ? SWIM.gravHold : SWIM.gravFall;
        if (this.vy > P.maxFall) this.vy = P.maxFall;
        this.swimAnim++;
      } else if (this.control && I.pressed('A') && this.onGround) {
        const s = Math.abs(this.vx);
        const tier = P.jumps.find((j) => s < j[0]);
        this.vy = -tier[1];
        this.gravHold = tier[2]; this.gravFall = tier[3];
        this.jumping = true;
        this.onGround = false;
        this.takeoffSpeed = s;
        this.airMax = s > P.maxWalk ? P.maxRun : P.maxWalk;
        this.airFrame = true;
        justJumped = true;
        SMB.Sound.play(this.big ? 'jump_big' : 'jump_small');
      }
      if (!water) {
        if (!aHeld || this.vy >= 0) this.jumping = false;
        // Gravity (the NES moves by the speed first, then adds gravity: no gravity on the take-off frame).
        if (!justJumped) this.vy += this.jumping ? this.gravHold : this.gravFall;
        if (this.vy > P.maxFall) this.vy = P.maxFall;
      }

      const wasGround = this.onGround;
      SMB.moveAndCollide(g.area, this, {
        hiddenSolidFromBelow: true, cornerNudge: true, unstick: true, ceilVy: 1,
        onCeil: (hits) => this.hitBlocks(hits),
      });
      g.collidePlatforms(this);

      if (this.onGround) {
        this.stompChain = 0;
        this.airFrame = false;
        this.airMax = P.maxWalk;
        // Gravity for the next jump/fall is the slow tier when walking off a ledge.
      } else if (wasGround && !this.onGround && this.vy >= 0) {
        this.gravFall = P.jumps[Math.abs(this.vx) < P.jumps[0][0] ? 0 : Math.abs(this.vx) < P.jumps[1][0] ? 1 : 2][3];
        this.takeoffSpeed = Math.abs(this.vx);
        this.airMax = Math.abs(this.vx) > P.maxWalk ? P.maxRun : P.maxWalk;
      }
      if (this.hitWall) this.vx = 0;

      // Left screen edge (the camera never goes back).
      if (this.x < g.camX) { this.x = g.camX; if (this.vx < 0) this.vx = 0; }

      // Walk animation speed follows horizontal speed.
      const s = Math.abs(this.vx);
      if (s > 0 && this.onGround) {
        this.animT += s >= P.maxRun - 0.1 ? 0.5 : s > P.maxWalk ? 0.33 : 0.2 + s * 0.08;
        if (this.animT >= 1) { this.animT -= 1; this.walkFrame = (this.walkFrame + 1) % 3; }
      }
    }

    // On a vine: up and down only; pressing away from the vine lets go. Climbing past its top is up to the
    // vine's area (SMB.World2).
    updateClimb() {
      const I = SMB.Input, v = this.vine;
      const up = this.control && I.isDown('up'), down = this.control && I.isDown('down');
      const away = this.control && (this.facing > 0 ? I.isDown('left') : I.isDown('right'));
      this.pose = 'climb';
      if (away) { this.letGoVine(); this.vx = -this.facing * 0.75; this.facing = -this.facing; return; }
      this.vx = 0;
      this.vy = up ? -0.875 : down ? 1.5 : 0;
      if (this.vy !== 0 && (++this.animT >= 8)) { this.animT = 0; this.climbFrame ^= 1; }
      this.x = v.x + (this.facing > 0 ? -7 : 11);
      this.y += this.vy;
      if (this.y < v.top - 8) this.y = v.top - 8;
      // Climbing down onto the ground ends the climb.
      if (this.vy > 0) {
        const area = this.game.area, r = Math.floor((this.y + this.h) / TS);
        const c0 = Math.floor(this.x / TS), c1 = Math.floor((this.x + this.w - 0.01) / TS);
        for (let c = c0; c <= c1; c++) {
          if (area.solid(c, r)) { this.y = r * TS - this.h; this.letGoVine(); this.onGround = true; return; }
        }
      }
      if (this.y > v.bottom) this.letGoVine();
    }
    grabVine(v) {
      this.vine = v; this.vx = 0; this.vy = 0; this.jumping = false; this.onGround = false;
      this.facing = this.cx < v.x + 8 ? 1 : -1;
      this.pose = 'climb'; this.crouch = false; this.setSize();
    }
    letGoVine() { this.vine = null; this.pose = null; this.vy = 0; this.vineCool = 16; }

    decel(amount) {
      const s = Math.abs(this.vx) - amount;
      this.vx = s <= 0 ? 0 : Math.sign(this.vx) * s;
    }

    canStandUp() {
      const area = this.game.area;
      const top = this.y + this.h - 27;
      const c0 = Math.floor(this.x / TS), c1 = Math.floor((this.x + this.w - 0.01) / TS);
      const r = Math.floor(top / TS);
      for (let c = c0; c <= c1; c++) if (area.solid(c, r)) return false;
      return true;
    }

    // Blocks hit from below. Only the block under the centre of Mario's head is activated
    // (or the one he overlaps most when the centre is between blocks).
    hitBlocks(hits) {
      let best = hits[0], bestOv = -1;
      for (const h of hits) {
        const l = h[0] * TS, ov = Math.min(this.x + this.w, l + TS) - Math.max(this.x, l);
        const centreIn = this.cx >= l && this.cx < l + TS;
        const score = centreIn ? 100 : ov;
        if (score > bestOv) { bestOv = score; best = h; }
      }
      this.game.bumpBlock(best[0], best[1], this);
    }

    // Stomping an enemy.
    bounce() {
      this.vy = -P.stompBounce;
      this.jumping = SMB.Input.isDown('A');
      this.gravHold = P.jumps[0][2]; this.gravFall = P.jumps[0][3];
      this.onGround = false;
    }

    hurt() {
      if (this.invuln > 0 || this.star > 0 || this.dead) return;
      if (this.power > 0) {
        this.game.transform(this, 0);
        this.invuln = 120;
        SMB.Sound.play('pipe');
      } else {
        this.game.killPlayer();
      }
    }

    frameIndex() {
      if (this.dead) return F.death;
      if (this.pose === 'climb') return F.climb[this.climbFrame];
      if (this.crouch) return F.crouch;
      if (this.throwT > 0 && this.power === 2) return F.throw;
      if (!this.onGround && this.game.area.def.water) return F.swim[this.swimAnim < 24 ? (this.swimAnim >> 3) % 3 : 1 + ((this.swimAnim >> 4) & 1)];
      if (!this.onGround) return this.airFrame ? F.jump : (Math.abs(this.vx) > 0 ? F.walk[this.walkFrame] : F.stand);
      if (this.skidding) return F.skid;
      if (Math.abs(this.vx) > 0) return F.walk[this.walkFrame];
      return F.stand;
    }

    draw(ctx, camX, frame) {
      if (!this.visible) return;
      if (this.invuln > 0 && (frame >> 1) % 2 === 0 && !this.dead) return;
      const drawPower = this.drawPower !== undefined ? this.drawPower : this.power;
      const bigFrame = drawPower > 0 && (!this.crouch || true);
      const fh = drawPower > 0 ? 32 : 16;
      const key = drawPower === 2 ? 'sprites/mario_fire' : drawPower === 1 ? 'sprites/mario_big' : 'sprites/mario_small';
      const img = SMB.Assets.get(key);
      const fx = this.x - 2 - camX;
      const fy = this.y + this.h - fh;
      const fi = drawPower > 0 || !this.crouch ? this.frameIndex() : F.stand;
      const flip = this.facing < 0;
      if (!SMB.Assets.drawStrip(ctx, img, fi, 16, fh, fx, fy, flip)) {
        SMB.Assets.placeholder(ctx, fx + 2, fy + (this.crouch && bigFrame ? 16 : 0), 12, this.crouch && bigFrame ? 16 : fh,
          drawPower === 2 ? '#fcfcfc' : '#e40058');
        ctx.fillStyle = '#000';
        ctx.fillRect(Math.round(fx + (flip ? 4 : 10)), Math.round(fy + (this.crouch && bigFrame ? 18 : 3)), 2, 2);
      }
      if (this.star > 0) {
        // Star power: flash the sprite through a cycle of colours (tinted on an offscreen canvas).
        const c = STAR_COLORS[(frame >> (this.star < 120 ? 3 : 1)) % STAR_COLORS.length];
        SMB.Assets.tintOver(ctx, img, fi, 16, fh, fx, fy, flip, c, 0.5);
      }
    }
  }

  SMB.Player = Player;
})();
