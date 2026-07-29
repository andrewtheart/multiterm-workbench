<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
#>

param(
  [int]$Port = 0,
  [string]$HostName = "",
    [switch]$AllowRemote,
    [switch]$NoBrowser,
    [switch]$ShowConsole,
    [switch]$ConsoleDashboard,
    [switch]$Stop,
    [string]$ElevatedHost = ""
)

if ($Port -le 0) {
  if ($env:PORT) {
    $Port = [int]$env:PORT
  } else {
    $Port = 3177
  }
}

if (-not $HostName) {
  if ($env:HOST) {
    $HostName = $env:HOST
  } else {
    $HostName = "127.0.0.1"
  }
}

# The console window is hidden for installed launches, so Ctrl+C is no longer
# available to stop the bridge. The Start Menu "Stop" shortcut re-runs this
# script with -Stop, which asks a running bridge to shut down over loopback.
if ($Stop.IsPresent) {
  $stopUrl = "http://{0}:{1}/shutdown" -f $HostName, $Port
  try {
    Invoke-WebRequest -Uri $stopUrl -Method Post -UseBasicParsing -TimeoutSec 5 | Out-Null
    Write-Host "Stopped the MultiTerm bridge on ${HostName}:${Port}."
  } catch {
    Write-Host "No MultiTerm bridge is running on ${HostName}:${Port}."
  }
  return
}

if (-not ("MultiTerm.PowerShellBridge.ConsoleWindow" -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace MultiTerm.PowerShellBridge
{
    public static class ConsoleWindow
    {
        [DllImport("kernel32.dll")]
        private static extern IntPtr GetConsoleWindow();

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint GetConsoleProcessList(uint[] processList, uint processCount);

        private const int SW_HIDE = 0;
        private const int SW_SHOWNORMAL = 1;

        // True only when this process created the console it is attached to.
        // Launching from a shortcut allocates a fresh console owned by us alone;
        // launching from an existing shell attaches us to that shell's console,
        // which we must never hide or we would take the user's terminal with it.
        public static bool OwnsConsole()
        {
            if (GetConsoleWindow() == IntPtr.Zero)
            {
                return false;
            }

            uint[] buffer = new uint[4];
            return GetConsoleProcessList(buffer, (uint)buffer.Length) == 1;
        }

        public static void Hide()
        {
            IntPtr handle = GetConsoleWindow();
            if (handle != IntPtr.Zero)
            {
                ShowWindow(handle, SW_HIDE);
            }
        }

        public static void Show()
        {
            IntPtr handle = GetConsoleWindow();
            if (handle != IntPtr.Zero)
            {
                ShowWindow(handle, SW_SHOWNORMAL);
            }
        }
    }
}
'@
}

# Legacy shortcut launches hid their private console. New installer shortcuts pass
# -ConsoleDashboard, which keeps the console visible and turns it into the compact
# bridge dashboard. Existing terminal launches still retain the original behavior.
$consoleHidden = $false
if (-not $ShowConsole.IsPresent -and -not $ConsoleDashboard.IsPresent -and [MultiTerm.PowerShellBridge.ConsoleWindow]::OwnsConsole()) {
  [MultiTerm.PowerShellBridge.ConsoleWindow]::Hide()
  $consoleHidden = $true
}

$effectiveAllowRemote = $AllowRemote.IsPresent -or $env:ALLOW_REMOTE -eq "1"
$publicDir = Join-Path $PSScriptRoot "public"

if (-not (Test-Path -LiteralPath $publicDir -PathType Container)) {
  throw "Cannot find public assets at $publicDir"
}

if (-not ("MultiTerm.PowerShellBridge.BridgeServer" -as [type])) {
  Add-Type -TypeDefinition @'
using Microsoft.Win32.SafeHandles;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace MultiTerm.PowerShellBridge
{
    internal sealed class DashboardSessionInfo
    {
        public string Id;
        public string Title;
        public int Pid;
        public string StartedAt;
    }

    internal sealed class DashboardLogEntry
    {
        public string Level;
        public string Message;
        public DateTime Time;
    }

    internal sealed class BridgeConsoleDashboard
    {
        private const int MaximumLogEntries = 250;
        private readonly object sync = new object();
        private readonly Func<List<DashboardSessionInfo>> getSessions;
        private readonly Action<string> terminateSession;
        private readonly Action stopBridge;
        private readonly List<DashboardLogEntry> logs = new List<DashboardLogEntry>();
        private Thread worker;
        private volatile bool stopping;
        private string selectedId;
        private string lastFrame;
        private int lastWidth;
        private int lastHeight;

        public BridgeConsoleDashboard(
            Func<List<DashboardSessionInfo>> getSessions,
            Action<string> terminateSession,
            Action stopBridge)
        {
            this.getSessions = getSessions;
            this.terminateSession = terminateSession;
            this.stopBridge = stopBridge;
        }

        public bool Start()
        {
            if (Console.IsInputRedirected || Console.IsOutputRedirected)
            {
                return false;
            }

            try
            {
                Console.Title = "MultiTerm Control Console - closing this window stops all terminals";
                Console.CursorVisible = false;
                this.TryResize(122, 26);
            }
            catch
            {
                return false;
            }

            this.worker = new Thread(this.RunLoop);
            this.worker.IsBackground = true;
            this.worker.Name = "MultiTerm console dashboard";
            this.worker.Start();
            return true;
        }

        public void AddLog(string level, string message)
        {
            lock (this.sync)
            {
                this.logs.Add(new DashboardLogEntry
                {
                    Level = String.IsNullOrWhiteSpace(level) ? "info" : level,
                    Message = message ?? String.Empty,
                    Time = DateTime.Now
                });
                if (this.logs.Count > MaximumLogEntries)
                {
                    this.logs.RemoveRange(0, this.logs.Count - MaximumLogEntries);
                }
            }
        }

        public void Stop()
        {
            this.stopping = true;
            try { Console.CursorVisible = true; } catch { }
        }

        private void RunLoop()
        {
            while (!this.stopping)
            {
                try
                {
                    this.HandleKeys();
                    this.Render();
                }
                catch
                {
                    // A console can disappear while Windows is closing it. The bridge
                    // shutdown path will still tear down every pseudo-terminal.
                }
                Thread.Sleep(125);
            }
        }

        private void HandleKeys()
        {
            while (!this.stopping && Console.KeyAvailable)
            {
                ConsoleKeyInfo key = Console.ReadKey(true);
                if (key.Key == ConsoleKey.UpArrow)
                {
                    this.MoveSelection(-1);
                }
                else if (key.Key == ConsoleKey.DownArrow)
                {
                    this.MoveSelection(1);
                }
                else if (key.Key == ConsoleKey.Enter)
                {
                    string id = this.selectedId;
                    if (!String.IsNullOrEmpty(id))
                    {
                        this.terminateSession(id);
                    }
                }
                else if (key.Key == ConsoleKey.Q && (key.Modifiers & ConsoleModifiers.Control) != 0)
                {
                    this.stopBridge();
                    return;
                }
            }
        }

        private void MoveSelection(int direction)
        {
            List<DashboardSessionInfo> sessions = this.GetSortedSessions();
            if (sessions.Count == 0)
            {
                this.selectedId = null;
                return;
            }

            int selected = 0;
            for (int index = 0; index < sessions.Count; index++)
            {
                if (String.Equals(sessions[index].Id, this.selectedId, StringComparison.Ordinal))
                {
                    selected = index;
                    break;
                }
            }

            selected = (selected + direction + sessions.Count) % sessions.Count;
            this.selectedId = sessions[selected].Id;
        }

        private List<DashboardSessionInfo> GetSortedSessions()
        {
            List<DashboardSessionInfo> sessions = this.getSessions();
            sessions.Sort(delegate(DashboardSessionInfo left, DashboardSessionInfo right)
            {
                int started = String.Compare(left.StartedAt, right.StartedAt, StringComparison.Ordinal);
                return started != 0 ? started : String.Compare(left.Id, right.Id, StringComparison.Ordinal);
            });
            return sessions;
        }

        private void Render()
        {
            int reportedWidth = Console.WindowWidth;
            int reportedHeight = Console.WindowHeight;
            if (reportedWidth < 2 || reportedHeight < 2)
            {
                return;
            }
            int width = Math.Max(20, reportedWidth - 1);
            int height = Math.Max(10, reportedHeight - 1);
            if (width < 78 || height < 14)
            {
                Console.SetCursorPosition(0, 0);
                Console.Write(this.Fit("MultiTerm dashboard needs at least 79 columns x 15 rows. Resize this window. Closing it stops all terminals.", width));
                return;
            }

            if (width != this.lastWidth || height != this.lastHeight)
            {
                try { Console.Clear(); } catch { }
                this.lastWidth = width;
                this.lastHeight = height;
            }

            List<DashboardSessionInfo> sessions = this.GetSortedSessions();
            this.EnsureSelection(sessions);
            List<DashboardLogEntry> logSnapshot;
            lock (this.sync)
            {
                logSnapshot = new List<DashboardLogEntry>(this.logs);
            }

            string frame = this.BuildFrame(width, height, sessions, logSnapshot);
            if (String.Equals(frame, this.lastFrame, StringComparison.Ordinal))
            {
                return;
            }
            Console.SetCursorPosition(0, 0);
            Console.Write(frame);
            this.lastFrame = frame;
        }

        private void EnsureSelection(List<DashboardSessionInfo> sessions)
        {
            if (sessions.Count == 0)
            {
                this.selectedId = null;
                return;
            }

            foreach (DashboardSessionInfo session in sessions)
            {
                if (String.Equals(session.Id, this.selectedId, StringComparison.Ordinal))
                {
                    return;
                }
            }
            this.selectedId = sessions[0].Id;
        }

        private string BuildFrame(
            int width,
            int height,
            List<DashboardSessionInfo> sessions,
            List<DashboardLogEntry> logEntries)
        {
            int contentWidth = width - 4;
            int noticeWidth = Math.Min(27, Math.Max(19, contentWidth / 4));
            int sessionWidth = Math.Min(39, Math.Max(25, contentWidth / 3));
            int logWidth = contentWidth - noticeWidth - sessionWidth;
            int bodyRows = height - 6;
            string border = "+" + new String('-', noticeWidth) + "+" + new String('-', logWidth) + "+" + new String('-', sessionWidth) + "+";
            List<string> lines = new List<string>();
            lines.Add(border);
            lines.Add(this.Row("NOTICE", "Logs (streaming)", "Terminals (select to terminate)", noticeWidth, logWidth, sessionWidth));
            lines.Add(border);

            string[] notice = new string[]
            {
                "Closing this console",
                "will terminate ALL",
                "active MultiTerm",
                "terminal sessions.",
                "",
                "Up/Down: select",
                "Enter: terminate",
                "Ctrl+Q: stop all"
            };

            int firstLog = Math.Max(0, logEntries.Count - bodyRows);
            for (int row = 0; row < bodyRows; row++)
            {
                string noticeLine = row < notice.Length ? notice[row] : String.Empty;
                string logLine = String.Empty;
                int logIndex = firstLog + row;
                if (logIndex < logEntries.Count)
                {
                    DashboardLogEntry entry = logEntries[logIndex];
                    logLine = "[" + entry.Time.ToString("HH:mm:ss") + "] [" + entry.Level.ToUpperInvariant() + "] " + entry.Message;
                }

                string sessionLine = String.Empty;
                if (row < sessions.Count)
                {
                    DashboardSessionInfo session = sessions[row];
                    string marker = String.Equals(session.Id, this.selectedId, StringComparison.Ordinal) ? "> " : "  ";
                    string pid = session.Pid > 0 ? "pid " + session.Pid : "starting";
                    sessionLine = marker + (row + 1) + ". " + session.Title + " (" + pid + ")";
                }
                else if (row == 0 && sessions.Count == 0)
                {
                    sessionLine = "  No active terminals";
                }

                lines.Add(this.Row(noticeLine, logLine, sessionLine, noticeWidth, logWidth, sessionWidth));
            }

            lines.Add(border);
            string status = " " + sessions.Count + " active | Arrow keys select a terminal; Enter requests a graceful termination; Ctrl+Q stops MultiTerm";
            lines.Add("|" + this.Fit(status, width - 2) + "|");
            lines.Add(new String('-', width));
            return String.Join(Environment.NewLine, lines.ToArray());
        }

        private string Row(string left, string middle, string right, int leftWidth, int middleWidth, int rightWidth)
        {
            return "|" + this.Fit(left, leftWidth) + "|" + this.Fit(middle, middleWidth) + "|" + this.Fit(right, rightWidth) + "|";
        }

        private string Fit(string value, int width)
        {
            value = value ?? String.Empty;
            if (value.Length > width)
            {
                return width <= 3 ? value.Substring(0, width) : value.Substring(0, width - 3) + "...";
            }
            return value.PadRight(width);
        }

        private void TryResize(int requestedWidth, int requestedHeight)
        {
            try
            {
                int width = Math.Min(requestedWidth, Console.LargestWindowWidth);
                int height = Math.Min(requestedHeight, Console.LargestWindowHeight);
                Console.SetBufferSize(Math.Max(Console.BufferWidth, width), Math.Max(Console.BufferHeight, height));
                Console.SetWindowSize(width, height);
                Console.SetBufferSize(width, height);
            }
            catch
            {
                // Windows Terminal and redirected hosts may own sizing. Rendering adapts
                // to the dimensions they provide instead of failing bridge startup.
            }
        }
    }

    public sealed class BridgeServer
    {
        private readonly string host;
        private readonly int port;
        private readonly bool allowRemote;
        private readonly bool consoleDashboardEnabled;
        private readonly bool openBrowser;
        private readonly string publicDir;
        // Stable AppUserModelID so the browser "--app" window is grouped and
        // pinned as MultiTerm (with the MultiTerm icon) instead of the host
        // browser (e.g. Microsoft Edge). Must match the installer shortcut.
        private const string AppUserModelId = "MultiTerm.Workbench";
        private readonly ConcurrentDictionary<string, BridgeClient> clients = new ConcurrentDictionary<string, BridgeClient>();
        private readonly ConcurrentDictionary<string, TerminalSession> sessions = new ConcurrentDictionary<string, TerminalSession>();
        private readonly Dictionary<string, string> mimeTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { ".html", "text/html; charset=utf-8" },
            { ".css", "text/css; charset=utf-8" },
            { ".js", "text/javascript; charset=utf-8" },
            { ".json", "application/json; charset=utf-8" },
            { ".svg", "image/svg+xml" },
            { ".ico", "image/x-icon" },
            { ".png", "image/png" },
            { ".webmanifest", "application/manifest+json" }
        };

        private HttpListener listener;
        private BridgeConsoleDashboard consoleDashboard;
        private volatile bool stopping;

        // Absolute path of this script, set from PowerShell at startup. Administrator
        // terminals re-launch it elevated (-ElevatedHost) to own the high-integrity
        // pseudo-console, so we need to know where we came from.
        public static string ScriptPath;

        public BridgeServer(string host, int port, bool allowRemote, string publicDir, bool openBrowser, bool consoleDashboardEnabled)
        {
            this.host = host;
            this.port = port;
            this.allowRemote = allowRemote;
            this.publicDir = Path.GetFullPath(publicDir);
            this.openBrowser = openBrowser;
            this.consoleDashboardEnabled = consoleDashboardEnabled;
        }

        public string Url
        {
            get { return "http://" + this.host + ":" + this.port + "/"; }
        }

        public void Run()
        {
            this.listener = new HttpListener();
            this.listener.Prefixes.Add(this.Url);
            try
            {
                this.listener.Start();
            }
            catch (HttpListenerException)
            {
                // Another MultiTerm bridge already owns this address (for example,
                // a window that is still open). Rather than crashing with a raw
                // "conflicts with an existing registration" error, just reopen the
                // app window pointing at the running instance and exit quietly.
                Console.WriteLine("MultiTerm is already running on " + this.Url + ". Opening the existing instance.");
                if (this.openBrowser)
                {
                    // Branding runs on a background thread, and this path exits the
                    // process moments later, which would kill that thread before it
                    // ever found the window - leaving the taskbar showing the host
                    // browser's icon. Wait for it to finish before returning.
                    Thread brander = this.OpenBrowser();
                    if (brander != null)
                    {
                        try { brander.Join(TimeSpan.FromSeconds(40)); }
                        catch { }
                    }
                }
                return;
            }

            Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs eventArgs)
            {
                eventArgs.Cancel = true;
                this.Stop(true);
            };

            if (this.consoleDashboardEnabled)
            {
                BridgeConsoleDashboard dashboard = new BridgeConsoleDashboard(
                    this.DashboardSessions,
                    delegate(string id)
                    {
                        this.Log("warn", "Control console requested termination for session " + id);
                        this.KillSession(id);
                    },
                    delegate { this.Stop(true); });
                if (dashboard.Start())
                {
                    this.consoleDashboard = dashboard;
                }
            }

            this.Log("info", "MultiTerm PowerShell bridge running on " + this.Url);
            this.Log("info", "PowerShell sessions are available only to this local machine by default.");
            this.Log("info", this.consoleDashboard == null ? "Press Ctrl+C to stop the bridge." : "Control console ready. Use Up/Down and Enter to terminate a selected session.");

            if (this.openBrowser)
            {
                this.OpenBrowser();
            }

            while (!this.stopping && this.listener.IsListening)
            {
                try
                {
                    HttpListenerContext context = this.listener.GetContext();
                    Task.Run(delegate { this.HandleContext(context); });
                }
                catch (HttpListenerException)
                {
                    if (!this.stopping)
                    {
                        throw;
                    }
                }
                catch (ObjectDisposedException)
                {
                    if (!this.stopping)
                    {
                        throw;
                    }
                }
            }
        }

        public void Stop(bool graceful)
        {
            if (this.stopping)
            {
                return;
            }

            this.stopping = true;
            if (this.consoleDashboard != null)
            {
                this.consoleDashboard.Stop();
            }
            foreach (TerminalSession session in this.sessions.Values)
            {
                if (graceful)
                {
                    session.RequestExit();
                }
                else
                {
                    session.Kill();
                }
            }

            foreach (BridgeClient client in this.clients.Values)
            {
                client.Close();
            }

            if (this.listener != null)
            {
                try { this.listener.Stop(); } catch { }
                try { this.listener.Close(); } catch { }
            }
        }

        private void HandleContext(HttpListenerContext context)
        {
            try
            {
                string path = context.Request.Url == null ? "/" : context.Request.Url.AbsolutePath;

                if (context.Request.IsWebSocketRequest && path == "/ws")
                {
                    this.HandleWebSocket(context);
                    return;
                }

                // Installed launches hide the console, so Ctrl+C is not available.
                // This is how the Stop shortcut asks for a clean shutdown. Loopback
                // only, and POST only, so no page can navigate the app into quitting.
                if (path == "/shutdown")
                {
                    if (context.Request.HttpMethod != "POST")
                    {
                        // Allow must be set before SendText, which closes the response.
                        context.Response.Headers["Allow"] = "POST";
                        this.SendText(context.Response, 405, "Method not allowed", "text/plain; charset=utf-8");
                        return;
                    }

                    if (!context.Request.IsLocal)
                    {
                        this.SendText(context.Response, 403, "Forbidden", "text/plain; charset=utf-8");
                        return;
                    }

                    this.SendText(context.Response, 200, "{\"ok\":true,\"stopping\":true}", "application/json; charset=utf-8");
                    // Stop off-thread so this response is flushed before the listener dies.
                    Task.Run(delegate
                    {
                        Thread.Sleep(150);
                        this.Stop(true);
                    });
                    return;
                }

                if (context.Request.HttpMethod != "GET" && context.Request.HttpMethod != "HEAD")
                {
                    context.Response.Headers["Allow"] = "GET, HEAD";
                    this.SendText(context.Response, 405, "Method not allowed", "text/plain; charset=utf-8");
                    return;
                }

                if (path == "/health")
                {
                    string body = "{\"ok\":true,\"sessions\":" + this.sessions.Count + ",\"cwd\":" + Json.Quote(Directory.GetCurrentDirectory()) + "}";
                    this.SendText(context.Response, 200, body, "application/json; charset=utf-8");
                    return;
                }

                this.ServeStaticFile(context, path);
            }
            catch
            {
                try
                {
                    if (context.Response.OutputStream.CanWrite)
                    {
                        this.SendText(context.Response, 500, "Server error", "text/plain; charset=utf-8");
                    }
                }
                catch { }
            }
        }

        // Returns the background thread that re-brands the browser window, or null
        // if none was started. Callers that exit the process straight afterwards
        // must join it, or the branding never lands.
        private Thread OpenBrowser()
        {
            try
            {
                string browser = this.FindAppModeBrowser();
                if (browser != null)
                {
                    string dataDir = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "MultiTerm", "AppShell");
                    try { Directory.CreateDirectory(dataDir); }
                    catch { }

                    // Launch a chromeless, standalone "app" window (no tabs or
                    // address bar) using an isolated profile so it behaves like
                    // a dedicated desktop app rather than a browser tab.
                    //
                    // --max-active-webgl-contexts raises Chromium's default cap of
                    // ~16 live WebGL contexts. Past that cap Chromium force-loses
                    // the oldest context, and xterm's WebGL addon leaves the pane
                    // with no renderer at all when that happens, so the pane turns
                    // blank. app.js also caps how many renderers it hands out; this
                    // is extra headroom so terminals never compete for contexts.
                    string args = "--app=" + this.Url
                        + " --user-data-dir=\"" + dataDir + "\""
                        + " --window-size=1200,800"
                        + " --max-active-webgl-contexts=64"
                        + " --no-first-run --no-default-browser-check";

                    ProcessStartInfo appInfo = new ProcessStartInfo(browser, args);
                    appInfo.UseShellExecute = false;

                    // Record which MultiTerm windows already exist so the brander
                    // can tell ours apart from theirs. Edge hands an "--app" launch
                    // to an existing browser process whenever one already uses this
                    // profile, and the process we start then exits immediately - so
                    // there is no process tree to match on. Taking the difference of
                    // the window set before and after is the only reliable way to
                    // identify the window this launch actually created.
                    HashSet<IntPtr> preexisting = WindowBrander.SnapshotAppWindows("MultiTerm Workbench");
                    Process started = Process.Start(appInfo);

                    // Windows groups a Chromium "--app" window under the host
                    // browser's identity, so the taskbar shows (for example) the
                    // Microsoft Edge icon rather than the site favicon. Re-brand
                    // the window with MultiTerm's own AppUserModelID + icon so the
                    // taskbar shows MultiTerm and it can be pinned as its own app.
                    return this.BrandAppWindow(started, preexisting);
                }

                // No Chromium-based browser found - open the default browser.
                ProcessStartInfo startInfo = new ProcessStartInfo(this.Url);
                startInfo.UseShellExecute = true;
                Process.Start(startInfo);
            }
            catch (Exception error)
            {
                this.Log("error", "Could not open the app window automatically: " + error.Message);
                try
                {
                    ProcessStartInfo fallback = new ProcessStartInfo(this.Url);
                    fallback.UseShellExecute = true;
                    Process.Start(fallback);
                }
                catch { }
            }

            return null;
        }

        private string FindAppModeBrowser()
        {
            string[] candidates = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft\\Edge\\Application\\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft\\Edge\\Application\\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google\\Chrome\\Application\\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google\\Chrome\\Application\\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google\\Chrome\\Application\\chrome.exe")
            };

            foreach (string candidate in candidates)
            {
                try
                {
                    if (!String.IsNullOrEmpty(candidate) && File.Exists(candidate))
                    {
                        return candidate;
                    }
                }
                catch { }
            }

            // Fall back to the browser registered under App Paths (Edge first).
            string fromRegistry = this.RegistryAppPath("msedge.exe");
            if (fromRegistry != null)
            {
                return fromRegistry;
            }

            return this.RegistryAppPath("chrome.exe");
        }

        private string RegistryAppPath(string exeName)
        {
            string subKey = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\" + exeName;
            string[] roots = new string[] { "HKEY_CURRENT_USER\\", "HKEY_LOCAL_MACHINE\\" };
            foreach (string root in roots)
            {
                try
                {
                    object value = Microsoft.Win32.Registry.GetValue(root + subKey, "", null);
                    string path = value as string;
                    if (!String.IsNullOrEmpty(path) && File.Exists(path))
                    {
                        return path;
                    }
                }
                catch { }
            }

            return null;
        }

        private string ResolveAppIconPath()
        {
            try
            {
                string[] candidates = new string[]
                {
                    // Installed layout: {app}\MultiTerm.ico (public\ lives beside it).
                    Path.GetFullPath(Path.Combine(this.publicDir, "..", "MultiTerm.ico")),
                    // Bundled favicon (identical icon) - present in every layout.
                    Path.Combine(this.publicDir, "favicon.ico"),
                    // Dev/source layout: installer\MultiTerm.ico.
                    Path.GetFullPath(Path.Combine(this.publicDir, "..", "installer", "MultiTerm.ico"))
                };

                foreach (string candidate in candidates)
                {
                    try
                    {
                        if (!String.IsNullOrEmpty(candidate) && File.Exists(candidate))
                        {
                            return candidate;
                        }
                    }
                    catch { }
                }
            }
            catch { }

            return null;
        }

        private Thread BrandAppWindow(Process started, HashSet<IntPtr> preexisting)
        {
            try
            {
                if (started == null)
                {
                    return null;
                }

                string iconPath = this.ResolveAppIconPath();
                string aumid = AppUserModelId;
                string relaunchCommand = this.ResolveRelaunchCommand();

                // Branding must wait for the browser window to appear, so run it
                // off the startup path on a background thread. Failures are
                // non-fatal - the app still works, just with the browser's icon.
                Thread worker = new Thread(new ThreadStart(delegate()
                {
                    try { WindowBrander.Apply(started, "MultiTerm Workbench", aumid, iconPath, relaunchCommand, preexisting); }
                    catch { }
                }));
                worker.IsBackground = true;
                worker.Start();
                return worker;
            }
            catch { }

            return null;
        }

        // Command the taskbar uses when the pinned button is launched, so a pin
        // starts MultiTerm through its own script rather than the host browser.
        private string ResolveRelaunchCommand()
        {
            try
            {
                string scriptPath = Path.GetFullPath(Path.Combine(this.publicDir, "..", "Start-MultiTerm.ps1"));
                if (!File.Exists(scriptPath))
                {
                    return null;
                }

                string powershell = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.System),
                    "WindowsPowerShell\\v1.0\\powershell.exe");
                if (!File.Exists(powershell))
                {
                    return null;
                }

                return "\"" + powershell + "\" -NoProfile -ExecutionPolicy Bypass -File \"" + scriptPath + "\"";
            }
            catch
            {
                return null;
            }
        }

        // Gives a Chromium "--app" window its own taskbar identity by stamping
        // the top-level window with MultiTerm's AppUserModelID + icon. Combined
        // with the matching installer shortcut, Windows then shows the MultiTerm
        // icon on the taskbar and allows pinning it as a standalone app.
        private static class WindowBrander
        {
            private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

            private const uint WM_SETICON = 0x0080;
            private const int ICON_SMALL = 0;
            private const int ICON_BIG = 1;
            private const uint IMAGE_ICON = 1;
            private const uint LR_LOADFROMFILE = 0x00000010;
            private const uint LR_DEFAULTSIZE = 0x00000040;
            private const uint GW_OWNER = 4;
            private const uint TH32CS_SNAPPROCESS = 0x00000002;
            private const ushort VT_LPWSTR = 31;

            // PKEY_AppUserModel_* live under this format id. pid 2 = RelaunchCommand,
            // pid 3 = RelaunchIconResource, pid 4 = RelaunchDisplayNameResource,
            // pid 5 = ID.
            private static readonly Guid APPMODEL_FMTID = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
            private static readonly Guid IID_IPropertyStore = new Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99");

            // Every visible Chromium app window whose title matches, regardless of
            // which process owns it. Called once before the browser is launched so
            // Apply can identify the window that launch creates.
            public static HashSet<IntPtr> SnapshotAppWindows(string titleFragment)
            {
                HashSet<IntPtr> found = new HashSet<IntPtr>();
                try
                {
                    foreach (IntPtr hwnd in FindAppWindows(null, titleFragment))
                    {
                        found.Add(hwnd);
                    }
                }
                catch { }
                return found;
            }

            public static void Apply(Process started, string titleFragment, string aumid, string iconPath, string relaunchCommand, HashSet<IntPtr> preexisting)
            {
                try
                {
                    IntPtr hIconBig = IntPtr.Zero;
                    IntPtr hIconSmall = IntPtr.Zero;
                    if (!String.IsNullOrEmpty(iconPath) && File.Exists(iconPath))
                    {
                        try { hIconBig = LoadImage(IntPtr.Zero, iconPath, IMAGE_ICON, 0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE); }
                        catch { }
                        try { hIconSmall = LoadImage(IntPtr.Zero, iconPath, IMAGE_ICON, 16, 16, LR_LOADFROMFILE); }
                        catch { }
                    }

                    if (preexisting == null)
                    {
                        preexisting = new HashSet<IntPtr>();
                    }

                    // Brand the window this launch created - that is, any matching
                    // window that was not already on screen beforehand.
                    //
                    // Matching on title alone and taking the first hit was wrong
                    // three times over: with a second MultiTerm window open it could
                    // brand somebody else's window; when Edge hands the "--app"
                    // launch to an existing browser process (it prints "Opening in
                    // existing browser session") the process we started exits at
                    // once, so there is no process tree left to disambiguate by; and
                    // stopping once every *current* window was branded returned
                    // before the new window had even been created, leaving the one
                    // window that mattered still wearing the browser's icon.
                    //
                    // ~20s: the browser has to start and the page title has to load
                    // before a new window can be matched.
                    for (int i = 0; i < 40; i++)
                    {
                        foreach (IntPtr candidate in FindAppWindows(started, titleFragment))
                        {
                            if (preexisting.Contains(candidate))
                            {
                                continue; // somebody else's window - leave it alone
                            }

                            if (ReadAppUserModelId(candidate) == aumid)
                            {
                                return; // already branded, by us, just now
                            }

                            try { ApplyOnce(candidate, aumid, iconPath, relaunchCommand, hIconBig, hIconSmall); }
                            catch { }

                            if (ReadAppUserModelId(candidate) == aumid)
                            {
                                return;
                            }
                        }

                        Thread.Sleep(500);
                    }
                }
                catch { }
            }

            private static void ApplyOnce(IntPtr hwnd, string aumid, string iconPath, string relaunchCommand, IntPtr hIconBig, IntPtr hIconSmall)
            {
                if (hIconBig != IntPtr.Zero)
                {
                    SendMessage(hwnd, WM_SETICON, new IntPtr(ICON_BIG), hIconBig);
                }
                if (hIconSmall != IntPtr.Zero)
                {
                    SendMessage(hwnd, WM_SETICON, new IntPtr(ICON_SMALL), hIconSmall);
                }

                IPropertyStore store = null;
                Guid iid = IID_IPropertyStore;
                int hr = SHGetPropertyStoreForWindow(hwnd, ref iid, out store);
                if (hr < 0 || store == null)
                {
                    return;
                }

                try
                {
                    // Order matters: setting System.AppUserModel.ID is what notifies
                    // the taskbar to refresh the window's identity, so the icon and
                    // relaunch properties must already be in place when it lands.
                    // Writing the ID first (as before) refreshed the taskbar while the
                    // window still carried the host browser's icon, which is why the
                    // button kept showing Edge.
                    if (!String.IsNullOrEmpty(iconPath))
                    {
                        SetStringProperty(store, new PROPERTYKEY(APPMODEL_FMTID, 3u), iconPath + ",0");
                    }
                    if (!String.IsNullOrEmpty(relaunchCommand))
                    {
                        SetStringProperty(store, new PROPERTYKEY(APPMODEL_FMTID, 2u), relaunchCommand);
                    }
                    SetStringProperty(store, new PROPERTYKEY(APPMODEL_FMTID, 4u), "MultiTerm Workbench");
                    SetStringProperty(store, new PROPERTYKEY(APPMODEL_FMTID, 5u), aumid);
                    store.Commit();
                }
                finally
                {
                    try { Marshal.ReleaseComObject(store); }
                    catch { }
                }
            }

            // Reads System.AppUserModel.ID back off the window so Apply can tell
            // whether its write actually took, instead of blindly re-applying on a
            // fixed schedule and hoping.
            private static string ReadAppUserModelId(IntPtr hwnd)
            {
                IPropertyStore store = null;
                Guid iid = IID_IPropertyStore;
                try
                {
                    int hr = SHGetPropertyStoreForWindow(hwnd, ref iid, out store);
                    if (hr < 0 || store == null)
                    {
                        return null;
                    }

                    PROPERTYKEY key = new PROPERTYKEY(APPMODEL_FMTID, 5u);
                    PROPVARIANT pv;
                    if (store.GetValue(ref key, out pv) < 0)
                    {
                        return null;
                    }

                    try
                    {
                        if (pv.varType != VT_LPWSTR || pv.value1 == IntPtr.Zero)
                        {
                            return null;
                        }
                        return Marshal.PtrToStringUni(pv.value1);
                    }
                    finally { try { PropVariantClear(ref pv); } catch { } }
                }
                catch { return null; }
                finally
                {
                    if (store != null)
                    {
                        try { Marshal.ReleaseComObject(store); }
                        catch { }
                    }
                }
            }

            private static void SetStringProperty(IPropertyStore store, PROPERTYKEY key, string value)
            {
                // NOTE: InitPropVariantFromString is an inline helper in the
                // Windows SDK headers, not a real propsys.dll export, so it must
                // not be P/Invoked. Build the VT_LPWSTR PROPVARIANT by hand;
                // PropVariantClear frees the allocated string.
                PROPVARIANT pv = new PROPVARIANT();
                pv.varType = VT_LPWSTR;
                pv.value1 = Marshal.StringToCoTaskMemUni(value);
                if (pv.value1 == IntPtr.Zero)
                {
                    return;
                }

                try { store.SetValue(ref key, ref pv); }
                finally { try { PropVariantClear(ref pv); } catch { } }
            }

            private static List<IntPtr> FindAppWindows(Process started, string titleFragment)
            {
                HashSet<int> pids = null;
                try
                {
                    if (started != null && !started.HasExited)
                    {
                        pids = GetProcessTree(started.Id);
                    }
                }
                catch { pids = null; }

                WindowFinder finder = new WindowFinder(pids, titleFragment);
                EnumWindowsProc callback = new EnumWindowsProc(finder.OnWindow);
                try { EnumWindows(callback, IntPtr.Zero); }
                catch { }
                GC.KeepAlive(callback);
                return finder.Resolve();
            }

            private sealed class WindowFinder
            {
                private readonly HashSet<int> pids;
                private readonly string titleFragment;
                private readonly List<IntPtr> pidAndTitle = new List<IntPtr>();
                private readonly List<IntPtr> titleOnly = new List<IntPtr>();

                public WindowFinder(HashSet<int> pids, string titleFragment)
                {
                    this.pids = pids;
                    this.titleFragment = titleFragment;
                }

                public bool OnWindow(IntPtr hwnd, IntPtr lParam)
                {
                    try
                    {
                        if (!IsWindowVisible(hwnd))
                        {
                            return true;
                        }
                        if (GetWindow(hwnd, GW_OWNER) != IntPtr.Zero)
                        {
                            return true; // top-level windows only
                        }

                        StringBuilder cls = new StringBuilder(256);
                        GetClassName(hwnd, cls, cls.Capacity);
                        if (cls.ToString().IndexOf("Chrome_WidgetWin", StringComparison.OrdinalIgnoreCase) < 0)
                        {
                            return true;
                        }

                        StringBuilder title = new StringBuilder(512);
                        GetWindowText(hwnd, title, title.Capacity);
                        string text = title.ToString();
                        if (String.IsNullOrEmpty(text) || text.IndexOf(this.titleFragment, StringComparison.OrdinalIgnoreCase) < 0)
                        {
                            return true;
                        }

                        this.titleOnly.Add(hwnd);
                        if (this.pids != null)
                        {
                            uint pid;
                            GetWindowThreadProcessId(hwnd, out pid);
                            if (this.pids.Contains((int)pid))
                            {
                                this.pidAndTitle.Add(hwnd);
                            }
                        }
                    }
                    catch { }

                    return true;
                }

                public List<IntPtr> Resolve()
                {
                    // Prefer windows in our own browser process tree when we still
                    // have one. Edge often hands a "--app" launch to an existing
                    // browser process, in which case the process we started has
                    // already exited and title matching is all that is left; every
                    // Chromium app window carrying our title is a MultiTerm window,
                    // so returning them all is safe.
                    if (this.pidAndTitle.Count > 0)
                    {
                        return this.pidAndTitle;
                    }
                    return this.titleOnly;
                }
            }

            private static HashSet<int> GetProcessTree(int rootPid)
            {
                HashSet<int> result = new HashSet<int>();
                result.Add(rootPid);

                Dictionary<int, List<int>> children = new Dictionary<int, List<int>>();
                IntPtr snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
                if (snapshot == IntPtr.Zero || snapshot == new IntPtr(-1))
                {
                    return result;
                }

                try
                {
                    PROCESSENTRY32 entry = new PROCESSENTRY32();
                    entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
                    if (Process32First(snapshot, ref entry))
                    {
                        do
                        {
                            int pid = (int)entry.th32ProcessID;
                            int parent = (int)entry.th32ParentProcessID;
                            List<int> list;
                            if (!children.TryGetValue(parent, out list))
                            {
                                list = new List<int>();
                                children[parent] = list;
                            }
                            list.Add(pid);
                        }
                        while (Process32Next(snapshot, ref entry));
                    }
                }
                finally
                {
                    CloseHandle(snapshot);
                }

                Queue<int> queue = new Queue<int>();
                queue.Enqueue(rootPid);
                while (queue.Count > 0)
                {
                    int current = queue.Dequeue();
                    List<int> kids;
                    if (children.TryGetValue(current, out kids))
                    {
                        foreach (int kid in kids)
                        {
                            if (result.Add(kid))
                            {
                                queue.Enqueue(kid);
                            }
                        }
                    }
                }

                return result;
            }

            [StructLayout(LayoutKind.Sequential, Pack = 4)]
            private struct PROPERTYKEY
            {
                public Guid fmtid;
                public uint pid;
                public PROPERTYKEY(Guid fmtid, uint pid)
                {
                    this.fmtid = fmtid;
                    this.pid = pid;
                }
            }

            [StructLayout(LayoutKind.Sequential)]
            private struct PROPVARIANT
            {
                public ushort varType;
                public ushort reserved1;
                public ushort reserved2;
                public ushort reserved3;
                public IntPtr value1;
                public IntPtr value2;
            }

            [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
            private struct PROCESSENTRY32
            {
                public uint dwSize;
                public uint cntUsage;
                public uint th32ProcessID;
                public IntPtr th32DefaultHeapID;
                public uint th32ModuleID;
                public uint cntThreads;
                public uint th32ParentProcessID;
                public int pcPriClassBase;
                public uint dwFlags;
                [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
                public string szExeFile;
            }

            [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99")]
            private interface IPropertyStore
            {
                [PreserveSig] int GetCount(out uint cProps);
                [PreserveSig] int GetAt(uint iProp, out PROPERTYKEY pkey);
                [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
                [PreserveSig] int SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
                [PreserveSig] int Commit();
            }

            [DllImport("user32.dll")]
            private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

            [DllImport("user32.dll")]
            private static extern bool IsWindowVisible(IntPtr hWnd);

            [DllImport("user32.dll", SetLastError = true)]
            private static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

            [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
            private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

            [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
            private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

            [DllImport("user32.dll", SetLastError = true)]
            private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

            [DllImport("user32.dll", CharSet = CharSet.Auto)]
            private static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

            [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
            private static extern IntPtr LoadImage(IntPtr hinst, string lpszName, uint uType, int cxDesired, int cyDesired, uint fuLoad);

            [DllImport("shell32.dll", SetLastError = true)]
            private static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid iid, out IPropertyStore propertyStore);

            [DllImport("ole32.dll", PreserveSig = true)]
            private static extern int PropVariantClear(ref PROPVARIANT pvar);

            [DllImport("kernel32.dll", SetLastError = true)]
            private static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);

            [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
            private static extern bool Process32First(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

            [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
            private static extern bool Process32Next(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

            [DllImport("kernel32.dll", SetLastError = true)]
            private static extern bool CloseHandle(IntPtr hObject);
        }

        private void HandleWebSocket(HttpListenerContext context)
        {
            IPAddress remoteAddress = context.Request.RemoteEndPoint == null ? null : context.Request.RemoteEndPoint.Address;
            if (!this.allowRemote && !this.IsLocalAddress(remoteAddress))
            {
                context.Response.StatusCode = 403;
                context.Response.Close();
                return;
            }

            HttpListenerWebSocketContext webSocketContext;
            try
            {
                webSocketContext = context.AcceptWebSocketAsync(null).GetAwaiter().GetResult();
            }
            catch
            {
                context.Response.StatusCode = 500;
                context.Response.Close();
                return;
            }

            BridgeClient client = new BridgeClient(Guid.NewGuid().ToString("N"), webSocketContext.WebSocket);
            this.clients[client.Id] = client;
            client.Send(this.WelcomeJson());
            this.Log("info", "Client connected: " + client.Id + " (" + (remoteAddress == null ? "local" : remoteAddress.ToString()) + "); " + this.clients.Count + " active");

            try
            {
                this.ReceiveLoop(client).GetAwaiter().GetResult();
            }
            finally
            {
                BridgeClient removed;
                this.clients.TryRemove(client.Id, out removed);
                client.Close();
                this.Log("info", "Client disconnected: " + client.Id + "; " + this.clients.Count + " active");
            }
        }

        private async Task ReceiveLoop(BridgeClient client)
        {
            byte[] buffer = new byte[8192];
            MemoryStream messageBuffer = new MemoryStream();

            while (!this.stopping && client.Socket.State == WebSocketState.Open)
            {
                WebSocketReceiveResult result = await client.Socket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    break;
                }

                if (result.MessageType != WebSocketMessageType.Text)
                {
                    continue;
                }

                messageBuffer.Write(buffer, 0, result.Count);
                if (messageBuffer.Length > 1024 * 1024)
                {
                    break;
                }

                if (!result.EndOfMessage)
                {
                    continue;
                }

                string rawMessage = Encoding.UTF8.GetString(messageBuffer.ToArray());
                messageBuffer.SetLength(0);
                this.HandleClientMessage(client, rawMessage);
            }
        }

        private void HandleClientMessage(BridgeClient client, string rawMessage)
        {
            Dictionary<string, string> message;
            try
            {
                message = Json.ParseFlatObject(rawMessage);
            }
            catch
            {
                client.Send("{\"type\":\"error\",\"message\":\"Invalid bridge message.\"}");
                return;
            }

            string type = Json.Get(message, "type");
            if (type == "create")
            {
                this.CreateSession(client, message);
            }
            else if (type == "input")
            {
                TerminalSession session;
                if (this.sessions.TryGetValue(Json.Get(message, "id"), out session))
                {
                    session.Write(Json.Get(message, "data"));
                }
            }
            else if (type == "resize")
            {
                TerminalSession session;
                if (this.sessions.TryGetValue(Json.Get(message, "id"), out session))
                {
                    int cols = Json.GetInt(message, "cols", session.Cols);
                    int rows = Json.GetInt(message, "rows", session.Rows);
                    session.Resize(cols, rows);
                }
            }
            else if (type == "kill")
            {
                this.Log("info", "Kill requested for session " + Json.Get(message, "id"));
                this.KillSession(Json.Get(message, "id"));
            }
            else if (type == "killAll")
            {
                this.Log("info", "Kill-all requested (" + this.sessions.Count + " sessions)");
                foreach (TerminalSession session in this.sessions.Values)
                {
                    session.RequestExit();
                }
            }
            else if (type == "logStart")
            {
                this.StartLog(client, Json.Get(message, "id"));
            }
            else if (type == "logStop")
            {
                this.StopLog(client, Json.Get(message, "id"));
            }
            else if (type == "reveal")
            {
                this.RevealPath(client, Json.Get(message, "path"));
            }
            else if (type == "openPath")
            {
                this.OpenPath(client, Json.Get(message, "path"));
            }
            else if (type == "pickScript")
            {
                this.PickScript(client, message);
            }
            else if (type == "elevate")
            {
                this.ElevateSession(client, message);
            }
            else if (type == "list")
            {
                client.Send("{\"type\":\"sessions\",\"sessions\":" + this.SessionsJson() + "}");
            }
            else if (type == "memstats")
            {
                this.RequestMemStats(client);
            }
            else
            {
                client.Send("{\"type\":\"error\",\"message\":\"Unsupported message type: " + Json.Escape(type) + "\"}");
            }
        }

        private void CreateSession(BridgeClient client, Dictionary<string, string> options)
        {
            string id = this.SanitizeId(Json.Get(options, "id"));
            if (this.sessions.ContainsKey(id))
            {
                client.Send("{\"type\":\"error\",\"id\":" + Json.Quote(id) + ",\"message\":\"A session with this id already exists.\"}");
                return;
            }

            ShellInfo shell = this.GetShell(Json.Get(options, "shell"));
            string cwd = this.GetWorkingDirectory(Json.Get(options, "cwd"));
            int cols = Math.Max(20, Json.GetInt(options, "cols", 120));
            int rows = Math.Max(5, Json.GetInt(options, "rows", 30));
            string title = Json.Get(options, "title");
            if (String.IsNullOrWhiteSpace(title))
            {
                title = shell.Label;
            }

            TerminalSession session = new TerminalSession(id, title.Trim(), shell, cwd, cols, rows);
            session.Output += delegate(string data)
            {
                this.Broadcast("{\"type\":\"output\",\"id\":" + Json.Quote(id) + ",\"stream\":\"pty\",\"data\":" + Json.Quote(data) + "}");
            };
            session.Exited += delegate(int exitCode)
            {
                TerminalSession removed;
                this.sessions.TryRemove(id, out removed);
                this.Log("info", "Session exited: " + id + " (code " + exitCode + ")");
                this.Broadcast("{\"type\":\"exited\",\"id\":" + Json.Quote(id) + ",\"code\":" + exitCode + "}");
            };

            try
            {
                session.Start();
                if (!this.sessions.TryAdd(id, session))
                {
                    session.Kill();
                    client.Send("{\"type\":\"error\",\"id\":" + Json.Quote(id) + ",\"message\":\"A session with this id already exists.\"}");
                    return;
                }

                this.Log("info", "Session created: " + title + " [" + id + ", " + shell.Label + "]");
                client.Send("{\"type\":\"created\"," + session.SummaryJson().Substring(1));
            }
            catch (Exception error)
            {
                this.Log("error", "Session create failed for " + id + ": " + error.Message);
                client.Send("{\"type\":\"createFailed\",\"id\":" + Json.Quote(id) + ",\"message\":" + Json.Quote(error.Message) + "}");
            }
        }

        private void KillSession(string id)
        {
            TerminalSession session;
            if (this.sessions.TryGetValue(id, out session))
            {
                session.RequestExit();
            }
        }

        private List<DashboardSessionInfo> DashboardSessions()
        {
            List<DashboardSessionInfo> result = new List<DashboardSessionInfo>();
            foreach (TerminalSession session in this.sessions.Values)
            {
                result.Add(new DashboardSessionInfo
                {
                    Id = session.Id,
                    Title = session.Title,
                    Pid = session.Pid,
                    StartedAt = session.StartedAt
                });
            }
            return result;
        }

        // --- Administrator terminals -------------------------------------------------
        //
        // An elevated shell runs at HIGH integrity, and this (medium-integrity) bridge
        // cannot attach a ConPTY across that boundary. Nor can it elevate directly:
        // ShellExecute "runas" -- cannot hand over a pseudo-console. So the elevated
        // shell's ConPTY is owned by a copy of THIS script re-launched elevated
        // (-ElevatedHost), which relays the terminal back over a loopback socket.
        //
        // The channel is guarded by a one-time token, and the helper independently
        // verifies (by PID) that the listener really belongs to this bridge before it
        // applies any input, so a lower-integrity process cannot drive the elevated
        // shell even if it learned the token. Once connected the session is wired into
        // the normal session map, so input/resize/kill/logging all work unchanged.
        private void ElevateSession(BridgeClient client, Dictionary<string, string> options)
        {
            string id = this.SanitizeId(Json.Get(options, "id"));
            if (this.sessions.ContainsKey(id))
            {
                client.Send("{\"type\":\"error\",\"id\":" + Json.Quote(id) + ",\"message\":\"A session with this id already exists.\"}");
                return;
            }

            string script = ScriptPath;
            if (String.IsNullOrEmpty(script) || !File.Exists(script))
            {
                this.SendElevateError(client, id, "Could not locate the MultiTerm script to relaunch elevated.");
                return;
            }

            ShellInfo shell = this.GetShell(Json.Get(options, "shell"));
            string cwd = this.GetWorkingDirectory(Json.Get(options, "cwd"));
            int cols = Math.Max(20, Json.GetInt(options, "cols", 120));
            int rows = Math.Max(5, Json.GetInt(options, "rows", 30));
            string title = Json.Get(options, "title");
            if (String.IsNullOrWhiteSpace(title))
            {
                title = shell.Label;
            }
            title = title.Trim();

            string token = NewElevationToken();
            TcpListener listener = new TcpListener(IPAddress.Loopback, 0);
            try
            {
                listener.Start();
            }
            catch (Exception error)
            {
                this.SendElevateError(client, id, error.Message);
                return;
            }

            int listenPort = ((IPEndPoint)listener.LocalEndpoint).Port;

            // Bind BEFORE elevating: the helper verifies the listener's owning PID, and
            // the port being already held by us is what makes that check meaningful.
            string config = "{\"port\":" + listenPort
                + ",\"token\":" + Json.Quote(token)
                + ",\"bridgePid\":" + Process.GetCurrentProcess().Id
                + ",\"shellFile\":" + Json.Quote(shell.File)
                + ",\"shellLabel\":" + Json.Quote(shell.Label)
                + ",\"cwd\":" + Json.Quote(cwd)
                + ",\"cols\":" + cols
                + ",\"rows\":" + rows
                + ",\"title\":" + Json.Quote(title)
                + ",\"id\":" + Json.Quote(id) + "}";
            string encoded = Convert.ToBase64String(Encoding.UTF8.GetBytes(config));

            try
            {
                ProcessStartInfo startInfo = new ProcessStartInfo();
                startInfo.FileName = "powershell.exe";
                startInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -File "
                    + Json.QuoteCommandLine(script) + " -ElevatedHost " + encoded;
                startInfo.WorkingDirectory = cwd;
                // "runas" is what raises the UAC prompt, and it is only honoured when
                // UseShellExecute is true. WindowStyle Hidden reaches the elevated process
                // through the UAC broker's STARTUPINFO, so powershell.exe -- a console
                // application -- never shows a window. The consent dialog is drawn on the
                // secure desktop by a different process and is unaffected.
                startInfo.UseShellExecute = true;
                startInfo.Verb = "runas";
                startInfo.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(startInfo);
            }
            catch (Win32Exception error)
            {
                this.StopElevationListener(listener);
                // 1223 == ERROR_CANCELLED: the user dismissed the UAC prompt.
                string message = error.NativeErrorCode == 1223
                    ? "Administrator access was declined."
                    : error.Message;
                this.Log("info", "Elevation failed for " + id + ": " + message);
                this.SendElevateError(client, id, message);
                return;
            }
            catch (Exception error)
            {
                this.StopElevationListener(listener);
                this.SendElevateError(client, id, error.Message);
                return;
            }

            this.Log("info", "Elevation requested for " + id + " (" + shell.Label + ")");
            client.Send("{\"type\":\"elevateStarted\",\"id\":" + Json.Quote(id) + ",\"shell\":" + Json.Quote(shell.Label) + "}");
            this.AwaitElevatedHost(client, listener, id, token, title, shell, cwd, cols, rows);
        }

        // Wait (off the message loop) for the elevated helper to call back. The user may sit
        // on the UAC prompt for a while, so the window is generous; stopping the listener is
        // what unblocks the accept, which doubles as the timeout mechanism.
        private void AwaitElevatedHost(BridgeClient client, TcpListener listener, string id, string token, string title, ShellInfo shell, string cwd, int cols, int rows)
        {
            int settled = 0;
            Timer timeout = null;
            timeout = new Timer(delegate
            {
                if (Interlocked.CompareExchange(ref settled, 1, 0) == 0)
                {
                    this.StopElevationListener(listener);
                    this.SendElevateError(client, id, "Administrator terminal did not start in time.");
                }
                try { timeout.Dispose(); } catch { }
            }, null, 180000, System.Threading.Timeout.Infinite);

            Task.Run(delegate
            {
                TcpClient connection = null;
                try
                {
                    connection = listener.AcceptTcpClient();
                }
                catch
                {
                    // Listener stopped: either the timeout above fired or the bridge is
                    // shutting down. Whoever stopped it already reported the outcome.
                    return;
                }

                if (Interlocked.CompareExchange(ref settled, 1, 0) != 0)
                {
                    try { connection.Close(); } catch { }
                    return;
                }

                try { timeout.Dispose(); } catch { }
                // One connection only; a second caller must not get a shot at the token.
                this.StopElevationListener(listener);

                try
                {
                    this.AdoptElevatedSession(client, connection, id, token, title, shell, cwd, cols, rows);
                }
                catch (Exception error)
                {
                    try { connection.Close(); } catch { }
                    this.Log("error", "Elevated session failed for " + id + ": " + error.Message);
                    this.SendElevateError(client, id, error.Message);
                }
            });
        }

        // Authenticate the helper, then wire its relayed terminal in as a normal session.
        private void AdoptElevatedSession(BridgeClient client, TcpClient connection, string id, string token, string title, ShellInfo shell, string cwd, int cols, int rows)
        {
            NetworkStream stream = connection.GetStream();
            // The helper must present the token promptly; without a read timeout a stalled
            // peer would pin this thread for the life of the bridge.
            stream.ReadTimeout = 30000;
            UTF8Encoding encoding = new UTF8Encoding(false);
            StreamReader reader = new StreamReader(stream, encoding);
            StreamWriter writer = new StreamWriter(stream, encoding);
            writer.AutoFlush = true;

            Dictionary<string, string> auth = Json.ParseFlatObject(reader.ReadLine());
            if (Json.Get(auth, "type") != "auth" || !TokensMatch(Json.Get(auth, "token"), token))
            {
                try { connection.Close(); } catch { }
                this.SendElevateError(client, id, "The administrator terminal failed to authenticate.");
                return;
            }

            writer.WriteLine("{\"type\":\"ready\"}");

            Dictionary<string, string> started = Json.ParseFlatObject(reader.ReadLine());
            if (Json.Get(started, "type") != "started")
            {
                string reported = Json.Get(started, "message");
                try { connection.Close(); } catch { }
                this.SendElevateError(client, id, String.IsNullOrEmpty(reported) ? "The administrator terminal did not start." : reported);
                return;
            }

            // Relayed sessions have no local pseudo-console; input, resize and kill travel
            // over the socket instead. Everything downstream treats it as a normal session.
            TerminalSession session = new TerminalSession(id, title, shell, cwd, cols, rows);
            session.Output += delegate(string data)
            {
                this.Broadcast("{\"type\":\"output\",\"id\":" + Json.Quote(id) + ",\"stream\":\"pty\",\"data\":" + Json.Quote(data) + "}");
            };
            session.Exited += delegate(int exitCode)
            {
                TerminalSession removed;
                this.sessions.TryRemove(id, out removed);
                this.Log("info", "Administrator session exited: " + id + " (code " + exitCode + ")");
                this.Broadcast("{\"type\":\"exited\",\"id\":" + Json.Quote(id) + ",\"code\":" + exitCode + "}");
            };

            // No further blocking reads once the relay owns the socket.
            stream.ReadTimeout = System.Threading.Timeout.Infinite;
            session.AttachRemote(connection, reader, writer, Json.GetInt(started, "pid", 0));

            if (!this.sessions.TryAdd(id, session))
            {
                session.Kill();
                client.Send("{\"type\":\"error\",\"id\":" + Json.Quote(id) + ",\"message\":\"A session with this id already exists.\"}");
                return;
            }

            this.Log("info", "Administrator session created: " + title + " [" + id + ", " + shell.Label + "]");
            client.Send("{\"type\":\"created\"," + session.SummaryJson().Substring(1));
        }

        private void SendElevateError(BridgeClient client, string id, string message)
        {
            client.Send("{\"type\":\"elevateError\",\"id\":" + Json.Quote(id) + ",\"message\":" + Json.Quote(message) + "}");
        }

        private void StopElevationListener(TcpListener listener)
        {
            try { listener.Stop(); } catch { }
        }

        private static string NewElevationToken()
        {
            byte[] raw = new byte[32];
            using (RandomNumberGenerator rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(raw);
            }

            StringBuilder builder = new StringBuilder(raw.Length * 2);
            foreach (byte value in raw)
            {
                builder.Append(value.ToString("x2"));
            }

            return builder.ToString();
        }

        // Length-independent, early-exit-free comparison so the token cannot be recovered
        // one byte at a time by timing repeated connections.
        private static bool TokensMatch(string candidate, string expected)
        {
            if (candidate == null || expected == null || candidate.Length != expected.Length)
            {
                return false;
            }

            int difference = 0;
            for (int index = 0; index < expected.Length; index++)
            {
                difference |= candidate[index] ^ expected[index];
            }

            return difference == 0;
        }

        // Logs live under the user's profile rather than the install directory, which is
        // read-only for a standard user once MultiTerm is installed under Program Files.
        private static string LogDirectory()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "MultiTerm", "logs");
        }

        private void StartLog(BridgeClient client, string id)
        {
            TerminalSession session;
            if (!this.sessions.TryGetValue(id, out session))
            {
                return;
            }

            bool already = session.IsLogging;
            try
            {
                string path = session.StartLog(LogDirectory());
                if (!already)
                {
                    this.Log("info", "Logging session " + id + " to " + path);
                }
                client.Send("{\"type\":\"logStarted\",\"id\":" + Json.Quote(id) + ",\"path\":" + Json.Quote(path) + (already ? ",\"already\":true" : "") + "}");
            }
            catch (Exception error)
            {
                this.Log("error", "Could not start logging for " + id + ": " + error.Message);
                client.Send("{\"type\":\"logError\",\"id\":" + Json.Quote(id) + ",\"message\":" + Json.Quote(error.Message) + "}");
            }
        }

        private void StopLog(BridgeClient client, string id)
        {
            TerminalSession session;
            if (!this.sessions.TryGetValue(id, out session))
            {
                return;
            }

            string path = session.StopLog();
            if (path == null)
            {
                return;
            }

            this.Log("info", "Stopped logging session " + id);
            client.Send("{\"type\":\"logStopped\",\"id\":" + Json.Quote(id) + ",\"path\":" + Json.Quote(path) + "}");
        }

        // Opens the folder containing the target in Explorer.
        private void RevealPath(BridgeClient client, string target)
        {
            string path = target == null ? String.Empty : target.Trim();
            if (path.Length == 0)
            {
                return;
            }

            string directory;
            try
            {
                string resolved = Path.GetFullPath(path);
                directory = Directory.Exists(resolved) ? resolved : Path.GetDirectoryName(resolved);
            }
            catch
            {
                client.Send("{\"type\":\"revealError\",\"message\":\"Path not found.\"}");
                return;
            }

            if (String.IsNullOrEmpty(directory) || !Directory.Exists(directory))
            {
                client.Send("{\"type\":\"revealError\",\"message\":\"Path not found.\"}");
                return;
            }

            try
            {
                // Explorer takes the path literally rather than as MSVCRT-style argv, so it
                // must be plainly quoted; Json.QuoteCommandLine would double the backslashes.
                Process.Start(new ProcessStartInfo("explorer.exe", "\"" + directory + "\"") { UseShellExecute = true });
            }
            catch (Exception error)
            {
                client.Send("{\"type\":\"revealError\",\"message\":" + Json.Quote(error.Message) + "}");
            }
        }

        // Opens a file with whatever Windows has associated with its extension. Shell
        // execution is what performs the association lookup, so it has to stay enabled.
        private void OpenPath(BridgeClient client, string target)
        {
            string path = target == null ? String.Empty : target.Trim();
            if (path.Length == 0)
            {
                return;
            }

            string resolved;
            try
            {
                resolved = Path.GetFullPath(path);
            }
            catch
            {
                client.Send("{\"type\":\"openError\",\"message\":\"Path not found.\"}");
                return;
            }

            if (!File.Exists(resolved) && !Directory.Exists(resolved))
            {
                client.Send("{\"type\":\"openError\",\"message\":\"Path not found.\"}");
                return;
            }

            try
            {
                Process.Start(new ProcessStartInfo(resolved) { UseShellExecute = true });
            }
            catch (Exception error)
            {
                client.Send("{\"type\":\"openError\",\"message\":" + Json.Quote(error.Message) + "}");
            }
        }

        // Opens the Windows "choose a file" common dialog and reports the chosen
        // script back to the browser. The browser cannot do this itself: a file
        // input hands over the bytes but never the path, and the shipped app has
        // no Electron shell to ask. The dialog is a Win32 common dialog rather
        // than WinForms so it needs no extra assembly reference.
        private void PickScript(BridgeClient client, Dictionary<string, string> message)
        {
            string requestId = Json.Get(message, "requestId");
            string initialDirectory = String.Empty;
            try
            {
                string candidate = Json.Get(message, "cwd");
                if (!String.IsNullOrEmpty(candidate) && Directory.Exists(candidate))
                {
                    initialDirectory = Path.GetFullPath(candidate);
                }
            }
            catch
            {
                initialDirectory = String.Empty;
            }

            // The dialog blocks its thread until the user answers, so it cannot run
            // on the bridge's message loop, and the shell dialog requires STA.
            Thread dialogThread = new Thread(delegate()
            {
                string chosen = null;
                try
                {
                    chosen = FileDialog.Open("Select a script to run", initialDirectory);
                }
                catch (Exception error)
                {
                    this.Log("warn", "Script picker failed: " + error.Message);
                }

                string payload = String.IsNullOrEmpty(chosen) ? "null" : Json.Quote(chosen);
                client.Send("{\"type\":\"scriptPicked\",\"requestId\":" + Json.Quote(requestId) + ",\"path\":" + payload + "}");
            });
            dialogThread.IsBackground = true;
            dialogThread.SetApartmentState(ApartmentState.STA);
            dialogThread.Start();
        }

        // Answers the status-bar memory chip. The Node bridge (server.js) shells out to
        // Get-CimInstance and sums the working set of its process tree; here we are already
        // Windows-only and in-process, so we walk the tree directly with a Toolhelp snapshot
        // and read WorkingSet64 per pid. The reply shape mirrors server.js exactly so the
        // shipped, Node-free build reads identically. This bridge only runs on Windows, so
        // "supported" is always true (we never emit the "unsupported" shape server.js uses
        // on other platforms).
        private void RequestMemStats(BridgeClient client)
        {
            try
            {
                long app = this.ComputeAppMemory();
                long systemTotal = 0;
                long systemUsed = 0;
                Native.MEMORYSTATUSEX status = new Native.MEMORYSTATUSEX();
                status.dwLength = (uint)Marshal.SizeOf(typeof(Native.MEMORYSTATUSEX));
                if (Native.GlobalMemoryStatusEx(ref status))
                {
                    systemTotal = (long)status.ullTotalPhys;
                    systemUsed = (long)(status.ullTotalPhys - status.ullAvailPhys);
                }
                client.Send("{\"type\":\"memstats\",\"supported\":true,\"app\":" + app + ",\"systemUsed\":" + systemUsed + ",\"systemTotal\":" + systemTotal + "}");
            }
            catch (Exception error)
            {
                this.Log("warn", "memstats failed: " + error.Message);
                client.Send("{\"type\":\"memstats\",\"supported\":true,\"error\":\"Could not read process memory.\"}");
            }
        }

        // Sums the working set of the bridge process and every process it spawned. Terminal
        // shells are normally children of the bridge already, but elevated hosts run as
        // separate processes, so we also seed each live session pid as a root to stay honest.
        private long ComputeAppMemory()
        {
            // One snapshot -> a parent-to-children map we can breadth-first walk from our roots.
            Dictionary<int, List<int>> children = new Dictionary<int, List<int>>();
            IntPtr snapshot = Native.CreateToolhelp32Snapshot(Native.TH32CS_SNAPPROCESS, 0);
            if (snapshot != IntPtr.Zero && snapshot != new IntPtr(-1))
            {
                try
                {
                    Native.PROCESSENTRY32 entry = new Native.PROCESSENTRY32();
                    entry.dwSize = (uint)Marshal.SizeOf(typeof(Native.PROCESSENTRY32));
                    if (Native.Process32First(snapshot, ref entry))
                    {
                        do
                        {
                            int pid = (int)entry.th32ProcessID;
                            int parent = (int)entry.th32ParentProcessID;
                            List<int> list;
                            if (!children.TryGetValue(parent, out list))
                            {
                                list = new List<int>();
                                children[parent] = list;
                            }
                            list.Add(pid);
                        }
                        while (Native.Process32Next(snapshot, ref entry));
                    }
                }
                finally
                {
                    Native.CloseHandle(snapshot);
                }
            }

            HashSet<int> roots = new HashSet<int>();
            roots.Add(Process.GetCurrentProcess().Id);
            foreach (TerminalSession session in this.sessions.Values)
            {
                if (session.Pid > 0)
                {
                    roots.Add(session.Pid);
                }
            }

            HashSet<int> seen = new HashSet<int>();
            Queue<int> queue = new Queue<int>();
            foreach (int root in roots)
            {
                queue.Enqueue(root);
            }

            long total = 0;
            while (queue.Count > 0)
            {
                int pid = queue.Dequeue();
                if (!seen.Add(pid))
                {
                    continue;
                }
                try
                {
                    using (Process proc = Process.GetProcessById(pid))
                    {
                        total += proc.WorkingSet64;
                    }
                }
                catch
                {
                    // Process exited between the snapshot and now, or we cannot open it; skip.
                }
                List<int> kids;
                if (children.TryGetValue(pid, out kids))
                {
                    foreach (int kid in kids)
                    {
                        queue.Enqueue(kid);
                    }
                }
            }

            return total;
        }

        private string WelcomeJson()
        {
            return "{\"type\":\"welcome\",\"cwd\":" + Json.Quote(Directory.GetCurrentDirectory()) + ",\"sessions\":" + this.SessionsJson() + "}";
        }

        private string SessionsJson()
        {
            StringBuilder builder = new StringBuilder();
            builder.Append("[");
            bool first = true;
            foreach (TerminalSession session in this.sessions.Values)
            {
                if (!first)
                {
                    builder.Append(",");
                }
                first = false;
                builder.Append(session.SummaryJson());
            }
            builder.Append("]");
            return builder.ToString();
        }

        private void Broadcast(string message)
        {
            foreach (BridgeClient client in this.clients.Values)
            {
                client.Send(message);
            }
        }

        private void Log(string level, string message)
        {
            long epochMillis = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
            if (this.consoleDashboard != null)
            {
                this.consoleDashboard.AddLog(level, message);
            }
            else
            {
                Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss.fff") + "] [" + level + "] " + message);
            }
            this.Broadcast("{\"type\":\"log\",\"source\":\"server\",\"level\":" + Json.Quote(level) + ",\"time\":" + epochMillis + ",\"message\":" + Json.Quote(message) + "}");
        }

        private void ServeStaticFile(HttpListenerContext context, string rawPath)
        {
            string relativePath;
            try
            {
                relativePath = Uri.UnescapeDataString(rawPath == "/" ? "/index.html" : rawPath);
            }
            catch
            {
                this.SendText(context.Response, 400, "Bad request", "text/plain; charset=utf-8");
                return;
            }

            relativePath = relativePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            string filePath = Path.GetFullPath(Path.Combine(this.publicDir, relativePath));
            string root = this.publicDir.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (!filePath.StartsWith(root, StringComparison.OrdinalIgnoreCase))
            {
                this.SendText(context.Response, 403, "Forbidden", "text/plain; charset=utf-8");
                return;
            }

            if (!File.Exists(filePath))
            {
                this.SendText(context.Response, 404, "Not found", "text/plain; charset=utf-8");
                return;
            }

            byte[] content = File.ReadAllBytes(filePath);
            string extension = Path.GetExtension(filePath);
            string contentType;
            if (!this.mimeTypes.TryGetValue(extension, out contentType))
            {
                contentType = "application/octet-stream";
            }

            context.Response.StatusCode = 200;
            context.Response.ContentType = contentType;
            context.Response.Headers["Cache-Control"] = "no-store";
            context.Response.ContentLength64 = content.Length;
            if (context.Request.HttpMethod != "HEAD")
            {
                context.Response.OutputStream.Write(content, 0, content.Length);
            }
            context.Response.Close();
        }

        private void SendText(HttpListenerResponse response, int status, string body, string contentType)
        {
            byte[] content = Encoding.UTF8.GetBytes(body);
            response.StatusCode = status;
            response.ContentType = contentType;
            response.Headers["Cache-Control"] = "no-store";
            response.ContentLength64 = content.Length;
            response.OutputStream.Write(content, 0, content.Length);
            response.Close();
        }

        private string SanitizeId(string value)
        {
            if (!String.IsNullOrEmpty(value) && Regex.IsMatch(value, "^[a-zA-Z0-9_-]{8,80}$"))
            {
                return value;
            }

            return Guid.NewGuid().ToString();
        }

        private ShellInfo GetShell(string value)
        {
            if (value == "powershell")
            {
                return new ShellInfo("powershell.exe", "Windows PowerShell");
            }

            if (!this.CommandExists("pwsh.exe"))
            {
                return new ShellInfo("powershell.exe", "Windows PowerShell");
            }

            return new ShellInfo("pwsh.exe", "PowerShell 7");
        }

        private bool CommandExists(string fileName)
        {
            if (String.IsNullOrWhiteSpace(fileName))
            {
                return false;
            }

            if (Path.IsPathRooted(fileName))
            {
                return File.Exists(fileName);
            }

            string pathValue = Environment.GetEnvironmentVariable("PATH") ?? String.Empty;
            foreach (string pathEntry in pathValue.Split(Path.PathSeparator))
            {
                if (String.IsNullOrWhiteSpace(pathEntry))
                {
                    continue;
                }

                try
                {
                    string candidate = Path.Combine(pathEntry.Trim(), fileName);
                    if (File.Exists(candidate))
                    {
                        return true;
                    }
                }
                catch { }
            }

            return false;
        }

        private string GetWorkingDirectory(string value)
        {
            if (!String.IsNullOrWhiteSpace(value))
            {
                try
                {
                    string resolved = Path.GetFullPath(value.Trim());
                    if (Directory.Exists(resolved))
                    {
                        return resolved;
                    }
                }
                catch { }
            }

            return Directory.GetCurrentDirectory();
        }

        private bool IsLocalAddress(IPAddress address)
        {
            if (address == null)
            {
                return false;
            }

            if (IPAddress.IsLoopback(address))
            {
                return true;
            }

            return address.ToString() == "::ffff:127.0.0.1";
        }
    }

    internal sealed class BridgeClient
    {
        private readonly object sendLock = new object();

        public BridgeClient(string id, WebSocket socket)
        {
            this.Id = id;
            this.Socket = socket;
        }

        public string Id { get; private set; }

        public WebSocket Socket { get; private set; }

        public void Send(string message)
        {
            if (this.Socket.State != WebSocketState.Open)
            {
                return;
            }

            byte[] bytes = Encoding.UTF8.GetBytes(message);
            lock (this.sendLock)
            {
                if (this.Socket.State == WebSocketState.Open)
                {
                    try
                    {
                        this.Socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None).Wait();
                    }
                    catch { }
                }
            }
        }

        public void Close()
        {
            try
            {
                if (this.Socket.State == WebSocketState.Open || this.Socket.State == WebSocketState.CloseReceived)
                {
                    this.Socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Bridge stopped", CancellationToken.None).Wait(500);
                }
            }
            catch { }

            try { this.Socket.Dispose(); } catch { }
        }
    }

    internal sealed class ShellInfo
    {
        public ShellInfo(string file, string label)
        {
            this.File = file;
            this.Label = label;
        }

        public string File { get; private set; }

        public string Label { get; private set; }
    }

    // The Windows "Open file" common dialog, driven directly rather than through
    // System.Windows.Forms so the bridge needs no extra assembly reference (the
    // C# here is compiled with the default reference set).
    internal static class FileDialog
    {
        private const int OFN_FILEMUSTEXIST = 0x00001000;
        private const int OFN_PATHMUSTEXIST = 0x00000800;
        private const int OFN_HIDEREADONLY = 0x00000004;
        private const int OFN_EXPLORER = 0x00080000;
        private const int OFN_NOCHANGEDIR = 0x00000008;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct OpenFileName
        {
            public int lStructSize;
            public IntPtr hwndOwner;
            public IntPtr hInstance;
            public string lpstrFilter;
            public string lpstrCustomFilter;
            public int nMaxCustFilter;
            public int nFilterIndex;
            public IntPtr lpstrFile;
            public int nMaxFile;
            public string lpstrFileTitle;
            public int nMaxFileTitle;
            public string lpstrInitialDir;
            public string lpstrTitle;
            public int Flags;
            public short nFileOffset;
            public short nFileExtension;
            public string lpstrDefExt;
            public IntPtr lCustData;
            public IntPtr lpfnHook;
            public string lpTemplateName;
            public IntPtr pvReserved;
            public int dwReserved;
            public int FlagsEx;
        }

        [DllImport("comdlg32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetOpenFileNameW", ExactSpelling = true, SetLastError = true)]
        private static extern bool GetOpenFileNameW(ref OpenFileName options);

        // Returns the chosen path, or null when the user cancelled.
        public static string Open(string title, string initialDirectory)
        {
            OpenFileName options = new OpenFileName();
            options.lStructSize = Marshal.SizeOf(typeof(OpenFileName));
            // Each filter is a "label\0pattern\0" pair, and the list as a whole ends
            // with a second NUL. Embedded NULs survive marshalling, which copies the
            // string by length rather than stopping at the first one.
            options.lpstrFilter = "Scripts (*.ps1;*.bat;*.cmd)\0*.ps1;*.bat;*.cmd\0PowerShell (*.ps1)\0*.ps1\0Batch (*.bat;*.cmd)\0*.bat;*.cmd\0All files (*.*)\0*.*\0\0";
            options.nFilterIndex = 1;
            options.lpstrTitle = title;
            options.lpstrInitialDir = String.IsNullOrEmpty(initialDirectory) ? null : initialDirectory;
            // OFN_NOCHANGEDIR: the dialog must not move the bridge's process-wide
            // working directory, which new sessions inherit.
            options.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_HIDEREADONLY | OFN_EXPLORER | OFN_NOCHANGEDIR;
            options.nMaxFile = 4096;

            IntPtr buffer = Marshal.AllocCoTaskMem(options.nMaxFile * 2);
            try
            {
                // The buffer doubles as the initial file name, so it must start empty.
                for (int i = 0; i < 2; i++)
                {
                    Marshal.WriteByte(buffer, i, 0);
                }
                options.lpstrFile = buffer;

                if (!GetOpenFileNameW(ref options))
                {
                    return null; // Cancelled, or the dialog could not be shown.
                }
                return Marshal.PtrToStringUni(buffer);
            }
            finally
            {
                Marshal.FreeCoTaskMem(buffer);
            }
        }
    }

    internal sealed class TerminalSession
    {
        // ClosePseudoConsole cannot safely run concurrently across sessions: tearing several
        // pseudo consoles down at the same instant faults the host process. Closes are
        // serialised and spaced out so a "close all" never collapses into one simultaneous
        // teardown.
        private const int TeardownStaggerMs = 150;
        private static readonly object teardownLock = new object();
        private static DateTime nextTeardownUtc = DateTime.MinValue;

        private readonly object inputLock = new object();

        // Guards the log writer: it is opened and closed from the message-loop thread but
        // written from the output-pump thread, and closed again from the exit watcher.
        private readonly object logLock = new object();
        private StreamWriter logWriter;

        // Guards the unmanaged handles below. They are read on the message-loop thread
        // (Resize/Kill) and released on the exit-watcher thread, so an unsynchronised read
        // can hand a freed pseudo console to ResizePseudoConsole (access violation) or a
        // recycled process handle to TerminateProcess (kills an unrelated process).
        private readonly object handleLock = new object();
        private FileStream inputStream;
        private FileStream outputStream;
        private IntPtr pseudoConsole = IntPtr.Zero;
        private IntPtr processHandle = IntPtr.Zero;
        private IntPtr threadHandle = IntPtr.Zero;
        private volatile bool exited;

        // Set for administrator terminals, whose pseudo-console lives in an elevated helper
        // process. Input, resize and kill are forwarded over this socket instead of touching
        // a local ConPTY; output and exit arrive back the same way.
        private volatile bool remote;
        private TcpClient remoteSocket;
        private StreamReader remoteReader;
        private StreamWriter remoteWriter;
        private readonly object remoteWriteLock = new object();

        public TerminalSession(string id, string title, ShellInfo shell, string cwd, int cols, int rows)
        {
            this.Id = id;
            this.Title = title;
            this.Shell = shell;
            this.Cwd = cwd;
            this.Cols = cols;
            this.Rows = rows;
            this.StartedAt = DateTime.UtcNow.ToString("o");
        }

        public event Action<string> Output;

        public event Action<int> Exited;

        public string Id { get; private set; }

        public string Title { get; private set; }

        public ShellInfo Shell { get; private set; }

        public string Cwd { get; private set; }

        public int Cols { get; private set; }

        public int Rows { get; private set; }

        public int Pid { get; private set; }

        public string StartedAt { get; private set; }

        // Absolute path of the file this session is currently logging to, or null when
        // logging is off. Read by the message loop to answer logStart/logStop.
        public string LogPath { get; private set; }

        public bool IsLogging
        {
            get
            {
                lock (this.logLock)
                {
                    return this.logWriter != null;
                }
            }
        }

        // Begins mirroring this session's output to disk. Returns the file being written,
        // or the existing one when logging is already running, so the caller can tell the
        // client either way. Throws if the file cannot be opened.
        public string StartLog(string directory)
        {
            lock (this.logLock)
            {
                if (this.logWriter != null)
                {
                    return this.LogPath;
                }

                Directory.CreateDirectory(directory);
                string stamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH-mm-ss-fffZ");
                string path = Path.Combine(directory, SanitizeLogName(this.Title) + "-" + stamp + ".log");

                StreamWriter writer = new StreamWriter(new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite), new UTF8Encoding(false));
                writer.AutoFlush = true;
                writer.Write("# MultiTerm log for \"" + this.Title + "\" (" + this.Shell.Label + ") started " + DateTime.UtcNow.ToString("o") + "\r\n");

                this.logWriter = writer;
                this.LogPath = path;
                return path;
            }
        }

        // Stops logging and returns the file that was being written, or null if logging was
        // not running. LogPath is deliberately kept so the client can still reveal the file.
        public string StopLog()
        {
            lock (this.logLock)
            {
                if (this.logWriter == null)
                {
                    return null;
                }

                try
                {
                    this.logWriter.Dispose();
                }
                catch
                {
                    // The file handle may already be gone; the session is no longer logging either way.
                }

                this.logWriter = null;
                return this.LogPath;
            }
        }

        private void AppendToLog(string data)
        {
            lock (this.logLock)
            {
                if (this.logWriter == null)
                {
                    return;
                }

                try
                {
                    this.logWriter.Write(StripAnsiForLog(data));
                }
                catch
                {
                    // A full or disconnected disk must not take the terminal down with it;
                    // drop the log instead so the session keeps running.
                    try
                    {
                        this.logWriter.Dispose();
                    }
                    catch
                    {
                    }
                    this.logWriter = null;
                }
            }
        }

        private static string SanitizeLogName(string value)
        {
            string name = value == null ? String.Empty : value;
            StringBuilder builder = new StringBuilder();
            foreach (char character in name)
            {
                bool safe = (character >= 'a' && character <= 'z')
                    || (character >= 'A' && character <= 'Z')
                    || (character >= '0' && character <= '9')
                    || character == '.' || character == '_' || character == '-';
                builder.Append(safe ? character : '_');
                if (builder.Length >= 60)
                {
                    break;
                }
            }

            string sanitized = builder.ToString();
            return sanitized.Length == 0 ? "session" : sanitized;
        }

        // Terminals emit ANSI/OSC escape sequences to paint the screen; strip them so the
        // log reads as plain text. Tabs and line breaks are kept.
        private static string StripAnsiForLog(string data)
        {
            StringBuilder builder = new StringBuilder(data.Length);
            int index = 0;
            while (index < data.Length)
            {
                char character = data[index];
                if (character == '\u001b' && index + 1 < data.Length)
                {
                    char next = data[index + 1];
                    if (next == ']')
                    {
                        // OSC: runs until BEL or a String Terminator (ESC backslash).
                        int scan = index + 2;
                        while (scan < data.Length && data[scan] != '\u0007')
                        {
                            if (data[scan] == '\u001b' && scan + 1 < data.Length && data[scan + 1] == '\\')
                            {
                                scan++;
                                break;
                            }
                            scan++;
                        }
                        index = scan + 1;
                        continue;
                    }

                    if (next == '[')
                    {
                        // CSI: parameter and intermediate bytes, then a final byte in @-~.
                        int scan = index + 2;
                        while (scan < data.Length && data[scan] >= '\u0020' && data[scan] <= '\u003f')
                        {
                            scan++;
                        }
                        while (scan < data.Length && data[scan] >= '\u0020' && data[scan] <= '\u002f')
                        {
                            scan++;
                        }
                        index = scan < data.Length ? scan + 1 : scan;
                        continue;
                    }

                    if (next == '=' || next == '>' || next == '(' || next == ')' || next == '#')
                    {
                        index += (index + 2 < data.Length && IsAsciiAlphanumeric(data[index + 2])) ? 3 : 2;
                        continue;
                    }
                }

                bool control = character < '\u0020' && character != '\t' && character != '\n' && character != '\r';
                if (!control && character != '\u007f')
                {
                    builder.Append(character);
                }
                index++;
            }

            return builder.ToString();
        }

        private static bool IsAsciiAlphanumeric(char character)
        {
            return (character >= 'a' && character <= 'z')
                || (character >= 'A' && character <= 'Z')
                || (character >= '0' && character <= '9');
        }

        public void Start()
        {
            IntPtr inputRead = IntPtr.Zero;
            IntPtr inputWrite = IntPtr.Zero;
            IntPtr outputRead = IntPtr.Zero;
            IntPtr outputWrite = IntPtr.Zero;

            Native.SECURITY_ATTRIBUTES attributes = new Native.SECURITY_ATTRIBUTES();
            attributes.nLength = Marshal.SizeOf(typeof(Native.SECURITY_ATTRIBUTES));
            attributes.bInheritHandle = false;

            if (!Native.CreatePipe(out inputRead, out inputWrite, ref attributes, 0))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not create ConPTY input pipe.");
            }

            if (!Native.CreatePipe(out outputRead, out outputWrite, ref attributes, 0))
            {
                Native.CloseHandle(inputRead);
                Native.CloseHandle(inputWrite);
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not create ConPTY output pipe.");
            }

            int hresult = Native.CreatePseudoConsole(new Native.COORD((short)this.Cols, (short)this.Rows), inputRead, outputWrite, 0, out this.pseudoConsole);
            Native.CloseHandle(inputRead);
            Native.CloseHandle(outputWrite);

            if (hresult != 0)
            {
                Native.CloseHandle(inputWrite);
                Native.CloseHandle(outputRead);
                throw new Win32Exception(hresult, "Could not create Windows pseudo console.");
            }

            this.inputStream = new FileStream(new SafeFileHandle(inputWrite, true), FileAccess.Write, 4096, false);
            this.outputStream = new FileStream(new SafeFileHandle(outputRead, true), FileAccess.Read, 4096, false);
            this.StartProcess();
            this.StartOutputLoop();
            this.StartExitLoop();
        }

        public void Write(string data)
        {
            if (this.exited || String.IsNullOrEmpty(data))
            {
                return;
            }

            if (this.remote)
            {
                this.SendRemote("{\"type\":\"input\",\"data\":" + Json.Quote(data) + "}");
                return;
            }

            if (this.inputStream == null)
            {
                return;
            }

            byte[] bytes = Encoding.UTF8.GetBytes(data);
            lock (this.inputLock)
            {
                try
                {
                    this.inputStream.Write(bytes, 0, bytes.Length);
                    this.inputStream.Flush();
                }
                catch { }
            }
        }

        public void Resize(int cols, int rows)
        {
            if (this.remote)
            {
                if (this.exited)
                {
                    return;
                }

                this.Cols = Math.Max(20, cols);
                this.Rows = Math.Max(5, rows);
                this.SendRemote("{\"type\":\"resize\",\"cols\":" + this.Cols + ",\"rows\":" + this.Rows + "}");
                return;
            }

            lock (this.handleLock)
            {
                if (this.exited || this.pseudoConsole == IntPtr.Zero)
                {
                    return;
                }

                this.Cols = Math.Max(20, cols);
                this.Rows = Math.Max(5, rows);
                Native.ResizePseudoConsole(this.pseudoConsole, new Native.COORD((short)this.Cols, (short)this.Rows));
            }
        }

        public void RequestExit()
        {
            // A shell sitting at its prompt exits well inside the first grace window, but one
            // busy in a foreground command ignores "exit" entirely until it is interrupted.
            // Force-kill is the last resort, never the first move.
            this.Write("exit\r");
            Task.Delay(2500).ContinueWith(delegate
            {
                if (this.exited)
                {
                    return;
                }

                this.Write("\u0003");
                this.Write("exit\r");
                Task.Delay(2500).ContinueWith(delegate
                {
                    if (!this.exited)
                    {
                        this.Kill();
                    }
                });
            });
        }

        public void Kill()
        {
            if (this.remote)
            {
                if (!this.exited)
                {
                    this.SendRemote("{\"type\":\"kill\"}");
                }
                return;
            }

            lock (this.handleLock)
            {
                if (this.exited || this.processHandle == IntPtr.Zero)
                {
                    return;
                }

                Native.TerminateProcess(this.processHandle, 1);
            }
        }

        // Adopt an authenticated elevated helper as this session's terminal. The helper has
        // already started the shell (hence the pid); from here we only relay.
        public void AttachRemote(TcpClient socket, StreamReader reader, StreamWriter writer, int pid)
        {
            this.remoteSocket = socket;
            this.remoteReader = reader;
            this.remoteWriter = writer;
            this.Pid = pid;
            this.remote = true;
            this.StartRemoteLoop();
        }

        private void SendRemote(string payload)
        {
            lock (this.remoteWriteLock)
            {
                try
                {
                    this.remoteWriter.WriteLine(payload);
                }
                catch
                {
                    // The helper is gone; the read loop will settle the session.
                }
            }
        }

        private void StartRemoteLoop()
        {
            Task.Run(delegate
            {
                int exitCode = 1;
                try
                {
                    string line;
                    while ((line = this.remoteReader.ReadLine()) != null)
                    {
                        Dictionary<string, string> message;
                        try
                        {
                            message = Json.ParseFlatObject(line);
                        }
                        catch
                        {
                            continue;
                        }

                        string type = Json.Get(message, "type");
                        if (type == "output")
                        {
                            string data = Json.Get(message, "data");
                            Action<string> handler = this.Output;
                            this.AppendToLog(data);
                            if (handler != null)
                            {
                                handler(data);
                            }
                        }
                        else if (type == "exit")
                        {
                            exitCode = Json.GetInt(message, "code", 0);
                            break;
                        }
                    }
                }
                catch
                {
                    // Socket faulted: treat it exactly like the helper exiting.
                }

                this.FinishRemote(exitCode);
            });
        }

        // Single settle point for a relayed session, whether it ended cleanly, the socket
        // dropped, or the elevated helper was killed out from under us.
        private void FinishRemote(int exitCode)
        {
            if (this.exited)
            {
                return;
            }

            this.exited = true;
            try { if (this.remoteSocket != null) this.remoteSocket.Close(); } catch { }
            this.StopLog();
            Action<int> handler = this.Exited;
            if (handler != null)
            {
                handler(exitCode);
            }
        }

        public string SummaryJson()
        {
            return "{\"cols\":" + this.Cols + ",\"cwd\":" + Json.Quote(this.Cwd) + ",\"id\":" + Json.Quote(this.Id) + ",\"pid\":" + this.Pid + ",\"rows\":" + this.Rows + ",\"shell\":" + Json.Quote(this.Shell.Label) + ",\"startedAt\":" + Json.Quote(this.StartedAt) + ",\"title\":" + Json.Quote(this.Title) + "}";
        }

        private void StartProcess()
        {
            IntPtr attributeListSize = IntPtr.Zero;
            Native.InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeListSize);
            IntPtr attributeList = Marshal.AllocHGlobal(attributeListSize);
            bool attributeListInitialized = false;

            try
            {
                if (!Native.InitializeProcThreadAttributeList(attributeList, 1, 0, ref attributeListSize))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not initialize process attribute list.");
                }
                attributeListInitialized = true;

                if (!Native.UpdateProcThreadAttribute(attributeList, 0, (IntPtr)Native.PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, this.pseudoConsole, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not attach pseudo console to child process.");
                }

                Native.STARTUPINFOEX startupInfo = new Native.STARTUPINFOEX();
                startupInfo.StartupInfo.cb = Marshal.SizeOf(typeof(Native.STARTUPINFOEX));
                startupInfo.lpAttributeList = attributeList;

                Native.PROCESS_INFORMATION processInformation;
                string commandLine = Json.QuoteCommandLine(this.Shell.File) + " -NoLogo -NoExit";
                bool started = Native.CreateProcessW(null, commandLine, IntPtr.Zero, IntPtr.Zero, false, Native.EXTENDED_STARTUPINFO_PRESENT, IntPtr.Zero, this.Cwd, ref startupInfo, out processInformation);
                if (!started)
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not start " + this.Shell.File + ".");
                }

                this.processHandle = processInformation.hProcess;
                this.threadHandle = processInformation.hThread;
                this.Pid = processInformation.dwProcessId;
            }
            finally
            {
                if (attributeListInitialized)
                {
                    Native.DeleteProcThreadAttributeList(attributeList);
                }
                Marshal.FreeHGlobal(attributeList);
            }
        }

        private void StartOutputLoop()
        {
            Task.Run(delegate
            {
                byte[] buffer = new byte[8192];
                while (!this.exited)
                {
                    int count;
                    try
                    {
                        count = this.outputStream.Read(buffer, 0, buffer.Length);
                    }
                    catch
                    {
                        break;
                    }

                    if (count <= 0)
                    {
                        break;
                    }

                    Action<string> handler = this.Output;
                    string text = Encoding.UTF8.GetString(buffer, 0, count);
                    this.AppendToLog(text);
                    if (handler != null)
                    {
                        handler(text);
                    }
                }
            });
        }

        private void StartExitLoop()
        {
            Task.Run(delegate
            {
                Native.WaitForSingleObject(this.processHandle, Native.INFINITE);
                uint exitCode;
                if (!Native.GetExitCodeProcess(this.processHandle, out exitCode))
                {
                    exitCode = 1;
                }

                this.exited = true;
                this.DisposeHandles();
                this.StopLog();
                Action<int> handler = this.Exited;
                if (handler != null)
                {
                    handler(unchecked((int)exitCode));
                }
            });
        }

        private void DisposeHandles()
        {
            IntPtr consoleToClose;

            // Retire the handles under the lock so Resize/Kill can never observe one that is
            // about to be freed. The lock is released before the (slow) console teardown so a
            // closing session cannot stall the message loop.
            lock (this.handleLock)
            {
                if (this.threadHandle != IntPtr.Zero)
                {
                    Native.CloseHandle(this.threadHandle);
                    this.threadHandle = IntPtr.Zero;
                }

                if (this.processHandle != IntPtr.Zero)
                {
                    Native.CloseHandle(this.processHandle);
                    this.processHandle = IntPtr.Zero;
                }

                consoleToClose = this.pseudoConsole;
                this.pseudoConsole = IntPtr.Zero;
            }

            // Take inputLock so an in-flight Write is not left holding a disposed stream.
            lock (this.inputLock)
            {
                try { if (this.inputStream != null) this.inputStream.Dispose(); } catch { }
            }

            try { if (this.outputStream != null) this.outputStream.Dispose(); } catch { }

            if (consoleToClose != IntPtr.Zero)
            {
                CloseConsoleSerialized(consoleToClose);
            }
        }

        private static void CloseConsoleSerialized(IntPtr handle)
        {
            lock (teardownLock)
            {
                TimeSpan wait = nextTeardownUtc - DateTime.UtcNow;
                if (wait > TimeSpan.Zero)
                {
                    int waitMs = (int)Math.Ceiling(wait.TotalMilliseconds);
                    Thread.Sleep(Math.Min(waitMs, TeardownStaggerMs));
                }

                try
                {
                    Native.ClosePseudoConsole(handle);
                }
                finally
                {
                    nextTeardownUtc = DateTime.UtcNow.AddMilliseconds(TeardownStaggerMs);
                }
            }
        }
    }

    // The high-integrity half of an administrator terminal. This runs inside the elevated
    // copy of the script (-ElevatedHost): it owns the real pseudo-console -- which the
    // medium-integrity bridge cannot create for an elevated process -- and relays it back
    // over loopback. The caller verifies the bridge BEFORE invoking this, so by the time we
    // are here the only remaining job is to prove ourselves with the one-time token.
    public static class ElevatedHost
    {
        public static int Run(string encodedConfig)
        {
            Dictionary<string, string> config;
            try
            {
                config = Json.ParseFlatObject(Encoding.UTF8.GetString(Convert.FromBase64String(encodedConfig)));
            }
            catch
            {
                return 2;
            }

            TcpClient socket = new TcpClient();
            try
            {
                socket.Connect(IPAddress.Loopback, Json.GetInt(config, "port", 0));
            }
            catch
            {
                return 3;
            }

            UTF8Encoding encoding = new UTF8Encoding(false);
            NetworkStream stream = socket.GetStream();
            StreamReader reader = new StreamReader(stream, encoding);
            StreamWriter writer = new StreamWriter(stream, encoding);
            writer.AutoFlush = true;

            TerminalSession session = null;
            try
            {
                writer.WriteLine("{\"type\":\"auth\",\"token\":" + Json.Quote(Json.Get(config, "token")) + "}");

                // Do not touch the shell until the bridge has accepted the token.
                Dictionary<string, string> ready = Json.ParseFlatObject(reader.ReadLine());
                if (Json.Get(ready, "type") != "ready")
                {
                    return 4;
                }

                ShellInfo shell = new ShellInfo(Json.Get(config, "shellFile"), Json.Get(config, "shellLabel"));
                session = new TerminalSession(
                    Json.Get(config, "id"),
                    Json.Get(config, "title"),
                    shell,
                    Json.Get(config, "cwd"),
                    Json.GetInt(config, "cols", 120),
                    Json.GetInt(config, "rows", 30));

                object writeLock = new object();
                ManualResetEventSlim finished = new ManualResetEventSlim(false);

                session.Output += delegate(string data)
                {
                    lock (writeLock)
                    {
                        try { writer.WriteLine("{\"type\":\"output\",\"data\":" + Json.Quote(data) + "}"); }
                        catch { }
                    }
                };
                session.Exited += delegate(int code)
                {
                    lock (writeLock)
                    {
                        try { writer.WriteLine("{\"type\":\"exit\",\"code\":" + code + "}"); }
                        catch { }
                    }
                    finished.Set();
                };

                try
                {
                    session.Start();
                }
                catch (Exception error)
                {
                    lock (writeLock)
                    {
                        try { writer.WriteLine("{\"type\":\"startFailed\",\"message\":" + Json.Quote(error.Message) + "}"); }
                        catch { }
                    }
                    return 5;
                }

                lock (writeLock)
                {
                    writer.WriteLine("{\"type\":\"started\",\"pid\":" + session.Pid + "}");
                }

                string line;
                while ((line = reader.ReadLine()) != null)
                {
                    Dictionary<string, string> message;
                    try
                    {
                        message = Json.ParseFlatObject(line);
                    }
                    catch
                    {
                        continue;
                    }

                    string type = Json.Get(message, "type");
                    if (type == "input")
                    {
                        session.Write(Json.Get(message, "data"));
                    }
                    else if (type == "resize")
                    {
                        session.Resize(Json.GetInt(message, "cols", 120), Json.GetInt(message, "rows", 30));
                    }
                    else if (type == "kill")
                    {
                        session.RequestExit();
                    }
                }

                // The bridge hung up (app closed, or the session was removed). An orphaned
                // elevated shell would be invisible and unkillable from the UI, so end it.
                session.Kill();
                finished.Wait(5000);
                return 0;
            }
            catch
            {
                if (session != null)
                {
                    try { session.Kill(); } catch { }
                }
                return 1;
            }
            finally
            {
                try { socket.Close(); } catch { }
            }
        }
    }

    internal static class Json
    {
        public static string Get(Dictionary<string, string> values, string key)
        {
            string value;
            return values.TryGetValue(key, out value) ? value : String.Empty;
        }

        public static int GetInt(Dictionary<string, string> values, string key, int fallback)
        {
            int result;
            return Int32.TryParse(Get(values, key), out result) ? result : fallback;
        }

        public static Dictionary<string, string> ParseFlatObject(string json)
        {
            JsonReader reader = new JsonReader(json);
            return reader.ReadObject();
        }

        public static string Quote(string value)
        {
            return "\"" + Escape(value) + "\"";
        }

        public static string Escape(string value)
        {
            if (value == null)
            {
                return String.Empty;
            }

            StringBuilder builder = new StringBuilder();
            foreach (char ch in value)
            {
                switch (ch)
                {
                    case '\\': builder.Append("\\\\"); break;
                    case '"': builder.Append("\\\""); break;
                    case '\b': builder.Append("\\b"); break;
                    case '\f': builder.Append("\\f"); break;
                    case '\n': builder.Append("\\n"); break;
                    case '\r': builder.Append("\\r"); break;
                    case '\t': builder.Append("\\t"); break;
                    default:
                        if (ch < 32)
                        {
                            builder.Append("\\u");
                            builder.Append(((int)ch).ToString("x4"));
                        }
                        else
                        {
                            builder.Append(ch);
                        }
                        break;
                }
            }
            return builder.ToString();
        }

        public static string QuoteCommandLine(string value)
        {
            if (String.IsNullOrEmpty(value))
            {
                return "\"\"";
            }

            if (value.IndexOfAny(new char[] { ' ', '\t', '"' }) < 0)
            {
                return value;
            }

            return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
        }
    }

    internal sealed class JsonReader
    {
        private readonly string text;
        private int index;

        public JsonReader(string text)
        {
            this.text = text == null ? String.Empty : text;
        }

        public Dictionary<string, string> ReadObject()
        {
            Dictionary<string, string> result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            this.SkipWhitespace();
            this.Expect('{');
            this.SkipWhitespace();
            if (this.Peek() == '}')
            {
                this.index++;
                return result;
            }

            while (true)
            {
                this.SkipWhitespace();
                string key = this.ReadString();
                this.SkipWhitespace();
                this.Expect(':');
                this.SkipWhitespace();
                string value;
                if (this.Peek() == '"')
                {
                    value = this.ReadString();
                }
                else
                {
                    value = this.ReadToken();
                }
                result[key] = value;
                this.SkipWhitespace();
                char next = this.Peek();
                if (next == ',')
                {
                    this.index++;
                    continue;
                }

                if (next == '}')
                {
                    this.index++;
                    break;
                }

                throw new FormatException("Invalid JSON object.");
            }

            return result;
        }

        private string ReadString()
        {
            this.Expect('"');
            StringBuilder builder = new StringBuilder();
            while (this.index < this.text.Length)
            {
                char ch = this.text[this.index++];
                if (ch == '"')
                {
                    return builder.ToString();
                }

                if (ch != '\\')
                {
                    builder.Append(ch);
                    continue;
                }

                if (this.index >= this.text.Length)
                {
                    throw new FormatException("Invalid JSON escape.");
                }

                char escaped = this.text[this.index++];
                switch (escaped)
                {
                    case '"': builder.Append('"'); break;
                    case '\\': builder.Append('\\'); break;
                    case '/': builder.Append('/'); break;
                    case 'b': builder.Append('\b'); break;
                    case 'f': builder.Append('\f'); break;
                    case 'n': builder.Append('\n'); break;
                    case 'r': builder.Append('\r'); break;
                    case 't': builder.Append('\t'); break;
                    case 'u':
                        if (this.index + 4 > this.text.Length)
                        {
                            throw new FormatException("Invalid JSON unicode escape.");
                        }
                        string hex = this.text.Substring(this.index, 4);
                        builder.Append((char)Convert.ToInt32(hex, 16));
                        this.index += 4;
                        break;
                    default:
                        throw new FormatException("Invalid JSON escape.");
                }
            }

            throw new FormatException("Unterminated JSON string.");
        }

        private string ReadToken()
        {
            int start = this.index;
            while (this.index < this.text.Length)
            {
                char ch = this.text[this.index];
                if (ch == ',' || ch == '}')
                {
                    break;
                }
                this.index++;
            }

            return this.text.Substring(start, this.index - start).Trim();
        }

        private void Expect(char expected)
        {
            if (this.Peek() != expected)
            {
                throw new FormatException("Expected " + expected + ".");
            }
            this.index++;
        }

        private char Peek()
        {
            if (this.index >= this.text.Length)
            {
                return '\0';
            }
            return this.text[this.index];
        }

        private void SkipWhitespace()
        {
            while (this.index < this.text.Length && Char.IsWhiteSpace(this.text[this.index]))
            {
                this.index++;
            }
        }
    }

    internal static class Native
    {
        public const int EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
        public const int PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE = 0x00020016;
        public const uint INFINITE = 0xffffffff;

        [StructLayout(LayoutKind.Sequential)]
        public struct COORD
        {
            public short X;
            public short Y;

            public COORD(short x, short y)
            {
                this.X = x;
                this.Y = y;
            }
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct SECURITY_ATTRIBUTES
        {
            public int nLength;
            public IntPtr lpSecurityDescriptor;
            [MarshalAs(UnmanagedType.Bool)] public bool bInheritHandle;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public struct STARTUPINFO
        {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public int dwX;
            public int dwY;
            public int dwXSize;
            public int dwYSize;
            public int dwXCountChars;
            public int dwYCountChars;
            public int dwFillAttribute;
            public int dwFlags;
            public short wShowWindow;
            public short cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput;
            public IntPtr hStdOutput;
            public IntPtr hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct STARTUPINFOEX
        {
            public STARTUPINFO StartupInfo;
            public IntPtr lpAttributeList;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct PROCESS_INFORMATION
        {
            public IntPtr hProcess;
            public IntPtr hThread;
            public int dwProcessId;
            public int dwThreadId;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool CreatePipe(out IntPtr hReadPipe, out IntPtr hWritePipe, ref SECURITY_ATTRIBUTES lpPipeAttributes, int nSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool CloseHandle(IntPtr hObject);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern int CreatePseudoConsole(COORD size, IntPtr hInput, IntPtr hOutput, uint dwFlags, out IntPtr phPC);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern int ResizePseudoConsole(IntPtr hPC, COORD size);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern void ClosePseudoConsole(IntPtr hPC);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool InitializeProcThreadAttributeList(IntPtr lpAttributeList, int dwAttributeCount, int dwFlags, ref IntPtr lpSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool UpdateProcThreadAttribute(IntPtr lpAttributeList, uint dwFlags, IntPtr Attribute, IntPtr lpValue, IntPtr cbSize, IntPtr lpPreviousValue, IntPtr lpReturnSize);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern void DeleteProcThreadAttributeList(IntPtr lpAttributeList);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern bool CreateProcessW(string lpApplicationName, string lpCommandLine, IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles, int dwCreationFlags, IntPtr lpEnvironment, string lpCurrentDirectory, ref STARTUPINFOEX lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);

        // Toolhelp process snapshot, used by memstats to walk the bridge's process tree.
        public const uint TH32CS_SNAPPROCESS = 0x00000002;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        public struct PROCESSENTRY32
        {
            public uint dwSize;
            public uint cntUsage;
            public uint th32ProcessID;
            public IntPtr th32DefaultHeapID;
            public uint th32ModuleID;
            public uint cntThreads;
            public uint th32ParentProcessID;
            public int pcPriClassBase;
            public uint dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
            public string szExeFile;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        public static extern bool Process32First(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        public static extern bool Process32Next(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

        // Physical memory totals for the memstats "system" figures.
        [StructLayout(LayoutKind.Sequential)]
        public struct MEMORYSTATUSEX
        {
            public uint dwLength;
            public uint dwMemoryLoad;
            public ulong ullTotalPhys;
            public ulong ullAvailPhys;
            public ulong ullTotalPageFile;
            public ulong ullAvailPageFile;
            public ulong ullTotalVirtual;
            public ulong ullAvailVirtual;
            public ulong ullAvailExtendedVirtual;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);
    }
}
'@
}

# Administrator terminals relaunch this script elevated with -ElevatedHost. In that
# mode we are not a bridge at all: we own the elevated shell's pseudo-console (which a
# medium-integrity bridge cannot create) and relay it back over loopback.
#
# The escalation gate lives here, BEFORE any elevated shell is spawned: confirm the
# loopback listener we were pointed at is owned by the exact process that launched us
# and that it really is a MultiTerm bridge. We run at higher integrity than the bridge,
# so we can inspect it fully. The bridge binds the port before elevating us, so the
# owner is deterministically the real bridge -- a lower-integrity impostor can neither
# hold that PID nor pre-empt the bound port, even if it somehow learned the token.
if ($ElevatedHost) {
  try {
    $raw = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ElevatedHost))
    $cfg = $raw | ConvertFrom-Json
    $listen = Get-NetTCPConnection -State Listen -LocalPort ([int]$cfg.port) -ErrorAction Stop |
      Select-Object -First 1
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$listen.OwningProcess)" -ErrorAction Stop
    if ([int]$listen.OwningProcess -ne [int]$cfg.bridgePid) {
      exit 10
    }
    if ($owner.CommandLine -notmatch 'Start-MultiTerm\.ps1') {
      exit 11
    }
  } catch {
    exit 12
  }

  exit ([MultiTerm.PowerShellBridge.ElevatedHost]::Run($ElevatedHost))
}

[MultiTerm.PowerShellBridge.BridgeServer]::ScriptPath = $PSCommandPath

$bridge = [MultiTerm.PowerShellBridge.BridgeServer]::new(
    $HostName,
    $Port,
    $effectiveAllowRemote,
    $publicDir,
    -not $NoBrowser.IsPresent,
    $ConsoleDashboard.IsPresent)
try {
  $bridge.Run()
} catch {
  # A hidden console would swallow a startup failure and leave nothing on screen
  # but a window that never appeared, so bring it back and hold it open.
  if ($consoleHidden) {
    [MultiTerm.PowerShellBridge.ConsoleWindow]::Show()
    Write-Host ""
    Write-Host "MultiTerm could not start:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host ""
    Write-Host "Press Enter to close this window."
    try { [void][Console]::ReadLine() } catch { }
  }
  throw
} finally {
    if ($null -ne $bridge) {
        $bridge.Stop($true)
    }
    if ($ConsoleDashboard.IsPresent) {
        try { [Console]::CursorVisible = $true } catch { }
    }
}