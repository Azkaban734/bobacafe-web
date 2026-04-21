# sync-reports.ps1
# Copies generated HTML reports from boba-cafe-databricks into main-site/reports/
# and regenerates the index. Run this after pulling boba-cafe-databricks.
#
# Usage:
#   .\sync-reports.ps1
#   .\sync-reports.ps1 -SourceDir "C:\other\path\to\analysis-html"

param(
    [string]$SourceDir = "..\boba-cafe-databricks\weekly-analysis\analysis-html"
)

$DestDir = "$PSScriptRoot\main-site\reports"

if (-not (Test-Path $SourceDir)) {
    Write-Error "Source not found: $SourceDir"
    exit 1
}

New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

# Copy all HTML files
$files = Get-ChildItem -Path $SourceDir -Filter "*.html" | Sort-Object Name -Descending
if ($files.Count -eq 0) {
    Write-Host "No HTML files found in $SourceDir"
    exit 0
}

foreach ($f in $files) {
    Copy-Item $f.FullName -Destination $DestDir -Force
    Write-Host "Copied  $($f.Name)"
}

# Regenerate index.html
$rows = ($files | ForEach-Object {
    $label = $_.BaseName -replace "_", " " -replace "-", " "
    $label = (Get-Culture).TextInfo.ToTitleCase($label.ToLower())
    "      <li><a href=`"$($_.Name)`">$label</a></li>"
}) -join "`n"

$index = @"
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reports — Boba Cafe</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           background: #fdf6ec; color: #5d4037; margin: 0; padding: 40px; }
    h1   { font-size: 1.6em; margin-bottom: 0.25em; }
    p    { color: #8d6e63; margin-top: 0; }
    ul   { list-style: none; padding: 0; max-width: 600px; }
    li   { margin: 10px 0; }
    a    { color: #5d4037; text-decoration: none; border: 1px solid #d7ccc8;
           padding: 10px 16px; border-radius: 6px; display: inline-block;
           background: #fff; width: 100%; box-sizing: border-box; }
    a:hover { background: #8d6e63; color: #fff; border-color: #8d6e63; }
  </style>
</head>
<body>
  <h1>📊 Boba Cafe Reports</h1>
  <p>Internal analytics — updated automatically.</p>
  <ul>
$rows
  </ul>
</body>
</html>
"@

$index | Out-File -FilePath "$DestDir\index.html" -Encoding utf8
Write-Host "Index   main-site/reports/index.html  ($($files.Count) report(s))"
Write-Host ""
Write-Host "Done. Commit and push bobacafe-web to publish."
