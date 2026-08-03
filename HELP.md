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

The terminal context menu organizes these actions into two columns of named groups. Its search field is focused immediately, so you can type an action name without an extra click. Press <kbd>Down</kbd> or <kbd>Tab</kbd> to enter the filtered results, then use the arrow keys and Enter. On narrow windows the groups collapse to one column.

Customize that menu directly:

- drag an action to reorder it within a section or move it into another section;
- drag the grip beside a section heading to move the entire section;
- select a section heading to rename it;
- open a section's **...** menu to rename or remove it (its actions move to the nearest remaining section);
- select **Add section** at the bottom-left to create and name a new section; or
- right-click an action and choose **Hide item**.

When at least one action is hidden, **Show hidden items** appears at the bottom-right. Revealed hidden actions remain disabled so they cannot run accidentally; right-click one and choose **Show item** to restore it. Section names, custom sections, action order, placement, and hidden actions are stored in the current browser profile and merge with newly added application actions after an upgrade.

Drag any terminal-header action onto the hamburger menu to move it into that menu. Open the hamburger menu and drag an action row back onto the header to restore it. The scope flyout defaults to **All terminals**; choose **This terminal** for a per-terminal layout, or select **Always take this action (don't ask me again)** to remember the scope. Change **Header drag scope** under **Terminal** to show the flyout again. Global and per-terminal placements persist across reloads and saved workspaces.

#### Custom context-menu shortcuts

Open a terminal's context menu and select the keyboard button beside Search to edit shortcuts in place. Select **Set** beside an executable action, then press either:

- one plain digit from <kbd>1</kbd> through <kbd>9</kbd>; or
- a key combined with <kbd>Ctrl</kbd>, <kbd>Alt</kbd>, <kbd>Shift</kbd>, or <kbd>Meta</kbd>.

Each exact shortcut belongs to one action. Assigning an occupied digit or chord moves it from the previous action and reports the change in the capture strip. To replace a shortcut, select its keycap and press the new combination. Press unmodified Delete or Backspace while capturing to clear it, or Escape to cancel.

Mappings are stored in the current browser profile and survive reloads. A plain digit activates immediately while the focused menu search is empty; modifier combinations work anywhere in the open menu. Operating-system or browser-reserved combinations may be intercepted before MultiTerm receives them, so prefer chords that the host does not already own.

Drag a pane by its title bar to reorder it. Layouts with a primary pane use the active terminal as the primary pane.

### Administrator terminals

Use **New Administrator terminal** to elevate only a new terminal, or **Restart as Administrator** to relaunch the complete workspace elevated. Windows displays a UAC prompt before elevation.

### WSL and tmux

Select **WSL** for a normal WSL shell. To reconnect to a persistent tmux session, use **Attach WSL tmux session...** from the command palette. MultiTerm discovers available distributions and tmux sessions, then opens the selected session in a terminal pane.

WSL and tmux must already be installed and configured. MultiTerm does not install Linux distributions or tmux.

## Pages and workspaces

Pages organize terminals into separate visual groups without ending their shell processes.

- Use the page tabs or <kbd>Ctrl+PageUp</kbd>/<kbd>Ctrl+PageDown</kbd> to switch pages. Each tab has a small <strong>x</strong> at its right edge; the last remaining page keeps a disabled close indicator because MultiTerm always retains one page.
- Double-click a page name to rename it.
- Right-click a page for **Rename**, **New page**, **Close page**, and **Close all**. Close all resets the workspace to one empty **Page 1**.
- Closing a populated page asks whether to move its terminals to a neighbouring page or close them. Select **Take this action next time** to remember the choice, or change **When closing a page with terminals** under **Session** settings.
- Choose **Pages location** under **Layout** to place the page tabs at the top, bottom, left, or right. Right-click blank space in the tabs bar or vertical panel to open a menu whose first action is **Open new page** (quick key <kbd>1</kbd>), followed by the same four placement choices. Changes from either placement control persist across launches and keep the other control synchronized. A vertical pages panel has its own hide button and a floating restore button.
- Drag page tabs left/right in a horizontal bar or up/down in a vertical panel. With a page focused, <kbd>Ctrl+Shift</kbd> plus the matching arrow key reorders it from the keyboard.
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

Open **Notes...** from a terminal's context menu, or **Notes & command queue...** from the header notebook button or the command palette. Notes are stored against the terminal PID so each live shell has its own working context.

When a shell exits, its notes are retained in **Recovered notes** instead of being deleted. You can copy or remove recovered notes after reviewing them.

### Command queues

Build a list of commands or prompts without sending them immediately. Each live terminal has its own queue.

- Select a queued item to insert it into that terminal.
- Inserting a queued item does **not** send Enter, so you can review or edit it first.
- Hover **Command queue** in a terminal's context menu to see that terminal's queued commands (most recent first); click one to insert it and dequeue it in a single step.
- Use the pane's quick-dequeue control or press <kbd>Ctrl+Shift+Q</kbd> to insert the next queued item without reopening the dialog.
- Reorder or remove items from the queue manager.

If a terminal exits while commands remain, its queue moves to **Unparented queues**. Unparented commands remain reusable and can be inserted into another live terminal.

## Terminal messaging

Open **Terminal messages** from the header, choose two live terminals in the current MultiTerm instance, and send a structured handoff. A terminal's right-click **Send to terminal...** action opens the same composer with that terminal selected as the sender.

Terminal messages are most useful when the destination is busy, on another page, or receiving context from a terminal or agent programmatically. They preserve the selected source context, message kind, destination, and timestamp while requiring the receiver to approve insertion. When both terminals are visible and you only need to type a one-off command, direct terminal input is usually faster.

Message kinds include commands/prompts, text/summaries, file or folder paths, status/readiness, tasks, and results. Received messages remain in the bridge-owned inbox until you:

- choose **Insert**, which types the content into the target terminal without pressing Enter; or
- choose **Dismiss**, which removes it without touching the terminal.

Messages are rendered as literal text and are never executed automatically. Insert revalidates the stored content and rejects terminal control characters, including Enter, tab, escape sequences, DEL, and C1 controls. A message stays pending if the target cannot accept the write, and messages expire when their target session exits. The selected source terminal is context, not authenticated sender identity.

Per-pane Administrator terminals are not message targets yet because their relay cannot confirm that the elevated PTY accepted an Insert. MultiTerm rejects that route instead of reporting an ambiguous success.

This first version routes messages between live terminals and connected windows in one running MultiTerm instance. Durable/offline delivery, stable aliases, shell/agent CLI senders, cross-instance routing, replies, and explicitly confirmed automation rules are planned but are not enabled yet.

The **Communication** settings control message size and pending inbox capacity. Capacity `0` disables the per-terminal quota, but the bridge always caps the shared store at 500 pending messages or 4 MiB. Both settings are stored with the existing user settings and enforced by either bridge.

### Developer examples by message kind

Each kind records the same route and timestamp, but choosing the closest kind makes the receiver's inbox easier to scan.

#### Command or prompt: reproduce a failing test

A failed CI or test terminal can stage the exact focused command in a clean reproduction shell: `npm run test:e2e -- --grep "checkout flow"`. The receiver can inspect or edit flags before choosing **Insert**, and must still press Enter explicitly to run it.

![A command handoff from Failed tests to Repro shell with a focused Playwright command](public/help-images/terminal-message-command.png)

#### Text or summary: pass concise debugging context

Use **Text or summary** when raw logs are too noisy. An API log terminal can tell a debugging shell: `Checkout returns 500 after inventory reservation; request ID req-7f31.` The request ID and failure stage survive as structured context without pasting a whole log stream.

![A text summary handoff from API logs to Debug shell describing a checkout failure](public/help-images/terminal-message-text.png)

#### File or folder path: point to an artifact

Use **File or folder path** for a trace, coverage report, build output, generated migration, or repository folder. A test runner can hand the investigation shell `D:\shop-app\test-results\checkout-flow\trace.zip` without risking shell metacharacters or accidental execution.

![A path handoff from Test runner to Debug shell containing a Playwright trace archive](public/help-images/terminal-message-path.png)

#### Status or readiness: coordinate dependent processes

Use **Status or readiness** when one terminal is waiting on another service. An API terminal can announce `ready` with `API listening on http://localhost:8000; migrations applied.` The frontend developer immediately knows both the endpoint and the prerequisite state.

![A ready status handoff from API server to Frontend dev](public/help-images/terminal-message-status.png)

#### Task: delegate bounded work

Use **Task** for a concrete assignment to another developer shell or agent: `Investigate the flaky checkout test. Reproduce first; do not change authentication code.` Including the constraint prevents a broad fix from drifting into security-sensitive code.

![A task handoff from Code review to Worker shell with scope and constraints](public/help-images/terminal-message-task.png)

#### Result: return an outcome and changed path

Use **Result** to close the loop. A worker can report `Fixed a stale cart-state race; all 18 checkout tests pass.` and attach `D:\shop-app\src\checkout\cart-store.ts`. The reviewing terminal gets both the conclusion and the file to inspect.

![A result handoff from Worker shell to Code review with a passing test summary and source path](public/help-images/terminal-message-result.png)

### Receiver review workflow

The receiver sees the source, destination, kind, timestamp, and literal payload together. **Insert** writes into the intended target without Enter; **Dismiss** removes the handoff without touching the terminal. This is the approval boundary that makes a handoff safer than remotely injecting input.

![The terminal message inbox showing a pending test command with Insert and Dismiss controls](public/help-images/terminal-message-inbox.png)

### Terminal connections

Pending handoffs draw a dashed amber circle-to-arrow connector from the selected source context to the target pane. The connector disappears when the handoff is inserted, dismissed, or expires. Multiple pending handoffs on the same route share one connector with a count.

For example, a command handed from **Frontend dev** to **API server** produces a temporary amber route while the API terminal still has an inbox item to review.

![Two developer terminals joined by a dashed amber pending-handoff connector](public/help-images/terminal-connection-pending.png)

To keep a directional connection visible without sending a message, choose the source and target in **Terminal messages**, then select **Link terminals**. Explicit links use a solid cyan diamond-to-arrow connector. Remove one with **Unlink** in the Connections list. Links persist across reloads in the local browser profile, synchronize to other same-origin MultiTerm windows, and are removed when either terminal session ends. Workspace connectors appear only when both endpoint panes are visible; the dialog topology shows the current routes and provides the management controls.

A useful persistent link is **Frontend dev** to **API server** during feature work: it records the direction in which UI findings, endpoint questions, and reproduction commands normally travel without sending anything by itself.

![Frontend dev and API server terminals joined by a solid cyan saved link](public/help-images/terminal-connection-link.png)

Hover or select a workspace connector to reveal **Send message**. This opens the handoff composer with that connector's source and destination already selected; the message still goes to the receiver's inbox and never executes automatically.

![The saved Frontend dev to API server connector showing its Send message hover action](public/help-images/terminal-connection-send-action.png)

An explicit link is visual metadata only. It does not authenticate either terminal, grant shell access, deliver data, or run commands.

## Search, broadcast, and input

### Search

- <kbd>Ctrl+F</kbd> searches the active terminal.
- <kbd>Ctrl+Shift+F</kbd> searches all terminals.
- Use Enter/Shift+Enter to move between matches and Escape to close search.

### Broadcast

Press <kbd>Ctrl+Shift+B</kbd> to compose text once and send it to several terminals. Broadcast scope can target the current page or all pages. The **Send Enter** option controls whether the command runs immediately.

### Clipboard behavior

MultiTerm supports copy-on-select, <kbd>Ctrl+Shift+C</kbd>, <kbd>Ctrl+Shift+V</kbd>, optional <kbd>Ctrl+V</kbd> paste, right-click paste modes, and Copilot CLI clipboard cleanup. Copied File Explorer items are pasted as file paths. Images copied from tools such as Snipping Tool are saved temporarily as PNG files and pasted as paths so Copilot CLI can attach them as prompt context. Configure clipboard behaviors in Settings.

## Statistics and logging

### Statistics

Open **Terminal statistics...** from a pane or **All terminal statistics...** from the workspace context menu. Statistics include session identity, PID, shell, uptime, rows and columns, input/output totals, and process resource information when available.

If an older installed bridge reports `Unsupported message type: statistics`, update MultiTerm so the UI and bridge versions match.

### Logging

Use **Log to file...** from a terminal context menu to capture output. Stop logging from the same menu, then use **Reveal last log** or **Reveal log folder** to locate the file.

## Notifications, tray, and closing

Settings can notify you about terminal activity, inactivity, or the terminal bell. Browser notification permission may be required.

In the Electron desktop app, closing the window asks whether to:

- keep MultiTerm running in the system tray;
- quit the UI but keep its bridge and terminal sessions running;
- quit and close the bridge; or
- cancel and return to the workspace.

Choosing **Quit & close bridge** warns that all associated terminal sessions and in-progress commands will end. MultiTerm first sends `exit` to each shell. A busy command that does not exit during the grace period receives terminal Ctrl+C, followed by another `exit`; force termination is the last resort. Tray **Quit MultiTerm** opens the same decision instead of bypassing it.

### Optional watchdog

Setup offers the **MultiTerm watchdog** as a recommended optional task. It installs a lightweight per-user background agent that starts when you sign in, monitors every registered MultiTerm bridge, and detects bridges that are unresponsive or have live terminal sessions after their last app window disconnects. After a reconnect grace period, its decision dialog shows the affected bridge and active-session count. **Keep terminals running** is the safe default; **Close bridge and terminals** starts staged graceful shutdown. Keeping the bridge suppresses repeat prompts until a MultiTerm UI reconnects.

The watchdog is a per-user agent rather than a Windows Service because Windows services run in Session 0 and cannot safely display dialogs in the signed-in user's desktop session. It does not require administrator privileges. Its rotating diagnostic log is `%LOCALAPPDATA%\MultiTerm\watchdog.log`.

Windows does not provide one universal `SIGTERM` equivalent for arbitrary applications. For console sessions, MultiTerm uses terminal Ctrl+C (`ETX`, analogous to `SIGINT`) as the cooperative interrupt, together with the shell's `exit` command. On Linux, the graceful termination signal you may remember is usually `SIGTERM`.

## Windows integration

### File Explorer

The installer can add both:

- a classic **Open in MultiTerm** Explorer context-menu command; and
- a modern Windows 11 **Open in MultiTerm** entry.

Explorer integration is optional and unchecked by default. Enable it explicitly on the installer's **Select Additional Tasks** page. Folder, folder-background, and drive invocations are supported. If MultiTerm is already running, Explorer forwards the folder to a live instance.

### Visual Studio Code

The installer can also add MultiTerm commands to Visual Studio Code's Explorer. Right-click a file to open its containing folder, right-click a folder to open that folder, or use **Open Workspace in MultiTerm** from the Explorer when no resource is selected. The command reuses a live MultiTerm instance or starts one if necessary. For a nonstandard installation, set `multiterm.launcherPath` in VS Code.

### Command line

The installer can optionally add MultiTerm's protected installation directory to the system `PATH`. After opening a new shell, run:

```powershell
multiterm
multiterm "C:\src\my-project"
```

Each normal installed, CLI, or taskbar launch requests an independent app instance with its own bridge port, browser profile, state record, and log. Multiple installed instances can therefore run concurrently.

## Settings

Every settings group starts collapsed. Select a group header or its chevron to expand it. The search box remains at the top of the panel while you scroll and filters individual settings by labels, option names, descriptions, placeholders, control names, and related terminology. For example, **tabs** finds **Pages location**, **macros** finds **Snippets**, and **projects** finds **Workspaces** even when the typed word is not visible in the setting label. Multi-word searches may use related terms in any order. Matching groups expand temporarily; clearing the search restores the groups you had open before searching. Select **Show all** to clear any filter and expand every group; select **Collapse all** to close them again.

Settings cover:

- app and terminal color themes;
- terminal font, text size, title size, weight, cursor, opacity, and scrollback;
- layouts, gaps, dimensions, and minimized-terminal scope;
- startup commands and initial terminal count;
- clipboard, right-click, broadcast, and synchronized-input behavior;
- session persistence and restore;
- activity, inactivity, and bell notifications;
- update-check behavior; and
- header and layout-panel visibility.

**Title size** scales terminal-title text from 80% to 150% and defaults to 110%. Choose 100% to restore the original title size.

Changes are stored locally in the app's browser profile. Use **Reset settings** to return to defaults.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| <kbd>Ctrl+T</kbd> | New terminal |
| <kbd>Ctrl+P</kbd> | New page |
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
| <kbd>Ctrl+/</kbd> | Categorized keyboard-shortcut reference |
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

MultiTerm serves its UI and terminal bridge on loopback only. Browser clients must pass exact Host and Origin checks; remote-mode flags and non-loopback bind hosts are refused. Notes, queues, settings, and workspace metadata are stored locally. Terminal commands and output are not sent to a remote MultiTerm service.

Electron opens only HTTPS external links. Updates must match the GitHub release asset's exact size and SHA-256 digest before launch; the maximum installer size is configurable under **Performance**. Installers are not yet Authenticode-signed, so verify the release source before approving an update.

Treat copied commands, scripts, Administrator terminals, Explorer extensions, and third-party CLIs with the same care you would use in a standalone terminal.

## More information

- [Project README](https://github.com/andrewtheart/multiterm-workbench#readme)
- [Latest release](https://github.com/andrewtheart/multiterm-workbench/releases/latest)
- [Issue tracker](https://github.com/andrewtheart/multiterm-workbench/issues)
- [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html)
