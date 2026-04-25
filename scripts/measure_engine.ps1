# Measure a bundled engine against the protocol in
# docs/spikes/adr-bundling.md §4.3.
#
# Emits one JSON row (single line, stdout) matching the schema scaffolded
# in ADR §4.4. Fields that require the Egypt flood scenario (the ADR's
# reference scenario) are populated only when -ScenarioPayload is passed
# and the engine binds a port; otherwise they land as $null so the row
# still slots into the §4.4 table.
#
# Usage:
#     ./scripts/measure_engine.ps1 -Bundler nuitka `
#         -EnginePath dist/nuitka/riskwise-engine.exe `
#         -DistPath dist/nuitka `
#         -LockPath uv.lock
#
# Optional:
#     -ScenarioPayload path/to/scenario-request.json  # enables runtime measurement
#     -BaselineRuntimeS 72.4                          # unbundled reference for Δ %
#     -ReadyTimeoutS 30                               # cold-start watchdog

#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('nuitka', 'pyinstaller', 'unbundled')]
    [string]$Bundler,

    [Parameter(Mandatory = $true)]
    [string]$EnginePath,

    [Parameter(Mandatory = $true)]
    [string]$DistPath,

    [Parameter(Mandatory = $true)]
    [string]$LockPath,

    [string]$ScenarioPayload,

    [double]$BaselineRuntimeS = [double]::NaN,

    [int]$ReadyTimeoutS = 30
)

$ErrorActionPreference = 'Stop'

function Get-BundleSizeMb {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    $bytes = (Get-ChildItem -Path $Path -Recurse -File -Force |
        Measure-Object -Property Length -Sum).Sum
    if ($null -eq $bytes) { return 0 }
    return [math]::Round($bytes / 1MB, 2)
}

function Get-LockHash {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    return (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-PythonVersion {
    try { return (& python --version 2>&1).ToString().Trim() }
    catch { return $null }
}

function Get-OsBuild {
    try {
        $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop
        return "$($os.Caption) $($os.Version)".Trim()
    } catch {
        return [System.Environment]::OSVersion.VersionString
    }
}

# Spawn the engine and time the wall-clock from process start to the
# `{"type":"event","name":"ready","port":N}` line on stdout. Returns a
# hashtable with ColdStartMs, Port, Process.
function Start-EngineAndWaitForReady {
    param(
        [string]$ExePath,
        [int]$TimeoutS
    )

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = (Resolve-Path $ExePath).Path
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    [void]$proc.Start()

    $readyLine = $null
    while (-not $proc.HasExited -and $sw.Elapsed.TotalSeconds -lt $TimeoutS) {
        $line = $proc.StandardOutput.ReadLine()
        if ($null -eq $line) { continue }
        if ($line -match '"name"\s*:\s*"ready"') {
            $readyLine = $line
            break
        }
    }
    $sw.Stop()

    if (-not $readyLine) {
        if (-not $proc.HasExited) { $proc.Kill() }
        throw "Engine did not emit a ready event within $TimeoutS s"
    }

    $payload = $readyLine | ConvertFrom-Json
    return @{
        ColdStartMs = [math]::Round($sw.Elapsed.TotalMilliseconds, 2)
        Port        = [int]$payload.port
        Process     = $proc
    }
}

function Invoke-ScenarioRun {
    param(
        [int]$Port,
        [string]$PayloadPath
    )

    $body = Get-Content -Raw -Path $PayloadPath
    $base = "http://127.0.0.1:$Port/api/v1"

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $submit = Invoke-RestMethod -Method Post -Uri "$base/scenario/run" `
        -ContentType 'application/json' -Body $body
    $jobId = $submit.job_id

    $streamUri = "$base/scenario/$jobId/stream"
    # Invoke-WebRequest streams SSE line-by-line when -UseBasicParsing is set
    # and the server returns text/event-stream. We consume until we see a
    # terminal `type`=`result`, `cancelled`, or `error` event — which the
    # backend publishes right before closing the queue.
    $req = [System.Net.HttpWebRequest]::Create($streamUri)
    $req.Method = 'GET'
    $req.Accept = 'text/event-stream'
    $resp = $req.GetResponse()
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    try {
        while (-not $reader.EndOfStream) {
            $line = $reader.ReadLine()
            if (-not $line -or -not $line.StartsWith('data:')) { continue }
            $event = ($line.Substring(5)).Trim() | ConvertFrom-Json
            if ($event.type -in @('result', 'cancelled', 'error')) { break }
        }
    } finally {
        $reader.Dispose()
        $resp.Dispose()
    }
    $sw.Stop()
    return [math]::Round($sw.Elapsed.TotalSeconds, 3)
}

# ---- measurement ---------------------------------------------------------

$bundleSizeMb = Get-BundleSizeMb -Path $DistPath
$lockHash = Get-LockHash -Path $LockPath
$pythonVersion = Get-PythonVersion
$osBuild = Get-OsBuild

$coldStartMs = $null
$scenarioRuntimeS = $null
$runtimeDeltaPct = $null

$engine = $null
try {
    $engine = Start-EngineAndWaitForReady -ExePath $EnginePath -TimeoutS $ReadyTimeoutS
    $coldStartMs = $engine.ColdStartMs

    if ($ScenarioPayload) {
        if (-not (Test-Path $ScenarioPayload)) {
            throw "Scenario payload not found: $ScenarioPayload"
        }
        $scenarioRuntimeS = Invoke-ScenarioRun -Port $engine.Port `
            -PayloadPath $ScenarioPayload

        if (-not [double]::IsNaN($BaselineRuntimeS) -and $BaselineRuntimeS -gt 0) {
            $runtimeDeltaPct = [math]::Round(
                (($scenarioRuntimeS - $BaselineRuntimeS) / $BaselineRuntimeS) * 100, 2
            )
        }
    }
} finally {
    if ($engine -and $engine.Process -and -not $engine.Process.HasExited) {
        $engine.Process.Kill()
    }
}

$row = [ordered]@{
    bundler           = $Bundler
    bundle_size_mb    = $bundleSizeMb
    cold_start_ms     = $coldStartMs
    scenario_runtime_s = $scenarioRuntimeS
    runtime_delta_pct = $runtimeDeltaPct
    python_version    = $pythonVersion
    os_build          = $osBuild
    lock_hash         = $lockHash
}

$row | ConvertTo-Json -Compress
