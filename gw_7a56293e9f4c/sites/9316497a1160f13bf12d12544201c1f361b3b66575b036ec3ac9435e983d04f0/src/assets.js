// Loads the artist's sprites and sounds from assets/ (see docs/assets.md).
// Every file is optional: whatever is missing is drawn or skipped by the game.
(function (root) {
  'use strict';

  // Each entry lists candidate files; the first one that loads is used.
  var IMAGES = {
    headUp:    ['assets/img/head_up.png'],
    headDown:  ['assets/img/head_down.png'],
    headLeft:  ['assets/img/head_left.png'],
    headRight: ['assets/img/head_right.png'],
    head:      ['assets/img/head.png'],          // one head facing right, rotated by the game
    body:      ['assets/img/body.png'],
    bodyTurn:  ['assets/img/body_turn.png'],
    tail:      ['assets/img/tail.png'],
    food:      ['assets/img/food.png'],
    tile:      ['assets/img/bg_tile.png'],
    tilePair:  ['assets/img/bg_tile_pair.png'],  // even cell left half, odd cell right half
    logo:      ['assets/img/title_logo.png'],
    gameover:  ['assets/img/gameover_panel.png']
  };
  var SOUNDS = {
    eat:      soundFiles('eat'),
    gameover: soundFiles('gameover'),
    start:    soundFiles('start'),
    turn:     soundFiles('turn'),
    music:    soundFiles('music')
  };

  function soundFiles(name) {
    return ['.wav', '.ogg', '.mp3'].map(function (ext) { return 'assets/audio/' + name + ext; });
  }

  var assets = { images: {}, sounds: {}, loaded: [], missing: [] };

  function loadImage(key, files) {
    return new Promise(function (resolve) {
      var i = 0;
      (function tryNext() {
        if (i >= files.length) { assets.missing.push(files.join('|')); resolve(); return; }
        var src = files[i++];
        var img = new Image();
        img.onload = function () { assets.images[key] = img; assets.loaded.push(src); resolve(); };
        img.onerror = tryNext;
        img.src = src;
      })();
    });
  }

  function loadSound(key, files) {
    return new Promise(function (resolve) {
      var i = 0;
      (function tryNext() {
        if (i >= files.length) { assets.missing.push(files.join('|')); resolve(); return; }
        var src = files[i++];
        var a = new Audio();
        var done = false;
        a.preload = 'auto';
        a.oncanplaythrough = function () {
          if (done) return; done = true;
          assets.sounds[key] = a; assets.loaded.push(src); resolve();
        };
        a.onerror = function () { if (done) return; done = true; tryNext(); };
        a.src = src;
        a.load();
      })();
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
