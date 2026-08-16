# Samezar.io (サメザリオ)

リアルタイム位置情報連動型マルチプレイヤーゲーム - Slither.io inspired shark evolution game

<p align="center">
  <img src="images/AllinOne.png" alt="Samezar.io" width="600">
</p>

## Overview

Samezarioは現実世界を歩き回りながらサメを操作し、海中でエサを食べて成長・進化しながら他プレイヤーと競うリアルタイムマルチプレイヤーゲームです。

### Tech Stack

- **Frontend**: Phaser 3 + TypeScript + Vite
- **Backend**: Go + WebSocket
- **Infrastructure**: AWS (ECS/Fargate + ALB + ElastiCache Redis + Amazon Location Service)
- **IaC**: Terraform

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local client development)
- Go 1.22+ (for local server development)

### Local Development

1. Clone the repository:
```bash
git clone <repository-url>
cd Samether.io
```

2. Start services with Docker Compose:
```bash
docker-compose up --build
```

3. Open browser at `http://localhost:8080`

### Development without Docker

#### Client

```bash
cd client
npm install
npm run dev
```

#### Server

```bash
cd server
go mod download
go run cmd/server/main.go
```

## Project Structure

```
.
├── client/          # Phaser + TypeScript frontend
│   ├── src/
│   │   ├── game/    # Game logic and scenes
│   │   ├── network/ # WebSocket communication
│   │   └── ui/      # UI screens
│   └── package.json
├── server/          # Go backend
│   ├── cmd/         # Entry points
│   ├── internal/    # Internal packages
│   │   ├── game/    # Game logic
│   │   ├── ws/      # WebSocket hub
│   │   └── session/ # Redis session management
│   └── config/      # Configuration
├── infra/           # Terraform infrastructure
│   ├── envs/        # Environment-specific configs
│   └── modules/     # Reusable Terraform modules
└── docs/            # Documentation

```

## Architecture

```
[Mobile Browser]
       |
       ├── WebSocket (wss://)
       |         |
       |     [ALB]
       |         |
       |     [ECS Fargate]
       |     ├── WebSocket Server (Go)
       |     ├── Game Logic (20 tick/sec)
       |     └── Leaderboard Management
       |         |
       |     [ElastiCache Redis]
       |
       └── GPS Location
                 |
           [Amazon Location Service]
```

## Environment Variables

### Server

- `REDIS_ADDR`: Redis server address (default: none, optional)
- `REDIS_PASSWORD`: Redis password (default: empty)
- `REDIS_DB`: Redis database number (default: 0)
- `REDIS_PREFIX`: Redis key prefix (default: samezario:leaderboard)
- `ROOM_ID`: Game room identifier (default: hostname or "room-1")
- `ROOM_CAPACITY`: Maximum players per room (default: 50)
- `INSTANCE_ID`: Instance identifier (default: same as ROOM_ID)

## API Endpoints

- `GET /health` - Health check (returns "ok")
- `GET /healthz` - Detailed health check with room info
- `GET /room` - Current room snapshot
- `GET /ws` - WebSocket upgrade endpoint
- `GET /` - Static files (game client)

## WebSocket Protocol

### Client → Server

- `join`: Join game with player name
- `gps`: Update GPS coordinates
- `touch_input`: Touch/joystick input
- `radar`: Radar activation request
- `evolve`: Evolution selection
- `dash`: Dash activation (CP consumption)

### Server → Client

- `welcome`: Player ID and initial state
- `state`: Game state updates (20 tick/sec)
- `radar_result`: Radar scan results
- `evolve_available`: Evolution options
- `leaderboard`: Top player info
- `death`: Death notification

## Testing

```bash
# Server tests
cd server
go test ./...

# Client build check
cd client
npm run build
```

## Deployment

Infrastructure is managed with Terraform. See `infra/README.md` for details.

```bash
cd infra/envs/dev
terraform init
terraform plan
terraform apply
```

## Documentation

- [仕様書 v1.1](docs/spec-v1.1-2026-04-13.md) - Full game specification (Japanese)
- [Infrastructure README](infra/README.md) - Terraform setup and deployment

## Development Roadmap

- [x] Phase 1: PoC - Basic Slither.io mechanics
- [ ] Phase 2: GPS integration & CP system
- [ ] Phase 3: Evolution system (3 routes, 5 stages)
- [ ] Phase 4: Territory system
- [ ] Phase 5: Polish & optimization

## License

Proprietary