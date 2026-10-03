// AI ドライバー:レコードラインを目で追い(ピュアパシュート)、地点ごとの目標速度でアクセル・ブレーキを操作
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const RG = (G.RG = G.RG || {});
  const U = RG.U;

  const profileCache = new Map();
  function getProfile(T, spec, skill) {
    const k = T.def.id + '|' + spec.id + '|' + skill.toFixed(3);
    if (!profileCache.has(k)) profileCache.set(k, RG.speedProfile(T, spec, skill));
    return profileCache.get(k);
  }

  class AIDriver {
    constructor(car, T, skill, rnd) {
      this.car = car;
      this.T = T;
      this.skill = skill;
      this.rnd = rnd || Math.random;
      this.profile = getProfile(T, car.spec, skill);
      this.offset = 0; // レコードラインからの横ずれ(追い抜き用)
      this.offsetTarget = 0;
      this.stuck = 0;
      this.mistake = 0;
      this.launched = false;
      this.wobble = this.rnd() * 100;
    }

    update(dt, cars, racing) {
      const c = this.car, T = this.T;
      const inp = c.in;
      if (!racing) {
        inp.throttle = 0; inp.brake = 1; inp.steerAngle = 0;
        return;
      }
      const n = T.n, ds = T.ds;
      const v = c.speed;
      const i = c.ti;

      // ---- 周りの車を見て、追い抜く / ぶつからない ----
      let speedCap = 999;
      this.offsetTarget *= 0.995;
      for (const o of cars) {
        if (o === c) continue;
        let gap = o.s - c.s;
        if (gap < -T.len / 2) gap += T.len;
        if (gap > T.len / 2) gap -= T.len;
        if (gap <= 0 || gap > 45) continue;
        const myLat = c.lat, oLat = o.lat;
        const lineLat = T.line[o.ti] + this.offset;
        if (Math.abs(oLat - (lineLat)) < 2.6 || Math.abs(oLat - myLat) < 2.4) {
          const closing = v - o.speed;
          if (closing > -1) {
            // 空いている側へ
            const room = T.hw - 1.4;
            const goLeft = oLat < 0 ? true : oLat > 0 ? false : this.rnd() < 0.5;
            const target = U.clamp(oLat + (goLeft ? 3.2 : -3.2), -room, room) - T.line[i];
            this.offsetTarget = U.clamp(target, -room * 2, room * 2);
          }
          if (gap < 14 && Math.abs(oLat - myLat) < 2.1) speedCap = Math.min(speedCap, o.speed - 0.5 + gap * 0.15);
        }
      }
      this.offset = U.approach(this.offset, this.offsetTarget, dt * 1.6);
      // 曲がり角では無理に横へ出ない
      const kHere = Math.abs(T.lineK[i]);
      if (kHere > 1 / 120) this.offset *= 1 - Math.min(1, dt * 1.5);

      // ---- ステアリング ----
      const look = U.clamp(5 + v * 0.3, 8, 36);
      const j = (i + Math.round(look / ds)) % n;
      const lat = U.clamp(T.line[j] + this.offset, -T.hw + 1.1, T.hw - 1.1);
      const tx = T.px[j] + T.nx[j] * lat, tz = T.pz[j] + T.nz[j] * lat;
      const dx = tx - c.x, dz = tz - c.z;
      const sh = Math.sin(c.h), ch = Math.cos(c.h);
      const fwd = dx * sh + dz * ch;
      const left = dx * ch - dz * sh;
      const dist = Math.max(1, Math.hypot(fwd, left));
      const alpha = Math.atan2(left, fwd);
      let delta = Math.atan((2 * c.spec.wheelbase * Math.sin(alpha)) / dist);
      // 後ろが滑ったら逆にハンドルを当てる
      const u = c.localU || 0;
      if (u > 5) {
        const beta = Math.atan2(c.localV || 0, u);
        delta += beta * 0.6;
      }
      delta += Math.sin(this.wobble + c.time * 0.7) * 0.004;
      delta *= 1.05;
      // 前輪が滑りすぎない角度までに抑える(切りすぎるとかえって曲がらない)
      if (u > 8) {
        const vlF = (c.localV || 0) + c.r * c.a;
        const align = Math.atan2(vlF, u);
        const lim = c.spec.tire.aPeak * 1.15;
        delta = U.clamp(delta, align - lim, align + lim);
      }
      inp.steerAngle = delta;

      // ---- アクセル / ブレーキ ----
      const lead = Math.round((v * 0.12) / ds) + 1;
      let vt = this.profile[(i + lead) % n];
      // コース外では慎重に
      if (c.offTrack >= 2) vt = Math.min(vt, 28);
      vt = Math.min(vt, speedCap);
      if (!this.launched) {
        this.launched = true;
      }
      const e = vt - v;
      let thr = 0, brk = 0;
      if (e > 0.4) thr = U.clamp(0.45 + e * 0.3, 0, 1);
      else if (e > -0.6) thr = 0.35;
      else brk = U.clamp(-e * 0.16, 0.05, 1);
      // 滑っているときはアクセルを控える
      const slide = Math.abs(Math.atan2(c.localV || 0, Math.max(u, 1)));
      if (slide > 0.09) thr *= 0.5;
      // 前輪が限界を超えて外へふくらむ(アンダーステア)ときは速度を落とす
      const fs = Math.max(c.wheels[0].slip, c.wheels[1].slip);
      if (fs > 1.2 && v > 15) { thr = 0; brk = Math.max(brk, U.clamp((fs - 1.2) * 0.5, 0, 0.35)); }
      if (c.gear < 1) { thr = 0.5; brk = 0; c.gear = 1; }
      inp.throttle = thr;
      inp.brake = brk;

      // ---- 動けなくなったら元に戻す ----
      if (v < 2 && racing) this.stuck += dt;
      else this.stuck = 0;
      if (this.stuck > 3 || c.offTrack >= 4 && v < 4) {
        this.stuck = 0;
        c.placeAt(c.s, T.line[c.ti], 0);
      }
    }
  }

  RG.AIDriver = AIDriver;
  RG.getProfile = getProfile;
})();
