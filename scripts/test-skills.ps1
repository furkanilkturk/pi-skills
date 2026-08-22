[CmdletBinding()]
param(
    [string]$QuickValidatePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$skillsRoot = Join-Path $repoRoot 'skills'
$manifestPath = Join-Path $repoRoot 'upstream-manifest.json'
$syncScript = Join-Path $PSScriptRoot 'sync-to-pi.ps1'
$failures = [System.Collections.Generic.List[string]]::new()
$skillDirectories = Get-ChildItem -LiteralPath $skillsRoot -Directory | Sort-Object Name

foreach ($skillDirectory in $skillDirectories) {
    $entrypoint = Join-Path $skillDirectory.FullName 'SKILL.md'
    if (-not (Test-Path -LiteralPath $entrypoint -PathType Leaf)) {
        $failures.Add("missing SKILL.md: $($skillDirectory.Name)")
        continue
    }

    $text = Get-Content -LiteralPath $entrypoint -Raw
    if ($text -notmatch '(?s)\A---\s*\r?\n.+?\r?\n---\s*\r?\n') {
        $failures.Add("invalid frontmatter block: $($skillDirectory.Name)")
    }
    $escapedName = [Regex]::Escape($skillDirectory.Name)
    if ($text -notmatch "(?m)^name:\s*$escapedName\s*$") {
        $failures.Add("name/folder mismatch: $($skillDirectory.Name)")
    }
    if ($text -notmatch '(?m)^description:\s*\S.+$') {
        $failures.Add("missing description: $($skillDirectory.Name)")
    }
    if ($text -match '(?i)<TODO>|REPLACE_ME|YOUR_SKILL') {
        $failures.Add("unfinished placeholder: $($skillDirectory.Name)")
    }

    if ($QuickValidatePath) {
        & python $QuickValidatePath $skillDirectory.FullName
        if ($LASTEXITCODE -ne 0) {
            $failures.Add("quick_validate failed: $($skillDirectory.Name)")
        }
    }
}

$trackedText = git -C $repoRoot grep -I -n -E '[A-Za-z]:\\Users\\' -- . 2>$null
if ($LASTEXITCODE -eq 0 -and $trackedText) {
    $failures.Add('tracked files contain a machine-specific Windows user path')
}

$contracts = @{
    'execute-plan' = Get-Content -LiteralPath (Join-Path $skillsRoot 'execute-plan/SKILL.md') -Raw
    'doc-learning' = Get-Content -LiteralPath (Join-Path $skillsRoot 'doc-learning/SKILL.md') -Raw
    'video-learning' = Get-Content -LiteralPath (Join-Path $skillsRoot 'video-learning/SKILL.md') -Raw
}

foreach ($name in $contracts.Keys) {
    $text = $contracts[$name]
    if ($text -notmatch [Regex]::Escape("skill: `"$name`"")) {
        $failures.Add("$name does not inject its skill into the worker")
    }
    if ($text -notmatch 'context:\s*"fresh"') {
        $failures.Add("$name does not require fresh worker context")
    }
}

if ($contracts['execute-plan'] -notmatch 'gpt-5\.6-luna:medium') {
    $failures.Add('execute-plan lacks the valid Luna per-run model suffix')
}
if ($contracts['execute-plan'] -match 'thinking:\s*"medium"') {
    $failures.Add('execute-plan uses an unsupported workflow thinking field')
}
foreach ($name in @('doc-learning', 'video-learning')) {
    foreach ($model in @('gpt-5.6-luna:medium', 'gpt-5.6-terra:medium')) {
        if ($contracts[$name] -notmatch [Regex]::Escape($model)) {
            $failures.Add("$name lacks routing target $model")
        }
    }
}

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    $failures.Add('missing upstream-manifest.json')
} else {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $manifestNames = @($manifest.skills | ForEach-Object { $_.name } | Sort-Object)
    $localNames = @($skillDirectories.Name | Sort-Object)
    if (($manifestNames -join "`n") -ne ($localNames -join "`n")) {
        $failures.Add('upstream manifest skill set does not match local skill set')
    }
    foreach ($entry in $manifest.skills) {
        if ($entry.sha256 -notmatch '^[0-9a-f]{64}$') {
            $failures.Add("invalid upstream hash: $($entry.name)")
        }
    }
}

function Test-LunaWriteEligibility {
    param([pscustomobject]$Case)
    return $Case.Risk -eq 'low' -and
        $Case.WriteFiles -le 3 -and
        $Case.DeterministicChecks -and
        -not $Case.SensitiveDecision -and
        -not $Case.ExternalEffect -and
        -not $Case.HumanGate -and
        $Case.BaseCommitMatches
}

$codingCases = @(
    [pscustomobject]@{ Name='read-only-recon'; Mode='read-only'; Risk='low'; WriteFiles=0; DeterministicChecks=$true; SensitiveDecision=$false; ExternalEffect=$false; HumanGate=$false; BaseCommitMatches=$true; Expected='scout/luna-low' },
    [pscustomobject]@{ Name='quick-one-file'; Mode='quick'; Risk='low'; WriteFiles=1; DeterministicChecks=$true; SensitiveDecision=$false; ExternalEffect=$false; HumanGate=$false; BaseCommitMatches=$true; Expected='worker/luna-medium/no-review' },
    [pscustomobject]@{ Name='bounded-standard'; Mode='standard'; Risk='low'; WriteFiles=3; DeterministicChecks=$true; SensitiveDecision=$false; ExternalEffect=$false; HumanGate=$false; BaseCommitMatches=$true; Expected='worker/luna-medium/terra-review' },
    [pscustomobject]@{ Name='four-files'; Mode='standard'; Risk='low'; WriteFiles=4; DeterministicChecks=$true; SensitiveDecision=$false; ExternalEffect=$false; HumanGate=$false; BaseCommitMatches=$true; Expected='worker/terra-medium/terra-review' },
    [pscustomobject]@{ Name='security-change'; Mode='standard'; Risk='low'; WriteFiles=1; DeterministicChecks=$true; SensitiveDecision=$true; ExternalEffect=$false; HumanGate=$false; BaseCommitMatches=$true; Expected='worker/terra-medium/terra-review' },
    [pscustomobject]@{ Name='base-mismatch'; Mode='standard'; Risk='low'; WriteFiles=1; DeterministicChecks=$true; SensitiveDecision=$false; ExternalEffect=$false; HumanGate=$false; BaseCommitMatches=$false; Expected='worker/terra-medium/terra-review' },
    [pscustomobject]@{ Name='critical-decision'; Mode='critical-decision'; Risk='critical'; WriteFiles=0; DeterministicChecks=$false; SensitiveDecision=$true; ExternalEffect=$false; HumanGate=$true; BaseCommitMatches=$true; Expected='oracle/sol-high' }
)

foreach ($case in $codingCases) {
    $eligible = Test-LunaWriteEligibility $case
    $actual = if ($case.Mode -eq 'read-only') {
        'scout/luna-low'
    } elseif ($case.Mode -eq 'critical-decision') {
        'oracle/sol-high'
    } elseif ($eligible -and $case.Mode -eq 'quick') {
        'worker/luna-medium/no-review'
    } elseif ($eligible) {
        'worker/luna-medium/terra-review'
    } else {
        'worker/terra-medium/terra-review'
    }
    if ($actual -ne $case.Expected) {
        $failures.Add("routing case failed: $($case.Name), expected $($case.Expected), got $actual")
    }
}

$learningCases = @(
    [pscustomobject]@{ Name='short-clean-source'; Long=$false; Dense=$false; MultiSource=$false; HighlyTechnical=$false; LowConfidence=$false; Expected='worker/luna-medium' },
    [pscustomobject]@{ Name='dense-source'; Long=$false; Dense=$true; MultiSource=$false; HighlyTechnical=$false; LowConfidence=$false; Expected='worker/terra-medium' },
    [pscustomobject]@{ Name='uncertain-transcript'; Long=$false; Dense=$false; MultiSource=$false; HighlyTechnical=$false; LowConfidence=$true; Expected='worker/terra-medium' }
)

foreach ($case in $learningCases) {
    $needsTerra = $case.Long -or $case.Dense -or $case.MultiSource -or
        $case.HighlyTechnical -or $case.LowConfidence
    $actual = if ($needsTerra) { 'worker/terra-medium' } else { 'worker/luna-medium' }
    if ($actual -ne $case.Expected) {
        $failures.Add("learning routing case failed: $($case.Name), expected $($case.Expected), got $actual")
    }
}

$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempRoot = Join-Path $tempBase ("pi-skills-test-" + [Guid]::NewGuid().ToString('N'))
$resolvedTemp = [IO.Path]::GetFullPath($tempRoot)
if (-not $resolvedTemp.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing unsafe temporary path: $resolvedTemp"
}

try {
    & $syncScript -Destination $resolvedTemp
    & $syncScript -Destination $resolvedTemp -Check
} catch {
    $failures.Add("sync round trip failed: $($_.Exception.Message)")
} finally {
    if (Test-Path -LiteralPath $resolvedTemp) {
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Host "ERROR: $_" -ForegroundColor Red }
    throw "$($failures.Count) validation failure(s)."
}

$caseCount = $codingCases.Count + $learningCases.Count
Write-Host "SKILLS CLEAN ($($skillDirectories.Count) skills, $caseCount routing cases)"
exit 0
