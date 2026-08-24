[CmdletBinding()]
param(
    [string]$Destination = (Join-Path $env:USERPROFILE '.pi\agent\skills')
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

New-Item -ItemType Directory -Path $Destination -Force | Out-Null

foreach ($name in @('doc-learning', 'video-learning')) {
    $source = Join-Path $repoRoot "skills\$name"
    $target = Join-Path $Destination $name
    if (-not (Test-Path -LiteralPath $source -PathType Container)) {
        throw "Missing source skill: $source"
    }
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $source 'SKILL.md') -Destination (Join-Path $target 'SKILL.md') -Force
    Write-Output "Synced $name -> $target"
}
