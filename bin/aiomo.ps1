. (Join-Path $PSScriptRoot "opencode-launcher-common.ps1")

function U($Codes) {
  return -join ($Codes | ForEach-Object { [char]$_ })
}

function Show-Help {
  Write-Output (U @(29992, 27861, 65306, 97, 105, 111, 109, 111, 32, 91, 32534, 25490, 32423, 21035, 93, 32, 91, 111, 112, 101, 110, 99, 111, 100, 101, 32, 21442, 25968, 46, 46, 46, 93))
  Write-Output (U @(32, 32, 32, 32, 32, 32, 97, 105, 111, 109, 111, 32, 45, 45, 111, 109, 111, 45, 112, 114, 111, 102, 105, 108, 101, 61, 60, 32534, 25490, 32423, 21035, 62, 32, 91, 111, 112, 101, 110, 99, 111, 100, 101, 32, 21442, 25968, 46, 46, 46, 93))
  Write-Output (U @(32, 32, 32, 32, 32, 32, 97, 105, 111, 109, 111, 32, 45, 45, 111, 109, 111, 45, 112, 114, 111, 102, 105, 108, 101, 32, 60, 32534, 25490, 32423, 21035, 62, 32, 91, 111, 112, 101, 110, 99, 111, 100, 101, 32, 21442, 25968, 46, 46, 46, 93))
  Write-Output ""
  Write-Output (U @(35828, 26126, 65306, 21551, 21160, 32, 111, 104, 45, 109, 121, 45, 111, 112, 101, 110, 97, 103, 101, 110, 116, 32, 22810, 32, 97, 103, 101, 110, 116, 115, 32, 32534, 25490, 27169, 24335, 65292, 24182, 22312, 21551, 21160, 21069, 20999, 25442, 23545, 24212, 32, 79, 77, 79, 32, 37197, 32622, 12290))
  Write-Output ((U @(40664, 35748, 32423, 21035, 65306)) + $ProfileName)
  Write-Output ((U @(21487, 29992, 32423, 21035, 65306)) + ($AvailableProfiles -join (U @(12289))))
  Write-Output ""
  Write-Output (U @(31034, 20363, 65306))
  Write-Output "  aiomo"
  Write-Output "  aiomo coding"
  Write-Output (U @(32, 32, 97, 105, 111, 109, 111, 32, 45, 45, 111, 109, 111, 45, 112, 114, 111, 102, 105, 108, 101, 61, 114, 101, 115, 101, 97, 114, 99, 104, 32, 114, 117, 110, 32, 34, 35831, 20998, 26512, 24403, 21069, 39033, 30446, 34))
  Write-Output "  aiomo -h"
}


$ConfigDir = Join-Path $env:USERPROFILE ".config\opencode"
$ManifestPath = Join-Path $ConfigDir ".omo-profiles.json"
$ProfileName = "balanced"
$AvailableProfiles = @("lite", "balanced", "max")

if (Test-Path -LiteralPath $ManifestPath -PathType Leaf) {
  $Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
  if ($Manifest.default_profile) {
    $ProfileName = [string]$Manifest.default_profile
  }
  if ($Manifest.profiles) {
    $AvailableProfiles = @($Manifest.profiles | ForEach-Object { [string]$_ })
  }
}

if ($args.Count -gt 0 -and ($args[0] -eq "-h" -or $args[0] -eq "--help")) {
  Show-Help
  exit 0
}

if ($args.Count -gt 1 -and $args[0] -eq "rescue") {
  $Code = Invoke-ContextGuardShared "rescue" "aiomo" $ConfigDir "" @($args[1])
  exit $Code
}

$OpenCodeArgs = [System.Collections.Generic.List[string]]::new()

for ($Index = 0; $Index -lt $args.Count; $Index += 1) {
  $Arg = $args[$Index]

  if ($Index -eq 0 -and $AvailableProfiles -contains $Arg) {
    $ProfileName = $Arg
    continue
  }

  if ($Index -eq 0 -and $Arg -eq "--omo-profile") {
    $ProfileName = if ($args.Count -gt 1) { $args[1] } else { "" }
    $Index += 1
    continue
  }

  if ($Index -eq 0 -and $Arg.StartsWith("--omo-profile=")) {
    $ProfileName = $Arg.Substring("--omo-profile=".Length)
    continue
  }

  $OpenCodeArgs.Add($Arg)
}

if ($AvailableProfiles -notcontains $ProfileName) {
  Write-Error ((U @(19981, 25903, 25345, 30340, 32, 79, 77, 79, 32, 32534, 25490, 32423, 21035, 65306)) + $ProfileName)
  Write-Error ((U @(21487, 29992, 32423, 21035, 65306)) + ($AvailableProfiles -join (U @(12289))))
  exit 2
}

$OpenCodeProfileConfig = Join-Path $ConfigDir "opencode.$ProfileName.json"
$OpenCodeActiveConfig = Join-Path $ConfigDir "opencode.json"
$OmoProfileConfig = Join-Path $ConfigDir "oh-my-openagent.$ProfileName.json"
$OmoActiveConfig = Join-Path $ConfigDir "oh-my-openagent.json"
$StrategyProfileConfig = Join-Path $ConfigDir "strategy.$ProfileName.json"
$StrategyActiveConfig = Join-Path $ConfigDir "strategy.json"

if (-not (Test-Path -LiteralPath $OpenCodeProfileConfig -PathType Leaf)) {
  Write-Error ((U @(32570, 23569, 32, 79, 112, 101, 110, 67, 111, 100, 101, 32, 32534, 25490, 32423, 21035, 37197, 32622, 65306)) + $OpenCodeProfileConfig)
  Write-Error (U @(35831, 20808, 36816, 34892, 65306, 98, 117, 110, 32, 114, 117, 110, 32, 97, 105, 58, 103, 101, 110, 32, 45, 45, 32, 45, 45, 102, 111, 114, 99, 101))
  exit 1
}

if (-not (Test-Path -LiteralPath $OmoProfileConfig -PathType Leaf)) {
  Write-Error ((U @(32570, 23569, 32, 79, 77, 79, 32, 32534, 25490, 32423, 21035, 37197, 32622, 65306)) + $OmoProfileConfig)
  Write-Error (U @(35831, 20808, 36816, 34892, 65306, 98, 117, 110, 32, 114, 117, 110, 32, 97, 105, 58, 103, 101, 110, 32, 45, 45, 32, 45, 45, 102, 111, 114, 99, 101))
  exit 1
}

Copy-Item -LiteralPath $OpenCodeProfileConfig -Destination $OpenCodeActiveConfig -Force
Copy-Item -LiteralPath $OmoProfileConfig -Destination $OmoActiveConfig -Force
if (Test-Path -LiteralPath $StrategyProfileConfig -PathType Leaf) {
  Copy-Item -LiteralPath $StrategyProfileConfig -Destination $StrategyActiveConfig -Force
}
$GuardExit = Invoke-ContextGuardShared "check" "aiomo" $ConfigDir $OpenCodeProfileConfig $OpenCodeArgs.ToArray()
if ($GuardExit -eq 10) { exit 10 }
$OpenCode = Get-Command opencode.exe -CommandType Application -ErrorAction Stop
& $OpenCode.Source @OpenCodeArgs
exit $LASTEXITCODE
