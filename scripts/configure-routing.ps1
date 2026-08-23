[CmdletBinding()]
param(
    [string]$Profile,
    [string]$ConfigPath = (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.pi/agent/metonia-routing.json'),
    [switch]$Check
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $PSBoundParameters.ContainsKey('ConfigPath') -and -not [string]::IsNullOrWhiteSpace($env:PI_CODING_AGENT_DIR)) {
    $ConfigPath = Join-Path $env:PI_CODING_AGENT_DIR 'metonia-routing.json'
}

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
    if (-not $config.PSObject.Properties['auto_routes']) {
        $config | Add-Member -NotePropertyName auto_routes -NotePropertyValue $example.auto_routes
        $configChanged = $true
    } else {
        foreach ($exampleRoute in $example.auto_routes.PSObject.Properties) {
            if (-not $config.auto_routes.PSObject.Properties[$exampleRoute.Name]) {
                $config.auto_routes | Add-Member -NotePropertyName $exampleRoute.Name -NotePropertyValue $exampleRoute.Value
                $configChanged = $true
            } elseif ($exampleRoute.Name -in @('bounded-learning', 'deep-learning') -and
                $config.auto_routes.PSObject.Properties[$exampleRoute.Name].Value.agent -eq 'worker') {
                $config.auto_routes.PSObject.Properties[$exampleRoute.Name].Value.agent = 'researcher'
                $configChanged = $true
            }
        }
    }
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
            } elseif ($exampleCapability.Name -in @('bounded-learning', 'deep-learning') -and
                $existingProfile.Value.capabilities.PSObject.Properties[$exampleCapability.Name].Value.agent -eq 'worker') {
                $existingProfile.Value.capabilities.PSObject.Properties[$exampleCapability.Name].Value.agent = 'researcher'
                $configChanged = $true
            }
        }
    }
}

if ($Profile) {
    if ($Profile -ne 'auto' -and -not $config.profiles.PSObject.Properties[$Profile]) {
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
foreach ($capability in $capabilities) {
    & node $resolverPath $capability --profile auto --config $ConfigPath --compact | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Routing validation failed for auto/$capability" }
}

if ($Check) {
    $profileCount = @($config.profiles.PSObject.Properties).Count
    Write-Host "ROUTING CLEAN ($profileCount profiles)"
    exit 0
}

Write-Host "ROUTING READY ($($config.active_profile))"
