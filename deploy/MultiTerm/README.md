# MultiTerm Workbench

A local xterm.js workbench for running multiple PowerShell sessions from one browser page.

## Run

PowerShell-only bridge, no Node install required:

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

Node bridge, useful during development:

```powershell
npm install
npm start
```

Open the URL printed by the bridge, usually:

```text
http://127.0.0.1:3177
```

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