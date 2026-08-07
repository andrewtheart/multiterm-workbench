<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later

 Brings the terminal window hosting a MultiTerm bridge to the foreground.

 Windows Terminal offers no API for activating a specific tab, so the tab is
 located through UI Automation by the bridge id that the bridge puts at the
 front of its console title. Kept out of the bridge process on purpose: the
 bridge compiles its C# at startup, and a missing UI Automation assembly there
 would stop the bridge from running at all.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BridgeId,
    [int]$ProcessId = 0
)

$ErrorActionPreference = 'Stop'

function Write-Result {
    param([bool]$Ok, [string]$Method, [string]$Reason)
    $payload = [ordered]@{ ok = $Ok; method = $Method; reason = $Reason }
    Write-Output ($payload | ConvertTo-Json -Compress)
    if ($Ok) { exit 0 } else { exit 2 }
}

if ($BridgeId -notmatch '^BRIDGE-[0-9]{3,}$') {
    Write-Result -Ok $false -Method 'none' -Reason 'The bridge id is not in the expected BRIDGE-nnn form.'
}

if (-not ('MultiTerm.WindowFocus' -as [type])) {
    Add-Type -Namespace 'MultiTerm' -Name 'WindowFocus' -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr lpdwProcessId);
[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
[DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
'@
}

function Set-ForegroundWindowReliably {
    param([IntPtr]$Handle)
    if ($Handle -eq [IntPtr]::Zero) { return $false }
    if ([MultiTerm.WindowFocus]::IsIconic($Handle)) {
        [void][MultiTerm.WindowFocus]::ShowWindow($Handle, 9)  # SW_RESTORE
    }
    # A background process cannot simply call SetForegroundWindow; Windows only
    # honours it while our input queue is attached to the current foreground one.
    $foreground = [MultiTerm.WindowFocus]::GetForegroundWindow()
    $ourThread = [MultiTerm.WindowFocus]::GetCurrentThreadId()
    $theirThread = [MultiTerm.WindowFocus]::GetWindowThreadProcessId($foreground, [IntPtr]::Zero)
    $attached = $false
    if ($theirThread -ne 0 -and $theirThread -ne $ourThread) {
        $attached = [MultiTerm.WindowFocus]::AttachThreadInput($ourThread, $theirThread, $true)
    }
    try {
        [void][MultiTerm.WindowFocus]::SetForegroundWindow($Handle)
    } finally {
        if ($attached) { [void][MultiTerm.WindowFocus]::AttachThreadInput($ourThread, $theirThread, $false) }
    }
    if ([MultiTerm.WindowFocus]::GetForegroundWindow() -ne $Handle) {
        [MultiTerm.WindowFocus]::SwitchToThisWindow($Handle, $true)
    }
    return ([MultiTerm.WindowFocus]::GetForegroundWindow() -eq $Handle)
}

try {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
} catch {
    Write-Result -Ok $false -Method 'none' -Reason "UI Automation is unavailable on this machine: $($_.Exception.Message)"
}

$terminals = @(Get-Process -Name 'WindowsTerminal' -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 })

foreach ($terminal in $terminals) {
    $root = $null
    try {
        $root = [System.Windows.Automation.AutomationElement]::FromHandle($terminal.MainWindowHandle)
    } catch {
        continue
    }
    if ($null -eq $root) { continue }

    $condition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::TabItem)
    $tabs = $null
    try {
        $tabs = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
    } catch {
        continue
    }
    if ($null -eq $tabs) { continue }

    foreach ($tab in $tabs) {
        if ($tab.Current.Name -notlike "*$BridgeId*") { continue }
        try {
            $pattern = $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
            $pattern.Select()
        } catch {
            # An unselectable tab still tells us which window to raise.
        }
        $raised = Set-ForegroundWindowReliably -Handle $terminal.MainWindowHandle
        Write-Result -Ok $raised -Method 'windows-terminal-tab' -Reason $(
            if ($raised) { "Selected the $BridgeId tab." }
            else { "Selected the $BridgeId tab, but Windows refused to change the foreground window." })
    }
}

# Not hosted by Windows Terminal: raise the bridge's own console window instead.
if ($ProcessId -gt 0) {
    $owner = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($owner -and $owner.MainWindowHandle -ne 0) {
        $raised = Set-ForegroundWindowReliably -Handle $owner.MainWindowHandle
        Write-Result -Ok $raised -Method 'console-window' -Reason $(
            if ($raised) { 'Raised the bridge console window.' }
            else { 'Windows refused to change the foreground window.' })
    }
}

Write-Result -Ok $false -Method 'none' -Reason "No terminal tab or console window titled $BridgeId is open."
