const detector = require("../../public/input-detection.js");

const { looksLikeInputPrompt, isShellPrompt, stripAnsi, classifyInputPrompt } = detector;

describe("input-detection: module surface", () => {
  it("exports the expected public helpers", () => {
    expect(typeof looksLikeInputPrompt).toBe("function");
    expect(typeof isShellPrompt).toBe("function");
    expect(typeof stripAnsi).toBe("function");
    expect(typeof classifyInputPrompt).toBe("function");
    expect(Array.isArray(detector.PROMPT_PATTERNS)).toBe(true);
  });
});

describe("input-detection: stripAnsi", () => {
  it("removes SGR colour codes", () => {
    expect(stripAnsi("\u001b[32mContinue?\u001b[0m")).toBe("Continue?");
  });

  it("removes OSC hyperlink / title sequences", () => {
    expect(stripAnsi("\u001b]0;my title\u0007Password:")).toBe("Password:");
  });

  it("tolerates null / undefined", () => {
    expect(stripAnsi(null)).toBe("");
    expect(stripAnsi(undefined)).toBe("");
  });
});

describe("input-detection: positive prompts (should flag)", () => {
  const positives = [
    // yes / no confirmations
    "Do you want to continue? [Y/n]",
    "Overwrite existing file? [y/N]",
    "Proceed with installation? (yes/no)",
    "Delete all containers? (y/n)",
    "Are you sure you want to remove it?",
    "Continue? y/n",
    "Would you like to update now?",
    "OK to proceed? ",
    "Type 'yes' to confirm:",
    // git add -p style hunk menu
    "Stage this hunk [y,n,q,a,d,e,?]?",
    // apt
    "Do you want to continue? [Y/n] ",
    // passwords / secrets
    "Password:",
    "[sudo] password for andrew:",
    "Enter passphrase for key '/home/me/.ssh/id_rsa':",
    "Enter your new password:",
    "PIN:",
    "Enter the verification code:",
    "Username for 'https://github.com':",
    "Password for 'https://andrew@github.com':",
    // ssh host key
    "Are you sure you want to continue connecting (yes/no/[fingerprint])?",
    "The authenticity of host 'example.com' can't be established.",
    // press key / pagers
    "Press any key to continue . . .",
    "Press ENTER to continue",
    "Hit enter to proceed",
    "-- More --",
    "(END)",
    "Press q to quit",
    // selection / menu
    "Select an option:",
    "Please choose a template:",
    "Enter your choice: ",
    "Enter a number between 1 and 5:",
    "? What is your project name?",
    "\u001b[36m?\u001b[0m Pick a package manager",
    "❯ Use arrow keys",
    "[1-5]:",
    // generic value entry
    "Enter the project name:",
    "Please enter your email address",
    "Hostname:",
    "package name: (multiterm)",
    "version: (1.0.0)",
    // explicit waiting
    "Waiting for input...",
    "Input required",
    "This action requires confirmation",
    // low-confidence trailing punctuation (not a shell prompt)
    "What now:",
    "Ready to launch?"
  ];

  for (const line of positives) {
    it(`flags: ${JSON.stringify(line)}`, () => {
      expect(looksLikeInputPrompt(line)).toBe(true);
    });
  }
});

describe("input-detection: negative cases (should NOT flag)", () => {
  const negatives = [
    "",
    "   ",
    // idle shells
    "PS C:\\Users\\andrew>",
    "PS C:\\Users\\andrew> ",
    "C:\\Users\\andrew>",
    "andrew@laptop:~/projects$",
    "andrew@laptop:~/projects$ ",
    "root@server:/var/log#",
    "~/code/multiterm %",
    "➜  multiterm git:(main)",
    "$",
    "#",
    // ordinary output
    "Building project...",
    "Compiled successfully in 1.2s",
    "Installed 42 packages",
    "hello world",
    "3 files changed, 10 insertions(+)",
    // trailing colon/qmark that are informational, not prompts
    "Note:",
    "Warning:",
    "ERROR:",
    "Options:",
    "See https://example.com/docs",
    "Elapsed: 00:12:30",
    "Time: 10:30",
    "Visit http://localhost:3000"
  ];

  for (const line of negatives) {
    it(`ignores: ${JSON.stringify(line)}`, () => {
      expect(looksLikeInputPrompt(line)).toBe(false);
    });
  }
});

describe("input-detection: ANSI-wrapped prompts still flag", () => {
  it("detects a coloured confirmation prompt", () => {
    expect(looksLikeInputPrompt("\u001b[33mAre you sure? [y/N]\u001b[0m ")).toBe(true);
  });

  it("detects a coloured password prompt with a window-title OSC", () => {
    expect(looksLikeInputPrompt("\u001b]0;sudo\u0007\u001b[1m[sudo] password for me:\u001b[0m")).toBe(true);
  });
});

describe("input-detection: caret context gates weak matches only", () => {
  it("suppresses a low-confidence colon prompt when the caret is mid-line", () => {
    expect(looksLikeInputPrompt("What now:", { cursorAtLineEnd: false })).toBe(false);
    expect(looksLikeInputPrompt("What now:", { cursorAtLineEnd: true })).toBe(true);
  });

  it("still flags a high-confidence prompt even when the caret is mid-line", () => {
    expect(looksLikeInputPrompt("Continue? [y/N]", { cursorAtLineEnd: false })).toBe(true);
  });
});

describe("input-detection: classifyInputPrompt categories", () => {
  const cases = [
    ["Continue? [y/N]", "confirm"],
    ["Password:", "password"],
    ["Are you sure you want to continue connecting (yes/no)?", "ssh"],
    ["Press any key to continue", "press"],
    ["Select an option:", "select"],
    ["Enter the project name:", "value"],
    ["Waiting for input...", "waiting"],
    ["Ready?", "generic"]
  ];

  for (const [line, category] of cases) {
    it(`classifies ${JSON.stringify(line)} as ${category}`, () => {
      const result = classifyInputPrompt(line);
      expect(result).not.toBeNull();
      expect(result.category).toBe(category);
    });
  }

  it("returns null for a plain shell prompt", () => {
    expect(classifyInputPrompt("PS C:\\Users\\me>")).toBeNull();
  });
});

describe("input-detection: isShellPrompt", () => {
  it("treats empty input as an (idle) shell", () => {
    expect(isShellPrompt("")).toBe(true);
  });

  it("recognises common shells", () => {
    expect(isShellPrompt("PS C:\\Users\\me>")).toBe(true);
    expect(isShellPrompt("C:\\Windows\\System32>")).toBe(true);
    expect(isShellPrompt("me@host:~$")).toBe(true);
    expect(isShellPrompt("root@host:/#")).toBe(true);
  });

  it("does not treat a question as a shell prompt", () => {
    expect(isShellPrompt("Continue? [y/N]")).toBe(false);
    expect(isShellPrompt("Password:")).toBe(false);
  });
});
