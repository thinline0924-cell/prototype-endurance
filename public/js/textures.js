// 画像ファイルを使わず、canvas で質感(テクスチャ)を作る
(function () {
  'use strict';
  const RG = (window.RG = window.RG || {});
  const U = RG.U;

  const TX = (RG.TX = {});
  let maxAniso = 8;
  TX.setAniso = (a) => (maxAniso = a);

  function tex(canvas, { srgb = true, repeat = true } = {}) {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    t.needsUpdate = true;
    return t;
  }
  TX.tex = tex;

  // 高さの画像から法線マップを作る
  function normalFromHeight(hcan, strength) {
    const w = hcan.width, h = hcan.height;
    const src = hcan.getContext('2d').getImageData(0, 0, w, h).data;
    const { c, g } = U.canvas(w, h);
    const img = g.createImageData(w, h);
    const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
        const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
        const l = Math.hypot(dx, dy, 1);
        const o = (y * w + x) * 4;
        img.data[o] = ((-dx / l) * 0.5 + 0.5) * 255;
        img.data[o + 1] = ((dy / l) * 0.5 + 0.5) * 255;
        img.data[o + 2] = (1 / l) * 0.5 * 255 + 127;
        img.data[o + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return tex(c, { srgb: false });
  }

  function noiseCanvas(w, h, seed, fn) {
    const { c, g } = U.canvas(w, h);
    const img = g.createImageData(w, h);
    const rnd = U.rng(seed);
    const N = U.makeNoise(seed);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const [r, gg, b] = fn(x, y, rnd, N);
        img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ---- アスファルト(白線入り)----
  TX.asphalt = (width) => {
    const W = 512, H = 512;
    const c = noiseCanvas(W, H, 11, (x, y, rnd, N) => {
      const n = N.fbm(x / 9, y / 9, 3) * 18 + (rnd() - 0.5) * 34 + N.n2(x / 60, y / 90) * 10;
      let v = 72 + n;
      if (rnd() < 0.015) v += 40; // 明るい小石
      return [v, v, v * 1.02];
    });
    const g = c.getContext('2d');
    // 白線(コースの端)
    const lw = Math.max(4, (W * 0.28) / width);
    g.fillStyle = 'rgba(236,236,230,0.95)';
    g.fillRect(0, 0, lw, H);
    g.fillRect(W - lw, 0, lw, H);
    // 白線のかすれ
    const rnd = U.rng(5);
    g.fillStyle = 'rgba(70,70,72,0.5)';
    for (let i = 0; i < 400; i++) {
      const x = rnd() < 0.5 ? rnd() * lw : W - rnd() * lw;
      g.fillRect(x, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 3);
    }
    return tex(c);
  };
  TX.asphaltNormal = () => {
    const c = noiseCanvas(256, 256, 12, (x, y, rnd, N) => {
      const v = 128 + (rnd() - 0.5) * 120 + N.n2(x / 4, y / 4) * 40;
      return [v, v, v];
    });
    return normalFromHeight(c, 2.2);
  };
  TX.plainAsphalt = () => {
    const c = noiseCanvas(256, 256, 21, (x, y, rnd, N) => {
      const v = 80 + N.fbm(x / 7, y / 7, 3) * 20 + (rnd() - 0.5) * 30;
      return [v, v, v * 1.02];
    });
    return tex(c);
  };

  // ---- 芝(刈り込みのしま模様)----
  TX.grass = (base, stripes) => {
    const W = 256, H = 256;
    const c = noiseCanvas(W, H, 31, (x, y, rnd, N) => {
      const n = N.fbm(x / 6, y / 6, 3) * 0.25 + (rnd() - 0.5) * 0.22;
      const band = stripes ? (Math.floor(y / 64) % 2 ? 0.1 : -0.06) : 0;
      const k = 1 + n + band;
      return [base[0] * 255 * k, base[1] * 255 * k, base[2] * 255 * k];
    });
    return tex(c);
  };
  TX.terrainGrass = (base) => {
    const c = noiseCanvas(256, 256, 41, (x, y, rnd, N) => {
      const n = N.fbm(x / 12, y / 12, 4) * 0.35 + (rnd() - 0.5) * 0.2;
      const k = 1 + n;
      return [base[0] * 255 * k * 1.05, base[1] * 255 * k, base[2] * 255 * k * 0.9];
    });
    return tex(c);
  };
  TX.gravel = () => {
    const c = noiseCanvas(256, 256, 51, (x, y, rnd, N) => {
      const n = (rnd() - 0.5) * 0.5 + N.n2(x / 3, y / 3) * 0.2;
      const k = 1 + n;
      return [182 * k, 160 * k, 122 * k];
    });
    return tex(c);
  };
  TX.gravelNormal = () => {
    const c = noiseCanvas(128, 128, 52, (x, y, rnd) => {
      const v = rnd() * 255;
      return [v, v, v];
    });
    return normalFromHeight(c, 3);
  };

  // ---- 縁石(赤白)----
  TX.curb = () => {
    const { c, g } = U.canvas(256, 64);
    g.fillStyle = '#d8d8d4';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#c3141c';
    g.fillRect(0, 0, 128, 64);
    const rnd = U.rng(3);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`;
      g.fillRect(rnd() * 256, rnd() * 64, 2, 2);
    }
    // 端の影(段差)
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.25)');
    gr.addColorStop(0.15, 'rgba(0,0,0,0)');
    gr.addColorStop(0.85, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 64);
    return tex(c);
  };

  // ---- 壁の広告(架空のブランド)----
  const BRANDS = [
    ['APEX OIL', '#ffd200', '#111'], ['NORDIK TYRES', '#0a2a6b', '#fff'], ['VELOCITA', '#c8102e', '#fff'],
    ['KAIZEN MOTOR', '#ffffff', '#c8102e'], ['SOLARIS', '#ff7a00', '#111'], ['TORQUE ENERGY', '#00a650', '#fff'],
    ['MERIDIAN WATCH', '#111111', '#d4af37'], ['HAYATE', '#1c1c1c', '#ff3b3b'], ['BLUEWAVE', '#0072ce', '#fff'],
    ['GRAND PRIX RADIO', '#6a1b9a', '#fff'], ['AURORA FUEL', '#e30613', '#ffeb00'], ['SAKURA BANK', '#ffffff', '#e4007f'],
  ];
  TX.BRANDS = BRANDS;
  TX.adWall = () => {
    const { c, g } = U.canvas(2048, 128);
    g.fillStyle = '#9a9a96';
    g.fillRect(0, 0, 2048, 128);
    let x = 0;
    let k = 0;
    while (x < 2048) {
      const [name, bg, fg] = BRANDS[k % BRANDS.length];
      const w = 340;
      g.fillStyle = bg;
      g.fillRect(x + 4, 16, w - 8, 96);
      g.fillStyle = fg;
      g.font = 'bold 56px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(name, x + w / 2, 66, w - 30);
      x += w;
      k += 5;
    }
    // 汚れ
    const rnd = U.rng(9);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = `rgba(40,30,20,${rnd() * 0.08})`;
      g.fillRect(rnd() * 2048, rnd() * 128, 3, 2);
    }
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, 118, 2048, 10);
    return tex(c);
  };
  TX.armco = () => {
    const { c, g } = U.canvas(256, 128);
    g.clearRect(0, 0, 256, 128);
    // 支柱
    g.fillStyle = '#5b5d60';
    g.fillRect(118, 0, 20, 128);
    // 2段のガードレール
    for (const y0 of [18, 62]) {
      const gr = g.createLinearGradient(0, y0, 0, y0 + 40);
      gr.addColorStop(0, '#c9cdd1');
      gr.addColorStop(0.3, '#f1f3f5');
      gr.addColorStop(0.5, '#8d9298');
      gr.addColorStop(0.7, '#e2e5e8');
      gr.addColorStop(1, '#7b8086');
      g.fillStyle = gr;
      g.fillRect(0, y0, 256, 40);
    }
    return tex(c);
  };
  TX.fence = () => {
    const { c, g } = U.canvas(128, 128);
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(200,205,210,0.95)';
    g.lineWidth = 2;
    for (let i = -128; i < 256; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
      g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke();
    }
    g.fillStyle = '#6d7277';
    g.fillRect(0, 0, 4, 128);
    g.fillRect(0, 0, 128, 4);
    return tex(c);
  };

  // ---- 木(ビルボード)----
  TX.tree = (kind, seed) => {
    const W = 256, H = 512;
    const { c, g } = U.canvas(W, H);
    g.clearRect(0, 0, W, H);
    const rnd = U.rng(seed);
    // 幹
    g.fillStyle = '#3b2a1c';
    g.fillRect(W / 2 - 7, H * 0.55, 14, H * 0.45);
    const leaf = (x, y, r, l) => {
      const col = `hsl(${95 + rnd() * 30}, ${35 + rnd() * 25}%, ${l}%)`;
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    };
    if (kind === 'conifer') {
      for (let i = 0; i < 900; i++) {
        const t = rnd();
        const y = 20 + t * (H * 0.82);
        const half = 8 + t * W * 0.42;
        const x = W / 2 + (rnd() * 2 - 1) * half * (0.3 + 0.7 * rnd());
        const shade = 12 + rnd() * 14 + (x > W / 2 ? -4 : 3);
        g.fillStyle = `hsl(${120 + rnd() * 25}, ${30 + rnd() * 20}%, ${shade}%)`;
        g.fillRect(x - 6, y - 2, 12 + rnd() * 6, 4 + rnd() * 3);
      }
    } else {
      for (let i = 0; i < 700; i++) {
        const a = rnd() * Math.PI * 2;
        const rr = Math.sqrt(rnd());
        const x = W / 2 + Math.cos(a) * rr * W * 0.43;
        const y = H * 0.36 + Math.sin(a) * rr * H * 0.3;
        const l = 16 + rnd() * 18 + (y < H * 0.3 ? 8 : 0) + (x < W / 2 ? 4 : -3);
        leaf(x, y, 6 + rnd() * 10, l);
      }
    }
    return tex(c, { repeat: false });
  };

  // ---- 観客席 ----
  TX.crowd = () => {
    const { c, g } = U.canvas(512, 256);
    g.fillStyle = '#2a2d33';
    g.fillRect(0, 0, 512, 256);
    const rnd = U.rng(77);
    for (let row = 0; row < 16; row++) {
      g.fillStyle = '#41454d';
      g.fillRect(0, row * 16 + 12, 512, 4);
      for (let x = 0; x < 512; x += 6) {
        if (rnd() < 0.2) continue;
        g.fillStyle = `hsl(${rnd() * 360}, ${40 + rnd() * 50}%, ${35 + rnd() * 40}%)`;
        g.fillRect(x + rnd() * 2, row * 16 + 3 + rnd() * 2, 4, 8);
        g.fillStyle = `hsl(25, 40%, ${45 + rnd() * 30}%)`;
        g.fillRect(x + 1, row * 16 + 1, 2, 3);
      }
    }
    return tex(c);
  };
  TX.garage = () => {
    const { c, g } = U.canvas(512, 128);
    g.fillStyle = '#d9dcdf';
    g.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 4; i++) {
      const x = i * 128 + 12;
      g.fillStyle = '#2b2f36';
      g.fillRect(x, 30, 104, 98);
      g.fillStyle = '#3a404a';
      for (let y = 34; y < 128; y += 8) g.fillRect(x + 2, y, 100, 3);
      g.fillStyle = '#0e1116';
      g.fillRect(x + 20, 6, 64, 18);
      g.fillStyle = '#ffd200';
      g.font = 'bold 14px Arial';
      g.textAlign = 'center';
      g.fillText('PIT ' + (i + 1), x + 52, 20);
    }
    return tex(c);
  };
  TX.windows = () => {
    const { c, g } = U.canvas(256, 128);
    g.fillStyle = '#c9ccd0';
    g.fillRect(0, 0, 256, 128);
    for (let y = 8; y < 128; y += 40)
      for (let x = 6; x < 256; x += 32) {
        const gr = g.createLinearGradient(x, y, x + 26, y + 30);
        gr.addColorStop(0, '#4d6a85');
        gr.addColorStop(1, '#1d2a38');
        g.fillStyle = gr;
        g.fillRect(x, y, 26, 30);
      }
    return tex(c);
  };

  // 看板(文字)
  TX.sign = (text, { w = 512, h = 256, bg = '#ffffff', fg = '#111', font = 'bold 150px Arial', border = null } = {}) => {
    const { c, g } = U.canvas(w, h);
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    if (border) {
      g.strokeStyle = border;
      g.lineWidth = h * 0.06;
      g.strokeRect(h * 0.03, h * 0.03, w - h * 0.06, h - h * 0.06);
    }
    g.fillStyle = fg;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + h * 0.03, w * 0.9);
    return tex(c, { repeat: false });
  };

  // カーボンの織り目
  TX.carbon = () => {
    const { c, g } = U.canvas(64, 64);
    for (let y = 0; y < 64; y += 8)
      for (let x = 0; x < 64; x += 8) {
        const odd = ((x + y) / 8) % 2;
        const gr = odd ? g.createLinearGradient(x, y, x + 8, y) : g.createLinearGradient(x, y, x, y + 8);
        gr.addColorStop(0, '#0d0d0f');
        gr.addColorStop(0.5, '#2a2b2f');
        gr.addColorStop(1, '#0d0d0f');
        g.fillStyle = gr;
        g.fillRect(x, y, 8, 8);
      }
    const t = tex(c);
    t.repeat.set(6, 6);
    return t;
  };

  // タイヤの側面(ロゴ風の文字)
  TX.tireSide = () => {
    const { c, g } = U.canvas(512, 64);
    g.fillStyle = '#151515';
    g.fillRect(0, 0, 512, 64);
    g.fillStyle = '#d9d9d9';
    g.font = 'bold 30px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('NORDIK  RACING  SLICK', 128, 34);
    g.fillText('NORDIK  RACING  SLICK', 384, 34);
    return tex(c);
  };

  // ゼッケン(白丸に番号)
  TX.numberDecal = (num, color = '#111') => {
    const { c, g } = U.canvas(256, 256);
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#ffffff';
    U.roundRect(g, 8, 8, 240, 240, 40);
    g.fill();
    g.fillStyle = color;
    g.font = 'bold 170px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(num, 128, 140, 220);
    return tex(c, { repeat: false });
  };

  // やわらかい丸(煙・光のにじみ)
  TX.softDot = () => {
    const { c, g } = U.canvas(128, 128);
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return tex(c, { repeat: false });
  };
  TX.smoke = () => {
    const { c, g } = U.canvas(128, 128);
    const rnd = U.rng(4);
    for (let i = 0; i < 40; i++) {
      const x = 64 + (rnd() - 0.5) * 50, y = 64 + (rnd() - 0.5) * 50, r = 20 + rnd() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.12)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    }
    return tex(c, { repeat: false });
  };
  TX.skid = () => {
    const { c, g } = U.canvas(32, 64);
    const rnd = U.rng(8);
    for (let x = 0; x < 32; x++) {
      const a = 0.55 + rnd() * 0.45;
      g.fillStyle = `rgba(10,10,10,${a * (x < 3 || x > 28 ? 0.4 : 1)})`;
      g.fillRect(x, 0, 1, 64);
    }
    return tex(c);
  };
})();
