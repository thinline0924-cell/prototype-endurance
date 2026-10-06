'use strict';
// プレイヤー(レースエンジニア)が判断する「無線の手紙」カード。
// choices の apply がマシンやレースの状態を変える。

(function () {
  const PW = window.PW;

  function mod(car, m) { car.mods.push(m); }

  const EVENTS = {
    puncture: (race, c) => ({
      who: 'ドライバー', title: 'パンク!', icon: 'tire',
      text: '右リアがパンクした! ゆっくりピットまで戻る。タイヤを用意しておいて!',
      choices: [
        { label: 'ピットで待つ', desc: '1周ゆっくり走ってピットイン(自動)', apply() { c.pitPlan.tire = c.pitPlan.tire === 'keep' ? PW.bestTireForPlan(race) : c.pitPlan.tire; } },
      ],
    }),
    damage: (race, c) => ({
      who: 'ドライバー', title: 'マシン破損', icon: 'wrench',
      text: 'フロントのカウルが割れた。直線は大丈夫だけど、コーナーで踏ん張りがきかない。',
      choices: [
        { label: '次のピットで修理', desc: 'ピット作業が約25秒のびるが、速さが戻る', apply() { c.pitPlan.repair = true; } },
        { label: '修理しない', desc: 'ピット時間は短いまま。遅いまま走る', apply() { c.pitPlan.repair = false; } },
      ],
    }),
    engine: (race, c) => ({
      who: 'データ担当', title: 'エンジン温度が上昇', icon: 'engine',
      text: '水温がじわじわ上がっています。このままだとエンジンが壊れるかもしれません。',
      choices: [
        { label: '回転数を下げる', desc: '5周のあいだ少し遅くなる(+0.8%)。故障の心配が減る', apply() { mod(c, { pace: 0.8, laps: 5 }); c.health.engine = Math.max(c.health.engine, 0.97); } },
        { label: 'このまま攻める', desc: '速さは保つが、エンジンが傷むかも(40%)', apply() { if (race.rng() < 0.4) { c.health.engine -= 0.25; PW.addLog(race, 'radio', 'エンジンのパワーが落ちた…!', c); } } },
      ],
    }),
    gearbox: (race, c) => ({
      who: 'ドライバー', title: 'ギアが入りにくい', icon: 'gear',
      text: '3速に入りにくい。変な音もする。どうする?',
      choices: [
        { label: 'ギアをいたわる', desc: '残りずっと少し遅い(+0.6%)が、壊れにくい', apply() { mod(c, { pace: 0.6, laps: 999 }); c.health.gearbox = Math.max(0.9, c.health.gearbox - 0.05); } },
        { label: '次のピットで修理', desc: '約60秒の大修理。直れば元どおり', apply() { c.health.gearbox = Math.min(c.health.gearbox, 0.8); c.pitPlan.repair = true; } },
        { label: '気にせず走る', desc: '25%で大きなトラブルに', apply() { if (race.rng() < 0.25) { c.health.gearbox = 0.55; PW.addLog(race, 'radio', 'ギアボックスが悲鳴を上げている…!', c); } } },
      ],
    }),
    brakes: (race, c) => ({
      who: 'データ担当', title: 'ブレーキが摩耗', icon: 'brake',
      text: 'ブレーキの減りが予想より早いです。ブレーキングの位置を早めてもらいますか?',
      choices: [
        { label: 'ブレーキを労わる', desc: '4周のあいだ+0.5%。ブレーキが長持ち', apply() { mod(c, { pace: 0.5, laps: 4 }); c.health.brakes = Math.min(1, c.health.brakes + 0.12); } },
        { label: '次のピットで交換', desc: '約40秒かかるが、新品になる', apply() { c.health.brakes = Math.min(c.health.brakes, 0.7); c.pitPlan.repair = true; } },
      ],
    }),
    brakeTemp: (race, c) => EVENTS.brakes(race, c),
    hybrid: (race, c) => ({
      who: 'データ担当', title: 'ハイブリッド系の警告', icon: 'bolt',
      text: 'モーターの電気が止まりました! ハンドルのスイッチで再起動できるかもしれません。',
      choices: [
        { label: '再起動を指示', desc: '10秒止まる。80%で直る', apply() { c.stall = (c.stall || 0) + 10; if (race.rng() < 0.8) { c.health.hybrid = 1; PW.addLog(race, 'radio', '再起動成功! モーターが戻った!', c); } else { c.health.hybrid = 0.4; PW.addLog(race, 'radio', 'ダメだ、モーターが戻らない…', c); } } },
        { label: 'エンジンだけで走る', desc: 'ペースが落ちる(電気なし)。ピットで修理可', apply() { c.health.hybrid = 0.4; c.pitPlan.repair = true; } },
      ],
    }),
    safety: (race, c) => ({
      who: 'レースコントロール', title: race.flag === 'sc' ? 'セーフティカー出動' : 'フルコースイエロー', icon: 'flag',
      text: race.flag === 'sc'
        ? 'コース上で事故。全車がセーフティカーの後ろに並びます。今ピットに入れば、ロスする時間がふだんの半分ほどです。'
        : '全車が減速しています。今ピットに入ると少し得です。',
      choices: [
        { label: '今ピットに入る', desc: '今のピット予定で、次のラインでピットイン', apply() { c.pitRequest = true; } },
        { label: 'コースに残る', desc: '順位を守る。ピットは後で', apply() { } },
      ],
    }),
    tireLimit: (race, c) => ({
      who: 'ドライバー', title: 'タイヤが限界', icon: 'tire',
      text: `タイヤがもうボロボロだ!(減り ${Math.round(c.tireWear * 100)}%)このままだとパンクするかも!`,
      choices: [
        { label: 'ピットに呼ぶ', desc: '次のラインでピットイン', apply() { c.pitRequest = true; } },
        { label: 'もう少しがんばる', desc: '走り方を「セーブ」にしてタイヤをいたわる', apply() { c.mode = 'save'; } },
      ],
    }),
    tired: (race, c) => {
      const d = c.drivers[c.driverIdx];
      return {
        who: d.name, title: 'ドライバーが疲れている', icon: 'helmet',
        text: '正直、集中力が切れてきた…。ミスする前に交代したい。',
        choices: [
          { label: '次のピットで交代', desc: 'ピット予定に「交代」を入れる', apply() { c.pitPlan.change = true; } },
          { label: '励ましてもう少し', desc: '5周だけ疲れにくくなるが、ミスの危険は少し増える', apply() { d.energy = Math.min(1, d.energy + 0.12); mod(c, { risk: 1.4, laps: 5 }); } },
        ],
      };
    },
    defend: (race, c) => {
      const b = PW.neighbor(race, c, 1);
      const name = b ? `#${b.car.num} ${b.car.name}` : 'うしろの車';
      return {
        who: 'スポッター', title: 'うしろから接近', icon: 'eye',
        text: `${name} が真うしろに来ています! 抑えますか?`,
        choices: [
          { label: 'ブロックさせる', desc: '3周、順位を守りやすいがタイヤが減る(+30%)', apply() { mod(c, { wear: 1.3, laps: 3 }); if (b) b.car.mods.push({ pace: 0.6, laps: 3 }); } },
          { label: '無理しない', desc: '抜かれるかもしれないが、マシンにやさしい', apply() { if (b && b.car.state === 'run' && b.car.progress < c.progress) { const t = b.car.progress; b.car.progress = c.progress + 0.0005; c.progress = t; } } },
        ],
      };
    },
    attack: (race, c) => {
      const a = PW.neighbor(race, c, -1);
      const name = a ? `#${a.car.num} ${a.car.name}` : '前の車';
      return {
        who: 'ドライバー', title: '前の車が見えた!', icon: 'eye',
        text: `${name} のすぐうしろだ。いけるか?`,
        choices: [
          { label: '攻めろ!', desc: '60%で抜く。失敗すると接触してマシン破損(15%)', apply() {
            const r = race.rng();
            if (a && r < 0.6 && a.car.state === 'run' && c.state === 'run') { const t = a.car.progress; a.car.progress = c.progress; c.progress = t + 0.0004; PW.addLog(race, 'radio', `よし! ${name} を抜いた!`, c); race.stats.overtakes++; }
            else if (r > 0.85) { c.health.aero = Math.max(0.7, c.health.aero - 0.15); PW.addLog(race, 'radio', '接触した! フロントが少し壊れたかも', c); }
            else PW.addLog(race, 'radio', 'ダメだ、守りがかたい', c);
          } },
          { label: 'ついていく', desc: 'ピットの作戦で抜く。リスクなし', apply() { } },
        ],
      };
    },
    trackLimits: (race, c) => ({
      who: 'レースコントロール', title: 'コース外走行の警告', icon: 'flag',
      text: 'あなたのマシンが何度もコースの外を走っています。次に違反するとペナルティ(5秒加算)です。',
      choices: [
        { label: '気をつけるよう伝える', desc: '3周すこし遅くなる(+0.3%)が、ペナルティは避ける', apply() { mod(c, { pace: 0.3, laps: 3 }); } },
        { label: '気にしない', desc: '50%でペナルティ。次のピットで5秒止まる', apply() { if (race.rng() < 0.5) { c.penalty += 5; PW.addLog(race, 'control', 'ペナルティ:次のピットで5秒停止', c); } } },
      ],
    }),
    contact: (race, c) => ({
      who: 'ドライバー', title: '周回遅れの車と接触', icon: 'wrench',
      text: '遅い車を抜くときに軽くぶつけた。ハンドルがすこしまっすぐじゃない気がする。',
      choices: [
        { label: '様子を見る', desc: '空力が少し落ちる', apply() { c.health.aero = Math.max(0.75, c.health.aero - 0.06); } },
        { label: '次のピットで点検', desc: '修理をピット予定に入れる', apply() { c.health.aero = Math.max(0.75, c.health.aero - 0.06); c.pitPlan.repair = true; } },
      ],
    }),
    fuelCalc: (race, c) => ({
      who: 'データ担当', title: '燃費がずれている', icon: 'fuel',
      text: '燃料の使い方が予定より多いです。燃費走行(リフト&コースト)をしてもらいますか?',
      choices: [
        { label: '燃費走行', desc: '4周、燃料の使用 -15%、ペース +0.6%', apply() { mod(c, { pace: 0.6, fuel: 0.85, laps: 4 }); } },
        { label: 'このまま', desc: '燃料を少し多く使う(3周 +8%)', apply() { mod(c, { fuel: 1.08, laps: 3 }); } },
      ],
    }),
    traffic: (race, c) => ({
      who: 'スポッター', title: '周回遅れの集団', icon: 'eye',
      text: 'この先に遅い車がかたまっています。抜き方はどうしますか?',
      choices: [
        { label: '慎重に抜く', desc: '1周 +1.2%、安全', apply() { mod(c, { pace: 1.2, laps: 1 }); } },
        { label: '一気に抜く', desc: '1周 +0.3%。15%で接触', apply() { mod(c, { pace: 0.3, laps: 1 }); if (race.rng() < 0.15) { c.health.aero = Math.max(0.7, c.health.aero - 0.12); PW.addLog(race, 'radio', '接触! カウルが少し割れた', c); } } },
      ],
    }),
    sponsor: (race, c) => {
      const target = Math.max(1, Math.min(8, PW.order(race).indexOf(c)));
      return {
        who: 'チーム代表', title: 'スポンサーからの電話', icon: 'coin',
        text: `スポンサーが「${target}位以内でゴールしたら、ボーナス800万円」と言っています。挑戦しますか?`,
        choices: [
          { label: '引き受ける', desc: `${target}位以内なら +800万円、だめなら評判が下がる`, apply() { race.sponsorDeal = { pos: target, bonus: 800 }; } },
          { label: '断る', desc: '何も起きない', apply() { race.sponsorDeal = { declined: true }; } },
        ],
      };
    },
  };

  PW.bestTireForPlan = function (race) {
    const b = PW.bestTireFor(race.wet);
    return b === 'M' ? 'M' : b;
  };

  PW.makeEvent = function (race, id) {
    const f = EVENTS[id];
    if (!f) return null;
    const ev = f(race, race.player);
    ev.id = id;
    ev.lap = race.leaderLap;
    return ev;
  };
})();
