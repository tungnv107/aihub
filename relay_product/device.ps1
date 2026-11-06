$ErrorActionPreference = 'Stop'
try {
    $Request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    Add-Type -AssemblyName System.Security
    if ($Request.action -eq 'identity') {
        $Value = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid).MachineGuid
    } elseif ($Request.action -eq 'protect' -or $Request.action -eq 'unprotect') {
        $Bytes = [Convert]::FromBase64String($Request.value)
        $Entropy = [Text.Encoding]::UTF8.GetBytes('TDHRelay.device.v1')
        if ($Request.action -eq 'protect') {
            $Result = [Security.Cryptography.ProtectedData]::Protect($Bytes,$Entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        } else {
            $Result = [Security.Cryptography.ProtectedData]::Unprotect($Bytes,$Entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        }
        $Value = [Convert]::ToBase64String($Result)
        [Array]::Clear($Bytes,0,$Bytes.Length)
    } else { throw 'unsupported_action' }
    [Console]::Out.Write($Value)
} catch {
    [Console]::Error.Write('device_protection_failed')
    exit 1
}
