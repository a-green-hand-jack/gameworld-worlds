# Super Mario Bros. — World 1, web recreation (game-developer)

A browser recreation of the 1985 NES *Super Mario Bros.*, World 1. Plain HTML5 Canvas + JavaScript:
no build step, no server, no network at play time.

## Start the game

- **Double-click `index.html`** (opens from `file://` in Chrome / Firefox / Edge), or
- serve the folder with any static server, e.g. `python3 -m http.server 8000` and open http://localhost:8000/.

## Controls

| NES | Keyboard |
|---|---|
| D-pad | Arrow keys (or WASD) — Down = crouch / enter pipe |
| B (run, fireball) | `Z`, `J` or Shift |
| A (jump) | `X`, `K` or Space |
| Start (start / pause) | Enter (or `P`) |
| mute | `M` |

## Layout

- `index.html` — page and script order.
- `src/` — engine (`game.js` state machine, `player.js`, `enemies.js`, `items.js`, `physics.js`, `level.js`),
  level data in `src/levels/`.
- `assets/` — art and audio, supplied by the `artist` position (contract: `docs/assets.md`). Missing files are drawn
  as placeholder boxes and listed in the browser console as `[assets] missing: …`.
- `tests/` — headless-Chromium checks (`python3 tests/mechanics.py`, needs `pip install playwright` +
  `python3 -m playwright install chromium`).

Developer shortcut: `index.html#level=1-2` starts a new game at another level.
