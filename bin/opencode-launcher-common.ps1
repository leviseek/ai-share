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

  $GuardScript = Join-Path $PSScriptRoot "opencode-context-guard.ts"
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

  $GuardScript = Join-Path $PSScriptRoot "opencode-context-guard.ts"
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
    [string]$WorkingDirectory,
    [int]$WatchPid
  )

  $GuardScript = Join-Path $PSScriptRoot "opencode-context-guard.ts"
  $GuardConfig = Join-Path $ConfigDir "context-guard.json"
  $StrategyConfig = Join-Path $ConfigDir "strategy.json"
  $DbPath = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".local\share\opencode\opencode.db"
  if (-not (Test-Path -LiteralPath $GuardScript -PathType Leaf)) { return }
  if (-not (Test-Path -LiteralPath $StrategyConfig -PathType Leaf)) { return }
  if (-not (Get-Command bun -CommandType Application -ErrorAction SilentlyContinue)) { return }

  $StdoutLogPath = Join-Path $ConfigDir "context-guard-watch.log"
  $StderrLogPath = Join-Path $ConfigDir "context-guard-watch.err.log"
  Stop-ExistingContextGuardWatchShared $Launcher $WorkingDirectory
  $Arguments = @(
    $GuardScript,
    "watch",
    $Launcher,
    $ConfigPath,
    $GuardConfig,
    $StrategyConfig,
    $DbPath,
    $WorkingDirectory,
    ([string]$WatchPid)
  )
  try {
    Start-Process -FilePath "bun" -ArgumentList $Arguments -WindowStyle Hidden -RedirectStandardOutput $StdoutLogPath -RedirectStandardError $StderrLogPath | Out-Null
  } catch {
    try { Add-Content -LiteralPath $StderrLogPath -Value "[$([DateTimeOffset]::Now.ToString('o'))] failed to start watcher: $($_.Exception.Message)" -Encoding UTF8 } catch {}
  }
}

function Stop-ExistingContextGuardWatchShared {
  param(
    [string]$Launcher,
    [string]$WorkingDirectory
  )

  $EscapedLauncher = [regex]::Escape($Launcher)
  $EscapedWorkingDirectory = [regex]::Escape($WorkingDirectory)
  $CurrentPid = $PID
  try {
    Get-CimInstance Win32_Process |
      Where-Object {
        $_.ProcessId -ne $CurrentPid -and
        $_.CommandLine -match "opencode-context-guard\.ts\s+watch\s+$EscapedLauncher\b" -and
        $_.CommandLine -match $EscapedWorkingDirectory
      } |
      ForEach-Object {
        try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
      }
  } catch {}
}
