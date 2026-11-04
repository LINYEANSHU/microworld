# measure.ps1 — 清理旧实例 → 单实例启动 → 测量进程树内存 → 置顶验证（测试工具，非游戏依赖）
$ErrorActionPreference = 'SilentlyContinue'

# 清理所有本游戏实例
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
  Where-Object { $_.CommandLine -like '*MicroWorld*profile*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Seconds 2

# 单实例启动
$browser = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $browser)) { $browser = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" }
$url = ([System.Uri]'G:\My_project\娱乐项目\MicroWorld\index.html').AbsoluteUri
Start-Process -FilePath $browser -ArgumentList @(
  "--app=$url",
  "--user-data-dir=`"$env:LOCALAPPDATA\MicroWorld\profile`"",
  '--window-size=1024,640', '--no-first-run', '--no-default-browser-check'
)
Start-Sleep -Seconds 8

# 进程树统计
$procs = Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*MicroWorld*profile*' }
$all = Get-CimInstance Win32_Process -Filter "Name='msedge.exe'"
$ids = $procs.ProcessId
$extra = @($all | Where-Object { ($ids -contains $_.ParentProcessId) -and (-not ($ids -contains $_.ProcessId)) })
$priv = 0; $ws = 0
foreach ($id in (@($ids) + @($extra.ProcessId))) {
  $gp = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($gp) { $priv += $gp.PrivateMemorySize64; $ws += $gp.WorkingSet64 }
}
Write-Host ('单实例进程树: ' + $procs.Count + '+' + $extra.Count + ' 进程')
Write-Host ('私有内存: ' + [Math]::Round($priv / 1MB, 1) + ' MiB | 工作集: ' + [Math]::Round($ws / 1MB, 1) + ' MiB')

# 置顶（按精确标题）
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public class WE2 {
  public delegate bool CB(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(CB cb, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
  public static IntPtr FindTitle(string pre) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => { if (IsWindowVisible(h)) { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); if (sb.ToString() == pre) { found = h; return false; } } return true; }, IntPtr.Zero);
    return found;
  }
}
'@
$h = [WE2]::FindTitle('微疫世界')
if ($h -ne [IntPtr]::Zero) {
  [WE2]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x0003) | Out-Null
  Write-Host '窗口已找到并置顶'
} else {
  Write-Host '窗口未找到'
}
