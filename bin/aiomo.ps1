. (Join-Path $PSScriptRoot "opencode-launcher-common.ps1")

function U($Codes) {
  return -join ($Codes | ForEach-Object { [char]$_ })
}

function Show-Help {
  Write-Output "用法："
  Write-Output "  aiomo [profile] [opencode args...]"
  Write-Output "  aiomo --omo-profile=<profile> [opencode args...]"
  Write-Output "  aiomo [profile] --relay <session-id>"
  Write-Output "  aiomo doctor gitignore [--apply]"
  Write-Output "  aiomo doctor install"
  Write-Output "  aiomo rescue <session-id>"
  Write-Output "  aiomo [profile] -h"
  Write-Output ""
  Write-Output (U @(35828, 26126, 65306, 21551, 21160, 32, 111, 104, 45, 109, 121, 45, 111, 112, 101, 110, 97, 103, 101, 110, 116, 32, 22810, 32, 97, 103, 101, 110, 116, 115, 32, 32534, 25490, 27169, 24335, 65292, 24182, 22312, 21551, 21160, 21069, 20999, 25442, 23545, 24212, 32, 79, 77, 79, 32, 37197, 32622, 12290))
  Write-Output ((U @(40664, 35748, 32423, 21035, 65306)) + $ProfileName)
  Write-Output ((U @(21487, 29992, 32423, 21035, 65306)) + ($AvailableProfiles -join (U @(12289))))
  Write-Output ""
  Write-Output "参数："
  Write-Output "  --relay <session-id>       从旧/卡住的 session 生成交接文件，并新开干净会话继续。"
  Write-Output "  --continue-from <id>       --relay 的别名。"
  Write-Output "  --handoff <id>             --relay 的别名。"
  Write-Output "  doctor gitignore [--apply] 检查 .gitignore 缺失规则；加 --apply 自动追加。"
  Write-Output "  doctor install            检查共享配置、插件、skills 和 TUI 插件是否安装并可见。"
  Write-Output "  rescue <session-id>        只生成 rescue 摘要，不启动 OpenCode。"
  Write-Output "  -h, --help                 显示帮助。"
  Write-Output ""
  Write-Output "接力行为："
  Write-Output "  - 不恢复旧聊天历史。"
  Write-Output "  - 写入 .opencode/handoff/<session-id>.md 和 .opencode-rescue/<session-id>.md。"
  Write-Output "  - 新开干净的 OpenCode TUI，并注入从 handoff 继续的提示。"
  Write-Output "  - handoff 会包含共享 workspace.ignore 规则。"
  Write-Output ""
  Write-Output "示例："
  Write-Output "  aiomo"
  Write-Output "  aiomo coding"
  Write-Output "  aiomo coding --relay ses_abc123"
  Write-Output "  aiomo max --relay ses_abc123"
  Write-Output "  aiomo doctor gitignore"
  Write-Output "  aiomo doctor gitignore --apply"
  Write-Output "  aiomo rescue ses_abc123"
  Write-Output "  aiomo -h"
}

function Show-DoctorGitignoreHelp {
  Write-Output "用法："
  Write-Output "  aiomo doctor gitignore"
  Write-Output "  aiomo doctor gitignore --apply"
  Write-Output ""
  Write-Output "说明："
  Write-Output "  在当前 Git 仓库检查 .gitignore 缺失规则。"
  Write-Output "  默认只输出建议，不修改文件；加 --apply 会把缺失规则追加到 .gitignore。"
}

function Invoke-GitignoreDoctor {
  param([bool]$Apply = $false)
  $script:AiomoDoctorExitCode = 0

  $IsGitRepo = $false
  try {
    $Result = (& git rev-parse --is-inside-work-tree 2>$null)
    $IsGitRepo = ($LASTEXITCODE -eq 0 -and "$Result".Trim() -eq "true")
  } catch {}

  if (-not $IsGitRepo) {
    Write-Error "当前目录不是 Git 仓库，无法执行 doctor gitignore。"
    $script:AiomoDoctorExitCode = 2
    return
  }

  $GitignorePath = Join-Path (Get-Location).Path ".gitignore"
  $ExistingLines = @()
  if (Test-Path -LiteralPath $GitignorePath -PathType Leaf) {
    $ExistingLines = @((Get-Content -LiteralPath $GitignorePath -Encoding UTF8) | ForEach-Object { [string]$_ })
  }
  $ExistingSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($Line in $ExistingLines) {
    $Norm = $Line.Trim()
    if ($Norm -and -not $Norm.StartsWith("#")) { [void]$ExistingSet.Add($Norm) }
  }

  $Rules = [System.Collections.Generic.List[string]]::new()
  foreach ($Rule in @(
    ".opencode/context-guard-alert.json",
    ".opencode/context-guard-history/",
    ".opencode/handoff/",
    ".opencode/checkpoints/",
    ".opencode/dcp/",
    ".opencode/memory/",
    ".opencode-rescue/",
    ".sisyphus/evidence/",
    ".env",
    ".env.*"
  )) { $Rules.Add($Rule) }

  $IsNodeProject = (Test-Path "package.json" -PathType Leaf) -or (Test-Path "bun.lock" -PathType Leaf) -or (Test-Path "pnpm-lock.yaml" -PathType Leaf) -or (Test-Path "yarn.lock" -PathType Leaf)
  if ($IsNodeProject) {
    foreach ($Rule in @("node_modules/", "dist/", "build/", ".next/", ".nuxt/", ".svelte-kit/", "coverage/", ".turbo/", ".vite/")) { $Rules.Add($Rule) }
  }
  $IsPythonProject = (Test-Path "pyproject.toml" -PathType Leaf) -or (Test-Path "requirements.txt" -PathType Leaf) -or (Test-Path ".python-version" -PathType Leaf)
  if ($IsPythonProject) {
    foreach ($Rule in @(".venv/", "venv/", "__pycache__/", "*.pyc", ".pytest_cache/", ".mypy_cache/")) { $Rules.Add($Rule) }
  }
  if (Test-Path "Cargo.toml" -PathType Leaf) {
    foreach ($Rule in @("target/")) { $Rules.Add($Rule) }
  }
  if (Test-Path "go.mod" -PathType Leaf) {
    foreach ($Rule in @("bin/", ".coverprofile")) { $Rules.Add($Rule) }
  }
  $IsJvmProject = (Test-Path "pom.xml" -PathType Leaf) -or (Test-Path "build.gradle" -PathType Leaf) -or (Test-Path "build.gradle.kts" -PathType Leaf)
  if ($IsJvmProject) {
    foreach ($Rule in @("target/", ".gradle/", "out/")) { $Rules.Add($Rule) }
  }

  $UniqueRules = [System.Collections.Generic.List[string]]::new()
  $Seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($Rule in $Rules) {
    if ($Seen.Add($Rule)) { $UniqueRules.Add($Rule) }
  }

  $Missing = [System.Collections.Generic.List[string]]::new()
  foreach ($Rule in $UniqueRules) {
    if (-not $ExistingSet.Contains($Rule)) { $Missing.Add($Rule) }
  }

  if ($Missing.Count -eq 0) {
    Write-Output "gitignore doctor：未发现缺失规则。"
    return
  }

  Write-Output "gitignore doctor：发现缺失规则："
  foreach ($Rule in $Missing) { Write-Output "  - $Rule" }

  if (-not $Apply) {
    Write-Output ""
    Write-Output "仅建议模式（未修改）。如需写入请运行：aiomo doctor gitignore --apply"
    return
  }

  $Append = [System.Collections.Generic.List[string]]::new()
  if (Test-Path -LiteralPath $GitignorePath -PathType Leaf) {
    $Last = if ($ExistingLines.Count -gt 0) { [string]$ExistingLines[$ExistingLines.Count - 1] } else { "" }
    if ($Last.Trim().Length -gt 0) { $Append.Add("") }
  }
  $Append.Add("# aiomo doctor gitignore")
  foreach ($Rule in $Missing) { $Append.Add($Rule) }
  Add-Content -LiteralPath $GitignorePath -Value $Append -Encoding UTF8
  Write-Output "已追加到 .gitignore：$GitignorePath"
}

function Show-RelayHelp {
  Write-Output "用法："
  Write-Output "  aiomo [profile] --relay <session-id>"
  Write-Output "  aiomo [profile] --relay=<session-id>"
  Write-Output ""
  Write-Output "说明："
  Write-Output "  从旧的或卡住的 session 生成 handoff，并启动一个干净 aiomo 会话继续。"
  Write-Output "  这不会恢复旧聊天历史。"
  Write-Output ""
  Write-Output "会执行："
  Write-Output "  - 写入 .opencode/handoff/<session-id>.md"
  Write-Output "  - 写入 .opencode-rescue/<session-id>.md"
  Write-Output "  - 启动新的 OpenCode TUI 会话"
  Write-Output "  - 注入从 handoff 继续的提示"
  Write-Output "  - 带上共享 workspace.ignore 规则"
  Write-Output ""
  Write-Output "示例："
  Write-Output "  aiomo coding --relay ses_abc123"
  Write-Output "  aiomo max --relay ses_abc123"
  Write-Output "  aiomo --relay ses_abc123"
  Write-Output ""
  Write-Output "别名："
  Write-Output "  --continue-from <session-id>"
  Write-Output "  --handoff <session-id>"
}


$ConfigDir = Join-Path $env:USERPROFILE ".config\opencode"
Set-OpenCodeProxyEnvShared $ConfigDir
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

if ($args.Count -gt 1 -and $args[0] -eq "doctor" -and $args[1] -eq "gitignore") {
  if ($args.Count -gt 2 -and ($args[2] -eq "-h" -or $args[2] -eq "--help")) {
    Show-DoctorGitignoreHelp
    exit 0
  }
  $Apply = $args -contains "--apply"
  Invoke-GitignoreDoctor -Apply:$Apply
  exit $script:AiomoDoctorExitCode
}

if ($args.Count -gt 1 -and $args[0] -eq "doctor" -and $args[1] -eq "install") {
  $DoctorScript = Join-Path $PSScriptRoot "opencode-install-doctor.ts"
  if (-not (Test-Path -LiteralPath $DoctorScript -PathType Leaf)) {
    Write-Error "缺少 install doctor 脚本：$DoctorScript"
    exit 1
  }
  $OpenCodeProfileConfig = Join-Path $ConfigDir "profiles\opencode\$ProfileName.json"
  $OmoProfileConfig = Join-Path $ConfigDir "profiles\oh-my-openagent\$ProfileName.json"
  $StrategyProfileConfig = Join-Path $ConfigDir "profiles\strategy\$ProfileName.json"
  $ContextGuardProfileConfig = Join-Path $ConfigDir "profiles\context-guard\$ProfileName.json"
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
  New-OpenCodeActiveConfigDirShared $ConfigDir "aiomo" $ProfileName $OpenCodeProfileConfig $OmoProfileConfig $StrategyProfileConfig $ContextGuardProfileConfig | Out-Null
  $Bun = Get-Command bun -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $Bun) {
    Write-Error "缺少 bun，无法执行 install doctor。"
    exit 1
  }
  & $Bun.Source $DoctorScript "aiomo" $ProfileName
  exit $LASTEXITCODE
}

if ($args.Count -gt 1 -and $AvailableProfiles -contains $args[0] -and ($args[1] -eq "-h" -or $args[1] -eq "--help")) {
  $ProfileName = [string]$args[0]
  Show-Help
  exit 0
}

if ($args.Count -gt 1 -and ($args[0] -eq "--relay" -or $args[0] -eq "--continue-from" -or $args[0] -eq "--handoff") -and ($args[1] -eq "-h" -or $args[1] -eq "--help")) {
  Show-RelayHelp
  exit 0
}

if ($args.Count -gt 2 -and $AvailableProfiles -contains $args[0] -and ($args[1] -eq "--relay" -or $args[1] -eq "--continue-from" -or $args[1] -eq "--handoff") -and ($args[2] -eq "-h" -or $args[2] -eq "--help")) {
  $ProfileName = [string]$args[0]
  Show-RelayHelp
  exit 0
}

if ($args.Count -gt 1 -and $args[0] -eq "rescue") {
  $Code = Invoke-ContextGuardShared "rescue" "aiomo" $ConfigDir "" @($args[1])
  exit $Code
}

$OpenCodeArgs = [System.Collections.Generic.List[string]]::new()
$ContinueFromSession = ""

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

  if ($Arg -eq "--relay" -or $Arg -eq "--continue-from" -or $Arg -eq "--handoff") {
    $ContinueFromSession = if ($args.Count -gt ($Index + 1)) { [string]$args[$Index + 1] } else { "" }
    $Index += 1
    continue
  }

  if ($Arg.StartsWith("--relay=")) {
    $ContinueFromSession = $Arg.Substring("--relay=".Length)
    continue
  }

  if ($Arg.StartsWith("--continue-from=")) {
    $ContinueFromSession = $Arg.Substring("--continue-from=".Length)
    continue
  }

  if ($Arg.StartsWith("--handoff=")) {
    $ContinueFromSession = $Arg.Substring("--handoff=".Length)
    continue
  }

  $OpenCodeArgs.Add($Arg)
}

if ($AvailableProfiles -notcontains $ProfileName) {
  Write-Error ((U @(19981, 25903, 25345, 30340, 32, 79, 77, 79, 32, 32534, 25490, 32423, 21035, 65306)) + $ProfileName)
  Write-Error ((U @(21487, 29992, 32423, 21035, 65306)) + ($AvailableProfiles -join (U @(12289))))
  exit 2
}

$OpenCodeProfileConfig = Join-Path $ConfigDir "profiles\opencode\$ProfileName.json"
$OmoProfileConfig = Join-Path $ConfigDir "profiles\oh-my-openagent\$ProfileName.json"
$StrategyProfileConfig = Join-Path $ConfigDir "profiles\strategy\$ProfileName.json"
$ContextGuardProfileConfig = Join-Path $ConfigDir "profiles\context-guard\$ProfileName.json"

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

$ActiveConfigDir = New-OpenCodeActiveConfigDirShared $ConfigDir "aiomo" $ProfileName $OpenCodeProfileConfig $OmoProfileConfig $StrategyProfileConfig $ContextGuardProfileConfig
$WorkingDirectory = (Get-Location).Path
if ($ContinueFromSession) {
  $HandoffPath = New-ContextGuardHandoffShared "aiomo" $ConfigDir $ContinueFromSession $WorkingDirectory
  if (-not $HandoffPath) {
    Write-Error "无法生成 handoff：$ContinueFromSession"
    exit 1
  }
  $Prompt = "请读取 handoff 文件 $HandoffPath，并按其中 Continue Instruction 继续。不要恢复旧 session，不要运行 /start-work。"
  $OpenCodeArgs.Add("--prompt")
  $OpenCodeArgs.Add($Prompt)
}
$ActiveContextGuardConfig = Join-Path $ActiveConfigDir "context-guard.profile.json"
$ActiveOpenCodeConfig = Join-Path $ActiveConfigDir "opencode.json"
$GuardConfigPath = if (Test-Path -LiteralPath $ActiveContextGuardConfig -PathType Leaf) { $ActiveContextGuardConfig } else { $ActiveOpenCodeConfig }
$GuardExit = Invoke-ContextGuardShared "check" "aiomo" $ConfigDir $GuardConfigPath $OpenCodeArgs.ToArray()
if ($GuardExit -eq 10) { exit 10 }
$OpenCode = Get-Command opencode.exe -CommandType Application -ErrorAction Stop
$OpenCodeStartInfo = [System.Diagnostics.ProcessStartInfo]::new()
$OpenCodeStartInfo.FileName = $OpenCode.Source
$OpenCodeStartInfo.UseShellExecute = $false
foreach ($Arg in $OpenCodeArgs) { [void]$OpenCodeStartInfo.ArgumentList.Add($Arg) }
$OpenCodeProcess = [System.Diagnostics.Process]::Start($OpenCodeStartInfo)
Start-ContextGuardWatchShared "aiomo" $ConfigDir $GuardConfigPath $WorkingDirectory $OpenCodeProcess.Id
$OpenCodeProcess.WaitForExit()
exit $OpenCodeProcess.ExitCode
