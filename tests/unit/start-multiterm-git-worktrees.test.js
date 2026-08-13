const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "../../Start-MultiTerm.ps1"), "utf8");

function runGitSource() {
  const start = source.indexOf("private static GitResult RunGit(");
  const end = source.indexOf("private static string GitInspectionJson(", start);
  if (start < 0 || end < 0) throw new Error("Could not locate the installed bridge Git runner.");
  return source.slice(start, end);
}

describe("installed bridge Git worktree execution", () => {
  test("drains both streams asynchronously before enforcing the process timeout", () => {
    const runner = runGitSource();
    const outputDrain = runner.indexOf("process.StandardOutput.ReadToEndAsync()");
    const errorDrain = runner.indexOf("process.StandardError.ReadToEndAsync()");
    const timeoutWait = runner.indexOf("process.WaitForExit(timeoutMilliseconds)");

    expect(outputDrain).toBeGreaterThan(-1);
    expect(errorDrain).toBeGreaterThan(-1);
    expect(timeoutWait).toBeGreaterThan(outputDrain);
    expect(timeoutWait).toBeGreaterThan(errorDrain);
    expect(runner).not.toMatch(/\.ReadToEnd\(\)/);
    expect(runner).toContain("result.TimedOut = true");
    expect(runner).toContain("process.Kill()");
  });

  test("records timeout, exit code, and duration as separate result fields", () => {
    expect(source).toContain("public bool TimedOut;");
    expect(source).toContain("public int ExitCode = -1;");
    expect(source).toContain("public long DurationMilliseconds;");

    const runner = runGitSource();
    expect(runner).toContain("result.ExitCode = process.ExitCode");
    expect(runner).toContain("result.DurationMilliseconds = stopwatch.ElapsedMilliseconds");
    expect(runner).toContain('result.StandardError += "git did not finish in time."');
  });

  test("streams correlated progress for worktree creation and merge stages", () => {
    expect(source).toContain('"{\\"type\\":\\"operationProgress\\",\\"requestId\\":"');
    expect(source).toContain('"gitWorktreeCreate", "snapshotting"');
    expect(source).toContain('"gitWorktreeCreate", "creating"');
    expect(source).toContain('"gitMergeStart", "merging"');
    expect(source).toContain('"gitMergeStart", "checking-conflicts"');
    expect(source).toContain('"gitMergeFinish", "protecting-parent"');
    expect(source).toContain('"gitMergeFinish", "verifying-result"');
    expect(source).toContain("stopwatch.ElapsedMilliseconds.ToString()");
  });

  test("reviews committed and pending worktree content through an isolated index", () => {
    expect(source).toContain("private static GitResult WorktreeDiffIncludingPending(");
    expect(source).toContain('"GIT_INDEX_FILE", temporaryIndex');
    expect(source).toContain('"ls-files", "--others", "--exclude-standard", "-z"');
    expect(source).toContain('"add", "--intent-to-add", "--"');
    expect(source).toContain('"--ita-visible-in-index"');
    expect(source).toContain("Directory.Delete(temporaryDirectory, true)");
    expect(source).toContain('Json.Get(message, "worktreePath")');
    expect(source).toMatch(/worktreePath\.Length > 0\s*\? WorktreeDiffIncludingPending/);
  });
});
