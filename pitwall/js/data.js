'use strict';
// ゲームの数値・名前のデータ。ここを変えるとチームの強さやコースが変わる。
// 実在のチーム・車・サーキットは「モチーフ」。名前はすべて架空。

const PW = window.PW = window.PW || {};

// 1周の中で何秒がゲーム内の何秒か(1倍速のとき、ゲーム内の30秒が現実の1秒)
PW.TIME_SCALE = 30;

// ---------- タイヤ ----------
// wet: 路面の濡れ具合 0(乾き)〜1(大雨)ごとの「遅くなる割合(%)」
PW.TIRES = {
  S: { name: 'ソフト', short: 'S', color: '#e2483d', wear: 1.55, grip: -1.3, wet: [0, 7, 16, 26, 36, 44] },
  M: { name: 'ミディアム', short: 'M', color: '#f2c14e', wear: 1.0, grip: 0, wet: [0, 6, 14, 24, 34, 42] },
  H: { name: 'ハード', short: 'H', color: '#f4f1ea', wear: 0.68, grip: 1.0, wet: [0, 6.5, 15, 25, 35, 43] },
  I: { name: 'インター', short: 'I', color: '#4f9d69', wear: 1.0, grip: 0, wet: [4.2, 2.8, 3.4, 5.8, 9.5, 14] },
  W: { name: 'ウェット', short: 'W', color: '#2f6db5', wear: 0.9, grip: 0, wet: [8.5, 7.4, 6.6, 6.4, 7.2, 8.6] },
};
PW.TIRE_ORDER = ['S', 'M', 'H', 'I', 'W'];

// ---------- 走り方(ドライバーへの指示) ----------
PW.MODES = {
  push: { name: 'プッシュ', desc: '速いがタイヤ・燃料・体力を多く使う', pace: -1.0, wear: 1.35, fuel: 1.12, fatigue: 1.35, risk: 2.0, mech: 1.5 },
  normal: { name: 'ふつう', desc: 'バランスよく走る', pace: 0, wear: 1.0, fuel: 1.0, fatigue: 1.0, risk: 1.0, mech: 1.0 },
  save: { name: 'セーブ', desc: '遅いがタイヤ・燃料・マシンにやさしい', pace: 1.4, wear: 0.78, fuel: 0.84, fatigue: 0.8, risk: 0.6, mech: 0.6 },
};

// ---------- サーキット(path は 600x400 の地図上の道。時計回り) ----------
PW.TRACKS = [
  {
    id: 'sarthe',
    name: 'サルト・サーキット',
    motif: '長い直線が名物の、とても長いコース',
    baseLap: 210, laps: { short: 24, normal: 36, long: 54 },
    pitLoss: 34, fuelPerLap: 6.4, wearPerLap: 0.052,
    rain: 0.45, temp: 24, scChance: 1.0,
    sky: ['#9fd3e6', '#d9eef2'], ground: '#9cc77a', backdrop: 'fields',
    path: 'M 440 330 L 250 330 C 205 330 190 318 172 300 C 155 284 120 290 100 272 C 80 255 62 250 64 228 C 66 212 80 208 95 202 L 205 165 C 215 162 218 170 228 166 C 238 162 236 154 246 151 L 350 118 C 360 115 362 123 372 119 C 382 115 380 107 390 104 L 505 66 C 530 58 545 70 540 90 C 536 110 548 140 552 162 C 556 185 575 200 566 218 C 558 232 540 228 528 240 C 515 252 525 268 508 278 C 492 288 500 304 486 312 C 476 318 480 330 466 331 Z',
    corners: [
      { at: 0.17, name: '森のS字' }, { at: 0.27, name: '赤い丘' }, { at: 0.47, name: '大直線' },
      { at: 0.65, name: '村のコーナー' }, { at: 0.86, name: 'くねくね区間' },
    ],
    scenery: [
      { t: 'pit', x: 345, y: 364 }, { t: 'stand', x: 300, y: 300, s: 0.9 }, { t: 'stand', x: 400, y: 302, s: 0.8 },
      { t: 'wheel', x: 470, y: 368, s: 1 }, { t: 'tree', x: 130, y: 240 }, { t: 'tree', x: 150, y: 228, s: 0.8 },
      { t: 'tree', x: 300, y: 200 }, { t: 'tree', x: 330, y: 190, s: 1.1 }, { t: 'tree', x: 420, y: 150, s: 0.9 },
      { t: 'tree', x: 470, y: 160 }, { t: 'house', x: 470, y: 220 }, { t: 'house', x: 500, y: 200, s: 0.8 },
      { t: 'tree', x: 90, y: 330, s: 1.1 }, { t: 'tree', x: 560, y: 300 }, { t: 'tree', x: 40, y: 150, s: 0.9 },
      { t: 'tree', x: 250, y: 60 }, { t: 'tree', x: 150, y: 110 }, { t: 'house', x: 360, y: 60, s: 0.8 },
    ],
  },
  {
    id: 'ardennes',
    name: 'アルデンヌ・サーキット',
    motif: '森の中を上り下りする、雨の多いコース',
    baseLap: 138, laps: { short: 30, normal: 44, long: 66 },
    pitLoss: 31, fuelPerLap: 4.3, wearPerLap: 0.058,
    rain: 0.85, temp: 17, scChance: 1.2,
    sky: ['#a9c4d4', '#e3ece9'], ground: '#7fb36a', backdrop: 'forest',
    path: 'M 300 335 L 420 335 C 470 335 480 300 450 290 L 380 275 C 350 270 345 255 360 245 C 372 236 362 222 345 220 L 230 110 C 220 100 205 104 198 92 C 192 82 200 72 188 66 L 130 60 C 90 56 80 80 100 92 C 130 110 150 130 130 160 C 115 185 70 175 62 205 C 55 230 90 245 110 252 C 135 260 140 282 125 297 C 112 310 118 332 150 335 L 250 336 C 262 336 262 326 272 326 C 282 326 284 335 300 335 Z',
    corners: [
      { at: 0.07, name: 'ヘアピン' }, { at: 0.17, name: '赤い坂' }, { at: 0.3, name: '長い上り' },
      { at: 0.47, name: '川沿い' }, { at: 0.66, name: '大きな左' }, { at: 0.97, name: 'シケイン' },
    ],
    scenery: [
      { t: 'pit', x: 360, y: 366 }, { t: 'stand', x: 470, y: 330, s: 0.8 }, { t: 'tree', x: 250, y: 240, s: 1.2 },
      { t: 'tree', x: 280, y: 215 }, { t: 'tree', x: 200, y: 200, s: 1.1 }, { t: 'tree', x: 170, y: 230 },
      { t: 'tree', x: 300, y: 120 }, { t: 'tree', x: 320, y: 150, s: 0.9 }, { t: 'tree', x: 400, y: 200 },
      { t: 'tree', x: 430, y: 230, s: 1.1 }, { t: 'tree', x: 500, y: 250 }, { t: 'tree', x: 40, y: 120 },
      { t: 'tree', x: 60, y: 300, s: 1.1 }, { t: 'tree', x: 160, y: 40, s: 0.8 }, { t: 'tree', x: 540, y: 330 },
      { t: 'tree', x: 380, y: 100, s: 1.2 }, { t: 'house', x: 210, y: 300, s: 0.8 }, { t: 'tree', x: 470, y: 120 },
    ],
  },
  {
    id: 'fuji',
    name: '富士の裾野スピードウェイ',
    motif: '山を望む長い直線と、くねくねした最終区間',
    baseLap: 96, laps: { short: 40, normal: 60, long: 90 },
    pitLoss: 29, fuelPerLap: 3.0, wearPerLap: 0.046,
    rain: 0.6, temp: 21, scChance: 0.9,
    sky: ['#a7d8ec', '#f1f0e4'], ground: '#a3c97f', backdrop: 'mountain',
    path: 'M 120 330 L 470 330 C 525 330 540 280 495 270 C 450 262 455 230 470 205 C 490 170 470 120 430 110 C 400 104 385 125 400 140 C 412 152 400 168 380 160 L 250 120 C 225 112 215 130 225 140 C 235 150 225 165 210 160 L 150 140 C 120 130 90 150 105 175 C 118 196 150 190 160 210 C 170 230 140 245 115 240 C 85 234 70 260 85 280 C 95 295 75 330 120 330 Z',
    corners: [
      { at: 0.24, name: '第1コーナー' }, { at: 0.4, name: '大きな右' }, { at: 0.5, name: 'ヘアピン' },
      { at: 0.62, name: '裏の直線' }, { at: 0.85, name: '最終区間' },
    ],
    scenery: [
      { t: 'pit', x: 300, y: 364 }, { t: 'stand', x: 220, y: 302, s: 0.9 }, { t: 'stand', x: 360, y: 302, s: 0.9 },
      { t: 'tree', x: 300, y: 200 }, { t: 'tree', x: 330, y: 230, s: 1.1 }, { t: 'tree', x: 260, y: 250 },
      { t: 'tree', x: 560, y: 200 }, { t: 'tree', x: 540, y: 120, s: 1.2 }, { t: 'tree', x: 60, y: 120 },
      { t: 'tree', x: 40, y: 220, s: 1.1 }, { t: 'tree', x: 180, y: 70 }, { t: 'tree', x: 320, y: 70, s: 0.9 },
      { t: 'house', x: 140, y: 270, s: 0.8 }, { t: 'tree', x: 560, y: 360 }, { t: 'tree', x: 40, y: 350 },
    ],
  },
];

// ---------- マシンの型(プレイヤーが選ぶ) ----------
PW.CAR_TYPES = {
  hybrid: { name: 'ハイブリッド型', desc: '速くて燃費も良いが、電気系がこわれやすい', perf: 72, rel: 62, fuelEff: 0.9, tireEff: 1.0, hybrid: true },
  rotary: { name: 'ロータリー型', desc: '壊れにくく、タイヤにやさしい。燃料は多め', perf: 64, rel: 82, fuelEff: 1.12, tireEff: 0.85, hybrid: false },
  turbo: { name: 'ターボ型', desc: '直線が速い。タイヤを使いやすい', perf: 70, rel: 70, fuelEff: 1.0, tireEff: 1.15, hybrid: false },
};

// ---------- ライバルチーム(架空) ----------
// perf: 速さ / rel: 壊れにくさ / smart: 作戦のうまさ / aggr: 攻めっ気
PW.RIVALS = [
  { name: 'ルミエール・レーシング', short: 'LUM', num: 1, color: '#2f6db5', color2: '#f4f1ea', type: 'hybrid', perf: 76, rel: 66, smart: 0.85, aggr: 0.6, skill: 84 },
  { name: 'ノルドシュタール', short: 'NRD', num: 3, color: '#4b4f5c', color2: '#e2483d', type: 'hybrid', perf: 74, rel: 72, smart: 0.8, aggr: 0.5, skill: 82 },
  { name: 'ソル・アルコ', short: 'SOL', num: 5, color: '#e88b2e', color2: '#2d2a32', type: 'turbo', perf: 71, rel: 70, smart: 0.6, aggr: 0.8, skill: 80 },
  { name: 'ブルーフィンチ', short: 'BFN', num: 8, color: '#5bb6d6', color2: '#f2c14e', type: 'rotary', perf: 66, rel: 84, smart: 0.75, aggr: 0.4, skill: 77 },
  { name: '桜坂エンジニアリング', short: 'SKZ', num: 11, color: '#e98fae', color2: '#f4f1ea', type: 'turbo', perf: 69, rel: 68, smart: 0.7, aggr: 0.6, skill: 79 },
  { name: 'ヴェルデ・コルサ', short: 'VRD', num: 17, color: '#4f9d69', color2: '#f4f1ea', type: 'rotary', perf: 64, rel: 80, smart: 0.55, aggr: 0.5, skill: 75 },
  { name: 'イロンデル', short: 'IRD', num: 22, color: '#7a5aa6', color2: '#f2c14e', type: 'hybrid', perf: 70, rel: 60, smart: 0.65, aggr: 0.7, skill: 78 },
  { name: 'アイアンバーチ', short: 'IRB', num: 31, color: '#8a6a4f', color2: '#f4f1ea', type: 'turbo', perf: 63, rel: 76, smart: 0.5, aggr: 0.55, skill: 74 },
  { name: 'スカーレット・ボルト', short: 'SCB', num: 44, color: '#b8323a', color2: '#2d2a32', type: 'turbo', perf: 67, rel: 64, smart: 0.6, aggr: 0.9, skill: 77 },
];

// ---------- プレイヤーのチーム色 ----------
PW.TEAM_COLORS = [
  ['#e2483d', '#f4f1ea'], ['#f2c14e', '#2d2a32'], ['#2d2a32', '#f2c14e'],
  ['#3aa3a0', '#f4f1ea'], ['#f4f1ea', '#2f6db5'], ['#e88b2e', '#2f6db5'],
];

// ---------- プレイヤーのドライバー(架空) ----------
// skill: 速さ / wet: 雨のうまさ / stamina: 長く走れる周数の目安(1スティント=燃料1回分)
PW.DRIVERS = [
  { name: '朝日 ミナト', skill: 80, wet: 74, stamina: 1.0, smooth: 0.95 },
  { name: 'ルカ・ベルナール', skill: 77, wet: 86, stamina: 0.9, smooth: 1.05 },
  { name: 'ソフィア・リンド', skill: 75, wet: 78, stamina: 1.15, smooth: 0.88 },
];

// ---------- チーム強化(レースの合間に買える) ----------
PW.UPGRADES = [
  { id: 'engine', name: 'エンジン', desc: 'マシンが速くなる(1段階で約0.3%)', icon: 'engine', cost: [900, 1500, 2400] },
  { id: 'aero', name: '空力パーツ', desc: '速くなり、タイヤの減りも少し減る', icon: 'wing', cost: [800, 1400, 2200] },
  { id: 'rel', name: '信頼性', desc: 'トラブルが起きにくくなる', icon: 'wrench', cost: [600, 1100, 1800] },
  { id: 'fuel', name: '燃費', desc: '1周に使う燃料が減る', icon: 'fuel', cost: [600, 1000, 1600] },
  { id: 'crew', name: 'ピットクルー', desc: 'ピット作業が速くなる', icon: 'crew', cost: [500, 900, 1500] },
  { id: 'driver', name: 'ドライバー育成', desc: '全ドライバーの速さと体力が上がる', icon: 'helmet', cost: [700, 1200, 2000] },
];

// ---------- 賞金・ポイント ----------
PW.POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
PW.PRIZE = [3000, 2200, 1700, 1300, 1000, 800, 650, 500, 400, 300]; // 万円
PW.START_BUDGET = 2500;

PW.DIFFICULTY = {
  easy: { name: 'やさしい', ai: -2.0, events: 0.8 },
  normal: { name: 'ふつう', ai: 0, events: 1.0 },
  hard: { name: 'むずかしい', ai: 1.6, events: 1.25 },
};

PW.LENGTHS = { short: '短め(約3分)', normal: 'ふつう(約4分)', long: '長め(約6分)' };
