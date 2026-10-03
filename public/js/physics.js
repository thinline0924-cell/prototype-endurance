// 車の物理計算
// 4輪それぞれのタイヤ(すべり率・すべり角と摩擦円)、荷重移動、空力(ダウンフォース・空気抵抗)、
// エンジン・クラッチ・ギア・デフ・ターボ・ハイブリッド・ブレーキを細かい時間刻みで計算します。
// 座標:three.js と同じ(y が上)。車の前向き = (sin h, cos h)、左向き = (cos h, -sin h)。
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const RG = (G.RG = G.RG || {});
  const U = RG.U;

  const GRAV = 9.81;
  const RHO = 1.225;
  const SUB_DT = 1 / 480; // 計算の細かさ(1秒に480回)
  const SIGMA_X = 0.25; // タイヤの縦方向の遅れ(緩和長)
  const SIGMA_Y = 0.55; // 横方向の緩和長

  const SURF = {
    road: { mu: 1.0, roll: 0.012, bump: 0 },
    curb: { mu: 0.9, roll: 0.02, bump: 1 },
    strip: { mu: 0.95, roll: 0.015, bump: 0.1 },
    tarmac: { mu: 0.92, roll: 0.015, bump: 0.05 },
    grass: { mu: 0.5, roll: 0.09, bump: 0.6 },
    gravel: { mu: 0.42, roll: 0.3, bump: 0.9 },
  };
  RG.SURF = SURF;

  // 正規化した魔法の式(Pacejka 風)。n=1 で最大
  function tireCurve(n, C) {
    const B = Math.tan(Math.PI / (2 * C));
    return Math.sin(C * Math.atan(B * n));
  }

  class Car {
    constructor(spec, track, opts = {}) {
      this.spec = spec;
      this.track = track;
      this.isAI = !!opts.ai;
      this.name = opts.name || 'YOU';
      this.livery = opts.livery || spec.livery;
      this.number = opts.number || spec.livery.num;

      const L = spec.wheelbase;
      this.a = L * (1 - spec.weightFront); // 重心から前軸
      this.b = L * spec.weightFront; // 重心から後軸
      const R = spec.wheelR;
      this.wheels = [
        { lx: this.a, ly: spec.trackF / 2, front: true, left: true },
        { lx: this.a, ly: -spec.trackF / 2, front: true, left: false },
        { lx: -this.b, ly: spec.trackR / 2, front: false, left: true },
        { lx: -this.b, ly: -spec.trackR / 2, front: false, left: false },
      ].map((w) =>
        Object.assign(w, {
          R, I: spec.wheelI, w: 0, kappa: 0, tanA: 0, Fz: 0, Fx: 0, Fy: 0, slip: 0, steer: 0,
          surf: 'road', spin: 0, brakeT: 80, absCut: 0, lat: 0, contactY: 0, skid: 0, lockup: 0,
        })
      );

      // 状態
      this.x = 0; this.y = 0; this.z = 0; this.h = 0;
      this.vx = 0; this.vz = 0; this.r = 0;
      this.axF = 0; this.ayF = 0; // ローパスした加速度(荷重移動用)
      this.pitch = 0; this.roll = 0; this.pitchV = 0; this.rollV = 0; this.heave = 0; this.heaveV = 0;
      this.groundPitch = 0; this.groundRoll = 0;
      this.speed = 0;

      // 駆動系
      const e = spec.engine;
      this.rpm = e.idle;
      this.we = (e.idle * Math.PI) / 30;
      this.gear = 1;
      this.shiftT = 0;
      this.shiftTo = 0;
      this.shiftDir = 0;
      this.clutch = 0;
      this.boost = 0;
      this.limiterCut = false;
      this.engineTorque = 0;
      this.maxTorque = Math.max(...e.torque.map((t) => t[1]));
      this.soc = spec.hybrid ? spec.hybrid.capMJ * 1e6 : 0;
      this.hybridPower = 0;
      this.brakeBias = spec.brakes.bias;
      this.lastShiftTime = -10;

      // 入力
      this.in = { throttle: 0, brake: 0, steer: 0, up: false, down: false };
      this.thr = 0; this.brk = 0; this.steerPos = 0; this.delta = 0;
      this.assist = Object.assign({ auto: true, abs: true, tcs: 2, steer: true }, opts.assist || {});
      this.tcsCut = 0;
      this.absActive = false;
      this.tcsActive = false;
      this.reverseHold = 0;
      this.gridHold = false; // スタート前(クラッチを切って停止)

      // コース上の位置
      this.ti = 0; this.s = 0; this.lat = 0; this.trackY = 0;
      this.offTrack = 0;
      this.drafting = 0;
      this.impact = 0; this.impactPos = null; this.scrape = 0;
      this.wallContact = false;
    }

    // コース上の位置 s(m)、横位置 lat(左が+)に置く
    placeAt(s, lat, speed = 0) {
      const T = this.track;
      const i = T.indexAt(s);
      this.ti = i;
      const p = T.pointAt(s, lat);
      this.x = p.x; this.z = p.z; this.y = p.y;
      this.h = Math.atan2(T.tx[i], T.tz[i]);
      this.vx = Math.sin(this.h) * speed;
      this.vz = Math.cos(this.h) * speed;
      this.r = 0;
      const rpmFromSpeed = speed > 1;
      for (const w of this.wheels) {
        w.w = speed / w.R; w.kappa = 0; w.tanA = 0;
      }
      if (rpmFromSpeed) {
        // 速度に合ったギアを選ぶ
        const sp = this.spec;
        let g = 1;
        for (let k = 1; k <= sp.gears.length; k++) {
          const rpm = (speed / sp.wheelR) * sp.gears[k - 1] * sp.final * 30 / Math.PI;
          if (rpm < sp.engine.redline * 0.85) { g = k; break; }
          g = k;
        }
        this.gear = g;
        this.we = (speed / sp.wheelR) * sp.gears[g - 1] * sp.final;
      } else {
        this.we = (this.spec.engine.idle * Math.PI) / 30;
        this.gear = 1;
      }
      this.updateTrackPos(true);
    }

    totalRatio(g = this.gear) {
      const sp = this.spec;
      if (g === 0) return 0;
      if (g < 0) return -sp.gears[0] * 1.1 * sp.final;
      return sp.gears[g - 1] * sp.final;
    }

    updateTrackPos(global) {
      const T = this.track;
      const q = T.project(this.x, this.z, global ? -1 : this.ti);
      this.ti = q.i; this.s = q.s; this.lat = q.lat; this.trackY = q.y;
      // 各タイヤの位置の路面
      const sh = Math.sin(this.h), ch = Math.cos(this.h);
      let off = 0;
      for (const w of this.wheels) {
        const wx = this.x + sh * w.lx + ch * w.ly;
        const wz = this.z + ch * w.lx - sh * w.ly;
        const wq = T.project(wx, wz, this.ti);
        w.lat = wq.lat;
        w.surf = T.surfaceAt(wq.i, wq.lat);
        w.contactY = wq.y;
        if (w.surf === 'grass' || w.surf === 'gravel') off++;
      }
      this.offTrack = off;
      this.y = q.y;
      // 路面の傾き(見た目と重力)
      const fw = this.wheels;
      const yf = (fw[0].contactY + fw[1].contactY) / 2, yr = (fw[2].contactY + fw[3].contactY) / 2;
      const yl = (fw[0].contactY + fw[2].contactY) / 2, yrr = (fw[1].contactY + fw[3].contactY) / 2;
      this.groundPitch = Math.atan2(yf - yr, this.spec.wheelbase);
      this.groundRoll = Math.atan2(yl - yrr, (this.spec.trackF + this.spec.trackR) / 2);
      this.y = (yf + yr) / 2;
    }

    // 1フレーム分の更新
    update(dt, time) {
      this.time = time;
      this.handleInputs(dt);
      let t = dt;
      let steps = 0;
      while (t > 1e-6 && steps < 40) {
        const h = Math.min(SUB_DT, t);
        this.substep(h);
        t -= h;
        steps++;
      }
      this.updateTrackPos(false);
      this.updateBody(dt);
    }

    handleInputs(dt) {
      const sp = this.spec;
      const inp = this.in;
      const v = this.speed;
      // ---- アクセル・ブレーキ(キーボードでも唐突にならないよう、踏む速さを決める)----
      let tIn = inp.throttle, bIn = inp.brake;
      if (this.gear < 0) { const tmp = tIn; tIn = bIn; bIn = tmp; } // バック中は入れ替え
      this.thr = U.approach(this.thr, tIn, dt * (tIn > this.thr ? (this.isAI ? 4 : 7) : 10));
      this.brk = U.approach(this.brk, bIn, dt * (bIn > this.brk ? (this.isAI ? 5 : 6) : 9));

      // ---- ステアリング ----
      const lock = (sp.steerLock * Math.PI) / 180;
      if (this.isAI) {
        this.delta = U.clamp(inp.steerAngle || 0, -lock, lock);
        this.steerPos = -this.delta / lock;
      } else {
        const target = inp.steer; // 右が +
        const toward = Math.abs(target) > Math.abs(this.steerPos) && Math.sign(target) === Math.sign(this.steerPos || target);
        const rate = toward ? 1 / (0.14 + v * 0.0024) : 1 / (0.09 + v * 0.0012);
        this.steerPos = U.approach(this.steerPos, target, rate * dt);
        let maxD = lock;
        const u = this.localU || 0;
        if (this.assist.steer) {
          // 速度に応じて、タイヤが滑りすぎない切れ角に抑える
          const kd = (0.5 * RHO * sp.aero.ClA) / sp.mass;
          const aLat = sp.tire.mu * 0.95 * (GRAV + kd * v * v);
          const geo = Math.atan((sp.wheelbase * aLat) / Math.max(v * v, 1));
          maxD = U.clamp(geo + sp.tire.aPeak * 1.25, 0.05, lock);
        } else {
          maxD = lock / (1 + Math.pow(v / 55, 2));
        }
        let d = -this.steerPos * maxD;
        // 逆ハン補助:手を離すと前輪が進行方向を向く(キーボード向け)
        if (u > 4) {
          const vlF = (this.localV || 0) + this.r * this.a;
          const align = U.clamp(Math.atan2(vlF, u), -lock, lock);
          const g = this.assist.steer ? 0.6 : 0.2;
          d += align * g * (1 - Math.abs(this.steerPos) * 0.5);
        }
        this.delta = U.clamp(d, -lock, lock);
      }

      // ---- 変速 ----
      if (this.shiftT > 0) {
        this.shiftT -= dt;
        if (this.shiftT <= sp.shiftTime * 0.45 && this.shiftTo !== this.gear) this.gear = this.shiftTo;
        if (this.shiftT <= 0) this.shiftT = 0;
      }
      const rpm = this.rpm;
      const n = sp.gears.length;
      const canShift = this.shiftT <= 0;
      if (this.gridHold) return;
      if (this.assist.auto || this.isAI) {
        if (canShift && this.gear >= 1) {
          const up = sp.engine.limiter - 250;
          if (rpm > up && this.gear < n && this.time - this.lastShiftTime > 0.35) this.startShift(this.gear + 1);
          else if (this.gear > 1) {
            const lowerRpm = (rpm * this.totalRatio(this.gear - 1)) / this.totalRatio(this.gear);
            const want = this.thr > 0.7 ? sp.engine.redline * 0.72 : sp.engine.redline * 0.6;
            if (lowerRpm < up - 700 && rpm < want && this.time - this.lastShiftTime > 0.3) this.startShift(this.gear - 1);
          }
        }
        // バックへの切り替え
        if (!this.isAI) {
          if (this.gear >= 1 && v < 0.8 && inp.brake > 0.5 && inp.throttle < 0.1) {
            this.reverseHold += dt;
            if (this.reverseHold > 0.45) { this.gear = -1; this.reverseHold = 0; }
          } else if (this.gear < 0 && v < 0.8 && inp.throttle > 0.5 && inp.brake < 0.1) {
            this.reverseHold += dt;
            if (this.reverseHold > 0.2) { this.gear = 1; this.reverseHold = 0; }
          } else this.reverseHold = 0;
        }
      }
      if (!this.isAI) {
        if (inp.up) {
          inp.up = false;
          if (this.gear < 0) this.gear = 0;
          else if (this.gear === 0) this.gear = 1;
          else if (this.gear < n && canShift) this.startShift(this.gear + 1);
        }
        if (inp.down) {
          inp.down = false;
          if (this.gear > 1 && canShift) {
            const lowerRpm = (rpm * this.totalRatio(this.gear - 1)) / this.totalRatio(this.gear);
            if (lowerRpm < sp.engine.limiter + 300) this.startShift(this.gear - 1);
            else this.overRev = 0.6; // 回転が上がりすぎるので拒否
          } else if (this.gear === 1 && v < 3) this.gear = 0;
          else if (this.gear === 0 && v < 3) this.gear = -1;
        }
      }
    }

    startShift(g) {
      this.shiftTo = g;
      this.shiftDir = g > this.gear ? 1 : -1;
      this.shiftT = this.spec.shiftTime;
      this.lastShiftTime = this.time || 0;
      this.onShift && this.onShift(this.shiftDir);
    }

    engineFullTorque(rpm) {
      const e = this.spec.engine;
      let T = U.table(e.torque, rpm);
      if (e.turbo) T *= e.turbo.base + (1 - e.turbo.base) * this.boost;
      return T;
    }

    substep(dt) {
      const sp = this.spec;
      const m = sp.mass;
      const sh = Math.sin(this.h), ch = Math.cos(this.h);
      // 車から見た速度
      const u = this.vx * sh + this.vz * ch; // 前
      const vl = this.vx * ch - this.vz * sh; // 左
      this.localU = u; this.localV = vl;
      const v2 = this.vx * this.vx + this.vz * this.vz;
      const v = Math.sqrt(v2);
      this.speed = v;

      // ---- 空力 ----
      const slip = 1 - 0.32 * this.drafting; // スリップストリーム
      const offAero = this.offTrack > 2 ? 0.9 : 1;
      const DF = 0.5 * RHO * sp.aero.ClA * v2 * (1 - 0.12 * this.drafting) * offAero;
      const drag = 0.5 * RHO * sp.aero.CdA * slip;

      // ---- 荷重 ----
      const T = this.track;
      const i = this.ti;
      const slope = T.slope[i];
      const cosS = 1 / Math.sqrt(1 + slope * slope);
      const vert = U.clamp(GRAV * cosS + v2 * T.kv[i], GRAV * 0.15, GRAV * 3);
      const W = m * vert;
      const L = sp.wheelbase;
      let FzF = (W * this.b) / L + DF * sp.aero.bal;
      let FzR = (W * this.a) / L + DF * (1 - sp.aero.bal);
      const dLong = (m * this.axF * sp.cgH) / L;
      FzF -= dLong; FzR += dLong;
      const latT = m * this.ayF * sp.cgH;
      const dF = (latT * sp.rollF) / sp.trackF;
      const dR = (latT * (1 - sp.rollF)) / sp.trackR;
      const wh = this.wheels;
      wh[0].Fz = Math.max(0, FzF / 2 - dF);
      wh[1].Fz = Math.max(0, FzF / 2 + dF);
      wh[2].Fz = Math.max(0, FzR / 2 - dR);
      wh[3].Fz = Math.max(0, FzR / 2 + dR);

      // ---- エンジン ----
      const e = sp.engine;
      const rpm = (this.we * 30) / Math.PI;
      this.rpm = rpm;
      if (e.turbo) {
        const target = this.thr * U.smoothstep(e.turbo.minRpm, e.turbo.minRpm + 2200, rpm);
        const rate = target > this.boost ? (0.35 + 2.6 * Math.pow(rpm / e.redline, 2)) / e.turbo.lag : 5;
        this.boost += (target - this.boost) * Math.min(1, rate * dt);
      }
      if (rpm > e.limiter) this.limiterCut = true;
      else if (rpm < e.limiter - 180) this.limiterCut = false;
      let thr = this.thr;
      // TCS:駆動輪が空転しすぎたら出力を絞る
      thr *= 1 - this.tcsCut;
      if (this.shiftT > 0 && this.shiftDir > 0) thr = 0; // シフトアップ中は点火カット
      if (this.shiftT > 0 && this.shiftDir < 0) thr = Math.max(thr, 0.45); // ブリッピング
      if (this.limiterCut) thr = 0;
      const idleW = (e.idle * Math.PI) / 30;
      if (this.we < idleW * 1.05) thr = Math.max(thr, U.clamp((idleW * 1.05 - this.we) / (idleW * 0.1), 0, 0.3));
      const fric = 15 + 0.0075 * rpm; // エンジンブレーキ(レース用の弱めのマップ)
      const Te = thr * this.engineFullTorque(rpm) - (1 - thr) * fric;
      this.engineTorque = Te;
      this.throttleEff = thr;

      // クラッチのつながり具合
      const gearR = this.totalRatio();
      let engage = 0;
      if (this.gear !== 0 && !this.gridHold) {
        if (this.shiftT > 0) engage = 0;
        else if (Math.abs(this.gear) === 1) {
          // 発進:決めた回転数(ローンチ回転)までふかしてからクラッチをつなぐ
          const launch = e.launch || e.idle + 1700;
          engage = U.smoothstep(launch - 1600, launch, rpm) * Math.max(0.15, this.thr > 0.02 ? 1 : 0.15);
        }
        else engage = 1;
        if (Math.abs(this.gear) === 1) {
          // すでに十分速ければつないだまま
          const wheelRpm = Math.abs(((wh[2].w + wh[3].w) / 2) * gearR * 30 / Math.PI);
          if (wheelRpm > e.idle + 300) engage = 1;
        }
      }
      this.clutch = engage;

      // ---- 舵角 ----
      const d = this.delta;
      // アッカーマン(内側の輪を少し多く切る)
      const ack = d * d * 0.35 * Math.sign(d);
      wh[0].steer = d + (d > 0 ? ack : ack * 0.4);
      wh[1].steer = d + (d < 0 ? ack : ack * 0.4);
      wh[2].steer = 0; wh[3].steer = 0;

      // ---- タイヤ ----
      let Fx = 0, Fy = 0, Mz = 0;
      const tire = sp.tire;
      const brakeTotal = sp.brakes.maxTorque * this.brk;
      let absAny = false;
      for (let k = 0; k < 4; k++) {
        const w = wh[k];
        const surf = SURF[w.surf] || SURF.road;
        const wvx = u - this.r * w.ly;
        const wvy = vl + this.r * w.lx;
        const cs = Math.cos(w.steer), sn = Math.sin(w.steer);
        const vlong = wvx * cs + wvy * sn;
        const vlat = -wvx * sn + wvy * cs;
        w.vlong = vlong;
        // すべり(緩和長モデル)
        const av = Math.abs(vlong);
        w.kappa = (w.kappa + (dt * (w.w * w.R - vlong)) / SIGMA_X) / (1 + (dt * (av + 0.6)) / SIGMA_X);
        w.tanA = (w.tanA + (dt * vlat) / SIGMA_Y) / (1 + (dt * (av + 0.6)) / SIGMA_Y);
        const alpha = Math.atan(w.tanA);
        const Fz = w.Fz;
        const loadMu = 1 - tire.loadSens * (Fz / 3000 - 1);
        const brakeMu = U.clamp(0.88 + w.brakeT / 2500, 0.88, 1.0);
        const mu = tire.mu * (w.front ? 1 : tire.rear || 1) * surf.mu * U.clamp(loadMu, 0.75, 1.15);
        const nx = w.kappa / tire.kPeak, ny = alpha / tire.aPeak;
        const nn = Math.sqrt(nx * nx + ny * ny);
        let fx = 0, fy = 0;
        if (nn > 1e-6) {
          const F = mu * Fz * tireCurve(nn, tire.C);
          fx = (F * nx) / nn;
          fy = (-F * ny) / nn;
        }
        w.Fx = fx; w.Fy = fy;
        w.slip = nn;
        // 車体へ
        const bx = fx * cs - fy * sn;
        const by = fx * sn + fy * cs;
        Fx += bx; Fy += by;
        Mz += w.lx * by - w.ly * bx;

        // 回転(駆動トルクは後で)
        const roll = surf.roll * Fz * w.R;
        w.torqueFree = -fx * w.R - Math.sign(w.w) * Math.min(roll, Math.abs(w.w) * w.I / dt);
        // ブレーキ
        const bias = w.front ? this.brakeBias : 1 - this.brakeBias;
        let Tb = (brakeTotal * bias) / 2 * brakeMu;
        if (this.assist.abs && this.brk > 0.05) {
          if (w.kappa < -tire.kPeak * 1.1 && av > 2) w.absCut = Math.min(0.95, w.absCut + dt * 40);
          else w.absCut = Math.max(0, w.absCut - dt * 10);
          Tb *= 1 - w.absCut;
          if (w.absCut > 0) absAny = true;
        }
        w.Tb = Tb;
        w.brakeT += (Math.abs(Tb * w.w) * dt) / 9000 - (w.brakeT - 60) * (0.02 + v * 0.0025) * dt;
        w.lockup = this.brk > 0.1 && w.kappa < -0.3 ? 1 : 0;
      }
      this.absActive = absAny;

      // ---- 駆動 ----
      const dIdx = [2, 3];
      const driveI = wh[2].I + wh[3].I;
      // クラッチ(滑らせながらつなぐ。つながったら一体で回る)
      const weP = this.we + (dt * Te) / e.I;
      const wInP = ((wh[2].w + dt * wh[2].torqueFree / wh[2].I + wh[3].w + dt * wh[3].torqueFree / wh[3].I) / 2) * gearR;
      let Tc = 0;
      if (engage > 0 && gearR !== 0) {
        const Iws = driveI / (gearR * gearR);
        const Teq = (weP - wInP) / (dt * (1 / e.I + 1 / Iws));
        const cap = this.maxTorque * 1.6 * engage;
        Tc = U.clamp(Teq, -cap, cap);
      }
      this.we += (dt * (Te - Tc)) / e.I;
      const minW = (600 * Math.PI) / 30;
      if (this.we < minW) this.we = minW;
      const Taxle = Tc * gearR * sp.eff;
      let TL = Taxle / 2, TR = Taxle / 2;
      // LSD
      const wl = wh[2], wr = wh[3];
      const dW = wr.w + (dt * (wr.torqueFree + TR)) / wr.I - (wl.w + (dt * (wl.torqueFree + TL)) / wl.I);
      const Teq2 = dW / (dt * (1 / wl.I + 1 / wr.I));
      const lim = sp.diff.preload + sp.diff.lock * Math.abs(Taxle);
      const dT = U.clamp(Teq2, -lim, lim);
      TL += dT; TR -= dT;
      wl.drive = TL; wr.drive = TR;
      wh[0].drive = 0; wh[1].drive = 0;

      // ハイブリッド(前輪モーター)
      this.hybridPower = 0;
      const hy = sp.hybrid;
      if (hy) {
        const vk = v * 3.6;
        if (this.thr > 0.5 && vk > hy.minKmh && this.soc > 0 && this.gear > 0 && this.shiftT <= 0) {
          const iceP = Math.max(0, Te * this.we) / 1000;
          const pk = Math.min(hy.kw, Math.max(0, hy.totalCapKw - iceP)) * U.smoothstep(hy.minKmh, hy.minKmh + 8, vk) * this.thr;
          const wf = Math.max(10, (wh[0].w + wh[1].w) / 2);
          const Tm = Math.min(700, (pk * 1000) / (2 * wf));
          wh[0].drive = Tm; wh[1].drive = Tm;
          this.hybridPower = pk;
          this.soc -= pk * 1000 * dt;
        } else if (this.brk > 0.1 && v > 8) {
          // 回生ブレーキ
          const pk = hy.regenKw * this.brk;
          const wf = Math.max(10, v / wh[0].R);
          const Tm = Math.min(700, (pk * 1000) / (2 * wf));
          // ロックしそうな輪には回生をかけない
          wh[0].drive = wh[0].kappa < -tire.kPeak ? 0 : -Tm * (1 - wh[0].absCut);
          wh[1].drive = wh[1].kappa < -tire.kPeak ? 0 : -Tm * (1 - wh[1].absCut);
          this.hybridPower = -pk;
          this.soc = Math.min(hy.capMJ * 1e6, this.soc + pk * 1000 * dt * 0.75);
        }
        if (this.soc < 0) this.soc = 0;
      }

      // 車輪の回転を進める(ブレーキは止める向きの摩擦として扱う)
      let maxSpin = 0;
      for (let k = 0; k < 4; k++) {
        const w = wh[k];
        let wn = w.w + (dt * (w.torqueFree + (w.drive || 0))) / w.I;
        const cap = (w.Tb * dt) / w.I;
        if (Math.abs(wn) <= cap) wn = 0;
        else wn -= Math.sign(wn) * cap;
        w.w = wn;
        w.spin = (w.spin + w.w * dt) % (Math.PI * 2);
        if (!w.front && w.kappa > maxSpin) maxSpin = w.kappa;
      }
      // TCS
      const tcsLv = this.isAI ? 2 : this.assist.tcs;
      if (tcsLv > 0) {
        const thrSlip = tire.kPeak * (tcsLv === 1 ? 1.8 : tcsLv === 2 ? 1.25 : 1.0);
        const over = maxSpin - thrSlip;
        if (over > 0) this.tcsCut = Math.min(0.95, this.tcsCut + dt * (8 + over * 120));
        else this.tcsCut = Math.max(0, this.tcsCut - dt * 3);
      } else this.tcsCut = 0;
      this.tcsActive = this.tcsCut > 0.05;

      // ---- 車体 ----
      // 抵抗(空気・坂道)
      let fwx = Fx * sh + Fy * ch;
      let fwz = Fx * ch - Fy * sh;
      fwx -= drag * v * this.vx;
      fwz -= drag * v * this.vz;
      const gs = (-m * GRAV * slope) * cosS;
      fwx += gs * T.tx[i];
      fwz += gs * T.tz[i];
      const ax = fwx / m, az = fwz / m;
      this.vx += ax * dt;
      this.vz += az * dt;
      this.r += (Mz / sp.Iz) * dt;
      // ほぼ止まっているときのふらつきを抑える
      if (v < 0.3 && this.thr < 0.02) {
        this.vx *= 0.96; this.vz *= 0.96; this.r *= 0.9;
      }
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this.h += this.r * dt;

      // 荷重移動用の加速度(車から見た向き、少し遅らせる)
      const axl = (Fx - drag * v * u) / m;
      const ayl = (Fy - drag * v * vl) / m;
      const kf = Math.min(1, dt / 0.07);
      this.axF += (axl - this.axF) * kf;
      this.ayF += (ayl - this.ayF) * kf;

      this.collideWalls(dt);
    }

    // 壁との衝突
    collideWalls() {
      const T = this.track;
      const i = this.ti;
      const nx = T.nx[i], nz = T.nz[i];
      const sh = Math.sin(this.h), ch = Math.cos(this.h);
      const hl = 2.35, hw = 0.98;
      // 中心の横位置(この区間の法線で近似)
      const dx = this.x - T.px[i], dz = this.z - T.pz[i];
      const latC = dx * nx + dz * nz;
      let worst = 0, wpx = 0, wpz = 0, side = 0;
      for (let c = 0; c < 4; c++) {
        const fl = c < 2 ? hl : -hl;
        const lf = c % 2 === 0 ? hw : -hw;
        const px = sh * fl + ch * lf, pz = ch * fl - sh * lf;
        const lat = latC + px * nx + pz * nz;
        const penL = lat - T.wallL[i];
        const penR = -T.wallR[i] - lat;
        if (penL > worst) { worst = penL; wpx = px; wpz = pz; side = 1; }
        if (penR > worst) { worst = penR; wpx = px; wpz = pz; side = -1; }
      }
      this.wallContact = worst > 0;
      if (worst <= 0) return;
      // 壁の外向き法線 → 押し戻す向き n
      const n0x = -nx * side, n0z = -nz * side;
      this.x += n0x * worst;
      this.z += n0z * worst;
      const pvx = this.vx + this.r * wpz, pvz = this.vz - this.r * wpx;
      const vn = pvx * n0x + pvz * n0z;
      if (vn < 0) {
        const m = this.spec.mass, Iz = this.spec.Iz;
        const pxn = wpz * n0x - wpx * n0z;
        const e = 0.18;
        const j = (-(1 + e) * vn) / (1 / m + (pxn * pxn) / Iz);
        this.vx += (j * n0x) / m;
        this.vz += (j * n0z) / m;
        this.r += (pxn * j) / Iz;
        // 壁との摩擦
        const tx = -n0z, tz = n0x;
        const vt = pvx * tx + pvz * tz;
        const jt = U.clamp(-vt * m * 0.5, -0.45 * j, 0.45 * j);
        this.vx += (jt * tx) / m;
        this.vz += (jt * tz) / m;
        const imp = j / m;
        if (imp > this.impact) {
          this.impact = imp;
          this.impactPos = { x: this.x + wpx, z: this.z + wpz };
        }
      }
      this.scrape = Math.max(this.scrape, Math.min(1, Math.hypot(this.vx, this.vz) / 30));
    }

    // 車体の揺れ(ピッチ・ロール・上下)
    updateBody(dt) {
      const sp = this.spec;
      const tp = -this.axF * 0.0042; // ブレーキで前のめり
      const tr = -this.ayF * 0.0055; // 曲がると外側に傾く
      const k = 160, c = 18;
      this.pitchV += ((tp - this.pitch) * k - this.pitchV * c) * dt;
      this.pitch += this.pitchV * dt;
      this.rollV += ((tr - this.roll) * k - this.rollV * c) * dt;
      this.roll += this.rollV * dt;
      // 縁石や芝のガタガタ
      let bump = 0;
      for (const w of this.wheels) bump = Math.max(bump, (SURF[w.surf] || SURF.road).bump);
      const v = this.speed;
      const DF = 0.5 * RHO * sp.aero.ClA * v * v;
      const sag = -DF / (sp.mass * 9.81) * 0.012;
      const noise = bump > 0 ? (Math.random() - 0.5) * bump * Math.min(1, v / 20) * 0.05 : 0;
      this.heaveV += ((sag - this.heave) * 220 - this.heaveV * 20) * dt + noise * 60 * dt * 10;
      this.heave += this.heaveV * dt;
      this.bump = bump * Math.min(1, v / 15);
      this.impact *= Math.exp(-dt * 12);
      this.scrape *= Math.exp(-dt * 8);
      this.overRev = Math.max(0, (this.overRev || 0) - dt);
    }

    resetToTrack() {
      const T = this.track;
      const s = T.s[this.ti];
      this.placeAt(s, U.clamp(this.lat, -T.hw * 0.4, T.hw * 0.4), 0);
      this.thr = 0; this.brk = 0;
    }

    get kmh() {
      return this.speed * 3.6;
    }
  }

  RG.Car = Car;
  RG.PHYS = { GRAV, RHO, SUB_DT };
})();
