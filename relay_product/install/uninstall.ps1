# TDH Relay - restores only its managed configuration; keeps local backups.
& {
    $ErrorActionPreference='Stop'
    $Root=if($env:TDH_RELAY_HOME){[IO.Path]::GetFullPath($env:TDH_RELAY_HOME)}else{Join-Path $env:LOCALAPPDATA 'TDHRelay'}
    $Marker=Join-Path $Root 'product.id'
    if(-not(Test-Path -LiteralPath $Marker)){Write-Host 'TDH Relay is not installed.';return}
    if([IO.File]::ReadAllText($Marker).Trim() -ne 'tdh-relay'){throw 'Unknown installation.'}
    if((Get-Item -LiteralPath $Root).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Installation directory cannot be a symlink.'}
    $Node=Join-Path $Root 'runtime/node.exe';$Cli=Join-Path $Root 'app/relay_product/cli.mjs'
    if(-not(Test-Path -LiteralPath $Cli)){Write-Host ('Application already removed. Backups: '+$Root);return}
    & $Node $Cli unsync --home $Root
    if($LASTEXITCODE -ne 0){throw 'Configuration changed. Review the backup; no application files removed.'}
    $Vbs=Join-Path ([Environment]::GetFolderPath('Startup')) 'TDH Relay.vbs'
    if((Test-Path -LiteralPath $Vbs) -and $env:TDH_RELAY_NO_AUTOSTART -ne '1'){
        $ExistingStartup=[IO.File]::ReadAllText($Vbs)
        if(-not $ExistingStartup.Contains("' TDH Relay managed startup") -or -not $ExistingStartup.Contains($Root.Replace('"','""'))){throw 'Startup file belongs to another installation.'}
        Remove-Item -LiteralPath $Vbs -Force
    }
    & $Node $Cli stop --home $Root
    if($LASTEXITCODE -ne 0){throw 'Could not stop the relay; files retained.'}
    foreach($Name in @('app','runtime')){
        $Target=Join-Path $Root $Name
        if(Test-Path -LiteralPath $Target){
            $Resolved=(Resolve-Path -LiteralPath $Target).Path
            if(-not $Resolved.StartsWith($Root.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe removal path.'}
            if((Get-Item -LiteralPath $Target).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Refusing to remove a linked directory.'}
            Remove-Item -LiteralPath $Resolved -Recurse -Force
        }
    }
    Write-Host ('Removed. Codex configuration restored. Backups and local statistics remain in '+$Root)
    Write-Host 'Close and reopen Codex.'
}
