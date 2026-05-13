$script:PreviousOutputEncoding = [Console]::OutputEncoding
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

function Set-OpenCodeProxyEnvShared {
  param([string]$ConfigDir)

  if ($env:AI_SHARE_PROXY -eq "0" -or $env:AI_SHARE_PROXY -eq "false") { return }
  $ProxyConfigPath = Join-Path $ConfigDir "proxy.json"
  if (-not (Test-Path -LiteralPath $ProxyConfigPath -PathType Leaf)) { return }

  try {
    $ProxyConfig = Get-Content -LiteralPath $ProxyConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    return
  }
  if ($ProxyConfig.enabled -eq $false) { return }

  $ProxyUrl = $env:AI_SHARE_PROXY_URL
  if (-not $ProxyUrl) {
    $Protocol = if ($env:AI_SHARE_PROXY_PROTOCOL) { $env:AI_SHARE_PROXY_PROTOCOL } elseif ($ProxyConfig.protocol) { [string]$ProxyConfig.protocol } else { "http" }
    $HostName = if ($env:AI_SHARE_PROXY_HOST) { $env:AI_SHARE_PROXY_HOST } elseif ($ProxyConfig.host) { [string]$ProxyConfig.host } else { "127.0.0.1" }
    $Port = if ($env:AI_SHARE_PROXY_PORT) { $env:AI_SHARE_PROXY_PORT } elseif ($ProxyConfig.port) { [string]$ProxyConfig.port } else { "7897" }
    $ProxyUrl = "${Protocol}://${HostName}:${Port}"
  }
  if (-not $ProxyUrl) { return }

  if (-not $env:HTTP_PROXY) { $env:HTTP_PROXY = $ProxyUrl }
  if (-not $env:HTTPS_PROXY) { $env:HTTPS_PROXY = $ProxyUrl }
  if (-not $env:ALL_PROXY) { $env:ALL_PROXY = $ProxyUrl }
  if (-not $env:http_proxy) { $env:http_proxy = $env:HTTP_PROXY }
  if (-not $env:https_proxy) { $env:https_proxy = $env:HTTPS_PROXY }
  if (-not $env:all_proxy) { $env:all_proxy = $env:ALL_PROXY }

  $NoProxy = $env:AI_SHARE_NO_PROXY
  if (-not $NoProxy) {
    if ($ProxyConfig.no_proxy) {
      $NoProxy = @($ProxyConfig.no_proxy | ForEach-Object { [string]$_ }) -join ","
    } else {
      $NoProxy = "localhost,127.0.0.1,::1"
    }
  }
  if ($NoProxy) {
    if (-not $env:NO_PROXY) { $env:NO_PROXY = $NoProxy }
    if (-not $env:no_proxy) { $env:no_proxy = $env:NO_PROXY }
  }
}

$script:Live2DPetProcess = $null

function Restore-OpenCodeTerminalShared {
  try {
    $sequence = "`e[?1000l`e[?1002l`e[?1003l`e[?1004l`e[?1005l`e[?1006l`e[?2004l`e[?1049l`e[?25h`e[0m"
    [Console]::Write($sequence)
    [Console]::Out.Flush()
    [Console]::Error.Flush()
  } catch {}
}

function Restore-OpenCodeConsoleEncodingShared {
  try {
    if ($script:PreviousOutputEncoding) {
      [Console]::OutputEncoding = $script:PreviousOutputEncoding
      $script:PreviousOutputEncoding = $null
    }
  } catch {}
}

function Start-Live2DPetShared {
  param(
    [string]$ConfigDir,
    [bool]$AllowBrowserFallback = $true
  )

  if (-not (Get-Command bun -CommandType Application -ErrorAction SilentlyContinue)) {
    throw "缺少 bun，无法启动 Live2D pet。"
  }

  $Entry = Join-Path $ConfigDir "plugins\live2d-pet\standalone.js"
  if (-not (Test-Path -LiteralPath $Entry -PathType Leaf)) {
    throw "缺少 Live2D pet 独立入口：$Entry`n请先运行：bun run ai:gen -- --force"
  }

  if (-not $AllowBrowserFallback) {
    $ReleaseBinary = if ($IsWindows) {
      Join-Path $ConfigDir "plugins\live2d-pet\src-tauri\target\release\live2d-pet.exe"
    } else {
      Join-Path $ConfigDir "plugins\live2d-pet\src-tauri\target\release\live2d-pet"
    }
    if (-not (Test-Path -LiteralPath $ReleaseBinary -PathType Leaf)) {
      Write-Warning "Live2D pet 已跳过：未找到发布版二进制，且当前启动路径不允许浏览器回退。"
      return
    }
  }

  if ($script:Live2DPetProcess -and -not $script:Live2DPetProcess.HasExited) { return }

  New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
  $StdoutLogFile = Join-Path $ConfigDir "live2d-pet-launcher.out.log"
  $StderrLogFile = Join-Path $ConfigDir "live2d-pet-launcher.err.log"
  $Arguments = @($Entry)
  $PreviousBrowserFallback = $env:AI_SHARE_LIVE2D_BROWSER_FALLBACK
  if (-not $AllowBrowserFallback) {
    $env:AI_SHARE_LIVE2D_BROWSER_FALLBACK = "0"
  }
  try {
    $script:Live2DPetProcess = Start-Process -FilePath "bun" -ArgumentList $Arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput $StdoutLogFile -RedirectStandardError $StderrLogFile
  } finally {
    if ($null -eq $PreviousBrowserFallback) {
      Remove-Item Env:\AI_SHARE_LIVE2D_BROWSER_FALLBACK -ErrorAction SilentlyContinue
    } else {
      $env:AI_SHARE_LIVE2D_BROWSER_FALLBACK = $PreviousBrowserFallback
    }
  }
  Start-Sleep -Seconds 1
  if ($script:Live2DPetProcess.HasExited) {
    if ($script:Live2DPetProcess.ExitCode -eq 0) {
      $script:Live2DPetProcess = $null
      return
    }
    Write-Warning "Live2D pet 未能启动，详情请查看日志：$StdoutLogFile 和 $StderrLogFile"
    $script:Live2DPetProcess = $null
  }
}

function Stop-Live2DPetShared {
  if (-not $script:Live2DPetProcess) { return }

  try {
    if (-not $script:Live2DPetProcess.HasExited) {
      Stop-Process -Id $script:Live2DPetProcess.Id -Force -ErrorAction SilentlyContinue
      Wait-Process -Id $script:Live2DPetProcess.Id -ErrorAction SilentlyContinue
    }
  } catch {}

  $script:Live2DPetProcess = $null
}

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

  $WatchLogDir = Join-Path $ConfigDir (Join-Path "context-guard-watch" "logs")
  New-Item -ItemType Directory -Force -Path $WatchLogDir | Out-Null
  $StdoutLogPath = Join-Path $WatchLogDir "$WatchPid.log"
  $StderrLogPath = Join-Path $WatchLogDir "$WatchPid.err.log"
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
