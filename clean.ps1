# Reclaim Rust build-cache disk space for human-token.
#
#   .\clean.ps1          → remove target/debug only (default; keeps the release
#                          exe and human-token.lnk working). Frees the big chunk.
#   .\clean.ps1 -All     → wipe all of target/ (cargo clean). The release exe and
#                          shortcut will need a rebuild (npm run build) afterwards.
#
# Double-click "清理缓存.bat" to run the default mode without opening a terminal.

param([switch]$All)

$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $root 'src-tauri\target'

function Get-DirMB($p) {
  if (-not (Test-Path $p)) { return 0 }
  [math]::Round((Get-ChildItem $p -Recurse -File -ErrorAction SilentlyContinue |
    Measure-Object Length -Sum).Sum / 1MB)
}

if (-not (Test-Path $target)) {
  Write-Host "No src-tauri/target — nothing to clean." -ForegroundColor Yellow
  return
}

# Free any file locks: stop a running widget if one is up.
try {
  Get-Process human-token -ErrorAction Stop | ForEach-Object {
    Write-Host "Stopping running widget (PID $($_.Id))..."
    Stop-Process -Id $_.Id -Force
  }
} catch { }

$before = Get-DirMB $target
Write-Host ("target/ before: {0,8:N0} MB" -f $before) -ForegroundColor Cyan

if ($All) {
  Write-Host "Full clean - removing all of target/ ..." -ForegroundColor Yellow
  Remove-Item $target -Recurse -Force
  Write-Host "Done. Run 'npm run build' to recreate the release exe (the .lnk needs it)." -ForegroundColor Yellow
} else {
  $debug = Join-Path $target 'debug'
  if (Test-Path $debug) {
    Write-Host "Removing target/debug (release exe + shortcut untouched)..."
    Remove-Item $debug -Recurse -Force
  } else {
    Write-Host "target/debug already gone - nothing to remove."
  }
}

$after = Get-DirMB $target
Write-Host ("target/ after:  {0,8:N0} MB" -f $after) -ForegroundColor Cyan
Write-Host ("freed:          {0,8:N0} MB" -f ($before - $after)) -ForegroundColor Green
