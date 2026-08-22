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

    $skillText = Get-Content -LiteralPath $sourceFile -Raw
    $escapedName = [Regex]::Escape($skillDirectory.Name)
    if ($skillText -notmatch "(?m)^name:\s*$escapedName\s*$") {
        throw "Skill name does not match its folder: $sourceFile"
    }
    if ($skillText -notmatch '(?m)^description:\s*\S.+$') {
        throw "Skill description is missing: $sourceFile"
    }

    $targetDirectory = Join-Path $Destination $skillDirectory.Name
    $sourceFiles = @(Get-ChildItem -LiteralPath $skillDirectory.FullName -File -Recurse |
        Sort-Object FullName)

    if ($Check) {
        foreach ($item in $sourceFiles) {
            $relativePath = [IO.Path]::GetRelativePath($skillDirectory.FullName, $item.FullName)
            $targetFile = Join-Path $targetDirectory $relativePath
            $displayPath = "$($skillDirectory.Name)/$($relativePath.Replace('\', '/'))"

            if (-not (Test-Path -LiteralPath $targetFile -PathType Leaf)) {
                $drift.Add("missing: $displayPath")
                continue
            }

            $sourceHash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash
            $targetHash = (Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash
            if ($sourceHash -ne $targetHash) {
                $drift.Add("different: $displayPath")
            }
        }
        continue
    }

    foreach ($item in $sourceFiles) {
        $relativePath = [IO.Path]::GetRelativePath($skillDirectory.FullName, $item.FullName)
        $targetFile = Join-Path $targetDirectory $relativePath
        $targetParent = Split-Path -Parent $targetFile
        New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
        Copy-Item -LiteralPath $item.FullName -Destination $targetFile -Force
    }
    Write-Host "synced: $($skillDirectory.Name) ($($sourceFiles.Count) files)"
}

if ($Check) {
    if ($drift.Count -gt 0) {
        $drift | ForEach-Object { Write-Host $_ }
        throw "$($drift.Count) skill(s) are out of sync."
    }

    Write-Host "SYNC CLEAN ($($skillDirectories.Count) skills)"
}
