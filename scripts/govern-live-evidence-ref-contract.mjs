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
  if (!publicSafeEvidenceRefFamilies.some((family) => ref.startsWith(family))) {
    findings.push(`evidence_ref_family_not_allowed:${ref || "missing"}`);
  }
  findings.push(...scanForbiddenEvidencePatterns("evidence_ref", ref));

  return {
    findings,
    isMissing: false,
    valid: findings.length === 0,
  };
}

