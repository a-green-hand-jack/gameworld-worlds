# Testing the Snake build

## Start it

The entry point is `index.html` at the root of the delivery (`ht-role delivery --into DIR`, or the
zip of a release of `world/game-developer`). It is a static page with no build step:

- open it as a file: `file:///…/index.html`, or
- serve the folder: `python3 -m http.server 8000` in the delivery root, then `http://localhost:8000/`.

`assets/` (from `artist`) is optional at runtime: missing files fall back to drawn shapes.

## URL parameters

| Parameter | Effect |
|---|---|
| `?speed=<ms>` | Fixed tick length in milliseconds (minimum 10), e.g. `index.html?speed=30`. Without it a tick is 130 ms, 2 ms shorter per point, never below 70 ms. |

## Read-only state: `window.__snake`

| Property | Value |
|---|---|
| `state` | `'title'`, `'playing'`, `'paused'` or `'over'` (the game-over screen) |
| `score` | current score; on the game-over screen, the final score |
| `best` | best score (kept in `localStorage` key `snake.best`) |
| `snake` | copy of the cells, head first: `[{x, y}, …]`, `x` 0…cols-1 left→right, `y` 0…rows-1 top→bottom |
| `food` | `{x, y}` of the food (null only if the board is full) |
| `grid` | `{cols: 20, rows: 20, cell: 32}` (cell size in canvas pixels) |
| `interval` | current tick length in ms |
| `game` | the live rules object (`src/logic.js`): `dir`, `queue`, `over`, `won`, `cause` (`'wall'`, `'self'` or `'full'`), and the methods below |
| `assets` | loader: `loaded` and `missing` file lists |

The canvas `#game` also carries `data-state` and `data-score` with the same values, updated
every frame.

## Driving the game by hand (optional, mutates state)

- `__snake.setAuto(false)` stops the timer; `__snake.tick()` then advances exactly one cell.
  `__snake.setAuto(true)` resumes real-time play.
- `__snake.game.food = {x, y}` places the food; `__snake.game.snake = [...]` and
  `__snake.game.dir = 'up'|'down'|'left'|'right'` set up a position (use with care).
- Key presses go to `window` (`keydown`), so `page.keyboard.press('ArrowUp')` works without
  focusing anything.

## Controls

Enter / Space / click (or an arrow key) start from the title; arrow keys turn (straight back is
ignored, at most two turns are buffered); P / Esc pause; Enter / Space / R / click play again
(accepted 400 ms after the game ends); M toggles sound. Arrow keys and Space never scroll the page.

## Existing check

`tests/test_game.py [GAME_DIR] [SHOT_DIR]` (Playwright for Python) runs 23 checks of the rules and
screens; screenshots of the last run are in `tests/shots/`.
