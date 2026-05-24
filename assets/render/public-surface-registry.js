/*
Purpose: render Mullusi public-surface registry views from governed registry and site-content state.
Governance scope: public surface filters, public surface cards, staged domain cards, metrics, and snapshot counters.
Dependencies: assets/app.js context helpers, data/manual/public-surfaces.json records, generated homepage product registry records, and browser DOM APIs.
Invariants: registry text is escaped, external links are bounded by upstream registry validation, filtering is explicit, and no registry data is fetched here.
*/

(() => {
  function normalize(value) {
    return String(value || "").toLowerCase().trim();
  }

  function categorySet(products) {
    return ["All", ...Array.from(new Set(products.map((item) => item.category))).sort()];
  }

  function matchesQuery(item, query) {
    if (!query) return true;
    const haystack = [
      item.name,
      item.href,
      item.sourceState,
      item.category,
      item.status,
      item.summary,
      ...(item.tags || []),
    ].map(normalize).join(" ");
    return haystack.includes(query);
  }

  function filteredProducts(state) {
    const products = state.registry?.systems || [];
    const query = normalize(state.query);
    return products.filter((item) => {
      const categoryOk = state.activeCategory === "All" || item.category === state.activeCategory;
      return categoryOk && matchesQuery(item, query);
    });
  }

  function titleForDomain(domain) {
    return String(domain.name || "")
      .replace(/^Mullusi\s+/i, "")
      .replace(/\s+Engine$/i, "")
      .replace(/\s+Lab$/i, "");
  }

  function metricCell(value, labelKey, fallbackLabel, context) {
    const { escapeHtml, i18nText } = context;
    if (value === null || value === undefined || value === "") return "";
    return `
      <div>
        <dt class="m-k">${escapeHtml(value)}</dt>
        <dd class="m-l">${escapeHtml(i18nText(labelKey) || fallbackLabel)}</dd>
      </div>
    `;
  }

  function renderSnapshot(context) {
    const { qs, state } = context;
    if (!state.registry) return;
    const products = state.registry.systems || [];
    const futureDomains = state.registry.futureDomains || [];
    const productTarget = qs("[data-public-product-count]");
    const domainTarget = qs("[data-domain-count]");

    if (productTarget) productTarget.textContent = String(products.length);
    if (domainTarget) domainTarget.textContent = String(futureDomains.length);
  }

  function renderMetrics(context) {
    const { qs, revealRendered, state } = context;
    const target = qs("[data-metrics]");
    if (!target) return;
    if (!state.registry || !state.siteContent) return;

    const systems = state.registry.systems || [];
    const futureDomains = state.registry.futureDomains || [];
    const productRegistry = state.registry.productRegistry || [];
    const interfaces = state.siteContent.interfaces || [];
    const apiContracts = state.siteContent.apiContracts || [];
    const releaseStages = state.siteContent.releaseStages || [];
    const signalUpdated = state.news?.meta?.updated || null;

    const cells = [
      metricCell(systems.length, "metrics.deployed", "Deployed public surfaces", context),
      metricCell(productRegistry.length, "metrics.products", "Governed product records", context),
      metricCell(interfaces.length, "metrics.routes", "Governed public routes", context),
      metricCell(apiContracts.length, "metrics.contracts", "Draft v1 Govern API contracts", context),
      metricCell(releaseStages.length, "metrics.gates", "Release-gate stages", context),
      metricCell(futureDomains.length, "metrics.staged", "Staged domain engines", context),
      metricCell(signalUpdated, "metrics.signal", "Signal last refreshed", context),
    ].filter(Boolean).join("");

    if (!cells) return;
    target.innerHTML = cells;
    revealRendered(target);
  }

  function renderFutureDomains(context) {
    const { escapeHtml, i18nText, localized, qs, revealRendered, state } = context;
    const target = qs("[data-future-domains]");
    if (!target || !state.registry) return;

    const engineSlugs = ["math", "physics", "engineering", "biology", "chemistry", "music"];
    const bridgeSlug = "unified-science";
    const glyphs = {
      math: "\u03a3",
      physics: "\u039b",
      engineering: "\u0393",
      biology: "\u03a8",
      chemistry: "\u0394",
      music: "\u03a6",
      "unified-science": "\u03a9",
    };
    const order = new Map([...engineSlugs, bridgeSlug].map((slug, index) => [slug, index]));
    const all = state.registry.futureDomains || [];
    const engines = all
      .filter((domain) => engineSlugs.includes(domain.slug))
      .sort((left, right) => (order.get(left.slug) ?? 99) - (order.get(right.slug) ?? 99));
    const bridge = all.find((domain) => domain.slug === bridgeSlug) || null;

    const stagedLabel = i18nText("status.staged") || "Staged";
    const bridgeLabel = i18nText("sciences.bridge") || "Bridge layer";

    const card = (domain, { variant, badge }) => {
      const title = state.lang === "am" && domain.am && domain.am.title ? domain.am.title : titleForDomain(domain);
      return `
        <article class="eng${variant ? ` ${variant}` : ""}">
          <span class="st" aria-hidden="true">${escapeHtml(badge)}</span>
          <div class="eng-sym" aria-hidden="true">${escapeHtml(glyphs[domain.slug] || ".")}</div>
          <h3>${escapeHtml(title)}</h3>
          <span class="eng-boundary">${escapeHtml(domain.releaseBoundary || "private incubation")}</span>
        </article>
      `;
    };

    const html = engines.map((domain) => card(domain, { badge: stagedLabel })).join("");
    target.innerHTML = bridge
      ? html + card(bridge, { variant: "eng-bridge", badge: bridgeLabel })
      : html;
    revealRendered(target);
  }

  function renderFilters(context) {
    const { escapeHtml, qsa, qs, revealRendered, state } = context;
    const target = qs("[data-repo-filters]");
    if (!target || !state.registry) return;
    target.innerHTML = categorySet(state.registry.systems).map((category) => `
      <button class="filter-button ${category === state.activeCategory ? "active" : ""}" type="button" data-category="${escapeHtml(category)}">
        ${escapeHtml(category)}
      </button>
    `).join("");

    qsa("[data-category]", target).forEach((button) => {
      button.addEventListener("click", () => {
        state.activeCategory = button.dataset.category || "All";
        renderFilters(context);
        renderRepoGrid(context);
      });
    });
    revealRendered(target);
  }

  function renderStats(context) {
    const { escapeHtml, i18nText, qs, revealRendered, state } = context;
    const target = qs("[data-repo-stats]");
    if (!target || !state.registry) return;
    const products = state.registry.systems || [];
    const categories = new Set(products.map((item) => item.category)).size;
    const productSurfaces = products.filter((item) => item.category !== "Website").length;
    target.innerHTML = `
      <div><div class="k">${products.length}</div><div class="l">${escapeHtml(i18nText("repo.statDeployed") || "Deployed public surfaces")}</div></div>
      <div><div class="k">${categories}</div><div class="l">${escapeHtml(i18nText("repo.statCategories") || "Categories")}</div></div>
      <div><div class="k">${productSurfaces}</div><div class="l">${escapeHtml(i18nText("repo.statProductRepos") || "Public product surfaces")}</div></div>
    `;
    revealRendered(target);
  }

  function renderRepoGrid(context) {
    const { escapeAttribute, escapeHtml, i18nText, localized, qs, revealRendered } = context;
    const target = qs("[data-repo-grid]");
    if (!target) return;
    const products = filteredProducts(context.state);

    if (!products.length) {
      target.innerHTML = `
        <article class="repo-card empty-card">
          <div class="repo-card-head"><h3>${escapeHtml(i18nText("repo.emptyTitle") || "No matching public surface")}</h3></div>
          <p>${escapeHtml(i18nText("repo.emptyBody") || "Adjust the search term or category filter. Planned domain engines are listed above.")}</p>
        </article>
      `;
      revealRendered(target);
      return;
    }

    target.innerHTML = products.map((item) => `
      <article class="repo-card">
        <div class="repo-card-head">
          <h3>${escapeHtml(item.name)}</h3>
          <span class="status-pill">${escapeHtml(item.status)}</span>
        </div>
        <span class="repo-name">${escapeHtml(item.sourceState || "private-source")}</span>
        <p>${escapeHtml(localized(item, "summary"))}</p>
        <div class="tag-row">
          ${(item.tags || []).map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}
        </div>
        <a class="repo-link" href="${escapeAttribute(item.href)}" rel="noopener">${escapeHtml(i18nText("repo.openRepository") || "Open surface")} -&gt;</a>
      </article>
    `).join("");
    revealRendered(target);
  }

  function bindSearch(context) {
    const { qs, state } = context;
    const input = qs("[data-repo-search]");
    if (!input) return;
    input.addEventListener("input", (event) => {
      state.query = event.target.value;
      renderRepoGrid(context);
    });
  }

  window.MullusiPublicSurfaceRegistryRenderer = Object.freeze({
    bindSearch,
    filteredProducts,
    renderFilters,
    renderFutureDomains,
    renderMetrics,
    renderRepoGrid,
    renderSnapshot,
    renderStats,
  });
})();
