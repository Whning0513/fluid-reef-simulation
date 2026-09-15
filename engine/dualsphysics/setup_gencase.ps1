param(
    [string]$Destination = (Join-Path $PSScriptRoot 'bin')
)

$ErrorActionPreference = 'Stop'
$baseUrl = 'https://raw.githubusercontent.com/DualSPHysics/DualSPHysics/master/bin/windows'
New-Item -ItemType Directory -Force -Path $Destination | Out-Null

foreach ($file in @('GenCase_win64.exe', 'vcomp140.dll')) {
    $target = Join-Path $Destination $file
    Invoke-WebRequest -Uri "$baseUrl/$file" -OutFile $target
    Write-Host "Downloaded $target"
}

Write-Host 'GenCase preprocessor installed. The solver itself must come from the official DualSPHysics package.'
