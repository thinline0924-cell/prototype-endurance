// コースのデータづくり(中心線のサンプル、幅、ランオフ、縁石、壁、レコードライン)と位置の検索
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const RG = (G.RG = G.RG || {});
  const U = RG.U;

  function buildTrack(def, THREE) {
    const toV = (p, sc) => new THREE.Vector3(p[0] * sc, p[2], -p[1] * sc);
    let curve = new THREE.CatmullRomCurve3(def.pts.map((p) => toV(p, 1)), true, 'centripetal');
    const sc = def.length / curve.getLength();
    curve = new THREE.CatmullRomCurve3(def.pts.map((p) => toV(p, sc)), true, 'centripetal');
    curve.arcLengthDivisions = 8000;
    const len = curve.getLength();
    const n = Math.round(len / 2);
    const ds = len / n;
    const pts = curve.getSpacedPoints(n);

    const T = {
      def, n, ds, len,
      hw: def.width / 2,
      px: new Float32Array(n), py: new Float32Array(n), pz: new Float32Array(n),
      tx: new Float32Array(n), tz: new Float32Array(n),
      nx: new Float32Array(n), nz: new Float32Array(n),
      s: new Float32Array(n), slope: new Float32Array(n), k: new Float32Array(n), kv: new Float32Array(n),
      kw: new Float32Array(n), wallL: new Float32Array(n), wallR: new Float32Array(n),
      surfL: new Array(n), surfR: new Array(n),
      curbL: new Uint8Array(n), curbR: new Uint8Array(n),
      line: new Float32Array(n),
    };
    const wrap = (i) => ((i % n) + n) % n;
    T.wrap = wrap;
    for (let i = 0; i < n; i++) {
      T.px[i] = pts[i].x; T.py[i] = pts[i].y; T.pz[i] = pts[i].z;
      T.s[i] = i * ds;
    }
    // 高さを少しならす
    smoothArr(T.py, 6, 3, wrap);
    const head = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = wrap(i - 1), b = wrap(i + 1);
      let dx = T.px[b] - T.px[a], dz = T.pz[b] - T.pz[a];
      const l = Math.hypot(dx, dz);
      dx /= l; dz /= l;
      T.tx[i] = dx; T.tz[i] = dz;
      T.nx[i] = dz; T.nz[i] = -dx; // 左向き
      T.slope[i] = (T.py[b] - T.py[a]) / l;
      head[i] = Math.atan2(dx, dz);
    }
    for (let i = 0; i < n; i++) {
      T.k[i] = U.wrapAngle(head[wrap(i + 1)] - head[wrap(i - 1)]) / (2 * ds);
      T.kv[i] = (T.slope[wrap(i + 1)] - T.slope[wrap(i - 1)]) / (2 * ds);
    }
    smoothArr(T.k, 3, 2, wrap);
    smoothArr(T.kv, 8, 3, wrap);

    // まわりの曲がり具合(前後60m の最大)
    const kAbs = Float32Array.from(T.k, Math.abs);
    const W = Math.round(60 / ds);
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let j = -W; j <= W; j++) m = Math.max(m, kAbs[wrap(i + j)]);
      T.kw[i] = m;
    }
    // 曲がる向き(前後40mの平均)
    const kDir = Float32Array.from(T.k);
    smoothArr(kDir, 20, 2, wrap);

    // ---- ランオフ(コース外の逃げ場)と壁 ----
    const rs = def.runoffScale || 1;
    const runL = new Float32Array(n), runR = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const kw = T.kw[i];
      const out = U.clamp(6 + 2600 * kw, 6, 32) * rs;
      const inn = U.clamp(5 + 500 * kw, 5, 12) * rs;
      const left = kDir[i] > 0; // 左コーナー → 左が内側
      runL[i] = kw < 1 / 900 ? 6 * rs : left ? inn : out;
      runR[i] = kw < 1 / 900 ? 6 * rs : left ? out : inn;
      const gravelK = def.theme.runoff === 'tarmac' ? 1 / 70 : 1 / 160;
      const outType = kw > gravelK ? 'gravel' : kw > 1 / 260 && def.theme.runoff === 'tarmac' ? 'tarmac' : 'grass';
      T.surfL[i] = left || kw < 1 / 900 ? 'grass' : outType;
      T.surfR[i] = !left || kw < 1 / 900 ? 'grass' : outType;
    }
    // 直線でもランオフが急に変わらないように最大値を広げてからならす
    for (const arr of [runL, runR]) {
      const tmp = Float32Array.from(arr);
      const M = Math.round(40 / ds);
      for (let i = 0; i < n; i++) {
        let m = 0;
        for (let j = -M; j <= M; j++) m = Math.max(m, tmp[wrap(i + j)]);
        arr[i] = m;
      }
      smoothArr(arr, 12, 3, wrap);
    }
    // 空間の索引(近くの点を素早く探す)
    const cell = 40;
    const grid = new Map();
    const key = (cx, cz) => cx * 73856093 + cz * 19349663;
    for (let i = 0; i < n; i++) {
      const k = key(Math.floor(T.px[i] / cell), Math.floor(T.pz[i] / cell));
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(i);
    }
    T.grid = grid; T.cell = cell; T.gkey = key;
    T.near = (x, z, r, cb) => {
      const c0x = Math.floor((x - r) / cell), c1x = Math.floor((x + r) / cell);
      const c0z = Math.floor((z - r) / cell), c1z = Math.floor((z + r) / cell);
      for (let cx = c0x; cx <= c1x; cx++)
        for (let cz = c0z; cz <= c1z; cz++) {
          const a = grid.get(key(cx, cz));
          if (a) for (const j of a) cb(j);
        }
    };
    // 内側は曲率半径を超えないように、ほかの区間とは重ならないように
    const hw = T.hw;
    const kLocal = Float32Array.from(T.k);
    smoothArr(kLocal, 6, 2, wrap);
    const idxDist = (a, b) => {
      const d = Math.abs(a - b);
      return Math.min(d, n - d);
    };
    for (let i = 0; i < n; i++) {
      const kl = kLocal[i];
      if (kl > 1e-4) runL[i] = Math.min(runL[i], 0.8 / kl - hw);
      if (kl < -1e-4) runR[i] = Math.min(runR[i], 0.8 / -kl - hw);
      for (const side of [1, -1]) {
        const arr = side > 0 ? runL : runR;
        for (let iter = 0; iter < 30; iter++) {
          const off = (hw + arr[i]) * side;
          const wx = T.px[i] + T.nx[i] * off, wz = T.pz[i] + T.nz[i] * off;
          let bad = false;
          T.near(wx, wz, hw + 40, (j) => {
            if (bad || idxDist(i, j) < 60 / ds) return;
            const d = Math.hypot(T.px[j] - wx, T.pz[j] - wz);
            if (d < hw + 6) bad = true;
          });
          if (!bad || arr[i] <= 2.5) break;
          arr[i] = Math.max(2.5, arr[i] - 1.5);
        }
      }
    }
    for (const arr of [runL, runR]) {
      // 狭くなったところを基準に(最小値で広げてからならす)
      const tmp = Float32Array.from(arr);
      const M = Math.round(10 / ds);
      for (let i = 0; i < n; i++) {
        let m = 1e9;
        for (let j = -M; j <= M; j++) m = Math.min(m, tmp[wrap(i + j)]);
        arr[i] = m;
      }
      smoothArr(arr, 5, 2, wrap);
    }
    for (let i = 0; i < n; i++) {
      T.wallL[i] = hw + Math.max(2.5, runL[i]);
      T.wallR[i] = hw + Math.max(2.5, runR[i]);
    }

    // ---- 縁石 ----
    const kc = Float32Array.from(T.k);
    smoothArr(kc, 3, 1, wrap);
    for (let i = 0; i < n; i++) {
      const a = Math.abs(kc[i]);
      const inner = a > 1 / 260, outer = a > 1 / 110;
      if (kc[i] > 0) { if (inner) T.curbL[i] = 1; if (outer) T.curbR[i] = 1; }
      else { if (inner) T.curbR[i] = 1; if (outer) T.curbL[i] = 1; }
    }
    const S = Math.round(8 / ds);
    for (const arr of [T.curbL, T.curbR]) {
      const tmp = Uint8Array.from(arr);
      for (let i = 0; i < n; i++) {
        if (!tmp[i]) continue;
        for (let j = -S; j <= S; j++) arr[wrap(i + j)] = 1;
      }
    }
    // スタート直後・直前の直線には付けない
    for (let j = -Math.round(120 / ds); j < Math.round(120 / ds); j++) {
      const i = wrap(j);
      if (T.kw[i] < 1 / 400) { T.curbL[i] = 0; T.curbR[i] = 0; }
    }

    // ---- 関数 ----
    T.indexAt = (s) => wrap(Math.floor((((s % len) + len) % len) / ds));
    T.pointAt = (s, lat) => {
      s = ((s % len) + len) % len;
      const f = s / ds;
      const i = Math.floor(f) % n, j = wrap(i + 1), t = f - Math.floor(f);
      const x = U.lerp(T.px[i], T.px[j], t) + U.lerp(T.nx[i], T.nx[j], t) * lat;
      const z = U.lerp(T.pz[i], T.pz[j], t) + U.lerp(T.nz[i], T.nz[j], t) * lat;
      return { x, y: U.lerp(T.py[i], T.py[j], t), z, i };
    };
    const res = { i: 0, s: 0, lat: 0, y: 0, d: 0 };
    T.project = (x, z, hint) => {
      let best = -1, bd = Infinity;
      if (hint < 0) {
        for (let r = 50; r < 3000 && best < 0; r *= 2)
          T.near(x, z, r, (j) => {
            const d = (T.px[j] - x) ** 2 + (T.pz[j] - z) ** 2;
            if (d < bd) { bd = d; best = j; }
          });
        if (best < 0) best = 0;
      } else {
        for (let o = -30; o <= 30; o++) {
          const j = wrap(hint + o);
          const d = (T.px[j] - x) ** 2 + (T.pz[j] - z) ** 2;
          if (d < bd) { bd = d; best = j; }
        }
      }
      // 前後の区間に投影して細かく求める
      let i = best;
      let t = (x - T.px[i]) * T.tx[i] + (z - T.pz[i]) * T.tz[i];
      if (t < 0) { i = wrap(i - 1); t += ds; }
      const f = U.clamp(t / ds, 0, 1);
      const j = wrap(i + 1);
      const cx = U.lerp(T.px[i], T.px[j], f), cz = U.lerp(T.pz[i], T.pz[j], f);
      const nx = U.lerp(T.nx[i], T.nx[j], f), nz = U.lerp(T.nz[i], T.nz[j], f);
      res.i = i;
      res.s = (i + f) * ds;
      res.lat = (x - cx) * nx + (z - cz) * nz;
      res.y = U.lerp(T.py[i], T.py[j], f);
      res.d = bd;
      return res;
    };
    T.surfaceAt = (i, lat) => {
      const left = lat >= 0;
      const a = Math.abs(lat);
      const curb = left ? T.curbL[i] : T.curbR[i];
      if (a <= hw) return curb && a > hw - 0.4 ? 'curb' : 'road';
      if (curb && a <= hw + 1.3) return 'curb';
      if (a <= hw + 1.6) return 'strip';
      return left ? T.surfL[i] : T.surfR[i];
    };

    computeRacingLine(T);
    return T;
  }

  // 配列をなめらかにする(移動平均を passes 回)
  function smoothArr(arr, r, passes, wrap) {
    const n = arr.length;
    const tmp = new Float32Array(n);
    for (let p = 0; p < passes; p++) {
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = -r; j <= r; j++) s += arr[wrap(i + j)];
        tmp[i] = s / (2 * r + 1);
      }
      arr.set(tmp);
    }
  }

  // ---- レコードライン(曲率が最小になる線)----
  // 粗い間隔で「アウト・イン・アウト」を求め、細かい間隔に戻す
  function computeRacingLine(T) {
    const n = T.n;
    const margin = 1.3;
    const lim = T.hw - margin;
    function solve(step, iters, init) {
      const m = Math.floor(n / step);
      const idx = (k) => ((k % m) + m) % m;
      const cx = new Float32Array(m), cz = new Float32Array(m), nx = new Float32Array(m), nz = new Float32Array(m);
      const off = new Float32Array(m);
      for (let k = 0; k < m; k++) {
        const i = k * step;
        cx[k] = T.px[i]; cz[k] = T.pz[i]; nx[k] = T.nx[i]; nz[k] = T.nz[i];
        off[k] = init ? init[i] : 0;
      }
      const X = new Float32Array(m), Z = new Float32Array(m);
      for (let it = 0; it < iters; it++) {
        for (let k = 0; k < m; k++) { X[k] = cx[k] + nx[k] * off[k]; Z[k] = cz[k] + nz[k] * off[k]; }
        for (let k = 0; k < m; k++) {
          const a = idx(k - 2), b = idx(k - 1), c = idx(k + 1), d = idx(k + 2);
          // 曲率の2乗和を減らす向き(5点の式)
          const tx = (4 * (X[b] + X[c]) - (X[a] + X[d])) / 6;
          const tz = (4 * (Z[b] + Z[c]) - (Z[a] + Z[d])) / 6;
          const o = (tx - cx[k]) * nx[k] + (tz - cz[k]) * nz[k];
          off[k] = U.clamp(off[k] + (o - off[k]) * 0.6, -lim, lim);
        }
      }
      // 細かい間隔に戻す
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const f = i / step;
        const k = Math.floor(f), t = f - k;
        out[i] = U.lerp(off[idx(k)], off[idx(k + 1)], t);
      }
      return out;
    }
    let line = solve(Math.max(1, Math.round(24 / T.ds)), 2500, null);
    line = solve(Math.max(1, Math.round(8 / T.ds)), 1500, line);
    line = solve(Math.max(1, Math.round(4 / T.ds)), 400, line);
    smoothArr(line, 2, 2, T.wrap);
    T.line.set(line);
    // 線そのものの曲率
    const n2 = T.n;
    const lx = new Float32Array(n2), lz = new Float32Array(n2);
    for (let i = 0; i < n2; i++) { lx[i] = T.px[i] + T.nx[i] * line[i]; lz[i] = T.pz[i] + T.nz[i] * line[i]; }
    T.lineX = lx; T.lineZ = lz;
    const lk = new Float32Array(n2);
    const w = T.wrap;
    const st = 3;
    for (let i = 0; i < n2; i++) {
      const a = w(i - st), b = w(i + st);
      const h1 = Math.atan2(lx[i] - lx[a], lz[i] - lz[a]);
      const h2 = Math.atan2(lx[b] - lx[i], lz[b] - lz[i]);
      const d1 = Math.hypot(lx[i] - lx[a], lz[i] - lz[a]), d2 = Math.hypot(lx[b] - lx[i], lz[b] - lz[i]);
      lk[i] = U.wrapAngle(h2 - h1) / Math.max(0.5, (d1 + d2) / 2);
    }
    smoothArr(lk, 3, 2, w);
    T.lineK = lk;
  }

  // 車の性能に合わせた「この地点で出せる速さ」の表(AI とブレーキ看板用)
  function speedProfile(T, spec, skill = 1) {
    const n = T.n, ds = T.ds;
    const g = 9.81;
    const mu = spec.tire.mu * 0.89 * skill;
    const kd = (0.5 * 1.225 * spec.aero.ClA) / spec.mass;
    const kD = (0.5 * 1.225 * spec.aero.CdA) / spec.mass;
    const v = new Float32Array(n);
    const P = (Math.max(...spec.engine.torque.map((t) => t[0] * t[1] * Math.PI / 30)) * 0.92 + (spec.hybrid ? Math.min(spec.hybrid.kw, 120) * 1000 * 0.4 : 0));
    // 切り返し(S字)では余裕を持たせるため、前後の最大の曲がり具合を使う
    const kMax = new Float32Array(n);
    const Wk = Math.max(1, Math.round(18 / ds));
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let j = -Wk; j <= Wk; j++) m = Math.max(m, Math.abs(T.lineK[(i + j + n) % n]));
      kMax[i] = m;
    }
    for (let i = 0; i < n; i++) {
      const k = kMax[i];
      const den = k - mu * kd;
      v[i] = den <= 1e-6 ? 110 : Math.min(110, Math.sqrt((mu * g) / den));
      // 下り坂の頂上では軽くなる
      if (T.kv[i] < -0.002) v[i] *= 0.97;
    }
    for (let pass = 0; pass < 2; pass++) {
      // 後ろ向き(ブレーキ)
      for (let c = 2 * n; c > 0; c--) {
        const i = c % n, j = (c + 1) % n;
        const vj = v[j];
        const lat = vj * vj * Math.abs(T.lineK[j]);
        const tot = mu * (g + kd * vj * vj) * 0.9;
        const along = Math.sqrt(Math.max(0, tot * tot - lat * lat)) + kD * vj * vj;
        const vm = Math.sqrt(vj * vj + 2 * ds * along);
        if (vm < v[i]) v[i] = vm;
      }
      // 前向き(加速)
      for (let c = 0; c < 2 * n; c++) {
        const i = c % n, j = (c + 1) % n;
        const vi = Math.max(v[i], 5);
        const lat = vi * vi * Math.abs(T.lineK[i]);
        const tot = mu * (g * 0.55 + kd * vi * vi * 0.6);
        const grip = Math.sqrt(Math.max(0, tot * tot - lat * lat));
        const acc = Math.min(P / (spec.mass * vi), grip) - kD * vi * vi;
        const vm = Math.sqrt(Math.max(0, vi * vi + 2 * ds * acc));
        if (vm < v[j]) v[j] = vm;
      }
    }
    return v;
  }

  RG.buildTrack = buildTrack;
  RG.speedProfile = speedProfile;
})();
