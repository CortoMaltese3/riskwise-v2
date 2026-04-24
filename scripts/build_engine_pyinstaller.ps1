# Build the RISK WISE Python engine with PyInstaller (fallback / baseline).
#
# Implements the exact build command from
# docs/architecture-decisions/adr-bundling.md §3.3. Kept alongside the
# Nuitka script so the measurement harness can run both bundlers from a
# single CI invocation and produce apples-to-apples §4.4 rows.
#
#     uv sync --extra bundle
#     ./scripts/build_engine_pyinstaller.ps1
#
# Output: dist/pyinstaller/riskwise-engine/ (onedir for fair compare vs
# Nuitka --standalone; see ADR §3.3 notes).

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

New-Item -ItemType Directory -Force -Path 'dist/pyinstaller' | Out-Null
New-Item -ItemType Directory -Force -Path 'build/pyinstaller' | Out-Null

pyinstaller `
  --onedir `
  --name riskwise-engine `
  --distpath dist/pyinstaller `
  --workpath build/pyinstaller `
  --specpath build/pyinstaller `
  --collect-submodules climada `
  --collect-data climada `
  --collect-data rasterio `
  --collect-data pyproj `
  --collect-data shapely `
  --exclude-module matplotlib `
  --exclude-module tkinter `
  --exclude-module IPython `
  --exclude-module notebook `
  --exclude-module PyQt5 `
  --exclude-module PyQt6 `
  --noconfirm `
  backend/__main__.py

if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller build failed with exit code $LASTEXITCODE"
}

Write-Host "Build complete: dist/pyinstaller/riskwise-engine/"
