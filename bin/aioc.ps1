. (Join-Path $PSScriptRoot "opencode-launcher-common.ps1")

$ConfigDir = Join-Path $env:USERPROFILE ".config\opencode"
$ActiveConfig = Join-Path $ConfigDir "opencode.json"
$ActiveContextGuardProfileConfig = Join-Path $ConfigDir "context-guard.profile.json"

if ($args.Count -gt 1 -and $args[0] -eq "rescue") {
  $Code = Invoke-ContextGuardShared "rescue" "aioc" $ConfigDir "" @($args[1])
  exit $Code
}

$OpenCodeArgs = [System.Collections.Generic.List[string]]::new()
for ($Index = 0; $Index -lt $args.Count; $Index += 1) {
  $OpenCodeArgs.Add($args[$Index])
}

$GuardConfigPath = if (Test-Path -LiteralPath $ActiveContextGuardProfileConfig -PathType Leaf) { $ActiveContextGuardProfileConfig } else { $ActiveConfig }
$GuardExit = Invoke-ContextGuardShared "check" "aioc" $ConfigDir $GuardConfigPath $OpenCodeArgs.ToArray()
if ($GuardExit -eq 10) { exit 10 }

$OpenCode = Get-Command opencode.exe -CommandType Application -ErrorAction Stop
& $OpenCode.Source --pure @args
exit $LASTEXITCODE
