param([string]$StagePath)
$ErrorActionPreference='Stop'
$runtime=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..\work\valhalla-local')).Path
$stagePointer=Join-Path $runtime 'national-road-stage.txt'
if(-not $StagePath){if(-not (Test-Path -LiteralPath $stagePointer)){return};$StagePath=[IO.File]::ReadAllText($stagePointer).Trim()}
$stage=(Resolve-Path -LiteralPath $StagePath).Path
$proof=Get-Content -LiteralPath (Join-Path $stage 'verification.json') -Raw | ConvertFrom-Json
$build=Get-Content -LiteralPath (Join-Path $stage 'build-status.json') -Raw | ConvertFrom-Json
if($proof.passed-ne $true -or $build.phase-ne 'built' -or $proof.source_md5-ne $build.source_md5 -or $proof.checked_cities-ne 343){throw 'Complete U.S. road graph has not passed its offline checks.'}
$service=(Resolve-Path -LiteralPath (Join-Path $runtime '.venv\Lib\site-packages\valhalla\bin\valhalla_service.exe')).Path
$configPath=Join-Path $stage 'valhalla-national-service.json'
$listener=@(Get-NetTCPConnection -State Listen -LocalPort 8200 -ErrorAction SilentlyContinue)
if($listener.Count){
 if($listener.Count-ne 1){throw 'Unexpected national engine listener.'}
 $owner=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$listener[0].OwningProcess)
 if($owner.ExecutablePath-ne $service -or $owner.CommandLine-notlike '*valhalla-national-service.json*'){throw 'Port 8200 is owned by another application.'}
}else{
 foreach($port in 8200..8206){if(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue){throw ('National engine port is occupied: '+$port)}}
 $text=Get-Content -LiteralPath (Join-Path $stage 'valhalla-national.json') -Raw
 foreach($port in 8002..8008){$text=$text.Replace(('tcp://127.0.0.1:'+ $port),('tcp://127.0.0.1:'+($port+198)))}
 [IO.File]::WriteAllText($configPath,$text,[Text.UTF8Encoding]::new($false))
 $env:PATH=(Join-Path $runtime '.venv\Lib\site-packages\pyvalhalla.libs')+';'+$env:PATH
 Start-Process -FilePath $service -ArgumentList 'valhalla-national-service.json','2' -WorkingDirectory $stage -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stage 'service.out.log') -RedirectStandardError (Join-Path $stage 'service.err.log') | Out-Null
}
$ready=$false
for($i=0;$i-lt 40;$i++){try{$health=Invoke-RestMethod http://127.0.0.1:8200/status -TimeoutSec 2;if($health.version){$ready=$true;break}}catch{};Start-Sleep -Milliseconds 500}
if(-not $ready){throw 'The national engine did not become ready; current coverage was retained.'}
$registry=@{schema='rs_regional_engines_v1';regions=@(@{name='United States';bounds=@(-180,-90,180,90);base_url='http://127.0.0.1:8200'})}
$registryPath=Join-Path $runtime 'regional-engines.json'
if(Test-Path -LiteralPath $registryPath){
 $existing=Get-Content -LiteralPath $registryPath -Raw | ConvertFrom-Json
 if($existing.schema-eq 'rs_regional_engines_v1' -and $existing.regions.Count-eq 1 -and $existing.regions[0].name-eq 'United States' -and $existing.regions[0].base_url-eq 'http://127.0.0.1:8200' -and ($existing.regions[0].bounds-join ',')-eq '-180,-90,180,90'){
  [IO.File]::WriteAllText($stagePointer,$stage,[Text.UTF8Encoding]::new($false))
  Write-Output 'The complete verified U.S. road graph remains ready.'
  return
 }
}
[IO.File]::WriteAllText(($registryPath+'.new'),($registry|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
[IO.File]::Move(($registryPath+'.new'),$registryPath,$true)
[IO.File]::WriteAllText($stagePointer,$stage,[Text.UTF8Encoding]::new($false))
Write-Output 'The complete verified U.S. road graph is ready.'
