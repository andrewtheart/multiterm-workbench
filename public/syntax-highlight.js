/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Shell syntax highlighting.
 *
 * Pure, DOM-free tokenizers for the shells MultiTerm actually launches, shared
 * by the renderer (loaded as a plain <script> before app.js) and the vitest unit
 * suite (which requires it as a CommonJS module). Keep this file free of
 * `window`/`document`/`state` references so it stays testable in Node.
 *
 * Highlighting is painted behind a real <textarea>, so `highlight()` must return
 * markup whose text content is byte-for-byte the input: dropping or adding a
 * single character would slide the painted tokens out from under the caret.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.SyntaxHighlight = api;
  }
})(globalThis, function () {
  "use strict";

  const LANGUAGES = Object.freeze([
    Object.freeze({ id: "auto", label: "Auto" }),
    Object.freeze({ id: "powershell", label: "PowerShell" }),
    Object.freeze({ id: "batch", label: "Batch / cmd" }),
    Object.freeze({ id: "shell", label: "Shell" }),
    Object.freeze({ id: "text", label: "Plain text" })
  ]);

  // Only these class suffixes are ever emitted, so the span markup cannot carry
  // anything derived from the highlighted text.
  const TOKEN_TYPES = Object.freeze([
    "comment", "string", "variable", "keyword", "command", "parameter", "number", "operator"
  ]);

  const SHELL_LANGUAGES = Object.freeze({
    pwsh: "powershell",
    powershell: "powershell",
    cmd: "batch",
    wsl: "shell",
    bash: "shell",
    sh: "shell",
    zsh: "shell"
  });

  const rule = (type, pattern) => Object.freeze({ type, re: new RegExp(pattern.source, pattern.flags) });

  const RULES = Object.freeze({
    powershell: Object.freeze([
      rule("comment", /<#[\s\S]*?(?:#>|$)/y),
      rule("comment", /#[^\n]*/y),
      rule("string", /@"[\s\S]*?(?:"@|$)/y),
      rule("string", /@'[\s\S]*?(?:'@|$)/y),
      rule("string", /"(?:`[\s\S]|""|[^"])*"?/y),
      rule("string", /'(?:''|[^'])*'?/y),
      rule("variable", /\$(?:\{[^}\n]*\}?|[A-Za-z_][\w:]*|[$?^_])/y),
      // Comparison operators are spelled like parameters, so they are claimed first.
      rule("operator", /-(?:c|i)?(?:eq|ne|lt|gt|le|ge|like|notlike|match|notmatch|contains|notcontains|in|notin|replace|split|join)\b/yi),
      rule("operator", /-(?:is|isnot|as|and|or|xor|not|band|bor|bxor|bnot|shl|shr|f)\b/yi),
      rule("keyword", /\b(?:if|elseif|else|switch|foreach|for|while|do|until|break|continue|return|function|filter|param|begin|process|end|try|catch|finally|throw|trap|class|enum|using|exit|in|hidden|static|data|dynamicparam)\b/yi),
      rule("command", /\b[A-Za-z]+-[A-Za-z]\w*\b/y),
      rule("parameter", /-[A-Za-z][\w-]*/y),
      rule("number", /\b(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\b/y),
      rule("operator", /[|=+*/%!<>&;,@]+/y)
    ]),
    batch: Object.freeze([
      rule("comment", /::[^\n]*/y),
      rule("comment", /\brem\b[^\n]*/yi),
      rule("variable", /%%[A-Za-z]/y),
      rule("variable", /%[^%\n]*%/y),
      rule("variable", /![^!\n]*!/y),
      rule("string", /"[^"\n]*"?/y),
      rule("keyword", /\b(?:if|else|for|in|do|goto|call|set|setlocal|endlocal|shift|exit|pause|start|echo|not|defined|exist|errorlevel|equ|neq|lss|leq|gtr|geq)\b/yi),
      rule("parameter", /\/[A-Za-z?][\w:]*/y),
      rule("number", /\b\d+\b/y),
      rule("operator", /[|=+*%!<>&;,]+/y)
    ]),
    shell: Object.freeze([
      rule("comment", /#[^\n]*/y),
      rule("string", /'[^'\n]*'?/y),
      rule("string", /"(?:\\[\s\S]|[^"\\])*"?/y),
      rule("string", /`(?:\\[\s\S]|[^`\\])*`?/y),
      rule("variable", /\$(?:\{[^}\n]*\}?|[A-Za-z_]\w*|[0-9@*#?$!-])/y),
      rule("keyword", /\b(?:if|then|elif|else|fi|for|while|until|do|done|case|esac|function|in|select|return|local|export|readonly|declare|source|alias|unalias|set|unset|shift|trap|exit|break|continue|echo|read|sudo)\b/y),
      rule("parameter", /--?[A-Za-z][\w-]*/y),
      rule("number", /\b\d+\b/y),
      rule("operator", /[|=+*/%!<>&;,]+/y)
    ]),
    text: Object.freeze([])
  });

  function normalizeLanguage(language, shell) {
    const requested = String(language || "").trim().toLowerCase();
    if (requested && requested !== "auto") {
      return Object.prototype.hasOwnProperty.call(RULES, requested) ? requested : "text";
    }
    return languageForShell(shell);
  }

  function languageForShell(shell) {
    const key = String(shell || "").trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(SHELL_LANGUAGES, key) ? SHELL_LANGUAGES[key] : "text";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Split `text` into `{ type, value }` runs. `type` is "" for unclassified
   * text. Concatenating every `value` reproduces `text` exactly.
   */
  function tokenize(text, language) {
    const source = String(text == null ? "" : text);
    const rules = RULES[normalizeLanguage(language)];
    const tokens = [];
    let plainStart = 0;
    let index = 0;
    while (index < source.length) {
      let match = null;
      for (const entry of rules) {
        entry.re.lastIndex = index;
        const found = entry.re.exec(source);
        if (found && found[0].length > 0) {
          match = { type: entry.type, value: found[0] };
          break;
        }
      }
      if (!match) {
        index += 1;
        continue;
      }
      if (plainStart < index) tokens.push({ type: "", value: source.slice(plainStart, index) });
      tokens.push(match);
      index += match.value.length;
      plainStart = index;
    }
    if (plainStart < source.length) tokens.push({ type: "", value: source.slice(plainStart) });
    return tokens;
  }

  function highlight(text, language) {
    let html = "";
    for (const token of tokenize(text, language)) {
      const escaped = escapeHtml(token.value);
      html += token.type ? `<span class="tok-${token.type}">${escaped}</span>` : escaped;
    }
    // A <pre> swallows a single trailing newline, which would shift the painted
    // lines up by one relative to the textarea whenever the text ends in Enter.
    return html + "\n";
  }

  return { LANGUAGES, TOKEN_TYPES, escapeHtml, highlight, languageForShell, normalizeLanguage, tokenize };
});
