$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$browserCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)

$browser = $browserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browser) {
  throw 'Chrome or Edge not found. Add local.y.qq.com to hosts manually.'
}

$profile = Join-Path $root 'chrome-local-yqq-profile'
New-Item -ItemType Directory -Force -Path $profile | Out-Null

Start-Process -FilePath $browser -ArgumentList @(
  '--user-data-dir=' + $profile,
  '--host-resolver-rules=MAP local.y.qq.com 127.0.0.1',
  '--new-window',
  'https://local.y.qq.com:5174'
)
