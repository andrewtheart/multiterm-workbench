/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const decisions = fs.readFileSync(path.join(root, "docs", "security", "security-decisions.md"), "utf8");
const hostProject = fs.readFileSync(path.join(root, "lib", "prompt-library-host", "MultiTerm.PromptLibraryHost.csproj"), "utf8");
const hostProgram = fs.readFileSync(path.join(root, "lib", "prompt-library-host", "Program.cs"), "utf8");
const keyStore = fs.readFileSync(path.join(root, "lib", "prompt-library-host", "PromptLibraryKeyStore.cs"), "utf8");
const nativeAdapter = fs.readFileSync(path.join(root, "lib", "prompt-library-host", "NativeSqlite.cs"), "utf8");
const store = fs.readFileSync(path.join(root, "lib", "prompt-library-host", "PromptLibraryStore.cs"), "utf8");
const nativeBuild = fs.readFileSync(path.join(root, "lib", "sqlite3mc", "CMakeLists.txt"), "utf8");
const buildScript = fs.readFileSync(path.join(root, "scripts", "build-sqlite3mc.ps1"), "utf8");
const hostBuildScript = fs.readFileSync(path.join(root, "scripts", "build-prompt-library-host.ps1"), "utf8");
const installerBuild = fs.readFileSync(path.join(root, "scripts", "build-installer.ps1"), "utf8");
const installer = fs.readFileSync(path.join(root, "installer", "MultiTerm.iss"), "utf8");
const installedBridge = fs.readFileSync(path.join(root, "Start-MultiTerm.ps1"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "lib", "sqlite3mc", "source.json"), "utf8"));

describe("Prompt Library security decisions", () => {
  it("records the open-source encryption and runtime safety boundaries before implementation", () => {
    expect(decisions).toContain("**Status:** Approved for implementation");
    expect(decisions).toContain("SQLite3MultipleCiphers 2.5.0");
    expect(decisions).toContain("non-legacy ChaCha20-Poly1305");
    expect(decisions).toContain("Commercial SQLCipher products are excluded");
    expect(decisions.toLowerCase()).toContain("automatic permission is runtime-only");
    expect(decisions).toContain("must be exposed in the UI");
  });
});

describe("Pinned SQLite3MC source", () => {
  it("matches every vendored source hash from the attested v2.5.0 manifest", () => {
    expect(manifest).toMatchObject({
      version: "2.5.0",
      sqliteVersion: "3.53.4",
      license: "MIT",
      archiveSha256: "cd3a598b667dea206b6c5319d4ecb9d687ee40565f9fd2ba280d0c2f93790f58"
    });
    for (const [name, expected] of Object.entries(manifest.files)) {
      const contents = fs.readFileSync(path.join(root, "lib", "sqlite3mc", "upstream", name));
      expect(crypto.createHash("sha256").update(contents).digest("hex"), name).toBe(expected);
    }
  });

  it("builds only the approved cipher with hardened SQLite settings", () => {
    expect(nativeBuild).toContain("CODEC_TYPE=CODEC_TYPE_CHACHA20");
    expect(nativeBuild).toContain("HAVE_CIPHER_CHACHA20=1");
    for (const disabled of [
      "HAVE_CIPHER_AES_128_CBC=0",
      "HAVE_CIPHER_AES_256_CBC=0",
      "HAVE_CIPHER_SQLCIPHER=0",
      "HAVE_CIPHER_RC4=0",
      "HAVE_CIPHER_ASCON128=0",
      "HAVE_CIPHER_AEGIS=0"
    ]) expect(nativeBuild).toContain(disabled);
    expect(nativeBuild).toContain("SQLITE3MC_SECURE_MEMORY=1");
    expect(nativeBuild).toContain("SQLITE_OMIT_LOAD_EXTENSION=1");
    expect(nativeBuild).toContain("SQLITE_TEMP_STORE=3");
    expect(nativeBuild).toContain("SQLITE_MAX_ATTACHED=0");
    expect(nativeBuild).toContain("/GS /guard:cf /sdl");
    expect(nativeBuild).toContain("/DYNAMICBASE /NXCOMPAT /guard:cf");
  });

  it("verifies source hashes and supports every installer architecture", () => {
    expect(buildScript).toContain("Get-Sha256Hex -Path $sourcePath");
    expect(buildScript).toContain("[System.Security.Cryptography.SHA256]::Create()");
    expect(buildScript).toContain("[ValidateSet('x86', 'x64', 'arm64')]");
    expect(buildScript).toContain("x86 = 'Win32'");
    expect(buildScript).toContain("x64 = 'x64'");
    expect(buildScript).toContain("arm64 = 'ARM64'");
    expect(buildScript).toContain("Get-Arm64CompilerPath");
    expect(buildScript).toContain("installationVersion");
    expect(buildScript).toContain("CMAKE_GENERATOR_INSTANCE");
    expect(buildScript).not.toContain("& $vswhere -latest");
  });
});

describe("Prompt Library host security contract", () => {
  it("uses DPAPI only for a random 256-bit key and clears caller-owned buffers", () => {
    expect(keyStore).toContain("new byte[32]");
    expect(keyStore).toContain("generator.GetBytes(key)");
    expect(keyStore).toContain("DataProtectionScope.CurrentUser");
    expect(keyStore).toContain("SecurityMemory.Zero(key)");
    expect(keyStore).toContain("The encrypted prompt library exists, but its protected key is missing.");
    expect(keyStore).toContain("The protected prompt library key exists, but its database is missing.");
    expect(keyStore).toContain("MULTITERM_PROMPT_LIBRARY_TEST_MODE");
    expect(keyStore).toContain("SetAccessRuleProtection(true, false)");
    expect(keyStore).toContain("WellKnownSidType.LocalSystemSid");
  });

  it("applies the key through the native API before verified encrypted access", () => {
    expect(nativeAdapter).toContain('sqlite3mc_cipher_index("chacha20")');
    expect(nativeAdapter).toContain('sqlite3mc_config_cipher(database, "chacha20", "legacy", 0)');
    expect(nativeAdapter).toContain('sqlite3mc_config(database, "hmac_check", 1)');
    expect(nativeAdapter).toContain('sqlite3mc_config(database, "mc_legacy_wal", 0)');
    expect(nativeAdapter).toContain("sqlite3_key(database, rawKey, rawKey.Length)");
    expect(nativeAdapter).toContain('ScalarInt64("SELECT count(*) FROM sqlite_master;")');
    expect(nativeAdapter).toContain('Exec("PRAGMA memory_security=1;")');
    expect(nativeAdapter).toContain('Exec("PRAGMA temp_store=MEMORY;")');
    expect(nativeAdapter).toContain('Exec("PRAGMA journal_mode=WAL;")');
  });

  it("uses strict schema, bound values, transactions, and optimistic revisions", () => {
    expect(store).toContain(") STRICT;");
    expect(store).toContain("BEGIN IMMEDIATE;");
    expect(store).toContain("WHERE id=?4 AND revision=?5;");
    expect(store).toContain("DELETE FROM prompts WHERE id=?1 AND revision=?2;");
    expect(store).toContain('new PromptLibraryException("conflict"');
    expect(store).toContain("insert.BindText(2, name)");
    expect(store).toContain("insert.BindText(3, body)");
  });

  it("keeps a persistent request protocol and removes failed first-use key material", () => {
    expect(hostProject).toContain("PromptLibraryNativeArch");
    expect(hostProject).toContain("sqlite3mc.dll");
    expect(hostProgram).toContain("while ((line = Console.ReadLine()) != null)");
    expect(hostProgram).toContain('operation == "list"');
    expect(hostProgram).toContain('operation == "get"');
    expect(hostProgram).toContain('operation == "upsert"');
    expect(hostProgram).toContain('operation == "delete"');
    expect(store).toContain("if (lease != null && lease.IsNew)");
    expect(store).toContain("DeleteNewFile(paths.KeyPath)");
  });

  it("builds and packages an architecture-matched host after the native lock guard", () => {
    expect(hostProject).toContain("publish\\$(PromptLibraryNativeArch)\\");
    expect(hostProject).toContain("obj\\$(PromptLibraryNativeArch)\\$(Configuration)\\");
    expect(hostProject).toContain("'$(PromptLibraryNativeArch)' == 'x86'\">x86</PlatformTarget>");
    expect(hostProject).toContain("'$(PromptLibraryNativeArch)' == 'x64'\">x64</PlatformTarget>");
    expect(hostProject).toContain("'$(PromptLibraryNativeArch)' == 'arm64'\">ARM64</PlatformTarget>");
    expect(hostBuildScript).toContain("@('x86', 'x64', 'arm64')");
    expect(installedBridge).toContain("PROCESSOR_ARCHITEW6432");
    for (const architecture of ["x86", "x64", "arm64"]) {
      expect(installer).toContain(`prompt-library-host\\publish\\${architecture}\\MultiTerm.PromptLibraryHost.exe`);
      expect(installer).toContain(`prompt-library-host\\publish\\${architecture}\\sqlite3mc.dll`);
    }
    expect(installer).toContain("Check: PreferArm64PromptLibraryFiles");
    expect(installer).toContain("Check: PreferX64PromptLibraryFiles");
    expect(installer).toContain("Check: PreferX86PromptLibraryFiles");
    expect(installerBuild.indexOf("confirm-native-module-unlocked.ps1"))
      .toBeLessThan(installerBuild.indexOf("build-prompt-library-host.ps1"));
  });
});