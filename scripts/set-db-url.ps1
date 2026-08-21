# Replaces DATABASE_URL in .env.local without opening an editor.
#
# Notepad has silently failed to save this file twice on this machine, so the
# value is read here and written directly. The input is masked, so the
# connection string never appears on screen or in shell history.

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ""
Write-Host "Paste the DATABASE_URL connection string, then press Enter."
Write-Host "It will not appear as you type. That is deliberate."
Write-Host ""

$secure = Read-Host "DATABASE_URL" -AsSecureString
$value = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

if ([string]::IsNullOrWhiteSpace($value)) {
  Write-Host "Nothing entered - file unchanged."
  exit 1
}
if (-not $value.StartsWith("postgres")) {
  Write-Host "That does not look like a connection string (should start with postgresql://)."
  Write-Host "File unchanged."
  exit 1
}

# Rewrite only the DATABASE_URL line, leaving every other variable alone.
$lines = Get-Content .env.local
$out = @()
$replaced = $false
foreach ($line in $lines) {
  if ($line -match '^\s*DATABASE_URL\s*=') {
    $out += "DATABASE_URL=$value"
    $replaced = $true
  } else {
    $out += $line
  }
}
if (-not $replaced) { $out += "DATABASE_URL=$value" }

Set-Content -Path .env.local -Value $out -Encoding utf8
Write-Host ""
Write-Host "Saved. Testing the connection..."
