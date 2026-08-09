using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using GitHub.Copilot;
using GitHub.Copilot.Rpc;

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

    // Usage travels as flat scalars because the bridge parses this response with
    // its own flat JSON reader.
    internal sealed class HostResponse
    {
        public bool Ok { get; set; }
        public string Error { get; set; }
        public string Text { get; set; }
        public object Models { get; set; }
        public double UsageAiCredits { get; set; }
        public double UsagePremiumRequests { get; set; }
        public long UsageInputTokens { get; set; }
        public long UsageOutputTokens { get; set; }
        public long UsageCacheReadTokens { get; set; }
        public long UsageCacheWriteTokens { get; set; }
    }

    internal static class Program
    {
        private const double NanoAiUnitsPerCredit = 1000000000d;

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

                bool titleOperation = String.Equals(request.Operation, "title", StringComparison.OrdinalIgnoreCase);
                bool searchOperation = String.Equals(request.Operation, "search", StringComparison.OrdinalIgnoreCase);
                bool groupOperation = String.Equals(request.Operation, "group-pages", StringComparison.OrdinalIgnoreCase);
                if (!titleOperation && !searchOperation && !groupOperation)
                {
                    throw new InvalidOperationException("Unsupported SDK host operation.");
                }

                // An empty model is the renderer's "Auto" choice: fall back to the first
                // model the account still has enabled rather than pinning a model id.
                ModelInfo selected = models.FirstOrDefault(model =>
                    (String.IsNullOrEmpty(request.Model) || String.Equals(model.Id, request.Model, StringComparison.Ordinal)) &&
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
                    Model = selected.Id,
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
                        if (finished != completion.Task) throw new TimeoutException(
                            groupOperation
                                ? "GitHub Copilot page grouping timed out."
                                : searchOperation
                                    ? "GitHub Copilot session search timed out."
                                    : "GitHub Copilot title generation timed out.");
                        string text = await completion.Task.ConfigureAwait(false);
                        WriteResponse(await BuildCompletionResponseAsync(session, text).ConfigureAwait(false));
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

        // Usage is telemetry about a completed operation, so a metrics failure must
        // never turn a successful title or search into an error.
        // GHCP001: the SDK ships its usage types as evaluation-only, and this is the
        // only supported way to read per-session token and credit cost.
#pragma warning disable GHCP001
        private static async Task<HostResponse> BuildCompletionResponseAsync(CopilotSession session, string text)
        {
            var response = new HostResponse { Ok = true, Text = text };
            try
            {
                UsageGetMetricsResult metrics = await session.Rpc.Usage.GetMetricsAsync(CancellationToken.None).ConfigureAwait(false);
                if (metrics == null) return response;
                if (metrics.ModelMetrics != null)
                {
                    foreach (UsageMetricsModelMetric model in metrics.ModelMetrics.Values)
                    {
                        if (model == null || model.Usage == null) continue;
                        response.UsageInputTokens += Math.Max(0L, model.Usage.InputTokens);
                        response.UsageOutputTokens += Math.Max(0L, model.Usage.OutputTokens);
                        response.UsageCacheReadTokens += Math.Max(0L, model.Usage.CacheReadTokens);
                        response.UsageCacheWriteTokens += Math.Max(0L, model.Usage.CacheWriteTokens);
                    }
                }
                response.UsageAiCredits = Math.Max(0d, metrics.TotalNanoAiu.GetValueOrDefault()) / NanoAiUnitsPerCredit;
                response.UsagePremiumRequests = Math.Max(0d, metrics.TotalPremiumRequestCost);
            }
            catch (Exception error)
            {
                Console.Error.WriteLine("Could not read GitHub Copilot usage metrics: " + error.Message);
            }
            return response;
        }
#pragma warning restore GHCP001

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
