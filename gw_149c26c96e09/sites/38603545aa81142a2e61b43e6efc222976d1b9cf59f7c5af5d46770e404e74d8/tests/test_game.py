"""Plays the real page in headless Chromium and checks every rule of the objective.

Run: python3 tests/test_game.py   (serves the repository root itself; exits non-zero on failure)
Optional: SNAKE_URL=<url> to test a deployed copy, SHOTS=<dir> to keep screenshots.
"""
import functools, http.server, os, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.environ.get("SHOTS")
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  ({detail})" if detail else ""))


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/index.html"


def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, name + ".png"))


def visible(page, sel):
    return page.is_visible(sel)


def main():
    srv = None
    url = os.environ.get("SNAKE_URL")
    if not url:
        srv, url = serve()
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 800, "height": 700})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(url)
        page.wait_for_function("window.SnakeGame !== undefined")
        page.wait_for_timeout(500)
        G = "window.SnakeGame.game"

        # Title screen
        check("title screen shown on load", visible(page, "#title-screen") and page.evaluate(f"{G}.state") == "title")
        check("HUD hidden on title", not page.evaluate("document.getElementById('hud').hidden === false"))
        shot(page, "01-title")

        # Start with Enter; real-time movement on the grid
        page.keyboard.press("Enter")
        check("Enter starts the game", page.evaluate(f"{G}.state") == "playing" and not visible(page, "#title-screen"))
        check("score shown during play", visible(page, "#score") and page.inner_text("#score") == "0")
        page.evaluate(f"window.SnakeGame.setFood(0, 0)")  # keep food out of the way
        h0 = page.evaluate(f"{G}.snake[0]")
        page.wait_for_timeout(600)
        h1 = page.evaluate(f"{G}.snake[0]")
        check("snake moves right one cell per step on its own", h1["y"] == h0["y"] and h1["x"] > h0["x"], f"{h0} -> {h1}")
        shot(page, "02-playing")

        # Switch to manual stepping for deterministic checks
        page.evaluate(f"{G}.auto = false")

        def step(n=1):
            for _ in range(n):
                page.evaluate("window.SnakeGame.step()")

        def head():
            return page.evaluate(f"{G}.snake[0]")

        page.evaluate("window.SnakeGame.setSnake([{x:10,y:10},{x:9,y:10},{x:8,y:10}], 'ArrowRight')")
        page.keyboard.press("ArrowUp"); step()
        check("ArrowUp turns up", head() == {"x": 10, "y": 9}, str(head()))
        page.keyboard.press("ArrowLeft"); step()
        check("ArrowLeft turns left", head() == {"x": 9, "y": 9}, str(head()))
        page.keyboard.press("ArrowDown"); step()
        check("ArrowDown turns down", head() == {"x": 9, "y": 10}, str(head()))
        page.keyboard.press("ArrowRight"); step()
        check("ArrowRight turns right", head() == {"x": 10, "y": 10}, str(head()))
        page.keyboard.press("ArrowLeft"); step()
        check("reversing into the body is ignored", head() == {"x": 11, "y": 10}, str(head()))
        check("length unchanged without food", page.evaluate(f"{G}.snake.length") == 3)

        # Eating grows by one and scores one
        page.evaluate("window.SnakeGame.setSnake([{x:5,y:5},{x:4,y:5},{x:3,y:5}], 'ArrowRight')")
        page.evaluate(f"{G}.score = 0")
        page.evaluate("window.SnakeGame.setFood(6, 5)")
        step()
        check("eating grows the snake by exactly one cell", page.evaluate(f"{G}.snake.length") == 4)
        check("eating adds one point", page.evaluate(f"{G}.score") == 1)
        check("HUD score updates", page.inner_text("#score") == "1")
        f = page.evaluate(f"{G}.food")
        snake = page.evaluate(f"{G}.snake")
        check("new food appears on a free cell", f is not None and f not in snake, str(f))
        page.evaluate("window.SnakeGame.setFood(0, 19)")
        step()
        check("length stays after moving on", page.evaluate(f"{G}.snake.length") == 4)
        shot(page, "03-after-eating")

        # Wall collision ends the game
        page.evaluate("window.SnakeGame.setSnake([{x:19,y:3},{x:18,y:3},{x:17,y:3}], 'ArrowRight')")
        step()
        check("hitting the wall ends the game", page.evaluate(f"{G}.state") == "over" and page.evaluate(f"{G}.deathCause") == "wall")
        check("game-over screen shown", visible(page, "#gameover-screen"))
        check("final score shown", page.inner_text("#final-score") == "1", page.inner_text("#final-score"))
        shot(page, "04-gameover-wall")

        # Play again with click
        page.click("#restart-button")
        check("Play again button restarts", page.evaluate(f"{G}.state") == "playing" and page.evaluate(f"{G}.score") == 0
              and page.evaluate(f"{G}.snake.length") == 3 and not visible(page, "#gameover-screen"))
        page.evaluate(f"{G}.auto = false")

        # Self collision ends the game
        page.evaluate("window.SnakeGame.setSnake([{x:5,y:5},{x:6,y:5},{x:6,y:6},{x:5,y:6},{x:4,y:6},{x:4,y:5}], 'ArrowUp')")
        page.evaluate("window.SnakeGame.setFood(0, 0)")
        page.keyboard.press("ArrowRight"); step()
        check("running into itself ends the game", page.evaluate(f"{G}.state") == "over" and page.evaluate(f"{G}.deathCause") == "self")
        shot(page, "05-gameover-self")

        # Following the tail is not a collision
        page.keyboard.press("Enter")
        page.evaluate(f"{G}.auto = false")
        page.evaluate("window.SnakeGame.setSnake([{x:5,y:5},{x:5,y:6},{x:6,y:6},{x:6,y:5}], 'ArrowUp')")
        page.evaluate("window.SnakeGame.setFood(0, 0)")
        page.keyboard.press("ArrowRight"); step()
        check("Enter plays again from game over", page.evaluate(f"{G}.state") == "playing")
        check("moving into the cell the tail leaves is allowed", head() == {"x": 6, "y": 5})

        # Real-time play: snake runs into the wall on its own
        page.evaluate(f"{G}.auto = true")
        page.wait_for_function(f"{G}.state === 'over'", timeout=10000)
        check("real-time play reaches game over at the wall", page.evaluate(f"{G}.deathCause") == "wall")

        check("no page errors", not errors, "; ".join(errors))
        browser.close()
    if srv:
        srv.shutdown()
    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
