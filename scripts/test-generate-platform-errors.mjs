/*
Purpose: test public-safe generate-platform read error classification.
Governance scope: generated artifact validation, manifest read failures, JSON parse failures, path-boundary failures, and no private path leakage.
Dependencies: Node.js standard library and scripts/generate-platform.mjs.
Invariants: tests use synthetic errors only; they never read secrets, private recovery files, provider accounts, host addresses, database URLs, or live deployment state.
*/

import assert from "node:assert/strict";
import { publicJsonReadErrorCode } from "./generate-platform.mjs";

function testPublicJsonReadErrorCodeRedactsRawValues() {
  const boundary = publicJsonReadErrorCode(new Error("path_boundary_violation:../private/registry.json"));
  const missing = publicJsonReadErrorCode(new Error("ENOENT: no such file or directory, open 'C:\\secret\\manifest.json'"));
  const syntax = publicJsonReadErrorCode(new SyntaxError("Unexpected token in private JSON"));
  const fallback = publicJsonReadErrorCode(new Error("unexpected local path D:\\private\\manifest.json"));
  const joined = [boundary, missing, syntax, fallback].join("\n");

  assert.equal(boundary, "path_boundary_violation");
  assert.equal(missing, "file_unavailable");
  assert.equal(syntax, "json_invalid");
  assert.equal(fallback, "read_unavailable");
  assert.doesNotMatch(joined, /private|secret|manifest|registry|C:\\|D:\\/);
}

testPublicJsonReadErrorCodeRedactsRawValues();

console.log("generate platform error tests passed");
