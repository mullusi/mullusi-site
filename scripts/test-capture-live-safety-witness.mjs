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
    "final_url=https://mullusi.com/",
    "status=200",
    "redirect_count=0",
    "first_redirect_status=",
    "first_redirect_url=",
    "server=cloudflare",
    "github_request=",
    "fastly_request=",
    "served_by=",
    "via=",
    "",
    "target=https://www.mullusi.com/",
    "final_url=https://mullusi.com/",
    "status=200",
    "redirect_count=1",
    "first_redirect_status=301",
    "first_redirect_url=https://mullusi.com/",
    "server=cloudflare",
    "verdict=CloudflareOriginCandidate",
    "proof_state=Pass",
    "github_request=",
    "fastly_request=",
    "served_by=",
    "via=",
    "",
    "target=https://www.mullusi.com/proof/?gate=www-canonical",
    "final_url=https://mullusi.com/proof/?gate=www-canonical",
    "status=200",
    "redirect_count=1",
    "first_redirect_status=301",
    "first_redirect_url=https://mullusi.com/proof/?gate=www-canonical",
    "server=cloudflare",
    "verdict=CloudflareOriginCandidate",
    "proof_state=Pass",
    "github_request=",
    "fastly_request=",
    "served_by=",
    "via=",
    "",
    "target=https://mullusi.com/.well-known/security.txt",
    "final_url=https://mullusi.com/.well-known/security.txt",
    "status=200",
    "redirect_count=0",
    "first_redirect_status=",
    "first_redirect_url=",
    "server=cloudflare",
    "verdict=CloudflareOriginCandidate",
    "proof_state=Pass",
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
  "security-txt.txt": [
    "verdict=SolvedVerified",
    "proof_state=Pass",
    "security_txt_state=SolvedVerified",
    "observed_at=2026-05-27",
    "expires_at=2027-05-16T00:00:00.000Z",
    "expires_days_remaining=354",
    "minimum_validity_days=30",
    "maximum_validity_days=366",
    "contact_count=2",
    "policy_count=1",
    "canonical_count=1",
    "preferred_language_count=2",
    "finding=none",
    "raw_secret_values=not_read",
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
    "verdict=SolvedVerified",
    "proof_state=Pass",
    "domain_hardening_preflight=SolvedVerified",
    "manual_caa_allowed=true",
    "dkim_publication_allowed=true",
    "spf_hardfail_allowed=true",
    "dmarc_enforcement_allowed=true",
    "mta_sts_enforce_allowed=true",
    "tls_rpt_publication_allowed=true",
    "finding=none",
    "raw_secret_values=not_recorded",
  ].join("\n"),
  "search-indexing-surface.txt": [
    "verdict=SolvedVerified",
    "proof_state=Pass",
    "local_sitemap_loc_count=13",
    "live_sitemap_loc_count=13",
    "finding=none",
  ].join("\n"),
  "deployment-integrity.txt": [
    "verdict=SolvedVerified",
    "proof_state=Pass",
    "live_deployment_integrity_state=SolvedVerified",
    "live_status_manifest=Pass",
    "live_content_hashes=Pass",
    "local_status_manifest_match=Pass",
    "edge_html_transform=Pass",
    "governed_file_count=7",
    "finding=none",
    "local_finding=none",
    "accepted_finding=none",
    "raw_response_bodies=not_recorded",
    "raw_response_headers=not_recorded",
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

  assert.equal(plan.length, 9);
  assert.deepEqual(plan.map((probe) => probe.fileName), [
    "public-visibility.txt",
    "regional-public-visibility.txt",
    "website-origin.txt",
    "security-headers.txt",
    "security-txt.txt",
    "domain-security.txt",
    "domain-hardening-preflight.txt",
    "search-indexing-surface.txt",
    "deployment-integrity.txt",
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
  assert.match(metadata, /^raw_response_bodies=not_recorded$/m);
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
    assert.equal(result.validation.artifactFileCount, 10);
    assert.equal(fs.existsSync(path.join(tempDirectory, "security-headers.txt")), true);
    assert.equal(fs.existsSync(path.join(tempDirectory, "security-txt.txt")), true);
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

function testSuccessfulProbeWithUnsafeOutputIsNotRetained() {
  const tempDirectory = createTempDirectory();
  try {
    const result = captureLiveSafetyWitnessArtifact({
      artifactDirectory: tempDirectory,
      now: new Date("2026-05-24T12:00:00Z"),
      runner: (probe) => {
        if (probe.fileName === "deployment-integrity.txt") {
          return {
            status: 0,
            stdout: "verdict=SolvedVerified\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz123456\npostgres://user:password@private.example/db\n",
            stderr: "",
          };
        }
        return fixtureRunner(probe);
      },
    });
    const deploymentIntegrityFile = fs.readFileSync(path.join(tempDirectory, "deployment-integrity.txt"), "utf8");
    const formatted = formatCaptureResult(result);

    assert.equal(result.validation.verdict, "GovernanceBlocked");
    assert.equal(result.validation.proofState, "Fail");
    assert.match(deploymentIntegrityFile, /^error=probe_output_boundary_invalid:3$/m);
    assert.match(deploymentIntegrityFile, /^raw_probe_output=not_recorded$/m);
    assert.doesNotMatch(deploymentIntegrityFile, /abcdefghijklmnopqrstuvwxyz123456|postgres:\/\/user:password|private\.example|Authorization: Bearer/);
    assert.match(formatted, /failed_probe=deployment_integrity:1/);
    assert.match(formatted, /capture_state=GovernanceBlocked/);
  } finally {
    removeTempDirectory(tempDirectory);
  }
}

function testTransientProbeFailureRetriesBeforeCapture() {
  const tempDirectory = createTempDirectory();
  try {
    const attempts = new Map();
    const result = captureLiveSafetyWitnessArtifact({
      artifactDirectory: tempDirectory,
      now: new Date("2026-05-24T12:00:00Z"),
      runner: (probe) => {
        const attempt = (attempts.get(probe.name) || 0) + 1;
        attempts.set(probe.name, attempt);
        if (probe.name === "website_origin" && attempt === 1) {
          return { status: 1, stdout: "", stderr: "request_timeout" };
        }
        return fixtureRunner(probe);
      },
    });
    const websiteOriginFile = fs.readFileSync(path.join(tempDirectory, "website-origin.txt"), "utf8");

    assert.equal(result.validation.verdict, "SolvedVerified");
    assert.equal(result.validation.proofState, "Pass");
    assert.match(websiteOriginFile, /^verdict=CloudflareOriginCandidate$/m);
    assert.equal(result.probeResults.find((probe) => probe.name === "website_origin")?.attemptCount, 2);
  } finally {
    removeTempDirectory(tempDirectory);
  }
}

function testCliRejectsUnsupportedFlagsWithoutNetwork() {
  const result = runCaptureCli(["--unexpected"]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /capture_state=GovernanceBlocked/);
  assert.match(result.stdout, /proof_state=Fail/);
  assert.match(result.stdout, /error=unsupported_args_count:1/);
  assert.doesNotMatch(result.stdout, /--unexpected/);
}

testProbePlanHasStableBoundary();
testMetadataUsesEnvAndSecondPrecisionTimestamp();
testCaptureWritesAndValidatesArtifact();
testFailedProbeIsCapturedWithoutLeakingStderr();
testSuccessfulProbeWithUnsafeOutputIsNotRetained();
testTransientProbeFailureRetriesBeforeCapture();
testCliRejectsUnsupportedFlagsWithoutNetwork();

console.log("live safety witness capture tests passed");
