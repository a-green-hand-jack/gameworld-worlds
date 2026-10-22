// Tile collision for any box entity: e.x, e.y = top-left of the hit box, e.w, e.h, e.vx, e.vy.
// Moves along X then Y, pushes out of solid tiles and sets e.onGround / e.hitWall / e.hitCeil.
(function () {
  const SMB = window.SMB;
  const TS = 16;
  const EPS = 0.001;

  // Player physics, NES values converted from 1/4096 px-per-frame units.
  SMB.PHYS = {
    minWalk: 0x130 / 4096, walkAcc: 0x98 / 4096, runAcc: 0xE4 / 4096,
    release: 0xD0 / 4096, skid: 0x1A0 / 4096,
    maxWalk: 0x1900 / 4096, maxRun: 0x2900 / 4096,
    // jump tiers: [speed below which tier applies, initial vy, gravity while A held & rising, gravity otherwise]
    jumps: [[0x1000 / 4096, 4, 0x200 / 4096, 0x700 / 4096],
            [0x2500 / 4096, 4, 0x1E0 / 4096, 0x600 / 4096],
            [Infinity, 5, 0x280 / 4096, 0x900 / 4096]],
    maxFall: 4.5,
    stompBounce: 4,
  };

  function overlappingCols(e) { return [Math.floor(e.x / TS), Math.floor((e.x + e.w - EPS) / TS)]; }
  function overlappingRows(e) { return [Math.floor(e.y / TS), Math.floor((e.y + e.h - EPS) / TS)]; }

  // opts.onCeil(tiles) receives the list of [tx, ty] hit from below; opts.hiddenSolidFromBelow lets the player hit
  // hidden blocks. Returns nothing; flags are set on e.
  SMB.moveAndCollide = function (area, e, opts) {
    opts = opts || {};
    e.hitWall = 0; e.hitCeil = false;
    const wasGround = e.onGround;
    e.onGround = false;

    // ---- X
    e.x += e.vx;
    {
      const [r0, r1] = overlappingRows(e);
      if (e.vx > 0) {
        const c = Math.floor((e.x + e.w - EPS) / TS);
        for (let r = r0; r <= r1; r++) if (area.solid(c, r)) { e.x = c * TS - e.w; e.hitWall = 1; break; }
      } else if (e.vx < 0) {
        const c = Math.floor(e.x / TS);
        for (let r = r0; r <= r1; r++) if (area.solid(c, r)) { e.x = (c + 1) * TS; e.hitWall = -1; break; }
      }
      // Stuck inside a wall without moving (e.g. after growing): push towards the free side.
      if (!e.hitWall && opts.unstick) {
        const cl = Math.floor(e.x / TS), cr = Math.floor((e.x + e.w - EPS) / TS);
        for (let r = r0; r <= r1; r++) {
          if (area.solid(cl, r) && !area.solid(cr, r)) { e.x = (cl + 1) * TS; break; }
          if (area.solid(cr, r) && !area.solid(cl, r)) { e.x = cr * TS - e.w; break; }
        }
      }
    }

    // ---- Y
    e.y += e.vy;
    {
      const [c0, c1] = overlappingCols(e);
      if (e.vy >= 0) {
        const r = Math.floor((e.y + e.h - EPS) / TS);
        const prevBottom = e.y + e.h - e.vy;
        for (let c = c0; c <= c1; c++) {
          if (area.solid(c, r) && prevBottom <= r * TS + EPS + Math.max(e.vy, 0) + 0.5) {
            e.y = r * TS - e.h; e.vy = 0; e.onGround = true; break;
          }
        }
      } else {
        const r = Math.floor(e.y / TS);
        const hits = [];
        for (let c = c0; c <= c1; c++) {
          const t = area.get(c, r);
          if (area.solid(c, r) || (opts.hiddenSolidFromBelow && t === SMB.T.HIDDEN)) hits.push([c, r]);
        }
        if (hits.length) {
          // Corner nudge: if only a sliver of the head (<= 4 px) touches a single block, slide past it.
          if (opts.cornerNudge && hits.length === 1) {
            const [c] = hits[0];
            const left = c * TS, right = left + TS;
            const ovL = right - e.x, ovR = e.x + e.w - left;
            if (ovL <= 4 && ovL > 0 && !area.solid(c + 1, r) && area.get(c + 1, r) !== SMB.T.HIDDEN) { e.x = right; hits.length = 0; }
            else if (ovR <= 4 && ovR > 0 && !area.solid(c - 1, r) && area.get(c - 1, r) !== SMB.T.HIDDEN) { e.x = left - e.w; hits.length = 0; }
          }
          if (hits.length) {
            e.y = (r + 1) * TS; e.hitCeil = true;
            if (opts.onCeil) opts.onCeil(hits);
            e.vy = opts.ceilVy !== undefined ? opts.ceilVy : 0;
          }
        }
      }
    }
    // Standing exactly on a floor with vy == 0: keep the ground flag.
    if (!e.onGround && e.vy >= 0) {
      const r = Math.floor((e.y + e.h + 0.5) / TS);
      const [c0, c1] = overlappingCols(e);
      if (Math.abs(e.y + e.h - r * TS) < 0.01) for (let c = c0; c <= c1; c++) if (area.solid(c, r)) { e.onGround = true; break; }
    }
    e.wasGround = wasGround;
  };

  SMB.overlap = function (a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  };
})();
