$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

$Script = Join-Path $PSScriptRoot "aiomx.ts"

if (-not (Get-Command bun -CommandType Application -ErrorAction SilentlyContinue)) {
  Write-Error "缺少 bun，无法启动 Codex + OMX。"
  exit 1
}

if (-not (Test-Path -LiteralPath $Script -PathType Leaf)) {
  Write-Error "缺少 aiomx 启动脚本：$Script`n请先运行：bun run ai:gen -- --force"
  exit 1
}

& bun $Script @args
exit $LASTEXITCODE
