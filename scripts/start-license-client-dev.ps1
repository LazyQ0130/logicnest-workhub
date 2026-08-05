$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$clientEnvironmentPath = Join-Path $repositoryRoot '.env.license-dev'

if (-not (Test-Path -LiteralPath $clientEnvironmentPath)) {
  throw 'Missing .env.license-dev. Run npm run license:dev:init first.'
}

$clientEnvironment = @{}
foreach ($line in Get-Content -Encoding UTF8 -LiteralPath $clientEnvironmentPath) {
  if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith('#')) {
    continue
  }
  $separatorIndex = $line.IndexOf('=')
  if ($separatorIndex -lt 1) {
    continue
  }
  $clientEnvironment[$line.Substring(0, $separatorIndex)] = $line.Substring($separatorIndex + 1)
}

$publicKeyBase64 = $clientEnvironment['LOGICNEST_LICENSE_PUBLIC_KEY_B64']
if ([string]::IsNullOrWhiteSpace($publicKeyBase64)) {
  throw 'LOGICNEST_LICENSE_PUBLIC_KEY_B64 is missing from .env.license-dev.'
}

$publicKeyDer = [Convert]::FromBase64String($publicKeyBase64)
$publicKeyBody = [Convert]::ToBase64String($publicKeyDer, [Base64FormattingOptions]::InsertLineBreaks)
$env:LOGICNEST_LICENSE_API_URL = $clientEnvironment['LOGICNEST_LICENSE_API_URL']
$env:LOGICNEST_LICENSE_PUBLIC_KEY_PEM = "-----BEGIN PUBLIC KEY-----`n$publicKeyBody`n-----END PUBLIC KEY-----"
$env:LOGICNEST_HEARTBEAT_INTERVAL_SECONDS = $clientEnvironment['LOGICNEST_HEARTBEAT_INTERVAL_SECONDS']
$env:LOGICNEST_OFFLINE_GRACE_HOURS = $clientEnvironment['LOGICNEST_OFFLINE_GRACE_HOURS']

Push-Location $repositoryRoot
try {
  npm run electron:dev
} finally {
  Pop-Location
}
