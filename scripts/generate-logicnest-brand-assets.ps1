param(
  [string]$Source = (Join-Path $PSScriptRoot '..\assets\brand\logicnest-logo-reference.jpg')
)

$ErrorActionPreference = 'Stop'
$expectedSha256 = '889F72F82384C0363084E8E3D06BF1B9D2DDB14A9F9867833525058B04EA5C92'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$actualSha256 = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash

if ($actualSha256 -ne $expectedSha256) {
  throw "Logo source hash mismatch. Expected $expectedSha256, got $actualSha256."
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw 'ffmpeg is required to perform the approved format conversion.'
}

function Convert-ToSquarePng {
  param(
    [Parameter(Mandatory = $true)][int]$Size,
    [Parameter(Mandatory = $true)][string]$Output
  )

  $outputPath = Join-Path $root $Output
  $outputDirectory = Split-Path -Parent $outputPath
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  $filter = "scale=${Size}:${Size}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${Size}:${Size}:(ow-iw)/2:(oh-ih)/2:color=white"
  & ffmpeg -hide_banner -loglevel error -y -i $sourcePath -vf $filter -frames:v 1 $outputPath
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg failed while creating $Output."
  }
}

# Renderer and app icons use a square white canvas. The approved source is
# always contained in full, centered, and never cropped, recolored, or made
# transparent.
Convert-ToSquarePng -Size 1280 -Output 'public\logo.png'

$iconSizes = @(16, 24, 32, 48, 64, 128, 256, 512, 1024)
foreach ($size in $iconSizes) {
  Convert-ToSquarePng -Size $size -Output "build\icons\png\${size}x${size}.png"
}

Convert-ToSquarePng -Size 48 -Output 'resources\tray\tray-icon.png'
Convert-ToSquarePng -Size 22 -Output 'resources\tray\tray-icon-mac.png'
Convert-ToSquarePng -Size 44 -Output 'resources\tray\tray-icon-mac@2x.png'

$windowsIcon = Join-Path $root 'build\icons\win\icon.ico'
& ffmpeg -hide_banner -loglevel error -y `
  -i (Join-Path $root 'build\icons\png\16x16.png') `
  -i (Join-Path $root 'build\icons\png\24x24.png') `
  -i (Join-Path $root 'build\icons\png\32x32.png') `
  -i (Join-Path $root 'build\icons\png\48x48.png') `
  -i (Join-Path $root 'build\icons\png\64x64.png') `
  -i (Join-Path $root 'build\icons\png\128x128.png') `
  -i (Join-Path $root 'build\icons\png\256x256.png') `
  -map 0:v -map 1:v -map 2:v -map 3:v -map 4:v -map 5:v -map 6:v `
  -frames:v 1 -c:v bmp $windowsIcon
if ($LASTEXITCODE -ne 0) {
  throw 'ffmpeg failed while creating the Windows ICO.'
}

$trayIcon = Join-Path $root 'resources\tray\tray-icon.ico'
& ffmpeg -hide_banner -loglevel error -y -i (Join-Path $root 'resources\tray\tray-icon.png') -frames:v 1 $trayIcon
if ($LASTEXITCODE -ne 0) {
  throw 'ffmpeg failed while creating the tray ICO.'
}

Write-Output "Generated approved brand assets from $sourcePath"
Write-Output "Source SHA-256: $actualSha256"
