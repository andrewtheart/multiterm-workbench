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
$pollMilliseconds = 10000
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

# A record only describes a live bridge while something still listens on the port
# it registered. Ownership cannot be pinned to the bridge PID: the installed
# bridge serves through HttpListener, so http.sys (PID 4) owns the socket rather
# than the bridge itself. Windows also recycles PIDs, so "that PID exists" alone
# would keep a dead bridge's record alive forever and turn every poll into a
# false health alarm.
function Test-BridgePortHasListener {
  param(
    [int]$Port
  )

  try {
    # Queried unfiltered on purpose: Get-NetTCPConnection *throws* when no row
    # matches, so a port filter cannot tell "nothing is listening" apart from
    # "the TCP table is unreadable". A machine always has some listener.
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop)
  } catch {
    # Without the TCP table we cannot disprove the record, so leave it be and let
    # the health check decide.
    return $true
  }
  $onPort = @($listeners | Where-Object { [int]$_.LocalPort -eq $Port })
  return $onPort.Count -gt 0
}

function Get-WatchdogBrush {
  param([string]$Color)

  $converter = New-Object System.Windows.Media.BrushConverter
  return $converter.ConvertFromString($Color)
}

function New-WatchdogTextBlock {
  param(
    [string]$Text,
    [double]$FontSize = 14,
    [string]$Color = "#D9E2F1",
    [switch]$Bold
  )

  $block = New-Object System.Windows.Controls.TextBlock
  $block.Text = $Text
  $block.FontSize = $FontSize
  $block.Foreground = Get-WatchdogBrush $Color
  $block.TextWrapping = [System.Windows.TextWrapping]::Wrap
  if ($Bold) {
    $block.FontWeight = [System.Windows.FontWeights]::SemiBold
  }
  return $block
}

function New-WatchdogButton {
  param(
    [string]$Text,
    [string]$Background,
    [string]$Foreground,
    [string]$Border,
    [switch]$Default,
    [switch]$Cancel
  )

  $button = New-Object System.Windows.Controls.Button
  $button.Content = $Text
  $button.MinWidth = 156
  $button.Height = 38
  $button.Padding = [System.Windows.Thickness]::new(16, 0, 16, 0)
  $button.Margin = [System.Windows.Thickness]::new(8, 0, 0, 0)
  $button.Background = Get-WatchdogBrush $Background
  $button.Foreground = Get-WatchdogBrush $Foreground
  $button.BorderBrush = Get-WatchdogBrush $Border
  $button.BorderThickness = [System.Windows.Thickness]::new(1)
  $button.FontWeight = [System.Windows.FontWeights]::SemiBold
  $button.IsDefault = $Default.IsPresent
  $button.IsCancel = $Cancel.IsPresent
  return $button
}

function Show-WatchdogDialog {
  param(
    [ValidateSet("FrontendClosed", "Unhealthy", "StopError")]
    [string]$Kind,
    [string]$Url,
    [int]$SessionCount = 0
  )

  Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

  $isDecision = $Kind -eq "FrontendClosed"
  if ($Kind -eq "FrontendClosed") {
    $windowTitle = "MultiTerm terminals still running"
    $eyebrow = "FRONTEND DISCONNECTED"
    $heading = "Your terminal sessions are still running"
    $body = "The MultiTerm window closed, but the local bridge kept your work alive. Choose whether to reopen MultiTerm later or close this bridge now."
    $detail = if ($SessionCount -eq 1) { "1 active terminal session" } else { "$SessionCount active terminal sessions" }
    $accent = "#F2B84B"
  } elseif ($Kind -eq "Unhealthy") {
    $windowTitle = "MultiTerm bridge is not responding"
    $eyebrow = "WATCHDOG WARNING"
    $heading = "Terminal monitoring is temporarily unavailable"
    $body = "The bridge process is still running, but the watchdog cannot contact it. Your terminals were not stopped. Check the watchdog log if this warning continues."
    $detail = "Bridge health check failed"
    $accent = "#F2B84B"
  } else {
    $windowTitle = "MultiTerm could not close the bridge"
    $eyebrow = "SHUTDOWN FAILED"
    $heading = "The terminal sessions remain running"
    $body = "MultiTerm could not ask this bridge to stop. No terminal process was force-closed. Check the watchdog log for the underlying error."
    $detail = "Graceful shutdown request failed"
    $accent = "#F06A6A"
  }

  $window = New-Object System.Windows.Window
  $window.Title = $windowTitle
  $window.Width = 590
  $window.SizeToContent = [System.Windows.SizeToContent]::Height
  $window.MinHeight = 360
  $window.MaxHeight = 620
  $window.WindowStartupLocation = [System.Windows.WindowStartupLocation]::CenterScreen
  $window.ResizeMode = [System.Windows.ResizeMode]::NoResize
  $window.ShowInTaskbar = $true
  $window.Topmost = $true
  $window.Background = Get-WatchdogBrush "#111722"
  $window.Foreground = Get-WatchdogBrush "#D9E2F1"
  $window.FontFamily = [System.Windows.Media.FontFamily]::new("Segoe UI")

  $root = New-Object System.Windows.Controls.StackPanel

  $header = New-Object System.Windows.Controls.Border
  $header.Padding = [System.Windows.Thickness]::new(26, 24, 26, 22)
  $header.Background = Get-WatchdogBrush "#161E2B"
  $header.BorderBrush = Get-WatchdogBrush "#273348"
  $header.BorderThickness = [System.Windows.Thickness]::new(0, 0, 0, 1)
  $headerRow = New-Object System.Windows.Controls.StackPanel
  $headerRow.Orientation = [System.Windows.Controls.Orientation]::Horizontal

  $icon = New-Object System.Windows.Controls.Border
  $icon.Width = 48
  $icon.Height = 48
  $icon.Margin = [System.Windows.Thickness]::new(0, 0, 16, 0)
  $icon.CornerRadius = [System.Windows.CornerRadius]::new(24)
  $icon.Background = Get-WatchdogBrush "#2A2A25"
  $iconText = New-WatchdogTextBlock -Text "!" -FontSize 26 -Color $accent -Bold
  $iconText.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
  $iconText.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
  $icon.Child = $iconText

  $titles = New-Object System.Windows.Controls.StackPanel
  $titles.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
  $eyebrowText = New-WatchdogTextBlock -Text $eyebrow -FontSize 11 -Color $accent -Bold
  $eyebrowText.Margin = [System.Windows.Thickness]::new(0, 0, 0, 5)
  $headingText = New-WatchdogTextBlock -Text $heading -FontSize 21 -Color "#F4F7FC" -Bold
  [void]$titles.Children.Add($eyebrowText)
  [void]$titles.Children.Add($headingText)
  [void]$headerRow.Children.Add($icon)
  [void]$headerRow.Children.Add($titles)
  $header.Child = $headerRow

  $content = New-Object System.Windows.Controls.StackPanel
  $content.Margin = [System.Windows.Thickness]::new(26, 22, 26, 22)
  $bodyText = New-WatchdogTextBlock -Text $body -FontSize 14 -Color "#C7D1E1"
  $bodyText.LineHeight = 21
  $bodyText.Margin = [System.Windows.Thickness]::new(0, 0, 0, 18)

  $details = New-Object System.Windows.Controls.Border
  $details.Padding = [System.Windows.Thickness]::new(16, 13, 16, 13)
  $details.Background = Get-WatchdogBrush "#182130"
  $details.BorderBrush = Get-WatchdogBrush "#2B3A50"
  $details.BorderThickness = [System.Windows.Thickness]::new(1)
  $details.CornerRadius = [System.Windows.CornerRadius]::new(5)
  $detailStack = New-Object System.Windows.Controls.StackPanel
  $detailText = New-WatchdogTextBlock -Text $detail -FontSize 14 -Color "#F4F7FC" -Bold
  $urlText = New-WatchdogTextBlock -Text $Url -FontSize 12 -Color "#8FA5C2"
  $urlText.Margin = [System.Windows.Thickness]::new(0, 5, 0, 0)
  [void]$detailStack.Children.Add($detailText)
  [void]$detailStack.Children.Add($urlText)
  $details.Child = $detailStack

  [void]$content.Children.Add($bodyText)
  [void]$content.Children.Add($details)

  if ($isDecision) {
    $warning = New-WatchdogTextBlock -Text "Closing the bridge asks each terminal to exit cleanly first. Commands that are still running after the grace period will be interrupted and then terminated." -FontSize 12 -Color "#AAB8CC"
    $warning.Margin = [System.Windows.Thickness]::new(0, 16, 0, 0)
    [void]$content.Children.Add($warning)
  }

  $footer = New-Object System.Windows.Controls.StackPanel
  $footer.Orientation = [System.Windows.Controls.Orientation]::Horizontal
  $footer.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
  $footer.Margin = [System.Windows.Thickness]::new(26, 0, 26, 24)
  $dialogState = [PSCustomObject]@{ Choice = "Keep" }

  if ($isDecision) {
    $closeButton = New-WatchdogButton -Text "Close bridge and terminals" -Background "#351D24" -Foreground "#FFD9DF" -Border "#8C3E4F"
    $keepButton = New-WatchdogButton -Text "Keep terminals running" -Background "#2D6CDF" -Foreground "#FFFFFF" -Border "#4C83E7" -Default -Cancel
    $closeButton.Add_Click({
      $dialogState.Choice = "Close"
      $window.DialogResult = $true
    })
    [void]$footer.Children.Add($closeButton)
    [void]$footer.Children.Add($keepButton)
  } else {
    $dismissButton = New-WatchdogButton -Text "Dismiss" -Background "#2D6CDF" -Foreground "#FFFFFF" -Border "#4C83E7" -Default -Cancel
    [void]$footer.Children.Add($dismissButton)
  }

  [void]$root.Children.Add($header)
  [void]$root.Children.Add($content)
  [void]$root.Children.Add($footer)
  $window.Content = $root
  [void]$window.ShowDialog()
  return $dialogState.Choice
}

function Show-BridgeClosePrompt {
  param(
    [string]$Url,
    [int]$SessionCount
  )

  return Show-WatchdogDialog -Kind FrontendClosed -Url $Url -SessionCount $SessionCount
}

function Show-UnhealthyBridgeWarning {
  param([string]$Url)

  [void](Show-WatchdogDialog -Kind Unhealthy -Url $Url)
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
    $argumentLine = '-NoLogo -NoProfile -Sta -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -PromptBridgeUrl "{1}"' -f `
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
    if ($choice -eq "Close") {
      try {
        Stop-WatchedBridge -BaseUri $promptUri
        Write-WatchdogLog ("Graceful shutdown requested for {0}." -f $promptUri.AbsoluteUri)
      } catch {
        Write-WatchdogLog ("Could not stop {0}: {1}" -f $promptUri.AbsoluteUri, $_.Exception.Message)
        [void](Show-WatchdogDialog -Kind StopError -Url $promptUri.AbsoluteUri)
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
        if ($null -eq $bridgeProcess -or -not (Test-BridgePortHasListener -Port $recordPort)) {
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
        # A bridge with scheduled background automations is not an orphan: it is
        # the only thing keeping them alive, so never offer to close it.
        $backgroundAutomations = 0
        if ($health.PSObject.Properties['backgroundAutomations']) {
          $backgroundAutomations = [int]$health.backgroundAutomations
        }
        if ($backgroundAutomations -gt 0) {
          Write-WatchdogLog ("Leaving {0} alone: {1} background automation(s) still scheduled." -f $recordUri.AbsoluteUri, $backgroundAutomations)
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
