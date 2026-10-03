// コースの3Dの世界をつくる:路面、縁石、ランオフ、壁、フェンス、地形、木、建物、看板、山、空と光
(function () {
  'use strict';
  const RG = (window.RG = window.RG || {});
  const U = RG.U;
  const TX = RG.TX;

  // ---- 細長い帯(リボン)状の形を作る道具 ----
  class GeoBuilder {
    constructor(withColor) {
      this.p = []; this.uv = []; this.c = []; this.idx = []; this.withColor = withColor;
    }
    // rows: コースの番号の列, cols(i, r) → [{x,y,z,u,v?,col?}, ...](左→右の順)
    strip(rows, cols, vScale, vStart = 0) {
      const base = this.p.length / 3;
      let k = 0;
      let ncol = 0;
      for (let r = 0; r < rows.length; r++) {
        const cs = cols(rows[r], r);
        ncol = cs.length;
        for (const q of cs) {
          this.p.push(q.x, q.y, q.z);
          this.uv.push(q.u, q.v != null ? q.v : vStart + (r * RG.cur.T.ds) / vScale);
          if (this.withColor) this.c.push(...(q.col || [1, 1, 1]));
        }
        k++;
      }
      for (let r = 0; r < k - 1; r++)
        for (let c = 0; c < ncol - 1; c++) {
          const a = base + r * ncol + c, b = a + 1, cc = a + ncol, d = cc + 1;
          this.idx.push(a, b, cc, b, d, cc);
        }
    }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      if (this.withColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setIndex(this.idx);
      g.computeVertexNormals();
      return g;
    }
  }

  // 連続する区間(runs)を探す
  function runs(n, pred) {
    const out = [];
    let start = -1;
    for (let i = 0; i < n; i++) {
      if (pred(i)) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        out.push([start, i]);
        start = -1;
      }
    }
    if (start >= 0) out.push([start, n]);
    // 周回のつなぎ目でつながっているものはまとめる
    if (out.length > 1 && out[0][0] === 0 && out[out.length - 1][1] === n) {
      const last = out.pop();
      out[0] = [last[0], n + out[0][1]];
    }
    return out;
  }
  function rowList(T, a, b) {
    const r = [];
    for (let i = a; i <= b; i++) r.push(((i % T.n) + T.n) % T.n);
    return r;
  }

  function buildWorld(T, opts) {
    const q = opts.quality;
    const def = T.def;
    const theme = def.theme;
    const root = new THREE.Group();
    const hw = T.hw;
    const n = T.n;
    RG.cur = { T };
    const rnd = U.rng(def.seed);
    const N = U.makeNoise(def.seed);
    const P = (i, lat, dy = 0) => ({ x: T.px[i] + T.nx[i] * lat, y: T.py[i] + dy, z: T.pz[i] + T.nz[i] * lat });
    const tileLen = T.len / Math.round(T.len / 8);
    const allRows = rowList(T, 0, n);

    // ---- 路面 ----
    {
      const gb = new GeoBuilder(true);
      const COLS = 12;
      gb.strip(allRows, (i) => {
        const out = [];
        const line = T.line[i];
        for (let c = 0; c < COLS; c++) {
          const lat = hw - (2 * hw * c) / (COLS - 1);
          const p = P(i, lat);
          const rub = Math.exp(-(((lat - line) / 1.9) ** 2));
          const patch = N.n2(T.s[i] / 70, lat / 9) * 0.06;
          const k = 1 - rub * 0.3 + patch;
          p.u = c / (COLS - 1);
          p.col = [k, k, k];
          out.push(p);
        }
        return out;
      }, tileLen);
      const mat = new THREE.MeshStandardMaterial({
        map: TX.asphalt(def.width), normalMap: TX.asphaltNormal(), normalScale: new THREE.Vector2(0.5, 0.5),
        roughness: 0.88, metalness: 0, vertexColors: true, envMapIntensity: 0.6,
      });
      mat.normalMap.repeat.set(4, 1);
      const m = new THREE.Mesh(gb.build(), mat);
      m.receiveShadow = true;
      root.add(m);
    }

    // ---- 縁石 ----
    {
      const gb = new GeoBuilder(false);
      for (const side of [1, -1]) {
        const arr = side > 0 ? T.curbL : T.curbR;
        for (const [a, b] of runs(n, (i) => arr[i])) {
          const rows = rowList(T, a, b);
          gb.strip(rows, (i) => {
            const L = [
              [hw + 1.32, 0.0], [hw + 1.2, 0.05], [hw - 0.25, 0.05], [hw - 0.42, 0.006],
            ];
            const pts = side > 0 ? L : L.slice().reverse().map(([l, y]) => [-l, y]);
            return pts.map(([lat, dy], c) => Object.assign(P(i, lat, dy), { u: c / 3 }));
          }, 4);
        }
      }
      const m = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ map: TX.curb(), roughness: 0.55 }));
      m.material.map.repeat.set(1, 1);
      m.receiveShadow = true;
      root.add(m);
    }

    // ---- ランオフ(路肩・芝・砂利・舗装)----
    {
      const ground = { grass: new GeoBuilder(false), gravel: new GeoBuilder(false), tarmac: new GeoBuilder(false) };
      const strip = new GeoBuilder(false);
      for (const side of [1, -1]) {
        const surf = side > 0 ? T.surfL : T.surfR;
        const wall = side > 0 ? T.wallL : T.wallR;
        // 路肩(舗装)
        strip.strip(allRows, (i) => {
          const a = [hw, hw + 1.6];
          const pts = side > 0 ? a.slice().reverse() : a.map((x) => -x);
          return pts.map((lat, c) => Object.assign(P(i, lat, -0.008), { u: (lat * side) / 4 }));
        }, 4);
        for (const type of ['grass', 'gravel', 'tarmac']) {
          for (const [a, b] of runs(n, (i) => surf[i] === type)) {
            const rows = rowList(T, a, b);
            ground[type].strip(rows, (i) => {
              const w = wall[i];
              const k = 5;
              const out = [];
              for (let c = 0; c < k; c++) {
                const t = c / (k - 1);
                const lat = side > 0 ? U.lerp(w + 0.5, hw + 1.6, t) : -U.lerp(hw + 1.6, w + 0.5, t);
                const dy = -0.012 - (Math.abs(lat) > w - 1 ? 0.0 : 0);
                const p = P(i, lat, dy);
                p.u = (lat * side) / 6;
                out.push(p);
              }
              return out;
            }, 6);
          }
        }
      }
      const grassTex = TX.grass(theme.grass, true);
      grassTex.repeat.set(1, 1);
      const mats = {
        grass: new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 }),
        gravel: new THREE.MeshStandardMaterial({ map: TX.gravel(), normalMap: TX.gravelNormal(), roughness: 1 }),
        tarmac: new THREE.MeshStandardMaterial({ map: TX.plainAsphalt(), color: 0x9a9a9a, roughness: 0.9 }),
      };
      mats.gravel.map.repeat.set(1, 1);
      for (const type of Object.keys(ground)) {
        const m = new THREE.Mesh(ground[type].build(), mats[type]);
        m.receiveShadow = true;
        root.add(m);
      }
      const sm = new THREE.Mesh(strip.build(), new THREE.MeshStandardMaterial({ map: TX.plainAsphalt(), color: 0x8c8c8c, roughness: 0.9 }));
      sm.receiveShadow = true;
      root.add(sm);
    }

    // ---- 壁(ガードレール / コンクリート+広告)とフェンス ----
    const nearStart = (i) => {
      const s = T.s[i];
      return s < 450 || s > T.len - 600;
    };
    {
      const armco = new GeoBuilder(false), conc = new GeoBuilder(false), fence = new GeoBuilder(false), post = new GeoBuilder(false);
      const concreteAll = theme.wall === 'concrete';
      for (const side of [1, -1]) {
        const wall = side > 0 ? T.wallL : T.wallR;
        const isConc = (i) => concreteAll || nearStart(i) || T.kw[i] > 1 / 90;
        for (const [a, b] of runs(n, isConc)) {
          const rows = rowList(T, a, b);
          conc.strip(rows, (i) => [
            Object.assign(P(i, side * wall[i], 1.05), { u: 0 }),
            Object.assign(P(i, side * wall[i], -1.6), { u: 2.52 }),
          ], 40 * side);
          fence.strip(rows, (i) => [
            Object.assign(P(i, side * (wall[i] + 0.1), 4.2), { u: 0 }),
            Object.assign(P(i, side * (wall[i] + 0.1), 1.05), { u: 3.17 }),
          ], 4 * side);
        }
        for (const [a, b] of runs(n, (i) => !isConc(i))) {
          const rows = rowList(T, a, b);
          armco.strip(rows, (i) => [
            Object.assign(P(i, side * wall[i], 0.95), { u: 0 }),
            Object.assign(P(i, side * wall[i], -0.05), { u: 1 }),
          ], 4);
          post.strip(rows, (i) => [
            Object.assign(P(i, side * (wall[i] + 0.15), -0.05), { u: 0 }),
            Object.assign(P(i, side * (wall[i] + 0.15), -1.6), { u: 1 }),
          ], 4);
        }
      }
      const adTex = TX.adWall();
      adTex.rotation = 0;
      const concMat = new THREE.MeshStandardMaterial({ map: adTex, roughness: 0.8, side: THREE.DoubleSide });
      // 広告は横向きの画像なので uv を入れ替えて使う
      const cg = conc.build();
      const uv = cg.attributes.uv;
      for (let k = 0; k < uv.count; k++) {
        const u = uv.getX(k), v = uv.getY(k);
        uv.setXY(k, v, 1 - u * 1.0);
      }
      const cm = new THREE.Mesh(cg, concMat);
      cm.castShadow = q !== 'low';
      cm.receiveShadow = true;
      root.add(cm);
      const ag = armco.build();
      const auv = ag.attributes.uv;
      for (let k = 0; k < auv.count; k++) {
        const u = auv.getX(k), v = auv.getY(k);
        auv.setXY(k, v, 1 - u);
      }
      const armTex = TX.armco();
      const am = new THREE.Mesh(ag, new THREE.MeshStandardMaterial({ map: armTex, transparent: false, alphaTest: 0.5, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }));
      am.castShadow = q !== 'low';
      root.add(am);
      root.add(new THREE.Mesh(post.build(), new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.8, side: THREE.DoubleSide })));
      const fg = fence.build();
      const fuv = fg.attributes.uv;
      for (let k = 0; k < fuv.count; k++) {
        const u = fuv.getX(k), v = fuv.getY(k);
        fuv.setXY(k, v, u * 0.8);
      }
      const fm = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: TX.fence(), alphaTest: 0.4, transparent: false, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 }));
      root.add(fm);
    }

    // ---- スタートライン・グリッド ----
    {
      const { c, g } = U.canvas(256, 32);
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 16; x++) {
          g.fillStyle = (x + y) % 2 ? '#111' : '#eee';
          g.fillRect(x * 16, y * 16, 16, 16);
        }
      const t = TX.tex(c, { repeat: false });
      const gb = new GeoBuilder(false);
      const i0 = 0;
      gb.strip([n - 1, i0], (i, r) => [
        Object.assign(P(i, hw, 0.012), { u: 0, v: r }),
        Object.assign(P(i, -hw, 0.012), { u: 1, v: r }),
      ], 1);
      const m = new THREE.Mesh(gb.build(), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
      root.add(m);
      // グリッドの白線
      const gl = new GeoBuilder(false);
      for (let k = 0; k < 12; k++) {
        const s = T.len - 12 - k * 9;
        const lat = k % 2 === 0 ? 2.8 : -2.8;
        const i = T.indexAt(s);
        gl.strip([i, (i + 1) % n], (j, r) => [
          Object.assign(P(j, lat + 1.2, 0.012), { u: 0, v: r }),
          Object.assign(P(j, lat - 1.2, 0.012), { u: 1, v: r }),
        ], 1);
      }
      root.add(new THREE.Mesh(gl.build(), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 })));
    }

    // ---- 地形 ----
    const terrain = buildTerrain(T, theme, q, N);
    root.add(terrain.mesh);
    root.add(terrain.far);

    // ---- 木 ----
    root.add(buildTrees(T, theme, q, rnd, N, terrain));

    // ---- 建物・ガントリー・看板 ----
    const props = buildProps(T, def, q, rnd);
    root.add(props.group);

    // ---- 山 ----
    root.add(buildMountains(T, theme, rnd, opts.tod));

    return { group: root, startLights: props.startLights, terrain, lamps: props.lamps };
  }

  // 地形(高さのある大きな地面)
  function buildTerrain(T, theme, q, N) {
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < T.n; i++) {
      minX = Math.min(minX, T.px[i]); maxX = Math.max(maxX, T.px[i]);
      minZ = Math.min(minZ, T.pz[i]); maxZ = Math.max(maxZ, T.pz[i]);
    }
    const M = 900;
    minX -= M; maxX += M; minZ -= M; maxZ += M;
    const target = q === 'high' ? 220000 : q === 'medium' ? 130000 : 70000;
    const cell = Math.max(6, Math.sqrt(((maxX - minX) * (maxZ - minZ)) / target));
    const nx = Math.ceil((maxX - minX) / cell) + 1, nz = Math.ceil((maxZ - minZ) / cell) + 1;
    // 粗いサンプル(20m ごと)で高さの重み付き平均
    const step = Math.max(1, Math.round(20 / T.ds));
    const avgY = (T.py.reduce((a, b) => a + b, 0)) / T.n;
    const heightAt = (x, z) => {
      let wsum = 0, ysum = 0, best = 1e18, bi = 0;
      const R = 420;
      T.near(x, z, R, (j) => {
        const d2 = (T.px[j] - x) ** 2 + (T.pz[j] - z) ** 2;
        if (d2 < best) { best = d2; bi = j; }
        if (j % step) return;
        const w = 1 / Math.pow(d2 + 900, 1.6);
        wsum += w; ysum += w * T.py[j];
      });
      const hillsF = N.fbm(x / 800, z / 800, 4) * theme.hills * 1.8;
      const farH = avgY - 0.9 + hillsF;
      if (best > 1e17) return { h: farH, d: 1e9, lat: 0, wall: 0 };
      const base = wsum > 0 ? ysum / wsum : T.py[bi];
      const lat = (x - T.px[bi]) * T.nx[bi] + (z - T.pz[bi]) * T.nz[bi];
      const wall = lat > 0 ? T.wallL[bi] : T.wallR[bi];
      const d = Math.sqrt(best);
      const along = Math.abs((x - T.px[bi]) * T.tx[bi] + (z - T.pz[bi]) * T.tz[bi]);
      const dl = along > 4 ? d : Math.abs(lat);
      const yNear = T.py[bi] - 0.9;
      const t = U.smoothstep(wall + 2, wall + 90, dl);
      const hills = hillsF * U.smoothstep(60, 500, dl);
      let natural = base - 0.9 + hills + N.n2(x / 60, z / 60) * 0.8 * t;
      natural = U.lerp(natural, farH, U.smoothstep(240, 410, d));
      return { h: dl < wall + 2 ? yNear : U.lerp(yNear, natural, t), d: dl, lat, wall };
    };
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const g0 = theme.grass;
    const H = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const x = minX + i * cell, z = minZ + j * cell;
        const r = heightAt(x, z);
        const k = j * nx + i;
        H[k] = r.h;
        pos[k * 3] = x; pos[k * 3 + 1] = r.h; pos[k * 3 + 2] = z;
        uv[k * 2] = x / 18; uv[k * 2 + 1] = z / 18;
        // 畑や草むらのまだら模様
        const f = N.fbm(x / 400, z / 400, 3);
        const f2 = N.n2(x / 90 + 50, z / 90);
        let cr = 1, cg = 1, cb = 1;
        if (f > 0.12 && r.d > 150) { cr = 1.25; cg = 1.12; cb = 0.8; } // 乾いた畑
        else if (f < -0.15) { cr = 0.8; cg = 0.92; cb = 0.85; } // 濃い草
        const v = 0.92 + f2 * 0.12;
        col[k * 3] = cr * v; col[k * 3 + 1] = cg * v; col[k * 3 + 2] = cb * v;
      }
    const idx = [];
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tex = TX.terrainGrass(g0);
    const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    // 遠くの地面
    const farGeo = new THREE.PlaneGeometry(60000, 60000, 1, 1);
    farGeo.rotateX(-Math.PI / 2);
    const far = new THREE.Mesh(farGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color(g0[0] * 0.8, g0[1] * 0.8, g0[2] * 0.7), roughness: 1 }));
    far.position.set((minX + maxX) / 2, avgY - 8, (minZ + maxZ) / 2);
    const sample = (x, z) => {
      const fi = (x - minX) / cell, fj = (z - minZ) / cell;
      const i = Math.floor(fi), j = Math.floor(fj);
      if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return avgY - 8;
      const tx = fi - i, tz = fj - j;
      const a = H[j * nx + i], b = H[j * nx + i + 1], c = H[(j + 1) * nx + i], d = H[(j + 1) * nx + i + 1];
      return U.lerp(U.lerp(a, b, tx), U.lerp(c, d, tx), tz);
    };
    return { mesh, far, sample, heightAt, bounds: { minX, maxX, minZ, maxZ } };
  }

  // 木(十字に組んだ板に木の絵。数千本を1回で描く)
  function buildTrees(T, theme, q, rnd, N, terrain) {
    const g = new THREE.Group();
    const maxCount = Math.round((q === 'high' ? 9000 : q === 'medium' ? 5000 : 2200) * theme.treeDensity);
    const kinds = theme.trees === 'conifer' ? ['conifer', 'conifer', 'broad'] : ['broad', 'conifer', 'broad'];
    const lists = { conifer: [], broad: [] };
    const { minX, maxX, minZ, maxZ } = terrain.bounds;
    const tryPlace = (x, z, kind, scale) => {
      const r = terrain.heightAt(x, z);
      if (r.d < r.wall + 7) return false;
      lists[kind].push([x, terrain.sample(x, z), z, scale, rnd()]);
      return true;
    };
    // 並木(ル・マンの直線沿いなど)
    if (theme.treeLines) {
      for (let i = 0; i < T.n; i += 4) {
        if (T.kw[i] > 1 / 600) continue;
        for (const side of [1, -1]) {
          const wall = side > 0 ? T.wallL[i] : T.wallR[i];
          for (let row = 0; row < 3; row++) {
            if (rnd() < 0.25) continue;
            const lat = side * (wall + 9 + row * 7 + rnd() * 3);
            tryPlace(T.px[i] + T.nx[i] * lat, T.pz[i] + T.nz[i] * lat, rnd() < 0.7 ? 'broad' : 'conifer', 0.9 + rnd() * 0.5);
          }
        }
        if (lists.broad.length + lists.conifer.length > maxCount * 0.5) break;
      }
    }
    // 森(ノイズで濃淡)
    let guard = 0;
    while (lists.broad.length + lists.conifer.length < maxCount && guard++ < maxCount * 30) {
      // コースの近くに多く
      let x, z;
      if (rnd() < 0.75) {
        const i = Math.floor(rnd() * T.n);
        const side = rnd() < 0.5 ? 1 : -1;
        const wall = side > 0 ? T.wallL[i] : T.wallR[i];
        const lat = side * (wall + 8 + Math.pow(rnd(), 1.6) * 450);
        x = T.px[i] + T.nx[i] * lat + (rnd() - 0.5) * 30;
        z = T.pz[i] + T.nz[i] * lat + (rnd() - 0.5) * 30;
      } else {
        x = U.lerp(minX, maxX, rnd());
        z = U.lerp(minZ, maxZ, rnd());
      }
      const f = N.fbm(x / 350, z / 350, 3);
      if (f < (theme.trees === 'conifer' ? -0.25 : -0.05)) continue;
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      tryPlace(x, z, kind, 0.8 + rnd() * 0.7);
    }
    const geoFor = (w, h) => {
      const a = new THREE.PlaneGeometry(w, h);
      a.translate(0, h / 2, 0);
      const b = a.clone();
      b.rotateY(Math.PI / 2);
      const m = RG.X.mergeGeometries([a, b]);
      // 法線を上向き寄りにして、どの向きから見ても自然な明るさに
      const nrm = m.attributes.normal;
      for (let k = 0; k < nrm.count; k++) nrm.setXYZ(k, nrm.getX(k) * 0.3, 0.9, nrm.getZ(k) * 0.3);
      return m;
    };
    const defs = {
      conifer: { geo: geoFor(7, 15), tex: [TX.tree('conifer', 1), TX.tree('conifer', 2)] },
      broad: { geo: geoFor(11, 13), tex: [TX.tree('broad', 3), TX.tree('broad', 4)] },
    };
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (const kind of Object.keys(lists)) {
      const L = lists[kind];
      for (let v = 0; v < 2; v++) {
        const part = L.filter((t) => (t[4] < 0.5 ? 0 : 1) === v);
        if (!part.length) continue;
        const mat = new THREE.MeshStandardMaterial({ map: defs[kind].tex[v], alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 });
        const im = new THREE.InstancedMesh(defs[kind].geo, mat, part.length);
        part.forEach((t, k) => {
          dummy.position.set(t[0], t[1] - 0.3, t[2]);
          dummy.rotation.set(0, t[4] * Math.PI * 4, 0);
          const s = t[3];
          dummy.scale.set(s, s * (0.85 + ((t[4] * 7) % 1) * 0.35), s);
          dummy.updateMatrix();
          im.setMatrixAt(k, dummy.matrix);
          const tint = 0.8 + ((t[4] * 13) % 1) * 0.35;
          color.setRGB(tint, tint * (0.95 + ((t[4] * 3) % 1) * 0.1), tint * 0.9);
          im.setColorAt(k, color);
        });
        im.castShadow = q === 'high';
        im.receiveShadow = false;
        im.frustumCulled = false;
        g.add(im);
      }
    }
    return g;
  }

  // 建物・観客席・ガントリー・看板・橋
  function buildProps(T, def, q, rnd) {
    const g = new THREE.Group();
    const hw = T.hw;
    const n = T.n;
    const P = (i, lat, dy = 0) => new THREE.Vector3(T.px[i] + T.nx[i] * lat, T.py[i] + dy, T.pz[i] + T.nz[i] * lat);
    const headingAt = (i) => Math.atan2(T.tx[i], T.tz[i]);
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.7 }, o));
    const box = (w, h, d, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.castShadow = q !== 'low';
      m.receiveShadow = true;
      return m;
    };
    // コースに沿って置く(lat の位置、向きはコースに合わせる)
    const place = (obj, s, lat, dy = 0) => {
      const i = T.indexAt(s);
      obj.position.copy(P(i, lat, dy));
      obj.rotation.y = headingAt(i);
      g.add(obj);
      return obj;
    };

    // ---- ピット棟(右側)と観客席(左側)----
    const pitSide = -1;
    const garageTex = TX.garage();
    garageTex.repeat.set(1, 1);
    const winTex = TX.windows();
    const crowdTex = TX.crowd();
    for (let s = -320; s < 120; s += 20) {
      const i = T.indexAt(s);
      const off = T.wallR[i] + 14;
      // ピットレーン(舗装)
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(13, 20.5), std({ map: TX.plainAsphalt(), color: 0x8a8a8a, roughness: 0.9 }));
      lane.rotation.x = -Math.PI / 2;
      lane.receiveShadow = true;
      const laneG = new THREE.Group();
      laneG.add(lane);
      place(laneG, s + 10, pitSide * (T.wallR[i] + 6.8), -0.02);
      // ガレージ棟
      const b = new THREE.Group();
      const body = box(16, 8, 20, std({ map: winTex }));
      body.position.y = 4;
      b.add(body);
      // ガレージの扉(コース側)
      const front = new THREE.Mesh(new THREE.PlaneGeometry(20, 8), std({ map: garageTex }));
      front.position.set(0, 4, 0);
      front.rotation.y = 0;
      const fg = new THREE.Group();
      fg.add(front);
      fg.rotation.y = Math.PI / 2;
      fg.position.x = 8.05;
      b.add(fg);
      const roof = box(18, 0.6, 21, std({ color: 0x3a3f46 }));
      roof.position.y = 8.3;
      b.add(roof);
      place(b, s + 10, pitSide * (off + 8));
      // 反対側の観客席
      const j = T.indexAt(s);
      const offL = T.wallL[j] + 6;
      const st = new THREE.Group();
      for (let r = 0; r < 6; r++) {
        const step = box(20.5, 1.2, 2.6, std({ map: crowdTex, roughness: 0.9 }));
        step.position.set(0, 0.6 + r * 1.2, -(r * 2.2) - 1.3);
        st.add(step);
      }
      const back = box(20.5, 10, 0.5, std({ color: 0x6b7078 }));
      back.position.set(0, 5, -14.2);
      st.add(back);
      const sroof = box(21, 0.4, 16, std({ color: 0xe9ecef, metalness: 0.3 }));
      sroof.position.set(0, 10.5, -7.5);
      sroof.rotation.x = -0.06;
      st.add(sroof);
      const holder = new THREE.Group();
      st.rotation.y = -Math.PI / 2;
      holder.add(st);
      place(holder, s + 10, offL);
    }
    // 管制塔
    {
      const i = T.indexAt(-60);
      const tower = new THREE.Group();
      const base = box(14, 18, 14, std({ color: 0xd5d9de }));
      base.position.y = 9;
      tower.add(base);
      const glass = box(16, 5, 16, std({ color: 0x1b2a3a, metalness: 0.6, roughness: 0.15 }));
      glass.position.y = 20.5;
      tower.add(glass);
      const top = box(17, 0.8, 17, std({ color: 0x2c3036 }));
      top.position.y = 23.4;
      tower.add(top);
      place(tower, -60, -(T.wallR[i] + 34));
    }

    // ---- スタートのガントリー(信号)----
    const startLights = [];
    {
      const i = 0;
      const gw = 2 * hw + 6;
      const gt = new THREE.Group();
      const mat = std({ color: 0x2b2f35, metalness: 0.5, roughness: 0.4 });
      const beam = box(gw, 1.4, 1.2, mat);
      beam.position.y = 7.2;
      gt.add(beam);
      for (const sx of [-1, 1]) {
        const p = box(0.8, 7.9, 0.8, mat);
        p.position.set((sx * gw) / 2, 3.95, 0);
        gt.add(p);
      }
      const panel = box(6, 1.6, 0.4, std({ color: 0x0b0b0c }));
      panel.position.set(0, 5.9, -0.5);
      gt.add(panel);
      for (let k = 0; k < 5; k++) {
        const lm = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x000000, emissiveIntensity: 4 });
        for (const row of [0.35, -0.35]) {
          const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), lm);
          lamp.position.set(-2.2 + k * 1.1, 5.9 + row, -0.71);
          lamp.rotation.y = Math.PI;
          gt.add(lamp);
        }
        startLights.push(lm);
      }
      // ゴールの看板
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.4), std({ map: TX.sign('START / FINISH', { w: 1024, h: 140, bg: '#101418', fg: '#ffffff', font: 'bold 100px Arial' }) }));
      sign.position.set(0, 7.2, -0.62);
      sign.rotation.y = Math.PI;
      gt.add(sign);
      const sign2 = sign.clone();
      sign2.position.z = 0.62;
      sign2.rotation.y = 0;
      gt.add(sign2);
      place(gt, 0, 0);
    }

    // ---- 歩道橋(広告付き)----
    const bridges = def.theme.bridge === 'dunlop' ? [{ at: 0.034, tire: true }] : [];
    bridges.push({ at: 0.5 }, { at: 0.8 });
    for (const br of bridges) {
      const s = br.at * T.len;
      const i = T.indexAt(s);
      const wl = T.wallL[i] + 2, wr = T.wallR[i] + 2;
      const span = wl + wr;
      const bg = new THREE.Group();
      if (br.tire) {
        // タイヤの形のアーチ(ダンロップ・ブリッジ風)
        const arch = new THREE.Mesh(new THREE.TorusGeometry(span / 2, 2.6, 16, 48, Math.PI), std({ color: 0x151515, roughness: 0.85 }));
        arch.position.set((wl - wr) / 2, -2, 0);
        arch.rotation.y = 0;
        bg.add(arch);
        const deck = box(span + 6, 1.6, 4, std({ color: 0xffd200 }));
        deck.position.set((wl - wr) / 2, span / 2 - 2.6, 0);
        bg.add(deck);
        const t = TX.sign('NORDIK TYRES', { w: 1024, h: 128, bg: '#ffd200', fg: '#111', font: 'bold 100px Arial' });
        for (const z of [-2.05, 2.05]) {
          const pl = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.8, 1.4), std({ map: t }));
          pl.position.set((wl - wr) / 2, span / 2 - 2.6, z);
          if (z < 0) pl.rotation.y = Math.PI;
          bg.add(pl);
        }
      } else {
        const deck = box(span + 4, 1.2, 3, std({ color: 0xbfc4c9 }));
        deck.position.set((wl - wr) / 2, 6.6, 0);
        bg.add(deck);
        for (const x of [wl, -wr]) {
          const p = box(1.2, 6.6, 1.2, std({ color: 0x9aa0a6 }));
          p.position.set(x, 3.3, 0);
          bg.add(p);
        }
        const brand = TX.BRANDS[Math.floor(rnd() * TX.BRANDS.length)];
        const t = TX.sign(brand[0], { w: 1024, h: 128, bg: brand[1], fg: brand[2], font: 'bold 96px Arial' });
        for (const z of [-1.55, 1.55]) {
          const pl = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.85, 1.1), std({ map: t }));
          pl.position.set((wl - wr) / 2, 6.6, z);
          if (z < 0) pl.rotation.y = Math.PI;
          bg.add(pl);
        }
      }
      // 橋はコースと直交:x 軸がコースの左方向になるように置く
      const holder = new THREE.Group();
      bg.rotation.y = 0;
      holder.add(bg);
      holder.position.copy(P(i, 0));
      // heading で回すと、ローカルの x 軸がコースの左向きになる
      holder.rotation.y = headingAt(i);
      g.add(holder);
    }

    // ---- ブレーキの目安看板(300/200/100)----
    const prof = RG.speedProfile(T, RG.CARS[0], 1);
    const signTex = {
      300: TX.sign('300', { w: 256, h: 256, bg: '#ffffff', fg: '#111', font: 'bold 140px Arial', border: '#111' }),
      200: TX.sign('200', { w: 256, h: 256, bg: '#ffffff', fg: '#111', font: 'bold 140px Arial', border: '#111' }),
      100: TX.sign('100', { w: 256, h: 256, bg: '#ffffff', fg: '#111', font: 'bold 140px Arial', border: '#111' }),
    };
    const ds = T.ds;
    let lastBrake = -1e9;
    for (let i = 0; i < n; i++) {
      const v0 = prof[i];
      const j = (i + Math.round(250 / ds)) % n;
      if (v0 > 50 && v0 - prof[j] > 22 && prof[(i - 1 + n) % n] <= v0 + 0.01 && T.s[i] - lastBrake > 500) {
        // ここからブレーキ。曲がる向きの外側に置く
        let kk = 0;
        for (let o = 0; o < Math.round(350 / ds); o++) kk += T.k[(i + o) % n];
        const side = kk > 0 ? -1 : 1;
        for (const d of [300, 200, 100]) {
          const s = T.s[i] + (300 - d) * 0.9;
          const ii = T.indexAt(s);
          const wall = side > 0 ? T.wallL[ii] : T.wallR[ii];
          const sg = new THREE.Group();
          const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), std({ map: signTex[d] }));
          pl.position.y = 1.9;
          pl.rotation.y = Math.PI;
          sg.add(pl);
          const pole = box(0.12, 1.4, 0.12, std({ color: 0x777777 }));
          pole.position.y = 0.7;
          sg.add(pole);
          place(sg, s, side * (wall + 0.8));
        }
        lastBrake = T.s[i];
      }
    }
    // ---- コーナー名の看板 ----
    for (const lm of def.landmarks || []) {
      const s = lm.at * T.len;
      const i = T.indexAt(s);
      const side = T.k[i] > 0 ? -1 : 1;
      const wall = side > 0 ? T.wallL[i] : T.wallR[i];
      const t = TX.sign(lm.name, { w: 1024, h: 192, bg: '#0f2a4a', fg: '#ffffff', font: 'bold 110px "M PLUS Rounded 1c", sans-serif' });
      const sg = new THREE.Group();
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), std({ map: t }));
      pl.position.y = 3.2;
      pl.rotation.y = Math.PI + (side > 0 ? 0.5 : -0.5);
      sg.add(pl);
      for (const x of [-3.5, 3.5]) {
        const p = box(0.15, 3.2, 0.15, std({ color: 0x666666 }));
        p.position.set(x * Math.cos(0.5), 1.6, 0);
        sg.add(p);
      }
      place(sg, s - 40, side * (wall + 4));
    }

    // ---- マーシャルポスト・照明 ----
    const lamps = [];
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xfff1c9, emissiveIntensity: 0 });
    const poleMat = std({ color: 0x6b6f75, metalness: 0.4 });
    for (let s = 150; s < T.len - 150; s += 420) {
      const i = T.indexAt(s);
      const side = rnd() < 0.5 ? 1 : -1;
      const wall = side > 0 ? T.wallL[i] : T.wallR[i];
      const post = new THREE.Group();
      const hut = box(2.2, 2.4, 2.2, std({ color: 0xf2f2f2 }));
      hut.position.y = 1.2;
      post.add(hut);
      const rf = box(2.6, 0.2, 2.6, std({ color: 0xff7a00 }));
      rf.position.y = 2.5;
      post.add(rf);
      const num = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), std({ map: TX.sign(String(Math.round(s / 420) + 1), { w: 128, h: 64, bg: '#111', fg: '#fff', font: 'bold 50px Arial' }) }));
      num.position.set(0, 1.7, side > 0 ? -1.11 : 1.11);
      if (side > 0) num.rotation.y = Math.PI;
      const nh = new THREE.Group();
      nh.add(num);
      nh.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      post.add(nh);
      place(post, s, side * (wall + 3));
    }
    // 夜用の照明柱(光の玉だけ。本物の光源は自分の車のライト)
    for (let s = 0; s < T.len; s += 90) {
      const i = T.indexAt(s);
      const side = Math.floor(s / 90) % 2 ? 1 : -1;
      const wall = side > 0 ? T.wallL[i] : T.wallR[i];
      const pole = new THREE.Group();
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 11, 6), poleMat);
      p.position.y = 5.5;
      pole.add(p);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.6), poleMat);
      arm.position.set(0, 10.9, 0);
      const armG = new THREE.Group();
      armG.add(arm);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.0), lampMat);
      head.position.set(0, 10.75, 0.9);
      armG.add(head);
      armG.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      pole.add(armG);
      place(pole, s, side * (wall + 1.5));
      lamps.push(P(i, side * (wall - 0.6), 10.6));
    }
    return { group: g, startLights, lamps, lampMat };
  }

  // 遠くの山並み(富士山を含む)
  function buildMountains(T, theme, rnd, tod) {
    const g = new THREE.Group();
    let cx = 0, cz = 0;
    for (let i = 0; i < T.n; i++) { cx += T.px[i]; cz += T.pz[i]; }
    cx /= T.n; cz /= T.n;
    const haze = tod === 'night' ? new THREE.Color(0x0b1220) : tod === 'dusk' ? new THREE.Color(0x8a6a78) : new THREE.Color(0x9fb3c8);
    // 遠景の山の帯
    const N = U.makeNoise(theme.hills * 13 + 1);
    const segs = 256;
    const pos = [], col = [], idx = [];
    const R0 = 9000, R1 = 12000;
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const hgt = (Math.max(0, N.fbm(Math.cos(a) * 3 + 5, Math.sin(a) * 3 + 5, 5)) * 1.6 + 0.12) * (theme.hills * 18 + 120);
      for (const [r, h] of [[R0, -20], [R1, hgt]]) {
        pos.push(cx + Math.cos(a) * r, h, cz + Math.sin(a) * r);
        const c = haze.clone().lerp(new THREE.Color(0x4a6a5a), h < 0 ? 0.4 : 0.18);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let k = 0; k < segs; k++) {
      const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    g.add(ring);
    if (theme.fuji) {
      // 富士山:裾野の広い円すい+雪のかさ
      const prof = [];
      const H = 3776 * 0.9, Rb = 16000;
      for (let k = 0; k <= 40; k++) {
        const t = k / 40;
        const r = Rb * Math.pow(1 - t, 1.9) + 300 * (1 - t);
        prof.push(new THREE.Vector2(Math.max(r, 250 * (1 - t) + 1), t * H));
      }
      prof.push(new THREE.Vector2(0.01, H));
      const lg = new THREE.LatheGeometry(prof, 96);
      const cols = [];
      const p = lg.attributes.position;
      const NN = U.makeNoise(99);
      const snow = new THREE.Color(0xf4f7fb), rock = haze.clone().lerp(new THREE.Color(0x3c4f6a), 0.55);
      if (tod === 'dusk') snow.set(0xf6c9b5);
      if (tod === 'night') snow.set(0x2b3550);
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
        const a = Math.atan2(z, x);
        const line = H * 0.68 + NN.n2(a * 8, 0) * H * 0.07 + Math.sin(a * 23) * H * 0.02;
        const c = y > line ? snow : rock;
        cols.push(c.r, c.g, c.b);
      }
      lg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const fuji = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
      fuji.position.set(cx + 6500, -40, cz - 20000);
      g.add(fuji);
    }
    g.renderOrder = -1;
    return g;
  }

  RG.buildWorld = buildWorld;
})();
