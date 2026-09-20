$ErrorActionPreference = 'Stop'
$backendPath = Split-Path $PSScriptRoot -Parent
$localPath = Join-Path $backendPath '.local'
foreach ($name in @('api','web','mail')) {
    $pidFile = Join-Path $localPath "$name.pid"
    if (Test-Path $pidFile) {
        $servicePid = Get-Content -LiteralPath $pidFile
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $servicePid"
        $expected = switch ($name) { 'api' {'dist/src/main.js'} 'web' {'node_modules/vite/bin/vite.js'} 'mail' {'scripts/mailbox.mjs'} }
        if ($processInfo -and $processInfo.Name -eq 'node.exe' -and $processInfo.CommandLine.Contains($expected)) { Stop-Process -Id $servicePid }
        Remove-Item -LiteralPath $pidFile
    }
}
$pgCtl = 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe'
$pgData = Join-Path $localPath 'postgres'
if ((Test-Path $pgCtl) -and (Test-Path $pgData)) { & $pgCtl -D $pgData stop -m fast }
