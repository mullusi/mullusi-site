# Purpose: stop the repo-local PostgreSQL runtime for Mullusi Govern Cloud.
# Governance scope: local portable PostgreSQL process shutdown only.
# Dependencies: backend/.postgres binaries and backend/.pgdata data directory.
# Invariants: this script does not delete data or runtime binaries.

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendRoot = Resolve-Path (Join-Path $scriptRoot "..")
$postgresRoot = Join-Path $backendRoot ".postgres"
$dataRoot = Join-Path $backendRoot ".pgdata"

$pgCtl = Get-ChildItem -Path $postgresRoot -Recurse -Filter pg_ctl.exe -ErrorAction Stop | Select-Object -First 1
& $pgCtl.FullName -D $dataRoot -m fast -w stop
Write-Host "portable_postgres_stopped"
