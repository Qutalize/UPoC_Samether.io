# Contributing to Samezario

## Development Setup

### Prerequisites

- Go 1.22 or higher
- Node.js 20 or higher
- Docker & Docker Compose
- Git

### Getting Started

1. Fork and clone the repository
2. Copy environment files:
   ```bash
   cp .env.example .env
   cp docker-compose.override.yml.example docker-compose.override.yml
   ```
3. Start development environment:
   ```bash
   docker-compose up --build
   ```

## Project Structure

```
Samether.io/
├── client/              # Frontend (Phaser + TypeScript)
│   ├── src/
│   │   ├── game/        # Game scenes and logic
│   │   ├── network/     # WebSocket protocol
│   │   └── ui/          # UI screens
│   └── package.json
│
├── server/              # Backend (Go)
│   ├── cmd/             # Application entry points
│   │   └── server/      # Main server
│   ├── internal/        # Private packages
│   │   ├── game/        # Game logic (collisions, food, sharks)
│   │   ├── ws/          # WebSocket hub and clients
│   │   ├── session/     # Redis session management
│   │   └── static/      # Embedded static files
│   └── config/          # Configuration management
│
├── infra/               # Infrastructure as Code (Terraform)
│   ├── envs/            # Environment-specific configs
│   │   └── dev/         # Development environment
│   └── modules/         # Reusable Terraform modules
│
└── docs/                # Documentation
    └── spec-v1.1-2026-04-13.md  # Game specification
```

## Development Workflow

### Working on the Client

```bash
cd client
npm install
npm run dev  # Starts Vite dev server on http://localhost:5173
```

The client will hot-reload on changes. For testing with the backend:
- Start the Go server separately on port 8080
- Vite will proxy WebSocket requests to the backend

### Working on the Server

```bash
cd server
go mod download
go run cmd/server/main.go
```

Server will start on port 8080 by default. Set environment variables in `.env`:
```bash
export REDIS_ADDR=localhost:6379
go run cmd/server/main.go
```

### Running Tests

#### Server Tests
```bash
cd server
go test ./...                    # Run all tests
go test -v ./...                 # Verbose output
go test -race ./...              # Race detection
go test -cover ./...             # Coverage report
go test -bench=. ./...           # Benchmarks
```

#### Client Type Checking
```bash
cd client
npm run build  # TypeScript compilation check
```

## Code Style

### Go

- Follow [Effective Go](https://go.dev/doc/effective_go)
- Use `gofmt` for formatting (automatically enforced by CI)
- Run `golangci-lint run` before committing
- Keep functions small and focused
- Add comments for exported functions and types

### TypeScript

- Use TypeScript strict mode
- Follow Phaser 3 best practices
- Prefer composition over inheritance
- Use meaningful variable names

## Git Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation updates
- `person1/`, `person2/`, etc. - Personal development branches

### Commit Messages

Follow conventional commits format:
```
type(scope): subject

body

footer
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `docs`: Documentation
- `test`: Tests
- `chore`: Maintenance

Examples:
```
feat(game): add shark evolution system

Implement 3-route evolution tree with 5 stages per route.
Includes attack, non-attack, and deep-sea routes.

Closes #42

fix(ws): prevent memory leak in hub broadcast

Fixed goroutine leak when clients disconnect during broadcast.

test(collision): add test cases for shark-shark collision
```

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear commit messages
3. Ensure all tests pass: `go test ./...` and `npm run build`
4. Push your branch and create a PR
5. Request review from at least one team member
6. Address review comments
7. Squash and merge once approved

## Testing Guidelines

### Server Testing

- Write unit tests for all business logic
- Use table-driven tests where appropriate
- Mock external dependencies (Redis, etc.)
- Aim for >80% coverage on critical paths

Example:
```go
func TestSharkCollision(t *testing.T) {
	tests := []struct {
		name     string
		shark1   Shark
		shark2   Shark
		expected bool
	}{
		{"head hits body", shark1, shark2, true},
		{"no collision", shark3, shark4, false},
	}
	
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CheckCollision(tt.shark1, tt.shark2)
			if result != tt.expected {
				t.Errorf("got %v, want %v", result, tt.expected)
			}
		})
	}
}
```

### Client Testing

- Ensure TypeScript compilation passes
- Test WebSocket protocol compatibility
- Manually test on mobile browsers

## Architecture Decisions

### Why Go for Backend?

- Excellent concurrency support (goroutines)
- Low latency for real-time WebSocket connections
- Small memory footprint
- Fast compilation and deployment

### Why Phaser for Frontend?

- Mature game engine with WebGL support
- Good mobile browser compatibility
- Strong community and documentation
- Built-in physics and rendering

### Why Custom Redis Client?

- Minimizes dependencies
- Zero external libraries for core functionality
- Full control over connection pooling
- Lightweight RESP protocol implementation

## Performance Considerations

### Server

- Game loop runs at 20 ticks/second
- WebSocket broadcasts are optimized with pre-marshaled JSON
- Redis operations are batched where possible
- Connection pooling is handled manually

### Client

- Use Phaser's object pooling for sharks and food
- Minimize DOM updates
- Throttle GPS updates to reduce battery drain
- Use WebGL renderer when available

## Security

- Never commit secrets to git
- Use environment variables for configuration
- Validate all user input on the server
- Implement rate limiting for WebSocket messages
- Use HTTPS/WSS in production

## Resources

- [Phaser 3 Documentation](https://photonstorm.github.io/phaser3-docs/)
- [Go Documentation](https://go.dev/doc/)
- [WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)

## Getting Help

- Check existing issues on GitHub
- Read the game specification: `docs/spec-v1.1-2026-04-13.md`
- Ask in team discussions
- Review closed PRs for similar changes

## License

Proprietary - All rights reserved
