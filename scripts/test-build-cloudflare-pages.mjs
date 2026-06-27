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
import {
  buildCloudflarePages,
  publicBuildErrorCode,
  runBuildCloudflarePagesCli,
} from "./build-cloudflare-pages.mjs";

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
    const result = buildCloudflarePages({ outputDirectory, buildDate: "2026-06-04T12:00:00Z" });

    assert.equal(result.outputDirectory, outputDirectory);
    assert.ok(result.publicEntries.length >= 10);
    assert.ok(result.excludedPublicEntries.includes("data/products.json"));
    assert.ok(result.excludedPublicEntries.includes("data/generated/products-compat.json"));
    assert.ok(result.forbiddenOutputEntries.includes("backend"));

    for (const requiredPath of [
      "index.html",
      "doctrine/index.html",
      "mullu/index.html",
      "search/index.html",
      "browse/index.html",
      "proof/index.html",
      "playground/index.html",
      "contact/index.html",
      "portfolio/index.html",
      "pilot/index.html",
      "status/index.html",
      "security/index.html",
      "privacy/index.html",
      "terms/index.html",
      "acceptable-use/index.html",
      "responsible-disclosure/index.html",
      "404.html",
      "_headers",
      "_redirects",
      ".well-known/security.txt",
      "assets/fragment-bootstrap.js",
      "assets/app.js",
      "assets/runtime/page-runtime.js",
      "assets/runtime/preference-runtime.js",
      "assets/runtime/substrate-runtime.js",
      "assets/runtime/homepage-lifecycle-plan.js",
      "assets/runtime/homepage-controller.js",
      "assets/runtime/homepage-context.js",
      "assets/registry/homepage-registry.js",
      "assets/render/site-content.js",
      "assets/render/public-surface-registry.js",
      "assets/render/product-registry.js",
      "assets/render/news-activity.js",
      "assets/styles.css",
      "assets/pages/product-shell.css",
      "assets/pages/trust.css",
      "assets/pages/route-preferences.js",
      "assets/pages/playground-simulator.js",
      "assets/pages/proof-renderer.js",
      "data/site.json",
      "data/manual/public-surfaces.json",
      "data/generated/products.json",
      "data/generated/homepage-product-registry.json",
      "data/generated/claim-registry.json",
      "data/generated/runtime-witness-index.json",
      "robots.txt",
      "sitemap.xml",
      "status.json",
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
      "data/products.json",
      "data/generated/products-compat.json",
    ]) {
      assertAbsent(outputDirectory, forbiddenPath);
    }

    const i18n = JSON.parse(fs.readFileSync(path.join(outputDirectory, "data/i18n.json"), "utf8"));
    const lastUpdated = i18n.strings["hero.lastUpdated"];
    assert.equal(lastUpdated.en, "Last updated 2026-06-04");
    assert.equal(lastUpdated.am, "የመጨረሻ ዝመና 2026-06-04");
    assert.match(lastUpdated.am, /[\u1200-\u137F]/);
    assert.doesNotMatch(lastUpdated.am, /[\u00C0-\u00FF]{2,}/);
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

function createWritableCapture() {
  let capturedText = "";
  return {
    stream: {
      write(chunk) {
        capturedText += String(chunk);
      },
    },
    text() {
      return capturedText;
    },
  };
}

function testPublicBuildErrorCodeRedactsFailureDetails() {
  const unsafeOutputDirectory = path.resolve(repoRoot, "..", "mullusi-pages-outside-test");

  assert.equal(publicBuildErrorCode(new Error(`unsafe_output_directory:${unsafeOutputDirectory}`)), "unsafe_output_directory");
  assert.equal(publicBuildErrorCode(new Error("path_boundary_violation:index.html:C:\\private\\repo\\index.html")), "path_boundary_violation");
  assert.equal(publicBuildErrorCode(new Error("symbolic_link_forbidden:assets/private-link")), "symbolic_link_forbidden");
  assert.equal(publicBuildErrorCode(new Error("public_entry_missing:private-entry")), "public_entry_missing");
  assert.equal(publicBuildErrorCode(new Error("forbidden_output_entry_present:backend")), "forbidden_output_entry_present");
  assert.equal(publicBuildErrorCode(Object.assign(new Error("EBUSY: resource busy or locked, rmdir 'dist'"), { code: "EBUSY" })), "output_directory_busy");
  assert.equal(publicBuildErrorCode(new Error(`unexpected:${unsafeOutputDirectory}`)), "cloudflare_pages_build_unavailable");
}

function testCliFailureOutputRedactsUnsafeOutputPath() {
  const unsafeOutputDirectory = path.resolve(repoRoot, "..", "mullusi-pages-outside-test");
  const stdout = createWritableCapture();
  const stderr = createWritableCapture();

  const exitCode = runBuildCloudflarePagesCli({
    outputDirectory: unsafeOutputDirectory,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });

  assert.equal(exitCode, 1);
  assert.equal(stdout.text(), "");
  assert.equal(stderr.text(), "cloudflare pages artifact failed:unsafe_output_directory\n");
  assert.doesNotMatch(stderr.text(), /mullusi-pages-outside-test/);
  assert.doesNotMatch(stderr.text(), /D:\\|C:\\|\.\./);
  assert.doesNotMatch(stderr.text(), /Error:|at\s/);
  assert.equal(fs.existsSync(unsafeOutputDirectory), false);
}

function testCliSuccessOutputKeepsArtifactPathPrivate() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mullusi-pages-cli-"));
  const outputDirectory = path.join(tempRoot, "dist");
  const stdout = createWritableCapture();
  const stderr = createWritableCapture();
  try {
    const exitCode = runBuildCloudflarePagesCli({
      outputDirectory,
      buildDate: "2026-06-04T12:00:00Z",
      stdout: stdout.stream,
      stderr: stderr.stream,
    });

    assert.equal(exitCode, 0);
    assert.equal(stdout.text(), "cloudflare pages artifact ready\n");
    assert.equal(stderr.text(), "");
    assert.doesNotMatch(stdout.text(), /mullusi-pages-cli-|D:\\|C:\\|dist/);
    assertExists(outputDirectory, "index.html");
    assertExists(outputDirectory, "_headers");
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
}

testCloudflarePagesBuildArtifact();
testBuildBlocksRepositoryRootOutput();
testBuildBlocksSiblingRepositoryOutput();
testBuildResultDoesNotExposeMutableRegistry();
testPublicBuildErrorCodeRedactsFailureDetails();
testCliFailureOutputRedactsUnsafeOutputPath();
testCliSuccessOutputKeepsArtifactPathPrivate();
console.log("cloudflare pages build test passed");
