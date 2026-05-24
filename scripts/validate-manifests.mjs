/*
Purpose: validate Mullusi product manifests and referenced contract, privacy, retention, and proof files.
Governance scope: product manifest authority, route uniqueness, API uniqueness, privacy gate, proof gate, and release-gate completeness.
Dependencies: scripts/generate-platform.mjs and Node.js standard library.
Invariants: validation fails closed when any manifest can drift, duplicate, bypass the control plane, or reference missing evidence files.
Test contract: run node scripts/validate-manifests.mjs.
*/

import { validateManifestAuthority } from "./generate-platform.mjs";

const result = validateManifestAuthority();

if (result.failures.length > 0) {
  console.error(result.failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`manifest validation passed: ${result.manifests.length} product manifests`);
}
