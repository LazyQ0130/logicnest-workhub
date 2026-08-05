$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $repositoryRoot 'services\license-server\.dev-secrets\e2e-state.env'

if (-not (Test-Path -LiteralPath $statePath)) {
  throw 'QA state is missing. Run npm run license:e2e:init first.'
}

$qa = @{}
foreach ($line in Get-Content -LiteralPath $statePath) {
  if ($line -and -not $line.StartsWith('#')) {
    $separator = $line.IndexOf('=')
    if ($separator -gt 0) { $qa[$line.Substring(0, $separator)] = $line.Substring($separator + 1) }
  }
}

New-Item -ItemType Directory -Force -Path $qa.QA_USER_DATA_DIR_A | Out-Null
$env:NODE_ENV = 'development'
$env:LOGICNEST_QA_E2E = '1'
$env:LOGICNEST_QA_USER_DATA_DIR = $qa.QA_USER_DATA_DIR_A
$env:LOGICNEST_QA_DEVICE_FINGERPRINT = $qa.QA_DEVICE_FINGERPRINT_A
$env:LOGICNEST_LICENSE_API_URL = "http://127.0.0.1:$($qa.LICENSE_SERVER_PORT)/api/v1"
$publicKeyDer = [Convert]::FromBase64String($qa.LICENSE_JWS_PUBLIC_KEY_B64)
$publicKeyBody = [Convert]::ToBase64String($publicKeyDer, [Base64FormattingOptions]::InsertLineBreaks)
$env:LOGICNEST_LICENSE_PUBLIC_KEY_PEM = "-----BEGIN PUBLIC KEY-----`n$publicKeyBody`n-----END PUBLIC KEY-----"
$env:LOGICNEST_HEARTBEAT_INTERVAL_SECONDS = '30'
$env:LOGICNEST_OFFLINE_GRACE_HOURS = '1'
$env:ELECTRON_START_URL = 'http://127.0.0.1:15175'

$vite = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev', '--', '--host', '127.0.0.1', '--port', '15175', '--strictPort') -WorkingDirectory $repositoryRoot -WindowStyle Hidden -PassThru
try {
  $deadline = (Get-Date).AddSeconds(60)
  do {
    try { Invoke-WebRequest -UseBasicParsing -Uri $env:ELECTRON_START_URL -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Milliseconds 500 }
  } while ((Get-Date) -lt $deadline)
  if ((Get-Date) -ge $deadline) { throw 'Timed out waiting for the isolated renderer.' }
  & (Join-Path $repositoryRoot 'node_modules\.bin\electron.cmd') $repositoryRoot
} finally {
  if (-not $vite.HasExited) { Stop-Process -Id $vite.Id }
}
