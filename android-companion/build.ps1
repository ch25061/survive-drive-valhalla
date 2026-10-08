param([Parameter(Mandatory=$true)][string]$SdkPath,[Parameter(Mandatory=$true)][string]$JavaPath,[Parameter(Mandatory=$true)][string]$SigningPath)
$ErrorActionPreference='Stop'
$projectPath=$PSScriptRoot
$buildPath=Join-Path $projectPath 'build'
$toolsPath=Join-Path $SdkPath 'build-tools/35.0.0'
$androidJar=Join-Path $SdkPath 'platforms/android-35/android.jar'
$env:JAVA_HOME=$JavaPath
function Invoke-BuildTool([string]$Tool,[string[]]$Arguments) { & $Tool @Arguments; if($LASTEXITCODE -ne 0){throw "Build tool failed: $Tool"} }
New-Item -ItemType Directory -Force -Path $buildPath,(Join-Path $buildPath 'classes'),(Join-Path $buildPath 'dex'),$SigningPath | Out-Null
Invoke-BuildTool (Join-Path $toolsPath 'aapt2.exe') @('compile','--dir',(Join-Path $projectPath 'res'),'-o',(Join-Path $buildPath 'resources.zip'))
Invoke-BuildTool (Join-Path $toolsPath 'aapt2.exe') @('link','-I',$androidJar,'--manifest',(Join-Path $projectPath 'AndroidManifest.xml'),'-R',(Join-Path $buildPath 'resources.zip'),'-o',(Join-Path $buildPath 'unsigned.apk'))
$sources=@(Get-ChildItem -LiteralPath (Join-Path $projectPath 'src') -Recurse -Filter '*.java' | ForEach-Object FullName)
Invoke-BuildTool (Join-Path $JavaPath 'bin/javac.exe') (@('--release','8','-encoding','UTF-8','-classpath',$androidJar,'-d',(Join-Path $buildPath 'classes'))+$sources)
$classFiles=@(Get-ChildItem -LiteralPath (Join-Path $buildPath 'classes') -Recurse -Filter '*.class' | ForEach-Object FullName)
Invoke-BuildTool (Join-Path $toolsPath 'd8.bat') (@('--min-api','26','--lib',$androidJar,'--output',(Join-Path $buildPath 'dex'))+$classFiles)
Invoke-BuildTool (Join-Path $JavaPath 'bin/jar.exe') @('uf',(Join-Path $buildPath 'unsigned.apk'),'-C',(Join-Path $buildPath 'dex'),'classes.dex')
Invoke-BuildTool (Join-Path $toolsPath 'zipalign.exe') @('-f','4',(Join-Path $buildPath 'unsigned.apk'),(Join-Path $buildPath 'aligned.apk'))
$keyPath=Join-Path $SigningPath 'rs-companion.p12'
$passwordPath=Join-Path $SigningPath 'password.dpapi'
if(-not(Test-Path -LiteralPath $keyPath)) {
    if(Test-Path -LiteralPath $passwordPath){throw 'Signing password exists without its key; recover it before generating another identity.'}
    $signingBytes=New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($signingBytes)
    $env:RS_SIGNING_PASSWORD=[Convert]::ToBase64String($signingBytes)
    ConvertTo-SecureString $env:RS_SIGNING_PASSWORD -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $passwordPath
    Invoke-BuildTool (Join-Path $JavaPath 'bin/keytool.exe') @('-genkeypair','-keystore',$keyPath,'-storetype','PKCS12','-storepass:env','RS_SIGNING_PASSWORD','-keypass:env','RS_SIGNING_PASSWORD','-alias','rs-companion','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Route Screwtiny Android Companion')
} else {
    $signingSecret=Get-Content -LiteralPath $passwordPath | ConvertTo-SecureString
    $env:RS_SIGNING_PASSWORD=[System.Net.NetworkCredential]::new('', $signingSecret).Password
}
try {
    $outputPath=Join-Path (Split-Path $projectPath) 'dist/rs-osmand-companion.apk'
    Invoke-BuildTool (Join-Path $toolsPath 'apksigner.bat') @('sign','--v4-signing-enabled','false','--ks',$keyPath,'--ks-key-alias','rs-companion','--ks-pass','env:RS_SIGNING_PASSWORD','--out',$outputPath,(Join-Path $buildPath 'aligned.apk'))
    Invoke-BuildTool (Join-Path $toolsPath 'apksigner.bat') @('verify','--verbose','--print-certs',$outputPath)
    $hash=(Get-FileHash -LiteralPath $outputPath).Hash.ToLowerInvariant()
    @{version='0.1-trial';sha256=$hash;size_bytes=(Get-Item -LiteralPath $outputPath).Length} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path (Split-Path $projectPath) 'dist/rs-android-build.json')
} finally {Remove-Item Env:RS_SIGNING_PASSWORD -ErrorAction SilentlyContinue}
