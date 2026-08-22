[CmdletBinding()]
param(
    [string]$Profile,
    [string]$ConfigPath = (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.pi/agent/metonia-routing.json'),
    [switch]$Check
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$examplePath = Join-Path $repoRoot 'config/routing.example.json'
$resolverPath = Join-Path $repoRoot 'skills/metonia-orchestrator/scripts/resolve-routing.mjs'
$capabilities = @('efficient-read', 'bounded-write', 'standard-write', 'bounded-learning', 'deep-learning', 'fresh-review', 'deep-decision')

function Write-RoutingConfig {
    param([object]$Value)
    $temporaryPath = "$ConfigPath.tmp-$PID-$([Guid]::NewGuid().ToString('N'))"
    try {
        [IO.File]::WriteAllText($temporaryPath, (($Value | ConvertTo-Json -Depth 20) + "`n"))
        [IO.File]::Move($temporaryPath, $ConfigPath, $true)
    } finally {
        if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath -Force }
    }
}

if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
    if ($Check) { throw "Routing config is missing: $ConfigPath" }
    $configParent = Split-Path -Parent $ConfigPath
    New-Item -ItemType Directory -Path $configParent -Force | Out-Null
    Copy-Item -LiteralPath $examplePath -Destination $ConfigPath
    Write-Host "created: $ConfigPath"
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$example = Get-Content -LiteralPath $examplePath -Raw | ConvertFrom-Json
$configChanged = $false
if (-not $Check) {
    foreach ($exampleProfile in $example.profiles.PSObject.Properties) {
        $existingProfile = $config.profiles.PSObject.Properties[$exampleProfile.Name]
        if (-not $existingProfile) {
            $config.profiles | Add-Member -NotePropertyName $exampleProfile.Name -NotePropertyValue $exampleProfile.Value
            $configChanged = $true
            continue
        }
        foreach ($exampleCapability in $exampleProfile.Value.capabilities.PSObject.Properties) {
            if (-not $existingProfile.Value.capabilities.PSObject.Properties[$exampleCapability.Name]) {
                $existingProfile.Value.capabilities | Add-Member -NotePropertyName $exampleCapability.Name -NotePropertyValue $exampleCapability.Value
                $configChanged = $true
            }
        }
    }
}

if ($Profile) {
    if (-not $config.profiles.PSObject.Properties[$Profile]) {
        throw "Unknown routing profile: $Profile"
    }
    if ($Check -and $config.active_profile -ne $Profile) {
        throw "Active profile is '$($config.active_profile)', expected '$Profile'."
    }
    if (-not $Check) {
        if ($config.active_profile -ne $Profile) {
            $config.active_profile = $Profile
            $configChanged = $true
        }
        Write-Host "active profile: $Profile"
    }
}

if (-not $Check -and $configChanged) {
    Write-RoutingConfig -Value $config
    Write-Host "routing config updated"
}

foreach ($profileProperty in $config.profiles.PSObject.Properties) {
    foreach ($capability in $capabilities) {
        & node $resolverPath $capability --profile $profileProperty.Name --config $ConfigPath --compact | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Routing validation failed for $($profileProperty.Name)/$capability" }
    }
}

if ($Check) {
    $profileCount = @($config.profiles.PSObject.Properties).Count
    Write-Host "ROUTING CLEAN ($profileCount profiles)"
    exit 0
}

Write-Host "ROUTING READY ($($config.active_profile))"
