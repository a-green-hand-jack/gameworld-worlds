"""Scripted checks of 1-1 mechanics on the current checkout. Run: python3 tests/mechanics.py [outdir]"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from harness import Game

out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/mech'
os.makedirs(out, exist_ok=True)
results = []
def check(name, cond, info=''):
    results.append((name, bool(cond), info)); print(('PASS' if cond else 'FAIL'), name, info)

g = Game()
g.press('start'); g.step(160)
s = g.state(); check('intro->play', s['state'] == 'play' and s['time'] == 400, s)

def tp(x, y=None):
    g.js(f"(() => {{ const p = SMB.game.player; p.x = {x}; {'' if y is None else f'p.y = {y} - p.h;'} p.vx = 0; p.vy = 0; }})()")

# Jump height from standstill, A held.
g.step(5); y0 = g.state()['y']; ys = []
g.set('A', True)
for i in range(60): g.step(1); ys.append(g.state()['y'])
g.set('A', False); g.step(60)
h = y0 - min(ys); check('standing full jump height ~ 4+ tiles', 60 <= h <= 80, f'{h:.1f}px')
# Short hop
g.step(10); y0 = g.state()['y']; ys = []
g.set('A', True); g.step(2); g.set('A', False)
for i in range(40): g.step(1); ys.append(g.state()['y'])
h2 = y0 - min(ys); check('tap jump is lower than held jump', h2 < h - 20, f'{h2:.1f}px')

# ? block at x=16 row 9 (coin): stand under it and jump.
tp(16*16 + 2); g.step(2)
c0 = g.state()['coins']
g.hold('A', frames=20); g.step(40)
s = g.state(); check('coin from ? block', s['coins'] == c0 + 1, s)
check('block became used', g.js("SMB.game.area.get(16,9)") == SMB_USED if (SMB_USED := g.js("SMB.T.USED")) else False)

# Mushroom from ? at 21.
tp(21*16 + 2); g.step(2)
g.hold('A', frames=20); g.step(30)
items = g.js("SMB.game.items.map(i => i.kind)"); check('mushroom appears', items == ['mushroom'], items)
g.step(40)
# move into mushroom; it moves right at 1px/f
g.set('right', True)
for i in range(200):
    g.step(1)
    if g.state()['power'] == 1: break
g.set('right', False); g.step(60)
s = g.state(); check('mushroom makes Mario big', s['power'] == 1, s)
g.shot(out + '/big.png')

# Big Mario breaks a brick at 20,9
tp(20*16 + 2); g.step(2)
g.hold('A', frames=20); g.step(30)
check('big Mario breaks brick', g.js("SMB.game.area.get(20,9)") == 0)

# Goomba stomp: spawn camera near 40 and wait for goomba.
g.js("SMB.game.area.spawned.fill(true)"); g.js("SMB.game.enemies = []")
tp(30*16); g.step(2)
g.js("(() => { const g = SMB.game; g.enemies.push(SMB.makeEnemy(g, {type:'goomba', x: 36, y: 12})); })()")
g.step(5)
gx = g.js("SMB.game.enemies[0].x")
tp(gx - 40, 120); g.step(1)
# fall onto goomba: place directly above
g.js("(() => { const g = SMB.game, e = g.enemies[0], p = g.player; p.x = e.x; p.y = e.y - p.h - 30; p.vy = 1; })()")
sc = g.state()['score']
g.step(20)
check('stomp flattens goomba (+100)', g.state()['score'] - sc >= 100 and g.js("SMB.game.enemies.length === 0 || SMB.game.enemies[0].flatT > 0 || SMB.game.enemies[0].dead"), g.state()['score'] - sc)

# Hurt: big -> small when walking into goomba
g.js("(() => { const g = SMB.game; g.enemies = [SMB.makeEnemy(g, {type:'goomba', x: 44, y: 12})]; const p = g.player; p.x = 44*16 - 30; p.y = 13*16 - p.h; })()")
g.set('right', True); g.step(40); g.set('right', False); g.step(60)
s = g.state(); check('touching goomba shrinks big Mario', s['power'] == 0 and not s['dead'], s)

# Pipe at 57 into coin room.
g.js("SMB.game.enemies = []")
tp(57*16 + 10, 9*16); g.step(3)
g.set('down', True); g.step(40); g.set('down', False)
s = g.state(); check('enter pipe 57 -> coin room', s['area'] == 'coinroom', s)
g.step(80); g.shot(out + '/coinroom.png')
s = g.state(); check('landed in coin room', s['ground'], s)
# walk to the right pipe
g.set('right', True); g.step(10); g.hold('A', frames=25); g.step(40); g.set('right', False); g.step(30)
check('collected coin room coins by jumping', g.state()['coins'] > 3, g.state()['coins'])
tp(11*16, 13*16); g.step(2)
g.set('right', True); g.step(60); g.set('right', False)
s = g.state(); check('exit side pipe back to main at 163', s['area'] == 'main', s)
g.step(60); s = g.state()
check('rose out of pipe 163', s['state'] == 'play' and abs(s['x'] - (163*16 + 10)) < 20 and s['y'] + 14 <= 11*16 + 1, s)
g.shot(out + '/exitpipe.png')

# Koopa: stomp -> shell -> kick
g.js("(() => { const g = SMB.game; g.enemies = [SMB.makeEnemy(g, {type:'koopa', x: 172, y: 12})]; })()")
g.step(2)
g.js("(() => { const g = SMB.game, e = g.enemies[0], p = g.player; p.x = e.x; p.y = e.y - p.h - 20; p.vy = 1; p.vx = 0; })()")
g.step(15)
check('koopa stomped into shell', g.js("SMB.game.enemies[0].state") == 'shell', g.js("SMB.game.enemies[0].state"))
g.js("(() => { const g = SMB.game, e = g.enemies[0], p = g.player; p.x = e.x - 40; })()")
g.step(30)
g.js("(() => { const g = SMB.game, e = g.enemies[0], p = g.player; p.x = e.x - 14; p.y = e.y + e.h - p.h; p.vy = 0; p.invuln = 0; })()")
g.set('right', True); g.step(12); g.set('right', False)
check('touching shell kicks it', g.js("SMB.game.enemies[0] && SMB.game.enemies[0].state") == 'slide', g.js("SMB.game.enemies[0] && [SMB.game.enemies[0].state, SMB.game.enemies[0].vx]"))
g.step(12)
check('Mario not killed by own kick', not g.state()['dead'], g.state())

# Flagpole: put Mario on the top stair and run+jump to the pole.
g.js("SMB.game.enemies = []")
g.js("SMB.game.camX = 189*16 - 120")
tp(189*16 + 2, 5*16); g.step(3)
g.set('right', True); g.set('B', True); g.step(6); g.set('A', True); g.step(40); g.set('A', False)
for i in range(80):
    g.step(1)
    if g.state()['state'] == 'flag': break
g.set('right', False); g.set('B', False)
s = g.state(); check('flag sequence started', s['state'] == 'flag', s)
g.shot(out + '/flag.png')
for i in range(150):
    g.step(10)
    if g.state()['state'] != 'flag': break
s = g.state(); check('after flag -> next level / clear', s['state'] in ('intro', 'clearscreen') and s['time'] == 0, s)
g.shot(out + '/after_flag.png')

print('errors:', g.errors)
g.close()
print(sum(r[1] for r in results), '/', len(results), 'passed')
