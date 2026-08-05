using System;
using System.ComponentModel.Design;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using EnvDTE;
using EnvDTE80;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;

namespace MultiTerm.VisualStudio
{
    [PackageRegistration(UseManagedResourcesOnly = true, AllowsBackgroundLoading = true)]
    [InstalledProductRegistration("MultiTerm Workbench", "Open selected Visual Studio folders in MultiTerm Workbench.", "1.0")]
    [ProvideMenuResource("Menus.ctmenu", 1)]
    [Guid(PackageGuidString)]
    public sealed class MultiTermPackage : AsyncPackage
    {
        public const string PackageGuidString = "0ad40ef7-92bc-47cd-969e-8909d619150e";
        private const string CommandSetGuidString = "b88d5c48-729e-4cef-aad9-22c550662965";
        private static readonly int[] CommandIds = { 0x0100, 0x0101, 0x0102, 0x0103, 0x0104 };
        private DTE2 dte;

        protected override async Task InitializeAsync(CancellationToken cancellationToken, IProgress<ServiceProgressData> progress)
        {
            await JoinableTaskFactory.SwitchToMainThreadAsync(cancellationToken);
            dte = await GetServiceAsync(typeof(DTE)) as DTE2;
            var commandService = await GetServiceAsync(typeof(IMenuCommandService)) as OleMenuCommandService;
            if (commandService == null)
            {
                return;
            }

            var commandSet = new Guid(CommandSetGuidString);
            foreach (var commandId in CommandIds)
            {
                commandService.AddCommand(new OleMenuCommand(ExecuteOpenFolder, new CommandID(commandSet, commandId)));
            }
        }

        private void ExecuteOpenFolder(object sender, EventArgs eventArgs)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            try
            {
                var folder = ResolveSelectedFolder(dte);
                if (string.IsNullOrEmpty(folder))
                {
                    ShowMessage("Select a local solution, project, folder, or file first.", OLEMSGICON.OLEMSGICON_INFO);
                    return;
                }

                var launcher = FindLauncher();
                if (launcher == null)
                {
                    ShowMessage("MultiTerm Workbench is not installed in a standard location.", OLEMSGICON.OLEMSGICON_WARNING);
                    return;
                }

                var powershell = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.System),
                    @"WindowsPowerShell\v1.0\powershell.exe");
                System.Diagnostics.Process.Start(new ProcessStartInfo
                {
                    FileName = powershell,
                    Arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File " +
                        QuoteArgument(launcher) + " -OpenFolder " + QuoteArgument(folder),
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WorkingDirectory = folder
                });
            }
            catch (Exception error)
            {
                ShowMessage("Could not open MultiTerm: " + error.Message, OLEMSGICON.OLEMSGICON_CRITICAL);
            }
        }

        private static string ResolveSelectedFolder(DTE2 dte)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            if (dte == null)
            {
                return null;
            }

            if (dte.SelectedItems != null && dte.SelectedItems.Count > 0)
            {
                var selected = dte.SelectedItems.Item(1);
                var itemPath = ProjectItemPath(selected.ProjectItem);
                if (itemPath != null)
                {
                    return itemPath;
                }
                var projectPath = NormalizeFolder(selected.Project?.FullName);
                if (projectPath != null)
                {
                    return projectPath;
                }
            }

            var activeDocumentPath = NormalizeFolder(dte.ActiveDocument?.FullName);
            if (activeDocumentPath != null)
            {
                return activeDocumentPath;
            }
            return NormalizeFolder(dte.Solution?.FullName);
        }

        private static string ProjectItemPath(ProjectItem item)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            if (item == null)
            {
                return null;
            }
            try
            {
                var fullPath = Convert.ToString(item.Properties?.Item("FullPath")?.Value);
                var normalized = NormalizeFolder(fullPath);
                if (normalized != null)
                {
                    return normalized;
                }
            }
            catch (ArgumentException)
            {
            }
            try
            {
                if (item.FileCount > 0)
                {
                    return NormalizeFolder(item.FileNames[1]);
                }
            }
            catch (Exception)
            {
            }
            return NormalizeFolder(item.ContainingProject?.FullName);
        }

        private static string NormalizeFolder(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return null;
            }
            var fullPath = Path.GetFullPath(path);
            if (Directory.Exists(fullPath))
            {
                return fullPath;
            }
            if (File.Exists(fullPath))
            {
                return Path.GetDirectoryName(fullPath);
            }
            return null;
        }

        private static string FindLauncher()
        {
            var candidates = new[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "MultiTerm Workbench", "Start-MultiTerm.ps1"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "MultiTerm Workbench", "Start-MultiTerm.ps1"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "MultiTerm Workbench", "Start-MultiTerm.ps1")
            };
            foreach (var candidate in candidates)
            {
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }
            return null;
        }

        private static string QuoteArgument(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        private void ShowMessage(string message, OLEMSGICON icon)
        {
            VsShellUtilities.ShowMessageBox(
                this,
                message,
                "MultiTerm Workbench",
                icon,
                OLEMSGBUTTON.OLEMSGBUTTON_OK,
                OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
        }
    }
}