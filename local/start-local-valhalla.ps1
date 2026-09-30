$ErrorActionPreference = 'Stop'
$runtime = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..\work\valhalla-local')).Path
$service = Join-Path $runtime '.venv\Lib\site-packages\valhalla\bin\valhalla_service.exe'
$libraries = Join-Path $runtime '.venv\Lib\site-packages\pyvalhalla.libs'
$bridge = Join-Path $PSScriptRoot 'bridge.mjs'

function Test-Service($url) {
    try {
        $result = Invoke-RestMethod -Uri $url -TimeoutSec 3
        return $result
    } catch { return $null }
}

if (-not (Test-Service 'http://127.0.0.1:8002/status')) {
    $env:PATH = "$libraries;$env:PATH"
    Start-Process -FilePath $service -ArgumentList 'valhalla.json','4' -WorkingDirectory $runtime -RedirectStandardOutput (Join-Path $runtime 'service.out.log') -RedirectStandardError (Join-Path $runtime 'service.err.log') -WindowStyle Hidden | Out-Null
}
if (-not (Test-Service 'http://127.0.0.1:8003/status')) {
    $env:VALHALLA_CLAIMS_PATH = Join-Path $runtime 'claims.jsonl'
    $node = (Get-Command node -ErrorAction Stop).Source
    Start-Process -FilePath $node -ArgumentList ('"' + $bridge + '"') -WorkingDirectory $PSScriptRoot -RedirectStandardOutput (Join-Path $runtime 'bridge.out.log') -RedirectStandardError (Join-Path $runtime 'bridge.err.log') -WindowStyle Hidden | Out-Null
}

for ($attempt = 0; $attempt -lt 15; $attempt++) {
    $status = Test-Service 'http://127.0.0.1:8003/status'
    if ($status -and $status.valhalla_ready) {
        Write-Output 'Local Valhalla is ready for Illinois, Indiana, Ohio, Kentucky, Florida, and Southern California at http://127.0.0.1:8002.'
        Write-Output 'The Survive Drive local connection is ready at http://127.0.0.1:8003.'
        exit 0
    }
    Start-Sleep -Seconds 1
}
throw 'Local Valhalla did not become ready. Check service.err.log and bridge.err.log in the runtime folder.'
