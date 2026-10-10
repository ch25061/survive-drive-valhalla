param([Parameter(Mandatory=$true)][string]$ConfigPath)
$ErrorActionPreference = 'Stop'
$resolvedConfig = (Resolve-Path -LiteralPath $ConfigPath).Path
$configText = [IO.File]::ReadAllText($resolvedConfig)
$config = $configText | ConvertFrom-Json
if ($null -eq $config.service_limits.max_radius) { throw 'Missing Valhalla service_limits.max_radius' }
if ($config.service_limits.max_radius -eq 1600) { return }
# Change only this one service limit; leave the graph, exclusions and all other settings intact.
$pattern = '"max_radius"\s*:\s*\d+'
if ([regex]::Matches($configText,$pattern).Count -ne 1) { throw 'Ambiguous Valhalla max_radius setting' }
$updatedText = [regex]::Replace($configText,$pattern,'"max_radius": 1600')
$updated = $updatedText | ConvertFrom-Json
if ($updated.service_limits.max_radius -ne 1600) { throw 'Gate radius cap was not updated' }
$backupPath = $resolvedConfig + '.before-gate-policy-' + (Get-Date -Format 'yyyyMMdd-HHmmssfff')
Copy-Item -LiteralPath $resolvedConfig -Destination $backupPath -ErrorAction Stop
[IO.File]::WriteAllText($resolvedConfig,$updatedText,[Text.UTF8Encoding]::new($false))
Write-Output 'Valhalla gate radius cap set to 1600 meters; previous configuration backed up.'
