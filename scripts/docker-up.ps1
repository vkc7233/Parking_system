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

# --- 2. Reset a wedged WSL VM ----------------------------------------------------------------
# A second failure mode: the docker-desktop distro is Running but its init control API never
# answers, and the backend log fills with "still waiting for init control API to respond".
# Nothing short of terminating the VM clears it. Only done when the distro is already up and
# the engine is not, so a healthy Docker is never disturbed.
$dockerDistroUp = (wsl -l -q --running 2>$null) -join "`n" -match 'docker-desktop'

if ($dockerDistroUp) {
  cmd /c "docker info > NUL 2>&1"
  if ($LASTEXITCODE -ne 0) {
    Write-Step 'docker-desktop VM is up but not answering - restarting WSL'
    Get-Process -Name '*docker*' -ErrorAction SilentlyContinue |
      Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    wsl --shutdown
    Start-Sleep -Seconds 5
  }
}

# --- 3. Start the privileged helper service --------------------------------------------------
# This is the one step that needs elevation, and Docker cannot start the VM without it. Setting
# the startup type to Automatic at the same time means the prompt appears once, not every time.
$service = Get-Service com.docker.service -ErrorAction SilentlyContinue

if ($service -and $service.Status -ne 'Running') {
  Write-Step 'Starting com.docker.service (approve the elevation prompt)'
  try {
    Start-Service com.docker.service -ErrorAction Stop
  } catch {
    try {
      Start-Process powershell -Verb RunAs -ArgumentList `
        '-NoProfile', '-Command',
        'Set-Service com.docker.service -StartupType Automatic; Start-Service com.docker.service' `
        -Wait -ErrorAction Stop
    } catch {
      Write-Warning @'
The elevation prompt was declined, so com.docker.service could not be started.

Docker cannot start its Linux VM without that service, so nothing below will work. Run this
once from an ADMINISTRATOR PowerShell to fix it permanently:

  Set-Service com.docker.service -StartupType Automatic
  Start-Service com.docker.service
'@
      exit 1
    }
  }
}

# --- 4. Launch Docker Desktop ----------------------------------------------------------------
if (-not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) {
  Write-Step 'Launching Docker Desktop'
  Remove-Item "$env:LOCALAPPDATA\Docker\backend.error.json" -Force -ErrorAction SilentlyContinue
  Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
}

# --- 5. Wait for the engine ------------------------------------------------------------------
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
