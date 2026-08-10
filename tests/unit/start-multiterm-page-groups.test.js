const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "../../Start-MultiTerm.ps1"), "utf8");

describe("installed bridge page grouping", () => {
  it("parses page catalogs with member titles and scope-specific minimums", () => {
    expect(source).toContain('string scope = NormalizeTerminalGroupScope(Json.Get(message, "scope"));');
    expect(source).toContain('ParseTerminalGroupCatalog(Json.Get(message, "terminals"), scope)');
    expect(source).toContain('{ "members", SanitizeTerminalGroupText(JsonText(row, "members"), 400) }');
    expect(source).toContain('scope == "pages"');
    expect(source).toContain('"At least two pages are needed to group them."');
    expect(source).toContain('"At least two terminals are needed to group pages."');
  });

  it("gives Copilot page-first instructions while retaining terminal grouping", () => {
    expect(source).toContain('TerminalPageGroupPrompt(entries, scope)');
    expect(source).toContain('"Group these workbench pages into a small number of named page groups.\\n"');
    expect(source).toContain('"Judge mainly by each page title and the terminal titles in members; use cwd and output only to tell similar pages apart.\\n"');
    expect(source).toContain('"Output excerpts are sampled from the start, middle and latest lines and are labelled accordingly.\\n"');
    expect(source).toContain('pages ? "<pages>\\n" : "<terminals>\\n"');
    expect(source).toContain('pages ? "\\n</pages>" : "\\n</terminals>"');
  });

  it("enforces the configured context budget for both scopes", () => {
    expect(source).toContain('"Grouping these " + (scope == "pages" ? "pages" : "terminals") + " needs "');
    expect(source).toContain('" KB. Increase AI session search context in Settings."');
    expect(source).toContain('"group-pages"');
    expect(source).toContain('{\\"type\\":\\"terminalPageGroups\\"');
  });
});
