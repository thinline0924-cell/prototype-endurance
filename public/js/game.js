// ゲーム全体の流れ:メニュー → 読み込み → スタート → レース → 結果
(function () {
  'use strict';
  const RG = (window.RG = window.RG || {});
  const U = RG.U;
  const X = RG.X;
  const $ = (id) => document.getElementById(id);

  const TOD = {
    day: { elev: 42, azim: 135, turb: 5, ray: 1.1, mie: 0.004, sun: 0xfff3e0, sunI: 3.0, hemi: [0xbcd4ff, 0x4a5a3a, 0.55], env: 0.85, exp: 0.62, fog: 0x9fb6cc, fogD: 0.00011, bloom: 0.22 },
    dusk: { elev: 3.5, azim: 255, turb: 9, ray: 2.6, mie: 0.006, sun: 0xffa060, sunI: 2.2, hemi: [0x8a7aa0, 0x3a2a20, 0.45], env: 0.6, exp: 0.8, fog: 0xc79478, fogD: 0.00016, bloom: 0.45 },
    night: { elev: -12, azim: 200, turb: 2, ray: 0.4, mie: 0.002, sun: 0x9fb4ff, sunI: 0.22, hemi: [0x223050, 0x080808, 0.18], env: 0.12, exp: 1.0, fog: 0x070b14, fogD: 0.00035, bloom: 0.9 },
  };
  const CAMERAS = ['追従(遠)', '追従(近)', 'コクピット', 'ノーズ', 'TVカメラ'];
  const DIFF = { easy: [0.84, 0.89], normal: [0.9, 0.94], hard: [0.95, 0.98], pro: [0.985, 1.01] };

  const Game = (RG.Game = {
    settings: {
      car: 'tr010', track: 'fuji', mode: 'race', laps: 3, opponents: 7, diff: 'normal', tod: 'day',
      auto: true, tcs: 2, abs: true, steer: true, quality: 'high',
    },

    boot() {
      this.loadSettings();
      const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      $('view').appendChild(renderer.domElement);
      RG.TX.setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
      this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 30000);
      this.mirrorCam = new THREE.PerspectiveCamera(50, 3.2, 0.5, 3000);
      this.input = new RG.Input();
      this.hud = new RG.HUD($('hud'));
      this.clock = new THREE.Clock();
      window.addEventListener('resize', () => this.resize());
      this.buildMenu();
      this.buildShowroom();
      this.resize();
      this.phase = 'menu';
      RG.booted = true;
      $('boot').classList.add('hidden');
      renderer.setAnimationLoop(() => this.frame());
    },

    loadSettings() {
      try {
        const s = JSON.parse(localStorage.getItem('rg.settings') || 'null');
        if (s) Object.assign(this.settings, s);
      } catch (e) { /* 保存できない環境 */ }
    },
    saveSettings() {
      try { localStorage.setItem('rg.settings', JSON.stringify(this.settings)); } catch (e) { /* 無視 */ }
    },

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      const q = this.settings.quality;
      const pr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 1.5 : q === 'medium' ? 1.15 : 0.9);
      this.renderer.setPixelRatio(pr);
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      if (this.composer) {
        this.composer.setPixelRatio(pr);
        this.composer.setSize(w, h);
      }
      this.hud.resize();
    },

    // ================= メニュー =================
    buildMenu() {
      const S = this.settings;
      const carList = $('carList');
      carList.innerHTML = '';
      for (const c of RG.CARS) {
        const el = document.createElement('button');
        el.className = 'card car-card';
        el.dataset.id = c.id;
        el.innerHTML = `<div class="swatch" style="background:linear-gradient(135deg, ${c.livery.base} 0 55%, ${c.livery.a} 55% 80%, ${c.livery.b} 80%)"></div>
          <div class="card-body"><div class="card-title">${c.jp}</div><div class="card-motif">${c.motif}</div><div class="card-spec">${c.spec}</div></div>`;
        el.onclick = () => { S.car = c.id; this.refreshMenu(); this.showroomCar(); RG.audio.init(); RG.audio.revDemo(c); };
        carList.appendChild(el);
      }
      const trackList = $('trackList');
      trackList.innerHTML = '';
      for (const t of RG.TRACKS) {
        const el = document.createElement('button');
        el.className = 'card track-card';
        el.dataset.id = t.id;
        const cv = document.createElement('canvas');
        cv.width = 120; cv.height = 90;
        drawOutline(cv, t);
        el.appendChild(cv);
        const body = document.createElement('div');
        body.className = 'card-body';
        body.innerHTML = `<div class="card-title">${t.name}</div><div class="card-motif">${t.motif}</div><div class="card-spec">${(t.length / 1000).toFixed(3)} km</div>`;
        el.appendChild(body);
        el.onclick = () => { S.track = t.id; this.refreshMenu(); };
        trackList.appendChild(el);
      }
      const bindSeg = (id, key, conv = (v) => v) => {
        for (const b of $(id).querySelectorAll('button')) {
          b.onclick = () => { S[key] = conv(b.dataset.v); this.refreshMenu(); };
        }
      };
      bindSeg('optMode', 'mode');
      bindSeg('optLaps', 'laps', Number);
      bindSeg('optOpp', 'opponents', Number);
      bindSeg('optDiff', 'diff');
      bindSeg('optTod', 'tod');
      bindSeg('optAuto', 'auto', (v) => v === '1');
      bindSeg('optTcs', 'tcs', Number);
      bindSeg('optAbs', 'abs', (v) => v === '1');
      bindSeg('optSteer', 'steer', (v) => v === '1');
      bindSeg('optQuality', 'quality');
      $('startBtn').onclick = () => { RG.audio.init(); this.startRace(); };
      $('resumeBtn').onclick = () => this.setPause(false);
      $('restartBtn').onclick = () => { this.setPause(false); this.startRace(); };
      $('quitBtn').onclick = () => this.toMenu();
      $('resultsMenuBtn').onclick = () => this.toMenu();
      $('resultsRetryBtn').onclick = () => this.startRace();
      $('helpBtn').onclick = () => $('help').classList.toggle('hidden');
      $('helpClose').onclick = () => $('help').classList.add('hidden');
      this.refreshMenu();
    },

    refreshMenu() {
      const S = this.settings;
      for (const el of document.querySelectorAll('.car-card')) el.classList.toggle('on', el.dataset.id === S.car);
      for (const el of document.querySelectorAll('.track-card')) el.classList.toggle('on', el.dataset.id === S.track);
      const segVal = { optMode: S.mode, optLaps: S.laps, optOpp: S.opponents, optDiff: S.diff, optTod: S.tod, optAuto: S.auto ? '1' : '0', optTcs: S.tcs, optAbs: S.abs ? '1' : '0', optSteer: S.steer ? '1' : '0', optQuality: S.quality };
      for (const [id, v] of Object.entries(segVal))
        for (const b of $(id).querySelectorAll('button')) b.classList.toggle('on', String(b.dataset.v) === String(v));
      const car = RG.CARS.find((c) => c.id === S.car);
      const tr = RG.TRACKS.find((t) => t.id === S.track);
      $('carInfo').innerHTML = `<h3>${car.name}</h3><p class="motif">モチーフ:${car.motif}</p><p>${car.desc}</p><p class="spec">${car.spec}</p>`;
      $('trackInfo').innerHTML = `<h3>${tr.name}</h3><p class="motif">モチーフ:${tr.motif}</p><p>${tr.desc}</p>`;
      const best = this.loadBest(S.track, S.car);
      $('bestInfo').textContent = best ? `この組み合わせのベストラップ:${U.formatTime(best.time)}` : 'この組み合わせのベストラップ:まだありません';
      document.body.classList.toggle('mode-ta', S.mode === 'ta');
      this.saveSettings();
    },

    // ---- メニュー背景のショールーム ----
    buildShowroom() {
      const scene = (this.showScene = new THREE.Scene());
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      scene.environment = pmrem.fromScene(new X.RoomEnvironment(), 0.04).texture;
      scene.background = new THREE.Color(0x0b0d12);
      scene.fog = new THREE.Fog(0x0b0d12, 12, 40);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.35, metalness: 0.3 }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);
      const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.28, 96), new THREE.MeshBasicMaterial({ color: 0xffd200 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.005;
      scene.add(ring);
      const key = new THREE.SpotLight(0xffffff, 400, 30, 0.6, 0.5, 1.6);
      key.position.set(4, 8, 5);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      scene.add(key);
      const rim = new THREE.SpotLight(0x9fc4ff, 250, 30, 0.7, 0.6, 1.6);
      rim.position.set(-6, 5, -5);
      scene.add(rim);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.6));
      this.showCam = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
      this.showroomCar();
    },
    showroomCar() {
      const S = this.settings;
      if (this.showModel) this.showScene.remove(this.showModel);
      const spec = RG.CARS.find((c) => c.id === S.car);
      this.showModel = RG.buildCarModel(spec, spec.livery, spec.livery.num, { lod: 1.5 });
      this.showModel.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.showScene.add(this.showModel);
    },
    renderShowroom(dt) {
      const t = performance.now() / 1000;
      const m = this.showModel;
      if (m) m.rotation.y = t * 0.25;
      const w = window.innerWidth, h = window.innerHeight;
      const cam = this.showCam;
      cam.aspect = w / h;
      // 画面の左寄りに車が来るように
      cam.setViewOffset(w, h, w > 900 ? w * 0.2 : 0, w > 900 ? h * 0.16 : h * 0.12, w, h);
      cam.position.set(Math.sin(0.6) * 12.5, 3.4, Math.cos(0.6) * 12.5);
      cam.lookAt(0, 0.45, 0);
      cam.updateProjectionMatrix();
      const r = this.renderer;
      r.toneMappingExposure = 1.0;
      r.shadowMap.autoUpdate = true;
      r.render(this.showScene, cam);
      void dt;
    },

    // ================= レースの準備 =================
    async startRace() {
      const S = this.settings;
      this.saveSettings();
      this.phase = 'loading';
      $('menu').classList.add('hidden');
      $('results').classList.add('hidden');
      $('pause').classList.add('hidden');
      $('loading').classList.remove('hidden');
      const step = async (text) => {
        $('loadingText').textContent = text;
        await new Promise((r) => setTimeout(r, 30));
      };
      try {
        this.disposeRace();
        const def = RG.TRACKS.find((t) => t.id === S.track);
        await step('コースの形を計算しています…');
        this.trackCache = this.trackCache || {};
        const T = (this.track = this.trackCache[def.id] || (this.trackCache[def.id] = RG.buildTrack(def, THREE)));
        await step('景色を作っています…(地形・木・建物)');
        const scene = (this.scene = new THREE.Scene());
        const world = (this.world = RG.buildWorld(T, { quality: S.quality, tod: S.tod }));
        scene.add(world.group);
        await step('空と光を設定しています…');
        this.setupSky(S.tod, T);
        await step('マシンを並べています…');
        this.setupCars(S, T);
        this.effects = new RG.Effects(scene, S.quality);
        this.effects.setLight(new THREE.Color(S.tod === 'night' ? 0x303848 : S.tod === 'dusk' ? 0xb09080 : 0xd8d8d8));
        this.setupPost(S);
        this.setupRaceState(S, T);
        RG.audio.startRace(this.player, this.cars.filter((c) => c !== this.player));
        this.player.onShift = () => RG.audio.burst('shift');
        await step('準備完了');
        $('loading').classList.add('hidden');
        $('hud').classList.remove('hidden');
        this.resize();
        this.phase = 'race';
        this.clock.getDelta();
      } catch (e) {
        console.error(e);
        $('loadingText').textContent = '準備中にエラーが起きました:' + e.message + '(ページを再読み込みしてください)';
      }
    },

    disposeRace() {
      RG.audio.stopRace();
      if (this.scene) {
        this.scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of ms) {
              for (const k of ['map', 'normalMap', 'alphaMap']) if (m[k] && m[k].dispose) m[k].dispose();
              m.dispose();
            }
          }
        });
      }
      if (this.envRT) this.envRT.dispose();
      this.scene = null;
      this.composer = null;
    },

    setupSky(tod, T) {
      const C = TOD[tod];
      const scene = this.scene;
      const sky = new X.Sky();
      sky.scale.setScalar(20000);
      const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - C.elev), THREE.MathUtils.degToRad(C.azim));
      const u = sky.material.uniforms;
      u.turbidity.value = C.turb;
      u.rayleigh.value = C.ray;
      u.mieCoefficient.value = C.mie;
      u.mieDirectionalG.value = 0.82;
      u.sunPosition.value.copy(sun);
      scene.add(sky);
      this.sky = sky;
      // 反射用の環境(空を丸ごと写す)
      const envScene = new THREE.Scene();
      const sky2 = new X.Sky();
      sky2.scale.setScalar(40);
      Object.keys(u).forEach((k) => { if (sky2.material.uniforms[k]) sky2.material.uniforms[k].value = u[k].value; });
      envScene.add(sky2);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: tod === 'night' ? 0x020304 : 0x3b4433 }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -2;
      envScene.add(ground);
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envRT = pmrem.fromScene(envScene, 0.02, 0.1, 200);
      scene.environment = this.envRT.texture;
      scene.environmentIntensity = C.env;
      pmrem.dispose();
      if (tod === 'night') {
        scene.background = new THREE.Color(0x03050a);
        sky.visible = false;
        scene.add(makeStars());
      }
      // 太陽(影を落とす光)
      const light = (this.sun = new THREE.DirectionalLight(C.sun, C.sunI));
      const sd = tod === 'night' ? new THREE.Vector3(0.3, 0.8, 0.2).normalize() : sun.clone();
      if (sd.y < 0.08) sd.y = 0.08;
      this.sunDir = sd.normalize();
      light.castShadow = this.settings.quality !== 'low';
      const ms = this.settings.quality === 'high' ? 2048 : 1024;
      light.shadow.mapSize.set(ms, ms);
      const sc = light.shadow.camera;
      sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
      sc.near = 1; sc.far = 900;
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = 0.03;
      scene.add(light, light.target);
      const hemi = new THREE.HemisphereLight(C.hemi[0], C.hemi[1], C.hemi[2]);
      scene.add(hemi);
      scene.fog = new THREE.FogExp2(C.fog, C.fogD);
      this.renderer.toneMappingExposure = C.exp;
      this.tod = tod;
      // 夜はコース脇の照明が光る
      this.scene.traverse((o) => {
        if (o.isMesh && o.material && o.material.emissive && o.material.color && o.material.color.getHex() === 0xfff4d6) {
          o.material.emissiveIntensity = tod === 'night' ? 4 : tod === 'dusk' ? 1.5 : 0;
        }
      });
      void T;
    },

    setupPost(S) {
      const r = this.renderer;
      if (S.quality === 'low') {
        this.composer = null;
        return;
      }
      const size = r.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: S.quality === 'high' ? 4 : 2 });
      const comp = (this.composer = new X.EffectComposer(r, rt));
      comp.addPass(new X.RenderPass(this.scene, this.camera));
      const C = TOD[S.tod];
      this.bloom = new X.UnrealBloomPass(new THREE.Vector2(size.x, size.y), C.bloom, 0.55, 0.92);
      comp.addPass(this.bloom);
      comp.addPass(new X.OutputPass());
    },

    setupCars(S, T) {
      const spec = RG.CARS.find((c) => c.id === S.car);
      const rnd = U.rng((Date.now() & 0xffff) + 1);
      const cars = (this.cars = []);
      const models = (this.models = []);
      const n = S.mode === 'race' ? S.opponents + 1 : 1;
      const playerSlot = S.mode === 'race' ? Math.min(n - 1, Math.floor(n / 2)) : 0;
      const names = RG.DRIVERS.slice().sort(() => rnd() - 0.5);
      const [skMin, skMax] = DIFF[S.diff];
      this.drivers = [];
      for (let k = 0; k < n; k++) {
        const isPlayer = k === playerSlot;
        let cs = spec, livery = spec.livery, number = spec.livery.num;
        if (!isPlayer) {
          cs = RG.CARS[Math.floor(rnd() * RG.CARS.length)];
          const lv = RG.AI_LIVERIES[k % RG.AI_LIVERIES.length];
          livery = Object.assign({}, lv);
          number = String(2 + ((k * 7) % 97));
          if (number === spec.livery.num) number = '99';
        }
        const car = new RG.Car(cs, T, {
          ai: !isPlayer, name: isPlayer ? 'YOU' : names[k % names.length], livery, number,
          assist: isPlayer ? { auto: S.auto, tcs: S.tcs, abs: S.abs, steer: S.steer } : { auto: true, tcs: 2, abs: true, steer: false },
        });
        // グリッド(2列、9m 間隔)。タイムアタックはコースの手前から
        if (S.mode === 'race') {
          const s = T.len - 12 - k * 9;
          car.placeAt(s, k % 2 === 0 ? 2.8 : -2.8, 0);
          car.gridHold = true;
        } else {
          car.placeAt(T.len - 160, T.line[T.indexAt(T.len - 160)], 0);
        }
        car.laps = 0;
        car.prevS = car.s;
        car.cp = 0;
        car.bestLap = null;
        car.lastLap = null;
        car.finished = false;
        car.lapStart = null;
        cars.push(car);
        const model = RG.buildCarModel(cs, livery, number, { lod: isPlayer ? 1.2 : 0.7 });
        this.scene.add(model);
        models.push(model);
        if (isPlayer) this.player = car;
        else {
          const skill = U.lerp(skMin, skMax, rnd());
          this.drivers.push(new RG.AIDriver(car, T, skill, rnd));
        }
      }
      // 夜とたそがれ:自分の車のヘッドライト(本物の光)と、全車の光のにじみ
      const tod = S.tod;
      if (tod !== 'day') {
        const pm = models[cars.indexOf(this.player)];
        const L = this.player.spec.wheelbase * (1 - this.player.spec.weightFront);
        for (const sx of [0.6, -0.6]) {
          const sl = new THREE.SpotLight(0xfff2dd, tod === 'night' ? 260 : 90, 260, 0.36, 0.5, 1.15);
          sl.position.set(sx * 0.9, 0.62, L + 1.2);
          sl.target.position.set(sx * 0.3, 0, L + 40);
          pm.userData.body.add(sl, sl.target);
        }
        const flare = RG.TX.softDot();
        for (const m of models) {
          if (m === pm) continue; // 自分の車の光のにじみは見せない
          for (const sx of [0.62, -0.62]) {
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flare, color: 0xfff0d0, blending: THREE.AdditiveBlending, depthWrite: false, opacity: tod === 'night' ? 0.9 : 0.5 }));
            const spec2 = cars[models.indexOf(m)].spec;
            sp.position.set(sx, 0.52, spec2.wheelbase * (1 - spec2.weightFront) + 0.75);
            sp.scale.set(1.3, 1.3, 1);
            m.userData.body.add(sp);
          }
        }
      }
      // ゴースト(タイムアタック)
      this.ghostModel = null;
      if (S.mode === 'ta') {
        const gm = RG.buildCarModel(spec, { base: '#b28cff', a: '#7a4dff', b: '#ffffff' }, spec.livery.num, { lod: 0.6 });
        gm.traverse((o) => {
          if (o.isMesh) {
            o.material = o.material.clone();
            o.material.transparent = true;
            o.material.opacity = 0.32;
            o.material.depthWrite = false;
            o.castShadow = false;
          }
        });
        gm.visible = false;
        this.scene.add(gm);
        this.ghostModel = gm;
      }
    },

    setupRaceState(S, T) {
      this.race = {
        mode: S.mode, t: 0, phase: S.mode === 'race' ? 'grid' : 'go', countT: 0, goAt: 5 + 0.6 + Math.random() * 1.2,
        totalLaps: S.laps, finishOrder: [], finishedAt: null, lights: S.mode === 'race' ? 0 : null,
      };
      this.cameraMode = 0;
      this.camState = null;
      this.cooldown = null;
      this.lookBack = false;
      this.showMirror = S.quality !== 'low';
      this.showHud = true;
      this.ghostOn = true;
      this.wrongT = 0;
      const best = this.loadBest(S.track, S.car);
      this.best = best;
      this.ghostRec = [];
      this.trace = new Float32Array(Math.ceil(T.len / 10) + 2).fill(NaN);
      if (best && best.trace) best.trace.forEach((v, k) => { if (k < this.trace.length && v != null) this.trace[k] = v; });
      this.lapsTA = [];
      if (S.mode === 'ta') this.hud.message('TIME ATTACK', 2.5, '#ffd200', 'スタートラインを越えると計測開始');
      else this.hud.message(T.def.name, 3, '#fff', `${S.laps}周 / ${this.cars.length}台`);
      $('mirror').classList.toggle('hidden', !this.showMirror);
    },

    // ================= 毎フレーム =================
    frame() {
      const dt = Math.min(0.05, this.clock.getDelta());
      if (this.phase === 'menu') {
        this.renderShowroom(dt);
        this.input.endFrame();
        return;
      }
      if (this.phase === 'loading' || !this.scene) {
        this.input.endFrame();
        return;
      }
      const inp = this.input;
      if (inp.hit('pause') && (this.phase === 'race' || this.phase === 'paused')) this.setPause(this.phase !== 'paused');
      if (this.phase === 'paused') {
        inp.endFrame();
        return;
      }
      if (this.phase === 'race' || this.phase === 'results') this.update(dt);
      this.render(dt);
      inp.endFrame();
    },

    update(dt) {
      const R = this.race;
      const T = this.track;
      const P = this.player;
      const inp = this.input;
      R.t += dt;
      // ---- キー操作(切り替え)----
      if (inp.hit('camera')) {
        this.cameraMode = (this.cameraMode + 1) % CAMERAS.length;
        this.camState = null;
        this.hud.message(CAMERAS[this.cameraMode], 0.8, '#fff');
      }
      this.lookBack = inp.is('look');
      if (inp.hit('auto')) { P.assist.auto = !P.assist.auto; this.hud.message(P.assist.auto ? 'オートマ' : 'マニュアル(E / Q で変速)', 1.2); }
      if (inp.hit('tcs')) { P.assist.tcs = (P.assist.tcs + 1) % 4; this.hud.message('トラクションコントロール ' + (P.assist.tcs || 'OFF'), 1.2); }
      if (inp.hit('abs')) { P.assist.abs = !P.assist.abs; this.hud.message('ABS ' + (P.assist.abs ? 'ON' : 'OFF'), 1.2); }
      if (inp.hit('biasF')) P.brakeBias = U.clamp(P.brakeBias + 0.005, 0.45, 0.75);
      if (inp.hit('biasR')) P.brakeBias = U.clamp(P.brakeBias - 0.005, 0.45, 0.75);
      if (inp.hit('lights')) this.lightsForced = !this.lightsForced;
      if (inp.hit('ghost')) { this.ghostOn = !this.ghostOn; this.hud.message('ゴースト ' + (this.ghostOn ? 'ON' : 'OFF'), 1); }
      if (inp.hit('mirror')) { this.showMirror = !this.showMirror; $('mirror').classList.toggle('hidden', !this.showMirror); }
      if (inp.hit('hud')) this.showHud = !this.showHud;
      if (inp.hit('reset') && R.phase !== 'grid') {
        P.resetToTrack();
        this.hud.message('コースに戻しました', 1);
        this.lapInvalid = true;
      }

      // ---- スタート前の信号 ----
      if (R.phase === 'grid') {
        R.countT += dt;
        const lit = Math.min(5, Math.floor(R.countT));
        if (lit !== R.lights && lit > 0) RG.audio.burst('beep', 1);
        R.lights = lit;
        if (R.countT >= R.goAt) {
          R.phase = 'go';
          R.lights = -1;
          R.goTime = R.t;
          RG.audio.burst('beep', 2);
          for (const c of this.cars) c.gridHold = false;
          this.hud.message('GO!', 1.2, '#22ff66');
        }
      } else if (R.lights === -1 && R.t - R.goTime > 2) R.lights = null;

      // ---- 入力と AI ----
      inp.apply(P);
      if (P.finished) {
        // ゴール後は AI がクールダウン走行
        if (!this.cooldown) {
          this.cooldown = new RG.AIDriver(P, T, 0.72);
          P.isAI = true;
        }
        this.cooldown.update(dt, this.cars, true);
      }
      const racing = R.phase !== 'grid';
      for (const d of this.drivers) d.update(dt, this.cars, racing);
      // ---- スリップストリーム ----
      for (const c of this.cars) {
        let best = 0;
        for (const o of this.cars) {
          if (o === c) continue;
          let gap = o.s - c.s;
          if (gap < 0) gap += T.len;
          if (gap > 0 && gap < 45 && Math.abs(o.lat - c.lat) < 1.8) best = Math.max(best, 1 - gap / 45);
        }
        c.drafting = c.speed > 30 ? best : 0;
      }
      // ---- 物理 ----
      for (const c of this.cars) {
        const prevImpact = c.impact;
        c.update(dt, R.t);
        if (c === P && c.impact > 3 && prevImpact < 3) {
          RG.audio.burst('hit', c.impact);
          this.shake = Math.min(1, c.impact / 15);
        }
      }
      this.collideCars();
      // ---- 周回 ----
      for (const c of this.cars) this.lapLogic(c, R, T);
      this.updateGhost(R, T);
      // 逆走
      const vt = P.vx * T.tx[P.ti] + P.vz * T.tz[P.ti];
      this.wrongT = vt < -4 ? this.wrongT + dt : 0;
      // 結果
      if (R.mode === 'race' && P.finished && this.phase === 'race') {
        R.resultT = (R.resultT || 0) + dt;
        if (R.resultT > 4) this.showResults();
      }
    },

    // 車どうしの接触(前・中・後ろの3つの円で近似)
    collideCars() {
      const cars = this.cars;
      const circles = (c) => {
        const sh = Math.sin(c.h), ch = Math.cos(c.h);
        return [1.55, 0, -1.55].map((o) => ({ x: c.x + sh * o, z: c.z + ch * o, ox: sh * o, oz: ch * o }));
      };
      for (let i = 0; i < cars.length; i++)
        for (let j = i + 1; j < cars.length; j++) {
          const A = cars[i], B = cars[j];
          if ((A.x - B.x) ** 2 + (A.z - B.z) ** 2 > 49) continue;
          const ca = circles(A), cb = circles(B);
          const r = 1.0;
          for (const p of ca)
            for (const q of cb) {
              const dx = q.x - p.x, dz = q.z - p.z;
              const d = Math.hypot(dx, dz);
              if (d >= 2 * r || d < 1e-4) continue;
              const nx = dx / d, nz = dz / d;
              const pen = 2 * r - d;
              A.x -= nx * pen * 0.5; A.z -= nz * pen * 0.5;
              B.x += nx * pen * 0.5; B.z += nz * pen * 0.5;
              // 接点の速度
              const va = { x: A.vx + A.r * p.oz, z: A.vz - A.r * p.ox };
              const vb = { x: B.vx + B.r * q.oz, z: B.vz - B.r * q.ox };
              const vn = (vb.x - va.x) * nx + (vb.z - va.z) * nz;
              if (vn >= 0) continue;
              const ma = A.spec.mass, mb = B.spec.mass;
              const ra = p.oz * nx - p.ox * nz, rb = q.oz * nx - q.ox * nz;
              const jn = (-(1.25) * vn) / (1 / ma + 1 / mb + (ra * ra) / A.spec.Iz + (rb * rb) / B.spec.Iz);
              A.vx -= (jn * nx) / ma; A.vz -= (jn * nz) / ma;
              B.vx += (jn * nx) / mb; B.vz += (jn * nz) / mb;
              A.r -= (ra * jn) / A.spec.Iz;
              B.r += (rb * jn) / B.spec.Iz;
              const imp = jn / Math.min(ma, mb);
              if ((A === this.player || B === this.player) && imp > 1.5) {
                RG.audio.burst('hit', imp);
                this.shake = Math.min(1, imp / 10);
              }
            }
        }
    },

    lapLogic(c, R, T) {
      const L = T.len;
      const now = R.t;
      c.cp |= 1 << Math.min(7, Math.floor((c.s / L) * 8));
      if (c.prevS > L * 0.75 && c.s < L * 0.25) {
        // 何周目かを数える
        c.laps++;
        const isP = c === this.player;
        if (c.lapStart != null) {
          const lt = now - c.lapStart;
          const valid = c.cp === 0xff && !(isP && this.lapInvalid);
          c.lastLap = lt;
          if (valid && (c.bestLap == null || lt < c.bestLap)) c.bestLap = lt;
          if (isP) this.onPlayerLap(lt, valid, R, T);
        }
        c.lapStart = now;
        c.cp = 1;
        if (c === this.player) {
          this.lapInvalid = false;
          this.ghostRec = [];
          this.curTrace = new Float32Array(this.trace.length).fill(NaN);
        }
        if (R.mode === 'race' && c.laps > R.totalLaps && !c.finished) {
          c.finished = true;
          c.finishTime = now - (R.goTime || 0);
          R.finishOrder.push(c);
          if (c === this.player) {
            const pos = R.finishOrder.length;
            this.hud.message(pos === 1 ? 'WINNER!' : `FINISH  P${pos}`, 4, pos === 1 ? '#ffd200' : '#fff', `ベストラップ ${U.formatTime(c.bestLap)}`);
          }
        } else if (c === this.player && R.mode === 'race' && c.laps === R.totalLaps && R.totalLaps > 1) {
          this.hud.message('FINAL LAP', 2, '#ffd200');
        }
      } else if (c.prevS < L * 0.25 && c.s > L * 0.75 && c.laps > 0) {
        c.laps--;
      }
      c.prevS = c.s;
      c.progress = c.finished ? 1e9 - R.finishOrder.indexOf(c) : (c.laps - 1) * L + c.s;
      // 自分の区間タイム(デルタ用)
      if (c === this.player && c.lapStart != null && this.curTrace) {
        const b = Math.floor(c.s / 10);
        if (isNaN(this.curTrace[b])) this.curTrace[b] = now - c.lapStart;
      }
    },

    onPlayerLap(lt, valid, R, T) {
      const S = this.settings;
      const prev = this.best ? this.best.time : null;
      if (R.mode === 'ta') this.lapsTA.push({ t: lt, valid });
      if (valid && (prev == null || lt < prev)) {
        this.best = { time: lt, trace: Array.from(this.curTrace || []), ghost: this.ghostRec.slice() };
        this.trace = Float32Array.from(this.best.trace);
        this.saveBest(S.track, S.car, this.best);
        this.hud.message(U.formatTime(lt), 3, '#c99cff', prev == null ? 'ベストラップ記録!' : `自己ベスト更新! (${U.formatDelta(lt - prev)})`);
      } else {
        this.hud.message(U.formatTime(lt), 2.5, valid ? '#fff' : '#ff6b6b', valid ? (prev != null ? U.formatDelta(lt - prev) : '') : '無効ラップ(コースに戻した・ショートカット)');
      }
      void T;
    },

    // ゴースト(ベストラップの走りを再生)
    updateGhost(R, T) {
      const P = this.player;
      if (P.lapStart != null) {
        const t = R.t - P.lapStart;
        const last = this.ghostRec[this.ghostRec.length - 1];
        if (!last || t - last[0] >= 0.05) this.ghostRec.push([+t.toFixed(3), +P.x.toFixed(2), +P.y.toFixed(2), +P.z.toFixed(2), +P.h.toFixed(4)]);
      }
      const gm = this.ghostModel;
      if (!gm) return;
      const G = this.best && this.best.ghost;
      if (!G || !G.length || P.lapStart == null || !this.ghostOn) {
        gm.visible = false;
        this.ghostPos = null;
        return;
      }
      const t = R.t - P.lapStart;
      let lo = 0, hi = G.length - 1;
      if (t >= G[hi][0]) { gm.visible = false; return; }
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (G[m][0] <= t) lo = m;
        else hi = m;
      }
      const a = G[lo], b = G[hi];
      const f = U.clamp((t - a[0]) / Math.max(1e-3, b[0] - a[0]), 0, 1);
      const x = U.lerp(a[1], b[1], f), y = U.lerp(a[2], b[2], f), z = U.lerp(a[3], b[3], f);
      const h = a[4] + U.wrapAngle(b[4] - a[4]) * f;
      gm.visible = true;
      gm.position.set(x, y, z);
      gm.rotation.set(0, h, 0);
      this.ghostPos = { x, z };
      void T;
    },

    // ================= 描画 =================
    render(dt) {
      const P = this.player;
      const T = this.track;
      const r = this.renderer;
      const lightsOn = this.tod !== 'day' || this.lightsForced;
      this.cars.forEach((c, k) => RG.updateCarModel(this.models[k], c, { lightsOn }));
      this.updateCamera(dt);
      // 影の範囲を自分の車の周りに
      const tgt = new THREE.Vector3(P.x, P.y, P.z);
      const fwd = new THREE.Vector3(Math.sin(P.h), 0, Math.cos(P.h));
      tgt.addScaledVector(fwd, 25);
      this.sun.target.position.copy(tgt);
      this.sun.position.copy(tgt).addScaledVector(this.sunDir, 400);
      this.effects.update(dt, this.cars, this.models, this.camera);
      // 音
      const cam = this.camera;
      const cf = new THREE.Vector3();
      cam.getWorldDirection(cf);
      RG.audio.update(dt, P, { pos: cam.position, fwd: cf, cockpit: this.cameraMode === 2 || this.cameraMode === 3 }, this.cars);
      // ヘルメットはコクピット視点では隠す
      const pm = this.models[this.cars.indexOf(P)];
      for (const m of pm.userData.helmet || []) m.visible = this.cameraMode !== 2;
      r.toneMappingExposure = TOD[this.tod].exp;
      r.shadowMap.autoUpdate = false;
      r.shadowMap.needsUpdate = true;
      if (this.composer) this.composer.render(dt);
      else r.render(this.scene, cam);
      // バックミラー
      $('mirror').classList.toggle('hidden', !(this.showMirror && this.cameraMode !== 4));
      if (this.showMirror && this.cameraMode !== 4) {
        const w = window.innerWidth, h = window.innerHeight;
        const mw = Math.round(Math.min(420, w * 0.3)), mh = Math.round(mw / 3.6);
        const mx = Math.round(w / 2 - mw / 2), my = 14;
        const mc = this.mirrorCam;
        const b = new THREE.Vector3(P.x, P.y + 1.15, P.z).addScaledVector(fwd, -0.6);
        mc.position.copy(b);
        mc.lookAt(b.x - fwd.x * 10, b.y - 0.1, b.z - fwd.z * 10);
        mc.aspect = mw / mh;
        mc.updateProjectionMatrix();
        r.setScissorTest(true);
        r.setScissor(mx, h - my - mh, mw, mh);
        r.setViewport(mx, h - my - mh, mw, mh);
        const hide = pm.visible;
        pm.visible = false;
        r.render(this.scene, mc);
        pm.visible = hide;
        r.setScissorTest(false);
        r.setViewport(0, 0, w, h);
        const el = $('mirror');
        el.style.left = mx + 'px';
        el.style.top = my + 'px';
        el.style.width = mw + 'px';
        el.style.height = mh + 'px';
      }
      // HUD
      const R = this.race;
      const order = this.cars.slice().sort((a, b) => b.progress - a.progress);
      const leader = order[0];
      order.forEach((c, k) => {
        if (k === 0) return;
        const gap = (leader.progress - c.progress) / Math.max(20, leader.speed || 40);
        c.gapText = c.finished ? 'FIN' : gap > T.len / 60 ? '+' + Math.floor((leader.progress - c.progress) / T.len) + 'L' : '+' + gap.toFixed(1);
      });
      let delta = null;
      if (P.lapStart != null && this.trace && this.curTrace) {
        const b = Math.floor(P.s / 10);
        const bt = this.trace[b];
        if (!isNaN(bt) && !isNaN(this.curTrace[b])) delta = this.curTrace[b] - bt;
      }
      this.hud.draw({
        player: P, cars: this.cars, track: T, mode: R.mode, order, position: order.indexOf(P) + 1,
        lap: P.laps, totalLaps: R.totalLaps, lapTime: P.lapStart != null ? R.t - P.lapStart : null,
        lastLap: P.lastLap, bestLap: this.best ? this.best.time : P.bestLap, delta,
        lapValid: !this.lapInvalid, lights: R.lights, cameraMode: this.cameraMode, cameraName: CAMERAS[this.cameraMode],
        wrongWay: this.wrongT > 1.5, ghost: this.ghostModel && this.ghostModel.visible ? this.ghostPos : null,
        ghostOn: this.ghostOn && R.mode === 'ta', showHud: this.showHud,
      }, dt);
    },

    updateCamera(dt) {
      const P = this.player;
      const cam = this.camera;
      const mode = this.cameraMode;
      const fwd = new THREE.Vector3(Math.sin(P.h), 0, Math.cos(P.h));
      const pos = new THREE.Vector3(P.x, P.y, P.z);
      const v = P.speed;
      let fov = 60;
      this.shake = Math.max(0, (this.shake || 0) - dt * 2.5);
      const bump = (P.bump || 0) * 0.02 + this.shake * 0.12;
      const jitter = () => (Math.random() - 0.5) * bump;
      if (mode === 0 || mode === 1) {
        const dist = mode === 0 ? 6.8 : 4.9, hgt = mode === 0 ? 2.05 : 1.45;
        // 向きは少し遅れて追いかける
        if (!this.camState) this.camState = { h: P.h, p: pos.clone() };
        const cs = this.camState;
        const vh = v > 3 ? Math.atan2(P.vx, P.vz) : P.h;
        // 滑っているときは進行方向も少し見る
        const want = (P.localU || 0) < -1 ? P.h : P.h + U.wrapAngle(vh - P.h) * 0.35;
        cs.h += U.wrapAngle(want - cs.h) * Math.min(1, dt * 5.5);
        const back = this.lookBack ? -1 : 1;
        const cf = new THREE.Vector3(Math.sin(cs.h), 0, Math.cos(cs.h));
        const target = pos.clone().addScaledVector(cf, -dist * back);
        target.y += hgt;
        cs.p.lerp(target, 1 - Math.exp(-dt * 14));
        cam.position.copy(cs.p);
        cam.position.y = Math.max(cam.position.y, P.y + hgt * 0.8);
        cam.position.x += jitter();
        cam.position.y += jitter();
        const look = pos.clone().addScaledVector(cf, 4 * back);
        look.y += 0.75;
        cam.lookAt(look);
        fov = 58 + U.clamp(v * 0.09, 0, 14);
      } else if (mode === 2 || mode === 3) {
        const model = this.models[this.cars.indexOf(P)];
        const body = model.userData.body;
        model.updateMatrixWorld(true);
        const a = P.spec.wheelbase * (1 - P.spec.weightFront);
        const local = mode === 2 ? new THREE.Vector3(0.18, 0.93, a - 1.2) : new THREE.Vector3(0, 0.62, a + 0.45);
        // 頭が加速度で揺れる
        if (mode === 2) {
          local.z += U.clamp(-P.axF * 0.006, -0.06, 0.06);
          local.x += U.clamp(P.ayF * 0.004, -0.05, 0.05);
        }
        const wp = body.localToWorld(local.clone());
        cam.position.copy(wp);
        cam.position.y += jitter();
        const ahead = body.localToWorld(new THREE.Vector3(local.x * 0.7, local.y - 0.25, local.z + (this.lookBack ? -20 : 20)));
        cam.up.set(0, 1, 0);
        cam.lookAt(ahead);
        fov = mode === 2 ? 68 : 62;
      } else {
        // TV カメラ:コース脇の近いカメラから撮る
        const T = this.track;
        const spacing = 220;
        const idx = Math.floor((P.s + 60) / spacing);
        const s = idx * spacing + spacing * 0.6;
        const i = T.indexAt(s);
        const side = idx % 2 ? 1 : -1;
        const wall = side > 0 ? T.wallL[i] : T.wallR[i];
        cam.position.set(T.px[i] + T.nx[i] * side * (wall + 9), T.py[i] + 8.5, T.pz[i] + T.nz[i] * side * (wall + 9));
        cam.lookAt(P.x, P.y + 0.6, P.z);
        const d = cam.position.distanceTo(pos);
        fov = U.clamp(2 * Math.atan(9 / Math.max(d, 1)) * (180 / Math.PI), 6, 55);
      }
      if (Math.abs(cam.fov - fov) > 0.05) {
        cam.fov = U.damp(cam.fov, fov, 4, dt);
        cam.updateProjectionMatrix();
      }
    },

    // ================= ポーズ・結果・メニュー =================
    setPause(on) {
      this.phase = on ? 'paused' : 'race';
      $('pause').classList.toggle('hidden', !on);
      RG.audio.pause(on);
      if (!on) this.clock.getDelta();
    },

    showResults() {
      this.phase = 'results';
      const R = this.race;
      const order = this.cars.slice().sort((a, b) => b.progress - a.progress);
      const rows = order.map((c, k) => {
        const time = c.finished ? U.formatTime(c.finishTime) : '走行中';
        const gap = k === 0 ? '' : c.finished && order[0].finished ? '+' + (c.finishTime - order[0].finishTime).toFixed(3) : '';
        return `<tr class="${c === this.player ? 'me' : ''}"><td>${k + 1}</td><td>${c.name}</td><td>${c.spec.name}</td><td>${time}</td><td>${gap}</td><td>${U.formatTime(c.bestLap)}</td></tr>`;
      });
      $('resultsBody').innerHTML = `<table><thead><tr><th>順位</th><th>ドライバー</th><th>マシン</th><th>タイム</th><th>差</th><th>ベスト</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
      $('resultsTitle').textContent = `結果:${R.finishOrder.indexOf(this.player) + 1}位`;
      $('results').classList.remove('hidden');
    },

    toMenu() {
      this.disposeRace();
      this.phase = 'menu';
      $('pause').classList.add('hidden');
      $('results').classList.add('hidden');
      $('hud').classList.add('hidden');
      $('mirror').classList.add('hidden');
      $('menu').classList.remove('hidden');
      RG.audio.pause(false);
      this.hud.draw(null, 0);
      this.refreshMenu();
      this.resize();
    },

    // ---- ベストラップの保存 ----
    loadBest(track, car) {
      try {
        const s = localStorage.getItem(`rg.best.${track}.${car}`);
        return s ? JSON.parse(s) : null;
      } catch (e) {
        return null;
      }
    },
    saveBest(track, car, best) {
      try {
        const trace = best.trace.map((v) => (isNaN(v) ? null : +v.toFixed(3)));
        localStorage.setItem(`rg.best.${track}.${car}`, JSON.stringify({ time: best.time, trace, ghost: best.ghost }));
      } catch (e) { /* 容量オーバーなどは無視 */ }
    },
  });

  // コースの形の小さな絵(メニュー用)
  function drawOutline(cv, t) {
    const g = cv.getContext('2d');
    const xs = t.pts.map((p) => p[0]), ys = t.pts.map((p) => -p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const sc = Math.min((cv.width - 16) / (maxX - minX), (cv.height - 16) / (maxY - minY));
    const ox = (cv.width - (maxX - minX) * sc) / 2, oy = (cv.height - (maxY - minY) * sc) / 2;
    g.lineWidth = 3;
    g.lineJoin = 'round';
    g.strokeStyle = '#e8ecf1';
    g.beginPath();
    t.pts.forEach((p, k) => {
      const x = ox + (p[0] - minX) * sc, y = oy + (-p[1] - minY) * sc;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.closePath();
    g.stroke();
    g.fillStyle = '#ff3b3b';
    g.fillRect(ox + (t.pts[0][0] - minX) * sc - 3, oy + (-t.pts[0][1] - minY) * sc - 3, 6, 6);
  }

  function makeStars() {
    const n = 1500;
    const pos = new Float32Array(n * 3);
    const rnd = U.rng(5);
    for (let i = 0; i < n; i++) {
      const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 0.95);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * 15000;
      pos[i * 3 + 1] = Math.cos(ph) * 15000;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 15000;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false }));
  }
})();
