param(
    [switch]$Rebuild
)

$ErrorActionPreference = 'Stop'
function Test-DockerEngine {
    # Windows PowerShell 5 treats redirected native stderr as error records.
    # A stopped engine is an expected probe result, not a terminating error.
    $ErrorActionPreference = 'Continue'
    & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Test-DockerImage([string]$ImageName) {
    $ErrorActionPreference = 'Continue'
    & docker image inspect $ImageName --format '{{.Id}}' 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Install Docker Desktop before starting Spotter.'
}

Push-Location -LiteralPath $PSScriptRoot
$previousParallelLimit = $env:COMPOSE_PARALLEL_LIMIT
try {
    if (-not (Test-Path -LiteralPath '.env')) {
        $randomBytes = New-Object byte[] 48
        $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $generator.GetBytes($randomBytes) } finally { $generator.Dispose() }
        $secret = [Convert]::ToBase64String($randomBytes)
        $template = Get-Content -LiteralPath '.env.example' -Raw
        if (-not $template.Contains('replace-with-a-long-random-secret')) {
            throw 'The environment template is missing its secret placeholder.'
        }
        $content = $template.Replace('replace-with-a-long-random-secret', $secret)
        # CreateNew prevents overwriting an environment file created meanwhile.
        $stream = [IO.File]::Open((Join-Path $PSScriptRoot '.env'), [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
        $writer = New-Object IO.StreamWriter($stream, (New-Object Text.UTF8Encoding($false)))
        try { $writer.Write($content) } finally { $writer.Dispose() }
        Write-Host 'Created .env with a generated application secret. Existing files are preserved.'
    }

    & docker compose version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose is required. Update Docker Desktop.' }
    & docker compose config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Invalid Compose configuration. Check .env.' }
    # Resolved configuration contains secrets: keep it in memory only.
    $resolvedConfig = & docker compose config --format json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the Compose configuration.' }

    if (-not (Test-DockerEngine)) {
        Write-Host 'Starting Docker Desktop...'
        & docker desktop start --timeout 60
        if ($LASTEXITCODE -ne 0) {
            throw 'Docker Desktop could not start. Open Docker Desktop, wait for its engine, then retry.'
        }
        if (-not (Test-DockerEngine)) { throw 'The Docker engine is not ready. Check Docker Desktop and retry.' }
    }

    # Limit concurrent builds on machines with little RAM. Reuse images by default.
    if (-not $env:COMPOSE_PARALLEL_LIMIT) { $env:COMPOSE_PARALLEL_LIMIT = '1' }
    foreach ($serviceName in @('backend', 'frontend')) {
        $serviceConfig = $resolvedConfig.services.$serviceName
        $imageName = if ($serviceConfig.image) { $serviceConfig.image } else { "$($resolvedConfig.name)-$serviceName" }
        if ($Rebuild -or -not (Test-DockerImage $imageName)) {
            # Separate invocations prevent BuildKit from building both services
            # in parallel, including the first launch with no existing images.
            & docker compose build $serviceName
            if ($LASTEXITCODE -ne 0) { throw "Image build failed for $serviceName. Check the Docker output above." }
        }
    }
    & docker compose up --no-build --detach --wait --wait-timeout 120
    if ($LASTEXITCODE -ne 0) {
        throw 'Spotter did not become healthy. Run docker compose logs to investigate.'
    }

    $frontendPort = $resolvedConfig.services.frontend.ports[0].published
    & docker compose ps
    Write-Host "Spotter is ready at http://127.0.0.1:$frontendPort"
    Write-Host 'Stop: docker compose down'
    Write-Host 'Logs: docker compose logs -f'
} finally {
    $env:COMPOSE_PARALLEL_LIMIT = $previousParallelLimit
    Pop-Location
}
