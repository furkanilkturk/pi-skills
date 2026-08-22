[CmdletBinding()]
param(
    [string]$MetoniaRoot = $env:METONIA_SOURCE_REPO,
    [switch]$Update
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($MetoniaRoot)) {
    throw 'Pass -MetoniaRoot or set METONIA_SOURCE_REPO.'
}

$MetoniaRoot = [IO.Path]::GetFullPath($MetoniaRoot)
$skillsRoot = Join-Path $MetoniaRoot 'skills'
if (-not (Test-Path -LiteralPath $skillsRoot -PathType Container)) {
    throw "Metonia skills directory not found: $skillsRoot"
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot 'upstream-manifest.json'
$sourceCommit = (git -C $MetoniaRoot rev-parse HEAD).Trim()
$sourceSkills = Get-ChildItem -LiteralPath $skillsRoot -Directory | Sort-Object Name |
    ForEach-Object {
        $entrypoint = Join-Path $_.FullName 'SKILL.md'
        if (-not (Test-Path -LiteralPath $entrypoint -PathType Leaf)) {
            throw "Missing upstream SKILL.md: $entrypoint"
        }
        [ordered]@{
            name = $_.Name
            sha256 = (Get-FileHash -LiteralPath $entrypoint -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }

if ($Update) {
    $dirtySkills = git -C $MetoniaRoot status --porcelain -- skills
    if ($dirtySkills) {
        throw 'Refusing to baseline uncommitted Metonia skill changes.'
    }
    $manifest = [ordered]@{
        repository = 'https://github.com/furkanilkturk/metonia'
        source_commit = $sourceCommit
        skills = @($sourceSkills)
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8
    Write-Host "UPSTREAM BASELINE UPDATED ($($sourceSkills.Count) skills at $sourceCommit)"
    exit 0
}

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Upstream manifest not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$expected = @{}
foreach ($entry in $manifest.skills) {
    $expected[$entry.name] = $entry.sha256
}

$drift = [System.Collections.Generic.List[string]]::new()
foreach ($entry in $sourceSkills) {
    if (-not $expected.ContainsKey($entry.name)) {
        $drift.Add("new upstream skill: $($entry.name)")
    } elseif ($expected[$entry.name] -ne $entry.sha256) {
        $drift.Add("changed upstream skill: $($entry.name)")
    }
}
foreach ($name in $expected.Keys) {
    if (-not ($sourceSkills | Where-Object { $_.name -eq $name })) {
        $drift.Add("removed upstream skill: $name")
    }
}

if ($drift.Count -gt 0) {
    $drift | ForEach-Object { Write-Host $_ }
    throw "$($drift.Count) upstream drift item(s); review and port before -Update."
}

Write-Host "UPSTREAM CLEAN ($($sourceSkills.Count) skills; baseline $($manifest.source_commit); current $sourceCommit)"
