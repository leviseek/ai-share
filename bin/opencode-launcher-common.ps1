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

function New-OpenCodeActiveConfigDirShared {
  param(
    [string]$ConfigDir,
    [string]$Launcher,
    [string]$ProfileName,
    [string]$OpenCodeProfileConfig,
    [string]$OmoProfileConfig = "",
    [string]$StrategyProfileConfig = "",
    [string]$ContextGuardProfileConfig = ""
  )

  $ActiveDir = Join-Path $ConfigDir (Join-Path ".active" (Join-Path $Launcher (Join-Path $ProfileName ([string]$PID))))
  New-Item -ItemType Directory -Force -Path $ActiveDir | Out-Null

  $OpenCodeContent = Get-Content -LiteralPath $OpenCodeProfileConfig -Raw -Encoding UTF8
  $PluginPrefix = (Join-Path $ConfigDir "plugins").Replace("\", "/").TrimEnd("/") + "/"
  $OpenCodeContent = $OpenCodeContent.Replace('"./plugins/', '"' + $PluginPrefix)
  [System.IO.File]::WriteAllText((Join-Path $ActiveDir "opencode.json"), $OpenCodeContent, $Utf8NoBom)
  if ($OmoProfileConfig -and (Test-Path -LiteralPath $OmoProfileConfig -PathType Leaf)) {
    Copy-Item -LiteralPath $OmoProfileConfig -Destination (Join-Path $ActiveDir "oh-my-openagent.json") -Force
  }
  if ($StrategyProfileConfig -and (Test-Path -LiteralPath $StrategyProfileConfig -PathType Leaf)) {
    Copy-Item -LiteralPath $StrategyProfileConfig -Destination (Join-Path $ActiveDir "strategy.json") -Force
  }
  if ($ContextGuardProfileConfig -and (Test-Path -LiteralPath $ContextGuardProfileConfig -PathType Leaf)) {
    Copy-Item -LiteralPath $ContextGuardProfileConfig -Destination (Join-Path $ActiveDir "context-guard.profile.json") -Force
  }

  $env:OPENCODE_CONFIG = Join-Path $ActiveDir "opencode.json"
  $env:OPENCODE_CONFIG_DIR = $ActiveDir
  return $ActiveDir
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
  $ConfigProfileDir = Split-Path -Parent $ConfigPath
  $StrategyConfig = Join-Path $ConfigProfileDir "strategy.json"
  if (-not (Test-Path -LiteralPath $StrategyConfig -PathType Leaf)) {
    $StrategyConfig = Join-Path $ConfigDir "strategy.json"
  }
  $DbPath = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".local\share\opencode\opencode.db"
  if (-not (Test-Path -LiteralPath $GuardScript -PathType Leaf)) { return }
  if (-not (Test-Path -LiteralPath $StrategyConfig -PathType Leaf)) { return }
  if (-not (Get-Command bun -CommandType Application -ErrorAction SilentlyContinue)) { return }

  $StdoutLogPath = Join-Path $ConfigDir "context-guard-watch-$WatchPid.log"
  $StderrLogPath = Join-Path $ConfigDir "context-guard-watch-$WatchPid.err.log"
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
