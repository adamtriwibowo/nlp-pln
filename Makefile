.PHONY: setup db-up db-down migrate lint test ingest index eval dev up gen-api check-llm list-models

PNPM ?= pnpm
COMPOSE_DEV = docker compose -f infra/docker-compose.dev.yml

setup:
	cd backend && uv sync
	cd frontend && $(PNPM) install

db-up:
	$(COMPOSE_DEV) up -d --wait

db-down:
	$(COMPOSE_DEV) down

migrate:
	cd backend && uv run alembic upgrade head

lint:
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app
	cd frontend && $(PNPM) lint && $(PNPM) typecheck

test:
	cd backend && uv run pytest -q

ingest:
	cd backend && uv run k2 ingest

index:
	cd backend && uv run k2 index

eval:
	cd backend && uv run k2 eval --config $(CONFIG) --split $(or $(SPLIT),dev)

dev:
	cd backend && uv run uvicorn app.api.main:app --reload --port 8010 --loop none &
	cd frontend && $(PNPM) dev

up:
	docker compose -f infra/docker-compose.yml up -d --build

gen-api:
	cd frontend && $(PNPM) gen-api

check-llm:
	cd backend && uv run k2 check-llm

list-models:
	cd backend && uv run k2 list-models
