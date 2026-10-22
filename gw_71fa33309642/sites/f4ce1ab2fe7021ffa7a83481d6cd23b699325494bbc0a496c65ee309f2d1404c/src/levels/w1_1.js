// World 1-1. Coordinates are tiles; ground top is row 13, so things standing on the ground occupy row 12.
(function () {
  const SMB = window.SMB;
  const B = SMB.LevelBuilder;

  SMB.LevelDefs['1-1'] = {
    world: 1, stage: 1, time: 400, next: '1-2',
    startArea: 'main',
    checkpoint: 82,          // restart column after dying past the middle
    areas: {
      main() {
        const b = new B(212);
        b.overworldScenery(0, 205, (n, x) => x > 196 && n.startsWith('bush'));
        b.ground(0, 68).ground(71, 85).ground(89, 152).ground(155, 211);

        b.q(16, 9, 'coin');
        b.brick(20, 9).q(21, 9, 'power').brick(22, 9).q(23, 9, 'coin').brick(24, 9);
        b.q(22, 5, 'coin');

        b.pipe(28, 11).pipe(38, 10).pipe(46, 9);
        b.pipe(57, 9, 12, { to: { area: 'coinroom' } });

        b.hidden(64, 8, '1up');

        b.brick(77, 9).q(78, 9, 'power').brick(79, 9);
        b.bricks(80, 87, 5);
        b.bricks(91, 93, 5).q(94, 5, 'coin');
        b.brick(94, 9, 'coins');
        b.brick(100, 9).brick(101, 9, 'star');
        b.q(106, 9, 'coin').q(109, 9, 'coin').q(112, 9, 'coin').q(109, 5, 'power');
        b.brick(118, 9);
        b.bricks(121, 123, 5);
        b.brick(128, 5).q(129, 5, 'coin').q(130, 5, 'coin').brick(131, 5);
        b.bricks(129, 130, 9);

        b.stairsUp(134, 4).stairsDown(140, 4);
        b.stairsUp(148, 4).column(152, 9).stairsDown(155, 4);

        b.pipe(163, 11);
        b.bricks(168, 169, 9).q(170, 9, 'coin').brick(171, 9);
        b.pipe(179, 11);

        b.stairsUp(181, 8).column(189, 5);
        b.flagpole(198);
        b.castle(202);

        const g = (x, y) => b.enemy('goomba', x, y === undefined ? 12 : y);
        g(22); g(40); g(51); g(52.5);
        g(80, 4); g(82, 4);
        g(97); g(98.5);
        b.enemy('koopa', 107, 12);
        g(114); g(115.5); g(124); g(125.5); g(128); g(129.5);
        g(174); g(175.5);
        return { def: { name: 'main', theme: 'overworld', bg: '#5c94fc', music: 'overworld' }, b };
      },

      coinroom() {
        const b = new B(16);
        b.ground(0, 15);
        b.fill(0, 0, 2, 12, SMB.T.BRICK);
        b.bricks(4, 10, 2);
        b.fill(4, 10, 10, 12, SMB.T.BRICK);
        b.coins(5, 9, 5).coins(4, 10, 7).coins(4, 10, 9);
        b.sidePipe(13, 11, { to: { area: 'main', x: 163, exitPipe: true } });
        return {
          def: { name: 'coinroom', theme: 'underground', bg: '#000000', music: 'underground', scrollLock: true,
            start: { x: 1.5, y: 1, drop: true } },
          b,
        };
      },
    },
  };
})();
