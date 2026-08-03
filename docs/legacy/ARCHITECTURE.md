# Samezario Architecture

## System Overview

Samezario is a real-time multiplayer game built with a client-server architecture, optimized for low-latency WebSocket communication and horizontal scalability.

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  (Mobile Browser - Phaser 3 + TypeScript + WebSocket)       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ WSS (WebSocket Secure)
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                     AWS Application Load Balancer            │
│              (Sticky Sessions + WebSocket Support)           │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────┬──────────────┐
          │                       │              │
┌─────────▼─────────┐   ┌────────▼────────┐   ┌─▼────────────┐
│  ECS Task 1       │   │  ECS Task 2     │   │  ECS Task N  │
│  (Go Server)      │   │  (Go Server)    │   │  (Go Server) │
│  - WebSocket Hub  │   │  - WebSocket Hub│   │  - WS Hub    │
│  - Game Loop      │   │  - Game Loop    │   │  - Game Loop │
│  - Room: room-1   │   │  - Room: room-2 │   │  - Room: N   │
└─────────┬─────────┘   └────────┬────────┘   └─┬────────────┘
          │                      │               │
          └──────────────────────┴───────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  ElastiCache (Redis)    │
                    │  - Leaderboard (ZSET)   │
                    │  - Player Names (HASH)  │
                    └─────────────────────────┘
```

## Architecture Layers

### 1. Client Layer

**Technology**: Phaser 3, TypeScript, Vite

**Responsibilities**:
- Render game graphics (sharks, food, effects)
- Handle user input (touch, GPS)
- Maintain WebSocket connection
- Interpolate game state between server updates
- UI/UX (screens, HUD, radar)

**Key Components**:
- `GameScene`: Main game rendering and logic
- `GameState`: Entity management
- `WebSocketClient`: Server communication
- `InputController`: Input handling (touch, GPS)
- HUD Components: `XpBar`, `LeaderboardPanel`, `RadarRenderer`

**Communication Flow**:
```
User Input → InputController → WebSocket → Server
Server → WebSocket → GameScene → Phaser Rendering
```

### 2. Server Layer

**Technology**: Go 1.22, goroutines, WebSocket (gorilla/websocket)

**Responsibilities**:
- Authoritative game logic (collision, movement, scoring)
- WebSocket connection management
- Game loop (20 ticks/second)
- State broadcasting to clients
- Leaderboard management
- Room isolation (multi-room support)

**Key Components**:

#### WebSocket Hub (`internal/ws/hub.go`)
```go
type Hub struct {
    clients    map[*Client]bool
    register   chan *Client
    unregister chan *Client
    broadcast  chan []byte
    game       *game.Loop
}
```

- Central connection manager
- Handles client registration/unregistration
- Broadcasts game state to all connected clients
- One hub per game room

#### Game Loop (`internal/game/loop.go`)
```go
type Loop struct {
    sharks      map[string]*Shark
    food        []*Food
    tick        int
    ticker      *time.Ticker  // 20 ticks/sec
}
```

- Runs at 50ms intervals (20Hz)
- Updates shark positions
- Checks collisions
- Spawns food
- Calculates scores and evolution

#### Client Connection (`internal/ws/client.go`)
```go
type Client struct {
    hub  *Hub
    conn *websocket.Conn
    send chan []byte
}
```

- One per connected player
- Reads incoming messages (input, GPS)
- Writes outgoing messages (state updates)
- Graceful disconnect handling

### 3. Data Layer

**Technology**: Redis 7.0 (ElastiCache)

**Schema**:
```
Key Pattern                  Type    Purpose
-----------------------------------------------------------------
samezario:leaderboard:scores ZSET    Player scores (sorted)
samezario:leaderboard:names  HASH    Player ID → Display Name
```

**Operations**:
- `ZADD`: Update player score
- `ZREVRANGE ... WITHSCORES`: Get top player(s)
- `ZSCORE`: Get current score
- `HSET/HGET`: Store/retrieve player names

**Custom Redis Client** (`internal/session/redis.go`):
- Zero external dependencies
- Raw RESP protocol implementation
- Connection per operation (no pooling yet)
- Error handling and fallback to in-memory

### 4. Infrastructure Layer

**Technology**: Terraform, AWS ECS Fargate, ALB, ElastiCache

**Components**:

#### ECS Service
- Auto-scaling based on CPU/memory
- Health checks via `/health` endpoint
- Graceful shutdown handling
- Service discovery via ALB

#### Application Load Balancer
- Sticky sessions (WebSocket requirement)
- SSL/TLS termination
- Health checks
- Path-based routing

#### ElastiCache Redis
- In-VPC deployment
- Multi-AZ for high availability
- Automatic backups
- Security group restrictions

#### Amazon Location Service (Phase 2)
- GPS tracking and distance calculation
- CP (Charge Point) accumulation
- Privacy-preserving location handling

## Data Flow

### 1. Player Joins Game

```
Client                    Server                  Redis
  │                         │                       │
  ├──[WS] connect──────────>│                       │
  │                         ├─ Create Client        │
  │                         ├─ Register to Hub      │
  │                         ├─ Create Shark         │
  │<─[WS] welcome msg───────┤                       │
  │    {id, x, y, route}    │                       │
```

### 2. Game Loop (20 ticks/sec)

```
Server Loop              Broadcast             Clients
     │                       │                    │
     ├─ Update positions     │                    │
     ├─ Check collisions     │                    │
     ├─ Spawn food           │                    │
     ├─ Calculate scores     │                    │
     ├──[state]─────────────>├───────────────────>│
     │   {sharks, food}      │                    ├─ Render
     │                       │                    ├─ Interpolate
     └─ (50ms later) ────────┘                    └─ Update UI
```

### 3. Shark Collision & Death

```
Server                    Redis                 Clients
  │                         │                       │
  ├─ Detect collision       │                       │
  ├─ Kill shark A           │                       │
  ├─ Convert to food        │                       │
  ├─ Update score B         │                       │
  ├─────[ZADD]─────────────>│                       │
  ├─────[HSET]─────────────>│                       │
  ├──[death msg]────────────┼──────────────────────>│ (to A)
  │   {score, route}        │                       ├─ Show death screen
  ├──[state update]─────────┼──────────────────────>│ (to all)
  │   {new food positions}  │                       └─ Render food
```

### 4. Leaderboard Update

```
Server               Redis                Clients
  │                    │                     │
  ├─ Player scores X   │                     │
  ├───[ZSCORE "A"]────>│                     │
  │<──[1250]───────────┤                     │
  ├───[ZADD +1]───────>│                     │
  ├───[ZREVRANGE 0 0]─>│                     │
  │<──["B", 2000]──────┤                     │
  ├───[HGET "B"]──────>│                     │
  │<──["TopPlayer"]────┤                     │
  ├──[leaderboard]─────┼────────────────────>│
  │   {name, score}    │                     └─ Update UI
```

## Scalability Considerations

### Horizontal Scaling

**Current Approach**: Room-based sharding
- Each ECS task runs one game room
- ALB distributes connections across tasks
- No inter-room communication needed
- Scales linearly with player count

**Limitations**:
- Players in different rooms don't interact
- Max ~50 players per room (configurable)
- No global leaderboard (only per-room)

**Future Enhancements** (Phase 4+):
- Redis Pub/Sub for cross-room events
- Global leaderboard aggregation
- Dynamic room creation/destruction
- Player migration between rooms

### Performance Optimization

**Server**:
- Pre-marshal JSON for broadcasts (avoid per-client serialization)
- Spatial partitioning for collision detection (future)
- Object pooling for sharks/food (future)
- Connection pooling for Redis (future)

**Client**:
- Phaser object pooling
- WebGL rendering
- Throttled GPS updates
- State interpolation/prediction

**Network**:
- Binary protocol (future, instead of JSON)
- Delta compression (send only changes)
- Client-side prediction
- Server reconciliation

## Security Architecture

### Authentication (Planned - Phase 2)

```
Client                   Auth Service          Game Server
  │                          │                      │
  ├──[login]───────────────>│                      │
  │<─[JWT token]─────────────┤                      │
  ├──[WS connect + token]────┼─────────────────────>│
  │                          │<─[verify token]──────┤
  │                          ├──[user info]────────>│
  │<─[welcome]───────────────┼──────────────────────┤
```

### Current Security Measures

1. **Rate Limiting** (future):
   - Message per second limits
   - Connection per IP limits

2. **Input Validation**:
   - Server validates all positions
   - Movement speed checks
   - Anti-cheat collision detection

3. **CORS**:
   - Whitelist of allowed origins
   - Credential support for cookies

4. **Headers**:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `X-XSS-Protection: 1; mode=block`

## Monitoring & Observability

### Metrics (Future)

- WebSocket connections (gauge)
- Messages per second (rate)
- Game loop latency (histogram)
- Player count per room (gauge)
- Collision checks per tick (counter)

### Logging

Current logging:
```go
log.Printf("samezario-server listening on %s room_id=%s capacity=%d", addr, roomID, capacity)
log.Printf("Redis enabled at: %s", redisAddr)
```

Structured logging (future):
```go
logger.Info("server_started",
    "addr", addr,
    "room_id", roomID,
    "capacity", capacity,
)
```

### Health Checks

- `GET /health`: Basic liveness check
- `GET /healthz`: Detailed readiness check (room info)
- `GET /room`: Room snapshot (player count, game state)

## Technology Decisions

### Why Go?

✅ Excellent concurrency (goroutines for each client)  
✅ Low latency (sub-millisecond GC pauses)  
✅ Small binary size (Docker image <20MB)  
✅ Built-in HTTP/WebSocket support  
✅ Easy deployment (single binary)

### Why Phaser 3?

✅ Mature game engine (v3.80+)  
✅ WebGL + Canvas rendering  
✅ Mobile browser support  
✅ Active community  
✅ TypeScript support

### Why Custom Redis Client?

✅ Zero dependencies  
✅ Minimal attack surface  
✅ Full control over protocol  
✅ Learning opportunity  
⚠️ No connection pooling yet  
⚠️ Limited error handling

### Why ECS Fargate?

✅ No server management  
✅ Pay-per-use pricing  
✅ Auto-scaling  
✅ Container-native  
⚠️ Cold start latency  
⚠️ No control over networking

## Future Phases

### Phase 2: GPS & CP System
- Amazon Location Service integration
- GPS tracking and distance calculation
- CP accumulation and consumption
- Indoor/outdoor mode switching

### Phase 3: Evolution System
- 3 evolution routes (attack, non-attack, deep-sea)
- 5 stages per route
- Route-specific abilities
- Visual evolution effects

### Phase 4: Territory System
- Path tracking
- Enclosed area detection
- Territory strength calculation
- Invasion/defense mechanics

### Phase 5: Production Hardening
- Global leaderboard
- Player authentication
- Anti-cheat system
- Performance profiling
- Load testing (10,000+ CCU)

## References

- [Game Specification](spec-v1.1-2026-04-13.md)
- [WebSocket Protocol RFC 6455](https://datatracker.ietf.org/doc/html/rfc6455)
- [Phaser 3 Architecture](https://photonstorm.github.io/phaser3-docs/)
- [AWS ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
