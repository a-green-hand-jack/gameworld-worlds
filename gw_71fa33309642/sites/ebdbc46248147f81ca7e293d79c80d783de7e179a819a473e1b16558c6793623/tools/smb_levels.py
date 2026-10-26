#!/usr/bin/env python3
"""Decode the World 1 level layouts from doppelganger's SMB disassembly.

Layout reference only: we read the area/enemy object *data* tables from the
.asm source and run a faithful Python port of the game's column-by-column area
parser (AreaParserCore / ProcessAreaData / DecodeAreaData and the object
handlers) and of ProcessEnemyData.  No graphics or audio are touched.

Outputs (next to this script):
  levels_w1.json  - per-area tile rows, contents, pipes, objects, enemies, meta
  levels_w1.txt   - ASCII rendering of every area (tiles + entity overlay)
Also prints a comparison of the decoded 1-1 against src/levels/w1_1.js.

Usage: python3 tools/smb_levels.py [path/to/smbdis.asm]
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
ASM_PATH = sys.argv[1] if len(sys.argv) > 1 else '/tmp/smbdis.asm'
WORLD = 0  # WorldNumber (0 = world 1)


# ----------------------------------------------------------------------------
# .asm table reader
# ----------------------------------------------------------------------------

def parse_asm(path):
    """Return (tables, consts): label -> list of .db values, NAME = value constants.

    A table is every .db line after a label until the next label or code line.
    Values are ints when numeric, else the raw symbol text (e.g. '<L_GroundArea6').
    """
    tables, consts = {}, {}
    cur = None

    def num(tok):
        tok = tok.strip()
        if tok.startswith('$'):
            return int(tok[1:], 16)
        if tok.startswith('%'):
            return int(tok[1:], 2)
        if tok.isdigit():
            return int(tok)
        if tok in consts and isinstance(consts[tok], int):
            return consts[tok]
        return tok

    with open(path, encoding='latin-1') as f:
        for raw in f:
            line = raw.split(';', 1)[0].rstrip()
            if not line.strip():
                continue
            m = re.match(r'^([A-Za-z_]\w*)\s*=\s*(\S+)\s*$', line)
            if m:
                consts[m.group(1)] = num(m.group(2))
                cur = None
                continue
            m = re.match(r'^([A-Za-z_]\w*):(.*)$', line)
            if m:
                cur = m.group(1)
                tables[cur] = []
                line = m.group(2)
                if not line.strip():
                    continue
            s = line.strip()
            if s.startswith('.db') and cur is not None:
                tables[cur].extend(num(t) for t in s[3:].split(','))
            else:
                cur = None  # code (or .dw) ends a data table
    return tables, consts


T, CONST = parse_asm(ASM_PATH)


def tab(name):
    return T[name]


def area_type_of(ptr):
    return (ptr & 0x60) >> 5  # 0 water, 1 ground, 2 underground, 3 castle


def area_label(ptr):
    i = tab('AreaDataHOffsets')[area_type_of(ptr)] + (ptr & 0x1f)
    return tab('AreaDataAddrLow')[i].lstrip('<')


def enemy_label(ptr):
    i = tab('EnemyAddrHOffsets')[area_type_of(ptr)] + (ptr & 0x1f)
    return tab('EnemyDataAddrLow')[i].lstrip('<')


THEMES = ['water', 'overworld', 'underground', 'castle']


# ----------------------------------------------------------------------------
# Area parser (port of AreaParserCore / ProcessAreaData / DecodeAreaData)
# ----------------------------------------------------------------------------

class AreaParser:
    def __init__(self, ptr, area_number, start_page=0, hidden1up=True):
        self.ptr = ptr
        self.atype = area_type_of(ptr)
        self.area_number = area_number
        raw = tab(area_label(ptr))
        self.header = raw[:2]
        self.data = raw[2:]
        h1, h2 = self.header
        v = h1 & 7  # foreground scenery, or bg colour ctrl if >= 4
        self.bg_color_ctrl = v if v >= 4 else 0
        self.fg = 0 if v >= 4 else v
        self.entrance_ctrl = (h1 >> 3) & 7
        self.timer_setting = h1 >> 6
        self.terrain = h2 & 0x0f
        self.bg_scenery = (h2 >> 4) & 3
        style = h2 >> 6
        self.cloud = style == 3
        self.style = 0 if style == 3 else style
        # parser state
        self.ofs = 0               # AreaDataOffset
        self.obj_page = 0          # AreaObjectPageLoc
        self.page_sel = 0          # AreaObjectPageSel
        self.length = [-1, -1, -1]  # AreaObjectLength (negative = slot empty)
        self.objofs = [0, 0, 0]    # AreaObjOffsetBuffer
        self.halflen = [0, 0, 0]   # MushroomLedgeHalfLen
        self.stair = 0             # StaircaseControl
        self.page = start_page     # CurrentPageLoc
        self.col = 0               # CurrentColumnPos
        self.backloading = start_page
        self.behind = 0
        self.objx = 0              # ObjectOffset
        self.hidden1up = hidden1up
        self.obj_id = 0            # $00 from the decoder
        self.mt = [0] * 16
        self.columns = {}          # abs column -> 13 metatiles (buffer rows 0..12)
        self.events = []           # things the handlers did (objects, spawns...)
        self.tags = {}             # (abs col, buffer row) -> (metatile, char) override
        self.attr_log = []         # terrain/scenery changes
        self.loop_command = 0

    # -- helpers -------------------------------------------------------------
    def abscol(self):
        return self.page * 16 + self.col

    def ev(self, kind, **kw):
        kw.update(kind=kind, x=self.abscol())
        self.events.append(kw)

    def attr(self, x):  # GetLrgObjAttrib -> (row, low nybble of byte 2)
        y = self.objofs[x]
        return self.data[y] & 0x0f, self.data[y + 1] & 0x0f

    def fixed_len(self, x, n):  # ChkLrgObjFixedLength; True when just starting
        if self.length[x] < 0:
            self.length[x] = n
            return True
        return False

    def chk_len(self, x):  # ChkLrgObjLength
        row, low = self.attr(x)
        return row, low, self.fixed_len(x, low)

    def rup(self, x, y, a):
        """RenderUnderPart: draw `a` from row x downwards for y+1 rows, keeping
        ledge middles, ?/coin-class tiles ($c1+) and stem-over-ground."""
        while True:
            cur = self.mt[x]
            draw = True
            if cur != 0:
                if cur in (0x17, 0x1a):
                    draw = False
                elif cur == 0xc0:
                    draw = True
                elif cur >= 0xc0:
                    draw = False
                elif cur == 0x54 and a == 0x50:
                    draw = False
            if draw and x < 16:
                self.mt[x] = a
            x += 1
            if x >= 13:
                return
            y -= 1
            if y < 0:
                return

    # -- per column ------------------------------------------------------------
    def render_column(self):
        if self.backloading:
            self.process_area_data()
        mt = self.mt = [0] * 16
        # background scenery (repeats every 3 pages)
        if self.bg_scenery:
            idx = (self.page % 3) * 16 + tab('BSceneDataOffsets')[self.bg_scenery - 1] + self.col
            v = tab('BackSceneryData')[idx]
            if v:
                k = ((v & 0x0f) - 1) * 3
                row = v >> 4
                for i in range(3):
                    mt[row] = tab('BackSceneryMetatiles')[k + i]
                    row += 1
                    if row == 0x0b:
                        break
        # foreground scenery
        if self.fg:
            o = tab('FSceneDataOffsets')[self.fg - 1]
            for i in range(13):
                v = tab('ForeSceneryData')[o + i]
                if v:
                    mt[i] = v
        # terrain
        if self.atype == 0 and WORLD == 7:
            t = 0x62
        else:
            t = 0x88 if self.cloud else tab('TerrainMetatiles')[self.atype]
        bits = tab('TerrainRenderBits')[self.terrain * 2: self.terrain * 2 + 2]
        x = 0
        for bi, b in enumerate(bits):
            if self.cloud and x != 0:
                b &= 0x08
            for bit in range(8):
                if b & (1 << bit):
                    mt[x] = t
                x += 1
                if x == 13:
                    break
                if self.atype == 2 and x == 11:
                    t = 0x54  # underground: bottom two rows use ground terrain
            if x == 13:
                break
        self.process_area_data()
        self.columns[self.abscol()] = list(self.mt[:13])
        # IncrementColumnPos
        self.col += 1
        if self.col == 16:
            self.col = 0
            self.page += 1

    def done(self):
        return self.data[self.ofs] == 0xfd and all(l < 0 for l in self.length)

    def inc_ofs(self):  # IncAreaObjOffset
        self.ofs += 2
        self.page_sel = 0

    def process_area_data(self):
        guard = 0
        while True:
            guard += 1
            if guard > 5000:
                raise RuntimeError('area parser did not settle (backloading?)')
            x = 2
            while x >= 0:
                self.objx = x
                self.behind = 0
                y = self.ofs
                b1 = self.data[y]
                action = 'decode'
                if b1 != 0xfd and self.length[x] < 0:
                    b2 = self.data[y + 1]
                    if b2 & 0x80 and not self.page_sel:  # page-select bit
                        self.page_sel = 1
                        self.obj_page += 1
                    row = b1 & 0x0f
                    action = 'rear'
                    if row == 0x0d:
                        if not (b2 & 0x40) and not self.page_sel:  # page control
                            self.obj_page = b2 & 0x1f
                            self.page_sel += 1
                            action = 'next'
                    elif row == 0x0e and self.backloading:
                        action = 'decode'
                    if action == 'rear':
                        action = 'behind' if self.obj_page < self.page else 'decode'
                if action == 'decode':
                    self.decode_area_data(x)
                elif action == 'behind':
                    self.behind += 1
                    self.inc_ofs()
                else:
                    self.inc_ofs()
                x = self.objx  # handlers/InitRear may change ObjectOffset
                if self.length[x] >= 0:
                    self.length[x] -= 1
                x -= 1
            if not self.behind and not self.backloading:
                return

    def decode_area_data(self, x):
        y = self.objofs[x] if self.length[x] >= 0 else self.ofs
        b1 = self.data[y]
        if b1 == 0xfd:
            return
        row = b1 & 0x0f
        add = 0x10 if row == 0x0f else (0x08 if row == 0x0c else 0)
        if row == 0x0e:
            add, a = 0, 0x2e
        elif row == 0x0d:
            add = 0x22
            b2 = self.data[y + 1]
            if not (b2 & 0x40):
                return
            if b2 & 0x7f == 0x4b:
                self.loop_command += 1
            a = b2 & 0x3f
        elif row < 0x0c:
            b2 = self.data[y + 1]
            a = b2 & 0x70
            if a:
                if a == 0x70 and b2 & 0x08:
                    a = 0  # warp/enterable pipe
                a >>= 4
            else:
                add, a = 0x16, b2 & 0x0f
        else:
            a = (self.data[y + 1] & 0x70) >> 4
        self.obj_id = a
        if self.length[x] < 0:  # not yet running: may we start it here?
            if self.obj_page == self.page:
                if self.backloading:  # InitRear
                    self.backloading = 0
                    self.behind = 0
                    self.objx = 0
                    return
                if (self.data[self.ofs] >> 4) != self.col:
                    return
            else:
                if not ((self.data[self.ofs] & 0x0f) == 0x0e and self.backloading):
                    return
            self.objofs[x] = self.ofs
            self.inc_ofs()
        self.run_object(a + add, x)

    # -- object handlers ---------------------------------------------------------
    def run_object(self, idx, x):
        if idx in (0, 7):
            return self.vertical_pipe(x)
        if idx == 1:
            return [self.tree_ledge, self.mushroom_ledge, self.bullet_cannon][self.style](x)
        if idx in (2, 3, 4):  # rows of bricks / solid blocks / coins
            if idx == 2:
                a = tab('BrickMetatiles')[4 if self.cloud else self.atype]
            elif idx == 3:
                a = tab('SolidBlockMetatiles')[self.atype]
            else:
                a = tab('CoinMetatileData')[self.atype]
            row, low, start = self.chk_len(x)
            if start:
                self.ev({2: 'row_bricks', 3: 'row_blocks', 4: 'row_coins'}[idx], row=row + 2, len=low + 1)
            return self.rup(row, 0, a)
        if idx in (5, 6):  # columns
            a = tab('BrickMetatiles' if idx == 5 else 'SolidBlockMetatiles')[self.atype]
            row, low = self.attr(x)
            return self.rup(row, low, a)
        if idx == 8:  # Hole_Empty
            row, low, start = self.chk_len(x)
            if start:
                self.ev('hole', len=low + 1)
                if self.atype == 0:
                    self.ev('whirlpool', len=low + 1)
            return self.rup(8, 15, tab('HoleMetatiles')[self.atype])
        if idx == 9:  # pulley rope
            row, low, start = self.chk_len(x)
            if start:
                self.ev('pulley_rope', len=low + 1)
            i = 0 if start else (1 if self.length[x] != 0 else 2)
            self.mt[0] = tab('PulleyRopeMetatiles')[i]
            return
        if idx in (10, 11, 12):  # bridges
            r = {10: 6, 11: 7, 12: 9}[idx]
            row, low, start = self.chk_len(x)
            if start:
                self.ev('bridge', row=r + 2, len=low + 1)
            self.mt[r] = 0x0b
            return self.rup(r + 1, 0, 0x63)
        if idx == 13:  # Hole_Water
            row, low, start = self.chk_len(x)
            if start:
                self.ev('water_hole', len=low + 1)
            self.mt[10] = 0x86
            return self.rup(11, 1, 0x87)
        if idx in (14, 15):  # ?-block rows
            r = 3 if idx == 14 else 7
            self.chk_len(x)
            self.mt[r] = 0xc0
            return
        if idx == 16:  # EndlessRope
            return self.rup(0, 15, 0x40)
        if idx == 17:  # BalancePlatRope
            self.rup(1, 15, 0x44)
            row, low = self.attr(x)
            if self.length[x] < 0:
                self.ev('balance_rope', ropeRows=low)
            return self.rup(1, low, 0x40)
        if idx == 18:
            return self.castle(x)
        if idx == 19:  # staircase
            row, low, start = self.chk_len(x)
            if start:
                self.stair = 9
                self.ev('staircase', len=low + 1)
            self.stair -= 1
            return self.rup(tab('StaircaseRowData')[self.stair], tab('StaircaseHeightData')[self.stair], 0x61)
        if idx == 20:  # ExitPipe
            if self.fixed_len(x, 3):
                row, low = self.attr(x)
                self.ev('side_pipe', top=low + 1, intro=False)  # mouth at buffer row low-1 = our row low+1
            row, low = self.attr(x)
            self.sideways_pipe(x, low)
            return
        if idx == 21:  # FlagBalls_Residual
            row, low = self.attr(x)
            return self.rup(2, low, 0x6d)
        if 0x16 <= idx < 0x22:
            return self.small_object(idx - 0x16, x)
        if idx == 0x22:  # IntroPipe
            if self.fixed_len(x, 3):
                self.ev('side_pipe', top=0x0a + 1, intro=True)
            if self.sideways_pipe(x, 0x0a):
                for r in range(7):
                    self.mt[r] = 0
                self.mt[7] = tab('VerticalPipeData')[self.length[x]]
            return
        if idx == 0x23:  # flagpole
            self.mt[0] = 0x24
            self.rup(1, 8, 0x25)
            self.mt[10] = 0x61
            self.tags[(self.abscol(), 10)] = (0x61, 'F')
            self.ev('flagpole', flagX=self.abscol() - 0.5)
            return
        if idx in (0x24, 0x25, 0x26):  # axe, chain, castle bridge
            if idx == 0x26:
                if self.fixed_len(x, 0x0c):
                    self.ev('bowser_bridge', row=8 + 2, len=13)
            if idx == 0x24:
                self.ev('axe', row=6 + 2)
            i = self.obj_id - 2
            r = tab('C_ObjectRow')[i]
            return self.rup(r, 0, tab('C_ObjectMetatile')[i])
        if idx == 0x27:  # ScrollLockObject_Warp (falls through to ScrollLockObject)
            n = 4  # world 1 -> warp zone text/number set 4 (4-3-2)
            if WORLD != 0:
                n = 5 if self.atype != 1 else 6
            self.ev('warp_zone', warpZoneControl=n, worlds=tab('WarpZoneNumbers')[(n & 3) * 4:(n & 3) * 4 + 3])
            self.ev('scroll_lock_toggle', warp=True)
            return
        if idx in (0x28, 0x29):
            self.ev('scroll_lock_toggle', warp=False)
            return
        if idx in (0x2a, 0x2b, 0x2c):
            self.ev('frenzy', frenzy=['flying_cheep', 'bullet_bill_or_cheep', 'stop'][self.obj_id - 8])
            return
        if idx == 0x2d:  # LoopCmdE (loop flag already counted)
            self.ev('loop_check')
            return
        if idx == 0x2e:  # AlterAreaAttributes
            b2 = self.data[self.objofs[x] + 1]
            if not (b2 & 0x40):
                self.terrain = b2 & 0x0f
                self.bg_scenery = (b2 & 0x30) >> 4
                self.attr_log.append({'x': self.abscol(), 'terrain': self.terrain, 'bgScenery': self.bg_scenery})
            else:
                v = b2 & 7
                if v >= 4:
                    self.bg_color_ctrl = v
                    self.fg = 0
                else:
                    self.fg = v
                self.attr_log.append({'x': self.abscol(), 'fg': self.fg, 'bgColorCtrl': self.bg_color_ctrl})
            return
        raise ValueError('unknown object index %#x' % idx)

    def small_object(self, n, x):
        row, low = self.attr(x)
        if n == 3:  # Hidden1UpBlock: only while Hidden1UpFlag is set
            self.ev('hidden_1up_block', row=row + 2, rendered=bool(self.hidden1up))
            if not self.hidden1up:
                return
            self.hidden1up = False
        if n <= 2:
            a = tab('BrickQBlockMetatiles')[n]
        elif n <= 8:
            a = tab('BrickQBlockMetatiles')[n + (0 if self.atype == 1 else 5)]
        elif n == 9:  # water pipe
            self.mt[row], self.mt[row + 1] = 0x6b, 0x6c
            self.ev('water_pipe', row=row + 2)
            return
        elif n == 10:
            a = 0xc4  # empty (used) block
        elif n == 11:  # jumpspring (also an enemy object)
            self.ev('jumpspring', row=row + 2)
            self.mt[row], self.mt[row + 1] = 0x67, 0x68
            return
        else:
            return
        self.rup(row, 0, a)

    def vertical_pipe(self, x):
        self.fixed_len(x, 1)
        row, low = self.attr(x)
        h = low & 7
        i = self.length[x]
        first = self.length[x] != 0
        enterable = self.obj_id == 0
        if not enterable:
            i += 4
        if first:
            piranha = bool(self.area_number | WORLD)
            self.ev('vpipe', top=row + 2, height=h + 1, enterable=enterable, piranha=piranha)
        vpd = tab('VerticalPipeData')
        self.mt[row] = vpd[i]
        self.rup(row + 1, h - 1, vpd[i + 2])

    def sideways_pipe(self, x, y):
        """RenderSidewaysPipe; returns True when the vertical shaft was drawn."""
        v = y - 2
        L = self.length[x]
        r = v + 1
        shaft = tab('SidePipeShaftData')[L]
        if shaft:
            self.rup(0, v, shaft)
        self.mt[r] = tab('SidePipeTopPart')[L]
        self.mt[r + 1] = tab('SidePipeBottomPart')[L]
        return bool(shaft)

    def tree_ledge(self, x):
        row, low = self.attr(x)
        L = self.length[x]
        if L == 0:
            return self.rup(row, 0, 0x18)
        if L < 0:
            self.length[x] = low
            self.ev('treetop', row=row + 2, len=low + 1)
            if self.page | self.col:
                return self.rup(row, 0, 0x16)
        self.mt[row] = 0x17
        self.rup(row + 1, 15, 0x4c)

    def mushroom_ledge(self, x):
        row, low, start = self.chk_len(x)
        if start:
            self.halflen[x] = self.length[x] >> 1
            self.ev('mushroom', row=row + 2, len=low + 1)
            return self.rup(row, 0, 0x19)
        L = self.length[x]
        if L == 0:
            return self.rup(row, 0, 0x1b)
        self.mt[row] = 0x1a
        if L != self.halflen[x]:
            return
        self.mt[row + 1] = 0x4f
        self.rup(row + 2, 15, 0x50)

    def bullet_cannon(self, x):
        row, h = self.attr(x)
        self.ev('cannon', row=row + 2, height=h + 1)
        self.mt[row] = 0x64
        r = row + 1
        h -= 1
        if h >= 0:
            self.mt[r] = 0x65
            r += 1
            h -= 1
            if h >= 0:
                self.rup(r, h, 0x66)

    def castle(self, x):
        _, row = self.attr(x)  # the castle's starting row is the low nybble of byte 2
        if self.fixed_len(x, 4):
            self.ev('castle', row=row + 2, size='big' if row == 0 else 'small')
        cm = tab('CastleMetatiles')
        y = self.length[x]
        r, lim = row, 0x0b
        while True:
            self.mt[r] = cm[y]
            r += 1
            if lim:
                y += 5
                lim -= 1
            if r == 0x0b:
                break
        if self.page == 0:
            return
        L = self.length[x]
        if L == 1 or (row == 0 and L == 3):
            self.mt[10] = 0x52  # invisible stop: keeps Mario walking into the door
            self.tags[(self.abscol(), 10)] = (0x52, '*')
        elif L == 2:
            self.ev('star_flag', y=0x90 / 16)

    # -- run ---------------------------------------------------------------------
    def run(self, max_cols=None, stop_at_end=True):
        n = 0
        while True:
            self.render_column()
            n += 1
            if max_cols is not None and n >= max_cols:
                break
            if stop_at_end and self.done() and self.col == 0:
                break
            if n > 64 * 16:
                raise RuntimeError('runaway area')
        return self


# ----------------------------------------------------------------------------
# Metatile -> legend character
# ----------------------------------------------------------------------------

LEGEND = {
    '.': 'empty / background scenery (hills, bushes, clouds, castle wall art, fence, bg trees)',
    '#': 'ground / floor block (terrain metatile; castle floor & castle solid blocks)',
    'B': 'brick (see contents for item bricks)',
    '?': 'question block (see contents)',
    'U': 'used/empty block (also firebar pivot block)',
    'X': 'hard stair block',
    'F': 'flagpole base block (same metatile as X)',
    '[': 'vertical pipe top left', ']': 'vertical pipe top right',
    '{': 'vertical pipe body left', '}': 'vertical pipe body right',
    'm': 'sideways pipe mouth top', 'n': 'sideways pipe mouth bottom',
    's': 'sideways pipe body top', 't': 'sideways pipe body bottom',
    'j': 'sideways pipe joint top', 'k': 'sideways pipe joint bottom',
    'o': 'coin', 'h': 'hidden block (invisible until hit; see contents)',
    'P': 'flagpole ball', '|': 'flagpole shaft',
    '<': 'treetop/mushroom top left', '=': 'treetop/mushroom top middle', '>': 'treetop/mushroom top right',
    'T': 'tree trunk / mushroom stem (non-solid)',
    'b': 'bridge (Bowser bridge in castles)', 'c': 'chain', 'a': 'axe',
    'L': 'lava surface', 'l': 'lava', 'W': 'water',
    # extra characters (only those needed by World 1 are expected to appear)
    '*': 'EXTRA: invisible solid stop block in the castle doorway (game uses a brick metatile there)',
    'g': 'EXTRA: bridge guard rail (decorative)',
    'r': 'EXTRA: rope (vertical)', '(': 'EXTRA: pulley left', ')': 'EXTRA: pulley right', '-': 'EXTRA: pulley rope (horizontal)',
    'K': 'EXTRA: bullet bill cannon top', 'Q': 'EXTRA: bullet bill cannon body',
    'J': 'EXTRA: jumpspring', '@': 'EXTRA: cloud block', 'C': 'EXTRA: sea plant',
}
EXTRA_CANNON = {0x64: 'K', 0x65: 'Q', 0x66: 'Q'}

MT_CHAR = {
    0x0b: 'g', 0x0c: 'c',
    0x10: '[', 0x12: '[', 0x11: ']', 0x13: ']', 0x14: '{', 0x15: '}',
    0x16: '<', 0x19: '<', 0x17: '=', 0x1a: '=', 0x18: '>', 0x1b: '>',
    0x1c: 'm', 0x1f: 'n', 0x1d: 's', 0x20: 't', 0x1e: 'j', 0x21: 'k',
    0x22: 'C', 0x24: 'P', 0x25: '|',
    0x40: 'r', 0x41: '-', 0x42: '(', 0x43: ')',
    0x4c: 'T', 0x4f: 'T', 0x50: 'T',
    0x51: 'B', 0x52: 'B', 0x53: 'B', 0x54: '#',
    0x5f: 'h', 0x60: 'h', 0x61: 'X', 0x62: '#', 0x63: 'b',
    0x67: 'J', 0x68: 'J', 0x69: '#', 0x6b: 'm', 0x6c: 'n',
    0x88: '@', 0x89: 'b',
    0xc0: '?', 0xc1: '?', 0xc2: 'o', 0xc3: 'o', 0xc4: 'U', 0xc5: 'a',
}
MT_CHAR.update(EXTRA_CANNON)
for m in range(0x55, 0x5f):
    MT_CHAR[m] = 'B'
# non-solid background metatiles (scenery / castle art / clouds)
BG_TILES = set(range(0x00, 0x10)) - {0x0b, 0x0c} | {0x23, 0x26, 0x44, 0x4d, 0x4e, 0x6d} \
    | set(range(0x45, 0x4c)) | set(range(0x80, 0x86))

CONTENT_OF = {0xc1: 'power', 0xc0: 'coin', 0x5f: 'coin', 0x60: '1up',
              0x55: 'power', 0x56: 'vine', 0x57: 'star', 0x58: 'multicoin', 0x59: '1up',
              0x5a: 'power', 0x5b: 'vine', 0x5c: 'star', 0x5d: 'multicoin', 0x5e: '1up'}


def mt_char(m, atype):
    if m in (0x86, 0x87):
        if atype == 3:
            return 'L' if m == 0x86 else 'l'
        return 'W'
    if m in MT_CHAR:
        return MT_CHAR[m]
    if m in BG_TILES:
        return '.'
    raise ValueError('no legend char for metatile %#x' % m)


# ----------------------------------------------------------------------------
# Enemy data (port of ProcessEnemyData's decoding)
# ----------------------------------------------------------------------------

ENEMY_NAMES = {
    0x00: 'koopa', 0x01: 'koopa_red_alt', 0x02: 'buzzy', 0x03: 'koopa_red', 0x05: 'hammer_bro', 0x06: 'goomba',
    0x07: 'blooper', 0x08: 'bullet_bill', 0x0a: 'cheep_grey', 0x0b: 'cheep_red', 0x0c: 'podoboo',
    0x0d: 'piranha', 0x0e: 'paratroopa_green_hop', 0x0f: 'paratroopa_red_fly', 0x10: 'paratroopa_green_fly',
    0x11: 'lakitu', 0x12: 'spiny', 0x14: 'frenzy_flying_cheep', 0x15: 'bowser_flame',
    0x17: 'frenzy_bullet_bill_or_cheep', 0x18: 'frenzy_stop', 0x2d: 'bowser', 0x2e: 'powerup', 0x2f: 'vine',
    0x32: 'jumpspring', 0x34: 'warp_zone_trigger', 0x35: 'toad',
}
LIFTS = {
    0x24: ('balance', 'balance pair on pulley ropes: sinks under Mario, partner rises; falls when a rope runs out'),
    0x25: ('vertical', 'oscillates up/down around top+64px (YMovingPlatform)'),
    0x26: ('large_up', 'moves up continuously, wraps top->bottom'),
    0x27: ('large_down', 'moves down continuously, wraps bottom->top'),
    0x28: ('horizontal', 'oscillates left/right (XMovingPlatform)'),
    0x29: ('drop', 'falls when stood on'),
    0x2a: ('right', 'moves right once stood on'),
    0x2b: ('small_up', 'moves up continuously, wraps'),
    0x2c: ('small_down', 'moves down continuously, wraps'),
}


def parse_enemy_data(ptr):
    """Return the raw enemy entries in order: dicts with page/col/row/id/hard or area pointers."""
    data = tab(enemy_label(ptr))
    out, page, sel, i = [], 0, 0, 0
    while data[i] != 0xff:
        b1, b2 = data[i], data[i + 1]
        row, col = b1 & 0x0f, b1 >> 4
        if b2 & 0x80 and not sel:  # page-select bit (also on area-pointer entries)
            sel = 1
            page += 1
        if row == 0x0f and not sel:  # page control; page select stays set (game quirk)
            page = b2 & 0x3f
            sel = 1
            i += 2
            continue
        if row == 0x0e:
            b3 = data[i + 2]
            out.append({'kind': 'area_pointer', 'page': page, 'col': col, 'px': page * 256 + col * 16,
                        'ptr': b2, 'world': b3 >> 5, 'entryPage': b3 & 0x1f, 'raw': [b1, b2, b3]})
            i += 3
        else:
            out.append({'kind': 'enemy', 'page': page, 'col': col, 'row': row, 'px': page * 256 + col * 16,
                        'id': b2 & 0x3f, 'hard': bool(b2 & 0x40), 'raw': [b1, b2]})
            i += 2
        sel = 0
    return out


def sim_horizontal_platform():
    """XMoveCntr_Platform + MoveWithXMCntrs: returns (min, max) offset in pixels."""
    prim = sec = pos = lo = hi = 0
    for f in range(4096):
        if f % 4 == 0:
            if prim & 1:
                if sec == 0:
                    prim += 1
                else:
                    sec -= 1
            elif sec == 0x0e:
                prim += 1
            else:
                sec += 1
        pos += sec if prim & 2 else -sec  # speed is 4.4 fixed point px/frame
        lo, hi = min(lo, pos), max(hi, pos)
    return lo / 16, hi / 16


def expand_enemies(entries, atype, entry_screen_right_px, castle):
    """Turn enemy entries into (enemies, objects). Entries left of the entry
    screen's right edge never spawn (they are skipped by ProcessEnemyData)."""
    enemies, objects = [], []
    hx = sim_horizontal_platform()
    for e in entries:
        if e['kind'] != 'enemy':
            continue
        px, row, eid, hard = e['px'], e['row'], e['id'], e['hard']
        skipped = px < entry_screen_right_px
        base = {'hard': hard}
        if skipped:
            base['neverSpawns'] = True
        if 0x37 <= eid <= 0x3e:  # enemy groups
            n = eid - 0x37
            kind = 'goomba' if n < 4 else 'koopa'
            ypx = 0x70 if n & 2 else 0xb0
            count = 3 if n & 1 else 2
            x0 = (px - 48) / 16  # spawned at the screen's right edge, ~48px before the data column
            for k in range(count):
                d = dict(base, type=kind, x=x0 + 1.5 * k, y=(ypx + 8 + 8) // 16, group=True,
                         dataX=px / 16)
                if kind == 'goomba':
                    d['hardModeType'] = 'buzzy'
                enemies.append(d)
            continue
        if 0x1b <= eid <= 0x1f:  # firebars
            i = eid - 0x1b
            objects.append(dict(base, type='firebar', x=px / 16, y=row,
                                length='long' if eid == 0x1f else 'short',
                                balls=12 if eid == 0x1f else 6,
                                dir='cw' if tab('FirebarSpinDirData')[i] == 0 else 'ccw',
                                speed=tab('FirebarSpinSpdData')[i]))
            continue
        if eid in LIFTS:
            name, how = LIFTS[eid]
            xp, yp = px, row * 16
            large = eid not in (0x2b, 0x2c)
            if eid == 0x24:
                yp -= 2  # (net x shift 0 outside secondary hard mode)
            if eid in (0x26, 0x27, 0x2b, 0x2c):
                xp += 12
            width = (2 if castle else 3) if large else 1.5
            d = dict(base, type='lift', kind=name, x=xp / 16, y=yp / 16, width=width, movement=how)
            if eid == 0x28:
                d['rangeX'] = [round(xp / 16 + hx[0] / 16, 2), round(xp / 16 + hx[1] / 16, 2)]
            if eid == 0x25:
                top = yp if yp < 0x80 else (256 - yp)
                d['rangeY_approx'] = [top / 16, (top + 128) / 16]
            objects.append(d)
            continue
        if eid == 0x34:
            objects.append(dict(base, type='warp_zone_trigger', x=px / 16,
                                note='unlocks scroll when Mario is above the screen (on the ceiling) and bumps WarpZoneControl'))
            continue
        if eid == 0x35:
            objects.append(dict(base, type='toad', x=px / 16, y=12, py=0xb8))
            continue
        if eid == 0x2d:
            enemies.append(dict(base, type='bowser', x=px / 16, y=row + 1, py=row * 16,
                                hardModeNote='throws hammers from 6-4 on (not in W1)'))
            continue
        if eid in (0x14, 0x17, 0x18):
            objects.append(dict(base, type='frenzy', frenzy=ENEMY_NAMES[eid], x=px / 16))
            continue
        name = ENEMY_NAMES.get(eid, 'enemy_%02x' % eid)
        ypx = row * 16 + (8 if eid < 0x15 else 0)
        d = dict(base, type=name, x=px / 16, y=(ypx + 8) // 16 if eid < 0x15 else row)
        if eid == 0x06:
            d['hardModeType'] = 'buzzy'
        enemies.append(d)
    return enemies, objects


# ----------------------------------------------------------------------------
# Building the World 1 areas
# ----------------------------------------------------------------------------

def bg_name(atype, color_ctrl):
    if color_ctrl:
        return 'night' if tab('BackgroundColors')[4 + (color_ctrl - 4)] == 0x0f else 'sky'
    return 'sky' if tab('BackgroundColors')[atype] == 0x22 else 'black'


SCENERY = ['none', 'clouds', 'hills', 'trees_fence']
STYLE = ['tree', 'mushroom', 'cannon']


def terrain_rows(ctrl):
    bits = tab('TerrainRenderBits')[ctrl * 2: ctrl * 2 + 2]
    rows = [r + 2 for r in range(8) if bits[0] >> r & 1] + [r + 10 for r in range(5) if bits[1] >> r & 1]
    return rows


def start_info(p, alt, entry_page, x0):
    """Mario's start (PlayerStarting_X/Y_Pos), coordinates relative to the area's x0."""
    ectrl = p.entrance_ctrl
    yi = ectrl if alt in (0, 1) else tab('AltYPosOffset')[alt - 2]
    xpx = entry_page * 256 + tab('PlayerStarting_X_Pos')[alt]
    ypx = tab('PlayerStarting_Y_Pos')[yi]
    s = {'x': xpx / 16 - x0, 'y': (ypx + 16) // 16, 'py': ypx, 'entranceCtrl': ectrl, 'altEntrance': alt}
    if alt == 2:
        s.update(mode='rise_from_pipe', y=(0x90 + 16) // 16, note='rises from below the screen until Y < $91')
    elif ypx < 0x30:
        s.update(mode='fall', note='drops in from the top without control until Y >= $30')
    elif ectrl in (6, 7):
        s.update(mode='autowalk_into_pipe', note='walks right into the intro pipe, then NextArea')
    else:
        s['mode'] = 'normal'
    return s


def build_area(area_id, ptr, area_number, entry_page=0, alt=0, single_screen=False, hidden1up=True):
    """Decode one area (or the slice of an area that is reachable from entry_page)."""
    p = AreaParser(ptr, area_number, start_page=entry_page, hidden1up=hidden1up)
    hdr = {'raw': ['$%02x' % b for b in p.header], 'foregroundScenery': p.fg,
           'bgColorCtrl': p.bg_color_ctrl, 'entranceCtrl': p.entrance_ctrl,
           'timerSetting': p.timer_setting, 'terrainCtrl': p.terrain, 'bgScenery': p.bg_scenery,
           'areaStyle': p.style, 'cloudOverride': p.cloud,
           'areaData': area_label(ptr), 'enemyData': enemy_label(ptr), 'areaPointer': '$%02x' % ptr}
    init_terrain, init_bgs = p.terrain, p.bg_scenery
    if single_screen:
        p.run(max_cols=16)
    else:
        p.run()
    x0 = entry_page * 16
    cols = sorted(c for c in p.columns if c >= x0)
    width = len(cols)
    rows = [['.'] * width for _ in range(15)]
    contents = []
    for i, c in enumerate(cols):
        for r, m in enumerate(p.columns[c]):
            ch = mt_char(m, p.atype)
            tag = p.tags.get((c, r))
            if tag and tag[0] == m:
                ch = tag[1]
            rows[r + 2][i] = ch
            if m in CONTENT_OF:
                contents.append({'x': i, 'y': r + 2, 'kind': CONTENT_OF[m]})

    # objects recorded by the area handlers
    objects, pipes = [], []
    for e in p.events:
        x = e['x'] - x0
        if x < 0 or x >= width:
            continue
        k = e['kind']
        if k == 'castle':
            objects.append({'type': 'castle', 'x': x, 'y': e['row'], 'size': e['size'],
                            'doorX': x + 2, 'note': 'x/y = top-left of the 5-wide castle; y row 2 = big, 8 = small'})
        elif k == 'flagpole':
            objects.append({'type': 'flagpole', 'x': x, 'flagX': e['flagX'] - x0})
        elif k == 'star_flag':
            objects.append({'type': 'castle_star_flag', 'x': x, 'y': 9})
        elif k == 'vpipe':
            if e['enterable']:
                pipes.append({'x': x, 'y': e['top'], 'dir': 'down'})
            if e['piranha']:
                objects.append({'type': 'pipe_piranha', 'x': x + 0.5, 'y': e['top'],
                                'note': 'spawned by the pipe object (AreaNumber|WorldNumber != 0)'})
        elif k == 'side_pipe':
            pipes.append({'x': x, 'y': e['top'], 'dir': 'right', 'intro': e['intro']})
        elif k == 'bowser_bridge':
            objects.append({'type': 'bowser_bridge', 'x0': x, 'x1': x + 12, 'y': e['row']})
        elif k == 'axe':
            objects.append({'type': 'axe', 'x': x, 'y': e['row']})
        elif k == 'warp_zone':
            objects.append({'type': 'warp_zone', 'x': x, 'worlds': e['worlds'],
                            'note': 'ScrollLockObject_Warp: shows WELCOME TO WARP ZONE, kills piranhas, toggles scroll lock'})
        elif k == 'scroll_lock_toggle':
            objects.append({'type': 'scroll_lock_toggle', 'x': x, 'warp': e['warp']})
        elif k == 'jumpspring':
            objects.append({'type': 'jumpspring', 'x': x, 'y': e['row']})
        elif k == 'cannon':
            objects.append({'type': 'cannon', 'x': x, 'y': e['row'], 'height': e['height']})
        elif k == 'hidden_1up_block':
            objects.append({'type': 'hidden_1up', 'x': x, 'y': e['row'], 'rendered': e['rendered'],
                            'note': 'only exists while Hidden1UpFlag is set (game start / after a warp / '
                                    'enough coins in the previous x-3); consumed once rendered'})
        elif k == 'frenzy':
            objects.append({'type': 'frenzy', 'x': x, 'frenzy': e['frenzy']})
        elif k == 'loop_check':
            objects.append({'type': 'loop_check', 'x': x})
        elif k in ('balance_rope', 'pulley_rope'):
            objects.append({'type': k, 'x': x, **{kk: v for kk, v in e.items() if kk not in ('kind', 'x')}})

    # enemies
    entries = parse_enemy_data(ptr)
    screen_right = entry_page * 256 + 255
    enemies, eobjs = expand_enemies(entries, p.atype, screen_right, p.atype == 3)
    for lst in (enemies, eobjs):
        for d in lst:
            for key in ('x', 'dataX'):
                if key in d:
                    d[key] = d[key] - x0
            if 'rangeX' in d:
                d['rangeX'] = [v - x0 for v in d['rangeX']]
    enemies = [d for d in enemies if -4 <= d['x'] < width + 4]
    eobjs = [d for d in eobjs if -4 <= d['x'] < width + 4]
    objects.extend(eobjs)
    pointers = [dict(kind='area_pointer', x=e['px'] / 16 - x0, ptr='$%02x' % e['ptr'], world=e['world'] + 1,
                     entryPage=e['entryPage'], usedInWorld1=e['world'] == WORLD,
                     raw=['$%02x' % b for b in e['raw']])
                for e in entries if e['kind'] == 'area_pointer']

    timer = tab('GameTimerData')[p.timer_setting] * 100 if p.timer_setting else None
    area = {
        'id': area_id,
        'theme': THEMES[p.atype],
        'bg': bg_name(p.atype, hdr['bgColorCtrl']),
        'scenery': SCENERY[init_bgs],
        'style': 'cloud' if p.cloud else STYLE[p.style],
        'floor': {'terrainCtrl': init_terrain, 'solidRows': terrain_rows(init_terrain),
                  'changes': [dict(c, x=c['x'] - x0, **({'solidRows': terrain_rows(c['terrain'])} if 'terrain' in c else {}))
                              for c in p.attr_log if c['x'] >= x0]},
        'width': width,
        'x0': x0,
        'scrollLock': single_screen,
        'rows': [''.join(r) for r in rows],
        'contents': contents,
        'pipes': pipes,
        'objects': objects,
        'enemies': enemies,
        'time': timer,
        'start': start_info(p, alt, entry_page, x0),
        'header': hdr,
        'meta': {'enemyAreaPointers': pointers, 'areaNumber': area_number,
                 'entryPage': entry_page, 'loopCommand': p.loop_command},
    }
    return area, p


def world1():
    w1 = tab('World1Areas')
    areas = {}
    parsers = {}

    def add(aid, *a, **kw):
        areas[aid], parsers[aid] = build_area(aid, *a, **kw)
        return areas[aid]

    # main areas in AreaNumber order; header entrance ctrl 6/7 = pipe intro to the next AreaNumber
    level_of = {}
    lvl = 0
    names = {}
    for an, ptr in enumerate(w1):
        lid = '1-%d' % (lvl + 1)
        p = AreaParser(ptr, an)
        intro = p.entrance_ctrl in (6, 7)
        names[an] = lid + ('/intro' if intro else '/main')
        level_of[an] = lid
        if not intro:
            lvl += 1
    for an, ptr in enumerate(w1):
        add(names[an], ptr, an)

    # sub-areas reachable through enemy-data area pointers (world-1 entries only)
    subs = []
    for an, ptr in enumerate(w1):
        for e in areas[names[an]]['meta']['enemyAreaPointers']:
            if not e['usedInWorld1']:
                continue
            dptr = int(e['ptr'][1:], 16)
            lid = level_of[an]
            if area_type_of(dptr) == 2 and dptr != ptr and dptr not in w1:
                sub = lid + '/coinroom'
                add(sub, dptr, an, entry_page=e['entryPage'], alt=1, single_screen=True)
            else:
                sub = lid + '/exit'
                add(sub, dptr, an, entry_page=e['entryPage'], alt=2)
            subs.append((names[an], e, sub))

    # where does each sub-area's own world-1 pointer lead back to?
    def resolve(ptr, page, an):
        for aid, a in areas.items():
            if a['header']['areaData'] == area_label(ptr) and a['meta']['areaNumber'] == an \
                    and a['x0'] <= page * 16 < a['x0'] + a['width']:
                return aid
        return None

    # pipe destinations (heuristic: last world-1 pointer at or before the pipe + 11 columns,
    # i.e. what the enemy parser has read by the time Mario stands on the pipe)
    for aid, a in areas.items():
        an = a['meta']['areaNumber']
        ptrs = [e for e in a['meta']['enemyAreaPointers'] if e['usedInWorld1']]
        warp = next((o for o in a['objects'] if o['type'] == 'warp_zone'), None)
        if warp:  # warp pipes sit between the preceding scroll lock and the warp-zone object
            lock = max(o['x'] for o in a['objects'] if o['type'] == 'scroll_lock_toggle' and o['x'] < warp['x'])
            warp['pipesFromX'] = lock
        for pipe in a['pipes']:
            if pipe.get('intro'):
                pipe['to'] = names[an + 1]
                pipe['how'] = 'intro auto-walk; NextArea (AreaNumber+1)'
                pipe['entryPage'] = 0
                continue
            if warp and pipe['dir'] == 'down' and warp['pipesFromX'] <= pipe['x'] < warp['x']:
                pos = (pipe['x'] + a['x0']) * 16 % 256
                k = 0 if pos < 0x60 else (1 if pos < 0xa0 else 2)
                pipe['to'] = 'world %d' % warp['worlds'][k]
                pipe['warpWorld'] = warp['worlds'][k]
                pipe['entryPage'] = 0
                warp['screenX0'] = (pipe['x'] + a['x0']) // 16 * 16 - a['x0']
                continue
            limit = pipe['x'] + 11 if not a['scrollLock'] else 16 + 3
            cand = [e for e in ptrs if e['x'] <= limit]
            if not cand:
                continue
            e = cand[-1]
            dptr = int(e['ptr'][1:], 16)
            dest = resolve(dptr, e['entryPage'], an)
            pipe['to'] = dest
            pipe['entryPage'] = e['entryPage']
            if dest:
                st = areas[dest]['start'] if areas[dest]['x0'] == e['entryPage'] * 16 else None
                if st is None:  # re-entry into the same area at another page (e.g. coin room return)
                    alt = 2 if pipe['dir'] == 'right' or area_type_of(dptr) != 2 else 1
                    alt = 1 if area_type_of(dptr) == 2 and dptr == 0xc2 else alt
                    st = start_info(parsers[dest], 2 if a['scrollLock'] else 1, e['entryPage'], areas[dest]['x0'])
                pipe['entry'] = {'x': st['x'], 'y': st['y'], 'mode': st['mode']}

    # halfway pages (HalfwayPageNybbles; the restart is at page*16 + 2.5, entrance ctrl 2)
    hp = tab('HalfwayPageNybbles')[WORLD * 2: WORLD * 2 + 2]
    halfway = [hp[0] >> 4, hp[0] & 15, hp[1] >> 4, hp[1] & 15]
    levels = {}
    for an in range(len(w1)):
        lid = level_of[an]
        L = levels.setdefault(lid, {'areas': [], 'start': names[an]})
        L['areas'].append(names[an])
    for src, e, sub in subs:
        levels[level_of[areas[src]['meta']['areaNumber']]]['areas'].append(sub)
    for i, lid in enumerate(sorted(levels)):
        L = levels[lid]
        main = next(a for a in L['areas'] if a.endswith('/main'))
        L['main'] = main
        L['time'] = areas[L['start']]['time'] or areas[main]['time']
        L['halfwayPage'] = halfway[i]
        L['halfwayStart'] = {'area': main, 'x': halfway[i] * 16 + 2.5, 'y': 12} if halfway[i] else None
        L['next'] = '1-%d' % (i + 2) if i < 3 else '2-1'
        L['entries'] = [{'area': sub, 'from': src, 'pointer': e['raw'], 'entryPage': e['entryPage']}
                        for src, e, sub in subs if level_of[areas[src]['meta']['areaNumber']] == lid]
    return areas, levels


# ----------------------------------------------------------------------------
# ASCII rendering
# ----------------------------------------------------------------------------

OVERLAY = {'goomba': 'G', 'koopa': 'K', 'koopa_red': 'R', 'paratroopa_green_hop': 'V', 'paratroopa_red_fly': 'Y',
           'paratroopa_green_fly': 'v', 'piranha': 'p', 'bowser': 'Z', 'buzzy': 'z', 'hammer_bro': 'H',
           'podoboo': 'd'}


def render_txt(areas, levels):
    out = ['World 1 areas decoded from smbdis.asm (layout reference only).',
           'Tiles: ' + '  '.join('%s=%s' % (k, v.split(' (')[0]) for k, v in LEGEND.items()),
           'Overlay (txt only): G goomba, K green koopa, R red koopa, V green hopping paratroopa, '
           'Y red flying paratroopa, v green flying paratroopa, p piranha, Z bowser, '
           '~ lift (width shown), f firebar pivot, A toad, M Mario start, $ warp-zone trigger', '']
    for aid, a in areas.items():
        w = a['width']
        grid = [list(r) for r in a['rows']]

        def put(x, y, ch):
            xi, yi = int(x), int(y)
            if 0 <= xi < w and 0 <= yi < 15:
                grid[yi][xi] = ch
        for e in a['enemies']:
            put(e['x'], e['y'], OVERLAY.get(e['type'], 'E'))
        for o in a['objects']:
            if o['type'] == 'pipe_piranha':
                put(o['x'], o['y'] - 1, 'p')
            elif o['type'] == 'lift':
                for k in range(int(o['width'] + 0.5)):
                    put(o['x'] + k, o['y'], '~')
            elif o['type'] == 'firebar':
                put(o['x'], o['y'], 'f')
            elif o['type'] == 'toad':
                put(o['x'], 12, 'A')
            elif o['type'] == 'warp_zone_trigger':
                put(o['x'], 1, '$')
        s = a['start']
        put(s['x'], min(max(s['y'], 0), 14), 'M')
        out.append('=' * 80)
        out.append('%s  theme=%s bg=%s scenery=%s style=%s width=%d x0=%d time=%s scrollLock=%s' % (
            aid, a['theme'], a['bg'], a['scenery'], a['style'], w, a['x0'], a['time'], a['scrollLock']))
        out.append('start: %s' % json.dumps(s))
        out.append('floor: %s' % json.dumps(a['floor']))
        tens = ''.join(str((i // 10) % 10) if i % 10 == 0 else ' ' for i in range(w))
        ones = ''.join(str(i % 10) for i in range(w))
        out.append('    ' + tens)
        out.append('    ' + ones)
        for y in range(15):
            out.append('%2d  %s' % (y, ''.join(grid[y])))
        out.append('contents: ' + ', '.join('(%d,%d)%s' % (c['x'], c['y'], c['kind']) for c in a['contents']))
        out.append('pipes:')
        out.extend('  ' + json.dumps(p) for p in a['pipes'])
        out.append('objects:')
        out.extend('  ' + json.dumps(o) for o in a['objects'])
        out.append('enemies:')
        out.extend('  ' + json.dumps(e) for e in a['enemies'])
        out.append('area pointers in enemy data:')
        out.extend('  ' + json.dumps(e) for e in a['meta']['enemyAreaPointers'])
        out.append('')
    out.append('levels:')
    out.extend('  %s: %s' % (k, json.dumps(v)) for k, v in levels.items())
    return '\n'.join(out) + '\n'


# ----------------------------------------------------------------------------
# Comparison with the hand-made src/levels/w1_1.js
# ----------------------------------------------------------------------------

def handmade_1_1(path):
    """Interpret the LevelBuilder calls in w1_1.js (same semantics as src/level.js)."""
    src = open(path).read()
    res = {}
    for name in ('main', 'coinroom'):
        m = re.search(r'\b%s\(\)\s*\{(.*?)\n      \},' % name, src, re.S)
        body = m.group(1)
        w = int(re.search(r'new B\((\d+)\)', body).group(1))
        g = [['.'] * w for _ in range(15)]
        cont, enemies, pipes, extra = {}, [], [], {}

        def setc(x, y, c):
            if 0 <= x < w and 0 <= y < 15:
                g[y][x] = c
        body_nc = re.sub(r'//.*', '', body)
        for meth, args in re.findall(r'\.?\b(\w+)\(([^()]*)\)', body_nc):
            nums = [float(v) for v in re.findall(r'(?<![\w.])-?\d+(?:\.\d+)?', args.split('{')[0])]
            strs = re.findall(r"'([^']*)'", args)
            n = [int(v) if v == int(v) else v for v in nums]
            if meth == 'ground':
                for x in range(n[0], n[1] + 1):
                    for y in range(n[2] if len(n) > 2 else 13, 15):
                        setc(x, y, '#')
            elif meth == 'fill' and 'BRICK' in args:
                for x in range(n[0], n[1] + 1):
                    for y in range(n[2], n[3] + 1):
                        setc(x, y, 'B')
            elif meth == 'q':
                setc(n[0], n[1], '?')
                cont[(n[0], n[1])] = strs[0] if strs else 'coin'
            elif meth == 'brick':
                setc(n[0], n[1], 'B')
                if strs:
                    cont[(n[0], n[1])] = strs[0]
            elif meth == 'bricks':
                for x in range(n[0], n[1] + 1):
                    setc(x, n[2], 'B')
            elif meth == 'coins':
                for x in range(n[0], n[1] + 1):
                    setc(x, n[2], 'o')
            elif meth == 'hidden':
                setc(n[0], n[1], 'h')
                cont[(n[0], n[1])] = strs[0] if strs else 'coin'
            elif meth == 'pipe':
                x, top = n[0], n[1]
                bottom = n[2] if len(n) > 2 else 12
                setc(x, top, '[')
                setc(x + 1, top, ']')
                for y in range(top + 1, bottom + 1):
                    setc(x, y, '{')
                    setc(x + 1, y, '}')
                pipes.append({'x': x, 'y': top, 'enter': '{' in args})
            elif meth == 'sidePipe':
                x, y = n[0], n[1]
                setc(x, y, 'm'); setc(x, y + 1, 'n'); setc(x + 1, y, 's'); setc(x + 1, y + 1, 't')
                setc(x + 2, y, 'j'); setc(x + 2, y + 1, 'k')
                for yy in range(y):
                    setc(x + 2, yy, '{'); setc(x + 3, yy, '}')
                setc(x + 3, y, '}'); setc(x + 3, y + 1, '}')
                pipes.append({'x': x, 'y': y, 'side': True})
            elif meth in ('stairsUp', 'stairsDown'):
                x, cnt = n[0], n[1]
                for i in range(cnt):
                    h = min(i + 1, cnt) if meth == 'stairsUp' else cnt - i
                    for y in range(12 - h + 1, 13):
                        setc(x + i, y, 'X')
            elif meth == 'column':
                for y in range(n[1], 13):
                    setc(n[0], y, 'X')
            elif meth == 'flagpole':
                setc(n[0], 12, 'X'); setc(n[0], 2, 'P')
                for y in range(3, 12):
                    setc(n[0], y, '|')
                extra['flagpole'] = n[0]
            elif meth == 'castle':
                extra['castle'] = n[0]
            elif meth == 'g':
                pass
            elif meth == 'enemy' and len(n) >= 2:
                enemies.append((strs[0], n[0], n[1]))
        for x, y in re.findall(r'\bg\((\d+(?:\.\d+)?)(?:,\s*(\d+))?\)', body_nc):
            enemies.append(('goomba', float(x), int(y) if y else 12))
        st = re.search(r'start:\s*\{([^}]*)\}', body)
        if st:
            extra['start'] = st.group(1).strip()
        res[name] = {'grid': [''.join(r) for r in g], 'w': w, 'contents': cont, 'enemies': enemies,
                     'pipes': pipes, 'extra': extra}
    return res


def runs(cells):
    """Group sorted (x, y) cells into 'x0-x1@y' strings."""
    out, cells = [], sorted(cells, key=lambda c: (c[1], c[0]))
    i = 0
    while i < len(cells):
        x0, y = cells[i]
        j = i
        while j + 1 < len(cells) and cells[j + 1] == (cells[j][0] + 1, y):
            j += 1
        out.append('%d-%d@%d' % (x0, cells[j][0], y) if j > i else '%d@%d' % (x0, y))
        i = j + 1
    return out


def compare_1_1(areas):
    path = os.path.join(REPO, 'src', 'levels', 'w1_1.js')
    hand = handmade_1_1(path)
    lines = ['Comparison: decoded 1-1 vs src/levels/w1_1.js']
    norm = {'F': 'X', '*': '.'}
    for name, aid in (('main', '1-1/main'), ('coinroom', '1-1/coinroom')):
        a, h = areas[aid], hand[name]
        lines.append('-- %s: decoded width %d, hand-made width %d' % (aid, a['width'], h['w']))
        diffs = {}
        for y in range(15):
            for x in range(max(a['width'], h['w'])):
                d = a['rows'][y][x] if x < a['width'] else '.'
                d = norm.get(d, d)
                hh = h['grid'][y][x] if x < h['w'] else '.'
                if d != hh:
                    diffs.setdefault((hh, d), []).append((x, y))
        if not diffs:
            lines.append('   tiles: identical')
        for (hh, d), cells in sorted(diffs.items(), key=lambda kv: (kv[1][0][0], kv[1][0][1])):
            lines.append("   tiles hand '%s' vs decoded '%s': %s" % (hh, d, ' '.join(runs(cells))))
        dc = {(c['x'], c['y']): c['kind'] for c in a['contents']}
        hc = {k: ('multicoin' if v == 'coins' else v) for k, v in h['contents'].items()}
        for k in sorted(set(dc) | set(hc)):
            if dc.get(k) != hc.get(k):
                lines.append('   contents at %s: hand %s vs decoded %s' % (k, hc.get(k), dc.get(k)))
        # enemies
        de = sorted((e['type'], e['x'], e['y']) for e in a['enemies'] if not e.get('neverSpawns'))
        he = sorted(h['enemies'])
        if de != he:
            only_h = [e for e in he if e not in de]
            only_d = [e for e in de if e not in he]
            lines.append('   enemies only in hand-made: %s' % only_h)
            lines.append('   enemies only in decoded  : %s' % only_d)
        else:
            lines.append('   enemies: identical')
        if 'flagpole' in h['extra']:
            fp = next(o['x'] for o in a['objects'] if o['type'] == 'flagpole')
            cs = next(o for o in a['objects'] if o['type'] == 'castle')
            lines.append('   flagpole: hand %s decoded %s; castle: hand %s decoded x=%s (%s)' % (
                h['extra']['flagpole'], fp, h['extra']['castle'], cs['x'], cs['size']))
        if 'start' in h['extra'] or name == 'main':
            lines.append('   start: hand {%s} decoded %s' % (h['extra'].get('start', 'x: 2.5, y: 12 (default)'),
                                                          json.dumps(a['start'])))
        lines.append('   pipes hand %s' % h['pipes'])
        lines.append('   pipes decoded %s' % [{k: v for k, v in p.items() if k in ('x', 'y', 'dir', 'to')} for p in a['pipes']])
    return '\n'.join(lines)


def main():
    areas, levels = world1()
    doc = {
        'source': 'smbdis.asm (doppelganger SMB disassembly); layout reference only',
        'coords': 'x = 16px columns from the area/slice start (x0 = absolute column in the source area), '
                  'y = 16px rows, row 0 = top of screen; area-object row 0 = our row 2; ground top = row 13. '
                  'Enemy y = the row the enemy body (lowest 16px) occupies; lift/firebar y = pixel y / 16.',
        'legend': LEGEND,
        'levels': levels,
        'areas': areas,
    }
    with open(os.path.join(HERE, 'levels_w1.json'), 'w') as f:
        json.dump(doc, f, indent=1)
    with open(os.path.join(HERE, 'levels_w1.txt'), 'w') as f:
        f.write(render_txt(areas, levels))
    print(compare_1_1(areas))
    print('\nwrote', os.path.join(HERE, 'levels_w1.json'), 'and levels_w1.txt')
    for aid, a in areas.items():
        print('  %-14s width %3d  enemies %2d  objects %2d  pipes %d' % (
            aid, a['width'], len(a['enemies']), len(a['objects']), len(a['pipes'])))


if __name__ == '__main__':
    main()
