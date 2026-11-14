# Windows equivalent of the Makefile (make is not installed by default).
# Usage: .\make.ps1 <target> [-Config B1] [-Split dev]
param(
  [Parameter(Position = 0)][string]$Target = "help",
  [string]$Config = "",
  [string]$Split = "dev",
  [string]$Question = ""
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$pnpm = if (Get-Command pnpm -ErrorAction SilentlyContinue) { @("pnpm") } else { @("npx", "-y", "pnpm@10") }
function Run([string]$dir, [scriptblock]$cmd) { Push-Location (Join-Path $root $dir); try { & $cmd; if ($LASTEXITCODE -ne 0) { throw "failed: $Target" } } finally { Pop-Location } }
function Pnpm([string[]]$a) { & $pnpm[0] ($pnpm[1..($pnpm.Length)] + $a | Where-Object { $_ }) }
$dev = "infra/docker-compose.dev.yml"

switch ($Target) {
  "setup"       { Run "backend" { uv sync }; Run "frontend" { Pnpm @("install") } }
  "db-up"       { docker compose -f (Join-Path $root $dev) up -d --wait }
  "db-down"     { docker compose -f (Join-Path $root $dev) down }
  "migrate"     { Run "backend" { uv run alembic upgrade head } }
  "lint"        { Run "backend" { uv run ruff check .; uv run ruff format --check .; uv run mypy app }
                  Run "frontend" { Pnpm @("lint"); Pnpm @("typecheck") } }
  "test"        { Run "backend" { uv run pytest -q } }
  "ingest"      { Run "backend" { uv run k2 ingest } }
  "index"       { Run "backend" { uv run k2 index } }
  "eval"        { Run "backend" { uv run k2 eval --config $Config --split $Split } }
  "e2e"         { Run "frontend" { Pnpm @("test:contrast"); Pnpm @("test:e2e") } }
  "ask"         { Run "backend" { uv run k2 ask $Question --config $(if ($Config) { $Config } else { "M1" }) } }
  "eval-gen"    { Run "backend" { uv run k2 eval-gen --config $Config --split $Split } }
  "dev"         { Start-Process -FilePath "uv" -ArgumentList "run uvicorn app.api.main:app --reload --port 8010 --loop none" -WorkingDirectory (Join-Path $root "backend")
                  Run "frontend" { Pnpm @("dev") } }
  "up"          { docker compose -f (Join-Path $root "infra/docker-compose.yml") up -d --build }
  "gen-api"     { Run "frontend" { Pnpm @("gen-api") } }
  "check-llm"   { Run "backend" { uv run k2 check-llm } }
  "list-models" { Run "backend" { uv run k2 list-models } }
  default       { "Targets: e2e ask eval-gen setup db-up db-down migrate lint test ingest index eval dev up gen-api check-llm list-models" }
}
