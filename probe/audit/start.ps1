# Launch the overnight audit detached from this terminal, so closing the window
# does not kill it. Progress goes to probe/audit/run.log; stop it with stop.ps1.
#
#   powershell -File probe/audit/start.ps1                      8 hours, 2 parallel, 60 runs
#   powershell -File probe/audit/start.ps1 -Hours 6 -Parallel 3 -MaxRuns 100 -Surface phone
#   powershell -File probe/audit/start.ps1 -Writes              logged-in scenarios may submit
param(
  [double]$Hours = 8,
  [int]$Parallel = 2,
  [int]$MaxRuns = 60,
  [string]$Surface = "both",
  [string]$Model = "sonnet",
  [switch]$Writes
)
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$node = (Get-Command node).Source
$list = @("probe/audit/run.mjs", "--hours", $Hours, "--parallel", $Parallel, "--max-runs", $MaxRuns, "--surface", $Surface, "--model", $Model)
if ($Writes) { $list += "--writes" }
Remove-Item -Path "$repo\probe\audit\STOP" -ErrorAction SilentlyContinue
Start-Process -FilePath $node -ArgumentList $list -WorkingDirectory $repo -WindowStyle Hidden `
  -RedirectStandardOutput "$repo\probe\audit\run.out.log" -RedirectStandardError "$repo\probe\audit\run.err.log"
Write-Host "audit started; follow probe/audit/run.log, stop with probe/audit/stop.ps1"
