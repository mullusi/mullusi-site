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
import {
  scanForbiddenEvidencePatterns,
  validatePublicSafeEvidenceRef,
} from "./govern-live-evidence-ref-contract.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRootPrefix = `${repoRoot}${path.sep}`;
const defaultWitnessPath = "ops/mullu-govern-support-readiness.md";
const allowedArgs = new Set(["--json"]);
const supportEmail = "support@mullusi.com";
const supportReadinessRef = "site:ops/mullu-govern-support-readiness.md";

const requiredWitnessTerms = [
  { id: "support_readiness_state", text: "support_readiness_state=Ready" },
  { id: "solver_outcome", text: "solver_outcome=SolvedVerified" },
  { id: "proof_state", text: "proof_state=Pass" },
  { id: "public_write_route_allowed", text: "public_write_route_allowed=false" },
  { id: "support_contact", text: "support_contact=support@mullusi.com" },
  { id: "contact_route", text: "contact_route=/contact/" },
  { id: "privacy_contact", text: "privacy_contact=support@mullusi.com" },
  { id: "responsible_disclosure_route", text: "responsible_disclosure_route=/responsible-disclosure/" },
  { id: "route_publication_action", text: "route_publication_action=none" },
  { id: "dns_mutation", text: "dns_mutation=none" },
  { id: "runtime_mutation", text: "runtime_mutation=none" },
  { id: "secret_rotation_required", text: "secret_rotation_required=false" },
  { id: "customer_sla", text: "customer_sla=not_published" },
  { id: "external_ticketing_system", text: "external_ticketing_system=not_claimed" },
  { id: "status_block", text: "STATUS:" },
];

const publicSupportAllowedScalars = new Set([
  "missing",
  "false",
  "true",
  "none",
  "Ready",
  "Blocked",
  "SolvedVerified",
  "GovernanceBlocked",
  "Pass",
  "Fail",
  supportEmail,
  supportReadinessRef,
]);

function blockedResult(finding) {
  return {
    findingCount: 1,
    findings: [finding],
    proofState: "Fail",
    publicWriteRouteAllowed: false,
    solverOutcome: "GovernanceBlocked",
    supportContact: supportEmail,
    supportReadinessState: "Blocked",
  };
}

function readUtf8Result(relativePath, findingPrefix) {
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    return { content: "", finding: `${findingPrefix}_path_invalid` };
  }

  const targetPath = path.resolve(repoRoot, relativePath);
  if (targetPath !== repoRoot && !targetPath.startsWith(repoRootPrefix)) {
    return { content: "", finding: `${findingPrefix}_path_outside_repo` };
  }

  try {
    return { content: fs.readFileSync(targetPath, "utf8"), finding: "" };
  } catch {
    return { content: "", finding: `${findingPrefix}_unreadable` };
  }
}

function readUtf8(relativePath) {
  const result = readUtf8Result(relativePath, "support_readiness_evidence");
  if (result.finding) {
    throw new Error(result.finding);
  }
  return result.content;
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

export function publicSupportReadinessScalarLabel(value) {
  if (value === undefined || value === null || value === "") return "missing";
  if (typeof value === "boolean") return `boolean:${value ? "true" : "false"}`;
  if (typeof value === "string" && publicSupportAllowedScalars.has(value)) return value;
  if (typeof value === "string") return "redacted_value";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  return typeof value;
}

export function validateGovernSupportReadinessEvidence(evidence) {
  const findings = [];

  for (const term of requiredWitnessTerms) {
    if (!evidence.witness.includes(term.text)) findings.push(`required_witness_term_missing:${term.id}`);
  }

  for (const [source, content] of Object.entries(evidence.privateValueScanSources)) {
    findings.push(...scanForbiddenEvidencePatterns(source, content));
  }

  if (evidence.manifest?.ownership?.supportEmail !== supportEmail) {
    findings.push(`manifest_support_email_invalid:${publicSupportReadinessScalarLabel(evidence.manifest?.ownership?.supportEmail)}`);
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
  const observedSupportReadinessRef = lineValue(evidence.approvalPacket, "support_readiness_ref");
  if (observedSupportReadinessRef !== supportReadinessRef) {
    findings.push(`approval_packet_support_readiness_ref_invalid:${publicSupportReadinessScalarLabel(observedSupportReadinessRef)}`);
  }
  const supportRefResult = validatePublicSafeEvidenceRef(observedSupportReadinessRef);
  for (const refFinding of supportRefResult.findings) {
    findings.push(`approval_packet_support_readiness_ref_invalid:${refFinding}`);
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
  const witnessRead = readUtf8Result(relativePath, "support_readiness");
  if (witnessRead.finding) {
    return blockedResult(witnessRead.finding);
  }

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
      findings: [`unsupported_args_count:${invalidArgs.length}`],
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
