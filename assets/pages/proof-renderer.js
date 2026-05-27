/*
Purpose: render the Mullusi proof boundary from governed public JSON records.
Governance scope: proof-state display, product evidence lanes, runtime witness board, public claim decisions, and public proof stamp artifact.
Dependencies: data/generated/products.json, data/generated/claim-registry.json, data/site.json, and proof page markup.
Invariants: all fetched records render with escaped text or bounded links, failures surface explicit AwaitingEvidence copy, and public claims render only from generated claim decisions.
*/

(() => {
      const escapeHtml = (value) => String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

      const statusLabel = (status) => ({
        live: "Live",
        "awaiting-evidence": "AwaitingEvidence",
        "private-incubation": "Private incubation",
        planned: "Planned",
        restricted: "Restricted",
        allowed: "Allowed",
        blocked: "Blocked",
        block: "Block",
        render: "Render",
        "limited-preview": "Limited preview",
        "internal-alpha": "Internal alpha",
        "public-beta": "Public beta",
        production: "Production",
        archived: "Archived",
      }[status] || status || "Unknown");

      const docsHref = (docsPath) => /^docs\.mullusi\.com(?:\/[a-z0-9/_-]+(?:\.html)?)?$/.test(docsPath || "")
        ? `https://${docsPath}`
        : /^https:\/\/docs\.mullusi\.com(?:\/[a-z0-9-]+)?$/.test(docsPath || "")
          ? docsPath
          : "";

      const evidenceHref = (path) => /^\/proof\/(?:[a-z0-9-]+\/)?$/.test(path || "")
        ? path
        : "";

      const apiLabel = (product) => {
        if (Array.isArray(product.apiRoutes) && product.apiRoutes.length > 0) {
          return product.apiRoutes.join(", ");
        }
        if (typeof product.apiPath === "string" && product.apiPath.trim()) return product.apiPath;
        if (product.apiExposure === "none") return "No public API";
        return "No public API";
      };

      const safeFollowHref = (href) => /^(https:\/\/|mailto:|\/[A-Za-z0-9/_-]*\/?$)/.test(href || "") ? href : "";

      const normalizePublicProduct = (product) => ({
        ...product,
        apiRoutes: Array.isArray(product.apiRoutes)
          ? product.apiRoutes
          : (product.apiPath ? [product.apiPath] : []),
        category: product.category || product.classification || product.runtimeType || "public registry",
        docsRoute: product.docsRoute || product.docsPath || "",
        owner: product.owner || "Mullusi",
        proofRoute: product.proofRoute || product.evidencePath || "",
        releaseGateState: product.releaseGateState || product.releaseGate || "blocked",
        runtimeState: product.runtimeState || product.status || "AwaitingEvidence",
        status: product.status || product.manifestStatus || "awaiting-evidence",
      });

      const productEvidenceRows = (registry) => {
        if (Array.isArray(registry.products) && registry.products.length > 0) {
          return registry.products.map(normalizePublicProduct);
        }
        if (Array.isArray(registry.productRegistry) && registry.productRegistry.length > 0) {
          return registry.productRegistry.map(normalizePublicProduct);
        }
        return [];
      };

      const summaryCell = (value, label) => `
        <div>
          <dt>${escapeHtml(value)}</dt>
          <dd>${escapeHtml(label)}</dd>
        </div>
      `;

      const productCard = (product) => {
        const docs = docsHref(product.docsRoute);
        const proof = evidenceHref(product.proofRoute);
        return `
          <article class="product-proof-card">
            <div class="product-proof-head">
              <h3>${escapeHtml(product.name)}</h3>
              <span class="status-pill">${escapeHtml(statusLabel(product.status))}</span>
            </div>
            <p>${escapeHtml(product.summary)}</p>
            <dl class="proof-meta">
              <div><dt>Category</dt><dd>${escapeHtml(product.category)}</dd></div>
              <div><dt>Owner</dt><dd>${escapeHtml(product.owner)}</dd></div>
              <div><dt>Gate</dt><dd>${escapeHtml(product.releaseGateState)}</dd></div>
              <div><dt>API</dt><dd>${escapeHtml(apiLabel(product))}</dd></div>
            </dl>
            <div class="proof-actions">
              ${docs ? `<a href='${escapeHtml(docs)}'>Docs</a>` : "<span>Private docs</span>"}
              ${proof ? `<a href='${escapeHtml(proof)}'>Proof boundary</a>` : "<span>No proof route</span>"}
            </div>
          </article>
        `;
      };

      const renderProductEvidenceLanes = async () => {
        const target = document.querySelector("[data-product-evidence]");
        if (!target) return;
        try {
          const response = await fetch("../data/generated/products.json", { cache: "no-store" });
          if (!response.ok) throw new Error(`Product registry load failed: ${response.status}`);
          const registry = await response.json();
          const products = productEvidenceRows(registry);
          if (!products.length) throw new Error("Product registry is empty");

          const awaiting = products.filter((product) => product.runtimeState === "AwaitingEvidence").length;
          const blocked = products.filter((product) => product.publicExposureAllowed !== true).length;
          const proofLinked = products.filter((product) => evidenceHref(product.proofRoute)).length;
          const docsLinked = products.filter((product) => docsHref(product.docsRoute)).length;
          target.innerHTML = `
            <dl class="proof-summary" aria-label="Product evidence registry summary">
              ${summaryCell(products.length, "product records")}
              ${summaryCell(awaiting, "awaiting evidence")}
              ${summaryCell(blocked, "blocked public")}
              ${summaryCell(`${proofLinked}/${docsLinked}`, "proof/docs linked")}
            </dl>
            <div class="product-proof-grid">
              ${products.map(productCard).join("")}
            </div>
          `;
        } catch (error) {
          target.innerHTML = `
            <div class="proof-empty">
              Product evidence lanes are unavailable. Confirm <code>data/generated/products.json</code> is deployed with the proof page.
            </div>
          `;
        }
      };

      const claimCard = (claim) => `
        <article class="claim-card">
          <div class="claim-card-head">
            <code>${escapeHtml(claim.claimId)}</code>
            <span class="status-pill">${escapeHtml(statusLabel(claim.claimState))}</span>
          </div>
          <h3>${escapeHtml(claim.claimText)}</h3>
          <dl class="proof-meta">
            <div><dt>Product</dt><dd>${escapeHtml(claim.productName)}</dd></div>
            <div><dt>Proof</dt><dd>${escapeHtml(claim.proofState)}</dd></div>
            <div><dt>Runtime</dt><dd>${escapeHtml(claim.runtimeWitnessClosed ? "closed" : "blocked")}</dd></div>
            <div><dt>Render</dt><dd>${escapeHtml(statusLabel(claim.renderDecision))}</dd></div>
          </dl>
          <p>${escapeHtml(claim.blockingReason)}</p>
        </article>
      `;

      const renderClaimRegistry = async () => {
        const target = document.querySelector("[data-claim-registry]");
        if (!target) return;
        try {
          const response = await fetch("../data/generated/claim-registry.json", { cache: "no-store" });
          if (!response.ok) throw new Error(`Claim registry load failed: ${response.status}`);
          const registry = await response.json();
          const claims = Array.isArray(registry.claims) ? registry.claims : [];
          if (!claims.length) throw new Error("Claim registry is empty");

          const blocked = claims.filter((claim) => claim.publicRenderAllowed !== true).length;
          const renderable = claims.filter((claim) => claim.publicRenderAllowed === true).length;
          const closedRuntime = claims.filter((claim) => claim.runtimeWitnessClosed === true).length;
          target.innerHTML = `
            <dl class="proof-summary" aria-label="Claim registry summary">
              ${summaryCell(claims.length, "bound claims")}
              ${summaryCell(blocked, "blocked claims")}
              ${summaryCell(renderable, "renderable claims")}
              ${summaryCell(closedRuntime, "runtime closed")}
            </dl>
            <div class="claim-grid">
              ${claims.map(claimCard).join("")}
            </div>
          `;
        } catch (error) {
          target.innerHTML = `
            <div class="proof-empty">
              Claim registry is unavailable. Confirm <code>data/generated/claim-registry.json</code> is deployed with the proof page.
            </div>
          `;
        }
      };

      const runtimeStatusCard = (row) => `
        <article class="runtime-status-card">
          <span class="status-pill">${escapeHtml(statusLabel(row.state))}</span>
          <h3>${escapeHtml(row.component)}</h3>
          <p>${escapeHtml(row.note)}</p>
        </article>
      `;

      const runtimeCheckCard = (check) => `
        <article class="runtime-check-card">
          <code>${escapeHtml(check.path)}</code>
          <span class="status-pill">${escapeHtml(statusLabel(check.state))}</span>
          <p>${escapeHtml(check.purpose)}</p>
        </article>
      `;

      const runtimeClosureCard = (gate) => `
        <article class="runtime-closure-card">
          <span class="status-pill">${escapeHtml(statusLabel(gate.state))}</span>
          <h4>${escapeHtml(gate.gate)}</h4>
          <code>${escapeHtml(gate.dependsOn)}</code>
          <p>${escapeHtml(gate.evidence)}</p>
          <dl>
            <div><dt>Protects</dt><dd>${escapeHtml(gate.protects)}</dd></div>
            <div><dt>Fallback</dt><dd>${escapeHtml(gate.failureAction)}</dd></div>
          </dl>
        </article>
      `;

      const findingContractCard = (finding) => `
        <article class="finding-contract-card">
          <h4>${escapeHtml(finding.name)}</h4>
          <code>${escapeHtml(finding.passDetail)}</code>
          <p>${escapeHtml(finding.blocks)}</p>
        </article>
      `;

      const runtimeResponseCard = (example) => `
        <article class="runtime-response-card">
          <div class="response-status-pills">
            <span class="status-pill">${escapeHtml(example.runtimeState)}</span>
            <span class="status-pill">${escapeHtml(example.statusCode)}</span>
          </div>
          <h4>${escapeHtml(example.title)}</h4>
          <p>${escapeHtml(example.purpose)}</p>
          <pre aria-label="${escapeHtml(example.runtimeState)} runtime conformance example"><code>${escapeHtml(JSON.stringify(example.body, null, 2))}</code></pre>
        </article>
      `;

      const gatewayResponseCard = (example) => `
        <article class="gateway-response-card">
          <div class="response-status-pills">
            <span class="status-pill">${escapeHtml(example.runtimeState)}</span>
            <span class="status-pill">${escapeHtml(example.statusCode)}</span>
          </div>
          <h4>${escapeHtml(example.title)}</h4>
          <p>${escapeHtml(example.purpose)}</p>
          <pre aria-label="${escapeHtml(example.runtimeState)} gateway witness example"><code>${escapeHtml(JSON.stringify(example.body, null, 2))}</code></pre>
        </article>
      `;

      const healthWitnessCard = (example) => `
        <article class="health-witness-card">
          <div class="response-status-pills">
            <span class="status-pill">${escapeHtml(example.state)}</span>
            <span class="status-pill">${escapeHtml(example.statusCode)}</span>
          </div>
          <h4>${escapeHtml(example.title)}</h4>
          <p>${escapeHtml(example.purpose)}</p>
          <pre aria-label="${escapeHtml(example.title)} example"><code>${escapeHtml(JSON.stringify(example.body, null, 2))}</code></pre>
        </article>
      `;

      const protectedPathCard = (path) => `
        <article class="protected-path-card">
          <code>${escapeHtml(path)}</code>
        </article>
      `;

      const stampFieldCard = (field) => `
        <article class="stamp-field">
          <code>${escapeHtml(field.name)}</code>
          <div class="stamp-field-meta">
            <span>${escapeHtml(field.type)}</span>
            <span>${field.required ? "Required" : "Optional"}</span>
          </div>
          <p>${escapeHtml(field.purpose)}</p>
        </article>
      `;

      const stampLifecycleItem = (item) => `
        <div>
          <dt>${escapeHtml(item.state)}</dt>
          <dd>${escapeHtml(item.meaning)}</dd>
        </div>
      `;

      const verifierCheckCard = (check) => `
        <article class="verifier-check">
          <h4>${escapeHtml(check.name)}</h4>
          <code>${escapeHtml(check.dependsOn)}</code>
          <span>Fail closed: ${escapeHtml(check.failureState)}</span>
          <p>${escapeHtml(check.purpose)}</p>
        </article>
      `;

      const verifierOutcomeItem = (item) => `
        <div>
          <dt>${escapeHtml(item.state)}</dt>
          <dd>${escapeHtml(item.meaning)}</dd>
        </div>
      `;

      const verifierDecisionCard = (item) => `
        <article class="verifier-decision-card">
          <header>
            <b>${escapeHtml(item.step)}</b>
            <span class="status-pill">${escapeHtml(item.publicState)}</span>
          </header>
          <h4>${escapeHtml(item.condition)}</h4>
          <dl>
            <div><dt>Evidence</dt><dd>${escapeHtml(item.evidence)}</dd></div>
            <div><dt>Action</dt><dd>${escapeHtml(item.action)}</dd></div>
          </dl>
        </article>
      `;

      const verifierResponseExampleCard = (example) => `
        <article class="verifier-response-card">
          <header>
            <div>
              <h4>${escapeHtml(example.title)}</h4>
              <p>${escapeHtml(example.purpose)}</p>
            </div>
            <div class="response-status-pills">
              <span class="status-pill">${escapeHtml(example.state)}</span>
              <span class="status-pill">${escapeHtml(example.statusCode)}</span>
            </div>
          </header>
          <pre aria-label="${escapeHtml(example.state)} verifier response example"><code>${escapeHtml(JSON.stringify(example.body, null, 2))}</code></pre>
        </article>
      `;

      const operatorFailureItem = (failure) => `
        <li>
          <strong>${escapeHtml(failure.statusCode)} ${escapeHtml(failure.detail)}</strong>
          <span>${escapeHtml(failure.meaning)}</span>
        </li>
      `;

      const operatorRouteCard = (route) => `
        <article class="operator-route-card">
          <h4>${escapeHtml(route.name)}</h4>
          <code>${escapeHtml(route.method)} ${escapeHtml(route.route)}</code>
          <dl>
            <div><dt>Host</dt><dd>${escapeHtml(route.host)}</dd></div>
            <div><dt>Exposure</dt><dd>${escapeHtml(route.exposure)}</dd></div>
            <div><dt>Mutation</dt><dd>${escapeHtml(route.mutation)}</dd></div>
            <div><dt>Input</dt><dd>${escapeHtml(route.input)}</dd></div>
          </dl>
          <pre aria-label="${escapeHtml(route.name)} success response"><code>${escapeHtml(JSON.stringify(route.successBody, null, 2))}</code></pre>
          ${route.alternateBody ? `<pre aria-label="${escapeHtml(route.name)} alternate response"><code>${escapeHtml(JSON.stringify(route.alternateBody, null, 2))}</code></pre>` : ""}
          <ul class="operator-failure-list" aria-label="${escapeHtml(route.name)} failure modes">
            ${Array.isArray(route.failureModes) ? route.failureModes.map(operatorFailureItem).join("") : ""}
          </ul>
        </article>
      `;

      const verifierStateModelRow = (item) => `
        <div class="state-model-row">
          <code>${escapeHtml(item.internal)}</code>
          <strong>${escapeHtml(item.publicState)}</strong>
          <p>
            ${escapeHtml(item.evidence)}
            <span>${escapeHtml(item.responseBoundary)}</span>
          </p>
        </div>
      `;

      const verifierImplementationFile = (file) => `
        <div class="implementation-file">
          <code>${escapeHtml(file.path)}</code>
          <p>${escapeHtml(file.role)}</p>
        </div>
      `;

      const releaseWitnessCard = (witness) => `
        <article class="release-witness-card">
          <h4>${escapeHtml(witness.name)}</h4>
          <code>${escapeHtml(witness.command)}</code>
          <dl>
            <div><dt>Expected</dt><dd>${escapeHtml(witness.expected)}</dd></div>
            <div><dt>Boundary</dt><dd>${escapeHtml(witness.boundary)}</dd></div>
            <div><dt>Blocks</dt><dd>${escapeHtml(witness.blocks)}</dd></div>
          </dl>
        </article>
      `;

      const implementationList = (title, items) => `
        <div>
          <h4>${escapeHtml(title)}</h4>
          <ul class="implementation-list">
            ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      `;

      const renderRuntimeWitnessBoard = async () => {
        const target = document.querySelector("[data-runtime-witness]");
        if (!target) return;
        try {
          const response = await fetch("../data/site.json", { cache: "no-store" });
          if (!response.ok) throw new Error(`Runtime status load failed: ${response.status}`);
          const content = await response.json();
          const board = content.statusBoard;
          const rows = Array.isArray(board?.rows) ? board.rows : [];
          const checks = Array.isArray(board?.witnessChecks) ? board.witnessChecks : [];
          const closureGates = Array.isArray(board?.closureGates) ? board.closureGates : [];
          const healthWitness = board?.healthWitness && typeof board.healthWitness === "object"
            ? board.healthWitness
            : null;
          const healthExamples = Array.isArray(healthWitness?.responseExamples) ? healthWitness.responseExamples : [];
          const runtimeConformance = board?.runtimeConformance && typeof board.runtimeConformance === "object"
            ? board.runtimeConformance
            : null;
          const findingContract = Array.isArray(runtimeConformance?.findingContract)
            ? runtimeConformance.findingContract
            : [];
          const responseExamples = Array.isArray(runtimeConformance?.responseExamples)
            ? runtimeConformance.responseExamples
            : [];
          const gatewayWitness = board?.gatewayWitness && typeof board.gatewayWitness === "object"
            ? board.gatewayWitness
            : null;
          const protectedPaths = Array.isArray(gatewayWitness?.protectedPaths) ? gatewayWitness.protectedPaths : [];
          const gatewayExamples = Array.isArray(gatewayWitness?.responseExamples) ? gatewayWitness.responseExamples : [];
          if (
            !rows.length
            || !checks.length
            || !closureGates.length
            || !healthWitness
            || !healthExamples.length
            || !runtimeConformance
            || !findingContract.length
            || !responseExamples.length
            || !gatewayWitness
            || !protectedPaths.length
            || !gatewayExamples.length
          ) throw new Error("Runtime witness board is incomplete");
          const followHref = safeFollowHref(board.followHref);
          target.innerHTML = `
            <div>
              <div class="eyebrow">${escapeHtml(board.label || "System status")}</div>
              <h3>${escapeHtml(board.title || "What is live, what is not.")}</h3>
              <p class="runtime-follow">
                ${escapeHtml(board.follow || "")}
                ${followHref ? `<a href='${escapeHtml(followHref)}'>${escapeHtml(board.followLabel || "Request access")}</a>` : ""}
              </p>
            </div>
            <div class="runtime-status-grid">
              ${rows.map(runtimeStatusCard).join("")}
            </div>
            <div class="runtime-check-grid" aria-label="Runtime witness checks">
              ${checks.map(runtimeCheckCard).join("")}
            </div>
            <div class="runtime-closure-grid" aria-label="Runtime closure gates">
              ${closureGates.map(runtimeClosureCard).join("")}
            </div>
            <section class="runtime-contract" aria-label="Health and version witness">
              <div class="runtime-contract-head">
                <span class="status-pill">${escapeHtml(statusLabel(healthWitness.status))}</span>
                <h3>${escapeHtml(healthWitness.title)}</h3>
                <p>${escapeHtml(healthWitness.summary)}</p>
                <code class="stamp-version">${escapeHtml(healthWitness.route)} / ${escapeHtml(healthWitness.versionedRoute)} / ${escapeHtml(healthWitness.versionRoute)}</code>
              </div>
              <div class="health-witness-grid" aria-label="Health and version response examples">
                ${healthExamples.map(healthWitnessCard).join("")}
              </div>
            </section>
            <section class="runtime-contract" aria-label="Runtime conformance contract">
              <div class="runtime-contract-head">
                <span class="status-pill">${escapeHtml(statusLabel(runtimeConformance.status))}</span>
                <h3>${escapeHtml(runtimeConformance.title)}</h3>
                <p>${escapeHtml(runtimeConformance.summary)}</p>
                <code class="stamp-version">${escapeHtml(runtimeConformance.route)} / ${escapeHtml(runtimeConformance.versionedRoute)}</code>
              </div>
              <div class="finding-contract-grid" aria-label="Runtime conformance findings">
                ${findingContract.map(findingContractCard).join("")}
              </div>
              <div class="runtime-response-grid" aria-label="Runtime conformance response examples">
                ${responseExamples.map(runtimeResponseCard).join("")}
              </div>
            </section>
            <section class="runtime-contract" aria-label="Gateway protected path witness">
              <div class="runtime-contract-head">
                <span class="status-pill">${escapeHtml(statusLabel(gatewayWitness.status))}</span>
                <h3>${escapeHtml(gatewayWitness.label)}</h3>
                <p>${escapeHtml(gatewayWitness.summary)}</p>
                <code class="stamp-version">${escapeHtml(gatewayWitness.route)} / ${escapeHtml(gatewayWitness.versionedRoute)}</code>
              </div>
              <div class="protected-path-grid" aria-label="Protected API paths">
                ${protectedPaths.map(protectedPathCard).join("")}
              </div>
              <div class="gateway-response-grid" aria-label="Gateway witness response examples">
                ${gatewayExamples.map(gatewayResponseCard).join("")}
              </div>
            </section>
          `;
        } catch (error) {
          target.innerHTML = `
            <div class="proof-empty">
              Runtime witness state is unavailable. Confirm <code>data/site.json</code> is deployed with the proof page.
            </div>
          `;
        }
      };

      const renderProofStampArtifact = async () => {
        const target = document.querySelector("[data-proof-stamp-artifact]");
        if (!target) return;
        try {
          const response = await fetch("../data/site.json", { cache: "no-store" });
          if (!response.ok) throw new Error(`Proof stamp artifact load failed: ${response.status}`);
          const content = await response.json();
          const artifact = content.proofStampArtifact;
          const verifier = content.proofStampVerifier;
          const fields = Array.isArray(artifact?.fields) ? artifact.fields : [];
          const requirements = Array.isArray(artifact?.issueRequirements) ? artifact.issueRequirements : [];
          const lifecycle = Array.isArray(artifact?.lifecycle) ? artifact.lifecycle : [];
          const verifierChecks = Array.isArray(verifier?.checks) ? verifier.checks : [];
          const verifierOutcomes = Array.isArray(verifier?.outcomes) ? verifier.outcomes : [];
          const verifierDecisionLadder = Array.isArray(verifier?.decisionLadder) ? verifier.decisionLadder : [];
          const verifierStateModel = Array.isArray(verifier?.stateModel) ? verifier.stateModel : [];
          const verifierResponseExamples = Array.isArray(verifier?.responseExamples) ? verifier.responseExamples : [];
          const operatorBoundary = verifier?.operatorBoundary && typeof verifier.operatorBoundary === "object"
            ? verifier.operatorBoundary
            : null;
          const operatorRoutes = Array.isArray(operatorBoundary?.routes) ? operatorBoundary.routes : [];
          const verifierImplementation = verifier?.implementation && typeof verifier.implementation === "object"
            ? verifier.implementation
            : null;
          const implementationFiles = Array.isArray(verifierImplementation?.files) ? verifierImplementation.files : [];
          const implementationTests = Array.isArray(verifierImplementation?.tests) ? verifierImplementation.tests : [];
          const implementationGates = Array.isArray(verifierImplementation?.deploymentGates)
            ? verifierImplementation.deploymentGates
            : [];
          const implementationWitnesses = Array.isArray(verifierImplementation?.releaseWitnesses)
            ? verifierImplementation.releaseWitnesses
            : [];
          const verifierSample = verifier?.sampleResponse && typeof verifier.sampleResponse === "object"
            ? verifier.sampleResponse
            : null;
          if (
            !artifact
            || !fields.length
            || !requirements.length
            || !lifecycle.length
            || !verifier
            || !verifierChecks.length
            || !verifierOutcomes.length
            || !verifierDecisionLadder.length
            || !verifierStateModel.length
            || !verifierResponseExamples.length
            || !operatorBoundary
            || !operatorRoutes.length
            || !verifierSample
            || !verifierImplementation
            || !implementationFiles.length
            || !implementationTests.length
            || !implementationGates.length
            || !implementationWitnesses.length
          ) {
            throw new Error("Proof stamp and verifier contract is incomplete");
          }
          const verifierSampleText = JSON.stringify(verifierSample, null, 2);
          target.innerHTML = `
            <div class="stamp-head">
              <span class="status-pill">${escapeHtml(statusLabel(artifact.status))}</span>
              <h3>${escapeHtml(artifact.title)}</h3>
              <p>${escapeHtml(artifact.summary)}</p>
              <code class="stamp-version">${escapeHtml(artifact.version)}</code>
            </div>
            <div class="stamp-field-grid" aria-label="Proof stamp envelope fields">
              ${fields.map(stampFieldCard).join("")}
            </div>
            <div class="stamp-lists">
              <section class="stamp-list" aria-label="Proof stamp issuance requirements">
                <h3>Issuance requirements</h3>
                <ol>
                  ${requirements.map((requirement) => `<li>${escapeHtml(requirement)}</li>`).join("")}
                </ol>
              </section>
              <section class="stamp-list" aria-label="Proof stamp lifecycle">
                <h3>Lifecycle</h3>
                <dl>
                  ${lifecycle.map(stampLifecycleItem).join("")}
                </dl>
              </section>
            </div>
            <article class="verifier-card" aria-label="Proof stamp verifier contract">
              <div class="verifier-head">
                <span class="status-pill">${escapeHtml(statusLabel(verifier.status))}</span>
                <h3>${escapeHtml(verifier.title)}</h3>
                <p>${escapeHtml(verifier.summary)}</p>
              </div>
              <dl class="verifier-route">
                <div><dt>Route</dt><dd>${escapeHtml(verifier.route)}</dd></div>
                <div><dt>Host</dt><dd>${escapeHtml(verifier.host)}</dd></div>
                <div><dt>Input</dt><dd>${escapeHtml(verifier.input)}</dd></div>
                <div><dt>Output</dt><dd>${escapeHtml(verifier.output)}</dd></div>
              </dl>
              <div class="verifier-check-grid" aria-label="Verifier checks">
                ${verifierChecks.map(verifierCheckCard).join("")}
              </div>
              <dl class="verifier-outcomes" aria-label="Verifier outcomes">
                ${verifierOutcomes.map(verifierOutcomeItem).join("")}
              </dl>
              <div class="verifier-decision-grid" aria-label="Fail-closed verifier decision ladder">
                ${verifierDecisionLadder.map(verifierDecisionCard).join("")}
              </div>
              <div class="verifier-state-model" aria-label="Verifier internal-to-public state model">
                ${verifierStateModel.map(verifierStateModelRow).join("")}
              </div>
              <pre class="verifier-sample" aria-label="Static verifier response example"><code>${escapeHtml(verifierSampleText)}</code></pre>
              <div class="verifier-response-grid" aria-label="Verifier response examples">
                ${verifierResponseExamples.map(verifierResponseExampleCard).join("")}
              </div>
            </article>
            <section class="operator-boundary" aria-label="Private revocation operator boundary">
              <div class="verifier-head">
                <span class="status-pill">${escapeHtml(statusLabel(operatorBoundary.status))}</span>
                <h3>${escapeHtml(operatorBoundary.title)}</h3>
                <p>${escapeHtml(operatorBoundary.summary)}</p>
                <code class="stamp-version">${escapeHtml((operatorBoundary.requiredHeaders || []).join(" + "))}</code>
              </div>
              <div class="operator-route-grid">
                ${operatorRoutes.map(operatorRouteCard).join("")}
              </div>
            </section>
            <section class="verifier-implementation" aria-label="Verifier implementation boundary">
              <div class="verifier-head">
                <span class="status-pill">${escapeHtml(statusLabel(verifierImplementation.status))}</span>
                <h3>${escapeHtml(verifierImplementation.label)}</h3>
                <p>${escapeHtml(verifierImplementation.runtimeBoundary)}</p>
              </div>
              <div class="implementation-file-grid" aria-label="Verifier implementation files">
                ${implementationFiles.map(verifierImplementationFile).join("")}
              </div>
              <div class="release-witness-grid" aria-label="Release witness commands">
                ${implementationWitnesses.map(releaseWitnessCard).join("")}
              </div>
              <div class="implementation-lists">
                ${implementationList("Tests", implementationTests)}
                ${implementationList("Deployment gates", implementationGates)}
              </div>
            </section>
          `;
        } catch (error) {
          target.innerHTML = `
            <div class="proof-empty">
              Proof stamp artifact contract is unavailable. Confirm <code>data/site.json</code> is deployed with the proof page.
            </div>
          `;
        }
      };

      function init() {
        renderProductEvidenceLanes();
        renderClaimRegistry();
        renderRuntimeWitnessBoard();
        renderProofStampArtifact();
      }

      window.MullusiProofRenderer = Object.freeze({
        init,
        renderClaimRegistry,
        renderProductEvidenceLanes,
        renderProofStampArtifact,
        renderRuntimeWitnessBoard,
      });
    })();
