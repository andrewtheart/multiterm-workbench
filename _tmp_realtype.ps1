param(
  [Parameter(Mandatory=$true)][int]$ProcId,
  [Parameter(Mandatory=$true)][string]$Text
)
# Real OS keyboard input: activate the Electron window (by main-process PID) then SendKeys.
Add-Type -AssemblyName System.Windows.Forms
$sh = New-Object -ComObject WScript.Shell
$sh.AppActivate($ProcId) | Out-Null
Start-Sleep -Milliseconds 200
[System.Windows.Forms.SendKeys]::SendWait($Text)
Write-Output "typed"
