# topmost.ps1 — 切换《微疫世界》窗口置顶状态（对已打开的窗口）
$ErrorActionPreference = 'SilentlyContinue'
$sig = @'
using System;
using System.Runtime.InteropServices;
public class Win2 {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] public static extern IntPtr GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern IntPtr SetWindowLong(IntPtr h, int i, IntPtr v);
}
'@
Add-Type -TypeDefinition $sig
$hwnd = [Win2]::FindWindow($null, '微疫世界')
if ($hwnd -eq [IntPtr]::Zero) { Write-Host '未找到标题为“微疫世界”的窗口'; exit 1 }
# 读取 ExStyle 的 TOPMOST 位（GWL_EXSTYLE=-20, WS_EX_TOPMOST=0x8）
$ex = [Win2]::GetWindowLong($hwnd, -20)
if (([int64]$ex -band 0x8) -ne 0) {
  [Win2]::SetWindowPos($hwnd, [IntPtr](-2), 0, 0, 0, 0, 0x0003) | Out-Null  # NOTOPMOST
  Write-Host '已取消置顶'
} else {
  [Win2]::SetWindowPos($hwnd, [IntPtr](-1), 0, 0, 0, 0, 0x0003) | Out-Null  # TOPMOST
  Write-Host '已置顶'
}
