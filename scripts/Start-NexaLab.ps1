$ErrorActionPreference = 'Stop'
$backendPath = Split-Path $PSScriptRoot -Parent
$frontendPath = Join-Path (Split-Path $backendPath -Parent) 'FE-NexaLab'
$localPath = Join-Path $backendPath '.local'
New-Item -ItemType Directory -Force -Path $localPath | Out-Null
if (-not (Test-Path (Join-Path $backendPath '.env'))) { throw 'Tạo .env theo README trước khi chạy.' }
$pgCtl = 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe'
$pgData = Join-Path $localPath 'postgres'
if ((Test-Path $pgCtl) -and (Test-Path $pgData)) {
    & $pgCtl -D $pgData status *> $null
    if ($LASTEXITCODE -ne 0) { & $pgCtl -D $pgData -l (Join-Path $localPath 'postgres.log') start }
}
function Start-NexaService($Name, $Directory, $Arguments) {
    $pidFile = Join-Path $localPath "$Name.pid"
    if (Test-Path $pidFile) {
        $oldPid = Get-Content -LiteralPath $pidFile
        if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) { Write-Output "$Name đang chạy (PID $oldPid)."; return }
    }
    $process = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList $Arguments -WorkingDirectory $Directory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localPath "$Name.log") -RedirectStandardError (Join-Path $localPath "$Name.error.log")
    $process.Id | Set-Content -LiteralPath $pidFile
    Write-Output "$Name khởi động (PID $($process.Id))."
}
Start-NexaService 'api' $backendPath @('dist/src/main.js')
Start-NexaService 'web' $frontendPath @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort')
Start-NexaService 'mail' $backendPath @('scripts/mailbox.mjs')
$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:4000/api/health' -TimeoutSec 2
        if ($health.status -eq 'ok') { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 500 }
}
if (-not $ready) { throw "API chưa sẵn sàng. Xem log trong $localPath" }
Write-Output 'Frontend: http://localhost:5173 | API: http://127.0.0.1:4000/api/docs | Mailbox: http://127.0.0.1:8025'
