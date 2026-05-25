/*
Purpose: test live deployment-integrity evaluation without network access.
Governance scope: live status-manifest consistency, local deployment drift evidence, governed path validation, and public-safe output.
Dependencies: Node.js standard library and scripts/check-live-deployment-integrity.mjs.
Invariants: tests use local fixtures only and never call public networks or record response bodies.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJsonContentHash,
  canonicalTextContentHash,
  evaluateDeploymentIntegrityEvidence,
  formatResult,
  governedHashPaths,
  publicFileContentHash,
} from "./check-live-deployment-integrity.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const checkerScript = path.join(scriptsDir, "check-live-deployment-integrity.mjs");

function fixtureFileContent(relativePath) {
  if (relativePath === "index.html") return "<!doctype html>\n<title>Mullusi</title>\n";
  return JSON.stringify({ meta: { artifact: relativePath, content_hash: "sha256:placeholder" }, value: relativePath });
}

function fixtureHashes(overrides = {}) {
  return Object.fromEntries(governedHashPaths.map((relativePath) => [
    relativePath,
    overrides[relativePath] ?? publicFileContentHash(relativePath, fixtureFileContent(relativePath)),
  ]));
}

function fixtureStatusJson(hashes = fixtureHashes()) {
  return JSON.stringify({ site: "mullusi.com", public_state: "Published", content_hashes: hashes });
}

function fixtureEvidence({ liveHashes = fixtureHashes(), localHashes = liveHashes, fileOverrides = {} } = {}) {
  return {
    localStatusJson: fixtureStatusJson(localHashes),
    liveStatusResponse: { finalUrl: "https://mullusi.com/status.json", statusCode: 200, body: fixtureStatusJson(liveHashes) },
    liveFileResponses: new Map(Object.keys(liveHashes).map((relativePath) => [
      relativePath,
      {
        finalUrl: relativePath === "index.html" ? "https://mullusi.com/" : `https://mullusi.com/${relativePath}`,
        statusCode: 200,
        body: fileOverrides[relativePath] ?? fixtureFileContent(relativePath),
      },
    ])),
    routeSentinelResponses: new Map([
      [
        "browse_docs_route",
        {
          finalUrl: "https://mullusi.com/browse/",
          statusCode: 200,
          body: '<a href="https://docs.mullusi.com/">Docs</a>',
        },
      ],
      [
        "search_docs_route",
        {
          finalUrl: "https://mullusi.com/search/",
          statusCode: 200,
          body: '<a href="https://docs.mullusi.com/docs/search.html">Search docs</a>',
        },
      ],
    ]),
  };
}

function runChecker(args) {
  return spawnSync(process.execPath, [checkerScript, ...args], { cwd: repoRoot, encoding: "utf8" });
}

function testCanonicalHashesIgnoreJsonMetaContentHash() {
  const jsonWithHashA = JSON.stringify({ meta: { content_hash: "sha256:a" }, value: ["x"] });
  const jsonWithHashB = JSON.stringify({ meta: { content_hash: "sha256:b" }, value: ["x"] });
  const htmlWithCloudflareEmail =
    '<a href="/cdn-cgi/l/email-protection#e48c8188888ba48991888891978dca878b89"><span class="__cf_email__" data-cfemail="f49c9198989bb49981989881879dda979b99">[email&#160;protected]</span></a><script data-cfasync="false" src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script>';
  const htmlWithPlainEmail = '<a href="mailto:hello@mullusi.com">hello@mullusi.com</a>';
  const htmlWithBeacon = '<title>Mullusi</title><script defer src="https://static.cloudflareinsights.com/beacon.min.js/v1"></script>';

  assert.equal(canonicalJsonContentHash(jsonWithHashA), canonicalJsonContentHash(jsonWithHashB));
  assert.equal(canonicalTextContentHash("a\r\nb\r\n"), canonicalTextContentHash("a\nb\n"));
  assert.equal(canonicalTextContentHash(htmlWithCloudflareEmail), canonicalTextContentHash(htmlWithPlainEmail));
  assert.equal(canonicalTextContentHash(htmlWithBeacon), canonicalTextContentHash("<title>Mullusi</title>"));
  assert.throws(() => canonicalTextContentHash('<a href="/cdn-cgi/l/email-protection#zz">[email protected]</a>'), /cloudflare_email_obfuscation_unhandled/);
  assert.match(canonicalJsonContentHash(jsonWithHashA), /^sha256:[a-f0-9]{64}$/);
}

function testMatchingLiveManifestPasses() {
  const result = evaluateDeploymentIntegrityEvidence(fixtureEvidence());
  const formatted = formatResult(result);

  assert.equal(result.verdict, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.liveContentHashes, "Pass");
  assert.equal(result.localStatusManifestMatch, "Pass");
  assert.equal(result.edgeHtmlTransform, "Pass");
  assert.equal(result.routeSentinels, "Pass");
  assert.equal(result.routeSentinelCount, 2);
  assert.equal(result.hardFindings.length, 0);
  assert.match(formatted, /^finding=none$/m);
  assert.match(formatted, /^route_sentinel=browse_docs_route:Pass:200$/m);
  assert.match(formatted, /^raw_response_bodies=not_recorded$/m);
}

function testLiveContentHashMismatchBlocks() {
  const result = evaluateDeploymentIntegrityEvidence(fixtureEvidence({
    fileOverrides: { "index.html": "<!doctype html>\n<title>Changed</title>\n" },
  }));

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.liveContentHashes, "Fail");
  assert.ok(result.hardFindings.includes("live_content_hash_mismatch:index.html"));
}

function testKnownCloudflareHtmlTransformNormalizes() {
  const result = evaluateDeploymentIntegrityEvidence(fixtureEvidence({
    fileOverrides: {
      "index.html": '<!doctype html>\n<title>Mullusi</title>\n<script defer src="https://static.cloudflareinsights.com/beacon.min.js/v1"></script>',
    },
  }));

  assert.equal(result.verdict, "SolvedVerified");
  assert.equal(result.proofState, "Pass");
  assert.equal(result.liveContentHashes, "Pass");
  assert.equal(result.edgeHtmlTransform, "Pass");
  assert.equal(result.localStatusManifestMatch, "Pass");
  assert.equal(result.routeSentinels, "Pass");
  assert.deepEqual(result.hardFindings, []);
  assert.deepEqual(result.softFindings, []);
}

function testCloudflareTransformWithContentDriftBlocks() {
  const result = evaluateDeploymentIntegrityEvidence(fixtureEvidence({
    fileOverrides: {
      "index.html": '<!doctype html>\n<title>Changed</title>\n<script defer src="https://static.cloudflareinsights.com/beacon.min.js/v1"></script>',
    },
  }));

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.liveContentHashes, "Fail");
  assert.equal(result.edgeHtmlTransform, "Fail");
  assert.ok(result.hardFindings.includes("live_html_edge_transform_unverified:index.html"));
  assert.ok(result.hardFindings.includes("live_content_hash_mismatch:index.html"));
}

function testCloudflareTransformWithContentDriftBlocks() {
  const result = evaluateDeploymentIntegrityEvidence(fixtureEvidence({
    fileOverrides: {
      "index.html": '<!doctype html>\n<title>Changed</title>\n<script defer src="https://static.cloudflareinsights.com/beacon.min.js/v1"></script>',
    },
  }));

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.liveContentHashes, "Fail");
  assert.equal(result.edgeHtmlTransform, "Fail");
  assert.ok(result.hardFindings.includes("live_html_edge_transform_unverified:index.html"));
  assert.ok(result.hardFindings.includes("live_content_hash_mismatch:index.html"));
}

function testRouteSentinelDriftBlocks() {
  const evidence = fixtureEvidence();
  evidence.routeSentinelResponses.set("browse_docs_route", {
    finalUrl: "https://mullusi.com/browse/",
    statusCode: 200,
    body: '<a href="https://docs.mullusi.com/browse">Dead docs route</a>',
  });
  const result = evaluateDeploymentIntegrityEvidence(evidence);

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.equal(result.routeSentinels, "Fail");
  assert.ok(result.hardFindings.includes("route_sentinel_forbidden_term_present:browse_docs_route:https://docs.mullusi.com/browse"));
}

function testLocalManifestMismatchAwaitsEvidenceOnly() {
  const localHashes = fixtureHashes({ "index.html": "sha256:0000000000000000000000000000000000000000000000000000000000000000" });
  const result = evaluateDeploymentIntegrityEvidence(fixtureEvidence({ localHashes }));

  assert.equal(result.verdict, "AwaitingEvidence");
  assert.equal(result.proofState, "Unknown");
  assert.equal(result.liveContentHashes, "Pass");
  assert.equal(result.localStatusManifestMatch, "AwaitingEvidence");
  assert.deepEqual(result.hardFindings, []);
  assert.ok(result.softFindings.includes("local_status_manifest_mismatch"));
}

function testUnexpectedOrInvalidHashPathBlocks() {
  const result = evaluateDeploymentIntegrityEvidence(fixtureEvidence({ liveHashes: { ...fixtureHashes(), "../private.txt": "sha256:abc" } }));

  assert.equal(result.verdict, "GovernanceBlocked");
  assert.equal(result.proofState, "Fail");
  assert.ok(result.hardFindings.includes("live_status_hash_path_invalid:../private.txt"));
}

function testUnexpectedLiveHashPathAwaitsEvidence() {
  const liveHashes = {
    ...fixtureHashes(),
    "data/products.json": publicFileContentHash("data/products.json", fixtureFileContent("data/products.json")),
  };
  const result = evaluateDeploymentIntegrityEvidence(fixtureEvidence({ liveHashes }));

  assert.equal(result.verdict, "AwaitingEvidence");
  assert.equal(result.proofState, "Unknown");
  assert.equal(result.liveContentHashes, "Pass");
  assert.ok(result.softFindings.includes("live_status_hash_path_unexpected:data/products.json"));
}

function testMissingGovernedHashAwaitsEvidence() {
  const liveHashes = fixtureHashes();
  delete liveHashes["data/site.json"];
  const result = evaluateDeploymentIntegrityEvidence(fixtureEvidence({ liveHashes }));

  assert.equal(result.verdict, "AwaitingEvidence");
  assert.equal(result.proofState, "Unknown");
  assert.equal(result.liveContentHashes, "Pass");
  assert.ok(result.softFindings.includes("live_status_hash_missing:data/site.json"));
}

function testCliRejectsUnsupportedArgumentWithoutNetwork() {
  const result = runChecker(["--unexpected"]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /verdict=GovernanceBlocked/);
  assert.match(result.stdout, /proof_state=Fail/);
  assert.match(result.stdout, /error=unsupported_args:--unexpected/);
}

testCanonicalHashesIgnoreJsonMetaContentHash();
testMatchingLiveManifestPasses();
testLiveContentHashMismatchBlocks();
testKnownCloudflareHtmlTransformNormalizes();
testCloudflareTransformWithContentDriftBlocks();
testRouteSentinelDriftBlocks();
testLocalManifestMismatchAwaitsEvidenceOnly();
testUnexpectedOrInvalidHashPathBlocks();
testUnexpectedLiveHashPathAwaitsEvidence();
testMissingGovernedHashAwaitsEvidence();
testCliRejectsUnsupportedArgumentWithoutNetwork();

console.log("live deployment integrity tests passed");
