// 画面表示(HUD):車種ごとに違うメーター、ラップタイム、順位、ミニマップ
(function () {
  'use strict';
  const RG = (window.RG = window.RG || {});
  const U = RG.U;

  const FONT = '"Orbitron", "Share Tech Mono", "M PLUS Rounded 1c", monospace';
  const MONO = '"Share Tech Mono", ui-monospace, monospace';

  class HUD {
    constructor(canvas) {
      this.c = canvas;
      this.g = canvas.getContext('2d');
      this.msg = null;
      this.blink = 0;
      this.mapCache = null;
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      this.c.width = Math.round(window.innerWidth * dpr);
      this.c.height = Math.round(window.innerHeight * dpr);
      this.c.style.width = window.innerWidth + 'px';
      this.c.style.height = window.innerHeight + 'px';
      this.mapCache = null;
    }
    message(text, sec = 2, color = '#fff', sub = '') {
      this.msg = { text, t: sec, color, sub };
    }

    draw(state, dt) {
      const g = this.g;
      const W = window.innerWidth, H = window.innerHeight;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      this.blink += dt;
      if (!state || !state.player) return;
      const s = Math.min(1.25, Math.max(0.6, Math.min(W / 1400, H / 820)));
      const p = state.player;
      if (state.showHud !== false) {
        this.timing(g, state, W, s);
        this.minimap(g, state, W, H, s);
        if (state.mode === 'race') this.standings(g, state, s);
        this.assists(g, p, state, W, H, s);
        // 車種ごとのメーター
        const cockpit = state.cameraMode === 2;
        const scale = s * (cockpit ? 1.1 : 0.9);
        g.save();
        const dw = 560 * scale, dh = 220 * scale;
        const x = cockpit ? W / 2 - dw / 2 : W - dw - 18 * s, y = H - dh - (cockpit ? 6 : 14) * s;
        g.translate(x, y);
        g.scale(scale, scale);
        DASH[p.spec.dash](g, p, state, this.blink);
        g.restore();
      }
      // 中央のメッセージ
      if (this.msg) {
        this.msg.t -= dt;
        const a = U.clamp(this.msg.t * 2, 0, 1);
        g.save();
        g.globalAlpha = a;
        g.textAlign = 'center';
        g.font = `900 ${Math.round(64 * s)}px ${FONT}`;
        g.lineWidth = 6 * s;
        g.strokeStyle = 'rgba(0,0,0,0.6)';
        g.strokeText(this.msg.text, W / 2, H * 0.32);
        g.fillStyle = this.msg.color;
        g.fillText(this.msg.text, W / 2, H * 0.32);
        if (this.msg.sub) {
          g.font = `700 ${Math.round(22 * s)}px ${FONT}`;
          g.strokeText(this.msg.sub, W / 2, H * 0.32 + 40 * s);
          g.fillStyle = '#fff';
          g.fillText(this.msg.sub, W / 2, H * 0.32 + 40 * s);
        }
        g.restore();
        if (this.msg.t <= 0) this.msg = null;
      }
      // スタートシグナル
      if (state.lights != null) this.startLights(g, state.lights, W, s);
      if (state.wrongWay && Math.floor(this.blink * 3) % 2 === 0) {
        g.save();
        g.textAlign = 'center';
        g.font = `900 ${Math.round(40 * s)}px ${FONT}`;
        g.fillStyle = '#ff3030';
        g.fillText('逆走しています', W / 2, H * 0.45);
        g.restore();
      }
    }

    panel(g, x, y, w, h, r = 10) {
      g.fillStyle = 'rgba(8,10,14,0.62)';
      U.roundRect(g, x, y, w, h, r);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.lineWidth = 1;
      g.stroke();
    }

    timing(g, st, W, s) {
      const p = st.player;
      const x = 18 * s, y = 16 * s;
      this.panel(g, x, y, 300 * s, (st.mode === 'race' ? 132 : 112) * s);
      g.textBaseline = 'alphabetic';
      g.textAlign = 'left';
      let yy = y + 30 * s;
      if (st.mode === 'race') {
        g.fillStyle = '#9aa4b2';
        g.font = `700 ${12 * s}px ${FONT}`;
        g.fillText('POS', x + 14 * s, yy - 8 * s);
        g.fillText('LAP', x + 160 * s, yy - 8 * s);
        g.fillStyle = '#fff';
        g.font = `900 ${30 * s}px ${FONT}`;
        g.fillText(`${st.position}`, x + 14 * s, yy + 22 * s);
        const w = g.measureText(`${st.position}`).width;
        g.font = `700 ${16 * s}px ${FONT}`;
        g.fillStyle = '#9aa4b2';
        g.fillText(`/${st.cars.length}`, x + 16 * s + w, yy + 22 * s);
        g.fillStyle = '#fff';
        g.font = `900 ${30 * s}px ${FONT}`;
        const lap = Math.max(1, Math.min(st.lap, st.totalLaps));
        g.fillText(`${lap}`, x + 160 * s, yy + 22 * s);
        const w2 = g.measureText(`${lap}`).width;
        g.font = `700 ${16 * s}px ${FONT}`;
        g.fillStyle = '#9aa4b2';
        g.fillText(`/${st.totalLaps}`, x + 162 * s + w2, yy + 22 * s);
        yy += 52 * s;
      } else {
        g.fillStyle = '#9aa4b2';
        g.font = `700 ${12 * s}px ${FONT}`;
        g.fillText('TIME ATTACK  ·  LAP ' + Math.max(1, st.lap), x + 14 * s, yy - 6 * s);
        yy += 16 * s;
      }
      g.font = `700 ${26 * s}px ${MONO}`;
      g.fillStyle = st.lapValid === false ? '#ff6b6b' : '#fff';
      g.fillText(U.formatTime(st.lapTime), x + 14 * s, yy + 6 * s);
      if (st.delta != null) {
        g.font = `700 ${18 * s}px ${MONO}`;
        g.fillStyle = st.delta < 0 ? '#38e07b' : '#ff5a5a';
        g.fillText(U.formatDelta(st.delta), x + 186 * s, yy + 4 * s);
      }
      g.font = `600 ${13 * s}px ${MONO}`;
      g.fillStyle = '#9aa4b2';
      g.fillText('LAST ' + U.formatTime(st.lastLap), x + 14 * s, yy + 28 * s);
      g.fillStyle = '#c99cff';
      g.fillText('BEST ' + U.formatTime(st.bestLap), x + 156 * s, yy + 28 * s);
    }

    standings(g, st, s) {
      const list = st.order.slice(0, 10);
      const x = 18 * s, y = 158 * s;
      const rh = 20 * s;
      this.panel(g, x, y, 230 * s, (list.length * 20 + 12) * s, 8);
      g.font = `600 ${12 * s}px ${MONO}`;
      list.forEach((c, k) => {
        const yy = y + 20 * s + k * rh;
        const me = c === st.player;
        if (me) {
          g.fillStyle = 'rgba(255,210,0,0.18)';
          g.fillRect(x + 4 * s, yy - 14 * s, 222 * s, rh - 2 * s);
        }
        g.fillStyle = '#9aa4b2';
        g.textAlign = 'right';
        g.fillText(String(k + 1), x + 24 * s, yy);
        g.textAlign = 'left';
        g.fillStyle = c.livery.a;
        g.fillRect(x + 30 * s, yy - 10 * s, 4 * s, 12 * s);
        g.fillStyle = me ? '#ffd200' : '#e8ecf1';
        g.fillText(c.name.slice(0, 13), x + 40 * s, yy);
        g.fillStyle = '#9aa4b2';
        g.textAlign = 'right';
        const gap = k === 0 ? (c.finished ? 'FIN' : 'LEADER') : c.gapText || '';
        g.fillText(gap, x + 222 * s, yy);
        g.textAlign = 'left';
      });
    }

    assists(g, p, st, W, H, s) {
      const x = 18 * s, y = H - 112 * s;
      this.panel(g, x, y, 250 * s, 96 * s, 8);
      g.font = `700 ${11 * s}px ${FONT}`;
      const chip = (label, on, cx, color = '#ffd200') => {
        g.fillStyle = on ? color : 'rgba(255,255,255,0.12)';
        U.roundRect(g, cx, y + 10 * s, 52 * s, 18 * s, 4 * s);
        g.fill();
        g.fillStyle = on ? '#111' : '#9aa4b2';
        g.textAlign = 'center';
        g.fillText(label, cx + 26 * s, y + 23 * s);
      };
      chip(p.assist.auto ? 'AT' : 'MT', true, x + 10 * s, '#7cc4ff');
      chip('TC ' + p.assist.tcs, p.tcsActive, x + 68 * s);
      chip('ABS', p.absActive, x + 126 * s);
      chip(p.assist.steer ? 'STR+' : 'STR', false, x + 184 * s);
      // タイヤ(滑り具合)
      const tx = x + 12 * s, ty = y + 38 * s;
      g.textAlign = 'left';
      p.wheels.forEach((w, k) => {
        const cx = tx + (k % 2) * 26 * s, cy = ty + Math.floor(k / 2) * 30 * s;
        const sl = U.clamp(w.slip, 0, 2);
        const col = sl < 0.8 ? '#2ecc71' : sl < 1.05 ? '#f1c40f' : sl < 1.3 ? '#e67e22' : '#e74c3c';
        g.fillStyle = col;
        U.roundRect(g, cx, cy, 18 * s, 24 * s, 4 * s);
        g.fill();
        const bt = U.clamp((w.brakeT - 200) / 700, 0, 1);
        g.fillStyle = `rgba(255,${120 - bt * 100},0,${bt})`;
        g.fillRect(cx + 7 * s, cy + 4 * s, 4 * s, 16 * s);
      });
      g.fillStyle = '#9aa4b2';
      g.font = `600 ${11 * s}px ${MONO}`;
      g.fillText('BRAKE BIAS', x + 76 * s, y + 52 * s);
      g.fillStyle = '#fff';
      g.font = `700 ${18 * s}px ${MONO}`;
      g.fillText((p.brakeBias * 100).toFixed(1) + '%', x + 76 * s, y + 74 * s);
      g.fillStyle = '#9aa4b2';
      g.font = `600 ${11 * s}px ${MONO}`;
      g.fillText(st.cameraName || '', x + 170 * s, y + 52 * s);
      if (st.ghostOn) g.fillText('GHOST', x + 170 * s, y + 70 * s);
      if (p.assist.auto === false && p.overRev > 0) {
        g.fillStyle = '#ff5a5a';
        g.fillText('OVER-REV!', x + 170 * s, y + 86 * s);
      }
    }

    minimap(g, st, W, H, s) {
      const T = st.track;
      const size = 210 * s;
      const x0 = W - size - 18 * s, y0 = 16 * s;
      if (!this.mapCache || this.mapCache.size !== size) {
        let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
        for (let i = 0; i < T.n; i++) {
          minX = Math.min(minX, T.px[i]); maxX = Math.max(maxX, T.px[i]);
          minZ = Math.min(minZ, T.pz[i]); maxZ = Math.max(maxZ, T.pz[i]);
        }
        const sc = (size - 30 * s) / Math.max(maxX - minX, maxZ - minZ);
        const ox = (size - (maxX - minX) * sc) / 2, oz = (size - (maxZ - minZ) * sc) / 2;
        const can = document.createElement('canvas');
        can.width = Math.round(size * this.dpr);
        can.height = Math.round(size * this.dpr);
        const cg = can.getContext('2d');
        cg.scale(this.dpr, this.dpr);
        const tp = (i) => [ox + (T.px[i] - minX) * sc, oz + (T.pz[i] - minZ) * sc];
        cg.lineJoin = 'round';
        for (const [w, c] of [[7 * s, 'rgba(0,0,0,0.6)'], [3.5 * s, '#e8ecf1']]) {
          cg.beginPath();
          for (let i = 0; i <= T.n; i += 3) {
            const [px, py] = tp(i % T.n);
            if (i === 0) cg.moveTo(px, py);
            else cg.lineTo(px, py);
          }
          cg.closePath();
          cg.lineWidth = w;
          cg.strokeStyle = c;
          cg.stroke();
        }
        const [sx, sy] = tp(0);
        cg.fillStyle = '#ff3b3b';
        cg.fillRect(sx - 3 * s, sy - 3 * s, 6 * s, 6 * s);
        this.mapCache = { can, size, tp: (x, z) => [ox + (x - minX) * sc, oz + (z - minZ) * sc] };
      }
      this.panel(g, x0, y0, size, size, 10);
      g.drawImage(this.mapCache.can, x0, y0, size, size);
      for (const c of st.cars) {
        const [px, py] = this.mapCache.tp(c.x, c.z);
        const me = c === st.player;
        g.fillStyle = me ? '#ffd200' : c.livery.a;
        g.strokeStyle = '#000';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x0 + px, y0 + py, (me ? 5 : 3.6) * s, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      if (st.ghost) {
        const [px, py] = this.mapCache.tp(st.ghost.x, st.ghost.z);
        g.fillStyle = 'rgba(200,160,255,0.8)';
        g.beginPath();
        g.arc(x0 + px, y0 + py, 3.5 * s, 0, Math.PI * 2);
        g.fill();
      }
    }

    startLights(g, n, W, s) {
      const x = W / 2 - 150 * s, y = 150 * s;
      this.panel(g, x, y, 300 * s, 70 * s, 12);
      for (let k = 0; k < 5; k++) {
        const on = n === -1 ? false : k < n;
        const green = n === -1;
        g.fillStyle = green ? '#22ff66' : on ? '#ff1a1a' : '#2a1010';
        g.shadowColor = green ? '#22ff66' : '#ff2020';
        g.shadowBlur = on || green ? 20 * s : 0;
        g.beginPath();
        g.arc(x + 40 * s + k * 55 * s, y + 35 * s, 20 * s, 0, Math.PI * 2);
        g.fill();
      }
      g.shadowBlur = 0;
    }
  }

  // ---- 車種ごとのメーター ----
  function rpmFrac(p) {
    return U.clamp(p.rpm / p.spec.engine.limiter, 0, 1.05);
  }
  function gearText(p) {
    return p.gear < 0 ? 'R' : p.gear === 0 ? 'N' : String(p.gear);
  }

  const DASH = {
    // 現代のハイパーカー:カラー液晶+シフトランプ
    tft(g, p, st, blink) {
      const e = p.spec.engine;
      // ハンドルの形のベゼル
      g.fillStyle = '#0c0d10';
      U.roundRect(g, 10, 20, 540, 190, 30);
      g.fill();
      const cg = g.createLinearGradient(0, 20, 0, 210);
      cg.addColorStop(0, '#24262b');
      cg.addColorStop(1, '#0b0c0e');
      g.strokeStyle = cg;
      g.lineWidth = 6;
      g.stroke();
      // シフトランプ(緑→赤→青)
      const n = 15;
      const f = (p.rpm - e.redline * 0.72) / (e.limiter - 250 - e.redline * 0.72);
      const lit = Math.floor(U.clamp(f, 0, 1) * n + 0.0001);
      const flash = p.rpm > e.limiter - 300 && Math.floor(blink * 12) % 2 === 0;
      for (let k = 0; k < n; k++) {
        const col = k < 5 ? '#19e65a' : k < 10 ? '#ff2a2a' : '#2a6bff';
        const on = flash || k < lit;
        g.fillStyle = on ? (flash ? '#2a6bff' : col) : '#1d2026';
        g.shadowColor = col;
        g.shadowBlur = on ? 10 : 0;
        g.beginPath();
        g.arc(60 + k * 31, 40, 8, 0, Math.PI * 2);
        g.fill();
      }
      g.shadowBlur = 0;
      // 画面
      g.fillStyle = '#05070a';
      U.roundRect(g, 70, 60, 420, 138, 10);
      g.fill();
      // ギア
      g.textAlign = 'center';
      g.fillStyle = '#ffffff';
      g.font = `800 92px ${MONO}`;
      g.fillText(gearText(p), 280, 170);
      // 速度
      g.textAlign = 'left';
      g.fillStyle = '#ffffff';
      g.font = `700 40px ${MONO}`;
      g.fillText(String(Math.round(p.kmh)), 86, 118);
      g.fillStyle = '#8a93a0';
      g.font = `600 13px ${MONO}`;
      g.fillText('KM/H', 88, 136);
      // 回転数
      g.fillStyle = '#ffffff';
      g.font = `700 24px ${MONO}`;
      g.fillText(String(Math.round(p.rpm / 10) * 10), 86, 176);
      g.fillStyle = '#8a93a0';
      g.font = `600 13px ${MONO}`;
      g.fillText('RPM', 88, 192);
      // 右側:デルタ、バッテリー
      g.textAlign = 'right';
      const d = st.delta;
      g.font = `700 26px ${MONO}`;
      g.fillStyle = d == null ? '#8a93a0' : d < 0 ? '#2cff7a' : '#ff4d4d';
      g.fillText(d == null ? '--.---' : U.formatDelta(d), 476, 100);
      g.fillStyle = '#8a93a0';
      g.font = `600 12px ${MONO}`;
      g.fillText('DELTA', 476, 116);
      if (p.spec.hybrid) {
        const soc = p.soc / (p.spec.hybrid.capMJ * 1e6);
        g.fillStyle = '#1a1e25';
        g.fillRect(372, 140, 104, 16);
        g.fillStyle = p.hybridPower > 0 ? '#2cff7a' : p.hybridPower < 0 ? '#3aa0ff' : '#e6e6e6';
        g.fillRect(374, 142, 100 * soc, 12);
        g.fillStyle = '#8a93a0';
        g.fillText(p.hybridPower > 0 ? 'DEPLOY' : p.hybridPower < 0 ? 'REGEN' : 'BATT', 476, 172);
      }
      g.textAlign = 'left';
      g.fillStyle = '#ffb000';
      g.font = `700 14px ${MONO}`;
      g.fillText(`BB ${(p.brakeBias * 100).toFixed(1)}  TC ${p.assist.tcs}`, 170, 80);
      if (p.tcsActive || p.absActive) {
        g.fillStyle = '#ffd200';
        g.fillRect(70, 60, 8, 138);
      }
    },

    // 1991年のロータリー:アナログの大きなタコメーター
    analog(g, p, st, blink) {
      const e = p.spec.engine;
      // パネル(つや消し黒)
      g.fillStyle = '#121212';
      U.roundRect(g, 10, 6, 540, 210, 20);
      g.fill();
      g.strokeStyle = '#2b2b2b';
      g.lineWidth = 3;
      g.stroke();
      const dial = (cx, cy, r, v0, v1, val, majors, red, label, unit, fmt) => {
        g.save();
        g.translate(cx, cy);
        const grd = g.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
        grd.addColorStop(0, '#1d1d1d');
        grd.addColorStop(1, '#050505');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#8a8a8a';
        g.lineWidth = r * 0.05;
        g.stroke();
        const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
        const ang = (v) => a0 + ((v - v0) / (v1 - v0)) * (a1 - a0);
        if (red != null) {
          g.strokeStyle = '#d01818';
          g.lineWidth = r * 0.1;
          g.beginPath();
          g.arc(0, 0, r * 0.84, ang(red), a1);
          g.stroke();
        }
        g.strokeStyle = '#f2f2f2';
        g.fillStyle = '#f2f2f2';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `700 ${r * 0.17}px Arial`;
        for (let k = 0; k <= majors; k++) {
          const v = v0 + ((v1 - v0) * k) / majors;
          const a = ang(v);
          g.lineWidth = r * 0.035;
          g.beginPath();
          g.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
          g.lineTo(Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74);
          g.stroke();
          g.fillText(fmt(v), Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58);
          if (k < majors) {
            const am = ang(v + (v1 - v0) / majors / 2);
            g.lineWidth = r * 0.02;
            g.beginPath();
            g.moveTo(Math.cos(am) * r * 0.9, Math.sin(am) * r * 0.9);
            g.lineTo(Math.cos(am) * r * 0.82, Math.sin(am) * r * 0.82);
            g.stroke();
          }
        }
        g.font = `700 ${r * 0.12}px Arial`;
        g.fillStyle = '#bdbdbd';
        g.fillText(label, 0, r * 0.32);
        if (unit) {
          g.font = `600 ${r * 0.1}px Arial`;
          g.fillText(unit, 0, r * 0.46);
        }
        // 針
        const a = ang(U.clamp(val, v0 - (v1 - v0) * 0.02, v1 + (v1 - v0) * 0.02));
        g.rotate(a);
        g.fillStyle = '#ff7a10';
        g.shadowColor = 'rgba(0,0,0,0.7)';
        g.shadowBlur = 6;
        g.beginPath();
        g.moveTo(-r * 0.15, -r * 0.03);
        g.lineTo(r * 0.86, -r * 0.008);
        g.lineTo(r * 0.86, r * 0.008);
        g.lineTo(-r * 0.15, r * 0.03);
        g.closePath();
        g.fill();
        g.shadowBlur = 0;
        g.rotate(-a);
        g.fillStyle = '#222';
        g.beginPath();
        g.arc(0, 0, r * 0.09, 0, Math.PI * 2);
        g.fill();
        // ガラスの映り込み
        const gl = g.createLinearGradient(-r, -r, r * 0.3, r * 0.2);
        gl.addColorStop(0, 'rgba(255,255,255,0.13)');
        gl.addColorStop(0.5, 'rgba(255,255,255,0.02)');
        gl.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gl;
        g.beginPath();
        g.arc(0, 0, r * 0.97, Math.PI * 1.0, Math.PI * 1.9);
        g.fill();
        g.restore();
      };
      dial(280, 112, 98, 0, 10, p.rpm / 1000, 10, 9, 'RPM', '×1000', (v) => String(Math.round(v)));
      // 小さな計器
      const water = 82 + U.clamp(p.rpm / e.limiter, 0, 1) * 12;
      const oilP = 2 + (p.rpm / e.limiter) * 5;
      dial(95, 72, 48, 40, 120, water, 4, 110, 'WATER', '°C', (v) => String(Math.round(v)));
      dial(95, 170, 40, 0, 10, oilP, 5, null, 'OIL', 'kg/cm²', (v) => String(Math.round(v)));
      dial(465, 72, 48, 0, 400, p.kmh, 4, null, 'SPEED', 'km/h', (v) => String(Math.round(v)));
      // ギアの7セグ表示とシフトランプ
      g.fillStyle = '#1a0a00';
      U.roundRect(g, 430, 132, 70, 74, 8);
      g.fill();
      g.fillStyle = '#ff8a1a';
      g.shadowColor = '#ff8a1a';
      g.shadowBlur = 12;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `700 58px ${MONO}`;
      g.fillText(gearText(p), 465, 172);
      g.shadowBlur = 0;
      const shift = p.rpm > e.redline - 300;
      g.fillStyle = shift ? (Math.floor(blink * 10) % 2 ? '#ffd23a' : '#ffab00') : '#3a2a00';
      g.shadowColor = '#ffcc00';
      g.shadowBlur = shift ? 25 : 0;
      g.beginPath();
      g.arc(280, 26, 12, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.textBaseline = 'alphabetic';
    },

    // LMP1(2010年代):反射型の液晶(白黒)+LED
    lcd(g, p, st, blink) {
      const e = p.spec.engine;
      g.fillStyle = '#16181b';
      U.roundRect(g, 10, 10, 540, 200, 16);
      g.fill();
      // LED(左右の縦列も)
      const f = U.clamp((p.rpm - e.redline * 0.75) / (e.limiter - 200 - e.redline * 0.75), 0, 1);
      for (let k = 0; k < 10; k++) {
        const on = f * 10 > k;
        const col = k < 4 ? '#ffffff' : k < 8 ? '#ff2a2a' : '#3a7bff';
        g.fillStyle = on ? col : '#2a2c30';
        g.shadowColor = col;
        g.shadowBlur = on ? 8 : 0;
        g.fillRect(105 + k * 36, 18, 26, 9);
      }
      g.shadowBlur = 0;
      // 液晶
      const lg = g.createLinearGradient(0, 36, 0, 200);
      lg.addColorStop(0, '#bfc9b4');
      lg.addColorStop(1, '#a5b09a');
      g.fillStyle = lg;
      U.roundRect(g, 40, 36, 480, 164, 8);
      g.fill();
      const ink = '#1a1d18';
      const ghost = 'rgba(26,29,24,0.08)';
      // 回転数の弧状バー(セグメント)
      const segs = 40;
      for (let k = 0; k < segs; k++) {
        const t = k / segs;
        const on = p.rpm / e.limiter > t;
        g.fillStyle = on ? ink : ghost;
        const h = 6 + Math.pow(t, 2) * 24;
        g.fillRect(56 + k * 11.3, 82 - h, 8, h);
      }
      g.fillStyle = ink;
      g.font = `700 11px ${MONO}`;
      g.textAlign = 'left';
      g.fillText('RPM ×1000', 56, 96);
      for (let k = 0; k <= 9; k += 3) g.fillText(String(k), 56 + (k / (e.limiter / 1000)) * segs * 11.3, 110);
      // ギア
      g.textAlign = 'center';
      g.font = `700 84px ${MONO}`;
      g.fillStyle = ghost;
      g.fillText('8', 280, 185);
      g.fillStyle = ink;
      g.fillText(gearText(p), 280, 185);
      // 速度
      g.textAlign = 'right';
      g.font = `700 44px ${MONO}`;
      g.fillStyle = ghost;
      g.fillText('888', 210, 168);
      g.fillStyle = ink;
      g.fillText(String(Math.round(p.kmh)), 210, 168);
      g.font = `700 12px ${MONO}`;
      g.fillText('km/h', 210, 186);
      // ERS
      g.textAlign = 'left';
      if (p.spec.hybrid) {
        const soc = p.soc / (p.spec.hybrid.capMJ * 1e6);
        g.font = `700 12px ${MONO}`;
        g.fillStyle = ink;
        g.fillText('ERS', 350, 128);
        for (let k = 0; k < 10; k++) {
          g.fillStyle = soc * 10 > k ? ink : ghost;
          g.fillRect(380 + k * 13, 118, 10, 12);
        }
        g.fillStyle = ink;
        g.font = `700 16px ${MONO}`;
        g.fillText(p.hybridPower > 0 ? 'BOOST' : p.hybridPower < 0 ? 'HARVEST' : '', 350, 152);
      }
      const d = st.delta;
      g.font = `700 22px ${MONO}`;
      g.fillStyle = ink;
      g.fillText(d == null ? ' --.--' : U.formatDelta(d).slice(0, 6), 350, 186);
      // 液晶のガラス感
      const gl = g.createLinearGradient(40, 36, 520, 200);
      gl.addColorStop(0, 'rgba(255,255,255,0.18)');
      gl.addColorStop(0.4, 'rgba(255,255,255,0)');
      g.fillStyle = gl;
      U.roundRect(g, 40, 36, 480, 164, 8);
      g.fill();
    },

    // 1980年代のグループC:VDO 風の丸い計器が並ぶ
    vdo(g, p, st, blink) {
      const e = p.spec.engine;
      // パネル(ダッシュボードの革)
      const bg = g.createLinearGradient(0, 0, 0, 220);
      bg.addColorStop(0, '#26231f');
      bg.addColorStop(1, '#141210');
      g.fillStyle = bg;
      U.roundRect(g, 0, 10, 560, 205, 18);
      g.fill();
      const gauge = (cx, cy, r, v0, v1, val, step, red, label, fmt, sweep = 1.5) => {
        g.save();
        g.translate(cx, cy);
        // 金属の縁
        const rim = g.createLinearGradient(-r, -r, r, r);
        rim.addColorStop(0, '#d9d9d9');
        rim.addColorStop(0.5, '#555');
        rim.addColorStop(1, '#bbb');
        g.fillStyle = rim;
        g.beginPath();
        g.arc(0, 0, r * 1.08, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#060606';
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fill();
        const a0 = Math.PI / 2 + (Math.PI * 2 - Math.PI * sweep) / 2, a1 = a0 + Math.PI * sweep;
        const ang = (v) => a0 + ((v - v0) / (v1 - v0)) * (a1 - a0);
        g.strokeStyle = '#eee';
        g.fillStyle = '#eee';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `700 ${r * 0.2}px Arial`;
        for (let v = v0; v <= v1 + 1e-6; v += step) {
          const a = ang(v);
          const isRed = red != null && v >= red;
          g.strokeStyle = isRed ? '#ff3030' : '#eee';
          g.lineWidth = r * 0.04;
          g.beginPath();
          g.moveTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
          g.lineTo(Math.cos(a) * r * 0.76, Math.sin(a) * r * 0.76);
          g.stroke();
          g.fillStyle = isRed ? '#ff3030' : '#eee';
          g.fillText(fmt(v), Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58);
        }
        g.fillStyle = '#ddd';
        g.font = `600 ${r * 0.13}px Arial`;
        g.fillText(label, 0, r * 0.35);
        const a = ang(U.clamp(val, v0, v1 * 1.02));
        g.rotate(a);
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.moveTo(-r * 0.12, -r * 0.025);
        g.lineTo(r * 0.88, 0);
        g.lineTo(-r * 0.12, r * 0.025);
        g.closePath();
        g.fill();
        g.rotate(-a);
        g.fillStyle = '#333';
        g.beginPath();
        g.arc(0, 0, r * 0.1, 0, Math.PI * 2);
        g.fill();
        const gl = g.createRadialGradient(-r * 0.4, -r * 0.5, 0, -r * 0.4, -r * 0.5, r * 1.1);
        gl.addColorStop(0, 'rgba(255,255,255,0.16)');
        gl.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gl;
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fill();
        g.restore();
      };
      gauge(280, 112, 92, 0, 9, p.rpm / 1000, 1, 8.2, 'U/min ×1000', (v) => String(Math.round(v)));
      gauge(96, 76, 50, 0, 2.5, p.boost * 1.8 + 0.05, 0.5, null, 'BOOST', (v) => v.toFixed(1));
      gauge(96, 170, 38, 0, 10, 1.5 + (p.rpm / e.limiter) * 6, 2, null, 'OIL', (v) => String(Math.round(v)));
      gauge(464, 90, 62, 0, 400, p.kmh, 50, null, 'km/h', (v) => (v % 100 === 0 ? String(v) : ''));
      // 警告ランプ
      const lamps = [
        ['#3a0a0a', '#ff3030', p.rpm > e.redline],
        ['#2a2a0a', '#ffd000', p.absActive || p.tcsActive],
        ['#0a2a0a', '#30ff60', p.boost > 0.85],
      ];
      lamps.forEach(([off, on, st2], k) => {
        g.fillStyle = st2 ? on : off;
        g.shadowColor = on;
        g.shadowBlur = st2 ? 12 : 0;
        g.fillRect(410 + k * 30, 172, 20, 14);
      });
      g.shadowBlur = 0;
      // 後付けのギア表示(小さな液晶)
      g.fillStyle = '#000';
      U.roundRect(g, 515, 150, 36, 46, 4);
      g.fill();
      g.fillStyle = '#ff3b1f';
      g.font = `700 34px ${MONO}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(gearText(p), 533, 175);
      g.textBaseline = 'alphabetic';
    },
  };

  RG.HUD = HUD;
})();
