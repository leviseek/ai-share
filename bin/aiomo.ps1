$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

function U($Codes) {
  return -join ($Codes | ForEach-Object { [char]$_ })
}

function Show-Help {
  Write-Output (U @(29992, 27861, 65306, 97, 105, 111, 109, 111, 32, 91, 32534, 25490, 32423, 21035, 93, 32, 91, 111, 112, 101, 110, 99, 111, 100, 101, 32, 21442, 25968, 46, 46, 46, 93))
  Write-Output (U @(32, 32, 32, 32, 32, 32, 97, 105, 111, 109, 111, 32, 45, 45, 111, 109, 111, 45, 112, 114, 111, 102, 105, 108, 101, 61, 60, 32534, 25490, 32423, 21035, 62, 32, 91, 111, 112, 101, 110, 99, 111, 100, 101, 32, 21442, 25968, 46, 46, 46, 93))
  Write-Output (U @(32, 32, 32, 32, 32, 32, 97, 105, 111, 109, 111, 32, 45, 45, 111, 109, 111, 45, 112, 114, 111, 102, 105, 108, 101, 32, 60, 32534, 25490, 32423, 21035, 62, 32, 91, 111, 112, 101, 110, 99, 111, 100, 101, 32, 21442, 25968, 46, 46, 46, 93))
  Write-Output ""
  Write-Output (U @(35828, 26126, 65306, 21551, 21160, 32, 111, 104, 45, 109, 121, 45, 111, 112, 101, 110, 97, 103, 101, 110, 116, 32, 22810, 32, 97, 103, 101, 110, 116, 115, 32, 32534, 25490, 27169, 24335, 65292, 24182, 22312, 21551, 21160, 21069, 20999, 25442, 23545, 24212, 32, 79, 77, 79, 32, 37197, 32622, 12290))
  Write-Output ((U @(40664, 35748, 32423, 21035, 65306)) + $ProfileName)
  Write-Output ((U @(21487, 29992, 32423, 21035, 65306)) + ($AvailableProfiles -join (U @(12289))))
  Write-Output ""
  Write-Output (U @(31034, 20363, 65306))
  Write-Output "  aiomo"
  Write-Output "  aiomo coding"
  Write-Output (U @(32, 32, 97, 105, 111, 109, 111, 32, 45, 45, 111, 109, 111, 45, 112, 114, 111, 102, 105, 108, 101, 61, 114, 101, 115, 101, 97, 114, 99, 104, 32, 114, 117, 110, 32, 34, 35831, 20998, 26512, 24403, 21069, 39033, 30446, 34))
  Write-Output "  aiomo -h"
}

function Test-SessionTokenOverflow {
  param([string[]]$ArgsList, [string]$ConfigPath)

  $sid = $null
  for ($i = 0; $i -lt $ArgsList.Count - 1; $i++) {
    $a = $ArgsList[$i]
    if ($a -eq "-s" -or $a -eq "--resume") { $sid = $ArgsList[$i + 1]; break }
  }
  if (-not $sid) { return $false }

  Write-Host (U @(91, 67, 72, 69, 67, 75, 93, 32, 27491, 22312, 26816, 26597, 26087, 20250, 35805, 19978, 19979, 25991, 38271, 24230, 46, 46, 46)) -ForegroundColor Cyan

  if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
    Write-Host (U @(32, 32, 19981, 33021, 35835, 21462, 37197, 32622, 65306))$ConfigPath -ForegroundColor DarkYellow
    return $false
  }

  $max = 120000
  try {
    $j = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    if ($j.compaction.max_input_tokens) { $max = [int]$j.compaction.max_input_tokens }
  } catch {
    Write-Host (U @(32, 32, 35835, 21462, 37197, 32622, 22833, 36133)) -ForegroundColor DarkYellow
    return $false
  }

  $db = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".local\share\opencode\opencode.db"
  if (-not (Test-Path -LiteralPath $db -PathType Leaf)) {
    Write-Host (U @(32, 32, 26410, 25214, 21040, 32, 83, 81, 76, 105, 116, 101, 32, 25968, 25454, 24211)) -ForegroundColor DarkYellow
    return $false
  }

  $hasBun = Get-Command bun -CommandType Application -ErrorAction SilentlyContinue
  if (-not $hasBun) {
    Write-Host (U @(32, 32, 26410, 25214, 21040, 32, 98, 117, 110, 65292, 36339, 36807, 26816, 26597)) -ForegroundColor DarkYellow
    return $false
  }

  $tokens = 0
  $tmp = Join-Path ([IO.Path]::GetTempPath()) "aiomo_guard_${PID}.mjs"
  try {
    Set-Content -LiteralPath $tmp -Value @'
const { Database } = require("bun:sqlite");
const [dbPath, sid] = process.argv.slice(2);
const db = new Database(dbPath, { readonly: true });
try {
  const row = db.query("select json_extract(data, '$.tokens.input') as v from message where session_id = ? and json_extract(data, '$.role') = 'assistant' order by time_created desc limit 1").get(sid);
  console.log((row && row.v) ? row.v : 0);
} catch (_) { console.log(0); }
'@ -Encoding UTF8
    $raw = ((& bun $tmp $db $sid 2>&1) | Out-String).Trim()
    $tokens = [Math]::Max(0, [int]($raw -replace '[^0-9]', '0'))
  } catch {
    Write-Host (U @(32, 32, 26597, 35810, 32, 83, 81, 76, 105, 116, 101, 32, 22833, 36133, 32))$($_.Exception.Message) -ForegroundColor DarkYellow
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }

  if ($tokens -le 0) {
    Write-Host (U @(32, 32, 26410, 33021, 33719, 21462, 20250, 35805, 32, 116, 111, 107, 101, 110, 65292, 36339, 36807, 26816, 26597)) -ForegroundColor DarkYellow
    return $false
  }

  if ($tokens -le $max) {
    Write-Host (U @(32, 32, 20250, 35805, 36755, 20837, 32, 116, 111, 107, 101, 110, 32422, 32)) -ForegroundColor Cyan -NoNewline
    Write-Host "$tokens" -ForegroundColor Cyan -NoNewline
    Write-Host (U @(32, 26410, 36229, 38480, 65292, 21487, 27491, 24120, 24674, 22797)) -ForegroundColor Cyan
    return $false
  }

  Write-Host ""
  Write-Host (U @(9888, 32, 26087, 20250, 35805, 19978, 19979, 25991, 36807, 38271, 65292, 26368, 36817, 36755, 20837, 32, 116, 111, 107, 101, 110, 32422, 32)) -ForegroundColor Yellow -NoNewline
  Write-Host "$tokens" -ForegroundColor Yellow -NoNewline
  Write-Host (U @(32, 65292, 36229, 36807, 32, 109, 97, 120, 95, 105, 110, 112, 117, 116, 95, 116, 111, 107, 101, 110, 115, 61)) -ForegroundColor Yellow -NoNewline
  Write-Host "$max" -ForegroundColor Yellow
  Write-Host (U @(32, 32, 24314, 35758, 26032, 24320, 32, 97, 105, 111, 109, 111, 32, 25110, 20808, 23545, 26087, 20250, 35805, 25191, 34892, 31616, 35201, 20043, 31867, 30340, 21387, 32553, 21518, 20877, 24674, 22797, 12290)) -ForegroundColor Yellow
  Write-Host (U @(32, 32, 24674, 22797, 21518, 21487, 22312, 20250, 35805, 20013, 25191, 34892, 32, 47, 99, 111, 109, 112, 97, 99, 116, 32, 21629, 20196, 21387, 32553, 19978, 19979, 25991, 12290)) -ForegroundColor Yellow
  Write-Host (U @(32, 32, 36755, 20837, 32, 69, 110, 116, 101, 114, 32, 24378, 34892, 24674, 22797, 65292, 25110, 32, 67, 116, 114, 108, 43, 67, 32, 21462, 28040, 12290)) -ForegroundColor Yellow
  Write-Host ""
  try {
    $key = [Console]::ReadKey($true)
    if ($key.Modifiers -eq [ConsoleModifiers]::Control -and $key.Key -eq 'C') { exit 0 }
  } catch {
    Start-Sleep -Seconds 3
  }
  return $true
}

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

if ($args.Count -gt 0 -and ($args[0] -eq "-h" -or $args[0] -eq "--help")) {
  Show-Help
  exit 0
}

$OpenCodeArgs = [System.Collections.Generic.List[string]]::new()

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

  $OpenCodeArgs.Add($Arg)
}

if ($AvailableProfiles -notcontains $ProfileName) {
  Write-Error ((U @(19981, 25903, 25345, 30340, 32, 79, 77, 79, 32, 32534, 25490, 32423, 21035, 65306)) + $ProfileName)
  Write-Error ((U @(21487, 29992, 32423, 21035, 65306)) + ($AvailableProfiles -join (U @(12289))))
  exit 2
}

$OpenCodeProfileConfig = Join-Path $ConfigDir "opencode.$ProfileName.json"
$OpenCodeActiveConfig = Join-Path $ConfigDir "opencode.json"
$OmoProfileConfig = Join-Path $ConfigDir "oh-my-openagent.$ProfileName.json"
$OmoActiveConfig = Join-Path $ConfigDir "oh-my-openagent.json"

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

Copy-Item -LiteralPath $OpenCodeProfileConfig -Destination $OpenCodeActiveConfig -Force
Copy-Item -LiteralPath $OmoProfileConfig -Destination $OmoActiveConfig -Force
$null = Test-SessionTokenOverflow $OpenCodeArgs.ToArray() $OpenCodeProfileConfig
$OpenCode = Get-Command opencode.exe -CommandType Application -ErrorAction Stop
& $OpenCode.Source @OpenCodeArgs
exit $LASTEXITCODE
