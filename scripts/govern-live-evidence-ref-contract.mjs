/*
Purpose: define the shared public-safe evidence ref contract for Mullu Govern live evidence gates.
Governance scope: required approval input keys, allowed public-safe ref families, private-value pattern rejection, and deterministic ref validation.
Dependencies: Node.js standard library only.
Invariants: pure validation helpers; no files are read, no network calls run, no approval state is changed, and no private values are printed.
Test contract: run node scripts/test-govern-live-evidence-ref-contract.mjs.
*/

export const requiredLiveEvidenceApprovalKeys = Object.freeze([
  "operator_approval_ref",
  "product_status_promotion_ref",
  "privacy_activation_ref",
  "retention_activation_ref",
  "dashboard_operator_readiness_ref",
  "api_contract_test_ref",
  "public_claim_update_ref",
  "runtime_witness_ref",
]);

export const publicSafeEvidenceRefFamilies = Object.freeze([
  "approval://",
  "receipt://",
  "github:pull/",
  "github:actions/runs/",
  "site:ops/",
  "control-plane:pull/",
  "control-plane:receipt/",
  "render:event/",
  "cloudflare:audit/",
  "google-workspace:audit/",
]);

const publicSafeEvidenceRefShapes = Object.freeze([
  {
    family: "approval://",
    pattern: /^approval:\/\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*\/\d{4}-\d{2}-\d{2}\/[a-z0-9][a-z0-9-]*$/,
  },
  {
    family: "receipt://",
    pattern: /^receipt:\/\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*\/\d{4}-\d{2}-\d{2}$/,
  },
  {
    family: "github:pull/",
    pattern: /^github:pull\/\d+:[A-Za-z0-9][A-Za-z0-9._/-]*$/,
  },
  {
    family: "github:actions/runs/",
    pattern: /^github:actions\/runs\/\d+:[A-Za-z0-9][A-Za-z0-9._/-]*$/,
  },
  {
    family: "site:ops/",
    pattern: /^site:ops\/[A-Za-z0-9][A-Za-z0-9._/-]*$/,
  },
  {
    family: "control-plane:pull/",
    pattern: /^control-plane:pull\/\d+:[A-Za-z0-9][A-Za-z0-9._/-]*$/,
  },
  {
    family: "control-plane:receipt/",
    pattern: /^control-plane:receipt\/[A-Za-z0-9][A-Za-z0-9._/-]*$/,
  },
  {
    family: "render:event/",
    pattern: /^render:event\/[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  },
  {
    family: "cloudflare:audit/",
    pattern: /^cloudflare:audit\/[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  },
  {
    family: "google-workspace:audit/",
    pattern: /^google-workspace:audit\/[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  },
]);

export const forbiddenEvidencePatterns = Object.freeze([
  { label: "postgres_url", pattern: /postgres(?:ql)?:\/\//i },
  { label: "private_key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "bearer_token", pattern: /Bearer\s+[A-Za-z0-9._~+/-]{16,}/ },
  { label: "api_key_shape", pattern: /\b(?:sk|pk|rk|ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{12,}/ },
  { label: "google_api_key_shape", pattern: /\bAIza[0-9A-Za-z_-]{20,}/ },
  { label: "raw_header_authorization", pattern: /^Authorization:/im },
  { label: "raw_json_payload", pattern: /^\s*{\s*"(?:input|prompt|message|token|authorization|password|secret)"/im },
]);

export function scanForbiddenEvidencePatterns(sourceLabel, content) {
  const findings = [];
  for (const { label, pattern } of forbiddenEvidencePatterns) {
    if (pattern.test(content)) findings.push(`forbidden_private_value_pattern:${sourceLabel}:${label}`);
  }
  return findings;
}

export function validatePublicSafeEvidenceRef(value, options = {}) {
  const allowMissing = options.allowMissing === true;
  const findings = [];
  const ref = String(value ?? "").trim();

  if (ref === "missing") {
    return {
      findings,
      isMissing: true,
      valid: allowMissing,
    };
  }

  if (!ref) findings.push("evidence_ref_empty");
  if (/\s/.test(ref)) findings.push("evidence_ref_must_not_contain_whitespace");
  if (ref.length > 160) findings.push(`evidence_ref_too_long:${ref.length}`);
  const shape = publicSafeEvidenceRefShapes.find((candidate) => ref.startsWith(candidate.family));
  if (!shape) {
    findings.push(`evidence_ref_family_not_allowed:${ref ? "present" : "missing"}`);
  } else if (!shape.pattern.test(ref)) {
    findings.push(`evidence_ref_shape_invalid:${shape.family}`);
  }
  findings.push(...scanForbiddenEvidencePatterns("evidence_ref", ref));

  return {
    findings,
    isMissing: false,
    valid: findings.length === 0,
  };
}

