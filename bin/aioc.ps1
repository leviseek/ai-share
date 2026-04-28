$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

function Invoke-ContextGuard {
  param([string]$Command, [string]$Launcher, [string]$ConfigPath, [string[]]$ArgsList)

  $GuardScript = Join-Path $PSScriptRoot "opencode-context-guard.mjs"
  $GuardConfig = Join-Path $ConfigDir "context-guard.json"
  $DbPath = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".local\share\opencode\opencode.db"
  if (-not (Test-Path -LiteralPath $GuardScript -PathType Leaf)) { return 0 }
  if (-not (Get-Command bun -CommandType Application -ErrorAction SilentlyContinue)) { return 0 }
  if ($Command -eq "check") {
    & bun $GuardScript check $Launcher $ConfigPath $GuardConfig $DbPath -- @ArgsList
  } else {
    & bun $GuardScript rescue $Launcher $ArgsList[0] $GuardConfig $DbPath
  }
  return $LASTEXITCODE
}

$ConfigDir = Join-Path $env:USERPROFILE ".config\opencode"
$ActiveConfig = Join-Path $ConfigDir "opencode.json"

if ($args.Count -gt 1 -and $args[0] -eq "rescue") {
  $Code = Invoke-ContextGuard "rescue" "aioc" "" @($args[1])
  exit $Code
}

$OpenCodeArgs = [System.Collections.Generic.List[string]]::new()
for ($Index = 0; $Index -lt $args.Count; $Index += 1) {
  $OpenCodeArgs.Add($args[$Index])
}

$GuardExit = Invoke-ContextGuard "check" "aioc" $ActiveConfig $OpenCodeArgs.ToArray()
if ($GuardExit -eq 10) { exit 10 }

$OpenCode = Get-Command opencode.exe -CommandType Application -ErrorAction Stop
& $OpenCode.Source --pure @args
exit $LASTEXITCODE
