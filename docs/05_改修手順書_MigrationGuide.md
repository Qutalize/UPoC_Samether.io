# UECPort_Samezario 改修手順書（Migration Guide）

**対象**: Samether.io（サメザリオ）コードベース → UECPort_Samezario（仮）
**作成日**: 2026-07-12 / **想定読者**: 実装担当エンジニア・コーディングAI

> **最重要の前提**: このコードベースは **React ではなく Phaser 3 + TypeScript + Vite（client）/ Go（server）** です。
> `App.tsx` や `tailwind.config.js` は存在しません。本書ではそれらに相当する実ファイル
> （`client/src/main.ts`、新設 `client/src/theme.ts` 等）に対する手順を示します。
> 依頼文中の `MapAreaSelector.tsx` 等の例は、Phaserの流儀に合わせ `StageMapScreen.ts` 等として定義し直しています。

---

## 0. 現状構造の把握（改修前の地図）

```
client/src/
├─ main.ts                    # Phaser起動・シーン登録（React の App.tsx に相当）
├─ theme なし                 # ← 色は全ファイルにハードコード（要新設）
├─ game/
│  ├─ scenes/GameScene.ts     # ゲーム本編 982行
│  ├─ objects/BackgroundShader.ts  # 深海ダーク背景シェーダ
│  ├─ hud/ (XpBar, LeaderboardPanel, RadarRenderer)
│  ├─ territory/ (Manager, Renderer, Cache)
│  └─ input.ts
├─ ui/
│  ├─ screens/ (Login, Home, CP, Guide, Death)
│  └─ styledButton.ts         # 共通ボタン（serif+罫線のダーク様式）
├─ network/ (protocol.ts, websocket.ts, cp-websocket.ts)
└─ storage/ (auth.ts, cp.ts)

server/
├─ cmd/server/main.go         # HTTPルーティング（/ws, /api/map-key, /health…）
├─ internal/
│  ├─ ws/ (hub.go 765行, client.go, message.go, leaderboard.go)
│  ├─ game/ (loop.go, shark.go, territory*.go, food.go, collision.go, trait*.go)
│  ├─ cp/ (handler.go, tracker.go, session.go, store.go, distance.go)  # GPS距離計測
│  ├─ session/ (redis.go, redis_cp.go)
│  └─ static/ (embed.go + ビルド済みclient)
└─ config/config.go

infra/  # Terraform: network, alb, ecs_service, ecr, redis, location, frontend_static, github_oidc
```

---

## 1. ディレクトリ構造の変更方針

### 1.1 変更後の目標構造（差分のみ）

```
client/src/
├─ theme.ts                        ★新設: 色・フォントの単一情報源
├─ data/types.ts                   ★新設: 型定義（data/uecport-types.ts を配置）
├─ data/master.ts                  ★新設: stages.master.json の fetch・freeze・セレクタ
├─ ui/screens/
│  ├─ StageMapScreen.ts            ★新設: エリア選択マップ（にゃんこ大戦争風）
│  ├─ UnlockScreen.ts              ★新設: 写真撮影→照合画面
│  ├─ UnlockSuccessScreen.ts       ★新設: 解放成功＆SNSシェア
│  ├─ CPScreen.ts                  ▲廃止（MapView部分をStageMapScreenに移植後、削除）
│  └─ (Login/Home/Guide/Death)     ●流用・テーマ差替え
├─ services/
│  ├─ photoVerify.ts               ★新設: 撮影・リサイズ・照合API呼び出し
│  ├─ geolocation.ts               ★新設: 単発getCurrentPositionラッパ
│  └─ share.ts                     ★新設: Web Share API / Xインテント
├─ storage/
│  ├─ progress.ts                  ★新設: 解放状態・ポイントのローカルキャッシュ
│  └─ cp.ts                        ▲削除（歩行距離ロジック）
└─ network/
   ├─ protocol.ts                  ●改修: cp_* を削除し stage/progress系を追加
   └─ cp-websocket.ts              ▲削除

server/internal/
├─ stage/                          ★新設パッケージ
│  ├─ stage.go                     # ステージ定義ロード・参照
│  └─ registry.go                  # stageID → Hub のルーティング
├─ verify/                         ★新設パッケージ
│  ├─ handler.go                   # POST /api/verify
│  ├─ phash.go                     # goimagehash照合
│  └─ geofence.go                  # 距離判定（cp/distance.goを移植）
├─ progress/                       ★新設: Redisユーザー進捗
│  └─ store.go
└─ cp/                             ▲削除（distance.goのみverify/geofence.goへ救出）
```

### 1.2 再編の原則
- **画面（Scene）は1画面1ファイル**を維持（既存の `ui/screens/` 流儀を踏襲）
- **副作用ロジックはScene外へ**: カメラ・位置情報・fetchは `services/` に置き、SceneはUIに専念（GameScene肥大化の再発防止）
- **サーバーの新機能は既存パッケージに足さず新パッケージ**（`hub.go` 765行にこれ以上足さない）

---

## 2. 削除・無効化すべきファイル / コード

> **手順の原則**: いきなり `git rm` せず、**Phase 1では「導線の無効化」→ Phase 3完了後に物理削除**。
> 途中でデモが必要になったとき、動く状態を常に保つため。

### 2.1 クライアント側

| # | ファイル | 対応 | 理由・箇所 |
|---|---|---|---|
| D-1 | `client/src/storage/cp.ts` | 削除 | 歩行距離のlocalStorage管理（`loadDailyDistance`/`addDailyDistance`/`calcMaxCp`）。新仕様でGPS距離カウント廃止のため全機能不要 |
| D-2 | `client/src/network/cp-websocket.ts` | 削除 | CP計測専用のWS接続。照合はHTTP APIに移行するため不要 |
| D-3 | `client/src/ui/screens/CPScreen.ts` | **移植後に削除** | ただし55〜行目以降にある **MapLibre初期化・`/api/map-key`取得・マーカー描画のコードは `StageMapScreen.ts` へ移植してから**消すこと（本コードベース唯一の地図実装ノウハウ） |
| D-4 | `client/src/ui/screens/HomeScreen.ts` | 部分削除 | L4 `loadDailyDistance` import、L56付近 `cpText`（本日の歩行距離表示）、L68付近 `cpBtn`（歩行記録ボタン）と対応する `layout()` 内の配置コード |
| D-5 | `client/src/network/protocol.ts` | 部分削除 | `CPStartMsg`/`CPUpdateMsg`/`CPStopMsg`/`CPBalanceMsg` と `CPStartedPayload`〜`CPErrorPayload`、`ClientMsg`/`ServerMsg` union からの当該メンバー、`JoinMsg` の `dailyDistance?` フィールド |
| D-6 | `client/src/main.ts` | 部分削除 | `CPScreen` の import とシーン配列からの除去（Phase 1では配列から外すだけ＝無効化） |

### 2.2 サーバー側

| # | ファイル | 対応 | 理由・箇所 |
|---|---|---|---|
| D-7 | `server/internal/cp/` 一式 | **distance.goのみ救出して削除** | `handler.go`(293行)/`tracker.go`/`session.go`/`store.go` はAWS Location **Tracker** 前提のGPS距離計測。`distance.go` のHaversine実装だけ `internal/verify/geofence.go` へ移植 |
| D-8 | `server/internal/session/redis_cp.go` | 削除 | CP残高のRedis永続化。進捗管理は新設 `progress/store.go` へ（キー設計が違うため流用せず新規） |
| D-9 | `server/internal/ws/hub.go` | 部分削除 | メッセージ分岐 L383/392/402/411 の `case "cp_start" / "cp_update" / "cp_stop" / "cp_balance"` 4ブロックと、CP Handler初期化・resultChan転送処理。`Config` 構造体の `LocationTrackerName` |
| D-10 | `server/internal/ws/message.go` | 部分削除 | `JoinPayload.DailyDistance`、CP系Payload構造体（protocol.tsと**必ず対で**削除） |
| D-11 | `server/config/config.go` | 部分削除 | `LocationTrackerName` の読込。**`LocationMapAPIKey`/`AWSRegion` は残す**（地図表示は継続使用） |

### 2.3 インフラ

| # | 対象 | 対応 |
|---|---|---|
| D-12 | `infra/modules/location/main.tf` | **Tracker リソースのみ削除、Maps/APIキーは残す**。`envs/dev/main.tf` の該当出力・環境変数注入も同期 |
| D-13 | `.env.example` | `LOCATION_TRACKER_NAME` 行を削除 |

### 2.4 「ダークテーマ固有」コードの所在（Phase 1で書き換え対象）

CSSファイルはほぼ無く、**色はTS内にハードコード**されています。全出現箇所:

```
"#030a14"（画面背景）: LoginScreen.ts:29 / HomeScreen.ts:36 / CPScreen.ts:55 / GuideScreen.ts:56
"#001b44"（ゲーム背景）: GameScene.ts:175 / main.ts:12
"#0a1a2a","#152535"（入力欄）: HomeScreen.ts:128,156
0x061520（LBパネル）: LeaderboardPanel.ts:40
0x080808,0x08131b（XPバー）: XpBar.ts:86,112
0x040e18（レーダー）: RadarRenderer.ts:76
0x0c1a24,0x050a0e（ジョイスティック）: input.ts:55,109,113 / GameScene.ts:753,891
'#000000'（Territoryラベル）: TerritoryRenderer.ts:240 / TerritoryManager.ts:216,255
SERIF定数（Times New Roman）: styledButton.ts:3 / 各Screen冒頭
BackgroundShader.ts（暗色ノイズシェーダ全体）
```

---

## 3. 大幅な改修が必要な既存ファイル

### 3.1 `client/src/main.ts`（≒App.tsx 相当）

| 現在 | 置き換え後 |
|---|---|
| `backgroundColor: "#001b44"` | `THEME.bgGame`（theme.ts参照） |
| シーン配列 `[Login, Home, CP, Guide, Game, Death]` | `[Login, Home, StageMap, Unlock, UnlockSuccess, Guide, Game, Death]`（CPScreen除去） |
| 変更なし | Google Fonts（M PLUS Rounded 1c）の読込を `index.html` に追加 |

```ts
// after
import { THEME } from "./theme";
import { StageMapScreen } from "./ui/screens/StageMapScreen";
import { UnlockScreen } from "./ui/screens/UnlockScreen";
import { UnlockSuccessScreen } from "./ui/screens/UnlockSuccessScreen";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: THEME.bgGame,          // "#0096C7"
  scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
  scene: [LoginScreen, HomeScreen, StageMapScreen, UnlockScreen,
          UnlockSuccessScreen, GuideScreen, GameScene, DeathScreen],
};
```

### 3.2 `client/src/ui/styledButton.ts`

| 現在 | 置き換え後 |
|---|---|
| serifテキスト + グロー（「─ PLAY ─」様式） | 角丸ピル型（Graphics矩形 + 丸ゴシックText + シャドウ + 押下スケール）。シグネチャは `(scene, label, opts?: {size?, bg?, fg?})` に簡素化し、呼び出し側の6引数地獄を解消 |

呼び出し箇所（Home/CP/Guide/Login/Death の全ボタン）を新シグネチャに一括置換。**Phase 1ではシグネチャ互換の色差替えだけでも可**（後述フェーズ分け参照）。

### 3.3 `client/src/game/objects/BackgroundShader.ts`

| 現在 | 置き換え後 |
|---|---|
| 暗い深海fbmノイズ（黒〜紺） | fbm/ノイズ関数はそのまま流用し、`main()` 内の色合成だけ変更: ベース `vec3(0.0, 0.59, 0.78)`（#0096C7）→深部 `vec3(0.0, 0.47, 0.71)`（#0077B6）、ノイズを白 `vec3(1.0)` のコースティクス（光模様）加算に反転 |

シェーダ経験者がいなければ**フォールバック**: シェーダ自体を外し、`GameScene` でグラデーションテクスチャ + 泡パーティクル（Phaser標準emitter）に置換しても要件は満たせる（工数1/3）。

### 3.4 `client/src/ui/screens/HomeScreen.ts`

| 現在の処理 | 置き換え後 |
|---|---|
| タイトル「S A M E T H E R . I O」＋歩行距離表示＋歩行記録ボタン | タイトル「UECPort SAMEZARIO 〜調布のうみ〜」＋**「調布のマップへ」ボタン（→StageMapScreen）を最上位CTAに**。PLAYボタンは削除し、プレイ開始はマップ経由に一本化（エリア解放型の導線を強制するため） |
| ルート選択ボタン（attack等4種） | 維持（テーマ色のみ差替え） |

### 3.5 `client/src/network/protocol.ts` ⇔ `server/internal/ws/message.go`（**必ず対で編集**）

| 削除 | 追加 |
|---|---|
| CP系6メッセージ + `dailyDistance` | `JoinMsg` に `stageId: number` と `token: string` を追加。S→C: `progress` メッセージ（**`UserProgress` 全体スナップショット**。`data/uecport-types.ts` §5 参照）、`points_award`（シェアボーナス用）、`join_rejected` |

### 3.6 `server/internal/ws/hub.go`

| 現在の処理 | 置き換え後 |
|---|---|
| CP系4 case + CP Handler連携（D-9） | 削除 |
| `case "join"`（L272〜）: 名前だけで参加 | join時に (1) token→ユーザー解決 (2) **`stageId` が未解放なら `join_rejected` を返す**（progress.Storeを参照）。Hubは自分の担当stageIDをConfigで知っている前提 |
| 1プロセス=1Hub前提 | Hub自体は変えず、**上位に `stage/registry.go` を新設**して stageID→Hub を束ねる（後述4.2） |
| `Config.RedisPrefix` 固定 | ステージ別に `uecport:lb:stage-{id}` を注入（リーダーボード衝突防止） |

### 3.7 `server/cmd/server/main.go`

| 現在の処理 | 置き換え後 |
|---|---|
| `hub := NewHub(...)` を1つ生成し `/ws` 直結 | `stage.LoadStages("stages.master.json")` → 全ステージ分のHubを `registry` に登録 → `/ws?stage=N` で振り分け |
| — | `mux.Handle("/api/verify", verify.NewHandler(...))` を追加（照合API） |
| `/api/map-key` | 維持（StageMapScreenが使用） |

### 3.8 `server/internal/game/loop.go`

| 現在の処理 | 置き換え後 |
|---|---|
| `WorldWidth = 4000.0` 定数 | `World` 構造体のフィールド化し `NewWorld(size float64)` で注入（Stage 1 は 1200、他は 4000、深大寺は 5000 等ステージ定義から） |
| Bot: 手動生成のみ | tick内に自動補充を追加: `if humans > 0 && humans+bots < stage.MinPopulation { spawnBot() }`（`allocBotID`/`randomBotRoute` 流用）。深大寺ステージのみ `spawnBossBot()`（Stage最大・追跡AI） |

---

## 4. 新規に作成すべきファイル群

### 4.1 クライアント

#### `client/src/theme.ts` — 全デザイントークンの単一情報源
```ts
export const THEME = {
  // Hawaiian Lagoon palette
  bgScreen: "#4FC3F7", bgScreenDeep: "#00B4D8",
  bgGame: "#0096C7", bgGameDeep: "#0077B6",
  accent: "#FF6B6B",        // coral: 主要CTA
  sub: "#FFA94D",           // sunset: サブ
  success: "#38D9A9",       // palm: 解放・成功
  danger: "#E63946",        // hibiscus: ボス・赤ピン
  sand: "#FFD97D", sandLight: "#FFE8B0",
  ink: "#073B4C",           // 白パネル上の文字
  locked: "#B0BEC5",        // 未解放マスク
  keio: "#DD0077",          // 路線色
  panel: 0xffffff, panelAlpha: 0.85,   // Phaser Graphics用
  font: "'M PLUS Rounded 1c', sans-serif",
  fontDisplay: "'Baloo 2', 'M PLUS Rounded 1c', sans-serif",
} as const;
```

#### `client/src/data/types.ts` + `client/src/data/master.ts` — 型とマスタ読込
- 型は `data/uecport-types.ts`（データ構造設計書06の成果物）をそのまま `client/src/data/types.ts` へ配置（`AreaMaster` / `SpotMaster` / `UserProgress` / `deriveAreaState`。**エリアIDは数値**、WSペイロード型は規約に従い `network/protocol.ts` へ移す）
- マスタ実体は `data/stages.master.json` を `client/public/stages.master.json` に配置して起動時 fetch → freeze。`data/master.ts` が `getArea(id)` / `getSpot(id)` / `spotsInArea(id)` 等のセレクタを提供する。サーバーは同一ファイルを embed（博物館フィードバックでの差し替えはJSON編集のみで完結）
- 全8エリア構成: 調布(1・初期解放), 京王多摩川(2・郷土博物館で解放), 国領(3), 柴崎(4), つつじヶ丘(5), 西調布(6), 飛田給(7), 深大寺(8・boss)。進行グラフ `1→{2,3,6}`, `3→4→5`, `6→7`, 全踏破で`8`

#### `client/src/ui/screens/StageMapScreen.ts` — エリア選択マップ（本改修の主役）
- **責務**: MapLibre地図の上に解放/未解放エリアを描き、ステージ選択→ゲーム参加 or 解放チャレンジへ分岐
- **移植元**: CPScreen.ts の map初期化・`/api/map-key` fetch・Marker生成コード
- 主要メンバー:
  - `create()`: Phaser Scene上にDOM要素で MapLibre コンテナを重ねる（CPScreenと同方式）
  - `renderStages(progress)`: 解放済み= `fill-color: THEME.bgScreenDeep` のcircle/fillレイヤ、未解放= `THEME.locked` + 錠前Marker、深大寺= 森色 + パルスCSS
  - `onStageTap(stage)`: ボトムシート表示 → 解放済みなら `scene.start("GameScene", { stageId })`、未解放なら `scene.start("UnlockScreen", { stage })`
  - `dropPin(spot)`: 赤ピンMarker + `pinDrop` CSSアニメ（解放直後の再入時に発火）
- **CSS keyframes**（`index.html` or 動的`<style>`注入）: `pinDrop`（落下+2バウンド）、`ripple`

#### `client/src/ui/screens/UnlockScreen.ts` — 写真撮影→照合
- **責務**: お手本アングル提示、カメラ起動、位置取得、照合API呼び出し、結果分岐
- 主要フロー:
  - `openCamera()`: 動的に `<input type="file" accept="image/*" capture="environment">` を生成しclick
  - `services/photoVerify.verify(spot.id, file)` を await → 成功で `scene.start("UnlockSuccessScreen", {stage, photoFile})`
  - 失敗時: エラー種別ごとのガイド表示（`TOO_FAR`→「スポットに近づいてね(あと◯m)」/ `NO_MATCH`→「看板全体が写るように」）

#### `client/src/ui/screens/UnlockSuccessScreen.ts`
- **責務**: 解放演出（フラッシュ・紙吹雪パーティクル・`sfx_levelup.mp3`流用）、シェアCTA
- `onShare()`: `services/share.sharePhoto(photoFile, stage)` → resolve時にWSで `share_done` 送信 → `points_award` 受信でポイント表示更新
- 「マップに戻る」→ StageMapScreen（戻り先で `dropPin` 発火）

#### `client/src/services/photoVerify.ts`
```ts
export async function verify(spotId: string, file: File): Promise<VerifyResponse> {
  const pos = await getCurrentPositionOnce();          // services/geolocation.ts
  const resized = await resizeToJpeg(file, 1280, 0.85); // Canvas縮小（通信量・照合安定性）
  const fd = new FormData();
  fd.append("photo", resized); fd.append("spotId", spotId);
  fd.append("lat", String(pos.lat)); fd.append("lon", String(pos.lon));
  fd.append("token", getToken());
  const res = await fetch("/api/verify", { method: "POST", body: fd });
  return res.json(); // VerifyResponse（uecport-types.ts §6）: 成功時は progress スナップショット同梱
}
```

#### `client/src/services/geolocation.ts`
- `getCurrentPositionOnce(timeoutMs=8000)`: watchPositionは使わない（GPS常時トラッキング廃止方針）。iOSのユーザージェスチャ要件のため**必ずボタンハンドラ内から呼ぶ**こと

#### `client/src/services/share.ts`
- `sharePhoto(file, stage)`: `navigator.canShare?.({files:[file]})` なら Web Share API、非対応なら `https://twitter.com/intent/tweet?...` を `window.open`。ハッシュタグ `#調布のうみ #UECPort`
- 戻り値 Promise は「シェアシート完了」で resolve（実投稿の検証は不可能である旨をコメントに明記）

#### `client/src/storage/progress.ts`
- サーバー `progress` メッセージのローカルキャッシュ + 楽観更新（`unlocked: number[]`, `points: number`）。**真実はサーバー**、これは表示用

### 4.2 サーバー

#### `server/internal/stage/stage.go` + `stages.master.json`
- `Load(path)`: embed or ファイルからステージ定義を読む。**参照画像パス(refs)とpHashしきい値はサーバー定義にのみ持たせ、クライアントへ配布しない**（答えを配らない）

#### `server/internal/stage/registry.go`
```go
type Registry struct{ hubs map[int]*ws.Hub }
func NewRegistry(stages []Stage, base ws.Config) *Registry  // ステージ毎にNewHub+go Run
func (r *Registry) ServeWS(w http.ResponseWriter, req *http.Request) // ?stage=N で振り分け
```

#### `server/internal/verify/`（照合API — 新コアロジック）
- `handler.go`: `POST /api/verify`
  1. `r.ParseMultipartForm(6<<20)`、MIME検証（image/jpeg|png）
  2. レートリミット（token毎に30秒1回、メモリmapで十分）
  3. `geofence.Check(spot, lat, lon, spot.GeofenceM)` → NG なら `{"ok":false,"error":"TOO_FAR","distanceM":…}`
  4. `phash.Match(img, spot.RefHashes, spot.Threshold)` → NG なら `NO_MATCH`
  5. OK → `progress.UnlockBySpot(token, spotID)` → 更新後の `UserProgress` 全体を `{"ok":true,"matchScore":…,"progress":{…}}` で返す（クライアントは `progressStore.replace()` で丸ごと置換）
- `phash.go`: `github.com/corona10/goimagehash`（pure Go・cgo不要）。起動時に参照画像2〜3枚/スポットをハッシュ化してキャッシュ。判定 `dist <= 20`（初期値、現地サンプルで調整）
- `geofence.go`: 旧 `cp/distance.go` のHaversineをそのまま移植

#### `server/internal/progress/store.go`
- Redis: `HSET uecport:user:{token} unlocked "1,2" points 350` / `SADD uecport:shared:{token} {spotId}`
- `UnlockBySpot / IsUnlocked / AddPoints / MarkShared`。既存 `session/redis.go` の接続を共用

---

## 5. スタイリングの改修方針

Tailwind/CSSファイルは存在しないため、**「theme.ts への一元化 → 機械的置換」がグローバルテーマ変更に相当**します。

### Step 5-1: `theme.ts` を作成（4.1のコード）

### Step 5-2: ハードコード色を一括置換
2.4 の出現箇所リストに対して:

| 旧値 | 新値（THEME） |
|---|---|
| `"#030a14"` | `THEME.bgScreen`（`#4FC3F7`） |
| `"#001b44"` | `THEME.bgGame` |
| `"#44ff88"/"#88ffbb"` 系（PLAY緑） | `THEME.accent`（coral） |
| `"#ffaa44"` 系 | `THEME.sub` |
| `0x061520`/`0x080808`/`0x040e18`（暗パネル） | `THEME.panel` + `panelAlpha`（白85%）。**文字色を同時に `THEME.ink` へ**（白パネル×水色文字はコントラスト不足になるため必ずセットで） |
| `SERIF` 定数（5ファイル） | `THEME.font`。定数自体を削除し import に置換 |

grepで検収: `grep -rn "030a14\|001b44\|Times New Roman" client/src` が**0件**になったらStep完了。

### Step 5-3: フォント読込
`client/index.html` の `<head>` に:
```html
<link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;700;800&family=Baloo+2:wght@600;800&display=swap" rel="stylesheet">
```
Phaserはロード前描画でフォールバックすることがあるため、`document.fonts.ready.then(() => game.scale.refresh())` を main.ts に追加。

### Step 5-4: DOM側スタイル（MapLibre領域・アニメーション）
StageMapScreen等のDOM要素用に `client/src/style.css`（新設・Vite import）:
- `.pin-drop { animation: pinDrop .95s cubic-bezier(.3,.8,.3,1) both; }` ほか keyframes（pinDrop / ripple / confetti）
- `@media (prefers-reduced-motion: reduce)` でアニメ停止

---

## 6. 実装の進め方（フェーズ分け）

各Phaseの末尾に**検収条件**を置く。Phase内タスクは並列可能な単位に分割済み。

### Phase 0: 準備（0.5日）
1. `git checkout -b feat/uecport` 作業ブランチ作成
2. `theme.ts` / `data/types.ts` / `stages.master.json`（座標は仮でよい）の骨組みコミット
- **検収**: `npm run build` と `go build ./...` が通る（何も壊していない）

### Phase 1: 不要機能の無効化とテーマ変更（2〜3日）
1. main.ts のシーン配列から CPScreen を外し、HomeScreen の歩行距離UI・歩行記録ボタンを除去（**削除はまだしない**）
2. Step 5-1〜5-3 のテーマ置換（担当を「screens班」「game/hud班」で分けると衝突しない）
3. styledButton をピル型に刷新
4. BackgroundShader の色変更（or パーティクル代替）
- **検収**: 全画面がハワイアン配色で表示され、`grep` 検収0件。CP導線が画面から消えている

### Phase 2: ステージシステム（サーバー先行、3〜4日）
1. [BE] `stage/` パッケージ + `registry.go` + main.go の `/ws?stage=N` 化
2. [BE] `progress/store.go` + join時の未解放拒否 + `progress` メッセージ
3. [BE] loop.go の WorldWidth 注入化 + Bot自動補充
4. [FE] StageMapScreen（CPScreenからMapLibre移植 → ステージ描画 → ボトムシート）
5. [FE] protocol.ts のCP系削除 + stage系追加（message.goと同一PRで）
- **検収**: マップからStage 1に入ってプレイでき、未解放ステージはjoin拒否される。Redisに進捗が残る

### Phase 3: 画像照合 — まずダミー、次に本実装（3〜4日）
1. [FE] UnlockScreen + photoVerify/geolocation サービス（**この時点でサーバーは `{"ok":true}` を返すだけのダミーhandler**）
2. [FE] UnlockSuccessScreen（演出のみ、シェアは仮ボタン）
3. [BE] verify/ 本実装: geofence（distance.go移植）→ phash（goimagehash導入）→ progress連携
4. [BE+現地] 参照画像撮影 → しきい値チューニング（正解20枚/不正解20枚の距離分布を実測）
- **検収**: 開発環境で「現地写真アップ→解放→マップに反映」が一気通貫。ダミー→本実装の切替はhandler内のみで完結している

### Phase 4: シェア・ボス・削除の後始末（2〜3日）
1. [FE] share.ts + `share_done`/`points_award`（[BE] 重複防止付き +100pt）
2. [BE] 深大寺ボスBot（全解放チェック + `spawnBossBot`）
3. **物理削除**: 2.1〜2.3 の削除対象を `git rm`（cp/一式、redis_cp.go、CPScreen、cp-websocket、storage/cp、Tracker関連tf）。`grep -rn "cp_start\|dailyDistance\|Tracker" --include="*.ts" --include="*.go"` が0件
4. デモ用 `?demo=1` フラグ（照合・ジオフェンスをスキップ。審査会場が調布市外の場合の保険）
- **検収**: CI green、本番デプロイ、実機（iOS Safari + Android Chrome）で全フロー通し

### 並列化のヒント（3〜4名想定）
```
        Phase1          Phase2              Phase3            Phase4
A(FE):  screensテーマ → StageMapScreen   → UnlockScreen     → share.ts
B(BE):  (protocol整理)→ registry+progress→ verify本実装     → ボスBot
C(BE/INFRA): hudテーマ→ loop.go/Bot      → しきい値実測     → 削除+デプロイ
D(FE/DES): shader/ボタン→ ボトムシートUI → SuccessScreen演出→ demo flag+QA
```

---

## 付録: 落とし穴チェックリスト
- [ ] protocol.ts と message.go は**必ず同一PRで**対編集（片方だけ変えると実行時に静かに壊れる）
- [ ] `getCurrentPosition` はボタンのイベントハンドラ内から呼ぶ（iOS の権限プロンプト要件）
- [ ] 位置情報・カメラはHTTPS必須。実機テストは dev環境デプロイ or HTTPSトンネル経由
- [ ] 参照画像・しきい値をクライアントに配布しない（照合の答えを配るのと同義）
- [ ] Redisキーは `uecport:` プレフィックスで旧 `samezario:` と分離（旧データ汚染防止）
- [ ] main.ts の横画面ロック（landscape）: StageMapScreen/UnlockScreen は**縦持ち前提のUI**になるため、ロック処理をGameScene入場時のみに移動すること