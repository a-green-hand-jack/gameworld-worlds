"""Drive the game in headless Chromium from file:// with scripted input (?manual mode)."""
import json, os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class Game:
    def __init__(self, root=ROOT, hash_=''):
        self.p = sync_playwright().start()
        self.b = self.p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        self.pg = self.b.new_page(viewport={'width': 768, 'height': 720})
        self.errors = []
        self.console = []
        self.pg.on('pageerror', lambda e: self.errors.append(str(e)))
        self.pg.on('console', lambda m: self.console.append(m.type + ': ' + m.text))
        self.pg.goto('file://' + root + '/index.html?manual' + hash_)
        self.pg.wait_for_function('window.SMB && SMB.loaded', timeout=20000)

    def js(self, code):
        return self.pg.evaluate(code)

    def hold(self, *buttons, frames=1):
        for b in buttons: self.js(f"SMB.Input.set('{b}', true)")
        self.step(frames)
        for b in buttons: self.js(f"SMB.Input.set('{b}', false)")

    def press(self, b):
        self.hold(b, frames=1); self.step(1)

    def set(self, b, v):
        self.js(f"SMB.Input.set('{b}', {'true' if v else 'false'})")

    def step(self, n=1):
        self.js(f'SMB.step({n})')

    def state(self):
        return self.js("""(() => { const g = SMB.game, p = g.player;
          return {state: g.state, x: p && p.x, y: p && p.y, vx: p && p.vx, vy: p && p.vy, ground: p && p.onGround,
            power: p && p.power, score: g.score, coins: g.coins, lives: g.lives, time: g.time, camX: g.camX,
            area: g.area && g.area.name, level: g.levelId, enemies: g.enemies.length, dead: p && p.dead}; })()""")

    def shot(self, path):
        self.pg.locator('#screen').screenshot(path=path)

    def close(self):
        self.b.close(); self.p.stop()
