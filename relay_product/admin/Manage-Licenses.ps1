param(
    [Parameter(Mandatory=$true)][ValidateSet('issue','list','devices','revoke','extend','revoke-device','reset-device')][string]$Action,
    [string]$Label,[string]$Id,[double]$Days=1,[int]$MaxDevices=1,
    [string]$SshTarget='ubuntu@134.185.93.244'
)
$ErrorActionPreference='Stop'
$Payload=@{action=$Action;label=$Label;id=$Id;days=$Days;maxDevices=$MaxDevices} | ConvertTo-Json -Compress
$Raw=$Payload | & ssh -o BatchMode=yes -o StrictHostKeyChecking=yes $SshTarget sudo -n python3 /opt/tdh-relay-license/admin-bridge.py
if($LASTEXITCODE -ne 0){throw 'License administration failed. Check SSH access and parameters.'}
$Result=($Raw -join "`n") | ConvertFrom-Json
if($Action -eq 'issue'){
    $Vault=Join-Path $env:LOCALAPPDATA 'TDHRelayOwner/keys'
    if(Test-Path -LiteralPath $Vault){
        if((Get-Item -LiteralPath $Vault).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Key vault cannot be a symlink.'}
    }else{New-Item -ItemType Directory -Path $Vault -Force | Out-Null}
    $Sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $Vault /inheritance:r /grant:r ('*'+$Sid+':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Cannot secure key vault.'}
    if($Result.id -notmatch '^[a-f0-9-]{36}$'){throw 'Invalid license identifier.'}
    $File=Join-Path $Vault ($Result.id+'.json')
    $Stream=[IO.File]::Open($File,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{
        $Bytes=[Text.Encoding]::UTF8.GetBytes(($Result | ConvertTo-Json -Depth 6))
        $Stream.Write($Bytes,0,$Bytes.Length)
    }finally{$Stream.Dispose()}
    $Result.PSObject.Properties.Remove('key')
    $Result | Add-Member -NotePropertyName keyFile -NotePropertyValue $File
}
$Result | ConvertTo-Json -Depth 6
