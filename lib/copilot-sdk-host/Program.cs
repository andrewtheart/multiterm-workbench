using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using GitHub.Copilot;

namespace MultiTerm.CopilotSdkHost
{
    internal sealed class HostRequest
    {
        public string Operation { get; set; }
        public string Context { get; set; }
        public string Effort { get; set; }
        public string Model { get; set; }
        public string Prompt { get; set; }
    }

    internal sealed class HostResponse
    {
        public bool Ok { get; set; }
        public string Error { get; set; }
        public string Text { get; set; }
        public object Models { get; set; }
    }

    internal static class Program
    {
        private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        private static int Main()
        {
            try
            {
                return RunAsync().GetAwaiter().GetResult();
            }
            catch (Exception error)
            {
                WriteResponse(new HostResponse { Ok = false, Error = FriendlyError(error) });
                return 1;
            }
        }

        private static async Task<int> RunAsync()
        {
            string input = Console.In.ReadToEnd();
            HostRequest request = JsonSerializer.Deserialize<HostRequest>(input, JsonOptions);
            if (request == null) throw new InvalidOperationException("The SDK host request is empty or invalid.");

            var options = new CopilotClientOptions
            {
                BaseDirectory = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".copilot"),
                LogLevel = CopilotLogLevel.Error,
                Mode = CopilotClientMode.Empty,
                UseLoggedInUser = true
            };

            var client = new CopilotClient(options);
            try
            {
                await client.StartAsync().ConfigureAwait(false);
                GetAuthStatusResponse auth = await client.GetAuthStatusAsync().ConfigureAwait(false);
                if (!auth.IsAuthenticated)
                {
                    throw new InvalidOperationException(auth.StatusMessage ?? "GitHub Copilot is not authenticated.");
                }

                IList<ModelInfo> models = await client.ListModelsAsync().ConfigureAwait(false);
                if (String.Equals(request.Operation, "models", StringComparison.OrdinalIgnoreCase))
                {
                    WriteResponse(new HostResponse
                    {
                        Ok = true,
                        Models = models.Select(model => new
                        {
                            id = model.Id,
                            name = model.Name,
                            policy = model.Policy == null ? null : model.Policy.State,
                            efforts = model.SupportedReasoningEfforts == null
                                ? new string[0]
                                : model.SupportedReasoningEfforts.ToArray(),
                            defaultEffort = model.DefaultReasoningEffort,
                            maxPromptTokens = model.Capabilities == null || model.Capabilities.Limits == null
                                ? 0
                                : model.Capabilities.Limits.MaxPromptTokens,
                            maxContextTokens = model.Capabilities == null || model.Capabilities.Limits == null
                                ? 0
                                : model.Capabilities.Limits.MaxContextWindowTokens
                        }).ToArray()
                    });
                    return 0;
                }

                if (!String.Equals(request.Operation, "title", StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("Unsupported SDK host operation.");
                }

                ModelInfo selected = models.FirstOrDefault(model =>
                    String.Equals(model.Id, request.Model, StringComparison.Ordinal) &&
                    (model.Policy == null || !String.Equals(model.Policy.State, "disabled", StringComparison.OrdinalIgnoreCase)));
                if (selected == null) throw new InvalidOperationException("The selected GitHub Copilot model is not available for this account.");

                var config = new SessionConfig
                {
                    AvailableTools = new List<string>(),
                    ClientName = "MultiTerm Workbench",
                    ContextTier = new ContextTier(String.Equals(request.Context, "long_context", StringComparison.Ordinal) ? "long_context" : "default"),
                    EnableConfigDiscovery = false,
                    EnableFileHooks = false,
                    EnableHostGitOperations = false,
                    EnableOnDemandInstructionDiscovery = false,
                    EnableSessionStore = false,
                    EnableSkills = false,
                    ExcludedTools = new List<string> { "builtin:*", "mcp:*", "custom:*" },
                    InfiniteSessions = new InfiniteSessionConfig { Enabled = false },
                    Model = request.Model,
                    SkillDirectories = new List<string>(),
                    SkipCustomInstructions = true,
                    SkipEmbeddingRetrieval = true
                };

                string[] supportedEfforts = selected.SupportedReasoningEfforts == null
                    ? new string[0]
                    : selected.SupportedReasoningEfforts.ToArray();
                if (supportedEfforts.Contains(request.Effort, StringComparer.Ordinal))
                {
                    config.ReasoningEffort = request.Effort;
                }

                CopilotSession session = await client.CreateSessionAsync(config).ConfigureAwait(false);
                try
                {
                    var completion = new TaskCompletionSource<string>();
                    string responseText = String.Empty;
                    using (session.On<SessionEvent>(sessionEvent =>
                    {
                        var message = sessionEvent as AssistantMessageEvent;
                        if (message != null) responseText = message.Data.Content ?? String.Empty;
                        if (sessionEvent is SessionIdleEvent) completion.TrySetResult(responseText);
                        var sessionError = sessionEvent as SessionErrorEvent;
                        if (sessionError != null) completion.TrySetException(new InvalidOperationException(sessionError.Data.Message));
                    }))
                    {
                        await session.SendAsync(new MessageOptions { Prompt = request.Prompt ?? String.Empty }).ConfigureAwait(false);
                        Task finished = await Task.WhenAny(completion.Task, Task.Delay(TimeSpan.FromMinutes(3))).ConfigureAwait(false);
                        if (finished != completion.Task) throw new TimeoutException("GitHub Copilot title generation timed out.");
                        WriteResponse(new HostResponse { Ok = true, Text = await completion.Task.ConfigureAwait(false) });
                    }
                }
                finally
                {
                    await session.DisposeAsync().ConfigureAwait(false);
                }
            }
            finally
            {
                await client.StopAsync().ConfigureAwait(false);
                await client.DisposeAsync().ConfigureAwait(false);
            }
            return 0;
        }

        private static string FriendlyError(Exception error)
        {
            string detail = error == null ? String.Empty : error.Message;
            if (System.Text.RegularExpressions.Regex.IsMatch(detail, "not authenticated|not logged in|authentication|unauthorized|\\b401\\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            {
                return "GitHub Copilot is not signed in for this Windows account.";
            }
            if (System.Text.RegularExpressions.Regex.IsMatch(detail, "subscription|entitlement|forbidden|\\b403\\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            {
                return "GitHub Copilot is not available for this account or subscription.";
            }
            return String.IsNullOrWhiteSpace(detail) ? "GitHub Copilot SDK failed." : detail;
        }

        private static void WriteResponse(HostResponse response)
        {
            Console.Out.WriteLine(JsonSerializer.Serialize(response, JsonOptions));
        }
    }
}
