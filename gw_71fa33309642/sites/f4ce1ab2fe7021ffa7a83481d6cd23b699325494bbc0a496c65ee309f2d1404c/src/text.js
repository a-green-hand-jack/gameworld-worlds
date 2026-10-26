// Bitmap text with assets/ui/font.png (8x8 glyphs, order below); falls back to a canvas font.
(function () {
  const SMB = window.SMB;
  const ORDER = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-x!c.';
  const MAP = { '×': 'x', '©': 'c' };

  SMB.Text = {
    draw(ctx, text, x, y, color) {
      const img = SMB.Assets.get('ui/font');
      x = Math.round(x); y = Math.round(y);
      for (let i = 0; i < text.length; i++) {
        let ch = text[i];
        if (MAP[ch]) ch = MAP[ch];
        else if (ch !== 'x' && ch !== 'c') ch = ch.toUpperCase();
        const gx = x + i * 8;
        if (ch === ' ') continue;
        const idx = ORDER.indexOf(ch);
        if (img && idx >= 0) {
          ctx.drawImage(img, idx * 8, 0, 8, 8, gx, y, 8, 8);
          if (color) { /* font is white; colour is used only by the fallback */ }
        } else {
          ctx.fillStyle = color || '#fcfcfc';
          ctx.font = 'bold 8px monospace';
          ctx.textBaseline = 'top';
          const shown = ch === 'x' ? '×' : ch === 'c' ? '©' : ch;
          ctx.fillText(shown, gx, y);
        }
      }
    },
    center(ctx, text, y, color) { this.draw(ctx, text, 128 - text.length * 4, y, color); },
  };
})();
