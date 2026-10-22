# Snake

A browser Snake game: steer with the arrow keys, eat food to grow one cell and score a point,
and don't hit the walls or yourself.

## Start it

No build step and no network needed. Either:

- open `index.html` in a browser (double-click works), or
- serve the folder and open it: `python3 -m http.server 8000` then http://localhost:8000/

## Controls

- Title screen / game over: **Enter** or **Space**, or click **Start** / **Play again** (game over accepts it after half a second, so the final score is seen)
- Arrow keys: turn (the snake cannot reverse straight into itself)
- **P** or **Esc**: pause / resume (the game also pauses when the window loses focus)
- **M**: sound on/off

## Layout

- `index.html`, `src/` — the game (plain HTML5 canvas + JavaScript)
- `assets/` — art and sound from the artist; see `docs/assets.md` for what is loaded
- `tests/test_game.py` — plays the real page in headless Chromium (Playwright) and checks every rule:
  `python3 tests/test_game.py` (or `SNAKE_URL=file:///path/to/index.html python3 tests/test_game.py`)
