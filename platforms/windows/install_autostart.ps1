# Install a shortcut in the user's Startup folder so the wallpaper backend
# runs at login. Lively Wallpaper itself will autostart separately (that's
# its default behavior) and pick up the backend URL.

$ErrorActionPreference = "Stop"

$startScript   = Join-Path $PSScriptRoot "start_server.ps1"
$repoRoot      = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$startupFolder = [Environment]::GetFolderPath("Startup")
$shortcutPath  = Join-Path $startupFolder "WallpaperGalaxyServer.lnk"

if (-not (Test-Path $startScript)) {
  Write-Error "start_server.ps1 not found at: $startScript"
  exit 1
}

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($shortcutPath)
$sc.TargetPath       = "powershell.exe"
$sc.Arguments        = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`""
$sc.WorkingDirectory = $repoRoot
$sc.WindowStyle      = 7   # Minimized
$sc.Save()

Write-Host "Autostart shortcut installed at:"
Write-Host "  $shortcutPath"
Write-Host ""
Write-Host "To remove it, just delete that file."
