# Stop the wallpaper backend. Uses the pidfile written by start_server.ps1
# and falls back to a CommandLine scan in case the pidfile was lost.

$pidFile = Join-Path $env:TEMP "wallpaper-server.pid"
$killed = 0

if (Test-Path $pidFile) {
  $pidToKill = Get-Content $pidFile -ErrorAction SilentlyContinue
  if ($pidToKill) {
    $running = Get-Process -Id $pidToKill -ErrorAction SilentlyContinue
    if ($running) {
      Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
      $killed++
    }
  }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

# Fallback: any python/pythonw still running wallpaper_server.py.
$stragglers = Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" |
              Where-Object { $_.CommandLine -match 'wallpaper_server\.py' }
foreach ($p in $stragglers) {
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  $killed++
}

if ($killed -eq 0) {
  Write-Host "No backend was running."
} else {
  Write-Host "Stopped."
}
