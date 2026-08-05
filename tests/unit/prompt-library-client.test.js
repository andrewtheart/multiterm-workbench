/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  promptLibraryArchitecture,
  promptLibraryHostPath
} = require("../../lib/prompt-library-client");

describe("Prompt Library host resolution", () => {
  const configured = process.env.MULTITERM_PROMPT_LIBRARY_HOST;

  afterEach(() => {
    if (configured === undefined) delete process.env.MULTITERM_PROMPT_LIBRARY_HOST;
    else process.env.MULTITERM_PROMPT_LIBRARY_HOST = configured;
  });

  it.each([
    ["ia32", "x86"],
    ["x86", "x86"],
    ["x64", "x64"],
    ["arm64", "arm64"]
  ])("maps %s to the packaged %s host", (architecture, expected) => {
    expect(promptLibraryArchitecture(architecture)).toBe(expected);
  });

  it("selects the architecture-specific source build", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-host-resolution-"));
    const expected = path.join(root, "lib", "prompt-library-host", "publish", "x86", "MultiTerm.PromptLibraryHost.exe");
    try {
      delete process.env.MULTITERM_PROMPT_LIBRARY_HOST;
      fs.mkdirSync(path.dirname(expected), { recursive: true });
      fs.writeFileSync(expected, "test");
      expect(promptLibraryHostPath(root, "ia32")).toBe(expected);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});