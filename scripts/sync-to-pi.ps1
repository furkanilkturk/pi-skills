[CmdletBinding()]
param(
    [string]$Destination = (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.pi/agent/skills'),
    [switch]$Check
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $repoRoot 'skills'

if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
    throw "Skill source directory not found: $sourceRoot"
}

$skillDirectories = Get-ChildItem -LiteralPath $sourceRoot -Directory | Sort-Object Name
$drift = [System.Collections.Generic.List[string]]::new()

foreach ($skillDirectory in $skillDirectories) {
    $sourceFile = Join-Path $skillDirectory.FullName 'SKILL.md'
    if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
        throw "Missing SKILL.md: $sourceFile"
    }

    $targetDirectory = Join-Path $Destination $skillDirectory.Name
    $targetFile = Join-Path $targetDirectory 'SKILL.md'

    if ($Check) {
        if (-not (Test-Path -LiteralPath $targetFile -PathType Leaf)) {
            $drift.Add("missing: $($skillDirectory.Name)")
            continue
        }

        $sourceHash = (Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash
        $targetHash = (Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash
        if ($sourceHash -ne $targetHash) {
            $drift.Add("different: $($skillDirectory.Name)")
        }
        continue
    }

    New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
    Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force
    Write-Host "synced: $($skillDirectory.Name)"
}

if ($Check) {
    if ($drift.Count -gt 0) {
        $drift | ForEach-Object { Write-Host $_ }
        throw "$($drift.Count) skill(s) are out of sync."
    }

    Write-Host "SYNC CLEAN ($($skillDirectories.Count) skills)"
}
