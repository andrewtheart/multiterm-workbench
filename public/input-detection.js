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
 * Input-prompt detection heuristics.
 *
 * Pure, DOM-free string classifiers shared by the renderer (app.js loads this
 * as a plain <script> before app.js) and the vitest unit suite (which requires
 * it as a CommonJS module). Keep this file free of `window`/`document`/`state`
 * references so it stays testable in a Node environment.
 *
 * The renderer inspects the line the cursor is parked on after output settles;
 * these functions decide whether that line reads like a program waiting for the
 * user to type something (a confirmation, a password, a menu choice, ...).
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.InputPromptDetector = api;
  }
})(globalThis, function () {
  "use strict";

  // CSI / SGR escape sequences (colours, cursor moves, ...).
  const CSI_PATTERN =
    /[\u001B\u009B][[\]()#;?]*(?:(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nqry=><~]|[A-PRZcf-nqry=><~])/g;
  // OSC sequences (window title, hyperlinks) terminated by BEL or ST.
  const OSC_PATTERN = /[\u001B\u009D][^\u0007\u001B]*(?:\u0007|\u001B\\)/g;
  // Leftover lone control bytes (keep \t and newlines out of single lines).
  const CTRL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

  function stripAnsi(text) {
    return String(text == null ? "" : text)
      .replace(OSC_PATTERN, "")
      .replace(CSI_PATTERN, "")
      .replace(CTRL_PATTERN, "");
  }

  // Strip ANSI and trailing whitespace so patterns can anchor on the real end
  // of the line. Trailing spaces are extremely common after a prompt (the
  // program leaves a gap for the caret), so they must not defeat `$` anchors.
  function normalize(line) {
    return stripAnsi(line).replace(/[\s\u00A0]+$/, "");
  }

  // ---- Shell prompts (an *idle* shell, NOT awaiting program input) ---------
  // These veto the low-confidence heuristics so we don't badge a plain shell
  // that is simply sitting at its prompt.
  const SHELL_PROMPT_PATTERNS = [
    /^PS[ >].*>$/i,                       // PowerShell: PS C:\Users\me>
    /^[A-Za-z]:\\[^\n]*>$/,               // cmd.exe:    C:\Users\me>
    /@[\w.-]+.*[#$%»]$/,                  // user@host …$   (bash/zsh/git-bash)
    /[)\]]\s*[#$%»]$/,                    // …(main) $   /  …] %
    /(?:^|\s)~?[\w./~-]*\s*[#$%]$/,       // ~/path $   /   /srv #
    /[➜❯»▶λ›]\s*$/,                       // starship / oh-my-zsh / pure carets
    /^[#$%»]$/                            // bare $, #, %, »
  ];

  function isShellPrompt(line) {
    const text = normalize(line);
    if (!text) return true;
    return SHELL_PROMPT_PATTERNS.some((re) => re.test(text));
  }

  // ---- High-confidence prompt patterns, grouped by category ----------------
  // Order matters only for the returned category; membership is what flags.
  const PROMPT_PATTERNS = [
    // --- SSH / host authenticity (checked before the generic "are you sure"
    //     confirmation so the canonical host-key prompt keeps its category) ---
    { category: "ssh", re: /continue connecting\s*\([^)]*\)\s*\?/i },
    { category: "ssh", re: /authenticity of host\b/i },
    { category: "ssh", re: /\bfingerprint\b[^?\n]*\?\s*$/i },
    { category: "ssh", re: /\(yes\/no(?:\/\[fingerprint\])?\)/i },

    // --- Yes / No confirmations ------------------------------------------
    { category: "confirm", re: /\[\s*y(?:es)?\s*[/|]\s*n(?:o)?\s*\]/i },   // [y/n] [yes/no] [Y|n]
    { category: "confirm", re: /\(\s*y(?:es)?\s*[/|]\s*n(?:o)?\s*\)/i },   // (y/n) (yes/no)
    { category: "confirm", re: /\by(?:es)?\s*[/|]\s*no?\b/i },             // bare y/n, yes/no
    { category: "confirm", re: /\[[yYnN](?:[,/|][a-zA-Z?])+\]/ },          // git: [y,n,q,a,d,e,?]
    { category: "confirm", re: /\bare you sure\b/i },
    { category: "confirm", re: /\b(?:do|would) you (?:want|wish|like|care)\b[^?\n]*\?/i },
    { category: "confirm", re: /\b(?:ok|okay|are you ok)\s+to\b[^?\n]*\?/i },
    {
      category: "confirm",
      re: /\b(?:continue|proceed|overwrite|replace|remove|delete|abort|retry|discard|confirm|accept|install|reinstall|uninstall|update|upgrade|downgrade|apply|save|quit|exit|restart|reboot|shut down|shutdown|format|erase|revert)\b[^?\n]*\?\s*$/i
    },
    { category: "confirm", re: /\btype\s+["']?yes["']?\s+(?:to|if)\b/i },  // type 'yes' to confirm
    { category: "confirm", re: /\bto\s+confirm\b[^?\n]*[:?]\s*$/i },
    { category: "confirm", re: /\bpress\s+y\b(?:\s+to)?/i },

    // --- Password / secret prompts ---------------------------------------
    { category: "password", re: /\bpass(?:word|phrase)\b[^:\n]*:\s*$/i },  // Password:, passphrase for key ..:
    { category: "password", re: /\[sudo\]\s+password\b/i },               // [sudo] password for me:
    { category: "password", re: /\benter\s+(?:the\s+|your\s+|new\s+|old\s+|current\s+)*pass(?:word|phrase)\b/i },
    { category: "password", re: /\b(?:pin|otp|passcode)\b[^:\n]*:\s*$/i },
    { category: "password", re: /\b(?:one[-\s]?time|verification|security|confirmation|authentication|auth|2fa|mfa)\s+code\b[^:\n]*:?\s*$/i },
    { category: "password", re: /\b(?:user\s?name|login|e-?mail|account)\b[^:\n]*:\s*$/i },
    { category: "password", re: /\bfor\s+["'`][^"'`]+["'`]\s*:\s*$/i },   // Password for 'https://…':

    // --- Press-a-key / pagers --------------------------------------------
    { category: "press", re: /\bpress\s+(?:any key|enter|return|space(?:bar)?|the space bar|[a-z]|\^?[a-z]|\[?(?:enter|return|space|esc|escape)\]?)\b/i },
    { category: "press", re: /\bhit\s+(?:enter|return|any key|space)\b/i },
    { category: "press", re: /--\s*more\s*--/i },                          // more(1)
    { category: "press", re: /^\(END\)$/i },                               // less at EOF
    { category: "press", re: /\(\s*more\s+\d+%\s*\)/i },
    { category: "press", re: /^lines?\s+\d+-\d+/i },                       // less status line
    { category: "press", re: /\bpress\s+q\b|\bq\s+to quit\b|\bpress\s+ctrl\b|\^c to (?:cancel|abort|quit)\b/i },

    // --- Selection / menu -------------------------------------------------
    { category: "select", re: /\b(?:select|choose|choice|selection|pick|which(?:\s+one)?)\b[^?\n]*[:?]\s*$/i },
    { category: "select", re: /\benter\s+(?:your\s+|a\s+|the\s+)?(?:choice|selection|option|number|index|value|name|id)\b/i },
    { category: "select", re: /\benter\s+(?:a\s+)?(?:number|digit)\b/i },
    { category: "select", re: /^\s*[?？]\s+\S/ },                          // inquirer "? Question"
    { category: "select", re: /^\s*[❯➤▸▶►]\s+\S/ },                       // list pointer "❯ Option"
    { category: "select", re: /\[\s*\d+\s*(?:-\s*\d+\s*)?\]\s*[:?]?\s*$/ },// [1-5]:
    { category: "select", re: /\bdefault\b\s*[:=]?\s*[\[(][^\])]*[\])]/i },// default is [x]

    // --- Generic "enter / provide a value" -------------------------------
    { category: "value", re: /\b(?:enter|type|input|provide|specify|paste|supply|give)\b[^:?\n]*[:?]\s*$/i },
    { category: "value", re: /\bplease\s+(?:enter|type|provide|specify|input|confirm|respond|answer|reply)\b/i },
    { category: "value", re: /\b(?:name|value|path|url|uri|host(?:name)?|port|address|directory|folder|file(?:name)?|version|tag|branch|label|title|description|message)\b\s*:\s*$/i },
    { category: "value", re: /:\s+\([^)]*\)\s*$/ },                        // npm init: "package name: (multiterm)"
    { category: "value", re: /\b(?:default|leave blank|press enter for default)\b[^:\n]*:?\s*$/i },

    // --- Interactive "Question" headers ----------------------------------
    // A line that IS a question header (an agent / wizard asking, often with an
    // enumerated list on the following lines). The word alone on its own line is
    // almost never ordinary program output.
    { category: "question", re: /^\s*questions?\s*[:.?)]*\s*$/i },                 // "Question", "Question:", "Questions?"
    { category: "question", re: /^\s*question\s+\d+(?:\s+of\s+\d+)?\s*[:.?)]*\s*$/i }, // "Question 1", "Question 2 of 5:"
    { category: "question", re: /^\s*q\s*:\s*$/i },                               // bare "Q:" header
    { category: "question", re: /\bhow\s+would\s+you\s+like\s+to\b[^?\n]*\?/i },
    { category: "question", re: /\bwhat\s+(?:is|are|should|would|do|does|will)\b[^?\n]*\?\s*$/i },

    // --- Explicit "waiting" indicators -----------------------------------
    { category: "waiting", re: /\b(?:waiting for|awaiting)\s+(?:your\s+)?(?:input|response|confirmation|answer|reply|selection)\b/i },
    { category: "waiting", re: /\binput\s+(?:is\s+)?required\b/i },
    { category: "waiting", re: /\b(?:requires?|needs?)\s+(?:your\s+)?(?:confirmation|input|response|attention)\b/i }
  ];

  // ---- Multi-line / block detection ---------------------------------------
  // Interactive questions frequently span several lines: a header ("Question",
  // "Choose one", "Which …?") followed by an enumerated list of options and,
  // often, a trailing prompt. The single-line classifier can miss these because
  // no individual line is self-sufficient, so a block scan inspects a small
  // window of recent lines together.

  // An enumerated / lettered list item: "1.", "1)", "(1)", "[1]", "a.", "b)".
  const LIST_ITEM_PATTERN =
    /^\s{0,8}(?:[❯➤▸▶►]\s*)?(?:\(\s*(?:\d{1,3}|[a-zA-Z])\s*\)|\[\s*(?:\d{1,3}|[a-zA-Z])\s*\]|(?:\d{1,3}|[a-zA-Z])[.)])\s+\S/;

  // A header that introduces an interactive question / choice across a block.
  const BLOCK_HEADER_PATTERN =
    /^\s*(?:questions?|please\s+(?:answer|choose|select|pick|respond|specify)|choose|select|pick|which(?:\s+\w+)?|what(?:'s|\s+is|\s+are)?|how|where|when|who|enter|type|provide)\b/i;

  // The block's concluding line reads like it is waiting for a reply.
  const BLOCK_TAIL_PATTERN = /[?:>）】]\s*$/;

  function toBlockLines(lines) {
    const arr = Array.isArray(lines) ? lines : [lines];
    const out = [];
    for (const raw of arr) {
      const text = normalize(raw);
      if (text) out.push(text);
    }
    return out;
  }

  /**
   * Classify a *window* of recent lines. Returns `{ category, confidence }` when
   * the block reads like an interactive question (a header and/or an enumerated
   * menu that concludes with a prompt), otherwise `null`.
   *
   * @param {string[]|string} lines  Recent lines, oldest first, newest last.
   * @param {object} [context]       Same caret context as classifyInputPrompt.
   */
  function classifyInputPromptBlock(lines, context) {
    const block = toBlockLines(lines);
    if (block.length === 0) return null;

    const lastLine = block[block.length - 1];
    // If control has clearly returned to an idle shell, the program is not
    // waiting on us regardless of what scrolled by above.
    if (isShellPrompt(lastLine)) return null;

    let listItems = 0;
    let hasHeader = false;
    let singleFlag = false;
    for (const text of block) {
      if (LIST_ITEM_PATTERN.test(text)) listItems += 1;
      if (BLOCK_HEADER_PATTERN.test(text)) hasHeader = true;
      // Only a *high-confidence* single-line prompt corroborates a block; weak
      // trailing punctuation (e.g. a "Steps:" documentation header) must not.
      if (!singleFlag) {
        const inner = classifyInputPrompt(text, context);
        if (inner && inner.confidence === "high") singleFlag = true;
      }
    }

    const tailWaits = singleFlag || BLOCK_TAIL_PATTERN.test(lastLine);
    const hasQuestionWord = block.some((t) => /^\s*questions?\b/i.test(t));

    // A "Question" header carries an enumerated list or a trailing prompt.
    if (hasQuestionWord && (listItems >= 1 || tailWaits)) {
      return { category: "question", confidence: "high" };
    }
    // An enumerated menu (2+ options) introduced by a header or ending in a prompt.
    if (listItems >= 2 && (hasHeader || tailWaits)) {
      return { category: "select", confidence: "high" };
    }
    return null;
  }

  function looksLikeInputPromptBlock(lines, context) {
    return classifyInputPromptBlock(lines, context) !== null;
  }

  // ---- Low-confidence trailing punctuation (gated by shell veto) -----------
  const WEAK_PATTERNS = [
    /\?\s*$/, // ends with a question mark
    /:\s*$/   // ends with a colon (label-style prompt)
  ];

  // Things that end with ':' or '?' but are clearly NOT prompts.
  const WEAK_EXCLUSIONS = [
    /\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\s*$/,                                // clock / duration 10:30:05
    /:\/\/\S*$/,                                                               // trailing URL scheme
    /^\s*(?:note|notes|warning|warn|error|err|fatal|info|debug|trace|tip|hint|todo|fixme|xxx|hack|deprecated|usage|example|examples|synopsis|options?|arguments?|commands?|see also|version|author|authors|license|licence|copyright)\s*:?\s*$/i
  ];

  /**
   * Classify a single line. Returns a `{ category, confidence }` object when the
   * line looks like an input prompt, otherwise `null`.
   *
   * @param {string} line   The (possibly ANSI-coloured) line text.
   * @param {object} [context]
   * @param {boolean} [context.cursorAtLineEnd]  When explicitly `false`, weak
   *   trailing-punctuation matches are ignored (the caret sits mid-line, so the
   *   program is probably still drawing rather than waiting).
   */
  function classifyInputPrompt(line, context) {
    const text = normalize(line);
    if (!text) return null;

    for (const entry of PROMPT_PATTERNS) {
      if (entry.re.test(text)) {
        return { category: entry.category, confidence: "high" };
      }
    }

    if (isShellPrompt(text)) return null;

    const cursorMidLine = context && context.cursorAtLineEnd === false;
    if (!cursorMidLine && WEAK_PATTERNS.some((re) => re.test(text))) {
      if (!WEAK_EXCLUSIONS.some((re) => re.test(text))) {
        return { category: "generic", confidence: "low" };
      }
    }

    return null;
  }

  function looksLikeInputPrompt(line, context) {
    return classifyInputPrompt(line, context) !== null;
  }

  function aiAssistantScreenLines(lines) {
    const values = Array.isArray(lines) ? lines : [lines];
    return values.map((line) => normalize(line));
  }

  const COPILOT_FOOTER_PATTERN = /(?:^\s*|[·•]\s*)\/\s*commands\s*[·•]\s*\?\s*help\b/i;
  const COPILOT_EMPTY_COMPOSER_PATTERN = /^\s*(?:❯|┃)\s*$/;

  function hasCopilotEmptyComposer(screen) {
    return screen.some((line) => COPILOT_FOOTER_PATTERN.test(line))
      && screen.some((line) => COPILOT_EMPTY_COMPOSER_PATTERN.test(line));
  }

  function aiAssistantTuiProvider(lines) {
    const linesOnScreen = aiAssistantScreenLines(lines);
    const screen = linesOnScreen.join(" ");
    if (/\bCopilot\s+v[\d.]+\s+uses\s+AI\b/i.test(screen) || hasCopilotEmptyComposer(linesOnScreen)) return "copilot";
    if (/\bClaude Code\b(?:\s+v[\w.-]+)?/i.test(screen)) return "claude";
    return "";
  }

  function isAiAssistantTui(lines) {
    return Boolean(aiAssistantTuiProvider(lines));
  }

  function isAiAssistantPromptReady(lines, knownProvider = "") {
    const screen = aiAssistantScreenLines(lines);
    const provider = typeof knownProvider === "string" && knownProvider
      ? knownProvider
      : aiAssistantTuiProvider(screen);
    if (provider === "copilot") {
      return hasCopilotEmptyComposer(screen);
    }
    if (provider === "claude") {
      return screen.some((line) => /^\s*❯\s*$/.test(line));
    }
    return false;
  }

  function classifyAiAssistantQuestion(lines, knownProvider = "") {
    const screen = aiAssistantScreenLines(lines).filter(Boolean);
    const provider = knownProvider || aiAssistantTuiProvider(screen);
    if (!provider || screen.length === 0) return null;
    const block = classifyInputPromptBlock(screen, { cursorAtLineEnd: true });
    if (block?.category === "question") return { category: "question", confidence: "high", provider };

    const hasInterrogative = screen.some((line) => (
      /\?\s*$/.test(line)
      && /\b(?:what|which|how|where|when|who|why|would|should|could|do|does|is|are|can)\b/i.test(line)
    ));
    if (block?.category === "select" && hasInterrogative) {
      return { category: "question", confidence: "high", provider };
    }
    return null;
  }

  function isCopilotTui(lines) {
    return aiAssistantTuiProvider(lines) === "copilot";
  }

  function isCopilotPromptReady(lines, knownCopilot) {
    return isAiAssistantPromptReady(lines, knownCopilot === true ? "copilot" : "");
  }

  return {
    stripAnsi,
    isShellPrompt,
    aiAssistantTuiProvider,
    isAiAssistantTui,
    isAiAssistantPromptReady,
    classifyAiAssistantQuestion,
    isCopilotTui,
    isCopilotPromptReady,
    looksLikeInputPrompt,
    classifyInputPrompt,
    looksLikeInputPromptBlock,
    classifyInputPromptBlock,
    // Exposed for tests / introspection.
    PROMPT_PATTERNS,
    SHELL_PROMPT_PATTERNS
  };
});
