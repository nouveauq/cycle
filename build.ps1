param(
  [string]$Name = "cycle-together"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $root "dist"
$tempZip = Join-Path $dist "$Name.zip"
$target = Join-Path $dist "$Name.xdc"
$files = @(
  "index.html",
  "styles.css",
  "app.js",
  "mock-webxdc.js",
  "manifest.toml",
  "icon.png"
)

New-Item -ItemType Directory -Force -Path $dist | Out-Null

if (Test-Path $tempZip) {
  Remove-Item $tempZip -Force
}

if (Test-Path $target) {
  Remove-Item $target -Force
}

Push-Location $root
try {
  Compress-Archive -LiteralPath $files -DestinationPath $tempZip -CompressionLevel Optimal -Force
} finally {
  Pop-Location
}

Rename-Item -Path $tempZip -NewName "$Name.xdc"
Write-Host "Created $target"
