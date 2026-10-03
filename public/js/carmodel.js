// 車の3Dモデルを形の数値から組み立てる(断面をつないだ「ロフト」で曲面のボディを作る)
// ローカル座標:+z が前、+x が左、y が上。原点は重心の真下の地面。
(function () {
  'use strict';
  const RG = (window.RG = window.RG || {});
  const U = RG.U;
  const TX = RG.TX;

  // 数値の表をなめらかにつなぐ(Catmull-Rom)
  function interp(st, key, z) {
    // st は z が大きい順(前→後ろ)
    let k = 0;
    while (k < st.length - 2 && z < st[k + 1].z) k++;
    const p1 = st[k], p2 = st[k + 1];
    const p0 = st[Math.max(0, k - 1)], p3 = st[Math.min(st.length - 1, k + 2)];
    const t = U.clamp((p1.z - z) / (p1.z - p2.z), 0, 1);
    const v = (p) => (p[key] != null ? p[key] : DEF[key]);
    const m1 = (v(p2) - v(p0)) / 2, m2 = (v(p3) - v(p1)) / 2;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * v(p1) + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * v(p2) + (t3 - t2) * m2;
  }
  const DEF = { mid: 0.45, nt: 2.6, nb: 8, nx: 3.2, cx: 0 };

  // 断面(超楕円)をつないで曲面を作る
  function loft(st, { rings = 48, segs = 36, color = null, capFront = true, capRear = true, mirrorX = 1 } = {}) {
    const z0 = st[0].z, z1 = st[st.length - 1].z;
    const pos = [], col = [];
    const ring = [];
    for (let r = 0; r <= rings; r++) {
      const z = U.lerp(z0, z1, r / rings);
      const w = interp(st, 'w', z) / 2, t = interp(st, 't', z), b = interp(st, 'b', z);
      const mid = interp(st, 'mid', z), nt = interp(st, 'nt', z), nb = interp(st, 'nb', z), nx = interp(st, 'nx', z);
      const cx = interp(st, 'cx', z) * mirrorX;
      const ym = b + (t - b) * mid;
      for (let j = 0; j < segs; j++) {
        const th = (j / segs) * Math.PI * 2;
        const c = Math.cos(th), s = Math.sin(th);
        const x = cx + w * Math.sign(c) * Math.pow(Math.abs(c), 2 / nx);
        const y = s >= 0 ? ym + (t - ym) * Math.pow(Math.abs(s), 2 / nt) : ym - (ym - b) * Math.pow(Math.abs(s), 2 / nb);
        pos.push(x, y, z);
        const cc = color ? color(x, y, z) : [1, 1, 1];
        col.push(cc[0], cc[1], cc[2]);
      }
      ring.push({ z, cx, ym });
    }
    const idx = [];
    for (let r = 0; r < rings; r++)
      for (let j = 0; j < segs; j++) {
        const a = r * segs + j, b = r * segs + ((j + 1) % segs), c = a + segs, d = b + segs;
        idx.push(a, c, b, b, c, d);
      }
    const addCap = (r, front) => {
      const ci = pos.length / 3;
      const R = ring[r];
      pos.push(R.cx, R.ym, R.z);
      const cc = color ? color(R.cx, R.ym, R.z) : [1, 1, 1];
      col.push(cc[0], cc[1], cc[2]);
      for (let j = 0; j < segs; j++) {
        const a = r * segs + j, b = r * segs + ((j + 1) % segs);
        if (front) idx.push(ci, a, b);
        else idx.push(ci, b, a);
      }
    };
    if (capFront) addCap(0, true);
    if (capRear) addCap(rings, false);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // 翼の断面(翼型)を押し出す
  function wing(span, chord, thick, angle) {
    const s = new THREE.Shape();
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const x = i / N;
      const yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4);
      const camber = -0.06 * (1 - (2 * x - 1) ** 2);
      if (i === 0) s.moveTo(x * chord, (camber + yt) * chord);
      else s.lineTo(x * chord, (camber + yt) * chord);
    }
    for (let i = N; i >= 0; i--) {
      const x = i / N;
      const yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4);
      const camber = -0.06 * (1 - (2 * x - 1) ** 2);
      s.lineTo(x * chord, (camber - yt) * chord);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: span, bevelEnabled: false, steps: 1 });
    // x: 前後(弦)、y: 上下、z: 幅 → 幅を x に、弦を -z に
    g.translate(-chord / 2, 0, -span / 2);
    g.rotateY(Math.PI / 2);
    g.rotateX(angle);
    return g;
  }

  // ---- 塗装(カラーリング)----
  function liveryFn(type, lv, dims) {
    const B = new THREE.Color(lv.base), A = new THREE.Color(lv.a), C = new THREE.Color(lv.b);
    const dark = new THREE.Color(0x111214);
    const arr = (c) => [c.r, c.g, c.b];
    const { a, b } = dims;
    return (x, y, z) => {
      const ax = Math.abs(x);
      if (y < 0.13) return arr(dark);
      switch (type) {
        case 'hyper': {
          // 下側は黒、斜めの赤い帯
          if (y < 0.24 && ax > 0.4) return arr(C);
          const d = (z - a) * 0.55 + (y - 0.45) * 1.8 + ax * 0.15;
          if (d > -0.55 && d < -0.18) return arr(A);
          if (z < -b - 0.3 && y > 0.35) return arr(A);
          if (y > 0.98) return arr(C);
          return arr(B);
        }
        case 'groupc_rotary': {
          // 2色を斜めに塗り分け+細いライン
          const d = z * 0.7 + y * 1.6 - ax * 0.3;
          if (Math.abs(d - 0.3) < 0.05 || Math.abs(d + 1.2) < 0.05) return arr(new THREE.Color(0xffffff));
          if (d < 0.3 && d > -1.2) return arr(A);
          return arr(B);
        }
        case 'lmp1': {
          if (y < 0.3 && ax > 0.35) return arr(C);
          const band = (z + b) * 0.25 + y;
          if (band > 0.42 && band < 0.52) return arr(A);
          if (y > 0.7 && ax > 0.45) return arr(C);
          return arr(B);
        }
        default: {
          // groupc_turbo:下半分を色、金の細いライン
          const line = y - 0.33 - z * 0.02;
          if (Math.abs(line) < 0.018) return arr(C);
          if (line < 0 && ax > 0.3) return arr(A);
          if (ax < 0.2 && y > 0.5 && z > a - 0.2) return arr(A);
          return arr(B);
        }
      }
    };
  }

  // ---- 塗装をシェーダーで描く(メッシュの細かさに関係なく、くっきり・なめらか)----
  const GLSL_COMMON = `
    varying vec3 vLp;
    uniform vec3 cBase; uniform vec3 cA; uniform vec3 cB; uniform float uA; uniform float uB;
    float st(float v, float e) { float w = max(fwidth(v), 1e-4) * 0.8; return smoothstep(e - w, e + w, v); }
    float band(float v, float a, float b) { return st(v, a) * (1.0 - st(v, b)); }
  `;
  const GLSL = {
    hyper: `vec3 livery(vec3 p) {
      float ax = abs(p.x);
      vec3 c = cBase;
      float rear = p.z - (-uB + 0.55 + p.y * 0.7 - ax * 0.25);
      c = mix(c, cB, 1.0 - st(rear, 0.0));
      c = mix(c, cA, band(rear, 0.0, 0.16));
      c = mix(c, cA, band(p.z - uA - p.y * 0.4 + ax * 0.6, -0.2, -0.08) * st(p.y, 0.3));
      c = mix(c, cB, (1.0 - st(p.y, 0.25)) * st(ax, 0.42));
      c = mix(c, cA, band(p.x, -0.06, 0.06) * st(p.z, uA - 0.2) * st(p.y, 0.3));
      c = mix(c, vec3(0.015), 1.0 - st(p.y, 0.13));
      return c;
    }`,
    groupc_rotary: `vec3 livery(vec3 p) {
      float ax = abs(p.x);
      vec3 c = cBase;
      float d = p.z * 0.7 + p.y * 1.6 - ax * 0.3;
      c = mix(c, cA, band(d, -1.2, 0.3));
      c = mix(c, vec3(0.95), band(d, 0.3, 0.38) + band(d, -1.28, -1.2));
      c = mix(c, cA, band(p.z + p.y * 0.5, uA + 0.6, uA + 0.75));
      c = mix(c, vec3(0.015), 1.0 - st(p.y, 0.13));
      return c;
    }`,
    lmp1: `vec3 livery(vec3 p) {
      float ax = abs(p.x);
      vec3 c = cBase;
      float lineY = 0.46 - (p.z + uB) * 0.035;
      c = mix(c, cB, (1.0 - st(p.y, lineY)) * st(ax, 0.32));
      c = mix(c, cA, band(p.y, lineY, lineY + 0.07) * st(ax, 0.32));
      c = mix(c, cB, st(p.y, 0.74) * st(ax, 0.42));
      c = mix(c, cA, band(p.x, -0.05, 0.05) * st(p.y, 0.5));
      c = mix(c, vec3(0.015), 1.0 - st(p.y, 0.13));
      return c;
    }`,
    groupc_turbo: `vec3 livery(vec3 p) {
      float ax = abs(p.x);
      vec3 c = cBase;
      float line = p.y - 0.36 - p.z * 0.025;
      c = mix(c, cA, (1.0 - st(line, 0.0)) * st(ax, 0.3));
      c = mix(c, cB, band(line, 0.0, 0.025) * st(ax, 0.3));
      c = mix(c, cA, band(p.x, -0.22, 0.22) * st(p.z, uA - 0.1) * st(p.y, 0.4));
      c = mix(c, cB, band(abs(p.x), 0.22, 0.24) * st(p.z, uA - 0.1) * st(p.y, 0.4));
      c = mix(c, vec3(0.015), 1.0 - st(p.y, 0.13));
      return c;
    }`,
  };
  function makePaint(type, lv, dims) {
    const m = new THREE.MeshPhysicalMaterial({ roughness: 0.3, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.1 });
    const uniforms = {
      cBase: { value: new THREE.Color(lv.base) }, cA: { value: new THREE.Color(lv.a) }, cB: { value: new THREE.Color(lv.b) },
      uA: { value: dims.a }, uB: { value: dims.b },
    };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLp = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + GLSL[type])
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= livery(vLp);');
    };
    m.customProgramCacheKey = () => 'livery_' + type;
    m.userData.uniforms = uniforms;
    return m;
  }

  // ---- 車種ごとの形 ----
  function shapes(type, a, b, tf, tr) {
    const F = (dz) => a + dz, R = (dz) => -b + dz;
    if (type === 'groupc_rotary') {
      return {
        lower: [
          { z: F(1.08), w: 1.3, t: 0.2, b: 0.08, mid: 0.5 },
          { z: F(0.75), w: 1.85, t: 0.36, b: 0.07 },
          { z: F(0.3), w: 1.42, t: 0.47, b: 0.07 },
          { z: F(-0.35), w: 1.42, t: 0.47, b: 0.07 },
          { z: F(-0.75), w: 1.98, t: 0.5, b: 0.07 },
          { z: R(0.75), w: 2.0, t: 0.66, b: 0.07 },
          { z: R(0), w: 2.0, t: 0.78, b: 0.08 },
          { z: R(-0.7), w: 1.98, t: 0.72, b: 0.22 },
          { z: R(-1.08), w: 1.88, t: 0.6, b: 0.34 },
        ],
        cabin: [
          { z: F(0.1), w: 0.6, t: 0.48, b: 0.3 },
          { z: F(-0.35), w: 0.95, t: 0.72, b: 0.3 },
          { z: F(-1.0), w: 1.08, t: 1.0, b: 0.3 },
          { z: F(-1.55), w: 1.05, t: 0.98, b: 0.3 },
          { z: R(0.5), w: 0.9, t: 0.88, b: 0.3 },
          { z: R(-0.4), w: 0.7, t: 0.8, b: 0.3 },
          { z: R(-0.9), w: 0.5, t: 0.74, b: 0.3 },
        ],
        glass: [
          { z: F(-0.2), w: 0.7, t: 0.7, b: 0.4 },
          { z: F(-0.55), w: 1.02, t: 0.92, b: 0.4 },
          { z: F(-1.0), w: 1.12, t: 1.03, b: 0.4 },
          { z: F(-1.4), w: 1.1, t: 1.02, b: 0.4 },
          { z: F(-1.6), w: 0.9, t: 0.96, b: 0.4 },
        ],
        roof: { z0: F(-0.95), z1: F(-1.6), w: 0.8 },
        fenderF: [
          { z: F(0.95), w: 0.42, t: 0.32, b: 0.12, cx: tf / 2 + 0.02 },
          { z: F(0.45), w: 0.55, t: 0.62, b: 0.3, cx: tf / 2 + 0.04 },
          { z: F(0), w: 0.58, t: 0.71, b: 0.34, cx: tf / 2 + 0.04 },
          { z: F(-0.45), w: 0.56, t: 0.64, b: 0.34, cx: tf / 2 + 0.04 },
          { z: F(-0.85), w: 0.44, t: 0.48, b: 0.3, cx: tf / 2 + 0.06 },
        ],
        fenderR: null,
        wing: { y: 0.98, z: R(-0.85), span: 1.92, chord: 0.42, plates: true, tall: true },
        fin: false,
        rim: 0xc9a227,
        lights: { head: [F(0.62), 0.36, 0.68], tail: [R(-1.07), 0.52, 0.75] },
        nose: F(1.08), tail: R(-1.08),
      };
    }
    if (type === 'groupc_turbo') {
      return {
        lower: [
          { z: F(1.12), w: 1.45, t: 0.2, b: 0.08, mid: 0.5 },
          { z: F(0.7), w: 1.95, t: 0.4, b: 0.07 },
          { z: F(0.25), w: 1.5, t: 0.49, b: 0.07 },
          { z: F(-0.4), w: 1.55, t: 0.48, b: 0.07 },
          { z: F(-0.85), w: 1.98, t: 0.5, b: 0.07 },
          { z: R(0.7), w: 2.0, t: 0.6, b: 0.07 },
          { z: R(0), w: 2.0, t: 0.7, b: 0.08 },
          { z: R(-0.65), w: 1.98, t: 0.66, b: 0.2 },
          { z: R(-1.02), w: 1.92, t: 0.58, b: 0.32 },
        ],
        cabin: [
          { z: F(0.05), w: 0.6, t: 0.5, b: 0.3 },
          { z: F(-0.35), w: 1.0, t: 0.74, b: 0.3 },
          { z: F(-0.95), w: 1.16, t: 1.03, b: 0.3 },
          { z: F(-1.5), w: 1.14, t: 1.0, b: 0.3 },
          { z: R(0.4), w: 1.0, t: 0.84, b: 0.3 },
          { z: R(-0.5), w: 0.8, t: 0.72, b: 0.3 },
          { z: R(-0.95), w: 0.6, t: 0.66, b: 0.3 },
        ],
        glass: [
          { z: F(-0.22), w: 0.75, t: 0.72, b: 0.4 },
          { z: F(-0.55), w: 1.08, t: 0.94, b: 0.4 },
          { z: F(-0.95), w: 1.2, t: 1.06, b: 0.4 },
          { z: F(-1.45), w: 1.18, t: 1.03, b: 0.4 },
          { z: F(-1.65), w: 0.98, t: 0.98, b: 0.4 },
        ],
        roof: { z0: F(-0.9), z1: F(-1.6), w: 0.88 },
        fenderF: [
          { z: F(1.0), w: 0.44, t: 0.32, b: 0.12, cx: tf / 2 + 0.04 },
          { z: F(0.5), w: 0.58, t: 0.63, b: 0.3, cx: tf / 2 + 0.05 },
          { z: F(0), w: 0.6, t: 0.71, b: 0.34, cx: tf / 2 + 0.05 },
          { z: F(-0.5), w: 0.58, t: 0.64, b: 0.34, cx: tf / 2 + 0.05 },
          { z: F(-0.9), w: 0.45, t: 0.48, b: 0.3, cx: tf / 2 + 0.07 },
        ],
        fenderR: null,
        wing: { y: 1.04, z: R(-0.9), span: 1.95, chord: 0.46, plates: true, tall: true },
        fin: false,
        rim: 0xb9bec4,
        lights: { head: [F(0.75), 0.33, 0.7], tail: [R(-1.0), 0.5, 0.78] },
        nose: F(1.12), tail: R(-1.02),
      };
    }
    if (type === 'lmp1') {
      return {
        lower: [
          { z: F(1.02), w: 1.0, t: 0.24, b: 0.09, mid: 0.5 },
          { z: F(0.55), w: 0.92, t: 0.5, b: 0.08 },
          { z: F(0), w: 0.86, t: 0.6, b: 0.08 },
          { z: F(-0.55), w: 1.0, t: 0.6, b: 0.07 },
          { z: F(-1.0), w: 1.86, t: 0.46, b: 0.07 },
          { z: R(0.95), w: 1.9, t: 0.5, b: 0.07 },
          { z: R(0.2), w: 1.45, t: 0.58, b: 0.08 },
          { z: R(-0.55), w: 1.25, t: 0.58, b: 0.2 },
          { z: R(-0.92), w: 1.1, t: 0.52, b: 0.3 },
        ],
        cabin: [
          { z: F(0.0), w: 0.7, t: 0.62, b: 0.35 },
          { z: F(-0.45), w: 0.95, t: 0.78, b: 0.35 },
          { z: F(-1.0), w: 1.02, t: 1.05, b: 0.35 },
          { z: F(-1.55), w: 0.98, t: 1.02, b: 0.35 },
          { z: R(0.5), w: 0.68, t: 0.92, b: 0.35 },
          { z: R(-0.4), w: 0.42, t: 0.78, b: 0.35 },
          { z: R(-0.85), w: 0.3, t: 0.66, b: 0.35 },
        ],
        glass: [
          { z: F(-0.3), w: 0.78, t: 0.78, b: 0.45 },
          { z: F(-0.65), w: 0.98, t: 0.97, b: 0.45 },
          { z: F(-1.05), w: 1.04, t: 1.07, b: 0.45 },
          { z: F(-1.45), w: 1.0, t: 1.05, b: 0.45 },
          { z: F(-1.65), w: 0.85, t: 1.0, b: 0.45 },
        ],
        roof: { z0: F(-0.95), z1: F(-1.62), w: 0.7 },
        fenderF: [
          { z: F(1.02), w: 0.4, t: 0.3, b: 0.12, cx: tf / 2 - 0.02 },
          { z: F(0.55), w: 0.5, t: 0.68, b: 0.2, cx: tf / 2 },
          { z: F(0), w: 0.52, t: 0.8, b: 0.3, cx: tf / 2 },
          { z: F(-0.45), w: 0.5, t: 0.74, b: 0.32, cx: tf / 2 },
          { z: F(-0.95), w: 0.4, t: 0.48, b: 0.32, cx: tf / 2 + 0.04 },
        ],
        fenderR: [
          { z: R(1.0), w: 0.36, t: 0.5, b: 0.3, cx: tr / 2 + 0.02 },
          { z: R(0.45), w: 0.5, t: 0.78, b: 0.32, cx: tr / 2 },
          { z: R(0), w: 0.52, t: 0.8, b: 0.34, cx: tr / 2 },
          { z: R(-0.5), w: 0.5, t: 0.74, b: 0.34, cx: tr / 2 },
          { z: R(-0.92), w: 0.42, t: 0.6, b: 0.34, cx: tr / 2 },
        ],
        wing: { y: 0.93, z: R(-0.75), span: 1.8, chord: 0.3, plates: true, tall: false },
        fin: true,
        rim: 0x1a1a1c,
        lights: { head: [F(0.62), 0.56, 0.62], tail: [R(-0.92), 0.62, 0.7] },
        nose: F(1.02), tail: R(-0.92),
      };
    }
    // hyper
    return {
      lower: [
        { z: F(1.05), w: 1.25, t: 0.22, b: 0.08, mid: 0.5 },
        { z: F(0.65), w: 1.25, t: 0.42, b: 0.07 },
        { z: F(0.1), w: 1.15, t: 0.5, b: 0.07 },
        { z: F(-0.5), w: 1.2, t: 0.52, b: 0.07 },
        { z: F(-0.95), w: 1.92, t: 0.5, b: 0.07 },
        { z: R(0.95), w: 1.94, t: 0.55, b: 0.07 },
        { z: R(0.15), w: 1.4, t: 0.6, b: 0.08 },
        { z: R(-0.6), w: 1.25, t: 0.58, b: 0.2 },
        { z: R(-0.98), w: 1.15, t: 0.52, b: 0.3 },
      ],
      cabin: [
        { z: F(0.1), w: 0.7, t: 0.55, b: 0.35 },
        { z: F(-0.4), w: 0.98, t: 0.74, b: 0.35 },
        { z: F(-1.05), w: 1.08, t: 1.07, b: 0.35 },
        { z: F(-1.65), w: 1.04, t: 1.05, b: 0.35 },
        { z: R(0.6), w: 0.8, t: 0.95, b: 0.35 },
        { z: R(-0.35), w: 0.5, t: 0.8, b: 0.35 },
        { z: R(-0.9), w: 0.36, t: 0.66, b: 0.35 },
      ],
      glass: [
        { z: F(-0.25), w: 0.8, t: 0.74, b: 0.45 },
        { z: F(-0.6), w: 1.04, t: 0.96, b: 0.45 },
        { z: F(-1.05), w: 1.12, t: 1.09, b: 0.45 },
        { z: F(-1.5), w: 1.08, t: 1.08, b: 0.45 },
        { z: F(-1.75), w: 0.92, t: 1.02, b: 0.45 },
      ],
      roof: { z0: F(-1.0), z1: F(-1.72), w: 0.78 },
      fenderF: [
        { z: F(1.02), w: 0.42, t: 0.3, b: 0.12, cx: tf / 2 - 0.02 },
        { z: F(0.55), w: 0.52, t: 0.64, b: 0.2, cx: tf / 2 },
        { z: F(0), w: 0.54, t: 0.76, b: 0.32, cx: tf / 2 },
        { z: F(-0.45), w: 0.52, t: 0.7, b: 0.34, cx: tf / 2 },
        { z: F(-0.92), w: 0.42, t: 0.48, b: 0.34, cx: tf / 2 + 0.05 },
      ],
      fenderR: [
        { z: R(1.02), w: 0.38, t: 0.52, b: 0.3, cx: tr / 2 + 0.03 },
        { z: R(0.45), w: 0.52, t: 0.79, b: 0.34, cx: tr / 2 },
        { z: R(0), w: 0.54, t: 0.82, b: 0.36, cx: tr / 2 },
        { z: R(-0.5), w: 0.52, t: 0.76, b: 0.36, cx: tr / 2 },
        { z: R(-0.98), w: 0.44, t: 0.62, b: 0.36, cx: tr / 2 },
      ],
      wing: { y: 0.98, z: R(-0.82), span: 1.85, chord: 0.34, plates: true, tall: false },
      fin: true,
      rim: 0x1d1d20,
      lights: { head: [F(0.6), 0.52, 0.66], tail: [R(-0.98), 0.62, 0.72] },
      nose: F(1.05), tail: R(-0.98),
    };
  }

  // 共有の素材(何台作っても使い回す)
  let shared = null;
  function getShared() {
    if (shared) return shared;
    const carbonTex = TX.carbon();
    shared = {
      carbon: new THREE.MeshPhysicalMaterial({ map: carbonTex, color: 0xffffff, roughness: 0.35, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.6, metalness: 0.2 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x0b0e13, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.72, envMapIntensity: 1.6, clearcoat: 1 }),
      tire: new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.85, metalness: 0 }),
      tread: new THREE.MeshStandardMaterial({ color: 0x232325, roughness: 0.92, metalness: 0 }),
      tireSide: new THREE.MeshStandardMaterial({ map: TX.tireSide(), roughness: 0.8 }),
      caliper: new THREE.MeshStandardMaterial({ color: 0xc0201a, roughness: 0.4, metalness: 0.3 }),
      helmet: new THREE.MeshPhysicalMaterial({ color: 0xf2f2f2, roughness: 0.2, clearcoat: 1 }),
      visor: new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.05, metalness: 0.6 }),
      exhaust: new THREE.MeshStandardMaterial({ color: 0x6b5b4b, roughness: 0.4, metalness: 0.9 }),
      grille: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 }),
    };
    return shared;
  }

  function buildCarModel(spec, livery, number, opts = {}) {
    const S = getShared();
    const L = spec.wheelbase;
    const a = L * (1 - spec.weightFront), b = L * spec.weightFront;
    const tf = spec.trackF, tr = spec.trackR;
    const sh = shapes(spec.body, a, b, tf, tr);
    const lv = liveryFn(spec.body, livery, { a, b });
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const body3 = makePaint(spec.body, livery, { a, b });
    const paint = new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.32, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1,
    });
    const add = (geo, mat, parent = body) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const lod = opts.lod || 1;
    // ボディ
    add(loft(sh.lower, { rings: Math.round(56 * lod), segs: 40 }), body3);
    add(loft(sh.cabin, { rings: Math.round(40 * lod), segs: 32 }), body3);
    add(loft(sh.glass, { rings: 20, segs: 32 }), S.glass);
    // 屋根(ボディ色の帯)
    {
      const r = sh.roof;
      const st = [
        { z: r.z0, w: r.w * 0.8, t: interp(sh.glass, 't', r.z0) + 0.012, b: interp(sh.glass, 't', r.z0) - 0.1 },
        { z: (r.z0 + r.z1) / 2, w: r.w, t: interp(sh.glass, 't', (r.z0 + r.z1) / 2) + 0.012, b: interp(sh.glass, 't', (r.z0 + r.z1) / 2) - 0.1 },
        { z: r.z1, w: r.w * 0.85, t: interp(sh.glass, 't', r.z1) + 0.01, b: interp(sh.glass, 't', r.z1) - 0.1 },
      ];
      add(loft(st, { rings: 12, segs: 24 }), body3);
    }
    for (const side of [1, -1]) {
      add(loft(sh.fenderF, { rings: Math.round(30 * lod), segs: 28, mirrorX: side }), body3);
      if (sh.fenderR) add(loft(sh.fenderR, { rings: Math.round(30 * lod), segs: 28, mirrorX: side }), body3);
    }
    // スプリッター・ディフューザー・床
    {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.025, 0.5), S.carbon);
      sp.position.set(0, 0.06, sh.nose - 0.2);
      body.add(sp);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.03, sh.nose - sh.tail - 0.6), S.dark);
      floor.position.set(0, 0.055, (sh.nose + sh.tail) / 2);
      body.add(floor);
      for (let k = -2; k <= 2; k++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.45), S.carbon);
        fin.position.set(k * 0.32, 0.17, sh.tail + 0.3);
        fin.rotation.x = -0.35;
        body.add(fin);
      }
      const dif = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 0.7), S.carbon);
      dif.position.set(0, 0.2, sh.tail + 0.35);
      dif.rotation.x = 0.35;
      body.add(dif);
    }
    // リアウイング
    {
      const w = sh.wing;
      const wg = new THREE.Group();
      const main = new THREE.Mesh(wing(w.span, w.chord, 0.12, 0.12), S.carbon);
      main.castShadow = true;
      wg.add(main);
      const flap = new THREE.Mesh(wing(w.span, w.chord * 0.45, 0.1, 0.45), S.carbon);
      flap.position.set(0, 0.07, -w.chord * 0.55);
      wg.add(flap);
      wg.position.set(0, w.y, w.z);
      body.add(wg);
      // 翼端板
      const ph = w.tall ? 0.4 : 0.27;
      for (const sx of [1, -1]) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.018, ph, w.chord * 1.45), paint);
        plate.geometry = plate.geometry.toNonIndexed();
        const cols = [];
        const c = lv(sx * 0.9, 0.9, w.z);
        for (let k = 0; k < plate.geometry.attributes.position.count; k++) cols.push(c[0], c[1], c[2]);
        plate.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        plate.position.set((sx * w.span) / 2, w.y - ph * 0.42, w.z - w.chord * 0.15);
        plate.castShadow = true;
        body.add(plate);
      }
      // 支柱(スワンネック)
      if (!w.tall) {
        for (const sx of [0.3, -0.3]) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 0.22), S.carbon);
          st.position.set(sx, w.y - 0.04, w.z + 0.12);
          body.add(st);
        }
      } else {
        const top = interp(sh.lower, 't', w.z);
        const hgt = Math.max(0.1, w.y - top + 0.05);
        for (const sx of [1, -1]) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(0.03, hgt, 0.28), S.carbon);
          st.position.set(sx * (w.span / 2 - 0.25), top + hgt / 2 - 0.04, w.z + 0.05);
          body.add(st);
        }
      }
    }
    // シャークフィン(屋根の後ろからウイングまで)
    if (sh.fin) {
      const z0 = sh.roof.z1 + 0.05, z1 = sh.wing.z + 0.05;
      const len = z0 - z1;
      const y0 = interp(sh.cabin, 't', z0) - 0.02;
      const yEnd = interp(sh.cabin, 't', z1);
      const topEnd = sh.wing.y + 0.06;
      const s = new THREE.Shape();
      // x:後ろ向きの距離、y:高さ
      s.moveTo(0, y0 - 0.06);
      s.lineTo(0.15, y0 + 0.01);
      s.lineTo(len, topEnd);
      s.lineTo(len, yEnd - 0.04);
      s.lineTo(len * 0.5, interp(sh.cabin, 't', (z0 + z1) / 2) - 0.04);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: false });
      g.translate(0, 0, -0.007);
      g.rotateY(Math.PI / 2);
      const cols = [];
      const c = lv(0, 0.99, 0);
      for (let k = 0; k < g.attributes.position.count; k++) cols.push(c[0], c[1], c[2]);
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const fin = new THREE.Mesh(g, paint);
      fin.position.set(0, 0, z0);
      fin.castShadow = true;
      body.add(fin);
    }
    // ライト
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d6, emissiveIntensity: 1.2, roughness: 0.1 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1010, emissiveIntensity: 1.0, roughness: 0.3 });
    {
      const [hz, hy, hx] = sh.lights.head;
      for (const sx of [1, -1]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.05), headMat);
        hl.position.set(sx * hx, hy, hz);
        hl.rotation.x = -0.4;
        body.add(hl);
        const drl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.015, 0.04), headMat);
        drl.position.set(sx * hx, hy - 0.06, hz + 0.01);
        body.add(drl);
      }
      const [tz, ty, tx] = sh.lights.tail;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(tx * 2, 0.03, 0.03), tailMat);
      bar.position.set(0, ty, tz - 0.01);
      body.add(bar);
      const rain = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.03), tailMat);
      rain.position.set(0, ty - 0.18, tz - 0.02);
      body.add(rain);
    }
    // 排気口
    const exhausts = [];
    {
      const ez = sh.tail + 0.05;
      const pts = spec.body === 'groupc_rotary' || spec.body === 'groupc_turbo' ? [[0.35, 0.38], [-0.35, 0.38]] : [[0, 0.62]];
      for (const [ex, ey] of pts) {
        const e = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.16, 12), S.exhaust);
        e.rotation.x = Math.PI / 2;
        e.position.set(ex, ey, ez);
        body.add(e);
        exhausts.push(new THREE.Vector3(ex, ey, ez - 0.1));
      }
    }
    // ドライバー(ヘルメット)
    {
      const hz = a - 1.25;
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), S.helmet);
      helmet.position.set(0.18, 0.86, hz);
      helmet.scale.set(1, 1.05, 1.15);
      body.add(helmet);
      const visor = new THREE.Mesh(new THREE.SphereGeometry(0.152, 20, 10, -0.9, 1.8, 1.1, 0.6), S.visor);
      visor.position.copy(helmet.position);
      visor.scale.copy(helmet.scale);
      body.add(visor);
      root.userData.helmet = [helmet, visor];
    }
    // ミラー
    for (const sx of [1, -1]) {
      const mz = a - 0.45;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.06), paint);
      const cols = [];
      const c = lv(sx * 0.8, 0.8, mz);
      for (let k = 0; k < m.geometry.attributes.position.count; k++) cols.push(c[0], c[1], c[2]);
      m.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      m.position.set(sx * (interp(sh.fenderF, 'cx', mz) - 0.05), interp(sh.fenderF, 't', mz) + 0.12, mz);
      body.add(m);
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.04), S.dark);
      st.position.set(m.position.x, m.position.y - 0.08, mz);
      body.add(st);
    }
    // ゼッケン
    {
      const t = TX.numberDecal(number, '#111');
      const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -4 });
      const zz = spec.body.startsWith('groupc') ? -b + 0.55 : -b + 0.55;
      const st = sh.fenderR || sh.lower;
      for (const sx of [1, -1]) {
        const w = interp(st, 'w', zz) / 2 + (sh.fenderR ? interp(st, 'cx', zz) : 0);
        const y = (interp(st, 't', zz) + interp(st, 'b', zz)) * 0.5 + 0.06;
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), mat);
        p.position.set(sx * (w + 0.012), y, zz);
        p.rotation.y = (sx * Math.PI) / 2;
        body.add(p);
      }
      const top = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), mat);
      top.rotation.x = -Math.PI / 2;
      top.position.set(0, interp(sh.lower, 't', a + 0.55) + 0.012, a + 0.55);
      body.add(top);
    }

    // タイヤとホイール
    const wheels = [];
    const R = spec.wheelR;
    const tireG = (width) => {
      const prof = [];
      const r0 = R * 0.66;
      const hwid = width / 2;
      prof.push(new THREE.Vector2(r0, -hwid * 0.92));
      prof.push(new THREE.Vector2(R * 0.93, -hwid));
      prof.push(new THREE.Vector2(R * 0.985, -hwid * 0.92));
      prof.push(new THREE.Vector2(R, -hwid * 0.75));
      prof.push(new THREE.Vector2(R, hwid * 0.75));
      prof.push(new THREE.Vector2(R * 0.985, hwid * 0.92));
      prof.push(new THREE.Vector2(R * 0.93, hwid));
      prof.push(new THREE.Vector2(r0, hwid * 0.92));
      const g = new THREE.LatheGeometry(prof, 40);
      g.rotateZ(Math.PI / 2);
      return g;
    };
    const rimMat = new THREE.MeshStandardMaterial({ color: sh.rim, roughness: 0.3, metalness: 0.85 });
    const wheelPos = [
      [tf / 2, a, true], [-tf / 2, a, true], [tr / 2, -b, false], [-tr / 2, -b, false],
    ];
    for (const [wx, wz, front] of wheelPos) {
      const width = front ? 0.31 : spec.body.startsWith('groupc') ? 0.36 : 0.33;
      const pivot = new THREE.Group();
      pivot.position.set(wx, R, wz);
      root.add(pivot);
      const spin = new THREE.Group();
      pivot.add(spin);
      const tire = new THREE.Mesh(tireG(width), S.tire);
      tire.castShadow = true;
      spin.add(tire);
      // 側面の文字
      const side = new THREE.Mesh(new THREE.RingGeometry(R * 0.7, R * 0.93, 40, 1), S.tireSide);
      const uv = side.geometry.attributes.uv;
      const pp = side.geometry.attributes.position;
      for (let k = 0; k < uv.count; k++) {
        const x = pp.getX(k), y = pp.getY(k);
        const ang = (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1;
        const rr = Math.hypot(x, y);
        uv.setXY(k, ang, (rr - R * 0.7) / (R * 0.23));
      }
      side.rotation.y = wx > 0 ? Math.PI / 2 : -Math.PI / 2;
      side.position.x = (wx > 0 ? 1 : -1) * (width / 2 + 0.001);
      spin.add(side);
      // ホイール(スポーク)
      const outer = wx > 0 ? 1 : -1;
      const rimFace = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.66, R * 0.66, width * 0.8, 28, 1, true), rimMat);
      rimFace.rotation.z = Math.PI / 2;
      spin.add(rimFace);
      const nSp = spec.body === 'groupc_turbo' ? 1 : spec.body === 'groupc_rotary' ? 8 : 10;
      if (nSp === 1) {
        // 皿のようなディッシュホイール
        const dish = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.64, R * 0.55, 0.02, 28), rimMat);
        dish.rotation.z = Math.PI / 2;
        dish.position.x = outer * (width * 0.36);
        spin.add(dish);
        for (let k = 0; k < 8; k++) {
          const hole = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), S.grille);
          const ang = (k / 8) * Math.PI * 2;
          hole.position.set(outer * (width * 0.37 + 0.002), Math.sin(ang) * R * 0.42, Math.cos(ang) * R * 0.42);
          hole.rotation.y = (outer * Math.PI) / 2;
          spin.add(hole);
        }
      } else {
        for (let k = 0; k < nSp; k++) {
          const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, R * 0.6, 0.035), rimMat);
          sp.position.set(outer * width * 0.3, R * 0.33, 0);
          const holder = new THREE.Group();
          holder.rotation.x = (k / nSp) * Math.PI * 2;
          holder.add(sp);
          spin.add(holder);
        }
      }
      const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.06, 6), new THREE.MeshStandardMaterial({ color: front ? 0xd02020 : 0x2040d0, metalness: 0.7, roughness: 0.3 }));
      nut.rotation.z = Math.PI / 2;
      nut.position.x = outer * width * 0.38;
      spin.add(nut);
      // ブレーキディスク(熱で赤く光る)
      const discMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7, metalness: 0.4, emissive: 0xff3a00, emissiveIntensity: 0 });
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.54, R * 0.54, 0.035, 28), discMat);
      disc.rotation.z = Math.PI / 2;
      disc.position.x = outer * 0.02;
      pivot.add(disc);
      const cal = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.2), S.caliper);
      cal.position.set(outer * 0.03, R * 0.42, front ? -0.06 : 0.06);
      pivot.add(cal);
      wheels.push({ pivot, spin, discMat });
    }

    root.userData = Object.assign(root.userData, { body, wheels, headMat, tailMat, exhausts, paint });
    return root;
  }

  // 毎フレームの見た目の更新
  function updateCarModel(model, car, opts) {
    const u = model.userData;
    model.position.set(car.x, car.y + 0.0, car.z);
    model.rotation.order = 'YXZ';
    model.rotation.set(-car.groundPitch, car.h, car.groundRoll);
    u.body.position.y = car.heave;
    u.body.rotation.set(car.pitch, 0, -car.roll);
    for (let k = 0; k < 4; k++) {
      const w = car.wheels[k], m = u.wheels[k];
      m.pivot.rotation.y = w.steer;
      m.spin.rotation.x = w.spin;
      const glow = U.smoothstep(380, 850, w.brakeT);
      m.discMat.emissiveIntensity = glow * 3.5;
      m.discMat.emissive.setRGB(1, 0.15 + glow * 0.35, 0.02);
    }
    const lights = opts.lightsOn;
    u.headMat.emissiveIntensity = lights ? 6 : 1.4;
    u.tailMat.emissiveIntensity = (lights ? 2.5 : 1.2) + car.brk * 6;
  }

  RG.buildCarModel = buildCarModel;
  RG.updateCarModel = updateCarModel;
})();
