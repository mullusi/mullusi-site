# Purpose: create the local Python runtime for Mullusi Govern Cloud.
# Governance scope: backend-local virtual environment and dependency installation.
# Dependencies: Python and backend/requirements.txt.
# Invariants: setup stays inside backend/.venv and does not install system packages.

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendRoot = Resolve-Path (Join-Path $scriptRoot "..")
$venvPath = Join-Path $backendRoot ".venv"
$pythonPath = Join-Path $venvPath "Scripts\python.exe"

if (-not (Test-Path $pythonPath)) {
  python -m venv $venvPath
}

& $pythonPath -m pip install --upgrade pip
& $pythonPath -m pip install -r (Join-Path $backendRoot "requirements.txt")
& $pythonPath -c "import fastapi, uvicorn, psycopg; print('local_backend_env_ready')"
