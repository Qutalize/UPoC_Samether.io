# Samezario API Documentation

## HTTP Endpoints

### Health Check

**GET /health**

Basic liveness probe for load balancer.

**Response**: `200 OK`
```
ok
```

---

**GET /healthz**

Detailed health check with instance information.

**Response**: `200 OK`
```json
{
  "status": "ok",
  "roomId": "samezario-room-1",
  "instanceId": "ecs-task-abc123"
}
```

---

### Room Information

**GET /room**

Returns current room state snapshot.

**Response**: `200 OK`
```json
{
  "type": "room",
  "data": {
    "roomId": "samezario-room-1",
    "playerCount": 15,
    "capacity": 50,
    "sharks": 15,
    "foodCount": 120
  }
}
```

---

## WebSocket Protocol

**Endpoint**: `ws://localhost:8080/ws` (dev) or `wss://api.samezario.example.com/ws` (prod)

### Connection Flow

```
Client                           Server
  |                                 |
  |-------- HTTP Upgrade --------->|
  |<------- 101 Switching ---------|
  |                                 |
  |-------- join message --------->|
  |<------ welcome message --------|
  |                                 |
  |<------ state (20/sec) ---------|
  |<------ state (20/sec) ---------|
  |                                 |
  |----------- input ------------->|
  |<------ state update -----------|
```

---

## Client → Server Messages

### join

Player joins the game.

**Format**:
```json
{
  "type": "join",
  "name": "PlayerName",
  "route": "attack"
}
```

**Fields**:
- `name` (string, required): Player display name (max 20 chars)
- `route` (string, required): Evolution route: `"attack"`, `"defense"`, or `"deep_sea"`

**Notes**:
- Must be sent immediately after WebSocket connection
- Server responds with `welcome` message
- Name is sanitized server-side

---

### input

Player movement/input update from touch/joystick controls.

**Format**:
```json
{
  "type": "input",
  "payload": {
    "angle": 0.785,
    "dash": false,
    "draw": false
  }
}
```

**Fields**:
- `payload.angle` (number): Movement angle in radians
- `payload.dash` (boolean): Dash activation flag
- `payload.draw` (boolean): Draw/hold input flag

**Notes**:
- This replaces older `touch_input`-style messages
- Send `type: "input"` with all input fields inside `payload`

**Rate Limit**: ~30-60 messages/second recommended (throttled client-side)

---

### gps

GPS location update (Phase 2).

**Format**:
```json
{
  "type": "gps",
  "lat": 35.6812,
  "lng": 139.7671,
  "accuracy": 10.5,
  "timestamp": 1681234567890
}
```

**Fields**:
- `lat` (number): Latitude in degrees
- `lng` (number): Longitude in degrees
- `accuracy` (number): Accuracy in meters
- `timestamp` (number): Unix timestamp in milliseconds

**Rate Limit**: Max 1 message every 5 seconds

---

### dash

Activate dash ability (consumes CP).

**Format**:
```json
{
  "type": "dash"
}
```

**Notes**:
- Requires sufficient CP
- Server validates CP availability
- Dash speed/duration depends on shark species

---

### radar

Activate radar scan (Phase 3).

**Format**:
```json
{
  "type": "radar"
}
```

**Notes**:
- Cooldown between uses
- Server responds with `radar_result` message

---

### evolve

Select evolution path when available.

**Format**:
```json
{
  "type": "evolve",
  "species": "tiger_shark"
}
```

**Fields**:
- `species` (string): Target species ID

**Notes**:
- Only valid when server sent `evolve_available`
- Server validates score requirement

---

## Server → Client Messages

### welcome

Sent after successful join.

**Format**:
```json
{
  "type": "welcome",
  "id": "abc123",
  "shark": {
    "x": 512.0,
    "y": 384.0,
    "route": "attack",
    "species": "hammerhead_shark",
    "segments": 5
  },
  "mapSize": {
    "width": 2000,
    "height": 1500
  }
}
```

**Fields**:
- `id` (string): Unique player/shark ID
- `shark.x`, `shark.y` (number): Initial position
- `shark.route` (string): Evolution route
- `shark.species` (string): Starting species
- `shark.segments` (number): Body segment count
- `mapSize` (object): Game world dimensions

---

### state

Game state update (sent 20 times per second).

**Format**:
```json
{
  "type": "state",
  "tick": 1234,
  "sharks": [
    {
      "id": "abc123",
      "x": 520.5,
      "y": 390.2,
      "heading": 1.57,
      "species": "hammerhead_shark",
      "segments": [
        {"x": 520.5, "y": 390.2},
        {"x": 515.0, "y": 385.0},
        {"x": 510.0, "y": 380.0}
      ],
      "score": 125,
      "isDashing": false
    }
  ],
  "food": [
    {"id": "f1", "x": 600.0, "y": 400.0, "type": "small"},
    {"id": "f2", "x": 650.0, "y": 450.0, "type": "medium"}
  ]
}
```

**Fields**:
- `tick` (number): Server tick counter
- `sharks` (array): All visible sharks
  - `id`: Shark identifier
  - `x`, `y`: Head position
  - `heading`: Direction in radians (0 = right, π/2 = down)
  - `species`: Current species ID
  - `segments`: Body segment positions
  - `score`: Current score
  - `isDashing`: Dash state
- `food` (array): All visible food
  - `id`: Food identifier
  - `x`, `y`: Position
  - `type`: `"small"`, `"medium"`, or `"large"`

**Notes**:
- Client should interpolate between states for smooth rendering
- Only includes entities in visible range (future optimization)

---

### leaderboard

Leaderboard update (current top player only).

**Format**:
```json
{
  "type": "leaderboard",
  "top": {
    "name": "TopPlayer",
    "score": 2500,
    "species": "great_white_shark"
  }
}
```

**Fields**:
- `top.name` (string): Top player name
- `top.score` (number): Top player score
- `top.species` (string): Top player species

**Notes**:
- Sent when leaderboard changes
- Only shows #1 rank (per game spec)

---

### death

Sent when player's shark dies.

**Format**:
```json
{
  "type": "death",
  "finalScore": 1250,
  "maxSpecies": "blue_shark",
  "killedBy": "def456",
  "survivalTime": 180.5
}
```

**Fields**:
- `finalScore` (number): Final score
- `maxSpecies` (string): Highest species reached
- `killedBy` (string, optional): ID of killer shark
- `survivalTime` (number): Seconds survived

**Notes**:
- Client should show death screen
- Player can rejoin with new `join` message

---

### evolve_available

Notifies player that evolution is available.

**Format**:
```json
{
  "type": "evolve_available",
  "options": [
    {
      "species": "tiger_shark",
      "name": "Tiger Shark",
      "description": "Balanced speed and attack",
      "requiredScore": 500
    }
  ]
}
```

**Fields**:
- `options` (array): Available evolution choices
  - `species`: Species ID
  - `name`: Display name
  - `description`: Flavor text
  - `requiredScore`: Score requirement (already met)

**Notes**:
- Client should show evolution selection UI
- Player responds with `evolve` message

---

### radar_result

Result of radar scan (Phase 3).

**Format**:
```json
{
  "type": "radar_result",
  "sharks": [
    {"id": "xyz789", "distance": 250.5, "bearing": 0.785}
  ],
  "food": [
    {"id": "f10", "distance": 120.0, "bearing": 1.57}
  ]
}
```

**Fields**:
- `sharks` (array): Detected sharks
  - `id`: Shark ID
  - `distance`: Distance in game units
  - `bearing`: Direction in radians
- `food` (array): Detected food
  - `id`: Food ID
  - `distance`, `bearing`: Same as sharks

**Notes**:
- Only includes entities in radar range
- Bearing relative to shark's heading

---

## Error Handling

### WebSocket Errors

**Connection Rejected**:
- HTTP 400: Invalid upgrade request
- HTTP 429: Rate limit exceeded (future)

**Close Codes**:
- `1000`: Normal closure
- `1008`: Policy violation (invalid message format)
- `1011`: Server error

**Example Close Frame**:
```json
{
  "code": 1008,
  "reason": "Invalid message format"
}
```

---

## Rate Limits (Future Implementation)

| Message Type  | Limit               |
|---------------|---------------------|
| join          | 1 per connection    |
| touch_input   | 60/sec              |
| gps           | 1/5sec              |
| dash          | 1/sec               |
| radar         | 1/10sec             |
| evolve        | 1 per evolution     |

**Enforcement**: Server-side token bucket per client

---

## Data Types

### Species IDs

**Attack Route**:
- `hammerhead_shark` (Lv1)
- `tiger_shark` (Lv2)
- `mako_shark` (Lv3)
- `great_white_shark` (Lv4)
- `megalodon` (Lv5)

**Non-Attack Route**:
- `dogfish_shark` (Lv1)
- `whitetip_reef_shark` (Lv2)
- `sand_tiger_shark` (Lv3)
- `basking_shark` (Lv4)
- `whale_shark` (Lv5)

**Deep-Sea Route**:
- `dwarf_lanternshark` (Lv1)
- `sawshark` (Lv2)
- `frilled_shark` (Lv3)
- `goblin_shark` (Lv4)
- `greenland_shark` (Lv5)

### Food Types

- `small`: +1 XP, common
- `medium`: +3 XP, uncommon
- `large`: +5 XP, from dead sharks

---

## Example Client Implementation

```typescript
const ws = new WebSocket('ws://localhost:8080/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'join',
    name: 'Player1',
    route: 'attack'
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  switch (msg.type) {
    case 'welcome':
      console.log('Joined as', msg.id);
      break;
    case 'state':
      updateGameState(msg);
      break;
    case 'death':
      showDeathScreen(msg);
      break;
  }
};

// Send input at 30 FPS
setInterval(() => {
  ws.send(JSON.stringify({
    type: 'touch_input',
    direction: getInputDirection(),
    dash: isDashPressed()
  }));
}, 33);
```

---

## Versioning

**Current Version**: v1.0 (Phase 1 - PoC)

Future versions will use URL-based versioning:
- `wss://api.samezario.com/v1/ws`
- `wss://api.samezario.com/v2/ws`

---

## Security

### Authentication (Phase 2+)

Add JWT token in query parameter:
```
wss://api.samezario.com/ws?token=eyJhbGc...
```

Server validates token before `welcome` response.

### Message Validation

All messages are validated server-side:
- Type checking
- Range validation (positions, directions)
- State verification (can this player dash?)
- Anti-cheat (movement speed, collision detection)

---

## Testing

### WebSocket Testing with wscat

```bash
npm install -g wscat
wscat -c ws://localhost:8080/ws

# Send join message
> {"type":"join","name":"TestPlayer","route":"attack"}

# Observe state updates
< {"type":"welcome","id":"abc123",...}
< {"type":"state","tick":1,...}
< {"type":"state","tick":2,...}
```

### Load Testing

```bash
# Use artillery or k6 for load testing
k6 run load-test.js
```

---

## Support

For API questions or bug reports:
- GitHub Issues: <repository-url>/issues
- Documentation: `docs/spec-v1.1-2026-04-13.md`
