/*
Purpose: render Mullusi homepage product registry cards and controls from generated product projections.
Governance scope: product card rendering, product status filtering, route-action rendering, and public-safe product links.
Dependencies: assets/app.js context helpers, generated homepage product registry records, and browser DOM APIs.
Invariants: product text is escaped, product links are bounded to public-safe routes, filter state is explicit, and no registry data is fetched here.
*/

(() => {
  const productRegistryPreviewLimit = 6;

  function productStatusSet(products) {
    const preferredOrder = ["All", "awaiting-evidence", "private-incubation", "planned", "restricted"];
    const knownStatuses = new Set(products.map((item) => item.status).filter(Boolean));
    const ordered = preferredOrder.filter((status) => status === "All" || knownStatuses.has(status));
    const extra = Array.from(knownStatuses).filter((status) => !preferredOrder.includes(status)).sort();
    return [...ordered, ...extra];
  }

  function productStatusCounts(products) {
    const counts = new Map([["All", products.length]]);
    products.forEach((product) => {
      const status = product.status || "unknown";
      counts.set(status, (counts.get(status) || 0) + 1);
    });
    return counts;
  }

  function filteredProductRegistry(state) {
    const products = state.registry?.productRegistry || [];
    if (state.activeProductStatus === "All") return products;
    return products.filter((product) => product.status === state.activeProductStatus);
  }

  function productDocsHref(product) {
    const docsPath = String(product?.docsPath || "");
    if (!/^docs\.mullusi\.com(?:\/[a-z0-9-]+)?$/.test(docsPath)) return "";
    return `https://${docsPath}`;
  }

  function productEvidenceHref(product) {
    const text = String(product?.evidencePath ?? "").trim();
    if (/^#[A-Za-z][A-Za-z0-9_-]*$/.test(text)) return text;
    if (/^\/[A-Za-z0-9/_-]*\/?$/.test(text)) return text;
    if (/^https:\/\/(?:[a-z0-9.-]+\.)?mullusi\.com(?:\/.*)?$/i.test(text)) return text;
    return "";
  }

  function safeDomToken(value) {
    return String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown";
  }

  function renderProductRouteActions(product, context) {
    const { escapeAttribute, escapeHtml, i18nText } = context;
    const docsHref = productDocsHref(product);
    const evidenceHref = productEvidenceHref(product);
    const apiPath = String(product?.apiPath || "");
    const apiIsPublic = /^POST \/v1\//.test(apiPath) || /^GET \/v1\//.test(apiPath) || apiPath === "GET /health";
    const apiLabel = apiPath === "no public endpoint"
      ? (i18nText("product.noPublicApi") || "No public API")
      : apiPath;

    return `
      <div class="product-route-actions" aria-label="${escapeAttribute(i18nText("product.routesAria") || "Product evidence routes")}">
        ${docsHref
          ? `<a href="${escapeAttribute(docsHref)}">${escapeHtml(i18nText("product.openDocs") || "Docs")}</a>`
          : `<span>${escapeHtml(i18nText("product.privateDocs") || "Private docs")}</span>`}
        ${evidenceHref
          ? `<a href="${escapeAttribute(evidenceHref)}">${escapeHtml(i18nText("product.openProof") || "Proof boundary")}</a>`
          : `<span>${escapeHtml(i18nText("product.noProofRoute") || "No public proof route")}</span>`}
        <code class="${apiIsPublic ? "is-public-api" : "is-private-api"}">${escapeHtml(apiLabel)}</code>
      </div>
    `;
  }

  function renderProductRegistry(context) {
    const { escapeHtml, i18nText, qs, revealRendered, state } = context;
    const target = qs("[data-product-registry]");
    const products = filteredProductRegistry(state);
    if (!target) return;

    if (!products.length) {
      target.innerHTML = `
        <article class="product-card empty-card">
          <div class="product-card-head">
            <h3>${escapeHtml(i18nText("product.emptyTitle") || "No matching product records")}</h3>
          </div>
          <p>${escapeHtml(i18nText("product.emptyBody") || "Choose another product status to inspect the governed registry.")}</p>
        </article>
      `;
      revealRendered(target);
      return;
    }

    const shouldLimit = !state.productRegistryExpanded && products.length > productRegistryPreviewLimit;
    const visibleProducts = shouldLimit ? products.slice(0, productRegistryPreviewLimit) : products;
    const hiddenCount = products.length - visibleProducts.length;
    const registryControl = products.length > productRegistryPreviewLimit
      ? `
        <article class="product-registry-more">
          <p>${escapeHtml(state.productRegistryExpanded
            ? (i18nText("product.fullRegistry") || "Showing every matching product record. Collapse the registry to return to a scan-first homepage.")
            : `${hiddenCount} ${i18nText("product.hiddenCount") || "additional records are available after this preview."}`)}</p>
          <button class="btn" type="button" data-product-registry-expand aria-expanded="${state.productRegistryExpanded ? "true" : "false"}">
            ${escapeHtml(state.productRegistryExpanded
              ? (i18nText("product.showFewer") || "Show fewer records")
              : `${i18nText("product.showAll") || "Show all"} ${products.length} ${i18nText("product.records") || "records"}`)}
          </button>
        </article>
      `
      : "";

    target.innerHTML = `${visibleProducts.map((product) => `
      <article class="product-card" data-product-key="${safeDomToken(product.id || product.name)}">
        <div class="product-card-head">
          <span class="badge">${escapeHtml(product.classification)}</span>
          <span class="status-pill">${escapeHtml(product.status)}</span>
        </div>
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.summary)}</p>
        <dl class="product-meta">
          <div>
            <dt>${escapeHtml(i18nText("field.owner") || "Owner")}</dt>
            <dd>${escapeHtml(product.owner)}</dd>
          </div>
          <div>
            <dt>${escapeHtml(i18nText("field.sourceBoundary") || "Source boundary")}</dt>
            <dd>${escapeHtml(product.sourceBoundary)}</dd>
          </div>
          <div>
            <dt>${escapeHtml(i18nText("field.runtimeType") || "Runtime")}</dt>
            <dd>${escapeHtml(product.runtimeType)}</dd>
          </div>
          <div>
            <dt>${escapeHtml(i18nText("field.dataType") || "Data")}</dt>
            <dd>${escapeHtml(product.dataType)}</dd>
          </div>
          <div>
            <dt>${escapeHtml(i18nText("field.releaseGate") || "Release gate")}</dt>
            <dd>${escapeHtml(product.releaseGate)}</dd>
          </div>
          <div>
            <dt>${escapeHtml(i18nText("field.docsPath") || "Docs")}</dt>
            <dd>${escapeHtml(product.docsPath)}</dd>
          </div>
          <div>
            <dt>${escapeHtml(i18nText("field.apiPath") || "API")}</dt>
            <dd>${escapeHtml(product.apiPath)}</dd>
          </div>
          <div>
            <dt>${escapeHtml(i18nText("field.failureMode") || "Failure")}</dt>
            <dd>${escapeHtml(product.failureMode)}</dd>
          </div>
        </dl>
        ${renderProductRouteActions(product, context)}
      </article>
    `).join("")}${registryControl}`;

    const expandButton = qs("[data-product-registry-expand]", target);
    if (expandButton) {
      expandButton.addEventListener("click", () => {
        state.productRegistryExpanded = !state.productRegistryExpanded;
        renderProductRegistryControls(context);
        renderProductRegistry(context);
      });
    }
    revealRendered(target);
  }

  function renderProductRegistryControls(context) {
    const { escapeAttribute, escapeHtml, i18nText, qsa, qs, revealRendered, state } = context;
    const target = qs("[data-product-registry-controls]");
    const products = state.registry?.productRegistry || [];
    if (!target || !products.length) return;

    const statuses = productStatusSet(products);
    const counts = productStatusCounts(products);
    const visibleCount = filteredProductRegistry(state).length;
    const classifications = new Set(products.map((product) => product.classification)).size;

    target.innerHTML = `
      <div class="product-summary-strip" aria-label="${escapeAttribute(i18nText("product.summaryAria") || "Product registry summary")}">
        <span><strong>${escapeHtml(String(products.length))}</strong>${escapeHtml(i18nText("product.total") || "total records")}</span>
        <span><strong>${escapeHtml(String(visibleCount))}</strong>${escapeHtml(i18nText("product.showing") || "showing")}</span>
        <span><strong>${escapeHtml(String(classifications))}</strong>${escapeHtml(i18nText("product.classes") || "product classes")}</span>
      </div>
      <div class="product-filter-row" role="group" aria-label="${escapeAttribute(i18nText("product.filterAria") || "Product status filters")}">
        ${statuses.map((status) => `
          <button class="filter-button product-filter-button ${status === state.activeProductStatus ? "active" : ""}" type="button" data-product-status="${escapeHtml(status)}" aria-pressed="${status === state.activeProductStatus ? "true" : "false"}">
            <span>${escapeHtml(status)}</span>
            <strong>${escapeHtml(String(counts.get(status) || 0))}</strong>
          </button>
        `).join("")}
      </div>
    `;

    qsa("[data-product-status]", target).forEach((button) => {
      button.addEventListener("click", () => {
        state.activeProductStatus = button.dataset.productStatus || "All";
        state.productRegistryExpanded = false;
        renderProductRegistryControls(context);
        renderProductRegistry(context);
      });
    });
    revealRendered(target);
  }

  window.MullusiProductRegistryRenderer = Object.freeze({
    filteredProductRegistry,
    productStatusCounts,
    productStatusSet,
    renderProductRegistry,
    renderProductRegistryControls,
    renderProductRouteActions,
  });
})();
