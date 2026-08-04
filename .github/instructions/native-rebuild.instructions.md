---
description: "Use when rebuilding MultiTerm native Node dependencies, running npm rebuild, building installers, or handling a locked conpty.node file. Covers process-safe rebuild preflight."
applyTo: ["package.json", "package-lock.json", "scripts/**", "installer/**"]
---
# Native Rebuild Safety

- Never run raw `npm rebuild` for MultiTerm's native terminal dependency. Run `npm run rebuild:native` so the lock preflight runs first.
- Before changing an installer build path, preserve the early call to `scripts/confirm-native-module-unlocked.ps1`; it must run before generated files, commits, version changes, or compilation.
- A running Electron terminal bridge can map this repository's `conpty.node`. Identify exact lock-holder and owning MultiTerm PIDs, display them, and require explicit user confirmation before stopping them.
- Never kill processes broadly by executable name. Stop only the PIDs returned by the repo-specific guard.
- In CI or another noninteractive environment, fail with the identified PIDs and require the caller to close them; never terminate them automatically.