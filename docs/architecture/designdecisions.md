# Architecture Design Decisions

## Backend implementation strategy

**Status:** Under evaluation  
**Decision date:** 2026-07-27

### Context

MultiTerm currently has two local backend implementations that expose the same
JSON-over-WebSocket protocol to the renderer:

- `server.js` is the Node.js bridge used by Electron and development workflows.
  It manages terminal sessions through `node-pty`.
- `Start-MultiTerm.ps1` is the installed application's bridge. It embeds C# that
  serves HTTP and WebSockets, calls Windows ConPTY directly, manages elevated
  terminals, and launches the browser in app mode.

This duplication increases the chance that one backend gains a protocol feature
that the other does not. Previous examples include `pickScript` and `memstats`
being implemented in one path before the other.

A native Rust backend could replace both implementations while preserving the
renderer protocol. WebAssembly was also considered as a possible backend target.

### Current decision

Do not begin a full backend rewrite until a focused Rust proof of concept
demonstrates clear benefits over the shipped PowerShell/C# backend.

The proof of concept should implement only:

- An HTTP/WebSocket endpoint compatible with the existing renderer protocol.
- One PowerShell session using Windows ConPTY.
- Terminal input, output, resize, exit, and shutdown.
- Repeated concurrent terminal creation and teardown.
- Cleanup of shell processes after forced backend termination.

If the proof of concept succeeds, the preferred long-term target is one native
Rust backend shared by both launch modes. Electron should remain the desktop
shell; migrating Electron to Tauri or another shell is a separate decision and
is not part of the backend work.

### Advantages of the current implementation

The current architecture has important benefits that must not be discarded
without measured justification:

1. **Architecture-neutral installer**

   The installer currently contains PowerShell, embedded C#, and web assets. A
   single payload runs on supported x86, x64, and ARM64 Windows systems. Native
   Rust binaries would require separate builds and packaging for each supported
   architecture.

2. **The shipped backend does not use `node-pty`**

   The installed application calls ConPTY directly from embedded C#. The native
   `node-pty` teardown crashes documented in `server.js` primarily affect the
   Electron and Node development path, not the backend shipped by the installer.

3. **Established behavior and test coverage**

   The current protocol, session lifecycle, elevation flow, logging, memory
   reporting, file picker, shutdown path, and browser app-mode integration are
   already implemented and exercised by the existing test suite. A rewrite
   would create regression risk in all of these areas.

4. **Fast iteration and accessible diagnostics**

   JavaScript, PowerShell, and embedded C# can be inspected and patched without
   compiling native executables. The current toolchain is also more familiar to
   contributors who do not work regularly in Rust.

5. **Simpler release process**

   The existing release does not require a Rust toolchain, Cargo dependency
   cache, architecture-specific build matrix, native binary signing, or separate
   artifact verification. New unsigned executables would also increase Windows
   SmartScreen friction.

6. **Existing Windows integration**

   `Start-MultiTerm.ps1` already handles browser discovery, app-mode launching,
   AUMID and taskbar branding, existing-instance detection, graceful shutdown,
   native dialogs, and elevated terminal relays. These responsibilities are
   broader than simply serving terminal I/O.

7. **Limited performance pressure**

   MultiTerm's practical bottlenecks are shell startup and terminal rendering,
   not HTTP or WebSocket throughput. Replacing the bridge would not materially
   accelerate xterm.js rendering or shell commands.

### Potential advantages of a Rust backend

A successful native Rust backend could still provide meaningful improvements:

- One backend implementation instead of independently maintained Node and
  PowerShell/C# implementations.
- Removal of the Node/native-module ABI dependency from Electron mode.
- Safer and more deterministic ownership of ConPTY handles.
- Windows Job Objects for reliable descendant-process cleanup.
- Direct process and memory inspection without PowerShell CIM subprocesses.
- Faster backend startup and lower bridge memory usage.
- A signed, self-contained backend executable with explicit protocol types and
  structured diagnostics.

Backend unification and reliability are the primary reasons to consider Rust.
Raw HTTP/WebSocket performance is not a sufficient reason by itself.

### Why WebAssembly is not the backend target

WebAssembly is not a suitable replacement for the native local backend.
MultiTerm must create ConPTY handles, spawn shells, manage process trees, bind
local sockets, access the filesystem, open native dialogs, and cross a UAC
integrity boundary.

Browser WebAssembly cannot perform those operations directly. A WASI runtime
would still need a native host that exposes custom Windows capabilities. That
would retain a native backend while adding a WebAssembly runtime and another
IPC or capability boundary.

WebAssembly may be useful later for isolated, portable computation such as
parsing or protocol validation. Those operations are not current performance
bottlenecks and do not justify placing the backend in WebAssembly.

### Migration scope and estimated effort

Replacing only `server.js` is not backend unification because the installer
would continue to use the separate PowerShell/C# implementation.

Approximate effort for one engineer:

| Scope | Rust-experienced engineer | Engineer learning Rust |
| --- | ---: | ---: |
| ConPTY/WebSocket proof of concept | 2-3 weeks | 4-6 weeks |
| Replace only the Node bridge | 6-10 weeks | 12-20 weeks |
| Replace and unify both backend paths | 10-16 weeks | 18-30 weeks |
| Stabilization and beta validation | 2-4 additional weeks | 2-4 additional weeks |

These estimates exclude any Electron migration.

### Proof-of-concept acceptance criteria

Proceed to a unified implementation only if the proof of concept:

- Runs the existing renderer without requiring protocol or UI changes.
- Preserves Unicode output, resizing, exit status, and interactive input.
- Survives repeated rapid creation and closure of at least 10-20 terminals.
- Leaves no orphaned shell processes after normal or forced shutdown.
- Demonstrates a measurable stability, cleanup, startup, or memory improvement.
- Has a credible design for the elevated-terminal helper and its authentication.
- Can be built, signed, packaged, and tested for every supported Windows
  architecture.

If these criteria are not met, retain the current PowerShell/C# backend and
address the Electron-specific `node-pty` path independently.

