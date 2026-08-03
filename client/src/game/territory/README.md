# Territory System - Client Implementation

## Overview

Event-driven territory management system for Samezario. Displays territories with level-based color coding to minimize network traffic and improve UX.

## Architecture

```
WebSocket Messages
       ↓
TerritoryManager (handles events)
       ↓
TerritoryCache (filters & stores)
       ↓
TerritoryRenderer (draws)
```

## Key Features

### 1. Event-Driven Updates
- Only territory **creation**, **level change**, and **expiration** events are sent
- No per-tick territory data transmission
- **~160x reduction** in network traffic compared to full state updates

### 2. Level-Based Filtering
- **Green**: Own territories (always visible)
- **Orange**: Higher-level territories (dangerous)
- **Gray**: Same-level territories (optional display)
- **Hidden**: Lower-level territories (not rendered)

### 3. Client-Side Caching
- Territories cached locally after creation
- Only relevant territories stored in memory
- Automatic cleanup on expiration

### 4. Automatic Recalculation
- On player evolution, all territory colors are recalculated
- No server round-trip needed for color updates
- Instant visual feedback

## Usage

### Basic Setup

```typescript
import { TerritoryManager } from './game/territory/TerritoryManager';

// In GameScene.create()
this.territoryManager = new TerritoryManager(this);

// Initialize with player info
this.territoryManager.init(mySharkId, myLevel);
```

### Update Loop

```typescript
// In GameScene.update()
this.territoryManager.update();
```

### WebSocket Integration

```typescript
// In WebSocket message handler
websocket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  // Pass territory messages to manager
  if (message.type.startsWith('territory_') || message.type === 'my_evolution') {
    this.territoryManager.handleMessage(message);
  }
};
```

### Danger Detection

```typescript
// Check if player position is in danger
const dangerTerritory = this.territoryManager.checkDanger(player.x, player.y);

if (dangerTerritory) {
  console.log('Warning: Entered dangerous territory!');
  // Trigger death or warning UI
}
```

## API Reference

### TerritoryManager

#### Methods

- `init(sharkId: string, level: number)`: Initialize with player info
- `update()`: Update and render territories (call every frame)
- `handleMessage(message: any)`: Handle WebSocket messages
- `checkDanger(x: number, y: number)`: Check if position is in dangerous territory
- `getCache()`: Access the territory cache
- `getRenderer()`: Access the renderer
- `enableDebug()`: Show territory IDs and levels
- `destroy()`: Clean up resources

### TerritoryCache

#### Methods

- `setMyShark(sharkId: string, level: number)`: Set player info
- `setMyLevel(level: number)`: Update player level
- `add(territory: Territory)`: Add a territory
- `updateLevel(territoryId: string, newLevel: number)`: Update territory level
- `remove(territoryIds: string[])`: Remove territories
- `get(territoryId: string)`: Get a specific territory
- `getAll()`: Get all territories
- `getDangerousTerritories()`: Get orange territories
- `getMyTerritories()`: Get green territories
- `isPointInDanger(x: number, y: number)`: Check point collision

### TerritoryRenderer

#### Methods

- `update()`: Redraw all territories
- `highlightTerritory(territoryId: string)`: Highlight a territory
- `showDangerAlert(territory: Territory)`: Show danger visual effect
- `debugDraw()`: Draw debug info
- `destroy()`: Clean up resources

## WebSocket Message Types

### territory_created

Sent when a new territory is formed.

```json
{
  "type": "territory_created",
  "payload": {
    "territory": {
      "id": "shark123_territory_1681234567890",
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
}
```

### territory_updated

Sent when a shark evolves and its territories level up.

```json
{
  "type": "territory_updated",
  "payload": {
    "territoryId": "shark123_territory_1681234567890",
    "newLevel": 4,
    "timestamp": 1681234567890
  }
}
```

### territory_expired

Sent when territories expire or are removed.

```json
{
  "type": "territory_expired",
  "payload": {
    "territoryIds": [
      "shark123_territory_1681234567890",
      "shark456_territory_1681234570000"
    ]
  }
}
```

### my_evolution

Sent when the player evolves.

```json
{
  "type": "my_evolution",
  "payload": {
    "newLevel": 3,
    "recalculateTerritories": true
  }
}
```

## Performance Optimization

### Network Traffic

**Before (per-tick updates)**:
- 50 players × 100 trail points × 8 bytes × 20 ticks/sec = **800 KB/sec**

**After (event-driven)**:
- Territory creation: ~1 event/10sec/player = **~5 KB/sec**
- **160x reduction!**

### Rendering

- Uses single Phaser.Graphics object for all territories
- Polygons redrawn only when territories change
- Warning icons use object pooling
- Bounding box optimization for collision checks

### Memory

- Only relevant territories stored (filtered by level)
- Automatic cleanup of expired territories
- Typical memory usage: ~1-5 KB per territory

## Visual Examples

### Color Coding

```
Player Level: 3

Territories:
  - Lv1 territory → Hidden (can walk through safely)
  - Lv2 territory → Hidden (can walk through safely)
  - Lv3 territory → Gray (same level, neutral)
  - Lv4 territory → Orange + ⚠ (dangerous!)
  - Lv5 territory → Orange + ⚠ (dangerous!)
  - Own territory → Green (always safe)
```

### Evolution Event Flow

```
1. Player at Lv2
   ├─ Lv3 territories shown as orange (dangerous)
   └─ Lv1 territories hidden

2. Player evolves to Lv3
   ├─ my_evolution message received
   ├─ Cache recalculates all colors
   ├─ Lv3 territories now gray (neutral)
   └─ Still hidden: Lv1, Lv2

3. Instant visual update (no server round-trip!)
```

## Testing

```typescript
// Test territory filtering
const cache = new TerritoryCache();
cache.setMyShark('player1', 2);

// Add territories
cache.add({ id: 't1', sharkId: 'other', level: 1, ... }); // Hidden
cache.add({ id: 't2', sharkId: 'other', level: 3, ... }); // Orange

expect(cache.getDangerousTerritories().length).toBe(1);
expect(cache.get('t1')).toBeUndefined(); // Filtered out

// Test evolution
cache.setMyLevel(3);
expect(cache.getDangerousTerritories().length).toBe(0); // Lv3 no longer dangerous
```

## Troubleshooting

### Territories not showing
- Check that player info is initialized: `init(sharkId, level)`
- Verify territory level is higher than player level
- Check console for territory creation logs

### Performance issues
- Reduce polygon point count on server (Douglas-Peucker simplification)
- Limit max territories per player
- Increase territory expiration rate

### Memory leaks
- Ensure `destroy()` is called when scene ends
- Check that expired territories are being removed
- Monitor `cache.count()` over time

## Future Enhancements

- [ ] Viewport culling (don't render off-screen territories)
- [ ] Progressive polygon simplification based on zoom level
- [ ] Territory heatmap visualization
- [ ] Mini-map territory overlay
- [ ] Sound effects for territory events
- [ ] Particle effects for territory creation/destruction
