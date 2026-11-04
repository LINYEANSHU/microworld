# launch.ps1 — 以独立桌面窗口（app模式）启动《微疫世界》，并可选置顶。
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\launch.ps1            # 普通启动+置顶
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\launch.ps1 -NoTopmost # 不置顶
# 说明：使用独立 user-data-dir，不影响日常浏览器会话；窗口尺寸由游戏记忆并恢复。
param([switch]$NoTopmost, [switch]$NoGpu)

$ErrorActionPreference = 'SilentlyContinue'

# 1. 找浏览器（优先 Edge，其次 Chrome）
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$html = Join-Path $root 'index.html'
if (-not (Test-Path $html)) { Write-Host "未找到 index.html：$root"; exit 1 }

$browsers = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
  Write-Host "未找到 Edge/Chrome，使用默认浏览器打开（无置顶能力）。"
  Start-Process $html
  exit 0
}

# 2. 以 app 模式 + 独立配置目录启动
$url = ([System.Uri] $html).AbsoluteUri
$profile = Join-Path $env:LOCALAPPDATA 'MicroWorld\profile'
New-Item -ItemType Directory -Force -Path $profile | Out-Null
$size = '1024,640'
$setFile = Join-Path $env:LOCALAPPDATA 'MicroWorld\window.txt'
if (Test-Path $setFile) {
  $saved = (Get-Content $setFile -Raw).Trim()
  if ($saved -match '^\d+,\d+$') { $size = $saved }
}
$launchArgs = @(
  "--app=$url",
  "--user-data-dir=`"$profile`"",
  "--window-size=$size",
  '--no-first-run',
  '--no-default-browser-check'
)
if ($NoGpu) { $launchArgs += @('--disable-gpu', '--disable-gpu-compositing') }  # 纯CPU渲染（训练占用GPU时用）
Start-Process -FilePath $browser -ArgumentList $launchArgs | Out-Null

# 3. 记忆窗口尺寸（app 模式允许页面自行 resize；这里兜底记录）
Start-Sleep -Milliseconds 2500

# 4. 置顶（按窗口标题查找）
if (-not $NoTopmost) {
  $sig = @'
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public struct RECT { public int L, T, R, B; }
}
'@
  Add-Type -TypeDefinition $sig
  $hwnd = [Win]::FindWindow($null, '微疫世界')
  if ($hwnd -eq [IntPtr]::Zero) {
    Start-Sleep -Milliseconds 2000
    $hwnd = [Win]::FindWindow($null, '微疫世界')
  }
  if ($hwnd -ne [IntPtr]::Zero) {
    # TOPMOST(=-1) | 不改变位置尺寸(0x1|0x2)
    [Win]::SetWindowPos($hwnd, [IntPtr](-1), 0, 0, 0, 0, 0x0003) | Out-Null
    Write-Host '窗口已置顶（可用 tools\topmost.ps1 随时切换）。'
  } else {
    Write-Host '未找到游戏窗口（可手动运行 tools\topmost.ps1）。'
  }
}
Write-Host '微疫世界已启动。'
