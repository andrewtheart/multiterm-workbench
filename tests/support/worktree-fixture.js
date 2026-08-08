const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

// A throwaway repo with a worktree that has real commits, so the review and
// merge flows have something genuine to work against.
const conflict = process.argv.includes("--conflict");
const sandbox = path.join(os.tmpdir(), conflict ? "mt-conflict-fixture" : "mt-review-fixture");
fs.rmSync(sandbox, { recursive: true, force: true });
fs.mkdirSync(sandbox, { recursive: true });

const repo = path.join(sandbox, "demo");
fs.mkdirSync(repo);
const git = (args, cwd = repo) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
git(["init", "-b", "main"]);
git(["config", "user.email", "probe@example.com"]);
git(["config", "user.name", "Probe"]);
fs.writeFileSync(path.join(repo, "greeting.txt"), "hello\nworld\n");
fs.writeFileSync(path.join(repo, "keep.txt"), "unchanged\n");
git(["add", "."]);
git(["commit", "-m", "first"]);

const worktreePath = path.join(sandbox, "demo.worktrees", "main-agent");
git(["worktree", "add", worktreePath, "-b", "main-agent"]);
git(["config", "--local", "multiterm.worktree.main-agent.parent", "main"]);
git(["config", "--local", "multiterm.worktree.main-agent.created", new Date().toISOString()]);

if (conflict) {
	fs.writeFileSync(path.join(repo, "greeting.txt"), "hello\nparent world\n");
	git(["add", "greeting.txt"], repo);
	git(["commit", "-m", "parent work"], repo);
	fs.writeFileSync(path.join(worktreePath, "greeting.txt"), "hello\nagent world\n");
	git(["add", "greeting.txt"], worktreePath);
	git(["commit", "-m", "agent work"], worktreePath);
} else {
	fs.writeFileSync(path.join(worktreePath, "greeting.txt"), "hello\nagent world\n");
	fs.writeFileSync(path.join(worktreePath, "added.txt"), "brand new\n");
	git(["add", "."], worktreePath);
	git(["commit", "-m", "agent work"], worktreePath);
}

console.log(JSON.stringify({ sandbox, repo, worktreePath }));
