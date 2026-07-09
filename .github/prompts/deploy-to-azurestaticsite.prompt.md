---
description: "Deploy MultiTerm to the Azure static download site. Use when: deploy to azure static site, upload MultiTerm.zip, add download card, patch installmonitordl index.html."
name: "deploy-to-azurestaticsite"
argument-hint: "Optional: zip name, card title/version/description, target storage account"
agent: "agent"
---

Deploy this workspace to the existing Azure static download site carefully.

Default target:
- Subscription: current Azure CLI default subscription.
- Resource group: `rg-installmonitor-download`.
- Storage account: `installmonitordl`.
- Static website endpoint: `https://installmonitordl.z13.web.core.windows.net/`.
- Static website container: `$web`.
- Protected download container: `downloads`.
- Download blob name: `MultiTerm.zip`.

Critical safety rules:
- Do not delete blobs, containers, resources, or existing HTML sections.
- Do not replace the remote `index.html` from the local `public/index.html`.
- Always download the current remote `index.html` first, patch only one new card, then upload that patched copy back to `$web/index.html`.
- Upload only the named ZIP blob and the patched `index.html` blob.
- Never print storage account keys, SAS tokens, credentials, or Google auth tokens.
- If the target site is ambiguous, list likely Azure Static Web Apps/storage static website resources and ask which one to use before uploading.

Package steps:
1. Build `deploy/MultiTerm.zip` from the no-Node PowerShell package only.
2. Include these files:
   - `Start-MultiTerm.ps1`
   - `README.md`
   - `public/index.html`
   - `public/app.js`
   - `public/styles.css`
3. Exclude Node/development files, especially:
   - `package.json`
   - `package-lock.json`
   - `server.js`
   - `node_modules/`
   - `deploy/zipcheck/`
4. Expand the ZIP into `deploy/zipcheck/` and verify no excluded files are present.

Recommended PowerShell packaging command:

```powershell
$deployRoot = Join-Path $PWD 'deploy'
$packageRoot = Join-Path $deployRoot 'MultiTerm'
Remove-Item -Path $packageRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot 'public') | Out-Null
Copy-Item -Path .\Start-MultiTerm.ps1,.\README.md -Destination $packageRoot -Force
Copy-Item -Path .\public\index.html,.\public\app.js,.\public\styles.css -Destination (Join-Path $packageRoot 'public') -Force
$zipPath = Join-Path $deployRoot 'MultiTerm.zip'
Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $zipPath -Force
Remove-Item -Path .\deploy\zipcheck -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $zipPath -DestinationPath .\deploy\zipcheck -Force
$unexpected = Get-ChildItem .\deploy\zipcheck -Recurse -File | Where-Object { $_.Name -like 'package*.json' -or $_.Name -eq 'server.js' }
if ($unexpected) { $unexpected | Select-Object FullName; throw 'Unexpected Node/package files in zip' }
```

Remote index patch steps:
1. Download the live index first:

```powershell
$deployRoot = Join-Path $PWD 'deploy'
New-Item -ItemType Directory -Force -Path $deployRoot | Out-Null
Invoke-WebRequest -Uri 'https://installmonitordl.z13.web.core.windows.net/' -UseBasicParsing -OutFile (Join-Path $deployRoot 'index.remote.html')
```

2. Insert a new card inside the existing `<div class="grid">` before that grid closes. Preserve every existing card and script.
3. The link must use `data-blob="MultiTerm.zip"` because the auth function creates download URLs by exact blob name from the `downloads` container.
4. Use this card unless the user supplied updated copy:

```html
        <div class="card">
            <h1>MultiTerm Workbench</h1>
            <p class="version">v0.1.0 &middot; Windows PowerShell</p>
            <p class="desc">Local browser workbench for running multiple PowerShell sessions with flexible pane layouts, synchronized input, and ConPTY-backed terminal behavior.</p>
            <a href="#" data-blob="MultiTerm.zip" class="btn download-btn">Download ZIP</a>
            <p class="size">~21 KB &middot; Requires Windows 10/11</p>
            <p class="note">Extract the ZIP and run <strong>Start-MultiTerm.ps1</strong>.<br>No Node.js install required.</p>
            <p class="size" style="margin-top: 8px;">Released: Jun 8, 2026 8:01 PM CST</p>
        </div>
```

Upload steps:
1. Use Azure CLI storage account key auth if blob data RBAC is unavailable.
2. Store the key only in a local variable and never echo it.
3. Upload exactly these two blobs:

```powershell
$ErrorActionPreference = 'Stop'
$account = 'installmonitordl'
$resourceGroup = 'rg-installmonitor-download'
$key = az storage account keys list --resource-group $resourceGroup --account-name $account --query '[0].value' -o tsv
if (-not $key) { throw 'Could not retrieve storage account key.' }

az storage blob upload `
  --account-name $account `
  --account-key $key `
  --container-name downloads `
  --name 'MultiTerm.zip' `
  --file '.\deploy\MultiTerm.zip' `
  --overwrite true `
  --content-type 'application/zip'

az storage blob upload `
  --account-name $account `
  --account-key $key `
  --container-name '$web' `
  --name 'index.html' `
  --file '.\deploy\index.remote.html' `
  --overwrite true `
  --content-type 'text/html; charset=utf-8' `
  --content-cache-control 'no-cache'
```

Verification steps:
1. Check blob properties for both uploads:

```powershell
$account = 'installmonitordl'
$resourceGroup = 'rg-installmonitor-download'
$key = az storage account keys list --resource-group $resourceGroup --account-name $account --query '[0].value' -o tsv
az storage blob show --account-name $account --account-key $key --container-name downloads --name 'MultiTerm.zip' --query '{name:name,contentLength:properties.contentLength,contentType:properties.contentSettings.contentType,lastModified:properties.lastModified}' -o json
az storage blob show --account-name $account --account-key $key --container-name '$web' --name 'index.html' --query '{name:name,contentLength:properties.contentLength,contentType:properties.contentSettings.contentType,cacheControl:properties.contentSettings.cacheControl,lastModified:properties.lastModified}' -o json
```

2. Fetch the public static page with a cache-busting query and confirm the new card and existing cards are present:

```powershell
$url = 'https://installmonitordl.z13.web.core.windows.net/?verify=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$content = (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20).Content
$checks = [ordered]@{
  hasMultiTerm = $content.Contains('MultiTerm Workbench')
  hasBlob = $content.Contains('data-blob="MultiTerm.zip"')
  hasInstallationMonitor = $content.Contains('Installation Monitor')
  hasYagu = $content.Contains('Yagu')
  hasEverythingDiskUsage = $content.Contains('Everything Disk Usage')
  cardCount = ([regex]::Matches($content, '<div class="card">')).Count
  length = $content.Length
}
$checks | ConvertTo-Json -Compress
```

Expected verification: `hasMultiTerm`, `hasBlob`, and the existing-card checks should all be `true`. The card count should increase by one compared with the downloaded remote index.

Final response should include:
- The static site URL.
- The uploaded ZIP blob name and size.
- Confirmation that `package.json`, `package-lock.json`, `server.js`, and `node_modules/` were excluded.
- Confirmation that the existing remote `index.html` was patched, not replaced wholesale.
- Verification results.