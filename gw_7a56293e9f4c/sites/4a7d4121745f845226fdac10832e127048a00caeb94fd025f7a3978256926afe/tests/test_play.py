"""Real-time play with the keyboard only: title -> eat several foods -> die on a wall -> replay.

Reads window.__snake but never changes game state; steering is done with arrow-key presses.
Usage: python3 tests/test_play.py [GAME_DIR] [SHOT_DIR]
"""
import pathlib
import sys
import time

from playwright.sync_api import sync_playwright

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).parent.parent).resolve()
shots = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else pathlib.Path(__file__).parent / "shots")
shots.mkdir(parents=True, exist_ok=True)
TARGET = 5
OPP = {"up": "down", "down": "up", "left": "right", "right": "left"}
KEY = {"up": "ArrowUp", "down": "ArrowDown", "left": "ArrowLeft", "right": "ArrowRight"}
DELTA = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}


def choose(s):
    """Greedy step toward the food that does not hit a wall or the body."""
    head, food, cols, rows = s["snake"][0], s["food"], s["grid"]["cols"], s["grid"]["rows"]
    body = {(c["x"], c["y"]) for c in s["snake"][:-1]}
    cur = s["dir"]
    options = []
    for d, (dx, dy) in DELTA.items():
        if d == OPP[cur]:
            continue
        nx, ny = head["x"] + dx, head["y"] + dy
        if not (0 <= nx < cols and 0 <= ny < rows) or (nx, ny) in body:
            continue
        options.append((abs(nx - food["x"]) + abs(ny - food["y"]), d != cur, d))
    return min(options)[2] if options else cur


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 800, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto((root / "index.html").as_uri() + "?speed=90")
    page.wait_for_function("window.__snake !== undefined")
    page.wait_for_timeout(1700)
    assert page.evaluate("__snake.state") == "title"
    page.keyboard.press("Space")
    read = "({snake: __snake.snake, food: __snake.food, grid: __snake.grid, dir: __snake.game.dir, " \
           "q: __snake.game.queue.length, state: __snake.state, score: __snake.score})"
    lengths = []
    deadline = time.time() + 60
    while time.time() < deadline:
        s = page.evaluate(read)
        if s["state"] != "playing" or s["score"] >= TARGET:
            break
        if s["q"] == 0:
            d = choose(s)
            if d != s["dir"]:
                page.keyboard.press(KEY[d])
        if not lengths or lengths[-1][0] != s["score"]:
            lengths.append((s["score"], len(s["snake"])))
        page.wait_for_timeout(15)
    s = page.evaluate(read)
    lengths.append((s["score"], len(s["snake"])))
    page.screenshot(path=str(shots / "5-realtime-play.png"))
    print("score/length seen:", lengths)
    ok_eat = s["score"] >= TARGET and all(n == 3 + sc for sc, n in lengths)
    print(("PASS" if ok_eat else "FAIL"), f"ate {s['score']} foods by keyboard, length = 3 + score throughout")

    # Steer into the nearest wall and wait for game over.
    for _ in range(200):
        s = page.evaluate(read)
        if s["state"] != "playing":
            break
        page.wait_for_timeout(30)
    s = page.evaluate(read)
    ok_wall = s["state"] == "over" and page.evaluate("__snake.game.cause") in ("wall", "self")
    print(("PASS" if ok_wall else "FAIL"), "game ends on collision, final score", s["score"], page.evaluate("__snake.game.cause"))
    page.wait_for_timeout(500)
    page.screenshot(path=str(shots / "6-realtime-over.png"))
    page.keyboard.press("Enter")
    page.wait_for_timeout(50)
    s = page.evaluate(read)
    ok_replay = s["state"] == "playing" and s["score"] == 0 and len(s["snake"]) == 3
    print(("PASS" if ok_replay else "FAIL"), "Enter replays with score 0 and length 3")
    print(("PASS" if not errors else "FAIL"), "no console errors", errors)
    browser.close()
sys.exit(0 if ok_eat and ok_wall and ok_replay and not errors else 1)
