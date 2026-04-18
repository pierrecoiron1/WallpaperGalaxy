# Start the wallpaper backend (Python http.server). Runs headlessly via
# pythonw.exe so no console window appears. Records its PID in %TEMP% so
# stop_server.ps1 can find it later.
#
# Usage:
#   .\start_server.ps1
# If you hit an execution-policy error, invoke via:
#   powershell -ExecutionPolicy Bypass -File .\start_server.ps1

$ErrorActionPreference = "Stop"

$repoRoot  = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$pyScript  = Join-Path $repoRoot "wallpaper_server.py"
$pidFile   = Join-Path $env:TEMP "wallpaper-server.pid"
$serverUrl = "http://127.0.0.1:43117/api/current"

if (-not (Test-Path $pyScript)) {
  Write-Error "Backend script not found at: $pyScript"
  exit 1
}

# Already running? Bail.
if (Test-Path $pidFile) {
  $existingPid = Get-Content $pidFile -ErrorAction SilentlyContinue
  if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
    Write-Host "Backend already running (PID $existingPid)."
    exit 0
  }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

# pythonw = Python without a console window. Fall back to python if missing.
$pythonCmd = "pythonw"
if (-not (Get-Command $pythonCmd -ErrorAction SilentlyContinue)) {
  $pythonCmd = "python"
}

$proc = Start-Process -FilePath $pythonCmd `
                      -ArgumentList "`"$pyScript`"" `
                      -WorkingDirectory $repoRoot `
                      -PassThru
$proc.Id | Out-File -FilePath $pidFile -Encoding ASCII

# Poll up to 3s for the server to start responding.
for ($i = 0; $i -lt 30; $i++) {
  try {
    Invoke-WebRequest -Uri $serverUrl -UseBasicParsing -TimeoutSec 1 | Out-Null
    Write-Host "Backend running at http://127.0.0.1:43117 (PID $($proc.Id))"
    exit 0
  } catch {
    Start-Sleep -Milliseconds 100
  }
}

Write-Warning "Backend process started (PID $($proc.Id)) but didn't respond within 3s."
exit 1
