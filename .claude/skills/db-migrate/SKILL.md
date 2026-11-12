---
name: db-migrate
description: Create and apply Alembic migrations with a downgrade check.
---

# db-migrate

cd backend; `uv run alembic revision --autogenerate -m <msg>`; review the file (keep `CREATE EXTENSION vector`); `alembic upgrade head`, `alembic downgrade -1`, `alembic upgrade head`. Use 127.0.0.1 not localhost.
