// Asset loading: fixed file names under assets/ (see docs/assets.md), loaded with <img>/<audio> so the game
// also runs from file://. Missing files are reported once and replaced by placeholders at draw time.
(function () {
  const SMB = (window.SMB = window.SMB || {});

  const THEMES = ['overworld', 'underground', 'castle', 'water'];
  const TILE_NAMES = [
    'ground', 'brick', 'question', 'used', 'block', 'pipe_tl', 'pipe_tr', 'pipe_l', 'pipe_r',
    'pipe_side_mouth_t', 'pipe_side_mouth_b', 'pipe_side_body_t', 'pipe_side_body_b',
    'pipe_side_join_t', 'pipe_side_join_b', 'coin', 'treetop_l', 'treetop_m', 'treetop_r', 'trunk',
    'bridge', 'chain', 'axe', 'lava_top', 'lava', 'flag_ball', 'flag_pole',
    'cloud_block', 'rail', 'rope', 'water_top', 'coral', 'coral_top',
  ];
  // Tiles only drawn under water (tiles/water/), and tiles with a drawn stand-in when missing.
  const WATER_ONLY = ['water_top', 'coral', 'coral_top'];
  const OPTIONAL = ['tiles/overworld/rope', 'sprites/lift_cloud'];
  const SCENERY = ['hill_large', 'hill_small', 'cloud_1', 'cloud_2', 'cloud_3', 'bush_1', 'bush_2', 'bush_3',
    'castle_small', 'castle_big', 'castle_flag', 'flag', 'tree_small', 'tree_large', 'fence'];
  const SPRITES = ['mario_small', 'mario_big', 'mario_fire', 'goomba', 'goomba_ug', 'koopa_green', 'koopa_red',
    'parakoopa_green', 'parakoopa_red', 'shell_green', 'shell_red', 'piranha', 'bowser', 'bowser_fire', 'fireball',
    'fire_burst', 'toad', 'mushroom', 'mushroom_1up', 'fire_flower', 'star', 'coin_pop', 'brick_debris',
    'brick_debris_ug', 'lift', 'vine', 'jumpspring', 'blooper', 'cheep_grey', 'cheep_red', 'podoboo', 'bubble',
    'lift_cloud'];
  const UI = ['font', 'coin_icon', 'title_logo', 'cursor'];

  const Assets = {
    images: {},
    missing: [],
    ready: false,

    load() {
      const keys = [];
      for (const t of THEMES) for (const n of TILE_NAMES) if (t === 'water' || WATER_ONLY.indexOf(n) < 0) keys.push('tiles/' + t + '/' + n);
      for (const n of SCENERY) keys.push('scenery/' + n);
      for (const n of SPRITES) keys.push('sprites/' + n);
      for (const n of UI) keys.push('ui/' + n);
      // assets/manifest.js (optional) lists the files the artist supplied; only those are requested then.
      const listed = Array.isArray(window.SMB_ASSET_FILES) ? new Set(window.SMB_ASSET_FILES) : null;
      const optionalMissing = (k) => k.startsWith('tiles/underground/') || k.startsWith('tiles/castle/') ||
        (k.startsWith('tiles/water/') && WATER_ONLY.indexOf(k.split('/')[2]) < 0) || OPTIONAL.indexOf(k) >= 0 ||
        k === 'sprites/goomba_ug' || k === 'sprites/brick_debris_ug';
      const jobs = keys.map((k) => new Promise((resolve) => {
        if (listed && !listed.has(k + '.png')) {
          if (!optionalMissing(k)) this.missing.push('assets/' + k + '.png');
          resolve(); return;
        }
        const img = new Image();
        img.onload = () => { this.images[k] = img; resolve(); };
        img.onerror = () => { if (!optionalMissing(k)) this.missing.push('assets/' + k + '.png'); resolve(); };
        img.src = 'assets/' + k + '.png';
      }));
      return Promise.all(jobs).then(() => {
        this.ready = true;
        if (this.missing.length) console.warn('[assets] missing: ' + this.missing.join(', '));
      });
    },

    get(key) { return this.images[key] || null; },

    tile(theme, name) {
      return this.images['tiles/' + theme + '/' + name] || this.images['tiles/overworld/' + name] || null;
    },
  };

  // Draw frame `frame` of a horizontal strip. Returns false (and draws nothing) if the image is missing.
  Assets.drawStrip = function (ctx, img, frame, fw, fh, x, y, flip, flipV) {
    if (!img) return false;
    const n = Math.max(1, Math.floor(img.width / fw));
    const f = ((frame % n) + n) % n;
    x = Math.round(x); y = Math.round(y);
    if (flip || flipV) {
      ctx.save();
      ctx.translate(x + (flip ? fw : 0), y + (flipV ? fh : 0));
      ctx.scale(flip ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(img, f * fw, 0, fw, fh, 0, 0, fw, fh);
      ctx.restore();
    } else {
      ctx.drawImage(img, f * fw, 0, fw, fh, x, y, fw, fh);
    }
    return true;
  };

  // Draw a strip frame again on top of itself, tinted with `color` (star power, fire flower flash).
  let tintCanvas = null;
  Assets.tintOver = function (ctx, img, frame, fw, fh, x, y, flip, color, alpha) {
    if (!tintCanvas) tintCanvas = document.createElement('canvas');
    tintCanvas.width = fw; tintCanvas.height = fh;
    const t = tintCanvas.getContext('2d');
    t.clearRect(0, 0, fw, fh);
    if (img) Assets.drawStrip(t, img, frame, fw, fh, 0, 0, flip);
    else { t.fillRect(2, 0, fw - 4, fh); }
    t.globalCompositeOperation = 'source-atop';
    t.globalAlpha = alpha;
    t.fillStyle = color;
    t.fillRect(0, 0, fw, fh);
    t.globalCompositeOperation = 'source-over';
    t.globalAlpha = 1;
    ctx.drawImage(tintCanvas, Math.round(x), Math.round(y));
  };

  // Placeholder box used while an asset is missing.
  Assets.placeholder = function (ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, w - 1, h - 1);
  };

  SMB.Assets = Assets;
})();
