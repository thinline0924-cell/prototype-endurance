// キーボード入力
(function () {
  'use strict';
  const RG = (window.RG = window.RG || {});

  const KEYS = {
    throttle: ['ArrowUp', 'KeyW'],
    brake: ['ArrowDown', 'KeyS'],
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['KeyE', 'ShiftLeft', 'ShiftRight'],
    down: ['KeyQ', 'KeyZ'],
    camera: ['KeyC'],
    look: ['KeyV'],
    reset: ['KeyR'],
    auto: ['KeyM'],
    tcs: ['KeyT'],
    abs: ['KeyB'],
    biasF: ['BracketRight'],
    biasR: ['BracketLeft'],
    lights: ['KeyH'],
    ghost: ['KeyG'],
    pause: ['Escape', 'KeyP'],
    mirror: ['KeyN'],
    hud: ['KeyU'],
  };
  const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);

  class Input {
    constructor() {
      this.down = new Set();
      this.pressed = new Set(); // このフレームで押されたもの
      window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
        if (PREVENT.has(e.code)) e.preventDefault();
        if (!this.down.has(e.code)) this.pressed.add(e.code);
        this.down.add(e.code);
      });
      window.addEventListener('keyup', (e) => this.down.delete(e.code));
      window.addEventListener('blur', () => this.down.clear());
    }
    is(action) {
      return KEYS[action].some((k) => this.down.has(k));
    }
    hit(action) {
      return KEYS[action].some((k) => this.pressed.has(k));
    }
    endFrame() {
      this.pressed.clear();
    }
    // 車への入力
    apply(car) {
      const i = car.in;
      i.throttle = this.is('throttle') ? 1 : 0;
      i.brake = this.is('brake') ? 1 : 0;
      i.steer = (this.is('right') ? 1 : 0) - (this.is('left') ? 1 : 0);
      if (this.hit('up')) i.up = true;
      if (this.hit('down')) i.down = true;
    }
  }
  RG.Input = Input;
})();
