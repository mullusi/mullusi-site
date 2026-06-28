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
    "function validateFoundationModeBoundary()",
    "doctrine_wording_required_term_missing",
    "doctrine_wording_forbidden_phrase",
    "foundation_mode_required_term_missing",
    "foundation_mode_forbidden_invitation",
    "status_witness_scope_invalid",
    "status_website_publication_scope_missing",
    "homepage_last_updated_datetime_mismatch",
    "i18n_last_updated_am_mojibake",
    "A work system for plans, approvals, and evidence.",
    "Mullu Govern helps teams turn important requests into clear plans, reviewed actions, approval decisions, and durable records.",
    "Preserve the decision trail so teams can inspect what happened, who approved it, and what remains unresolved.",
    "Static website published; product runtime release witnesses AwaitingEvidence.",
    "Mullusi Contact - Foundation Questions",
    "Structured question fields",
    "Pilot access is not open yet.",
    "foundation_mode_required_term_missing",
    "A practical operating layer for controlled work",
    "Turn a request into a clear next action",
    "Keep human judgment in the workflow",
    "higher evaluation limits",
    "customer-controlled deployment",
    "output-derived actions become proposals first",
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
        "A work system for plans, approvals, and evidence.",
        "Mullu Govern helps teams turn important requests into clear plans, reviewed actions, approval decisions, and durable records.",
        "Preserve the decision trail so teams can inspect what happened, who approved it, and what remains unresolved.",
        "output-derived actions become proposals first",
        "A practical operating layer for controlled work",
        "Turn a request into a clear next action",
        "Keep human judgment in the workflow",
        "foundation product path",
        "public site can record future surface expansion",
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
    "Request access",
    "private beta access",
    "public-facing first",
    "live product path",
    "ready for direct surface expansion",
    "limited public access",
    "small-volume hosted evaluations",
    "proof stamp access",
    "customer-controlled deployment",
    "product-ready public-source releases",
    "Live Runtime",
    "live runtime evidence",
    "Live runtime witness",
    "Runtime access",
    "pending live runtime witness",
    "live runtime availability",
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
    i18n.strings["activeHero.title"].en,
    "A work system for plans, approvals, and evidence.",
  );
}

testValidatorCarriesDoctrineWordingGate();
testPublicSurfacesCarryHardenedDoctrineTerms();
testForbiddenDoctrinePhrasesStayOutOfPublicSurfaces();
testDoctrineNavigationIsTranslated();
assertIncludes(readUtf8("docs/FOUNDATION_MODE.md"), "Keep `/pilot/` as a boundary route", "foundation mode doc");
assertIncludes(readUtf8("docs/FOUNDATION_MODE.md"), "[Foundation Prerequisites](FOUNDATION_PREREQUISITES.md)", "foundation mode doc");
assertIncludes(readUtf8("docs/FOUNDATION_MODE.md"), "external witness blockers belong to product/runtime release claims", "foundation mode doc");
assertIncludes(readUtf8("docs/FOUNDATION_MODE.md"), "Static website published; product runtime release witnesses AwaitingEvidence.", "foundation mode doc");
assertIncludes(readUtf8("docs/FOUNDATION_PREREQUISITES.md"), "Foundation prerequisites are preparation work, not launch work.", "foundation prerequisites doc");
assertIncludes(readUtf8("docs/FOUNDATION_PREREQUISITES.md"), "External witness blockers apply to product/runtime release claims.", "foundation prerequisites doc");
assertIncludes(readUtf8("docs/FOUNDATION_PREREQUISITES.md"), "First local proof thread is approval-gated and receipt-bound.", "foundation prerequisites doc");
assertIncludes(readUtf8("docs/FOUNDATION_PREREQUISITES.md"), "No customer access or deployment claim.", "foundation prerequisites doc");
assertIncludes(readUtf8("pilot/index.html"), "Pilot route state: Foundation boundary; no access claim", "pilot foundation route");
assertIncludes(readUtf8("pilot/index.html"), "API runtime readiness", "pilot foundation route");
assertExcludes(readUtf8("pilot/index.html"), "live API", "pilot foundation route");
assertIncludes(readUtf8("contact/index.html"), "Mullusi Contact - Foundation Questions", "contact foundation route");
assertIncludes(readUtf8("contact/index.html"), "Structured question fields", "contact foundation route");
assertIncludes(readUtf8("contact/index.html"), "does not claim backend storage, access workflow, or pilot workflow.", "contact foundation route");
assertExcludes(readUtf8("contact/index.html"), "Structured intake fields", "contact foundation route");
assertExcludes(readUtf8("contact/index.html"), "Governed Intake", "contact foundation route");
assertExcludes(readUtf8("contact/index.html"), "pilot intake", "contact foundation route");
assertIncludes(readUtf8("status/index.html"), "Published website routes are live and linked.", "status foundation route");
assertIncludes(readUtf8("status/index.html"), "They do not claim open pilot access.", "status foundation route");
assertIncludes(readUtf8("terms/index.html"), "foundation-stage agreement-boundary questions", "terms foundation route");
assertIncludes(readUtf8("terms/index.html"), "Pilot access remains closed until a separate readiness decision is published.", "terms foundation route");
assertExcludes(readUtf8("terms/index.html"), "governed pilot or product agreement", "terms foundation route");
assertIncludes(readUtf8("acceptable-use/index.html"), "future governed runtime conduct", "acceptable use foundation route");
assertIncludes(readUtf8("acceptable-use/index.html"), "If a separate written runtime approval is published", "acceptable use foundation route");
assertIncludes(readUtf8("acceptable-use/index.html"), "Runtime conduct terms: AwaitingEvidence until separate written approval.", "acceptable use foundation route");
assertExcludes(readUtf8("acceptable-use/index.html"), "future governed runtime access", "acceptable use foundation route");
assertExcludes(readUtf8("acceptable-use/index.html"), "When governed runtime access is granted", "acceptable use foundation route");
assertIncludes(readUtf8("data/site.json"), "public routes", "site registry foundation boundary");
assertIncludes(readUtf8("data/site.json"), "local review examples", "site registry foundation boundary");
assertIncludes(readUtf8("data/site.json"), "planned workspace access", "site registry foundation boundary");
assertIncludes(readUtf8("data/site.json"), "higher evaluation limits", "site registry foundation boundary");
assertIncludes(readUtf8("data/site.json"), "Planned private deployment path", "site registry foundation boundary");
assertIncludes(readUtf8("data/site.json"), "after release evidence closes", "site registry foundation boundary");
assertExcludes(readUtf8("data/site.json"), "limited public access", "site registry foundation boundary");
assertExcludes(readUtf8("data/site.json"), "small-volume hosted evaluations", "site registry foundation boundary");
assertExcludes(readUtf8("data/site.json"), "proof stamp access", "site registry foundation boundary");
assertExcludes(readUtf8("data/site.json"), "customer-controlled deployment", "site registry foundation boundary");
assertIncludes(readUtf8("data/i18n.json"), "public foundation route first", "i18n foundation boundary");
assertIncludes(readUtf8("data/i18n.json"), "witness closure preparation", "i18n foundation boundary");
assertIncludes(readUtf8("data/i18n.json"), "foundation product path", "i18n foundation boundary");
assertIncludes(readUtf8("data/i18n.json"), "public site can record future surface expansion", "i18n foundation boundary");
assertExcludes(readUtf8("data/i18n.json"), "public-facing first", "i18n foundation boundary");
assertExcludes(readUtf8("data/i18n.json"), "live product path", "i18n foundation boundary");
assertExcludes(readUtf8("data/i18n.json"), "ready for direct surface expansion", "i18n foundation boundary");
assertExcludes(readUtf8("data/i18n.json"), "product-ready public-source releases", "i18n foundation boundary");
assertIncludes(readUtf8("index.html"), "Runtime Witness", "runtime witness label boundary");
assertIncludes(readUtf8("data/i18n.json"), "Runtime Witness", "runtime witness label boundary");
assertIncludes(readUtf8("proof/index.html"), "Runtime witness", "proof runtime witness boundary");
assertIncludes(readUtf8("terms/index.html"), "Runtime product boundary", "terms runtime boundary");
assertIncludes(readUtf8("playground/index.html"), "not the runtime service", "playground runtime boundary");
assertIncludes(readUtf8("data/site.json"), "does not claim runtime availability", "sample response runtime boundary");
assertIncludes(readUtf8("mullu/index.html"), "pilot workflow are not claimed", "mullu foundation route");
assertExcludes(readUtf8("index.html"), "Live Runtime", "runtime witness label boundary");
assertExcludes(readUtf8("mullu/index.html"), "pilot intake", "mullu foundation route");
assertExcludes(readUtf8("proof/index.html"), "Live runtime witness", "proof runtime witness boundary");
assertExcludes(readUtf8("terms/index.html"), "Runtime access", "terms runtime boundary");
assertExcludes(readUtf8("playground/index.html"), "live runtime remains", "playground runtime boundary");
assertExcludes(readUtf8("data/site.json"), "live runtime availability", "sample response runtime boundary");
assertIncludes(readUtf8("index.html"), 'datetime="2026-06-09"', "homepage source date boundary");
assertIncludes(readUtf8("index.html"), "Public state updated 2026-06-09", "homepage source date boundary");
assertIncludes(readUtf8("data/i18n.json"), '"en": "Public state updated 2026-06-09"', "i18n source date boundary");
assertIncludes(readUtf8("data/i18n.json"), "2026-06-09", "i18n source date boundary");
console.log("validate-site doctrine wording tests passed");
