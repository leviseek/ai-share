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

if ($args.Count -gt 1 -and $args[0] -eq "doctor" -and $args[1] -eq "install") {
  $DoctorScript = Join-Path $PSScriptRoot "opencode-install-doctor.mjs"
  if (-not (Test-Path -LiteralPath $DoctorScript -PathType Leaf)) {
    Write-Error "缺少 install doctor 脚本：$DoctorScript"
    exit 1
  }
  $AiocProfileConfig = Join-Path $ConfigDir "opencode.aioc.$ProfileName.json"
  $OpenCodeActiveConfig = Join-Path $ConfigDir "opencode.json"
  $ContextGuardProfileConfig = Join-Path $ConfigDir "context-guard.$ProfileName.json"
  $ContextGuardActiveProfileConfig = Join-Path $ConfigDir "context-guard.profile.json"
  if (-not (Test-Path -LiteralPath $AiocProfileConfig -PathType Leaf)) {
    Write-Error "缺少 aioc OpenCode 配置级别配置：$AiocProfileConfig"
    Write-Error "请先运行：bun run ai:gen -- --force"
    exit 1
  }
  Copy-Item -LiteralPath $AiocProfileConfig -Destination $OpenCodeActiveConfig -Force
  if (Test-Path -LiteralPath $ContextGuardProfileConfig -PathType Leaf) {
    Copy-Item -LiteralPath $ContextGuardProfileConfig -Destination $ContextGuardActiveProfileConfig -Force
  }
  $Node = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $Node) {
    Write-Error "缺少 node，无法执行 install doctor。"
    exit 1
  }
  & $Node.Source $DoctorScript "aioc" $ProfileName
  exit $LASTEXITCODE
}

$OpenCodeArgs = [System.Collections.Generic.List[string]]::new()

for ($Index = 0; $Index -lt $args.Count; $Index += 1) {
  $Arg = $args[$Index]

  if ($Index -eq 0 -and $AvailableProfiles -contains $Arg) {
    $ProfileName = [string]$Arg
    continue
  }

  if ($Index -eq 0 -and $Arg -eq "--profile") {
    $ProfileName = if ($args.Count -gt 1) { [string]$args[1] } else { "" }
    $Index += 1
    continue
  }

  if ($Index -eq 0 -and $Arg.StartsWith("--profile=")) {
    $ProfileName = $Arg.Substring("--profile=".Length)
    continue
  }

  $OpenCodeArgs.Add($Arg)
}

if ($AvailableProfiles -notcontains $ProfileName) {
  Write-Error "不支持的 aioc 配置级别：$ProfileName"
  Write-Error "可用级别：$($AvailableProfiles -join '、')"
  exit 2
}

$AiocProfileConfig = Join-Path $ConfigDir "opencode.aioc.$ProfileName.json"
$OpenCodeActiveConfig = Join-Path $ConfigDir "opencode.json"
$ContextGuardProfileConfig = Join-Path $ConfigDir "context-guard.$ProfileName.json"
$ContextGuardActiveProfileConfig = Join-Path $ConfigDir "context-guard.profile.json"

if (-not (Test-Path -LiteralPath $AiocProfileConfig -PathType Leaf)) {
  Write-Error "缺少 aioc OpenCode 配置级别配置：$AiocProfileConfig"
  Write-Error "请先运行：bun run ai:gen -- --force"
  exit 1
}

Copy-Item -LiteralPath $AiocProfileConfig -Destination $OpenCodeActiveConfig -Force
if (Test-Path -LiteralPath $ContextGuardProfileConfig -PathType Leaf) {
  Copy-Item -LiteralPath $ContextGuardProfileConfig -Destination $ContextGuardActiveProfileConfig -Force
}

$OpenCode = Get-Command opencode.exe -CommandType Application -ErrorAction Stop
& $OpenCode.Source @($OpenCodeArgs.ToArray())
exit $LASTEXITCODE
