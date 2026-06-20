/*
Purpose: verify www canonical redirect gate evaluation.
Governance scope: source redirect rule detection, live witness closure, CLI fail-closed behavior, and pending-state fail-closed behavior.
Dependencies: Node.js standard library and scripts/check-www-canonical-redirect-gate.mjs.
Invariants: tests use fixed fixtures and do not require network access.
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateWwwCanonicalRedirectGate, formatResult } from "./check-www-canonical-redirect-gate.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const gateScript = path.join(scriptsDir, "check-www-canonical-redirect-gate.mjs");
const redirectRule = "https://www.mullusi.com/* https://mullusi.com/:splat 301";
const rootTarget = "https://www.mullusi.com/";
const pathQueryTarget = "https://www.mullusi.com/proof/?gate=www-canonical";

function witness({ targetUrl = rootTarget, finalUrl, verdict, proofState, redirectCount, firstRedirectStatus = "", firstRedirectUrl = "" }) {
  const observedRedirectCount = redirectCount ?? (firstRedirectStatus ? "1" : "0");
  return `
target=${targetUrl}
final_url=${finalUrl}
status=200
redirect_count=${observedRedirectCount}
first_redirect_status=${firstRedirectStatus}
first_redirect_url=${firstRedirectUrl}
server=cloudflare
verdict=${verdict}
proof_state=${proofState}
github_request=
fastly_request=
served_by=
via=
`;
}

function readyWitness() {
  return `${witness({
    targetUrl: rootTarget,
    finalUrl: "https://mullusi.com/",
    verdict: "CloudflareOriginCandidate",
    proofState: "Pass",
    firstRedirectStatus: "301",
    firstRedirectUrl: "https://mullusi.com/",
  })}

${witness({
    targetUrl: pathQueryTarget,
    finalUrl: "https://mullusi.com/proof/?gate=www-canonical",
    verdict: "CloudflareOriginCandidate",
    proofState: "Pass",
    firstRedirectStatus: "301",
    firstRedirectUrl: "https://mullusi.com/proof/?gate=www-canonical",
  })}`;
}

function originCheckerWitness({ targetUrl = rootTarget, finalUrl, verdict, proofState, redirectCount, firstRedirectStatus = "", firstRedirectUrl = "" }) {
  const observedRedirectCount = redirectCount ?? (firstRedirectStatus ? "1" : "0");
  return `
verdict=${verdict}
proof_state=${proofState}
summary=No GitHub Pages origin markers were found in the response headers.
target=${targetUrl}
final_url=${finalUrl}
status=200
redirect_count=${observedRedirectCount}
first_redirect_status=${firstRedirectStatus}
first_redirect_url=${firstRedirectUrl}
server=cloudflare
github_request=
fastly_request=
served_by=
via=
`;
}

function writeFixtureFiles({ redirects = redirectRule, witness: witnessText }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mullusi-www-gate-"));
  const redirectsFile = path.join(tempDir, "_redirects");
  const witnessFile = path.join(tempDir, "website-origin-witness.md");
  fs.writeFileSync(redirectsFile, redirects, "utf8");
  fs.writeFileSync(witnessFile, witnessText, "utf8");
  return { tempDir, redirectsFile, witnessFile };
}

function runGateCli(args) {
  return spawnSync(process.execPath, [gateScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function testReadyWhenSourceRuleAndApexWitnessPass() {
  const result = evaluateWwwCanonicalRedirectGate({
    redirects: redirectRule,
    witness: readyWitness(),
  });

  assert.equal(result.state, "Ready");
  assert.equal(result.reason, "www_redirect_verified");
  assert.equal(result.sourceRule, "present");
  assert.equal(result.finalUrl, "https://mullusi.com/");
  assert.equal(result.pathQueryFinalUrl, "https://mullusi.com/proof/?gate=www-canonical");
  assert.equal(result.targetResults.length, 2);
}

function testReadyWhenOriginCheckerOutputOrderPasses() {
  const result = evaluateWwwCanonicalRedirectGate({
    redirects: redirectRule,
    witness: `${originCheckerWitness({
      finalUrl: "https://mullusi.com/",
      verdict: "CloudflareOriginCandidate",
      proofState: "Pass",
      firstRedirectStatus: "301",
      firstRedirectUrl: "https://mullusi.com/",
    })}

${originCheckerWitness({
      targetUrl: pathQueryTarget,
      finalUrl: "https://mullusi.com/proof/?gate=www-canonical",
      verdict: "CloudflareOriginCandidate",
      proofState: "Pass",
      firstRedirectStatus: "301",
      firstRedirectUrl: "https://mullusi.com/proof/?gate=www-canonical",
    })}`,
  });

  assert.equal(result.state, "Ready");
  assert.equal(result.reason, "www_redirect_verified");
  assert.equal(result.verdict, "CloudflareOriginCandidate");
  assert.equal(result.proofState, "Pass");
}

function testPendingWhenLiveWitnessDoesNotRedirectToApex() {
  const result = evaluateWwwCanonicalRedirectGate({
    redirects: redirectRule,
    witness: `${witness({
      finalUrl: "https://www.mullusi.com/",
      verdict: "CanonicalRedirectPending",
      proofState: "Unknown",
    })}

${witness({
      targetUrl: pathQueryTarget,
      finalUrl: "https://www.mullusi.com/proof/?gate=www-canonical",
      verdict: "CanonicalRedirectPending",
      proofState: "Unknown",
    })}`,
  });

  assert.equal(result.state, "AwaitingEvidence");
  assert.equal(result.reason, "canonical_redirect_pending");
  assert.equal(result.sourceRule, "present");
  assert.equal(result.verdict, "CanonicalRedirectPending");
  assert.equal(result.pathQueryFinalUrl, "https://www.mullusi.com/proof/?gate=www-canonical");
}

function testDuplicateWitnessBlocksBlockClosure() {
  const result = evaluateWwwCanonicalRedirectGate({
    redirects: redirectRule,
    witness: `${readyWitness()}

${witness({
      targetUrl: rootTarget,
      finalUrl: "https://www.mullusi.com/",
      verdict: "CanonicalRedirectPending",
      proofState: "Unknown",
    })}`,
  });

  assert.equal(result.state, "AwaitingEvidence");
  assert.equal(result.reason, "canonical_redirect_pending");
  assert.equal(result.targetResults[0].witnessBlockCount, "2");
  assert.equal(result.targetResults[0].ready, false);
  assert.equal(result.targetResults[1].witnessBlockCount, "1");
  assert.equal(result.targetResults[1].ready, true);
}

function testDuplicateReadyWitnessBlocksBlockClosure() {
  const result = evaluateWwwCanonicalRedirectGate({
    redirects: redirectRule,
    witness: `${readyWitness()}

${witness({
      targetUrl: pathQueryTarget,
      finalUrl: "https://mullusi.com/proof/?gate=www-canonical",
      verdict: "CloudflareOriginCandidate",
      proofState: "Pass",
      firstRedirectStatus: "301",
      firstRedirectUrl: "https://mullusi.com/proof/?gate=www-canonical",
    })}`,
  });

  assert.equal(result.state, "AwaitingEvidence");
  assert.equal(result.reason, "canonical_redirect_pending");
  assert.equal(result.targetResults[0].witnessBlockCount, "1");
  assert.equal(result.targetResults[0].ready, true);
  assert.equal(result.targetResults[1].witnessBlockCount, "2");
  assert.equal(result.targetResults[1].ready, false);
}

function testMissingSourceRuleBlocksEvenWhenWitnessLooksReady() {
  const result = evaluateWwwCanonicalRedirectGate({
    redirects: "",
    witness: readyWitness(),
  });

  assert.equal(result.state, "AwaitingEvidence");
  assert.equal(result.reason, "source_redirect_rule_missing");
  assert.equal(result.sourceRule, "missing");
  assert.equal(result.proofState, "Pass");
}

function testCommentedSourceRuleDoesNotSatisfyGate() {
  const result = evaluateWwwCanonicalRedirectGate({
    redirects: `# ${redirectRule}`,
    witness: readyWitness(),
  });

  assert.equal(result.state, "AwaitingEvidence");
  assert.equal(result.reason, "source_redirect_rule_missing");
  assert.equal(result.sourceRule, "missing");
  assert.equal(result.targetResults.every((targetResult) => targetResult.ready), true);
}

function testEmbeddedSourceRuleDoesNotSatisfyGate() {
  const result = evaluateWwwCanonicalRedirectGate({
    redirects: `https://example.com/* ${redirectRule}`,
    witness: readyWitness(),
  });

  assert.equal(result.state, "AwaitingEvidence");
  assert.equal(result.reason, "source_redirect_rule_missing");
  assert.equal(result.sourceRule, "missing");
  assert.equal(result.targetResults.every((targetResult) => targetResult.ready), true);
}

function testMissingPermanentRedirectStatusBlocksClosure() {
  const result = evaluateWwwCanonicalRedirectGate({
    redirects: redirectRule,
    witness: `${witness({
      finalUrl: "https://mullusi.com/",
      verdict: "CloudflareOriginCandidate",
      proofState: "Pass",
    })}

${witness({
      targetUrl: pathQueryTarget,
      finalUrl: "https://mullusi.com/proof/?gate=www-canonical",
      verdict: "CloudflareOriginCandidate",
      proofState: "Pass",
      firstRedirectStatus: "301",
      firstRedirectUrl: "https://mullusi.com/proof/?gate=www-canonical",
    })}`,
  });

  assert.equal(result.state, "AwaitingEvidence");
  assert.equal(result.reason, "canonical_redirect_pending");
  assert.equal(result.targetResults[0].firstRedirectStatus, "");
  assert.equal(result.targetResults[0].ready, false);
}

function testTemporaryRedirectStatusBlocksClosure() {
  const result = evaluateWwwCanonicalRedirectGate({
    redirects: redirectRule,
    witness: `${witness({
      finalUrl: "https://mullusi.com/",
      verdict: "CanonicalRedirectStatusMismatch",
      proofState: "Fail",
      firstRedirectStatus: "302",
      firstRedirectUrl: "https://mullusi.com/",
    })}

${witness({
      targetUrl: pathQueryTarget,
      finalUrl: "https://mullusi.com/proof/?gate=www-canonical",
      verdict: "CloudflareOriginCandidate",
      proofState: "Pass",
      firstRedirectStatus: "301",
      firstRedirectUrl: "https://mullusi.com/proof/?gate=www-canonical",
    })}`,
  });

  assert.equal(result.state, "AwaitingEvidence");
  assert.equal(result.reason, "canonical_redirect_pending");
  assert.equal(result.targetResults[0].firstRedirectStatus, "302");
  assert.equal(result.targetResults[0].ready, false);
}

function testMultiHopRedirectCountBlocksClosure() {
  const result = evaluateWwwCanonicalRedirectGate({
    redirects: redirectRule,
    witness: `${witness({
      finalUrl: "https://mullusi.com/",
      verdict: "CanonicalRedirectChainMismatch",
      proofState: "Fail",
      redirectCount: "2",
      firstRedirectStatus: "301",
      firstRedirectUrl: "https://mullusi.com/",
    })}

${witness({
      targetUrl: pathQueryTarget,
      finalUrl: "https://mullusi.com/proof/?gate=www-canonical",
      verdict: "CloudflareOriginCandidate",
      proofState: "Pass",
      firstRedirectStatus: "301",
      firstRedirectUrl: "https://mullusi.com/proof/?gate=www-canonical",
    })}`,
  });

  assert.equal(result.state, "AwaitingEvidence");
  assert.equal(result.reason, "canonical_redirect_pending");
  assert.equal(result.targetResults[0].redirectCount, "2");
  assert.equal(result.targetResults[0].ready, false);
}

function testPathQueryMismatchBlocksClosure() {
  const result = evaluateWwwCanonicalRedirectGate({
    redirects: redirectRule,
    witness: `${witness({
      finalUrl: "https://mullusi.com/",
      verdict: "CloudflareOriginCandidate",
      proofState: "Pass",
    })}

${witness({
      targetUrl: pathQueryTarget,
      finalUrl: "https://mullusi.com/proof/",
      verdict: "CanonicalRedirectShapeMismatch",
      proofState: "Fail",
    })}`,
  });

  assert.equal(result.state, "AwaitingEvidence");
  assert.equal(result.reason, "canonical_redirect_pending");
  assert.equal(result.pathQueryFinalUrl, "https://mullusi.com/proof/");
  assert.equal(result.targetResults[1].ready, false);
}

function testPrivateWitnessValuesAreRedactedFromEvidence() {
  const privateFinalUrl = "https://internal.example.invalid/proof/?private_id=hidden";
  const privateRedirectUrl = "https://private.example.invalid/redirect?account=hidden";
  const result = evaluateWwwCanonicalRedirectGate({
    redirects: redirectRule,
    witness: `${witness({
      finalUrl: privateFinalUrl,
      verdict: "CanonicalRedirectPending/private-tenant",
      proofState: "Unknown(account-hidden)",
      firstRedirectStatus: "302",
      firstRedirectUrl: privateRedirectUrl,
    })}

${witness({
      targetUrl: pathQueryTarget,
      finalUrl: "https://mullusi.com/proof/?gate=www-canonical",
      verdict: "CloudflareOriginCandidate",
      proofState: "Pass",
      firstRedirectStatus: "301",
      firstRedirectUrl: "https://mullusi.com/proof/?gate=www-canonical",
    })}`,
  });
  const formatted = formatResult(result);
  const serialized = JSON.stringify(result);

  assert.equal(result.state, "AwaitingEvidence");
  assert.equal(result.finalUrl, "redacted_url");
  assert.equal(result.targetResults[0].firstRedirectUrl, "redacted_url");
  assert.equal(result.targetResults[0].verdict, "redacted_value");
  assert.equal(result.targetResults[0].proofState, "redacted_value");
  assert.doesNotMatch(formatted, /internal\.example\.invalid|private\.example\.invalid|private_id|account-hidden|private-tenant/);
  assert.doesNotMatch(serialized, /internal\.example\.invalid|private\.example\.invalid|private_id|account-hidden|private-tenant/);
}

function testFormattedResultIncludesPerTargetStatusAndReadiness() {
  const result = evaluateWwwCanonicalRedirectGate({
    redirects: redirectRule,
    witness: `${witness({
      finalUrl: "https://www.mullusi.com/",
      verdict: "CanonicalRedirectPending",
      proofState: "Unknown",
    })}

${witness({
      targetUrl: pathQueryTarget,
      finalUrl: "https://www.mullusi.com/proof/?gate=www-canonical",
      verdict: "CanonicalRedirectPending",
      proofState: "Unknown",
    })}`,
  });
  const formatted = formatResult(result);

  assert.match(formatted, /target=https:\/\/www\.mullusi\.com\/\nobserved_witness_block_count=1\nexpected_final_url=https:\/\/mullusi\.com\/\nobserved_final_url=https:\/\/www\.mullusi\.com\/\nobserved_status=200\nexpected_redirect_count=1\nobserved_redirect_count=0/);
  assert.match(formatted, /expected_first_redirect_status=301\nobserved_first_redirect_status=/);
  assert.match(formatted, /target=https:\/\/www\.mullusi\.com\/proof\/\?gate=www-canonical\nobserved_witness_block_count=1\nexpected_final_url=https:\/\/mullusi\.com\/proof\/\?gate=www-canonical\nobserved_final_url=https:\/\/www\.mullusi\.com\/proof\/\?gate=www-canonical\nobserved_status=200\nexpected_redirect_count=1/);
  assert.match(formatted, /target_ready=false/);
}

function testCliBlocksPendingFixtureWithoutAllowPending() {
  const fixture = writeFixtureFiles({
    witness: `${witness({
      finalUrl: "https://www.mullusi.com/",
      verdict: "CanonicalRedirectPending",
      proofState: "Unknown",
    })}

${witness({
      targetUrl: pathQueryTarget,
      finalUrl: "https://www.mullusi.com/proof/?gate=www-canonical",
      verdict: "CanonicalRedirectPending",
      proofState: "Unknown",
    })}`,
  });

  try {
    const result = runGateCli([`--redirects-file=${fixture.redirectsFile}`, `--witness-file=${fixture.witnessFile}`]);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /www_redirect_gate state=AwaitingEvidence/);
    assert.match(result.stdout, /target_ready=false/);
    assert.equal(result.stderr, "");
  } finally {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
}

function testCliAllowsPendingFixtureWithAllowPending() {
  const fixture = writeFixtureFiles({
    witness: `${witness({
      finalUrl: "https://www.mullusi.com/",
      verdict: "CanonicalRedirectPending",
      proofState: "Unknown",
    })}

${witness({
      targetUrl: pathQueryTarget,
      finalUrl: "https://www.mullusi.com/proof/?gate=www-canonical",
      verdict: "CanonicalRedirectPending",
      proofState: "Unknown",
    })}`,
  });

  try {
    const result = runGateCli(["--allow-pending", `--redirects-file=${fixture.redirectsFile}`, `--witness-file=${fixture.witnessFile}`]);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /www_redirect_gate state=AwaitingEvidence/);
    assert.match(result.stdout, /observed_status=200/);
    assert.equal(result.stderr, "");
  } finally {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  }
}

function testCliRejectsUnsupportedArgument() {
  const result = runGateCli(["--unexpected"]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /unsupported_args_count=1/);
  assert.doesNotMatch(result.stderr, /--unexpected/);
}

function testCliRejectsEmptyFixturePath() {
  const result = runGateCli(["--redirects-file="]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /cli_file_unreadable/);
  assert.doesNotMatch(result.stderr, /<empty>/);
}

function testCliRejectsMissingFixturePath() {
  const result = runGateCli(["--witness-file=ops/missing-www-witness.md"]);

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /cli_file_unreadable/);
  assert.doesNotMatch(result.stderr, /missing-www-witness/);
}

testReadyWhenSourceRuleAndApexWitnessPass();
testReadyWhenOriginCheckerOutputOrderPasses();
testPendingWhenLiveWitnessDoesNotRedirectToApex();
testDuplicateWitnessBlocksBlockClosure();
testDuplicateReadyWitnessBlocksBlockClosure();
testMissingSourceRuleBlocksEvenWhenWitnessLooksReady();
testCommentedSourceRuleDoesNotSatisfyGate();
testEmbeddedSourceRuleDoesNotSatisfyGate();
testMissingPermanentRedirectStatusBlocksClosure();
testTemporaryRedirectStatusBlocksClosure();
testMultiHopRedirectCountBlocksClosure();
testPathQueryMismatchBlocksClosure();
testPrivateWitnessValuesAreRedactedFromEvidence();
testFormattedResultIncludesPerTargetStatusAndReadiness();
testCliBlocksPendingFixtureWithoutAllowPending();
testCliAllowsPendingFixtureWithAllowPending();
testCliRejectsUnsupportedArgument();
testCliRejectsEmptyFixturePath();
testCliRejectsMissingFixturePath();
console.log("www canonical redirect gate tests passed");
