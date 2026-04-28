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

$LastGoodState = New-State

function Read-State {
  if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) { return $script:LastGoodState }
  try {
    $json = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 -ErrorAction Stop
    if (-not $json) { return $script:LastGoodState }
    $obj = $json | ConvertFrom-Json -ErrorAction Stop
    $state = @{
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
    $script:LastGoodState = $state
    return $state
  } catch {
    return $script:LastGoodState
  }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "OMO Monitor"
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::SizableToolWindow
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.Location = New-Object System.Drawing.Point(120, 120)
$form.Size = New-Object System.Drawing.Size(860, 560)
$form.MinimumSize = New-Object System.Drawing.Size(660, 360)
$form.BackColor = [System.Drawing.Color]::FromArgb(28, 30, 34)
$form.TopMost = $true

$header = New-Object System.Windows.Forms.Panel
$header.Dock = [System.Windows.Forms.DockStyle]::Top
$header.Height = 54
$header.BackColor = [System.Drawing.Color]::FromArgb(72, 74, 78)
$header.Add_Paint({
  param($sender, $event)
  $rect = $sender.ClientRectangle
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(92, 95, 100), [System.Drawing.Color]::FromArgb(56, 58, 62), 90)
  $event.Graphics.FillRectangle($brush, $rect)
  $brush.Dispose()
  $penTop = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 190, 200))
  $event.Graphics.DrawLine($penTop, 0, 0, $rect.Width, 0)
  $penTop.Dispose()
})
$form.Controls.Add($header)

$title = New-Object System.Windows.Forms.Label
$title.Text = "OMO Monitor · Desktop"
$title.ForeColor = [System.Drawing.Color]::FromArgb(245, 248, 252)
$title.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(14, 6)
$title.AutoSize = $true
$header.Controls.Add($title)

$headerInfo = New-Object System.Windows.Forms.Label
$headerInfo.Text = "初始化中..."
$headerInfo.ForeColor = [System.Drawing.Color]::FromArgb(220, 228, 238)
$headerInfo.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Regular)
$headerInfo.Location = New-Object System.Drawing.Point(14, 29)
$headerInfo.AutoSize = $true
$header.Controls.Add($headerInfo)

$btnCollapse = New-Object System.Windows.Forms.Button
$btnCollapse.Text = "折叠"
$btnCollapse.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btnCollapse.ForeColor = [System.Drawing.Color]::White
$btnCollapse.BackColor = [System.Drawing.Color]::FromArgb(104, 109, 118)
$btnCollapse.FlatAppearance.BorderSize = 0
$btnCollapse.Size = New-Object System.Drawing.Size(64, 28)
$btnCollapse.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Right
$btnCollapse.Location = New-Object System.Drawing.Point(($form.ClientSize.Width - 138), 12)
$header.Controls.Add($btnCollapse)

$btnClose = New-Object System.Windows.Forms.Button
$btnClose.Text = "×"
$btnClose.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btnClose.ForeColor = [System.Drawing.Color]::White
$btnClose.BackColor = [System.Drawing.Color]::FromArgb(130, 66, 70)
$btnClose.FlatAppearance.BorderSize = 0
$btnClose.Size = New-Object System.Drawing.Size(40, 28)
$btnClose.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Right
$btnClose.Location = New-Object System.Drawing.Point(($form.ClientSize.Width - 66), 12)
$header.Controls.Add($btnClose)

$content = New-Object System.Windows.Forms.Panel
$content.Dock = [System.Windows.Forms.DockStyle]::Fill
$content.Padding = New-Object System.Windows.Forms.Padding(10, 62, 10, 10)
$content.BackColor = [System.Drawing.Color]::FromArgb(40, 42, 46)
$form.Controls.Add($content)

$layout = New-Object System.Windows.Forms.TableLayoutPanel
$layout.Dock = [System.Windows.Forms.DockStyle]::Fill
$layout.ColumnCount = 1
$layout.RowCount = 8
$layout.BackColor = [System.Drawing.Color]::Transparent
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 34)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 30)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 32)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 32)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 28)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 24)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Percent, 100)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 28)))
$content.Controls.Add($layout)

$baseBar = New-Object System.Windows.Forms.Label
$baseBar.Dock = [System.Windows.Forms.DockStyle]::Fill
$baseBar.ForeColor = [System.Drawing.Color]::FromArgb(230, 236, 244)
$baseBar.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$baseBar.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Regular)
$layout.Controls.Add($baseBar, 0, 0)

$tokenLabel = New-Object System.Windows.Forms.Label
$tokenLabel.Dock = [System.Windows.Forms.DockStyle]::Fill
$tokenLabel.ForeColor = [System.Drawing.Color]::FromArgb(245, 248, 252)
$tokenLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$layout.Controls.Add($tokenLabel, 0, 1)

$taskTitle = New-Object System.Windows.Forms.Label
$taskTitle.Text = "任务进度"
$taskTitle.Dock = [System.Windows.Forms.DockStyle]::Fill
$taskTitle.ForeColor = [System.Drawing.Color]::FromArgb(210, 220, 232)
$taskTitle.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Regular)
$taskTitle.TextAlign = [System.Drawing.ContentAlignment]::BottomLeft
$layout.Controls.Add($taskTitle, 0, 2)

$taskProgress = New-Object System.Windows.Forms.ProgressBar
$taskProgress.Dock = [System.Windows.Forms.DockStyle]::Fill
$taskProgress.Maximum = 100
$taskProgress.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous
$taskProgress.ForeColor = [System.Drawing.Color]::FromArgb(214, 167, 76)
$layout.Controls.Add($taskProgress, 0, 3)

$timeLabel = New-Object System.Windows.Forms.Label
$timeLabel.Text = "执行/空闲占比"
$timeLabel.Dock = [System.Windows.Forms.DockStyle]::Fill
$timeLabel.ForeColor = [System.Drawing.Color]::FromArgb(210, 220, 232)
$timeLabel.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Regular)
$timeLabel.TextAlign = [System.Drawing.ContentAlignment]::BottomLeft
$layout.Controls.Add($timeLabel, 0, 4)

$timeProgress = New-Object System.Windows.Forms.ProgressBar
$timeProgress.Dock = [System.Windows.Forms.DockStyle]::Top
$timeProgress.Height = 18
$timeProgress.Maximum = 100
$timeProgress.Style = [System.Windows.Forms.ProgressBarStyle]::Continuous
$timeProgress.ForeColor = [System.Drawing.Color]::FromArgb(164, 173, 187)
$layout.Controls.Add($timeProgress, 0, 5)

$grid = New-Object System.Windows.Forms.DataGridView
$grid.Dock = [System.Windows.Forms.DockStyle]::Fill
$grid.ReadOnly = $true
$grid.AllowUserToAddRows = $false
$grid.AllowUserToDeleteRows = $false
$grid.AllowUserToResizeRows = $false
$grid.AllowUserToOrderColumns = $false
$grid.AllowUserToResizeColumns = $false
$grid.RowHeadersVisible = $false
$grid.AutoSizeColumnsMode = [System.Windows.Forms.DataGridViewAutoSizeColumnsMode]::None
$grid.BackgroundColor = [System.Drawing.Color]::FromArgb(49, 52, 57)
$grid.BorderStyle = [System.Windows.Forms.BorderStyle]::None
$grid.GridColor = [System.Drawing.Color]::FromArgb(85, 88, 94)
$grid.EnableHeadersVisualStyles = $false
$grid.ColumnHeadersDefaultCellStyle.BackColor = [System.Drawing.Color]::FromArgb(92, 95, 100)
$grid.ColumnHeadersDefaultCellStyle.ForeColor = [System.Drawing.Color]::FromArgb(246, 248, 251)
$grid.DefaultCellStyle.BackColor = [System.Drawing.Color]::FromArgb(56, 59, 64)
$grid.DefaultCellStyle.ForeColor = [System.Drawing.Color]::FromArgb(233, 237, 244)
$grid.DefaultCellStyle.SelectionBackColor = [System.Drawing.Color]::FromArgb(112, 115, 121)
$grid.DefaultCellStyle.SelectionForeColor = [System.Drawing.Color]::White
$grid.ColumnCount = 5
$grid.Columns[0].Name = "状态"
$grid.Columns[1].Name = "Agent"
$grid.Columns[2].Name = "当前操作/工具/技能"
$grid.Columns[3].Name = "任务次数"
$grid.Columns[4].Name = "平均周期"
$grid.Columns[0].Width = 72
$grid.Columns[1].Width = 150
$grid.Columns[2].AutoSizeMode = [System.Windows.Forms.DataGridViewAutoSizeColumnMode]::Fill
$grid.Columns[2].MinimumWidth = 220
$grid.Columns[3].Width = 78
$grid.Columns[4].Width = 92
$grid.Columns[0].SortMode = [System.Windows.Forms.DataGridViewColumnSortMode]::NotSortable
$grid.Columns[1].SortMode = [System.Windows.Forms.DataGridViewColumnSortMode]::NotSortable
$grid.Columns[2].SortMode = [System.Windows.Forms.DataGridViewColumnSortMode]::NotSortable
$grid.Columns[3].SortMode = [System.Windows.Forms.DataGridViewColumnSortMode]::NotSortable
$grid.Columns[4].SortMode = [System.Windows.Forms.DataGridViewColumnSortMode]::NotSortable
$layout.Controls.Add($grid, 0, 6)

$footer = New-Object System.Windows.Forms.Label
$footer.Dock = [System.Windows.Forms.DockStyle]::Fill
$footer.ForeColor = [System.Drawing.Color]::FromArgb(214, 222, 232)
$footer.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$footer.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Regular)
$layout.Controls.Add($footer, 0, 7)

function Start-DragWindow {
  param([System.Windows.Forms.MouseEventArgs]$event)
  if ($event.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
  [void][NativeWindowDrag]::ReleaseCapture()
  # WM_NCLBUTTONDOWN=0xA1, HTCAPTION=0x2
  [void][NativeWindowDrag]::SendMessage($form.Handle, 0xA1, [IntPtr]2, [IntPtr]::Zero)
}

$header.Add_MouseDown({ param($sender, $event) Start-DragWindow $event })
$title.Add_MouseDown({ param($sender, $event) Start-DragWindow $event })
$headerInfo.Add_MouseDown({ param($sender, $event) Start-DragWindow $event })
$btnClose.Add_Click({ $form.Close() })

$expanded = $true
$expandedHeight = $form.Height
$collapsedHeight = 96
$lastGridSignature = ""
$lastAgentsStamp = 0
$agentRowIndex = @{}

$snapThreshold = 20
$isSnapping = $false

function Invoke-SnapToEdge {
  if ($script:isSnapping) { return }
  $screen = [System.Windows.Forms.Screen]::FromControl($form).WorkingArea
  $x = $form.Left
  $y = $form.Top
  $targetX = $x
  $targetY = $y

  if ([Math]::Abs($x - $screen.Left) -le $snapThreshold) { $targetX = $screen.Left }
  if ([Math]::Abs(($x + $form.Width) - $screen.Right) -le $snapThreshold) { $targetX = $screen.Right - $form.Width }
  if ([Math]::Abs($y - $screen.Top) -le $snapThreshold) { $targetY = $screen.Top }
  if ([Math]::Abs(($y + $form.Height) - $screen.Bottom) -le $snapThreshold) { $targetY = $screen.Bottom - $form.Height }

  if ($targetX -ne $x -or $targetY -ne $y) {
    $script:isSnapping = $true
    $form.Location = New-Object System.Drawing.Point($targetX, $targetY)
    $script:isSnapping = $false
  }
}

$form.Add_LocationChanged({ Invoke-SnapToEdge })
$form.Add_ResizeEnd({ Invoke-SnapToEdge })

$btnCollapse.Add_Click({
  $script:expanded = -not $script:expanded
  if ($script:expanded) {
    $form.MinimumSize = New-Object System.Drawing.Size(660, 360)
    $content.Visible = $true
    $form.Height = $script:expandedHeight
    $btnCollapse.Text = "折叠"
  } else {
    $script:expandedHeight = [Math]::Max($form.Height, 360)
    $content.Visible = $false
    $form.MinimumSize = New-Object System.Drawing.Size(520, 96)
    $form.Height = $script:collapsedHeight
    $btnCollapse.Text = "展开"
  }
  Invoke-SnapToEdge
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
  $headerInfo.Text = "进度 $taskPct% · Token $(Coalesce $session.totalTokens 0) · 活跃 $(Format-Duration $activeMs) · 空闲 $(Format-Duration $idleMs)"
  $taskProgress.Value = [Math]::Min([Math]::Max($taskPct, 0), 100)
  $timeProgress.Value = $activePct
  $footer.Text = if ($inProgress.Count -gt 0) { "进行中: $($inProgress[0].content)" } else { "进行中: 无 · 待处理: $pending" }

  $agentsStamp = [double](Coalesce $state.updatedAt 0)
  if ($agentsStamp -ne $script:lastAgentsStamp) {
    $script:lastAgentsStamp = $agentsStamp

    $ordered = $agents | Sort-Object @{ Expression = { [string]$_.name } }

    $rows = @()
    foreach ($agent in $ordered) {
      $executed = [int](Coalesce $agent.executed 0)
      $totalMs = [double](Coalesce $agent.totalMs 0)
      $avgMs = if ($executed -gt 0) { [Math]::Round($totalMs / $executed) } else { 0 }
      $operation = [string](Coalesce $agent.currentOperation "-")
      $rows += @{
        statusText = (Status-Text $agent.status)
        statusColor = (Status-Color $agent.status)
        name = [string]$agent.name
        operation = $operation
        executed = [string]$executed
        avgText = (Format-Duration $avgMs)
        statusRaw = [string]$agent.status
      }
    }

    $signature = ($rows | ForEach-Object {
        "$($_.statusRaw)|$($_.name)|$($_.operation)|$($_.executed)|$($_.avgText)"
      }) -join "`n"

    if ($signature -ne $script:lastGridSignature) {
      $script:lastGridSignature = $signature
      $grid.SuspendLayout()
      $seen = @{}
      foreach ($row in $rows) {
        $seen[$row.name] = $true
        if ($script:agentRowIndex.ContainsKey($row.name)) {
          $rowIndex = [int]$script:agentRowIndex[$row.name]
          if ($rowIndex -lt $grid.Rows.Count) {
            $grid.Rows[$rowIndex].Cells[0].Value = $row.statusText
            $grid.Rows[$rowIndex].Cells[1].Value = $row.name
            $grid.Rows[$rowIndex].Cells[2].Value = $row.operation
            $grid.Rows[$rowIndex].Cells[3].Value = $row.executed
            $grid.Rows[$rowIndex].Cells[4].Value = $row.avgText
          }
        } else {
          $rowIndex = $grid.Rows.Add($row.statusText, $row.name, $row.operation, $row.executed, $row.avgText)
          $script:agentRowIndex[$row.name] = $rowIndex
        }
        $grid.Rows[$rowIndex].Cells[0].Style.ForeColor = $row.statusColor
      }

      for ($index = $grid.Rows.Count - 1; $index -ge 0; $index -= 1) {
        $name = [string]$grid.Rows[$index].Cells[1].Value
        if (-not $seen.ContainsKey($name)) {
          $grid.Rows.RemoveAt($index)
        }
      }

      $script:agentRowIndex = @{}
      for ($index = 0; $index -lt $grid.Rows.Count; $index += 1) {
        $name = [string]$grid.Rows[$index].Cells[1].Value
        if ($name) { $script:agentRowIndex[$name] = $index }
      }

      $grid.ResumeLayout()
    }
  }
})

$timer.Start()
[void]$form.ShowDialog()
