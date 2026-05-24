/*
Purpose: build the Cloudflare Pages public artifact for the Mullusi website.
Governance scope: static website publish boundary and source-disclosure prevention.
Dependencies: Node.js standard library, repository static site files, Cloudflare Pages.
Invariants: output is deterministic, contains only approved public files, and excludes source/control directories.
Test contract: run node scripts/test-build-cloudflare-pages.mjs.
*/

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultOutputDirectory = path.join(repoRoot, "dist");

const publicEntries = [
  "index.html",
  "doctrine",
  "mullu",
  "search",
  "browse",
  "proof",
  "playground",
  "contact",
  "pilot",
  "status",
  "security",
  "privacy",
  "terms",
  "acceptable-use",
  "responsible-disclosure",
  "404.html",
  "_headers",
  "_redirects",
  ".well-known",
  "assets",
  "data",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "status.json",
  "site.webmanifest",
];

const forbiddenOutputEntries = [
  ".claude",
  ".git",
  ".github",
  ".nojekyll",
  "backend",
  "docs",
  "ops",
  "scripts",
  "CNAME",
  "LICENSE",
  "README.md",
];

const excludedPublicEntries = new Set([
  "data/generated/products-compat.json",
]);

function assertPathInside(parentPath, childPath, label) {
  const relativePath = path.relative(parentPath, childPath);
  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`path_boundary_violation:${label}:${childPath}`);
  }
}

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function assertOutputDirectorySafe(outputDirectory) {
  const tempRoot = path.resolve(os.tmpdir());
  const allowedRepoOutput = outputDirectory === defaultOutputDirectory || isPathInside(defaultOutputDirectory, outputDirectory);
  const repoRelativePath = path.relative(repoRoot, outputDirectory);
  const repoPathSegments = repoRelativePath.split(path.sep);
  const allowedRepoTestOutput = isPathInside(repoRoot, outputDirectory) && repoPathSegments[0]?.startsWith(".temp-pages-");
  const allowedTempOutput = isPathInside(tempRoot, outputDirectory);
  if (!allowedRepoOutput && !allowedRepoTestOutput && !allowedTempOutput) {
    throw new Error(`unsafe_output_directory:${outputDirectory}`);
  }
}

function assertSourceEntrySafe(sourcePath, relativePath) {
  const normalizedRelativePath = relativePath.split(path.sep).join("/");
  if (excludedPublicEntries.has(normalizedRelativePath)) {
    return;
  }
  const sourceStat = fs.lstatSync(sourcePath);
  if (sourceStat.isSymbolicLink()) {
    throw new Error(`symbolic_link_forbidden:${relativePath}`);
  }
  if (!sourceStat.isDirectory()) {
    return;
  }
  for (const childName of fs.readdirSync(sourcePath).sort()) {
    assertSourceEntrySafe(path.join(sourcePath, childName), path.join(relativePath, childName));
  }
}

function copyPublicEntry(relativePath, outputDirectory) {
  const sourcePath = path.join(repoRoot, relativePath);
  const destinationPath = path.join(outputDirectory, relativePath);
  assertPathInside(repoRoot, sourcePath, relativePath);
  assertPathInside(outputDirectory, destinationPath, relativePath);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`public_entry_missing:${relativePath}`);
  }
  assertSourceEntrySafe(sourcePath, relativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.cpSync(sourcePath, destinationPath, {
    dereference: false,
    errorOnExist: false,
    filter: (source) => {
      const sourceRelativePath = path.relative(repoRoot, source).split(path.sep).join("/");
      return !excludedPublicEntries.has(sourceRelativePath);
    },
    force: true,
    recursive: true,
  });
}

function assertForbiddenEntriesAbsent(outputDirectory) {
  for (const relativePath of forbiddenOutputEntries) {
    const destinationPath = path.join(outputDirectory, relativePath);
    assertPathInside(outputDirectory, destinationPath, relativePath);
    if (fs.existsSync(destinationPath)) {
      throw new Error(`forbidden_output_entry_present:${relativePath}`);
    }
  }
}

export function buildCloudflarePages(options = {}) {
  const outputDirectory = path.resolve(options.outputDirectory ?? defaultOutputDirectory);
  if (outputDirectory === repoRoot || outputDirectory === os.homedir()) {
    throw new Error(`unsafe_output_directory:${outputDirectory}`);
  }
  assertOutputDirectorySafe(outputDirectory);
  fs.rmSync(outputDirectory, { force: true, recursive: true });
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const relativePath of publicEntries) {
    copyPublicEntry(relativePath, outputDirectory);
  }
  assertForbiddenEntriesAbsent(outputDirectory);
  return {
    outputDirectory,
    publicEntries: [...publicEntries],
    excludedPublicEntries: [...excludedPublicEntries],
    forbiddenOutputEntries: [...forbiddenOutputEntries],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = buildCloudflarePages();
  console.log(`cloudflare pages artifact ready:${path.relative(repoRoot, result.outputDirectory)}`);
}
