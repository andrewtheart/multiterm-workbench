#Requires -Version 5.1
<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 #>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Install", "Uninstall")]
  [string]$Action,

  [Parameter(Mandatory = $true)]
  [string]$AppPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$resolvedAppPath = [IO.Path]::GetFullPath($AppPath).TrimEnd("\")
$markerPath = Join-Path $resolvedAppPath "SystemPathInstalled.json"

function Normalize-PathEntry {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ""
  }

  $trimmed = $Value.Trim().Trim('"').TrimEnd("\")
  try {
    return [IO.Path]::GetFullPath(
      [Environment]::ExpandEnvironmentVariables($trimmed)
    ).TrimEnd("\")
  } catch {
    return $trimmed
  }
}

function Test-ProtectedInstallPath {
  $protectedRoots = @(
    $env:ProgramFiles
    ${env:ProgramFiles(x86)}
    $env:ProgramW6432
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  foreach ($root in $protectedRoots) {
    $normalizedRoot = Normalize-PathEntry $root
    if (
      ($resolvedAppPath -ieq $normalizedRoot) -or
      $resolvedAppPath.StartsWith(
        "$normalizedRoot\",
        [StringComparison]::OrdinalIgnoreCase
      )
    ) {
      return $true
    }
  }

  return $false
}

if (-not (Test-ProtectedInstallPath)) {
  throw "Refusing to modify the system PATH for an install outside Program Files: '$resolvedAppPath'."
}

function Publish-EnvironmentChange {
  if (-not ("MultiTerm.Installer.EnvironmentChange" -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace MultiTerm.Installer
{
    public static class EnvironmentChange
    {
        private static readonly IntPtr HWND_BROADCAST = new IntPtr(0xffff);
        private const uint WM_SETTINGCHANGE = 0x001a;
        private const uint SMTO_ABORTIFHUNG = 0x0002;

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SendMessageTimeout(
            IntPtr hWnd,
            uint message,
            UIntPtr wParam,
            string lParam,
            uint flags,
            uint timeout,
            out UIntPtr result);

        public static void Broadcast()
        {
            UIntPtr result;
            SendMessageTimeout(
                HWND_BROADCAST,
                WM_SETTINGCHANGE,
                UIntPtr.Zero,
                "Environment",
                SMTO_ABORTIFHUNG,
                5000,
                out result);
        }
    }
}
'@
  }

  [MultiTerm.Installer.EnvironmentChange]::Broadcast()
}

$machinePath = [Environment]::GetEnvironmentVariable(
  "Path",
  [EnvironmentVariableTarget]::Machine
)
$entries = @(
  @($machinePath -split ";") |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
)
$normalizedAppPath = Normalize-PathEntry $resolvedAppPath
$matchingEntries = @(
  $entries | Where-Object {
    (Normalize-PathEntry $_) -ieq $normalizedAppPath
  }
)

if ($Action -eq "Install") {
  if ($matchingEntries.Count -eq 0) {
    $entries += $resolvedAppPath
    [Environment]::SetEnvironmentVariable(
      "Path",
      ($entries -join ";"),
      [EnvironmentVariableTarget]::Machine
    )
    try {
      @{
        AppPath = $resolvedAppPath
        InstalledAt = [DateTime]::UtcNow.ToString("o")
      } |
        ConvertTo-Json |
        Set-Content -LiteralPath $markerPath -Encoding UTF8
    } catch {
      [Environment]::SetEnvironmentVariable(
        "Path",
        $machinePath,
        [EnvironmentVariableTarget]::Machine
      )
      Publish-EnvironmentChange
      throw
    }
    Publish-EnvironmentChange
    Write-Host "Added MultiTerm to the system PATH."
  } elseif (Test-Path -LiteralPath $markerPath -PathType Leaf) {
    Write-Host "MultiTerm is already registered in the system PATH."
  } else {
    Write-Host "The install directory is already in the system PATH; leaving the existing entry unmanaged."
  }
  return
}

if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
  Write-Host "No installer-managed MultiTerm system PATH entry was found."
  return
}

$lastMatchingIndex = -1
for ($index = 0; $index -lt $entries.Count; $index++) {
  if ((Normalize-PathEntry $entries[$index]) -ieq $normalizedAppPath) {
    $lastMatchingIndex = $index
  }
}
$remainingEntries = @()
for ($index = 0; $index -lt $entries.Count; $index++) {
  if ($index -ne $lastMatchingIndex) {
    $remainingEntries += $entries[$index]
  }
}
[Environment]::SetEnvironmentVariable(
  "Path",
  ($remainingEntries -join ";"),
  [EnvironmentVariableTarget]::Machine
)
Remove-Item -LiteralPath $markerPath -Force
Publish-EnvironmentChange
Write-Host "Removed MultiTerm from the system PATH."
