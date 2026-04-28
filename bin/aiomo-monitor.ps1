$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

$HomeDir = if ($env:HOME) { $env:HOME } elseif ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath("UserProfile") }
$StatePath = Join-Path $HomeDir ".config\opencode\omo-agent-monitor-state.json"
$LaunchLogPath = Join-Path $HomeDir ".config\opencode\omo-agent-monitor-window.log"

function Write-LaunchLog([string]$message) {
  try {
    $directory = Split-Path -Parent $LaunchLogPath
    if (-not [System.IO.Directory]::Exists($directory)) { [System.IO.Directory]::CreateDirectory($directory) | Out-Null }
    Add-Content -LiteralPath $LaunchLogPath -Value "[$([DateTimeOffset]::Now.ToString('o'))] $message" -Encoding UTF8
  } catch {}
}

Write-LaunchLog "bootstrap pid=$PID home=$HomeDir state=$StatePath apartment=$([System.Threading.Thread]::CurrentThread.ApartmentState)"

try {
  Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
  Add-Type -AssemblyName System.Drawing -ErrorAction Stop
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
  Write-LaunchLog "assemblies loaded"
} catch {
  Write-LaunchLog "bootstrap error: $($_.Exception.GetType().FullName): $($_.Exception.Message)"
  throw
}

$WM_NCLBUTTONDOWN = 0xA1
$HTCAPTION = 0x2
$HTBOTTOMRIGHT = 0x11

$DefaultAgentNames = @(
  "main",
  "build",
  "plan",
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
  "multimodal-looker",
  "ultrabrain",
  "deep",
  "quick",
  "unspecified-low",
  "unspecified-high",
  "writing",
  "visual-engineering",
  "artistry"
)

function Coalesce($value, $fallback) {
  if ($null -eq $value) { return $fallback }
  return $value
}

function Format-Duration([double]$milliseconds) {
  $seconds = [Math]::Max([Math]::Round($milliseconds / 1000), 0)
  if ($seconds -lt 60) { return "${seconds}s" }
  $minutes = [Math]::Floor($seconds / 60)
  if ($minutes -ge 60) {
    $hours = [Math]::Floor($minutes / 60)
    $remainingMinutes = [int]($minutes % 60)
    if ($remainingMinutes -eq 0) { return "${hours}h" }
    return "${hours}h$(("{0:D2}" -f $remainingMinutes))m"
  }
  return "${minutes}m$(("{0:D2}" -f ([int]($seconds % 60))))s"
}

function Format-Token([double]$value) {
  $token = [Math]::Max($value, 0)
  if ($token -lt 1000) { return [string][int]$token }
  if ($token -lt 1000000) { return "$(Format-ShortNumber ($token / 1000))K" }
  return "$(Format-ShortNumber ($token / 1000000))M"
}

function Format-ShortNumber([double]$value) {
  if ($value -ge 10) { return ("{0:0.#}" -f $value) }
  return ("{0:0.##}" -f $value)
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

function Agent-Status($agent) {
  $status = [string](Coalesce $agent.status "unknown")
  if ([string]$agent.name -eq "main" -and $status -eq "unknown") { return "idle" }
  return $status
}

function Status-Rank([string]$status) {
  if ($status -eq "running") { return 0 }
  if ($status -eq "retry") { return 1 }
  if ($status -eq "error") { return 2 }
  if ($status -eq "idle") { return 3 }
  return 4
}

function Agent-KindRank($agent) {
  $kind = [string](Coalesce $agent.kind (Agent-Kind ([string]$agent.name)))
  if ($kind -eq "main") { return 0 }
  if ($kind -eq "subagent") { return 1 }
  if ($kind -eq "category") { return 2 }
  return 3
}

function Agent-Kind([string]$name) {
  if ($name -eq "main" -or $name -eq "build" -or $name -eq "plan") { return "main" }
  if (@("ultrabrain", "deep", "quick", "unspecified-low", "unspecified-high", "writing", "visual-engineering", "artistry") -contains $name) { return "category" }
  return "subagent"
}

function Agent-KindText($agent) {
  $kind = [string](Coalesce $agent.kind (Agent-Kind ([string]$agent.name)))
  $prefix = if ($kind -eq "main") { "主" } elseif ($kind -eq "subagent") { "子" } elseif ($kind -eq "category") { "类" } else { "工具" }
  $background = if ([bool](Coalesce $agent.background $false)) { "/后台" } else { "" }
  return "$prefix$background"
}

function Agent-Badge($agent) {
  $kind = [string](Coalesce $agent.kind (Agent-Kind ([string]$agent.name)))
  if ($kind -eq "main") { return "【主】" }
  if ($kind -eq "subagent") {
    if ([bool](Coalesce $agent.background $false)) { return "【子·后台】" }
    return "【子】"
  }
  if ($kind -eq "category") { return "【类】" }
  return "【工具】"
}

function Agent-KindColor($agent) {
  $kind = [string](Coalesce $agent.kind (Agent-Kind ([string]$agent.name)))
  if ($kind -eq "main") { return [System.Drawing.Color]::FromArgb(250, 204, 21) }
  if ($kind -eq "subagent") { return [System.Drawing.Color]::FromArgb(96, 165, 250) }
  if ($kind -eq "category") { return [System.Drawing.Color]::FromArgb(52, 211, 153) }
  return [System.Drawing.Color]::FromArgb(192, 132, 252)
}

function Agent-DisplayName($agent) {
  $name = [string]$agent.name
  if ($name -eq "main") { return "Hephaestus（主入口）" }
  return $name
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

function New-RoundedRectanglePath([System.Drawing.Rectangle]$rect, [int]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $radius = [Math]::Min($radius, [Math]::Max([int]([Math]::Min($rect.Width, $rect.Height) / 2), 1))
  $diameter = $radius * 2
  $path.AddArc($rect.Left, $rect.Top, $diameter, $diameter, 180, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Top, $diameter, $diameter, 270, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($rect.Left, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Set-RoundedFormRegion {
  if ($form.Width -le 0 -or $form.Height -le 0) { return }
  $rect = New-Object System.Drawing.Rectangle(0, 0, $form.Width, $form.Height)
  $path = New-RoundedRectanglePath $rect 18
  $oldRegion = $form.Region
  $form.Region = New-Object System.Drawing.Region($path)
  $path.Dispose()
  if ($null -ne $oldRegion) { $oldRegion.Dispose() }
}

function Update-FormMaximumSize {
  if ($script:expanded -eq $false) {
    $form.MaximumSize = $script:collapsedSize
    return
  }
  $screen = [System.Windows.Forms.Screen]::FromControl($form).WorkingArea
  $contentWidth = 860
  $contentHeight = $header.Height + $content.Padding.Top + $content.Padding.Bottom + 34 + 20 + 8 + 30 + 28 + $grid.ColumnHeadersHeight + (($script:DefaultAgentNames.Count + 1) * $grid.RowTemplate.Height) + 20
  $maxWidth = [Math]::Min([Math]::Max($contentWidth, $form.MinimumSize.Width), $screen.Width - 24)
  $maxHeight = [Math]::Min([Math]::Max($contentHeight, $form.MinimumSize.Height), $screen.Height - 24)
  $form.MaximumSize = New-Object System.Drawing.Size($maxWidth, $maxHeight)
}

function Set-RoundedControlRegion($control, [int]$radius) {
  if ($control.Width -le 0 -or $control.Height -le 0) { return }
  $rect = New-Object System.Drawing.Rectangle(0, 0, $control.Width, $control.Height)
  $path = New-RoundedRectanglePath $rect $radius
  $oldRegion = $control.Region
  $control.Region = New-Object System.Drawing.Region($path)
  $path.Dispose()
  if ($null -ne $oldRegion) { $oldRegion.Dispose() }
}

function Fill-RoundedRectangle($graphics, [System.Drawing.Brush]$brush, [System.Drawing.Rectangle]$rect, [int]$radius) {
  if ($rect.Width -le 0 -or $rect.Height -le 0) { return }
  $path = New-RoundedRectanglePath $rect $radius
  $graphics.FillPath($brush, $path)
  $path.Dispose()
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
        kind = (Agent-Kind $name)
        source = "fallback"
        background = $false
        parentAgent = $null
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
$form.Size = New-Object System.Drawing.Size(860, 560)
$form.MinimumSize = New-Object System.Drawing.Size(660, 360)
$form.Padding = New-Object System.Windows.Forms.Padding(1)
$form.BackColor = [System.Drawing.Color]::FromArgb(82, 78, 70)
$form.Opacity = 0.95
$form.TopMost = $true
$form.ShowInTaskbar = $true
$form.WindowState = [System.Windows.Forms.FormWindowState]::Normal
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location = New-Object System.Drawing.Point(([Math]::Max($screen.Right - $form.Width - 24, $screen.Left)), ([Math]::Max($screen.Top + 24, $screen.Top)))
$form.Add_Shown({
    $form.WindowState = [System.Windows.Forms.FormWindowState]::Normal
    $form.TopMost = $true
    $form.ShowInTaskbar = $true
    $form.BringToFront()
    $form.Activate()
    Set-RoundedFormRegion
    Write-LaunchLog "form shown location=$($form.Location.X),$($form.Location.Y) size=$($form.Width)x$($form.Height) visible=$($form.Visible)"
  })
$form.Add_Resize({ Update-FormMaximumSize; Set-RoundedFormRegion })
$form.Add_Move({ Update-FormMaximumSize })

$header = New-Object System.Windows.Forms.Panel
$header.Dock = [System.Windows.Forms.DockStyle]::Top
$header.Height = 54
$header.BackColor = [System.Drawing.Color]::FromArgb(52, 50, 46)
$header.Add_Paint({
  param($sender, $event)
  $rect = $sender.ClientRectangle
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(72, 68, 60), [System.Drawing.Color]::FromArgb(34, 33, 31), 90)
  $event.Graphics.FillRectangle($brush, $rect)
  $brush.Dispose()
  $penTop = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(185, 170, 130))
  $event.Graphics.DrawLine($penTop, 0, 0, $rect.Width, 0)
  $penTop.Dispose()
  $penBottom = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(74, 70, 62))
  $event.Graphics.DrawLine($penBottom, 0, $rect.Height - 1, $rect.Width, $rect.Height - 1)
  $penBottom.Dispose()
  if ($script:expanded -eq $false) {
    $event.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $primaryTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 248, 252))
    $secondaryTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 228, 238))
    $textFormat = New-Object System.Drawing.StringFormat
    $textFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textFormat.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter
    $textFormat.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap
    $textWidth = [Math]::Max($btnCollapse.Left - 24, 120)
    $summaryRect = [System.Drawing.RectangleF]::new(14, 6, $textWidth, 18)
    $timeRect = [System.Drawing.RectangleF]::new(14, 28, $textWidth, 18)
    $event.Graphics.DrawString($script:collapsedSummaryText, $title.Font, $primaryTextBrush, $summaryRect, $textFormat)
    $event.Graphics.DrawString($script:collapsedHeaderText, $headerInfo.Font, $secondaryTextBrush, $timeRect, $textFormat)
    $textFormat.Dispose()
    $primaryTextBrush.Dispose()
    $secondaryTextBrush.Dispose()

    $progressHeight = 2
    $progressY = $rect.Height - $progressHeight
    $progressWidth = [int]($rect.Width * $script:taskPctValue / 100)
    $trackBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(78, 76, 70))
    $fillBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(205, 205, 200))
    $trackRect = New-Object System.Drawing.Rectangle(0, $progressY, $rect.Width, $progressHeight)
    $fillRect = New-Object System.Drawing.Rectangle(0, $progressY, $progressWidth, $progressHeight)
    Fill-RoundedRectangle $event.Graphics $trackBrush $trackRect 1
    Fill-RoundedRectangle $event.Graphics $fillBrush $fillRect 1
    $trackBrush.Dispose()
    $fillBrush.Dispose()
  }
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
$headerInfo.AutoSize = $false
$headerInfo.AutoEllipsis = $true
$headerInfo.Size = New-Object System.Drawing.Size(650, 18)
$header.Controls.Add($headerInfo)

$btnCollapse = New-Object System.Windows.Forms.Button
$btnCollapse.Text = "折叠"
$btnCollapse.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btnCollapse.ForeColor = [System.Drawing.Color]::White
$btnCollapse.BackColor = [System.Drawing.Color]::FromArgb(66, 64, 60)
$btnCollapse.FlatAppearance.BorderSize = 0
$btnCollapse.Size = New-Object System.Drawing.Size(64, 28)
$btnCollapse.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Right
$btnCollapse.Location = New-Object System.Drawing.Point(($form.ClientSize.Width - 138), 12)
$btnCollapse.Add_Resize({ Set-RoundedControlRegion $btnCollapse 10 })
$header.Controls.Add($btnCollapse)
Set-RoundedControlRegion $btnCollapse 10

$btnClose = New-Object System.Windows.Forms.Button
$btnClose.Text = "×"
$btnClose.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btnClose.ForeColor = [System.Drawing.Color]::White
$btnClose.BackColor = [System.Drawing.Color]::FromArgb(92, 64, 58)
$btnClose.FlatAppearance.BorderSize = 0
$btnClose.Size = New-Object System.Drawing.Size(40, 28)
$btnClose.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Right
$btnClose.Location = New-Object System.Drawing.Point(($form.ClientSize.Width - 66), 12)
$btnClose.Add_Resize({ Set-RoundedControlRegion $btnClose 10 })
$header.Controls.Add($btnClose)
Set-RoundedControlRegion $btnClose 10

function Update-HeaderInfoWidth {
  $headerInfo.Width = [Math]::Max($btnCollapse.Left - $headerInfo.Left - 10, 120)
}

$header.Add_Resize({ Update-HeaderInfoWidth })
Update-HeaderInfoWidth

$content = New-Object System.Windows.Forms.Panel
$content.Dock = [System.Windows.Forms.DockStyle]::Fill
$content.Padding = New-Object System.Windows.Forms.Padding(10, 62, 10, 10)
$content.BackColor = [System.Drawing.Color]::FromArgb(14, 15, 17)
$form.Controls.Add($content)

$layout = New-Object System.Windows.Forms.TableLayoutPanel
$layout.Dock = [System.Windows.Forms.DockStyle]::Fill
$layout.ColumnCount = 1
$layout.RowCount = 8
$layout.BackColor = [System.Drawing.Color]::Transparent
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 0)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 0)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 20)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 8)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 30)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 0)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Percent, 100)))
[void]$layout.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, 28)))
$content.Controls.Add($layout)

$baseBar = New-Object System.Windows.Forms.Label
$baseBar.Dock = [System.Windows.Forms.DockStyle]::Fill
$baseBar.Visible = $false
$baseBar.ForeColor = [System.Drawing.Color]::FromArgb(230, 236, 244)
$baseBar.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$baseBar.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Regular)
$layout.Controls.Add($baseBar, 0, 0)

$tokenLabel = New-Object System.Windows.Forms.Label
$tokenLabel.Dock = [System.Windows.Forms.DockStyle]::Fill
$tokenLabel.Visible = $false
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
$taskProgress.BackColor = [System.Drawing.Color]::FromArgb(30, 31, 33)
$taskProgress.Add_Paint({
  param($sender, $event)
  $event.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $rect = $sender.ClientRectangle
  $trackHeight = 2
  $trackY = [Math]::Max([int](($sender.Height - $trackHeight) / 2), 0)
  $trackBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(82, 82, 80))
  $fillBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(205, 205, 200))
  $thumbBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(232, 232, 226))
  $trackRect = New-Object System.Drawing.Rectangle(0, $trackY, $rect.Width, $trackHeight)
  $fillWidth = [int]($rect.Width * $script:taskPctValue / 100)
  $fillRect = New-Object System.Drawing.Rectangle(0, $trackY, $fillWidth, $trackHeight)
  Fill-RoundedRectangle $event.Graphics $trackBrush $trackRect ([Math]::Max([int]($trackHeight / 2), 1))
  Fill-RoundedRectangle $event.Graphics $fillBrush $fillRect ([Math]::Max([int]($trackHeight / 2), 1))
  $thumbSize = 7
  $thumbX = [Math]::Min([Math]::Max($fillWidth - [int]($thumbSize / 2), 0), [Math]::Max($rect.Width - $thumbSize, 0))
  $thumbY = [Math]::Max([int](($sender.Height - $thumbSize) / 2), 0)
  $event.Graphics.FillEllipse($thumbBrush, $thumbX, $thumbY, $thumbSize, $thumbSize)
  $trackBrush.Dispose()
  $fillBrush.Dispose()
  $thumbBrush.Dispose()
})
$layout.Controls.Add($taskProgress, 0, 3)

$timeProgress = New-Object System.Windows.Forms.Panel
$timeProgress.Dock = [System.Windows.Forms.DockStyle]::Fill
$timeProgress.BackColor = [System.Drawing.Color]::FromArgb(28, 29, 31)
$timeProgress.Add_Paint({
  param($sender, $event)
  $event.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $rect = $sender.ClientRectangle
  $activeWidth = [int]($rect.Width * $script:activePctValue / 100)
  $idleWidth = [Math]::Max($rect.Width - $activeWidth, 0)
  $barHeight = 2
  $barY = [Math]::Max($rect.Height - $barHeight - 1, 0)
  $activeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(205, 205, 200))
  $idleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(82, 82, 80))
  $thumbBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(232, 232, 226))
  $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 236, 244))
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $trackRect = New-Object System.Drawing.Rectangle(0, $barY, $rect.Width, $barHeight)
  $activeRect = New-Object System.Drawing.Rectangle(0, $barY, $activeWidth, $barHeight)
  $idleRect = New-Object System.Drawing.Rectangle($activeWidth, $barY, $idleWidth, $barHeight)
  Fill-RoundedRectangle $event.Graphics $idleBrush $trackRect ([Math]::Max([int]($barHeight / 2), 1))
  Fill-RoundedRectangle $event.Graphics $activeBrush $activeRect ([Math]::Max([int]($barHeight / 2), 1))
  $thumbSize = 7
  $thumbX = [Math]::Min([Math]::Max($activeWidth - [int]($thumbSize / 2), 0), [Math]::Max($rect.Width - $thumbSize, 0))
  $thumbY = [Math]::Max($barY - [int](($thumbSize - $barHeight) / 2), 0)
  $event.Graphics.FillEllipse($thumbBrush, $thumbX, $thumbY, $thumbSize, $thumbSize)
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
  $thumbBrush.Dispose()
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
$grid.BackgroundColor = [System.Drawing.Color]::FromArgb(25, 26, 28)
$grid.BorderStyle = [System.Windows.Forms.BorderStyle]::None
$grid.GridColor = [System.Drawing.Color]::FromArgb(62, 60, 56)
$grid.EnableHeadersVisualStyles = $false
$grid.ColumnHeadersDefaultCellStyle.BackColor = [System.Drawing.Color]::FromArgb(44, 43, 41)
$grid.ColumnHeadersDefaultCellStyle.ForeColor = [System.Drawing.Color]::FromArgb(246, 248, 251)
$grid.DefaultCellStyle.BackColor = [System.Drawing.Color]::FromArgb(31, 32, 34)
$grid.DefaultCellStyle.ForeColor = [System.Drawing.Color]::FromArgb(233, 237, 244)
$grid.DefaultCellStyle.SelectionBackColor = [System.Drawing.Color]::FromArgb(82, 72, 48)
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
$grid.Columns[1].Width = 220
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
$expandedMinimumSize = New-Object System.Drawing.Size(660, 360)
$collapsedSize = New-Object System.Drawing.Size(450, 56)
$gridValueRefreshMs = 10 * 1000
$taskPctValue = 0
$activePctValue = 0
$activeTimeText = "执行 0s"
$idleTimeText = "空闲 0s"
$collapsedSummaryText = "空闲 · 任务 0/0 · Token 0"
$collapsedHeaderText = "执行 0s · 空闲 0s"
$lastGridStructureSignature = ""
$lastGridValueSignature = ""
$lastGridValueRefreshAt = 0
$lastAgentsStamp = 0
$agentRowIndex = @{}
$gridInteractionFrozen = $false
$gridUpdating = $false
$agentSortKey = "default"
$agentSortAscending = $true
$forceGridRefresh = $false
$sortColumnNames = @("状态", "Agent", "当前操作/工具/技能", "任务次数", "Token", "平均周期")

Update-FormMaximumSize

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
$grid.Add_ColumnHeaderMouseClick({
  param($sender, $event)
  $keyByColumn = @("status", "agent", "operation", "executed", "tokens", "avg")
  if ($event.ColumnIndex -lt 0 -or $event.ColumnIndex -ge $keyByColumn.Count) { return }
  $key = $keyByColumn[$event.ColumnIndex]
  if ($script:agentSortKey -eq $key) {
    $script:agentSortAscending = -not $script:agentSortAscending
  } else {
    $script:agentSortKey = $key
    $script:agentSortAscending = Default-SortAscending $key
  }
  $script:gridInteractionFrozen = $false
  $script:forceGridRefresh = $true
  $script:lastGridStructureSignature = ""
  $script:lastAgentsStamp = -1
  Update-SortHeaders
})

$btnCollapse.Add_Click({
  $script:expanded = -not $script:expanded
  if ($script:expanded) {
    $form.MinimumSize = $script:expandedMinimumSize
    $content.Visible = $true
    $resizeGrip.Visible = $true
    $title.Visible = $true
    $headerInfo.Visible = $true
    $form.Width = [Math]::Max($form.Width, $script:expandedMinimumSize.Width)
    $form.Height = $script:expandedHeight
    $btnCollapse.Text = "折叠"
  } else {
    $script:expandedHeight = [Math]::Max($form.Height, 360)
    $content.Visible = $false
    $resizeGrip.Visible = $false
    $title.Visible = $false
    $headerInfo.Visible = $false
    $form.MinimumSize = $script:collapsedSize
    $form.Size = $script:collapsedSize
    $btnCollapse.Text = "展开"
  }
  $header.Invalidate()
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
  $activeMs = [Math]::Max([double](Coalesce $session.totalActiveMs 0), 0)
  $elapsedMs = [Math]::Max($now - $startedAt, 0)
  $idleMs = [Math]::Max($elapsedMs - $activeMs, 0)
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
  $script:collapsedSummaryText = "$(Status-Text $session.status) · 任务 $done/$($todos.Count) · Token $(Coalesce $session.totalTokens 0)"
  $script:collapsedHeaderText = "执行 $activeText · 空闲 $idleText"

  $baseBar.Text = "任务 $done/$($todos.Count) ($taskPct%) · 待处理 $pending · 当前: $currentTaskText"
  $tokenLabel.Text = "Token $(Coalesce $session.totalTokens 0) · 执行 $activeText · 空闲 $idleText"
  if ($script:expanded) {
    $headerInfo.Text = "$(Status-Text $session.status) · 任务 $done/$($todos.Count) · Token $(Coalesce $session.totalTokens 0)"
  }
  $taskTitle.Text = "任务进度 $taskPct%"
  $header.Invalidate()
  $taskProgress.Invalidate()
  $timeProgress.Invalidate()
  $footer.Text = if ($inProgress.Count -gt 0) { "进行中: $currentTaskText" } else { "无进行中任务" }

  $agentsStamp = [double](Coalesce $state.updatedAt 0)
  if ($agentsStamp -ne $script:lastAgentsStamp -or $script:forceGridRefresh) {
    $ordered = $agents

    $rows = @()
    foreach ($agent in $ordered) {
      $executed = [int](Coalesce $agent.executed 0)
      $totalMs = [double](Coalesce $agent.totalMs 0)
      $totalTokens = [int](Coalesce $agent.totalTokens 0)
      $avgMs = if ($executed -gt 0) { [Math]::Round($totalMs / $executed) } else { 0 }
      $operation = [string](Coalesce $agent.currentOperation "-")
      $kindText = Agent-KindText $agent
      $parentAgent = [string](Coalesce $agent.parentAgent "")
      if ($parentAgent) { $kindText = "$kindText/$parentAgent" }
      $displayName = "$(Agent-Badge $agent)$(Agent-DisplayName $agent)"
      $agentColor = Agent-KindColor $agent
      $statusRaw = Agent-Status $agent
      $rows += @{
        statusText = (Status-Text $statusRaw)
        statusColor = (Status-Color $statusRaw)
        name = $displayName
        rawName = [string]$agent.name
        agentColor = $agentColor
        kindText = $kindText
        operation = $operation
        executed = [string]$executed
        tokenText = (Format-Token $totalTokens)
        avgText = (Format-Duration $avgMs)
        statusRaw = $statusRaw
        pinned = ([string]$agent.name -eq "main")
        sortStatus = (Status-Rank $statusRaw)
        sortKind = (Agent-KindRank $agent)
        sortAgent = $displayName
        sortOperation = $operation
        sortExecuted = $executed
        sortTokens = $totalTokens
        sortAvg = $avgMs
      }
    }
    $rows = Sort-AgentRows @($rows)

    $structureSignature = ($rows | ForEach-Object {
        "$($_.statusRaw)|$($_.rawName)"
      }) -join "`n"
    $valueSignature = ($rows | ForEach-Object {
        "$($_.statusRaw)|$($_.name)|$($_.kindText)|$($_.operation)|$($_.executed)|$($_.tokenText)|$($_.avgText)"
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
      $script:forceGridRefresh = $false
      $grid.SuspendLayout()
      Set-GridRedraw $false
      $script:gridUpdating = $true
      try {
        if ($structureChanged) {
          $grid.Rows.Clear()
          $script:agentRowIndex = @{}
          foreach ($row in $rows) {
            $rowIndex = $grid.Rows.Add($row.statusText, $row.name, $row.operation, $row.executed, $row.tokenText, $row.avgText)
            $script:agentRowIndex[$row.rawName] = $rowIndex
            $grid.Rows[$rowIndex].Cells[0].Style.ForeColor = $row.statusColor
            $grid.Rows[$rowIndex].Cells[1].Style.ForeColor = $row.agentColor
          }
        } else {
          foreach ($row in $rows) {
            if (-not $script:agentRowIndex.ContainsKey($row.rawName)) { continue }
            $rowIndex = [int]$script:agentRowIndex[$row.rawName]
            if ($rowIndex -ge $grid.Rows.Count) { continue }
            Set-GridCellValue $grid.Rows[$rowIndex] 0 $row.statusText
            Set-GridCellValue $grid.Rows[$rowIndex] 1 $row.name
            Set-GridCellValue $grid.Rows[$rowIndex] 2 $row.operation
            Set-GridCellValue $grid.Rows[$rowIndex] 3 $row.executed
            Set-GridCellValue $grid.Rows[$rowIndex] 4 $row.tokenText
            Set-GridCellValue $grid.Rows[$rowIndex] 5 $row.avgText
            $grid.Rows[$rowIndex].Cells[0].Style.ForeColor = $row.statusColor
            $grid.Rows[$rowIndex].Cells[1].Style.ForeColor = $row.agentColor
          }
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

function Sort-AgentRows($rows) {
  $pinnedRows = @($rows | Where-Object { $_.pinned })
  $sortableRows = @($rows | Where-Object { -not $_.pinned })
  if ($script:agentSortKey -eq "default") {
    return @($pinnedRows) + @($sortableRows | Sort-Object @{ Expression = { $_.sortStatus } }, @{ Expression = { $_.sortKind } }, @{ Expression = { $_.sortTokens }; Descending = $true }, @{ Expression = { $_.rawName } })
  }
  $descending = -not $script:agentSortAscending
  if ($script:agentSortKey -eq "status") { return @($pinnedRows) + @($sortableRows | Sort-Object @{ Expression = { $_.sortStatus }; Descending = $descending }, @{ Expression = { $_.sortKind } }, @{ Expression = { $_.sortTokens }; Descending = $true }) }
  if ($script:agentSortKey -eq "agent") { return @($pinnedRows) + @($sortableRows | Sort-Object @{ Expression = { $_.sortAgent }; Descending = $descending }) }
  if ($script:agentSortKey -eq "operation") { return @($pinnedRows) + @($sortableRows | Sort-Object @{ Expression = { $_.sortOperation }; Descending = $descending }) }
  if ($script:agentSortKey -eq "executed") { return @($pinnedRows) + @($sortableRows | Sort-Object @{ Expression = { $_.sortExecuted }; Descending = $descending }) }
  if ($script:agentSortKey -eq "tokens") { return @($pinnedRows) + @($sortableRows | Sort-Object @{ Expression = { $_.sortTokens }; Descending = $descending }) }
  if ($script:agentSortKey -eq "avg") { return @($pinnedRows) + @($sortableRows | Sort-Object @{ Expression = { $_.sortAvg }; Descending = $descending }) }
  return @($pinnedRows) + @($sortableRows)
}

function Default-SortAscending([string]$key) {
  return -not ($key -eq "executed" -or $key -eq "tokens" -or $key -eq "avg")
}

function Update-SortHeaders {
  for ($index = 0; $index -lt $grid.Columns.Count; $index += 1) {
    $label = $script:sortColumnNames[$index]
    $keyByColumn = @("status", "agent", "operation", "executed", "tokens", "avg")
    if ($script:agentSortKey -eq "default") {
      $grid.Columns[$index].Name = if ($index -eq 0) { "$label ↑" } else { $label }
      continue
    }
    $grid.Columns[$index].Name = if ($keyByColumn[$index] -eq $script:agentSortKey) {
      if ($script:agentSortAscending) { "$label ↑" } else { "$label ↓" }
    } else {
      $label
    }
  }
}

$script:forceGridRefresh = $true
Update-SortHeaders
$timer.Start()
Write-LaunchLog "show-dialog begin"
try {
  [void]$form.ShowDialog()
  Write-LaunchLog "show-dialog end"
} catch {
  Write-LaunchLog "show-dialog error: $($_.Exception.GetType().FullName): $($_.Exception.Message)"
  throw
}
