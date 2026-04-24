# Signs engine-manifest.json with a minisign private key and embeds the
# resulting signature into the manifest's `signature` field (issue #115,
# Area 13). The canonical byte-form of the manifest — keys sorted
# alphabetically, no whitespace, signature field stripped — must match the
# verifier in public/engineManifest.js exactly, so we delegate serialization
# to Node to keep both sides on the same JSON representation.
#
# Parameters:
#   -Manifest    Path to engine-manifest.json (overwritten on success).
#   -PrivateKey  Path to minisign private key (engine-manifest.key).
#   -Password    Optional — private-key password (empty string allowed).
#
# Minisign must be on PATH. The signed output file is overwritten in place.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $Manifest,
    [Parameter(Mandatory = $true)][string] $PrivateKey,
    [string] $Password = ''
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Manifest)) { throw "Manifest not found: $Manifest" }
if (-not (Test-Path $PrivateKey)) { throw "Private key not found: $PrivateKey" }

function Invoke-Node {
    param([string]$Script)
    $out = node -e $Script
    if ($LASTEXITCODE -ne 0) { throw "node -e failed ($LASTEXITCODE)" }
    return $out
}

# 1. Build canonical bytes in Node so the signing path and verifier use the
#    same serializer. `process.stdout.write` prevents a trailing newline.
$canonicalPath = Join-Path ([System.IO.Path]::GetTempPath()) ("engine-manifest-canon-" + [guid]::NewGuid() + ".json")
try {
    $script = "const fs=require('fs');const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));delete m.signature;const o={};Object.keys(m).sort().forEach(k=>o[k]=m[k]);fs.writeFileSync(process.argv[2],JSON.stringify(o));"
    & node -e $script $Manifest $canonicalPath
    if ($LASTEXITCODE -ne 0) { throw "Failed to canonicalize manifest" }

    # 2. Sign the canonical file. `-x` points minisign at the explicit
    #    .minisig output path; -W permits an empty password for CI keys.
    $sigPath = "$canonicalPath.minisig"
    if ($Password) {
        $Password | & minisign -S -s $PrivateKey -m $canonicalPath -x $sigPath
    } else {
        & minisign -S -W -s $PrivateKey -m $canonicalPath -x $sigPath
    }
    if ($LASTEXITCODE -ne 0) { throw "minisign signing failed" }
    if (-not (Test-Path $sigPath)) { throw "minisign did not produce $sigPath" }

    # 3. Extract the first base64 line from the .minisig — that is the
    #    signature blob the verifier parses. Skip the comment lines.
    $sigLines = Get-Content -Path $sigPath
    $sigBlob = $sigLines | Where-Object {
        $_ -and -not $_.StartsWith('untrusted comment:') -and -not $_.StartsWith('trusted comment:')
    } | Select-Object -First 1
    if (-not $sigBlob) { throw "Could not extract signature from $sigPath" }

    # 4. Rewrite the manifest with the embedded signature, preserving
    #    whatever key order the release pipeline produced.
    $embed = "const fs=require('fs');const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));m.signature=process.argv[2];fs.writeFileSync(process.argv[1],JSON.stringify(m,null,2)+'\n');"
    & node -e $embed $Manifest $sigBlob
    if ($LASTEXITCODE -ne 0) { throw "Failed to embed signature into $Manifest" }

    Write-Host "Manifest signed: $Manifest"
}
finally {
    if (Test-Path $canonicalPath) { Remove-Item -Path $canonicalPath -Force }
    if (Test-Path "$canonicalPath.minisig") { Remove-Item -Path "$canonicalPath.minisig" -Force }
}
