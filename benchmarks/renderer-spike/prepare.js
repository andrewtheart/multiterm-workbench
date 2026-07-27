/*
 * MultiTerm Workbench — Terminal Renderer Spike: Preparation Script
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

/**
 * Downloads and extracts xterm packages needed for the renderer benchmark.
 * All outputs go to benchmarks/renderer-spike/target/ (gitignored).
 * Does NOT modify package.json or node_modules.
 *
 * Run: node benchmarks/renderer-spike/prepare.js
 */

'use strict';

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { execFileSync, execSync } = require('child_process');

const TARGET   = path.join(__dirname, 'target');
const TARBALLS = path.join(TARGET, 'tarballs');
const EXTRACT  = path.join(TARGET, 'extract');
const ASSETS   = path.join(TARGET, 'assets');

// ---------------------------------------------------------------------------
// Packages to fetch
// ---------------------------------------------------------------------------
// Each entry describes:
//   pkg      - npm scoped package name
//   ver      - exact version
//   tarFile  - local filename for the .tgz
//   files    - list of { from: 'path-inside-extracted/', to: 'asset-name' }
// ---------------------------------------------------------------------------
const PACKAGES = [
  {
    pkg: '@xterm/xterm', ver: '5.5.0',
    tarFile: 'xterm-5.5.0.tgz',
    tag: 'xterm55',
    files: [
      { from: 'lib/xterm.js',  to: 'xterm-5.5.0.js'  },
      { from: 'css/xterm.css', to: 'xterm-5.5.0.css' },
    ],
  },
  {
    pkg: '@xterm/xterm', ver: '6.0.0',
    tarFile: 'xterm-6.0.0.tgz',
    tag: 'xterm60',
    files: [
      { from: 'lib/xterm.js',  to: 'xterm-6.0.0.js'  },
      { from: 'css/xterm.css', to: 'xterm-6.0.0.css' },
    ],
  },
  {
    pkg: '@xterm/addon-webgl', ver: '0.18.0',
    tarFile: 'addon-webgl-0.18.0.tgz',
    tag: 'webgl5x',
    files: [
      { from: 'lib/addon-webgl.js', to: 'addon-webgl-5x.js' },
    ],
  },
  {
    pkg: '@xterm/addon-webgl', ver: '0.19.0',
    tarFile: 'addon-webgl-0.19.0.tgz',
    tag: 'webgl6x',
    files: [
      { from: 'lib/addon-webgl.js', to: 'addon-webgl-6x.js' },
    ],
  },
  {
    pkg: '@xterm/addon-canvas', ver: '0.7.0',
    tarFile: 'addon-canvas-0.7.0.tgz',
    tag: 'canvas5x',
    files: [
      { from: 'lib/addon-canvas.js', to: 'addon-canvas-5x.js' },
    ],
  },
  {
    pkg: '@xterm/addon-fit', ver: '0.10.0',
    tarFile: 'addon-fit-0.10.0.tgz',
    tag: 'fit5x',
    files: [
      { from: 'lib/addon-fit.js', to: 'addon-fit-5x.js' },
    ],
  },
  {
    pkg: '@xterm/addon-fit', ver: '0.11.0',
    tarFile: 'addon-fit-0.11.0.tgz',
    tag: 'fit6x',
    files: [
      { from: 'lib/addon-fit.js', to: 'addon-fit-6x.js' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg)  { process.stdout.write(`[prepare] ${msg}\n`); }
function err(msg)  { process.stderr.write(`[prepare] ERROR: ${msg}\n`); }

function npmTarballUrl(pkg, ver) {
  const [scope, name] = pkg.startsWith('@') ? pkg.slice(1).split('/') : [null, pkg];
  const encodedPkg = scope ? `@${scope}%2F${name}` : name;
  const tarName = scope ? `${name}-${ver}.tgz` : `${pkg}-${ver}.tgz`;
  return `https://registry.npmjs.org/${encodedPkg}/-/${tarName}`;
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    const handleRes = (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        const loc = res.headers.location;
        const mod = loc.startsWith('https://') ? https : http;
        mod.get(loc, handleRes).on('error', reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.destroy();
        fs.unlinkSync(destPath);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(destPath)));
    };

    https.get(url, handleRes).on('error', (e) => {
      file.destroy();
      try { fs.unlinkSync(destPath); } catch (_) {}
      reject(e);
    });
  });
}

function extract(tarPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  // Windows tar.exe: available since Win10 1803 and strips 'package/' prefix via --strip-components=1
  execFileSync('tar', ['-xzf', tarPath, '-C', destDir, '--strip-components=1'], {
    stdio: 'pipe',
  });
}

function copyWithVersionComment(src, dest, pkg, ver) {
  const original = fs.readFileSync(src);
  const header = `/* Third-party: ${pkg}@${ver} — see THIRD-PARTY-NOTICES.txt */\n`;
  // Write header + original content (no further modification).
  // The comment identifies the source; it does NOT alter the third-party code.
  fs.writeFileSync(dest, Buffer.concat([Buffer.from(header, 'utf8'), original]));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log('Creating directories…');
  for (const d of [TARGET, TARBALLS, EXTRACT, ASSETS]) {
    fs.mkdirSync(d, { recursive: true });
  }

  const versions = {};

  for (const pkg of PACKAGES) {
    const tarPath = path.join(TARBALLS, pkg.tarFile);
    const extDir  = path.join(EXTRACT, pkg.tag);

    // -- Download -----------------------------------------------------------
    if (fs.existsSync(tarPath)) {
      log(`  tarball exists, skipping download: ${pkg.tarFile}`);
    } else {
      const url = npmTarballUrl(pkg.pkg, pkg.ver);
      log(`  downloading ${pkg.pkg}@${pkg.ver} …`);
      await download(url, tarPath).catch((e) => {
        err(`Failed to download ${pkg.pkg}@${pkg.ver}: ${e.message}`);
        err(`URL tried: ${url}`);
        process.exit(1);
      });
      log(`  → saved ${pkg.tarFile}`);
    }

    // -- Extract ------------------------------------------------------------
    if (fs.existsSync(extDir)) {
      log(`  extract dir exists, skipping: ${pkg.tag}`);
    } else {
      log(`  extracting ${pkg.tarFile} …`);
      try {
        extract(tarPath, extDir);
      } catch (e) {
        err(`Failed to extract ${pkg.tarFile}: ${e.message}`);
        process.exit(1);
      }
    }

    // -- Copy files to assets/ ---------------------------------------------
    for (const f of pkg.files) {
      const srcFile  = path.join(extDir, f.from);
      const destFile = path.join(ASSETS, f.to);

      if (!fs.existsSync(srcFile)) {
        err(`Expected file not found after extraction: ${srcFile}`);
        err(`Check that ${pkg.pkg}@${pkg.ver} still ships ${f.from}`);
        process.exit(1);
      }

      copyWithVersionComment(srcFile, destFile, pkg.pkg, pkg.ver);
      log(`  asset ready: ${f.to}`);
      versions[f.to] = `${pkg.pkg}@${pkg.ver}`;
    }
  }

  // Write a versions manifest so the benchmark HTML page can verify versions.
  const manifest = {
    generated: new Date().toISOString(),
    assets: versions,
    packages: Object.fromEntries(PACKAGES.map(p => [p.tag, `${p.pkg}@${p.ver}`])),
  };
  fs.writeFileSync(
    path.join(ASSETS, 'versions.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
  log('versions.json written');

  // Final verification: make sure every expected asset exists.
  const expected = PACKAGES.flatMap(p => p.files.map(f => f.to));
  const missing  = expected.filter(f => !fs.existsSync(path.join(ASSETS, f)));
  if (missing.length) {
    err(`Assets missing after prepare: ${missing.join(', ')}`);
    process.exit(1);
  }

  log(`\nAll ${expected.length} assets ready in ${ASSETS}`);
  log('Run: node node_modules/.bin/playwright test --config benchmarks/renderer-spike/playwright.config.js');
}

main().catch((e) => {
  err(e.stack || e.message);
  process.exit(1);
});
