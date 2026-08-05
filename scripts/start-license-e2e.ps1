$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$serviceDirectory = Join-Path $repositoryRoot 'services\license-server'
$statePath = Join-Path $serviceDirectory '.dev-secrets\e2e-state.env'
$composePath = Join-Path $serviceDirectory 'docker-compose.e2e.yml'

if (-not (Test-Path -LiteralPath $statePath)) {
  throw 'QA state is missing. Run npm run license:e2e:init first.'
}

docker compose --env-file $statePath -f $composePath config --quiet
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker compose --env-file $statePath -f $composePath up -d --build
exit $LASTEXITCODE
