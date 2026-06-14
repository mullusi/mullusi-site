/*
Purpose: validate public-safe support readiness evidence for Mullu Govern.
Governance scope: support contact routing, incident intake, responsible disclosure routing, fail-closed public write-route boundary, and no-secret evidence.
Dependencies: Node.js standard library, ops/mullu-govern-support-readiness.md, product manifest, contact/privacy/disclosure pages, .well-known/security.txt, and public-beta approval packet.
Invariants: read-only; does not contact mailboxes, inspect provider dashboards, mutate DNS, publish routes, or print private values.
Test contract: run node scripts/test-validate-govern-support-readiness.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultWitnessPath = "ops/mullu-govern-support-readiness.md";
const allowedArgs = new Set(["--json"]);
const supportEmail = "support@mullusi.com";

const requiredWitnessTerms = [
  "support_readiness_state=Ready",
  "solver_outcome=SolvedVerified",
  "proof_state=Pass",
  "public_write_route_allowed=false",
  "support_contact=support@mullusi.com",
  "contact_route=/contact/",
  "privacy_contact=support@mullusi.com",
  "responsible_disclosure_route=/responsible-disclosure/",
  "route_publication_action=none",
  "dns_mutation=none",
  "runtime_mutation=none",
  "secret_rotation_required=false",
  "customer_sla=not_published",
  "external_ticketing_system=not_claimed",
  "STATUS:",
];

const forbiddenEvidencePatterns = [
  { label: "postgres_url", pattern: /postgres(?:ql)?:\/\//i },
  { label: "private_key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "bearer_token", pattern: /Bearer\s+[A-Za-z0-9._~+/-]{16,}/ },
  { label: "api_key_shape", pattern: /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{12,}/ },
  { label: "google_api_key_shape", pattern: /\bAIza[0-9A-Za-z_-]{20,}/ },
];

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readUtf8(relativePath));
}

function lineValue(content, key) {
  const match = content.match(new RegExp(`^${key}=([^\\s]+)$`, "m"));
  return match?.[1] ?? "";
}

function unsupportedArgs(args) {
  return args.filter((arg) => arg.startsWith("--") && !allowedArgs.has(arg));
}

export function validateGovernSupportReadinessEvidence(evidence) {
  const findings = [];

  for (const term of requiredWitnessTerms) {
    if (!evidence.witness.includes(term)) findings.push(`required_witness_term_missing:${term}`);
  }

  for (const { label, pattern } of forbiddenEvidencePatterns) {
    for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
      if (pattern.test(content)) findings.push(`forbidden_private_value_pattern:${source}:${label}`);
    }
  }

  if (evidence.manifest?.ownership?.supportEmail !== supportEmail) {
    findings.push(`manifest_support_email_invalid:${evidence.manifest?.ownership?.supportEmail || "missing"}`);
  }
  if (!evidence.contactPage.includes(`mailto:${supportEmail}`) || !evidence.contactPage.includes(supportEmail)) {
    findings.push("contact_route_support_mailto_missing");
  }
  if (!evidence.privacyPage.includes(`mailto:${supportEmail}`) || !evidence.privacyPage.includes(supportEmail)) {
    findings.push("privacy_route_support_mailto_missing");
  }
  if (!evidence.responsibleDisclosurePage.includes("Responsible Disclosure")) {
    findings.push("responsible_disclosure_route_missing_title");
  }
  if (!evidence.securityTxt.includes("Contact: mailto:support@mullusi.com")) {
    findings.push("security_txt_support_contact_missing");
  }
  if (!evidence.securityTxt.includes("Policy: https://mullusi.com/responsible-disclosure/")) {
    findings.push("security_txt_policy_route_missing");
  }
  if (!evidence.approvalPacket.includes("public_write_route_allowed=false")) {
    findings.push("approval_packet_write_route_not_blocked");
  }
  if (lineValue(evidence.approvalPacket, "support_readiness_ref") !== defaultWitnessPath) {
    findings.push(`approval_packet_support_readiness_ref_invalid:${lineValue(evidence.approvalPacket, "support_readiness_ref") || "missing"}`);
  }

  return {
    findingCount: findings.length,
    findings,
    proofState: findings.length === 0 ? "Pass" : "Fail",
    publicWriteRouteAllowed: evidence.approvalPacket.includes("public_write_route_allowed=true"),
    solverOutcome: findings.length === 0 ? "SolvedVerified" : "GovernanceBlocked",
    supportContact: supportEmail,
    supportReadinessState: findings.length === 0 ? "Ready" : "Blocked",
  };
}

export function collectGovernSupportReadinessEvidence(relativePath = defaultWitnessPath) {
  const witness = readUtf8(relativePath);
  return {
    approvalPacket: readUtf8("ops/mullu-govern-public-beta-approval-packet.md"),
    contactPage: readUtf8("contact/index.html"),
    manifest: readJson("products/mullu-govern/product.manifest.json"),
    privacyPage: readUtf8("privacy/index.html"),
    responsibleDisclosurePage: readUtf8("responsible-disclosure/index.html"),
    securityTxt: readUtf8(".well-known/security.txt"),
    privateValueScanSources: {
      approvalPacket: readUtf8("ops/mullu-govern-public-beta-approval-packet.md"),
      witness,
    },
    witness,
  };
}

export function validateGovernSupportReadiness(relativePath = defaultWitnessPath) {
  return validateGovernSupportReadinessEvidence(collectGovernSupportReadinessEvidence(relativePath));
}

export function formatGovernSupportReadinessReport(result) {
  return [
    `govern_support_readiness=${result.solverOutcome}`,
    `proof_state=${result.proofState}`,
    `support_readiness_state=${result.supportReadinessState}`,
    `public_write_route_allowed=${result.publicWriteRouteAllowed ? "true" : "false"}`,
    `support_contact=${result.supportContact}`,
    `finding_count=${result.findingCount}`,
    ...result.findings.map((finding) => `finding=${finding}`),
    "secret_values=not_recorded",
    "host_addresses=not_recorded",
    "database_urls=not_recorded",
  ].join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const invalidArgs = unsupportedArgs(args);
  if (invalidArgs.length > 0) {
    const result = {
      findingCount: invalidArgs.length,
      findings: [`unsupported_args:${invalidArgs.join(",")}`],
      proofState: "Fail",
      publicWriteRouteAllowed: false,
      solverOutcome: "GovernanceBlocked",
      supportContact: supportEmail,
      supportReadinessState: "Blocked",
    };
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatGovernSupportReadinessReport(result));
    process.exit(1);
    return;
  }

  const result = validateGovernSupportReadiness();
  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatGovernSupportReadinessReport(result));
  if (result.findings.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
