$ErrorActionPreference = 'Stop'

$domain = 'local.y.qq.com'
$root = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $root 'certs'
$pfxPath = Join-Path $certDir ($domain + '.pfx')
$cerPath = Join-Path $certDir ($domain + '.cer')
$passwordText = 'qqmusic-local'
$hostsPath = Join-Path $env:WINDIR 'System32\drivers\etc\hosts'

New-Item -ItemType Directory -Force -Path $certDir | Out-Null

if (-not (Test-Path -LiteralPath $pfxPath)) {
  $cert = New-SelfSignedCertificate -DnsName $domain -CertStoreLocation 'Cert:\CurrentUser\My' -FriendlyName 'QQ Music Local Dev' -KeyAlgorithm RSA -KeyLength 2048 -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(2)
  $password = ConvertTo-SecureString -String $passwordText -Force -AsPlainText
  Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $password | Out-Null
  Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
  Import-Certificate -FilePath $cerPath -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
  Write-Host ('Created and trusted local HTTPS certificate: ' + $pfxPath)
} else {
  Write-Host ('Certificate already exists: ' + $pfxPath)
}

$hosts = Get-Content -Raw -LiteralPath $hostsPath
$hostLine = '127.0.0.1 ' + $domain
if ($hosts.IndexOf($hostLine) -lt 0) {
  Add-Content -LiteralPath $hostsPath -Value ([Environment]::NewLine + $hostLine)
  Write-Host ('Added hosts entry: ' + $hostLine)
} else {
  Write-Host ('Hosts entry already exists: ' + $hostLine)
}

Write-Host ''
Write-Host 'Done. Run npm start, then open:'
Write-Host ('https://' + $domain + ':5174')
