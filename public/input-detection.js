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
})(typeof self !== "undefined" ? self : this, function () {
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

    // --- Explicit "waiting" indicators -----------------------------------
    { category: "waiting", re: /\b(?:waiting for|awaiting)\s+(?:your\s+)?(?:input|response|confirmation|answer|reply|selection)\b/i },
    { category: "waiting", re: /\binput\s+(?:is\s+)?required\b/i },
    { category: "waiting", re: /\b(?:requires?|needs?)\s+(?:your\s+)?(?:confirmation|input|response|attention)\b/i }
  ];

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

  return {
    stripAnsi,
    isShellPrompt,
    looksLikeInputPrompt,
    classifyInputPrompt,
    // Exposed for tests / introspection.
    PROMPT_PATTERNS,
    SHELL_PROMPT_PATTERNS
  };
});
