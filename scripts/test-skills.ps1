[CmdletBinding()]
param([string]$QuickValidatePath)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$skillsRoot = Join-Path $repoRoot 'skills'
$manifestPath = Join-Path $repoRoot 'upstream-manifest.json'
$syncScript = Join-Path $PSScriptRoot 'sync-to-pi.ps1'
$configureScript = Join-Path $PSScriptRoot 'configure-routing.ps1'
$resolverPath = Join-Path $skillsRoot 'metonia-orchestrator/scripts/resolve-routing.mjs'
$runtimePath = Join-Path $repoRoot 'extensions/metonia-delegate/index.ts'
$routingPath = Join-Path $repoRoot 'extensions/metonia-delegate/routing.mjs'
$runtimeContractPath = Join-Path $repoRoot 'extensions/metonia-delegate/runtime-contract.mjs'
$reviewContextPath = Join-Path $repoRoot 'extensions/metonia-delegate/review-context.mjs'
$routingExamplePath = Join-Path $repoRoot 'config/routing.example.json'
$routingTestPath = Join-Path $PSScriptRoot 'test-routing.mjs'
$failures = [System.Collections.Generic.List[string]]::new()
$skillDirectories = Get-ChildItem -LiteralPath $skillsRoot -Directory | Sort-Object Name
$capabilities = @('efficient-read', 'bounded-write', 'standard-write', 'bounded-learning', 'deep-learning', 'fresh-review', 'deep-decision')

foreach ($skillDirectory in $skillDirectories) {
    $entrypoint = Join-Path $skillDirectory.FullName 'SKILL.md'
    if (-not (Test-Path -LiteralPath $entrypoint -PathType Leaf)) {
        $failures.Add("missing SKILL.md: $($skillDirectory.Name)")
        continue
    }
    $text = Get-Content -LiteralPath $entrypoint -Raw
    if ($text -notmatch '(?s)\A---\s*\r?\n.+?\r?\n---\s*\r?\n') { $failures.Add("invalid frontmatter block: $($skillDirectory.Name)") }
    $escapedName = [Regex]::Escape($skillDirectory.Name)
    if ($text -notmatch "(?m)^name:\s*$escapedName\s*$") { $failures.Add("name/folder mismatch: $($skillDirectory.Name)") }
    if ($text -notmatch '(?m)^description:\s*\S.+$') { $failures.Add("missing description: $($skillDirectory.Name)") }
    if ($text -match '(?i)<TODO>|REPLACE_ME|YOUR_SKILL') { $failures.Add("unfinished placeholder: $($skillDirectory.Name)") }

    if ($QuickValidatePath) {
        & python $QuickValidatePath $skillDirectory.FullName
        if ($LASTEXITCODE -ne 0) { $failures.Add("quick_validate failed: $($skillDirectory.Name)") }
    }
}

$trackedText = git -C $repoRoot grep -I -n -E '[A-Za-z]:\\Users\\' -- . 2>$null
if ($LASTEXITCODE -eq 0 -and $trackedText) { $failures.Add('tracked files contain a machine-specific Windows user path') }

$contracts = @{
    'execute-plan' = Get-Content -LiteralPath (Join-Path $skillsRoot 'execute-plan/SKILL.md') -Raw
    'doc-learning' = Get-Content -LiteralPath (Join-Path $skillsRoot 'doc-learning/SKILL.md') -Raw
    'video-learning' = Get-Content -LiteralPath (Join-Path $skillsRoot 'video-learning/SKILL.md') -Raw
    'metonia-orchestrator' = Get-Content -LiteralPath (Join-Path $skillsRoot 'metonia-orchestrator/SKILL.md') -Raw
    'review-plan' = Get-Content -LiteralPath (Join-Path $skillsRoot 'review-plan/SKILL.md') -Raw
}

foreach ($name in @('execute-plan', 'doc-learning', 'video-learning')) {
    $text = $contracts[$name]
    if ($text -notmatch 'metonia_delegate') { $failures.Add("$name does not use metonia_delegate") }
    if ($text -notmatch [Regex]::Escape("skill: `"$name`"")) { $failures.Add("$name does not inject its skill into the child") }
    if ($text -match '(openai-codex|opencode-go|opencode/|gpt-5|claude-)') { $failures.Add("$name hard-codes a provider or model") }
}

foreach ($name in @('create-plan', 'work-vault-context')) {
    $text = Get-Content -LiteralPath (Join-Path $skillsRoot "$name/SKILL.md") -Raw
    if ($text -match '(openai-codex|opencode-go|opencode/|gpt-5|claude-|\bLuna\b|\bTerra\b|\bSol\b)') {
        $failures.Add("$name hard-codes a provider or model")
    }
}

foreach ($capability in $capabilities) {
    if ($contracts['metonia-orchestrator'] -notmatch [Regex]::Escape($capability)) {
        $failures.Add("metonia-orchestrator lacks capability $capability")
    }
}
if ($contracts['metonia-orchestrator'] -notmatch 'parent session') { $failures.Add('metonia-orchestrator lacks its parent-only guard') }
foreach ($role in @('scout', 'researcher', 'worker', 'reviewer', 'oracle')) {
    if ($contracts['metonia-orchestrator'] -notmatch "``$role``") { $failures.Add("metonia-orchestrator lacks role $role") }
}
foreach ($parallelContract in @('ready frontier', 'no fixed agent count', 'in parallel by default')) {
    if ($contracts['metonia-orchestrator'] -notmatch [Regex]::Escape($parallelContract)) {
        $failures.Add("metonia-orchestrator lacks adaptive parallel guidance: $parallelContract")
    }
}
if ($contracts['metonia-orchestrator'] -notmatch [Regex]::Escape('skill: "review-plan"')) { $failures.Add('metonia-orchestrator does not explicitly inject review-plan') }
if ($contracts['execute-plan'] -notmatch [Regex]::Escape('skill: "review-plan"')) { $failures.Add('execute-plan does not explicitly inject review-plan') }
foreach ($contract in @('read-only', 'actual diff', 'plan-boundaries', 'commands-and-evidence', 'controls-and-gates', 'METONIA_RESULT: PASS', 'METONIA_RESULT: BLOCKED')) {
    if ($contracts['review-plan'] -notmatch [Regex]::Escape($contract)) { $failures.Add("review-plan lacks review contract: $contract") }
}

foreach ($runtimeFile in @($runtimePath, $routingPath, $runtimeContractPath, $reviewContextPath, $routingExamplePath)) {
    if (-not (Test-Path -LiteralPath $runtimeFile -PathType Leaf)) { $failures.Add("missing runtime file: $runtimeFile") }
}
if (Test-Path -LiteralPath $runtimePath) {
    $runtime = Get-Content -LiteralPath $runtimePath -Raw
    foreach ($contract in @('METONIA_DELEGATE_CHILD', 'acquireWriterLock', 'assertCapabilityControls', 'ModelRuntime', 'getAvailable', 'metonia-runs.jsonl', '--no-session', '--no-extensions', '--no-skills', '--exclude-tools', 'buildAuditRecord', 'skillCollision', 'collectReviewContext', 'reviewBase')) {
        if ($runtime -notmatch [Regex]::Escape($contract)) { $failures.Add("runtime lacks safety contract: $contract") }
    }
    if ($runtime.IndexOf('source: "bundled"') -gt $runtime.IndexOf('source: "global"')) { $failures.Add('runtime resolves global skills before bundled skills') }
    if ($runtime -match 'from\s+["'']pi-subagents') { $failures.Add('runtime imports pi-subagents') }
}

& node $routingTestPath
if ($LASTEXITCODE -ne 0) { $failures.Add('routing unit tests failed') }

if (Test-Path -LiteralPath $routingExamplePath) {
    $routing = Get-Content -LiteralPath $routingExamplePath -Raw | ConvertFrom-Json
    if ($routing.active_profile -ne 'auto') { $failures.Add('example routing does not default to auto') }
    foreach ($capability in $capabilities) {
        if (-not $routing.auto_routes.PSObject.Properties[$capability]) {
            $failures.Add("auto routing lacks $capability")
            continue
        }
        $resolved = & node $resolverPath $capability --profile auto --config $routingExamplePath --compact | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0 -or $resolved.profile -ne 'auto' -or $resolved.selection_source -ne 'parent-fallback') {
            $failures.Add("resolver failed: auto/$capability")
        }
    }
    foreach ($profile in $routing.profiles.PSObject.Properties) {
        foreach ($capability in $capabilities) {
            if (-not $profile.Value.capabilities.PSObject.Properties[$capability]) {
                $failures.Add("profile $($profile.Name) lacks $capability")
                continue
            }
            $resolved = & node $resolverPath $capability --profile $profile.Name --config $routingExamplePath --compact | ConvertFrom-Json
            if ($LASTEXITCODE -ne 0 -or $resolved.profile -ne $profile.Name -or $resolved.capability -ne $capability) {
                $failures.Add("resolver failed: $($profile.Name)/$capability")
            }
        }
    }
}

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    $failures.Add('missing upstream-manifest.json')
} else {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $localNames = @($skillDirectories.Name)
    foreach ($entry in $manifest.skills) {
        if ($entry.name -notin $localNames) { $failures.Add("upstream skill missing locally: $($entry.name)") }
        if ($entry.sha256 -notmatch '^[0-9a-f]{64}$') { $failures.Add("invalid upstream hash: $($entry.name)") }
    }
}

function Test-BoundedWriteEligibility {
    param([pscustomobject]$Case)
    return $Case.Risk -eq 'low' -and $Case.WriteFiles -le 3 -and
        $Case.DeterministicChecks -and -not $Case.SensitiveDecision -and
        -not $Case.ExternalEffect -and -not $Case.HumanGate -and $Case.BaseCommitMatches
}

$codingCases = @(
    [pscustomobject]@{ Name='read-only-recon'; Mode='read-only'; Risk='low'; WriteFiles=0; DeterministicChecks=$true; SensitiveDecision=$false; ExternalEffect=$false; HumanGate=$false; BaseCommitMatches=$true; Expected='efficient-read' },
    [pscustomobject]@{ Name='quick-one-file'; Mode='quick'; Risk='low'; WriteFiles=1; DeterministicChecks=$true; SensitiveDecision=$false; ExternalEffect=$false; HumanGate=$false; BaseCommitMatches=$true; Expected='bounded-write' },
    [pscustomobject]@{ Name='bounded-standard'; Mode='standard'; Risk='low'; WriteFiles=3; DeterministicChecks=$true; SensitiveDecision=$false; ExternalEffect=$false; HumanGate=$false; BaseCommitMatches=$true; Expected='bounded-write' },
    [pscustomobject]@{ Name='four-files'; Mode='standard'; Risk='low'; WriteFiles=4; DeterministicChecks=$true; SensitiveDecision=$false; ExternalEffect=$false; HumanGate=$false; BaseCommitMatches=$true; Expected='standard-write' },
    [pscustomobject]@{ Name='security-change'; Mode='standard'; Risk='low'; WriteFiles=1; DeterministicChecks=$true; SensitiveDecision=$true; ExternalEffect=$false; HumanGate=$false; BaseCommitMatches=$true; Expected='standard-write' },
    [pscustomobject]@{ Name='base-mismatch'; Mode='standard'; Risk='low'; WriteFiles=1; DeterministicChecks=$true; SensitiveDecision=$false; ExternalEffect=$false; HumanGate=$false; BaseCommitMatches=$false; Expected='standard-write' },
    [pscustomobject]@{ Name='critical-decision'; Mode='critical-decision'; Risk='critical'; WriteFiles=0; DeterministicChecks=$false; SensitiveDecision=$true; ExternalEffect=$false; HumanGate=$true; BaseCommitMatches=$true; Expected='deep-decision' }
)

foreach ($case in $codingCases) {
    $actual = if ($case.Mode -eq 'read-only') { 'efficient-read' } elseif ($case.Mode -eq 'critical-decision') { 'deep-decision' } elseif (Test-BoundedWriteEligibility $case) { 'bounded-write' } else { 'standard-write' }
    if ($actual -ne $case.Expected) { $failures.Add("routing case failed: $($case.Name), expected $($case.Expected), got $actual") }
}

$learningCases = @(
    [pscustomobject]@{ Name='short-clean-source'; Long=$false; Dense=$false; MultiSource=$false; HighlyTechnical=$false; LowConfidence=$false; Expected='bounded-learning' },
    [pscustomobject]@{ Name='dense-source'; Long=$false; Dense=$true; MultiSource=$false; HighlyTechnical=$false; LowConfidence=$false; Expected='deep-learning' },
    [pscustomobject]@{ Name='uncertain-transcript'; Long=$false; Dense=$false; MultiSource=$false; HighlyTechnical=$false; LowConfidence=$true; Expected='deep-learning' }
)

foreach ($case in $learningCases) {
    $needsStandard = $case.Long -or $case.Dense -or $case.MultiSource -or $case.HighlyTechnical -or $case.LowConfidence
    $actual = if ($needsStandard) { 'deep-learning' } else { 'bounded-learning' }
    if ($actual -ne $case.Expected) { $failures.Add("learning routing case failed: $($case.Name), expected $($case.Expected), got $actual") }
}

$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempRoot = Join-Path $tempBase ("pi-skills-test-" + [Guid]::NewGuid().ToString('N'))
$resolvedTemp = [IO.Path]::GetFullPath($tempRoot)
if (-not $resolvedTemp.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) { throw "Refusing unsafe temporary path: $resolvedTemp" }

try {
    $tempSkills = Join-Path $resolvedTemp 'skills'
    $tempExtension = Join-Path $resolvedTemp 'extensions/metonia-delegate'
    $tempConfig = Join-Path $resolvedTemp 'metonia-routing.json'
    & $syncScript -Destination $tempSkills -ExtensionDestination $tempExtension
    & $syncScript -Destination $tempSkills -ExtensionDestination $tempExtension -Check
    Copy-Item -LiteralPath $routingExamplePath -Destination $tempConfig
    $legacyConfig = Get-Content -LiteralPath $tempConfig -Raw | ConvertFrom-Json
    $legacyConfig.PSObject.Properties.Remove('auto_routes')
    foreach ($profile in $legacyConfig.profiles.PSObject.Properties) {
        $profile.Value.capabilities.PSObject.Properties.Remove('bounded-learning')
        $profile.Value.capabilities.PSObject.Properties.Remove('deep-learning')
    }
    [IO.File]::WriteAllText($tempConfig, (($legacyConfig | ConvertTo-Json -Depth 20) + "`n"))
    & $configureScript -ConfigPath $tempConfig -Profile auto
    & $configureScript -ConfigPath $tempConfig -Profile auto -Check
} catch {
    $failures.Add("install round trip failed: $($_.Exception.Message)")
} finally {
    if (Test-Path -LiteralPath $resolvedTemp) { Remove-Item -LiteralPath $resolvedTemp -Recurse -Force }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Host "ERROR: $_" -ForegroundColor Red }
    throw "$($failures.Count) validation failure(s)."
}

$caseCount = $codingCases.Count + $learningCases.Count
Write-Host "SKILLS CLEAN ($($skillDirectories.Count) skills, $caseCount routing cases, first-party runtime)"
exit 0
