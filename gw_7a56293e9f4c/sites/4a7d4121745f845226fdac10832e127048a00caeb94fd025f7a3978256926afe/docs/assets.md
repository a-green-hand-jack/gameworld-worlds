# Assets the game loads

The loader is `src/assets.js`; drawing is in `src/game.js`. The `assets/` directory is supplied by
`artist` (its own notes: `docs/assets.md` in `world/artist`). Every file is **optional**: a missing
file falls back to the game's drawn shapes (or silence), so the game always runs. Paths are
relative to the game root (`index.html`).

Grid: 20 × 20 cells of **32 × 32 px**; play area 640 × 640 px under a 48 px score bar
(canvas 640 × 688). Images are drawn with smoothing off; a cell sprite of any square size is
scaled to the cell.

## Images (PNG)

The game requests exactly these files (the list is `IMAGES`/`SOUNDS` in `src/assets.js`); it does
not probe for others, so the browser console stays free of 404s. To add a sprite, tell
`game-developer` its name and it is added to the list.

| File | Size | How the game uses it |
|---|---|---|
| `assets/img/head_up.png`, `head_down.png`, `head_left.png`, `head_right.png` | 32×32 | Snake head, picked by the direction the head moved. |
| `assets/img/body.png` | 32×32 | Every body segment and the tail. Rotated 90° on vertical straight runs; corners and the tail use it unrotated. |
| `assets/img/food.png` | 32×32 | Food. |
| `assets/img/bg_tile_pair.png` | 64×32 | Checkerboard floor: left half on even cells (x+y even), right half on odd cells. |
| `assets/img/title_logo.png` | 480×140 | Title-screen logo, scaled to fit 560×160 and centred near the top of the board, over a dark veil (rgba(8,10,16,.85)). |
| `assets/img/gameover_panel.png` | 360×200 | Game-over panel drawn at its own size, centred; the game writes "Final score: N" at 62 % and the best score at 84 % of its height (its empty lower half), and the play-again prompt below it. |

Supported by the drawing code but not requested until the artist supplies them: a single
`head.png` facing right (rotated), `body_turn.png` (corner joining the right and bottom edges,
rotated), `tail.png` (body continuing to the right, rotated), `bg_tile.png` (a single floor tile).

The score bar, instructions and prompts are drawn by the game in system-ui text
(text #f2f5f8, secondary #9aa6b8, page #10141c).

## Sounds

| File | When it plays |
|---|---|
| `assets/audio/eat.wav` | The snake eats food (can repeat every ~70–130 ms at speed). |
| `assets/audio/gameover.wav` | The game ends. |
| `assets/audio/start.wav` | A game starts (from the title or play again). |

`M` toggles sound. Browsers start audio only after the first key press or click, which starting a
game requires anyway. Optional `turn` and `music` sounds are supported by the code if supplied.
