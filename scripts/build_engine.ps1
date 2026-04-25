# Build the RISK WISE Python engine with Nuitka (primary / Track A).
#
# Implements the exact build command from
# docs/spikes/adr-bundling.md §3.2. Run from the repo root
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

# Azure Trusted Signing — guarded on AZURE_CLIENT_ID so unsigned dev/fork
# builds continue to work unchanged. When the six Azure env vars are set
# (see docs/reference/signing.md § "Activation path B"), this block signs every PE
# file in dist/nuitka (the engine onefile .exe plus any sibling DLLs that
# survive a non-onefile build). Azure.CodeSigning.Dlib.dll is pulled from
# the Microsoft.Trusted.Signing.Client NuGet package on first use and
# cached under dist/signing/ so repeated calls are cheap.
if ([string]::IsNullOrWhiteSpace($env:AZURE_CLIENT_ID)) {
    Write-Host "AZURE_CLIENT_ID not set — skipping Azure Trusted Signing (unsigned build)"
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
            throw "AZURE_CLIENT_ID is set but $required is missing — refusing to produce a partially-signed build"
        }
    }

    Write-Host "Azure Trusted Signing credentials detected — signing engine binaries"

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
        throw "signtool.exe not found on PATH or under Windows Kits — install the Windows 10 SDK"
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

    $targets = Get-ChildItem -Path 'dist/nuitka' -Recurse -File -Include *.exe, *.dll -ErrorAction SilentlyContinue
    if (-not $targets) {
        throw "No .exe/.dll files found under dist/nuitka — nothing to sign"
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

    Write-Host "Azure Trusted Signing complete — $($targets.Count) file(s) signed"
}
