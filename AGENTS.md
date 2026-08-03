# AGENTS.md — UECPort_Samezario

このリポジトリで作業する AI コーディングエージェント（Codex / Cursor / その他）向けの指示書。
Claude Code は `CLAUDE.md` を読むが、内容は本ファイルと同一の方針に従うこと。

`docs/legacy/` は改修前の Samether.io のドキュメント。
既存アーキテクチャの理解にのみ使い、今回の仕様は docs/ 直下を参照すること。
---

## プロジェクト概要

調布市 U☆PoC コンテスト向けのプロトタイプ。既存のブラウザマルチプレイゲーム「Samether.io（サメザリオ）」を改修し、**現地で写真を撮って画像照合すると駅エリアが解放される**エリア解放型ゲーム「UECPort_Samezario」にする。審査は 8/28、機能完成目標は 8/16。

## 技術スタック（重要）

- **クライアント: Phaser 3 + TypeScript + Vite。React ではない。**
- サーバー: Go（net/http + gorilla/websocket 相当の自前実装）
- データ: Redis / インフラ: AWS ECS Fargate + Terraform

`reference/*.jsx` に React ファイルがあるが、これは**UIデザイン共有用のモックであり実装コードではない**。実装に取り込まないこと。React への移行は禁止。

## セットアップ

```bash
docker compose up                       # 全体起動（client + server + redis）
cd client && npm install && npm run dev # クライアント単体
cd server && go run ./cmd/server        # サーバー単体
```

## ビルド・検証コマンド（変更後は必ず実行）

```bash
cd client && npm run build && npx tsc --noEmit
cd server && go build ./... && go vet ./... && go test ./...
```

型エラー・ビルドエラーがゼロになるまでタスクを完了扱いにしない。

## ディレクトリ構成

```
client/src/
  main.ts              Phaser起動・Scene登録
  theme.ts             色・フォントの単一情報源（カラーコード直書き禁止）
  data/types.ts        型定義
  ui/screens/*.ts      1画面 = 1 Scene = 1ファイル
  game/                GameScene / GameState / hud / territory
  network/protocol.ts  WSメッセージ型（message.go のミラー）
  storage/*.ts         localStorage を関心事ごとに1モジュールが専有
server/
  cmd/server/main.go   HTTPルーティング
  internal/ws/         hub.go（765行・追記最小限）, message.go, client.go
  internal/game/       ゲームロジック
  internal/session/    Redis
docs/                  設計ドキュメント（後述）
data/                  型定義・マスタJSON
```

## ドキュメント

実装の根拠は以下の順に参照する。`docs/05` と実コードが最優先。

| ファイル | 位置づけ |
|---|---|
| `docs/05_改修手順書_MigrationGuide.md` | **実装方針の一次情報** |
| `docs/06_データ構造設計書.md` | 型・状態管理の一次情報 |
| `docs/07_画像照合_技術検証書.md` | 画像照合の一次情報 |
| `docs/08_タスクリスト_GitHubIssue用.md` | **作業単位。ここからタスクを選ぶ** |
| `docs/02_UIUX変更要件.md` | 配色・トンマナ |
| `docs/01, 03, 04` | 企画検討時の背景資料（食い違う場合は 05 と実コードが正） |

ドキュメント間に矛盾を見つけたら、独断でどちらかを採用せず報告する。

## コーディング規約・守るべき既存パターン

1. **サーバー権威**: ゲーム状態の真実はサーバー。クライアントは受信して描画するだけ。
2. **`client/src/network/protocol.ts` と `server/internal/ws/message.go` は必ず同一コミットで対編集する。** 片方だけの変更は型エラーが出ず実行時に壊れる。最頻出の事故。
3. **進捗データの更新は `progressStore.replace()` の一本道のみ。** クライアント側での差分加算（`points += 100` 等）を書かない。サーバー/照合APIが返す完全なスナップショットで置換する。
4. 新機能は `hub.go`（765行）や `GameScene.ts`（982行）に足さず、新パッケージ・新ファイルに切り出す。
5. 色は `theme.ts` 経由で参照する。TSファイルへのカラーコード直書きは禁止。
6. 新規ライブラリの導入は原則禁止。必要な場合は理由を提示して確認を取る。

## 禁止事項

- React / 他フレームワークへの移行、`reference/*.jsx` の実装への取り込み
- `protocol.ts` と `message.go` の片方だけの編集
- `data/verify.server.json` の内容（参照画像パス・pHashしきい値）や参照画像そのものを `client/` 配下へ配置すること — **照合の答えを配ることになる**
- 依頼されていない大規模リファクタリング
- 一度に複数タスクをまたぐ巨大な差分の作成
- `main` への直接コミット、`git push --force`

## Git 運用

- ブランチ: `feat/<task-slug>` / `fix/<task-slug>` / `chore/<task-slug>`
- コミット: Conventional Commits（`feat:` `fix:` `refactor:` `docs:` `chore:`）
- 1タスク = 1ブランチ = 1PR。`docs/08` のチェックボックス1行に対応させる

## 作業の進め方

1. `docs/08` からタスクを1〜3個選ぶ（⛓印の依存タスクが完了しているか確認）
2. **実装前に、変更するファイル一覧と方針を提示して承認を得る**
3. 実装 → 検証コマンド実行 → 結果を報告
4. `docs/08` の該当行にチェックを入れる

一度に大量のタスクをまとめて実装しない。セクション単位で区切ること。

## 判断基準

- 実装方針に迷ったら、**既存コードの流儀に合わせる方**を選ぶ
- ドキュメントとコードが食い違う場合はコードが正しい
- 品質とスピードのトレードオフでは「**8/28 の審査で動くこと**」を優先。割り切りは記録に残す
- 仕様が曖昧なら推測で進めず質問する（特にステージ構成・スポット選定は郷土博物館との調整事項）