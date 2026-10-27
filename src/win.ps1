param(
  [Parameter(Mandatory = $true)][string]$Action,
  [string]$Out,
  [int]$X = 0,
  [int]$Y = 0,
  [int]$W = 0,
  [int]$H = 0,
  [int]$Monitor = 0,
  [int]$ProcessId = 0,
  [string]$Title = "",
  [long]$Hwnd = 0,
  [string]$TitleBase64 = ""
)

$ErrorActionPreference = "Stop"
# UTF-8 both ways: window titles are rarely ASCII.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
if ($TitleBase64) {
  $Title = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($TitleBase64))
}
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$signature = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public class HsbWin {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }

  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int GetWindowTextLengthW(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern int GetWindowLongW(IntPtr hWnd, int index);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetWindowDC(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hdc);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out RECT value, int size);
  [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr hdcDest, int x, int y, int width, int height, IntPtr hdcSrc, int srcX, int srcY, int rop);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();

  /** Physical pixels everywhere: without this, a 200% display reports 1600x1000. */
  public static void EnsureDpi() {
    try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch { }
    try { SetProcessDPIAware(); } catch { }
  }

  public class WindowInfo {
    public long handle;
    public int pid;
    public string title;
    public string process;
    public int x, y, width, height;
    public bool visible;
    public bool minimized;
    public bool maximized;
  }

  public static List<WindowInfo> List() {
    var result = new List<WindowInfo>();
    EnumWindows((hWnd, lParam) => {
      if (!IsWindowVisible(hWnd)) return true;
      int length = GetWindowTextLengthW(hWnd);
      if (length == 0) return true;
      var builder = new StringBuilder(length + 1);
      GetWindowTextW(hWnd, builder, builder.Capacity);
      string title = builder.ToString();
      if (string.IsNullOrWhiteSpace(title)) return true;
      int exStyle = GetWindowLongW(hWnd, -20);
      if ((exStyle & 0x00000080) != 0) return true; // WS_EX_TOOLWINDOW
      RECT rect;
      if (!GetWindowRect(hWnd, out rect)) return true;
      RECT frame;
      if (DwmGetWindowAttribute(hWnd, 9, out frame, Marshal.SizeOf(typeof(RECT))) == 0) rect = frame;
      int width = rect.Right - rect.Left;
      int height = rect.Bottom - rect.Top;
      if (width <= 0 || height <= 0) return true;
      if (rect.Left <= -10000 || rect.Top <= -10000) return true; // cloaked / minimised
      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      string process = "";
      try { process = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch { }
      result.Add(new WindowInfo {
        handle = hWnd.ToInt64(), pid = (int)pid, title = title, process = process,
        x = rect.Left, y = rect.Top, width = width, height = height,
        visible = true, minimized = IsIconic(hWnd), maximized = IsZoomed(hWnd),
      });
      return true;
    }, IntPtr.Zero);
    return result;
  }
}
'@

if (-not ("HsbWin" -as [type])) {
  Add-Type -TypeDefinition $signature -ReferencedAssemblies System.Drawing
}
[HsbWin]::EnsureDpi()

function Get-Monitors {
  $list = @()
  $index = 0
  foreach ($screen in [System.Windows.Forms.Screen]::AllScreens) {
    $list += [ordered]@{
      index      = $index
      id         = $screen.DeviceName
      name       = $screen.DeviceName
      primary    = $screen.Primary
      x          = $screen.Bounds.X
      y          = $screen.Bounds.Y
      width      = $screen.Bounds.Width
      height     = $screen.Bounds.Height
      workX      = $screen.WorkingArea.X
      workY      = $screen.WorkingArea.Y
      workWidth  = $screen.WorkingArea.Width
      workHeight = $screen.WorkingArea.Height
    }
    $index++
  }
  return $list
}

function Save-Bitmap($bitmap, $path) {
  $directory = [System.IO.Path]::GetDirectoryName($path)
  if ($directory -and -not (Test-Path $directory)) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

function Capture-Rect([int]$left, [int]$top, [int]$width, [int]$height, $path) {
  if ($width -le 0 -or $height -le 0) { throw "region must be positive, got ${width}x${height}" }
  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen($left, $top, 0, 0, (New-Object System.Drawing.Size $width, $height), [System.Drawing.CopyPixelOperation]::SourceCopy)
  $graphics.Dispose()
  Save-Bitmap $bitmap $path
  return [ordered]@{ path = $path; x = $left; y = $top; width = $width; height = $height }
}

function Capture-Window([long]$handle, $path) {
  $hwnd = [IntPtr]::new($handle)
  $rect = New-Object HsbWin+RECT
  if (-not [HsbWin]::GetWindowRect($hwnd, [ref]$rect)) { throw "window $handle not found" }
  $frame = New-Object HsbWin+RECT
  if ([HsbWin]::DwmGetWindowAttribute($hwnd, 9, [ref]$frame, [System.Runtime.InteropServices.Marshal]::SizeOf([type][HsbWin+RECT])) -eq 0) {
    $rect = $frame
  }
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) { throw "window $handle has no drawable area (${width}x${height})" }

  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $hdc = $graphics.GetHdc()
  # PW_RENDERFULLCONTENT = 2: renders DirectComposition content, so an occluded window still appears.
  $ok = [HsbWin]::PrintWindow($hwnd, $hdc, 2)
  if (-not $ok) { $ok = [HsbWin]::PrintWindow($hwnd, $hdc, 0) }
  $graphics.ReleaseHdc($hdc)
  $graphics.Dispose()

  if (-not $ok) {
    # Some windows (Task Manager, DRM-protected players) refuse PrintWindow;
    # copying the window's own DC still works for the visible part.
    $sourceDc = [HsbWin]::GetWindowDC($hwnd)
    if ($sourceDc -ne [IntPtr]::Zero) {
      $graphics2 = [System.Drawing.Graphics]::FromImage($bitmap)
      $destDc = $graphics2.GetHdc()
      $ok = [HsbWin]::BitBlt($destDc, 0, 0, $width, $height, $sourceDc, 0, 0, 0x00CC0020)
      $graphics2.ReleaseHdc($destDc)
      $graphics2.Dispose()
      [HsbWin]::ReleaseDC($hwnd, $sourceDc) | Out-Null
    }
  }

  if (-not $ok) {
    $bitmap.Dispose()
    throw "this window refuses PrintWindow and BitBlt (protected or DRM), handle $handle"
  }

  # A protected (DRM/UWP) window comes back black: sample a grid and refuse it.
  $grid = 8
  $dark = 0
  $total = 0
  for ($gy = 0; $gy -lt $grid; $gy++) {
    for ($gx = 0; $gx -lt $grid; $gx++) {
      $sx = [int][math]::Floor(($width - 1) * (0.1 + 0.8 * $gx / ($grid - 1)))
      $sy = [int][math]::Floor(($height - 1) * (0.1 + 0.8 * $gy / ($grid - 1)))
      $pixel = $bitmap.GetPixel($sx, $sy)
      $total++
      if ($pixel.R -lt 16 -and $pixel.G -lt 16 -and $pixel.B -lt 16) { $dark++ }
    }
  }
  if ($total -gt 0 -and ($dark / $total) -ge 0.92) {
    $bitmap.Dispose()
    throw "window $handle captured as a black frame: the app blocks screen capture (DRM or protected content)"
  }

  Save-Bitmap $bitmap $path
  return [ordered]@{ path = $path; handle = $handle; x = $rect.Left; y = $rect.Top; width = $width; height = $height }
}

switch ($Action) {
  "monitors" {
    Get-Monitors | ConvertTo-Json -Depth 4 -Compress
    break
  }
  "windows" {
    [HsbWin]::List() | ConvertTo-Json -Depth 4 -Compress
    break
  }
  "capture-monitor" {
    $monitors = @(Get-Monitors)
    if ($Monitor -lt 0 -or $Monitor -ge $monitors.Count) { throw "monitor $Monitor not found; count=$($monitors.Count)" }
    $m = $monitors[$Monitor]
    Capture-Rect $m.x $m.y $m.width $m.height $Out | ConvertTo-Json -Compress
    break
  }
  "capture-region" {
    Capture-Rect $X $Y $W $H $Out | ConvertTo-Json -Compress
    break
  }
  "capture-window" {
    $target = [long]$Hwnd
    if ($target -eq 0) {
      $windows = [HsbWin]::List()
      if ($ProcessId -gt 0) {
        $target = ($windows | Where-Object { $_.pid -eq $ProcessId -and -not $_.minimized } | Sort-Object { $_.width * $_.height } -Descending | Select-Object -First 1).handle
        if (-not $target) { $target = ($windows | Where-Object { $_.pid -eq $ProcessId } | Sort-Object { $_.width * $_.height } -Descending | Select-Object -First 1).handle }
      } elseif ($Title) {
        $target = ($windows | Where-Object { $_.title -like "*$Title*" -and -not $_.minimized } | Sort-Object { $_.width * $_.height } -Descending | Select-Object -First 1).handle
        if (-not $target) { $target = ($windows | Where-Object { $_.title -like "*$Title*" } | Select-Object -First 1).handle }
      }
    }
    if (-not $target) { throw "no window matched pid=$ProcessId title=$Title" }
    Capture-Window $target $Out | ConvertTo-Json -Compress
    break
  }
  default { throw "unknown action: $Action" }
}
