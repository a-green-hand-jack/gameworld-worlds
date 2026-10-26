"""More 1-1 rule checks: death, lives, game over, restart, time-out, fire flower, star, hidden 1-up, multi-coin."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from harness import Game

out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/mech2'
os.makedirs(out, exist_ok=True)
results = []
def check(name, cond, info=''):
    results.append((name, bool(cond), info)); print(('PASS' if cond else 'FAIL'), name, info)

g = Game()
def tp(x, y=None):
    g.js(f"(() => {{ const p = SMB.game.player; p.x = {x}; {'' if y is None else f'p.y = {y} - p.h;'} p.vx = 0; p.vy = 0; }})()")
def until(cond_js, maxf=600):
    for i in range(maxf):
        g.step(1)
        if g.js(cond_js): return i + 1
    return None

g.press('start'); g.step(160)
check('lives start at 3', g.state()['lives'] == 3)

# Hidden 1-up at 64,8: jump under it.
g.js("SMB.game.area.spawned.fill(true); SMB.game.enemies = []")
g.js("SMB.game.camX = 50*16")
tp(64*16 + 2, 13*16); g.step(2)
g.hold('A', frames=25); g.step(20)
check('hidden block revealed', g.js("SMB.game.area.get(64,8) === SMB.T.USED"))
check('1-up mushroom appears', g.js("SMB.game.items.map(i=>i.kind).join()") == '1up', g.js("SMB.game.items.map(i=>i.kind)"))
g.js("(() => { const g=SMB.game, it=g.items[0]; it.emerge=16; it.behind=false; g.player.x = it.x; g.player.y = it.y + it.h - g.player.h; })()")
g.step(2)
check('1-up gives a life', g.state()['lives'] == 4, g.state()['lives'])

# Multi-coin brick at 94,9.
g.js("SMB.game.camX = 85*16")
tp(94*16 + 2, 13*16); g.step(2)
c0 = g.state()['coins']
for i in range(6):
    g.hold('A', frames=12); until("SMB.game.player.onGround", 120); g.step(2)
c1 = g.state()['coins']
check('multi-coin brick gives several coins', c1 - c0 >= 5, c1 - c0)

# Star brick at 101,9.
g.js("SMB.game.camX = 92*16")
tp(101*16 + 2, 13*16); g.step(2)
g.hold('A', frames=12); g.step(30)
check('star comes out of brick 101', g.js("SMB.game.items.some(i => i.kind === 'star')"), g.js("SMB.game.items.map(i=>i.kind)"))
g.js("(() => { const g=SMB.game, it=g.items.find(i=>i.kind==='star'); it.emerge=16; it.behind=false; g.player.x = it.x; g.player.y = it.y; })()")
g.step(2)
check('star makes Mario invincible', g.js("SMB.game.player.star > 0"))
g.js("(() => { const g = SMB.game, p = g.player; p.x = 103*16; p.y = 13*16 - p.h; p.vy = 0; g.enemies = [SMB.makeEnemy(g, {type:'goomba', x: 106, y: 12})]; })()")
g.set('right', True); g.step(70); g.set('right', False)
check('star kills goomba on touch, Mario unhurt', g.js("SMB.game.enemies.every(e => e.dying || e.dead)") and not g.state()['dead'])
g.shot(out + '/star.png')
g.js("SMB.game.player.star = 1"); g.step(2)

# Fire flower: block 109,5 gives flower when big.
g.js("SMB.game.transform(SMB.game.player, 1); SMB.game.state='play'"); g.step(2)
g.js("SMB.game.camX = 100*16")
tp(109*16 + 2, 9*16)  # stand on the ? at 109,9 ... it's a block; jump to hit 109,5
g.step(4)
g.hold('A', frames=20); g.step(40)
check('flower from ? 109,5 when big', g.js("SMB.game.items.some(i => i.kind === 'flower')"), g.js("SMB.game.items.map(i=>i.kind)"))
g.js("(() => { const g=SMB.game, it=g.items.find(i=>i.kind==='flower'); if (!it) return; it.emerge=16; it.behind=false; g.player.x = it.x; g.player.y = it.y + it.h - g.player.h; })()")
g.step(2); until("SMB.game.state === 'play'", 100)
check('flower makes Fire Mario', g.state()['power'] == 2, g.state()['power'])
tp(115*16, 13*16); g.step(2)
g.js("(() => { const g = SMB.game; g.enemies = [SMB.makeEnemy(g, {type:'goomba', x: 121, y: 12})]; })()")
g.js("SMB.game.player.facing = 1")
g.press('B'); g.step(3)
check('fireball thrown', g.js("SMB.game.fireballs.length") == 1)
ys = []
for i in range(30):
    g.step(1); ys.append(g.js("SMB.game.fireballs[0] ? SMB.game.fireballs[0].y : null"))
check('fireball bounces along the ground', len([y for y in ys if y is not None]) > 5 and min(y for y in ys if y is not None) < max(y for y in ys if y is not None) - 6, ys[:12])
g.step(40)
check('fireball kills goomba', g.js("SMB.game.enemies.every(e => e.dying || e.dead)"))
g.press('B'); g.step(1); g.press('B'); g.step(1); g.press('B'); g.step(1)
check('max 2 fireballs', g.js("SMB.game.fireballs.length") <= 2)
g.shot(out + '/fire.png')

# Pit death and lives.
lives = g.state()['lives']
tp(69*16 + 2, 13*16)   # first pit is at 69-70
g.js("SMB.game.camX = 60*16")
n = until("SMB.game.state === 'dying'", 120)
check('falling into pit kills', n is not None, g.state())
n = until("SMB.game.state === 'intro'", 400)
check('after death -> intro with one life less', n is not None and g.state()['lives'] == lives - 1, g.state())
until("SMB.game.state === 'play'", 300)
s = g.state()
check('restart small at checkpoint or start', s['power'] == 0 and s['time'] == 400, s)

# Time out
g.js("SMB.game.time = 3")
n = until("SMB.game.state === 'dying'", 200)
check('time-out kills Mario', n is not None)
n = until("SMB.game.state === 'timeup'", 400)
check('TIME UP screen', n is not None)
g.shot(out + '/timeup.png')

# Game over: lose remaining lives quickly.
for k in range(6):
    until("SMB.game.state === 'play'", 600)
    if g.state()['state'] != 'play': break
    g.js("SMB.game.killPlayer()")
    until("SMB.game.state !== 'dying'", 400)
    if g.state()['state'] == 'gameover': break
check('game over screen', g.state()['state'] == 'gameover', g.state())
g.shot(out + '/gameover.png')
until("SMB.game.state === 'title'", 400)
check('game over -> title', g.state()['state'] == 'title')
g.press('start'); g.step(5)
check('restart after game over resets lives/score', g.state()['lives'] == 3 and g.state()['score'] == 0, g.state())

# Hurry-up at 100
until("SMB.game.state === 'play'", 300)
g.js("SMB.game.time = 101; SMB.game.timeT = 0")
g.step(30)
check('hurry flag at 100', g.js("SMB.game.hurried") is True)

# Pause
g.press('start'); t0 = g.state()['time']; x0 = g.state()['x']
g.set('right', True); g.step(60); g.set('right', False)
check('pause freezes', g.state()['time'] == t0 and g.state()['x'] == x0)
g.press('start'); g.step(5)
check('unpause', not g.js("SMB.game.paused"))

# 100 coins = 1-up
lives = g.state()['lives']
g.js("SMB.game.coins = 99; SMB.game.addCoin()")
check('100 coins -> 1-up, counter 0', g.state()['lives'] == lives + 1 and g.state()['coins'] == 0)

print('errors:', g.errors)
g.close()
print(sum(r[1] for r in results), '/', len(results), 'passed')
