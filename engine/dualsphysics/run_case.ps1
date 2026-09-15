param(
    [Parameter(Mandatory = $true)]
    [string]$DualSPHysicsRoot,
    [switch]$Cpu,
    [switch]$ForceClean
)

$ErrorActionPreference = 'Stop'
$caseName = 'ReefTank'
$caseBase = Join-Path $PSScriptRoot "case\$caseName"
$outputRoot = Join-Path $PSScriptRoot 'output'
$caseOutput = Join-Path $outputRoot $caseName
$binRoot = Join-Path (Resolve-Path -LiteralPath $DualSPHysicsRoot) 'bin\windows'
$genCase = Join-Path $binRoot 'GenCase_win64.exe'
$solverName = if ($Cpu) { 'DualSPHysics5.4CPU_win64.exe' } else { 'DualSPHysics5.4_win64.exe' }
$solver = Join-Path $binRoot $solverName

foreach ($required in @($genCase, $solver)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Missing required executable: $required"
    }
}

if (Test-Path -LiteralPath $caseOutput) {
    if (-not $ForceClean) {
        throw "Output already exists at $caseOutput. Re-run with -ForceClean to replace it."
    }
    $resolvedOutput = (Resolve-Path -LiteralPath $caseOutput).Path
    $resolvedRoot = (Resolve-Path -LiteralPath $outputRoot).Path
    if (-not $resolvedOutput.StartsWith($resolvedRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove output outside $resolvedRoot"
    }
    Remove-Item -LiteralPath $resolvedOutput -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
Push-Location (Join-Path $PSScriptRoot 'case')
try {
    & $genCase "$($caseName)_Def" "../output/$caseName" '-save:all'
    if ($LASTEXITCODE -ne 0) { throw "GenCase failed with exit code $LASTEXITCODE" }

    $solverArgs = @()
    if (-not $Cpu) { $solverArgs += '-gpu' }
    $solverArgs += @("../output/$caseName", "../output/$caseName")
    & $solver @solverArgs
    if ($LASTEXITCODE -ne 0) { throw "DualSPHysics failed with exit code $LASTEXITCODE" }
}
finally {
    Pop-Location
}

Write-Host "Simulation complete: $caseOutput"
