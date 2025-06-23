# Network Service Request Generator - Docker Commands
.PHONY: help dev prod down clean logs shell test migrate

# Default target
help:
	@echo "Available commands:"
	@echo "  make dev      - Start development environment"
	@echo "  make prod     - Start production environment"
	@echo "  make down     - Stop all containers"
	@echo "  make clean    - Remove all containers and volumes"
	@echo "  make logs     - View logs"
	@echo "  make shell    - Open shell in backend container"
	@echo "  make test     - Run tests"
	@echo "  make migrate  - Run database migrations"
	@echo "  make build    - Build all images"

# Development environment
dev:
	@echo "Starting development environment..."
	docker compose -f docker-compose.dev.yml up -d
	@echo "Development environment started!"
	@echo "Frontend: http://localhost:3000"
	@echo "Backend: http://localhost:5000"

# Production environment
prod:
	@echo "Starting production environment..."
	docker compose up -d
	@echo "Production environment started!"

# Stop containers
down:
	@echo "Stopping containers..."
	docker compose -f docker-compose.dev.yml down
	docker compose down

# Clean everything
clean:
	@echo "Cleaning up containers and volumes..."
	docker compose -f docker-compose.dev.yml down -v --remove-orphans
	docker compose down -v --remove-orphans
	docker system prune -f

# View logs
logs:
	docker compose -f docker-compose.dev.yml logs -f

# Open shell in backend container
shell:
	docker compose -f docker-compose.dev.yml exec backend bash

# Run tests
test:
	docker compose -f docker-compose.dev.yml exec backend npm test

# Run database migrations
migrate:
	docker compose -f docker-compose.dev.yml exec backend npm run db:migrate

# Build all images
build:
	docker compose -f docker-compose.dev.yml build
	docker compose build