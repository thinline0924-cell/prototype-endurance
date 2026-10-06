// 3Dの「机の上の飛び出す絵本」。Three.js で描く。
// 画面(HTML)のことは ui.js、計算は sim.js。ここは見た目だけ。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PW = window.PW;
const S = 0.022;                 // 地図(600x400)→3Dの大きさ
const PAGE_TOP = 0.6;            // 本のページの高さ
const ROAD_Y = PAGE_TOP + 0.3;   // 道の高さ
const ROAD_W = 0.27;             // 道の半分の幅
const toX = (px) => (px - 300) * S;
const toZ = (py) => (py - 200) * S;

// ---------- 紙っぽい質感(キャンバスで作る) ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}
function noiseFill(g, w, h, base, amt) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h / 6; i++) {
    const v = Math.random();
    g.fillStyle = v > 0.5 ? `rgba(255,255,255,${amt * Math.random()})` : `rgba(0,0,0,${amt * Math.random()})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1);
  }
}
const paperTex = canvasTex(256, 256, (g, w, h) => noiseFill(g, w, h, '#ffffff', 0.09), 2);

function woodTex() {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#2a1a10'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 128) {
      g.fillStyle = y / 128 % 2 ? '#2e1d12' : '#26170e';
      g.fillRect(0, y, w, 126);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y + 126, w, 2);
    }
    for (let i = 0; i < 900; i++) {
      const y = Math.random() * h;
      g.strokeStyle = `rgba(${Math.random() > 0.5 ? '90,60,35' : '15,8,4'},${0.15 + Math.random() * 0.25})`;
      g.lineWidth = Math.random() * 2;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= w; x += 64) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 3);
      g.stroke();
    }
  }, 6);
}

function mat(color, opt = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.92, metalness: 0, map: paperTex }, opt));
}
const GOLD = new THREE.MeshStandardMaterial({ color: '#d4a64a', metalness: 0.95, roughness: 0.32 });
const DARKGOLD = new THREE.MeshStandardMaterial({ color: '#8a6526', metalness: 0.9, roughness: 0.45 });

function shadowAll(o, cast = true, recv = true) {
  o.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = recv; } });
  return o;
}

// ---------- 小物(紙細工) ----------
function makeTree(s = 1, dark) {
  const g = new THREE.Group();
  const greens = dark ? ['#2f5a33', '#36653a', '#2a4f2e'] : ['#3d6f3a', '#467d41', '#365f34'];
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.25, 5), mat('#5a3d26'));
  trunk.position.y = 0.12; g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const r = (0.3 - i * 0.07), h = 0.38 - i * 0.05;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat(greens[i % 3], { flatShading: true }));
    cone.position.y = 0.28 + i * 0.2;
    cone.rotation.y = Math.random() * 3;
    g.add(cone);
  }
  g.scale.setScalar(s * (0.8 + Math.random() * 0.4));
  return shadowAll(g);
}

function crowdTex() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#3a3340'; g.fillRect(0, 0, w, h);
    const cols = ['#e2483d', '#f2c14e', '#f4f1ea', '#2f6db5', '#4f9d69', '#e98fae'];
    for (let y = 4; y < h; y += 10) for (let x = 3; x < w; x += 7) {
      g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
      g.beginPath(); g.arc(x + Math.random() * 2, y, 2.4, 0, 7); g.fill();
    }
  });
}

function makeStand(s = 1) {
  const g = new THREE.Group();
  const ct = crowdTex();
  for (let i = 0; i < 4; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.16), [
      mat('#d8cdb8'), mat('#d8cdb8'), mat('#efe6d2'), mat('#d8cdb8'),
      new THREE.MeshStandardMaterial({ map: ct, roughness: 1 }), mat('#d8cdb8'),
    ]);
    step.position.set(0, 0.06 + i * 0.12, -i * 0.15);
    g.add(step);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.75), mat('#b8323a'));
  roof.position.set(0, 0.78, -0.25); roof.rotation.x = -0.12; g.add(roof);
  for (const x of [-0.68, 0.68]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8), mat('#eee'));
    p.position.set(x, 0.4, -0.55); g.add(p);
  }
  g.scale.setScalar(s);
  return shadowAll(g);
}

function makePit(teamColor) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.38, 0.5), mat('#efe6d2'));
  body.position.y = 0.19; g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.06, 0.62), mat('#4b4f5c'));
  roof.position.y = 0.41; g.add(roof);
  const cols = ['#2f6db5', '#4b4f5c', '#e88b2e', '#5bb6d6', teamColor || '#e2483d', '#e98fae', '#4f9d69', '#7a5aa6', '#8a6a4f', '#b8323a'];
  for (let i = 0; i < 10; i++) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.02), mat(cols[i]));
    door.position.set(-1.2 + i * 0.267, 0.14, 0.26); g.add(door);
  }
  // 屋根の上の看板と時計塔
  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), mat('#efe6d2'));
  tower.position.set(1.15, 0.8, 0); g.add(tower);
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 20), GOLD);
  clock.rotation.x = Math.PI / 2; clock.position.set(1.15, 1.02, 0.16); g.add(clock);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 0.04), mat('#2d2a32'));
  sign.position.set(-0.3, 0.58, 0); g.add(sign);
  return shadowAll(g);
}

function makeHouse(s = 1) {
  const g = new THREE.Group();
  const cols = ['#efe6d2', '#e8d5b0', '#f2e2c4'];
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.34), mat(cols[Math.floor(Math.random() * 3)]));
  b.position.y = 0.15; g.add(b);
  const r = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.24, 4), mat('#a8483a', { flatShading: true }));
  r.position.y = 0.42; r.rotation.y = Math.PI / 4; g.add(r);
  const d = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.02), mat('#5a3d26'));
  d.position.set(0, 0.07, 0.175); g.add(d);
  g.scale.setScalar(s);
  return shadowAll(g);
}

function makeWheel() {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  spin.position.y = 0.95;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.025, 6, 40), mat('#f4f1ea'));
  spin.add(ring);
  const cols = ['#e2483d', '#f2c14e', '#2f6db5', '#4f9d69', '#e98fae', '#e88b2e'];
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.7, 0.015), mat('#f4f1ea'));
    sp.position.set(Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0); sp.rotation.z = a - Math.PI / 2;
    spin.add(sp);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), mat(cols[i % 6]));
    cab.position.set(Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0);
    cab.userData.cab = true;
    spin.add(cab);
  }
  g.add(spin);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.05, 0.04), mat('#f4f1ea'));
    leg.position.set(sx * 0.25, 0.48, 0); leg.rotation.z = sx * 0.25; g.add(leg);
  }
  g.userData.spin = spin;
  return shadowAll(g);
}

function makeRock(s = 1) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), mat('#7d7a74', { flatShading: true }));
  m.scale.set(s * 1.3, s * 0.7, s);
  m.position.y = 0.08;
  m.rotation.y = Math.random() * 3;
  const g = new THREE.Group(); g.add(m);
  return shadowAll(g);
}

// 奥に立つ背景の切り絵(山・森・町)
function makeBackdrop(kind) {
  const tex = canvasTex(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    if (kind === 'mountain') {
      g.fillStyle = '#6f7f99';
      g.beginPath(); g.moveTo(0, h); g.lineTo(0, 200); g.lineTo(160, 150); g.lineTo(300, 190); g.lineTo(w, 210); g.lineTo(w, h); g.fill();
      g.fillStyle = '#5a6f8f';
      g.beginPath(); g.moveTo(230, h); g.lineTo(520, 18); g.lineTo(820, h); g.fill();
      g.fillStyle = '#f4f1ea';
      g.beginPath(); g.moveTo(452, 80); g.lineTo(520, 18); g.lineTo(590, 82); g.lineTo(565, 72); g.lineTo(540, 92); g.lineTo(515, 70); g.lineTo(490, 92); g.lineTo(470, 74); g.fill();
      g.fillStyle = '#4c6a4a';
      g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 40) g.lineTo(x, 225 + Math.sin(x * 0.03) * 10); g.lineTo(w, h); g.fill();
    } else if (kind === 'forest') {
      for (let layer = 0; layer < 3; layer++) {
        g.fillStyle = ['#3d5a46', '#2f4b39', '#24402f'][layer];
        const base = 120 + layer * 45;
        g.beginPath(); g.moveTo(0, h);
        for (let x = 0; x <= w; x += 18) {
          const t = base - 30 - Math.random() * 40 + Math.sin(x * 0.01 + layer) * 20;
          g.lineTo(x, base); g.lineTo(x + 9, t); g.lineTo(x + 18, base);
        }
        g.lineTo(w, h); g.fill();
      }
    } else {
      g.fillStyle = '#8fae6c';
      g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 30) g.lineTo(x, 175 + Math.sin(x * 0.012) * 18); g.lineTo(w, h); g.fill();
      // 遠くの町
      for (let i = 0; i < 26; i++) {
        const x = 520 + i * 18, bh = 20 + Math.random() * 40;
        g.fillStyle = ['#d9c9a8', '#c9b48e', '#e3d6bb'][i % 3];
        g.fillRect(x, 175 - bh, 16, bh + 10);
        g.fillStyle = '#a8483a'; g.fillRect(x - 1, 172 - bh, 18, 5);
      }
      g.fillStyle = '#d9c9a8'; g.fillRect(700, 70, 14, 110); // 教会の塔
      g.beginPath(); g.moveTo(694, 72); g.lineTo(707, 40); g.lineTo(720, 72); g.fill();
      g.fillStyle = '#6f9a55';
      g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 30) g.lineTo(x, 205 + Math.sin(x * 0.02 + 1) * 10); g.lineTo(w, h); g.fill();
    }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.05, roughness: 1, side: THREE.DoubleSide }));
  m.position.y = 1.75;
  m.castShadow = true; m.receiveShadow = true;
  const g = new THREE.Group(); g.add(m);
  return g;
}

function makeCloud() {
  const g = new THREE.Group();
  const m = mat('#f4f1ea', { flatShading: true, transparent: true });
  const parts = [[0, 0, 0, 0.55], [0.5, -0.05, 0, 0.42], [-0.5, -0.08, 0, 0.4], [0.2, 0.25, 0, 0.38], [-0.25, 0.2, 0, 0.35]];
  for (const [x, y, z, r] of parts) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), m);
    s.position.set(x, y, z); s.scale.z = 0.45; g.add(s);
  }
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 6), new THREE.MeshBasicMaterial({ color: '#c9b48e', transparent: true, opacity: 0.5 }));
  wire.position.y = 3; g.add(wire);
  g.userData.mat = m;
  return shadowAll(g, true, false);
}

function makeSun() {
  const tex = canvasTex(256, 256, (g, w, h) => {
    g.translate(128, 128);
    g.fillStyle = '#f2b84a';
    for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.beginPath(); g.moveTo(-18, 70); g.lineTo(0, 124); g.lineTo(18, 70); g.fill(); }
    g.fillStyle = '#f7cf5e'; g.beginPath(); g.arc(0, 0, 70, 0, 7); g.fill();
    g.fillStyle = '#e8a93a'; g.beginPath(); g.arc(-22, -10, 7, 0, 7); g.arc(22, -10, 7, 0, 7); g.fill();
    g.strokeStyle = '#e8a93a'; g.lineWidth = 6; g.beginPath(); g.arc(0, 8, 30, 0.3, Math.PI - 0.3); g.stroke();
  });
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, emissive: '#f2b84a', emissiveIntensity: 0.25, roughness: 1 }));
  disc.position.y = 3.2; disc.castShadow = true; g.add(disc);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.6), mat('#c9b48e'));
  stick.position.y = 1.3; g.add(stick);
  g.userData.disc = disc;
  return g;
}

// ---------- 車 ----------
function numberTex(num, color, color2, isPlayer) {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = isPlayer ? '#d4a64a' : '#f4f1ea';
    g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
    g.fillStyle = color; g.beginPath(); g.arc(64, 64, isPlayer ? 50 : 52, 0, 7); g.fill();
    g.fillStyle = color2;
    g.font = 'bold 60px "Cinzel", Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.strokeText(String(num), 64, 68);
    g.fillText(String(num), 64, 68);
  });
}

function makeCarModel(c) {
  const g = new THREE.Group();
  const body = mat(c.color, { roughness: 0.6 });
  const accent = mat(c.color2, { roughness: 0.6 });
  const tub = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.17), body);
  tub.position.y = 0.06; g.add(tub);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.15), body);
  nose.position.set(0.22, 0.045, 0); nose.rotation.z = -0.25; g.add(nose);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.062, 0.04), accent);
  stripe.position.y = 0.062; g.add(stripe);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.1), mat('#222533', { roughness: 0.3, metalness: 0.4, map: null }));
  cab.position.set(0.02, 0.11, 0); g.add(cab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.008), body);
  fin.position.set(-0.1, 0.12, 0); g.add(fin);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.19), accent);
  wing.position.set(-0.17, 0.15, 0); g.add(wing);
  const wm = mat('#1c1c20', { map: null });
  for (const [x, z] of [[0.12, 0.085], [0.12, -0.085], [-0.12, 0.085], [-0.12, -0.085]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), wm);
    w.rotation.x = Math.PI / 2; w.position.set(x, 0.035, z); g.add(w);
  }
  shadowAll(g);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: numberTex(c.num, c.color, c.color2, c.isPlayer), depthTest: true }));
  sp.scale.setScalar(c.isPlayer ? 0.42 : 0.3);
  sp.position.y = c.isPlayer ? 0.55 : 0.42;
  g.add(sp);
  if (c.isPlayer) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.31, 32), new THREE.MeshBasicMaterial({ color: '#ffd77a', transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
    g.add(ring);
    g.userData.ring = ring;
  }
  g.userData.sprite = sp;
  return g;
}

// ---------- イージング ----------
const easeOutBack = (t) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

// =====================================================================
class Diorama {
  constructor(container) {
    this.container = container;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.95;
    container.appendChild(r.domElement);

    const sc = this.scene = new THREE.Scene();
    sc.background = new THREE.Color('#0f0a07');
    sc.fog = new THREE.Fog('#0f0a07', 22, 48);

    const cam = this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    cam.position.set(0, 12.5, 13.5);
    const ctl = this.controls = new OrbitControls(cam, r.domElement);
    ctl.target.set(0, 0.6, 0.6);
    ctl.enableDamping = true;
    ctl.enablePan = false;
    ctl.minDistance = 5; ctl.maxDistance = 26;
    ctl.minPolarAngle = 0.25; ctl.maxPolarAngle = 1.25;
    ctl.rotateSpeed = 0.5;

    // 光:暗い部屋に、上から暖かいスポットライト
    this.hemi = new THREE.HemisphereLight('#8a95b0', '#1a120a', 0.22);
    sc.add(this.hemi);
    const key = this.key = new THREE.SpotLight('#ffd9a0', 420, 60, 0.5, 0.75, 1.6);
    key.position.set(-6, 17, 7);
    key.target.position.set(0.5, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.camera.near = 5; key.shadow.camera.far = 40;
    sc.add(key, key.target);
    this.lamp = new THREE.PointLight('#ff9a4a', 30, 16, 1.6);
    this.lamp.position.set(-9.5, 3.2, -3.5);
    sc.add(this.lamp);
    this.rim = new THREE.DirectionalLight('#6f86b8', 0.5);
    this.rim.position.set(8, 6, -10);
    sc.add(this.rim);

    this.buildRoom();
    this.buildBook();
    this.buildWeather();
    this.buildDust();

    this.board = null;
    this.cars = new Map();
    this.pops = [];
    this.clock = new THREE.Clock();
    this.follow = false;
    this.camMode = 'title';
    this.titleSpin = 0;
    this.flash = 0;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 60 : 38; // 縦長の画面(スマホ)では広く見せる
    this.camera.updateProjectionMatrix();
  }

  buildRoom() {
    const table = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.75 }));
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    this.scene.add(table);

    // ランプ(左奥)
    const lamp = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 0.2, 20), GOLD); base.position.y = 0.1;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 10), DARKGOLD); pole.position.y = 1.4;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.8, 12, 1, true), new THREE.MeshStandardMaterial({ color: '#f08a3a', emissive: '#ff8a3a', emissiveIntensity: 0.9, side: THREE.DoubleSide, roughness: 0.8 }));
    shade.position.y = 2.9;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffe0a0' }));
    bulb.position.y = 2.65;
    lamp.add(base, pole, shade, bulb);
    lamp.position.set(-9.8, 0, -3.8);
    this.scene.add(shadowAll(lamp, true, false));

    // 閉じた本の山
    const books = new THREE.Group();
    const bc = ['#3b2a4a', '#2b4a3a', '#5a2a22'];
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(3.4 - i * 0.3, 0.45, 2.4 - i * 0.2), new THREE.MeshStandardMaterial({ color: bc[i], roughness: 0.7 }));
      b.position.y = 0.23 + i * 0.46; b.rotation.y = (i - 1) * 0.15;
      const trim = new THREE.Mesh(new THREE.BoxGeometry(3.42 - i * 0.3, 0.06, 0.08), GOLD);
      trim.position.set(0, 0.1, (2.4 - i * 0.2) / 2); b.add(trim);
      books.add(b);
    }
    books.position.set(10.5, 0, -2.5); books.rotation.y = -0.4;
    this.scene.add(shadowAll(books));

    // ストップウォッチ(手前右)
    const sw = new THREE.Group();
    const caseM = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.22, 32), GOLD);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.23, 32), new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (g) => {
      g.fillStyle = '#f4ecd8'; g.fillRect(0, 0, 256, 256);
      g.translate(128, 128); g.strokeStyle = '#2d2a32';
      for (let i = 0; i < 60; i++) { g.lineWidth = i % 5 ? 2 : 5; g.beginPath(); g.moveTo(0, -110); g.lineTo(0, i % 5 ? -100 : -88); g.stroke(); g.rotate(Math.PI / 30); }
      g.fillStyle = '#b8323a'; g.fillRect(-2, -100, 4, 100);
    }), roughness: 0.5 }));
    face.position.y = 0.01;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 12), GOLD);
    crown.rotation.x = Math.PI / 2; crown.position.set(0, 0, -1.0);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 16), GOLD);
    loop.rotation.x = Math.PI / 2; loop.position.set(0, 0, -1.3);
    sw.add(caseM, face, crown, loop);
    sw.position.set(9.5, 0.12, 5.5); sw.rotation.y = 0.5;
    this.scene.add(shadowAll(sw));

    // サイコロ2つ(飾り)
    for (const [x, z, ry] of [[-10, 5.5, 0.4], [-9.1, 6.1, 1.1]]) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.5 }));
      d.position.set(x, 0.25, z); d.rotation.y = ry;
      this.scene.add(shadowAll(d));
    }
  }

  buildBook() {
    const book = this.book = new THREE.Group();
    const cover = new THREE.Mesh(new THREE.BoxGeometry(16.6, 0.32, 11.6), new THREE.MeshStandardMaterial({ color: '#4a1f18', roughness: 0.7 }));
    cover.position.y = 0.16; book.add(cover);
    // ページ(左右)
    const pageEdge = canvasTex(512, 32, (g, w, h) => { g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(120,90,50,${0.1 + Math.random() * 0.15})`; g.fillRect(0, y, w, 1); } });
    const pageTop = canvasTex(512, 512, (g, w, h) => noiseFill(g, w, h, '#efe3c8', 0.06));
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(7.9, 0.28, 11), [
        new THREE.MeshStandardMaterial({ map: pageEdge }), new THREE.MeshStandardMaterial({ map: pageEdge }),
        new THREE.MeshStandardMaterial({ map: pageTop, roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: '#e9dcc0' }),
        new THREE.MeshStandardMaterial({ map: pageEdge }), new THREE.MeshStandardMaterial({ map: pageEdge }),
      ]);
      p.position.set(sx * 4.02, 0.46, 0);
      book.add(p);
    }
    // 金の縁取り
    const W = 16.9, D = 11.9, t = 0.28, hgt = 0.22;
    const edges = [[0, -D / 2, W, t], [0, D / 2, W, t], [-W / 2, 0, t, D], [W / 2, 0, t, D]];
    for (const [x, z, w, d] of edges) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), GOLD);
      e.position.set(x, 0.32 + hgt / 2, z); book.add(e);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(w === t ? 0.06 : w - 0.6, 0.05, d === t ? 0.06 : d - 0.6), DARKGOLD);
      inner.position.set(x * 0.985, 0.32 + hgt + 0.02, z * 0.975); book.add(inner);
    }
    // 四隅の飾り
    for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 6), GOLD);
      c.position.set(x, 0.42, z); book.add(c);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), new THREE.MeshStandardMaterial({ color: '#2f6db5', metalness: 0.3, roughness: 0.15, emissive: '#10306a', emissiveIntensity: 0.4 }));
      gem.position.set(x, 0.66, z); book.add(gem);
    }
    // しおりのリボン
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 3), new THREE.MeshStandardMaterial({ color: '#b8323a', roughness: 0.6 }));
    rib.position.set(0.3, 0.33, 7.1); rib.rotation.y = 0.15; book.add(rib);
    this.scene.add(shadowAll(book));
  }

  buildWeather() {
    // 雨粒
    const N = 2200;
    const pos = new Float32Array(N * 6);
    this.rainSpeed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 17, y = 0.8 + Math.random() * 9, z = (Math.random() - 0.5) * 12;
      pos.set([x, y, z, x - 0.04, y - 0.35, z], i * 6);
      this.rainSpeed[i] = 9 + Math.random() * 5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#a8c4e0', transparent: true, opacity: 0.0 }));
    this.rainLines.frustumCulled = false;
    this.scene.add(this.rainLines);
    this.rainN = N;

    // 雲(ワイヤーでつるした紙の雲)
    this.clouds = [];
    const spots = [[-5, 5.4, -2.5], [-1.5, 6.0, -3.5], [2.5, 5.6, -2], [5.5, 6.2, -3], [0.5, 5.2, 0.5], [-3.5, 5.8, 1.5], [4, 5.0, 1.8]];
    for (const [x, y, z] of spots) {
      const c = makeCloud();
      c.position.set(x, y, z);
      c.userData.home = new THREE.Vector3(x, y, z);
      c.scale.setScalar(0.001);
      c.visible = false;
      this.scene.add(c);
      this.clouds.push(c);
    }
    this.sun = makeSun();
    this.sun.position.set(-6.2, PAGE_TOP, -4.2);
    this.scene.add(this.sun);
    this.weather = { rain: 0, cloud: 0, wet: 0 };
  }

  buildDust() {
    const N = 260;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos.set([(Math.random() - 0.5) * 30, Math.random() * 10, (Math.random() - 0.5) * 22], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const tex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,220,160,1)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.12, map: tex, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.dust);
  }

  // ---------- コース(ジオラマ)を作る ----------
  setTrack(track, teamColor) {
    if (this.board) { this.scene.remove(this.board); }
    this.cars.forEach(m => this.scene.remove(m));
    this.cars.clear();
    this.podium && this.scene.remove(this.podium); this.podium = null;
    this.pops = [];
    this.track = track;
    const board = this.board = new THREE.Group();
    this.scene.add(board);

    // 道の点を作る(SVGの道を細かく区切る)
    const svgNS = 'http://www.w3.org/2000/svg';
    let svg = document.getElementById('pathSampler');
    if (!svg) { svg = document.createElementNS(svgNS, 'svg'); svg.id = 'pathSampler'; svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden'); document.body.appendChild(svg); }
    svg.innerHTML = '';
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', track.path);
    svg.appendChild(path);
    const len = path.getTotalLength();
    const N = 700;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const p = path.getPointAtLength(len * i / N);
      pts.push(new THREE.Vector2(toX(p.x), toZ(p.y)));
    }
    this.pts = pts;
    const tans = pts.map((p, i) => pts[(i + 1) % N].clone().sub(pts[(i - 1 + N) % N]).normalize());
    this.tans = tans;

    const nearRoad = (x, z) => {
      let m = 1e9;
      for (let i = 0; i < N; i += 3) { const dx = pts[i].x - x, dz = pts[i].y - z; const d = dx * dx + dz * dz; if (d < m) m = d; }
      return Math.sqrt(m);
    };

    // 六角形のタイル(芝生)
    const R = 0.46;
    const hexGeo = new THREE.CylinderGeometry(R * 0.97, R * 0.97, 1, 6);
    hexGeo.translate(0, 0.5, 0);
    const dark = track.backdrop === 'forest';
    const greens = dark ? ['#3f6a34', '#4a773d', '#386030', '#557f41'] : ['#5a8a3a', '#669843', '#517d34', '#72a04c'];
    const cells = [];
    const dx = Math.sqrt(3) * R, dz = 1.5 * R;
    for (let row = -7; row <= 7; row++) {
      for (let col = -9; col <= 9; col++) {
        const x = col * dx + (row & 1 ? dx / 2 : 0), z = row * dz;
        const ex = Math.abs(x) / 7.0, ez = Math.abs(z) / 4.75;
        if (ex > 1 || ez > 1) continue;
        if ((ex > 0.9 || ez > 0.88) && Math.random() < 0.45) continue;
        cells.push([x, z]);
      }
    }
    const inst = new THREE.InstancedMesh(hexGeo, mat('#ffffff', { flatShading: true }), cells.length);
    const rockInst = [];
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    cells.forEach(([x, z], i) => {
      const dRoad = nearRoad(x, z);
      let h = 0.12 + Math.random() * 0.1;
      if (dRoad < 0.7) h = 0.15;
      const rock = dRoad > 1.1 && Math.random() < 0.06;
      if (rock) { h = 0.3 + Math.random() * 0.15; rockInst.push([x, z]); }
      m4.compose(new THREE.Vector3(x, PAGE_TOP, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1));
      inst.setMatrixAt(i, m4);
      col.set(rock ? '#8b877e' : greens[Math.floor(Math.random() * greens.length)]);
      col.offsetHSL(0, 0, (Math.random() - 0.5) * 0.05);
      inst.setColorAt(i, col);
    });
    inst.castShadow = true; inst.receiveShadow = true;
    const tiles = new THREE.Group(); tiles.add(inst);
    board.add(tiles);
    tiles.scale.y = 0.001;
    this.pops.push({ obj: tiles, kind: 'grow', delay: 0, dur: 0.7 });

    // 道(厚みのある紙のリボン)
    const road = this.buildRibbon(pts, tans, ROAD_W, ROAD_Y, PAGE_TOP + 0.12);
    this.roadMat = road.material;
    const roadG = new THREE.Group(); roadG.add(road);
    // 白線
    for (const off of [ROAD_W - 0.03, -(ROAD_W - 0.03)]) {
      const line = this.buildFlat(pts, tans, off, 0.016, ROAD_Y + 0.003, '#efe6d2');
      roadG.add(line);
    }
    // 縁石(赤白)をコーナーに
    roadG.add(this.buildKerbs(pts, tans));
    // スタート/ゴールの白黒
    const chk = canvasTex(64, 16, (g) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f1ea'; g.fillRect(x * 8, y * 8, 8, 8); } });
    const sf = new THREE.Mesh(new THREE.PlaneGeometry(0.14, ROAD_W * 2), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.9 }));
    sf.rotation.x = -Math.PI / 2;
    sf.rotation.z = Math.atan2(-tans[0].y, tans[0].x);
    sf.position.set(pts[0].x, ROAD_Y + 0.004, pts[0].y);
    roadG.add(sf);
    roadG.position.y = 0;
    board.add(roadG);
    roadG.scale.y = 0.001;
    this.pops.push({ obj: roadG, kind: 'grow', delay: 0.35, dur: 0.6 });

    // ピットロード
    const pitDef = track.scenery.find(s => s.t === 'pit');
    const pb = new THREE.Vector2(toX(pitDef.x), toZ(pitDef.y));
    const t0 = tans[0];
    const n0 = new THREE.Vector2(-t0.y, t0.x);
    const side = Math.sign(pb.clone().sub(pts[0]).dot(n0)) || 1;
    const laneOff = ROAD_W + 0.28;
    this.pitLane = { origin: pts[0].clone().add(n0.clone().multiplyScalar(side * laneOff)), t: t0.clone(), n: n0.clone().multiplyScalar(side) };
    const laneMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.36), mat('#6d6a70', { map: paperTex }));
    laneMesh.rotation.x = -Math.PI / 2;
    laneMesh.rotation.z = Math.atan2(-t0.y, t0.x);
    const lc = this.pitLane.origin.clone().add(t0.clone().multiplyScalar(-0.6));
    laneMesh.position.set(lc.x, PAGE_TOP + 0.24, lc.y);
    laneMesh.receiveShadow = true;
    roadG.add(laneMesh);

    // 景色
    const add = (obj, x, z, delay, rotY) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, PAGE_TOP + 0.2, z);
      if (rotY != null) obj.rotation.y = rotY;
      pivot.add(obj);
      pivot.rotation.x = -Math.PI / 2;
      board.add(pivot);
      this.pops.push({ obj: pivot, kind: 'flip', delay, dur: 0.8 });
      return pivot;
    };
    let delay = 0.7;
    this.wheels = [];
    for (const s of track.scenery) {
      const x = toX(s.x), z = toZ(s.y);
      let o;
      if (s.t === 'tree') o = makeTree((s.s || 1) * 1.1, dark);
      else if (s.t === 'stand') o = makeStand(s.s || 1);
      else if (s.t === 'pit') o = makePit(teamColor);
      else if (s.t === 'house') o = makeHouse((s.s || 1) * 1.1);
      else if (s.t === 'wheel') { o = makeWheel(); this.wheels.push(o); }
      if (!o) continue;
      // スタンドとピットは道の方を向ける
      let rotY = null;
      if (s.t === 'stand' || s.t === 'pit') {
        let bi = 0, bd = 1e9;
        pts.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.y - z) ** 2; if (d < bd) { bd = d; bi = i; } });
        const toRoad = pts[bi].clone().sub(new THREE.Vector2(x, z));
        rotY = Math.atan2(-toRoad.x, -toRoad.y) + Math.PI;
      }
      add(o, x, z, delay, rotY);
      delay += 0.05;
    }
    // 追加の木と岩をばらまく
    const extraTrees = dark ? 70 : 34;
    let tries = 0, placed = 0;
    while (placed < extraTrees && tries < 2000) {
      tries++;
      const x = (Math.random() - 0.5) * 13.2, z = (Math.random() - 0.5) * 8.6;
      if (nearRoad(x, z) < 0.65) continue;
      if (pb.distanceTo(new THREE.Vector2(x, z)) < 1.8) continue;
      if (Math.abs(x) / 6.9 > 0.95 || Math.abs(z) / 4.6 > 0.92) continue;
      add(Math.random() < 0.12 ? makeRock(0.8 + Math.random() * 0.6) : makeTree(0.7 + Math.random() * 0.6, dark), x, z, delay + Math.random() * 0.6);
      placed++;
    }
    for (const [x, z] of rockInst) add(makeRock(1.1), x, z, delay);

    // 奥の背景
    const back = makeBackdrop(track.backdrop);
    const bpiv = new THREE.Group();
    bpiv.position.set(0, PAGE_TOP, -5.05);
    bpiv.add(back);
    bpiv.rotation.x = -Math.PI / 2;
    board.add(bpiv);
    this.pops.push({ obj: bpiv, kind: 'flip', delay: 0.2, dur: 1.1 });

    this.popT = 0;
  }

  buildRibbon(pts, tans, w, top, bottom) {
    const N = pts.length;
    const pos = [], idx = [];
    for (let i = 0; i < N; i++) {
      const p = pts[i], t = tans[i];
      const nx = -t.y, nz = t.x;
      const lx = p.x + nx * w, lz = p.y + nz * w, rx = p.x - nx * w, rz = p.y - nz * w;
      pos.push(lx, top, lz, rx, top, rz, lx, bottom, lz, rx, bottom, rz);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 4, b = ((i + 1) % N) * 4;
      idx.push(a, b, a + 1, a + 1, b, b + 1);            // 上
      idx.push(a, a + 2, b, b, a + 2, b + 2);            // 左の壁
      idx.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3); // 右の壁
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#3a373d', roughness: 0.9, side: THREE.DoubleSide }));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  buildFlat(pts, tans, off, w, y, color) {
    const N = pts.length, pos = [], idx = [];
    for (let i = 0; i < N; i++) {
      const p = pts[i], t = tans[i], nx = -t.y, nz = t.x;
      pos.push(p.x + nx * (off + w), y, p.y + nz * (off + w), p.x + nx * (off - w), y, p.y + nz * (off - w));
    }
    for (let i = 0; i < N; i++) { const a = i * 2, b = ((i + 1) % N) * 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    return m;
  }

  buildKerbs(pts, tans) {
    const g = new THREE.Group();
    const N = pts.length;
    const red = mat('#c8443a'), white = mat('#efe6d2');
    const box = new THREE.BoxGeometry(0.07, 0.03, 0.06);
    for (let i = 0; i < N; i += 2) {
      const a = tans[(i - 4 + N) % N], b = tans[(i + 4) % N];
      const turn = a.x * b.y - a.y * b.x;
      if (Math.abs(turn) < 0.08) continue;
      const side = turn > 0 ? -1 : 1; // コーナーの内側
      const t = tans[i], nx = -t.y, nz = t.x;
      const k = new THREE.Mesh(box, (i / 2) % 2 ? red : white);
      k.position.set(pts[i].x + nx * side * (ROAD_W + 0.035), ROAD_Y - 0.01, pts[i].y + nz * side * (ROAD_W + 0.035));
      k.rotation.y = Math.atan2(-t.y, t.x);
      g.add(k);
    }
    return g;
  }

  // ---------- 車を置く ----------
  ensureCars(race) {
    for (const c of race.cars) {
      if (this.cars.has(c.id)) continue;
      const m = makeCarModel(c);
      m.scale.setScalar(0.001);
      this.scene.add(m);
      this.cars.set(c.id, m);
    }
  }

  pointAt(frac) {
    const N = this.pts.length;
    const f = ((frac % 1) + 1) % 1 * N;
    const i = Math.floor(f), t = f - i;
    const a = this.pts[i], b = this.pts[(i + 1) % N];
    const ta = this.tans[i];
    return { x: a.x + (b.x - a.x) * t, z: a.y + (b.y - a.y) * t, tx: ta.x, tz: ta.y };
  }

  carWorld(id) {
    const m = this.cars.get(id);
    return m ? m.position : null;
  }

  updateCars(race, dt) {
    if (!this.pts) return;
    this.ensureCars(race);
    const order = PW.order(race);
    let pitSlot = 0, doneSlot = 0;
    for (const c of race.cars) {
      const m = this.cars.get(c.id);
      if (!m) continue;
      const tgt = m.scale.x < 0.99 ? Math.min(1, m.scale.x + dt * 2.5) : 1;
      m.scale.setScalar(Math.max(0.001, tgt));
      let x, z, yaw, y = ROAD_Y;
      const lane = order.indexOf(c) % 2 ? 0.07 : -0.07;
      if (c.state === 'pit' || c.state === 'done') {
        const s = c.state === 'pit' ? -0.2 - (pitSlot++) * 0.42 : -2.2 + (doneSlot++) * 0.22;
        const p = this.pitLane.origin.clone().add(this.pitLane.t.clone().multiplyScalar(s));
        x = p.x; z = p.y; y = PAGE_TOP + 0.245;
        yaw = Math.atan2(-this.pitLane.t.y, this.pitLane.t.x);
        if (c.state === 'done') { const q = p.clone().add(this.pitLane.n.clone().multiplyScalar(0.16)); x = q.x; z = q.y; yaw += Math.PI / 2; }
      } else {
        const p = this.pointAt(c.progress);
        let off = lane;
        if (c.state === 'out') off = (ROAD_W + 0.25) * (c.id % 2 ? 1 : -1);
        x = p.x - p.tz * off; z = p.z + p.tx * off;
        yaw = Math.atan2(-p.tz, p.tx);
        if (c.state === 'out') { yaw += 0.9; y = PAGE_TOP + 0.17; }
        if (c.stall > 0) yaw += Math.sin(race.time * 2) * 0.8;
      }
      m.position.set(x, y, z);
      m.rotation.y = yaw;
      if (m.userData.ring) m.userData.ring.material.opacity = 0.55 + Math.sin(performance.now() / 250) * 0.3;
      m.userData.sprite.material.opacity = c.state === 'out' ? 0.35 : 1;
    }
  }

  setWeather(rain, cloud, wet) {
    this.weather.rain = rain;
    this.weather.cloud = cloud;
    this.weather.wet = wet;
  }

  // ---------- 表彰台 ----------
  showPodium(top3) {
    this.podium && this.scene.remove(this.podium);
    const g = this.podium = new THREE.Group();
    const heights = [0.9, 0.65, 0.45];
    const xs = [0, -1.1, 1.1];
    top3.forEach((c, i) => {
      if (!c) return;
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.05, heights[i], 0.9), mat(['#d4a64a', '#c9c9cf', '#c08457'][i], { metalness: 0.2, roughness: 0.6 }));
      block.position.set(xs[i], heights[i] / 2, 0);
      g.add(block);
      const num = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (x) => { x.fillStyle = '#2d2a32'; x.font = 'bold 100px Cinzel, Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(i + 1), 64, 70); }), transparent: true }));
      num.position.set(xs[i], heights[i] / 2, 0.451);
      g.add(num);
      const car = makeCarModel(c);
      car.scale.setScalar(1.9);
      car.position.set(xs[i], heights[i], 0);
      car.rotation.y = -Math.PI / 2 + 0.4;
      car.userData.sprite.position.y = 0.5;
      g.add(car);
    });
    shadowAll(g);
    // 紙ふぶき
    const N = 300, pos = new Float32Array(N * 3), cols = new Float32Array(N * 3);
    const palette = ['#e2483d', '#f2c14e', '#2f6db5', '#4f9d69', '#f4f1ea', '#e98fae'].map(c => new THREE.Color(c));
    for (let i = 0; i < N; i++) {
      pos.set([(Math.random() - 0.5) * 6, 1 + Math.random() * 5, (Math.random() - 0.5) * 3], i * 3);
      const cc = palette[i % palette.length]; cols.set([cc.r, cc.g, cc.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const conf = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.09, vertexColors: true }));
    g.add(conf);
    g.userData.confetti = conf;
    // 道から一番はなれた場所(コースの内側)に置く
    let best = { x: 0, z: 0, d: -1 };
    for (let x = -3.5; x <= 3.5; x += 0.25) for (let z = -2; z <= 2.5; z += 0.25) {
      let m = 1e9;
      for (let i = 0; i < this.pts.length; i += 4) { const dx = this.pts[i].x - x, dz = this.pts[i].y - z; m = Math.min(m, dx * dx + dz * dz); }
      if (m > best.d) best = { x, z, d: m };
    }
    g.position.set(best.x, PAGE_TOP + 0.35, best.z);
    this.cars.forEach(m => { m.visible = false; });
    // 表彰台のまわりの木などは倒しておく
    this.board.children.forEach(o => {
      if (o.rotation.x === 0 && o.children.length === 1 && o.position.distanceTo(g.position) < 1.9 && o.position.y > PAGE_TOP) o.rotation.x = -Math.PI / 2;
    });
    g.scale.setScalar(0.001);
    this.scene.add(g);
    this.podiumT = 0;
  }

  setCamera(mode) {
    this.camMode = mode;
    this.follow = mode === 'follow';
  }

  // ---------- 毎フレーム ----------
  frame(race) {
    const dt = Math.min(0.1, this.clock.getDelta());
    const now = performance.now() / 1000;

    // 飛び出すアニメーション
    if (this.pops.length) {
      this.popT += dt;
      let all = true;
      for (const p of this.pops) {
        const t = Math.max(0, Math.min(1, (this.popT - p.delay) / p.dur));
        if (t < 1) all = false;
        const e = easeOutBack(t);
        if (p.kind === 'flip') p.obj.rotation.x = -Math.PI / 2 * (1 - e);
        else p.obj.scale.y = Math.max(0.001, e);
      }
      if (all) this.pops = [];
    }
    if (this.wheels) for (const w of this.wheels) {
      w.userData.spin.rotation.z += dt * 0.25;
      w.userData.spin.children.forEach(ch => { if (ch.userData.cab) ch.rotation.z = -w.userData.spin.rotation.z; });
    }

    // 天気の見た目(ゆっくり近づける)
    const W = this.weather;
    this.vis = this.vis || { rain: 0, cloud: 0, wet: 0 };
    const V = this.vis;
    V.rain += (W.rain - V.rain) * Math.min(1, dt * 1.5);
    V.cloud += (Math.max(W.cloud, W.rain) - V.cloud) * Math.min(1, dt * 1.2);
    V.wet += (W.wet - V.wet) * Math.min(1, dt * 2);

    const pos = this.rainLines.geometry.attributes.position;
    const vis = Math.floor(this.rainN * Math.min(1, V.rain * 1.3));
    this.rainLines.geometry.setDrawRange(0, vis * 2);
    this.rainLines.material.opacity = Math.min(0.75, V.rain * 1.4);
    if (vis > 0) {
      const a = pos.array;
      for (let i = 0; i < vis; i++) {
        const k = i * 6;
        const d = this.rainSpeed[i] * dt;
        a[k + 1] -= d; a[k + 4] -= d;
        if (a[k + 4] < PAGE_TOP + 0.2) { const y = 8 + Math.random() * 2; a[k + 1] = y; a[k + 4] = y - 0.35; }
      }
      pos.needsUpdate = true;
    }
    this.clouds.forEach((c, i) => {
      const want = V.cloud > i / this.clouds.length * 0.9 + 0.05 ? 1 : 0;
      const s = c.scale.x + (want - c.scale.x) * Math.min(1, dt * 2);
      c.scale.setScalar(Math.max(0.001, s));
      c.visible = s > 0.01;
      c.position.x = c.userData.home.x + Math.sin(now * 0.2 + i) * 0.3;
      c.position.y = c.userData.home.y + Math.sin(now * 0.7 + i * 2) * 0.08;
      const grey = 0.95 - V.rain * 0.5;
      c.userData.mat.color.setRGB(grey, grey, grey * 1.02);
    });
    const sunS = Math.max(0.001, 1 - V.cloud * 1.4);
    this.sun.scale.setScalar(sunS);
    this.sun.userData.disc.rotation.z += dt * 0.15;

    // 雷
    if (V.rain > 0.6 && Math.random() < dt * 0.25) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.key.intensity = 420 * (1 - V.rain * 0.45) + this.flash * 900;
    this.key.color.setRGB(1, 0.85 - V.rain * 0.1, 0.63 + V.rain * 0.25);
    this.hemi.intensity = 0.22 + V.rain * 0.2 + this.flash * 1.5;
    if (this.roadMat) {
      this.roadMat.roughness = 0.9 - V.wet * 0.65;
      this.roadMat.metalness = V.wet * 0.25;
      this.roadMat.color.setRGB(0.2 - V.wet * 0.08, 0.19 - V.wet * 0.08, 0.22 - V.wet * 0.06);
    }
    this.lamp.intensity = 30 + Math.sin(now * 7) * 0.8 + Math.sin(now * 13) * 0.6;

    // ちり
    const dp = this.dust.geometry.attributes.position.array;
    for (let i = 0; i < dp.length; i += 3) {
      dp[i + 1] += dt * 0.08; dp[i] += Math.sin(now + i) * dt * 0.03;
      if (dp[i + 1] > 10) dp[i + 1] = 0;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;

    if (race) this.updateCars(race, dt);

    // 表彰台
    if (this.podium) {
      this.podiumT += dt;
      const e = easeOutBack(Math.min(1, this.podiumT / 0.9));
      this.podium.scale.setScalar(Math.max(0.001, e));
      const cp = this.podium.userData.confetti.geometry.attributes.position;
      for (let i = 0; i < cp.count; i++) {
        let y = cp.getY(i) - dt * (0.6 + (i % 5) * 0.1);
        if (y < 0) y = 5;
        cp.setY(i, y);
        cp.setX(i, cp.getX(i) + Math.sin(now * 2 + i) * dt * 0.2);
      }
      cp.needsUpdate = true;
    }

    // カメラ
    if (this.camMode === 'title') {
      this.titleSpin += dt * 0.06;
      const r = 17;
      this.camera.position.lerp(new THREE.Vector3(Math.sin(this.titleSpin) * r * 0.55, 9.5, Math.cos(this.titleSpin) * r * 0.55 + 7), Math.min(1, dt * 1.5));
      this.controls.target.lerp(new THREE.Vector3(0, 0.8, 0), Math.min(1, dt * 2.5));
    } else if (this.follow && race) {
      const m = this.cars.get(race.player.id);
      if (m) {
        const tgt = new THREE.Vector3(m.position.x, ROAD_Y, m.position.z);
        const delta = tgt.clone().sub(this.controls.target).multiplyScalar(Math.min(1, dt * 3));
        this.controls.target.add(delta);
        this.camera.position.add(delta);
        const dist = this.camera.position.distanceTo(this.controls.target);
        if (dist > 7.5) this.camera.position.lerp(this.controls.target.clone().add(new THREE.Vector3(0, 4.5, 5)), dt * 2);
      }
    } else if (this.camMode === 'podium' && this.podium) {
      // 表彰台が画面の左寄りに見えるように(右側には結果の紙がある)
      const P = this.podium.position;
      const k = Math.min(1, dt * 1.8);
      this.controls.target.lerp(new THREE.Vector3(P.x + 1.7, P.y + 0.5, P.z), k);
      this.camera.position.lerp(new THREE.Vector3(P.x + 0.4, P.y + 4.4, P.z + 7.6), k);
    } else if (this.camMode === 'overview') {
      this.controls.target.lerp(new THREE.Vector3(0, 0.6, 0.6), dt * 2);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resetView() {
    this.camera.position.set(0, 12.5, 13.5);
    this.controls.target.set(0, 0.6, 0.6);
  }
}

PW.Diorama = Diorama;
window.dispatchEvent(new Event('pw-scene-ready'));
