#!/usr/bin/env python3
"""Generate src/levels/w1_2.js .. w1_4.js from tools/levels_w1.json (decoded by tools/smb_levels.py).

The decoded tile grids are used as they are; this script adds what the engine needs on top: pipe destinations,
enemies, lifts, firebars, the warp zone, the bridge and axe, castles, flagpoles and background scenery.
Run from the repository root: python3 tools/gen_levels.py
"""
import json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = json.load(open(os.path.join(ROOT, 'tools', 'levels_w1.json')))
BG = {'sky': '#5c94fc', 'black': '#000000'}
CONTENT = {'coin': 'coin', 'power': 'power', 'star': 'star', '1up': '1up', 'multicoin': 'coins'}
ENEMY = {'goomba': 'goomba', 'koopa': 'koopa', 'koopa_red': 'redkoopa', 'paratroopa_red_fly': 'redparakoopa',
         'paratroopa_green': 'parakoopa', 'bowser': 'bowser', 'bowser_flame': 'flamegen'}
# Background pattern repeated every 48 columns (same as Builder.overworldScenery).
PATTERN = [('hill_large', 0, 10.8125), ('cloud_1', 8, 3), ('bush_3', 11, 12), ('hill_small', 16, 11.8125),
           ('cloud_1', 19, 2), ('bush_1', 23, 12), ('cloud_3', 27, 3), ('cloud_2', 36, 2), ('bush_2', 41, 12)]
FIREBAR_PERIOD = 205  # frames per turn: spin speed $28 adds one of 32 steps every 6.4 frames


def js(v):
    return json.dumps(v, separators=(', ', ': '))


def num(v):
    return ('%g' % v)


def scenery(a, rows):
    kind = a['scenery']
    if kind == 'none':
        return []
    out = []
    w, x0 = a['width'], a['x0']
    for base in range(-48, w + x0 + 48, 48):
        for name, dx, y in PATTERN:
            x = base + dx - x0
            if x < -5 or x >= w:
                continue
            if kind == 'clouds' and not name.startswith('cloud'):
                continue
            if not name.startswith('cloud'):
                # Hills and bushes only where they stand on ground, not over pits or behind stairs.
                span = {'hill_large': 5, 'hill_small': 3}.get(name, int(name[-1]) + 2 if name.startswith('bush') else 1)
                cols = range(max(0, x), min(w, x + span))
                if any(rows[13][c] != '#' for c in cols) or any(rows[12][c] != '.' for c in cols if name.startswith('bush')):
                    continue
            out.append((name, x, y))
    return out


def find_pipe_top(rows, x_from):
    for x in range(max(0, x_from), len(rows[0])):
        for y in range(15):
            if rows[y][x] == '[':
                return x
    raise ValueError('no pipe at or after %d' % x_from)


def area_js(level, name, a, extra):
    rows = [r.replace('*', '.') for r in a['rows']]   # the castle doorway stop block: the engine ends the walk itself
    L = []
    say = L.append
    say('      %s() {' % name)
    say('        const b = B.fromRows([')
    for r in rows:
        say('          %s,' % js(r))
    say('        ]);')
    for c in a['contents']:
        say('        b.contents[%s] = %s;' % (js('%d,%d' % (c['x'], c['y'])), js(CONTENT[c['kind']])))
    for n, x, y in scenery(a, rows):
        say('        b.scene(%s, %s, %s);' % (js(n), num(x), num(y)))
    for o in a['objects']:
        if o.get('hard'):
            continue
        t = o['type']
        if t == 'castle':
            if o['x'] <= 1:
                say('        b.scene(\'castle_small\', %d, 8);' % o['x'])   # the castle Mario sets out from
            else:
                say('        b.castle(%d%s);' % (o['x'], ', true' if o['size'] == 'big' else ''))
        elif t == 'flagpole':
            say('        b.flagpole(%d);' % o['x'])
        elif t == 'pipe_piranha':
            say('        b.enemy(\'piranha\', %d, %d);' % (math.floor(o['x']), o['y']))
        elif t == 'firebar':
            say('        b.enemy(\'firebar\', %s, %s, %s);' % (num(o['x']), num(o['y']), js(
                {'long': o['length'] == 'long', 'ccw': o['dir'] == 'ccw', 'period': FIREBAR_PERIOD})))
        elif t == 'toad':
            say('        b.enemy(\'toad\', %s, %s);' % (num(o['x']), num(o['y'])))
        elif t == 'bowser_bridge':
            chain = next(((x, y) for y in range(15) for x in range(len(rows[0])) if rows[y][x] == 'c'), None)
            say('        b.bridge = %s;' % js({'x0': o['x0'], 'x1': o['x1'], 'y': o['y'],
                                               'chain': {'x': chain[0], 'y': chain[1]} if chain else None}))
        elif t == 'axe':
            say('        b.axe = %s;' % js({'x': o['x'], 'y': o['y']}))
    for e in sorted(a['enemies'], key=lambda e: e['x']):
        if e.get('hard') or e.get('neverSpawns') or e['type'] == 'podoboo':
            continue
        say('        b.enemy(%s, %s, %s);' % (js(ENEMY[e['type']]), num(e['x']), num(e['y'])))
    for p in a['pipes']:
        to = extra['pipes'](p, rows) if 'pipes' in extra else None
        if to is None:
            continue
        entry = {'x': p['x'], 'y': p['y'], 'dir': p['dir'], 'to': to}
        say('        b.pipes.push(%s);' % js(entry))
    lifts = []
    for o in a['objects']:
        if o['type'] != 'lift' or o.get('hard'):
            continue
        k = o['kind']
        if k in ('large_down', 'large_up'):
            lifts.append({'kind': 'down' if k == 'large_down' else 'up', 'x': o['x'], 'y': o['y'], 'width': o['width']})
        elif k == 'vertical':
            y0, y1 = o['rangeY_approx']
            lifts.append({'kind': 'vert', 'x': o['x'], 'y': y0, 'range': y1 - y0, 'width': o['width']})
        elif k == 'horizontal':
            x0, x1 = o['rangeX']
            lifts.append({'kind': 'horiz', 'x': round(x0, 2), 'y': o['y'], 'range': round(x1 - x0, 2),
                          'width': o['width'], 'phase': round(math.pi, 4)})   # starts at the right end
        else:
            raise ValueError(k)
    d = {'name': name, 'theme': a['theme'], 'bg': BG[a['bg']], 'music': a['theme']}
    st = a.get('start')
    if st and st['mode'] == 'normal' and (st['x'], st['y']) != (2.5, 12):
        d['start'] = {'x': st['x'], 'y': st['y']}
    d.update(extra.get('def', {}))
    defs = js(d)[:-1]
    if lifts:
        defs += ',\n          makePlatforms: () => [%s]' % ', '.join('new SMB.Lift(%s)' % js(l) for l in lifts)
    defs += ' }'
    say('        return { def: %s, b };' % defs)
    say('      },')
    return L


def level_js(level, cfg):
    lv = D['levels'][level]
    L = ['// World %s, generated by tools/gen_levels.py from tools/levels_w1.json (do not edit by hand).' % level,
         '(function () {', '  const SMB = window.SMB;', '  const B = SMB.LevelBuilder;', '']
    head = {'world': 1, 'stage': int(level[-1]), 'time': lv['time'], 'next': cfg.get('next'),
            'startArea': lv['start'].split('/')[1]}
    if lv['halfwayStart']:
        head['checkpoint'] = math.floor(lv['halfwayStart']['x'])
        head['checkpointArea'] = lv['halfwayStart']['area'].split('/')[1]
    L.append('  SMB.LevelDefs[%s] = Object.assign(%s, { areas: {' % (js(level), js(head)))
    for aid in lv['areas']:
        name = aid.split('/')[1]
        L += area_js(level, name, D['areas'][aid], cfg.get(name, {}))
    L += ['  } });', '})();', '']
    return '\n'.join(L)


def main_1_2_pipes(p, rows):
    if p.get('warpWorld'):
        return {'level': '%d-1' % p['warpWorld']}
    if p['x'] in (178, 182):   # the other two pipes of the warp zone (the decoder gives only the last one's world)
        return {'level': {178: '4-1', 182: '3-1'}[p['x']]}
    if p['to'] == '1-2/coinroom':
        return {'area': 'coinroom'}
    if p['to'] == '1-2/exit':
        return {'area': 'exit', 'x': 3, 'exitPipe': True}
    raise ValueError(p)


def coinroom_pipes(main_rows):
    def f(p, rows):
        x = find_pipe_top(main_rows, p['entryPage'] * 16)
        return {'area': 'main', 'x': x, 'exitPipe': True}
    return f


LEVELS = {
    '1-2': {
        'next': '1-3',
        'intro': {'def': {'autoWalk': True, 'noTimer': True}, 'pipes': lambda p, rows: {'area': 'main'}},
        'main': {'def': {'start': {'x': 2.5, 'y': 1, 'drop': True}, 'camMax': 178,
                         'warpZone': {'unlockX': 162, 'ceilingY': 2, 'camMax': 192, 'triggerX': 192,
                                      'textX': 178.75, 'textY': 5,
                                      'pipes': [{'x': 178, 'y': 10, 'world': 4}, {'x': 182, 'y': 10, 'world': 3},
                                                {'x': 186, 'y': 10, 'world': 2}]}},
                 'pipes': main_1_2_pipes},
        'coinroom': {'def': {'scrollLock': True, 'start': {'x': 1.5, 'y': 1, 'drop': True}},
                     'pipes': coinroom_pipes(D['areas']['1-2/main']['rows'])},
        'exit': {},
    },
    '1-3': {'next': '1-4'},
    '1-4': {'next': None},
}

if __name__ == '__main__':
    for lv, cfg in LEVELS.items():
        path = os.path.join(ROOT, 'src', 'levels', 'w%s.js' % lv.replace('-', '_'))
        open(path, 'w').write(level_js(lv, cfg))
        print('wrote', os.path.relpath(path, ROOT))
