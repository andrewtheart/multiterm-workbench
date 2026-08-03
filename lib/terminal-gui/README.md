# Terminal.Gui runtime

MultiTerm's installed PowerShell bridge uses Terminal.Gui 1.19.0 for its
interactive control console. These pinned managed assemblies keep the installer
independent of Node.js and of a separately installed .NET SDK or developer pack.

| File | Source package | Version | Purpose |
| --- | --- | --- | --- |
| `Terminal.Gui.dll` | `Terminal.Gui` | 1.19.0 | TUI framework (`net472`) |
| `NStack.dll` | `NStack.Core` | 1.1.1 | Terminal.Gui Unicode dependency (`netstandard2.0`) |
| `System.Management.dll` | `System.Management` | 9.0.4 | Terminal.Gui Windows dependency (`netstandard2.0`) |
| `netstandard.dll` | `Microsoft.NETFramework.ReferenceAssemblies.net472` | 1.0.3 | Compiler-only .NET Standard facade |

The facade is passed to Windows PowerShell 5.1's `Add-Type` compiler but is not
loaded as a runtime assembly.

## SHA-256

```text
Terminal.Gui.dll      F3C2458B696E3580AC6C456856CE0F61A2B88C3D672874EC476AED33D5F40EDE
NStack.dll            6741B4DDD62FD34A8E688C50E0EE20FADE1B467A841C42ECD2B42C4760CD8EDC
System.Management.dll 4F2B3DF75A7EA6F9BEAD23DF557E506A6BC7484C34B6FF9F0E52D48168764768
netstandard.dll        9F12554DDF1FA4EF8BEFABBB8616173A3BF020B7512ADA39F21E746DDD1D18FC
```

Package sources and full redistribution terms are recorded in
`THIRD-PARTY-NOTICES.txt` at the repository root.