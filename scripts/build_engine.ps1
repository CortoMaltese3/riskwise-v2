# Build the RISK WISE Python engine with Nuitka (primary / Track A).
#
# Implements the exact build command from
# docs/architecture-decisions/adr-bundling.md §3.2. Run from the repo root
# inside a venv that has the `bundle` extra installed:
#
#     uv sync --extra bundle
#     ./scripts/build_engine.ps1
#
# Output: dist/nuitka/riskwise-engine.exe
#
# Do not "optimise" flags here without updating the ADR first — the flag
# set is part of the bundler decision, not a script detail.

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

# Run from the repo root regardless of where the caller invoked us.
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

New-Item -ItemType Directory -Force -Path 'dist/nuitka' | Out-Null

python -m nuitka `
  --standalone `
  --onefile `
  --python-flag=no_site `
  --assume-yes-for-downloads `
  --enable-plugin=numpy `
  --enable-plugin=pylint-warnings `
  --include-package=climada `
  --include-package=rasterio `
  --include-package=fiona `
  --include-package=pyproj `
  --include-package-data=climada `
  --include-package-data=rasterio `
  --include-package-data=pyproj `
  --include-package-data=shapely `
  --nofollow-import-to=matplotlib `
  --nofollow-import-to=tkinter `
  --nofollow-import-to=IPython `
  --nofollow-import-to=notebook `
  --output-dir=dist/nuitka `
  --output-filename=riskwise-engine.exe `
  --company-name="RISK WISE" `
  --product-name="RISK WISE Engine" `
  --file-version=2.0.0.0 `
  --product-version=2.0.0.0 `
  backend/__main__.py

if ($LASTEXITCODE -ne 0) {
    throw "Nuitka build failed with exit code $LASTEXITCODE"
}

Write-Host "Build complete: dist/nuitka/riskwise-engine.exe"
