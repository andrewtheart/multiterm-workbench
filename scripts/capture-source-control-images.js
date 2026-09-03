"use strict";

// Renders the README's source-control screenshots from the real UI. Each scene
// runs against a throwaway repository built here, so nothing from the user's
// working tree can appear in a published image.

const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const { chromium } = require("@playwright/test");

const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "docs", "images");
// Published screenshots show these paths, so keep them off the user profile.
const sandbox = path.join(path.parse(repoRoot).root, "mt-doc-images");
const VIEWPORT = { width: 1600, height: 1000 };

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(["init", "-b", "main"], dir);
  git(["config", "user.email", "dev@example.com"], dir);
  git(["config", "user.name", "Sam Rivera"], dir);
  git(["config", "commit.gpgsign", "false"], dir);
}

function write(dir, relative, contents) {
  const target = path.join(dir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

// A small, obviously-fictional service so every diff reads as real work.
function buildReviewRepo() {
  const repo = path.join(sandbox, "checkout-service");
  initRepo(repo);
  write(repo, "src/routes/orders.js", [
    "import { Router } from \"express\";",
    "import { orders } from \"../db/orders.js\";",
    "",
    "export const router = Router();",
    "",
    "router.get(\"/orders/:id\", async (request, response) => {",
    "  const order = await orders.find(request.params.id);",
    "  if (!order) return response.status(404).json({ error: \"not found\" });",
    "  return response.json(order);",
    "});",
    ""
  ].join("\n"));
  write(repo, "src/server.js", [
    "import express from \"express\";",
    "import { router } from \"./routes/orders.js\";",
    "",
    "const app = express();",
    "app.use(express.json());",
    "app.use(router);",
    "",
    "app.listen(process.env.PORT ?? 8080);",
    ""
  ].join("\n"));
  write(repo, "package.json", [
    "{",
    "  \"name\": \"checkout-service\",",
    "  \"version\": \"2.4.0\",",
    "  \"type\": \"module\",",
    "  \"dependencies\": {",
    "    \"express\": \"^4.19.2\"",
    "  }",
    "}",
    ""
  ].join("\n"));
  write(repo, "README.md", "# checkout-service\n\nOrder lookup and refund API.\n");
  git(["add", "."], repo);
  git(["commit", "-m", "Add order lookup route"], repo);

  // Staged: a reviewed edit plus a brand new route.
  write(repo, "src/routes/orders.js", [
    "import { Router } from \"express\";",
    "import { orders } from \"../db/orders.js\";",
    "import { requireApiKey } from \"../auth/api-key.js\";",
    "",
    "export const router = Router();",
    "",
    "router.get(\"/orders/:id\", requireApiKey, async (request, response) => {",
    "  const order = await orders.find(request.params.id);",
    "  if (!order) return response.status(404).json({ error: \"not found\" });",
    "  return response.json(order);",
    "});",
    "",
    "router.get(\"/orders\", requireApiKey, async (request, response) => {",
    "  const page = Number(request.query.page ?? 1);",
    "  return response.json(await orders.page(page, 50));",
    "});",
    ""
  ].join("\n"));
  write(repo, "src/auth/api-key.js", [
    "const keys = new Set((process.env.API_KEYS ?? \"\").split(\",\").filter(Boolean));",
    "",
    "export function requireApiKey(request, response, next) {",
    "  if (!keys.has(request.get(\"x-api-key\"))) return response.status(401).end();",
    "  return next();",
    "}",
    ""
  ].join("\n"));
  git(["add", "src/routes/orders.js", "src/auth/api-key.js"], repo);

  // Unstaged: still-in-progress work on top.
  write(repo, "src/server.js", [
    "import express from \"express\";",
    "import { router } from \"./routes/orders.js\";",
    "",
    "const app = express();",
    "app.use(express.json());",
    "app.use(router);",
    "",
    "app.get(\"/health\", (request, response) => response.json({ ok: true }));",
    "",
    "app.listen(process.env.PORT ?? 8080);",
    ""
  ].join("\n"));
  write(repo, "package.json", [
    "{",
    "  \"name\": \"checkout-service\",",
    "  \"version\": \"2.5.0\",",
    "  \"type\": \"module\",",
    "  \"dependencies\": {",
    "    \"express\": \"^4.19.2\",",
    "    \"pino\": \"^9.2.0\"",
    "  }",
    "}",
    ""
  ].join("\n"));
  // Untracked, but inside an already tracked folder so git names the file
  // itself rather than collapsing it to a directory entry.
  write(repo, "src/routes/refunds.js", [
    "import { Router } from \"express\";",
    "",
    "export const refunds = Router();",
    ""
  ].join("\n"));
  return repo;
}

function buildWorktreeRepo() {
  const root = path.join(sandbox, "platform");
  const repo = path.join(root, "main");
  initRepo(repo);
  write(repo, "src/index.ts", "export const version = \"1.0.0\";\n");
  git(["add", "."], repo);
  git(["commit", "-m", "Initial commit"], repo);

  const worktrees = [
    { name: "retry-backoff", note: "Add retry backoff to the queue consumer\n" },
    { name: "search-indexing", note: "Rebuild the search index nightly\n" },
    { name: "flaky-upload-test", note: "Stabilise the upload integration test\n" }
  ];
  for (const item of worktrees) {
    const target = path.join(root, "worktrees", item.name);
    git(["worktree", "add", target, "-b", item.name], repo);
    git(["config", "--local", `multiterm.worktree.${item.name}.parent`, "main"], repo);
    git(["config", "--local", `multiterm.worktree.${item.name}.created`, new Date().toISOString()], repo);
    write(target, "NOTES.md", item.note);
    git(["add", "."], target);
    git(["commit", "-m", item.note.trim()], target);
  }
  return { repo, worktreePath: path.join(root, "worktrees", "retry-backoff") };
}

function buildConflictRepo() {
  const root = path.join(sandbox, "billing");
  const repo = path.join(root, "main");
  initRepo(repo);
  const base = [
    "export const config = {",
    "  region: \"eu-west-1\",",
    "  retries: 3,",
    "  timeoutMs: 5000,",
    "  currency: \"EUR\",",
    "  featureFlags: {",
    "    invoicePdf: false",
    "  }",
    "};",
    ""
  ].join("\n");
  write(repo, "src/config.js", base);
  write(repo, "src/invoice.js", "export function total(lines) {\n  return lines.reduce((sum, line) => sum + line.amount, 0);\n}\n");
  git(["add", "."], repo);
  git(["commit", "-m", "Add billing config"], repo);

  const branch = "invoice-pdf";
  const worktreePath = path.join(root, "worktrees", branch);
  git(["worktree", "add", worktreePath, "-b", branch], repo);
  git(["config", "--local", `multiterm.worktree.${branch}.parent`, "main"], repo);
  git(["config", "--local", `multiterm.worktree.${branch}.created`, new Date().toISOString()], repo);

  write(repo, "src/config.js", base
    .replace("  retries: 3,", "  retries: 5,")
    .replace("    invoicePdf: false", "    invoicePdf: false,\n    dunningEmails: true"));
  write(repo, "src/invoice.js", "export function total(lines) {\n  return lines.reduce((sum, line) => sum + line.amount, 0);\n}\n\nexport function tax(lines) {\n  return total(lines) * 0.2;\n}\n");
  git(["add", "."], repo);
  git(["commit", "-m", "Raise retries and enable dunning emails"], repo);

  write(worktreePath, "src/config.js", base
    .replace("  retries: 3,", "  retries: 8,")
    .replace("    invoicePdf: false", "    invoicePdf: true"));
  write(worktreePath, "src/invoice.js", "export function total(lines) {\n  return lines.reduce((sum, line) => sum + line.amount, 0);\n}\n\nexport function pdf(lines) {\n  return render(total(lines));\n}\n");
  git(["add", "."], worktreePath);
  git(["commit", "-m", "Turn on invoice PDFs"], worktreePath);
  return { repo, worktreePath, branch };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url, child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Bridge exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok && (await response.json()).app === "MultiTerm Workbench") return;
    } catch {
      // The listener is not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Bridge never became healthy at ${url}.`);
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function shoot(page, name) {
  const file = path.join(outputDir, name);
  await page.screenshot({ path: file });
  const { size } = fs.statSync(file);
  console.log(`  wrote ${name} (${Math.round(size / 1024)} KB)`);
}

async function prepareStage(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const settings = page.getByRole("button", { name: "Save and continue" });
  if (await settings.isVisible().catch(() => false)) await settings.click();
  await page.locator("#statusConn").filter({ hasText: "Connected" }).waitFor({ timeout: 30000 });
  await page.evaluate(() => {
    closeAllTerminals();
    state.settings.shellIntegration = false;
    state.settings.sidecarHidden = true;
    applySettings();
  });
}

async function seedTerminal(page, cwd, prompt) {
  const id = await page.evaluate((folder) => addTerminal({ runStartup: false, cwd: folder }).id, cwd);
  await page.evaluate(async ({ terminalId }) => {
    await refreshTerminalGitInspection(state.terminals.get(terminalId));
  }, { terminalId: id });
  // The real shell prints its own prompt asynchronously, so let that land and
  // then overwrite the screen; otherwise a long path bleeds through the dialog.
  await page.waitForTimeout(1200);
  await page.evaluate(async ({ terminalId, line }) => {
    const terminal = state.terminals.get(terminalId);
    await new Promise((resolve) => terminal.term.write(`\u001b[2J\u001b[H${line}`, resolve));
  }, { terminalId: id, line: prompt });
  return id;
}

async function captureReviewChanges(page, url, repo) {
  await prepareStage(page, url);
  const id = await seedTerminal(page, repo,
    "\u001b[38;5;114mPS \u001b[38;5;81mcheckout-service\u001b[0m [git main] > ");
  await page.locator(`.terminal-pane[data-id="${id}"] button[data-action="git-changes"]`).click();
  await page.locator("#worktreeReviewOverlay").waitFor({ state: "visible", timeout: 30000 });
  // The modified route shows additions and removals together; an added file
  // would render as one solid block of green.
  const modified = page.locator("#gitReviewStagedList .git-review-file", { hasText: "orders.js" });
  await modified.waitFor({ timeout: 30000 });
  await modified.click();
  await page.locator("#worktreeReviewDiff .d2h-file-wrapper").first().waitFor({ timeout: 30000 });
  await page.fill("#gitReviewCommitMessage", "Require an API key on the orders routes");
  await settle(page);
  await shoot(page, "git-review-changes.png");
}

async function captureWorktreeManager(page, url, repo) {
  await prepareStage(page, url);
  await seedTerminal(page, repo, "\u001b[38;5;114mPS \u001b[38;5;81mplatform\u001b[0m [git main] > git worktree list\r\n");
  await page.evaluate((cwd) => openWorktreeManager({ cwd }), repo);
  await page.locator("#worktreeManagerOverlay").waitFor({ state: "visible", timeout: 30000 });
  await page.locator("#worktreeManagerList .worktree-row").first().waitFor({ timeout: 30000 });
  await settle(page);
  await shoot(page, "git-worktree-manager.png");
}

async function captureWorktreeLaunch(page, url, repo) {
  await prepareStage(page, url);
  await seedTerminal(page, repo, "\u001b[38;5;114mPS \u001b[38;5;81mplatform\u001b[0m [git main] > ");
  await page.evaluate(() => openWorktreeDialog({}));
  await page.locator("#worktreeOverlay").waitFor({ state: "visible", timeout: 30000 });
  await page.fill("#worktreeFolderInput", repo);
  await page.dispatchEvent("#worktreeFolderInput", "change");
  await page.locator("#worktreeParentBranch").filter({ hasText: /\S/ }).waitFor({ timeout: 30000 });
  // The inspection also fills the suggested name, and it lands after the branch.
  await page.waitForFunction(() => {
    const status = document.querySelector("#worktreeStatus")?.textContent || "";
    return document.querySelector("#worktreeNameInput")?.value && !/checking/i.test(status);
  }, null, { timeout: 30000 });
  await settle(page);
  await shoot(page, "git-worktree-launch.png");
}

async function captureConflictResolver(page, url, fixture) {
  await prepareStage(page, url);
  await seedTerminal(page, fixture.worktreePath,
    "\u001b[38;5;114mPS \u001b[38;5;81minvoice-pdf\u001b[0m > ");
  await page.evaluate((data) => openWorktreeMerge({
    path: data.worktreePath,
    branch: data.branch,
    parentBranch: "main",
    repositoryRoot: data.repo,
    createdByMultiTerm: true
  }, { repositoryRoot: data.repo }), fixture);
  await page.locator("#worktreeMergeOverlay").waitFor({ state: "visible", timeout: 30000 });
  await page.check('input[name="worktreeMergeMode"][value="merge"]');
  await page.click("#worktreeMergeConfirm");
  await page.locator("#worktreeConflictOverlay").waitFor({ state: "visible", timeout: 60000 });
  await page.locator("#worktreeConflictResult").waitFor({ timeout: 30000 });
  await settle(page);
  await shoot(page, "git-conflict-resolver.png");
}

async function main() {
  fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(sandbox, { recursive: true });
  console.log("==> building demo repositories");
  const reviewRepo = buildReviewRepo();
  const worktrees = buildWorktreeRepo();
  const conflict = buildConflictRepo();

  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  console.log(`==> starting bridge on ${port}`);
  const child = spawn(process.execPath, [path.join(repoRoot, "src", "server.js")], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const bridgeLog = [];
  child.stdout.on("data", (chunk) => bridgeLog.push(String(chunk)));
  child.stderr.on("data", (chunk) => bridgeLog.push(String(chunk)));

  let browser = null;
  let cleanSandbox = false;
  try {
    await waitForHealth(url, child);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: "dark"
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => console.error(`  page error: ${error?.message || error}`));

    console.log("==> capturing scenes");
    await captureReviewChanges(page, url, reviewRepo);
    await captureWorktreeManager(page, url, worktrees.repo);
    await captureWorktreeLaunch(page, url, worktrees.repo);
    await captureConflictResolver(page, url, conflict);
    await page.evaluate(() => closeAllTerminals());
    cleanSandbox = true;
  } catch (error) {
    console.error(bridgeLog.join(""));
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    // Only the child this script started is ever stopped.
    if (child.exitCode === null) child.kill();
    // A failed run keeps the repositories so the scene can be inspected.
    if (cleanSandbox) fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  console.log("==> done");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
