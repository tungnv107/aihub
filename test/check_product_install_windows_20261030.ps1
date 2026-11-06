param([switch]$FreshRuntime,[switch]$Autostart,[switch]$ResetToDirect,[switch]$CheckConflictRollback,[Parameter(Mandatory=$true)][string]$LicenseFile,[string]$SetupFile,[string]$PreviousSetupFile,[string]$PreviousVersion='0.3.1',[string]$ExpectedVersion,[string]$ReportDirectory)
$ErrorActionPreference='Stop'
$Evidence=if($ReportDirectory){[IO.Path]::GetFullPath($ReportDirectory)}else{Join-Path $PSScriptRoot 'ch-relay-evidence/product-20261030'}
New-Item -ItemType Directory -Force -Path $Evidence | Out-Null
$Fixture=Join-Path $PSScriptRoot ('product-install-fixture-'+[Guid]::NewGuid().ToString('N'))
$Install=Join-Path $Fixture 'installed'
$Codex=Join-Path $Fixture 'codex'
New-Item -ItemType Directory -Path (Join-Path $Install 'runtime'),$Codex | Out-Null
[IO.File]::WriteAllText((Join-Path $Install 'product.id'),'tdh-relay')
if(-not $FreshRuntime){Copy-Item -LiteralPath 'C:/Users/DELL/AppData/Local/rea-isolated/node_modules/node/bin/node.exe' -Destination (Join-Path $Install 'runtime/node.exe')}
$Original="model = `"gpt-6-astra`"`r`nmodel_provider = `"PreviousProvider`"`r`nopenai_base_url = `"http://localhost:11500/v1`"`r`n[features]`r`nfoo = true`r`n"
[IO.File]::WriteAllText((Join-Path $Codex 'config.toml'),$Original,[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $Codex 'auth.json'),'fixture-credentials-must-remain-unchanged')
$env:TDH_RELAY_HOME=$Install;$env:TDH_CODEX_HOME=$Codex;$env:TDH_RELAY_NO_AUTOSTART=if($Autostart){'0'}else{'1'}
$StartupFile=Join-Path ([Environment]::GetFolderPath('Startup')) 'TDH Relay.vbs'
if($Autostart -and (Test-Path -LiteralPath $StartupFile)){throw 'Existing startup file; test leaves it untouched.'}
$Setup=Join-Path $Fixture 'setup.ps1';$Uninstall=Join-Path $Fixture 'uninstall.ps1'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
if($SetupFile){Copy-Item -LiteralPath $SetupFile -Destination $Setup}else{Invoke-WebRequest -UseBasicParsing -Uri 'https://codex.tudonghoa.me/setup.ps1' -OutFile $Setup -TimeoutSec 30}
Invoke-WebRequest -UseBasicParsing -Uri 'https://codex.tudonghoa.me/setup.ps1?remove=1' -OutFile $Uninstall -TimeoutSec 30
$beforeReal=Get-FileHash -LiteralPath (Join-Path $env:USERPROFILE '.codex/config.toml') -Algorithm SHA256
$report=@{fixture=$Fixture;windows_powershell=$PSVersionTable.PSVersion.ToString();result='pending';autostart_tested=[bool]$Autostart;node_download_tested=[bool]$FreshRuntime}
# Fixture-only replacement for the interactive prompt; no production environment override.
$global:TdhVerificationKey=(Get-Content -LiteralPath $LicenseFile -Raw | ConvertFrom-Json).key
$global:TdhPromptCount=0
function Read-Host {
    param([string]$Prompt,[switch]$AsSecureString)
    if($Prompt -ne 'Nhap key kich hoat TDH Relay' -or -not $AsSecureString){throw 'Unexpected installer prompt.'}
    $global:TdhPromptCount++
    ConvertTo-SecureString -String $global:TdhVerificationKey -AsPlainText -Force
}
try {
    $PreviousActivation=$null
    if($PreviousSetupFile){
        & $PreviousSetupFile
        $PreviousStatus=(& (Join-Path $Install 'runtime/node.exe') (Join-Path $Install 'app/relay_product/cli.mjs') status --home $Install | ConvertFrom-Json)
        if($PreviousStatus.version -ne $PreviousVersion){throw 'Unexpected previous version in upgrade fixture.'}
        $PreviousActivation=$PreviousStatus.license.activationId
        $PreviousExpiry=$PreviousStatus.license.expiresAt
        if(-not $PreviousActivation -or -not $PreviousExpiry){throw 'Previous activation metadata is missing.'}
        if($ResetToDirect){
            $Original="# User returned Codex to direct mode`r`nmodel = `"gpt-6-astra`"`r`nmodel_provider = `"openai`"`r`n[features]`r`nfoo = true`r`n"
            [IO.File]::WriteAllText((Join-Path $Codex 'config.toml'),$Original,[Text.UTF8Encoding]::new($false))
        }
        if($CheckConflictRollback){
            $Conflict="model_provider = `"custom-provider`"`r`nopenai_base_url = `"https://fixture.invalid/v1`"`r`n"
            [IO.File]::WriteAllText((Join-Path $Codex 'config.toml'),$Conflict,[Text.UTF8Encoding]::new($false))
            $FailedAsExpected=$false
            try { & $Setup } catch { $FailedAsExpected=$true }
            if(-not $FailedAsExpected){throw 'Conflicting provider was overwritten.'}
            if([IO.File]::ReadAllText((Join-Path $Codex 'config.toml')) -cne $Conflict){throw 'Rollback changed conflicting config.'}
            $RollbackVersion=& (Join-Path $Install 'runtime/node.exe') (Join-Path $Install 'app/relay_product/cli.mjs') version
            if($RollbackVersion -ne $PreviousVersion){throw 'Previous application was not restored.'}
            $RollbackHealth=Invoke-RestMethod -Uri 'http://127.0.0.1:18455/healthz' -TimeoutSec 3
            if($RollbackHealth.version -ne $PreviousVersion){throw 'Rollback left the new relay process running.'}
            $report.conflict_rollback_verified=$true
            [IO.File]::WriteAllText((Join-Path $Codex 'config.toml'),$Original,[Text.UTF8Encoding]::new($false))
        }
    }
    & $Setup
    if(-not [IO.File]::ReadAllText((Join-Path $Codex 'config.toml')).Contains('http://127.0.0.1:18455/v1')){throw 'Config was not updated.'}
    $Health=Invoke-RestMethod -Uri 'http://127.0.0.1:18455/healthz' -TimeoutSec 3
    if($Health.service -ne 'tdh-relay' -or -not $Health.policy.enforced){throw 'Wrong service or policy.'}
    if($ExpectedVersion -and $Health.version -ne $ExpectedVersion){throw 'Wrong installed version.'}
    if($ExpectedVersion -in @('0.3.2','0.3.3') -and $Health.limits.requestBodyBytes -ne 67108864){throw 'Desktop request limit was not migrated.'}
    if($PreviousSetupFile){
        $NewStatus=(& (Join-Path $Install 'runtime/node.exe') (Join-Path $Install 'app/relay_product/cli.mjs') status --home $Install | ConvertFrom-Json)
        if($NewStatus.license.activationId -ne $PreviousActivation -or $NewStatus.license.expiresAt -ne $PreviousExpiry){throw 'Upgrade changed activation or expiry.'}
        if($global:TdhPromptCount -ne 1){throw 'Upgrade unexpectedly requested the key again.'}
        $report.previous_version=$PreviousVersion
        $report.activation_preserved=$true
        $report.reset_to_direct_recovered=[bool]$ResetToDirect
    }
    if($Autostart){
        if(-not(Test-Path -LiteralPath $StartupFile)){throw 'Startup file missing.'}
        & (Join-Path $Install 'runtime/node.exe') (Join-Path $Install 'app/relay_product/cli.mjs') stop --home $Install | Out-Null
        $Launcher=Start-Process -FilePath 'wscript.exe' -ArgumentList @('//B','//Nologo',('"'+$StartupFile+'"')) -WindowStyle Hidden -PassThru
        if(-not $Launcher.WaitForExit(10000)){throw 'Startup launcher did not exit.'}
        $Recovered=$false
        for($i=0;$i -lt 30;$i++){
            try{$Health=Invoke-RestMethod -Uri 'http://127.0.0.1:18455/healthz' -TimeoutSec 2;if($Health.service -eq 'tdh-relay'){$Recovered=$true;break}}catch{}
            Start-Sleep -Milliseconds 200
        }
        if(-not $Recovered){throw 'Startup launcher did not start the relay.'}
    }
    & $Setup
    $Updated=[IO.File]::ReadAllText((Join-Path $Codex 'config.toml'))
    if(([regex]::Matches($Updated,'BEGIN TDH Relay')).Count -ne 1){throw 'Reinstall duplicated managed config.'}
    & $Uninstall
    if([IO.File]::ReadAllText((Join-Path $Codex 'config.toml')) -cne $Original){throw 'Original config not restored byte for byte.'}
    if([IO.File]::ReadAllText((Join-Path $Codex 'auth.json')) -ne 'fixture-credentials-must-remain-unchanged'){throw 'Credentials changed.'}
    if(Test-Path -LiteralPath (Join-Path $Install 'app')){throw 'Application not removed.'}
    if($Autostart -and (Test-Path -LiteralPath $StartupFile)){throw 'Startup file not removed.'}
    if((Get-FileHash -LiteralPath (Join-Path $env:USERPROFILE '.codex/config.toml') -Algorithm SHA256).Hash -ne $beforeReal.Hash){throw 'Real Codex config changed.'}
    $report.result='passed';$report.install=$true;$report.reinstall=$true;$report.uninstall=$true
    $report.config_restored_exactly=$true;$report.auth_unchanged=$true;$report.real_codex_config_unchanged=$true
    $report.activation_required=$true
    $report.version=$Health.version;$report.upgrade_from_031=([bool]$PreviousSetupFile -and $PreviousVersion -eq '0.3.1')
    $report.activation_preserved=[bool]$PreviousSetupFile;$report.request_body_bytes=$Health.limits.requestBodyBytes
}catch{$report.result='failed';$report.error=$_.Exception.Message;throw}
finally{
    $global:TdhVerificationKey=$null
    if($report.result -eq 'failed' -and (Test-Path -LiteralPath $Uninstall)){
        try { & $Uninstall | Out-Null } catch { Write-Warning 'Fixture cleanup needs inspection.' }
    }
    $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $Evidence 'windows-install.json') -Encoding UTF8
    $report | ConvertTo-Json -Depth 6
}
