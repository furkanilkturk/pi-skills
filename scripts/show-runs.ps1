[CmdletBinding()]
param(
    [ValidateRange(1, 500)]
    [int]$Count = 20,
    [string]$AuditPath = (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.pi/agent/metonia-runs.jsonl')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $AuditPath -PathType Leaf)) {
    Write-Host "No Metonia delegation audit exists at $AuditPath"
    exit 0
}

Get-Content -LiteralPath $AuditPath -Tail $Count |
    ForEach-Object { $_ | ConvertFrom-Json } |
    Select-Object timestamp, runId, profile, capability, agent, model, selectionSource, skill, status, exitCode,
        @{ Name = 'input'; Expression = { $_.usage.input } },
        @{ Name = 'output'; Expression = { $_.usage.output } },
        @{ Name = 'cost'; Expression = { $_.usage.cost } },
        task_sha256 |
    Format-Table -AutoSize
