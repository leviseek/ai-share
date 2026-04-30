$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

function Invoke-ContextGuardShared {
  param(
    [string]$Command,
    [string]$Launcher,
    [string]$ConfigDir,
    [string]$ConfigPath,
    [string[]]$ArgsList
  )

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
