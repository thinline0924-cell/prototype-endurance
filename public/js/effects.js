// 演出:タイヤスモーク、スキッドマーク(ブレーキ痕)、火花、アフターファイアの炎
(function () {
  'use strict';
  const RG = (window.RG = window.RG || {});
  const U = RG.U;
  const TX = RG.TX;

  // 1つずつ大きさと濃さを持てる粒子
  class Particles {
    constructor(max, tex, { additive = false, color = 0xffffff } = {}) {
      this.max = max;
      this.pos = new Float32Array(max * 3);
      this.vel = new Float32Array(max * 3);
      this.size = new Float32Array(max);
      this.alpha = new Float32Array(max);
      this.life = new Float32Array(max);
      this.maxLife = new Float32Array(max);
      this.grow = new Float32Array(max);
      this.col = new Float32Array(max * 3);
      this.next = 0;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
      this.geo = g;
      this.mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: tex }, tint: { value: new THREE.Color(color) }, scale: { value: 600 } },
        vertexShader: `
          attribute float size; attribute float alpha; attribute vec3 pcolor;
          varying float vA; varying vec3 vC;
          uniform float scale;
          void main(){
            vA = alpha; vC = pcolor;
            vec4 mv = modelViewMatrix * vec4(position,1.0);
            gl_PointSize = size * scale / max(0.5, -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform sampler2D map; uniform vec3 tint;
          varying float vA; varying vec3 vC;
          void main(){
            vec4 t = texture2D(map, gl_PointCoord);
            gl_FragColor = vec4(tint * vC * t.rgb, t.a * vA);
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.points = new THREE.Points(g, this.mat);
      this.points.frustumCulled = false;
    }
    emit(x, y, z, vx, vy, vz, size, life, alpha, grow = 1, r = 1, gg = 1, b = 1) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      this.size[i] = size;
      this.life[i] = life;
      this.maxLife[i] = life;
      this.alpha[i] = alpha;
      this.grow[i] = grow;
      this.col[i * 3] = r; this.col[i * 3 + 1] = gg; this.col[i * 3 + 2] = b;
      this.a0 = this.a0 || new Float32Array(this.max);
      this.a0[i] = alpha;
    }
    update(dt, gravity = 0, drag = 1.5) {
      const k = Math.exp(-drag * dt);
      for (let i = 0; i < this.max; i++) {
        if (this.life[i] <= 0) {
          this.alpha[i] = 0;
          continue;
        }
        this.life[i] -= dt;
        const t = 1 - this.life[i] / this.maxLife[i];
        this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - gravity * dt; this.vel[i * 3 + 2] *= k;
        this.pos[i * 3] += this.vel[i * 3] * dt;
        this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
        this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
        this.size[i] += this.grow[i] * dt;
        this.alpha[i] = this.a0[i] * (1 - t) * Math.min(1, t * 8);
      }
      for (const a of ['position', 'size', 'alpha', 'pcolor']) this.geo.attributes[a].needsUpdate = true;
    }
  }

  // スキッドマーク(古いものから上書き)
  class Skids {
    constructor(max) {
      this.max = max;
      this.pos = new Float32Array(max * 4 * 3);
      this.col = new Float32Array(max * 4 * 4);
      this.uv = new Float32Array(max * 4 * 2);
      const idx = [];
      for (let i = 0; i < max; i++) {
        const b = i * 4;
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
      g.setIndex(idx);
      this.geo = g;
      this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        map: TX.skid(), vertexColors: true, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -3, color: 0x000000,
      }));
      this.mesh.frustumCulled = false;
      this.next = 0;
      this.last = new Map();
    }
    add(key, x, y, z, nx, nz, w, a) {
      const prev = this.last.get(key);
      this.last.set(key, { x, y, z, nx, nz });
      if (!prev) return;
      const d2 = (x - prev.x) ** 2 + (z - prev.z) ** 2;
      if (d2 < 0.04 || d2 > 9) return;
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const b = i * 4;
      const P = this.pos;
      const set = (k, px, py, pz) => { P[(b + k) * 3] = px; P[(b + k) * 3 + 1] = py; P[(b + k) * 3 + 2] = pz; };
      set(0, prev.x + prev.nx * w, prev.y, prev.z + prev.nz * w);
      set(1, prev.x - prev.nx * w, prev.y, prev.z - prev.nz * w);
      set(2, x + nx * w, y, z + nz * w);
      set(3, x - nx * w, y, z - nz * w);
      for (let k = 0; k < 4; k++) {
        this.col[(b + k) * 4] = 1; this.col[(b + k) * 4 + 1] = 1; this.col[(b + k) * 4 + 2] = 1; this.col[(b + k) * 4 + 3] = a;
        this.uv[(b + k) * 2] = k % 2; this.uv[(b + k) * 2 + 1] = k < 2 ? 0 : 1;
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
      this.geo.attributes.uv.needsUpdate = true;
    }
    cut(key) {
      this.last.delete(key);
    }
  }

  class Effects {
    constructor(scene, quality) {
      const q = quality;
      this.smoke = new Particles(q === 'low' ? 200 : 600, TX.smoke(), { color: 0xd8d8d8 });
      this.dust = new Particles(q === 'low' ? 150 : 400, TX.smoke(), { color: 0xb59a6a });
      this.sparks = new Particles(300, TX.softDot(), { additive: true, color: 0xffb040 });
      this.flames = new Particles(120, TX.softDot(), { additive: true, color: 0xff7a20 });
      this.skids = new Skids(q === 'low' ? 1500 : 4000);
      scene.add(this.skids.mesh, this.smoke.points, this.dust.points, this.sparks.points, this.flames.points);
    }
    setLight(c) {
      this.smoke.mat.uniforms.tint.value.copy(c);
    }
    update(dt, cars, models, camera) {
      const scale = window.innerHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
      for (const p of [this.smoke, this.dust, this.sparks, this.flames]) p.mat.uniforms.scale.value = scale;
      cars.forEach((car, ci) => {
        const sh = Math.sin(car.h), ch = Math.cos(car.h);
        const v = car.speed;
        car.wheels.forEach((w, k) => {
          const wx = car.x + sh * w.lx + ch * w.ly;
          const wz = car.z + ch * w.lx - sh * w.ly;
          const key = ci * 4 + k;
          const onPaved = w.surf === 'road' || w.surf === 'curb' || w.surf === 'strip' || w.surf === 'tarmac';
          const sliding = w.slip > 1.15 || w.lockup || (w.kappa > 0.35 && !w.front);
          if (onPaved && sliding && v > 3 && w.Fz > 500) {
            const a = U.clamp((w.slip - 1.0) * 0.5, 0.15, 0.7);
            this.skids.add(key, wx, car.trackY + 0.02, wz, ch, -sh, 0.15, a);
            if (Math.random() < U.clamp((w.slip - 1.1) * 0.8, 0, 0.9)) {
              this.smoke.emit(wx, car.trackY + 0.3, wz, car.vx * 0.25 + (Math.random() - 0.5), 0.6 + Math.random() * 0.5, car.vz * 0.25 + (Math.random() - 0.5), 1.0, 1.6 + Math.random(), 0.45, 2.4);
            }
          } else this.skids.cut(key);
          if (!onPaved && v > 6 && Math.random() < 0.6) {
            const gravel = w.surf === 'gravel';
            (gravel ? this.dust : this.smoke).emit(wx, car.trackY + 0.2, wz, car.vx * 0.3, 0.8 + Math.random(), car.vz * 0.3, gravel ? 1.2 : 0.7, 1.2, gravel ? 0.5 : 0.2, 2.5, gravel ? 1 : 0.6, gravel ? 1 : 0.9, gravel ? 1 : 0.6);
          }
        });
        // 壁にこすった火花
        if (car.scrape > 0.2 && car.impactPos) {
          for (let k = 0; k < 4; k++)
            this.sparks.emit(car.impactPos.x, car.trackY + 0.3, car.impactPos.z, car.vx * 0.6 + (Math.random() - 0.5) * 6, Math.random() * 4, car.vz * 0.6 + (Math.random() - 0.5) * 6, 0.12, 0.35, 1);
        }
        // 底をこする火花(速くて路面が凹んでいるところ)
        if (v > 55 && car.track.kv[car.ti] > 0.0015 && Math.random() < 0.6) {
          const bx = car.x - sh * 1.2, bz = car.z - ch * 1.2;
          for (let k = 0; k < 3; k++)
            this.sparks.emit(bx + (Math.random() - 0.5), car.trackY + 0.05, bz + (Math.random() - 0.5), car.vx * 0.85 + (Math.random() - 0.5) * 3, Math.random() * 2, car.vz * 0.85 + (Math.random() - 0.5) * 3, 0.1, 0.25, 1);
        }
        // アフターファイア
        if (car.backfire > 0) {
          car.backfire -= dt;
          const m = models[ci];
          if (m) {
            for (const ep of m.userData.exhausts) {
              const p = ep.clone();
              m.userData.body.localToWorld(p);
              for (let k = 0; k < 3; k++)
                this.flames.emit(p.x - sh * k * 0.12, p.y, p.z - ch * k * 0.12, car.vx * 0.9 - sh * 4, 0, car.vz * 0.9 - ch * 4, 0.35 - k * 0.07, 0.07, 1, -2, 1, 0.8 + Math.random() * 0.2, 0.6 + Math.random() * 0.4);
            }
          }
        }
      });
      this.smoke.update(dt, -0.4, 1.2);
      this.dust.update(dt, 1.5, 1.4);
      this.sparks.update(dt, 9.8, 0.6);
      this.flames.update(dt, 0, 0.5);
    }
  }
  RG.Effects = Effects;
})();
