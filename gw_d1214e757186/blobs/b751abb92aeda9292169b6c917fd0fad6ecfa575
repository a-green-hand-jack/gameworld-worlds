"""World 1-2..1-4 mechanics on a synthetic test castle: lava, firebar, lifts, Bowser's fire, axe -> bridge -> Toad -> next."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from harness import Game

out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/mech3'
os.makedirs(out, exist_ok=True)
results = []
def check(name, cond, info=''):
    results.append((name, bool(cond), info)); print(('PASS' if cond else 'FAIL'), name, info)

g = Game()
def until(cond_js, maxf=600):
    for i in range(maxf):
        g.step(1)
        if g.js(cond_js): return i + 1
    return None

# A 48-column test castle built with Builder.fromRows.
rows = ['.' * 48 for _ in range(15)]
def put(x, y, s):
    r = rows[y]; rows[y] = r[:x] + s + r[x + len(s):]
for y in range(13, 15): put(0, y, '#' * 12)
put(12, 13, 'L' * 4); put(12, 14, 'l' * 4)                 # lava pit 12-15
for y in range(13, 15): put(16, y, '#' * 8)
put(24, 13, 'L' * 4); put(24, 14, 'l' * 4)                 # pit under the lift, 24-27
for y in range(9, 15): put(28, y, '#' * 2)                  # tall wall 28-29
put(30, 9, 'b' * 10); put(30, 10, 'L' * 10); put(30, 11, 'l' * 10)  # bridge 30-39 over lava
put(39, 8, 'c'); put(40, 8, 'a')                            # chain, axe
for y in range(9, 15): put(40, y, '#' * 8)
for y in range(0, 2): put(0, y, 'X' * 48)                   # ceiling
g.js("""(() => {
  const B = SMB.LevelBuilder;
  SMB.LevelDefs['9-9'] = { world: 9, stage: 9, time: 300, next: '1-1', startArea: 'main', areas: { main() {
    const b = B.fromRows(%s);
    b.enemy('firebar', 20, 9, {angle: Math.PI / 2});
    b.enemy('bowser', 36, 7);
    b.enemy('toad', 45, 8);
    b.axe = {x: 40, y: 8}; b.bridge = {x0: 30, x1: 39, y: 9, chain: {x: 39, y: 8}};
    return { def: { name: 'main', theme: 'castle', bg: '#000000', music: 'castle',
      makePlatforms: () => [new SMB.Lift({kind: 'horiz', x: 23, y: 11, width: 3, range: 3})] }, b };
  } } };
  SMB.game.startLevel = '9-9';
})()""" % repr(rows).replace("'", '"'))
g.press('start'); until("SMB.game.state === 'play'", 300)
check('test castle loads', g.state()['level'] == '9-9' and g.js("SMB.game.area.theme") == 'castle', g.state())
check('lift spawned', g.js("SMB.game.platforms.length") == 1)
g.js("SMB.game.spawnEnemies.call(Object.assign(Object.create(SMB.game), {camX: 40*16, enemies: SMB.game.enemies}))"); g.step(1)
check('firebar, bowser, toad spawned', sorted(g.js("SMB.game.enemies.map(e=>e.type)")) == ['bowser', 'firebar', 'toad'], g.js("SMB.game.enemies.map(e=>e.type)"))

# Lava kills.
until("SMB.game.state === 'play'", 300)
g.js("(() => { const p = SMB.game.player; p.x = 13*16; p.y = 12*16 - p.h; p.vx = 0; p.vy = 0; })()")
n = until("SMB.game.state === 'dying'", 60)
check('lava kills Mario', n is not None)
until("SMB.game.state === 'play'", 600)
lives = g.state()['lives']
g.js("(() => { const p = SMB.game.player; p.x = 17*16; p.y = 13*16 - p.h; })()"); g.step(30)

# Firebar: rotates and hurts.
a0 = g.js("SMB.game.enemies.find(e=>e.type==='firebar').angle"); g.step(40)
a1 = g.js("SMB.game.enemies.find(e=>e.type==='firebar').angle")
check('firebar rotates (1 turn / 160 frames)', abs((a1 - a0) - 40 * 2 * 3.14159265 / 160) < 0.01, (a0, a1))
g.js("SMB.game.transform(SMB.game.player, 1); SMB.game.state='play'"); g.step(1)
g.js("(() => { const g = SMB.game, p = g.player, f = g.enemies.find(e=>e.type==='firebar'); f.angle = Math.PI/2; p.x = f.cx - 8; p.y = 13*16 - p.h; p.vx = 0; p.vy = 0; })()")
g.step(2)
check('firebar hurts Mario (big -> small)', g.js("SMB.game.player.power") == 0 or g.state()['state'] == 'grow', g.js("[SMB.game.player.power, SMB.game.state]"))
until("SMB.game.state === 'play'", 100)
g.js("(() => { const p = SMB.game.player; p.x = 2*16; p.y = 13*16 - p.h; SMB.game.camX = 0; })()"); g.step(200)  # invincibility runs out

# Horizontal lift carries Mario.
g.js("(() => { const g = SMB.game, p = g.player, l = g.platforms[0]; g.enemies = g.enemies.filter(e => e.type !== 'firebar'); p.x = l.x + 12; p.y = l.y - p.h - 1; p.vx = 0; p.vy = 0; })()")
g.step(3)
check('Mario rides the lift', g.js("SMB.game.player.riding === SMB.game.platforms[0]"))
x0 = g.js("SMB.game.player.x"); lx0 = g.js("SMB.game.platforms[0].x"); g.step(30)
dx, dl = g.js("SMB.game.player.x") - x0, g.js("SMB.game.platforms[0].x") - lx0
check('lift moves Mario with it', abs(dx - dl) < 0.01 and abs(dl) > 2, (dx, dl))
check('Mario not dead on lift', not g.state()['dead'] and g.state()['state'] == 'play')

# Bowser breathes fire.
g.js("(() => { const p = SMB.game.player; p.x = 28*16; p.y = 9*16 - p.h; p.vx = 0; p.vy = 0; SMB.game.camX = 24*16; })()")
until("SMB.game.enemies.some(e => e.type === 'bowserfire')", 400)
check('Bowser breathes fire', g.js("SMB.game.enemies.some(e => e.type === 'bowserfire')"))
g.shot(out + '/bowser.png')
check('Bowser survives stomp-free contact rules (starProof)', g.js("SMB.game.enemies.find(e=>e.type==='bowser').starProof") is True)

# Five fireballs defeat Bowser (direct calls to fireHit, as the fireball loop does).
g.js("SMB.game.enemies.find(e=>e.type==='bowser').fireHit()")
check('one fireball does not defeat Bowser', not g.js("SMB.game.enemies.find(e=>e.type==='bowser').dying"))

# Axe: put Mario on it (enemies other than Bowser cleared so flames don't interfere).
g.js("(() => { const g = SMB.game, p = g.player; g.enemies = g.enemies.filter(e => e.type !== 'bowserfire'); p.x = 40*16 + 2; p.y = 9*16 - p.h; p.vx = 0; p.vy = 0; p.star = 0; p.invuln = 0; })()")
n = until("SMB.game.state === 'axe'", 10)
check('touching the axe starts the ending', n is not None, g.state())
check('axe and chain removed', g.js("SMB.game.area.get(40,8) === 0 && SMB.game.area.get(39,8) === 0"))
until("SMB.game.axeState.phase !== 'collapse'", 100)
check('bridge collapses', g.js("[30,31,35,39].every(x => SMB.game.area.get(x, 9) === 0)"))
check('Bowser falls', g.js("SMB.game.bowser && SMB.game.bowser.dying"))
until("SMB.game.axeState.phase === 'message'", 1200)
check('Mario walks to Toad and time is tallied', g.js("SMB.game.axeState.phase") == 'message' and g.state()['time'] == 0, g.state())
check('Mario stops left of Toad', abs(g.js("SMB.game.player.x") - (45*16 - 24)) < 1, g.js("SMB.game.player.x"))
g.step(100); g.shot(out + '/toad.png')
until("SMB.game.state === 'intro'", 500)
check('castle -> next level', g.state()['state'] == 'intro' and g.state()['level'] == '1-1', g.state())

print('errors:', g.errors)
g.close()
print(sum(r[1] for r in results), '/', len(results), 'passed')
