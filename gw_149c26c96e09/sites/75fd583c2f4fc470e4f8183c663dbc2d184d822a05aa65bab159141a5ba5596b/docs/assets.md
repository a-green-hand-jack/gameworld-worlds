# Assets the game loads

The game reads everything below from `assets/` at the delivery root (the artist's path).
Every file is optional: when one is missing the game draws a plain fallback or stays silent,
so a delivery always runs. Loader: `src/assets.js`; drawing: `src/game.js`.

The field is a 20 x 20 grid inside a one-cell wall ring, so 22 x 22 cells are drawn. The canvas is
704 px (32 px per cell, so 32 px art is drawn 1:1) and is shown at up to 528 CSS px, with
pixel-art rendering (no smoothing).

## Images (PNG with transparency)

| File | Size | What it is | How the game uses it |
|---|---|---|---|
| `assets/images/snake-head.png` | 32 x 32 (any square size works) | Snake head **facing right** | Rotated to the travel direction (up/down/left) |
| `assets/images/snake-body.png` | 32 x 32 | One body segment, drawn for a snake moving right (left-right symmetric is best) | Rotated to each segment's direction; also used for the tail if there is no tail image |
| `assets/images/snake-tail.png` | 32 x 32 | Tail tip for a snake moving right: tip on the left edge, joining the body on the right edge | Rotated like the body |
| `assets/images/food.png` | 32 x 32 | The food the snake eats | Drawn unrotated in its cell |
| `assets/images/board-tile.png` | 32 x 32 | One opaque board cell (grass, floor...) | Tiled across all 400 cells; replaces the drawn checkerboard |
| `assets/images/title-logo.png` | up to 512 x 256 | Title-screen logo / wordmark "SNAKE" | Replaces the text title on the title screen |

## Sounds (`.ogg`, `.mp3` or `.wav`; the game tries them in that order)

| File (base name) | Length | When it plays |
|---|---|---|
| `assets/audio/start` | < 1 s | A game starts (Start / Play again) |
| `assets/audio/eat` | < 0.3 s | The snake eats food (may play every second, keep it short and soft) |
| `assets/audio/gameover` | < 2 s | The snake hits a wall or itself |
| `assets/audio/music` | any, loops | Background loop during play (volume 0.4), paused on pause and game over |

M mutes all sound.

## Colours: `assets/theme.css` (optional)

Linked after `src/style.css`, so it can override these CSS variables on `:root`, used by both the
page and the drawn fallbacks:

```css
:root {
  --bg: #10141c;      /* page background */
  --board: #18202c;   /* board cell (fallback) */
  --grid: #1e2836;    /* alternate board cell (fallback) and board outline */
  --text: #e8edf4;    /* text */
  --muted: #8a97a8;   /* hints */
  --accent: #6bd36b;  /* title, score, buttons, fallback snake head */
  --danger: #e85d5d;  /* "Game Over", fallback food */
}
```

