// Loads the artist's assets from assets/ (see docs/assets.md).
// Every asset is optional: when a file is missing the game draws or stays silent instead.
(function () {
  'use strict';

  const IMAGES = {
    head: 'assets/images/snake-head.png',
    body: 'assets/images/snake-body.png',
    tail: 'assets/images/snake-tail.png',
    food: 'assets/images/food.png',
    tile: 'assets/images/board-tile.png',
    logo: 'assets/images/title-logo.png',
    wall: 'assets/images/wall.png',
  };
  const SOUNDS = {
    start: 'assets/audio/start',
    eat: 'assets/audio/eat',
    gameover: 'assets/audio/gameover',
    music: 'assets/audio/music',
    turn: 'assets/audio/turn',
  };
  const SOUND_EXTS = ['.ogg', '.mp3', '.wav'];

  const assets = { images: {}, sounds: {}, status: {} };

  function loadImage(key, src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { assets.images[key] = img; assets.status[key] = src; resolve(); };
      img.onerror = () => { assets.status[key] = null; resolve(); };
      img.src = src;
    });
  }

  function loadSound(key, base) {
    return new Promise((resolve) => {
      let i = 0;
      const tryNext = () => {
        if (i >= SOUND_EXTS.length) { assets.status[key] = null; resolve(); return; }
        const src = base + SOUND_EXTS[i++];
        const audio = new Audio();
        audio.preload = 'auto';
        const ok = () => { cleanup(); assets.sounds[key] = audio; assets.status[key] = src; resolve(); };
        const fail = () => { cleanup(); tryNext(); };
        const cleanup = () => {
          audio.removeEventListener('canplaythrough', ok);
          audio.removeEventListener('loadeddata', ok);
          audio.removeEventListener('error', fail);
        };
        audio.addEventListener('canplaythrough', ok);
        audio.addEventListener('loadeddata', ok);
        audio.addEventListener('error', fail);
        audio.src = src;
        audio.load();
      };
      tryNext();
    });
  }

  // Resolves once every asset has loaded or failed; never rejects. A slow asset
  // does not hold the game back: after 3 s the game starts with what has arrived.
  assets.ready = Promise.race([
    Promise.all([
      ...Object.entries(IMAGES).map(([k, s]) => loadImage(k, s)),
      ...Object.entries(SOUNDS).map(([k, s]) => loadSound(k, s)),
    ]),
    new Promise((r) => setTimeout(r, 3000)),
  ]);

  assets.muted = false;
  try { assets.muted = localStorage.getItem('snake.muted') === '1'; } catch (e) { /* storage unavailable */ }

  const VOLUME = { turn: 0.35 };
  assets.play = function (key) {
    const a = assets.sounds[key];
    if (!a || assets.muted) return;
    try {
      const s = a.cloneNode();
      s.volume = VOLUME[key] !== undefined ? VOLUME[key] : 1;
      const p = s.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* autoplay blocked or decode error: stay silent */ }
  };

  assets.music = function (on) {
    const a = assets.sounds.music;
    if (!a) return;
    a.loop = true;
    a.volume = 0.4;
    if (on && !assets.muted) {
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } else {
      a.pause();
    }
  };

  window.SnakeAssets = assets;
})();
