# UECPort_Samezario（ユーイーシーポート・サメザリオ）

**現地で写真を撮ると、街のエリアが解放される。** 調布市の歴史スポットを実際に巡って遊ぶ、エリア解放型ブラウザマルチプレイゲーム。

調布市 UEC U☆PoC コンテスト（テーマ①：地域の歴史発信）向けのプロトタイプです。
既存のリアルタイム位置情報連動ゲーム **Samether.io（サメザリオ）** の技術基盤を流用し、
「写真照合によるエリア解放」を軸にした地域回遊ゲームへ改修しています。

| | |
|---|---|
| 審査 | 2026-08-28（U☆PoC プロトタイプ審査） |
| 機能完成目標 | 2026-08-16 |
| ベース | Samether.io v1.1 コードベース |

## コンセプト

```
① ステージマップで未解放エリアをタップ
        ↓  解放条件（スポット名・お手本アングル・地図）を表示
② 現地へ行き、指定スポットの写真を撮る
        ↓  位置情報（ジオフェンス）＋ 画像照合（perceptual hash）
③ 照合成功 → エリア解放演出 ＋ 歴史スポットの赤ピンがドロップ
        ↓
④ 解放されたエリアでサメザリオ本編をプレイ／SNSシェアで +100pt
```

判定は「**位置は厳密に、画像はゆるく**」の二段構え。ジオフェンス（スポットから150m以内）で
「現地に行った」ことを担保し、画像照合は「指定アングルで撮った」体験と遠隔地からの適当な写真の排除を担当します。

### ステージ構成（案）

| Stage | エリア | 解放条件（照合スポット） |
|---|---|---|
| 1 | 調布駅 | 初期解放（チュートリアル。駅前の狭域のみ） |
| 2 | 布田駅〜調布市郷土博物館 | 郷土博物館の外観 ※**博物館連携の中核** |
| 3 | 京王多摩川駅 | 多摩川河川敷の指定看板 |
| 4 | 国領駅 | 国領神社（千年乃藤）の看板 |
| 5 | 柴崎駅 | 指定史跡の案内板 |
| 6 | つつじヶ丘駅 | 指定スポット外観 |
| 7 | 西調布・飛田給駅 | 味の素スタジアム周辺の指定モニュメント |
| 8 | **深大寺（ラスボス）** | 深大寺山門。全ステージ解放後に挑戦可能・ボスBot出現 |

スポット・アングルの確定は郷土博物館との意見交換会（8月）のフィードバックを反映するため、
ステージ定義はコードから分離した JSON（`data/stages.master.json`）で管理します。

## 現在の状況

**改修着手前**の状態です。リポジトリには以下が揃っています。

- ✅ ベースとなる Samether.io の実装（Phaser クライアント / Go サーバー / Terraform / CI）
- ✅ 改修の設計ドキュメント一式（`docs/01`〜`08`）
- ✅ データ定義のスキャフォールド（`data/` — 中身は空、これから投入）
- ⬜ ステージシステム・画像照合API・ステージマップ画面（未実装）

タスクは `docs/08_タスクリスト_GitHubIssue用.md` のチェックボックス単位で管理しています。着手はここから選んでください。

## 技術スタック

| レイヤ | 採用技術 |
|---|---|
| クライアント | **Phaser 3 + TypeScript + Vite**（React ではありません） |
| 地図 | MapLibre GL JS + Amazon Location Service（Maps） |
| サーバー | Go（net/http + 自前 WebSocket 実装） |
| データ | Redis（ElastiCache） |
| インフラ | AWS ECS Fargate + ALB + S3/CloudFront / Terraform |
| CI/CD | GitHub Actions（OIDC） |

> `reference/*.jsx` に React ファイルがありますが、これは **UI デザイン共有用のモックであり実装コードではありません**。
> 実装への取り込み・React への移行は禁止です。

## セットアップ

### 前提

- Docker / Docker Compose
- Node.js 20+（クライアント単体開発時）
- Go 1.22+（サーバー単体開発時）

### 起動

```bash
# 全体起動（サーバー + Redis。クライアントは Docker ビルド時に server へ同梱される）
docker compose up --build
# → http://localhost:8080

# クライアント単体（Vite dev server / HMR あり）
cd client && npm install && npm run dev

# サーバー単体
cd server && go run ./cmd/server
```

`.env.example` を `.env` にコピーして環境変数を設定してください。`Makefile` に `make dev-client` / `make dev-server` / `make check` などのショートカットがあります。

> **実機テストは HTTPS 必須。** カメラ（`<input capture>`）と `geolocation` は Secure Context 限定で、
> `http://localhost` のみ例外です。スマホでの動作確認は dev 環境へのデプロイか HTTPS トンネル（Cloudflare Tunnel 等）経由で行ってください。

## ビルド・検証コマンド

変更後は必ず実行し、**型エラー・ビルドエラーがゼロ**になるまでタスクを完了扱いにしないこと。

```bash
cd client && npm run build && npx tsc --noEmit
cd server && go build ./... && go vet ./... && go test ./...
```

## ディレクトリ構成

```
client/                 Phaser 3 + TypeScript クライアント
  src/
    main.ts             Phaser 起動・Scene 登録
    theme.ts            ★新設予定: 色・フォントの単一情報源（カラーコード直書き禁止）
    data/types.ts       型定義
    ui/screens/         1画面 = 1 Scene = 1ファイル
    game/               GameScene / GameState / hud / territory
    network/protocol.ts WSメッセージ型（message.go のミラー）
    storage/            localStorage を関心事ごとに1モジュールが専有
server/                 Go サーバー
  cmd/server/main.go    HTTPルーティング
  internal/ws/          hub.go（765行・追記最小限）, message.go, client.go
  internal/game/        ゲームロジック（loop / shark / territory / food / collision）
  internal/session/     Redis
  internal/stage/       ★新設予定: ステージ定義・stageID→Hub ルーティング
  internal/verify/      ★新設予定: 画像照合API（pHash + ジオフェンス）
  internal/progress/    ★新設予定: ユーザー進捗（Redis）
data/                   マスタ・型定義
  stages.master.json    エリア・スポット・botプロファイル（クライアントへ配布可）
  verify.server.json    参照画像メタ + pHashしきい値（**サーバー専用・秘匿**）
  progress.mock.json    進捗のテスト/シード用モック
  uecport-types.ts      共有型定義
infra/                  Terraform（network / alb / ecs_service / ecr / redis / location / frontend_static / github_oidc）
docs/                   設計ドキュメント（後述）
docs/legacy/            改修前 Samether.io のドキュメント（既存アーキテクチャの理解用）
reference/              UIデザイン共有用の React モック（実装には使わない）
```

## アーキテクチャ

```
[モバイルブラウザ]  Phaser 3 + MapLibre GL JS
   ├── WebSocket (wss)  ゲームプレイ・進捗同期          /ws?stage=N  ★ステージ振り分け
   └── HTTPS            写真アップロード・照合           /api/verify  ★新規
          │
       [ALB]
          │
   [ECS Fargate: Go Server]
   ├── WebSocket Hub / GameLoop 20tick/s      （既存）
   ├── Bot ロジック                            （既存・発火条件のみ調整）
   ├── ★ステージ管理（1プロセス内に stageID→Hub のマップ）
   ├── ★画像照合サービス（perceptual hash 比較）
   └── ★ユーザー進捗管理（解放エリア・ポイント）
          │
   [ElastiCache Redis]
   ├── リーダーボード ZSET  uecport:lb:stage-{id}   ステージ別に分離
   └── ★ユーザー進捗 HASH   uecport:user:{token}
          │
   [Amazon Location Service] Maps … ステージマップ表示
   [S3 + CloudFront]        … フロント配信
```

ゲーム状態の真実は**サーバー**にあり、クライアントは受信して描画するだけです（サーバー権威）。
進捗も同様で、更新は常に「サーバーが作った完全なスナップショットで置換」します。

## 環境変数

| 変数 | 既定値 | 用途 |
|---|---|---|
| `PORT` | `8080` | 待ち受けポート |
| `REDIS_ADDR` | 空（未設定ならインメモリ） | Redis 接続先 |
| `REDIS_PASSWORD` | 空 | Redis パスワード |
| `REDIS_DB` | `0` | Redis DB 番号 |
| `REDIS_PREFIX` | `samezario:leaderboard` | Redis キープレフィックス |
| `ROOM_ID` | ホスト名 or `room-1` | ルーム識別子 |
| `ROOM_CAPACITY` | `50` | 1ルームの最大人数 |
| `INSTANCE_ID` | `ROOM_ID` と同じ | インスタンス識別子 |
| `AWS_REGION` | `ap-northeast-1` | AWS リージョン |
| `LOCATION_MAP_API_KEY` | 空 | 地図表示用のAPIキー（`/api/map-key` で配布。**改修後も継続使用**） |
| `LOCATION_MAP_NAME` | 空 | Maps リソース名。`.env.example`・ECS タスク定義にはあるが現状サーバーは未参照 |
| `LOCATION_TRACKER_NAME` | 空 | GPS距離計測（CP機能）用。**改修で廃止予定** |

## API / WebSocket プロトコル

### HTTP エンドポイント（現状）

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/health` | ヘルスチェック（`ok` を返す） |
| GET | `/healthz` | ルーム情報つきヘルスチェック |
| GET | `/room` | 現在のルームスナップショット |
| GET | `/api/map-key` | Amazon Location Maps の APIキー配布 |
| GET | `/ws` | WebSocket アップグレード |
| GET | `/` | 静的ファイル（ゲームクライアント） |

### 追加予定

| メソッド | パス | 内容 |
|---|---|---|
| POST | `/api/verify` | 写真照合（multipart: `photo` / `stageId` / `lat` / `lon` / `token`）。5MB上限・MIME検証・レートリミット付き。成功時は**更新後の進捗スナップショット全体**を返す |
| GET | `/ws?stage=N` | ステージ別 Hub への振り分け |

### WebSocket メッセージ

現状 — C→S: `join` / `gps` / `touch_input` / `radar` / `evolve` / `dash`、
S→C: `welcome` / `state` / `radar_result` / `evolve_available` / `leaderboard` / `death`

追加予定 — C→S: `share_done`、S→C: `progress` / `points_award` / `join_rejected`
（`join` には `stageId` と `token` を追加。CP系メッセージは削除）

> ⚠️ **`client/src/network/protocol.ts` と `server/internal/ws/message.go` は必ず同一コミットで対編集すること。**
> 片方だけの変更は型エラーが出ず実行時に静かに壊れます。このプロジェクトで最も起きやすい事故です。

## ドキュメント

実装の根拠は以下の順に参照します。**`docs/05` と実コードが最優先**。矛盾を見つけたら独断でどちらかを採用せず報告してください。

| ファイル | 位置づけ |
|---|---|
| [docs/05_改修手順書_MigrationGuide.md](docs/05_改修手順書_MigrationGuide.md) | **実装方針の一次情報** |
| [docs/06_データ構造設計書.md](docs/06_データ構造設計書.md) | 型・状態管理の一次情報 |
| [docs/07_画像照合_技術検証書.md](docs/07_画像照合_技術検証書.md) | 画像照合の一次情報 |
| [docs/08_タスクリスト_GitHubIssue用.md](docs/08_タスクリスト_GitHubIssue用.md) | **作業単位。ここからタスクを選ぶ** |
| [docs/02_UIUX変更要件.md](docs/02_UIUX変更要件.md) | 配色・トンマナ（Hawaiian Lagoon パレット） |
| [docs/01_要件定義書.md](docs/01_要件定義書.md) / [03_開発工程表.md](docs/03_開発工程表.md) / [04_実装アドバイス.md](docs/04_実装アドバイス.md) | 企画検討時の背景資料（食い違う場合は 05 と実コードが正） |
| [AGENTS.md](AGENTS.md) | AIコーディングエージェント向け指示書（`CLAUDE.md` も同内容を参照） |
| [infra/README.md](infra/README.md) | Terraform セットアップとデプロイ |

## マイルストーン

| MS | 期日 | 完了条件 |
|---|---|---|
| M1 基盤・テーマ刷新 | 7/19 | `theme.ts` 一元化、ハワイアン配色が全画面に反映。ステージ定義確定 |
| M2 ステージシステム | 7/26 | マップから Stage 1 に入ってプレイでき、進捗が Redis に保存される |
| M3 写真照合エリア解放 | 8/2 | 写真アップ→照合→エリア解放→赤ピン演出まで一気通貫（開発環境） |
| M4 SNS・演出・ボス | 8/9 | シェア+ボーナス、深大寺ボスステージ、Bot調整、全機能結合 |
| M5 リリース候補 | 8/16 | 本番AWS環境にデプロイ、現地スモークテスト合格 |
| 審査 | 8/28 | 8/17 以降は改修・発表準備のみ |

### 最低限デモが成立するクリティカルパス

```
theme.ts → StageMapScreen骨組み → エリア円描画 → UnlockScreen骨組み
→ ダミー照合(?demo=1) → ProgressStore → 成功画面+赤ピン → シェア+100pt
```

## 開発フロー

1. `docs/08` からタスクを1〜3個選ぶ（⛓印の依存タスクが完了しているか確認）
2. ブランチを切る: `feat/<task-slug>` / `fix/<task-slug>` / `chore/<task-slug>`
3. 実装 → 検証コマンド実行 → PR（**1タスク = 1ブランチ = 1PR**、`docs/08` のチェックボックス1行に対応）
4. `docs/08` の該当行にチェックを入れる

コミットは Conventional Commits（`feat:` `fix:` `refactor:` `docs:` `chore:`）。
`main` への直接コミットと `git push --force` は禁止です。

### コーディング規約（抜粋・詳細は [AGENTS.md](AGENTS.md)）

1. **サーバー権威** — ゲーム状態・進捗の真実はサーバー。クライアントは描画するだけ
2. **`protocol.ts` ⇔ `message.go` は必ず対編集**
3. **進捗更新は `progressStore.replace()` の一本道のみ** — クライアント側の差分加算（`points += 100` 等）を書かない
4. 新機能は `hub.go`（765行）や `GameScene.ts`（982行）に足さず、新パッケージ・新ファイルへ切り出す
5. 色は `theme.ts` 経由で参照する（TSファイルへのカラーコード直書き禁止）
6. 新規ライブラリの導入は原則禁止（必要なら理由を提示して確認を取る）

### 🚫 やってはいけないこと

- React / 他フレームワークへの移行、`reference/*.jsx` の実装への取り込み
- **`data/verify.server.json` の内容（参照画像パス・pHashしきい値）や参照画像そのものを `client/` 配下へ置くこと** — 照合の答えを配ることになります
- 依頼されていない大規模リファクタリング、複数タスクをまたぐ巨大な差分

## PoC としての割り切り

審査（8/28）で動くことを最優先し、以下は意図的にスコープ外としています。

| 項目 | 割り切り |
|---|---|
| 認証 | ユーザー名 + サーバー発行トークンのみ。本格的な認証は行わない |
| 不正対策 | ジオフェンス + pHashしきい値 + レートリミット（30秒に1回）。完全な防止はスコープ外 |
| シェア検証 | X API が有料のため実投稿の検証は不可能。**シェアシートが完了した時点で +100pt** に割り切る（スポットごと1回） |
| 冗長化 | ECS 単一タスク構成。審査期間中の稼働を優先 |
| GPS常時トラッキング | iOS Safari の制約により不採用。位置取得は照合時の単発 `getCurrentPosition` のみ |
| プライバシー | 投稿写真は照合後に破棄（保存する場合も S3 で7日自動削除）。位置情報は照合判定のみに使用 |

デモ会場が調布市外の場合に備え、照合・ジオフェンスをスキップする `?demo=1` フラグを用意します。

## ライセンス

Proprietary
