/*
Purpose: verify the Cloudflare Pages artifact boundary for the Mullusi website.
Governance scope: deployment output contract, route controls, and source-disclosure prevention.
Dependencies: Node.js standard library and scripts/build-cloudflare-pages.mjs.
Invariants: required public routes exist, Cloudflare control files exist, and source/control directories are absent.
*/

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCloudflarePages } from "./build-cloudflare-pages.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

function assertExists(outputDirectory, relativePath) {
  assert.equal(fs.existsSync(path.join(outputDirectory, relativePath)), true, `expected ${relativePath}`);
}

function assertAbsent(outputDirectory, relativePath) {
  assert.equal(fs.existsSync(path.join(outputDirectory, relativePath)), false, `forbidden ${relativePath}`);
}

function testCloudflarePagesBuildArtifact() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mullusi-pages-"));
  const outputDirectory = path.join(tempRoot, "dist");
  try {
    const result = buildCloudflarePages({ outputDirectory });

    assert.equal(result.outputDirectory, outputDirectory);
    assert.ok(result.publicEntries.length >= 10);
    assert.ok(result.forbiddenOutputEntries.includes("backend"));

    for (const requiredPath of [
      "index.html",
      "mullu/index.html",
      "proof/index.html",
      "playground/index.html",
      "404.html",
      "_headers",
      "_redirects",
      ".well-known/security.txt",
      "assets/app.js",
      "assets/styles.css",
      "data/site.json",
      "data/products.json",
      "robots.txt",
      "sitemap.xml",
    ]) {
      assertExists(outputDirectory, requiredPath);
    }

    for (const forbiddenPath of [
      "backend",
      "docs",
      "ops",
      "scripts",
      ".github",
      ".git",
      ".nojekyll",
      "CNAME",
      "README.md",
      "LICENSE",
    ]) {
      assertAbsent(outputDirectory, forbiddenPath);
    }
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
}

function testBuildBlocksRepositoryRootOutput() {
  assert.throws(
    () => buildCloudflarePages({ outputDirectory: repoRoot }),
    /unsafe_output_directory/,
  );
}

function testBuildBlocksSiblingRepositoryOutput() {
  const siblingOutputDirectory = path.resolve(repoRoot, "..", "mullusi-pages-outside-test");
  assert.throws(
    () => buildCloudflarePages({ outputDirectory: siblingOutputDirectory }),
    /unsafe_output_directory/,
  );
  assert.equal(fs.existsSync(siblingOutputDirectory), false);
}

function testBuildResultDoesNotExposeMutableRegistry() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mullusi-pages-registry-"));
  try {
    const firstOutputDirectory = path.join(tempRoot, "first");
    const firstResult = buildCloudflarePages({ outputDirectory: firstOutputDirectory });
    firstResult.publicEntries.push("backend");
    firstResult.forbiddenOutputEntries.length = 0;

    const secondOutputDirectory = path.join(tempRoot, "second");
    const secondResult = buildCloudflarePages({ outputDirectory: secondOutputDirectory });

    assert.equal(secondResult.publicEntries.includes("backend"), false);
    assert.equal(secondResult.forbiddenOutputEntries.includes("backend"), true);
    assertAbsent(secondOutputDirectory, "backend");
    assertExists(secondOutputDirectory, "_headers");
    assertExists(secondOutputDirectory, "_redirects");
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
}

testCloudflarePagesBuildArtifact();
testBuildBlocksRepositoryRootOutput();
testBuildBlocksSiblingRepositoryOutput();
testBuildResultDoesNotExposeMutableRegistry();
console.log("cloudflare pages build test passed");
