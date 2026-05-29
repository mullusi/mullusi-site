/*
Purpose: render Mullusi structured site-content sections from governed site JSON.
Governance scope: platform layer rendering, service cards, interface links, proof lanes, release diagrams, and evaluation example output.
Dependencies: assets/app.js context helpers, data/site.json records, and browser DOM APIs.
Invariants: site-content text is escaped, public links are bounded, SVG IDs are locally sanitized, and no site-content data is fetched here.
*/

(() => {
  function plainAttribute(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function domIdToken(value) {
    return String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item";
  }

  function proofSymbol(label, index) {
    const symbols = {
      Identity: "Ι",
      Governance: "Λ",
      Structure: "Σ",
      Evolution: "H",
    };
    return symbols[label] || ["Ι", "Λ", "Σ", "H"][index % 4];
  }

  function interfaceHref(item) {
    const href = String(item?.href || "").trim();
    if (href === "https://docs.mullusi.com" || href === "https://mullusi.com") return href;
    if (/^\/[A-Za-z0-9/_-]*\/?$/.test(href)) return href;
    return "";
  }

  function renderProofLanes(context) {
    const { escapeHtml, localized, qs, revealRendered, state } = context;
    const target = qs("[data-proof-lanes]");
    const lanes = state.siteContent?.proofLanes || [];
    if (!target || !lanes.length) return;

    target.innerHTML = lanes.map((lane, index) => `
      <article class="card">
        <span class="kind">${escapeHtml(localized(lane, "label"))}</span>
        <div class="ix">${escapeHtml(proofSymbol(lane.label, index))}</div>
        <h3>${escapeHtml(localized(lane, "title"))}</h3>
        <p>${escapeHtml(localized(lane, "summary"))}</p>
      </article>
    `).join("");
    revealRendered(target);
  }

  function renderInterfaceLinks(context) {
    const { escapeAttribute, escapeHtml, i18nText, localized, qs, revealRendered, state } = context;
    const target = qs("[data-interface-links]");
    const interfaces = state.siteContent?.interfaces || [];
    if (!target || !interfaces.length) return;

    target.innerHTML = interfaces.map((item) => `
      <article class="route">
        <span class="badge">${escapeHtml(localized(item, "status"))}</span>
        <h3>${escapeHtml(localized(item, "name"))}</h3>
        <p>${escapeHtml(localized(item, "summary"))}</p>
        ${interfaceHref(item)
          ? `<a class="lnk" href="${escapeAttribute(interfaceHref(item))}" rel="noopener">${escapeHtml(i18nText("interfaces.openLink") || "Open")} ${escapeHtml(localized(item, "name"))} -&gt;</a>`
          : `<span class="reserved-route">${escapeHtml(localized(item, "reservedReason") || "Reserved - AwaitingEvidence")}</span>`}
      </article>
    `).join("");
    revealRendered(target);
  }

  function renderServices(context) {
    const { escapeHtml, i18nText, localized, qs, revealRendered, state } = context;
    const target = qs("[data-service-grid]");
    const services = state.siteContent?.services || [];
    if (!target || !services.length) return;

    target.innerHTML = services.map((service) => `
      <article class="service">
        <span class="badge">${escapeHtml(localized(service, "status"))}</span>
        <h3>${escapeHtml(localized(service, "name"))}</h3>
        <p>${escapeHtml(localized(service, "summary"))}</p>
        <dl>
          <div>
            <dt>${escapeHtml(i18nText("field.delivery") || "Delivery")}</dt>
            <dd>${escapeHtml(localized(service, "delivery"))}</dd>
          </div>
          <div>
            <dt>${escapeHtml(i18nText("field.proofSurface") || "Proof surface")}</dt>
            <dd>${escapeHtml(service.proofSurface)}</dd>
          </div>
        </dl>
      </article>
    `).join("");
    revealRendered(target);
  }

  function renderServiceTiers(context) {
    const { escapeHtml, i18nText, localized, qs, revealRendered, state } = context;
    const target = qs("[data-service-tiers]");
    const tiers = state.siteContent?.serviceTiers || [];
    if (!target || !tiers.length) return;

    target.innerHTML = tiers.map((tier) => `
      <article class="service">
        <span class="badge">${escapeHtml(localized(tier, "status"))}</span>
        <h3>${escapeHtml(localized(tier, "name"))}</h3>
        <p>${escapeHtml(localized(tier, "summary"))}</p>
        <dl>
          <div>
            <dt>${escapeHtml(i18nText("field.audience") || "Audience")}</dt>
            <dd>${escapeHtml(localized(tier, "audience"))}</dd>
          </div>
          <div>
            <dt>${escapeHtml(i18nText("field.commercialSignal") || "Commercial signal")}</dt>
            <dd>${escapeHtml(localized(tier, "priceSignal"))}</dd>
          </div>
        </dl>
      </article>
    `).join("");
    revealRendered(target);
  }

  function renderApiContracts(context) {
    const { escapeHtml, i18nText, localized, qs, revealRendered, state } = context;
    const target = qs("[data-api-contracts]");
    const contracts = state.siteContent?.apiContracts || [];
    if (!target || !contracts.length) return;

    target.innerHTML = contracts.map((contract) => `
      <article class="service contract">
        <span class="badge">${escapeHtml(localized(contract, "status"))}</span>
        <h3>${escapeHtml(localized(contract, "name"))}</h3>
        <code>${escapeHtml(contract.route)}</code>
        <p>${escapeHtml(localized(contract, "summary"))}</p>
        <dl>
          <div>
            <dt>${escapeHtml(i18nText("field.input") || "Input")}</dt>
            <dd>${escapeHtml(localized(contract, "input"))}</dd>
          </div>
          <div>
            <dt>${escapeHtml(i18nText("field.output") || "Output")}</dt>
            <dd>${escapeHtml(localized(contract, "output"))}</dd>
          </div>
          <div>
            <dt>${escapeHtml(i18nText("field.host") || "Host")}</dt>
            <dd>${escapeHtml(contract.host)}</dd>
          </div>
        </dl>
      </article>
    `).join("");
    revealRendered(target);
  }

  const statusMeta = {
    live: { key: "status.live", fallback: "Live", cls: "is-live" },
    "awaiting-evidence": { key: "status.awaitingEvidence", fallback: "Awaiting Evidence", cls: "is-awaiting" },
    planned: { key: "status.planned", fallback: "Planned", cls: "is-planned" },
  };

  function renderStatusBoard(context) {
    const { activityHref, escapeAttribute, escapeHtml, i18nText, localized, qs, revealRendered, state } = context;
    const target = qs("[data-system-status]");
    const board = state.siteContent?.statusBoard;
    const rows = Array.isArray(board?.rows) ? board.rows : [];
    const witnessChecks = Array.isArray(board?.witnessChecks) ? board.witnessChecks : [];
    const closureGates = Array.isArray(board?.closureGates) ? board.closureGates : [];
    if (!target || !board || rows.length === 0) return;

    const amRows = board.am && Array.isArray(board.am.rows) ? board.am.rows : [];
    const fallbackHref = /^(https:\/\/|mailto:)/.test(board.followHref || "") ? board.followHref : "";
    const followHref = activityHref(board.followHref) || fallbackHref;

    target.innerHTML = `
      <div class="status-head">
        <span class="handoff-kicker">${escapeHtml(localized(board, "label"))}</span>
        <h3>${escapeHtml(localized(board, "title"))}</h3>
      </div>
      <ul class="status-list">
        ${rows.map((row, index) => {
          const meta = statusMeta[row.state] || statusMeta.planned;
          const amRow = amRows[index] || {};
          const component = state.lang === "am" && amRow.component ? amRow.component : row.component;
          const note = state.lang === "am" && amRow.note ? amRow.note : row.note;
          return `
            <li class="status-row ${meta.cls}">
              <span class="status-dot" aria-hidden="true"></span>
              <span class="status-name">${escapeHtml(component)}</span>
              <span class="status-state">${escapeHtml(i18nText(meta.key) || meta.fallback)}</span>
              <span class="status-note">${escapeHtml(note)}</span>
            </li>
          `;
        }).join("")}
      </ul>
      ${witnessChecks.length ? `
        <div class="status-checks" aria-label="Runtime witness checks">
          ${witnessChecks.map((check) => {
            const meta = statusMeta[check.state] || statusMeta.planned;
            return `
              <div class="status-check ${meta.cls}">
                <code>${escapeHtml(check.path)}</code>
                <span>${escapeHtml(i18nText(meta.key) || meta.fallback)}</span>
                <p>${escapeHtml(check.purpose)}</p>
              </div>
            `;
          }).join("")}
        </div>
      ` : ""}
      ${closureGates.length ? `
        <div class="status-closure-gates" aria-label="Runtime closure gates">
          ${closureGates.map((gate) => {
            const meta = statusMeta[gate.state] || statusMeta.planned;
            return `
              <article class="status-closure ${meta.cls}">
                <div>
                  <span>${escapeHtml(i18nText(meta.key) || meta.fallback)}</span>
                  <h4>${escapeHtml(gate.gate)}</h4>
                </div>
                <code>${escapeHtml(gate.dependsOn)}</code>
                <p>${escapeHtml(gate.evidence)}</p>
                <dl>
                  <div><dt>Protects</dt><dd>${escapeHtml(gate.protects)}</dd></div>
                  <div><dt>Fallback</dt><dd>${escapeHtml(gate.failureAction)}</dd></div>
                </dl>
              </article>
            `;
          }).join("")}
        </div>
      ` : ""}
      <p class="status-follow">
        ${escapeHtml(localized(board, "follow"))}
        ${followHref ? `<a href="${escapeAttribute(followHref)}" rel="noopener">${escapeHtml(localized(board, "followLabel"))} -&gt;</a>` : ""}
      </p>
    `;
    revealRendered(target);
  }

  function renderUseCases(context) {
    const { escapeHtml, qs, revealRendered, state } = context;
    const target = qs("[data-use-cases]");
    const useCases = state.siteContent?.useCases;
    const items = Array.isArray(useCases?.items) ? useCases.items : [];
    if (!target || items.length === 0) return;

    const amItems = useCases.am && Array.isArray(useCases.am.items) ? useCases.am.items : [];
    target.innerHTML = items.map((item, index) => {
      const amItem = amItems[index] || {};
      const title = state.lang === "am" && amItem.title ? amItem.title : item.title;
      const body = state.lang === "am" && amItem.body ? amItem.body : item.body;
      return `
        <article class="usecase">
          <span class="usecase-n">${String(index + 1).padStart(2, "0")}</span>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(body)}</p>
        </article>
      `;
    }).join("");
    revealRendered(target);
  }

  function renderPlatformLayers(context) {
    const { escapeHtml, i18nText, localized, qs, revealRendered, state } = context;
    const target = qs("[data-platform-layers]");
    const layers = state.siteContent?.platformLayers || [];
    if (!target || !layers.length) return;

    target.innerHTML = layers.map((layer, index) => {
      const components = Array.isArray(layer.components) ? layer.components : [];
      const governingQuestion = localized(layer, "governs");
      return `
        <article class="platform-layer">
          <div class="platform-layer-head">
            <div>
              <span class="badge">${escapeHtml(localized(layer, "role"))}</span>
              <h3>${escapeHtml(localized(layer, "name"))}</h3>
            </div>
            <span class="platform-layer-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
          </div>
          <p>${escapeHtml(localized(layer, "boundary"))}</p>
          ${governingQuestion ? `
            <div class="platform-layer-rule">
              <span>${escapeHtml(i18nText("platform.governs") || "Governs")}</span>
              <strong>${escapeHtml(governingQuestion)}</strong>
            </div>
          ` : ""}
          <div class="component-row">
            ${components.map((component) => `<span>${escapeHtml(component)}</span>`).join("")}
          </div>
        </article>
      `;
    }).join("");
    revealRendered(target);
  }

  function renderRequestFlow(context) {
    const { escapeHtml, i18nText, localized, qs, revealRendered, state } = context;
    const target = qs("[data-request-flow]");
    const flow = state.siteContent?.requestFlow;
    const steps = Array.isArray(flow?.steps) ? flow.steps : [];
    const guards = Array.isArray(flow?.guards) ? flow.guards : [];
    if (!target || !flow || steps.length === 0) return;

    target.innerHTML = `
      <article class="request-flow-card">
        <div>
          <span class="handoff-kicker">${escapeHtml(localized(flow, "label"))}</span>
          <h3>${escapeHtml(localized(flow, "title"))}</h3>
          <p>${escapeHtml(localized(flow, "summary"))}</p>
          ${guards.length ? `
            <div class="request-flow-guards" aria-label="Control plane guards">
              <span>${escapeHtml(i18nText("platform.guards") || "Control guards")}</span>
              ${guards.map((guard) => `<strong>${escapeHtml(guard)}</strong>`).join("")}
            </div>
          ` : ""}
        </div>
        <ol class="request-flow-steps">
          ${steps.map((step, index) => `
            <li>
              <span>${String(index + 1).padStart(2, "0")}</span>
              <strong>${escapeHtml(step)}</strong>
            </li>
          `).join("")}
        </ol>
      </article>
    `;
    revealRendered(target);
  }

  function renderPlatformBuildSequence(context) {
    const { escapeHtml, localized, qs, revealRendered, state } = context;
    const target = qs("[data-platform-build-sequence]");
    const sequence = state.siteContent?.platformBuildSequence;
    const steps = Array.isArray(sequence?.steps) ? sequence.steps : [];
    if (!target || !sequence || steps.length === 0) return;

    target.innerHTML = `
      <article class="platform-build-card" aria-label="${plainAttribute(localized(sequence, "label"))}">
        <div class="platform-build-copy">
          <span class="handoff-kicker">${escapeHtml(localized(sequence, "label"))}</span>
          <h3>${escapeHtml(localized(sequence, "title"))}</h3>
          <p>${escapeHtml(localized(sequence, "summary"))}</p>
        </div>
        <ol class="platform-build-steps">
          ${steps.map((step) => `
            <li>
              <span class="platform-build-phase">${escapeHtml(step.phase)}</span>
              <div>
                <strong>${escapeHtml(localized(step, "name"))}</strong>
                <em>${escapeHtml(localized(step, "status"))}</em>
                <p>${escapeHtml(localized(step, "reason"))}</p>
              </div>
            </li>
          `).join("")}
        </ol>
      </article>
    `;
    revealRendered(target);
  }

  function renderProductQuestions(context) {
    const { escapeHtml, qs, revealRendered, state } = context;
    const target = qs("[data-product-questions]");
    const questions = state.siteContent?.productQuestions || [];
    if (!target || !questions.length) return;

    target.innerHTML = questions.map((question, index) => `
      <li>
        <span>${String(index + 1).padStart(2, "0")}</span>
        <strong>${escapeHtml(question)}</strong>
      </li>
    `).join("");
    revealRendered(target);
  }

  function renderReleaseStages(context) {
    const { escapeHtml, localized, qs, revealRendered, state } = context;
    const target = qs("[data-release-stages]");
    const stages = state.siteContent?.releaseStages || [];
    if (!target || !stages.length) return;

    target.innerHTML = stages.map((stage) => `
      <article class="rd">
        <div class="n">${escapeHtml(stage.step)}</div>
        <h3>${escapeHtml(localized(stage, "title"))}</h3>
        <p>${escapeHtml(localized(stage, "summary"))}</p>
      </article>
    `).join("");
    revealRendered(target);
  }

  function renderRepositoryHandoff(context) {
    const { escapeHtml, localized, qs, revealRendered, state } = context;
    const target = qs("[data-repository-handoff]");
    const handoff = state.siteContent?.repositoryHandoff;
    const steps = Array.isArray(handoff?.steps) ? handoff.steps : [];
    if (!target || !handoff || steps.length === 0) return;

    const localSteps = state.lang === "am" && Array.isArray(handoff.amSteps) && handoff.amSteps.length === steps.length
      ? handoff.amSteps
      : steps;
    target.innerHTML = `
      <div>
        <span class="handoff-kicker">${escapeHtml(localized(handoff, "label"))}</span>
        <p><strong>${escapeHtml(localized(handoff, "title"))}</strong> ${escapeHtml(localized(handoff, "summary"))}</p>
      </div>
      <div class="handoff-chain" aria-hidden="true">
        ${localSteps.map((step) => `<span>${escapeHtml(step)}</span>`).join("")}
      </div>
    `;
    revealRendered(target);
  }

  function diagramArrowDefs(markerId) {
    return `
      <defs>
        <marker id="${plainAttribute(domIdToken(markerId))}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" class="dg-arrow" />
        </marker>
      </defs>
    `;
  }

  function diagramNode(x, y, w, h, label, variant, context) {
    const { escapeHtml } = context;
    const cls = variant ? `dg-node ${variant}` : "dg-node";
    return `
      <g class="${cls}">
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" />
        <text x="${x + w / 2}" y="${y + h / 2}" class="dg-label" text-anchor="middle" dominant-baseline="middle">${escapeHtml(label)}</text>
      </g>
    `;
  }

  function svgFrame(viewBox, ariaLabel, inner, markerId) {
    const safeMarkerId = domIdToken(markerId || `dg-arrow-${domIdToken(ariaLabel)}`);
    const scopedInner = inner.replaceAll("url(#dg-arrow)", `url(#${safeMarkerId})`);
    return `<svg class="diagram-svg" viewBox="${plainAttribute(viewBox)}" role="img" aria-label="${plainAttribute(ariaLabel)}" preserveAspectRatio="xMidYMid meet">${diagramArrowDefs(safeMarkerId)}${scopedInner}</svg>`;
  }

  function renderFlowDiagram(context) {
    const { escapeHtml, i18nText, qs, revealRendered } = context;
    const target = qs("[data-flow-diagram]");
    if (!target) return;
    const steps = [
      i18nText("flow.request") || "Request",
      i18nText("flow.evaluate") || "Evaluate rules",
      i18nText("flow.trace") || "Record trace",
      i18nText("flow.verdict") || "Verdict",
      i18nText("flow.proof") || "Proof stamp",
    ];
    const w = 188;
    const h = 66;
    const gap = 26;
    const y = 30;
    let inner = "";
    steps.forEach((label, index) => {
      const x = index * (w + gap);
      const variant = index === steps.length - 1 ? "is-terminal" : "";
      inner += diagramNode(x, y, w, h, label, variant, context);
      if (index < steps.length - 1) {
        const x1 = x + w + 4;
        const x2 = x + w + gap - 4;
        inner += `<line class="dg-conn" x1="${x1}" y1="${y + h / 2}" x2="${x2}" y2="${y + h / 2}" marker-end="url(#dg-arrow)" />`;
      }
    });
    const total = steps.length * w + (steps.length - 1) * gap;
    target.innerHTML = `
      ${svgFrame(`0 0 ${total} 126`, i18nText("flow.caption") || "Governed evaluation flow", inner, "dg-arrow-flow")}
      <p class="diagram-caption">${escapeHtml(i18nText("flow.caption") || "Every request is checked, traced, and judged before a result returns.")}</p>
    `;
    revealRendered(target);
  }

  function renderBoundaryMap(context) {
    const { escapeHtml, i18nText, qs, revealRendered } = context;
    const target = qs("[data-boundary-map]");
    if (!target) return;
    const routes = ["Mullu", "Proof", "Doctrine", "Playground"];
    const w = 196;
    const h = 60;
    const gap = 30;
    const rowW = routes.length * w + (routes.length - 1) * gap;
    const cx = rowW / 2;
    let inner = "";
    inner += diagramNode(cx - 110, 8, 220, 60, "Mullusi", "is-root", context);
    routes.forEach((label, index) => {
      const x = index * (w + gap);
      inner += `<path class="dg-conn" d="M ${cx} 68 C ${cx} 110, ${x + w / 2} 100, ${x + w / 2} 140" fill="none" marker-end="url(#dg-arrow)" />`;
      inner += diagramNode(x, 142, w, h, label, "is-public", context);
    });
    inner += `<line class="dg-conn is-dashed" x1="${cx}" y1="68" x2="${cx}" y2="232" marker-end="url(#dg-arrow)" />`;
    inner += diagramNode(cx - 130, 234, 260, 56, i18nText("map.stagedPrivate") || "Staged - private", "is-staged", context);
    target.innerHTML = `
      <div class="diagram-legend">
        <span class="lg lg-public">${escapeHtml(i18nText("map.publicRoutes") || "Public routes")}</span>
        <span class="lg lg-staged">${escapeHtml(i18nText("map.stagedPrivate") || "Staged - private")}</span>
      </div>
      ${svgFrame(`0 0 ${rowW} 300`, i18nText("map.caption") || "Mullusi route boundary map", inner, "dg-arrow-boundary")}
      <p class="diagram-caption">${escapeHtml(i18nText("map.caption") || "One umbrella. Public routes are linked; product engines stay private until their gate is met.")}</p>
    `;
    revealRendered(target);
  }

  function renderReleaseMachine(context) {
    const { escapeHtml, i18nText, qs, revealRendered, state } = context;
    const target = qs("[data-release-machine]");
    const handoff = state.siteContent?.repositoryHandoff;
    const baseSteps = Array.isArray(handoff?.steps) ? handoff.steps : [];
    if (!target || baseSteps.length === 0) return;
    const amSteps = handoff.am && Array.isArray(handoff.amSteps) ? handoff.amSteps : null;
    const steps = state.lang === "am" && amSteps && amSteps.length === baseSteps.length ? amSteps : baseSteps;

    const w = 172;
    const h = 60;
    const gap = 30;
    const y = 26;
    let inner = "";
    steps.forEach((label, index) => {
      const x = index * (w + gap);
      inner += diagramNode(x, y, w, h, label, "is-state", context);
      if (index < steps.length - 1) {
        inner += `<line class="dg-conn" x1="${x + w + 4}" y1="${y + h / 2}" x2="${x + w + gap - 4}" y2="${y + h / 2}" marker-end="url(#dg-arrow)" />`;
      }
    });
    const lastX = (steps.length - 1) * (w + gap);
    inner += `<line class="dg-conn is-dashed" x1="${lastX + w + 4}" y1="${y + h / 2}" x2="${lastX + w + gap - 4}" y2="${y + h / 2}" marker-end="url(#dg-arrow)" />`;
    inner += diagramNode(lastX + w + gap, y, 200, h, "AwaitingEvidence", "is-terminal", context);
    const total = steps.length * (w + gap) + 200;
    target.innerHTML = `
      ${svgFrame(`0 0 ${total} 112`, "Release state machine", inner, "dg-arrow-release")}
      <p class="diagram-caption">${escapeHtml(i18nText("release.caption") || "A private incubation project becomes a public route only after each gate closes.")}</p>
    `;
    revealRendered(target);
  }

  function renderEvaluationExample(context) {
    const { escapeHtml, i18nText, localized, qs, revealRendered, state } = context;
    const target = qs("[data-evaluation-example]");
    const example = state.siteContent?.evaluationExample;
    if (!target || !example) return;

    const baseSteps = Array.isArray(example.steps) ? example.steps : [];
    const amSteps = example.am && Array.isArray(example.am.steps) ? example.am.steps : null;
    const steps = state.lang === "am" && amSteps && amSteps.length === baseSteps.length ? amSteps : baseSteps;

    target.innerHTML = `
      <article class="eval-card">
        <div class="eval-head">
          <span class="badge">${escapeHtml(localized(example, "label"))}</span>
          <span class="status-pill eval-verdict">${escapeHtml(example.verdict)}</span>
        </div>
        <h3>${escapeHtml(localized(example, "title"))}</h3>
        <p class="eval-disclaimer">${escapeHtml(localized(example, "disclaimer"))}</p>
        <div class="eval-req">
          <span class="eval-k">${escapeHtml(i18nText("field.request") || "Request")}</span>
          <code>${escapeHtml(example.route)}</code>
          <code>${escapeHtml(example.request)}</code>
        </div>
        <p class="eval-summary">${escapeHtml(localized(example, "summary"))}</p>
        <dl class="eval-steps">
          ${steps.map((step) => `
            <div>
              <dt>${escapeHtml(step.k)}</dt>
              <dd>${escapeHtml(step.v)}</dd>
            </div>
          `).join("")}
        </dl>
      </article>
    `;
    revealRendered(target);
  }

  window.MullusiSiteContentRenderer = Object.freeze({
    renderApiContracts,
    renderBoundaryMap,
    renderEvaluationExample,
    renderFlowDiagram,
    renderInterfaceLinks,
    renderPlatformBuildSequence,
    renderPlatformLayers,
    renderProductQuestions,
    renderProofLanes,
    renderReleaseMachine,
    renderReleaseStages,
    renderRepositoryHandoff,
    renderRequestFlow,
    renderServiceTiers,
    renderServices,
    renderStatusBoard,
    renderUseCases,
  });
})();
