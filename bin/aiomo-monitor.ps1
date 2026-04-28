$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeWindowDrag {
  [DllImport("user32.dll")]
  public static extern bool ReleaseCapture();
  [DllImport("user32.dll")]
  public static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
}
"@

$HomeDir = if ($env:HOME) { $env:HOME } elseif ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath("UserProfile") }
$StatePath = Join-Path $HomeDir ".config\opencode\omo-agent-monitor-state.json"

function Coalesce($value, $fallback) {
  if ($null -eq $value) { return $fallback }
  return $value
}

function Format-Duration([double]$milliseconds) {
  $seconds = [Math]::Max([Math]::Round($milliseconds / 1000), 0)
  if ($seconds -lt 60) { return "${seconds}s" }
  $minutes = [Math]::Floor($seconds / 60)
  return "${minutes}m$(("{0:D2}" -f ([int]($seconds % 60))))s"
}

function Status-Text([string]$status) {
  if ($status -eq "running") { return "运行中" }
  if ($status -eq "retry") { return "重试" }
  if ($status -eq "error") { return "异常" }
  if ($status -eq "idle") { return "空闲" }
  return "未知"
}

function Status-Color([string]$status) {
  if ($status -eq "running") { return [System.Drawing.Color]::FromArgb(59, 130, 246) }
  if ($status -eq "retry") { return [System.Drawing.Color]::FromArgb(245, 158, 11) }
  if ($status -eq "error") { return [System.Drawing.Color]::FromArgb(239, 68, 68) }
  if ($status -eq "idle") { return [System.Drawing.Color]::FromArgb(148, 163, 184) }
  return [System.Drawing.Color]::FromArgb(100, 116, 139)
}

function New-State {
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  return @{
    updatedAt = $now
    session = @{
      status = "idle"
      startedAt = $now
      totalActiveMs = 0
      lastActiveAt = $now
      totalTokens = 0
    }
    todos = @()
    agents = @()
  }
}

function Read-State {
  if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) { return New-State }
  try {
    $json = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 -ErrorAction Stop
    if (-not $json) { return New-State }
    $obj = $json | ConvertFrom-Json -ErrorAction Stop
    return @{
      updatedAt = $obj.updatedAt
      session = @{
        status = $obj.session.status
        startedAt = $obj.session.startedAt
        totalActiveMs = $obj.session.totalActiveMs
        lastActiveAt = $obj.session.lastActiveAt
        totalTokens = $obj.session.totalTokens
      }
      todos = @($obj.todos)
      agents = @($obj.agents)
    }
  } catch {
    return New-State
  }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "OMO Monitor"
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.Location = New-Object System.Drawing.Point(120, 120)
$form.Size = New-Object System.Drawing.Size(760, 480)
$form.BackColor = [System.Drawing.Color]::FromArgb(18, 24, 36)
$form.TopMost = $true

$header = New-Object System.Windows.Forms.Panel
$header.Dock = [System.Windows.Forms.DockStyle]::Top
$header.Height = 44
$header.BackColor = [System.Drawing.Color]::FromArgb(27, 39, 62)
$form.Controls.Add($header)

$title = New-Object System.Windows.Forms.Label
$title.Text = "OMO Monitor · Desktop"
$title.ForeColor = [System.Drawing.Color]::FromArgb(232, 242, 255)
$title.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(14, 10)
$title.AutoSize = $true
$header.Controls.Add($title)

$btnCollapse = New-Object System.Windows.Forms.Button
$btnCollapse.Text = "折叠"
$btnCollapse.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btnCollapse.ForeColor = [System.Drawing.Color]::White
$btnCollapse.BackColor = [System.Drawing.Color]::FromArgb(45, 64, 96)
$btnCollapse.FlatAppearance.BorderSize = 0
$btnCollapse.Size = New-Object System.Drawing.Size(64, 28)
$btnCollapse.Location = New-Object System.Drawing.Point(610, 8)
$header.Controls.Add($btnCollapse)

$btnClose = New-Object System.Windows.Forms.Button
$btnClose.Text = "×"
$btnClose.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btnClose.ForeColor = [System.Drawing.Color]::White
$btnClose.BackColor = [System.Drawing.Color]::FromArgb(130, 45, 55)
$btnClose.FlatAppearance.BorderSize = 0
$btnClose.Size = New-Object System.Drawing.Size(40, 28)
$btnClose.Location = New-Object System.Drawing.Point(684, 8)
$header.Controls.Add($btnClose)

$content = New-Object System.Windows.Forms.Panel
$content.Dock = [System.Windows.Forms.DockStyle]::Fill
$content.Padding = New-Object System.Windows.Forms.Padding(12)
$form.Controls.Add($content)

$baseBar = New-Object System.Windows.Forms.Label
$baseBar.Dock = [System.Windows.Forms.DockStyle]::Top
$baseBar.Height = 30
$baseBar.ForeColor = [System.Drawing.Color]::FromArgb(204, 220, 246)
$baseBar.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$baseBar.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Regular)
$content.Controls.Add($baseBar)

$tokenLabel = New-Object System.Windows.Forms.Label
$tokenLabel.Dock = [System.Windows.Forms.DockStyle]::Top
$tokenLabel.Height = 24
$tokenLabel.ForeColor = [System.Drawing.Color]::FromArgb(222, 238, 255)
$tokenLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$content.Controls.Add($tokenLabel)

$taskProgress = New-Object System.Windows.Forms.ProgressBar
$taskProgress.Dock = [System.Windows.Forms.DockStyle]::Top
$taskProgress.Height = 18
$taskProgress.Maximum = 100
$content.Controls.Add($taskProgress)

$timeProgress = New-Object System.Windows.Forms.ProgressBar
$timeProgress.Dock = [System.Windows.Forms.DockStyle]::Top
$timeProgress.Height = 18
$timeProgress.Maximum = 100
$timeProgress.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous
$content.Controls.Add($timeProgress)

$grid = New-Object System.Windows.Forms.DataGridView
$grid.Dock = [System.Windows.Forms.DockStyle]::Fill
$grid.ReadOnly = $true
$grid.AllowUserToAddRows = $false
$grid.AllowUserToDeleteRows = $false
$grid.AllowUserToResizeRows = $false
$grid.RowHeadersVisible = $false
$grid.AutoSizeColumnsMode = [System.Windows.Forms.DataGridViewAutoSizeColumnsMode]::Fill
$grid.BackgroundColor = [System.Drawing.Color]::FromArgb(24, 30, 42)
$grid.BorderStyle = [System.Windows.Forms.BorderStyle]::None
$grid.ColumnCount = 4
$grid.Columns[0].Name = "状态"
$grid.Columns[1].Name = "Agent"
$grid.Columns[2].Name = "任务次数"
$grid.Columns[3].Name = "平均周期"
$content.Controls.Add($grid)

$footer = New-Object System.Windows.Forms.Label
$footer.Dock = [System.Windows.Forms.DockStyle]::Bottom
$footer.Height = 24
$footer.ForeColor = [System.Drawing.Color]::FromArgb(150, 170, 200)
$footer.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$content.Controls.Add($footer)

function Start-DragWindow {
  param([System.Windows.Forms.MouseEventArgs]$event)
  if ($event.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
  [void][NativeWindowDrag]::ReleaseCapture()
  # WM_NCLBUTTONDOWN=0xA1, HTCAPTION=0x2
  [void][NativeWindowDrag]::SendMessage($form.Handle, 0xA1, [IntPtr]2, [IntPtr]::Zero)
}

$header.Add_MouseDown({ param($sender, $event) Start-DragWindow $event })
$title.Add_MouseDown({ param($sender, $event) Start-DragWindow $event })
$btnClose.Add_Click({ $form.Close() })

$expanded = $true
$expandedHeight = 480
$collapsedHeight = 90

$btnCollapse.Add_Click({
  $script:expanded = -not $script:expanded
  if ($script:expanded) {
    $content.Visible = $true
    $form.Height = $script:expandedHeight
    $btnCollapse.Text = "折叠"
  } else {
    $content.Visible = $false
    $form.Height = $script:collapsedHeight
    $btnCollapse.Text = "展开"
  }
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick({
  $state = Read-State
  $session = $state.session
  $todos = @($state.todos)
  $agents = @($state.agents)

  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $startedAt = [double](Coalesce $session.startedAt $now)
  $lastActiveAt = [double](Coalesce $session.lastActiveAt $startedAt)
  $activeMs = [Math]::Max([double](Coalesce $session.totalActiveMs 0), 0)
  $elapsedMs = [Math]::Max($now - $startedAt, 0)
  $idleMs = [Math]::Max($now - $lastActiveAt, 0)
  $activePct = if ($elapsedMs -gt 0) { [int][Math]::Min([Math]::Max([Math]::Round(($activeMs / $elapsedMs) * 100), 0), 100) } else { 0 }

  $done = @($todos | Where-Object { $_.status -eq "completed" }).Count
  $pending = @($todos | Where-Object { $_.status -eq "pending" }).Count
  $inProgress = @($todos | Where-Object { $_.status -eq "in_progress" })
  $taskPct = if ($todos.Count -gt 0) { [int][Math]::Round(($done / $todos.Count) * 100) } else { 0 }

  $baseBar.Text = "任务进度 $done/$($todos.Count) ($taskPct%)   |   状态 $(Status-Text $session.status)   |   空闲 $(Format-Duration $idleMs)"
  $tokenLabel.Text = "总消耗 Token: $(Coalesce $session.totalTokens 0)   ·   已执行: $(Format-Duration $activeMs)"
  $taskProgress.Value = [Math]::Min([Math]::Max($taskPct, 0), 100)
  $timeProgress.Value = $activePct
  $footer.Text = if ($inProgress.Count -gt 0) { "进行中: $($inProgress[0].content)" } else { "进行中: 无 · 待处理: $pending" }

  $grid.Rows.Clear()
  $ordered = $agents | Sort-Object @{ Expression = {
      switch ($_.status) {
        "running" { 0 }
        "retry" { 1 }
        "error" { 2 }
        "idle" { 3 }
        default { 4 }
      }
    } }, @{ Expression = { -1 * [int](Coalesce $_.executed 0) } }, @{ Expression = { [string]$_.name } }

  foreach ($agent in $ordered) {
    $executed = [int](Coalesce $agent.executed 0)
    $totalMs = [double](Coalesce $agent.totalMs 0)
    $avgMs = if ($executed -gt 0) { [Math]::Round($totalMs / $executed) } else { 0 }
    $rowIndex = $grid.Rows.Add((Status-Text $agent.status), [string]$agent.name, [string]$executed, (Format-Duration $avgMs))
    $grid.Rows[$rowIndex].Cells[0].Style.ForeColor = Status-Color $agent.status
  }
})

$timer.Start()
[void]$form.ShowDialog()
