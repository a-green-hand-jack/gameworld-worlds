// Game: state machine (title, intro, play, death, pipes, flagpole, game over), world rules, camera and drawing.
(function () {
  const SMB = window.SMB;
  const TS = 16, W = 256, H = 240;
  const T = SMB.T;
  const A = () => SMB.Assets;
  const S = () => SMB.Sound;
  const TIME_TICK = 24;   // frames per game-time unit
  const STOMP_CHAIN = [100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000];
  const SHELL_CHAIN = [500, 800, 1000, 2000, 4000, 5000, 8000];
  const BUMP_OFFS = [0, -3, -5, -7, -8, -8, -7, -5, -3, -1, 0];
  const BLINK = [0, 0, 0, 1, 2, 1];

  class Game {
    constructor(ctx) {
      this.ctx = ctx;
      this.frame = 0;
      this.state = 'loading';
      this.timer = 0;
      this.top = parseInt(localStorage.getItem('smb.top') || '0', 10) || 0;
      this.score = 0; this.coins = 0; this.lives = 3;
      this.levelId = '1-1';
      this.time = 0;
      this.paused = false;
      this.later = [];
      this.startLevel = (location.hash.match(/level=(\d-\d)/) || [])[1] || '1-1';
      this.events = [];   // log for automated checks
    }

    // ------------------------------------------------------------ flow
    toTitle() {
      this.state = 'title';
      S().stopMusic();
      this.levelId = this.startLevel;
      this.loadArea(this.levelId, null, null, true);
      this.player.control = false;
    }

    startGame() {
      this.score = 0; this.coins = 0; this.lives = 3;
      this.levelId = this.startLevel;
      this.power = 0;
      this.checkpointReached = false;
      this.showIntro();
    }

    showIntro() {
      this.state = 'intro';
      this.timer = 150;
      S().stopMusic();
      this.log('intro', { level: this.levelId, lives: this.lives });
    }

    beginLevel() {
      const def = SMB.LevelDefs[this.levelId];
      this.time = def.time;
      this.timeT = 0;
      this.hurried = false;
      this.areas = {};
      const startX = this.checkpointReached && def.checkpoint ? def.checkpoint : null;
      this.loadArea(this.levelId, def.startArea, startX !== null ? { x: startX } : null);
      this.state = 'play';
      this.playAreaMusic();
      this.log('start', { level: this.levelId, area: this.area.name });
    }

    // Build (or reuse, within one life) an area and put Mario in it.
    loadArea(levelId, areaName, entry, titleOnly) {
      const def = SMB.LevelDefs[levelId];
      areaName = areaName || def.startArea;
      if (!this.areas || titleOnly) this.areas = {};
      let area = this.areas[areaName];
      if (!area) {
        const built = def.areas[areaName]();
        area = new SMB.Area(built.def, built.b);
        area.spawned = new Array(area.enemyDefs.length).fill(false);
        this.areas[areaName] = area;
      }
      this.area = area;
      this.enemies = []; this.items = []; this.effects = []; this.fireballs = []; this.platforms = [];
      if (area.setupPlatforms) area.setupPlatforms(this);
      if (area.def.makePlatforms) this.platforms = area.def.makePlatforms(this);
      if (area.def.makeHazards) this.hazards = area.def.makeHazards(this); else this.hazards = [];
      this.flagState = null;
      const power = this.power || 0;
      let px, py;
      entry = entry || {};
      if (entry.x !== undefined) { px = entry.x * TS + 2; py = (entry.y !== undefined ? entry.y : 13) * TS; }
      else { px = area.start.x * TS - 6; py = (area.start.y + 1) * TS; }
      this.player = new SMB.Player(this, px, py, power);
      if (entry.exitPipe) {
        // Rise out of a vertical pipe whose left column is entry.x and whose mouth row is found below.
        let top = 0; while (top < 14 && area.get(entry.x, top) !== T.PIPE_TL) top++;
        this.player.x = entry.x * TS + 10;
        this.player.y = top * TS;
        this.player.behind = true; this.player.control = false;
        this.pipeAnim = { kind: 'exit', target: top * TS, t: 0 };
        this.state = 'pipe';
      } else if (area.start.drop && entry.x === undefined) {
        this.player.y = -this.player.h;
      }
      this.camX = area.scrollLock ? 0 : Math.max(0, Math.min(area.pxWidth - W, this.player.x - 80));
      // Enemies already left behind are not spawned again.
      for (let i = 0; i < area.enemyDefs.length; i++) if (area.enemyDefs[i].x * TS < this.camX - 16) area.spawned[i] = true;
      this.spawnEnemies();
    }

    playAreaMusic() {
      if (this.player && this.player.star > 0) { S().playMusic('starman', true); return; }
      if (this.time <= 100 && this.hurried) S().setFast(this.area.music);
      else S().playMusic(this.area.music, true);
    }
    resumeLevelMusic() { if (this.state === 'play') this.playAreaMusic(); }

    log(type, data) { this.events.push(Object.assign({ type, frame: this.frame }, data || {})); if (this.events.length > 500) this.events.shift(); }

    // ------------------------------------------------------------ helpers used by entities
    onScreen(e) { return e.x + (e.w || 16) > this.camX && e.x < this.camX + W; }
    countFireballs() { return this.fireballs.length; }
    spawnFireball(x, y, dir) { this.fireballs.push(new SMB.Items.Fireball(this, x, y, dir)); }
    popup(text, x, y) { this.effects.push(new SMB.Items.Popup(text, x, y)); }
    addScore(n, x, y) {
      this.score += n;
      if (x !== undefined) this.popup(String(n), x, y);
    }
    addCoin() {
      this.coins++;
      S().play('coin');
      if (this.coins >= 100) { this.coins = 0; this.addLife(); }
    }
    addLife(x, y) {
      this.lives++;
      S().play('oneup');
      if (x !== undefined) this.popup('1UP', x, y);
      this.log('1up', { lives: this.lives });
    }
    chainScore(index, chain, x, y) {
      if (index >= chain.length) { this.addLife(x, y); return; }
      this.addScore(chain[index], x, y);
    }
    after(frames, fn) { this.later.push({ t: frames, fn }); }

    // A block hit from below by Mario.
    bumpBlock(tx, ty, player) {
      const area = this.area;
      const t = area.get(tx, ty);
      const key = tx + ',' + ty;
      const content = area.content(tx, ty);
      this.log('bump', { tx, ty, tile: t });
      if (t === T.QUESTION || t === T.HIDDEN) {
        area.set(tx, ty, T.USED);
        area.bumps[key] = 0;
        this.releaseContent(content, tx, ty, player);
      } else if (t === T.BRICK) {
        if (content === 'coins') {
          const st = area.coinHits[key] || (area.coinHits[key] = { until: this.frame + 240, n: 0 });
          st.n++;
          area.bumps[key] = 0;
          this.releaseContent('coin', tx, ty, player);
          if (this.frame > st.until || st.n >= 16) area.set(tx, ty, T.USED);
        } else if (content) {
          area.set(tx, ty, T.USED);
          area.bumps[key] = 0;
          this.releaseContent(content, tx, ty, player);
        } else if (player.big) {
          area.set(tx, ty, T.EMPTY);
          const x = tx * TS, y = ty * TS, ug = area.theme === 'underground';
          this.effects.push(new SMB.Items.Debris(x, y, -1, -5, ug), new SMB.Items.Debris(x + 8, y, 1, -5, ug),
            new SMB.Items.Debris(x, y + 8, -1, -3, ug), new SMB.Items.Debris(x + 8, y + 8, 1, -3, ug));
          this.addScore(50);
          S().play('break');
        } else {
          area.bumps[key] = 0;
          S().play('bump');
        }
      } else {
        S().play('bump');
        return;
      }
      // Whatever stands on the block gets knocked.
      const top = ty * TS, l = tx * TS - 2, r = tx * TS + TS + 2;
      for (const e of this.enemies) {
        if (e.dying || e.dead || e.hidden) continue;
        if (e.y + e.h >= top - 4 && e.y + e.h <= top + 3 && e.x + e.w > l && e.x < r) {
          e.knockOff(e.x + e.w / 2 < tx * TS + 8 ? -1 : 1);
          this.addScore(e.firePoints === 200 ? 200 : 100, e.x, e.y);
          S().play('kick');
        }
      }
      for (const it of this.items) if (it.y + it.h >= top - 4 && it.y + it.h <= top + 3 && it.x + it.w > l && it.x < r) it.hop(tx * TS + 8);
      if (area.get(tx, ty - 1) === T.COIN) {
        area.set(tx, ty - 1, T.EMPTY);
        this.effects.push(new SMB.Items.CoinPop(this, tx, ty));
        this.addCoin(); this.score += 200;
      }
    }

    releaseContent(content, tx, ty, player) {
      if (content === 'coin') {
        this.effects.push(new SMB.Items.CoinPop(this, tx, ty));
        this.addCoin();
        this.score += 200;
        S().play('bump');
        return;
      }
      S().play('bump');
      let kind = content;
      if (content === 'power') kind = player.power === 0 ? 'mushroom' : 'flower';
      this.after(6, () => this.items.push(new SMB.Items.Item(this, kind, tx, ty)));
    }

    // Grow / shrink / become fire Mario: the world freezes while Mario flickers between the two forms.
    transform(player, newPower) {
      const old = player.power;
      this.transformAnim = { old, now: newPower, t: 0 };
      this.state = 'transform';
      player.power = newPower;
      player.crouch = false;
      player.setSize();
      this.power = newPower;
      this.log('power', { power: newPower });
    }

    killPlayer(fell) {
      const p = this.player;
      if (p.dead) return;
      p.dead = true; p.star = 0; p.invuln = 0;
      p.power = 0; this.power = 0; p.setSize();
      this.state = 'dying';
      this.timer = 0;
      this.fellInPit = !!fell;
      S().playMusic('death', false);
      this.log('death', { x: Math.round(p.x), fell: !!fell, time: this.time });
    }

    afterDeath() {
      this.lives--;
      this.power = 0;
      if (this.lives <= 0) {
        this.state = 'gameover'; this.timer = 300;
        S().playMusic('game_over', false);
        this.saveTop();
        this.log('gameover');
      } else if (this.time <= 0) {
        this.state = 'timeup'; this.timer = 150;
      } else this.showIntro();
    }

    saveTop() {
      if (this.score > this.top) { this.top = this.score; try { localStorage.setItem('smb.top', String(this.top)); } catch (e) { /* ignore */ } }
    }

    // ------------------------------------------------------------ update
    update() {
      SMB.Input.update();
      if (SMB.Input.pressed('mute')) { S().muted = !S().muted; if (S().muted) S().pauseMusic(); else S().resumeMusic(); }
      this.frame++;
      switch (this.state) {
        case 'loading': return;
        case 'title':
          if (SMB.Input.pressed('start') || SMB.Input.pressed('A')) this.startGame();
          return;
        case 'intro':
          if (--this.timer <= 0) this.beginLevel();
          return;
        case 'gameover':
          if (--this.timer <= 0) this.toTitle();
          return;
        case 'timeup':
          if (--this.timer <= 0) this.showIntro();
          return;
        case 'clearscreen':
          if (--this.timer <= 0 || (this.timer < 400 && SMB.Input.pressed('start'))) this.toTitle();
          return;
        case 'transform': return this.updateTransform();
        case 'dying': return this.updateDying();
        case 'pipe': return this.updatePipe();
        case 'flag': this.updateFlag(); this.updateWorld(true); return;
        case 'play':
          if (SMB.Input.pressed('start')) {
            this.paused = !this.paused;
            S().play('pause');
            if (this.paused) S().pauseMusic(); else S().resumeMusic();
          }
          if (this.paused) return;
          this.updatePlay();
          return;
        default:
          if (this.updateCustom) this.updateCustom();
      }
    }

    updateTransform() {
      const a = this.transformAnim;
      a.t++;
      const grow = a.now > a.old;
      if (grow && a.old === 0) this.player.drawPower = (a.t >> 2) % 2 ? a.now : a.old;
      else if (!grow) this.player.drawPower = (a.t >> 2) % 2 ? a.old : a.now;
      else this.player.drawPower = (a.t >> 1) % 2 ? a.now : a.old;
      if (a.t >= 48) { this.player.drawPower = undefined; this.state = 'play'; }
    }

    updateDying() {
      const p = this.player;
      this.timer++;
      if (this.timer === 30 && !this.fellInPit) p.vy = -4.5;
      if (this.timer > 30 && !this.fellInPit) { p.y += p.vy; p.vy = Math.min(4, p.vy + 0.25); }
      this.updateEffects();
      if (this.timer >= 200) this.afterDeath();
    }

    updatePipe() {
      const a = this.pipeAnim, p = this.player;
      a.t++;
      if (a.kind === 'down') { p.y += 1; if (a.t >= 32) { this.enterPipeTarget(a.pipe); } }
      else if (a.kind === 'right') {
        p.x += 1; p.walkFrame = (a.t >> 2) % 3; p.vx = 0.5; p.onGround = true;
        if (a.t >= 32) this.enterPipeTarget(a.pipe);
      } else if (a.kind === 'exit') {
        if (a.t === 1) S().play('pipe');
        p.y -= 1;
        if (p.y + p.h <= a.target) {
          p.y = a.target - p.h; p.behind = false; p.control = true; this.state = 'play';
          p.vx = 0; p.vy = 0;
          this.playAreaMusic();
        }
      }
    }

    enterPipeTarget(pipe) {
      const to = pipe.to;
      this.log('pipe', { to });
      if (to.level) {
        // Warp pipe to another level.
        this.levelId = to.level;
        this.checkpointReached = false;
        this.showIntro();
        return;
      }
      this.state = 'play';
      this.loadArea(this.levelId, to.area, to.x !== undefined ? { x: to.x, y: to.y, exitPipe: to.exitPipe } : null);
      if (this.state === 'play') this.playAreaMusic();
    }

    spawnEnemies() {
      const area = this.area;
      const edge = this.camX + W + 16;
      for (let i = 0; i < area.enemyDefs.length; i++) {
        if (area.spawned[i]) continue;
        const d = area.enemyDefs[i];
        if (d.x * TS < edge) {
          area.spawned[i] = true;
          const e = SMB.makeEnemy(this, d);
          if (e) this.enemies.push(e);
        }
      }
    }

    updatePlay() {
      const p = this.player;
      // Time.
      if (++this.timeT >= TIME_TICK) {
        this.timeT = 0;
        if (this.time > 0) this.time--;
        if (this.time === 100 && !this.hurried) {
          this.hurried = true;
          if (p.star <= 0) S().playMusic('hurry', false, () => { if (this.state === 'play' && this.player.star <= 0) S().setFast(this.area.music); });
          else this.hurryPending = true;
        }
        if (this.time === 0) { this.killPlayer(); return; }
      }

      p.update();
      if (this.state !== 'play') return; // a block bump may have changed state? (no) — kept for safety

      // Pipes.
      for (const pipe of this.area.pipes) {
        if (pipe.dir === 'down' && SMB.Input.isDown('down') && p.onGround) {
          const px = pipe.x * TS;
          if (p.x >= px + 2 && p.x + p.w <= px + 30 && Math.abs(p.y + p.h - pipe.y * TS) < 1) {
            this.startPipe('down', pipe); return;
          }
        }
        if (pipe.dir === 'right' && SMB.Input.isDown('right') && p.onGround) {
          if (p.x + p.w >= pipe.x * TS - 0.5 && p.x < pipe.x * TS && Math.abs(p.y + p.h - (pipe.y + 2) * TS) < 1) {
            this.startPipe('right', pipe); return;
          }
        }
      }

      // Coins in the level.
      {
        const c0 = Math.floor(p.x / TS), c1 = Math.floor((p.x + p.w - 0.01) / TS);
        const r0 = Math.floor(p.y / TS), r1 = Math.floor((p.y + p.h - 0.01) / TS);
        for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
          if (this.area.get(c, r) === T.COIN) { this.area.set(c, r, T.EMPTY); this.addCoin(); this.score += 200; }
        }
      }

      // Flagpole.
      const fl = this.area.flag;
      if (fl && !p.dead && (p.x + p.w >= fl.x * TS + 3 || (p.x + p.w >= fl.x * TS - 0.5 && p.y + p.h > 12 * TS - 1))) { this.startFlag(); return; }

      // Pit / lava.
      if (p.y > H) { this.killPlayer(true); return; }
      if (this.checkLava && this.checkLava(p)) return;

      // Checkpoint.
      const def = SMB.LevelDefs[this.levelId];
      if (def.checkpoint && this.area.name === def.startArea && p.x > def.checkpoint * TS) this.checkpointReached = true;

      this.updateCamera();
      this.updateWorld(false);
      if (this.state !== 'play') return;
      this.interact();
      if (this.hurryPending && p.star <= 0) { this.hurryPending = false; }
    }

    updateCamera() {
      const p = this.player, area = this.area;
      if (area.scrollLock) { this.camX = 0; return; }
      const maxCam = Math.max(0, (area.camMax || area.pxWidth) - W);
      const target = p.x + p.w / 2 - 120;
      if (target > this.camX) this.camX = Math.min(maxCam, target);
    }

    // Enemies, items, fireballs, effects, platforms. `flagOnly` = the flag sequence (no enemy interaction).
    updateWorld(flagOnly) {
      this.spawnEnemies();
      for (const pl of this.platforms) pl.update(this);
      for (const h of this.hazards) h.update(this);
      for (const e of this.enemies) {
        if (e.x > this.camX + W + 64 && !e.dying) continue; // not yet active far ahead
        e.update();
        if (e.x + (e.w || 16) < this.camX - 64) e.dead = true;
      }
      // Enemies turn around when they bump into each other; a sliding shell knocks them off.
      for (let i = 0; i < this.enemies.length; i++) {
        const a = this.enemies[i];
        if (a.dying || a.dead || a.hidden || a.stationary) continue;
        for (let j = i + 1; j < this.enemies.length; j++) {
          const b = this.enemies[j];
          if (b.dying || b.dead || b.hidden || b.stationary) continue;
          if (!SMB.overlap(a, b)) continue;
          const aSlide = a.state === 'slide', bSlide = b.state === 'slide';
          if (aSlide || bSlide) {
            const shell = aSlide ? a : b, other = aSlide ? b : a;
            if (aSlide && bSlide) { a.knockOff(-Math.sign(a.vx)); b.knockOff(-Math.sign(b.vx)); S().play('kick'); continue; }
            other.knockOff(Math.sign(shell.vx));
            this.chainScore(shell.chain++, SHELL_CHAIN, other.x, other.y);
            S().play('kick');
          } else {
            if (a.vx !== 0 && Math.sign(a.vx) === Math.sign(b.x - a.x)) a.turnAround();
            if (b.vx !== 0 && Math.sign(b.vx) === Math.sign(a.x - b.x)) b.turnAround();
          }
        }
      }
      for (const it of this.items) it.update();
      for (const f of this.fireballs) {
        f.update();
        if (f.dead) continue;
        for (const e of this.enemies) {
          if (e.dying || e.dead || e.hidden) continue;
          if (SMB.overlap(f, e)) {
            if (e.fireproof) { f.explode(); if (e.fireHit) e.fireHit(); break; }
            e.knockOff(Math.sign(f.vx));
            this.addScore(e.firePoints, e.x, e.y);
            S().play('kick');
            f.explode();
            break;
          }
        }
      }
      this.updateEffects();
      for (const k in this.area.bumps) { if (++this.area.bumps[k] >= BUMP_OFFS.length) delete this.area.bumps[k]; }
      for (let i = this.later.length - 1; i >= 0; i--) { if (--this.later[i].t <= 0) { const fn = this.later[i].fn; this.later.splice(i, 1); fn(); } }
      this.enemies = this.enemies.filter((e) => !e.dead);
      this.items = this.items.filter((e) => !e.dead);
      this.fireballs = this.fireballs.filter((e) => !e.dead);
    }

    updateEffects() {
      for (const fx of this.effects) fx.update();
      this.effects = this.effects.filter((e) => !e.dead);
    }

    // Mario against enemies and items.
    interact() {
      const p = this.player;
      for (const it of this.items) {
        if (it.dead || it.emerge < 16 || !SMB.overlap(p, it)) continue;
        it.dead = true;
        if (it.kind === '1up') { this.addLife(it.x, it.y); continue; }
        this.addScore(1000, it.x, it.y);
        if (it.kind === 'star') {
          p.star = 690;
          S().playMusic('starman', true);
          this.log('star');
          continue;
        }
        S().play('powerup');
        if (it.kind === 'mushroom' && p.power === 0) this.transform(p, 1);
        else if (it.kind === 'flower' && p.power < 2) this.transform(p, p.power === 0 ? 1 : 2);
      }
      for (const e of this.enemies) {
        if (e.dying || e.dead || e.hidden || p.dead) continue;
        if (!SMB.overlap(p, e)) continue;
        if (p.star > 0) {
          e.knockOff(p.vx >= 0 ? 1 : -1);
          this.chainScore(p.starChain = (p.starChain || 0), STOMP_CHAIN, e.x, e.y);
          p.starChain++;
          S().play('kick');
          continue;
        }
        // Resting shell: kick it.
        if (e.state === 'shell') {
          const fromAbove = p.vy > 0 && p.y + p.h - p.vy <= e.y + 4;
          e.kick(p);
          this.addScore(fromAbove ? 400 : 400, e.x, e.y);
          S().play('kick');
          if (fromAbove) p.bounce();
          continue;
        }
        const stomp = e.stompable && p.vy > 0 && (p.y + p.h) - e.y < Math.max(8, p.vy + 6);
        if (stomp) {
          const res = e.stomp(p);
          this.chainScore(p.stompChain++, STOMP_CHAIN, e.x, e.y - 8);
          S().play(res === 'kick' ? 'kick' : 'stomp');
          p.bounce();
          this.log('stomp', { type: e.type, res });
        } else if (e.state === 'slide' && e.harmless > 0) {
          continue;
        } else if (e.touch) {
          e.touch(p);
        } else {
          p.hurt();
          if (p.dead) return;
        }
      }
    }

    // Moving platforms (lifts): land on top, ride along.
    collidePlatforms(p) {
      if (!this.platforms || !this.platforms.length) return;
      p.riding = null;
      for (const pl of this.platforms) {
        if (p.vy < 0) continue;
        const prevBottom = p.y + p.h - p.vy - (pl.dy || 0);
        if (p.x + p.w > pl.x && p.x < pl.x + pl.w && prevBottom <= pl.y + 1 && p.y + p.h >= pl.y) {
          p.y = pl.y - p.h; p.vy = 0; p.onGround = true; p.riding = pl;
          if (pl.onLand) pl.onLand(p);
        }
      }
    }

    startPipe(kind, pipe) {
      const p = this.player;
      this.state = 'pipe';
      this.pipeAnim = { kind, pipe, t: 0 };
      p.behind = true; p.control = false; p.vx = 0; p.vy = 0;
      p.crouch = false; p.setSize();
      if (kind === 'down') p.x = pipe.x * TS + 16 - p.w / 2;
      p.facing = 1;
      S().stopMusic();
      S().play('pipe');
    }

    // ------------------------------------------------------------ flagpole and castle
    startFlag() {
      const p = this.player, fl = this.area.flag;
      const feet = p.y + p.h;
      const pts = feet <= 56 ? 5000 : feet <= 96 ? 2000 : feet <= 128 ? 800 : feet <= 160 ? 400 : 100;
      this.addScore(pts);
      this.state = 'flag';
      this.flagState = { phase: 'slide', t: 0, flagY: 3 * TS + 1, scoreY: 12 * TS, pts, fireworks: 0 };
      const last = this.time % 10;
      this.flagState.fireworks = (last === 1 || last === 3 || last === 6) ? last : 0;
      p.control = false; p.vx = 0; p.vy = 0; p.jumping = false; p.star = 0;
      p.x = fl.x * TS + 8 - p.w - 1;
      p.pose = 'climb'; p.facing = 1;
      p.crouch = false; p.setSize();
      S().stopMusic();
      S().play('flagpole');
      this.log('flag', { pts, time: this.time });
    }

    updateFlag() {
      const f = this.flagState, p = this.player, fl = this.area.flag;
      f.t++;
      const poleBottom = 12 * TS;
      if (f.phase === 'slide') {
        if (p.y + p.h < poleBottom) { p.y = Math.min(poleBottom - p.h, p.y + 2); if (f.t % 6 === 0) p.climbFrame ^= 1; }
        f.flagY = Math.min(poleBottom - 16, f.flagY + 2);
        f.scoreY = Math.max(2 * TS + 16, poleBottom - (f.t * 2));
        if (p.y + p.h >= poleBottom && f.flagY >= poleBottom - 16) { f.phase = 'turn'; f.t = 0; p.x = fl.x * TS + 9; p.facing = -1; }
      } else if (f.phase === 'turn') {
        if (f.t >= 24) {
          f.phase = 'walk'; f.t = 0; p.pose = null; p.facing = 1;
          S().playMusic('course_clear', false);
        }
      } else if (f.phase === 'walk') {
        p.vx = 1.2; p.vy = Math.min(4, p.vy + 0.4);
        SMB.moveAndCollide(this.area, p);
        p.animT += 0.25; if (p.animT >= 1) { p.animT = 0; p.walkFrame = (p.walkFrame + 1) % 3; }
        p.airFrame = false;
        const door = (this.area.castleX + 2) * TS + 8;
        if (p.x + p.w / 2 >= door) { p.visible = false; f.phase = 'tally'; f.t = 0; p.vx = 0; }
        this.updateCamera();
      } else if (f.phase === 'tally') {
        if (this.time > 0) {
          const n = Math.min(this.time, 2);
          this.time -= n; this.score += 50 * n;
          if (f.t % 3 === 0) S().play('beep');
        } else { f.phase = 'castleflag'; f.t = 0; f.castleFlagY = 0; }
      } else if (f.phase === 'castleflag') {
        f.castleFlagY = Math.min(16, f.t);
        if (f.t >= 30) { f.phase = 'fireworks'; f.t = 0; f.fwDone = 0; }
      } else if (f.phase === 'fireworks') {
        if (f.fwDone < f.fireworks) {
          if (f.t % 32 === 1) {
            const cx = (this.area.castleX + 2.5) * TS + (f.fwDone % 3 - 1) * 24, cy = 72 + ((f.fwDone * 37) % 40);
            this.effects.push(new SMB.Items.Burst(cx - 8, cy - 8, true));
            this.addScore(500);
            S().play('fireworks');
            f.fwDone++;
          }
        } else if (f.t > 32 * f.fireworks + 90) {
          this.saveTop();
          this.nextLevel();
        }
      }
    }

    nextLevel() {
      const def = SMB.LevelDefs[this.levelId];
      this.power = this.player.power;
      this.checkpointReached = false;
      if (def.next && SMB.LevelDefs[def.next]) { this.levelId = def.next; this.showIntro(); }
      else { this.state = 'clearscreen'; this.timer = 600; S().stopMusic(); this.log('allclear'); }
    }

    // ------------------------------------------------------------ drawing
    draw() {
      const ctx = this.ctx;
      ctx.imageSmoothingEnabled = false;
      if (this.state === 'loading') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); SMB.Text.center(ctx, 'LOADING', 112); return; }
      if (this.state === 'intro' || this.state === 'gameover' || this.state === 'timeup' || this.state === 'clearscreen') {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        this.drawHUD();
        if (this.state === 'intro') {
          SMB.Text.draw(ctx, 'WORLD ' + this.levelId, 88, 80);
          if (!A().drawStrip(ctx, A().get('sprites/mario_small'), 0, 16, 16, 97, 113)) A().placeholder(ctx, 99, 113, 12, 16, '#e40058');
          SMB.Text.draw(ctx, '×  ' + this.lives, 120, 117);
          SMB.Text.center(ctx, 'ARROWS MOVE  Z RUN  X JUMP', 184);
          SMB.Text.center(ctx, 'ENTER PAUSE  M MUTE', 200);
        } else if (this.state === 'gameover') SMB.Text.center(ctx, 'GAME OVER', 112);
        else if (this.state === 'timeup') SMB.Text.center(ctx, 'TIME UP', 112);
        else this.drawEnding(ctx);
        return;
      }
      this.drawWorld();
      this.drawHUD();
      if (this.state === 'title') this.drawTitle();
      if (this.paused) SMB.Text.center(ctx, 'PAUSE', 112);
    }

    drawEnding(ctx) {
      SMB.Text.center(ctx, 'THANK YOU MARIO!', 80);
      SMB.Text.center(ctx, 'YOU CLEARED WORLD ' + this.levelId.split('-')[0], 104);
      SMB.Text.center(ctx, 'MORE WORLDS COMING SOON', 136);
      SMB.Text.center(ctx, 'PRESS ENTER', 168);
    }

    drawTitle() {
      const ctx = this.ctx;
      const logo = A().get('ui/title_logo');
      if (logo) ctx.drawImage(logo, Math.round(128 - logo.width / 2), 32);
      else {
        A().placeholder(ctx, 40, 32, 176, 88, '#c84c0c');
        SMB.Text.center(ctx, 'SUPER', 48); SMB.Text.center(ctx, 'MARIO BROS.', 68);
      }
      SMB.Text.draw(ctx, '1 PLAYER GAME', 88, 136);
      if (!A().drawStrip(ctx, A().get('ui/cursor'), 0, 8, 8, 72, 136)) A().placeholder(ctx, 72, 136, 8, 8, '#e45c10');
      if ((this.frame >> 5) & 1) SMB.Text.draw(ctx, 'PRESS ENTER', 96, 150);
      SMB.Text.draw(ctx, 'TOP- ' + String(this.top).padStart(6, '0'), 96, 166);
    }

    drawHUD() {
      const ctx = this.ctx;
      SMB.Text.draw(ctx, 'MARIO', 24, 16);
      SMB.Text.draw(ctx, String(this.score).padStart(6, '0'), 24, 24);
      const ci = A().get('ui/coin_icon');
      if (!A().drawStrip(ctx, ci, BLINK[(this.frame >> 3) % 6], 8, 8, 88, 24)) A().placeholder(ctx, 89, 24, 6, 8, '#f8d800');
      SMB.Text.draw(ctx, '×' + String(this.coins).padStart(2, '0'), 96, 24);
      SMB.Text.draw(ctx, 'WORLD', 144, 16);
      SMB.Text.draw(ctx, this.levelId, 152, 24);
      SMB.Text.draw(ctx, 'TIME', 200, 16);
      if (this.state !== 'title' && this.state !== 'intro' && this.state !== 'gameover' && this.state !== 'clearscreen') {
        SMB.Text.draw(ctx, String(Math.max(0, this.time)).padStart(3, '0'), 208, 24);
      }
    }

    drawWorld() {
      const ctx = this.ctx, area = this.area, camX = Math.round(this.camX);
      ctx.fillStyle = area.bg; ctx.fillRect(0, 0, W, H);
      // Scenery.
      for (const s of area.scenery) {
        const img = A().get('scenery/' + s.name);
        const x = s.x * TS - camX, y = Math.round(s.y * TS);
        if (x > W || x < -96) continue;
        if (img) ctx.drawImage(img, Math.round(x), y);
        else this.drawSceneryPlaceholder(s.name, x, y);
      }
      if (this.flagState && this.flagState.castleFlagY !== undefined && area.castleX !== undefined) {
        const fx = (area.castleX + 2) * TS - camX, fy = 8 * TS - this.flagState.castleFlagY;
        ctx.save(); ctx.beginPath(); ctx.rect(fx, 0, 16, 8 * TS); ctx.clip();
        if (!A().drawStrip(ctx, A().get('scenery/castle_flag'), 0, 16, 16, fx, fy)) A().placeholder(ctx, fx + 4, fy, 8, 8, '#e40058');
        ctx.restore();
      }
      // Things drawn behind blocks: items rising out of blocks, Mario in a pipe, piranhas.
      for (const it of this.items) if (it.behind) it.draw(ctx, camX, this.frame);
      for (const e of this.enemies) if (e instanceof SMB.Enemies.Piranha) e.draw(ctx, camX, this.frame);
      if (this.player.behind) this.player.draw(ctx, camX, this.frame);
      this.drawTiles(camX);
      // Flag on the pole.
      if (area.flag) {
        const fy = this.flagState ? this.flagState.flagY : 3 * TS + 1;
        const fx = area.flag.x * TS - 8 - camX;
        if (!A().drawStrip(ctx, A().get('scenery/flag'), 0, 16, 16, fx, fy)) A().placeholder(ctx, fx + 2, fy + 2, 14, 12, '#fcfcfc');
        if (this.flagState && this.flagState.phase === 'slide') SMB.Text.draw(ctx, String(this.flagState.pts), area.flag.x * TS + 12 - camX, this.flagState.scoreY);
      }
      for (const pl of this.platforms) pl.draw(ctx, camX, this.frame);
      for (const h of this.hazards) h.draw(ctx, camX, this.frame);
      for (const e of this.enemies) if (!(e instanceof SMB.Enemies.Piranha)) e.draw(ctx, camX, this.frame);
      for (const it of this.items) if (!it.behind) it.draw(ctx, camX, this.frame);
      if (!this.player.behind) this.player.draw(ctx, camX, this.frame);
      for (const f of this.fireballs) f.draw(ctx, camX, this.frame);
      for (const fx of this.effects) fx.draw(ctx, camX, this.frame);
    }

    drawTiles(camX) {
      const ctx = this.ctx, area = this.area;
      const c0 = Math.floor(camX / TS), c1 = c0 + 17;
      const blink = BLINK[(this.frame >> 3) % 6];
      for (let c = c0; c <= c1; c++) {
        for (let r = 0; r < SMB.ROWS; r++) {
          const t = area.get(c, r);
          if (t === T.EMPTY || t === T.HIDDEN || t === T.INVIS_WALL) continue;
          const info = SMB.TILE_INFO[t];
          if (!info || !info.name) continue;
          let x = c * TS - camX, y = r * TS;
          const b = area.bumps[c + ',' + r];
          if (b !== undefined) y += BUMP_OFFS[b];
          const img = A().tile(area.theme, info.name);
          const fr = info.frames > 1 ? blink : 0;
          if (img) A().drawStrip(ctx, img, fr, 16, 16, x, y);
          else this.drawTilePlaceholder(t, info, x, y);
        }
      }
    }

    drawTilePlaceholder(t, info, x, y) {
      const ctx = this.ctx;
      const ug = this.area.theme === 'underground';
      if (t === T.COIN) { A().placeholder(ctx, x + 4, y + 2, 8, 12, '#f8d800'); return; }
      if (t === T.POLE) { ctx.fillStyle = '#80d010'; ctx.fillRect(x + 7, y, 2, 16); return; }
      if (t === T.POLE_TOP) { ctx.fillStyle = '#00a800'; ctx.fillRect(x + 4, y + 8, 8, 8); return; }
      let col = info.color;
      if (ug && (t === T.GROUND || t === T.BRICK || t === T.BLOCK)) col = '#0070ec';
      A().placeholder(ctx, x, y, 16, 16, col);
      if (t === T.QUESTION) SMB.Text.draw(ctx, '?', x + 4, y + 4, '#000');
      if (t === T.BRICK) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y + 7, 16, 1); ctx.fillRect(x + 7, y, 1, 7); ctx.fillRect(x + 3, y + 8, 1, 8); ctx.fillRect(x + 11, y + 8, 1, 8); }
    }

    drawSceneryPlaceholder(name, x, y) {
      const ctx = this.ctx;
      if (name.startsWith('hill')) {
        const big = name === 'hill_large', w = big ? 80 : 48, h = big ? 35 : 19;
        ctx.fillStyle = '#00a800';
        ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w / 2 - 8, y); ctx.lineTo(x + w / 2 + 8, y); ctx.lineTo(x + w, y + h); ctx.fill();
      } else if (name.startsWith('cloud') || name.startsWith('bush')) {
        const n = parseInt(name.split('_')[1], 10);
        const w = 16 + n * 16, h = name.startsWith('cloud') ? 24 : 16;
        ctx.fillStyle = name.startsWith('cloud') ? '#fcfcfc' : '#80d010';
        ctx.fillRect(x + 4, y + 4, w - 8, h - 4);
      } else if (name === 'castle_small') {
        A().placeholder(ctx, x, y + 32, 80, 48, '#c84c0c');
        A().placeholder(ctx, x + 16, y, 48, 32, '#c84c0c');
        ctx.fillStyle = '#000'; ctx.fillRect(x + 32, y + 56, 16, 24);
      }
    }
  }

  SMB.Game = Game;
})();
