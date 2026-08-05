using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace MultiTerm.PromptLibraryHost
{
    internal static class Program
    {
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer
        {
            MaxJsonLength = 1024 * 1024
        };

        private static int Main()
        {
            Console.InputEncoding = new UTF8Encoding(false);
            Console.OutputEncoding = new UTF8Encoding(false);
            using (var output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true })
            {
                Console.SetOut(output);
                return Run();
            }
        }

        private static int Run()
        {
            PromptLibraryStore store = null;
            try
            {
                string line;
                while ((line = Console.ReadLine()) != null)
                {
                    if (String.IsNullOrWhiteSpace(line)) continue;
                    HostRequest request = null;
                    try
                    {
                        request = Json.Deserialize<HostRequest>(line);
                        if (request == null) throw new InvalidDataException("The request is empty or invalid.");
                        WriteResponse(Handle(request, ref store));
                    }
                    catch (PromptLibraryException error)
                    {
                        WriteResponse(ErrorResponse(request, error.Code, error.Message));
                    }
                    catch (InvalidDataException error)
                    {
                        WriteResponse(ErrorResponse(request, "invalid_request", error.Message));
                    }
                    catch (Exception error)
                    {
                        WriteResponse(ErrorResponse(request, "host_failed", FriendlyError(error)));
                    }
                }
                return 0;
            }
            finally
            {
                if (store != null) store.Dispose();
            }
        }

        private static HostResponse Handle(HostRequest request, ref PromptLibraryStore store)
        {
            string operation = (request.Operation ?? String.Empty).Trim().ToLowerInvariant();
            if (operation == "status")
            {
                return new HostResponse
                {
                    Ok = true,
                    RequestId = request.RequestId,
                    Version = 1
                };
            }
            if (store == null) store = PromptLibraryStore.Open();
            if (operation == "list")
            {
                return new HostResponse
                {
                    Ok = true,
                    RequestId = request.RequestId,
                    Version = 1,
                    LibraryRevision = store.LibraryRevision(),
                    Prompts = store.List()
                };
            }
            if (operation == "get")
            {
                return new HostResponse
                {
                    Ok = true,
                    RequestId = request.RequestId,
                    Version = 1,
                    LibraryRevision = store.LibraryRevision(),
                    Prompt = store.Get(request.Id)
                };
            }
            if (operation == "upsert")
            {
                PromptRecord saved = store.Upsert(request.Id, request.Name, request.Body, request.ExpectedRevision);
                return new HostResponse
                {
                    Ok = true,
                    RequestId = request.RequestId,
                    Version = 1,
                    LibraryRevision = store.LibraryRevision(),
                    Prompt = saved
                };
            }
            if (operation == "delete")
            {
                store.Delete(request.Id, request.ExpectedRevision);
                return new HostResponse
                {
                    Ok = true,
                    RequestId = request.RequestId,
                    Version = 1,
                    LibraryRevision = store.LibraryRevision()
                };
            }
            return new HostResponse
            {
                Ok = false,
                RequestId = request.RequestId,
                ErrorCode = "unsupported_operation",
                Error = "Unsupported prompt library operation."
            };
        }

        private static HostResponse ErrorResponse(HostRequest request, string code, string message)
        {
            return new HostResponse
            {
                Ok = false,
                RequestId = request == null ? String.Empty : request.RequestId,
                ErrorCode = code,
                Error = message
            };
        }

        private static string FriendlyError(Exception error)
        {
            if (error is PromptLibraryRecoveryException) return error.Message;
            if (error is System.Security.Cryptography.CryptographicException)
            {
                return "The prompt library key could not be unlocked for this Windows account.";
            }
            return "The prompt library host failed.";
        }

        private static void WriteResponse(HostResponse response)
        {
            var payload = new Dictionary<string, object>
            {
                { "type", "promptLibraryResponse" },
                { "ok", response.Ok },
                { "requestId", response.RequestId ?? String.Empty },
                { "version", response.Version },
                { "libraryRevision", response.LibraryRevision }
            };
            if (!String.IsNullOrEmpty(response.ErrorCode)) payload["errorCode"] = response.ErrorCode;
            if (!String.IsNullOrEmpty(response.Error)) payload["error"] = response.Error;
            if (response.Prompt != null) payload["prompt"] = PromptPayload(response.Prompt, true);
            if (response.Prompts != null)
            {
                var prompts = new List<object>();
                foreach (PromptRecord prompt in response.Prompts) prompts.Add(PromptPayload(prompt, false));
                payload["prompts"] = prompts;
            }
            Console.Out.WriteLine(Json.Serialize(payload));
        }

        private static Dictionary<string, object> PromptPayload(PromptRecord prompt, bool includeBody)
        {
            var payload = new Dictionary<string, object>
            {
                { "id", prompt.Id },
                { "name", prompt.Name },
                { "createdAt", prompt.CreatedAt },
                { "updatedAt", prompt.UpdatedAt },
                { "revision", prompt.Revision }
            };
            if (includeBody) payload["body"] = prompt.Body;
            return payload;
        }
    }

    internal sealed class HostRequest
    {
        public string Operation { get; set; }
        public string RequestId { get; set; }
        public string Id { get; set; }
        public string Name { get; set; }
        public string Body { get; set; }
        public long ExpectedRevision { get; set; }
    }

    internal sealed class HostResponse
    {
        public bool Ok { get; set; }
        public string RequestId { get; set; }
        public string ErrorCode { get; set; }
        public string Error { get; set; }
        public int Version { get; set; }
        public long LibraryRevision { get; set; }
        public PromptRecord Prompt { get; set; }
        public List<PromptRecord> Prompts { get; set; }
    }
}