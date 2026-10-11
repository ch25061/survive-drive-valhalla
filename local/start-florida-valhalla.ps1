$ErrorActionPreference = 'Stop'
$runtime = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..\work\valhalla-local')).Path
# A verified national stage supersedes the Florida-only registry permanently.
if (Test-Path -LiteralPath (Join-Path $runtime 'national-road-stage.txt')) { return }
$tiles = Join-Path $runtime 'data\tiles-florida'
if (-not (Test-Path -LiteralPath $tiles -PathType Container)) { return }
$service = (Resolve-Path -LiteralPath (Join-Path $runtime '.venv\Lib\site-packages\valhalla\bin\valhalla_service.exe')).Path
$configPath = Join-Path $runtime 'valhalla-full-florida.json'
$listener = @(Get-NetTCPConnection -State Listen -LocalPort 8100 -ErrorAction SilentlyContinue)
if ($listener.Count) {
    if ($listener.Count -ne 1) { throw 'Unexpected Florida engine listener.' }
    $owner = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $listener[0].OwningProcess)
    if ($owner.ExecutablePath -ne $service -or $owner.CommandLine -notlike '*valhalla-full-florida.json*') { throw 'Port 8100 is owned by another application.' }
} else {
    foreach ($port in 8100..8106) {
        if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw ('Florida engine port is already occupied: ' + $port) }
    }
    $config = Get-Content -LiteralPath (Join-Path $runtime 'valhalla.json') -Raw | ConvertFrom-Json -AsHashtable
    $config.mjolnir.tile_dir = $tiles
    $config.mjolnir.tile_extract = ''
    $config.logging.color = $false
    $config.service_limits.max_radius = 1600
    $text = $config | ConvertTo-Json -Depth 50
    foreach ($port in 8002..8008) { $text = $text.Replace(('tcp://127.0.0.1:' + $port),('tcp://127.0.0.1:' + ($port + 98))) }
    [IO.File]::WriteAllText($configPath,$text,[Text.UTF8Encoding]::new($false))
    $env:PATH = (Join-Path $runtime '.venv\Lib\site-packages\pyvalhalla.libs') + ';' + (Split-Path -Parent $service) + ';' + $env:PATH
    $process = Start-Process -FilePath $service -ArgumentList 'valhalla-full-florida.json','2' -WorkingDirectory $runtime -RedirectStandardOutput (Join-Path $runtime 'service-full-florida.out.log') -RedirectStandardError (Join-Path $runtime 'service-full-florida.err.log') -WindowStyle Hidden -PassThru
}
$ready = $false
for ($check=0; $check -lt 40; $check++) {
    try { $status = Invoke-RestMethod -Uri http://127.0.0.1:8100/status -TimeoutSec 2; if ($status.version) { $ready = $true; break } } catch {}
    Start-Sleep -Milliseconds 500
}
if (-not $ready) { throw 'The full Florida engine did not become ready; regional routing was not enabled.' }
$registry = @{schema='rs_regional_engines_v1';regions=@(@{name='Florida';bounds=@(-87.64,24.39,-79.97,31.01);base_url='http://127.0.0.1:8100'})}
$registryPath = Join-Path $runtime 'regional-engines.json'
if (Test-Path -LiteralPath $registryPath) {
    $existing = Get-Content -LiteralPath $registryPath -Raw | ConvertFrom-Json
    if ($existing.schema -eq 'rs_regional_engines_v1' -and $existing.regions.Count -eq 1) {
        $region = $existing.regions[0]
        if ($region.name -eq 'United States' -or ($region.name -eq 'Florida' -and $region.base_url -eq 'http://127.0.0.1:8100' -and ($region.bounds -join ',') -eq '-87.64,24.39,-79.97,31.01')) { return }
    }
}
[IO.File]::WriteAllText(($registryPath + '.florida-new'),($registry | ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
[IO.File]::Move(($registryPath + '.florida-new'),$registryPath,$true)
Write-Output 'Full Florida road coverage is ready; nationwide city coverage remains available.'
