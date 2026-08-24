/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const {
  flattenBranchName,
  isSafeBranchName,
  isSafeRepositoryUrl,
  isSafeWorktreeName,
  suggestWorktreeName
} = require("../../public/git-worktrees.js");

describe("git worktree input validation", () => {
  // These values reach a git command line, so the rejection list is the
  // security boundary rather than a convenience.
  it("accepts the repository URL shapes people actually paste", () => {
    expect(isSafeRepositoryUrl("https://dev.azure.com/org/project/_git/repo")).toBe(true);
    expect(isSafeRepositoryUrl("https://github.com/andrewtheart/multiterm-workbench.git")).toBe(true);
    expect(isSafeRepositoryUrl("git@ssh.dev.azure.com:v3/org/project/repo")).toBe(true);
    expect(isSafeRepositoryUrl("ssh://git@github.com/owner/repo.git")).toBe(true);
  });

  it("rejects URLs that could alter the git command", () => {
    // A leading dash is read as an option even through an argv array.
    expect(isSafeRepositoryUrl("--upload-pack=calc.exe")).toBe(false);
    expect(isSafeRepositoryUrl("https://host/repo.git; calc.exe")).toBe(false);
    expect(isSafeRepositoryUrl("https://host/repo.git && calc.exe")).toBe(false);
    expect(isSafeRepositoryUrl("https://host/repo.git`calc`")).toBe(false);
    expect(isSafeRepositoryUrl("https://host/repo.git\ncalc.exe")).toBe(false);
    expect(isSafeRepositoryUrl("https://host/repo.git | calc")).toBe(false);
    expect(isSafeRepositoryUrl("file:///C:/windows")).toBe(false);
    expect(isSafeRepositoryUrl("")).toBe(false);
    expect(isSafeRepositoryUrl(null)).toBe(false);
    expect(isSafeRepositoryUrl(`https://host/${"a".repeat(3000)}`)).toBe(false);
  });

  it("accepts real branch names and rejects git-illegal ones", () => {
    expect(isSafeBranchName("main")).toBe(true);
    expect(isSafeBranchName("feature/copilot-worktrees")).toBe(true);
    expect(isSafeBranchName("rel/1.2.x")).toBe(true);

    expect(isSafeBranchName("-delete-everything")).toBe(false);
    expect(isSafeBranchName("bad..name")).toBe(false);
    expect(isSafeBranchName("bad name")).toBe(false);
    expect(isSafeBranchName("bad~name")).toBe(false);
    expect(isSafeBranchName("bad^name")).toBe(false);
    expect(isSafeBranchName("bad:name")).toBe(false);
    expect(isSafeBranchName("trailing/")).toBe(false);
    expect(isSafeBranchName("thing.lock")).toBe(false);
    expect(isSafeBranchName("has@{ref}")).toBe(false);
    expect(isSafeBranchName("has//empty-segment")).toBe(false);
    expect(isSafeBranchName("has\u0000control")).toBe(false);
    expect(isSafeBranchName("")).toBe(false);
    expect(isSafeBranchName(null)).toBe(false);
  });

  it("keeps worktree names usable as a Windows folder", () => {
    expect(isSafeWorktreeName("main-0806")).toBe(true);
    expect(isSafeWorktreeName("rel-1.2.x-0806")).toBe(true);

    expect(isSafeWorktreeName("has/slash")).toBe(false);
    expect(isSafeWorktreeName("has\\slash")).toBe(false);
    expect(isSafeWorktreeName("..")).toBe(false);
    expect(isSafeWorktreeName("-leading")).toBe(false);
    expect(isSafeWorktreeName("trailing.")).toBe(false);
    expect(isSafeWorktreeName("trailing ")).toBe(false);
    expect(isSafeWorktreeName("CON")).toBe(false);
    expect(isSafeWorktreeName("lpt1.txt")).toBe(false);
    expect(isSafeWorktreeName("has..parent")).toBe(false);
    expect(isSafeWorktreeName("x".repeat(129))).toBe(false);
    expect(isSafeWorktreeName(null)).toBe(false);
  });

  it("flattens a branch path into one folder segment", () => {
    expect(flattenBranchName("feature/copilot/worktrees")).toBe("feature-copilot-worktrees");
    expect(flattenBranchName("rel/1.2.x")).toBe("rel-1.2.x");
    expect(flattenBranchName("//odd//")).toBe("odd");
    expect(flattenBranchName(null)).toBe("");
  });

  it("disambiguates several worktrees taken from one branch on one day", () => {
    const day = new Date(2026, 7, 6);
    expect(suggestWorktreeName("main", [], day)).toBe("main-0806");
    expect(suggestWorktreeName("main", ["main-0806"], day)).toBe("main-0806-2");
    expect(suggestWorktreeName("main", ["main-0806", "main-0806-2"], day)).toBe("main-0806-3");
    // Existing names may differ in case on Windows.
    expect(suggestWorktreeName("main", ["MAIN-0806"], day)).toBe("main-0806-2");
    expect(suggestWorktreeName("feature/x", [], day)).toBe("feature-x-0806");
    expect(suggestWorktreeName("main", null, day)).toBe("main-0806");
    expect(suggestWorktreeName("main", [], new Date("invalid"))).toMatch(/^main-\d{4}$/);
  });

  it("always produces a name that passes its own validation", () => {
    const day = new Date(2026, 7, 6);
    for (const branch of ["main", "feature/x", "rel/1.2.x", "--weird", "///"]) {
      expect(isSafeWorktreeName(suggestWorktreeName(branch, [], day))).toBe(true);
    }
  });
});
