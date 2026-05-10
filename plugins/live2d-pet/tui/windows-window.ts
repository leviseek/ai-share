declare const Bun: {
  spawn(command: string[], options: { stdout: "ignore"; stderr: "ignore" }): { unref?: () => void };
};

type BrowserWindowBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function floatBrowserWindow(pid: number, bounds: BrowserWindowBounds): void {
  if (process.platform !== "win32") return;

  const script = buildPowerShellScript();
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
    String(pid),
    String(bounds.left),
    String(bounds.top),
    String(bounds.width),
    String(bounds.height),
  ];
  try {
    const child = Bun.spawn(["powershell.exe", ...args], { stdout: "ignore", stderr: "ignore" });
    child.unref?.();
  } catch {
    // Best-effort only: the browser app window should still open normally.
  }
}

function buildPowerShellScript(): string {
  return String.raw`
param(
  [int]$ProcessId,
  [int]$Left,
  [int]$Top,
  [int]$Width,
  [int]$Height
)

$ErrorActionPreference = 'SilentlyContinue'

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;

public static class Live2DWindowNative {
  public const int GWL_STYLE = -16;
  public const int GWL_EXSTYLE = -20;
  public const int WS_CAPTION = 0x00C00000;
  public const int WS_THICKFRAME = 0x00040000;
  public const int WS_MINIMIZEBOX = 0x00020000;
  public const int WS_MAXIMIZEBOX = 0x00010000;
  public const int WS_SYSMENU = 0x00080000;
  public const int WS_EX_DLGMODALFRAME = 0x00000001;
  public const int WS_EX_CLIENTEDGE = 0x00000200;
  public const int WS_EX_STATICEDGE = 0x00020000;
  public const int SWP_NOSIZE = 0x0001;
  public const int SWP_NOMOVE = 0x0002;
  public const int SWP_NOZORDER = 0x0004;
  public const int SWP_NOACTIVATE = 0x0010;
  public const int SWP_FRAMECHANGED = 0x0020;
  public const int SWP_SHOWWINDOW = 0x0040;
  public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  public static IntPtr FindWindowByProcessId(int processId) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((hWnd, lParam) => {
      if (!IsWindowVisible(hWnd)) { return true; }
      GetWindowThreadProcessId(hWnd, out int windowPid);
      if (windowPid == processId) {
        found = hWnd;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static void ApplyFloatingStyle(IntPtr hWnd, int left, int top, int width, int height) {
    if (hWnd == IntPtr.Zero) { return; }

    SetWindowPos(hWnd, HWND_TOPMOST, left, top, width, height, SWP_NOZORDER | SWP_NOACTIVATE);

    IntPtr styleValue = GetWindowLongPtr(hWnd, GWL_STYLE);
    long style = styleValue.ToInt64();
    style &= ~(WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU);
    SetWindowLongPtr(hWnd, GWL_STYLE, new IntPtr(style));

    IntPtr exStyleValue = GetWindowLongPtr(hWnd, GWL_EXSTYLE);
    long exStyle = exStyleValue.ToInt64();
    exStyle &= ~(WS_EX_DLGMODALFRAME | WS_EX_CLIENTEDGE | WS_EX_STATICEDGE);
    SetWindowLongPtr(hWnd, GWL_EXSTYLE, new IntPtr(exStyle));

    SetWindowPos(hWnd, HWND_TOPMOST, left, top, width, height, SWP_FRAMECHANGED | SWP_SHOWWINDOW);
    SetWindowPos(hWnd, HWND_TOPMOST, left, top, width, height, SWP_SHOWWINDOW);
  }
}
"@

try {
  $process = [System.Diagnostics.Process]::GetProcessById($ProcessId)
} catch {
  exit 0
}

try { [void]$process.WaitForInputIdle(5000) } catch {}

$deadline = [DateTime]::UtcNow.AddSeconds(8)
while ([DateTime]::UtcNow -lt $deadline) {
  $hWnd = [Live2DWindowNative]::FindWindowByProcessId($ProcessId)
  if ($hWnd -ne [IntPtr]::Zero) {
    [Live2DWindowNative]::ApplyFloatingStyle($hWnd, $Left, $Top, $Width, $Height)
    exit 0
  }
  Start-Sleep -Milliseconds 200
}

exit 0
`;
}
