# Snake

A browser Snake game: steer with the arrow keys, eat food to grow one cell and score a point,
and avoid the walls and your own body.

## Start it

No build step and no install. Either

- open `index.html` in a browser (Chrome, Firefox, Edge, Safari), or
- serve the folder and open the page: `python3 -m http.server 8000` then http://localhost:8000/

## Controls

| Key | Action |
|---|---|
| Enter / Space / click (or an arrow key) | Start from the title screen |
| Arrow keys | Turn (reversing straight back is ignored; two quick turns are buffered) |
| P / Esc | Pause and resume (the game also pauses when the window loses focus) |
| Enter / Space / R / click | Play again from the game-over screen |
| M | Sound on/off |

The score is shown in the bar above the board during play, with the best score (kept in the
browser's local storage). The snake speeds up a little with every point.

## Layout

- `index.html`, `src/` — the game (`logic.js` rules, `game.js` screens/input/drawing, `assets.js` loader)
- `assets/` — sprites and sounds from the artist; see `docs/assets.md` for what the game loads
- `tests/test_game.py` — headless Chromium check of every rule (`python3 tests/test_game.py [GAME_DIR]`, needs Playwright); screenshots of the last run with the artist's assets in `tests/shots/`
