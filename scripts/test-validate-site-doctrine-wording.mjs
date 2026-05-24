/*
Purpose: verify the Doctrine v1.2 public wording gate remains attached to the static site validator.
Governance scope: doctrine evidence state, material-consequence wording, public/private route linkage, and forbidden softened claims.
Dependencies: Node.js standard library and repository text artifacts.
Invariants: tests are deterministic, dependency-free, and fail closed when Doctrine v1.2 wording contracts drift.
*/

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

function readUtf8(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(content, expectedTerm, label) {
  assert.equal(
    content.includes(expectedTerm),
    true,
    `${label} missing ${expectedTerm}`,
  );
}

function assertExcludes(content, forbiddenPhrase, label) {
  assert.equal(
    content.includes(forbiddenPhrase),
    false,
    `${label} contains ${forbiddenPhrase}`,
  );
}

function testValidatorCarriesDoctrineWordingGate() {
  const validator = readUtf8("scripts/validate-site.mjs");

  for (const expectedTerm of [
    "function validateDoctrineWordingContract()",
    "doctrine_wording_required_term_missing",
    "doctrine_wording_forbidden_phrase",
    "Every material consequence re-checked.",
    "re-governs material consequences when context, authority, risk, or dependency state changes.",
    "return PublishableWithBoundary or GovernanceBlocked(reason)",
    "threat_model_minimum",
  ]) {
    assertIncludes(validator, expectedTerm, "validate-site doctrine gate");
  }
}

function testPublicSurfacesCarryHardenedDoctrineTerms() {
  const surfaces = new Map([
    ["index.html", readUtf8("index.html")],
    ["doctrine/index.html", readUtf8("doctrine/index.html")],
    ["ops/mullusi-doctrine.md", readUtf8("ops/mullusi-doctrine.md")],
  ]);

  const requiredTermsBySurface = new Map([
    [
      "index.html",
      [
        "Mullusi governs high-risk symbolic intelligence and software actions before they execute.",
        "Doctrine v1.2 is self-attested against Mullusi architecture and AwaitingEvidence on independent runtime witness until signed endpoints close.",
        "Every material consequence re-checked.",
        "re-governs material consequences when context, authority, risk, or dependency state changes.",
        'href="/doctrine/"',
      ],
    ],
    [
      "doctrine/index.html",
      [
        "No material consequence without re-governance when context, authority, risk, or dependency state changes.",
        "PublishableWithBoundary",
        "Proof Boundaries Appendix",
        "threat_model_ref",
        "return PublishableWithBoundary or GovernanceBlocked(reason)",
        "/runtime/conformance",
      ],
    ],
    [
      "ops/mullusi-doctrine.md",
      [
        "Self-attested against Mullusi architecture and public philosophy.",
        "AwaitingEvidence on independent runtime witness until signed endpoints close.",
        "No material consequence without re-governance when context, authority, risk, or dependency state changes.",
        "threat_model_minimum",
        "rollback(surface_id)",
      ],
    ],
  ]);

  for (const [relativePath, requiredTerms] of requiredTermsBySurface) {
    const content = surfaces.get(relativePath);
    for (const requiredTerm of requiredTerms) {
      assertIncludes(content, requiredTerm, relativePath);
    }
  }
}

function testForbiddenDoctrinePhrasesStayOutOfPublicSurfaces() {
  const sourceSurfaces = [
    "index.html",
    "doctrine/index.html",
    "data/i18n.json",
    "ops/mullusi-doctrine.md",
  ];
  const forbiddenPublicPhrases = [
    "Every consequence re-checked.",
    "Every consequence can be re-checked",
    "full runtime conformance",
    "high-risk software actions before they execute.",
    "governed intelligence for consequential action",
    "teaches the model",
    "Free teaches the model",
  ];

  for (const relativePath of sourceSurfaces) {
    const content = readUtf8(relativePath);
    for (const forbiddenPhrase of forbiddenPublicPhrases) {
      assertExcludes(content, forbiddenPhrase, relativePath);
    }
  }
}

function testDoctrineNavigationIsTranslated() {
  const i18n = JSON.parse(readUtf8("data/i18n.json"));

  assert.equal(i18n.strings["nav.doctrine"].en, "Doctrine");
  assert.equal(typeof i18n.strings["nav.doctrine"].am, "string");
  assert.ok(i18n.strings["nav.doctrine"].am.length > 0);
  assert.equal(
    i18n.strings["hero.title"].en,
    "Mullusi governs high-risk symbolic intelligence and software actions before they execute.",
  );
}

testValidatorCarriesDoctrineWordingGate();
testPublicSurfacesCarryHardenedDoctrineTerms();
testForbiddenDoctrinePhrasesStayOutOfPublicSurfaces();
testDoctrineNavigationIsTranslated();
console.log("validate-site doctrine wording tests passed");
