# TDH Relay: export a local, content-free diagnostic report. No upload.
& {
    $ErrorActionPreference = 'Stop'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $Root = if ($env:TDH_RELAY_HOME) { [IO.Path]::GetFullPath($env:TDH_RELAY_HOME) } else { Join-Path $env:LOCALAPPDATA 'TDHRelay' }
    $Node = Join-Path $Root 'runtime/node.exe'
    if (-not (Test-Path -LiteralPath $Node)) { throw 'TDH Relay desktop is not installed here.' }
    $Temp = Join-Path ([IO.Path]::GetTempPath()) ('tdh-diagnostic-' + [Guid]::NewGuid().ToString('N') + '.mjs')
    $Output = Join-Path ([Environment]::GetFolderPath('Desktop')) ('TDH-Relay-diagnostic-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
    try {
        Invoke-WebRequest -UseBasicParsing -Uri 'https://codex.tudonghoa.me/diagnose.mjs' -OutFile $Temp -TimeoutSec 30
        if ((Get-FileHash -LiteralPath $Temp -Algorithm SHA256).Hash.ToLowerInvariant() -ne '@@DIAGNOSE_SHA@@') { throw 'Diagnostic tool checksum mismatch.' }
        & $Node $Temp --home $Root --out $Output
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the diagnostic report.' }
        Write-Host ('Da tao bao cao: ' + $Output)
        Write-Host 'Khong tu gui du lieu. Ban co the mo file JSON de xem truoc khi gui rieng cho quan tri vien.'
    } finally {
        if (Test-Path -LiteralPath $Temp) { Remove-Item -LiteralPath $Temp -Force }
    }
}
