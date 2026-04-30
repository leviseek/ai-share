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

function New-ContextGuardHandoffShared {
  param(
    [string]$Launcher,
    [string]$ConfigDir,
    [string]$SessionId,
    [string]$WorkingDirectory
  )

  $GuardScript = Join-Path $PSScriptRoot "opencode-context-guard.mjs"
  $GuardConfig = Join-Path $ConfigDir "context-guard.json"
  $DbPath = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".local\share\opencode\opencode.db"
  if (-not (Test-Path -LiteralPath $GuardScript -PathType Leaf)) { return $null }
  if (-not (Get-Command bun -CommandType Application -ErrorAction SilentlyContinue)) { return $null }

  try {
    $Output = & bun $GuardScript "handoff" $Launcher $SessionId $GuardConfig $DbPath $WorkingDirectory 2>$null
    if ($LASTEXITCODE -eq 0 -and $Output) { return [string]($Output | Select-Object -Last 1) }
  } catch {}
  return $null
}

function Start-ContextGuardWatchShared {
  param(
    [string]$Launcher,
    [string]$ConfigDir,
    [string]$ConfigPath,
    [string]$WorkingDirectory
  )

  $GuardScript = Join-Path $PSScriptRoot "opencode-context-guard.mjs"
  $GuardConfig = Join-Path $ConfigDir "context-guard.json"
  $StrategyConfig = Join-Path $ConfigDir "strategy.json"
  $DbPath = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".local\share\opencode\opencode.db"
  if (-not (Test-Path -LiteralPath $GuardScript -PathType Leaf)) { return }
  if (-not (Test-Path -LiteralPath $StrategyConfig -PathType Leaf)) { return }
  if (-not (Get-Command bun -CommandType Application -ErrorAction SilentlyContinue)) { return }

  $StdoutLogPath = Join-Path $ConfigDir "context-guard-watch.log"
  $StderrLogPath = Join-Path $ConfigDir "context-guard-watch.err.log"
  $Arguments = @(
    $GuardScript,
    "watch",
    $Launcher,
    $ConfigPath,
    $GuardConfig,
    $StrategyConfig,
    $DbPath,
    $WorkingDirectory,
    ([string]$PID)
  )
  try {
    Start-Process -FilePath "bun" -ArgumentList $Arguments -WindowStyle Hidden -RedirectStandardOutput $StdoutLogPath -RedirectStandardError $StderrLogPath | Out-Null
  } catch {
    try { Add-Content -LiteralPath $StderrLogPath -Value "[$([DateTimeOffset]::Now.ToString('o'))] failed to start watcher: $($_.Exception.Message)" -Encoding UTF8 } catch {}
  }
}
