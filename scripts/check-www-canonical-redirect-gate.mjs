/*
Purpose: evaluate the www-to-apex redirect gate from public-safe website witness files.
Governance scope: source redirect rule, live redirect witness, migration closure, and fail-closed release state.
Dependencies: Node.js standard library, _redirects, and ops/website-origin-witness.md.
Invariants: deterministic, no network access, no secrets, and non-ready gates exit nonzero unless --allow-pending is set.
Test contract: run node scripts/test-www-canonical-redirect-gate.mjs.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const redirectRule = "https://www.mullusi.com/* https://mullusi.com/:splat 301";
const witnessTargets = [
  {
    targetUrl: "https://www.mullusi.com/",
    expectedFinalUrl: "https://mullusi.com/",
    expectedRedirectCount: "1",
    expectedFirstRedirectStatus: "301",
  },
  {
    targetUrl: "https://www.mullusi.com/proof/?gate=www-canonical",
    expectedFinalUrl: "https://mullusi.com/proof/?gate=www-canonical",
    expectedRedirectCount: "1",
    expectedFirstRedirectStatus: "301",
  },
];

function readCliFile(filePath) {
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  if (!filePath || !fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    throw new Error(`cli_file_unreadable:${filePath || "<empty>"}`);
  }
  return fs.readFileSync(resolvedPath, "utf8");
}

function cliValue(args, name, defaultValue) {
  const prefix = `${name}=`;
  const value = args.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : defaultValue;
}

function unsupportedArgs(args) {
  return args.filter((arg) => arg !== "--allow-pending" && !arg.startsWith("--redirects-file=") && !arg.startsWith("--witness-file="));
}

function normalizeWitnessBlock(block) {
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("```"))
    .join("\n");
}

function witnessBlocksForTarget(witness, targetUrl) {
  return witness
    .split(/\r?\n\s*\r?\n/)
    .filter((block) => block.split(/\r?\n/).some((line) => line.trim() === `target=${targetUrl}`))
    .map(normalizeWitnessBlock);
}

function lineValue(block, key) {
  const match = block.match(new RegExp(`^${key}=([^\\n]*)`, "m"));
  return match?.[1]?.trim() ?? "";
}

function hasExactRedirectRule(redirects, rule) {
  return redirects
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === rule);
}

export function evaluateWwwCanonicalRedirectGate({ redirects, witness }) {
  const sourceRulePresent = hasExactRedirectRule(redirects, redirectRule);
  const targetResults = witnessTargets.map(({ targetUrl, expectedFinalUrl, expectedRedirectCount, expectedFirstRedirectStatus }) => {
    const blocks = witnessBlocksForTarget(witness, targetUrl);
    const witnessBlockCount = String(blocks.length);
    const block = blocks.length === 1 ? blocks[0] : "";
    const finalUrl = lineValue(block, "final_url");
    const status = lineValue(block, "status");
    const redirectCount = lineValue(block, "redirect_count");
    const firstRedirectStatus = lineValue(block, "first_redirect_status");
    const firstRedirectUrl = lineValue(block, "first_redirect_url");
    const verdict = lineValue(block, "verdict");
    const proofState = lineValue(block, "proof_state");
    return {
      targetUrl,
      expectedFinalUrl,
      expectedRedirectCount,
      expectedFirstRedirectStatus,
      witnessBlockCount,
      finalUrl,
      status,
      redirectCount,
      firstRedirectStatus,
      firstRedirectUrl,
      verdict,
      proofState,
      ready: witnessBlockCount === "1" && finalUrl === expectedFinalUrl && status === "200" && redirectCount === expectedRedirectCount && firstRedirectStatus === expectedFirstRedirectStatus && firstRedirectUrl === expectedFinalUrl && verdict === "CloudflareOriginCandidate" && proofState === "Pass",
    };
  });
  const rootResult = targetResults[0];
  const pathQueryResult = targetResults[1];
  const ready = sourceRulePresent && targetResults.every((result) => result.ready);

  if (ready) {
    return {
      state: "Ready",
      reason: "www_redirect_verified",
      sourceRule: "present",
      finalUrl: rootResult.finalUrl,
      status: rootResult.status,
      verdict: rootResult.verdict,
      proofState: rootResult.proofState,
      pathQueryFinalUrl: pathQueryResult.finalUrl,
      targetResults,
    };
  }

  return {
    state: "AwaitingEvidence",
    reason: sourceRulePresent ? "canonical_redirect_pending" : "source_redirect_rule_missing",
    sourceRule: sourceRulePresent ? "present" : "missing",
    finalUrl: rootResult.finalUrl,
    status: rootResult.status,
    verdict: rootResult.verdict,
    proofState: rootResult.proofState,
    pathQueryFinalUrl: pathQueryResult.finalUrl,
    targetResults,
  };
}

export function formatResult(result) {
  const lines = [
    `www_redirect_gate state=${result.state}`,
    `reason=${result.reason}`,
    `source_rule=${result.sourceRule}`,
    `final_url=${result.finalUrl}`,
    `status=${result.status}`,
    `verdict=${result.verdict}`,
    `proof_state=${result.proofState}`,
    `path_query_final_url=${result.pathQueryFinalUrl}`,
  ];
  for (const targetResult of result.targetResults) {
    lines.push(
      `target=${targetResult.targetUrl}`,
      `observed_witness_block_count=${targetResult.witnessBlockCount}`,
      `expected_final_url=${targetResult.expectedFinalUrl}`,
      `observed_final_url=${targetResult.finalUrl}`,
      `observed_status=${targetResult.status}`,
      `expected_redirect_count=${targetResult.expectedRedirectCount}`,
      `observed_redirect_count=${targetResult.redirectCount}`,
      `expected_first_redirect_status=${targetResult.expectedFirstRedirectStatus}`,
      `observed_first_redirect_status=${targetResult.firstRedirectStatus}`,
      `observed_first_redirect_url=${targetResult.firstRedirectUrl}`,
      `observed_verdict=${targetResult.verdict}`,
      `observed_proof_state=${targetResult.proofState}`,
      `target_ready=${targetResult.ready ? "true" : "false"}`,
    );
  }
  return lines.join("\n");
}

function runCli() {
  const args = process.argv.slice(2);
  try {
    const invalidArgs = unsupportedArgs(args);
    if (invalidArgs.length > 0) {
      throw new Error(`unsupported_args=${invalidArgs.join(",")}`);
    }
    const allowPending = args.includes("--allow-pending");
    const redirectsFile = cliValue(args, "--redirects-file", "_redirects");
    const witnessFile = cliValue(args, "--witness-file", "ops/website-origin-witness.md");
    const result = evaluateWwwCanonicalRedirectGate({
      redirects: readCliFile(redirectsFile),
      witness: readCliFile(witnessFile),
    });
    console.log(formatResult(result));
    if (result.state !== "Ready" && !allowPending) {
      process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
