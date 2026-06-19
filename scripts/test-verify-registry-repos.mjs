/*
Purpose: test public-safe registry boundary verifier error classification.
Governance scope: registry source-boundary validation, read/parse failure redaction, and no private path leakage.
Dependencies: Node.js standard library and scripts/verify-registry-repos.mjs.
Invariants: tests use synthetic errors only; they never read private registry sources, provider accounts, host addresses, database URLs, or secret values.
*/

import assert from "node:assert/strict";
import {
  publicRegistryHrefLabel,
  publicRegistryScalarLabel,
  publicReadErrorCode,
  publicRegistryBoundaryError,
} from "./verify-registry-repos.mjs";

function testPublicReadErrorCodeRedactsRawExceptionValues() {
  const missing = publicReadErrorCode(new Error("ENOENT: no such file or directory, open 'C:\\secret\\public-surfaces.json'"));
  const invalidJson = publicReadErrorCode(new SyntaxError("Unexpected token in private registry JSON"));
  const fallback = publicReadErrorCode(new Error("unexpected local path D:\\private\\registry.json"));
  const joined = [missing, invalidJson, fallback].join("\n");

  assert.equal(missing, "file_unavailable");
  assert.equal(invalidJson, "json_invalid");
  assert.equal(fallback, "read_unavailable");
  assert.doesNotMatch(joined, /secret|private|registry|public-surfaces|C:\\|D:\\/);
}

function testPublicRegistryBoundaryErrorAllowsOnlyBoundedCategories() {
  const knownRead = publicRegistryBoundaryError(new Error("manual_public_surfaces_read_failed:file_unavailable"));
  const knownShape = publicRegistryBoundaryError(new Error("manual_systems_not_array"));
  const unknown = publicRegistryBoundaryError(new Error("manual_public_surfaces_read_failed:C:\\secret\\public-surfaces.json"));
  const joined = [knownRead, knownShape, unknown].join("\n");

  assert.equal(knownRead, "manual_public_surfaces_read_failed:file_unavailable");
  assert.equal(knownShape, "manual_systems_not_array");
  assert.equal(unknown, "registry_boundary_unavailable");
  assert.doesNotMatch(joined, /secret|public-surfaces|C:\\/);
}

function testPublicRegistryLabelsRedactUnsafeValues() {
  const publicHref = publicRegistryHrefLabel("https://dashboard.mullusi.com/status");
  const privateHref = publicRegistryHrefLabel("https://github.com/private/repo?trace=bounded");
  const missingHref = publicRegistryHrefLabel("");
  const safeScalar = publicRegistryScalarLabel("private-source");
  const unsafeScalar = publicRegistryScalarLabel("private/repo trace");
  const joined = [publicHref, privateHref, missingHref, safeScalar, unsafeScalar].join("\n");

  assert.equal(publicHref, "https://dashboard.mullusi.com/status");
  assert.equal(privateHref, "redacted_url");
  assert.equal(missingHref, "missing");
  assert.equal(safeScalar, "private-source");
  assert.equal(unsafeScalar, "redacted_value");
  assert.doesNotMatch(joined, /github\.com|private\/repo|trace=bounded/);
}

testPublicReadErrorCodeRedactsRawExceptionValues();
testPublicRegistryBoundaryErrorAllowsOnlyBoundedCategories();
testPublicRegistryLabelsRedactUnsafeValues();

console.log("registry boundary verifier tests passed");
