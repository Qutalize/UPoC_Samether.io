# Territory System Design

## 概要

領域システムは、サメの軌跡が閉じた形を作ると、その内側が領域として確立される機能です。
通信量を削減するため、将来的には **イベント駆動型** のアプローチへ移行する想定です。
現在の実装では、通常の `state` メッセージにも `territories` が含まれており、完全なイベント駆動配信にはまだ移行していません。

## 基本仕様

### 表示ルール

1. **自分の領域**: 緑色で表示
2. **危険な領域**: 自分より高レベルのサメの領域をオレンジ色で表示
3. **無関係な領域**: 自分より低レベルのサメの領域は表示しない（踏んでも問題ない）

### 領域の強さ

```
領域の強さ = サメの進化レベル (1-5)

例:
- シュモクザメ (Lv1) の領域
- メガロドン (Lv5) の領域
```

### 侵入ルール

| 自分のレベル | 相手の領域レベル | 結果 |
|------------|----------------|------|
| Lv1 | Lv2+ | 即死 (オレンジ表示) |
| Lv3 | Lv4+ | 即死 (オレンジ表示) |
| Lv3 | Lv1-2 | 無影響 (非表示) |
| Lv3 | Lv3 | 通常の衝突判定 (灰色表示) |

## イベント駆動型アーキテクチャ（将来フェーズ）

### なぜイベント駆動？

❌ **毎tick送信する場合の問題**:
- 全プレイヤーの軌跡座標を毎回送信 → 帯域幅の浪費
- 50人プレイヤー × 軌跡100点 × 20tick/sec = 膨大なデータ

✅ **イベント駆動へ移行した場合の利点**:
- 領域が確立された時のみ送信できる
- クライアント側でキャッシュして再利用できる
- プレイヤーの進化時のみ再計算できる

> 注: この節は目標アーキテクチャです。現状は互換性と実装都合のため、領域データは通常の `state` 更新にも含まれます。

---

## データ構造

### Server Side

```go
// Territory represents a closed area owned by a shark
type Territory struct {
    ID          string    `json:"id"`          // "shark123_territory_5"
    SharkID     string    `json:"sharkId"`     // Owner shark ID
    Level       int       `json:"level"`       // Shark level (1-5)
    Polygon     []Point   `json:"polygon"`     // Closed polygon points
    BoundingBox BBox      `json:"bbox"`        // For quick collision check
    CreatedAt   int64     `json:"createdAt"`   // Timestamp
    ExpiresAt   int64     `json:"expiresAt"`   // Auto-expire time
}

type Point struct {
    X float64 `json:"x"`
    Y float64 `json:"y"`
}

type BBox struct {
    MinX, MinY, MaxX, MaxY float64
}

// TerritoryManager manages all active territories
type TerritoryManager struct {
    territories map[string]*Territory
    byShark     map[string][]*Territory  // SharkID -> Territories
    spatial     *QuadTree                // Spatial index for fast lookup
}
```

### Client Side

```typescript
interface Territory {
  id: string;
  sharkId: string;
  level: number;
  polygon: Point[];
  color: 'green' | 'orange' | 'gray';  // クライアント側で計算
}

class TerritoryCache {
  private territories: Map<string, Territory>;
  private myLevel: number;
  
  // 危険な領域のみフィルタリング
  getDangerousTerritories(): Territory[] {
    return Array.from(this.territories.values())
      .filter(t => t.level > this.myLevel)
      .map(t => ({...t, color: 'orange'}));
  }
  
  // 自分の領域
  getMyTerritories(mySharkId: string): Territory[] {
    return Array.from(this.territories.values())
      .filter(t => t.sharkId === mySharkId)
      .map(t => ({...t, color: 'green'}));
  }
}
```

---

## WebSocket Protocol

### 新しいメッセージタイプ

#### 1. territory_created (Server → Client)

領域が新規作成された時に送信。

```json
{
  "type": "territory_created",
  "territory": {
    "id": "shark123_territory_5",
    "sharkId": "shark123",
    "level": 3,
    "polygon": [
      {"x": 100, "y": 200},
      {"x": 150, "y": 250},
      {"x": 120, "y": 280},
      {"x": 100, "y": 200}
    ],
    "expiresAt": 1681234600000
  }
}
```

**送信条件**:
- サメの軌跡が閉じた時
- 閉じた領域の面積が最小値以上

**送信対象**:
- 全クライアント（領域は共有情報）

---

#### 2. territory_updated (Server → Client)

既存領域のレベルが変更された時（サメが進化した時）。

```json
{
  "type": "territory_updated",
  "territoryId": "shark123_territory_5",
  "newLevel": 4,
  "timestamp": 1681234567890
}
```

**送信条件**:
- 領域の所有者サメが進化した時
- 既存の全領域のレベルを一括更新

**クライアント側の処理**:
```typescript
onTerritoryUpdated(msg: TerritoryUpdatedMessage) {
  const territory = this.cache.get(msg.territoryId);
  if (territory) {
    territory.level = msg.newLevel;
    
    // 自分のレベルと比較して色を再計算
    if (territory.sharkId === this.mySharkId) {
      territory.color = 'green';
    } else if (msg.newLevel > this.myLevel) {
      territory.color = 'orange';  // 危険！
    } else {
      // 非表示（低レベル領域は描画しない）
      this.cache.delete(msg.territoryId);
    }
  }
}
```

---

#### 3. territory_expired (Server → Client)

領域が時間経過で消滅した時。

```json
{
  "type": "territory_expired",
  "territoryIds": ["shark123_territory_5", "shark456_territory_3"]
}
```

**送信条件**:
- 軌跡の古い部分が消えて領域が無効化された時
- サメが死亡した時（全領域を削除）

---

#### 4. my_evolution (Client → Server → Client)

自分が進化した時、既存領域の表示を再計算するトリガー。

**Server → Client**:
```json
{
  "type": "my_evolution",
  "newLevel": 3,
  "recalculateTerritories": true
}
```

**クライアント側の処理**:
```typescript
onMyEvolution(msg: EvolutionMessage) {
  this.myLevel = msg.newLevel;
  
  // 全領域の色を再計算
  this.cache.forEach(territory => {
    if (territory.sharkId === this.mySharkId) {
      territory.color = 'green';
    } else if (territory.level > this.myLevel) {
      territory.color = 'orange';  // 新たに危険になった
    } else if (territory.level === this.myLevel) {
      territory.color = 'gray';    // 同レベル
    } else {
      // 低レベル領域は非表示
      this.cache.delete(territory.id);
    }
  });
}
```

---

## サーバー側実装

### 領域検出アルゴリズム

```go
// DetectTerritories checks if shark's trail forms a closed area
func (tm *TerritoryManager) DetectTerritories(shark *Shark) {
    trail := shark.GetTrail()  // 軌跡の座標列
    
    // 自己交差を検出
    intersections := findSelfIntersections(trail)
    
    for _, intersection := range intersections {
        polygon := extractPolygon(trail, intersection)
        
        // 最小面積チェック
        if calculateArea(polygon) < MinTerritoryArea {
            continue
        }
        
        // 領域を作成
        territory := &Territory{
            ID:       fmt.Sprintf("%s_territory_%d", shark.ID, time.Now().Unix()),
            SharkID:  shark.ID,
            Level:    shark.Level,
            Polygon:  polygon,
            BoundingBox: calculateBBox(polygon),
            CreatedAt:   time.Now().Unix(),
            ExpiresAt:   time.Now().Add(TerritoryLifetime).Unix(),
        }
        
        tm.Add(territory)
        
        // 全クライアントに送信
        tm.hub.Broadcast(Message{
            Type:      "territory_created",
            Territory: territory,
        })
    }
}
```

### 領域侵入判定

```go
// CheckTerritoryCollision checks if a shark entered a dangerous territory
func (tm *TerritoryManager) CheckTerritoryCollision(shark *Shark) *Territory {
    // バウンディングボックスで高速フィルタリング
    candidates := tm.spatial.Query(shark.X, shark.Y)
    
    for _, territory := range candidates {
        // 自分の領域はスキップ
        if territory.SharkID == shark.ID {
            continue
        }
        
        // レベル比較
        if territory.Level <= shark.Level {
            continue  // 低レベル領域は無視
        }
        
        // ポリゴン内判定
        if pointInPolygon(shark.X, shark.Y, territory.Polygon) {
            return territory  // 危険な領域に侵入！
        }
    }
    
    return nil
}

// InstantKill kills a shark that entered a stronger territory
func (g *GameLoop) InstantKill(shark *Shark, territory *Territory) {
    // 即死処理
    shark.Die()
    
    // クライアントに通知
    g.hub.SendToClient(shark.ClientID, Message{
        Type:        "death",
        Reason:      "territory_invasion",
        TerritoryID: territory.ID,
        FinalScore:  shark.Score,
    })
}
```

### 進化時の領域レベル更新

```go
// OnSharkEvolution updates all territories owned by a shark
func (tm *TerritoryManager) OnSharkEvolution(sharkID string, newLevel int) {
    territories := tm.byShark[sharkID]
    
    for _, territory := range territories {
        territory.Level = newLevel
        
        // 全クライアントに通知
        tm.hub.Broadcast(Message{
            Type:        "territory_updated",
            TerritoryID: territory.ID,
            NewLevel:    newLevel,
            Timestamp:   time.Now().UnixMilli(),
        })
    }
}
```

---

## クライアント側実装

### レンダリング最適化

```typescript
class TerritoryRenderer {
  private cache: TerritoryCache;
  private graphics: Phaser.GameObjects.Graphics;
  private mySharkId: string;
  private myLevel: number;
  
  update() {
    this.graphics.clear();
    
    // 1. 自分の領域（緑）
    this.renderMyTerritories();
    
    // 2. 危険な領域（オレンジ）
    this.renderDangerousTerritories();
    
    // 3. 同レベルの領域（灰色）- オプション
    // this.renderNeutralTerritories();
  }
  
  private renderMyTerritories() {
    const myTerritories = this.cache.getMyTerritories(this.mySharkId);
    
    this.graphics.lineStyle(3, 0x00ff00, 0.8);  // 緑
    this.graphics.fillStyle(0x00ff00, 0.2);     // 半透明緑
    
    for (const territory of myTerritories) {
      this.drawPolygon(territory.polygon);
    }
  }
  
  private renderDangerousTerritories() {
    const dangerous = this.cache.getDangerousTerritories();
    
    this.graphics.lineStyle(3, 0xff6600, 0.9);  // オレンジ
    this.graphics.fillStyle(0xff6600, 0.3);     // 半透明オレンジ
    
    for (const territory of dangerous) {
      this.drawPolygon(territory.polygon);
      
      // 警告アイコンを表示
      this.drawWarningIcon(territory);
    }
  }
  
  private drawPolygon(points: Point[]) {
    if (points.length < 3) return;
    
    this.graphics.beginPath();
    this.graphics.moveTo(points[0].x, points[0].y);
    
    for (let i = 1; i < points.length; i++) {
      this.graphics.lineTo(points[i].x, points[i].y);
    }
    
    this.graphics.closePath();
    this.graphics.strokePath();
    this.graphics.fillPath();
  }
  
  private drawWarningIcon(territory: Territory) {
    // 領域の中心に警告マークを表示
    const center = calculateCentroid(territory.polygon);
    
    // "⚠" アイコンまたはテキスト
    this.scene.add.text(center.x, center.y, '⚠', {
      fontSize: '32px',
      color: '#ff6600',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);
  }
}
```

### WebSocketイベント処理

```typescript
class TerritoryManager {
  private cache: TerritoryCache;
  private renderer: TerritoryRenderer;
  
  handleMessage(msg: any) {
    switch (msg.type) {
      case 'territory_created':
        this.onTerritoryCreated(msg.territory);
        break;
        
      case 'territory_updated':
        this.onTerritoryUpdated(msg);
        break;
        
      case 'territory_expired':
        this.onTerritoryExpired(msg.territoryIds);
        break;
        
      case 'my_evolution':
        this.onMyEvolution(msg);
        break;
    }
  }
  
  private onTerritoryCreated(territory: Territory) {
    // キャッシュに追加
    this.cache.add(territory);
    
    // 表示判定
    if (territory.sharkId === this.mySharkId) {
      // 自分の領域
      this.renderer.addTerritory({...territory, color: 'green'});
    } else if (territory.level > this.myLevel) {
      // 危険な領域
      this.renderer.addTerritory({...territory, color: 'orange'});
      this.showWarning('危険な領域が出現しました！');
    }
    // それ以外（低レベル）は無視
  }
  
  private onTerritoryUpdated(msg: TerritoryUpdatedMessage) {
    const territory = this.cache.get(msg.territoryId);
    if (!territory) return;
    
    const oldLevel = territory.level;
    territory.level = msg.newLevel;
    
    // レベル変更による表示更新
    if (territory.sharkId === this.mySharkId) {
      // 自分の領域は常に緑
      this.renderer.updateColor(territory.id, 'green');
    } else {
      // 危険度が変わった
      if (oldLevel <= this.myLevel && msg.newLevel > this.myLevel) {
        // 安全 → 危険
        this.renderer.updateColor(territory.id, 'orange');
        this.showWarning(`領域 ${territory.id} が危険になりました！`);
      } else if (oldLevel > this.myLevel && msg.newLevel <= this.myLevel) {
        // 危険 → 安全（表示を消す）
        this.renderer.removeTerritory(territory.id);
      }
    }
  }
  
  private onTerritoryExpired(territoryIds: string[]) {
    for (const id of territoryIds) {
      this.cache.remove(id);
      this.renderer.removeTerritory(id);
    }
  }
  
  private onMyEvolution(msg: EvolutionMessage) {
    const oldLevel = this.myLevel;
    this.myLevel = msg.newLevel;
    
    console.log(`進化: Lv${oldLevel} → Lv${msg.newLevel}`);
    
    // 全領域を再評価
    this.recalculateAllTerritories();
  }
  
  private recalculateAllTerritories() {
    this.cache.forEach(territory => {
      if (territory.sharkId === this.mySharkId) {
        // 自分の領域
        this.renderer.updateColor(territory.id, 'green');
      } else if (territory.level > this.myLevel) {
        // 危険な領域
        this.renderer.updateColor(territory.id, 'orange');
      } else {
        // 低レベル領域は非表示
        this.renderer.removeTerritory(territory.id);
      }
    });
  }
}
```

---

## 通信量の最適化

### 削減効果の試算

#### ❌ 毎tick送信の場合
```
プレイヤー数: 50人
軌跡ポイント数: 平均100点/人
送信頻度: 20 tick/sec

データサイズ = 50 × 100 × 8 bytes (x,y) × 20 = 800KB/sec
```

#### ✅ イベント駆動の場合
```
領域作成: 1回/10秒/人 → 50 × 100 × 8 / 10 = 4KB/sec
領域更新: 進化時のみ → 10 bytes × 稀
領域削除: 1回/30秒/人 → 無視できる

合計: ~5KB/sec (160倍の削減!)
```

### さらなる最適化

1. **視界範囲フィルタリング**
```typescript
// 画面外の領域は送信しない
if (!isInViewport(territory.bbox, player.viewport)) {
  continue;
}
```

2. **ポリゴン簡略化**
```go
// Douglas-Peucker アルゴリズムで頂点数を削減
simplifiedPolygon := douglasPeucker(polygon, tolerance)
```

3. **バイナリプロトコル** (Phase 4+)
```
JSON (100点): ~1600 bytes
MessagePack:  ~800 bytes
カスタム:      ~400 bytes
```

---

## パフォーマンス考慮事項

### サーバー側

- **空間インデックス**: QuadTreeで領域検索を O(log N) に
- **軌跡の間引き**: 5フレームに1回だけ記録
- **領域の有効期限**: 古い領域を自動削除

### クライアント側

- **オブジェクトプーリング**: Graphicsオブジェクトを再利用
- **レイヤー分離**: 領域レイヤーを別にして再描画を最小化
- **ダーティフラグ**: 変更があった時だけ再描画

---

## 実装ロードマップ

### Phase 4.1: 基礎実装
- [ ] 軌跡記録システム
- [ ] 自己交差検出アルゴリズム
- [ ] 領域作成イベント
- [ ] クライアント側キャッシュ

### Phase 4.2: レベル連動
- [ ] 領域レベル管理
- [ ] 進化時の更新イベント
- [ ] クライアント側色分け

### Phase 4.3: 衝突判定
- [ ] 領域侵入判定
- [ ] 即死処理
- [ ] 警告UI

### Phase 4.4: 最適化
- [ ] 空間インデックス
- [ ] ポリゴン簡略化
- [ ] 視界範囲フィルタリング

---

## テストケース

```typescript
describe('Territory System', () => {
  it('自分より高レベルの領域はオレンジで表示', () => {
    const myLevel = 2;
    const territory = { level: 3, sharkId: 'other' };
    expect(getColor(territory, myLevel)).toBe('orange');
  });
  
  it('自分より低レベルの領域は非表示', () => {
    const myLevel = 3;
    const territory = { level: 1, sharkId: 'other' };
    expect(shouldDisplay(territory, myLevel)).toBe(false);
  });
  
  it('進化時に領域の色が再計算される', () => {
    manager.myLevel = 2;
    manager.evolve(3);
    
    // Lv3の領域が危険でなくなる
    const territory = manager.cache.get('lv3_territory');
    expect(territory.color).not.toBe('orange');
  });
});
```

---

## まとめ

### 設計の利点

✅ **通信量削減**: 毎tickの送信 → イベント駆動（160倍削減）  
✅ **スケーラビリティ**: 50人でも100人でも対応可能  
✅ **クライアント最適化**: ローカルキャッシュで高速描画  
✅ **UX向上**: 危険な領域のみ表示して視認性UP  

### 技術的ポイント

- イベント駆動アーキテクチャ
- クライアント側キャッシング
- レベルベースのフィルタリング
- 空間インデックスによる高速検索
