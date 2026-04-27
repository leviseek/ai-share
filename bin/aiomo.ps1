$ProfileName = "balanced"
$OpenCodeArgs = [System.Collections.Generic.List[string]]::new()

for ($Index = 0; $Index -lt $args.Count; $Index += 1) {
  $Arg = $args[$Index]

  if ($Index -eq 0 -and @("lite", "balanced", "max") -contains $Arg) {
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

if (@("lite", "balanced", "max") -notcontains $ProfileName) {
  Write-Error ("Unsupported OMO profile: " + $ProfileName)
  Write-Error "Available profiles: lite, balanced, max"
  exit 2
}

$ConfigDir = Join-Path $env:USERPROFILE ".config\opencode"
$ProfileConfig = Join-Path $ConfigDir "oh-my-openagent.$ProfileName.json"
$ActiveConfig = Join-Path $ConfigDir "oh-my-openagent.json"

if (-not (Test-Path -LiteralPath $ProfileConfig -PathType Leaf)) {
  Write-Error ("Missing OMO profile config: " + $ProfileConfig)
  Write-Error "Run first: bun run ai:gen -- --force"
  exit 1
}

Copy-Item -LiteralPath $ProfileConfig -Destination $ActiveConfig -Force
& opencode @OpenCodeArgs
exit $LASTEXITCODE
