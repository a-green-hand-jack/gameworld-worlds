// Power-ups, coins popping from blocks, fireballs and short-lived effects.
(function () {
  const SMB = window.SMB;
  const TS = 16;
  const A = () => SMB.Assets;

  // Mushroom / 1-up / Fire Flower / Starman. Rises out of its block, then moves.
  class Item {
    constructor(game, kind, tx, ty) {
      this.game = game;
      this.kind = kind;            // 'mushroom' | '1up' | 'flower' | 'star'
      this.w = 14; this.h = 16;
      this.x = tx * TS + 1; this.y = ty * TS;
      this.baseY = ty * TS;
      this.vx = 0; this.vy = 0;
      this.emerge = 0;             // pixels risen so far (0..16)
      this.behind = true;
      this.dead = false;
      this.anim = 0;
      SMB.Sound.play('powerup_appear');
    }
    update() {
      this.anim++;
      if (this.emerge < 16) {
        this.emerge = Math.min(16, this.emerge + 0.5);
        this.y = this.baseY - this.emerge;
        if (this.emerge >= 16) {
          this.behind = false;
          if (this.kind === 'mushroom' || this.kind === '1up') this.vx = 1;
          if (this.kind === 'star') { this.vx = 1; this.vy = -2; }
        }
        return;
      }
      if (this.kind === 'flower') return;
      if (this.kind === 'star') {
        this.vy = Math.min(4, this.vy + 0.2);
        const vx0 = this.vx;
        SMB.moveAndCollide(this.game.area, this);
        if (this.hitWall) this.vx = -vx0;
        if (this.onGround) this.vy = -4.5;
        if (this.hitCeil) this.vy = 1;
      } else {
        this.vy = Math.min(4, this.vy + 0.375);
        const vx0 = this.vx;
        SMB.moveAndCollide(this.game.area, this);
        if (this.hitWall) this.vx = -vx0;
      }
      if (this.y > 260 || this.x + this.w < this.game.camX - 32) this.dead = true;
    }
    // A block bumped under the item makes it hop.
    hop(fromX) {
      if (this.emerge < 16 || this.kind === 'flower') return;
      this.vy = -4;
      if (this.kind !== 'star') this.vx = (this.x + this.w / 2 < fromX ? -1 : 1);
    }
    draw(ctx, camX, frame) {
      const x = this.x - 1 - camX, y = this.y;
      let key, fr = 0;
      if (this.kind === 'mushroom') key = 'sprites/mushroom';
      else if (this.kind === '1up') key = 'sprites/mushroom_1up';
      else if (this.kind === 'flower') { key = 'sprites/fire_flower'; fr = (frame >> 2) & 3; }
      else { key = 'sprites/star'; fr = (frame >> 2) & 3; }
      // While emerging only the part above the block is visible.
      if (this.emerge < 16) {
        ctx.save();
        ctx.beginPath(); ctx.rect(Math.round(x), Math.round(this.baseY - 16), 16, 16); ctx.clip();
      }
      if (!A().drawStrip(ctx, A().get(key), fr, 16, 16, x, y)) {
        const col = { mushroom: '#e45c10', '1up': '#00a800', flower: '#f87800', star: '#f8d800' }[this.kind];
        A().placeholder(ctx, x + 1, y + 1, 14, 15, col);
        if (this.kind === 'mushroom' || this.kind === '1up') A().placeholder(ctx, x + 4, y + 9, 8, 7, '#fcbcb0');
      }
      if (this.emerge < 16) ctx.restore();
    }
  }

  // Coin spinning up out of a block.
  class CoinPop {
    constructor(game, tx, ty) {
      this.game = game;
      this.x = tx * TS + 4; this.y = ty * TS - 16;
      this.vy = -5.5; this.t = 0; this.dead = false;
    }
    update() {
      this.t++;
      this.y += this.vy; this.vy += 0.36;
      if (this.t > 32) { this.dead = true; this.game.popup('200', this.x - 4, this.y); }
    }
    draw(ctx, camX) {
      if (!A().drawStrip(ctx, A().get('sprites/coin_pop'), this.t >> 2, 8, 16, this.x - camX, this.y)) {
        A().placeholder(ctx, this.x - camX + 1, this.y + 2, 6, 12, '#f8d800');
      }
    }
  }

  // Mario's fireball.
  class Fireball {
    constructor(game, x, y, dir) {
      this.game = game;
      this.x = x; this.y = y; this.w = 8; this.h = 8;
      this.vx = dir * 4; this.vy = 2.5; this.dead = false; this.t = 0;
      this.isFireball = true;
    }
    update() {
      this.t++;
      this.vy = Math.min(4, this.vy + 0.4);
      const vx0 = this.vx;
      SMB.moveAndCollide(this.game.area, this);
      if (this.onGround) { this.vy = -3.2; this.onGround = false; }
      if (this.hitWall || this.hitCeil) { this.explode(); return; }
      this.vx = vx0;
      const cx = this.game.camX;
      if (this.x < cx - 8 || this.x > cx + 256 + 8 || this.y > 240) this.dead = true;
    }
    explode() {
      this.dead = true;
      this.game.effects.push(new Burst(this.x - 4, this.y - 4));
    }
    draw(ctx, camX) {
      if (!A().drawStrip(ctx, A().get('sprites/fireball'), this.t >> 2, 8, 8, this.x - camX, this.y)) {
        A().placeholder(ctx, this.x - camX, this.y, 8, 8, '#f87800');
      }
    }
  }

  // ---------------------------------------------------------------- effects (no interaction)
  class Burst {
    constructor(x, y, big) { this.x = x; this.y = y; this.t = 0; this.dead = false; this.big = big; }
    update() { if (++this.t >= 12) this.dead = true; }
    draw(ctx, camX) {
      const fr = Math.min(2, this.t >> 2);
      if (!A().drawStrip(ctx, A().get('sprites/fire_burst'), fr, 16, 16, this.x - camX, this.y)) {
        A().placeholder(ctx, this.x - camX + 4 - fr * 2, this.y + 4 - fr * 2, 8 + fr * 4, 8 + fr * 4, '#fcfcfc');
      }
    }
  }

  class Debris {
    constructor(x, y, vx, vy, ug) { this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.dead = false; this.t = 0; this.ug = ug; }
    update() { this.t++; this.x += this.vx; this.y += this.vy; this.vy += 0.3; if (this.y > 250) this.dead = true; }
    draw(ctx, camX) {
      const img = (this.ug && A().get('sprites/brick_debris_ug')) || A().get('sprites/brick_debris');
      const flip = (this.t >> 2) & 1;
      if (!A().drawStrip(ctx, img, 0, 8, 8, this.x - camX, this.y, flip)) A().placeholder(ctx, this.x - camX, this.y, 8, 8, '#b85020');
    }
  }

  // Score text that floats up ("100", "1000", "1UP").
  class Popup {
    constructor(text, x, y) { this.text = text; this.x = x; this.y = y; this.t = 0; this.dead = false; }
    update() { this.t++; if (this.t < 40) this.y -= 1; if (this.t > 50) this.dead = true; }
    draw(ctx, camX) { SMB.Text.draw(ctx, this.text, this.x - camX, this.y); }
  }

  SMB.Items = { Item, CoinPop, Fireball, Burst, Debris, Popup };
})();
