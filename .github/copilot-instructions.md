# MultiTerm Workbench Instructions

## Ports and running the app

| Port | Owner |
|------|-------|
| 3177 | Installed build (`Start-MultiTerm.ps1`), and the default for `src/server.js` |
| 3178 | Dev Electron app used during agent sessions |
| 3199 | Shared Playwright bridge (`webServer` in `playwright.config.js`) |

- There is no renderer build step. Edits to `public/*` only reach the window after a relaunch, so relaunch the dev app yourself once a renderer change is validated rather than waiting to be asked.
- Relaunch on 3178: stop the current listener by port, then `$env:PORT='3178'; Start-Process (Resolve-Path 'node_modules\.bin\electron.cmd') -ArgumentList '.' -WindowStyle Hidden`, and confirm `http://127.0.0.1:3178/health` reports `ok`.
- Never assume a process holding a port is stale. A holder on 3177, 3178, or 3199 may be the user's live work or a suite in progress; ask before stopping anything you did not start.
- Resolve processes through the port that owns them (`Get-NetTCPConnection -LocalPort <port> -State Listen`), never by image name.

## Running the Playwright suite

- Do not edit `public/*` or `src/server.js` while a full run is in flight. Either restarts the shared 3199 bridge mid-run, which cascades into connection failures and invalidates the renderer coverage merge. Wait for the run to finish.
- `retries: 1` is set, so anything that passed only on retry is reported as flaky. Treat that as a result to explain, not a pass.
- A `reset()` helper that calls `closeAllTerminals()` once can race the renderer's welcome terminal and then wait forever for a pane count of 0. Poll the close until the count reaches 0.

## UI and layout changes

- A green suite is not evidence the UI looks right. Assert geometry and computed style — bounding boxes, edges, `display`, `border-width` — rather than only that an element exists.
- Exercise every variant a change can reach. A pager band is a row in `top`/`bottom` placement and a column in `left`/`right`, so DOM order that puts a control at the top right of one puts it at the foot of the other.
- Prove a new guard fails without the fix: revert the fix, confirm the test fails, then restore. Confirm the revert actually applied first — these files are CRLF, so a PowerShell `.Replace` written with `` `n `` matches nothing and the test then passes for the wrong reason.

## CSS

- The user-agent rule for `[hidden]` loses to any author `display` rule. When adding `display` to a class whose elements are toggled through the `hidden` attribute, restate `[hidden] { display: none; }` for that selector, or the element stays visible with no error anywhere.

## Test Organization

- Name test files after the product functionality or behavior they verify.
- Do not create generic coverage-bucket files or names such as `coverage-completion`, `coverage-gaps`, `remaining-coverage`, or similar.
- When adding coverage for an existing feature, place the tests in that feature's existing spec. Create a new spec only when it names a distinct product capability.
- Coverage is a verification result, not a test taxonomy. Test and describe names must state the behavior under test rather than the metric they improve.