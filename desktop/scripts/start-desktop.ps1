$ErrorActionPreference = 'Stop'
$taskDesktopRoot = Split-Path -Parent $PSScriptRoot
$taskCargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (Test-Path -LiteralPath $taskCargoBin) { $env:PATH = "$taskCargoBin;$env:PATH" }
Push-Location -LiteralPath $taskDesktopRoot
try { & npm.cmd run desktop; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
finally { Pop-Location }
