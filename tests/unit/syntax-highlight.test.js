/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const highlighter = require("../../public/syntax-highlight.js");

// The painted markup sits underneath a real textarea, so the invariant that
// matters most is that it reproduces the input exactly.
function paintedText(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function typesFor(text, language) {
  return highlighter.tokenize(text, language).filter((token) => token.type).map((token) => `${token.type}:${token.value}`);
}

describe("shell syntax highlighting", () => {
  it("maps each spawnable shell to its language and falls back to plain text", () => {
    expect(highlighter.languageForShell("pwsh")).toBe("powershell");
    expect(highlighter.languageForShell("PowerShell")).toBe("powershell");
    expect(highlighter.languageForShell("cmd")).toBe("batch");
    expect(highlighter.languageForShell("wsl")).toBe("shell");
    expect(highlighter.languageForShell("")).toBe("text");
    expect(highlighter.languageForShell(undefined)).toBe("text");
    expect(highlighter.languageForShell("fortran")).toBe("text");
  });

  it("resolves an explicit language and treats anything unknown as plain text", () => {
    expect(highlighter.normalizeLanguage("powershell")).toBe("powershell");
    expect(highlighter.normalizeLanguage("BATCH")).toBe("batch");
    expect(highlighter.normalizeLanguage("auto", "wsl")).toBe("shell");
    expect(highlighter.normalizeLanguage("", "cmd")).toBe("batch");
    expect(highlighter.normalizeLanguage("klingon")).toBe("text");
    expect(highlighter.tokenize(null, "text")).toEqual([]);
  });

  it.each([
    ["powershell", "Get-ChildItem -Path 'C:\\src' -Recurse | Where-Object { $_.Length -gt 1024 } # scan\n"],
    ["batch", "@echo off\r\nrem build\r\nif %ERRORLEVEL% neq 0 goto :fail\r\nfor %%i in (*.txt) do type \"%%i\"\r\n"],
    ["shell", "#!/bin/bash\nfor f in *.log; do\n  grep -n \"error\" \"$f\" | head -5\ndone\n"],
    ["text", "Just a plain sentence, with punctuation & symbols <like this>.\n"],
    ["powershell", ""],
    ["powershell", "   \n\n\t  "],
    ["shell", "unterminated 'string and \"another"],
    ["powershell", "@\"\nunclosed here-string"]
  ])("reproduces %s input exactly", (language, text) => {
    const tokens = highlighter.tokenize(text, language);
    expect(tokens.map((token) => token.value).join("")).toBe(text);
    // highlight() appends one newline so a <pre> renders a trailing blank line.
    expect(paintedText(highlighter.highlight(text, language))).toBe(`${text}\n`);
  });

  it("only ever emits its own token classes", () => {
    const samples = [
      ["powershell", "Get-Item -Force $env:PATH 'a' \"b\" 42 -eq | # c"],
      ["batch", "set /a x=1 & echo %x% :: done"],
      ["shell", "export A=1 && echo \"$A\" # note"]
    ];
    for (const [language, text] of samples) {
      for (const token of highlighter.tokenize(text, language)) {
        if (token.type) expect(highlighter.TOKEN_TYPES).toContain(token.type);
      }
      const classes = [...highlighter.highlight(text, language).matchAll(/class="([^"]*)"/g)].map((match) => match[1]);
      for (const value of classes) expect(highlighter.TOKEN_TYPES).toContain(value.replace(/^tok-/, ""));
    }
  });

  it("escapes markup so pasted text cannot become live HTML", () => {
    // `onerror=` survives as inert text; what must not survive is the `<` that
    // would turn it into an attribute, so assert on the tags themselves.
    const onlyOurSpans = (html) => html.replace(/<span class="tok-[a-z]+">|<\/span>/g, "");
    const attack = '<img src=x onerror="alert(1)"> & \'quoted\'';
    const html = highlighter.highlight(attack, "text");
    expect(onlyOurSpans(html)).not.toMatch(/[<>]/);
    expect(html).toContain("&lt;img");
    expect(html).toContain("&amp;");

    const tokenized = highlighter.highlight('Write-Output "<script>bad()</script>"', "powershell");
    expect(onlyOurSpans(tokenized)).not.toMatch(/[<>]/);
    expect(tokenized).toContain("&lt;script&gt;");
  });

  it("classifies the constructs that make a shell command readable", () => {
    expect(typesFor("Get-ChildItem -Recurse", "powershell"))
      .toEqual(expect.arrayContaining(["command:Get-ChildItem", "parameter:-Recurse"]));
    expect(typesFor("if ($count -gt 3) { 'many' } # note", "powershell"))
      .toEqual(expect.arrayContaining(["keyword:if", "variable:$count", "operator:-gt", "number:3", "string:'many'", "comment:# note"]));
    expect(typesFor("echo %USERNAME% :: hi", "batch"))
      .toEqual(expect.arrayContaining(["keyword:echo", "variable:%USERNAME%", "comment::: hi"]));
    expect(typesFor("for f in *.log; do echo \"$f\"; done", "shell"))
      .toEqual(expect.arrayContaining(["keyword:for", "keyword:in", "keyword:do", "keyword:echo", "keyword:done"]));
    expect(typesFor("anything at all", "text")).toEqual([]);
  });

  it("does not mistake a PowerShell comparison operator for a parameter", () => {
    const tokens = highlighter.tokenize("$a -eq $b -Force", "powershell");
    expect(tokens.find((token) => token.value === "-eq").type).toBe("operator");
    expect(tokens.find((token) => token.value === "-Force").type).toBe("parameter");
  });
});
