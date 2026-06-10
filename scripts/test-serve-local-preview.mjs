/*
Purpose: verify the local preview server preserves Mullusi static artifact routing and 404 fallback behavior.
Governance scope: local preview route resolution, missing-route status, extensionless route handling, and traversal rejection.
Dependencies: Node.js standard library, scripts/build-cloudflare-pages.mjs, and scripts/serve-local-preview.mjs.
Invariants: missing routes resolve to 404.html with status 404 and paths outside dist are blocked.
*/

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildCloudflarePages } from "./build-cloudflare-pages.mjs";
import { resolveStaticResponse } from "./serve-local-preview.mjs";

function makeArtifact() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mullusi-preview-"));
  const distDirectory = path.join(tempRoot, "dist");
  buildCloudflarePages({ outputDirectory: distDirectory, buildDate: "2026-06-09T12:00:00Z" });
  return { distDirectory, tempRoot };
}

function testExistingRouteResolvesIndex() {
  const { distDirectory, tempRoot } = makeArtifact();
  try {
    const result = resolveStaticResponse({ distDirectory, requestUrl: "/" });

    assert.equal(result.statusCode, 200);
    assert.equal(path.basename(result.filePath), "index.html");
    assert.equal(result.contentType, "text/html; charset=utf-8");
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
}

function testExtensionlessRouteResolvesRouteIndex() {
  const { distDirectory, tempRoot } = makeArtifact();
  try {
    const result = resolveStaticResponse({ distDirectory, requestUrl: "/mullu" });

    assert.equal(result.statusCode, 200);
    assert.equal(result.filePath, path.join(distDirectory, "mullu", "index.html"));
    assert.equal(result.contentType, "text/html; charset=utf-8");
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
}

function testMissingRouteReturnsBranded404() {
  const { distDirectory, tempRoot } = makeArtifact();
  try {
    const result = resolveStaticResponse({ distDirectory, requestUrl: "/reserved/not-published?x=1" });

    assert.equal(result.statusCode, 404);
    assert.equal(result.filePath, path.join(distDirectory, "404.html"));
    assert.equal(result.contentType, "text/html; charset=utf-8");
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
}

function testTraversalIsBlocked() {
  const { distDirectory, tempRoot } = makeArtifact();
  try {
    const result = resolveStaticResponse({ distDirectory, requestUrl: "/../package.json" });

    assert.equal(result.statusCode, 403);
    assert.equal(result.filePath, null);
    assert.equal(result.body, "Route boundary violation");
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
}

function testMalformedPathReturnsBadRequest() {
  const { distDirectory, tempRoot } = makeArtifact();
  try {
    const result = resolveStaticResponse({ distDirectory, requestUrl: "/%E0%A4%A" });

    assert.equal(result.statusCode, 400);
    assert.equal(result.filePath, null);
    assert.equal(result.body, "Bad request");
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
}

testExistingRouteResolvesIndex();
testExtensionlessRouteResolvesRouteIndex();
testMissingRouteReturnsBranded404();
testTraversalIsBlocked();
testMalformedPathReturnsBadRequest();
console.log("local preview server tests passed");
