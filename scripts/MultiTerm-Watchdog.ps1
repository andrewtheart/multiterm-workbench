param(
  [switch]$Stop,
  [string]$PromptBridgeUrl = "",
  [int]$PromptSessionCount = -1,
  [switch]$PromptUnhealthy
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

$mutexName = "Local\MultiTermWatchdog"
$stopEventName = "Local\MultiTermWatchdogStop"

if ($Stop) {
  try {
    $existingEvent = [Threading.EventWaitHandle]::OpenExisting($stopEventName)
    [void]$existingEvent.Set()
    $existingEvent.Dispose()
  } catch [Threading.WaitHandleCannotBeOpenedException] {
    # No watchdog is running in this interactive Windows session.
  }
  exit 0
}

$multiTermDirectory = Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) "MultiTerm"
$instanceDirectory = Join-Path $multiTermDirectory "Instances"
$logPath = Join-Path $multiTermDirectory "watchdog.log"
$pollMilliseconds = 2000
$rendererGraceSeconds = 12
$healthFailureThreshold = 3
$states = @{}

function Write-WatchdogLog {
  param([string]$Message)

  try {
    if (-not (Test-Path -LiteralPath $multiTermDirectory -PathType Container)) {
      [void](New-Item -ItemType Directory -Path $multiTermDirectory -Force)
    }
    if ((Test-Path -LiteralPath $logPath -PathType Leaf) -and (Get-Item -LiteralPath $logPath).Length -gt 1MB) {
      Move-Item -LiteralPath $logPath -Destination ($logPath + ".previous") -Force
    }
    Add-Content -LiteralPath $logPath -Encoding UTF8 -Value ("{0:o} {1}" -f [DateTime]::UtcNow, $Message)
  } catch {
    # Logging must never stop bridge monitoring.
  }
}

function Test-LoopbackInstanceUri {
  param(
    [Uri]$Uri,
    [int]$Port
  )

  if ($null -eq $Uri -or $Uri.Scheme -ne "http" -or $Uri.Port -ne $Port) {
    return $false
  }
  return $Uri.Host -in @("127.0.0.1", "localhost", "::1")
}

function Show-BridgeClosePrompt {
  param(
    [string]$Url,
    [int]$SessionCount
  )

  Add-Type -AssemblyName PresentationFramework
  $sessionWord = if ($SessionCount -eq 1) { "session is" } else { "sessions are" }
  $message = @"
The MultiTerm window connected to $Url has closed, but $SessionCount terminal $sessionWord still running.

Do you want to close this bridge?

Closing the bridge asks each terminal to exit cleanly first. Commands that are still running after the grace period will be interrupted and then terminated.

Choose No to leave the bridge and all terminal sessions running.
"@
  return [System.Windows.MessageBox]::Show(
    $message,
    "MultiTerm bridge still running",
    [System.Windows.MessageBoxButton]::YesNo,
    [System.Windows.MessageBoxImage]::Warning
  )
}

function Show-UnhealthyBridgeWarning {
  param([string]$Url)

  Add-Type -AssemblyName PresentationFramework
  [void][System.Windows.MessageBox]::Show(
    "The MultiTerm watchdog cannot contact the bridge at $Url, although its process is still running. Terminal monitoring is temporarily unavailable. Check the MultiTerm watchdog log for details.",
    "MultiTerm bridge is not responding",
    [System.Windows.MessageBoxButton]::OK,
    [System.Windows.MessageBoxImage]::Warning
  )
}

function Stop-WatchedBridge {
  param([Uri]$BaseUri)

  Invoke-WebRequest `
    -Uri ([Uri]::new($BaseUri, "shutdown")) `
    -Method Post `
    -Headers @{ "X-MultiTerm-Request" = "Launcher" } `
    -UseBasicParsing `
    -TimeoutSec 5 | Out-Null
}

function Start-WatchdogPrompt {
  param(
    [Uri]$BaseUri,
    [int]$SessionCount,
    [switch]$Unhealthy
  )

  try {
    $powershell = Join-Path $PSHOME "powershell.exe"
    $argumentLine = '-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -PromptBridgeUrl "{1}"' -f `
      $PSCommandPath,
      $BaseUri.AbsoluteUri
    if ($Unhealthy) {
      $argumentLine += " -PromptUnhealthy"
    } else {
      $argumentLine += " -PromptSessionCount $SessionCount"
    }
    Start-Process -FilePath $powershell -ArgumentList $argumentLine -WindowStyle Hidden | Out-Null
    return $true
  } catch {
    Write-WatchdogLog ("Could not launch watchdog prompt for {0}: {1}" -f $BaseUri.AbsoluteUri, $_.Exception.Message)
    return $false
  }
}

if ($PromptBridgeUrl) {
  try {
    $promptUri = [Uri]$PromptBridgeUrl
    if (-not (Test-LoopbackInstanceUri -Uri $promptUri -Port $promptUri.Port)) {
      throw "The prompt URL is not a valid loopback bridge URL."
    }

    if ($PromptUnhealthy) {
      Show-UnhealthyBridgeWarning -Url $promptUri.AbsoluteUri
      exit 0
    }

    if ($PromptSessionCount -lt 0) {
      throw "The prompt session count is invalid."
    }
    $choice = Show-BridgeClosePrompt -Url $promptUri.AbsoluteUri -SessionCount $PromptSessionCount
    if ($choice -eq [System.Windows.MessageBoxResult]::Yes) {
      try {
        Stop-WatchedBridge -BaseUri $promptUri
        Write-WatchdogLog ("Graceful shutdown requested for {0}." -f $promptUri.AbsoluteUri)
      } catch {
        Write-WatchdogLog ("Could not stop {0}: {1}" -f $promptUri.AbsoluteUri, $_.Exception.Message)
        [void][System.Windows.MessageBox]::Show(
          "MultiTerm could not ask the bridge at $($promptUri.AbsoluteUri) to stop. Its terminals remain running.",
          "Could not close MultiTerm bridge",
          [System.Windows.MessageBoxButton]::OK,
          [System.Windows.MessageBoxImage]::Error
        )
      }
    } else {
      Write-WatchdogLog ("User kept bridge {0} running." -f $promptUri.AbsoluteUri)
    }
  } catch {
    Write-WatchdogLog ("Watchdog prompt failed: {0}" -f $_.Exception.Message)
    exit 2
  }
  exit 0
}

$createdMutex = $false
$watchdogMutex = New-Object Threading.Mutex($true, $mutexName, ([ref]$createdMutex))
if (-not $createdMutex) {
  $watchdogMutex.Dispose()
  exit 0
}

$createdStopEvent = $false
$stopEvent = New-Object Threading.EventWaitHandle(
  $false,
  [Threading.EventResetMode]::ManualReset,
  $stopEventName,
  ([ref]$createdStopEvent)
)

Write-WatchdogLog "Watchdog started."

try {
  while (-not $stopEvent.WaitOne(0)) {
    $seen = @{}
    if (Test-Path -LiteralPath $instanceDirectory -PathType Container) {
      foreach ($file in Get-ChildItem -LiteralPath $instanceDirectory -Filter "*.json" -File -ErrorAction SilentlyContinue) {
        $record = $null
        try {
          $record = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
          $recordPid = [int]$record.pid
          $recordPort = [int]$record.port
          $recordUri = [Uri]$record.url
          if ($record.app -ne "MultiTerm Workbench" -or $recordPid -le 0 -or $recordPort -le 0 -or
              -not (Test-LoopbackInstanceUri -Uri $recordUri -Port $recordPort)) {
            throw "Invalid instance record."
          }
        } catch {
          Write-WatchdogLog ("Ignored invalid instance record {0}: {1}" -f $file.FullName, $_.Exception.Message)
          continue
        }

        $key = [string]$recordPid
        $seen[$key] = $true
        $bridgeProcess = Get-Process -Id $recordPid -ErrorAction SilentlyContinue
        if ($null -eq $bridgeProcess) {
          Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
          $states.Remove($key)
          continue
        }

        if (-not $states.ContainsKey($key)) {
          $states[$key] = @{
            Dismissed = $false
            FirstSeen = [DateTime]::UtcNow
            HadRenderer = $false
            HealthFailures = 0
            NoRendererSince = $null
            UnhealthyNotified = $false
          }
        }
        $state = $states[$key]

        try {
          $health = Invoke-RestMethod -Uri ([Uri]::new($recordUri, "health")) -Method Get -TimeoutSec 2
          if ($health.app -ne "MultiTerm Workbench" -or [int]$health.pid -ne $recordPid -or [int]$health.port -ne $recordPort) {
            throw "Bridge identity did not match its instance record."
          }
          $state.HealthFailures = 0
          $state.UnhealthyNotified = $false
        } catch {
          $state.HealthFailures = [int]$state.HealthFailures + 1
          Write-WatchdogLog ("Health check failed for {0}: {1}" -f $recordUri.AbsoluteUri, $_.Exception.Message)
          if ($state.HealthFailures -ge $healthFailureThreshold -and -not $state.UnhealthyNotified) {
            $state.UnhealthyNotified = Start-WatchdogPrompt -BaseUri $recordUri -SessionCount 0 -Unhealthy
          }
          continue
        }

        $rendererClients = [int]$health.rendererClients
        $sessionCount = [int]$health.sessions
        if ($rendererClients -gt 0) {
          $state.HadRenderer = $true
          $state.Dismissed = $false
          $state.NoRendererSince = $null
          continue
        }
        if ([bool]$health.watchdogSuppressed) {
          $state.Dismissed = $true
          continue
        }
        if ($sessionCount -le 0) {
          $state.Dismissed = $false
          $state.NoRendererSince = $null
          continue
        }
        if ($state.Dismissed) {
          continue
        }
        if ($null -eq $state.NoRendererSince) {
          $state.NoRendererSince = [DateTime]::UtcNow
          continue
        }

        $withoutRenderer = ([DateTime]::UtcNow - [DateTime]$state.NoRendererSince).TotalSeconds
        $knownLongEnough = ([DateTime]::UtcNow - [DateTime]$state.FirstSeen).TotalSeconds -ge $rendererGraceSeconds
        if ($withoutRenderer -lt $rendererGraceSeconds -or (-not $state.HadRenderer -and -not $knownLongEnough)) {
          continue
        }

        $state.Dismissed = Start-WatchdogPrompt -BaseUri $recordUri -SessionCount $sessionCount
      }
    }

    foreach ($key in @($states.Keys)) {
      if (-not $seen.ContainsKey($key)) {
        $states.Remove($key)
      }
    }

    if ($stopEvent.WaitOne($pollMilliseconds)) {
      break
    }
  }
} catch {
  Write-WatchdogLog ("Watchdog stopped after an unexpected error: {0}" -f $_.Exception.ToString())
  throw
} finally {
  Write-WatchdogLog "Watchdog stopped."
  $stopEvent.Dispose()
  try { $watchdogMutex.ReleaseMutex() } catch { }
  $watchdogMutex.Dispose()
}
