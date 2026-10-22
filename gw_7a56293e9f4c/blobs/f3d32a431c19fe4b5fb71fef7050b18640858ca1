// Loads the artist's sprites and sounds from assets/ (see docs/assets.md).
// Every file is optional: whatever is missing is drawn or skipped by the game.
(function (root) {
  'use strict';

  // Only files the artist delivers are requested, so the console stays free of 404s.
  // The game draws a fallback for any key that is absent here or fails to load.
  var IMAGES = {
    headUp:    'assets/img/head_up.png',
    headDown:  'assets/img/head_down.png',
    headLeft:  'assets/img/head_left.png',
    headRight: 'assets/img/head_right.png',
    body:      'assets/img/body.png',
    food:      'assets/img/food.png',
    tilePair:  'assets/img/bg_tile_pair.png',  // even cell left half, odd cell right half
    logo:      'assets/img/title_logo.png',
    gameover:  'assets/img/gameover_panel.png'
  };
  var SOUNDS = {
    eat:      'assets/audio/eat.wav',
    gameover: 'assets/audio/gameover.wav',
    start:    'assets/audio/start.wav'
    // also played if listed: turn (each accepted turn), music (loop during play)
  };

  var assets = { images: {}, sounds: {}, loaded: [], missing: [] };

  function loadImage(key, src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { assets.images[key] = img; assets.loaded.push(src); resolve(); };
      img.onerror = function () { assets.missing.push(src); resolve(); };
      img.src = src;
    });
  }

  function loadSound(key, src) {
    return new Promise(function (resolve) {
      var a = new Audio();
      var done = false;
      a.preload = 'auto';
      a.oncanplaythrough = function () {
        if (done) return; done = true;
        assets.sounds[key] = a; assets.loaded.push(src); resolve();
      };
      a.onerror = function () {
        if (done) return; done = true;
        assets.missing.push(src); resolve();
      };
      a.src = src;
      a.load();
    });
  }

  assets.ready = Promise.all(
    Object.keys(IMAGES).map(function (k) { return loadImage(k, IMAGES[k]); }).concat(
    Object.keys(SOUNDS).map(function (k) { return loadSound(k, SOUNDS[k]); }))
  ).then(function () { return assets; });

  // Never let a slow or blocked sound hold up the game.
  assets.readyOrTimeout = function (ms) {
    return Promise.race([assets.ready, new Promise(function (r) { setTimeout(function () { r(assets); }, ms); })]);
  };

  assets.muted = false;
  assets.play = function (key, loop) {
    var a = assets.sounds[key];
    if (!a || assets.muted) return;
    try {
      var s = loop ? a : a.cloneNode();
      s.loop = !!loop;
      s.volume = key === 'music' ? 0.35 : 0.8;
      if (loop) s.currentTime = 0;
      var p = s.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* audio is decoration; ignore */ }
  };
  assets.stop = function (key) {
    var a = assets.sounds[key];
    if (a) { try { a.pause(); } catch (e) {} }
  };

  root.SnakeAssets = assets;
})(window);
