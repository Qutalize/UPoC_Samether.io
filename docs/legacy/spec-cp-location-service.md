# CP機能 AWS Location Service 統合仕様書

**バージョン**: 1.0
**作成日**: 2026-04-18
**対象**: Samether.io Phase 2 — CP (チャージポイント) のサーバーサイド化 + 地図表示

---

## 1. 概要

### 1.1 目的

現在クライアントのみで完結しているCP機能を、AWS Location Service の **Tracker** と **Maps** を用いてサーバーサイドに移行する。

| 現状の課題 | 本仕様での解決策 |
|---|---|
| CP計算がクライアント側のみ（改ざん可能） | Tracker で位置履歴をAWSに記録し、サーバー側で距離を算出 |
| 歩行ルートが可視化されない | Maps で歩行軌跡を地図上に表示 |
| デバイス間でCPが共有されない | サーバー側でユーザーごとにCP残高を管理 |
| スタート/ゴールの2点間直線距離のみ | Tracker の位置履歴から実際の歩行経路に近い距離を算出 |

### 1.2 利用する AWS サービス

| サービス | 用途 |
|---|---|
| **Amazon Location Service — Tracker** | デバイスの位置を定期記録し、サーバー側で移動距離を算出 |
| **Amazon Location Service — Maps** | 歩行ルートの地図可視化 (MapLibre GL JS) |

---

## 2. アーキテクチャ

### 2.1 全体構成

```
┌───────────────────────────────────────────────────────────┐
│  Client (Phaser + MapLibre GL JS)                         │
│                                                           │
│  CPScreen                                                 │
│  ├─ [スタート] → navigator.geolocation.watchPosition()    │
│  │               位置を定期的に WebSocket で送信           │
│  ├─ [ゴール]   → 計測停止リクエスト送信                    │
│  └─ MapView    → MapLibre GL JS で歩行ルートを地図表示    │
│                                                           │
│  通信: WebSocket (/ws)                                    │
└──────────────┬────────────────────────────────────────────┘
               │ WebSocket
               ▼
┌───────────────────────────────────────────────────────────┐
│  Server (Go on ECS Fargate)                               │
│                                                           │
│  CP Handler                                               │
│  ├─ cp_start   → セッション開始、DeviceID 紐づけ          │
│  ├─ cp_update  → BatchUpdateDevicePosition (Tracker)      │
│  ├─ cp_stop    → GetDevicePositionHistory で距離算出      │
│  │               CP 加算 → 結果をクライアントに返却       │
│  └─ cp_balance → 現在の CP 残高を返却                     │
│                                                           │
│  API Key Provider                                         │
│  └─ /api/map-key → Maps API キーをクライアントに提供      │
└──────────────┬────────────────────────────────────────────┘
               │ AWS SDK (Go v2)
               ▼
┌───────────────────────────────────────────────────────────┐
│  AWS Location Service                                     │
│                                                           │
│  Tracker: "samether-tracker"                              │
│  ├─ PositionFiltering: AccuracyBased                      │
│  ├─ BatchUpdateDevicePosition (位置記録)                   │
│  └─ GetDevicePositionHistory  (履歴取得 → 距離算出)       │
│                                                           │
│  Maps: "samether-map"                                     │
│  ├─ MapStyle: VectorEsriNavigation (or Open Data)         │
│  └─ クライアントが MapLibre GL JS 経由でタイル取得        │
└───────────────────────────────────────────────────────────┘
```

### 2.2 データフロー（CP計測シーケンス）

```
Client                    Server (Go)              AWS Location Service
  │                          │                            │
  │── cp_start ──────────────▶                            │
  │                          │ セッション生成              │
  │◀── cp_started ───────────│                            │
  │                          │                            │
  │ watchPosition() 開始     │                            │
  │                          │                            │
  │── cp_update {lat,lon} ──▶│                            │
  │                          │── BatchUpdateDevice ──────▶│
  │                          │◀── OK ────────────────────│
  │   (5秒間隔で繰り返し)    │                            │
  │── cp_update {lat,lon} ──▶│                            │
  │       ...                │       ...                  │
  │                          │                            │
  │── cp_stop ───────────────▶                            │
  │                          │── GetDevicePositionHistory▶│
  │                          │◀── positions[] ───────────│
  │                          │ 距離算出 → CP計算           │
  │                          │ CP残高更新                  │
  │◀── cp_result ────────────│                            │
  │   {distance, earned,     │                            │
  │    total, positions[]}   │                            │
  │                          │                            │
  │ MapLibre で               │                            │
  │ positions[] を描画        │                            │
```

---

## 3. プロトコル定義

### 3.1 Client → Server メッセージ

既存の WebSocket プロトコル (`type` + `payload`) に準拠する。

#### `cp_start` — 計測開始

```typescript
{
  type: "cp_start",
  payload: {}
}
```

- サーバーは計測セッションを生成し、DeviceID（`cp-{playerId}-{timestamp}`）を割り当てる
- 既に計測中の場合はエラーを返す

#### `cp_update` — 位置更新

```typescript
{
  type: "cp_update",
  payload: {
    lat: number,    // 緯度 (-90 ~ 90)
    lon: number,    // 経度 (-180 ~ 180)
    acc: number     // 精度 (メートル)
  }
}
```

- クライアントは `watchPosition()` で取得した位置を **5秒間隔** でサーバーに送信
- サーバーは `BatchUpdateDevicePosition` で Tracker に記録
- 精度 (`acc`) が 50m を超える場合はサーバー側で棄却

#### `cp_stop` — 計測終了

```typescript
{
  type: "cp_stop",
  payload: {}
}
```

- サーバーは `GetDevicePositionHistory` で位置履歴を取得し、累積距離を算出
- CP を加算し、結果をクライアントに返却

#### `cp_balance` — 残高照会

```typescript
{
  type: "cp_balance",
  payload: {}
}
```

### 3.2 Server → Client メッセージ

#### `cp_started` — 計測開始応答

```typescript
{
  type: "cp_started",
  payload: {
    sessionId: string   // 計測セッションID
  }
}
```

#### `cp_progress` — 計測中の進捗通知

```typescript
{
  type: "cp_progress",
  payload: {
    pointsRecorded: number,  // 記録済み位置数
    estimatedDist: number    // 暫定推定距離 (m)
  }
}
```

- `cp_update` を受信するたびに返却
- クライアントは計測中のUIに暫定距離を表示

#### `cp_result` — 計測完了結果

```typescript
{
  type: "cp_result",
  payload: {
    distance: number,     // 総移動距離 (m)
    earned: number,       // 獲得CP
    total: number,        // CP残高
    positions: Array<{    // 歩行軌跡（地図描画用）
      lat: number,
      lon: number,
      ts: string          // ISO 8601 タイムスタンプ
    }>
  }
}
```

#### `cp_balance_result` — 残高応答

```typescript
{
  type: "cp_balance_result",
  payload: {
    total: number
  }
}
```

#### `cp_error` — エラー

```typescript
{
  type: "cp_error",
  payload: {
    code: string,     // "NOT_MEASURING" | "ALREADY_MEASURING" | "GPS_REJECTED" | "INTERNAL"
    message: string
  }
}
```

---

## 4. サーバー実装

### 4.1 新規パッケージ構成

```
server/internal/
├── cp/
│   ├── handler.go      // WebSocket メッセージハンドラ
│   ├── session.go      // 計測セッション管理
│   ├── tracker.go      // AWS Location Tracker クライアント
│   ├── distance.go     // 位置履歴からの距離算出 (Haversine)
│   └── store.go        // CP残高の永続化 (Redis)
```

### 4.2 計測セッション (`session.go`)

```go
type CPSession struct {
    SessionID   string
    PlayerID    string
    DeviceID    string        // Tracker 上のデバイスID
    StartedAt   time.Time
    LastUpdate  time.Time
    PointCount  int
    LastPos     *Position     // 暫定距離計算用
    EstDist     float64       // 暫定推定距離
    Active      bool
}
```

- セッションはインメモリで管理（サーバープロセス内の `sync.Map`）
- セッションの最大時間: **60分**（超過で自動終了）
- 1ユーザーにつき同時1セッションのみ

### 4.3 Tracker 連携 (`tracker.go`)

#### 位置記録

```go
func (t *TrackerClient) UpdatePosition(deviceID string, lat, lon float64) error {
    _, err := t.client.BatchUpdateDevicePosition(ctx, &location.BatchUpdateDevicePositionInput{
        TrackerName: aws.String(t.trackerName),
        Updates: []types.DevicePositionUpdate{{
            DeviceId:   aws.String(deviceID),
            Position:   []float64{lon, lat},  // [経度, 緯度] の順
            SampleTime: aws.Time(time.Now()),
        }},
    })
    return err
}
```

**注意**: Location Service の座標順は `[longitude, latitude]`（GeoJSON 準拠）

#### 位置履歴取得

```go
func (t *TrackerClient) GetHistory(deviceID string, from, to time.Time) ([]Position, error) {
    out, err := t.client.GetDevicePositionHistory(ctx, &location.GetDevicePositionHistoryInput{
        TrackerName: aws.String(t.trackerName),
        DeviceId:    aws.String(deviceID),
        StartTimeInclusive: aws.Time(from),
        EndTimeExclusive:   aws.Time(to),
    })
    // out.DevicePositions → []Position に変換
    return positions, err
}
```

### 4.4 距離算出 (`distance.go`)

```go
// 位置履歴の隣接点間の Haversine 距離を累積
// 静止フィルタ・速度フィルタ適用済み
func CalcTotalDistance(positions []Position) float64 {
    n := len(positions)
    if n < 2 {
        return 0
    }

    // 隣接点間距離を事前計算
    segments := make([]float64, n-1)
    for i := 0; i < n-1; i++ {
        segments[i] = haversine(
            positions[i].Lat, positions[i].Lon,
            positions[i+1].Lat, positions[i+1].Lon,
        )
    }

    total := 0.0
    for i, d := range segments {
        // 速度フィルタ: 50km/h超 (69m/5秒) の区間を棄却
        if d > maxSegmentM {
            continue
        }
        // 静止フィルタ: 連続3点の2区間がいずれも2m未満なら静止とみなす
        if i > 0 && segments[i-1] < stationaryThresholdM && d < stationaryThresholdM {
            continue
        }
        total += d
    }
    return total
}
```

- Tracker の `AccuracyBased` フィルタリングにより、GPS ノイズによる距離膨張を抑制
- **静止フィルタ**: 連続する3点間の2区間がいずれも **2m 未満** の場合、静止状態（GPSドリフト）とみなし距離を加算しない
  - GPSドリフトによる偽の距離蓄積（静止時に最大 ~2,000m/時間）を抑制
  - 閾値 2m は一般的なGPSドリフト量（1〜5m）に基づく
- 追加の不正検知:
  - 隣接2点間の速度が **50 km/h 超** の場合、その区間を棄却（車両移動等の排除）
  - 5秒間隔で 50km/h = 約69m。69m 超の移動は棄却

### 4.5 CP残高管理 (`store.go`)

```go
// Redis キー: "cp:{playerId}"
func (s *CPStore) AddCP(playerID string, earned int) (int, error)
func (s *CPStore) GetCP(playerID string) (int, error)
func (s *CPStore) ConsumeCP(playerID string, amount int) (int, error)
```

- Redis が利用可能な場合は Redis に永続化
- Redis 未設定時はインメモリ（既存の leaderboard と同じフォールバック戦略）

### 4.6 CP計算ルール

| パラメータ | 値 |
|---|---|
| 蓄積レート | 50m = 1 CP |
| 1セッション上限 | 500 CP |
| セッション最大時間 | 60分 |
| 位置送信間隔 | 5秒 |
| 最小精度閾値 | 50m (これを超える測位は棄却) |
| 最大移動速度 | 50 km/h (超過区間は棄却) |
| CP残高上限 | 10,000 CP |

**変更点**: 1セッション上限を現行の 100 CP → 500 CP に引き上げ。
Tracker による継続的な位置追跡が可能になったため、より長距離の歩行を正しく反映できる。

---

## 5. クライアント実装

### 5.1 新規依存パッケージ

```json
{
  "dependencies": {
    "maplibre-gl": "^4.x"
  }
}
```

MapLibre GL JS は Amazon Location Service Maps のレンダリングに使用する。

### 5.2 画面構成 (CPScreen リニューアル)

CPScreen を以下の2つの表示モードに拡張する。

```
┌─────────────────────────────────────┐
│         C P  獲 得                  │
│─────────────────────────────────────│
│  所持 CP: 1,234                     │
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │     地図エリア               │    │
│  │     (MapLibre GL JS)        │    │
│  │                             │    │
│  │   ● 現在地                  │    │
│  │   ─── 歩行ルート           │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  暫定距離: 123m  (記録: 25点)       │
│                                     │
│      ─  スタート  ─                 │
│      [    ゴール    ]               │
│                                     │
│  [ ホームへ戻る ]                   │
└─────────────────────────────────────┘
```

### 5.3 地図の実装方法

Phaser のシーンと地図を共存させるため、**DOM Overlay** 方式を採用する。

```
┌─ Phaser Canvas (背景 + UI テキスト) ───────────┐
│                                                 │
│  ┌─ HTML div#map-container (position:absolute) ┐│
│  │  MapLibre GL JS がレンダリング               ││
│  └──────────────────────────────────────────────┘│
│                                                 │
│  Phaser UI テキスト (CP, ステータス等)           │
└─────────────────────────────────────────────────┘
```

- CPScreen の `create()` で `document.createElement("div")` で地図コンテナを作成
- CPScreen の `shutdown()` で地図コンテナを破棄
- 地図のサイズはゲームキャンバスの中央 80% x 40% 程度

### 5.4 Maps API キーの取得

```typescript
// サーバーから Maps API キーを取得
const res = await fetch("/api/map-key");
const { mapName, apiKey, region } = await res.json();
```

- API キーはクライアントに直接埋め込まない
- サーバーの `/api/map-key` エンドポイントから取得
- API キーは Amazon Location Service の Maps リソースに対する読み取り専用

### 5.5 MapLibre GL JS 初期化

```typescript
import maplibregl from "maplibre-gl";

const map = new maplibregl.Map({
  container: "map-container",
  style: `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${mapName}/style-descriptor?key=${apiKey}`,
  center: [lon, lat],   // 現在地
  zoom: 16,             // 歩行向けズームレベル
  attributionControl: true,
});
```

### 5.6 歩行ルートの描画

計測完了時に `cp_result` の `positions[]` を GeoJSON LineString として地図に描画する。

```typescript
function drawRoute(map: maplibregl.Map, positions: {lat: number, lon: number}[]): void {
  const coordinates = positions.map(p => [p.lon, p.lat]);

  map.addSource("route", {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates,
      },
      properties: {},
    },
  });

  map.addLayer({
    id: "route-line",
    type: "line",
    source: "route",
    paint: {
      "line-color": "#44ff88",   // CPテーマカラー (緑)
      "line-width": 4,
      "line-opacity": 0.8,
    },
  });
}
```

### 5.7 計測中のリアルタイム表示

計測中は `watchPosition()` で取得した位置をリアルタイムで地図上に反映する。

```typescript
// watchPosition コールバック内
function onPositionUpdate(lat: number, lon: number): void {
  // 1. 地図の中心を現在地に追従
  map.setCenter([lon, lat]);

  // 2. 現在地マーカーを更新
  currentMarker.setLngLat([lon, lat]);

  // 3. 軌跡ラインに座標を追加
  trackCoords.push([lon, lat]);
  updateTrackLine(map, trackCoords);

  // 4. WebSocket で cp_update 送信 (5秒スロットル)
  if (now - lastSendTime >= 5000) {
    ws.send({ type: "cp_update", payload: { lat, lon, acc } });
    lastSendTime = now;
  }
}
```

---

## 6. インフラ変更

### 6.1 Terraform 追加リソース

既存の `infra/modules/location/` に Maps リソースを追加する。

```hcl
# 既存: Tracker
resource "aws_location_tracker" "main" {
  tracker_name      = "samether-tracker"
  position_filtering = "AccuracyBased"
}

# 新規: Maps
resource "aws_location_map" "main" {
  map_name = "samether-map"
  configuration {
    style = "VectorEsriNavigation"
  }
}

# 新規: Maps 用 API キー
resource "aws_location_api_key" "map_key" {
  key_name = "samether-map-key"
  restrictions {
    allow_actions  = ["geo:GetMap*"]
    allow_resources = [aws_location_map.main.arn]
  }
  no_expiry = true
}
```

### 6.2 ECS タスクロールの権限

既存の `geo:*` ポリシーで Tracker と Maps の両方をカバー済み。
追加の権限変更は不要。

### 6.3 環境変数の追加

| 変数名 | 値 | 用途 |
|---|---|---|
| `LOCATION_TRACKER_NAME` | `samether-tracker` | **既存** |
| `LOCATION_MAP_NAME` | `samether-map` | Maps リソース名 |
| `LOCATION_MAP_API_KEY` | (API キーの値) | クライアントに提供する Maps API キー |
| `AWS_REGION` | `ap-northeast-1` | Location Service のリージョン |

---

## 7. サーバー新規エンドポイント

### 7.1 `GET /api/map-key`

Maps API キーをクライアントに提供する REST エンドポイント。

**レスポンス:**
```json
{
  "mapName": "samether-map",
  "region": "ap-northeast-1",
  "apiKey": "v1.public.xxxxx..."
}
```

- 認証不要（API キーは Maps の読み取り専用で、リソース制限済み）
- キーは環境変数から取得

---

## 8. Go サーバー依存関係の追加

```
go get github.com/aws/aws-sdk-go-v2
go get github.com/aws/aws-sdk-go-v2/config
go get github.com/aws/aws-sdk-go-v2/service/location
```

---

## 9. 不正防止策

| 脅威 | 対策 |
|---|---|
| クライアント側でのCP改ざん | CP計算をサーバー側で実施。クライアントのlocalStorageは表示用キャッシュのみ |
| 偽の位置情報送信 | Tracker の AccuracyBased フィルタ + 速度チェック (50 km/h 上限) |
| 連続セッションによるCP無限獲得 | セッション間クールダウン: 最低 **10秒** |
| 車・電車での移動 | 速度 50 km/h 超の区間を棄却 |
| 同一地点での反復 | 移動距離 10m 未満のセッションは CP 0 |

---

## 10. エラーハンドリング

| 状況 | サーバーの挙動 | クライアントの挙動 |
|---|---|---|
| GPS 権限なし | — | 「位置情報の許可が必要です」表示 |
| 精度が 50m 超 | `cp_update` を棄却（記録しない） | 「GPS精度が低い状態です」表示 |
| セッション中に切断 | 60秒後にセッション自動終了。記録済みの位置から距離算出しCPを付与 | 再接続時に `cp_balance` で残高同期 |
| Tracker API エラー | `cp_error` (code: "INTERNAL") を返却 | エラーメッセージ表示、リトライ促す |
| 計測中でないのに `cp_stop` | `cp_error` (code: "NOT_MEASURING") | ステータス表示をリセット |

---

## 11. 画面遷移

```
LoginScreen
    │
    ▼
HomeScreen
    ├─── [Play] ──────▶ GameScene ──▶ DeathScreen ──▶ HomeScreen
    │
    └─── [CP 獲得] ──▶ CPScreen (リニューアル)
                         │
                         ├─ [スタート] → 地図表示 + 計測開始
                         │               ↓
                         │    計測中（地図にリアルタイムルート表示）
                         │               ↓
                         ├─ [ゴール]   → 結果表示 (距離, CP, 歩行ルート地図)
                         │
                         └─ [ホームへ戻る] → HomeScreen
```

---

## 12. 実装タスク

### Phase 2-A: サーバーサイド CP (Tracker)

- [ ] `server/internal/cp/` パッケージ作成
- [ ] AWS SDK Go v2 の依存追加
- [ ] Tracker クライアント実装 (`tracker.go`)
- [ ] 距離算出ロジック実装 (`distance.go`)
- [ ] CP残高の Redis 永続化 (`store.go`)
- [ ] WebSocket メッセージハンドラ実装 (`handler.go`)
- [ ] Hub への CP メッセージルーティング追加
- [ ] `/api/map-key` エンドポイント追加
- [ ] 不正防止ロジック (速度チェック、クールダウン)
- [ ] ユニットテスト (`distance_test.go`, `session_test.go`)

### Phase 2-B: クライアント地図表示 (Maps)

- [ ] `maplibre-gl` パッケージ追加
- [ ] CPScreen の DOM Overlay 地図コンテナ実装
- [ ] MapLibre GL JS 初期化（API キーサーバーから取得）
- [ ] 計測中のリアルタイムルート表示
- [ ] 計測完了後の歩行ルート描画
- [ ] 現在地マーカー表示
- [ ] `cp_update` の 5秒スロットル送信
- [ ] `cp_progress` / `cp_result` メッセージの処理
- [ ] `storage/cp.ts` をサーバー残高のキャッシュに変更
- [ ] CPScreen の shutdown 時の地図コンテナ破棄

### Phase 2-C: インフラ

- [ ] Terraform に Maps リソース追加
- [ ] Terraform に API キーリソース追加
- [ ] ECS タスク定義に環境変数追加 (`LOCATION_MAP_NAME`, `LOCATION_MAP_API_KEY`)
- [ ] デプロイ確認

---

## 13. コスト見積もり

| リソース | 料金体系 | 想定月間コスト |
|---|---|---|
| Tracker (位置記録) | $0.05 / 1,000 位置更新 | ~$5 (100ユーザー x 1日2セッション x 平均72更新) |
| Maps (タイル取得) | $0.04 / 1,000 タイルリクエスト | ~$4 (100ユーザー x 1日2回 x 平均500タイル) |
| **合計** | | **~$9/月** (100ユーザー規模) |

- 無料枠: Tracker 月間 10,000 位置更新、Maps 月間 50,000 タイルリクエスト (3ヶ月間)
- ハッカソン規模では無料枠内に収まる見込み
