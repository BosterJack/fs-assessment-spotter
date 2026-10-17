$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed' }
}
& '.venv/Scripts/python.exe' -m pip install -r backend/requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed' }
Push-Location frontend
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
} finally { Pop-Location }
& '.venv/Scripts/python.exe' backend/manage.py collectstatic --noinput
if ($LASTEXITCODE -ne 0) { throw 'Static collection failed' }
Write-Host 'Spotter is ready at http://127.0.0.1:8000 (Ctrl+C to stop)'
& '.venv/Scripts/python.exe' backend/manage.py runserver 127.0.0.1:8000 --noreload
