# Build the RISK WISE Python engine with Nuitka (primary / Track A).
#
# Implements the build command from docs/spikes/adr-bundling.md §3.2 (post-D26
# / climate-lama-engine cutover -- CLIMADA is no longer a runtime dependency,
# so the climada include flags have been removed). Run from the repo root
# inside a venv that has the `bundle` extra installed:
#
#     uv sync --extra bundle
#     ./scripts/build_engine.ps1                       # --onefile (default)
#     ./scripts/build_engine.ps1 -Mode standalone      # --standalone (onedir)
#
# Output:
#   default          : dist/nuitka/riskwise-engine.exe
#   -Mode standalone : dist/nuitka-standalone/riskwise-engine.dist/riskwise-engine.exe
#
# Do not "optimise" the flag set here without updating the ADR first --
# the flag set is part of the bundler decision, not a script detail.

#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('onefile', 'standalone')]
    [string]$Mode = 'onefile'
)

$ErrorActionPreference = 'Stop'

# Run from the repo root regardless of where the caller invoked us.
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

# Defensive: kill any running engine instances before Nuitka tries to
# overwrite the previous build's output. The Nuitka onefile bootstrap forks
# a child Python that survives a Stop-Process on the parent, so dev
# iterations can leave orphans that hold dist/nuitka/riskwise-engine.exe
# under a Windows file lock -- failing the rebuild with "Access is denied".
$staleEngines = @(Get-Process riskwise-engine -ErrorAction SilentlyContinue)
if ($staleEngines.Count -gt 0) {
    Write-Host "Stopping $($staleEngines.Count) stale riskwise-engine process(es) before build..."
    $staleEngines | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}

if ($Mode -eq 'onefile') {
    $outputDir = 'dist/nuitka'
} else {
    $outputDir = 'dist/nuitka-standalone'
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$nuitkaArgs = @(
    '--standalone',
    '--python-flag=no_site',
    '--assume-yes-for-downloads',
    '--enable-plugin=pylint-warnings'
)

if ($Mode -eq 'onefile') {
    $nuitkaArgs += '--onefile'
}

$nuitkaArgs += @(
    '--include-package=rasterio',
    '--include-package=pyogrio',
    '--include-package=pyproj',
    '--include-package-data=rasterio',
    '--include-package-data=pyogrio',
    '--include-package-data=pyproj',
    '--include-package-data=shapely',
    '--include-package-data=backend',
    '--nofollow-import-to=matplotlib',
    '--nofollow-import-to=tkinter',
    '--nofollow-import-to=IPython',
    '--nofollow-import-to=notebook',
    "--output-dir=$outputDir",
    '--output-filename=riskwise-engine.exe',
    '--company-name=RISK WISE',
    '--product-name=RISK WISE Engine',
    '--file-version=2.0.0.0',
    '--product-version=2.0.0.0',
    'backend/__main__.py'
)

& python -m nuitka @nuitkaArgs

if ($LASTEXITCODE -ne 0) {
    throw "Nuitka build failed with exit code $LASTEXITCODE"
}

# Nuitka derives the standalone dist folder name from the entry-point
# script's basename, so backend/__main__.py produces __main__.dist
# regardless of --output-filename. Rename it to riskwise-engine.dist so
# the on-disk layout matches the binary's product name and so the staged
# shipped-data trees end up inside the bundle Nuitka actually wrote.
# (Onefile mode does not have this problem -- the bootstrap exe lives
# in $outputDir/ directly and the intermediate __main__.dist is unused
# at runtime.)
if ($Mode -eq 'standalone') {
    $nuitkaDistRaw = Join-Path $outputDir '__main__.dist'
    $nuitkaDistFinal = Join-Path $outputDir 'riskwise-engine.dist'
    if (-not (Test-Path $nuitkaDistRaw)) {
        throw "Expected Nuitka standalone dist at $nuitkaDistRaw -- did Nuitka change its naming convention?"
    }
    if (Test-Path $nuitkaDistFinal) { Remove-Item -Recurse -Force $nuitkaDistFinal }
    Rename-Item -Path $nuitkaDistRaw -NewName 'riskwise-engine.dist'
}

# Copy the shipped-data trees alongside the engine .exe. They sit outside
# the bundle so a re-bundle is not required to refresh hazard files,
# country configs, or the requirements XLSX templates. The runtime
# resolver in backend/constants.get_base_dir() returns
# ``Path(sys.executable).parent`` under sys.frozen, which is exactly this
# directory -- see docs/spikes/adr-bundling.md §3.5.
if ($Mode -eq 'onefile') {
    $BundleDir = Join-Path $RepoRoot $outputDir
} else {
    $BundleDir = Join-Path $RepoRoot (Join-Path $outputDir 'riskwise-engine.dist')
}
foreach ($tree in 'data', 'countries', 'requirements') {
    $src = Join-Path $RepoRoot $tree
    $dst = Join-Path $BundleDir $tree
    if (-not (Test-Path $src)) {
        throw "Shipped-data tree missing at $src -- cannot stage bundle"
    }
    if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
    Copy-Item -Recurse -Force $src $dst
}

# Post-build layout assertion. A 30-60 minute build that produces a bundle
# in the wrong shape is the worst possible failure mode -- catch it here
# rather than at the next ./scripts/measure_engine.ps1 invocation. Both
# bundle modes ship the engine .exe and the data trees as siblings in
# $BundleDir; the only difference is where $BundleDir sits.
$expectedExe = Join-Path $BundleDir 'riskwise-engine.exe'
if (-not (Test-Path $expectedExe)) {
    throw "Post-build sanity check failed: engine exe missing at $expectedExe"
}
foreach ($tree in 'data', 'countries', 'requirements') {
    $checkPath = Join-Path $BundleDir $tree
    if (-not (Test-Path $checkPath)) {
        throw "Post-build sanity check failed: shipped-data tree missing at $checkPath"
    }
}
Write-Host "Post-build layout verified: $expectedExe + data/countries/requirements"

if ($Mode -eq 'onefile') {
    Write-Host "Build complete: $outputDir/riskwise-engine.exe"
} else {
    Write-Host "Build complete: $outputDir/riskwise-engine.dist/riskwise-engine.exe"
}

# Azure Trusted Signing -- guarded on AZURE_CLIENT_ID so unsigned dev/fork
# builds continue to work unchanged. When the six Azure env vars are set
# (see docs/reference/signing.md § "Activation path B"), this block signs every PE
# file in dist/nuitka (the engine onefile .exe plus any sibling DLLs that
# survive a non-onefile build). Azure.CodeSigning.Dlib.dll is pulled from
# the Microsoft.Trusted.Signing.Client NuGet package on first use and
# cached under dist/signing/ so repeated calls are cheap.
if ([string]::IsNullOrWhiteSpace($env:AZURE_CLIENT_ID)) {
    Write-Host "AZURE_CLIENT_ID not set -- skipping Azure Trusted Signing (unsigned build)"
}
else {
    foreach ($required in @(
        'AZURE_TENANT_ID',
        'AZURE_CLIENT_SECRET',
        'AZURE_ENDPOINT',
        'AZURE_CODE_SIGNING_ACCOUNT_NAME',
        'AZURE_CERT_PROFILE_NAME'
    )) {
        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($required))) {
            throw "AZURE_CLIENT_ID is set but $required is missing -- refusing to produce a partially-signed build"
        }
    }

    Write-Host "Azure Trusted Signing credentials detected -- signing engine binaries"

    $signingDir = Join-Path $RepoRoot 'dist/signing'
    New-Item -ItemType Directory -Force -Path $signingDir | Out-Null

    # Resolve signtool.exe from the Windows SDK (present on windows-latest
    # runners). Prefer the newest x64 build.
    $signtool = $null
    $signtoolCmd = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($signtoolCmd) { $signtool = $signtoolCmd.Source }
    if (-not $signtool) {
        $sdkRoot = 'C:\Program Files (x86)\Windows Kits\10\bin'
        if (Test-Path $sdkRoot) {
            $candidate = Get-ChildItem -Path $sdkRoot -Recurse -Filter 'signtool.exe' -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -match 'x64\\signtool\.exe$' } |
                Sort-Object FullName -Descending |
                Select-Object -First 1
            if ($candidate) { $signtool = $candidate.FullName }
        }
    }
    if (-not $signtool) {
        throw "signtool.exe not found on PATH or under Windows Kits -- install the Windows 10 SDK"
    }

    # Fetch the Azure Trusted Signing client package (contains the signtool
    # dlib). Pin the version so signing stays reproducible across CI runs.
    $pkgVersion = '1.0.60'
    $pkgRoot = Join-Path $signingDir "trusted-signing-client-$pkgVersion"
    if (-not (Test-Path $pkgRoot)) {
        $pkgZip = Join-Path $signingDir "trusted-signing-client-$pkgVersion.zip"
        $pkgUrl = "https://www.nuget.org/api/v2/package/Microsoft.Trusted.Signing.Client/$pkgVersion"
        Write-Host "Downloading Microsoft.Trusted.Signing.Client@$pkgVersion"
        Invoke-WebRequest -Uri $pkgUrl -OutFile $pkgZip -UseBasicParsing
        Expand-Archive -Path $pkgZip -DestinationPath $pkgRoot -Force
        Remove-Item -Path $pkgZip -Force
    }

    $dlib = Get-ChildItem -Path $pkgRoot -Recurse -Filter 'Azure.CodeSigning.Dlib.dll' -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match 'x64' } |
        Select-Object -First 1
    if (-not $dlib) {
        throw "Azure.CodeSigning.Dlib.dll not found under $pkgRoot (x64)"
    }

    $metadata = [ordered]@{
        Endpoint               = $env:AZURE_ENDPOINT
        CodeSigningAccountName = $env:AZURE_CODE_SIGNING_ACCOUNT_NAME
        CertificateProfileName = $env:AZURE_CERT_PROFILE_NAME
    } | ConvertTo-Json -Depth 3
    $metadataFile = Join-Path $signingDir 'azure-signing-metadata.json'
    Set-Content -Path $metadataFile -Value $metadata -Encoding utf8

    $targets = Get-ChildItem -Path $outputDir -Recurse -File -Include *.exe, *.dll -ErrorAction SilentlyContinue
    if (-not $targets) {
        throw "No .exe/.dll files found under $outputDir -- nothing to sign"
    }

    foreach ($target in $targets) {
        Write-Host "Signing $($target.FullName)"
        & $signtool sign `
            /v `
            /fd SHA256 `
            /tr 'http://timestamp.acs.microsoft.com' `
            /td SHA256 `
            /dlib $dlib.FullName `
            /dmdf $metadataFile `
            $target.FullName
        if ($LASTEXITCODE -ne 0) {
            throw "signtool failed on $($target.FullName) with exit code $LASTEXITCODE"
        }
    }

    Write-Host "Azure Trusted Signing complete -- $($targets.Count) file(s) signed"
}
