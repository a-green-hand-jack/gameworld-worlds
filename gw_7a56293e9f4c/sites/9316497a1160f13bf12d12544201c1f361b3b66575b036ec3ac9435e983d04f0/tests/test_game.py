"""Headless check of Snake: drives index.html in Chromium and asserts each rule.

Usage: python3 tests/test_game.py [GAME_DIR] [SHOT_DIR]
GAME_DIR defaults to the repository root; screenshots go to SHOT_DIR (default tests/shots).
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).parent.parent).resolve()
shots = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else pathlib.Path(__file__).parent / "shots")
shots.mkdir(parents=True, exist_ok=True)
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f" ({detail})" if detail else ""))


def js(page, expr):
    return page.evaluate(expr)


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 800, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto((root / "index.html").as_uri())
    page.wait_for_function("window.__snake !== undefined")
    page.wait_for_timeout(1700)
    loaded = js(page, "window.__snake.assets.loaded")
    print("assets loaded:", loaded)

    check("title screen first", js(page, "__snake.state") == "title")
    page.screenshot(path=str(shots / "1-title.png"))

    page.keyboard.press("Enter")
    check("Enter starts play", js(page, "__snake.state") == "playing")
    js(page, "__snake.setAuto(false)")
    js(page, "__snake.game.reset()")
    g = js(page, "({s: __snake.game.snake, score: __snake.game.score})")
    check("starts with length 3 and score 0", len(g["s"]) == 3 and g["score"] == 0)

    # Movement: one tick moves the head one cell right, length unchanged.
    js(page, "__snake.game.food = {x: 0, y: 0}")
    h0 = js(page, "__snake.game.snake[0]")
    js(page, "__snake.tick()")
    h1 = js(page, "__snake.game.snake[0]")
    check("moves one cell per tick", h1 == {"x": h0["x"] + 1, "y": h0["y"]}, f"{h0}->{h1}")

    # Arrow keys turn; reversing is ignored.
    page.keyboard.press("ArrowLeft")
    js(page, "__snake.tick()")
    h2 = js(page, "__snake.game.snake[0]")
    check("reverse (ArrowLeft while moving right) ignored", h2["x"] == h1["x"] + 1 and h2["y"] == h1["y"])
    page.keyboard.press("ArrowDown")
    js(page, "__snake.tick()")
    h3 = js(page, "__snake.game.snake[0]")
    check("ArrowDown turns down", h3 == {"x": h2["x"], "y": h2["y"] + 1})
    page.keyboard.press("ArrowLeft")
    js(page, "__snake.tick()")
    h4 = js(page, "__snake.game.snake[0]")
    check("ArrowLeft turns left", h4 == {"x": h3["x"] - 1, "y": h3["y"]})
    page.keyboard.press("ArrowUp")
    js(page, "__snake.tick()")
    h5 = js(page, "__snake.game.snake[0]")
    check("ArrowUp turns up", h5 == {"x": h4["x"], "y": h4["y"] - 1})
    page.keyboard.press("ArrowRight")
    js(page, "__snake.tick()")
    h6 = js(page, "__snake.game.snake[0]")
    check("ArrowRight turns right", h6 == {"x": h5["x"] + 1, "y": h5["y"]})

    # Eating: food in front -> +1 length, +1 score, new food not on snake.
    n0 = js(page, "__snake.game.snake.length")
    js(page, "__snake.game.food = {x: __snake.game.snake[0].x + 1, y: __snake.game.snake[0].y}")
    js(page, "__snake.tick()")
    st = js(page, "({n: __snake.game.snake.length, score: __snake.game.score, f: __snake.game.food, s: __snake.game.snake})")
    check("eating grows by one cell", st["n"] == n0 + 1, f"{n0}->{st['n']}")
    check("eating adds one point", st["score"] == 1)
    check("new food placed off the snake", st["f"] is not None and st["f"] not in st["s"])
    js(page, "__snake.tick()")
    check("length stays after moving on", js(page, "__snake.game.snake.length") == n0 + 1)
    page.screenshot(path=str(shots / "2-play.png"))

    # Wall: run right until the wall.
    js(page, "__snake.game.food = {x: 0, y: 0}")
    for _ in range(25):
        if js(page, "__snake.state") != "playing":
            break
        js(page, "__snake.tick()")
    check("hitting the wall ends the game", js(page, "__snake.state") == "over" and js(page, "__snake.game.cause") == "wall")
    page.wait_for_timeout(600)
    page.screenshot(path=str(shots / "3-gameover-wall.png"))
    check("final score kept on game over", js(page, "__snake.game.score") == 1)
    check("best score recorded", js(page, "__snake.best") >= 1)

    # Play again with Enter.
    page.keyboard.press("Enter")
    check("Enter plays again", js(page, "__snake.state") == "playing")
    js(page, "__snake.setAuto(false)")
    st = js(page, "({n: __snake.game.snake.length, score: __snake.game.score})")
    check("play again resets snake and score", st == {"n": 3, "score": 0})

    # Self collision: build a length-5 snake and curl into it.
    js(page, """(() => { const g = __snake.game;
        g.snake = [{x:10,y:10},{x:9,y:10},{x:8,y:10},{x:7,y:10},{x:6,y:10}];
        g.dir = 'right'; g.queue = []; g.food = {x: 0, y: 0}; })()""")
    for k in ["ArrowDown", "ArrowLeft", "ArrowUp"]:
        page.keyboard.press(k)
        js(page, "__snake.tick()")
    check("running into itself ends the game", js(page, "__snake.state") == "over" and js(page, "__snake.game.cause") == "self")
    page.wait_for_timeout(600)
    page.screenshot(path=str(shots / "4-gameover-self.png"))

    # Following the tail into its vacated cell is legal.
    page.locator("#game").click()
    check("click plays again", js(page, "__snake.state") == "playing")
    js(page, "__snake.setAuto(false)")
    js(page, """(() => { const g = __snake.game;
        g.snake = [{x:10,y:10},{x:10,y:11},{x:9,y:11},{x:9,y:10}];
        g.dir = 'up'; g.queue = []; g.food = {x: 0, y: 0}; })()""")
    page.keyboard.press("ArrowLeft")
    js(page, "__snake.tick()")
    check("head may enter the cell the tail is leaving", js(page, "__snake.state") == "playing")

    # Real-time play: with the timer running, the snake advances on its own.
    js(page, "__snake.game.reset(); __snake.setAuto(true)")
    hx = js(page, "__snake.game.snake[0].x")
    page.wait_for_timeout(700)
    check("snake advances in real time", js(page, "__snake.game.snake[0].x") > hx)

    check("no page errors", not errors, "; ".join(errors))
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
