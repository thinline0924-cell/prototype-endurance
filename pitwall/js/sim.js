'use strict';
// レースの計算(シミュレーション)。画面には触らず、数値だけを動かす。
// 時間の単位は「ゲーム内の秒」。

(function () {
  const PW = window.PW;
  const TANK = 75;          // 燃料タンクの大きさ(L)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // 決まった種(シード)から同じ乱数を作る道具。天気予報がちらつかないように使う
  function hash(n) {
    let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function wetPenalty(compound, w) {
    const tbl = PW.TIRES[compound].wet;
    const f = clamp(w, 0, 1) * 5;
    const i = Math.min(4, Math.floor(f));
    return lerp(tbl[i], tbl[i + 1], f - i);
  }
  PW.wetPenalty = wetPenalty;

  // 路面の濡れ具合に一番合うタイヤ
  function bestTireFor(w) {
    let best = 'M', bv = 1e9;
    for (const k of ['M', 'I', 'W']) {
      const v = wetPenalty(k, w);
      if (v < bv) { bv = v; best = k; }
    }
    return best;
  }
  PW.bestTireFor = bestTireFor;

  // ---------- 天気 ----------
  // レースの最初に「雨雲がいつ来るか」を決めておく。予報はそれをぼかして見せる
  function makeWeather(track, totalLaps, rng) {
    const fronts = [];
    const n = rng() < track.rain ? 1 + Math.floor(rng() * (track.rain > 0.7 ? 3 : 2)) : 0;
    for (let i = 0; i < n; i++) {
      const start = Math.floor(lerp(0.12, 0.85, rng()) * totalLaps);
      const len = Math.max(2, Math.floor(lerp(0.08, 0.25, rng()) * totalLaps));
      const peak = lerp(0.25, 1.0, rng() * rng() + rng() * 0.3);
      fronts.push({ start, len, peak });
    }
    return { fronts, seed: Math.floor(rng() * 1000) };
  }

  // lap(周、小数あり)の時点の雨の強さ 0〜1
  function rainAt(weather, lap) {
    let r = 0;
    for (const f of weather.fronts) {
      const t = (lap - f.start) / f.len;
      if (t <= 0 || t >= 1) continue;
      const shape = Math.sin(Math.PI * t);
      r = Math.max(r, f.peak * Math.min(1, shape * 1.6));
    }
    return r;
  }

  // ---------- 車 ----------
  function makeCar(def, opts) {
    return {
      id: opts.id,
      isPlayer: !!opts.isPlayer,
      name: def.name, short: def.short, num: def.num,
      color: def.color, color2: def.color2,
      type: def.type,
      perf: def.perf, rel: def.rel,
      fuelEff: PW.CAR_TYPES[def.type].fuelEff, tireEff: PW.CAR_TYPES[def.type].tireEff,
      hybrid: PW.CAR_TYPES[def.type].hybrid,
      smart: def.smart ?? 1, aggr: def.aggr ?? 0.5,
      drivers: opts.drivers,
      driverIdx: 0,
      progress: 0,          // 走った周の合計(小数)
      lapStartTime: 0,
      lastLap: null, bestLap: null,
      lapNoise: 0,
      tire: opts.tire || 'M', tireWear: 0, tireLaps: 0,
      fuel: TANK,
      stintLaps: 0,
      mode: 'normal',
      health: { engine: 1, gearbox: 1, brakes: 1, aero: 1, hybrid: 1 },
      issues: [],            // 走りに影響しているトラブル
      mods: [],              // 一時的な効果 {pace, wear, risk, laps}
      state: 'run',          // run / pit / out(リタイア) / done(ゴール)
      pitTimer: 0, pitTotal: 0, pitWork: null,
      pitRequest: false, pitForced: false,
      pitPlan: { tire: 'M', fuel: 'full', fuelLaps: 10, change: true, repair: true },
      pits: 0,
      outLap: false,
      penalty: 0,            // 次のピットで足される秒数
      slowLaps: 0,           // パンクなどでゆっくり走る残り(周)
      finishTime: null,
      lastPitLap: 0,
      upg: opts.upg || {},
      reactDelay: 0,
    };
  }

  // ---------- レースを作る ----------
  PW.createRace = function (cfg) {
    // cfg: { track, length, difficulty, team, season, seed }
    const track = cfg.track;
    const totalLaps = track.laps[cfg.length];
    let s = cfg.seed || Math.floor(Math.random() * 1e9);
    const rng = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    const diff = PW.DIFFICULTY[cfg.difficulty];
    const cars = [];
    const up = cfg.team.upg;

    // プレイヤーの車
    const ct = PW.CAR_TYPES[cfg.team.type];
    const pdef = {
      name: cfg.team.name, short: 'YOU', num: cfg.team.num, color: cfg.team.color, color2: cfg.team.color2,
      type: cfg.team.type,
      perf: ct.perf + up.engine * 2.2 + up.aero * 1.6,
      rel: ct.rel + up.rel * 7,
    };
    const drivers = cfg.team.drivers.map(d => ({
      name: d.name, skill: d.skill + up.driver * 1.5, wet: d.wet + up.driver * 1.5,
      stamina: d.stamina * (1 + up.driver * 0.08), smooth: d.smooth, energy: 1,
    }));
    const player = makeCar(pdef, { id: 0, isPlayer: true, drivers, upg: up });
    player.fuelEff *= 1 - up.fuel * 0.05;
    player.tireEff *= 1 - up.aero * 0.03;
    cars.push(player);

    // ライバル(シーズンが進むと少しずつ速くなる)
    PW.RIVALS.forEach((r, i) => {
      const def = Object.assign({}, r, { perf: r.perf + diff.ai + cfg.round * 1.2 + (rng() - 0.5) * 2 });
      const d = { name: r.short + '-A', skill: r.skill, wet: r.skill - 4 + rng() * 10, stamina: 1, smooth: 1, energy: 1 };
      const ds = [d, Object.assign({}, d, { name: r.short + '-B', skill: r.skill - 2 }), Object.assign({}, d, { name: r.short + '-C', skill: r.skill - 3 })];
      cars.push(makeCar(def, { id: i + 1, drivers: ds }));
    });

    // 予選:速さ+運で並び順を決める
    const grid = cars.slice().sort((a, b) => (b.perf + rng() * 6) - (a.perf + rng() * 6));
    grid.forEach((c, i) => { c.progress = -0.004 * (i + 1); c.grid = i + 1; });

    const weather = makeWeather(track, totalLaps, rng);
    const rain0 = rainAt(weather, 0);

    const race = {
      track, totalLaps, cars, player, weather, rng, diff,
      time: 0,
      wet: rain0 * 0.8,
      rain: rain0,
      temp: track.temp + (rng() - 0.5) * 6,
      flag: 'green',          // green / fcy / sc / chequered
      flagTimer: 0,
      leaderLap: 0,
      finished: false,
      started: false,
      log: [],                // 無線・ニュース
      events: [],             // プレイヤーへの判断カード(待ち行列)
      cooldown: {},
      nextEventLap: 3,
      sponsorDeal: null,
      fastest: null,
      stats: { overtakes: 0 },
    };
    player.pitPlan.tire = bestTireFor(race.wet) === 'M' ? 'M' : bestTireFor(race.wet);
    for (const c of cars) {
      c.tire = c.isPlayer ? c.tire : (bestTireFor(race.wet) === 'M' ? (rng() < 0.5 ? 'M' : 'S') : bestTireFor(race.wet));
      c.lapNoise = (rng() - 0.5) * 0.6;
    }
    return race;
  };

  PW.TANK = TANK;

  // ---------- 1周のペース(秒) ----------
  function lapTimeOf(race, c) {
    const t = race.track;
    const d = c.drivers[c.driverIdx];
    const w = race.wet;
    let pct = 0;
    pct -= (c.perf - 65) * 0.13;                 // マシンの速さ
    const skill = lerp(d.skill, d.wet, clamp(w * 1.6, 0, 1));
    pct -= (skill - 75) * 0.09;                  // ドライバーの腕
    pct += (1 - d.energy) * (1 - d.energy) * 3;  // 疲れ
    const tire = PW.TIRES[c.tire];
    pct += w < 0.15 ? tire.grip : tire.grip * (1 - w * 4);
    pct += wetPenalty(c.tire, w);                 // 雨とタイヤの相性
    pct += c.tireWear * c.tireWear * 7;           // タイヤの消耗
    if (race.temp > 30 && c.tire === 'S') pct += 0.6;
    pct += (c.fuel / TANK) * 2.2;                 // 燃料の重さ
    pct += PW.MODES[c.mode].pace;
    pct += (1 - c.health.aero) * 7;
    pct += (1 - c.health.engine) * 5;
    pct += (1 - c.health.gearbox) * 3;
    pct += (1 - c.health.brakes) * 3;
    if (c.hybrid) pct += (1 - c.health.hybrid) * 3;
    for (const m of c.mods) pct += m.pace || 0;
    if (c.outLap) pct += 1.8;                     // 冷えたタイヤ
    pct += c.lapNoise;
    if (c.slowLaps > 0) pct += 45;                // パンクなどでゆっくり
    return t.baseLap * (1 + pct / 100);
  }
  PW.lapTimeOf = lapTimeOf;

  function addLog(race, kind, text, car) {
    race.log.push({ kind, text, lap: Math.max(0, race.leaderLap), time: race.time, car: car ? car.id : null });
    if (race.log.length > 80) race.log.shift();
  }
  PW.addLog = addLog;

  function carLabel(c) { return c.isPlayer ? 'あなたのマシン' : `#${c.num} ${c.name}`; }

  // ---------- ピットの作業時間 ----------
  PW.pitServiceTime = function (race, c, plan) {
    const crew = c.isPlayer ? 1 - (c.upg.crew || 0) * 0.08 : 1 - (c.smart - 0.5) * 0.15;
    const fuelAdd = Math.max(0, PW.planFuelTarget(race, c, plan) - c.fuel);
    const fuelT = fuelAdd * 0.42;
    const changeT = plan.change ? 7 : 0;
    const tireT = plan.tire !== 'keep' ? 11 * crew : 0;
    let repairT = 0;
    if (plan.repair) {
      const h = c.health;
      repairT += (1 - h.aero) > 0.05 ? 25 : 0;
      repairT += (1 - h.brakes) > 0.25 ? 40 : 0;
      repairT += (1 - h.gearbox) > 0.15 ? 60 : 0;
      repairT += c.hybrid && (1 - h.hybrid) > 0.2 ? 35 : 0;
    }
    return {
      fuelAdd, fuel: fuelT * crew, change: changeT, tire: tireT, repair: repairT * crew,
      penalty: c.penalty,
      total: race.track.pitLoss + Math.max(fuelT * crew, changeT) + tireT + repairT * crew + c.penalty,
    };
  };

  // 給油の目標量(L)
  PW.planFuelTarget = function (race, c, plan) {
    if (plan.fuel === 'full') return TANK;
    const per = fuelPerLap(race, c);
    const lapsLeft = Math.max(0, race.totalLaps - Math.floor(c.progress)) + 0.6;
    if (plan.fuel === 'end') return clamp(lapsLeft * per, 0, TANK);
    return clamp(Math.min(plan.fuelLaps, lapsLeft) * per + per * 0.4, 0, TANK);
  };

  function fuelPerLap(race, c) {
    let f = race.track.fuelPerLap * c.fuelEff * PW.MODES[c.mode].fuel;
    for (const m of c.mods) if (m.fuel) f *= m.fuel;
    if (race.flag !== 'green' && race.flag !== 'chequered') f *= 0.55;
    return f;
  }
  PW.fuelPerLap = fuelPerLap;

  // ---------- ピットに入る / 出る ----------
  function enterPit(race, c) {
    const plan = c.isPlayer ? c.pitPlan : aiPlan(race, c);
    const work = PW.pitServiceTime(race, c, plan);
    c.state = 'pit';
    c.pitTimer = work.total;
    c.pitTotal = work.total;
    c.pitWork = { plan: Object.assign({}, plan), work };
    c.pitRequest = false;
    c.pitForced = false;
    c.pits++;
    c.lastPitLap = Math.floor(c.progress);
    c.progress = Math.round(c.progress); // ピット入口=コントロールライン
    if (!c.isPlayer && c.pitNote) addLog(race, 'news', `#${c.num} ${c.name} がピットイン(${c.pitNote})`, c);
    if (c.isPlayer) addLog(race, 'radio', `ボックス、ボックス! ピットイン。作業予定 ${Math.round(work.total - race.track.pitLoss)}秒`, c);
  }

  function exitPit(race, c) {
    const { plan, work } = c.pitWork;
    c.fuel = clamp(c.fuel + work.fuelAdd, 0, TANK);
    if (plan.tire !== 'keep') { c.tire = plan.tire; c.tireWear = 0; c.tireLaps = 0; }
    if (plan.change) {
      c.drivers[c.driverIdx].resting = true;
      c.driverIdx = plan.nextDriver != null ? plan.nextDriver : (c.driverIdx + 1) % c.drivers.length;
      c.stintLaps = 0;
    }
    if (plan.repair) {
      const h = c.health;
      if ((1 - h.aero) > 0.05) h.aero = 1;
      if ((1 - h.brakes) > 0.25) h.brakes = 1;
      if ((1 - h.gearbox) > 0.15) h.gearbox = Math.max(h.gearbox, 0.97);
      if (c.hybrid && (1 - h.hybrid) > 0.2) h.hybrid = 1;
      c.issues = c.issues.filter(i => i !== 'aero' && i !== 'brakes');
    }
    c.penalty = 0;
    c.slowLaps = 0;
    c.state = 'run';
    c.outLap = true;
    c.lapStartTime = race.time - (race.track.baseLap * 0.0); // ピットの時間はラップに含める
    c.pitWork = null;
  }

  // ---------- AI の作戦 ----------
  function aiPlan(race, c) {
    const lapsLeft = race.totalLaps - Math.floor(c.progress);
    const per = fuelPerLap(race, c);
    const fuelNeed = lapsLeft * per;
    const want = PW.bestTireFor(race.wet + (race.rain > 0.3 ? 0.15 : 0));
    let tire = want === 'M' ? (lapsLeft < 14 ? 'S' : (lapsLeft > 22 && race.rng() < 0.5 ? 'H' : 'M')) : want;
    // 頭の良いチームはタイヤ交換を省略することもある
    if (c.tire === tire && c.tireWear < 0.35 && race.rng() < c.smart * 0.8) tire = 'keep';
    return {
      tire,
      fuel: fuelNeed < TANK ? 'end' : 'full',
      change: c.stintLaps >= 8 || race.rng() < 0.5,
      repair: true,
    };
  }

  function aiThink(race, c) {
    const per = fuelPerLap(race, c);
    const lapsLeft = race.totalLaps - c.progress;
    const why = [];
    if (c.fuel < per * 1.4 && lapsLeft > c.fuel / per) why.push('給油');
    const wearLimit = 0.72 + c.aggr * 0.18;
    if (c.tireWear > wearLimit && lapsLeft > 3) why.push('タイヤ交換');
    // 天気に合わせたタイヤ
    const want = PW.bestTireFor(race.wet);
    const wrong = (want === 'M' && c.tire !== 'S' && c.tire !== 'M' && c.tire !== 'H') ||
      (want !== 'M' && c.tire !== want && wetPenalty(c.tire, race.wet) - wetPenalty(want, race.wet) > 3);
    if (wrong) {
      c.reactDelay += 1;
      if (c.reactDelay > (1 - c.smart) * 4) why.push(want === 'M' ? 'ドライタイヤへ' : PW.TIRES[want].name + 'へ');
    } else c.reactDelay = 0;
    // セーフティカー中はチャンス
    if ((race.flag === 'sc' || race.flag === 'fcy') && c.fuel < TANK * 0.55 && lapsLeft > 4 && race.rng() < c.smart) why.push('SC中のピット');
    if (c.issues.length && c.health.aero < 0.85) why.push('修理');
    if (why.length) { c.pitRequest = true; c.pitNote = why[0]; }

    // 走り方
    if (c.fuel / per < lapsLeft && c.fuel / per > lapsLeft - 1.2 && lapsLeft < 6) c.mode = 'save';
    else if (lapsLeft < race.totalLaps * 0.15 && c.aggr > 0.6) c.mode = 'push';
    else c.mode = 'normal';
  }

  // ---------- コース上の出来事(全車) ----------
  function lapHappenings(race, c) {
    const r = race.rng;
    const md = PW.MODES[c.mode];
    const d = c.drivers[c.driverIdx];
    // パンク
    if (c.tireWear > 0.82 && r() < (c.tireWear - 0.82) * 1.6) {
      c.slowLaps = 1; c.pitForced = true; c.pitNote = 'パンク';
      c.health.aero = Math.min(c.health.aero, 0.85 + r() * 0.1);
      if (c.isPlayer) pushEvent(race, 'puncture');
      else addLog(race, 'news', `#${c.num} ${c.name} がパンク! ゆっくりピットへ`, c);
    }
    // ミス(スピン・コースアウト)
    const wrongTire = wetPenalty(c.tire, race.wet) > 12 ? 4 : 1;
    let risk = 0.006 * md.risk * wrongTire * (1 + (1 - d.energy) * 3) * (1 + race.wet);
    for (const m of c.mods) if (m.risk) risk *= m.risk;
    if (c.isPlayer) risk *= 0.8;
    if (r() < risk) {
      const big = r() < 0.18;
      if (big && !c.isPlayer && r() < 0.35) {
        c.state = 'out';
        addLog(race, 'news', `#${c.num} ${c.name} がクラッシュ! リタイア`, c);
        callSafety(race, 'sc');
      } else {
        const loss = 6 + r() * (big ? 25 : 10);
        c.stall = loss;
        if (big) c.health.aero = Math.max(0.6, c.health.aero - 0.2 - r() * 0.15);
        if (c.isPlayer) {
          addLog(race, 'radio', `スピンした! ${loss.toFixed(0)}秒ロス${big ? '、フロントを壊したかも' : ''}`, c);
          if (big) pushEvent(race, 'damage');
        } else {
          addLog(race, 'news', `#${c.num} ${c.name} がスピン${big ? '、マシン破損' : ''}`, c);
          if (big && r() < 0.5) callSafety(race, 'fcy');
        }
      }
    }
    // 故障
    const relF = (100 - c.rel) / 100;
    if (r() < 0.012 * relF * md.mech * PW.cfgEvents(race)) {
      const parts = ['engine', 'gearbox', 'brakes'].concat(c.hybrid ? ['hybrid', 'hybrid'] : []);
      const p = parts[Math.floor(r() * parts.length)];
      if (c.isPlayer) {
        pushEvent(race, p === 'engine' ? 'engine' : p === 'gearbox' ? 'gearbox' : p === 'brakes' ? 'brakes' : 'hybrid');
      } else {
        const sev = r();
        if (sev < 0.25) {
          c.state = 'out';
          addLog(race, 'news', `#${c.num} ${c.name} が${partName(p)}トラブルでリタイア…`, c);
          if (r() < 0.5) callSafety(race, 'fcy');
        } else {
          c.health[p] = Math.max(0.5, c.health[p] - 0.2 - sev * 0.2);
          addLog(race, 'news', `#${c.num} ${c.name} に${partName(p)}トラブル。ペースが落ちている`, c);
        }
      }
    }
    // 自然な劣化
    c.health.brakes = Math.max(0.4, c.health.brakes - 0.006 * md.mech);
  }

  function partName(p) {
    return { engine: 'エンジン', gearbox: 'ギアボックス', brakes: 'ブレーキ', hybrid: 'ハイブリッド', aero: '空力' }[p] || p;
  }
  PW.partName = partName;

  function callSafety(race, kind) {
    if (race.flag === 'sc' || race.flag === 'chequered') return;
    if (race.leaderLap > race.totalLaps - 2) return;
    if (kind === 'sc' && race.rng() > 0.75 * race.track.scChance) kind = 'fcy';
    race.flag = kind;
    race.flagTimer = kind === 'sc' ? race.track.baseLap * (2 + race.rng() * 1.5) : race.track.baseLap * (0.6 + race.rng() * 0.6);
    addLog(race, 'control', kind === 'sc' ? 'セーフティカー出動! 全車ペースダウン、追い越し禁止' : 'フルコースイエロー! 全車80km/hに減速', null);
    if (race.player.state === 'run') pushEvent(race, 'safety');
  }
  PW.callSafety = callSafety;

  // ---------- プレイヤーへの判断カード ----------
  function pushEvent(race, id, extra) {
    if (race.events.some(e => e.id === id)) return;
    const ev = PW.makeEvent(race, id, extra);
    if (ev) race.events.push(ev);
  }
  PW.pushEvent = pushEvent;

  PW.cfgEvents = (race) => race.diff.events;

  // ランダムに起きる無線の出来事
  function randomEvents(race) {
    const p = race.player;
    if (p.state !== 'run' || race.leaderLap < race.nextEventLap) return;
    const r = race.rng;
    const lap = Math.floor(p.progress);
    const lapsLeft = race.totalLaps - lap;
    const cands = [];
    const d = p.drivers[p.driverIdx];
    if (p.health.brakes < 0.75) cands.push('brakeTemp');
    if (d.energy < 0.35) cands.push('tired');
    if (p.tireWear > 0.7) cands.push('tireLimit');
    const ahead = PW.neighbor(race, p, -1), behind = PW.neighbor(race, p, 1);
    if (behind && behind.gap < 1.2) cands.push('defend');
    if (ahead && ahead.gap < 1.2) cands.push('attack');
    if (lapsLeft > 6) cands.push('trackLimits', 'contact', 'fuelCalc', 'traffic');
    if (!race.sponsorDeal && lapsLeft > 8 && lapsLeft < race.totalLaps * 0.6) cands.push('sponsor');
    if (!cands.length) return;
    const id = cands[Math.floor(r() * cands.length)];
    if (race.cooldown[id] && race.cooldown[id] > race.leaderLap) return;
    race.cooldown[id] = race.leaderLap + 8;
    pushEvent(race, id);
    race.nextEventLap = race.leaderLap + Math.max(2, Math.round((3 + r() * 4) / PW.cfgEvents(race)));
  }

  // 前後の車とのタイム差(秒)。dir=-1 前 / 1 後ろ
  PW.neighbor = function (race, c, dir) {
    const order = PW.order(race).filter(x => x.state === 'run' || x.state === 'pit');
    const i = order.indexOf(c);
    const o = order[i + dir];
    if (!o) return null;
    const gap = Math.abs(o.progress - c.progress) * race.track.baseLap;
    return { car: o, gap };
  };

  // 順位の並び(ゴール済みはゴール順、その後は走った距離順)
  PW.order = function (race) {
    return race.cars.slice().sort((a, b) => {
      const fa = a.state === 'done', fb = b.state === 'done';
      if (fa && fb) return (Math.round(b.progress) - Math.round(a.progress)) || (a.finishTime - b.finishTime);
      if (fa !== fb) {
        // ゴール済みでも、まだ走っている車の方が周回が多い場合はある(ほぼない)
        return fa ? -1 : 1;
      }
      const oa = a.state === 'out', ob = b.state === 'out';
      if (oa !== ob) return oa ? 1 : -1;
      return b.progress - a.progress;
    });
  };

  // ---------- 時間を進める ----------
  PW.step = function (race, dt) {
    if (race.finished) return;
    race.time += dt;
    const lapNow = race.leaderLap;

    // 天気
    race.rain = rainAt(race.weather, Math.max(0, lapNow + (race.leaderFrac || 0)));
    const target = race.rain > 0.05 ? Math.min(1, race.rain * 1.15) : 0;
    const k = dt / race.track.baseLap;
    if (target > race.wet) race.wet = Math.min(target, race.wet + k * (0.6 + race.rain));
    else race.wet = Math.max(target, race.wet - k * 0.22);

    // 旗
    if (race.flag === 'sc' || race.flag === 'fcy') {
      race.flagTimer -= dt;
      if (race.flagTimer <= 0) {
        race.flag = 'green';
        addLog(race, 'control', 'グリーンフラッグ! レース再開', null);
      }
    }

    const order = PW.order(race);
    const leader = order[0];

    for (const c of race.cars) {
      if (c.state === 'out' || c.state === 'done') continue;
      if (c.state === 'pit') {
        c.pitTimer -= dt;
        if (c.pitTimer <= 0) {
          exitPit(race, c);
          if (c.isPlayer) addLog(race, 'radio', `作業完了! ${PW.TIRES[c.tire].name}タイヤでコースへ。`, c);
        }
        continue;
      }
      // スピンなどで止まっている
      if (c.stall > 0) { c.stall -= dt; continue; }
      // ペース
      let lt = lapTimeOf(race, c);
      if (race.flag === 'fcy') lt = Math.max(lt, race.track.baseLap * 1.55);
      if (race.flag === 'sc') {
        // 前の車に追いつくまでは少し速く、追いついたら隊列
        const i = order.indexOf(c);
        const front = order.slice(0, i).reverse().find(o => o.state === 'run');
        const gapLaps = front ? front.progress - c.progress : 0;
        lt = race.track.baseLap * (front && gapLaps > 0.012 && gapLaps < 0.5 ? 1.3 : 1.6);
        if (c.slowLaps > 0) lt = Math.max(lt, lapTimeOf(race, c));
      }
      const before = c.progress;
      c.progress += dt / lt;
      // 燃料・タイヤ・体力
      const lapFrac = dt / lt;
      c.fuel -= fuelPerLap(race, c) * lapFrac;
      const md = PW.MODES[c.mode];
      const d = c.drivers[c.driverIdx];
      let wear = race.track.wearPerLap * PW.TIRES[c.tire].wear * c.tireEff * md.wear * (d.smooth || 1);
      if (c.tire === 'I' || c.tire === 'W') wear *= 1 + Math.max(0, 0.35 - race.wet) * (c.tire === 'W' ? 9 : 5);
      else wear *= 1 - race.wet * 0.5;
      if (race.temp > 28) wear *= 1 + (race.temp - 28) * 0.03;
      for (const m of c.mods) if (m.wear) wear *= m.wear;
      if (race.flag !== 'green') wear *= 0.35;
      c.tireWear = Math.min(1, c.tireWear + wear * lapFrac);
      const tiring = race.flag === 'green' ? 1 : 0.4;
      d.energy = Math.max(0, d.energy - lapFrac * md.fatigue * tiring / (14 * d.stamina));
      for (const dd of c.drivers) if (dd !== d) dd.energy = Math.min(1, dd.energy + lapFrac * 0.05);

      if (c.fuel <= 0) {
        c.fuel = 0;
        c.state = 'out';
        addLog(race, c.isPlayer ? 'radio' : 'news', c.isPlayer ? 'ガス欠…。マシンが止まってしまった。' : `#${c.num} ${c.name} がガス欠でストップ!`, c);
        if (c.isPlayer) race.playerOut = 'ガス欠';
        continue;
      }

      // コントロールラインを越えた
      if (Math.floor(c.progress) > Math.floor(before) && c.progress > 0) {
        const lapNo = Math.floor(c.progress);
        const lapTime = race.time - c.lapStartTime;
        if (lapNo > 1 && c.state === 'run') {
          c.lastLap = lapTime;
          if (race.flag === 'green' && !c.outLap && (!c.bestLap || lapTime < c.bestLap)) c.bestLap = lapTime;
          if (c.bestLap && (!race.fastest || c.bestLap < race.fastest.time)) race.fastest = { time: c.bestLap, car: c.id };
        }
        c.lapStartTime = race.time;
        c.outLap = false;
        c.lapNoise = (race.rng() - 0.5) * 0.8;
        c.tireLaps++;
        c.stintLaps++;
        if (c.slowLaps > 0) c.slowLaps--;
        c.mods = c.mods.filter(m => --m.laps > 0);

        // ゴール
        if (race.flag === 'chequered' || (c === leader && lapNo >= race.totalLaps)) {
          if (race.flag !== 'chequered') {
            race.flag = 'chequered';
            addLog(race, 'control', `チェッカーフラッグ! #${c.num} ${c.isPlayer ? 'あなたのチーム' : c.name} が優勝!`, c);
          }
          c.state = 'done';
          c.finishTime = race.time;
          c.progress = Math.max(c.progress, lapNo);
          if (c.isPlayer) addLog(race, 'radio', 'チェッカー! おつかれさま、いいレースだった!', c);
          continue;
        }
        if (c.pitForced) { c.pitRequest = true; c.pitNote = c.pitNote || 'トラブル'; }
        if (!c.isPlayer) aiThink(race, c);
        lapHappenings(race, c);
        if (c.state === 'out') {
          if (c.isPlayer) race.playerOut = 'リタイア';
          continue;
        }
        if (c.pitRequest) enterPit(race, c);
        else if (c.isPlayer) PW.playerLapCheck(race, c);
      }
    }

    const ord2 = PW.order(race);
    const lead = ord2.find(c => c.state !== 'out');
    race.leaderLap = Math.max(0, Math.floor(lead.progress));
    race.leaderFrac = lead.progress - Math.floor(lead.progress);
    randomEvents(race);

    if (race.cars.every(c => c.state === 'out' || c.state === 'done' || (race.flag === 'chequered' && c.state === 'pit'))) {
      for (const c of race.cars) if (c.state === 'pit') { c.state = 'done'; c.finishTime = race.time + 999; }
      race.finished = true;
    }
  };

  // プレイヤーの車:1周ごとの確認(無線でのお知らせ)
  PW.playerLapCheck = function (race, c) {
    const per = fuelPerLap(race, c);
    const lapsFuel = c.fuel / per;
    const lapsLeft = race.totalLaps - Math.floor(c.progress);
    if (lapsFuel < 2.2 && lapsFuel < lapsLeft && !race.cooldown.fuelWarn) {
      addLog(race, 'radio', `燃料があと${lapsFuel.toFixed(1)}周分! そろそろピットに呼んで!`, c);
      race.cooldown.fuelWarn = true;
    }
    if (lapsFuel > 3) race.cooldown.fuelWarn = false;
    // 雨の予報
    const fc = PW.forecast(race);
    const soon = fc.slice(1, 3).some(f => f.chance > 60);
    if (soon && race.rain < 0.1 && !race.cooldown.rainWarn) {
      addLog(race, 'radio', '天気班より:数周以内に雨雲が来る可能性が高い。', c);
      race.cooldown.rainWarn = true;
      race.cooldown.dryWarn = false;
    }
    if (race.rain > 0.1) race.cooldown.rainWarn = true;
    if (race.wet < 0.12 && (c.tire === 'I' || c.tire === 'W') && !race.cooldown.dryWarn) {
      addLog(race, 'radio', 'ドライバー:路面が乾いてきた! レインタイヤが溶けそうだ!', c);
      race.cooldown.dryWarn = true;
      race.cooldown.rainWarn = false;
    }
    const best = PW.bestTireFor(race.wet);
    if (best !== 'M' && c.tire !== best && wetPenalty(c.tire, race.wet) - wetPenalty(best, race.wet) > 4 && !race.cooldown.wetWarn) {
      addLog(race, 'radio', `ドライバー:すべる! ${PW.TIRES[best].name}タイヤがほしい!`, c);
      race.cooldown.wetWarn = race.leaderLap + 2;
    }
    if (race.cooldown.wetWarn && race.cooldown.wetWarn < race.leaderLap) race.cooldown.wetWarn = 0;
  };

  // ---------- 天気予報 ----------
  // 今から先の区間ごとの「雨の確率」。遠い先ほどあてにならない
  PW.forecast = function (race) {
    const now = race.leaderLap + (race.leaderFrac || 0);
    const step = Math.max(2, Math.round(race.totalLaps / 12));
    const out = [];
    for (let i = 0; i < 5; i++) {
      const a = now + i * step, b = a + step;
      let maxR = 0;
      for (let x = a; x <= b; x += 0.25) maxR = Math.max(maxR, rainAt(race.weather, x));
      const truth = maxR > 0.08 ? 1 : 0;
      const block = Math.floor(a / step);
      const noise = (hash(block * 13 + race.weather.seed + i * 0.37) - 0.5) * i * 32;
      let chance = i === 0 ? (race.rain > 0.05 ? 100 : 0) : clamp(truth * (88 - i * 6) + (1 - truth) * (6 + i * 5) + noise, 0, 100);
      out.push({ lapFrom: Math.floor(a), lapTo: Math.floor(b), chance: Math.round(chance / 5) * 5, intensity: truth ? maxR : 0, step });
    }
    return out;
  };

  PW.weatherKind = function (rain) {
    if (rain > 0.6) return 'storm';
    if (rain > 0.08) return 'rain';
    return 'sun';
  };
})();
