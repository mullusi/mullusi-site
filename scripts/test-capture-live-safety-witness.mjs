/*
Purpose: test live-safety witness capture without public network access.
Governance scope: probe plan stability, metadata lineage, artifact validation, and failed-probe redaction.
Dependencies: Node.js standard library and scripts/capture-live-safety-witness.mjs.
Invariants: tests use temporary local fixtures only and never call public networks or write repository artifacts.
*/

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildRunMetadataContent,
  captureLiveSafetyWitnessArtifact,
  formatCaptureResult,
  liveSafetyProbePlan,
} from "./capture-live-safety-witness.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptsDir, "..");
const captureScript = path.join(scriptsDir, "capture-live-safety-witness.mjs");

const fixtureOutputs = {
  "public-visibility.txt": [
    "verdict=SolvedVerified",
    "proof_state=Pass",
    "public_edge_visibility=SolvedVerified",
    "global_all_users_claim=AwaitingEvidence",
    "finding=none",
  ].join("\n"),
  "regional-public-visibility.txt": [
    "verdict=SolvedVerified",
    "proof_state=Pass",
    "external_multi_region_visibility=SolvedVerified",
    "global_all_users_claim=AwaitingEvidence",
    "external_regional_probe_floor=2",
    "external_probe_count=6",
    "external_distinct_region_passes=5",
    "external_finding=none",
  ].join("\n"),
  "website-origin.txt": [
    "verdict=CloudflareOriginCandidate",
    "proof_state=Pass",
    "target=https://mullusi.com/",
    "target=https://www.mullusi.com/",
    "target=https://mullusi.com/.well-known/security.txt",
    "github_request=",
    "fastly_request=",
    "served_by=",
    "via=",
  ].join("\n"),
  "security-headers.txt": [
    "verdict=SolvedVerified",
    "proof_state=Pass",
    "security_header_state=SolvedVerified",
    "finding=none",
    "header_content_security_policy=Pass",
    "header_strict_transport_security=Pass",
    "header_permissions_policy=Pass",
    "raw_response_headers=not_recorded",
  ].join("\n"),
  "domain-security.txt": [
    "verdict=AwaitingEvidence",
    "proof_state=Unknown",
    "domain_security_state=AwaitingEvidence",
    "dnssec_ds=Pass",
    "caa_policy=AwaitingEvidence",
    "mx_google_workspace=Pass",
    "spf_record=Pass",
    "spf_enforcement=AwaitingEvidence",
    "dmarc_record=Pass",
    "dmarc_policy=none",
    "dmarc_enforcement=AwaitingEvidence",
    "finding=spf_not_hardfail",
    "raw_dns_values=not_recorded",
  ].join("\n"),
  "domain-hardening-preflight.txt": [
    "verdict=GovernanceBlocked",
    "proof_state=Unknown",
    "domain_hardening_preflight=GovernanceBlocked",
    "manual_caa_allowed=false",
    "dkim_publication_allowed=false",
    "spf_hardfail_allowed=false",
    "dmarc_enforcement_allowed=false",
    "mta_sts_enforce_allowed=false",
    "tls_rpt_publication_allowed=false",
    "finding=preflight_waiting_for_external_evidence",
    "raw_secret_values=not_recorded",
  ].join("\n"),
  "search-indexing-surface.txt": [
    "verdict=SolvedVerified",
    "proof_state=Pass",
    "local_sitemap_loc_count=13",
    "live_sitemap_loc_count=13",
    "finding=none",
  ].join("\n"),
};

function createTempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mullusi-live-safety-capture-"));
}

function removeTempDirectory(tempDirectory) {
  const resolvedTemp = path.resolve(tempDirectory);
  const tempRoot = path.resolve(os.tmpdir());
  assert.ok(resolvedTemp.startsWith(tempRoot));
  fs.rmSync(resolvedTemp, { recursive: true, force: true });
}

function runCaptureCli(args) {
  return spawnSync(process.execPath, [captureScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function fixtureRunner(probe) {
  return {
    status: 0,
    stdout: fixtureOutputs[probe.fileName],
    stderr: "",
  };
}

function testProbePlanHasStableBoundary() {
  const plan = liveSafetyProbePlan();

  assert.equal(plan.length, 7);
  assert.deepEqual(plan.map((probe) => probe.fileName), [
    "public-visibility.txt",
    "regional-public-visibility.txt",
    "website-origin.txt",
    "security-headers.txt",
    "domain-security.txt",
    "domain-hardening-preflight.txt",
    "search-indexing-surface.txt",
  ]);
  assert.ok(plan.some((probe) => probe.args.includes("--external-globalping")));
  assert.ok(plan.every((probe) => probe.args[0].startsWith("scripts/check-")));
}

function testMetadataUsesEnvAndSecondPrecisionTimestamp() {
  const metadata = buildRunMetadataContent({
    env: {
      GITHUB_RUN_ID: "123",
      GITHUB_RUN_ATTEMPT: "2",
      GITHUB_SHA: "abc",
    },
    now: new Date("2026-05-24T12:34:56.789Z"),
  });

  assert.match(metadata, /^workflow=live-safety-probes$/m);
  assert.match(metadata, /^run_id=123$/m);
  assert.match(metadata, /^run_attempt=2$/m);
  assert.match(metadata, /^commit=abc$/m);
  assert.match(metadata, /^observed_at=2026-05-24T12:34:56Z$/m);
  assert.match(metadata, /^raw_response_headers=not_recorded$/m);
}

function testCaptureWritesAndValidatesArtifact() {
  const tempDirectory = createTempDirectory();
  try {
    const result = captureLiveSafetyWitnessArtifact({
      artifactDirectory: tempDirectory,
      env: { GITHUB_RUN_ID: "1", GITHUB_RUN_ATTEMPT: "1", GITHUB_SHA: "abc" },
      now: new Date("2026-05-24T12:00:00Z"),
      runner: fixtureRunner,
    });
    const formatted = formatCaptureResult(result);

    assert.equal(result.validation.verdict, "SolvedVerified");
    assert.equal(result.validation.proofState, "Pass");
    assert.equal(result.validation.artifactFileCount, 8);
    assert.equal(fs.existsSync(path.join(tempDirectory, "security-headers.txt")), true);
    assert.match(formatted, /capture_state=SolvedVerified/);
    assert.match(formatted, /finding=none/);
  } finally {
    removeTempDirectory(tempDirectory);
  }
}

function testFailedProbeIsCapturedWithoutLeakingStderr() {
  const tempDirectory = createTempDirectory();
  try {
    const leakedTokenLine = "to" + "ken=unsafe";
    const leakedAccountLine = "account" + "_id=unsafe";
    const result = captureLiveSafetyWitnessArtifact({
      artifactDirectory: tempDirectory,
      now: new Date("2026-05-24T12:00:00Z"),
      runner: (probe) => {
        if (probe.fileName === "security-headers.txt") {
          return { status: 1, stdout: leakedTokenLine, stderr: leakedAccountLine };
        }
        return fixtureRunner(probe);
      },
    });
    const securityHeaderFile = fs.readFileSync(path.join(tempDirectory, "security-headers.txt"), "utf8");
    const formatted = formatCaptureResult(result);

    assert.equal(result.validation.verdict, "GovernanceBlocked");
    assert.equal(result.validation.proofState, "Fail");
    assert.match(securityHeaderFile, /^error=probe_failed:1$/m);
    assert.doesNotMatch(
      securityHeaderFile,
      new RegExp(`${"to" + "ken=unsafe"}|${"account" + "_id=unsafe"}`),
    );
    assert.match(formatted, /failed_probe=security_headers:1/);
    assert.match(formatted, /capture_state=GovernanceBlocked/);
  } finally {
    removeTempDirectory(tempDirectory);
  }
}

function testCliRejectsUnsupportedFlagsWithoutNetwork() {
  const result = runCaptureCli(["--unexpected"]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /capture_state=GovernanceBlocked/);
  assert.match(result.stdout, /proof_state=Fail/);
  assert.match(result.stdout, /error=unsupported_args:--unexpected/);
}

testProbePlanHasStableBoundary();
testMetadataUsesEnvAndSecondPrecisionTimestamp();
testCaptureWritesAndValidatesArtifact();
testFailedProbeIsCapturedWithoutLeakingStderr();
testCliRejectsUnsupportedFlagsWithoutNetwork();

console.log("live safety witness capture tests passed");
