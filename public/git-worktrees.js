/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Repository URLs, branch names and worktree names are free text that ends up
// on a git command line, so they are validated here before they go anywhere.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.GitWorktrees = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MAX_URL_LENGTH = 2048;
  var MAX_NAME_LENGTH = 128;
  // A value beginning with "-" is read by git as an option even when arguments
  // are passed as an array, so every field rejects a leading dash.
  var SHELL_UNSAFE = /[\u0000-\u001f\u007f`$&;|<>()"'\\\r\n]/;
  var WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

  // These validators deliberately do not trim: callers normalise first, so
  // every guard here stays reachable instead of being masked by a trim.
  function isSafeRepositoryUrl(value) {
    var url = String(value == null ? "" : value);
    if (!url || url.length > MAX_URL_LENGTH) return false;
    if (url.charAt(0) === "-") return false;
    if (SHELL_UNSAFE.test(url)) return false;
    if (/^https:\/\/[^\s/@]+(:[0-9]+)?\/\S*$/.test(url)) return true;
    if (/^ssh:\/\/[^\s/@]+@?[^\s/]+\/\S*$/.test(url)) return true;
    // scp-style, e.g. git@ssh.dev.azure.com:v3/org/project/repo
    return /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:[^\s]+$/.test(url);
  }

  function isSafeBranchName(value) {
    var branch = String(value == null ? "" : value);
    if (!branch || branch.length > MAX_NAME_LENGTH) return false;
    if (branch.charAt(0) === "-" || branch.charAt(0) === "/" ) return false;
    if (SHELL_UNSAFE.test(branch)) return false;
    // git check-ref-format rules that matter here.
    if (/[ ~^:?*\[]/.test(branch)) return false;
    if (branch.indexOf("..") !== -1 || branch.indexOf("@{") !== -1) return false;
    if (/\/$/.test(branch) || /\.$/.test(branch) || /\.lock$/i.test(branch)) return false;
    if (branch.indexOf("//") !== -1) return false;
    return true;
  }

  function isSafeWorktreeName(value) {
    var name = String(value == null ? "" : value);
    if (!name || name.length > MAX_NAME_LENGTH) return false;
    if (name.charAt(0) === "-" || name.charAt(0) === ".") return false;
    if (SHELL_UNSAFE.test(name)) return false;
    if (/[\\/:*?"<>|]/.test(name)) return false;
    if (name.indexOf("..") !== -1) return false;
    if (/[ .]$/.test(name)) return false;
    return !WINDOWS_RESERVED.test(name.split(".")[0]);
  }

  function flattenBranchName(value) {
    return String(value == null ? "" : value)
      .trim()
      .replace(/[\\/]+/g, "-")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 80);
  }

  function stampFor(date) {
    var when = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
    var month = String(when.getMonth() + 1).padStart(2, "0");
    var day = String(when.getDate()).padStart(2, "0");
    return month + day;
  }

  // Several worktrees off one branch on one day is the normal case here, so the
  // suggestion always has to be able to disambiguate.
  function suggestWorktreeName(branch, taken, date) {
    var base = flattenBranchName(branch) || "worktree";
    var candidate = base + "-" + stampFor(date);
    var existing = {};
    (taken || []).forEach(function (name) {
      existing[String(name).toLowerCase()] = true;
    });
    if (!existing[candidate.toLowerCase()]) return candidate;
    for (var index = 2; index < 1000; index += 1) {
      var next = candidate + "-" + index;
      if (!existing[next.toLowerCase()]) return next;
    }
    return candidate + "-" + Date.now();
  }

  return {
    flattenBranchName: flattenBranchName,
    isSafeBranchName: isSafeBranchName,
    isSafeRepositoryUrl: isSafeRepositoryUrl,
    isSafeWorktreeName: isSafeWorktreeName,
    suggestWorktreeName: suggestWorktreeName
  };
}));
