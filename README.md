# MultiTerm Workbench

A local xterm.js workbench for running multiple PowerShell sessions from one browser page.

**⬇️ [Download MultiTerm Workbench v0.1.22](https://github.com/andrewtheart/multiterm-workbench/releases/tag/v0.1.22)** — Windows installer, from the [releases page](https://github.com/andrewtheart/multiterm-workbench/releases).

## Why MultiTerm?

<table>
  <tr>
    <td align="center" width="33%">
      <h3>🖥️ Multi-pane shell workspace</h3>
      Run multiple local PowerShell terminals in one view with real PTY behavior, prompt editing, Ctrl+C, and resize handling.
    </td>
    <td align="center" width="33%">
      <h3>⛶ Real maximize + focus rail</h3>
      Maximize one pane to fill the terminal stage, or use focus rail to keep one primary pane large while others stay visible.
    </td>
    <td align="center" width="33%">
      <h3>🧩 Many layout modes</h3>
      Switch between auto fit, fixed rows/columns, strips, balanced grid, master layouts, bento, and manual canvas.
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <h3>🧲 Drag-to-snap and manual canvas</h3>
      Drag panes to top, bottom, left, or right snap zones, or place and resize panes freely in manual mode.
    </td>
    <td align="center" width="33%">
      <h3>📣 Broadcast + sync input</h3>
      Send one command to all terminals (or a scope), and optionally mirror keyboard input across every pane.
    </td>
    <td align="center" width="33%">
      <h3>🔎 Find in one pane or all panes</h3>
      Search inside the active terminal or run a global find across every visible terminal output.
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <h3>☰ Always-on pane hamburger</h3>
      Each pane keeps a menu with Find and Duplicate, plus overflowed actions when header space gets tight.
    </td>
    <td align="center" width="33%">
      <h3>⌨️ Command palette + quick switch</h3>
      Use keyboard-first command discovery and fast terminal switching without leaving the workbench.
    </td>
    <td align="center" width="33%">
      <h3>🗂️ Snippets and workspaces</h3>
      Save reusable commands and named workspace layouts, then restore sessions quickly when you return.
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <h3>⬆️ Built-in updater</h3>
      Check GitHub releases, read release notes in-app, and launch the newest installer directly from the update dialog.
    </td>
    <td align="center" width="33%">
      <h3>📜 Live diagnostics log console</h3>
      Tail app and bridge logs in real time, filter levels, copy output, and catch reconnect/session lifecycle issues quickly.
    </td>
    <td align="center" width="33%">
      <h3>🧠 On-demand memory readout</h3>
      Hover the memory chip in the status bar for live app + system RAM usage, refreshed only while the chip is open.
    </td>
  </tr>
</table>

## Screenshot tour

<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/images/workbench-grid.png" alt="MultiTerm in auto-fit grid mode with six active terminals">
      <br><strong>Grid workbench:</strong> multiple live shells and controls in one view.
    </td>
    <td align="center" width="50%">
      <img src="docs/images/maximized-pane.png" alt="A single terminal maximized to fill the workspace">
      <br><strong>Real maximize:</strong> one pane overlays the full terminal stage.
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="docs/images/focus-rail-layout.png" alt="Focus rail layout with one large primary pane">
      <br><strong>Focus rail:</strong> keep one large primary pane while others remain docked.
    </td>
    <td align="center" width="50%">
      <img src="docs/images/pane-hamburger-menu.png" alt="Pane hamburger menu showing move, find, and duplicate actions">
      <br><strong>Pane hamburger menu:</strong> Find and Duplicate are always available.
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="docs/images/broadcast-bar.png" alt="Broadcast command bar at the top of the workspace">
      <br><strong>Broadcast bar:</strong> send one command to all terminals or a selected scope.
    </td>
    <td align="center" width="50%">
      <img src="docs/images/find-all-terminals.png" alt="In-pane find bar highlighting matches, with the global terminal filter in the header">
      <br><strong>Find &amp; filter:</strong> per-pane search with match highlighting, plus a global filter.
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="docs/images/command-palette.png" alt="Command palette filtering for update commands">
      <br><strong>Command palette:</strong> keyboard-first command discovery and execution.
    </td>
    <td align="center" width="50%">
      <img src="docs/images/update-dialog.png" alt="Update dialog with release notes and install action">
      <br><strong>Updater dialog:</strong> release notes plus one-click download/install flow.
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="docs/images/log-console.png" alt="Log console panel showing live app and bridge events">
      <br><strong>Log console:</strong> live diagnostics with level filters and quick export.
    </td>
    <td align="center" width="50%">
      <img src="docs/images/snippets-workspaces.png" alt="Snippets and workspaces controls in the side panel">
      <br><strong>Snippets + workspaces:</strong> reusable commands and saved layouts.
    </td>
  </tr>
  <tr>
    <td align="center" width="100%" colspan="2">
      <img src="docs/images/status-memory-hover.png" alt="Status bar memory chip expanded with app and system memory usage">
      <br><strong>Status memory chip:</strong> hover to show live app/system memory usage.
    </td>
  </tr>
</table>

## Requirements

- **Windows 10 version 1809 (build 17763) or newer**, or Windows 11. This is the
  minimum required for the pseudo-terminal support (the ConPTY
  `CreatePseudoConsole` APIs) that MultiTerm uses to run each PowerShell session.
  The Windows installer enforces this and refuses to install on older builds.
- **Windows PowerShell 5.1** (built into Windows 10/11) is enough for the
  self-contained bridge and the installer. **PowerShell 7 (`pwsh.exe`)** is used
  automatically when it's installed, otherwise sessions fall back to Windows
  PowerShell.
- **Node.js** is only needed for the Electron desktop app (`npm start`) and the
  development Node bridge (`npm run server`) — not for `Start-MultiTerm.ps1` or
  the installed build.

## Run

### Desktop app (Electron)

Runs in its own native window — no browser, no address bar:

```powershell
npm install
npm start
```

`npm start` launches the Electron shell, which starts the local bridge under your
system Node runtime and loads the UI in a dedicated window.

> Requires Node.js on your PATH (the terminal bridge uses the native `node-pty`
> module built for your installed Node version).

### PowerShell-only bridge (browser)

No Node install required:

```powershell
.\Start-MultiTerm.ps1
```

The bridge opens your default browser automatically. If it does not, open the URL printed by the bridge, usually:

```text
http://127.0.0.1:3177
```

To start the bridge without opening a browser:

```powershell
.\Start-MultiTerm.ps1 -NoBrowser
```

Run from a terminal, the bridge keeps its console window and Ctrl+C stops it.
Launched from a shortcut it creates its own console window, which is hidden
once the app window is up. Add `-ShowConsole` to keep that window visible, and
stop a bridge whose console is hidden with:

```powershell
.\Start-MultiTerm.ps1 -Stop
```

### Administrator terminals

Both bridges can open a terminal that runs elevated. Windows offers no way to
hand a pseudo console to a process across the elevation boundary, so the bridge
starts a short-lived elevated helper (one UAC prompt per terminal) that owns the
elevated pty and relays it back over a loopback socket. The helper runs with no
visible window and exits with its terminal; if the bridge stops, the helper and
its shell are torn down with it.

The helper authenticates with a single-use token *and* verifies that the process
listening on the loopback port is the bridge that spawned it, so a lower
privileged process cannot hijack the elevated session even if it learns the
token. Declining the UAC prompt reports "Administrator access was declined."
and leaves nothing behind.

Node bridge only (no window), useful during development:

```powershell
npm install
npm run server
```

Open the URL printed by the bridge, usually:

```text
http://127.0.0.1:3177
```

## Windows installer

An [Inno Setup](https://www.innosetup.com/) script packages the self-contained
PowerShell bridge (no Node.js runtime required) into a Windows installer. It
installs `Start-MultiTerm.ps1`, the `public/` assets, and Start Menu / optional
desktop shortcuts that launch the bridge and open it in your browser. The
bridge runs without a console window; a "Stop MultiTerm Workbench" Start Menu
entry shuts it down and closes every session.

### Download

Grab the latest per-user installer from the
[releases page](https://github.com/andrewtheart/multiterm-workbench/releases/latest),
or directly:

- [MultiTerm-Setup-0.1.22.exe](https://github.com/andrewtheart/multiterm-workbench/releases/download/v0.1.22/MultiTerm-Setup-0.1.22.exe)

It performs a per-user install by default (no UAC prompt); you may elect a
machine-wide install from the setup dialog.

### Build it yourself

Build the installer (requires Inno Setup 6):

```powershell
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\MultiTerm.iss
```

The resulting `installer\Output\MultiTerm-Setup-<version>.exe` performs a
per-user install by default (no UAC prompt); users may elect a machine-wide
install from the setup dialog.

A single installer covers **x86, x64, and ARM64** — no separate per-architecture
builds are needed. The payload is architecture-neutral (a PowerShell script plus
web assets, with no native binaries), the setup runs on every architecture, and
it installs into 64-bit `Program Files` on x64/ARM64 and 32-bit `Program Files`
on x86.

## Updates

MultiTerm checks the [GitHub releases](https://github.com/andrewtheart/multiterm-workbench/releases)
of this repository for a newer version. A background check runs at most once
every six hours; a manual check is available from the **Check for updates**
button in the About dialog or the **Check for updates…** command in the palette
(`Ctrl+Shift+P`).

When a newer release exists, MultiTerm shows that release's notes (rendered from
the GitHub release body) with three choices:

- **Download & install** — downloads the release's `MultiTerm-Setup-<version>.exe`
  asset to the temp folder, launches it, and quits so the installer can replace
  the app. Download progress is shown in the dialog.
- **Later** — dismisses that specific version so background checks stop
  mentioning it (a manual check always shows it again).
- **View on GitHub** — opens the release page in the default browser.

Downloading and launching the installer requires the Electron desktop app. When
MultiTerm is served by the PowerShell bridge in a plain browser, the check and
release notes still work but the primary action opens the download page instead.

Set `MULTITERM_UPDATE_REPO=<owner>/<repo>` before launching the desktop app to
point the checker at a fork.

## Notes

- The UI is a single-page app in `public/`.
- Browser-only HTML cannot start or stream from local PowerShell processes. `Start-MultiTerm.ps1` and `server.js` are local-only bridges that serve the page, accept WebSocket input, and own PTY-backed PowerShell child processes through Windows ConPTY.
- The bridge binds to `127.0.0.1` by default. Set `PORT=4000` to choose another port.
- Sessions default to PowerShell 7 (`pwsh.exe`) and can also use Windows PowerShell.
- Ctrl+C, Tab completion, PSReadLine editing, and terminal resize are forwarded through the pseudo-terminal rather than plain pipes.
- The top search box filters terminal panes by contained terminal text; non-matching panes stay hidden until matching output appears or the search is cleared.
- Layout modes include auto fit, fixed columns, fixed rows, horizontal strip, vertical stack, focus rail, and manual canvas.
- The bottom-left workspace buttons hide or restore the top header and layout sidecar for more terminal space.
- The bottom-left trash button closes every terminal pane and tells the bridge to kill all running PowerShell sessions.
- Drag a terminal by its header to the top, bottom, left, or right edge of the workbench to snap it there; the other terminals reflow into the remaining space.
- Manual canvas panes can be dragged by their header and resized from the lower-right corner.
- Any pane can be minimized to a chip in the status bar with its header's minimize (−) button; click the chip to restore the pane in place.
- Each pane header has a **maximize** button that overlays the pane across the whole terminal workspace (and turns into restore); `Ctrl+Shift+X` does the same for the active pane.
- The **focus** button next to it promotes the pane in the focus-rail layout rather than maximizing it.
- Every pane header carries a **hamburger (⋯) menu** holding *Find…* and *Duplicate*; when a pane gets too narrow, its move and label-colour actions collapse into the same menu.
- The status bar includes − / + controls for terminal font zoom (same as Ctrl+- and Ctrl+=).
- Hover (or keyboard-focus) the **memory chip** at the far left of the status bar to expand a live reading of how much RAM MultiTerm and its terminals are using, alongside system totals. It refreshes about every 4 seconds while open and stops as soon as you move away, so the (fairly expensive) Windows process probe only runs when you are actually looking. The reading is Windows-only; elsewhere the chip reports `unavailable`. Set `MEMSTATS=1` on the bridge to restore the old always-on 10-second broadcast instead.
- The chevron in the bottom-right corner opens a live **log console** that tails everything the app and bridge do (connections, session start/exit, broadcasts, workspace changes, and errors). Logs can be filtered by level, copied, or cleared; a badge on the chevron flags new errors while it is closed. The bridge also prints these events to its console window.