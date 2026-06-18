chcp 65001 >nul
Write-Host "=== 系统环境快照 ==="
$ver = [System.Environment]::OSVersion.Version
Write-Host "OS: Windows Build $($ver.Build), Arch: $(if ([Environment]::Is64BitOperatingSystem) {'x64'} else {'x86'})"
Write-Host ""
Write-Host "--- 包管理器 ---"
foreach ($pm in @("scoop", "winget", "choco")) {
    $c = Get-Command $pm -ErrorAction SilentlyContinue
    if ($c) { Write-Host "$pm : 已安装" } else { Write-Host "$pm : 未安装" }
}
Write-Host ""
Write-Host "--- CLI 工具 ---"
foreach ($cmd in @("gh", "git", "curl.exe")) {
    $c = Get-Command $cmd -ErrorAction SilentlyContinue
    if ($c) {
        try { $v = & $cmd --version 2>&1 | Select-Object -First 1; Write-Host "$cmd : $v" }
        catch { Write-Host "$cmd : 已安装" }
    } else { Write-Host "$cmd : 未安装" }
}
