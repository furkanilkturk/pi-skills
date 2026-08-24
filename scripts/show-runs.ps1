[CmdletBinding()]
param(
    [ValidateRange(1, 500)]
    [int]$Count = 20,
    [string]$AuditPath = (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.pi/agent/metonia-runs.jsonl')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $PSBoundParameters.ContainsKey('AuditPath') -and -not [string]::IsNullOrWhiteSpace($env:PI_CODING_AGENT_DIR)) {
    $AuditPath = Join-Path $env:PI_CODING_AGENT_DIR 'metonia-runs.jsonl'
}

if (-not (Test-Path -LiteralPath $AuditPath -PathType Leaf)) {
    Write-Host "No Metonia delegation audit exists at $AuditPath"
    exit 0
}

Get-Content -LiteralPath $AuditPath -Tail $Count |
    ForEach-Object { $_ | ConvertFrom-Json } |
    Select-Object @{ Name = 'time'; Expression = { ([DateTimeOffset]$_.timestamp).ToLocalTime().ToString('dd.MM.yyyy HH:mm') } },
        @{ Name = 'runId'; Expression = { if ($_.PSObject.Properties['run_id']) { $_.run_id } else { $_.runId } } },
        profile, capability, agent, model,
        @{ Name = 'selectionSource'; Expression = { if ($_.PSObject.Properties['selection_source']) { $_.selection_source } else { $_.selectionSource } } },
        skill, status,
        @{ Name = 'exitCode'; Expression = { if ($_.PSObject.Properties['exit_code']) { $_.exit_code } else { $_.exitCode } } },
        @{ Name = 'input'; Expression = { $_.usage.input } },
        @{ Name = 'output'; Expression = { $_.usage.output } },
        @{ Name = 'cost'; Expression = { $_.usage.cost } },
        task_sha256 |
    Format-Table -AutoSize
