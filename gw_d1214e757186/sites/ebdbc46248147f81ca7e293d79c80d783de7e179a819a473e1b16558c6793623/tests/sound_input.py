"""Input and sound-state checks: a key tapped within one logic frame still counts (qa #8); muting does not lose
music changes (producer #9: hurry-up and area music while muted resume when un-muted)."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from harness import Game

results = []
def check(name, cond, info=''):
    results.append((name, bool(cond), info)); print(('PASS' if cond else 'FAIL'), name, info)

kw = {'root': os.environ['SMB_ROOT']} if os.environ.get('SMB_ROOT') else {}
g = Game(**kw)
g.step(5)
g.pg.keyboard.press('Enter')           # down and up with no delay, between two logic frames
g.step(3)
check('zero-length Enter tap starts the game', g.js("SMB.game.state") != 'title', g.js("SMB.game.state"))
g.step(200)
check('in play', g.js("SMB.game.state") == 'play')
has_audio = g.js("SMB.Sound.has('overworld')")
print('audio files present:', has_audio)

def music():
    return g.js("(() => { const S = SMB.Sound; return { name: S.musicName, el: !!S.music, paused: S.music ? S.music.paused : null, muted: S.music ? S.music.muted : null }; })()")

g.pg.keyboard.press('m'); g.step(2)
check('M mutes', g.js("SMB.Sound.muted") is True)
g.js("SMB.game.time = 101; SMB.game.timeT = 0")
g.step(40)
import time
t0 = time.time()
while time.time() - t0 < 6 and not g.js("SMB.Sound.musicFast"):
    g.step(1); time.sleep(0.05)
m = music()
check('hurry-up jingle ends and fast music starts while muted', g.js("SMB.Sound.musicFast") is True and (m['el'] or not has_audio), m)
g.pg.keyboard.press('m'); g.step(2)
time.sleep(0.3)
m = music()
check('un-muting plays the current (fast) track', not g.js("SMB.Sound.muted") and (not has_audio or (m['el'] and m['paused'] is False and m['muted'] is False)), m)

g.pg.keyboard.press('m'); g.step(2)
g.js("(() => { const g = SMB.game, p = g.player; g.camX = 50*16; p.x = 57*16 + 10; p.y = 9*16 - p.h; p.vy = 0; })()"); g.step(2)
g.hold('down', frames=80); g.step(60)
check('took the pipe to the coin room', g.js("SMB.game.area.name") == 'coinroom', g.js("SMB.game.area.name"))
g.pg.keyboard.press('m'); g.step(2)
time.sleep(0.3)
m = music()
check('area music changed while muted plays after un-muting', m['name'] in ('underground', 'underground_fast') and (not has_audio or (m['el'] and m['paused'] is False)), m)

print('errors:', g.errors)
g.close()
print(sum(r[1] for r in results), '/', len(results), 'passed')
