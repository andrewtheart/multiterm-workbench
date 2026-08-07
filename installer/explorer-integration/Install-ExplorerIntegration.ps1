#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$AppPath,
    [switch]$Uninstall,
    [switch]$FinalizeUninstall,
    [switch]$ClassicOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$PackageName = 'MultiTerm.Workbench.ExplorerIntegration'
$StateKey = 'HKCU:\Software\MultiTerm Workbench\ExplorerIntegration'
$VerbKeys = @(
    'HKCU:\Software\Classes\Directory\shell\MultiTerm.Workbench',
    'HKCU:\Software\Classes\Directory\Background\shell\MultiTerm.Workbench'
)

function Remove-ModernPackage {
    Get-AppxPackage -Name $PackageName -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-AppxPackage -Package $_.PackageFullName -ErrorAction Stop
    }
}

function Remove-ClassicVerbs {
    foreach ($key in $VerbKeys) {
        Remove-Item -LiteralPath $key -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Notify-Explorer {
    if (-not ('MultiTerm.ExplorerIntegration.ShellNotify' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace MultiTerm.ExplorerIntegration
{
    public static class ShellNotify
    {
        [DllImport("shell32.dll")]
        private static extern void SHChangeNotify(uint eventId, uint flags, IntPtr item1, IntPtr item2);
        public static void AssociationsChanged()
        {
            SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero);
        }
    }
}
'@
    }
    [MultiTerm.ExplorerIntegration.ShellNotify]::AssociationsChanged()
}

if ($FinalizeUninstall.IsPresent) {
    Remove-Item -LiteralPath $StateKey -Recurse -Force -ErrorAction SilentlyContinue
    return
}

if ($Uninstall.IsPresent) {
    Remove-ClassicVerbs
    Remove-ModernPackage
    Notify-Explorer
    return
}

$resolvedAppPath = (Resolve-Path -LiteralPath $AppPath).Path
$scriptPath = Join-Path $resolvedAppPath 'Start-MultiTerm.ps1'
$iconPath = Join-Path $resolvedAppPath 'MultiTerm.ico'
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "Cannot find MultiTerm launcher at $scriptPath"
}

$powershell = Join-Path $PSHOME 'powershell.exe'
$commandPrefix = '"{0}" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{1}" -OpenFolder ' -f $powershell, $scriptPath
$commands = @(
    ($commandPrefix + '"%1\."')
    ($commandPrefix + '"%V\."')
)

for ($index = 0; $index -lt $VerbKeys.Count; $index += 1) {
    $verbKey = $VerbKeys[$index]
    New-Item -Path $verbKey -Force | Out-Null
    Set-Item -LiteralPath $verbKey -Value 'Open in MultiTerm'
    New-ItemProperty -LiteralPath $verbKey -Name 'Icon' -Value $iconPath -PropertyType String -Force | Out-Null
    New-ItemProperty -LiteralPath $verbKey -Name 'MultiSelectModel' -Value 'Single' -PropertyType String -Force | Out-Null
    $commandKey = Join-Path $verbKey 'command'
    New-Item -Path $commandKey -Force | Out-Null
    Set-Item -LiteralPath $commandKey -Value $commands[$index]
}

# Windows 10 uses only the classic verbs. Windows 11 additionally needs a signed
# sparse package and IExplorerCommand registration to appear in the modern menu.
if (-not $ClassicOnly.IsPresent -and [Environment]::OSVersion.Version.Build -ge 22000) {
    $nativeArchitecture = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    $architecture = switch -Regex ($nativeArchitecture) {
        '^ARM64$' { 'arm64'; break }
        '^(AMD64|x64)$' { 'x64'; break }
        default { 'x86' }
    }
    $packagePath = Join-Path $resolvedAppPath ("Explorer\Packages\MultiTermExplorer-{0}.msix" -f $architecture)
    $certificatePath = Join-Path $resolvedAppPath 'Explorer\MultiTermExplorer.cer'
    if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) { throw "Cannot find Explorer package at $packagePath" }
    if (-not (Test-Path -LiteralPath $certificatePath -PathType Leaf)) { throw "Cannot find Explorer certificate at $certificatePath" }

    $newCertificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($certificatePath)

    Remove-ModernPackage
    Remove-Item -LiteralPath $StateKey -Recurse -Force -ErrorAction SilentlyContinue
    Add-AppxPackage -Path $packagePath -ExternalLocation $resolvedAppPath
    New-Item -Path $StateKey -Force | Out-Null
    New-ItemProperty -LiteralPath $StateKey -Name CertificateThumbprint -Value $newCertificate.Thumbprint -PropertyType String -Force | Out-Null
}

Notify-Explorer
