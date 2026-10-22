// Sound: <audio> elements (works from file://). Each name is tried as .ogg, .mp3, then .wav.
(function () {
  const SMB = (window.SMB = window.SMB || {});

  const SFX = ['jump_small', 'jump_big', 'coin', 'stomp', 'kick', 'bump', 'break', 'powerup_appear', 'powerup',
    'oneup', 'pipe', 'fireball', 'flagpole', 'fireworks', 'bowser_fire', 'bowser_fall', 'beep', 'pause'];
  const MUSIC = ['overworld', 'underground', 'castle', 'starman', 'overworld_fast', 'underground_fast', 'castle_fast'];
  const JINGLES = ['hurry', 'death', 'game_over', 'course_clear', 'world_clear'];
  const POOL = 4;

  function extensions() {
    const probe = document.createElement('audio');
    const exts = [];
    if (probe.canPlayType('audio/ogg; codecs="vorbis"')) exts.push('ogg');
    if (probe.canPlayType('audio/mpeg')) exts.push('mp3');
    exts.push('wav');
    if (exts.indexOf('ogg') < 0) exts.push('ogg');
    if (exts.indexOf('mp3') < 0) exts.push('mp3');
    return exts;
  }

  const Sound = {
    sources: {}, // name -> resolved url
    pools: {},
    music: null,
    musicName: null,
    musicFast: false,
    muted: false,
    missing: [],
    volume: 0.6,

    load() {
      const exts = extensions();
      const names = SFX.concat(MUSIC, JINGLES);
      const optional = (n) => /_fast$/.test(n);
      const listed = Array.isArray(window.SMB_ASSET_FILES) ? new Set(window.SMB_ASSET_FILES) : null;
      const jobs = names.map((name) => new Promise((resolve) => {
        let i = 0;
        // With a manifest, only extensions that exist are tried.
        const tryExts = listed ? exts.filter((e) => listed.has('audio/' + name + '.' + e)) : exts;
        const tryNext = () => {
          if (i >= tryExts.length) { if (!optional(name)) this.missing.push('assets/audio/' + name); resolve(); return; }
          const url = 'assets/audio/' + name + '.' + tryExts[i++];
          const a = new Audio();
          a.preload = 'auto';
          const ok = () => { cleanup(); this.sources[name] = url; this.pools[name] = [a]; resolve(); };
          const bad = () => { cleanup(); tryNext(); };
          const cleanup = () => { a.removeEventListener('canplaythrough', ok); a.removeEventListener('loadeddata', ok); a.removeEventListener('error', bad); };
          a.addEventListener('canplaythrough', ok);
          a.addEventListener('loadeddata', ok);
          a.addEventListener('error', bad);
          a.src = url;
          a.load();
        };
        tryNext();
      }));
      // Never let audio hold back the game: give up waiting after 4 s.
      return Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 4000))]).then(() => {
        if (this.missing.length) console.warn('[assets] missing audio: ' + this.missing.join(', '));
      });
    },

    has(name) { return !!this.sources[name]; },

    play(name) {
      if (this.muted || !this.sources[name]) return;
      const pool = this.pools[name];
      let a = pool.find((x) => x.paused || x.ended);
      if (!a) {
        if (pool.length < POOL) { a = new Audio(this.sources[name]); pool.push(a); } else a = pool[0];
      }
      try { a.currentTime = 0; } catch (e) { /* not seekable yet */ }
      a.volume = this.volume;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    },

    stop(name) {
      const pool = this.pools[name];
      if (pool) for (const a of pool) { a.pause(); }
    },

    // Music: one track at a time. loop=false for jingles; onEnd fires when a jingle finishes.
    playMusic(name, loop, onEnd) {
      this.stopMusic();
      this.musicName = name;
      this.musicFast = false;
      if (!this.sources[name]) { if (onEnd && loop === false) setTimeout(onEnd, 0); return; }
      // Muted music still runs (silently), so jingles end on time and un-muting resumes the current track.
      const a = new Audio(this.sources[name]);
      a.loop = loop !== false;
      a.volume = this.volume;
      a.muted = this.muted;
      if (onEnd) a.addEventListener('ended', onEnd);
      this.music = a;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    },

    // Switch the current level music to its hurry-up version.
    setFast(baseName) {
      if (this.musicFast && this.fastBase === baseName && this.music) return;
      const fastName = baseName + '_fast';
      if (this.sources[fastName]) {
        this.playMusic(fastName, true);
      } else {
        this.playMusic(baseName, true);
        if (this.music) {
          this.music.playbackRate = 1.4;
          if ('preservesPitch' in this.music) this.music.preservesPitch = true;
        }
      }
      this.musicFast = true;
      this.fastBase = baseName;
    },

    stopMusic() {
      if (this.music) { this.music.pause(); this.music = null; }
      this.musicName = null;
    },

    pauseMusic() { if (this.music) this.music.pause(); },
    resumeMusic() { if (this.music) { const p = this.music.play(); if (p && p.catch) p.catch(() => {}); } },
    setMuted(m) { this.muted = m; if (this.music) this.music.muted = m; },
  };

  SMB.Sound = Sound;
})();
