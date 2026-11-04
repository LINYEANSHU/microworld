# measure2.ps1 — 私有工作集口径测量 + 进程数优化试验
$ErrorActionPreference = 'SilentlyContinue'

function Measure-Tree {
  $procs = Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*MicroWorld*profile*' }
  $all = Get-CimInstance Win32_Process -Filter "Name='msedge.exe'"
  $ids = $procs.ProcessId
  $extra = @($all | Where-Object { ($ids -contains $_.ParentProcessId) -and (-not ($ids -contains $_.ProcessId)) })
  $allIds = @($ids) + @($extra.ProcessId)
  $privWS = 0
  $counters = (Get-Counter '\Process(msedge*)\Working Set - Private' -ErrorAction SilentlyContinue).CounterSamples
  # 只统计属于我们进程树的（按pid名字匹配较麻烦，用近似：msedge全部私有WS × 我们占比）——
  # 更精确：直接用 PROCESS_MEMORY_COUNTERS EX 读每pid的PrivateWorkingSetSize
  Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class PM {
  [StructLayout(LayoutKind.Sequential)]
  public struct PMC { public uint cb, PageFaultCount; public IntPtr PeakWorkingSet, WorkingSet, QuotaPeakPagedPool, QuotaPagedPool, QuotaPeakNonPagedPool, QuotaNonPagedPool, Pagefile, PeakPagefile; public IntPtr Private; }
  [DllImport("psapi.dll")] public static extern bool GetProcessMemoryInfo(IntPtr h, out PMC p, uint sz);
  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint a, bool inh, int pid);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
}
'@
  $sumPrivCommit = 0
  foreach ($id in $allIds) {
    $h = [PM]::OpenProcess(0x0400, $false, $id) # PROCESS_QUERY_INFORMATION
    if ($h -ne [IntPtr]::Zero) {
      $pmc = New-Object PM+PMC
      if ([PM]::GetProcessMemoryInfo($h, [ref]$pmc, [uint32][Runtime.InteropServices.Marshal]::SizeOf($pmc))) {
        $sumPrivCommit += [int64]$pmc.Private
      }
      [PM]::CloseHandle($h) | Out-Null
    }
  }
  # 私有工作集（真实RAM口径）
  $ramPriv = 0
  foreach ($id in $allIds) {
    $c = Get-Counter "\Process(msedge)\Working Set - Private" -ErrorAction SilentlyContinue
  }
  Write-Host ('进程: ' + $allIds.Count + ' | 私有提交: ' + [Math]::Round($sumPrivCommit / 1MB, 1) + ' MiB')
  return $allIds.Count
}

# 清理
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*MicroWorld*profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Seconds 2

$browser = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $browser)) { $browser = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" }
$url = ([System.Uri]'G:\My_project\娱乐项目\MicroWorld\index.html').AbsoluteUri
$flags = @("--app=$url", "--user-data-dir=`"$env:LOCALAPPDATA\MicroWorld\profile`"", '--window-size=1024,640', '--no-first-run', '--no-default-browser-check')

Write-Host '== 默认启动 =='
Start-Process -FilePath $browser -ArgumentList $flags
Start-Sleep -Seconds 10
Measure-Tree | Out-Null

# 清理 + 进程合并启动
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*MicroWorld*profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Seconds 2
Write-Host '== --process-per-site 启动 =='
Start-Process -FilePath $browser -ArgumentList ($flags + @('--process-per-site', '--disable-features=CalculateNativeWinOcclusion'))
Start-Sleep -Seconds 10
Measure-Tree | Out-Null
