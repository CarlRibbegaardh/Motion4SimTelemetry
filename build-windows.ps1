[CmdletBinding()]
param(
    [ValidateSet("win-x64", "win-arm64")]
    [string]$Runtime = "win-x64"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$webApp = Join-Path $root "motion4sim-telemetry"
$hostProject = Join-Path $root "Motion4SimTelemetry.Host\Motion4SimTelemetry.Host.csproj"
$artifacts = Join-Path $root "artifacts"
$publishDirectory = Join-Path $artifacts "Motion4SimTelemetry-$Runtime"
$zipPath = "$publishDirectory.zip"

Write-Host "Building dashboard..."
Push-Location $webApp
try {
    $localTsc = Join-Path $webApp "node_modules\.bin\tsc.CMD"
    $localVite = Join-Path $webApp "node_modules\.bin\vite.CMD"

    if (!(Test-Path $localTsc) -or !(Test-Path $localVite)) {
        & corepack pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw "pnpm install failed." }
    }

    & $localTsc -b
    if ($LASTEXITCODE -ne 0) { throw "TypeScript build failed." }

    & $localVite build
    if ($LASTEXITCODE -ne 0) { throw "Vite build failed." }
}
finally {
    Pop-Location
}

Write-Host "Publishing Windows host..."
& dotnet publish $hostProject `
    --configuration Release `
    --runtime $Runtime `
    --self-contained true `
    -p:PublishSingleFile=true `
    --output $publishDirectory

if ($LASTEXITCODE -ne 0) { throw "Windows host publish failed." }

$webRoot = Join-Path $publishDirectory "wwwroot"
New-Item -ItemType Directory -Path $webRoot -Force | Out-Null
Copy-Item -Path (Join-Path $webApp "dist\*") -Destination $webRoot -Recurse -Force

if (Test-Path $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $publishDirectory "*") -DestinationPath $zipPath

Write-Host ""
Write-Host "Package created:"
Write-Host $zipPath
