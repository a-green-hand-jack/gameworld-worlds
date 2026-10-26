// Keyboard input mapped to the NES pad. Arrows = d-pad, Z/J/Shift = B (run/fire), X/K/Space = A (jump),
// Enter = Start (pause), M = mute.
(function () {
  const SMB = (window.SMB = window.SMB || {});

  const MAP = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
    KeyZ: 'B', KeyJ: 'B', ShiftLeft: 'B', ShiftRight: 'B',
    KeyX: 'A', KeyK: 'A', Space: 'A',
    Enter: 'start', NumpadEnter: 'start', KeyP: 'start',
    KeyM: 'mute',
  };

  const Input = {
    down: {},     // buttons held now (from events)
    tapped: {},   // pressed since the last logic frame (so a press released within one frame still counts)
    held: {},     // snapshot for this logic frame
    prev: {},     // snapshot of previous logic frame
    pressed(b) { return !!this.held[b] && !this.prev[b]; },
    isDown(b) { return !!this.held[b]; },
    // Called once per logic frame.
    update() {
      this.prev = this.held;
      this.held = Object.assign({}, this.down, this.tapped);
      this.tapped = {};
      // Left+right together cancel out, as on the pad.
      if (this.held.left && this.held.right) { this.held.left = false; this.held.right = false; }
    },
    // Scripted input (tests / demo): set the held buttons directly.
    set(button, state) { this.down[button] = !!state; },
    anyKey: false,
  };

  window.addEventListener('keydown', (e) => {
    const b = MAP[e.code];
    Input.anyKey = true;
    if (b) { if (!e.repeat) Input.tapped[b] = true; Input.down[b] = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    const b = MAP[e.code];
    if (b) { Input.down[b] = false; e.preventDefault(); }
  });
  window.addEventListener('blur', () => { Input.down = {}; Input.tapped = {}; });

  SMB.Input = Input;
})();
