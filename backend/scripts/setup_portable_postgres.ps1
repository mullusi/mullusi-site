# Purpose: download and start a repo-local PostgreSQL runtime for Mullusi Govern Cloud.
# Governance scope: portable local database binaries, initialized data directory, local database/user creation, and readiness check.
# Dependencies: PowerShell, network access to EDB PostgreSQL binary archive, and Windows x64.
# Invariants: all runtime files stay under backend/.postgres, backend/.pgdata, and backend/.pgrun; no Windows service or system PATH change is made.

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendRoot = Resolve-Path (Join-Path $scriptRoot "..")
$postgresRoot = Join-Path $backendRoot ".postgres"
$dataRoot = Join-Path $backendRoot ".pgdata"
$runRoot = Join-Path $backendRoot ".pgrun"
$archivePath = Join-Path $postgresRoot "postgresql-16.13-3-windows-x64-binaries.zip"
$downloadUrl = "https://get.enterprisedb.com/postgresql/postgresql-16.13-3-windows-x64-binaries.zip"
$port = if ($env:MULLUSI_POSTGRES_PORT) { [int]$env:MULLUSI_POSTGRES_PORT } else { 55432 }
$password = if ($env:MULLUSI_POSTGRES_PASSWORD) { $env:MULLUSI_POSTGRES_PASSWORD } else { "mullusi_local_dev" }

New-Item -ItemType Directory -Force -Path $postgresRoot, $runRoot | Out-Null

if (-not (Test-Path $archivePath)) {
  Write-Host "downloading_postgresql_archive:$downloadUrl"
  curl.exe -L --fail --retry 3 --connect-timeout 30 --output $archivePath $downloadUrl
  if ($LASTEXITCODE -ne 0) {
    throw "postgresql_archive_download_failed"
  }
}

if (-not (Get-ChildItem -Path $postgresRoot -Recurse -Filter initdb.exe -ErrorAction SilentlyContinue | Select-Object -First 1)) {
  Write-Host "extracting_postgresql_archive:$archivePath"
  Expand-Archive -Path $archivePath -DestinationPath $postgresRoot -Force
}

$initdb = Get-ChildItem -Path $postgresRoot -Recurse -Filter initdb.exe -ErrorAction Stop | Select-Object -First 1
$pgCtl = Get-ChildItem -Path $postgresRoot -Recurse -Filter pg_ctl.exe -ErrorAction Stop | Select-Object -First 1
$psql = Get-ChildItem -Path $postgresRoot -Recurse -Filter psql.exe -ErrorAction Stop | Select-Object -First 1
$createdb = Get-ChildItem -Path $postgresRoot -Recurse -Filter createdb.exe -ErrorAction Stop | Select-Object -First 1

if (-not (Test-Path $dataRoot)) {
  $pwFile = Join-Path $runRoot "postgres.pw"
  Set-Content -Path $pwFile -Value $password -NoNewline -Encoding ASCII
  Write-Host "initializing_postgresql_data:$dataRoot"
  & $initdb.FullName -D $dataRoot -U postgres -A scram-sha-256 --pwfile $pwFile -E UTF8
  Remove-Item -LiteralPath $pwFile -Force
}

$logFile = Join-Path $runRoot "postgres.log"
$statusOutput = & $pgCtl.FullName -D $dataRoot status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "starting_postgresql_port:$port"
  & $pgCtl.FullName -D $dataRoot -l $logFile -o "-p $port" -w start
} else {
  Write-Host "postgresql_already_running"
}

$env:PGPASSWORD = $password
$roleExists = & $psql.FullName -h 127.0.0.1 -p $port -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'mullusi'"
if (((@($roleExists) -join "").Trim()) -ne "1") {
  & $psql.FullName -h 127.0.0.1 -p $port -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE mullusi LOGIN PASSWORD '$password'"
}

$databaseExists = & $psql.FullName -h 127.0.0.1 -p $port -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'mullusi_govern'"
if (((@($databaseExists) -join "").Trim()) -ne "1") {
  & $createdb.FullName -h 127.0.0.1 -p $port -U postgres -O mullusi mullusi_govern
}

$databaseUrl = "postgresql://mullusi:$password@127.0.0.1:$port/mullusi_govern"
Write-Host "portable_postgres_ready url=$databaseUrl"
