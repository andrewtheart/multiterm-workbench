# MultiTerm Workbench for VS Code

Open a file's containing folder, a selected folder, or the current workspace in
MultiTerm Workbench from VS Code's Explorer.

The extension calls MultiTerm's installed `Start-MultiTerm.ps1 -OpenFolder`
launcher. That launcher forwards the folder to an existing MultiTerm instance
when one is available and starts a new instance otherwise.

MultiTerm's installer can install this extension. For a nonstandard MultiTerm
location, set `multiterm.launcherPath` to the full path of
`Start-MultiTerm.ps1`.

This extension runs on Windows because MultiTerm's installed launcher and bridge
are Windows applications.
