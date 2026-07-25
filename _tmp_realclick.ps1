param(
  [Parameter(Mandatory=$true)][int]$X,
  [Parameter(Mandatory=$true)][int]$Y
)
# Real OS-level mouse move + left click at physical pixel (X,Y).
Add-Type -Namespace Win32 -Name Rat -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
[DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, System.UIntPtr dwExtraInfo);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
'@
[Win32.Rat]::SetProcessDPIAware() | Out-Null
$LEFTDOWN = 0x0002; $LEFTUP = 0x0004
$cur = New-Object Win32.Rat+POINT
[Win32.Rat]::GetCursorPos([ref]$cur) | Out-Null
$steps = 18
for ($i = 1; $i -le $steps; $i++) {
  $ix = [int]($cur.X + ($X - $cur.X) * $i / $steps)
  $iy = [int]($cur.Y + ($Y - $cur.Y) * $i / $steps)
  [Win32.Rat]::SetCursorPos($ix, $iy) | Out-Null
  Start-Sleep -Milliseconds 8
}
[Win32.Rat]::SetCursorPos($X, $Y) | Out-Null
Start-Sleep -Milliseconds 50
[Win32.Rat]::mouse_event($LEFTDOWN, 0, 0, 0, [System.UIntPtr]::Zero)
Start-Sleep -Milliseconds 50
[Win32.Rat]::mouse_event($LEFTUP, 0, 0, 0, [System.UIntPtr]::Zero)
Write-Output "clicked ${X},${Y}"
