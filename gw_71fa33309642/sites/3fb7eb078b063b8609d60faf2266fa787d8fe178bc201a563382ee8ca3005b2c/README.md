# Super Mario Bros. — Worlds 1 and 2, web recreation (game-developer)

A browser recreation of the 1985 NES *Super Mario Bros.*, Worlds 1 and 2 (1-1 … 2-4). 1-4 continues into 2-1, the
1-2 warp zone's World 2 pipe leads to 2-1, and clearing 2-4 ends the game. Plain HTML5 Canvas + JavaScript:
no build step, no server, no network at play time.

## Start the game

- **Double-click `index.html`** (opens from `file://` in Chrome / Firefox / Edge), or
- serve the folder with any static server, e.g. `python3 -m http.server 8000` and open http://localhost:8000/.

## Controls

| NES | Keyboard |
|---|---|
| D-pad | Arrow keys (or WASD) — Down = crouch / enter pipe; Up/Down = climb a vine |
| B (run, fireball) | `Z`, `J` or Shift |
| A (jump, swim stroke) | `X`, `K` or Space — under water each press is a stroke; press it while a jumpspring is squeezed for the high jump |
| Start (start / pause) | Enter (or `P`) |
| mute | `M` |

## Layout

- `index.html` — page and script order.
- `src/` — engine (`game.js` state machine, `player.js`, `enemies.js`, `items.js`, `physics.js`, `level.js`;
  `world1.js` adds lifts, firebars, podoboos, Bowser, the bridge/axe ending, lava and the warp zone; `world2.js` adds
  the vine and coin heaven, the jumpspring, Blooper, Cheep-cheeps and their frenzies, air bubbles; swimming and
  climbing are in `player.js`), level data in `src/levels/`.
- `assets/` — art and audio, supplied by the `artist` position (contract: `docs/assets.md`). Missing files are drawn
  as placeholder boxes and listed in the browser console as `[assets] missing: …`.
- `tests/` and `tools/` — developer files, not needed to play (the game is `index.html`, `src/` and `assets/`).
  `tests/` holds headless-Chromium checks, run from the repository root (need `pip install playwright` +
  `python3 -m playwright install chromium`):
  - `tests/mechanics.py`, `tests/mechanics2.py` — 1-1 rules (movement, blocks, power-ups, enemies, pipes, flag, lives, timer);
  - `tests/sound_input.py` — a key tap shorter than a frame still counts; mute keeps music changes (hurry-up, pipes);
  - `tests/mechanics3.py` — castle mechanics on a test level (lava, firebar, lift, Bowser's fire, axe → bridge → Toad);
  - `tests/levels.py` — 1-2..1-4 on the real level data (pipes, warp zone, level ends, lifts incl. riding the rising
    1-3 lift, firebars, Bowser, axe, Toad), 1-4 → 2-1, the warp to 2-1 and the `#level=` fallback;
  - `tests/world2.py` — 2-1..2-4 on the real level data: swimming (stroke, surface, speed), Bloopers, the Cheep-cheep
    frenzy, the 2-2 exit pipe and flag, the vine → coin heaven → cloud lift → fall back, the jumpspring (normal and
    high jump over the column), the coin room, flying Cheep-cheeps (and stomping one), podoboos, firebars, lifts,
    Bowser, axe, Toad and the World 2 end screen;
  - `tests/bot.py [level] [outdir]` — a scripted player that runs a level to the flag (`SMB_ROOT=<dir>` to play a
    packaged build with the real assets; `SMB_GOD=1` keeps Mario invincible to check the terrain alone).
- `tools/gen_levels.py` writes `src/levels/w1_2.js`…`w1_4.js` and `w2_1.js`…`w2_4.js` from `tools/levels_w1.json` and
  `tools/levels_w2.json` (`tools/levels_w2.txt` is a readable dump), the layouts decoded from the original game's level
  data (tile layout and object positions only; no graphics, sound or code are taken from it).
- `tools/package.sh <name>` — zip the assembled delivery (game + artist assets) into `dist/<name>.zip`.

Developer shortcut: `index.html#level=1-2` (or `2-1`, `2-2`, `2-3`, `2-4`, …) starts a new game at another level.
