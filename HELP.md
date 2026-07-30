# MultiTerm Workbench Help

MultiTerm Workbench is a Windows terminal workspace for running PowerShell 7, Windows PowerShell, Command Prompt, and WSL sessions side by side. Everything in this guide is available from the app's top-right **?** button.

## Getting started

1. Choose a shell from the header.
2. Optionally enter a name and working directory.
3. Select **Add terminal** or press <kbd>Ctrl+T</kbd>.
4. Click a pane to make it active, then type normally.

Use the terminal, page, and empty-workspace context menus for additional actions. Press <kbd>Ctrl+Shift+P</kbd> or <kbd>F1</kbd> to search the command palette.

## Terminals

### Supported shells

- **PowerShell 7** (`pwsh`)
- **Windows PowerShell** (`powershell.exe`)
- **Command Prompt** (`cmd.exe`)
- **WSL**, including attachment to existing tmux sessions

Each terminal has its own shell process, PID, working directory, title, color label, scrollback, and optional log file.

### Common pane actions

Right-click a pane or its title bar to:

- copy, paste, select, find, clear, or restart;
- open the current folder in File Explorer;
- create another terminal in the same folder;
- split by duplicating the shell and working directory;
- launch GitHub Copilot CLI;
- run a script, optionally in an Administrator terminal;
- start or stop logging;
- inspect statistics;
- open notes and the command queue;
- move the terminal to another page; or
- minimize, maximize, recolor, rename, or close the pane.

Drag a pane by its title bar to reorder it. Layouts with a primary pane use the active terminal as the primary pane.

### Administrator terminals

Use **New Administrator terminal** to elevate only a new terminal, or **Restart as Administrator** to relaunch the complete workspace elevated. Windows displays a UAC prompt before elevation.

### WSL and tmux

Select **WSL** for a normal WSL shell. To reconnect to a persistent tmux session, use **Attach WSL tmux session...** from the command palette. MultiTerm discovers available distributions and tmux sessions, then opens the selected session in a terminal pane.

WSL and tmux must already be installed and configured. MultiTerm does not install Linux distributions or tmux.

## Pages and workspaces

Pages organize terminals into separate visual groups without ending their shell processes.

- Use the page bar or <kbd>Ctrl+PageUp</kbd>/<kbd>Ctrl+PageDown</kbd> to switch pages.
- Double-click a page name to rename it.
- Right-click a page for rename, move, create, and close actions.
- Move a terminal between pages from its context menu.

Saved workspaces preserve pages, terminal definitions, shell choices, directories, titles, layout settings, and the active page. Session restore can recreate the previous workspace after a reload or restart.

## Layouts

Open **Settings** and choose a layout under **Layout**:

| Layout | Best for |
| --- | --- |
| Auto fit | Responsive panes with a configured minimum width |
| Fixed columns / Fixed rows | Predictable grid dimensions |
| Horizontal strip / Vertical stack | One-dimensional scanning |
| Focus rail | A large active pane with a compact rail |
| Balanced grid | Evenly sized panes |
| Master top / right / bottom / left | A primary pane with secondary panes on one edge |
| Priority grid | Larger early panes with compact secondary panes |
| Compact matrix | Many dense, evenly packed panes |
| Horizontal / Vertical carousel | Scrolling through panes in one direction |
| Spotlight | One dominant pane with a compact supporting strip |
| Bento grid | Mixed pane sizes in a dashboard-like grid |
| Manual canvas | Free positioning and resizing |

Use **Fit all terminals** after resizing the window or changing layouts. **Reset layout** clears layout-specific adjustments. <kbd>Ctrl+Shift+X</kbd> temporarily maximizes the active pane.

## Notes and command queues

### PID-bound notes

Open **Notes & command queue...** from a terminal's context menu or the command palette. Notes are stored against the terminal PID so each live shell has its own working context.

When a shell exits, its notes are retained in **Recovered notes** instead of being deleted. You can copy or remove recovered notes after reviewing them.

### Command queues

Build a list of commands or prompts without sending them immediately. Each live terminal has its own queue.

- Select a queued item to insert it into that terminal.
- Inserting a queued item does **not** send Enter, so you can review or edit it first.
- Use the pane's quick-dequeue control or press <kbd>Ctrl+Shift+Q</kbd> to insert the next queued item without reopening the dialog.
- Reorder or remove items from the queue manager.

If a terminal exits while commands remain, its queue moves to **Unparented queues**. Unparented commands remain reusable and can be inserted into another live terminal.

## Search, broadcast, and input

### Search

- <kbd>Ctrl+F</kbd> searches the active terminal.
- <kbd>Ctrl+Shift+F</kbd> searches all terminals.
- Use Enter/Shift+Enter to move between matches and Escape to close search.

### Broadcast

Press <kbd>Ctrl+Shift+B</kbd> to compose text once and send it to several terminals. Broadcast scope can target the current page or all pages. The **Send Enter** option controls whether the command runs immediately.

### Clipboard behavior

MultiTerm supports copy-on-select, <kbd>Ctrl+Shift+C</kbd>, <kbd>Ctrl+Shift+V</kbd>, optional <kbd>Ctrl+V</kbd> paste, right-click paste modes, and Copilot CLI clipboard cleanup. Configure these behaviors in Settings.

## Statistics and logging

### Statistics

Open **Terminal statistics...** from a pane or **All terminal statistics...** from the workspace context menu. Statistics include session identity, PID, shell, uptime, rows and columns, input/output totals, and process resource information when available.

If an older installed bridge reports `Unsupported message type: statistics`, update MultiTerm so the UI and bridge versions match.

### Logging

Use **Log to file...** from a terminal context menu to capture output. Stop logging from the same menu, then use **Reveal last log** or **Reveal log folder** to locate the file.

## Notifications, tray, and closing

Settings can notify you about terminal activity, inactivity, or the terminal bell. Browser notification permission may be required.

In the installed desktop app, closing the window asks whether to:

- keep MultiTerm running in the system tray;
- quit the app; or
- cancel and return to the workspace.

The **Keep shell sessions alive when closing** setting determines whether quitting ends terminal processes. Use the tray icon to show or quit MultiTerm later.

## Windows integration

### File Explorer

The installer can add both:

- a classic **Open in MultiTerm** Explorer context-menu command; and
- a modern Windows 11 **Open in MultiTerm** entry.

Explorer integration is optional and unchecked by default. Enable it explicitly on the installer's **Select Additional Tasks** page. Folder, folder-background, and drive invocations are supported. If MultiTerm is already running, Explorer forwards the folder to a live instance.

### Command line

The installer can optionally add MultiTerm's protected installation directory to the system `PATH`. After opening a new shell, run:

```powershell
multiterm
multiterm "C:\src\my-project"
```

Each normal installed, CLI, or taskbar launch requests an independent app instance with its own bridge port, browser profile, state record, and log. Multiple installed instances can therefore run concurrently.

## Settings

Settings cover:

- app and terminal color themes;
- terminal font, size, weight, cursor, opacity, and scrollback;
- layouts, gaps, dimensions, and minimized-terminal scope;
- startup commands and initial terminal count;
- clipboard, right-click, broadcast, and synchronized-input behavior;
- session persistence and restore;
- activity, inactivity, and bell notifications;
- update-check behavior; and
- header and layout-panel visibility.

Changes are stored locally in the app's browser profile. Use **Reset settings** to return to defaults.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| <kbd>Ctrl+T</kbd> | New terminal |
| <kbd>Ctrl+Shift+W</kbd> | Close active terminal |
| <kbd>Ctrl+Shift+R</kbd> | Restart active terminal |
| <kbd>Ctrl+Shift+X</kbd> | Maximize or restore active pane |
| <kbd>Ctrl+Shift+P</kbd> / <kbd>F1</kbd> | Command palette |
| <kbd>Ctrl+Shift+Q</kbd> | Dequeue next command |
| <kbd>Alt+Q</kbd> | Quick terminal switcher |
| <kbd>Ctrl+F</kbd> | Find in active terminal |
| <kbd>Ctrl+Shift+F</kbd> | Find in all terminals |
| <kbd>Ctrl+Shift+B</kbd> | Broadcast command |
| <kbd>Ctrl+Shift+C</kbd> | Copy |
| <kbd>Ctrl+Shift+V</kbd> | Paste |
| <kbd>Ctrl+Shift+L</kbd> | Clear active terminal |
| <kbd>Ctrl+PageUp</kbd> / <kbd>Ctrl+PageDown</kbd> | Previous or next page |
| <kbd>Ctrl++</kbd> / <kbd>Ctrl+-</kbd> | Change default terminal font size |
| <kbd>Ctrl+Alt++</kbd> / <kbd>Ctrl+Alt+-</kbd> / <kbd>Ctrl+Alt+0</kbd> | Change or reset active-pane zoom |
| <kbd>Ctrl+/</kbd> | Keyboard-shortcut reference |
| <kbd>Escape</kbd> | Close the active dialog, menu, or search |

## Updates and version information

Open **About MultiTerm** from the header or command palette to see the running version, check for updates, open the latest release, or download the current installer. Automatic checks use the configured interval and never install an update without confirmation. Your update-check choice and interval are stored per user, survive upgrades, and are shared by concurrent MultiTerm instances; change them at any time in **Session settings**.

## Troubleshooting

### A terminal does not start

- Confirm the selected shell is installed and available.
- For PowerShell 7, verify `pwsh` runs from a normal terminal.
- For WSL, run `wsl --status` and confirm a distribution is installed.
- Try another working directory; inaccessible paths are rejected.
- Check **Runtime logs** for the bridge error.

### The app disconnected

The UI reconnects automatically when the local bridge restarts. If it remains disconnected, reopen MultiTerm and inspect the runtime logs. Source launches use the configured local bridge port; installed concurrent launches automatically claim available fallback ports.

### Explorer or `multiterm` is missing

Run the installer again and select the corresponding optional task. Explorer integration is intentionally opt-in. PATH changes are visible only to shells opened after installation.

### Layout or display problems

Use **Fit all terminals**, then **Reset layout**. If a manual layout is off-screen after a monitor change, switching to another layout and back also normalizes pane positions.

### Getting more detail

Open **Runtime logs** from the status bar and choose the appropriate severity. Include the MultiTerm version, shell type, and relevant log messages when reporting an issue.

## Privacy and security

MultiTerm serves its UI and terminal bridge on the local machine. Bridge requests use a per-run authentication token. Notes, queues, settings, and workspace metadata are stored locally. Terminal commands and output are not sent to a remote MultiTerm service.

Treat copied commands, scripts, Administrator terminals, Explorer extensions, and third-party CLIs with the same care you would use in a standalone terminal.

## More information

- [Project README](https://github.com/andrewtheart/multiterm-workbench#readme)
- [Latest release](https://github.com/andrewtheart/multiterm-workbench/releases/latest)
- [Issue tracker](https://github.com/andrewtheart/multiterm-workbench/issues)
- [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html)
