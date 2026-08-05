# Prompt Library Security Decisions

**Status:** Approved for implementation  
**Decision date:** 2026-08-04  
**Implementation status:** In progress

This document records the security decisions for the MultiTerm Prompt Library.
It is a design commitment and review checklist. The encrypted storage host and
bridge protocol are implemented; renderer editing, import, AI proposal review,
and terminal queue integration remain in progress and have not shipped.

## Decision summary

The Prompt Library will be a shared, permanent, encrypted store available to
both MultiTerm bridge implementations. The approved design is:

- SQLite3MultipleCiphers 2.5.0, built from pinned MIT-licensed source;
- non-legacy ChaCha20-Poly1305 authenticated page encryption;
- a random 256-bit database key protected with Windows DPAPI `CurrentUser`;
- one persistent, architecture-matched storage host shared through an identical
  renderer protocol from both bridges;
- strict Markdown sanitization and untrusted-file handling;
- tool-free, non-persistent AI analysis that returns validated edit proposals;
- terminal insertion without Enter by default; and
- automatic queued submission only to a positively detected ready AI terminal,
  with approval cleared on renderer reload.

Commercial SQLCipher products are excluded. Deprecated unofficial SQLCipher
NuGet packages and a second native Node SQLite binding are also excluded.

## Context

MultiTerm has two local bridge implementations:

- `server.js`, used by Electron and Node development workflows; and
- the embedded C# bridge in `Start-MultiTerm.ps1`, used by the installed browser
  application.

The Prompt Library must behave identically in both modes and must not create a
Node/Electron ABI split. Prompts can contain credentials, internal instructions,
source fragments, and other sensitive text. Plain SQLite or browser storage is
therefore not an acceptable default for the permanent shared library.

The encryption design must also avoid loading and decrypting the complete
SQLite database in application memory. DPAPI can protect arbitrary byte arrays;
it is not restricted to decrypting files. In this design DPAPI protects only a
small randomly generated database key. SQLite3MultipleCiphers encrypts and
decrypts individual pages as SQLite reads and writes them.

## Threat model

### Threats addressed

- Offline inspection of a copied database, WAL, or wrapped key by another
  Windows account.
- Accidental plaintext prompt leakage into database, WAL, or temporary SQLite
  files.
- Tampering with encrypted database pages.
- SQL injection through prompt names or bodies.
- Lost updates from concurrent MultiTerm windows or bridge instances.
- Malicious Markdown, unsafe links, and hostile imported files.
- Prompt injection attempting to turn AI analysis into tool use or actions.
- Malformed or stale AI edit responses.
- Hidden terminal execution caused by newline/control handling or automatic
  queue restoration.
- Protocol drift between the Node and installed bridges.
- Native dependency substitution during build or release packaging.

### Threats not addressed

- Malware or another process already running as the same Windows user.
- An attacker that can read the storage host process memory.
- Compromise of the configured GitHub Copilot or Claude account/provider.
- Disclosure through terminal output, clipboard history, logs, screenshots,
  crash dumps, swap, hibernation, or an explicitly exported plaintext file.
- Recovery of a library after the Windows account's DPAPI material is lost.
- Cross-machine or cross-account portability of the raw database and key files.

## Decision 1: open-source encrypted SQLite only

The database engine will be SQLite3MultipleCiphers 2.5.0 under its MIT license.
The exact upstream release, source archive SHA-256, and artifact attestation will
be pinned. MultiTerm will build and vendor deterministic native DLLs from that
source for x86, x64, and ARM64.

Production packages will not use upstream precompiled binaries as opaque inputs.
They may be used as behavioral references. The repository will retain the source
provenance, build recipe, compiler flags, license, and output hashes needed to
reproduce and audit the packaged binaries.

The build will include only the required SQLite features and the approved cipher
where practical. Exported symbols and runtime cipher selection will be checked
in tests.

### Rejected alternatives

- **Commercial SQLCipher:** rejected because MultiTerm is an open-source tool and
  will not require a commercial database product or license.
- **Deprecated unofficial SQLCipher NuGet packages:** rejected because their
  encryption binaries are explicitly deprecated, unofficial, and unmaintained.
- **`better-sqlite3-multiple-ciphers` in `server.js`:** rejected as the shared
  solution because it would cover only the Node bridge and add another native
  ABI/rebuild surface.
- **Plain SQLite with a DPAPI-encrypted whole database:** rejected because it
  requires decrypting and materializing the database outside SQLite.
- **Per-field DPAPI as the primary design:** rejected because it prevents normal
  encrypted indexing and leaves schema, metadata, and page behavior outside one
  authenticated database envelope. It remains preferable to plaintext but is
  not the selected architecture.
- **Shared JSON:** rejected because concurrent writers would require custom
  locking, merge, recovery, indexing, and atomic-replacement logic.

## Decision 2: ChaCha20-Poly1305 page encryption

SQLite3MultipleCiphers will use its `chacha20` cipher in non-legacy mode. This
mode derives one-time keys per database page and stores a Poly1305 authentication
tag per page. Authentication checks remain enabled for every normal read.

The encrypted database header remains fully encrypted. Legacy cipher modes and
legacy WAL behavior are disabled for new Prompt Library databases. The current
non-legacy WAL encryption path is required.

SQLite temporary storage will be configured in memory. Extension loading and
cipher debug logging will be disabled. The native engine will be built with
memory clearing support and `memory_security` will be enabled. This reduces
residual plaintext lifetime but does not guarantee protection from swap,
hibernation, process inspection, or crash dumps.

The storage host must fail closed when it cannot confirm the selected cipher or
read `sqlite_master` after keying the connection. Authentication failures,
corruption, and wrong-key failures must be reported without replacing or
silently recreating the database.

## Decision 3: DPAPI protects only the database key

On first use, the storage host will generate a cryptographically random 256-bit
key. Windows DPAPI with `DataProtectionScope.CurrentUser` protects that key. The
wrapped key is stored beside the database under the user's local application data
directory with user-profile ACLs.

The production locations are:

- `%LOCALAPPDATA%\MultiTerm\PromptLibrary\library.db`; and
- an adjacent wrapped-key file with a versioned format.

On host startup, the wrapped key is decrypted once. The raw key is supplied to
SQLite3MultipleCiphers before any database operation through the narrowest
available native key interface. Caller-owned key buffers are cleared after the
engine is keyed.

The raw key must never appear in:

- command-line arguments;
- environment variables;
- JSON requests or responses;
- logs, errors, traces, or telemetry;
- interpolated SQL text; or
- browser-visible state.

The database engine necessarily retains working key material while its
connection is open. The storage host is therefore a trusted same-user process.

If the wrapped key is missing while a nonempty database exists, startup fails
with a recovery error. It must not generate a replacement key or overwrite the
existing database. If the database is missing but a wrapped key exists, creating
a new empty database requires an explicit, tested recovery policy rather than an
implicit reset.

## Decision 4: one persistent storage host

A required `MultiTerm.PromptLibraryHost` process will own the encrypted database
connection. It will be architecture-matched to the installed OS and packaged
with the corresponding SQLite3MultipleCiphers DLL.

Each bridge keeps one host connection alive instead of starting a process for
every request. This avoids repeated DPAPI operations, key setup, and cipher
initialization. The host uses a framed or line-delimited, BOM-free JSON protocol
over redirected standard input/output. Library code must prevent dependencies
from writing unrelated content to protocol stdout.

The supported operations are:

- `list` for metadata;
- `get` for one prompt body;
- `upsert` for create or update; and
- `delete` for deletion.

The renderer protocol is identical in `server.js` and `Start-MultiTerm.ps1`:

- `promptLibraryList`;
- `promptLibraryGet`;
- `promptLibrarySave`;
- `promptLibraryDelete`; and
- `promptLibraryChanged` broadcasts after mutation.

Host calls run asynchronously and do not block the PowerShell bridge socket
thread. Responses and errors are bounded, correlated, and timed out. Bridge
protocol parity tests must fail if one implementation gains a message without
the other.

## Decision 5: schema, concurrency, and failure behavior

The encrypted database contains normal SQL name and body columns. Encryption is
provided by the page engine, not by application-visible ciphertext columns.

Each prompt has:

- a GUID identifier;
- name and Markdown body;
- host-generated UTC creation and modification timestamps; and
- a revision used for optimistic concurrency.

A monotonic library revision identifies catalog changes. Schema changes use
`PRAGMA user_version` and explicit migrations.

All user values use bound parameters. Writes use transactions. An update must
include the expected row revision. A stale write returns a conflict; the UI offers
Reload or Save as copy instead of silently overwriting another window's work.

The renderer caches list metadata so opening the terminal context menu performs
no database or process work. Prompt bodies are fetched lazily by ID. Catalog
broadcasts, library opening, and window focus can trigger asynchronous refreshes.

Storage failures must not delete, replace, truncate, or automatically migrate a
file unless a specifically tested migration transaction requires it. Tests use
an injected temporary database path and never open the real user library.

## Decision 6: Markdown and file import are untrusted

The editor uses CodeMirror with a side-by-side Markdown preview. Markdown is
rendered with raw HTML disabled and sanitized again with DOMPurify. Links are
restricted to approved schemes and external links use `noopener noreferrer`.
No imported or rendered content gains script, event-handler, local-file, preload,
or Node capability.

Imports support `.md`, `.markdown`, and `.txt`. File contents are decoded as
UTF-8 text, line endings are normalized, and binary or control-heavy inputs are
rejected. Importing over a dirty draft requires confirmation. The source path is
not retained in the library.

## Decision 7: AI improvement is proposal-only

Prompt analysis defaults to the application's configured AI provider, model,
and effort. The editor can override those choices for that analysis session
without changing global settings.

Both GitHub Copilot and Claude routes are configured without tools. The analysis
session disables or omits:

- built-in, MCP, and custom tools;
- skills and custom-instruction discovery;
- configuration and on-demand instruction discovery;
- file hooks and host Git operations;
- remote sessions; and
- session persistence.

The original prompt is delimited and treated as untrusted data. The provider is
required to return structured edit proposals containing exact ranges, original
text, replacement text, and a short rationale.

The bridge validates the response schema and rejects overlapping, out-of-range,
text-mismatched, malformed, or stale edits. A document hash binds results to the
analyzed snapshot. Model output is never executed and does not directly mutate
the saved prompt.

CodeMirror displays validated proposals as decorations. Users accept or reject
each edit. Only the actual editor document is previewed and saved; unapplied
proposal text is never persisted as the prompt body.

## Decision 8: terminal insertion does not press Enter

The terminal context menu contains a `Prompt library` submenu backed by cached
metadata. Each row shows the prompt name and creation or modification date.
Selecting a prompt lazily fetches its current body and pastes it into the invoking
terminal using xterm paste semantics without Enter.

Terminal controls are removed while Markdown newlines and ordinary tabs are
preserved for bracketed paste. Database content is not used directly as a stable
context-action identifier.

## Decision 9: prompt queues are typed snapshots

Existing command queue records remain strict single-line `command` items.
Prompt Library queue records are a separate `prompt` kind containing a snapshot
of the name and multiline content. Editing or deleting the library item later
does not change an already queued snapshot.

Manual dequeue pastes without Enter. Automatic submission is available only
when the target is positively identified as a ready Copilot or Claude terminal.
It is never permitted in a normal shell.

Automatic permission is runtime-only. Persisted queue data survives renderer
reload, but `runWhenReady` is normalized back to false on load. The user must
approve automatic submission again. A busy-to-ready and output-revision cycle is
required before the next automatic prompt can dispatch.

When a terminal exits, prompt queue items move to the existing unparented queue
with their name, date, and delivery mode preserved.

## Decision 10: limits must remain visible and configurable

The implementation will not introduce an undocumented prompt-count or body-size
product ceiling. Transport preflight must account for the existing WebSocket
frame limit and return a clear error before attempting an oversized operation.
If a new product limit is required for safety, it must be exposed in the UI and
persisted through the existing settings system.

## Supply-chain and release requirements

The build must:

1. verify the pinned SQLite3MultipleCiphers source checksum and attestation;
2. build x86, x64, and ARM64 outputs from the pinned source;
3. record compiler version and security-relevant compile flags;
4. verify expected exports and approved cipher availability;
5. package the correct helper and DLL for each architecture;
6. include the MIT license and third-party notice;
7. keep the native-module lock preflight before generated files or compilation;
8. avoid raw `npm rebuild` and broad process termination; and
9. fail closed on source, hash, architecture, or runtime self-test mismatch.

## Required security verification

Before release, tests must demonstrate:

- create, list, get, update, delete, migration, and revision-conflict behavior;
- concurrent writers and WAL busy handling;
- no prompt plaintext in the database, WAL, or temp directory;
- rejection of a wrong or tampered DPAPI key blob;
- failure on an altered authenticated database page;
- native launch and CRUD on x86, x64, and ARM64 packages;
- SQL payloads handled only as bound values;
- HTML, script, event-handler, and unsafe-link removal from Markdown preview;
- hostile and binary import rejection;
- tool-free AI provider configuration and timeout cleanup;
- malformed, overlapping, stale, and text-mismatched edit rejection;
- context-menu insertion without Enter;
- multiline prompt queue staging;
- automatic submission only to ready Copilot or Claude terminals;
- automatic permission cleared after reload;
- unparented prompt recovery; and
- Node and installed bridge protocol parity.

## Residual risks

| Risk | Treatment |
| --- | --- |
| Same-user process can call DPAPI or inspect host memory | Accepted within MultiTerm's existing same-user non-goal; minimize key exposure and document it |
| Prompt plaintext exists while displayed, edited, sent to AI, copied, or pasted | Required product behavior; avoid logging and bound lifetime where practical |
| Swap, hibernation, crash dumps, and screenshots may capture plaintext | Not fully preventable at application level; memory clearing is defense in depth, not a guarantee |
| Loss of DPAPI account material makes the library unrecoverable | Fail closed; add a future explicit portable export or backup design rather than weakening encryption |
| Native cryptographic dependency introduces supply-chain and build risk | Pin source and attestation, build reproducibly, package per architecture, and test runtime configuration |
| AI provider receives prompt content during analysis | User-initiated operation only; show provider and model and do not persist an analysis session |
| Incorrect readiness detection could submit at the wrong time | Restrict to known AI modes, require current-session approval and readiness transitions, never normal shells |
| Two bridges can drift in behavior | Shared host plus protocol parity tests |

## Deferred decisions

The first Prompt Library release will not include:

- cloud synchronization;
- cross-machine or cross-account raw database portability;
- plaintext or portable encrypted export and import;
- tags, folders, or prompt version history;
- automatic submission to normal shells; or
- durable automatic-submission approval across reloads.

A portable export format requires a separate key derivation, user authentication,
backup, and recovery decision. It must not reuse or expose the DPAPI-wrapped
local database key.
