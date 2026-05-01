# Build the RISK WISE Python engine with PyInstaller (fallback / baseline).
#
# Implements the exact build command from
# docs/spikes/adr-bundling.md §3.3. Kept alongside the
# Nuitka script so the measurement harness can run both bundlers from a
# single CI invocation and produce apples-to-apples §4.4 rows.
#
#     uv sync --extra bundle
#     ./scripts/build_engine_pyinstaller.ps1          # full bundle
#     ./scripts/build_engine_pyinstaller.ps1 -Lean    # engine-path bundle (no CLIMADA)
#
# Output: dist/pyinstaller/riskwise-engine/ (onedir for fair compare vs
# Nuitka --standalone; see ADR §3.3 notes).
#
# -Lean drops --collect-submodules climada and --collect-data climada for
# measuring the engine-path bundle per issue #165. Default preserves the
# exact ADR §3.3 flag set.

#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$Lean
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

New-Item -ItemType Directory -Force -Path 'dist/pyinstaller' | Out-Null
New-Item -ItemType Directory -Force -Path 'build/pyinstaller' | Out-Null

$pyinstallerArgs = @(
    '--onedir',
    '--name', 'riskwise-engine',
    '--distpath', 'dist/pyinstaller',
    '--workpath', 'build/pyinstaller',
    '--specpath', 'build/pyinstaller'
)

if (-not $Lean) {
    $pyinstallerArgs += @(
        '--collect-submodules', 'climada',
        '--collect-data', 'climada'
    )
}

$pyinstallerArgs += @(
    '--collect-data', 'rasterio',
    '--collect-data', 'pyproj',
    '--collect-data', 'shapely',
    '--collect-data', 'backend',
    '--exclude-module', 'matplotlib',
    '--exclude-module', 'tkinter',
    '--exclude-module', 'IPython',
    '--exclude-module', 'notebook',
    '--exclude-module', 'PyQt5',
    '--exclude-module', 'PyQt6',
    '--noconfirm',
    'backend/__main__.py'
)

& pyinstaller @pyinstallerArgs

if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller build failed with exit code $LASTEXITCODE"
}

# Copy the shipped-data trees next to the engine .exe inside the onedir
# bundle. Same rationale as the Nuitka script: shipped data lives
# alongside ``sys.executable`` so the runtime resolver finds it without
# needing a re-bundle to refresh data. See
# docs/spikes/adr-bundling.md §3.5.
$BundleDir = Join-Path $RepoRoot 'dist/pyinstaller/riskwise-engine'
foreach ($tree in 'data', 'countries', 'requirements') {
    $src = Join-Path $RepoRoot $tree
    $dst = Join-Path $BundleDir $tree
    if (-not (Test-Path $src)) {
        throw "Shipped-data tree missing at $src — cannot stage bundle"
    }
    if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
    Copy-Item -Recurse -Force $src $dst
}

Write-Host "Build complete: dist/pyinstaller/riskwise-engine/"
