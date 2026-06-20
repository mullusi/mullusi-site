/*
Purpose: block Mullusi domain hardening mutations until required external admin evidence is recorded.
Governance scope: CAA, DKIM, SPF hard-fail, DMARC enforcement, MTA-STS, TLS-RPT, DNS authority, and public-safe evidence boundaries.
Dependencies: Node.js standard library and ops/domain-security-preflight.md.
Invariants: read-only, deterministic, no DNS mutation, and no raw secret or provider account values accepted in the preflight file.
Test contract: run node scripts/test-check-domain-hardening-preflight.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRootPrefix = `${repoRoot}${path.sep}`;
const allowedOptions = new Set(["--require-ready", "--expect-blocked"]);

const requiredEvidenceKeys = [
  "active_cloudflare_ca_set",
  "cloudflare_ca_source",
  "dns_write_authority",
  "sender_inventory",
  "google_workspace_dkim_selector",
  "dmarc_report_mailbox",
  "mta_sts_https_policy_host",
  "tls_rpt_report_mailbox",
];

const mutationPermissions = [
  {
    key: "manual_caa_allowed",
    dependencies: ["active_cloudflare_ca_set", "cloudflare_ca_source", "dns_write_authority"],
  },
  {
    key: "dkim_publication_allowed",
    dependencies: ["google_workspace_dkim_selector", "dns_write_authority"],
  },
  {
    key: "spf_hardfail_allowed",
    dependencies: ["sender_inventory", "dns_write_authority"],
  },
  {
    key: "dmarc_enforcement_allowed",
    dependencies: ["sender_inventory", "dmarc_report_mailbox", "dns_write_authority"],
  },
  {
    key: "mta_sts_enforce_allowed",
    dependencies: ["mta_sts_https_policy_host", "dns_write_authority"],
  },
  {
    key: "tls_rpt_publication_allowed",
    dependencies: ["tls_rpt_report_mailbox", "dns_write_authority"],
  },
];

const publicDomainPreflightAllowedScalars = new Set([
  "AwaitingEvidence",
  "GovernanceBlocked",
  "Pass",
  "SolvedVerified",
  "false",
  "missing",
  "true",
]);

function publicDomainPreflightScalarLabel(value) {
  if (value === undefined || value === null || value === "") return "missing";
  const scalar = String(value);
  if (publicDomainPreflightAllowedScalars.has(scalar)) return scalar;
  if (/^\d+$/.test(scalar)) return "number";
  return "redacted_value";
}

function lineValue(content, key) {
  const match = content.match(new RegExp(`^${key}=([^\\s]+)$`, "m"));
  return match?.[1] ?? "";
}

function secretBoundaryFindings(content) {
  const findings = [];
  const patterns = [
    ["provider_account_id", /account_id\s*=|billing_id\s*=|dns_target\s*=/i],
    ["private_key", /-----BEGIN (?:RSA |OPENSSH |EC |)PRIVATE KEY-----|private[_-]?key/i],
    ["token", /(?:token|password|credential|secret)\s*[:=]\s*\S+/i],
    ["dkim_public_key_value", /p=[A-Za-z0-9+/]{80,}/],
    ["raw_report_payload", /(?:xml|json)_report_payload\s*[:=]/i],
  ];
  for (const [id, pattern] of patterns) {
    if (pattern.test(content)) {
      findings.push(`preflight_boundary_invalid:${id}`);
    }
  }
  return findings;
}

export function evaluateDomainHardeningPreflight(content) {
  const findings = [];
  findings.push(...secretBoundaryFindings(content));

  const evidence = {};
  for (const key of requiredEvidenceKeys) {
    const value = lineValue(content, key);
    evidence[key] = value;
    if (!["Pass", "AwaitingEvidence"].includes(value)) {
      findings.push(`evidence_state_invalid:${key}:${publicDomainPreflightScalarLabel(value)}`);
    }
  }

  const permissions = {};
  for (const permission of mutationPermissions) {
    const value = lineValue(content, permission.key);
    permissions[permission.key] = value;
    if (!["true", "false"].includes(value)) {
      findings.push(`permission_state_invalid:${permission.key}:${publicDomainPreflightScalarLabel(value)}`);
      continue;
    }
    const dependenciesPass = permission.dependencies.every((dependency) => evidence[dependency] === "Pass");
    if (value === "true" && !dependenciesPass) {
      findings.push(`permission_without_evidence:${permission.key}`);
    }
    if (value === "false" && dependenciesPass) {
      findings.push(`permission_not_promoted:${permission.key}`);
    }
  }

  const allEvidencePass = requiredEvidenceKeys.every((key) => evidence[key] === "Pass");
  const allPermissionsTrue = mutationPermissions.every((permission) => permissions[permission.key] === "true");
  const declaredState = lineValue(content, "domain_hardening_preflight");
  if (!["GovernanceBlocked", "SolvedVerified"].includes(declaredState)) {
    findings.push(`preflight_state_invalid:${publicDomainPreflightScalarLabel(declaredState)}`);
  }
  if (declaredState === "SolvedVerified" && !(allEvidencePass && allPermissionsTrue)) {
    findings.push("preflight_solved_without_required_evidence");
  }
  if (declaredState === "GovernanceBlocked" && allEvidencePass && allPermissionsTrue) {
    findings.push("preflight_blocked_after_required_evidence");
  }

  const structuralFailures = findings.filter((finding) => (
    finding.startsWith("preflight_boundary_invalid:")
    || finding.startsWith("evidence_state_invalid:")
    || finding.startsWith("permission_state_invalid:")
    || finding === "preflight_solved_without_required_evidence"
    || finding === "preflight_blocked_after_required_evidence"
  ));

  const ready = declaredState === "SolvedVerified" && allEvidencePass && allPermissionsTrue && structuralFailures.length === 0;
  const blocked = declaredState === "GovernanceBlocked" && !allPermissionsTrue && structuralFailures.length === 0;

  return {
    verdict: ready ? "SolvedVerified" : structuralFailures.length > 0 ? "GovernanceBlocked" : "GovernanceBlocked",
    proofState: ready ? "Pass" : structuralFailures.length > 0 ? "Fail" : "Unknown",
    preflightState: ready ? "SolvedVerified" : blocked ? "GovernanceBlocked" : "GovernanceBlocked",
    ready,
    evidence,
    permissions,
    findings: findings.length > 0 ? findings : blocked ? ["preflight_waiting_for_external_evidence"] : [],
  };
}

export function formatResult(result) {
  const lines = [
    `verdict=${result.verdict}`,
    `proof_state=${result.proofState}`,
    `domain_hardening_preflight=${result.preflightState}`,
  ];
  for (const key of requiredEvidenceKeys) {
    lines.push(`${key}=${publicDomainPreflightScalarLabel(result.evidence[key])}`);
  }
  for (const permission of mutationPermissions) {
    lines.push(`${permission.key}=${publicDomainPreflightScalarLabel(result.permissions[permission.key])}`);
  }
  if (result.findings.length === 0) {
    lines.push("finding=none");
  } else {
    for (const finding of result.findings) {
      lines.push(`finding=${finding}`);
    }
  }
  lines.push("raw_secret_values=not_recorded");
  return lines.join("\n");
}

function unsupportedOptions(args) {
  return args.filter((arg) => arg.startsWith("--") && !allowedOptions.has(arg) && !arg.startsWith("--path="));
}

function readPreflightPathResult(relativePath) {
  const targetPath = path.resolve(repoRoot, relativePath);
  if (targetPath !== repoRoot && !targetPath.startsWith(repoRootPrefix)) {
    return { content: "", error: "domain_hardening_preflight_path_outside_repo" };
  }
  try {
    return { content: fs.readFileSync(targetPath, "utf8"), error: "" };
  } catch {
    return { content: "", error: "domain_hardening_preflight_unreadable" };
  }
}

function runCli() {
  const args = process.argv.slice(2);
  const unsupported = unsupportedOptions(args);
  if (unsupported.length > 0) {
    console.log(`verdict=GovernanceBlocked\nproof_state=Fail\nerror=unsupported_args_count:${unsupported.length}`);
    process.exitCode = 1;
    return;
  }

  const requireReady = args.includes("--require-ready");
  const expectBlocked = args.includes("--expect-blocked");
  const pathArg = args.find((arg) => arg.startsWith("--path="));
  const preflightRead = readPreflightPathResult(pathArg ? pathArg.slice("--path=".length) : "ops/domain-security-preflight.md");
  if (preflightRead.error) {
    console.log(`verdict=GovernanceBlocked\nproof_state=Fail\nerror=${preflightRead.error}`);
    process.exitCode = 1;
    return;
  }
  const content = preflightRead.content;
  const result = evaluateDomainHardeningPreflight(content);
  console.log(formatResult(result));

  if (requireReady && !result.ready) {
    process.exitCode = 1;
    return;
  }
  if (expectBlocked && result.preflightState !== "GovernanceBlocked") {
    process.exitCode = 1;
    return;
  }
  if (result.proofState === "Fail") {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
