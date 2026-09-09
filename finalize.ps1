# Copies the build output to the exact submission filenames the T&C demands.
# Run after: python src/build_poster.py
# Usage:  .\finalize.ps1

$b   = $PSScriptRoot
$src = "Team Rocket_IIIT Delhi - C Poster"
$dst = "Team Rocket_IIIT Delhi"

foreach ($ext in @(".pptx", ".pdf")) {
  $from = Join-Path $b ($src + $ext)
  $to   = Join-Path $b ($dst + $ext)
  if (Test-Path $from) {
    Copy-Item $from $to -Force
    Write-Output ("wrote: " + $dst + $ext)
  } else {
    Write-Output ("MISSING: " + $src + $ext)
  }
}
Write-Output ""
Write-Output "Upload these two."
