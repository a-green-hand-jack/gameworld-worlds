"""World 1-2..1-4 checks on the real level data: 1-2 pipes and warp zone, 1-3 lifts, 1-4 start, firebars and ending.
Usage: python3 tests/levels.py [outdir]  (SMB_ROOT=<dir> to run a packaged build with the real assets)."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from harness import Game

out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/levels'
os.makedirs(out, exist_ok=True)
kw = {'root': os.environ['SMB_ROOT']} if os.environ.get('SMB_ROOT') else {}
results = []
def check(name, cond, info=''):
    results.append((name, bool(cond), info)); print(('PASS' if cond else 'FAIL'), name, info)

def until(g, cond_js, maxf=600):
    for i in range(maxf):
        g.step(1)
        if g.js(cond_js): return i + 1
    return None

def put(g, x, feet_row, cam=None):
    g.js(f"(() => {{ const g = SMB.game, p = g.player; p.x = {x}; p.y = {feet_row}*16 - p.h; p.vx = 0; p.vy = 0;"
         f" {'' if cam is None else f'g.camX = {cam};'} }})()")

def start(level):
    g = Game(hash_='#level=' + level, **kw)
    g.press('start')
    until(g, "SMB.game.state === 'play'", 400)
    return g

# ---- 1-2: intro walk, pipe into the main area, coin room, warp zone, exit pipe.
g = start('1-2')
check('1-2 starts in the intro area', g.state()['area'] == 'intro' and g.state()['level'] == '1-2', g.state())
n = until(g, "SMB.game.area.name === 'main' && SMB.game.state === 'play'", 600)
check('1-2 intro: Mario walks into the pipe by himself, then drops into the underground', n is not None, g.state())
check('1-2 has Piranha Plants', g.js("SMB.LevelDefs['1-2'].areas.main().b.enemyDefs ? true : true") and
      g.js("(() => { const a = SMB.game.area; return a.enemyDefs.some(e => e.type === 'piranha'); })()"))
# Coin room pipe at 103.
put(g, 103*16 + 10, 9, 95*16); g.step(2)
g.hold('down', frames=60); g.step(40)
check('1-2 pipe at 103 leads to the coin room', g.state()['area'] == 'coinroom', g.state())
g.shot(out + '/12_coinroom.png')
# Leave by the side pipe.
put(g, 11*16, 13); g.hold('right', frames=60); g.step(80)
check('1-2 coin room side pipe returns to the main area at 115', g.state()['area'] == 'main' and abs(g.state()['x'] - 115*16) < 64, g.state())
# Warp zone: run along the ceiling from 162.
g.js("SMB.game.enemies = []; SMB.game.area.spawned.fill(true)")
cam0 = g.js("SMB.game.area.camMax")
put(g, 160*16, 10, 150*16); g.hold('right', frames=60)
check('walking along the floor past 162 keeps the warp zone hidden', g.js("SMB.game.area.camMax") == cam0 and g.js("SMB.game.player.x") > 162*16, g.js("[SMB.game.area.camMax, SMB.game.player.x]"))
put(g, 161*16, 2, 150*16); g.step(2)
g.hold('right', 'B', frames=150)
check('running over the ceiling unlocks the warp zone', g.js("SMB.game.area.camMax") > cam0, (cam0, g.js("SMB.game.area.camMax")))
until(g, "SMB.game.warpShown === SMB.game.area", 200)
check('WELCOME TO WARP ZONE! is shown', g.js("SMB.game.warpShown === SMB.game.area"))
g.step(10); g.shot(out + '/12_warpzone.png')
put(g, 186*16 + 10, 10); g.step(2)
g.hold('down', frames=60)
until(g, "SMB.game.state !== 'pipe'", 200)
g.step(30); g.shot(out + '/12_warp.png')
check('warp pipe 2 leaves 1-2 for World 2 (not in this version: message)', g.js("SMB.game.warpWorld") == '2-1', [g.state()['state'], g.js("SMB.game.warpWorld")])
g.close()

g = start('1-2')
until(g, "SMB.game.area.name === 'main' && SMB.game.state === 'play'", 600)
g.js("SMB.game.enemies = []; SMB.game.area.spawned.fill(true)")
put(g, 164*16, 10, 150*16); g.step(2)
g.hold('right', frames=60); g.step(80)
check('1-2 side pipe at 166 leads to the exit area', g.state()['area'] == 'exit', g.state())
until(g, "SMB.game.state === 'play'", 200)
g.shot(out + '/12_exit.png')
put(g, 20*16, 4); g.set('right', True)
n = until(g, "SMB.game.state === 'flag'", 300)
g.set('right', False)
check('1-2 exit area has the flagpole', n is not None, g.state())
until(g, "SMB.game.state === 'intro'", 1500)
check('1-2 -> 1-3', g.state()['level'] == '1-3', g.state())
g.close()

# ---- 1-3: lifts.
g = start('1-3')
g.shot(out + '/13_start.png')
lifts = g.js("SMB.game.platforms.map(l => [l.kind, Math.round(l.x/16*10)/10, Math.round(l.y/16*10)/10])")
check('1-3 has its lifts (one vertical, three horizontal)', len(lifts) >= 3, lifts)
for i, kind in enumerate([l[0] for l in lifts]):
    lx, ly = g.js(f"[SMB.game.platforms[{i}].x, SMB.game.platforms[{i}].y]")
    g.js(f"(() => {{ const g = SMB.game, p = g.player, l = g.platforms[{i}]; g.camX = Math.max(0, l.x - 100); g.enemies = []; g.area.spawned.fill(true);"
         f" p.x = l.x + 8; p.y = l.y - p.h - 1; p.vx = 0; p.vy = 0; p.star = 600; }})()")
    g.step(3)
    riding = g.js(f"SMB.game.player.riding === SMB.game.platforms[{i}]")
    x0, y0 = g.js("[SMB.game.player.x, SMB.game.player.y]"); g.step(20)
    x1, y1 = g.js("[SMB.game.player.x, SMB.game.player.y]")
    check(f'1-3 lift {i} ({kind}) carries Mario', riding and (abs(x1 - x0) > 1 or abs(y1 - y0) > 1) and g.state()['state'] == 'play', (riding, x1 - x0, y1 - y0))
g.close()

# ---- 1-4: start on the top step, firebars, lava, Bowser, axe, Toad.
g = start('1-4')
s = g.state()
check('1-4 Mario starts on the top step, not inside the wall', s['state'] == 'play' and not g.js("SMB.game.area.solidAtPx(SMB.game.player.x + 6, SMB.game.player.y + 8)") and s['y'] < 7*16, s)
g.shot(out + '/14_start.png')
fb = g.js("SMB.game.area.enemyDefs.filter(e => e.type === 'firebar').length")
check('1-4 has its firebars', fb >= 6, fb)
check('1-4 has Bowser and Toad', g.js("['bowser','toad'].every(t => SMB.game.area.enemyDefs.some(e => e.type === t))"))
g.js("(() => { const g = SMB.game; g.camX = 120*16; g.area.spawned.fill(false); g.enemies = []; for (let i = 0; i < g.area.enemyDefs.length; i++) if (g.area.enemyDefs[i].x < 120 || g.area.enemyDefs[i].type === 'flamegen') g.area.spawned[i] = true; g.spawnEnemies(); })()")
put(g, 125*16, 10, 120*16); g.step(30)
check('Bowser stands on the bridge', g.js("SMB.game.enemies.some(e => e.type === 'bowser')"), g.js("SMB.game.enemies.map(e=>e.type)"))
g.shot(out + '/14_bowser.png')
g.js("(() => { const g = SMB.game, p = g.player; g.enemies = g.enemies.filter(e => e.type !== 'bowserfire'); p.x = 141*16 + 2; p.y = 9*16 - p.h; p.vx = 0; p.vy = 0; p.star = 0; p.invuln = 0; })()")
n = until(g, "SMB.game.state === 'axe'", 10)
check('1-4 axe starts the ending', n is not None, g.state())
until(g, "SMB.game.axeState && SMB.game.axeState.phase === 'message'", 1500)
g.step(200); g.shot(out + '/14_toad.png')
check('1-4 Mario reaches Toad', g.js("SMB.game.axeState.phase") == 'message', g.js("SMB.game.axeState.phase"))
n = until(g, "SMB.game.state === 'clearscreen'", 800)
g.step(30); g.shot(out + '/14_end.png')
check('after 1-4 the game shows its end screen', n is not None, g.state())
print('errors:', g.errors)
g.close()
print(sum(r[1] for r in results), '/', len(results), 'passed')
