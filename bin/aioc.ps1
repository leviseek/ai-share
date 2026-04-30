$OpenCode = Get-Command opencode.exe -CommandType Application -ErrorAction Stop
& $OpenCode.Source --pure @args
exit $LASTEXITCODE
