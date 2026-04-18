# Install a Start Menu shortcut for the Wallpaper Galaxy config GUI.
# Creates "Wallpaper Galaxy Config.lnk" under the user's Start Menu so the
# config app is discoverable the same way any other installed program is.
#
# Usage:
#   .\install_shortcut.ps1
# Or, if PowerShell blocks:
#   powershell -ExecutionPolicy Bypass -File .\install_shortcut.ps1

$ErrorActionPreference = "Stop"

$repoRoot  = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$configGui = Join-Path $repoRoot "config_gui.py"
$iconIco   = Join-Path $repoRoot "Assets\APPicon.ico"

if (-not (Test-Path $configGui)) {
  Write-Error "config_gui.py not found at: $configGui"
  exit 1
}
if (-not (Test-Path $iconIco)) {
  Write-Error "Icon not found at: $iconIco"
  exit 1
}

$programs     = [Environment]::GetFolderPath("Programs")
$shortcutPath = Join-Path $programs "Wallpaper Galaxy Config.lnk"

# Prefer pythonw.exe (no console flash). Fall back to python.exe.
$pythonCmd = (Get-Command pythonw.exe -ErrorAction SilentlyContinue)?.Source
if (-not $pythonCmd) {
  $pythonCmd = (Get-Command python.exe -ErrorAction SilentlyContinue)?.Source
}
if (-not $pythonCmd) {
  Write-Error "Python not found on PATH. Install Python first."
  exit 1
}

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($shortcutPath)
$sc.TargetPath       = $pythonCmd
$sc.Arguments        = "`"$configGui`""
$sc.WorkingDirectory = $repoRoot
$sc.IconLocation     = $iconIco
$sc.Description      = "Configure Wallpaper Galaxy (location, units, flight speed, stellar density)"
$sc.Save()

Write-Host "Installed shortcut:"
Write-Host "  $shortcutPath"
Write-Host ""
Write-Host "Open the Start Menu and type 'Wallpaper Galaxy' to find it."
Write-Host "To remove, just delete that file."
