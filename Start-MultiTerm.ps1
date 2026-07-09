param(
  [int]$Port = 0,
  [string]$HostName = "",
    [switch]$AllowRemote,
    [switch]$NoBrowser
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
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace MultiTerm.PowerShellBridge
{
    public sealed class BridgeServer
    {
        private readonly string host;
        private readonly int port;
        private readonly bool allowRemote;
        private readonly bool openBrowser;
        private readonly string publicDir;
        private readonly ConcurrentDictionary<string, BridgeClient> clients = new ConcurrentDictionary<string, BridgeClient>();
        private readonly ConcurrentDictionary<string, TerminalSession> sessions = new ConcurrentDictionary<string, TerminalSession>();
        private readonly Dictionary<string, string> mimeTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { ".html", "text/html; charset=utf-8" },
            { ".css", "text/css; charset=utf-8" },
            { ".js", "text/javascript; charset=utf-8" },
            { ".json", "application/json; charset=utf-8" },
            { ".svg", "image/svg+xml" },
            { ".ico", "image/x-icon" }
        };

        private HttpListener listener;
        private volatile bool stopping;

        public BridgeServer(string host, int port, bool allowRemote, string publicDir, bool openBrowser)
        {
            this.host = host;
            this.port = port;
            this.allowRemote = allowRemote;
            this.publicDir = Path.GetFullPath(publicDir);
            this.openBrowser = openBrowser;
        }

        public string Url
        {
            get { return "http://" + this.host + ":" + this.port + "/"; }
        }

        public void Run()
        {
            this.listener = new HttpListener();
            this.listener.Prefixes.Add(this.Url);
            this.listener.Start();

            Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs eventArgs)
            {
                eventArgs.Cancel = true;
                this.Stop(true);
            };

            Console.WriteLine("MultiTerm PowerShell bridge running on " + this.Url);
            Console.WriteLine("PowerShell sessions are available only to this local machine by default.");
            Console.WriteLine("Press Ctrl+C to stop the bridge.");

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

                if (context.Request.HttpMethod != "GET" && context.Request.HttpMethod != "HEAD")
                {
                    this.SendText(context.Response, 405, "Method not allowed", "text/plain; charset=utf-8");
                    context.Response.Headers["Allow"] = "GET, HEAD";
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

        private void OpenBrowser()
        {
            try
            {
                ProcessStartInfo startInfo = new ProcessStartInfo(this.Url);
                startInfo.UseShellExecute = true;
                Process.Start(startInfo);
            }
            catch (Exception error)
            {
                Console.WriteLine("Could not open browser automatically: " + error.Message);
            }
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

            try
            {
                this.ReceiveLoop(client).GetAwaiter().GetResult();
            }
            finally
            {
                BridgeClient removed;
                this.clients.TryRemove(client.Id, out removed);
                client.Close();
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
                this.KillSession(Json.Get(message, "id"));
            }
            else if (type == "killAll")
            {
                foreach (TerminalSession session in this.sessions.Values)
                {
                    session.RequestExit();
                }
            }
            else if (type == "list")
            {
                client.Send("{\"type\":\"sessions\",\"sessions\":" + this.SessionsJson() + "}");
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

                client.Send("{\"type\":\"created\"," + session.SummaryJson().Substring(1));
            }
            catch (Exception error)
            {
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

    internal sealed class TerminalSession
    {
        private readonly object inputLock = new object();
        private FileStream inputStream;
        private FileStream outputStream;
        private IntPtr pseudoConsole = IntPtr.Zero;
        private IntPtr processHandle = IntPtr.Zero;
        private IntPtr threadHandle = IntPtr.Zero;
        private volatile bool exited;

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
            if (this.exited || String.IsNullOrEmpty(data) || this.inputStream == null)
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
            if (this.exited || this.pseudoConsole == IntPtr.Zero)
            {
                return;
            }

            this.Cols = Math.Max(20, cols);
            this.Rows = Math.Max(5, rows);
            Native.ResizePseudoConsole(this.pseudoConsole, new Native.COORD((short)this.Cols, (short)this.Rows));
        }

        public void RequestExit()
        {
            this.Write("exit\r");
            Task.Delay(1500).ContinueWith(delegate
            {
                if (!this.exited)
                {
                    this.Kill();
                }
            });
        }

        public void Kill()
        {
            if (this.exited)
            {
                return;
            }

            if (this.processHandle != IntPtr.Zero)
            {
                Native.TerminateProcess(this.processHandle, 1);
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
                    if (handler != null)
                    {
                        handler(Encoding.UTF8.GetString(buffer, 0, count));
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
                Action<int> handler = this.Exited;
                if (handler != null)
                {
                    handler(unchecked((int)exitCode));
                }
            });
        }

        private void DisposeHandles()
        {
            try { if (this.inputStream != null) this.inputStream.Dispose(); } catch { }
            try { if (this.outputStream != null) this.outputStream.Dispose(); } catch { }

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

            if (this.pseudoConsole != IntPtr.Zero)
            {
                Native.ClosePseudoConsole(this.pseudoConsole);
                this.pseudoConsole = IntPtr.Zero;
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
    }
}
'@
}

$bridge = [MultiTerm.PowerShellBridge.BridgeServer]::new($HostName, $Port, $effectiveAllowRemote, $publicDir, -not $NoBrowser.IsPresent)

try {
  $bridge.Run()
} finally {
  $bridge.Stop($true)
}