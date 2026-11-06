$ErrorActionPreference = 'Stop'
try {
    $Request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    Add-Type -AssemblyName System.Security
    $Bytes = [Convert]::FromBase64String($Request.value)
    $Entropy = [Text.Encoding]::UTF8.GetBytes('ChRelay.Sub2API.v1')
    if ($Request.action -eq 'protect') {
        $Result = [Security.Cryptography.ProtectedData]::Protect($Bytes,$Entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    } elseif ($Request.action -eq 'unprotect') {
        $Result = [Security.Cryptography.ProtectedData]::Unprotect($Bytes,$Entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    } else { throw 'unsupported_action' }
    [Console]::Out.Write([Convert]::ToBase64String($Result))
    [Array]::Clear($Bytes,0,$Bytes.Length)
} catch {
    [Console]::Error.Write('credential_protection_failed')
    exit 1
}
