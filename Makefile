.PHONY: help build test clean docker run dev lint

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: build-server build-client ## Build both server and client

build-server: ## Build Go server binary
	cd server && go build -o samezario-server ./cmd/server

build-client: ## Build TypeScript client
	cd client && npm ci && npm run build

test: test-server ## Run all tests

test-server: ## Run Go server tests
	cd server && go test -v -race -cover ./...

test-client: ## Type-check client
	cd client && npm run build

lint: lint-server ## Run linters

lint-server: ## Lint Go code
	cd server && go fmt ./...
	cd server && go vet ./...

clean: ## Clean build artifacts
	rm -f server/samezario-server
	rm -rf client/dist
	rm -rf server/internal/static/assets/*
	touch server/internal/static/assets/.gitkeep

docker: ## Build Docker image
	docker build -t samezario:latest .

docker-compose-up: ## Start services with docker-compose
	docker-compose up --build

docker-compose-down: ## Stop docker-compose services
	docker-compose down

dev-server: ## Run server in development mode
	cd server && go run cmd/server/main.go

dev-client: ## Run client in development mode
	cd client && npm run dev

run: docker-compose-up ## Alias for docker-compose-up

deps: ## Download dependencies
	cd server && go mod download
	cd client && npm ci

fmt: ## Format code
	cd server && go fmt ./...

check: lint test ## Run linters and tests

# Development helpers
.PHONY: logs ps restart

logs: ## Show docker-compose logs
	docker-compose logs -f

ps: ## Show running containers
	docker-compose ps

restart: ## Restart docker-compose services
	docker-compose restart
