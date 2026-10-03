// 共通の小さな道具(数学・乱数・ノイズ・時間の表示など)
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const RG = (G.RG = G.RG || {});
  const U = (RG.U = {});

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smoothstep = (a, b, v) => {
    const t = U.clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  U.wrapAngle = (a) => {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  };
  U.sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  // 目標に向かって一定の速さで近づける
  U.approach = (cur, target, step) =>
    cur < target ? Math.min(cur + step, target) : Math.max(cur - step, target);
  // 時間に依存しないなめらかな追従(k が大きいほど速い)
  U.damp = (cur, target, k, dt) => target + (cur - target) * Math.exp(-k * dt);

  // 区分線形の表 [[x, y], ...] から値を読む
  U.table = (tbl, x) => {
    if (x <= tbl[0][0]) return tbl[0][1];
    const n = tbl.length - 1;
    if (x >= tbl[n][0]) return tbl[n][1];
    for (let i = 0; i < n; i++) {
      const a = tbl[i], b = tbl[i + 1];
      if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    }
    return tbl[n][1];
  };

  // 再現できる乱数(同じ seed なら同じ並び)
  U.rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // 2次元のなめらかなノイズ(地形や質感づくりに使う)
  U.makeNoise = (seed) => {
    const rnd = U.rng(seed);
    const perm = new Uint16Array(512);
    const vals = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      perm[i] = i;
      vals[i] = rnd() * 2 - 1;
    }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    const v = (x, y) => vals[perm[(x & 255) + perm[y & 255]]];
    const n2 = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
      const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
    };
    const fbm = (x, y, oct = 4) => {
      let s = 0, amp = 0.5, f = 1;
      for (let i = 0; i < oct; i++) {
        s += amp * n2(x * f, y * f);
        f *= 2.03;
        amp *= 0.5;
      }
      return s;
    };
    return { n2, fbm };
  };

  // 秒 → "1:23.456"
  U.formatTime = (t) => {
    if (t == null || !isFinite(t)) return '-:--.---';
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
  };
  U.formatDelta = (d) => (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(3);

  U.canvas = (w, h) => {
    const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (c) {
      c.width = w;
      c.height = h;
    }
    return { c, g: c ? c.getContext('2d') : null };
  };

  // 角を丸めた四角形のパス
  U.roundRect = (g, x, y, w, h, r) => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };
})();
