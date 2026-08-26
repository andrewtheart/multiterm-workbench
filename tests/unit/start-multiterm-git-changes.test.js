/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "../../Start-MultiTerm.ps1"), "utf8");

function methodSource(signature, nextSignature) {
  const start = source.indexOf(signature);
  const end = source.indexOf(nextSignature, start + signature.length);
  if (start < 0 || end < 0) throw new Error(`Could not locate ${signature}`);
  return source.slice(start, end);
}

describe("installed bridge staging area", () => {
  test("reads status through porcelain v2 so renames and ahead/behind survive", () => {
    const reader = methodSource("private static GitStatusReport ReadGitStatus(", "private void SendGitStatus(");
    expect(reader).toContain('"status", "--porcelain=v2", "--branch", "-z"');

    const parser = methodSource("private static GitStatusReport ParseGitStatusPorcelain(", "private static GitStatusReport ReadGitStatus(");
    expect(parser).toContain('record.StartsWith("# branch.head "');
    expect(parser).toContain('record.StartsWith("# branch.upstream "');
    expect(parser).toContain('record.StartsWith("# branch.ab "');
    expect(parser).toContain('record.StartsWith("? "');
    expect(parser).toContain('record.StartsWith("u "');
    // A rename record's source path is the following NUL field and must be consumed.
    expect(parser).toMatch(/if \(renamed\)\s*\{\s*origPath = index < fields\.Length \? fields\[index\] : String\.Empty;\s*index\+\+;/);
  });

  test("stages files with add and unstages with restore, falling back before the first commit", () => {
    const stager = methodSource("private static string ApplyGitStageOperation(", "private void SendGitStage(");
    expect(stager).toContain('arguments.Add("add")');
    expect(stager).toContain('arguments.Add("restore")');
    expect(stager).toContain('arguments.Add("--staged")');
    expect(stager).toContain("HeadCommitExists(worktreePath)");
    expect(stager).toContain('arguments.Add("--cached")');
    // A path beginning with "-" would be read as an option even through argv.
    expect(stager).toContain('entry.StartsWith("-", StringComparison.Ordinal)) return "That file name cannot be staged safely."');
  });

  test("applies a hunk to the index only, reversing it to unstage", () => {
    const patcher = methodSource("private static string ApplyGitHunkPatch(", "private static string ApplyGitStageOperation(");
    expect(patcher).toContain('"apply", "--cached", "--whitespace=nowarn"');
    expect(patcher).toContain('if (String.Equals(direction, "unstage", StringComparison.Ordinal)) arguments.Add("--reverse")');
    expect(patcher).toContain("Directory.Delete(temporaryDirectory, true)");
    expect(patcher).not.toContain('"--unidiff-zero"');
  });

  test("commits from a message file so no part of the message can be read as an option", () => {
    const committer = methodSource("private void SendGitCommit(", "private static string SuggestedMergeTarget(");
    expect(committer).toContain('"diff", "--cached", "--quiet"');
    expect(committer).toContain('"Nothing is staged, so there is nothing to commit."');
    expect(committer).toContain('RunGit(new string[] { "commit", "-F", messagePath }');
    expect(committer).not.toMatch(/"commit", "-m"/);
    expect(committer).toContain("Directory.Delete(temporaryDirectory, true)");
  });

  test("mirrors the renderer ceilings without inventing hidden ones", () => {
    expect(source).toContain("private const int MinGitDiffBytes = 256 * 1024;");
    expect(source).toContain("private const int MaxAllowedGitDiffBytes = 16 * 1024 * 1024;");
    expect(source).toContain("private const int DefaultGitFileLimit = 500;");
    expect(source).toContain("private const int MinGitFileLimit = 50;");
    expect(source).toContain("private const int MaxGitFileLimit = 5000;");
  });
});

describe("installed bridge change publishing", () => {
  test("suggests the recorded worktree parent before the upstream or default branch", () => {
    const suggester = methodSource("private static string SuggestedMergeTarget(", "private static string GitRefLinesJson(");
    expect(suggester).toContain('"config", "--local", "--get", "multiterm.worktree." + branch + ".parent"');
    expect(suggester.indexOf("multiterm.worktree.")).toBeLessThan(suggester.indexOf("upstream.IndexOf"));
    expect(suggester.indexOf("upstream.IndexOf")).toBeLessThan(suggester.indexOf("return defaultBranch.Length > 0"));
  });

  test("understands both remote URL spellings and classifies the forge", () => {
    const parser = methodSource("private static GitRemoteIdentity ParseGitRemoteUrl(", "private static string GitRemoteHostKind(");
    expect(parser).toContain('Regex.Match(raw, "^(?:[^@]+@)?([^:/]+):(.+)$")');
    expect(parser).toContain("Uri.TryCreate(url, UriKind.Absolute, out parsed)");

    const classifier = methodSource("private static string GitRemoteHostKind(", "private static string GitCompareUrl(");
    expect(classifier).toContain('return "github"');
    expect(classifier).toContain('return "azure"');
    expect(classifier).toContain('return "gitlab"');
    expect(classifier).toContain('return "other"');
  });

  test("disables terminal prompts on push and reports credential failures separately", () => {
    const pusher = methodSource("private void SendGitPush(", "private void SendGitPullRequest(");
    expect(pusher).toContain('{ "GIT_TERMINAL_PROMPT", "0" }');
    expect(pusher).toContain('arguments = new List<string>() { "push", "--porcelain" }');
    expect(pusher).toContain("GitPushNeedsInteractiveTerminal(output)");
    expect(pusher).toContain('"Git needs credentials that cannot be entered from the bridge."');
    // The renderer needs the exact command so the user can run it in a terminal.
    expect(pusher).toContain('",\\"command\\":" + Json.Quote(command)');
    // Force pushing is deliberately not offered.
    expect(pusher).not.toContain('"--force"');
  });

  test("creates a pull request through gh only for GitHub and otherwise returns a browser URL", () => {
    const opener = methodSource("private void SendGitPullRequest(", "private void SendGitWorktreeRecord(");
    expect(opener).toContain('!String.Equals(remote.Kind, "github", StringComparison.Ordinal) || !remote.GhAvailable');
    expect(opener).toContain('RunProcess("gh", new string[] {');
    expect(opener).toContain('"pr", "create", "--base", targetBranch, "--head", sourceBranch');
    expect(opener).toContain('"--body-file", bodyPath');
    expect(opener).toContain("openUrl = compareUrl");
  });

  test("degrades to an unknown merge outcome on Git versions without merge-tree --write-tree", () => {
    const preview = methodSource("private void SendGitMergePreview(", "private static readonly string[] GitAuthenticationSignals");
    expect(preview).toContain('"merge-tree", "--write-tree", "--name-only", targetBranch, sourceBranch');
    expect(preview).toContain('if (trial.ExitCode != 0 && trial.ExitCode != 1)');
    expect(preview).toContain('outcome = "unknown"');
    expect(preview).toContain('outcome = "fastForward"');
    expect(preview).toContain('outcome = "upToDate"');
    expect(preview).toContain('outcome = "conflicts"');
  });

  test("accepts the Review Changes branch names as well as the worktree spelling", () => {
    const merge = methodSource("private void SendGitMergeStart(", "private void SendGitMergeFinish(");
    expect(merge).toContain('parentBranch = (Json.Get(message, "targetBranch") ?? String.Empty).Trim()');
    expect(merge).toContain('worktreeBranch = (Json.Get(message, "sourceBranch") ?? String.Empty).Trim()');
    expect(merge).toContain('if (parentBranch.Length == 0) parentBranch = (Json.Get(message, "parentBranch")');
    expect(merge).toContain('if (worktreeBranch.Length == 0) worktreeBranch = (Json.Get(message, "worktreeBranch")');
  });

  test("answers every new request with its correlation id", () => {
    for (const [handler, next, replyType] of [
      ["private void SendGitStatus(", "private static bool HeadCommitExists(", "gitStatusResult"],
      ["private void SendGitStage(", "private void SendGitCommit(", "gitStageResult"],
      ["private void SendGitCommit(", "private static string SuggestedMergeTarget(", "gitCommitResult"],
      ["private void SendGitBranches(", "private sealed class GitRemoteIdentity", "gitBranchList"],
      ["private void SendGitRemoteInfo(", "private void SendGitMergePreview(", "gitRemoteInfoResult"],
      ["private void SendGitMergePreview(", "private static readonly string[] GitAuthenticationSignals", "gitMergePreviewResult"],
      ["private void SendGitPush(", "private void SendGitPullRequest(", "gitPushResult"],
      ["private void SendGitPullRequest(", "private void SendGitWorktreeRecord(", "gitPullRequestResult"]
    ]) {
      const body = methodSource(handler, next);
      expect(body).toContain(`"{\\"type\\":\\"${replyType}\\",\\"requestId\\":" + Json.Quote(requestId)`);
    }
  });

  test("routes every new message type from the client dispatcher", () => {
    for (const type of [
      "gitStatus", "gitStage", "gitCommit", "gitBranches",
      "gitRemoteInfo", "gitMergePreview", "gitPush", "gitPullRequest",
      "openInEditor"
    ]) {
      expect(source).toContain(`else if (type == "${type}")`);
    }
  });
});

describe("installed bridge editor launch", () => {
  const opener = methodSource("private void OpenInEditor(", "private void SendEditorResult(");

  test("keeps the file name out of the command line", () => {
    // The launcher is a .cmd shim, so it needs a shell to resolve; a file name
    // may legally contain '&', which a shell would read as a second command.
    expect(opener).toContain('environment["MT_EDITOR_TARGET"]');
    expect(opener).toContain('environment["MT_EDITOR_COMMAND"]');
    expect(opener).toContain('"$ErrorActionPreference = \'Stop\'; & $env:MT_EDITOR_COMMAND --goto $env:MT_EDITOR_TARGET"');
    // The argument array must be entirely literal: no concatenation can splice
    // the path or the editor name into a command line.
    const argumentArray = opener.slice(opener.indexOf("string[] arguments = new string[]"));
    expect(argumentArray.slice(0, argumentArray.indexOf("};"))).not.toContain("+");
  });

  test("accepts only a bare editor name and falls back to code", () => {
    expect(opener).toContain('Regex.IsMatch(requested, "^[A-Za-z0-9][A-Za-z0-9._-]*$") ? requested : "code"');
  });

  test("refuses a path that is not an existing file", () => {
    expect(opener).toContain("!File.Exists(resolved)");
    expect(opener).toContain("That file is not on disk, so there is nothing to open.");
  });

  test("answers every request so the dialog is never left waiting", () => {
    const replies = opener.match(/this\.SendEditorResult\(/g) || [];
    expect(replies.length).toBe(4);
    const sender = methodSource("private void SendEditorResult(", "private void PickScript(");
    expect(sender).toContain('"{\\"type\\":\\"openEditorResult\\",\\"requestId\\":" + Json.Quote(requestId)');
  });
});
