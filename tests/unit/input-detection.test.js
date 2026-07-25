const detector = require("../../public/input-detection.js");

const {
  looksLikeInputPrompt,
  isShellPrompt,
  stripAnsi,
  classifyInputPrompt,
  looksLikeInputPromptBlock,
  classifyInputPromptBlock
} = detector;

describe("input-detection: module surface", () => {
  it("exports the expected public helpers", () => {
    expect(typeof looksLikeInputPrompt).toBe("function");
    expect(typeof isShellPrompt).toBe("function");
    expect(typeof stripAnsi).toBe("function");
    expect(typeof classifyInputPrompt).toBe("function");
    expect(typeof looksLikeInputPromptBlock).toBe("function");
    expect(typeof classifyInputPromptBlock).toBe("function");
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
    // interactive "Question" headers (single line)
    "Question",
    "Question:",
    "Questions?",
    "Question 1:",
    "Question 2 of 5:",
    "Q:",
    "Please answer the following questions:",
    "How would you like to proceed?",
    "What is your name?",
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

describe("input-detection: classifyInputPrompt — question headers", () => {
  const cases = [
    ["Question", "question"],
    ["Question:", "question"],
    ["Questions?", "question"],
    ["Question 3:", "question"],
    ["Question 2 of 5:", "question"],
    ["Q:", "question"],
    ["How would you like to install it?", "confirm"],
    ["What is your project name?", "question"]
  ];
  for (const [line, category] of cases) {
    it(`classifies ${JSON.stringify(line)} as ${category}`, () => {
      const result = classifyInputPrompt(line);
      expect(result).not.toBeNull();
      expect(result.category).toBe(category);
      expect(result.confidence).toBe("high");
    });
  }

  it("does not treat 'A:' (an answer label) as a question header", () => {
    // (It may still weak-match the generic colon rule, but never as a question.)
    const result = classifyInputPrompt("A:");
    if (result) expect(result.category).not.toBe("question");
  });
});

describe("input-detection: classifyInputPromptBlock — multi-line questions", () => {
  const positives = [
    [
      "Question header followed by a numbered list",
      ["Question", "", "1. Proceed with X?", "2. Also do Y?", "3. Skip both"],
      "question"
    ],
    [
      "Question: header + list with a blank caret line trailing",
      ["Question:", "1. PostgreSQL (Recommended)", "2. MySQL", "3. SQLite", ""],
      "question"
    ],
    [
      "Question header + a single trailing prompt (no list)",
      ["Question:", "Which database should I use?"],
      "question"
    ],
    [
      "Choose header introduces a parenthesised menu",
      ["Choose a template:", "1) blank", "2) react", "3) vue"],
      "select"
    ],
    [
      "Which header + lettered options",
      ["Which package manager?", "a) npm", "b) yarn", "c) pnpm"],
      "select"
    ],
    [
      "Numbered menu concluded by a high-confidence prompt (no header word)",
      ["1. Apple", "2. Banana", "3. Cherry", "Enter your choice:"],
      "select"
    ],
    [
      "Bracketed options with a trailing '>' prompt",
      ["Pick one", "[1] one", "[2] two", "> "],
      "select"
    ]
  ];

  for (const [desc, lines, category] of positives) {
    it(`flags (${category}): ${desc}`, () => {
      expect(looksLikeInputPromptBlock(lines)).toBe(true);
      const result = classifyInputPromptBlock(lines);
      expect(result).not.toBeNull();
      expect(result.category).toBe(category);
      expect(result.confidence).toBe("high");
    });
  }

  const negatives = [
    ["ordinary numbered build log", ["1. Compiling foo", "2. Compiling bar", "3. Done"]],
    ["a 'Steps:' documentation list is not a prompt", ["Steps:", "1. Install", "2. Build", "3. Run"]],
    ["an 'Options:' documentation list is not a prompt", ["Options:", "1. verbose", "2. quiet"]],
    ["a single enumerated item is too weak", ["1. Only one thing here"]],
    ["a lone numbered item that ends in '?' is still too weak", ["1. Only one?"]],
    ["empty / whitespace-only window", ["", "   ", "\t"]],
    ["plain prose with no structure", ["hello world", "goodbye world"]]
  ];

  for (const [desc, lines] of negatives) {
    it(`ignores: ${desc}`, () => {
      expect(looksLikeInputPromptBlock(lines)).toBe(false);
      expect(classifyInputPromptBlock(lines)).toBeNull();
    });
  }

  it("vetoes when control has returned to an idle shell prompt", () => {
    const lines = ["Question:", "1. A", "2. B", "PS C:\\Users\\me>"];
    expect(looksLikeInputPromptBlock(lines)).toBe(false);
  });

  it("does NOT let a weak colon line (e.g. 'Steps:') corroborate a menu", () => {
    // Two enumerated items + a weak colon header must NOT be treated as a prompt;
    // only a real header word or a high-confidence trailing prompt qualifies.
    expect(looksLikeInputPromptBlock(["Steps:", "1. a", "2. b"])).toBe(false);
    // But swapping in a genuine header word does flag it.
    expect(looksLikeInputPromptBlock(["Choose:", "1. a", "2. b"])).toBe(true);
  });

  it("strips ANSI colour before evaluating the block", () => {
    const lines = ["\u001b[36mQuestion\u001b[0m", "1. \u001b[1mYes\u001b[0m", "2. No"];
    expect(looksLikeInputPromptBlock(lines)).toBe(true);
  });

  it("accepts a single string as well as an array of lines", () => {
    expect(looksLikeInputPromptBlock("Question:")).toBe(true);
    expect(looksLikeInputPromptBlock("just some output")).toBe(false);
  });

  it("returns null for an empty or missing argument", () => {
    expect(classifyInputPromptBlock([])).toBeNull();
    expect(classifyInputPromptBlock("")).toBeNull();
  });
});
