$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$expected = @('doc-learning', 'video-learning')
$actual = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'skills') -Directory | Select-Object -ExpandProperty Name | Sort-Object)

if (($actual -join ',') -ne (($expected | Sort-Object) -join ',')) {
    throw "Expected only $($expected -join ', '); found $($actual -join ', ')"
}

foreach ($name in $expected) {
    $path = Join-Path $repoRoot "skills\$name\SKILL.md"
    $text = Get-Content -LiteralPath $path -Raw
    if ($text -notmatch "(?m)^name:\s*$([regex]::Escape($name))\s*$") {
        throw "Invalid skill name in $path"
    }
    if ($text -match 'metonia_delegate|metonia-orchestrator|routing\.example|create-plan|execute-plan|update-project') {
        throw "Removed coding runtime reference remains in $path"
    }
}

Write-Output 'LEARNING SKILLS CLEAN'
