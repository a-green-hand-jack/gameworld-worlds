"""Heuristic bot: tries to play a level from the start to the flag with real inputs only (no teleports).
Usage: python3 tests/bot.py [level] [outdir]. Prints progress and the end state.
SMB_GOD=1 keeps Mario invincible (star) to check that the terrain alone can be crossed."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from harness import Game

level = sys.argv[1] if len(sys.argv) > 1 else '1-1'
out = sys.argv[2] if len(sys.argv) > 2 else '/tmp/bot'
os.makedirs(out, exist_ok=True)
kw = {'root': os.environ['SMB_ROOT']} if os.environ.get('SMB_ROOT') else {}
g = Game(hash_='#level=' + level, **kw)
g.js("""SMB.botDecide = function () {
  const g = SMB.game, p = g.player, a = g.area, T = 16;
  if (g.state !== 'play') return {right: false, A: false, B: false};
  const feetRow = Math.floor((p.y + p.h - 1) / T);
  const front = p.x + p.w;
  let jump = false;
  // wall ahead
  for (let dx = 1; dx <= 20; dx += 4) {
    const c = Math.floor((front + dx) / T);
    for (let r = Math.floor(p.y / T); r <= feetRow; r++) if (a.solid(c, r)) jump = true;
  }
  // pit ahead (under a low ceiling: wait for the edge, to get out from under it first)
  const lowNow = [p.x + 2, p.x + p.w - 2].some((px) => { const c = Math.floor(px / T);
    for (let r = Math.floor(p.y / T) - 1; r >= Math.floor(p.y / T) - 3 && r >= 0; r--) if (a.solid(c, r)) return true; return false; });
  if (p.onGround) {
    for (let dx = 2; dx <= (lowNow ? 4 : 26); dx += 2) {
      const c = Math.floor((front + dx) / T);
      let ground = false;
      for (let r = feetRow + 1; r < 15; r++) if (a.solid(c, r)) { ground = true; break; }
      if (!ground) jump = true;
    }
  }
  // stepping off a ledge with an enemy below: jump over it instead of landing in front of it
  let drop = false;
  if (p.onGround) {
    const c = Math.floor((front + 4) / T);
    if (!a.solid(c, feetRow + 1)) drop = true;
  }
  // enemy ahead
  let enemyJump = false;
  for (const e of g.enemies) {
    if (drop && !e.dying && !e.dead && e.x - front > -8 && e.x - front < 110) jump = true;
    if (e.dying || e.dead || e.hidden) continue;
    const dx = e.x - front;
    if (dx > -8 && dx < 44 && Math.abs((e.y + e.h) - (p.y + p.h)) < 40) jump = enemyJump = true;
    if (e.state === 'slide' && Math.abs(e.x - p.x) < 80) jump = enemyJump = true;
  }
  // low ceiling over the next few columns: hop only as high as the headroom (enemies still get a full jump)
  let headroom = 999;
  if (a.def.theme === 'underground' || a.def.theme === 'castle') for (let dx = 0; dx <= 64; dx += 8) {
    const c = Math.floor((front + dx) / T);
    if (a.solid(c, Math.floor(p.y / T)) || a.solid(c, feetRow)) continue; // a wall, not a ceiling
    for (let r = Math.floor(p.y / T) - 1; r >= 0; r--) if (a.solid(c, r)) { headroom = Math.min(headroom, p.y - (r + 1) * T); break; }
  }
  // a side pipe's mouth at our feet: walk into it
  if (!enemyJump && a.pipes.some((q) => q.dir === 'right' && q.x * T - front < 40 && q.x * T - front > -4 && Math.abs(p.y + p.h - (q.y + 2) * T) < 1)) jump = false;
  const hold = enemyJump ? 34 : Math.max(2, Math.min(34, Math.round((headroom - 20) / 2)));
  return {right: true, A: jump, B: true, hold};
};""")
g.js("SMB.sounds = {}; (function(){ const S = SMB.Sound; for (const k of ['play','playMusic']) { const f = S[k].bind(S); S[k] = function(n){ SMB.sounds[n] = (SMB.sounds[n]||0)+1; return f.apply(null, arguments); }; } })()")
g.press('start')
held_a = 0; last_x = 0; stuck = 0; f = 0; deaths = 0
max_x = 0
backoff = 0
while f < 60 * 400:
    st = g.js("SMB.game.state")
    if st in ('flag', 'clearscreen') or (st == 'intro' and g.js("SMB.game.levelId") != level):
        break
    if st == 'gameover': break
    if os.environ.get('SMB_GOD'): g.js("SMB.game.player && (SMB.game.player.star = 600)")
    d = g.js("SMB.botDecide()")
    if st == 'play':
        if d['A'] and held_a == 0 and g.js("SMB.game.player.onGround"): held_a = d['hold']
        if held_a > 0:
            g.set('A', True); held_a -= 1
        else:
            g.set('A', False)
        if backoff > 0:
            backoff -= 1; g.set('right', False); g.set('left', True); g.set('A', False)
        else:
            g.set('left', False); g.set('right', d['right'])
        g.set('B', d['B'])
    else:
        g.set('A', False)
    g.step(1); f += 1
    x = g.js("SMB.game.player.x")
    if x > max_x: max_x = x
    stuck = stuck + 1 if abs(x - last_x) < 0.01 and st == 'play' else 0
    last_x = x
    if stuck > 40: backoff = 24; stuck = 0
    if g.js("SMB.game.state") == 'dying' and st == 'play': deaths += 1; g.shot(f'{out}/death{deaths}.png')
    if f % 600 == 0: print(f, g.state())
    if f % 150 == 0 and os.environ.get('SMB_SHOTS'): g.shot(f'{out}/f{f:05d}.png')
s = g.state()
print('END', json.dumps(s), 'deaths', deaths, 'frames', f, 'maxx', max_x / 16)
for i in range(400):
    g.step(5)
    if os.environ.get('SMB_SHOTS') and i % 20 == 0: g.shot(f'{out}/after{i:03d}.png')
    if g.js("SMB.game.state") in ('intro', 'clearscreen'): break
print('AFTER', g.state(), 'errors', g.errors)
print('SOUNDS', g.js('SMB.sounds'))
g.shot(out + '/end.png')
g.close()
