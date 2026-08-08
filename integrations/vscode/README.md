# MultiTerm Workbench for VS Code

Open a file's containing folder, a selected folder, or the current workspace in
MultiTerm Workbench from VS Code's Explorer.

The extension calls MultiTerm's installed `Start-MultiTerm.ps1 -OpenFolder`
launcher. That launcher forwards the folder to an existing MultiTerm instance
when one is available and starts a new instance otherwise.

VS Code settings can optionally supply a terminal title, a command or prompt,
and a Copilot or Claude CLI type, model, effort, and Copilot context tier. When
an assistant is selected, MultiTerm starts that assistant in the new terminal,
waits for its composer, and then submits the configured command or prompt.

Other extensions and tasks can provide one-off values without changing settings:

```js
vscode.commands.executeCommand("multiterm.openTerminal", {
	path: "C:\\work\\repo",
	title: "Review changes",
	command: "Review the current diff",
	assistantType: "copilot",
	assistantModel: "gpt-5",
	assistantEffort: "high",
	assistantContext: "long_context"
});
```

MultiTerm's installer can install this extension. For a nonstandard MultiTerm
location, set `multiterm.launcherPath` to the full path of
`Start-MultiTerm.ps1`.

This extension runs on Windows because MultiTerm's installed launcher and bridge
are Windows applications.
