# Assets the game loads

The loader is `src/assets.js`; drawing is in `src/game.js`. The `assets/` directory is supplied by
`artist` (its own notes: `docs/assets.md` in `world/artist`). Every file is **optional**: a missing
file falls back to the game's drawn shapes (or silence), so the game always runs. Paths are
relative to the game root (`index.html`).

Grid: 20 × 20 cells of **32 × 32 px**; play area 640 × 640 px under a 48 px score bar
(canvas 640 × 688). Images are drawn with smoothing off; a cell sprite of any square size is
scaled to the cell.

## Images (PNG)

| File | Size | How the game uses it |
|---|---|---|
| `assets/img/head_up.png`, `head_down.png`, `head_left.png`, `head_right.png` | 32×32 | Snake head, picked by the direction the head moved. |
| `assets/img/head.png` | 32×32 | Optional alternative to the four heads: one head facing right, rotated by the game. |
| `assets/img/body.png` | 32×32 | Body segments. Drawn unrotated if it is symmetric; rotated 90° on vertical straight runs. Also the tail when `tail.png` is absent. |
| `assets/img/body_turn.png` | 32×32 | Optional corner piece connecting the right and bottom edges; rotated for the other corners. Without it, corners use `body.png`. |
| `assets/img/tail.png` | 32×32 | Optional tail tip, body continuing to the right; rotated by the game. |
| `assets/img/food.png` | 32×32 | Food. |
| `assets/img/bg_tile_pair.png` | 64×32 | Checkerboard floor: left half on even cells (x+y even), right half on odd cells. Takes precedence over `bg_tile.png`. |
| `assets/img/bg_tile.png` | 32×32 | Floor tile for every cell when there is no pair. |
| `assets/img/title_logo.png` | 480×140 | Title-screen logo, scaled to fit 560×160 and centred near the top of the board, over a dark veil (rgba(8,10,16,.85)). |
| `assets/img/gameover_panel.png` | 360×200 | Game-over panel drawn at its own size, centred; the game writes "Final score: N" at 62 % and the best score at 84 % of its height (its empty lower half), and the play-again prompt below it. |

The score bar, instructions and prompts are drawn by the game in system-ui text
(text #f2f5f8, secondary #9aa6b8, page #10141c).

## Sounds (`assets/audio/<name>.wav`, or `.ogg` / `.mp3`)

| Name | When it plays |
|---|---|
| `eat` | The snake eats food (can repeat every ~70–130 ms at speed). |
| `gameover` | The game ends. |
| `start` | A game starts (from the title or play again). |
| `turn` | Optional: each accepted turn. |
| `music` | Optional: loop during play at volume 0.35; stops on pause and game over. |

`M` toggles sound. Browsers start audio only after the first key press or click, which starting a
game requires anyway.
