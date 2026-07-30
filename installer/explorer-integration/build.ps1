#Requires -Version 5.1
<#
Builds the native Windows 11 IExplorerCommand extension and its signed sparse
packages. The private package-signing key stays in the build user's certificate
store; only the public certificate is placed in generated output for the opt-in
installer task.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$SourceRoot = $PSScriptRoot
$GeneratedRoot = Join-Path $SourceRoot 'generated'
$BinRoot = Join-Path $GeneratedRoot 'bin'
$PackageRoot = Join-Path $GeneratedRoot 'packages'
$ManifestRoot = Join-Path $GeneratedRoot 'manifests'
$Publisher = 'CN=MultiTerm Workbench Explorer Integration'
$PackageName = 'MultiTerm.Workbench.ExplorerIntegration'
$CommandClsid = 'A8F59270-9897-46C6-AE03-5429BD656C4B'
$PackageVersion = "$Version.0"

Remove-Item -LiteralPath $GeneratedRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $BinRoot, $PackageRoot, $ManifestRoot -Force | Out-Null

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) {
    throw 'Visual Studio Installer (vswhere.exe) was not found. Install the Desktop development with C++ workload.'
}
$vsPath = $null
$vsCandidates = @(& $vswhere -all -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)
foreach ($candidate in $vsCandidates) {
  $toolsetRoot = Join-Path $candidate 'VC\Tools\MSVC'
  $armRuntime = Get-ChildItem $toolsetRoot -Directory -ErrorAction SilentlyContinue |
    Sort-Object { [version]$_.Name } -Descending |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'lib\arm64\libcpmt.lib') } |
    Select-Object -First 1
  if ($armRuntime) {
    $vsPath = $candidate
    break
  }
}
if (-not $vsPath) {
  throw 'Visual Studio C++ build tools with x86, x64, and ARM64 libraries were not found.'
}
$devCmd = Join-Path $vsPath 'Common7\Tools\VsDevCmd.bat'
if (-not (Test-Path -LiteralPath $devCmd)) { throw "Cannot find VsDevCmd.bat at $devCmd" }

$sdkBin = Get-ChildItem (Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin') -Directory |
    Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1
if (-not $sdkBin) { throw 'Windows SDK tools were not found.' }
$makeAppx = Join-Path $sdkBin.FullName 'x64\makeappx.exe'
$signTool = Join-Path $sdkBin.FullName 'x64\signtool.exe'
if (-not (Test-Path -LiteralPath $makeAppx)) { throw "Cannot find MakeAppx.exe at $makeAppx" }
if (-not (Test-Path -LiteralPath $signTool)) { throw "Cannot find SignTool.exe at $signTool" }

function Invoke-DeveloperCommand {
    param([string]$Architecture, [string]$Command)
    $line = 'call "{0}" -no_logo -arch={1} -host_arch=x64 >nul && {2}' -f $devCmd, $Architecture, $Command
    Write-Verbose $line
    & $env:ComSpec /d /s /c $line
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Native $Architecture build hit a transient toolchain error; retrying once."
    & $env:ComSpec /d /s /c $line
  }
  if ($LASTEXITCODE -ne 0) { throw "Native $Architecture build failed with exit code $LASTEXITCODE." }
}

$commandSource = Join-Path $SourceRoot 'MultiTermExplorerCommand.cpp'
$commandDef = Join-Path $SourceRoot 'MultiTermExplorerCommand.def'
$launcherSource = Join-Path $SourceRoot 'MultiTermLauncher.cpp'

foreach ($architecture in @('arm64', 'x64', 'x86')) {
    $output = Join-Path $BinRoot $architecture
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    $commandDll = Join-Path $output 'MultiTermExplorerCommand.dll'
    $commandObject = Join-Path $output 'MultiTermExplorerCommand.obj'
    $commandLibrary = Join-Path $output 'MultiTermExplorerCommand.lib'
    $launcherExe = Join-Path $output 'MultiTermLauncher.exe'
    $launcherObject = Join-Path $output 'MultiTermLauncher.obj'

    $compileDll = 'cl.exe /nologo /std:c++17 /EHsc /O2 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN /LD /Fo"{3}" "{0}" /link /DEF:"{1}" /OUT:"{2}" /IMPLIB:"{4}" /LIBPATH:"%VCToolsInstallDir%lib\{5}" shlwapi.lib ole32.lib shell32.lib' -f $commandSource, $commandDef, $commandDll, $commandObject, $commandLibrary, $architecture
    Invoke-DeveloperCommand -Architecture $architecture -Command $compileDll

    $compileLauncher = 'cl.exe /nologo /std:c++17 /EHsc /O2 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN /Fo"{2}" "{0}" /link /SUBSYSTEM:WINDOWS /OUT:"{1}" /LIBPATH:"%VCToolsInstallDir%lib\{3}" shell32.lib' -f $launcherSource, $launcherExe, $launcherObject, $architecture
    Invoke-DeveloperCommand -Architecture $architecture -Command $compileLauncher

    $manifestDirectory = Join-Path $ManifestRoot $architecture
    New-Item -ItemType Directory -Path $manifestDirectory -Force | Out-Null
    $manifestPath = Join-Path $manifestDirectory 'AppxManifest.xml'
    $manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
  xmlns:com="http://schemas.microsoft.com/appx/manifest/com/windows10"
  xmlns:desktop4="http://schemas.microsoft.com/appx/manifest/desktop/windows10/4"
  xmlns:desktop5="http://schemas.microsoft.com/appx/manifest/desktop/windows10/5"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap uap10 com desktop4 desktop5 rescap">
  <Identity Name="$PackageName" Publisher="$Publisher" Version="$PackageVersion" ProcessorArchitecture="$architecture" />
  <Properties>
    <DisplayName>MultiTerm Explorer Integration</DisplayName>
    <PublisherDisplayName>MultiTerm Workbench</PublisherDisplayName>
    <Logo>public\icon-192.png</Logo>
    <uap10:AllowExternalContent>true</uap10:AllowExternalContent>
  </Properties>
  <Resources>
    <Resource Language="en-us" />
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Applications>
    <Application Id="ExplorerIntegration" Executable="Explorer\$architecture\MultiTermLauncher.exe" uap10:TrustLevel="mediumIL" uap10:RuntimeBehavior="win32App">
      <uap:VisualElements AppListEntry="none" DisplayName="MultiTerm Workbench" Description="Open folders in MultiTerm" BackgroundColor="transparent" Square150x150Logo="public\icon-192.png" Square44x44Logo="public\icon-192.png" />
      <Extensions>
        <com:Extension Category="windows.comServer">
          <com:ComServer>
            <com:SurrogateServer DisplayName="MultiTerm Explorer commands">
              <com:Class Id="$CommandClsid" Path="Explorer\$architecture\MultiTermExplorerCommand.dll" ThreadingModel="STA" />
            </com:SurrogateServer>
          </com:ComServer>
        </com:Extension>
        <desktop4:Extension Category="windows.fileExplorerContextMenus">
          <desktop4:FileExplorerContextMenus>
            <desktop5:ItemType Type="Directory">
              <desktop5:Verb Id="OpenFolderInMultiTerm" Clsid="$CommandClsid" />
            </desktop5:ItemType>
            <desktop5:ItemType Type="Directory\Background">
              <desktop5:Verb Id="OpenFolderBackgroundInMultiTerm" Clsid="$CommandClsid" />
            </desktop5:ItemType>
          </desktop4:FileExplorerContextMenus>
        </desktop4:Extension>
      </Extensions>
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
    <rescap:Capability Name="unvirtualizedResources" />
  </Capabilities>
</Package>
"@
    [System.IO.File]::WriteAllText($manifestPath, $manifest, [System.Text.UTF8Encoding]::new($false))

    $packagePath = Join-Path $PackageRoot ("MultiTermExplorer-{0}.msix" -f $architecture)
    & $makeAppx pack /o /d $manifestDirectory /nv /p $packagePath
    if ($LASTEXITCODE -ne 0) { throw "MakeAppx failed for $architecture with exit code $LASTEXITCODE." }
}

$certificate = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object {
        $basicConstraints = $_.Extensions |
            Where-Object { $_.Oid.Value -eq '2.5.29.19' } |
            Select-Object -First 1
        $_.Subject -eq $Publisher -and
            $_.HasPrivateKey -and
            $_.NotAfter -gt (Get-Date).AddMonths(6) -and
            $basicConstraints -and
            -not $basicConstraints.CertificateAuthority
    } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1
if (-not $certificate) {
    $certificate = New-SelfSignedCertificate -Type Custom -Subject $Publisher -FriendlyName 'MultiTerm Explorer package signing' -CertStoreLocation Cert:\CurrentUser\My -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyUsage DigitalSignature -NotAfter (Get-Date).AddYears(10) -TextExtension @('2.5.29.19={critical}{text}ca=0', '2.5.29.37={text}1.3.6.1.5.5.7.3.3')
}
$publicCertificate = Join-Path $GeneratedRoot 'MultiTermExplorer.cer'
Export-Certificate -Cert $certificate -FilePath $publicCertificate -Force | Out-Null

foreach ($package in Get-ChildItem $PackageRoot -Filter '*.msix') {
    & $signTool sign /fd SHA256 /sha1 $certificate.Thumbprint /s My $package.FullName
    if ($LASTEXITCODE -ne 0) { throw "SignTool failed for $($package.Name) with exit code $LASTEXITCODE." }
}

$certificateData = [Convert]::ToBase64String($certificate.RawData)
$certificateInstallScript = @"
`$ErrorActionPreference = 'Stop'
`$subject = '$Publisher'
`$thumbprint = '$($certificate.Thumbprint)'
`$certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
    [Convert]::FromBase64String('$certificateData'))
if (`$certificate.Subject -ne `$subject -or `$certificate.Thumbprint -ne `$thumbprint) {
    throw 'The embedded MultiTerm Explorer certificate is invalid.'
}
`$store = [System.Security.Cryptography.X509Certificates.X509Store]::new('TrustedPeople', 'LocalMachine')
`$store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
try {
    `$matches = `$store.Certificates.Find(
        [System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
        `$thumbprint,
        `$false)
    if (`$matches.Count -eq 0) {
        `$store.Add(`$certificate)
        New-Item -Path "HKLM:\SOFTWARE\MultiTerm Workbench\ExplorerIntegration\Certificates\`$thumbprint" -Force | Out-Null
    }
} finally {
    `$store.Close()
}
"@
$certificateRemoveScript = @"
`$ErrorActionPreference = 'Stop'
if (Get-AppxPackage -AllUsers -Name '$PackageName' -ErrorAction SilentlyContinue) { return }
`$statePath = 'HKLM:\SOFTWARE\MultiTerm Workbench\ExplorerIntegration\Certificates'
if (-not (Test-Path -LiteralPath `$statePath)) { return }
`$store = [System.Security.Cryptography.X509Certificates.X509Store]::new('TrustedPeople', 'LocalMachine')
`$store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
try {
    foreach (`$key in Get-ChildItem -LiteralPath `$statePath) {
        `$thumbprint = `$key.PSChildName
        if (`$thumbprint -notmatch '^[0-9A-Fa-f]{40}$') { continue }
        `$matches = `$store.Certificates.Find(
            [System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
            `$thumbprint,
            `$false)
        foreach (`$certificate in `$matches) {
            if (`$certificate.Subject -eq '$Publisher') { `$store.Remove(`$certificate) }
        }
    }
} finally {
    `$store.Close()
}
Remove-Item -LiteralPath `$statePath -Recurse -Force
"@
$certificateInstallCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($certificateInstallScript))
$certificateRemoveCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($certificateRemoveScript))
$certificateInclude = @"
#define ExplorerCertificateInstallCommand "$certificateInstallCommand"
#define ExplorerCertificateRemoveCommand "$certificateRemoveCommand"
"@
[System.IO.File]::WriteAllText(
    (Join-Path $GeneratedRoot 'ExplorerCertificateCommands.iss'),
    $certificateInclude,
    [System.Text.UTF8Encoding]::new($false))

Write-Host "Built Explorer integration $PackageVersion for x86, x64, and ARM64."
