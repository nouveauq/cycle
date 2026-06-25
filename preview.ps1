param(
  [int]$Port = 4173
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://127.0.0.1:$Port/index.html"

Write-Host "Preview URL: $url"
Write-Host "To simulate a second participant, open: http://127.0.0.1:$Port/index.html?name=Партнер"
Start-Process $url | Out-Null

Push-Location $root
try {
  python -m http.server $Port
} finally {
  Pop-Location
}
