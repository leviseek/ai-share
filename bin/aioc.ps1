$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

$OpenCode = Get-Command opencode.exe -CommandType Application -ErrorAction Stop
& $OpenCode.Source --pure @args
exit $LASTEXITCODE
