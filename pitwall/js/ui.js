'use strict';
// 画面の切りかえ・ボタン・レース中の表示。ゲームの流れもここ。

(function () {
  const PW = window.PW;
  const I = PW.ICON;
  const $ = (sel, root = document) => root.querySelector(sel);
  const ui = $('#ui');
  const SAVE_KEY = 'pw.save';

  // ---------- 保存(このブラウザの中) ----------
  function loadSave() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.v === 1 ? s : null; } catch (e) { return null; }
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) { /* 保存できなくても遊べる */ }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } }

  // ---------- 道具 ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtLap = (t) => { if (!t) return '—'; const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };
  const fmtClock = (t) => { t = Math.max(0, t); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = Math.floor(t) % 60; return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; };
  const man = (v) => `${Math.round(v).toLocaleString()}万円`;
  const pct = (v) => `${Math.round(v * 100)}%`;
  const barCls = (v) => v > 0.66 ? 'g' : v > 0.33 ? 'y' : 'r';
  const tireChip = (k) => `<span class="tchip" style="background:${PW.TIRES[k].color}">${PW.TIRES[k].short}</span>`;
  const carKey = (c) => c.isPlayer ? 'YOU' : c.short;

  // ---------- ゲームの状態 ----------
  const G = window.PW.G = {
    save: loadSave(),
    race: null,
    running: false,
    speed: 1,
    screen: 'boot',
    hudAt: 0,
    lastLogShown: -1,
    letterOpen: false,
    scoutId: null,
    showLog: false,
    resultShown: false,
  };
  let D = null; // 3Dの絵本

  // =====================================================================
  // タイトル
  function showTitle() {
    G.screen = 'title';
    G.race = null; G.running = false;
    D.setTrack(PW.TRACKS[(G.save && G.save.season.round < PW.TRACKS.length) ? G.save.season.round : 0], '#d0503f');
    D.setCamera('title');
    D.setWeather(0, 0.25, 0);
    ui.innerHTML = `
      <div class="title-logo">
        <div class="t-small">飛び出す絵本の耐久レース</div>
        <h1>PIT WALL</h1>
        <div class="t-sub">ピットウォール物語</div>
        <div class="t-small" style="margin-top:8px;letter-spacing:.12em">レースエンジニアになって、チームを勝たせよう</div>
      </div>
      <nav class="menubar">
        <button class="main" id="bNew">はじめから</button>
        <button id="bCont" ${G.save ? '' : 'disabled style="opacity:.35;cursor:default"'}>つづきから</button>
        <button id="bHelp">遊び方</button>
        <span class="spacer"></span>
        <span class="note">ドラッグで本を回す・ホイールで拡大</span>
      </nav>`;
    $('#bNew').onclick = () => {
      if (G.save && !confirm('いまのシーズンの記録は消えます。はじめからにしますか?')) return;
      showNew();
    };
    $('#bCont').onclick = () => { if (G.save) showGarage(); };
    $('#bHelp').onclick = showHelp;
  }

  // =====================================================================
  // チームを作る
  function showNew() {
    G.screen = 'new';
    const f = { name: 'チーム・ピットウォール', num: 7, colorIdx: 0, type: 'hybrid', difficulty: 'normal', length: 'normal' };
    D.setCamera('title');
    const render = () => {
      const typeCards = Object.entries(PW.CAR_TYPES).map(([k, t]) => `
        <button class="card ${f.type === k ? 'on' : ''}" data-type="${k}">
          <b>${t.name}</b><br>${t.desc}
          <div class="stat-bars">
            <span>速さ</span><div class="bar"><i style="width:${(t.perf - 50) * 3.3}%"></i></div>
            <span>壊れにくさ</span><div class="bar"><i style="width:${(t.rel - 40) * 1.6}%"></i></div>
            <span>燃費</span><div class="bar"><i style="width:${(1.25 - t.fuelEff) * 220}%"></i></div>
            <span>タイヤ</span><div class="bar"><i style="width:${(1.3 - t.tireEff) * 200}%"></i></div>
          </div>
        </button>`).join('');
      ui.innerHTML = `
        <div class="panel sheet left">
          <div class="panel-title">${I.book} チームをつくる</div>
          <div class="field"><span class="lbl">チームの名前</span><input class="input" id="tName" maxlength="16" value="${esc(f.name)}"></div>
          <div class="field"><span class="lbl">ゼッケン(車の番号)</span><input class="input" id="tNum" type="number" min="2" max="99" value="${f.num}" style="width:100px"></div>
          <div class="field"><span class="lbl">チームカラー</span><div class="row">${PW.TEAM_COLORS.map((c, i) => `<span class="swatch ${f.colorIdx === i ? 'on' : ''}" data-col="${i}" style="background:${c[0]}"><i style="background:${c[1]}"></i></span>`).join('')}</div></div>
          <div class="field"><span class="lbl">マシンの型</span><div class="cards">${typeCards}</div></div>
        </div>
        <div class="panel sheet right">
          <div class="panel-title">${I.flag} シーズンの設定</div>
          <div class="field"><span class="lbl">むずかしさ</span><div class="cards">
            ${Object.entries(PW.DIFFICULTY).map(([k, d]) => `<button class="card ${f.difficulty === k ? 'on' : ''}" data-diff="${k}"><b>${d.name}</b> — ${k === 'easy' ? 'ライバルが少し遅い' : k === 'hard' ? 'ライバルが速く、トラブルも多い' : 'ちょうどいい'}</button>`).join('')}
          </div></div>
          <div class="field"><span class="lbl">1レースの長さ(1倍速のとき)</span><div class="cards">
            ${Object.entries(PW.LENGTHS).map(([k, d]) => `<button class="card ${f.length === k ? 'on' : ''}" data-len="${k}"><b>${d}</b></button>`).join('')}
          </div></div>
          <div class="field"><span class="lbl">シーズンの流れ</span>
            <div class="lbl" style="line-height:1.8">全${PW.TRACKS.length}戦。${PW.TRACKS.map(t => t.name).join(' → ')}。<br>
            レースの賞金でマシンやピットクルーを強くして、チャンピオンを目指そう。<br>
            あなたはレースエンジニア。ハンドルは握らない。<b style="color:var(--gold-hi)">ピットのタイミング、タイヤ、燃料、ドライバー交代、トラブルへの指示</b>で勝負する。</div>
          </div>
        </div>
        <div class="footer-cta">
          <button class="btn" id="bBack">もどる</button>
          <button class="btn big" id="bGo">シーズン開始</button>
        </div>`;
      ui.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { keep(); f.type = b.dataset.type; render(); });
      ui.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => { keep(); f.difficulty = b.dataset.diff; render(); });
      ui.querySelectorAll('[data-len]').forEach(b => b.onclick = () => { keep(); f.length = b.dataset.len; render(); });
      ui.querySelectorAll('[data-col]').forEach(b => b.onclick = () => { keep(); f.colorIdx = +b.dataset.col; render(); });
      $('#bBack').onclick = showTitle;
      $('#bGo').onclick = () => {
        keep();
        const col = PW.TEAM_COLORS[f.colorIdx];
        G.save = {
          v: 1,
          team: {
            name: f.name.trim() || 'チーム・ピットウォール', num: Math.max(2, Math.min(99, f.num | 0)) || 7,
            color: col[0], color2: col[1], type: f.type,
            upg: { engine: 0, aero: 0, rel: 0, fuel: 0, crew: 0, driver: 0 },
            drivers: PW.DRIVERS.map(d => Object.assign({}, d)),
            budget: PW.START_BUDGET,
          },
          settings: { difficulty: f.difficulty, length: f.length },
          season: { round: 0, points: {}, history: [] },
        };
        // 他チームと番号がかぶらないように
        while (PW.RIVALS.some(r => r.num === G.save.team.num)) G.save.team.num++;
        writeSave();
        showGarage();
      };
    };
    const keep = () => { const n = $('#tName'), m = $('#tNum'); if (n) f.name = n.value; if (m) f.num = +m.value; };
    render();
  }

  // =====================================================================
  // ガレージ(レースの合間)
  function standings() {
    const pts = G.save.season.points;
    const rows = [{ key: 'YOU', name: G.save.team.name, color: G.save.team.color, num: G.save.team.num }]
      .concat(PW.RIVALS.map(r => ({ key: r.short, name: r.name, color: r.color, num: r.num })));
    rows.forEach(r => r.pts = pts[r.key] || 0);
    return rows.sort((a, b) => b.pts - a.pts);
  }

  function showGarage() {
    G.screen = 'garage';
    G.race = null; G.running = false;
    const s = G.save;
    if (s.season.round >= PW.TRACKS.length) return showSeasonEnd();
    const track = PW.TRACKS[s.season.round];
    D.setTrack(track, s.team.color);
    D.setCamera('title');
    D.setWeather(0, track.rain * 0.6, 0);
    const render = () => {
      const t = s.team;
      const st = standings();
      ui.innerHTML = `
        <div class="panel sheet left">
          <div class="panel-title">${I.crew} ${esc(t.name)}<span class="sub">#${t.num} ${PW.CAR_TYPES[t.type].name}</span></div>
          <div class="row" style="justify-content:space-between;margin-bottom:10px">
            <span class="lbl">チームの資金</span><span class="money">${man(t.budget)}</span>
          </div>
          <div class="sec-t" style="font-family:var(--serif);font-weight:800;color:var(--gold-hi);margin:8px 0 4px">チャンピオンシップ(第${s.season.round + 1}戦の前)</div>
          <table class="tbl"><tr><th>順位</th><th>チーム</th><th class="r">ポイント</th></tr>
            ${st.map((r, i) => `<tr class="${r.key === 'YOU' ? 'me' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${r.color}"></span>#${r.num} ${esc(r.name)}</td><td class="r">${r.pts}</td></tr>`).join('')}
          </table>
          ${s.season.history.length ? `<div class="lbl" style="margin-top:10px">これまで:${s.season.history.map(h => `${h.track} <b style="color:var(--gold-hi)">${h.pos ? h.pos + '位' : 'リタイア'}</b>`).join(' / ')}</div>` : ''}
          <div class="sec-t" style="font-family:var(--serif);font-weight:800;color:var(--gold-hi);margin:14px 0 4px">ドライバー</div>
          ${t.drivers.map(d => `
            <div style="margin-bottom:8px"><b style="font-family:var(--serif)">${I.helmet} ${esc(d.name)}</b>
              <div class="stat-bars"><span>速さ</span><div class="bar"><i style="width:${(d.skill + t.upg.driver * 1.5 - 60) * 3}%"></i></div>
              <span>雨のうまさ</span><div class="bar b"><i style="width:${(d.wet + t.upg.driver * 1.5 - 60) * 3}%"></i></div>
              <span>体力</span><div class="bar g"><i style="width:${d.stamina * (1 + t.upg.driver * 0.08) * 70}%"></i></div></div>
            </div>`).join('')}
        </div>
        <div class="panel sheet right">
          <div class="panel-title">${I.wrench} チームを強くする<span class="sub">資金 ${man(t.budget)}</span></div>
          ${PW.UPGRADES.map(u => {
            const lv = t.upg[u.id];
            const cost = u.cost[lv];
            return `<div class="upg"><span>${I[u.icon] || I.wrench}</span>
              <span class="name">${u.name}<span class="pips">${[0, 1, 2].map(i => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span></span>
              <button class="btn" data-up="${u.id}" ${cost == null || cost > t.budget ? 'disabled' : ''}>${cost == null ? '最大' : man(cost)}</button>
              <span class="desc">${u.desc}</span></div>`;
          }).join('')}
          <p class="lbl" style="line-height:1.7;margin-top:12px">賞金は順位で決まります(優勝 ${man(PW.PRIZE[0])})。マシンが壊れてゴールすると修理代がかかります。</p>
        </div>
        <div class="panel next-race">
          <div class="lbl">第${s.season.round + 1}戦 / 全${PW.TRACKS.length}戦</div>
          <h2>${track.name}</h2>
          <div class="motif">${track.motif}</div>
          <div class="facts">
            <span>周回 <b>${track.laps[s.settings.length]}</b></span>
            <span>1周 約<b>${fmtLap(track.baseLap)}</b></span>
            <span>雨の多さ <b>${track.rain > 0.7 ? '多い' : track.rain > 0.5 ? 'ふつう' : '少ない'}</b></span>
            <span>ピットロス <b>${track.pitLoss}</b>秒</span>
          </div>
        </div>
        <div class="footer-cta">
          <button class="btn" id="bTitle">タイトル</button>
          <button class="btn" id="bHelp2">遊び方</button>
          <button class="btn big" id="bRace">レースへ出発</button>
        </div>`;
      ui.querySelectorAll('[data-up]').forEach(b => b.onclick = () => {
        const u = PW.UPGRADES.find(x => x.id === b.dataset.up);
        const lv = t.upg[u.id], cost = u.cost[lv];
        if (cost == null || cost > t.budget) return;
        t.budget -= cost; t.upg[u.id]++;
        writeSave();
        render();
      });
      $('#bTitle').onclick = showTitle;
      $('#bHelp2').onclick = showHelp;
      $('#bRace').onclick = startRace;
    };
    render();
  }

  // =====================================================================
  // レース
  function startRace() {
    const s = G.save;
    const track = PW.TRACKS[s.season.round];
    const race = PW.createRace({ track, length: s.settings.length, difficulty: s.settings.difficulty, team: s.team, round: s.season.round, seed: Math.floor(Math.random() * 1e9) });
    G.race = race;
    G.running = false;
    G.resultShown = false;
    G.outNoted = false;
    G.lastLogShown = -1;
    G.scoutId = null;
    G.speed = 1;
    G.screen = 'race';
    D.setTrack(track, s.team.color);
    D.resetView();
    D.setCamera('overview');
    buildHud();
    showBriefing();
  }

  function showBriefing() {
    const race = G.race, p = race.player;
    const fc = PW.forecast(race);
    let tire = PW.bestTireFor(race.wet) === 'M' ? 'M' : PW.bestTireFor(race.wet);
    let drv = 0;
    const render = () => {
      openLetter(`
        <div class="who">${I.book} チーム代表より</div>
        <h3>決勝前のブリーフィング</h3>
        <div class="seal">${I.flag}</div>
        <p>${race.track.name}、${race.totalLaps}周のレース。あなたのマシンは <b>${p.grid}番手</b> からスタート。<br>
        燃料は満タン(約${(PW.TANK / PW.fuelPerLap(race, p)).toFixed(1)}周分)。天気予報:${fc.slice(0, 4).map(f => `${f.lapFrom ? f.lapFrom + '周〜' : 'スタート'} <b>${f.chance}%</b>`).join('、')}</p>
        <div class="opts">
          <div class="row"><span class="lbl">スタートタイヤ</span>${PW.TIRE_ORDER.map(k => `<span class="chip ${tire === k ? 'on' : ''}" data-st="${k}">${PW.TIRES[k].name}</span>`).join('')}</div>
          <div class="row"><span class="lbl">第1ドライバー</span>${p.drivers.map((d, i) => `<span class="chip ${drv === i ? 'on' : ''}" data-sd="${i}">${esc(d.name)}</span>`).join('')}</div>
        </div>
        <button class="btn big red" id="bStart" style="width:100%">スタート!</button>
        <div class="foot">ソフトは速いが減りが早い/ハードは長持ち/雨ならインター・ウェット</div>`);
      $('#letter').querySelectorAll('[data-st]').forEach(b => b.onclick = () => { tire = b.dataset.st; render(); });
      $('#letter').querySelectorAll('[data-sd]').forEach(b => b.onclick = () => { drv = +b.dataset.sd; render(); });
      $('#bStart').onclick = () => {
        p.tire = tire; p.driverIdx = drv;
        p.pitPlan.nextDriver = (drv + 1) % p.drivers.length;
        p.pitPlan.tire = tire === 'S' ? 'M' : tire;
        closeLetter();
        G.running = true;
        PW.addLog(race, 'control', 'グリーンフラッグ! レーススタート!', null);
        renderPlan();
      };
    };
    render();
  }

  function buildHud() {
    ui.innerHTML = `
      <div class="hud-left">
        <div class="panel race-head">
          <div class="panel-title">${I.flag} <span id="hTrack"></span></div>
          <div class="lapbig"><span class="lbl">周回</span><span class="num" id="hLap">0</span><span class="of" id="hLaps"></span><span style="margin-left:auto" id="hFlag"></span></div>
          <div class="kv">
            <span class="lbl">レース時間</span><span class="num" id="hTime"></span>
            <span class="lbl">いまの天気</span><span id="hWx"></span>
            <span class="lbl">路面の濡れ</span><div class="bar b"><i id="hWet"></i></div>
            <span class="lbl">気温</span><span id="hTemp"></span>
          </div>
        </div>
        <div class="panel fcp">
          <div class="panel-title">${I.cloud} 天気予報<span class="sub">先ほどあてにならない</span></div>
          <div class="fc" id="hFc"></div>
        </div>
      </div>
      <div class="hud-right">
        <div class="panel tower">
          <div class="panel-title">${I.trophy} タイミングタワー<span class="sub">クリックで偵察</span></div>
          <div id="hTower"></div>
          <div class="scout" id="hScout">ライバルをクリックすると、タイヤや作戦がわかります。</div>
        </div>
        <div class="panel">
          <div class="speed">
            <span class="chip" data-sp="0">${I.pause}</span>
            <span class="chip" data-sp="1">×1</span><span class="chip" data-sp="2">×2</span><span class="chip" data-sp="4">×4</span><span class="chip" data-sp="8">×8</span>
          </div>
          <div class="speed" style="margin-top:6px">
            <span class="chip" id="bCam">${I.camera} 追いかける</span>
            <span class="chip" id="bLog">${I.radio} 無線の記録</span>
            <span class="chip" id="bHelp3">?</span>
          </div>
        </div>
      </div>
      <div class="subtitle" id="hSub"></div>
      <div class="panel log-drawer hidden" id="hLog"></div>
      <div class="panel hud-bottom">
        <div>
          <div class="sec-t">${I.tire} マシン <span class="lbl" id="hPos"></span></div>
          <div class="carview">
            <div class="tyre" id="tFL"></div><div class="body" id="hBody"></div><div class="tyre r" id="tFR"></div>
            <div class="tyre" id="tRL"></div><div class="tyre r" id="tRR"></div>
          </div>
          <div class="meter-line"><span class="lbl">${I.fuel} 燃料</span><div class="bar y"><i id="hFuel"></i></div><span class="v" id="hFuelL"></span></div>
          <div class="est" id="hFuelTxt"></div>
        </div>
        <div>
          <div class="driver">${I.helmet}<div><b id="hDrv"></b><div class="lbl" id="hStint"></div></div></div>
          <div class="meter-line" style="margin-top:0"><span class="lbl">体力</span><div class="bar g"><i id="hEnergy"></i></div><span class="v" id="hEnergyV"></span></div>
          <div class="health" id="hHealth"></div>
          <div class="times"><span class="lbl">前の周</span> <span class="num" id="hLast"></span>  <span class="lbl">ベスト</span> <span class="num" id="hBest"></span></div>
          <div class="modes" id="hModes"></div>
        </div>
        <div>
          <div class="sec-t">${I.wrench} ピットの予定</div>
          <div class="plan" id="hPlan"></div>
          <button class="btn red pitbtn" id="bPit"></button>
        </div>
      </div>`;
    ui.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => { G.speed = +b.dataset.sp; updateHud(true); });
    $('#bCam').onclick = () => { D.setCamera(D.follow ? 'overview' : 'follow'); if (!D.follow) D.resetView(); updateHud(true); };
    $('#bLog').onclick = () => { G.showLog = !G.showLog; updateHud(true); };
    $('#bHelp3').onclick = showHelp;
    $('#bPit').onclick = () => {
      const p = G.race.player;
      if (p.state !== 'run') return;
      p.pitRequest = !p.pitRequest;
      if (p.pitRequest) PW.addLog(G.race, 'radio', 'ボックス、ボックス! 次の周でピットに入って。', p);
      renderPlan();
    };
    $('#hTower').addEventListener('click', (e) => {
      const r = e.target.closest('[data-car]');
      if (r) { G.scoutId = +r.dataset.car; updateHud(true); }
    });
    renderModes();
    renderPlan();
    updateHud(true);
  }

  function renderModes() {
    const p = G.race.player;
    $('#hModes').innerHTML = Object.entries(PW.MODES).map(([k, m]) => `<span class="chip ${p.mode === k ? 'on' : ''}" data-mode="${k}" title="${m.desc}">${m.name}</span>`).join('');
    $('#hModes').querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
      p.mode = b.dataset.mode;
      PW.addLog(G.race, 'radio', { push: '了解、プッシュする!', normal: '了解、ふつうのペースで。', save: '了解、タイヤと燃料をセーブする。' }[p.mode], p);
      renderModes();
    });
  }

  function renderPlan() {
    const race = G.race, p = race.player, plan = p.pitPlan;
    const box = $('#hPlan');
    if (!box) return;
    const need = [];
    if (p.health.aero < 0.95) need.push('空力');
    if (p.health.brakes < 0.75) need.push('ブレーキ');
    if (p.health.gearbox < 0.85) need.push('ギア');
    if (p.hybrid && p.health.hybrid < 0.8) need.push('電気');
    box.innerHTML = `
      <div class="row"><span class="lbl">タイヤ</span>${PW.TIRE_ORDER.map(k => `<span class="chip ${plan.tire === k ? 'on' : ''}" data-pt="${k}" title="${PW.TIRES[k].name}">${tireChip(k)}</span>`).join('')}<span class="chip ${plan.tire === 'keep' ? 'on' : ''}" data-pt="keep" title="交換しない">そのまま</span></div>
      <div class="row"><span class="lbl">給油</span>
        <span class="chip ${plan.fuel === 'full' ? 'on' : ''}" data-pf="full">満タン</span>
        <span class="chip ${plan.fuel === 'end' ? 'on' : ''}" data-pf="end">ゴールまで</span>
        <span class="chip ${plan.fuel === 'laps' ? 'on' : ''}" data-pf="laps">${plan.fuelLaps}周分</span>
        ${plan.fuel === 'laps' ? `<span class="chip" data-fl="-1">−</span><span class="chip" data-fl="1">+</span>` : ''}
      </div>
      <div class="row"><span class="lbl">交代</span>
        <span class="chip ${!plan.change ? 'on' : ''}" data-pc="-1">しない</span>
        ${p.drivers.map((d, i) => i === p.driverIdx ? '' : `<span class="chip ${plan.change && plan.nextDriver === i ? 'on' : ''}" data-pc="${i}">${esc(d.name.split(/[ ・]/).pop())}</span>`).join('')}
      </div>
      <div class="row"><span class="lbl">修理</span>
        <span class="chip ${plan.repair ? 'on' : ''}" data-pr="1">する</span><span class="chip ${!plan.repair ? 'on' : ''}" data-pr="0">しない</span>
        <span class="lbl" style="width:auto">${need.length ? '要:' + need.join('・') : '異常なし'}</span>
      </div>
      <div class="est" id="hEst"></div>`;
    box.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => { plan.tire = b.dataset.pt; renderPlan(); });
    box.querySelectorAll('[data-pf]').forEach(b => b.onclick = () => { plan.fuel = b.dataset.pf; renderPlan(); });
    box.querySelectorAll('[data-fl]').forEach(b => b.onclick = () => { plan.fuelLaps = Math.max(1, Math.min(30, plan.fuelLaps + +b.dataset.fl)); renderPlan(); });
    box.querySelectorAll('[data-pc]').forEach(b => b.onclick = () => { const v = +b.dataset.pc; plan.change = v >= 0; if (v >= 0) plan.nextDriver = v; renderPlan(); });
    box.querySelectorAll('[data-pr]').forEach(b => b.onclick = () => { plan.repair = b.dataset.pr === '1'; renderPlan(); });
    if (plan.change && (plan.nextDriver == null || plan.nextDriver === p.driverIdx)) plan.nextDriver = (p.driverIdx + 1) % p.drivers.length;
    updatePlanEst();
  }

  function updatePlanEst() {
    const race = G.race, p = race.player;
    const est = $('#hEst'), btn = $('#bPit');
    if (!est || !btn) return;
    if (p.state === 'pit') {
      const w = p.pitWork;
      est.innerHTML = `ピット作業中… のこり <b class="num">${Math.max(0, p.pitTimer).toFixed(0)}</b>秒`;
      btn.textContent = 'ピット作業中';
      btn.disabled = true; btn.classList.remove('armed');
      return;
    }
    const w = PW.pitServiceTime(race, p, p.pitPlan);
    est.innerHTML = `止まる時間 約<b class="num">${(w.total - race.track.pitLoss).toFixed(0)}</b>秒 + ピットロード ${race.track.pitLoss}秒${w.penalty ? `(罰 ${w.penalty}秒込み)` : ''}・給油 ${w.fuelAdd.toFixed(0)}L`;
    btn.disabled = p.state !== 'run';
    btn.textContent = p.pitRequest ? '次の周でピットイン!(取り消す)' : 'ピットに呼ぶ(BOX)';
    btn.classList.toggle('armed', p.pitRequest);
  }

  function updateHud(force) {
    const race = G.race;
    if (!race || G.screen !== 'race') return;
    const now = performance.now();
    if (!force && now - G.hudAt < 120) return;
    G.hudAt = now;
    const p = race.player;
    const order = PW.order(race);
    const leader = order[0];
    $('#hTrack').textContent = race.track.name;
    $('#hLap').textContent = Math.min(race.totalLaps, race.leaderLap + (race.flag === 'chequered' ? 0 : 1));
    $('#hLaps').textContent = '/ ' + race.totalLaps;
    const fl = { green: ['green', 'グリーン'], fcy: ['fcy', 'FCY(全体減速)'], sc: ['sc', 'セーフティカー'], chequered: ['chequered', 'チェッカー'] }[race.flag];
    $('#hFlag').innerHTML = `<span class="flag ${fl[0]}">${race.flag === 'chequered' ? I.chequer : I.flag} ${fl[1]}</span>`;
    $('#hTime').textContent = fmtClock(race.time);
    const wk = PW.weatherKind(race.rain);
    $('#hWx').innerHTML = `${I[wk === 'sun' ? (race.wet > 0.1 ? 'cloud' : 'sun') : wk]} ${wk === 'sun' ? (race.wet > 0.1 ? 'くもり(路面は濡れている)' : '晴れ') : wk === 'rain' ? '雨' : '大雨'}`;
    $('#hWet').style.width = pct(race.wet);
    $('#hTemp').textContent = `${race.temp.toFixed(0)}℃${race.temp > 28 ? '(暑くてタイヤが減りやすい)' : ''}`;
    // 天気予報
    const fc = PW.forecast(race);
    $('#hFc').innerHTML = fc.map((f, i) => {
      const ic = i === 0 ? (race.rain > 0.6 ? 'storm' : race.rain > 0.05 ? 'rain' : race.wet > 0.1 ? 'cloud' : 'sun')
        : f.chance < 25 ? 'sun' : f.chance < 55 ? 'cloud' : (f.intensity > 0.6 && f.chance > 70 ? 'storm' : 'rain');
      return `<div class="fc-row ${i === 0 ? 'now' : ''}"><span>${i === 0 ? 'いま' : f.lapFrom + '周〜'}</span>${I[ic]}<div class="bar b"><i style="width:${f.chance}%"></i></div><span class="pct">${f.chance}%</span></div>`;
    }).join('');
    // タイミングタワー
    const refLap = race.track.baseLap;
    $('#hTower').innerHTML = order.map((c, i) => {
      let gap = '';
      if (i === 0) gap = 'トップ';
      else if (c.state === 'out') gap = '';
      else {
        const dl = leader.progress - c.progress;
        gap = dl >= 1 ? `+${Math.floor(dl)}周` : `+${(dl * refLap).toFixed(1)}`;
        if (c.state === 'done' && leader.state === 'done') {
          const lapsDown = Math.round(leader.progress) - Math.round(c.progress);
          gap = lapsDown > 0 ? `+${lapsDown}周` : `+${(c.finishTime - leader.finishTime).toFixed(1)}`;
        }
      }
      const st = c.state === 'pit' ? '<span class="st pit">PIT</span>' : c.state === 'out' ? '<span class="st outs">リタイア</span>' : c.state === 'done' ? '<span class="st fin">ゴール</span>' : '';
      return `<div class="row-t ${c.isPlayer ? 'me' : ''} ${c.state === 'out' ? 'out' : ''}" data-car="${c.id}">
        <span class="pos">${i + 1}</span>
        <span class="no" style="background:${c.color};color:${c.color2}">${c.num}</span>
        <span class="nm">${esc(c.isPlayer ? c.name : c.name)}${st}</span>
        <span class="gap">${gap}</span>
        <span class="tw">${tireChip(c.tire)}${c.tireLaps}</span>
      </div>`;
    }).join('');
    // 偵察
    const sc = race.cars.find(c => c.id === G.scoutId);
    if (sc) {
      const pos = order.indexOf(sc) + 1;
      $('#hScout').innerHTML = `<b>#${sc.num} ${esc(sc.name)}</b>(${pos}位)<br>タイヤ:${PW.TIRES[sc.tire].name} ${sc.tireLaps}周目・減り約${Math.round(sc.tireWear * 100 / 10) * 10}%<br>ピット ${sc.pits}回(最後は${sc.lastPitLap || '—'}周目)・ベスト ${fmtLap(sc.bestLap)}${sc.state === 'out' ? '<br>リタイアしました' : ''}`;
    }
    // 速さボタン
    ui.querySelectorAll('[data-sp]').forEach(b => b.classList.toggle('on', +b.dataset.sp === G.speed));
    $('#bCam').classList.toggle('on', D.follow);
    $('#bLog').classList.toggle('on', G.showLog);
    // 自分のマシン
    const myPos = order.indexOf(p) + 1;
    $('#hPos').textContent = `${myPos}位 / #${p.num}`;
    $('#hBody').style.background = `linear-gradient(90deg, ${p.color} 0 40%, ${p.color2} 40% 60%, ${p.color} 60%)`;
    const tw = p.tireWear;
    const ty = (id, w) => { $(id).innerHTML = `<i style="background:${PW.TIRES[p.tire].color};opacity:${0.35 + 0.65 * (1 - w)}"></i><span class="num" style="color:${w > 0.8 ? 'var(--red)' : w > 0.6 ? 'var(--yellow)' : 'var(--ink)'}">${Math.max(0, Math.round((1 - w) * 100))}%</span>`; };
    ty('#tFL', Math.min(1, tw * 1.05)); ty('#tFR', Math.min(1, tw * 0.97)); ty('#tRL', Math.min(1, tw * 1.0)); ty('#tRR', Math.min(1, tw * 0.93));
    const per = PW.fuelPerLap(race, p);
    const lapsLeft = race.totalLaps - Math.floor(p.progress);
    $('#hFuel').style.width = pct(p.fuel / PW.TANK);
    $('#hFuelL').textContent = `${p.fuel.toFixed(0)}L`;
    $('#hFuelTxt').innerHTML = `あと約 <b class="num">${(p.fuel / per).toFixed(1)}</b> 周分(ゴールまで ${Math.max(0, lapsLeft)} 周)・${PW.TIRES[p.tire].name} ${p.tireLaps}周目`;
    const d = p.drivers[p.driverIdx];
    $('#hDrv').textContent = d.name;
    $('#hStint').textContent = `この人の連続走行 ${p.stintLaps}周`;
    $('#hEnergy').style.width = pct(d.energy);
    $('#hEnergy').parentElement.className = 'bar ' + barCls(d.energy);
    $('#hEnergyV').textContent = pct(d.energy);
    const parts = [['engine', 'エンジン'], ['gearbox', 'ギア'], ['brakes', 'ブレーキ'], ['aero', '空力']].concat(p.hybrid ? [['hybrid', '電気']] : []);
    $('#hHealth').innerHTML = parts.map(([k, n]) => `<div class="hp" title="${n} ${pct(p.health[k])}"><span class="lbl">${n}</span><div class="bar ${barCls((p.health[k] - 0.4) / 0.6)}"><i style="width:${pct(p.health[k])}"></i></div></div>`).join('');
    $('#hLast').textContent = fmtLap(p.lastLap);
    $('#hBest').textContent = fmtLap(p.bestLap);
    const hb = $('.hud-bottom');
    if (hb) $('#hSub').style.bottom = (hb.offsetHeight + 26) + 'px';
    updatePlanEst();
    // 無線の字幕
    const last = race.log[race.log.length - 1];
    if (last && race.log.length - 1 !== G.lastLogShown) {
      G.lastLogShown = race.log.length - 1;
      const sub = $('#hSub');
      const who = last.kind === 'radio' ? (last.text.startsWith('ドライバー') ? '' : '無線') : last.kind === 'control' ? 'レースコントロール' : 'ニュース';
      sub.className = 'subtitle ' + last.kind;
      sub.innerHTML = `<span class="who">${who}</span>${esc(last.text)}`;
      sub.style.opacity = 1;
      G.subAt = now;
    } else if (G.subAt && now - G.subAt > 6000) { $('#hSub').style.opacity = 0; }
    const log = $('#hLog');
    log.classList.toggle('hidden', !G.showLog);
    if (G.showLog) log.innerHTML = race.log.slice().reverse().slice(0, 40).map(l => `<p class="${l.kind}"><span class="lap">L${l.lap}</span>${esc(l.text)}</p>`).join('');
  }

  // ---------- 手紙(判断カード) ----------
  function openLetter(html) {
    $('#letter').innerHTML = html;
    $('#letterWrap').classList.remove('hidden');
    $('#letter').style.animation = 'none';
    void $('#letter').offsetWidth;
    $('#letter').style.animation = '';
    G.letterOpen = true;
  }
  function closeLetter() {
    $('#letterWrap').classList.add('hidden');
    G.letterOpen = false;
  }

  function showEvent(ev) {
    openLetter(`
      <div class="who">${I.radio} ${esc(ev.who)}からの無線 ・ ${ev.lap}周目</div>
      <h3>${esc(ev.title)}</h3>
      <div class="seal">${I[ev.icon] || I.radio}</div>
      <p>${esc(ev.text)}</p>
      ${ev.choices.map((c, i) => `<button class="choice" data-ch="${i}"><b>${esc(c.label)}</b><span>${esc(c.desc)}</span></button>`).join('')}
      <div class="foot">判断するまでレースは止まっています</div>`);
    $('#letter').querySelectorAll('[data-ch]').forEach(b => b.onclick = () => {
      const c = ev.choices[+b.dataset.ch];
      c.apply();
      PW.addLog(G.race, 'radio', `指示:${c.label}`, G.race.player);
      closeLetter();
      renderPlan();
      renderModes();
      updateHud(true);
    });
  }

  // =====================================================================
  // 結果
  function finishRace() {
    const race = G.race, s = G.save;
    const order = PW.order(race);
    const p = race.player;
    const pos = order.indexOf(p) + 1;
    const classified = p.state === 'done';
    order.forEach((c, i) => {
      const k = carKey(c);
      if (c.state === 'done' && i < PW.POINTS.length) s.season.points[k] = (s.season.points[k] || 0) + PW.POINTS[i];
    });
    const prize = classified ? PW.PRIZE[pos - 1] || 200 : 200;
    let bonus = 0, sponsorTxt = '';
    if (race.sponsorDeal && race.sponsorDeal.pos) {
      if (classified && pos <= race.sponsorDeal.pos) { bonus = race.sponsorDeal.bonus; sponsorTxt = `スポンサーとの約束(${race.sponsorDeal.pos}位以内)達成!`; }
      else { bonus = -200; sponsorTxt = 'スポンサーとの約束を守れなかった(違約金)'; }
    }
    const h = p.health;
    const repair = Math.round(((1 - h.engine) + (1 - h.gearbox) + (1 - h.aero) + (1 - h.brakes) * 0.3 + (p.hybrid ? 1 - h.hybrid : 0)) * 400 + (classified ? 0 : 300));
    const total = prize + bonus - repair;
    s.team.budget = Math.max(0, s.team.budget + total);
    s.season.history.push({ track: race.track.name, pos: classified ? pos : 0, pts: classified && pos <= 10 ? PW.POINTS[pos - 1] : 0 });
    s.season.round++;
    writeSave();

    G.screen = 'result';
    G.running = false;
    D.showPodium(order.slice(0, 3));
    D.setCamera('podium');
    const leader = order[0];
    const fast = race.fastest ? race.cars.find(c => c.id === race.fastest.car) : null;
    ui.innerHTML = `
      <div class="letter result-sheet">
        <div class="who">${I.trophy} ${esc(race.track.name)} ・ 決勝結果</div>
        <h3>${classified ? (pos === 1 ? '優勝!!' : pos <= 3 ? `${pos}位 表彰台!` : `${pos}位でゴール`) : 'リタイア…'}</h3>
        <div class="seal">${I.trophy}</div>
        <table>
          <tr><th>順位</th><th>チーム</th><th class="r">周回</th><th class="r">差</th><th class="r">pt</th></tr>
          ${order.map((c, i) => {
            const lapsDown = Math.round(leader.progress) - Math.floor(c.progress);
            const gap = i === 0 ? fmtClock(c.finishTime) : c.state !== 'done' ? 'リタイア' : lapsDown > 0 ? `+${lapsDown}周` : `+${(c.finishTime - leader.finishTime).toFixed(1)}秒`;
            return `<tr class="${c.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${c.color}"></span>#${c.num} ${esc(c.name)}</td><td class="r">${Math.floor(c.progress)}</td><td class="r">${gap}</td><td class="r">${c.state === 'done' && i < 10 ? PW.POINTS[i] : 0}</td></tr>`;
          }).join('')}
        </table>
        <p style="margin:12px 0 6px;font-size:13px">ファステストラップ:${fast ? `#${fast.num} ${esc(fast.name)} ${fmtLap(race.fastest.time)}` : '—'}${race.stats.overtakes ? `/あなたの指示で抜いた回数 ${race.stats.overtakes}` : ''}</p>
        <div class="sum"><span>賞金</span><span>${man(prize)}</span></div>
        ${bonus ? `<div class="sum"><span>${sponsorTxt}</span><span>${bonus > 0 ? '+' : ''}${man(bonus)}</span></div>` : ''}
        <div class="sum"><span>修理代</span><span>−${man(repair)}</span></div>
        <div class="sum" style="border-top:1px solid #b8955a;padding-top:4px"><span>今回の収支</span><span>${total >= 0 ? '+' : ''}${man(total)}</span></div>
        <div class="sum"><span>チームの資金</span><span>${man(s.team.budget)}</span></div>
        <button class="btn big" id="bNext" style="width:100%">${s.season.round >= PW.TRACKS.length ? 'シーズンの結果へ' : 'ガレージへ'}</button>
      </div>`;
    $('#bNext').onclick = () => showGarage();
  }

  function showSeasonEnd() {
    G.screen = 'season';
    const st = standings();
    const myRank = st.findIndex(r => r.key === 'YOU') + 1;
    D.setTrack(PW.TRACKS[PW.TRACKS.length - 1], G.save.team.color);
    D.setCamera('title');
    const champ = st[0];
    ui.innerHTML = `
      <div class="letter result-sheet">
        <div class="who">${I.book} シーズンのおわりに</div>
        <h3>${myRank === 1 ? 'チャンピオン獲得!!' : `シリーズ ${myRank}位`}</h3>
        <div class="seal">${I.trophy}</div>
        <p>${myRank === 1 ? `おめでとう! ${esc(G.save.team.name)} がチャンピオン。ピットウォールからの判断が、チームを頂点に導いた。` : `チャンピオンは #${champ.num} ${esc(champ.name)}。次のシーズンこそ、作戦で上回ろう。`}</p>
        <table><tr><th>順位</th><th>チーム</th><th class="r">ポイント</th></tr>
          ${st.map((r, i) => `<tr class="${r.key === 'YOU' ? 'me' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${r.color}"></span>#${r.num} ${esc(r.name)}</td><td class="r">${r.pts}</td></tr>`).join('')}
        </table>
        <button class="btn big" id="bAgain" style="width:100%">新しいシーズンへ</button>
      </div>`;
    $('#bAgain').onclick = () => { clearSave(); G.save = null; showNew(); };
  }

  // =====================================================================
  // 遊び方
  function showHelp() {
    const wasRunning = G.running;
    G.running = false;
    $('#modal').innerHTML = `
      <div class="panel-title">${I.book} 遊び方 — あなたはレースエンジニア</div>
      <p>運転するのはドライバー。あなたはピットの壁(ピットウォール)から<b>無線で指示を出し、作戦を決める人</b>です。良い判断を重ねて、チームを上の順位へ導きましょう。</p>
      <h3>レース中にできること</h3>
      <dl>
        <dt>ピットに呼ぶ</dt><dd>次にコントロールライン(スタート地点)を通ったときにピットに入ります。入る前に「タイヤ・給油・交代・修理」を決めておきます。</dd>
        <dt>走り方</dt><dd>プッシュ(速いが消耗大)/ふつう/セーブ(遅いが長持ち)。</dd>
        <dt>無線の手紙</dt><dd>トラブルや相談ごとが届きます。選んだ答えでレースが変わります。</dd>
        <dt>偵察</dt><dd>右のタイミングタワーでライバルをクリックすると、タイヤや作戦がわかります。</dd>
        <dt>速さ</dt><dd>⏸ で一時停止、×1〜×8 で早送り。</dd>
      </dl>
      <h3>ことばの説明</h3>
      <dl>
        <dt>スティント</dt><dd>ピットからピットまでの、ひとつながりの走行。</dd>
        <dt>BOX(ボックス)</dt><dd>「ピットに入れ」という無線の合図。</dd>
        <dt>FCY</dt><dd>フルコースイエロー。事故の片付け中で、全車がゆっくり走る。このときピットに入るとロスが少ない。</dd>
        <dt>セーフティカー</dt><dd>先導車の後ろに全車が並ぶ。差が縮まるので、作戦の大チャンス。</dd>
        <dt>インター/ウェット</dt><dd>雨用タイヤ。インターは小雨〜乾きかけ、ウェットは大雨向け。乾いた路面ではすぐ減る。</dd>
        <dt>タイヤ「そのまま」</dt><dd>タイヤを替えずに給油だけして時間を節約する作戦(ダブルスティント)。</dd>
        <dt>アンダーカット</dt><dd>ライバルより先にピットに入り、新しいタイヤの速さで前に出る作戦。</dd>
      </dl>
      <h3>操作</h3>
      <p>本はマウスのドラッグで回せます。ホイールで近づけます。「追いかける」で自分のマシンを追います。</p>
      <div style="text-align:right"><button class="btn" id="bCloseHelp">とじる</button></div>`;
    $('#modalWrap').classList.remove('hidden');
    $('#bCloseHelp').onclick = () => { $('#modalWrap').classList.add('hidden'); if (G.screen === 'race' && G.race && !G.race.finished && wasRunning) G.running = true; };
  }

  // =====================================================================
  // 毎フレームの処理
  let last = performance.now();
  function tick() {
    const now = performance.now();
    const realDt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const race = G.race;
    if (race && G.screen === 'race') {
      if (G.running && !G.letterOpen && G.speed > 0 && !race.finished) {
        let simDt = realDt * PW.TIME_SCALE * G.speed;
        while (simDt > 0) {
          const st = Math.min(0.5, simDt);
          PW.step(race, st);
          simDt -= st;
          if (race.events.length || race.finished) break;
        }
      }
      if (!G.letterOpen && race.events.length && G.running) {
        const ev = race.events.shift();
        if (race.player.state === 'run' || ev.id === 'safety') showEvent(ev);
      }
      if (race.playerOut && !G.outNoted) {
        G.outNoted = true;
        G.speed = 8;
        PW.addLog(race, 'radio', `${race.playerOut}でレースが終わってしまった…。残りは早送りで見届けよう。`, race.player);
      }
      if (race.finished && !G.resultShown) {
        G.resultShown = true;
        setTimeout(finishRace, 1800);
      }
      const fc = PW.forecast(race);
      D.setWeather(race.rain, Math.max(race.rain, (fc[1].chance / 100) * 0.7, race.wet * 0.6), race.wet);
      updateHud(false);
    }
    D.frame(G.screen === 'race' || G.screen === 'result' ? race : null);
    requestAnimationFrame(tick);
  }

  // ---------- 起動 ----------
  function boot() {
    if (D) return;
    try {
      D = new PW.Diorama($('#stage'));
    } catch (e) {
      $('#bootText').textContent = '3D表示を開始できませんでした(WebGL に対応したブラウザで開いてください)';
      return;
    }
    showTitle();
    requestAnimationFrame(tick);
    setTimeout(() => $('#boot').classList.add('fade'), 300);
    // 確認用(ブラウザの開発ツールから呼べる)
    PW.debug = { startRace, showGarage, showNew, finishRace, G, D };
  }
  if (PW.Diorama) boot();
  else window.addEventListener('pw-scene-ready', boot);
  setTimeout(() => { if (!D) $('#bootText').textContent = '部品の読み込みに時間がかかっています…(インターネット接続を確認してください)'; }, 12000);
})();
