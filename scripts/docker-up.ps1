<#
.SYNOPSIS
  Brings Docker Desktop up on Windows, clearing the stale sockets that stop it.

.DESCRIPTION
  Docker Desktop leaves unix-socket files behind when it exits uncleanly (a crash, a forced
  shutdown, the machine sleeping). On the next start it tries to remove them before binding,
  Windows refuses with "The file cannot be accessed by the system", and the backend crashes
  with "an unexpected error occurred" before the engine ever starts.

  The files cannot be deleted by Remove-Item, del, extended-path del, or fsutil - but renaming
  the directory that contains them works, and Docker recreates them cleanly on the next start.

  This script does that, starts the privileged helper service (which needs elevation), launches
  Docker Desktop, and waits for the engine to answer.

.EXAMPLE
  pnpm docker:up
#>

# Deliberately NOT 'Stop'. In Windows PowerShell 5.1 a native executable writing to stderr
# raises a terminating NativeCommandError under 'Stop', and `docker info` writes to stderr on
# every poll while the engine is still starting - which would abort the wait loop immediately.
$ErrorActionPreference = 'Continue'

function Write-Step($message) { Write-Host "==> $message" -ForegroundColor Cyan }

# --- 1. Clear stale socket directories -------------------------------------------------------
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$socketDirs = @("$env:LOCALAPPDATA\Docker\run", "$env:LOCALAPPDATA\docker-secrets-engine")

foreach ($dir in $socketDirs) {
  if (-not (Test-Path $dir)) { continue }

  # Only in the way if something is actually in there.
  if (-not (Get-ChildItem $dir -Force -ErrorAction SilentlyContinue)) { continue }

  Write-Step "Clearing stale sockets in $dir"
  try {
    Rename-Item $dir "$(Split-Path $dir -Leaf).stale-$stamp" -ErrorAction Stop
  } catch {
    Write-Warning "Could not rename $dir : $($_.Exception.Message)"
  }
}

# Old copies are kept rather than deleted, but there is no reason to keep more than a few.
Get-ChildItem "$env:LOCALAPPDATA\Docker" -Directory -Filter '*.stale-*' -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -Skip 3 |
  ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }

# --- 2. Start the privileged helper service --------------------------------------------------
$service = Get-Service com.docker.service -ErrorAction SilentlyContinue

if ($service -and $service.Status -ne 'Running') {
  Write-Step 'Starting com.docker.service (needs elevation - approve the prompt)'
  try {
    Start-Service com.docker.service -ErrorAction Stop
  } catch {
    Start-Process powershell -Verb RunAs -ArgumentList `
      '-NoProfile', '-Command', 'Start-Service com.docker.service' -Wait
  }
}

# --- 3. Launch Docker Desktop ----------------------------------------------------------------
if (-not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) {
  Write-Step 'Launching Docker Desktop'
  Remove-Item "$env:LOCALAPPDATA\Docker\backend.error.json" -Force -ErrorAction SilentlyContinue
  Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
}

# --- 4. Wait for the engine ------------------------------------------------------------------
Write-Step 'Waiting for the Docker engine'
$deadline = (Get-Date).AddMinutes(5)

while ((Get-Date) -lt $deadline) {
  # cmd /c keeps the stderr noise out of PowerShell's error stream entirely.
  cmd /c "docker info > NUL 2>&1"
  if ($LASTEXITCODE -eq 0) {
    Write-Host 'Docker engine is running.' -ForegroundColor Green
    exit 0
  }
  Start-Sleep -Seconds 5
}

Write-Error @'
The Docker engine did not start within 5 minutes.

Check the backend log for the failing service:
  Get-Content "$env:LOCALAPPDATA\Docker\log\host\com.docker.backend.exe.log" -Tail 40

If it names another socket path that cannot be removed, add that directory to $socketDirs
in this script.
'@
exit 1
