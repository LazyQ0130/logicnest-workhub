$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$serviceDirectory = Join-Path $repositoryRoot 'services\license-server'
$statePath = Join-Path $serviceDirectory '.dev-secrets\e2e-state.env'
$composePath = Join-Path $serviceDirectory 'docker-compose.e2e.yml'

if (-not (Test-Path -LiteralPath $statePath)) {
  throw 'QA state is missing; there is no configured E2E service set to stop.'
}

# Intentionally stop only. Never use `down -v`; the isolated QA volume remains intact.
docker compose --env-file $statePath -f $composePath stop
exit $LASTEXITCODE
