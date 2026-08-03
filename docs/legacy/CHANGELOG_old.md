<!-- 改修前 Samether.io の CHANGELOG.md のアーカイブ。
     原本が失われたため、2026-08-03 に読み取り済みの内容から復元したもの。
     内容は原本と同一だが、末尾空白等が完全に一致する保証はない。 -->

# Changelog

All notable changes to Samezario will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Comprehensive README.md with quick start guide and architecture overview
- CONTRIBUTING.md with development workflow and guidelines
- ARCHITECTURE.md with detailed system design documentation
- API.md with complete WebSocket and HTTP endpoint documentation
- GitHub Actions CI/CD pipeline
  - Automated testing for server (Go) and client (TypeScript)
  - Docker build verification
  - golangci-lint integration
- Docker publishing workflow with multi-platform support
- Dependabot configuration for automated dependency updates
- Environment configuration templates (.env.example, docker-compose.override.yml.example)
- Makefile with common development tasks
- .editorconfig for consistent code formatting
- .golangci.yml for Go linting configuration
- Security middleware with CORS support
- HTTP security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- Environment variable validation with logging
- HTTP server timeouts and limits

### Changed

- Unified project naming to "Samezario" across all files
- Updated docker-compose.yml service name to `samezario-server`
- Enhanced server configuration with validation and default values
- Improved health check endpoints with proper HTTP method validation
- Updated infra/README.md with detailed deployment steps

### Fixed

- Inconsistent project naming (Samether.io vs Samezario)
- Missing CI/CD pipeline
- Lack of development documentation
- Unvalidated environment variables
- Missing security headers
- No CORS configuration

### Security

- Added security middleware with common headers
- Implemented CORS whitelist for allowed origins
- Added HTTP timeout configurations
- Environment variable validation and sanitization

## [0.1.0] - 2026-04-17

### Added

- Initial PoC implementation (Phase 1)
- WebSocket-based multiplayer game server (Go)
- Phaser 3 game client (TypeScript)
- Basic Slither.io mechanics
- Custom Redis client for leaderboard
- Docker and docker-compose setup
- Terraform infrastructure modules
- Game specification document (v1.1)

[Unreleased]: https://github.com/Qutalize/Samether.io/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Qutalize/Samether.io/releases/tag/v0.1.0
