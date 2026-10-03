// 音:エンジン音をその場で合成(録音ファイルは使わない)
// 点火の回数から音の高さを決め、車種ごとに倍音の混ざり方を変える
(function () {
  'use strict';
  const RG = (window.RG = window.RG || {});
  const U = RG.U;

  const PROFILES = {
    // h: 倍音の強さ, sub: 半分の高さの成分(不等長など), rasp: ざらつき, cut: こもり具合
    v6tt: { h: [1, 0.55, 0.42, 0.3, 0.26, 0.18, 0.14, 0.1, 0.08, 0.06], sub: 0.25, rasp: 0.25, cut: 1.0, turbo: 0.7, drive: 3 },
    rotary: { h: Array.from({ length: 28 }, (_, i) => (i % 2 ? 0.75 : 1) / Math.pow(i + 1, 0.85)), sub: 0.05, rasp: 0.55, cut: 1.6, turbo: 0, drive: 4.5 },
    v4t: { h: [1, 0.7, 0.35, 0.4, 0.2, 0.22, 0.1, 0.12], sub: 0.7, rasp: 0.3, cut: 0.9, turbo: 0.9, drive: 3.5 },
    f6tt: { h: [1, 0.5, 0.55, 0.25, 0.3, 0.12, 0.15, 0.06], sub: 0.55, rasp: 0.2, cut: 0.7, turbo: 1.2, drive: 2.8 },
  };

  function noiseBuffer(ctx, sec = 2) {
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = last * 0.6 + w * 0.4;
      d[i] = last;
    }
    return b;
  }

  class EngineVoice {
    constructor(ctx, out, profileName, opts = {}) {
      const P = PROFILES[profileName] || PROFILES.v6tt;
      this.P = P;
      this.ctx = ctx;
      const real = new Float32Array(P.h.length + 1), imag = new Float32Array(P.h.length + 1);
      P.h.forEach((v, i) => (imag[i + 1] = v));
      const wave = ctx.createPeriodicWave(real, imag);
      const subReal = new Float32Array(4), subImag = new Float32Array([0, 1, 0.4, 0.2]);
      const subWave = ctx.createPeriodicWave(subReal, subImag);
      this.osc = ctx.createOscillator();
      this.osc.setPeriodicWave(wave);
      this.osc2 = ctx.createOscillator();
      this.osc2.setPeriodicWave(wave);
      this.osc2.detune.value = 7;
      this.sub = ctx.createOscillator();
      this.sub.setPeriodicWave(subWave);
      this.noise = ctx.createBufferSource();
      this.noise.buffer = RG.audio.noise;
      this.noise.loop = true;
      this.nf = ctx.createBiquadFilter();
      this.nf.type = 'bandpass';
      this.nf.Q.value = 1.5;
      this.gMain = ctx.createGain();
      this.gSub = ctx.createGain();
      this.gNoise = ctx.createGain();
      this.gSub.gain.value = P.sub * 0.5;
      this.gMain.gain.value = 0.5;
      this.shaper = ctx.createWaveShaper();
      this.shaper.curve = makeCurve(P.drive);
      this.shaper.oversample = '2x';
      this.lp = ctx.createBiquadFilter();
      this.lp.type = 'lowpass';
      this.lp.Q.value = 0.9;
      this.out = ctx.createGain();
      this.out.gain.value = 0;
      this.osc.connect(this.gMain);
      this.osc2.connect(this.gMain);
      this.sub.connect(this.gSub);
      this.noise.connect(this.nf);
      this.nf.connect(this.gNoise);
      this.gMain.connect(this.shaper);
      this.gSub.connect(this.shaper);
      this.gNoise.connect(this.shaper);
      this.shaper.connect(this.lp);
      this.lp.connect(this.out);
      if (opts.panner) {
        this.out.connect(opts.panner);
        opts.panner.connect(out);
      } else this.out.connect(out);
      // ターボの笛のような音
      this.turbo = ctx.createOscillator();
      this.turbo.type = 'sine';
      this.gTurbo = ctx.createGain();
      this.gTurbo.gain.value = 0;
      this.turbo.connect(this.gTurbo);
      this.gTurbo.connect(opts.panner || out);
      for (const o of [this.osc, this.osc2, this.sub, this.noise, this.turbo]) o.start();
      this.level = opts.level || 1;
    }
    set(rpm, load, firing, boost, vol) {
      const t = this.ctx.currentTime;
      const f = Math.max(20, (rpm / 60) * firing);
      const P = this.P;
      this.osc.frequency.setTargetAtTime(f, t, 0.012);
      this.osc2.frequency.setTargetAtTime(f * 1.003, t, 0.012);
      this.sub.frequency.setTargetAtTime(f / 2, t, 0.012);
      this.nf.frequency.setTargetAtTime(Math.min(9000, f * 3.2), t, 0.02);
      this.gNoise.gain.setTargetAtTime((0.06 + load * 0.35) * P.rasp, t, 0.03);
      this.lp.frequency.setTargetAtTime(Math.min(14000, (500 + load * 3800 + f * 4.5) * P.cut), t, 0.03);
      this.gMain.gain.setTargetAtTime(0.35 + load * 0.45, t, 0.03);
      const v = (0.16 + load * 0.2 + (rpm / 9000) * 0.12) * vol * this.level;
      this.out.gain.setTargetAtTime(v, t, 0.03);
      if (P.turbo > 0) {
        this.turbo.frequency.setTargetAtTime(1800 + boost * 5200 + rpm * 0.15, t, 0.05);
        this.gTurbo.gain.setTargetAtTime(boost * boost * 0.022 * P.turbo * vol * this.level, t, 0.05);
      }
    }
    stop() {
      for (const o of [this.osc, this.osc2, this.sub, this.noise, this.turbo]) {
        try { o.stop(); } catch (e) { /* 既に止まっている */ }
      }
      this.out.disconnect();
      this.gTurbo.disconnect();
    }
  }

  function makeCurve(k) {
    const n = 1024;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * k) / Math.tanh(k);
    }
    return c;
  }

  // 雑音を使った音(風・スキール・砂利など)
  function noiseChannel(ctx, out, type, freq, q) {
    const src = ctx.createBufferSource();
    src.buffer = RG.audio.noise;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start();
    return { src, f, g };
  }

  const audio = (RG.audio = {
    ctx: null,
    enabled: true,
    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      this.noise = noiseBuffer(ctx);
      this.master = ctx.createGain();
      this.master.gain.value = 0.8;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp);
      comp.connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
    },
    setVolume(v) {
      if (this.master) this.master.gain.value = v;
    },
    // レース用の音をそろえる
    startRace(player, others) {
      if (!this.ctx) return;
      this.stopRace();
      const ctx = this.ctx;
      this.player = player;
      this.eng = new EngineVoice(ctx, this.master, player.spec.engine.sound);
      this.wind = noiseChannel(ctx, this.master, 'lowpass', 700, 0.5);
      this.squeal = noiseChannel(ctx, this.master, 'bandpass', 1150, 5);
      this.squeal2 = noiseChannel(ctx, this.master, 'bandpass', 1600, 7);
      this.gravel = noiseChannel(ctx, this.master, 'lowpass', 420, 0.7);
      this.rumble = noiseChannel(ctx, this.master, 'lowpass', 120, 1);
      this.scrape = noiseChannel(ctx, this.master, 'bandpass', 2600, 2);
      // ギア・モーターの高い音
      this.whine = ctx.createOscillator();
      this.whine.type = 'triangle';
      this.gWhine = ctx.createGain();
      this.gWhine.gain.value = 0;
      this.whine.connect(this.gWhine);
      this.gWhine.connect(this.master);
      this.whine.start();
      this.motor = ctx.createOscillator();
      this.motor.type = 'sine';
      this.gMotor = ctx.createGain();
      this.gMotor.gain.value = 0;
      this.motor.connect(this.gMotor);
      this.gMotor.connect(this.master);
      this.motor.start();
      // ほかの車(近い2台)
      this.aiVoices = [];
      for (let k = 0; k < Math.min(2, others.length); k++) {
        const pan = ctx.createPanner();
        pan.panningModel = 'equalpower';
        pan.distanceModel = 'inverse';
        pan.refDistance = 6;
        pan.rolloffFactor = 1.2;
        this.aiVoices.push({ pan, voice: null, car: null });
      }
      this.others = others;
      this.lastThr = 0;
      this.crackleT = 0;
    },
    stopRace() {
      if (!this.eng) return;
      this.eng.stop();
      for (const ch of [this.wind, this.squeal, this.squeal2, this.gravel, this.rumble, this.scrape]) {
        ch.src.stop();
        ch.g.disconnect();
      }
      this.whine.stop();
      this.motor.stop();
      for (const v of this.aiVoices) if (v.voice) v.voice.stop();
      this.eng = null;
    },
    // 一瞬の音(シフト、衝突、バックファイア、ブローオフ)
    burst(kind, amount = 1) {
      if (!this.ctx || !this.eng) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.connect(f);
      f.connect(g);
      g.connect(this.sfx);
      let dur = 0.1;
      if (kind === 'shift') {
        f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2;
        g.gain.setValueAtTime(0.25, t);
        dur = 0.06;
      } else if (kind === 'hit') {
        f.type = 'lowpass'; f.frequency.value = 500 + amount * 300;
        g.gain.setValueAtTime(Math.min(1.4, 0.3 + amount * 0.12), t);
        dur = 0.35;
      } else if (kind === 'pop') {
        f.type = 'lowpass'; f.frequency.value = 1400;
        g.gain.setValueAtTime(0.5 * amount, t);
        dur = 0.05;
        src.playbackRate.value = 0.6;
      } else if (kind === 'blowoff') {
        f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 1.2;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.25 * amount, t + 0.03);
        dur = 0.45;
      } else if (kind === 'beep') {
        const o = ctx.createOscillator();
        o.frequency.value = amount > 1 ? 1320 : 880;
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.18, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + (amount > 1 ? 0.6 : 0.25));
        o.connect(og);
        og.connect(this.sfx);
        o.start(t);
        o.stop(t + 0.7);
        return;
      }
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      src.start(t, Math.random());
      src.stop(t + dur + 0.05);
    },
    update(dt, player, listener, cars) {
      if (!this.eng || !this.ctx) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const sp = player.spec;
      const load = U.clamp(player.throttleEff != null ? player.throttleEff : player.thr, 0, 1);
      const inCockpit = listener.cockpit ? 1 : 0.8;
      this.eng.set(player.rpm, load, sp.engine.firing, player.boost, inCockpit);
      // アクセルを戻した瞬間:ブローオフ、パンパンというアフターファイア
      if (this.lastThr > 0.6 && player.thr < 0.2) {
        if (sp.engine.turbo && player.boost > 0.4) this.burst('blowoff', player.boost);
        this.crackleT = 0.7;
      }
      this.lastThr = player.thr;
      if (this.crackleT > 0) {
        this.crackleT -= dt;
        const p = sp.engine.sound === 'rotary' || sp.engine.sound === 'f6tt' ? 14 : 6;
        if (player.rpm > sp.engine.idle + 2500 && player.thr < 0.1 && Math.random() < p * dt) {
          this.burst('pop', 0.6 + Math.random() * 0.6);
          player.backfire = 0.08;
        }
      }
      if (player.limiterCut && Math.random() < 0.3) player.backfire = Math.max(player.backfire || 0, 0.04);
      const v = player.speed;
      // 風
      this.wind.g.gain.setTargetAtTime(Math.min(0.5, (v * v) / 9000) * (listener.cockpit ? 0.7 : 0.45), t, 0.1);
      this.wind.f.frequency.setTargetAtTime(400 + v * 12, t, 0.1);
      // タイヤの鳴き
      let sq = 0, lock = 0;
      for (const w of player.wheels) {
        if (w.surf === 'road' || w.surf === 'curb' || w.surf === 'strip' || w.surf === 'tarmac') {
          sq = Math.max(sq, U.clamp((w.slip - 0.85) * 1.6, 0, 1) * Math.min(1, w.Fz / 2500));
          lock = Math.max(lock, w.lockup);
        }
      }
      sq *= U.clamp(v / 8, 0, 1);
      this.squeal.g.gain.setTargetAtTime(sq * 0.22, t, 0.04);
      this.squeal.f.frequency.setTargetAtTime(950 + sq * 400, t, 0.05);
      this.squeal2.g.gain.setTargetAtTime(lock * 0.12 * U.clamp(v / 10, 0, 1), t, 0.04);
      // 芝・砂利・縁石
      const off = player.offTrack / 4;
      this.gravel.g.gain.setTargetAtTime(off * Math.min(1, v / 15) * 0.5, t, 0.05);
      this.rumble.g.gain.setTargetAtTime((player.bump || 0) * 0.6, t, 0.03);
      this.scrape.g.gain.setTargetAtTime(player.scrape * 0.2, t, 0.03);
      // ギアのうなり(ストレートカットギア)とハイブリッドのモーター音
      const wheelRps = v / sp.wheelR / (Math.PI * 2);
      this.whine.frequency.setTargetAtTime(40 + wheelRps * sp.final * 27, t, 0.05);
      this.gWhine.gain.setTargetAtTime(U.clamp(v / 80, 0, 1) * 0.012 * (0.5 + load), t, 0.05);
      if (sp.hybrid) {
        this.motor.frequency.setTargetAtTime(300 + v * 58, t, 0.05);
        const hp = Math.abs(player.hybridPower) / sp.hybrid.kw;
        this.gMotor.gain.setTargetAtTime(hp * 0.05, t, 0.08);
      }
      // ほかの車
      const L = ctx.listener;
      if (L.positionX) {
        L.positionX.setTargetAtTime(listener.pos.x, t, 0.02);
        L.positionY.setTargetAtTime(listener.pos.y, t, 0.02);
        L.positionZ.setTargetAtTime(listener.pos.z, t, 0.02);
        L.forwardX.setTargetAtTime(listener.fwd.x, t, 0.02);
        L.forwardY.setTargetAtTime(listener.fwd.y, t, 0.02);
        L.forwardZ.setTargetAtTime(listener.fwd.z, t, 0.02);
        L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
      }
      const near = cars
        .filter((c) => c !== player)
        .map((c) => ({ c, d: (c.x - player.x) ** 2 + (c.z - player.z) ** 2 }))
        .sort((x, y) => x.d - y.d)
        .slice(0, this.aiVoices.length);
      this.aiVoices.forEach((slot, k) => {
        const tgt = near[k] && near[k].d < 250 * 250 ? near[k].c : null;
        if (tgt !== slot.car) {
          if (slot.voice) slot.voice.stop();
          slot.voice = tgt ? new EngineVoice(ctx, this.master, tgt.spec.engine.sound, { panner: slot.pan, level: 0.8 }) : null;
          slot.car = tgt;
        }
        if (tgt && slot.voice) {
          const p = slot.pan;
          if (p.positionX) {
            p.positionX.setTargetAtTime(tgt.x, t, 0.03);
            p.positionY.setTargetAtTime(tgt.y + 0.5, t, 0.03);
            p.positionZ.setTargetAtTime(tgt.z, t, 0.03);
          }
          // 近づくと高く、離れると低く(ドップラー効果)
          const dx = tgt.x - listener.pos.x, dz = tgt.z - listener.pos.z;
          const dist = Math.hypot(dx, dz) || 1;
          const rel = ((player.vx - tgt.vx) * dx + (player.vz - tgt.vz) * dz) / dist;
          const dop = U.clamp(343 / (343 - rel), 0.8, 1.25);
          slot.voice.set(tgt.rpm * dop, U.clamp(tgt.thr, 0, 1), tgt.spec.engine.firing, tgt.boost, 1);
        }
      });
    },
    pause(on) {
      if (!this.ctx) return;
      if (on) this.ctx.suspend();
      else this.ctx.resume();
    },
    // メニュー画面でエンジンを空ぶかし
    revDemo(spec) {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const v = new EngineVoice(ctx, this.master, spec.engine.sound, { level: 0.9 });
      const e = spec.engine;
      const t0 = performance.now();
      const step = () => {
        const tt = (performance.now() - t0) / 1000;
        let rpm;
        if (tt < 0.35) rpm = e.idle + (e.redline - e.idle) * (tt / 0.35) * 0.85;
        else rpm = e.idle + (e.redline * 0.85 - e.idle) * Math.exp(-(tt - 0.35) * 3);
        v.set(rpm, tt < 0.35 ? 1 : 0, e.firing, 0, 0.9);
        if (tt < 1.6) requestAnimationFrame(step);
        else {
          v.out.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
          setTimeout(() => v.stop(), 400);
        }
      };
      step();
    },
  });
})();
