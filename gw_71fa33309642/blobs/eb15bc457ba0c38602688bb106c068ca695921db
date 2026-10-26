# assets/ — art and audio for the SMB1 web remake (owner: `artist`)

Everything here is an **original recreation made for this game** in the style of the 1985 NES
*Super Mario Bros.*: pixel art drawn from scratch as palette-letter grids, rendered with NES 2C02
palette colours, and chiptune audio synthesized by our own code. No ROM graphics, no recorded or
transcribed Nintendo audio.

File names, sizes and frame orders follow the build contract, `docs/assets.md` in
`world/game-developer`. The game loads these fixed names directly (no manifest), so a renamed file
is a missing file.

## How it is made (reproducible)

| part | generator (in this repo, not delivered) | regenerate |
|---|---|---|
| tiles, scenery, sprites, UI | `tools/gfx/export.py` (art in `tools/gfx/art_*.py`, `bowser.py`) | `python3 tools/gfx/export.py` |
| audio | `tools/audio/gen_audio.py` | `python3 tools/audio/gen_audio.py` |
| manifest.js | `tools/manifest.py` | `python3 tools/manifest.py` |

Review images (mock 1-1 / end-of-level / underground / treetop / castle screens built only from
these files) are written to `tools/gfx/check/`.

## Graphics

All PNG, 1 px = 1 NES pixel, RGBA with transparency. Draw at integer scale with smoothing off.
Characters face **right**. Animated files are horizontal strips of equal frames.

- `tiles/overworld/`: ground, brick, question (3-frame shimmer: show frame 0 for ~24 ticks, then
  1, 2, 1 for ~8 ticks each), used, block, pipe_tl/tr/l/r, pipe_side_* (mouth opens left), coin
  (3-frame shimmer), treetop_l/m/r, trunk, flag_ball, flag_pole.
- `tiles/underground/`: ground, brick, used, block, coin in the blue palette (others fall back).
- `tiles/water/` (2-2): seabed `ground` (also the 2-2 ledges), `coin` (3-frame shimmer), `coral_top` + `coral` (repeat the
  stalk downward), `water_top` (white wave crest on the top row of the water; the rest of the tile is the area
  blue `#5C94FC`). Names missing here fall back to `overworld` (pipes).
- `tiles/overworld/` World 2 additions: `cloud_block` (coin-heaven floor, solid), `rail` (railing on the
  row above the 2-3 bridge, no collision) and `bridge` (the walkable 2-3 bridge; 1-4's Bowser bridge is
  `tiles/castle/bridge`).
- `tiles/castle/`: grey ground, brick, block, coin, plus bridge, chain, axe (3 frames), lava_top, lava
  (chain, axe, lava_top and lava are also copied to `tiles/overworld/`, which the loader probes as fallback).
- `scenery/`: hill_large 80×35, hill_small 48×19, cloud_1-3 and bush_1-3 (same silhouettes),
  castle_small 80×80 (door 16 px wide at the bottom centre), castle_big 80×176 (end of 1-3, same tiles,
  three tiers, 2-tile doorway at the bottom centre), flag (hangs left of the pole), castle_flag;
  World 2 backdrop: tree_small 16×32, tree_large 16×48 (stand on the ground), fence 16×16.
- `sprites/`: Mario strips of 13 frames (stand, walk1-3, skid, jump, crouch/small death, climb1-2,
  swim1-3, throw). Slots 9-11 are real swim strokes (2-2); only `mario_fire.png` has a real throw
  pose in slot 12 (others repeat stand). Goomba (walk1, walk2,
  flat), goomba_ug, koopa/parakoopa green & red (16×24), shell green & red (shell, waking),
  piranha (open, closed), bowser 32×32 ×4 (walk1, walk2 closed mouth; walk1, walk2 open), bowser_fire (points left, its only direction)
  24×8 ×2, fireball 8×8 ×4 (rotation), fire_burst ×3, toad 16×24, mushroom, mushroom_1up,
  fire_flower ×4 and star ×4 (palette cycles, ~2 ticks per frame), coin_pop 8×16 ×4 (spin),
  brick_debris(_ug) 8×8, lift 8×8 (repeat to lift width).
  World 2: cheep_red / cheep_grey 16×16 ×2 (swim1, swim2), blooper 16×24 ×2 (0 stretched / gliding,
  1 squeezed / about to push), podoboo 16×16 ×1 (rising, head up; flip vertically when falling),
  jumpspring 16×32 ×3 (extended, half, squashed; bottom-aligned), vine 16×16 ×2 (0 leafy top, 1 stem,
  repeat 1 downward), lift_cloud 8×8 (coin-heaven cloud platform, repeat like lift),
  bubble 8×8 (air bubble Mario breathes out under water).
- `ui/`: font.png 41 glyphs of 8×8 in the order `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-x!c.`
  (`x` = ×, `c` = ©), coin_icon 8×8 ×3, cursor 8×8, title_logo 176×88.

Background colours: overworld sky and underwater `#5C94FC`, underground and castle `#000000`.

## Audio

`audio/<name>.ogg` and `audio/<name>.mp3` (same content), mono 44.1 kHz. Music files are exactly one
loop body, so `<audio loop>` repeats them seamlessly (prefer the .ogg; MP3 encoders add a few ms of
padding). `audio.json` (next to `audio/`) documents each sound's event and duration; the game does not read it.

World 2 adds `underwater` / `underwater_fast` (2-2 music, F-major waltz), `vine` (beanstalk sprouting) and `swim`
(one swim stroke). Coin heaven plays `overworld`, 2-4 plays `castle`.

## manifest.js

`manifest.js` sets `window.SMB_ASSET_FILES` to every loadable file here (paths relative to `assets/`), so the
game requests only files that exist. Regenerate it with `python3 tools/manifest.py` after adding or removing a file.
