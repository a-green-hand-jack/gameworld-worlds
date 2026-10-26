# Assets the game loads (contract between `game-developer` and `artist`)

The game is a static page (`index.html`) that must also work when opened straight from disk (`file://`).
It therefore loads **fixed file names** under `assets/` with `<img>` and `<audio>`; there is no manifest to fetch.
Any file that is missing is drawn/played as a plain placeholder (coloured box / silence) so the build keeps running,
and the browser console lists every missing file (`[assets] missing: ...`). Placeholders are never the final art.

**`assets/manifest.js` (please supply it):** a script that lists every file you deliver, paths relative to `assets/`:

```js
window.SMB_ASSET_FILES = [
  "tiles/overworld/ground.png", "sprites/mario_small.png", "audio/jump_small.ogg", /* ... */
];
```

With it the game requests only files that exist, so the console stays free of 404 errors (QA checks this). It also
lets the game pick whichever audio format you supplied. Without it the game probes every name and extension.

General rules

- PNG, transparent background (except tiles that are fully opaque), **native NES pixel size** (1 px = 1 NES pixel).
  The game renders at 256×240 and scales by an integer with nearest-neighbour, so draw at 1×, no anti-aliasing.
- Animations are **horizontal strips**: frame *n* is at x = n × frame width, y = 0, all frames the same size.
- Characters face **right**; the game mirrors them for left.
- Sprites are drawn with their bottom edge on the ground; the collision box is narrower than the frame
  (Mario ≈ 12 px wide), so leave the art centred in its frame.
- Original recreations in the SMB1 style (see `producer` brief), not ROM rips.

## Tiles — `assets/tiles/<theme>/` (16×16 each unless noted)

Themes: `overworld` (1-1, 1-3, outside parts), `underground` (1-2, 1-1 coin room), `castle` (1-4).
Every theme folder holds the same names; a name missing from `underground`/`castle` falls back to `overworld`.

| file | size | what |
|---|---|---|
| `ground.png` | 16×16 | floor block (castle: grey castle floor brick) |
| `brick.png` | 16×16 | breakable brick |
| `question.png` | 48×16 (3 frames) | `?` block shimmer cycle |
| `used.png` | 16×16 | block after being hit (empty) |
| `block.png` | 16×16 | solid stair / hard block |
| `pipe_tl.png` `pipe_tr.png` | 16×16 | vertical pipe mouth, left / right half |
| `pipe_l.png` `pipe_r.png` | 16×16 | vertical pipe body, left / right half |
| `pipe_side_mouth_t.png` `pipe_side_mouth_b.png` | 16×16 | sideways pipe mouth (opening faces left), top / bottom half |
| `pipe_side_body_t.png` `pipe_side_body_b.png` | 16×16 | sideways pipe body, top / bottom |
| `pipe_side_join_t.png` `pipe_side_join_b.png` | 16×16 | where the sideways pipe joins the vertical one, top / bottom |
| `coin.png` | 48×16 (3 frames) | floating coin shimmer (theme palette) |
| `treetop_l.png` `treetop_m.png` `treetop_r.png` | 16×16 | 1-3 treetop platform left edge / middle / right edge (overworld only) |
| `trunk.png` | 16×16 | 1-3 tree trunk under the treetop (overworld only) |
| `bridge.png` | 16×16 | 1-4 Bowser bridge segment (castle only) |
| `chain.png` | 16×16 | 1-4 chain holding the bridge (castle only) |
| `axe.png` | 48×16 (3 frames) | 1-4 axe (castle only) |
| `lava_top.png` `lava.png` | 16×16 | lava surface / lava fill (castle only) |
| `flag_ball.png` | 16×16 | ball on top of the flagpole |
| `flag_pole.png` | 16×16 | flagpole shaft segment (pole centred, 2 px wide) |

## Scenery — `assets/scenery/` (drawn behind everything, no collision)

| file | size | what |
|---|---|---|
| `hill_large.png` | 80×35 | big hill |
| `hill_small.png` | 48×19 | small hill |
| `cloud_1.png` `cloud_2.png` `cloud_3.png` | 32×24, 48×24, 64×24 | clouds 1/2/3 puffs wide |
| `bush_1.png` `bush_2.png` `bush_3.png` | 32×16, 48×16, 64×16 | bushes (same shape as clouds, green) |
| `castle_small.png` | 80×80 | the end-of-level castle (door at bottom centre, 16 px wide) |
| `castle_big.png` | 80×176 | the large castle at the end of 1-3 (5 tiles wide, 11 tall: drawn at rows 2–12, standing on the ground at row 13; door at bottom centre, 16 px wide; the castle flag rises from its top centre). Optional: until it exists the game draws a brick block plus `castle_small.png` |
| `castle_flag.png` | 16×16 | the star flag raised on the castle after the course clear |
| `flag.png` | 16×16 | the flag on the flagpole (hangs to the left of the pole) |

## Sprites — `assets/sprites/`

Mario strips: **13 frames each**, in this order:
`0 stand, 1 walk1, 2 walk2, 3 walk3, 4 skid, 5 jump, 6 crouch (small: death pose), 7 climb1, 8 climb2,
9 swim1, 10 swim2, 11 swim3, 12 throw fireball (only meaningful in fire strip; copy stand elsewhere)`.

| file | frame size × frames | what |
|---|---|---|
| `mario_small.png` | 16×16 × 13 | small Mario |
| `mario_big.png` | 16×32 × 13 | Super Mario |
| `mario_fire.png` | 16×32 × 13 | Fire Mario |
| `goomba.png` | 16×16 × 3 | walk1, walk2, flattened |
| `goomba_ug.png` | 16×16 × 3 | underground-palette Goomba (optional, falls back to `goomba.png`) |
| `koopa_green.png` `koopa_red.png` | 16×24 × 2 | Koopa Troopa walk1, walk2 |
| `parakoopa_green.png` `parakoopa_red.png` | 16×24 × 2 | Koopa Paratroopa (wings), flap1, flap2 |
| `shell_green.png` `shell_red.png` | 16×16 × 2 | shell, shell waking up (legs out) |
| `piranha.png` | 16×24 × 2 | Piranha Plant mouth open / closed |
| `bowser.png` | 32×32 × 4 | walk1, walk2 (mouth closed), walk1, walk2 (mouth open, breathing fire) |
| `bowser_fire.png` | 24×8 × 2 | Bowser's flame |
| `fireball.png` | 8×8 × 4 | Mario's fireball / firebar ball, 4 rotation frames |
| `fire_burst.png` | 16×16 × 3 | fireball hitting a wall / enemy |
| `toad.png` | 16×24 × 1 | Toad at the end of 1-4 |
| `mushroom.png` | 16×16 × 1 | Super Mushroom |
| `mushroom_1up.png` | 16×16 × 1 | 1-up mushroom |
| `fire_flower.png` | 16×16 × 4 | Fire Flower palette cycle |
| `star.png` | 16×16 × 4 | Starman palette cycle |
| `coin_pop.png` | 8×16 × 4 | coin spinning up out of a `?` block |
| `brick_debris.png` | 8×8 × 1 | brick fragment (overworld) |
| `brick_debris_ug.png` | 8×8 × 1 | brick fragment (underground, optional) |
| `lift.png` | 8×8 × 1 | one segment of a moving lift (1-3, 1-2); the game repeats it to the lift width |

## UI — `assets/ui/`

| file | size | what |
|---|---|---|
| `font.png` | 8×8 glyphs in one row | white glyphs on transparent, in exactly this order: `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-x!c.` (`c` = the © glyph, `x` = the small multiply sign used in "x 03" / "x 05") → 41 glyphs, 328×8 |
| `coin_icon.png` | 8×8 × 3 | blinking HUD coin |
| `title_logo.png` | about 176×88 | title-screen logo panel (the game centres it at the top) |
| `cursor.png` | 8×8 | title-screen menu cursor (mushroom) |

## Audio — `assets/audio/`

Each sound as `<name>.ogg` **or** `<name>.mp3` (the game tries `.ogg`, then `.mp3`, then `.wav`).
Chiptune (NES 2A03 style: 2 pulse, triangle, noise) originals in the SMB1 style.

Sound effects (short, one-shot): `jump_small`, `jump_big`, `coin`, `stomp`, `kick` (shell kick / fireball kill),
`bump` (hitting a solid block), `break` (brick breaks), `powerup_appear` (item rises from block), `powerup`
(Mario grows / gets flower), `oneup`, `pipe` (pipe travel and taking damage/shrinking), `fireball`, `flagpole`
(flag sliding down), `fireworks`, `bowser_fire`, `bowser_fall`, `beep` (one tick of time→score count), `pause`.

Music, looped seamlessly (no silence at either end): `overworld`, `underground`, `castle`, `starman`.
Optional faster "hurry" versions: `overworld_fast`, `underground_fast`, `castle_fast` (if missing the game plays
the normal loop at 1.4× speed).

Jingles (one-shot): `hurry` (time warning at 100), `death`, `game_over`, `course_clear` (after the flagpole),
`world_clear` (after the axe in 1-4).

## World 2 additions (round 2: `game-developer`#13)

World 2 (2-1 … 2-4) reuses everything above and adds the files below. Same rules (1 px = 1 NES pixel,
horizontal strips, characters face right). Until a file exists the game draws a labelled placeholder and lists it
in the console; files marked *optional* fall back as stated.

### Tiles

New theme folder **`assets/tiles/water/`** for the underwater level 2-2 (blue background `#5c94fc` like the sky is
drawn by the game; a name missing here falls back to `overworld`):

| file | size | what |
|---|---|---|
| `water/water_top.png` | 16×16 | the wave line along the water surface (top row of 2-2): white/light-blue waves, transparent below |
| `water/ground.png` | 16×16 | sea-floor block (2-2 floor, walls and ledges; the pale green-grey coral-rock block) |
| `water/coral.png` | 16×16 | sea plant / coral (solid; stacked into columns 2–5 tiles tall) |
| `water/coral_top.png` | 16×16 | top tile of a coral column (*optional*; without it every tile of the column is `coral.png`) |
| `water/coin.png` | 48×16 (3 frames) | coins under water (*optional*, falls back to the overworld coin) |
| `water/pipe_side_*.png` | 16×16 | the sideways exit pipe at the end of 2-2, same six names as overworld (*optional*) |

Added to **`assets/tiles/overworld/`**:

| file | size | what |
|---|---|---|
| `cloud_block.png` | 16×16 | the white cloud block that forms the floor of the coin-heaven area above 2-1 (solid) |
| `rail.png` | 16×16 | the guard rail drawn on top of the 2-3 bridges (decorative, no collision; bottom-aligned) |
| `bridge.png` | 16×16 | (already supplied) also used for the 2-3 bridges over the water |

Not used (so not needed): a `water/block.png` (2-2 has no stair blocks), a `water.png` fill (the water of 2-2 is the
background colour; 2-3 has open sky under its bridges, no water: its area header has no water foreground),
a separate bridge deck (2-3 reuses `bridge.png`).

### Scenery — `assets/scenery/`

2-1 uses the "trees and fences" background set instead of hills and bushes (clouds stay):

| file | size | what |
|---|---|---|
| `tree_small.png` | 16×32 | short tree: round 16×16 crown on a 16×16 trunk |
| `tree_large.png` | 16×48 | tall tree: 16×32 oval crown on a 16×16 trunk |
| `fence.png` | 16×16 | one fence segment (drawn in runs, standing on the ground) |

### Sprites — `assets/sprites/`

| file | frame size × frames | what |
|---|---|---|
| `vine.png` | 16×16 × 2 | the vine that grows out of a 2-1 brick: 0 = growing tip (sprout with leaves), 1 = stem segment (repeated downwards) |
| `jumpspring.png` | 16×32 × 3 | the springboard (red/orange): 0 extended, 1 half compressed, 2 fully compressed; art bottom-aligned in each frame |
| `blooper.png` | 16×24 × 2 | Blooper (white squid): 0 tentacles stretched (gliding), 1 contracted (the push stroke); bottom-aligned |
| `cheep_grey.png` | 16×16 × 2 | grey/green Cheep-cheep (slow swimmer), fin flap 1 / 2, facing right |
| `cheep_red.png` | 16×16 × 2 | red Cheep-cheep (fast swimmer and the 2-3 leaper), fin flap 1 / 2, facing right |
| `podoboo.png` | 16×16 × 1 | Podoboo (lava bubble) pointing up; the game flips it when it falls |
| `bubble.png` | 8×8 × 1 | air bubble Mario breathes out under water |
| `lift_cloud.png` | 8×8 × 1 | one segment of the lift in coin heaven (cloud look; *optional*, falls back to `lift.png`) |

Mario's swim frames (9–11) and climb frames (7–8) in the three Mario strips are now used (swimming in 2-2,
climbing the vine). The fake Bowser of 2-4 turns into a green Koopa when beaten with fireballs (`koopa_green.png`).

### Audio — `assets/audio/`

| name | kind | what |
|---|---|---|
| `underwater` | music, looped | 2-2 underwater theme (a gentle waltz-like swimming tune in the SMB1 style) |
| `underwater_fast` | music, looped | hurry version (*optional*, else 1.4× speed) |
| `cloud` | music, looped | coin heaven above 2-1 (bright bonus tune; *optional*, falls back to `overworld`) |
| `swim` | SFX | one swim stroke (*optional*, falls back to `stomp`, as on the NES where they share a sound) |
| `vine` | SFX | the vine sprouting from the block (*optional*, falls back to `powerup_appear`) |
