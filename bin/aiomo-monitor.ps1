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

$WM_NCLBUTTONDOWN = 0xA1
$HTCAPTION = 0x2
$HTBOTTOMRIGHT = 0x11

$HomeDir = if ($env:HOME) { $env:HOME } elseif ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath("UserProfile") }
$StatePath = Join-Path $HomeDir ".config\opencode\omo-agent-monitor-state.json"
$DefaultAgentNames = @(
  "sisyphus",
  "hephaestus",
  "prometheus",
  "oracle",
  "momus",
  "metis",
  "atlas",
  "sisyphus-junior",
  "explorer",
  "librarian",
  "multimodal-looker"
)

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

function Status-Rank([string]$status) {
  if ($status -eq "running") { return 0 }
  if ($status -eq "retry") { return 1 }
  if ($status -eq "error") { return 2 }
  if ($status -eq "idle") { return 3 }
  return 4
}

function Enable-DoubleBuffering($control) {
  $property = [System.Windows.Forms.Control].GetProperty("DoubleBuffered", [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::NonPublic)
  $property.SetValue($control, $true, $null)
}

function Set-GridCellValue($row, [int]$columnIndex, [string]$value) {
  $cell = $row.Cells[$columnIndex]
  if ([string]$cell.Value -ne $value) {
    $cell.Value = $value
  }
}

function Set-GridRedraw([bool]$enabled) {
  if (-not $grid.IsHandleCreated) { return }
  $value = if ($enabled) { [IntPtr]1 } else { [IntPtr]::Zero }
  # WM_SETREDRAW=0x0B
  [void][NativeWindowDrag]::SendMessage($grid.Handle, 0x0B, $value, [IntPtr]::Zero)
  if ($enabled) { $grid.Invalidate() }
}

function Should-ShowAgent($agent, [double]$now) {
  return $true
}

function Should-DeferGridUpdate {
  return $script:gridInteractionFrozen -or $grid.IsCurrentCellInEditMode
}

function Clear-GridSelection {
  if ($null -ne $grid.CurrentCell) { $grid.CurrentCell = $null }
  $grid.ClearSelection()
}

function Merge-AgentList($agents) {
  $merged = @($agents)
  $seen = @{}
  foreach ($agent in $merged) {
    $name = [string]$agent.name
    if ($name) { $seen[$name] = $true }
  }

  foreach ($name in $script:DefaultAgentNames) {
    if (-not $seen.ContainsKey($name)) {
      $merged += [pscustomobject]@{
        name = $name
        status = "idle"
        executed = 0
        totalMs = 0
        totalTokens = 0
        currentOperation = "-"
      }
    }
  }
  return $merged
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
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
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
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 24)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 20)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 8)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 30)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 0)))
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

$taskProgress = New-Object System.Windows.Forms.Panel
$taskProgress.Dock = [System.Windows.Forms.DockStyle]::Fill
$taskProgress.BackColor = [System.Drawing.Color]::FromArgb(58, 60, 65)
$taskProgress.Add_Paint({
  param($sender, $event)
  $rect = $sender.ClientRectangle
  $trackHeight = [Math]::Max([Math]::Min([int]($sender.Height / 3), 5), 3)
  $trackY = [Math]::Max([int](($sender.Height - $trackHeight) / 2), 0)
  $trackBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(76, 79, 86))
  $fillBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(214, 167, 76))
  $event.Graphics.FillRectangle($trackBrush, 0, $trackY, $rect.Width, $trackHeight)
  $event.Graphics.FillRectangle($fillBrush, 0, $trackY, [int]($rect.Width * $script:taskPctValue / 100), $trackHeight)
  $trackBrush.Dispose()
  $fillBrush.Dispose()
})
$layout.Controls.Add($taskProgress, 0, 3)

$timeProgress = New-Object System.Windows.Forms.Panel
$timeProgress.Dock = [System.Windows.Forms.DockStyle]::Fill
$timeProgress.BackColor = [System.Drawing.Color]::FromArgb(45, 47, 52)
$timeProgress.Add_Paint({
  param($sender, $event)
  $rect = $sender.ClientRectangle
  $activeWidth = [int]($rect.Width * $script:activePctValue / 100)
  $idleWidth = [Math]::Max($rect.Width - $activeWidth, 0)
  $barHeight = 6
  $barY = [Math]::Max($rect.Height - $barHeight - 1, 0)
  $activeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 120, 170))
  $idleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(110, 113, 120))
  $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 236, 244))
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $event.Graphics.FillRectangle($activeBrush, 0, $barY, $activeWidth, $barHeight)
  $event.Graphics.FillRectangle($idleBrush, $activeWidth, $barY, $idleWidth, $barHeight)
  $textHeight = [Math]::Max($barY, 16)
  $minTextWidth = 120
  $gap = 8
  $halfWidth = [int](($rect.Width - $gap) / 2)
  $activeTextWidth = [Math]::Min([Math]::Max($activeWidth, $minTextWidth), $halfWidth)
  $idleTextWidth = [Math]::Min([Math]::Max($idleWidth, $minTextWidth), $halfWidth)
  $activeTextX = [Math]::Min([Math]::Max([int](($activeWidth - $activeTextWidth) / 2), 0), [Math]::Max($rect.Width - $activeTextWidth - $idleTextWidth - $gap, 0))
  $idleTextX = [Math]::Max([Math]::Min([int]($activeWidth + (($idleWidth - $idleTextWidth) / 2)), $rect.Width - $idleTextWidth), $activeTextX + $activeTextWidth + $gap)
  $activeTextRect = [System.Drawing.RectangleF]::new($activeTextX, 0, $activeTextWidth, $textHeight)
  $idleTextRect = [System.Drawing.RectangleF]::new($idleTextX, 0, $idleTextWidth, $textHeight)
  $event.Graphics.DrawString($script:activeTimeText, $sender.Font, $textBrush, $activeTextRect, $format)
  $event.Graphics.DrawString($script:idleTimeText, $sender.Font, $textBrush, $idleTextRect, $format)
  $format.Dispose()
  $activeBrush.Dispose()
  $idleBrush.Dispose()
  $textBrush.Dispose()
})
$layout.Controls.Add($timeProgress, 0, 4)

$grid = New-Object System.Windows.Forms.DataGridView
$grid.Dock = [System.Windows.Forms.DockStyle]::Fill
$grid.ReadOnly = $true
$grid.TabStop = $false
$grid.MultiSelect = $false
$grid.SelectionMode = [System.Windows.Forms.DataGridViewSelectionMode]::FullRowSelect
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
$grid.ColumnCount = 6
Enable-DoubleBuffering $grid
$grid.Columns[0].Name = "状态"
$grid.Columns[1].Name = "Agent"
$grid.Columns[2].Name = "当前操作/工具/技能"
$grid.Columns[3].Name = "任务次数"
$grid.Columns[4].Name = "Token"
$grid.Columns[5].Name = "平均周期"
$grid.Columns[0].Width = 72
$grid.Columns[1].Width = 150
$grid.Columns[2].AutoSizeMode = [System.Windows.Forms.DataGridViewAutoSizeColumnMode]::Fill
$grid.Columns[2].MinimumWidth = 220
$grid.Columns[3].Width = 78
$grid.Columns[4].Width = 92
$grid.Columns[5].Width = 92
$grid.Columns[0].SortMode = [System.Windows.Forms.DataGridViewColumnSortMode]::NotSortable
$grid.Columns[1].SortMode = [System.Windows.Forms.DataGridViewColumnSortMode]::NotSortable
$grid.Columns[2].SortMode = [System.Windows.Forms.DataGridViewColumnSortMode]::NotSortable
$grid.Columns[3].SortMode = [System.Windows.Forms.DataGridViewColumnSortMode]::NotSortable
$grid.Columns[4].SortMode = [System.Windows.Forms.DataGridViewColumnSortMode]::NotSortable
$grid.Columns[5].SortMode = [System.Windows.Forms.DataGridViewColumnSortMode]::NotSortable
$layout.Controls.Add($grid, 0, 6)

$footer = New-Object System.Windows.Forms.Label
$footer.Dock = [System.Windows.Forms.DockStyle]::Fill
$footer.ForeColor = [System.Drawing.Color]::FromArgb(214, 222, 232)
$footer.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$footer.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Regular)
$layout.Controls.Add($footer, 0, 7)

$resizeGrip = New-Object System.Windows.Forms.Panel
$resizeGrip.Size = New-Object System.Drawing.Size(18, 18)
$resizeGrip.Anchor = [System.Windows.Forms.AnchorStyles]::Right -bor [System.Windows.Forms.AnchorStyles]::Bottom
$resizeGrip.Cursor = [System.Windows.Forms.Cursors]::SizeNWSE
$resizeGrip.BackColor = [System.Drawing.Color]::Transparent
$resizeGrip.Location = New-Object System.Drawing.Point(($form.ClientSize.Width - 20), ($form.ClientSize.Height - 20))
$resizeGrip.Add_Paint({
  param($sender, $event)
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(150, 165, 180))
  $event.Graphics.DrawLine($pen, 6, 16, 16, 6)
  $event.Graphics.DrawLine($pen, 11, 16, 16, 11)
  $pen.Dispose()
})
$form.Controls.Add($resizeGrip)
$resizeGrip.BringToFront()

function Start-DragWindow {
  param([System.Windows.Forms.MouseEventArgs]$event)
  if ($event.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
  [void][NativeWindowDrag]::ReleaseCapture()
  [void][NativeWindowDrag]::SendMessage($form.Handle, $script:WM_NCLBUTTONDOWN, [IntPtr]$script:HTCAPTION, [IntPtr]::Zero)
}

function Start-ResizeWindow {
  param([System.Windows.Forms.MouseEventArgs]$event)
  if ($event.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
  [void][NativeWindowDrag]::ReleaseCapture()
  [void][NativeWindowDrag]::SendMessage($form.Handle, $script:WM_NCLBUTTONDOWN, [IntPtr]$script:HTBOTTOMRIGHT, [IntPtr]::Zero)
}

$header.Add_MouseDown({ param($sender, $event) Start-DragWindow $event })
$title.Add_MouseDown({ param($sender, $event) Start-DragWindow $event })
$headerInfo.Add_MouseDown({ param($sender, $event) Start-DragWindow $event })
$resizeGrip.Add_MouseDown({ param($sender, $event) Start-ResizeWindow $event })
$btnClose.Add_Click({ $form.Close() })

$expanded = $true
$expandedHeight = $form.Height
$collapsedHeight = 96
$gridValueRefreshMs = 10 * 1000
$taskPctValue = 0
$activePctValue = 0
$activeTimeText = "执行 0s"
$idleTimeText = "空闲 0s"
$lastGridStructureSignature = ""
$lastGridValueSignature = ""
$lastGridValueRefreshAt = 0
$lastAgentsStamp = 0
$agentRowIndex = @{}
$gridInteractionFrozen = $false
$gridUpdating = $false

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

$grid.Add_Enter({ $script:gridInteractionFrozen = $true })
$grid.Add_MouseDown({ $script:gridInteractionFrozen = $true })
$grid.Add_CellMouseDown({ $script:gridInteractionFrozen = $true })
$grid.Add_SelectionChanged({ if (-not $script:gridUpdating) { Clear-GridSelection } })
$grid.Add_Leave({ $script:gridInteractionFrozen = $false })

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
  $agents = Merge-AgentList @($state.agents)

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

  $activeText = Format-Duration $activeMs
  $idleText = Format-Duration $idleMs
  $currentTaskText = if ($inProgress.Count -gt 0) { $inProgress[0].content } else { "无" }
  $script:taskPctValue = [Math]::Min([Math]::Max($taskPct, 0), 100)
  $script:activePctValue = $activePct
  $script:activeTimeText = "执行 $activeText"
  $script:idleTimeText = "空闲 $idleText"

  $baseBar.Text = "任务 $done/$($todos.Count) ($taskPct%) · 待处理 $pending · 当前: $currentTaskText"
  $tokenLabel.Text = "Token $(Coalesce $session.totalTokens 0) · 执行 $activeText · 空闲 $idleText"
  $headerInfo.Text = "$(Status-Text $session.status) · 任务 $done/$($todos.Count) · Token $(Coalesce $session.totalTokens 0)"
  $taskTitle.Text = "任务进度 $taskPct%"
  $taskProgress.Invalidate()
  $timeProgress.Invalidate()
  $footer.Text = if ($inProgress.Count -gt 0) { "进行中: $currentTaskText" } else { "无进行中任务" }

  $agentsStamp = [double](Coalesce $state.updatedAt 0)
  if ($agentsStamp -ne $script:lastAgentsStamp) {
    $ordered = $agents | Sort-Object @{ Expression = { Status-Rank ([string]$_.status) } }, @{ Expression = { [string]$_.name } }

    $rows = @()
    foreach ($agent in $ordered) {
      $executed = [int](Coalesce $agent.executed 0)
      $totalMs = [double](Coalesce $agent.totalMs 0)
      $totalTokens = [int](Coalesce $agent.totalTokens 0)
      $avgMs = if ($executed -gt 0) { [Math]::Round($totalMs / $executed) } else { 0 }
      $operation = [string](Coalesce $agent.currentOperation "-")
      $rows += @{
        statusText = (Status-Text $agent.status)
        statusColor = (Status-Color $agent.status)
        name = [string]$agent.name
        operation = $operation
        executed = [string]$executed
        tokenText = [string]$totalTokens
        avgText = (Format-Duration $avgMs)
        statusRaw = [string]$agent.status
      }
    }

    $structureSignature = ($rows | ForEach-Object {
        "$($_.statusRaw)|$($_.name)"
      }) -join "`n"
    $valueSignature = ($rows | ForEach-Object {
        "$($_.statusRaw)|$($_.name)|$($_.operation)|$($_.executed)|$($_.tokenText)|$($_.avgText)"
      }) -join "`n"
    $structureChanged = $structureSignature -ne $script:lastGridStructureSignature
    $valueChanged = $valueSignature -ne $script:lastGridValueSignature
    $valueRefreshDue = ($now - $script:lastGridValueRefreshAt) -ge $script:gridValueRefreshMs

    if ($structureChanged -or ($valueChanged -and $valueRefreshDue)) {
      if (Should-DeferGridUpdate) { return }
      $script:lastAgentsStamp = $agentsStamp
      $script:lastGridStructureSignature = $structureSignature
      $script:lastGridValueSignature = $valueSignature
      $script:lastGridValueRefreshAt = $now
      $grid.SuspendLayout()
      Set-GridRedraw $false
      $script:gridUpdating = $true
      try {
        $seen = @{}
        foreach ($row in $rows) {
          $seen[$row.name] = $true
          if ($script:agentRowIndex.ContainsKey($row.name)) {
            $rowIndex = [int]$script:agentRowIndex[$row.name]
            if ($rowIndex -lt $grid.Rows.Count) {
              Set-GridCellValue $grid.Rows[$rowIndex] 0 $row.statusText
              Set-GridCellValue $grid.Rows[$rowIndex] 1 $row.name
              Set-GridCellValue $grid.Rows[$rowIndex] 2 $row.operation
              Set-GridCellValue $grid.Rows[$rowIndex] 3 $row.executed
              Set-GridCellValue $grid.Rows[$rowIndex] 4 $row.tokenText
              Set-GridCellValue $grid.Rows[$rowIndex] 5 $row.avgText
            }
          } else {
            $rowIndex = $grid.Rows.Add($row.statusText, $row.name, $row.operation, $row.executed, $row.tokenText, $row.avgText)
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
        Clear-GridSelection
      } finally {
        $script:gridUpdating = $false
        Set-GridRedraw $true
        $grid.ResumeLayout()
      }
    } else {
      if (-not $valueChanged) { $script:lastAgentsStamp = $agentsStamp }
    }
  }
})

$timer.Start()
[void]$form.ShowDialog()
