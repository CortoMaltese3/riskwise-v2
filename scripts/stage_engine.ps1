# Stage the locally-built RISK WISE engine into the user-local cache dir
# the Electron app reads from at startup.
#
# This is the "deploy" half of the local dev workflow:
#
#     ./scripts/build_engine.ps1   # builds dist/nuitka/riskwise-engine.exe
#     ./scripts/stage_engine.ps1   # copies it + data trees to %LOCALAPPDATA%\RiskWiseEngineV2\
#
# Use ``-DataOnly`` to refresh only ``data/`` / ``countries/`` /
# ``requirements/`` without touching the engine binary -- a hazard file
# or country-config edit does not need a rebuild (see
# docs/spikes/adr-bundling.md §3.5).
#
# The destination dir name (``RiskWiseEngineV2``) must match
# ``ENGINE_DIR_NAME`` in public/electron.js -- electron.js looks for
# the launcher there to decide whether to spawn the Nuitka bundle or
# fall back to the legacy stock-CPython path.

#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$DataOnly
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

# Keep in sync with ENGINE_DIR_NAME in public/electron.js.
$EngineDirName = 'RiskWiseEngineV2'
$Dest = Join-Path $env:LOCALAPPDATA $EngineDirName

New-Item -ItemType Directory -Force -Path $Dest | Out-Null

if (-not $DataOnly) {
    $exeSrc = Join-Path $RepoRoot 'dist/nuitka/riskwise-engine.exe'
    if (-not (Test-Path $exeSrc)) {
        throw "Engine exe not found at $exeSrc -- run scripts/build_engine.ps1 first, or pass -DataOnly to refresh data trees without the binary"
    }

    # The Nuitka onefile bootstrap re-execs into a child Python that
    # outlives a plain Stop-Process on the parent (same orphan pattern
    # the build script defends against). Walk the tree before
    # overwriting the exe so we do not race a file lock.
    $stale = @(Get-Process riskwise-engine -ErrorAction SilentlyContinue)
    if ($stale.Count -gt 0) {
        Write-Host "Stopping $($stale.Count) running riskwise-engine process(es) before staging..."
        foreach ($p in $stale) {
            & taskkill /pid $p.Id /T /F 2>$null | Out-Null
        }
        Start-Sleep -Milliseconds 500
    }

    Write-Host "Copying riskwise-engine.exe -> $Dest"
    Copy-Item -Force $exeSrc (Join-Path $Dest 'riskwise-engine.exe')
}

foreach ($tree in 'data', 'countries', 'requirements') {
    $src = Join-Path $RepoRoot $tree
    $dst = Join-Path $Dest $tree
    if (-not (Test-Path $src)) {
        throw "Shipped-data tree missing at $src -- cannot stage"
    }
    if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
    Write-Host "Copying $tree\ -> $dst"
    Copy-Item -Recurse -Force $src $dst
}

if ($DataOnly) {
    Write-Host "Stage complete (data-only): $Dest"
} else {
    Write-Host "Stage complete: $Dest"
}
