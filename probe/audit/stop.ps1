# Ask the running audit to finish the agents now running and exit.
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
New-Item -ItemType File -Path "$repo\probe\audit\STOP" -Force | Out-Null
Write-Host "STOP written; the loop exits after the agents now running finish"
