/*
Purpose: test public-safe news refresh error classification.
Governance scope: public news refresh diagnostics, network failure redaction, file-write failure redaction, and no private path leakage.
Dependencies: Node.js standard library and scripts/fetch-news.mjs.
Invariants: tests use synthetic errors only; they never contact news APIs, provider accounts, host addresses, database URLs, private recovery files, or secret values.
*/

import assert from "node:assert/strict";
import { publicNewsErrorCode } from "./fetch-news.mjs";

function testPublicNewsErrorCodeRedactsRawValues() {
  const timeout = publicNewsErrorCode(Object.assign(new Error("The operation timed out after 15000ms"), { name: "AbortError" }));
  const network = publicNewsErrorCode(new Error("fetch failed: socket hang up"));
  const file = publicNewsErrorCode(new Error("EACCES: permission denied, open 'C:\\secret\\news.json'"));
  const fallback = publicNewsErrorCode(new Error("unexpected private refresh failure"));
  const joined = [timeout, network, file, fallback].join("\n");

  assert.equal(timeout, "news_request_timeout");
  assert.equal(network, "news_fetch_unavailable");
  assert.equal(file, "news_file_unavailable");
  assert.equal(fallback, "news_file_unavailable");
  assert.doesNotMatch(joined, /private|secret|news\.json|15000|C:\\|example/);
}

testPublicNewsErrorCodeRedactsRawValues();

console.log("news fetch error tests passed");
