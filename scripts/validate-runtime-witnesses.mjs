/*
Purpose: validate Mullusi runtime witness registry coverage before public or production promotion.
Governance scope: product runtime witness coverage, service health evidence, fail-closed preflight, control-plane bypass prevention, and rollback readiness.
Dependencies: scripts/generate-platform.mjs, ops/runtime-witness/registry.json, and product manifest files.
Invariants: validation exits nonzero when any product lacks a matching runtime witness or attempts public exposure without closed service health evidence.
Test contract: run node scripts/validate-runtime-witnesses.mjs.
*/

import { validateRuntimeWitnessAuthority } from "./generate-platform.mjs";

const result = validateRuntimeWitnessAuthority();

if (result.failures.length > 0) {
  console.error(result.failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`runtime witness validation passed: ${result.manifests.length} product witnesses`);
}
