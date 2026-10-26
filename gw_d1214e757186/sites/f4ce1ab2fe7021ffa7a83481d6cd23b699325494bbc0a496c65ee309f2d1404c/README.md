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
- `src/` — engine (`game.js` state machine, `player.js`, `enemies.js`, `items.js`, `physics.js`, `level.js`;
  `world1.js` adds lifts, firebars, Bowser, the bridge/axe ending, lava and the warp zone), level data in `src/levels/`.
- `assets/` — art and audio, supplied by the `artist` position (contract: `docs/assets.md`). Missing files are drawn
  as placeholder boxes and listed in the browser console as `[assets] missing: …`.
- `tests/` and `tools/` — developer files, not needed to play (the game is `index.html`, `src/` and `assets/`).
  `tests/` holds headless-Chromium checks, run from the repository root (need `pip install playwright` +
  `python3 -m playwright install chromium`):
  - `tests/mechanics.py`, `tests/mechanics2.py` — 1-1 rules (movement, blocks, power-ups, enemies, pipes, flag, lives, timer);
  - `tests/sound_input.py` — a key tap shorter than a frame still counts; mute keeps music changes (hurry-up, pipes);
  - `tests/mechanics3.py` — castle mechanics on a test level (lava, firebar, lift, Bowser's fire, axe → bridge → Toad);
  - `tests/levels.py` — 1-2..1-4 on the real level data (pipes, warp zone, level ends, lifts incl. riding the rising
    1-3 lift, firebars, Bowser, axe, Toad) and the `#level=` fallback;
  - `tests/bot.py [level] [outdir]` — a scripted player that runs a level to the flag (`SMB_ROOT=<dir>` to play a
    packaged build with the real assets; `SMB_GOD=1` keeps Mario invincible to check the terrain alone).
- `tools/gen_levels.py` writes `src/levels/w1_2.js`…`w1_4.js` from `tools/levels_w1.json`, the World 1 layouts
  transcribed from the original game's level maps (tile layout only; no graphics, sound or code are taken from it).
- `tools/package.sh <name>` — zip the assembled delivery (game + artist assets) into `dist/<name>.zip`.

Developer shortcut: `index.html#level=1-2` starts a new game at another level.
