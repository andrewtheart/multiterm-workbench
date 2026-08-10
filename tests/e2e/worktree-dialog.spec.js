const { test, expect } = require("../support/renderer-coverage");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

// The dialog decides where a real worktree lands and what git command runs, so
// the checks here are about the resolved path and the guard rails, not styling.
test.describe("Run in a worktree dialog", () => {
  const open = async (page) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => {
      closeAllTerminals();
      addTerminal({ reveal: true });
    });
    await expect.poll(() => page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      return terminal ? terminal.status : "none";
    }), { timeout: 30000 }).toBe("live");
    await page.evaluate(() => openWorktreeDialog({ terminalId: [...state.terminals.keys()][0] }));
    await expect(page.locator("#worktreeOverlay")).toBeVisible();
  };

  test("inspects a real repository and suggests a name from its branch", async ({ page }) => {
    await open(page);
    await page.locator("#worktreeFolderInput").fill("D:\\multiTerm");
    await expect(page.locator("#worktreeParentBranch")).toHaveText("main");
    await expect(page.locator("#worktreeStatus")).toHaveAttribute("data-tone", "ready");
    await expect(page.locator("#worktreeNameInput")).toHaveValue(/^main-\d{4}(-\d+)?$/);
    // The repository already keeps worktrees in <repo>.worktrees.
    await expect(page.locator("#worktreePathPreview")).toHaveText(/^D:\\multiTerm\.worktrees\\main-\d{4}/);
    await expect(page.locator("#worktreeCreate")).toBeEnabled();
  });

  // Clicking dialog chrome moves focus off the inputs; without a focusable card
  // the keydown handler never sees Escape.
  test("still closes on Escape after clicking non-interactive dialog chrome", async ({ page }) => {
    await open(page);
    await page.locator("#worktreeTitle").click();
    await expect.poll(() => page.evaluate(() => document.activeElement?.className || "")).toContain("worktree-dialog");
    await page.keyboard.press("Escape");
    await expect(page.locator("#worktreeOverlay")).toBeHidden();

    await page.evaluate(() => openWorktreeManager({ cwd: "" }));
    await expect(page.locator("#worktreeManagerOverlay")).toBeVisible();
    await page.locator("#worktreeManagerTitle").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#worktreeManagerOverlay")).toBeHidden();
  });

  test("refuses a folder that is not a git repository and offers to run there", async ({ page }) => {
    await open(page);
    await page.locator("#worktreeFolderInput").fill("C:\\Windows");
    await expect(page.locator("#worktreeStatus")).toContainText("not inside a git repository");
    await expect(page.locator("#worktreeStatus")).toHaveAttribute("data-tone", "error");
    await expect(page.locator("#worktreeCreate")).toBeDisabled();
    await expect(page.locator("#worktreeRunHere")).toBeVisible();
  });

  test("rejects a repository URL that could alter the git command", async ({ page }) => {
    await open(page);
    await page.locator(".worktree-source-tab[data-worktree-source='url']").click();
    await expect(page.locator("#worktreeUrlInput")).toBeVisible();

    await page.locator("#worktreeUrlInput").fill("--upload-pack=calc.exe");
    await expect(page.locator("#worktreeStatus")).toContainText("not accepted");
    await expect(page.locator("#worktreeCreate")).toBeDisabled();

    await page.locator("#worktreeUrlInput").fill("https://host/repo.git; calc.exe");
    await expect(page.locator("#worktreeCreate")).toBeDisabled();
  });

  test("needs a shared location before a URL clone can run", async ({ page }) => {
    await open(page);
    await page.locator(".worktree-source-tab[data-worktree-source='url']").click();
    await page.locator("#worktreeUrlInput").fill("https://dev.azure.com/org/project/_git/repo");
    await page.locator("#worktreeSharedRootInput").fill("");
    await expect(page.locator("#worktreeStatus")).toContainText("shared clone location");
    await expect(page.locator("#worktreeCreate")).toBeDisabled();

    await page.locator("#worktreeSharedRootInput").fill("D:\\shared-clones");
    await page.locator("#worktreeBranchInput").fill("main");
    await expect(page.locator("#worktreeCreate")).toBeEnabled();
    await expect(page.locator("#worktreePathPreview")).toHaveText(/^D:\\shared-clones\\worktrees\\main-\d{4}/);

    await page.locator("#worktreePlacement").selectOption("sibling");
    await expect(page.locator("#worktreePathPreview")).toHaveText(/^D:\\shared-clones\\repo\.worktrees\\main-\d{4}/);
  });

  test("builds a command that only runs the assistant when the worktree exists", async ({ page }) => {
    await open(page);
    await page.locator("#worktreeFolderInput").fill("D:\\multiTerm");
    await expect(page.locator("#worktreeCreate")).toBeEnabled();

    const command = await page.evaluate(() => buildWorktreeCommand({
      source: "folder",
      repositoryRoot: "D:\\multiTerm",
      url: "",
      branch: "main",
      sharedRoot: "",
      parentDirectory: "D:\\multiTerm.worktrees",
      worktreePath: "D:\\multiTerm.worktrees\\main-0806",
      name: "main-0806",
      assistantCommand: "copilot --yolo"
    }));
    expect(command).toContain("worktree add -b 'main-0806'");
    expect(command).toContain("multiterm.worktree.main-0806.parent");
    // A failed add must not leave the assistant running in the old directory.
    expect(command).toMatch(/if \(Test-Path -LiteralPath 'D:\\multiTerm\.worktrees\\main-0806'\) \{[^}]*copilot --yolo/);
    expect(command).toContain("MultiTerm: the worktree was not created.");
  });

  test("imports dirty parent files by default without changing the parent checkout", async ({ page }) => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "mt-create-ui-"));
    const repo = path.join(sandbox, "repo");
    fs.mkdirSync(repo);
    const git = (args, cwd = repo) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    git(["init", "-b", "main"]);
    git(["config", "user.email", "probe@example.com"]);
    git(["config", "user.name", "Probe"]);
    fs.writeFileSync(path.join(repo, "tracked.txt"), "base\n");
    git(["add", "."]);
    git(["commit", "-m", "base"]);
    fs.writeFileSync(path.join(repo, "tracked.txt"), "pending\n");
    fs.writeFileSync(path.join(repo, "untracked.txt"), "new\n");
    const parentStatus = git(["status", "--porcelain=v1", "--untracked-files=all"]);
    const worktree = `${repo}.worktrees\\agent-ui`;

    try {
      await open(page);
      await page.evaluate(() => { buildAiAssistantCommand = () => "Write-Output 'assistant-stub'"; });
      await page.locator("#worktreeFolderInput").fill(repo);
      await expect(page.locator("#worktreeImportRow")).toBeVisible();
      await expect(page.locator("#worktreeImportPending")).toBeChecked();
      await expect(page.locator("#worktreeStatus")).toContainText("with its pending changes");
      await page.locator("#worktreeNameInput").fill("agent-ui");
      await page.locator("#worktreeCreate").click();
      await expect(page.locator("#worktreeOverlay")).toBeHidden({ timeout: 30000 });

      expect(git(["status", "--porcelain=v1", "--untracked-files=all"])).toBe(parentStatus);
      expect(fs.readFileSync(path.join(worktree, "tracked.txt"), "utf8").replace(/\r\n/g, "\n")).toBe("pending\n");
      expect(fs.readFileSync(path.join(worktree, "untracked.txt"), "utf8").replace(/\r\n/g, "\n")).toBe("new\n");
    } finally {
      try { git(["worktree", "remove", "--force", worktree]); } catch { }
      fs.rmSync(sandbox, { recursive: true, force: true });
      fs.rmSync(`${repo}.worktrees`, { recursive: true, force: true });
    }
  });

  test("rejects a worktree name that is not a usable folder", async ({ page }) => {
    await open(page);
    await page.locator("#worktreeFolderInput").fill("D:\\multiTerm");
    await expect(page.locator("#worktreeCreate")).toBeEnabled();
    await page.locator("#worktreeNameInput").fill("bad/name");
    await expect(page.locator("#worktreeStatus")).toContainText("cannot be used as a folder");
    await expect(page.locator("#worktreeCreate")).toBeDisabled();
  });

  test("mints session ids only for Copilot worktree launches", async ({ page }) => {
    await open(page);
    await page.locator("#worktreeFolderInput").fill("D:\\multiTerm");
    await expect(page.locator("#worktreeCreate")).toBeEnabled();

    const folderClaude = await page.evaluate(async () => {
      const originalRequest = window.requestBridge;
      const originalSend = window.sendBridge;
      window.__worktreeFrames = [];
      window.requestBridge = async () => ({ ok: true, importedPending: false });
      window.sendBridge = (message) => { window.__worktreeFrames.push(message); return true; };
      state.settings.aiSessionProvider = "claude";
      await createWorktreeAndRun();
      const terminal = [...state.terminals.values()][0];
      const result = { id: terminal.aiSessionId, frames: window.__worktreeFrames };
      window.requestBridge = originalRequest;
      window.sendBridge = originalSend;
      return result;
    });
    expect(folderClaude.id).toBe("");
    expect(folderClaude.frames.some((frame) => String(frame.data || "").includes("claude"))).toBe(true);

    await page.evaluate(() => openWorktreeDialog({ terminalId: [...state.terminals.keys()][0] }));
    const urlCopilot = await page.evaluate(async () => {
      const originalSend = window.sendBridge;
      window.__worktreeFrames = [];
      window.sendBridge = (message) => { window.__worktreeFrames.push(message); return true; };
      worktreeDialog.source = "url";
      worktreeDialog.openInNewTerminal = false;
      elements.worktreeUrlInput.value = "https://example.com/org/repo.git";
      elements.worktreeSharedRootInput.value = "D:\\shared";
      elements.worktreeBranchInput.value = "main";
      elements.worktreePlacement.value = "shared";
      elements.worktreeNameInput.value = "agent-test";
      state.settings.aiSessionProvider = "copilot";
      await createWorktreeAndRun();
      const terminal = [...state.terminals.values()][0];
      const result = { id: terminal.aiSessionId, frames: window.__worktreeFrames };
      window.sendBridge = originalSend;
      return result;
    });
    expect(urlCopilot.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(urlCopilot.frames.some((frame) => String(frame.data || "").includes(`--session-id=${urlCopilot.id}`))).toBe(true);

    await page.evaluate(() => openWorktreeDialog({ terminalId: [...state.terminals.keys()][0] }));
    const urlClaude = await page.evaluate(async () => {
      const originalSend = window.sendBridge;
      window.__worktreeFrames = [];
      window.sendBridge = (message) => { window.__worktreeFrames.push(message); return true; };
      worktreeDialog.source = "url";
      worktreeDialog.openInNewTerminal = false;
      elements.worktreeUrlInput.value = "https://example.com/org/repo.git";
      elements.worktreeSharedRootInput.value = "D:\\shared";
      elements.worktreeBranchInput.value = "main";
      elements.worktreePlacement.value = "shared";
      elements.worktreeNameInput.value = "agent-claude";
      state.settings.aiSessionProvider = "claude";
      const terminal = [...state.terminals.values()][0];
      terminal.aiSessionId = "";
      await createWorktreeAndRun();
      const result = { id: terminal.aiSessionId, frames: window.__worktreeFrames };
      window.sendBridge = originalSend;
      return result;
    });
    expect(urlClaude.id).toBe("");
    expect(urlClaude.frames.some((frame) => String(frame.data || "").includes("claude"))).toBe(true);
  });
});
