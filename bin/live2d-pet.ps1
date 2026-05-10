$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

$HomeDir = if ($env:HOME) { $env:HOME } elseif ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath("UserProfile") }
$Entry = Join-Path $HomeDir ".config\opencode\plugins\live2d-pet\standalone.js"

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Error "缺少 bun，无法启动 Live2D pet。"
  exit 1
}

if (-not (Test-Path -LiteralPath $Entry -PathType Leaf)) {
  Write-Error "缺少 Live2D pet 独立入口：$Entry`n请先运行：bun run ai:gen -- --force"
  exit 1
}

& bun $Entry @args
exit $LASTEXITCODE
