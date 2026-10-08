param([Parameter(Mandatory=$true)][string]$KeyFile)
$ErrorActionPreference = 'Stop'
$resolvedKey = (Resolve-Path -LiteralPath $KeyFile).Path
$launcher = Join-Path $PSScriptRoot 'start-desktop-host.ps1'
$powerShell = (Get-Process -Id $PID).Path
$taskName = 'Route Screwtiny Desktop Valhalla'
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = '-NoProfile -WindowStyle Hidden -File "' + $launcher + '" -KeyFile "' + $resolvedKey + '"'
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Output 'RS desktop routing will start after this Windows user signs in. The existing Cloudflare service remains unchanged.'
