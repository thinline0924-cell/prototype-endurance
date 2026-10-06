# PROTOTYPE ENDURANCE

ル・マンのプロトタイプカーを操る、ブラウザで遊ぶ3Dレースゲームです。
サーバーのプログラムは使わず、画面のファイルだけで動きます(APIキー・設定は不要)。

---

## 公開のしかた(Render)

パソコンに何かを入れる必要はありません。ブラウザだけでできます。

1. https://dashboard.render.com を開いてログイン
2. 右上の **New +** → **Blueprint** を選ぶ
   (Blueprint = `render.yaml` という設計図を読んで、自動で設定してくれる機能)
3. リポジトリの一覧から **prototype-endurance** を選んで **Connect**
   - 一覧に出てこないときは、**Configure account**(GitHub の設定)を押して、
     Render が `prototype-endurance` を読めるように許可してください
4. 内容を確認して **Apply**(または **Deploy Blueprint**)を押す
5. 1〜2分待って、表示されたアドレス(例:`https://prototype-endurance-xxxx.onrender.com`)を開けば完成です

**入力する設定(環境変数)はありません。**
静的サイト(ファイルを配るだけの公開方法)なので、無料プランでも眠らず、すぐに開けます。

### 自分のパソコンだけで遊ぶ場合

`public/index.html` を Chrome で開くだけでも動きます
(3D表示の部品 Three.js をインターネットから読み込むので、ネット接続は必要です)。

---

## もうひとつのゲーム「PIT WALL ピットウォール物語」(`pitwall/` フォルダ)

運転はせず、**レースエンジニア**としてチームを勝たせるゲームです。
机の上の「飛び出す絵本」の中でレースが進み、あなたは無線とピットの作戦で戦います。

- 天気予報(先ほどあてにならない)・雨・路面の濡れ具合に合わせたタイヤ選び
- 燃料・タイヤの減り・ドライバーの体力・マシンの故障を見ながらピットの予定を立てる
- 「エンジン温度が上昇」「セーフティカー出動」「スポンサーからの電話」などの手紙で判断を迫られる
- ライバル9チームもタイヤ交換・パンク・故障・リタイアをする。タイミングタワーで偵察できる
- 全3戦のシーズン。賞金でエンジン・空力・ピットクルーなどを強くしてチャンピオンを目指す
- 記録はそのブラウザの中(localStorage の `pw.save`)に保存されます

### PIT WALL の公開(Render)

PIT WALL 専用の設計図 **`render-pitwall.yaml`** を使います(中身は `pit-wall-engineer` というサイト1つだけ)。
`render.yaml`(PROTOTYPE ENDURANCE 用)とは別の Blueprint にすることで、おたがいの設定を書きかえません。

1. Render で **New +** → **Blueprint** → リポジトリ **prototype-endurance** を選ぶ
2. **Blueprint Path**(設計図ファイルの場所)に `render-pitwall.yaml` と入力する
3. **Apply** を押す

すでに `render.yaml` のまま Blueprint を作ってしまった場合:
その Blueprint の **Settings** → **Blueprint Path** を `render-pitwall.yaml` に変えて保存し、**Manual Sync** を押してください。

公開後のアドレスは `https://pit-wall-engineer-xxxx.onrender.com` のような形です
(Render の画面で `pit-wall-engineer` を開くと、上の方に表示されます)。入力する設定(環境変数)はありません。

---

## 遊び方

キーボードで操作します。メニュー右上の「操作方法」にも一覧があります。

| キー | 操作 |
|---|---|
| ↑ / W | アクセル |
| ↓ / S | ブレーキ(止まって長押しでバック) |
| ← → / A D | ハンドル |
| E・Shift / Q・Z | シフトアップ / ダウン(マニュアルのとき) |
| C | カメラ切り替え(追従・コクピット・ノーズ・TV) |
| R | コースに戻す |
| Esc | 一時停止 |

### 中身

- マシン4台(すべて実在の車を「モチーフ」にした架空の車):
  ハイパーカー(GR010 風)・ロータリーのグループC(787B 風)・LMP1 ハイブリッド(919 風)・ターボのグループC(962C 風)。
  車ごとにエンジン音とメーター(液晶・アナログ・反射型液晶・VDO 風の丸メーター)が違います
- コース3つ:ル・マン風(13.6km)、スパ風(7.0km)、富士風(4.6km)
- タイヤのすべり、荷重移動、ダウンフォース、ターボの遅れ、ハイブリッドの電気、ブレーキの温度などを計算しています
- ベストラップとゴースト(自分の最速の走り)は、そのブラウザの中に保存されます


---

## ファイルの役割

| ファイル | 役割 |
|---|---|
| `public/index.html` `style.css` | 画面の骨組みと見た目、メニュー |
| `public/js/data.js` | マシンとコースの数値(ここを変えると性能やコースの形が変わる) |
| `public/js/physics.js` | 車の動きの計算 |
| `public/js/track.js` `world.js` | コースのデータと3Dの景色 |
| `public/js/carmodel.js` | 車の3Dモデル |
| `public/js/hud.js` | メーター・ラップタイムなどの表示 |
| `public/js/audio.js` | エンジン音などの合成 |
| `public/js/ai.js` `game.js` `input.js` `effects.js` `textures.js` `util.js` | AI・ゲームの流れ・キー入力・煙や火花・質感・共通の道具 |
| `render.yaml` | Render 用の設計図(PROTOTYPE ENDURANCE:`public/`) |
| `render-pitwall.yaml` | Render 用の設計図(PIT WALL:`pitwall/`)。別の Blueprint として使う |
| `pitwall/index.html` `style.css` | PIT WALL の画面の骨組みと見た目(金縁のパネル・羊皮紙の手紙) |
| `pitwall/js/data.js` | PIT WALL のチーム・コース・タイヤ・強化の数値 |
| `pitwall/js/sim.js` | PIT WALL のレースの計算(天気・タイヤ・燃料・故障・ライバルの作戦) |
| `pitwall/js/events.js` | 無線の手紙(判断カード)の中身 |
| `pitwall/js/scene.js` | 机の上の飛び出す絵本(3D) |
| `pitwall/js/ui.js` `icons.js` | 画面の切りかえ・ボタン・レース中の表示 |
| `CLAUDE.md` | Claude Code が作業するときのルール |
