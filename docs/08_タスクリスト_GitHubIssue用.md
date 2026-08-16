# UECPort_Samezario タスクリスト（GitHub Issue用）

**期間**: 7/13(月) 〜 8/16(日) の約4週間 / **体制**: 3〜4名（全員多忙・空き時間駆動）
**粒度**: 全タスク1〜3hで完結するようスライス済み。`[優先度 / 想定時間]` を各行に付与。

> **運用ルール（コピペ前に一読）**
> - 優先度 **高** = これが終わらないと審査デモが成立しない / **中** = デモの説得力が上がる / **低** = 余裕があれば
> - 各タスクは対象ファイルまで特定済み。着手時にIssue化し、担当をassignしてからブランチを切る
> - ⛓ 印は依存タスク（先行タスク完了後に着手）
> - 週次目安: W1=セクション1〜3 / W2=セクション4前半+5前半 / W3=セクション4後半+5後半 / W4=結合・現地テスト・6

---

## 1. 準備・環境構築・デプロイ関連

- [ ] **[高/1h]** リポジトリ整備 — Samether.ioをフォーク（or `feat/uecport` ブランチ運用を決定）し、branch protection・PRテンプレを設定
- [ ] **[高/1h]** Issueラベル作成 — `FE` `BE` `INFRA` `DESIGN` `PM` と `P0(高)` `P1(中)` `P2(低)` を作成し、本リストを一括登録
- [ ] **[高/2h]** ローカル環境の全員疎通 — `docker-compose up` でclient+server+Redisが起動し `localhost:8080` でプレイできることを各自確認（できない人のトラブルシュートまで）
- [ ] **[高/1h]** `.env` 整備 — `.env.example` から `LOCATION_TRACKER_NAME` を削除し、`STAGES_PATH` を追加。README のQuick Startを現状に合わせ更新
- [ ] **[高/2h]** dev環境デプロイ確認 — 既存Terraform（`infra/envs/dev`）で `deploy.sh` が現在も通るか検証。壊れていれば原因をIssue化
- [ ] **[高/1h]** HTTPS実機テスト経路の確立 — dev環境URL or Cloudflare Tunnel で、手元のiPhone/AndroidからHTTPSアクセスできることを確認（カメラ・位置情報はHTTPS必須）
- [ ] **[中/1h]** CI確認 — `.github/workflows/ci.yml` が新ブランチでgreenになることを確認
- [ ] **[中/2h]** S3投稿写真バケット（採用する場合のみ）— Terraformに7日ライフサイクル付きバケット追加 ※ dHash照合はメモリ完結のため**当面スキップ可**
- [ ] **[低/1h]** 検証用スマホの棚卸し — チーム内のiOS/Android実機と OSバージョンを一覧化（テストマトリクス）

## 2. 既存機能の削除・クリーンアップ（Phase 1）

> 方針: **W1では「導線の無効化」まで**。物理削除（`git rm`）はW4の後始末タスクで実施（常にデモ可能な状態を保つため）。

- [ ] **[高/1h]** main.tsからCPScreen無効化 — シーン配列とimportから除去（`client/src/main.ts`）
- [ ] **[高/1h]** HomeScreenのGPS導線除去 — `loadDailyDistance` import・歩行距離テキスト・「歩行記録」ボタンと `layout()` 内の配置コードを削除（`HomeScreen.ts` L4, L56, L68付近）
- [ ] **[高/2h]** protocol.tsのCP系削除 — `CPStartMsg`〜`CPErrorPayload` と union からの除去、`JoinMsg.dailyDistance` 削除 ⛓同一PRで次タスクと対応
- [ ] **[高/2h]** message.goのCP系削除 — `JoinPayload.DailyDistance` とCP系Payload構造体を削除 ⛓protocol.tsと**同一PR必須**
- [ ] **[高/2h]** hub.goのCP分岐削除 — `case "cp_start"/"cp_update"/"cp_stop"/"cp_balance"`（L383〜411）とCP Handler初期化・resultChan転送を削除
- [ ] **[高/1h]** config.goからTracker設定削除 — `LocationTrackerName` の読込削除（**MapAPIKey/AWSRegionは残す**）
- [ ] **[中/1h]** 「人」ルートの無効化(1/2) — クライアント: `protocol.ts` の `SharkRoute` から `"human"` を除去し、HomeScreenのルート選択ボタンから「人」を削除
- [ ] **[中/2h]** 「人」ルートの無効化(2/2) — サーバー: `shark.go` の `RouteHuman` と `NormalizeRoute` の分岐、`food.go` のdiver出現ロジック、`hub.go` の関連分岐を削除。`diver.png`/`human_scream.mp3` は残置でOK（W4で削除）
- [ ] **[中/1h]** cp/distance.goの救出 — Haversine実装を `server/internal/verify/geofence.go` へコピー（テスト `distance_test.go` も移植）⛓verifyパッケージ作成後
- [ ] **[低/1h]** Terraform: Trackerリソース削除 — `infra/modules/location/main.tf` からTrackerのみ削除（Maps/APIキーは残す）

## 3. デザイン・共通UIの改修（Phase 2）

> 注: このコードベースはTailwind/CSSファイルではなく**色がTSにハードコード**。`theme.ts` 新設→機械置換がグローバルテーマ変更に相当。

- [ ] **[高/1h]** `client/src/theme.ts` 新設 — Hawaiian Lagoonパレット（bgScreen #4FC3F7 / bgGame #0096C7 / accent #FF6B6B / success #38D9A9 / danger #E63946 / ink #073B4C / locked #B0BEC5 / keio #DD0077 / font 'M PLUS Rounded 1c'）を定数化
- [ ] **[高/1h]** フォント導入 — `client/index.html` にGoogle Fonts（M PLUS Rounded 1c, Baloo 2）追加、`document.fonts.ready` 後に `game.scale.refresh()` を main.ts へ
- [ ] **[高/2h]** テーマ置換: screens班 — LoginScreen / HomeScreen / GuideScreen / DeathScreen の `#030a14` 等とSERIF定数をTHEME参照に置換
- [ ] **[高/2h]** テーマ置換: game/hud班 — GameScene(L175,753,891) / XpBar / LeaderboardPanel / RadarRenderer / input.ts / main.ts / Territory系ラベル。**暗パネル→白85%パネルは文字色 `THEME.ink` とセットで**
- [ ] **[高/1h]** grep検収 — `grep -rn "030a14\|001b44\|Times New Roman" client/src` が0件になることを確認しPRマージ
- [ ] **[高/2h]** styledButtonピル型化 — 角丸塗りボタン+シャドウ+押下スケールに刷新（`styledButton.ts`）。呼び出し8箇所の引数を新シグネチャに追随
- [ ] **[高/3h]** BackgroundShader明色化 — ベース色を#0096C7系へ、ノイズを白いコースティクス加算に変更（`BackgroundShader.ts` main()内の色合成のみ）。※難航したら次タスクへ切替
- [ ] **[中/2h]** (代替案)シェーダ廃止パス — グラデ背景+泡パーティクル（Phaser emitter）で置換 ※上と排他、どちらか一方
- [ ] **[中/2h]** HomeScreen刷新 — タイトルを「UECPort SAMEZARIO 〜調布のうみ〜」に変更、最上位CTAを「調布のマップへ」ボタンに（遷移先はW2ではプレースホルダでOK）
- [ ] **[中/1h]** 横画面ロックの限定化 — main.tsの landscape ロックをGameScene入場時のみに移動（マップ/照合画面は縦持ちのため）
- [ ] **[低/2h]** サメ画像の彩度一括補正 — ImageMagickで既存7枚を彩度+15%処理し `public/images/` 差替え
- [ ] **[低/2h]** ハワイアン装飾素材 — ヤシ・波・雲のSVG 2〜3点を作成しHomeScreenに配置

## 4. フロントエンド：画面別の実装タスク（Phase 3）

### 4-A. 全体マップ / エリア選択画面（StageMapScreen）

- [ ] **[高/1h]** `data/types.ts` 導入 — 設計書の `uecport-types.ts` をコミット（AreaMaster/SpotMaster/UserProgress/deriveAreaState）
- [ ] **[高/1h]** `stages.master.json` 導入 — 設計書のモックを `client/public/` に配置し、`data/master.ts`（fetch+freeze+セレクタ）を実装
- [ ] **[高/2h]** StageMapScreen骨組み — 新Scene作成、CPScreenからMapLibre初期化+`/api/map-key` fetchコードを移植し、調布市中心の地図が表示されるだけの状態を作る ⛓CPScreen無効化後
- [ ] **[高/2h]** エリア円描画 — 全8エリアをMapLibre circleレイヤで描画。`deriveAreaState()` で unlocked=ラグーン色/unlockable・locked=グレー+錠前Marker/boss-sealed=森色 を出し分け ⛓types導入後
- [ ] **[高/1h]** 京王線ポリライン描画 — 駅間を `THEME.keio` 色のlineレイヤで結ぶ
- [ ] **[高/2h]** ボトムシートUI — エリアタップで下からシート表示（名前・towns・解放条件 or 挑戦ボタン）。DOM要素+CSSで実装
- [ ] **[高/1h]** 分岐遷移 — unlocked→`scene.start("GameScene",{stageId})` / unlockable→`UnlockScreen` / locked・boss-sealed→理由表示のみ
- [ ] **[中/1h]** 初期狭域の表現 — 調布駅エリアに点線内円+「今はここだけ！」ラベル
- [ ] **[中/1h]** 深大寺の特別演出 — 赤グロー(CSS pulse)+「？？？」、全解放時に「🦈👑」表示へ切替
- [ ] **[中/1h]** 解放済みエリアの赤ピン常設表示 — clearedSpotsのスポットにピンMarker
- [ ] **[低/1h]** 進捗サマリHUD — 「エリア解放 n/8」「保有pt」チップをマップ上部に表示

### 4-B. ゲームプレイ画面（GameScene改修）

- [ ] **[高/1h]** stageId受け渡し — `scene.start` のdataでstageIdを受け、`/ws?stage=N` で接続するようwebsocket.tsのURL組立を変更
- [ ] **[高/1h]** join拒否ハンドリング — `join_rejected` 受信時にマップへ戻しトースト表示 ⛓5-B join検証後
- [ ] **[高/1h]** ポイントHUD追加 — progressStore購読で保有ptチップを常時表示（`hud/` に新コンポーネント）
- [ ] **[中/1h]** bot名札の出し分け — `StateSharkView.isBot` を見てbotは `THEME.sunset` 名札に（GameState.ts / Shark.ts）⛓5-B isBot送出後
- [ ] **[中/2h]** ボス演出 — `isBoss` のサメに名前「深大寺のヌシ」表示+登場時BGM切替 or 画面フラッシュ ⛓5-BボスBot後
- [ ] **[低/2h]** エリア別背景トーン — theme=river/forest等でBackgroundShaderのベース色を微変化

### 4-C. スポット解放（画像照合）画面（UnlockScreen）

- [ ] **[高/1h]** `services/camera.ts` 実装 — 技術検証書§1.2の `capturePhoto()` をコミット（iOSキャンセルfallback込み）
- [ ] **[高/1h]** `services/imageResize.ts` 実装 — §4.2の `resizeToJpeg()`（EXIF回転正規化込み）
- [ ] **[高/1h]** `services/geolocation.ts` 実装 — `getCurrentPositionOnce(timeout)` + エラー種別→ユーザー向け文言の変換表
- [ ] **[高/2h]** UnlockScreen骨組み — 新Scene: スポット名・お手本画像・撮影ガイド・撮影ボタンのレイアウト（stages.master.jsonのsampleImageUrl使用）
- [ ] **[高/2h]** 撮影→プレビュー→照合のステートマシン — idle/capturing/locating/verifying/error/success の遷移実装（照合はまずダミー呼び出し）⛓5-Aダミー照合後
- [ ] **[高/1h]** エラーガイドUI — TOO_FAR「あと◯m」/ NO_MATCH「看板全体が入るように」/ 権限拒否「設定から許可」の3パターン表示
- [ ] **[中/1h]** 照合中ローディング演出 — 波形プログレスバー+「お手本と照合中…」

### 4-D. 解放成功＆SNSシェア画面（UnlockSuccessScreen）

- [ ] **[高/2h]** UnlockSuccessScreen骨組み — 「エリア解放！」バッジ+紙吹雪（Phaser emitter）+`sfx_levelup.mp3` 再生。scene dataで {spot, unlockedAreaId, photoFile} を受領
- [ ] **[高/2h]** 赤ピンドロップアニメーション — ミニマップ(MapLibre or 静的SVG)上にピンMarkerを `pinDrop` CSS keyframes（落下+2バウンド）+ ripple波紋で出現させる
- [ ] **[高/1h]** `services/share.ts` 実装 — `navigator.share({files})` + 非対応時Xインテントfallback、ハッシュタグ `#調布のうみ #UECPort`
- [ ] **[高/1h]** シェアボタンUI — 「Xでシェアして+100ptゲット！」→ share resolve後に `share_done` WS送信、シェア済みなら「✓+100pt GET」表示に切替 ⛓5-Cボーナス後
- [ ] **[中/1h]** 「マップに戻る」導線 — StageMapScreenへ戻り、解放直後エリアで `dropPin` 演出を発火（scene data渡し）

## 5. ロジック・データ管理の実装タスク

### 5-A. 画像照合（クライアント→サーバーの段階移行）

- [ ] **[高/2h]** `services/imageHash.ts` 実装 — 技術検証書§2.1の computeDHash / hammingDistance / matchAny をユニットテスト付きでコミット
- [ ] **[高/1h]** ダミー照合モード — `?demo=1` で2秒待ち→必ず成功する `verifyPhoto()`（verifier.ts）。**W2はこれで全画面フローを結合**
- [ ] **[高/2h]** 参照ハッシュの生成スクリプト — 参照画像フォルダ→ `{spotId: ["0x..."]}` JSONを吐くNodeスクリプト（正規化経路はimageHash.tsと同一関数を使うこと）
- [ ] **[高/2h]** 本照合の結線 — verifier.tsをダミー→dHash実装に切替、ジオフェンス判定（geolocation+haversine）を前段に追加
- [ ] **[中/3h]** [BE] `/api/verify` サーバー実装 — verify/handler.go（multipart 5MB上限・MIME検証・レートリミット30秒）+ goimagehash照合 ※クライアント照合からの移行先
- [ ] **[中/2h]** [BE] 参照画像のembed+起動時ハッシュ化 — verify.server.jsonとrefs/を読み込みキャッシュ
- [ ] **[高/3h]** しきい値チューニング — 現地写真（正解/不正解 各10枚以上）を照合ラボに通し、スポット別しきい値を決定して記録 ⛓現地撮影後
- [ ] **[高/2h]** 【現地】参照画像撮影 — 全9スポットで時間帯2条件×2〜3枚を撮影（2名で東西分担、移動込み半日→タスクとしては1人2hずつ計上）

### 5-B. 進捗・ステージ管理（State更新）

- [ ] **[高/2h]** `storage/progress.ts` 実装 — ProgressStore（シングルトン+EventEmitter、書き込みは `replace()` のみ、localStorageキャッシュ `uecport_progress_v1`）
- [ ] **[高/2h]** [BE] `stage/` パッケージ — stages.master.jsonのロードと `registry.go`（stageID→Hubマップ、`/ws?stage=N` 振り分け）
- [ ] **[高/2h]** [BE] `progress/store.go` — Redis HSET/SADD（unlocked/points/clearedSpots/shared）と UnlockBySpot / AddPoints / MarkShared
- [ ] **[高/1h]** [BE] join時の解放検証 — 未解放stageへのjoinに `join_rejected` を返す（hub.go L272〜のjoin分岐に追加）
- [ ] **[高/1h]** [BE] `progress` スナップショット配信 — join成功時とprogress_get受信時に UserProgress全体を送出（message.go+protocol.ts対編集）
- [ ] **[高/1h]** 照合成功→replace結線 — VerifyResponse.progress を `progressStore.replace()` に渡す1本道を実装（クライアントでの差分加算は書かない）
- [ ] **[中/1h]** [BE] World可変サイズ化 — `WorldWidth` 定数を `NewWorld(size)` 引数化し、ステージ定義のworldSizeを注入（loop.go）
- [ ] **[中/2h]** [BE] bot自動補充 — tick内で `humans>0 && humans+bots<minPopulation` のときspawnBot（既存allocBotID/randomBotRoute流用）+ `isBot` をStateSharkViewで送出
- [ ] **[中/2h]** [BE] 深大寺ボスBot — botProfiles.bossから「深大寺のヌシ」（stage最大・追跡AI・討伐500pt）を生成、`isBoss` 送出
- [ ] **[中/1h]** [BE] リーダーボードのステージ分離 — RedisPrefixを `uecport:lb:stage-{id}` に

### 5-C. SNSシェアボーナス

- [ ] **[高/1h]** [BE] `share_done` ハンドラ — SADDで重複チェック→+100pt→`points_award`+`progress` 再配信（hub.goに1 case追加、message.go/protocol.ts対編集）
- [ ] **[高/1h]** クライアント結線 — share.ts成功→`share_done` 送信→`progress` 受信でreplace→HUD/成功画面の表示更新
- [ ] **[低/1h]** シェア文言の最終化 — 博物館側とハッシュタグ・文面を合意し定数化

## 6. PM・ドキュメント関連

- [ ] **[高/1h]** 週次30分定例の設定 — 空き時間申告→本リストからのタスク割当を回す運用開始（Discord等で非同期でも可）
- [ ] **[高/2h]** 提出用要件定義書の整理 — 既存ドキュメント(01〜07)を提出フォーマットに合わせ再編・最新化
- [ ] **[高/2h]** ピッチ資料の構成案 — 課題(調布の歴史認知)→解決(チェックイン型陣取り)→デモ動線→技術(既存基盤流用+dHash)→効果測定、の骨子スライド
- [ ] **[高/2h]** デモシナリオ台本 — `?demo=1` を使った会場デモの操作手順書（誰が操作しても同じ流れになるレベル）
- [ ] **[中/2h]** デモ動画撮影 — 現地テスト時に「実際に博物館前で解放する」実写+画面録画（ピッチの説得力の要）
- [ ] **[中/1h]** 郷土博物館への確認事項リスト — スポット選定・解説文・撮影可否・ハッシュタグの4点をメール1本にまとめ送付
- [ ] **[中/1h]** プライバシー文言 — 「位置情報は照合判定のみ・写真は保存しない/7日削除」をガイド画面と資料に記載
- [ ] **[中/2h]** 現地スモークテスト計画 — W4週末に全員で調布集合、テスト項目表（機種×スポット×合否）を事前作成
- [ ] **[低/1h]** README刷新 — プロジェクト名・コンセプト・スクリーンショット差替え
- [ ] **[低/2h]** 既知バグ・審査後TODOリスト — 提出時点の割り切り事項を正直に一覧化（審査Q&A対策を兼ねる）

---

## 集計と負荷の目安

| セクション | タスク数 | 合計時間(概算) |
|---|---|---|
| 1. 準備・環境 | 9 | 12h |
| 2. 削除・クリーンアップ | 10 | 14h |
| 3. デザイン共通 | 12 | 20h |
| 4. 画面別FE | 24 | 34h |
| 5. ロジック・データ | 19 | 32h |
| 6. PM・ドキュメント | 10 | 16h |
| **計** | **84** | **約128h** |

4人×週8h×4週=128h とちょうど釣り合うため、**「低」優先度（計約15h）は最初から捨てる前提**で回すこと（実働は必ず見積を超過する）。「高」だけ完遂すればデモは成立する構成にしてある。

### 最低限デモが成立するクリティカルパス（迷ったらこの順）
```
theme.ts → StageMapScreen骨組み → エリア円描画 → UnlockScreen骨組み
→ ダミー照合(?demo=1) → ProgressStore → 成功画面+赤ピン → シェア+100pt
```
このパス上のタスク（約30h）だけでも「マップ→撮影→解放→シェア」の通しデモが可能。本照合・サーバー移行・ボスは、その後の上積み。