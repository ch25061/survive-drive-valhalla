param([Parameter(Mandatory=$true)][string]$KeyFile)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $KeyFile -PathType Leaf)) { throw 'The private RS gateway key file is missing.' }
# This launcher reuses healthy engine/bridge processes; it never replaces them.
& (Join-Path $PSScriptRoot 'start-local-valhalla.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Desktop Valhalla did not start.' }
$env:RS_VALHALLA_KEY_FILE = (Resolve-Path -LiteralPath $KeyFile).Path
& (Get-Command node -ErrorAction Stop).Source (Join-Path $PSScriptRoot 'hosted-gateway.mjs')
exit $LASTEXITCODE
