/*
Purpose: render Mullusi structured public content and operate the symbolic canvas substrate.
Governance scope: deterministic JSON rendering, safe link output, searchable public repository catalog, and visual substrate runtime.
Dependencies: data/products.json, data/site.json, DOM canvas APIs, IntersectionObserver, and browser fetch.
Invariants: untrusted JSON text is escaped, non-public links are blocked, registry failures surface visibly, and reduced motion is respected.
*/

document.documentElement.classList.add("js-enabled");

const state = {
  registry: null,
  siteContent: null,
  news: null,
  i18n: null,
  lang: "en",
  activeCategory: "All",
  query: "",
};

const fallbackLanguageNames = { en: "English", am: "አማርኛ" };

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const themeStorageKey = "mullusi-theme";
const langStorageKey = "mullusi-lang";

function normalizeLang(value) {
  return value === "am" ? "am" : "en";
}

function storedLang() {
  try {
    return localStorage.getItem(langStorageKey);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function preferredLang() {
  const stored = storedLang();
  if (stored === "am" || stored === "en") return stored;
  const navLang = (navigator.language || "").toLowerCase();
  return navLang.startsWith("am") ? "am" : "en";
}

function persistLang(lang) {
  try {
    localStorage.setItem(langStorageKey, lang);
  } catch (error) {
    console.warn(error);
  }
}

function i18nText(key) {
  const entry = state.i18n?.strings?.[key];
  if (!entry) return null;
  const value = entry[state.lang];
  if (typeof value === "string" && value.length > 0) return value;
  return typeof entry.en === "string" ? entry.en : null;
}

function languageName(lang) {
  return state.i18n?.languageNames?.[lang] || fallbackLanguageNames[lang] || lang;
}

function localized(record, field) {
  if (
    state.lang === "am" &&
    record &&
    record.am &&
    typeof record.am[field] === "string" &&
    record.am[field].trim().length > 0
  ) {
    return record.am[field];
  }
  return record ? record[field] : "";
}

function applyLang(lang, persist = true) {
  const normalized = normalizeLang(lang);
  state.lang = normalized;
  document.documentElement.lang = normalized;
  document.documentElement.dataset.lang = normalized;
  if (persist) persistLang(normalized);

  qsa("[data-i18n]").forEach((node) => {
    const text = i18nText(node.dataset.i18n);
    if (text !== null) node.textContent = text;
  });

  qsa("[data-i18n-attr]").forEach((node) => {
    node.dataset.i18nAttr.split(";").forEach((pair) => {
      const [attr, key] = pair.split(":").map((part) => part && part.trim());
      if (!attr || !key) return;
      const text = i18nText(key);
      if (text !== null) node.setAttribute(attr, text);
    });
  });

  const otherLang = normalized === "am" ? "en" : "am";
  qsa("[data-lang-toggle]").forEach((toggle) => {
    toggle.setAttribute("aria-label", i18nText("lang.toggleAria") || "Switch language");
    toggle.setAttribute("aria-pressed", String(normalized === "am"));
    const label = toggle.querySelector("[data-lang-label]");
    if (label) {
      label.textContent = languageName(otherLang);
      label.setAttribute("lang", otherLang);
    }
  });

  const activeTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  applyTheme(activeTheme, false);

  window.dispatchEvent(new CustomEvent("mullusi-lang-change", { detail: { lang: normalized } }));
}

function bindLangToggle() {
  qsa("[data-lang-toggle]").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      applyLang(state.lang === "am" ? "en" : "am");
    });
  });
}

async function loadI18n() {
  const response = await fetch("data/i18n.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`i18n load failed: ${response.status}`);
  return response.json();
}

function storedTheme() {
  try {
    return localStorage.getItem(themeStorageKey);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function preferredTheme() {
  const stored = storedTheme();
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function persistTheme(theme) {
  try {
    localStorage.setItem(themeStorageKey, theme);
  } catch (error) {
    console.warn(error);
  }
}

function applyTheme(theme, persist = true) {
  const normalizedTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = normalizedTheme;
  if (persist) persistTheme(normalizedTheme);

  const themeMeta = qs('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute("content", normalizedTheme === "light" ? "#f6f3ea" : "#050609");

  qsa("[data-theme-toggle]").forEach((toggle) => {
    const nextTheme = normalizedTheme === "light" ? "dark" : "light";
    const ariaKey = nextTheme === "light" ? "theme.toLightAria" : "theme.toDarkAria";
    toggle.setAttribute("aria-label", i18nText(ariaKey) || `Switch to ${nextTheme} mode`);
    toggle.setAttribute("aria-pressed", String(normalizedTheme === "light"));
  });

  qsa("[data-theme-label]").forEach((label) => {
    label.textContent = normalizedTheme === "light"
      ? (i18nText("theme.dark") || "Dark")
      : (i18nText("theme.light") || "Light");
  });

  window.dispatchEvent(new CustomEvent("mullusi-theme-change", { detail: { theme: normalizedTheme } }));
}

function bindThemeToggle() {
  applyTheme(preferredTheme(), false);

  qsa("[data-theme-toggle]").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const activeTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
      applyTheme(activeTheme === "light" ? "dark" : "light");
    });
  });

  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", (event) => {
    if (storedTheme()) return;
    applyTheme(event.matches ? "light" : "dark", false);
  });
}

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
    item.repo,
    item.category,
    item.status,
    item.summary,
    ...(item.tags || []),
  ].map(normalize).join(" ");
  return haystack.includes(query);
}

function filteredProducts() {
  const products = state.registry?.systems || [];
  const query = normalize(state.query);
  return products.filter((item) => {
    const categoryOk = state.activeCategory === "All" || item.category === state.activeCategory;
    return categoryOk && matchesQuery(item, query);
  });
}

function revealRendered(target) {
  prepareLinks(target || document);
  const revealTarget = target?.classList?.contains("reveal") ? target : target?.closest?.(".reveal");
  if (revealTarget) revealTarget.classList.add("in");
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

function titleForDomain(domain) {
  return String(domain.name || "")
    .replace(/^Mullusi\s+/i, "")
    .replace(/\s+Engine$/i, "")
    .replace(/\s+Lab$/i, "");
}

function renderSnapshot() {
  if (!state.registry) return;
  const products = state.registry.systems || [];
  const futureDomains = state.registry.futureDomains || [];
  const productTarget = qs("[data-public-product-count]");
  const domainTarget = qs("[data-domain-count]");

  if (productTarget) productTarget.textContent = String(products.length);
  if (domainTarget) domainTarget.textContent = String(futureDomains.length);
}

function renderProofLanes() {
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

function renderInterfaceLinks() {
  const target = qs("[data-interface-links]");
  const interfaces = state.siteContent?.interfaces || [];
  if (!target || !interfaces.length) return;

  target.innerHTML = interfaces.map((item) => `
    <article class="route">
      <span class="badge">${escapeHtml(localized(item, "status"))}</span>
      <h3>${escapeHtml(localized(item, "name"))}</h3>
      <p>${escapeHtml(localized(item, "summary"))}</p>
      <a class="lnk" href="${escapeAttribute(item.href)}" rel="noopener">${escapeHtml(i18nText("interfaces.openLink") || "Open")} ${escapeHtml(localized(item, "name"))} -&gt;</a>
    </article>
  `).join("");
  revealRendered(target);
}

function renderServices() {
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

function renderServiceTiers() {
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

function renderApiContracts() {
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

function renderReleaseStages() {
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

function renderRepositoryHandoff() {
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

function diagramArrowDefs() {
  return `
    <defs>
      <marker id="dg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" class="dg-arrow" />
      </marker>
    </defs>
  `;
}

function diagramNode(x, y, w, h, label, variant) {
  const cls = variant ? `dg-node ${variant}` : "dg-node";
  return `
    <g class="${cls}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" />
      <text x="${x + w / 2}" y="${y + h / 2}" class="dg-label" text-anchor="middle" dominant-baseline="middle">${escapeHtml(label)}</text>
    </g>
  `;
}

function svgFrame(viewBox, ariaLabel, inner) {
  return `<svg class="diagram-svg" viewBox="${viewBox}" role="img" aria-label="${escapeAttribute(ariaLabel)}" preserveAspectRatio="xMidYMid meet">${diagramArrowDefs()}${inner}</svg>`;
}

function renderFlowDiagram() {
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
    inner += diagramNode(x, y, w, h, label, variant);
    if (index < steps.length - 1) {
      const x1 = x + w + 4;
      const x2 = x + w + gap - 4;
      inner += `<line class="dg-conn" x1="${x1}" y1="${y + h / 2}" x2="${x2}" y2="${y + h / 2}" marker-end="url(#dg-arrow)" />`;
    }
  });
  const total = steps.length * w + (steps.length - 1) * gap;
  target.innerHTML = `
    ${svgFrame(`0 0 ${total} 126`, i18nText("flow.caption") || "Governed evaluation flow", inner)}
    <p class="diagram-caption">${escapeHtml(i18nText("flow.caption") || "Every request is checked, traced, and judged before a result returns.")}</p>
  `;
  revealRendered(target);
}

function renderBoundaryMap() {
  const target = qs("[data-boundary-map]");
  if (!target) return;
  const routes = ["Mullu", "Proof", "Playground"];
  const w = 196;
  const h = 60;
  const gap = 30;
  const rowW = routes.length * w + (routes.length - 1) * gap;
  const cx = rowW / 2;
  let inner = "";
  // umbrella
  inner += diagramNode(cx - 110, 8, 220, 60, "Mullusi", "is-root");
  // connectors from umbrella to each public route
  routes.forEach((label, index) => {
    const x = index * (w + gap);
    inner += `<path class="dg-conn" d="M ${cx} 68 C ${cx} 110, ${x + w / 2} 100, ${x + w / 2} 140" fill="none" marker-end="url(#dg-arrow)" />`;
    inner += diagramNode(x, 142, w, h, label, "is-public");
  });
  // staged/private cluster (dashed, dim)
  inner += `<line class="dg-conn is-dashed" x1="${cx}" y1="68" x2="${cx}" y2="232" marker-end="url(#dg-arrow)" />`;
  inner += diagramNode(cx - 130, 234, 260, 56, i18nText("map.stagedPrivate") || "Staged · private", "is-staged");
  target.innerHTML = `
    <div class="diagram-legend">
      <span class="lg lg-public">${escapeHtml(i18nText("map.publicRoutes") || "Public routes")}</span>
      <span class="lg lg-staged">${escapeHtml(i18nText("map.stagedPrivate") || "Staged · private")}</span>
    </div>
    ${svgFrame(`0 0 ${rowW} 300`, i18nText("map.caption") || "Mullusi route boundary map", inner)}
    <p class="diagram-caption">${escapeHtml(i18nText("map.caption") || "One umbrella. Public routes are linked; product engines stay private until their gate is met.")}</p>
  `;
  revealRendered(target);
}

function renderReleaseMachine() {
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
    inner += diagramNode(x, y, w, h, label, "is-state");
    if (index < steps.length - 1) {
      inner += `<line class="dg-conn" x1="${x + w + 4}" y1="${y + h / 2}" x2="${x + w + gap - 4}" y2="${y + h / 2}" marker-end="url(#dg-arrow)" />`;
    }
  });
  const lastX = (steps.length - 1) * (w + gap);
  inner += `<line class="dg-conn is-dashed" x1="${lastX + w + 4}" y1="${y + h / 2}" x2="${lastX + w + gap - 4}" y2="${y + h / 2}" marker-end="url(#dg-arrow)" />`;
  inner += diagramNode(lastX + w + gap, y, 200, h, "AwaitingEvidence", "is-terminal");
  const total = steps.length * (w + gap) + 200;
  target.innerHTML = `
    ${svgFrame(`0 0 ${total} 112`, "Release state machine", inner)}
    <p class="diagram-caption">${escapeHtml(i18nText("release.caption") || "A repository becomes a public route only after each gate closes.")}</p>
  `;
  revealRendered(target);
}

const statusMeta = {
  "live": { key: "status.live", fallback: "Live", cls: "is-live" },
  "awaiting-evidence": { key: "status.awaitingEvidence", fallback: "Awaiting Evidence", cls: "is-awaiting" },
  "planned": { key: "status.planned", fallback: "Planned", cls: "is-planned" },
};

function renderStatusBoard() {
  const target = qs("[data-system-status]");
  const board = state.siteContent?.statusBoard;
  const rows = Array.isArray(board?.rows) ? board.rows : [];
  if (!target || !board || rows.length === 0) return;

  const amRows = board.am && Array.isArray(board.am.rows) ? board.am.rows : [];
  const followHref = /^https:\/\//.test(board.followHref || "") ? board.followHref : null;

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
    <p class="status-follow">
      ${escapeHtml(localized(board, "follow"))}
      ${followHref ? `<a href="${escapeAttribute(followHref)}" rel="noopener">${escapeHtml(localized(board, "followLabel"))} -&gt;</a>` : ""}
    </p>
  `;
  revealRendered(target);
}

function renderUseCases() {
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

function newsMeta(item) {
  const parts = [];
  if (item.source) {
    parts.push(`<span class="news-source">${escapeHtml(item.source)}</span>`);
  }
  if (Number.isFinite(item.points) && item.points > 0) {
    parts.push(`<span>${item.points} ${escapeHtml(i18nText("news.points") || "points")}</span>`);
  }
  if (item.date) parts.push(`<span>${escapeHtml(item.date)}</span>`);
  return parts.join('<span class="news-dot" aria-hidden="true">&middot;</span>');
}

function newsCaption() {
  const meta = state.news?.meta || {};
  const bits = [];
  if (meta.updated) {
    bits.push(`${escapeHtml(i18nText("news.updated") || "Updated")} ${escapeHtml(meta.updated)}`);
  }
  if (meta.source) {
    bits.push(`${escapeHtml(i18nText("news.via") || "via")} ${escapeHtml(meta.source)}`);
  }
  if (!bits.length) return "";
  return `
    <p class="news-cap">
      <span class="news-pulse" aria-hidden="true"></span>
      ${bits.join('<span class="news-dot" aria-hidden="true">&middot;</span>')}
    </p>
  `;
}

function renderNews() {
  const target = qs("[data-news]");
  const items = Array.isArray(state.news?.items) ? state.news.items : [];
  if (!target) return;

  if (!items.length) {
    target.innerHTML = `
      <div class="news-empty">
        <h3>${escapeHtml(i18nText("news.emptyTitle") || "Signal is refreshing")}</h3>
        <p>${escapeHtml(i18nText("news.emptyBody") || "The daily research and systems digest will appear here after the next scheduled refresh.")}</p>
      </div>
    `;
    revealRendered(target);
    return;
  }

  const rows = items.map((item, index) => `
    <li class="news-item">
      <span class="news-rank" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
      <a class="news-headline" href="${escapeAttribute(item.url)}" rel="noopener">
        <span class="news-title">${escapeHtml(item.title)}</span>
        <span class="news-arrow" aria-hidden="true">-&gt;</span>
      </a>
      <p class="news-meta">${newsMeta(item)}</p>
    </li>
  `).join("");

  target.innerHTML = `${newsCaption()}<ol class="news-list">${rows}</ol>`;
  revealRendered(target);
}

function metricCell(value, labelKey, fallbackLabel) {
  if (value === null || value === undefined || value === "") return "";
  return `
    <div>
      <dt class="m-k">${escapeHtml(value)}</dt>
      <dd class="m-l">${escapeHtml(i18nText(labelKey) || fallbackLabel)}</dd>
    </div>
  `;
}

function renderMetrics() {
  const target = qs("[data-metrics]");
  if (!target) return;
  if (!state.registry || !state.siteContent) return;

  const systems = state.registry.systems || [];
  const futureDomains = state.registry.futureDomains || [];
  const interfaces = state.siteContent.interfaces || [];
  const apiContracts = state.siteContent.apiContracts || [];
  const releaseStages = state.siteContent.releaseStages || [];
  const signalUpdated = state.news?.meta?.updated || null;

  const cells = [
    metricCell(systems.length, "metrics.deployed", "Deployed public surfaces"),
    metricCell(interfaces.length, "metrics.routes", "Governed public routes"),
    metricCell(apiContracts.length, "metrics.contracts", "Govern API contracts v1"),
    metricCell(releaseStages.length, "metrics.gates", "Release-gate stages"),
    metricCell(futureDomains.length, "metrics.staged", "Staged domain engines"),
    metricCell(signalUpdated, "metrics.signal", "Signal last refreshed"),
  ].filter(Boolean).join("");

  if (!cells) return;
  target.innerHTML = cells;
  revealRendered(target);
}

function renderEvaluationExample() {
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

function renderFutureDomains() {
  const target = qs("[data-future-domains]");
  if (!target || !state.registry) return;

  const engineSlugs = ["math", "physics", "engineering", "biology", "chemistry", "music"];
  const bridgeSlug = "unified-science";
  const glyphs = {
    math: "Σ",
    physics: "Λ",
    engineering: "Γ",
    biology: "Ψ",
    chemistry: "Δ",
    music: "Φ",
    "unified-science": "Ω",
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
        <div class="eng-sym" aria-hidden="true">${escapeHtml(glyphs[domain.slug] || "·")}</div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(localized(domain, "summary"))}</p>
        <span class="eng-repo">${escapeHtml(domain.plannedRepo || "")}</span>
      </article>
    `;
  };

  const html = engines.map((domain) => card(domain, { badge: stagedLabel })).join("");
  target.innerHTML = bridge
    ? html + card(bridge, { variant: "eng-bridge", badge: bridgeLabel })
    : html;
  revealRendered(target);
}

function renderFilters() {
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
      renderFilters();
      renderRepoGrid();
    });
  });
  revealRendered(target);
}

function renderStats() {
  const target = qs("[data-repo-stats]");
  if (!target || !state.registry) return;
  const products = state.registry.systems || [];
  const categories = new Set(products.map((item) => item.category)).size;
  const productRepos = products.filter((item) => item.category !== "Website").length;
  target.innerHTML = `
    <div><div class="k">${products.length}</div><div class="l">${escapeHtml(i18nText("repo.statDeployed") || "Deployed public repos")}</div></div>
    <div><div class="k">${categories}</div><div class="l">${escapeHtml(i18nText("repo.statCategories") || "Categories")}</div></div>
    <div><div class="k">${productRepos}</div><div class="l">${escapeHtml(i18nText("repo.statProductRepos") || "Public product repos")}</div></div>
  `;
  revealRendered(target);
}

function renderRepoGrid() {
  const target = qs("[data-repo-grid]");
  if (!target) return;
  const products = filteredProducts();

  if (!products.length) {
    target.innerHTML = `
      <article class="repo-card empty-card">
        <div class="repo-card-head"><h3>${escapeHtml(i18nText("repo.emptyTitle") || "No matching public repository")}</h3></div>
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
      <span class="repo-name">${escapeHtml(item.repo)}</span>
      <p>${escapeHtml(localized(item, "summary"))}</p>
      <div class="tag-row">
        ${(item.tags || []).map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}
      </div>
      <a class="repo-link" href="${escapeAttribute(item.href)}" rel="noopener">${escapeHtml(i18nText("repo.openRepository") || "Open repository")} -&gt;</a>
    </article>
  `).join("");
  revealRendered(target);
}

function bindSearch() {
  const input = qs("[data-repo-search]");
  if (!input) return;
  input.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderRepoGrid();
  });
}

function bindHeader() {
  const header = qs("[data-elevate]");
  if (!header) return;
  const update = () => header.classList.toggle("is-elevated", window.scrollY > 12);
  update();
  window.addEventListener("scroll", update, { passive: true });
}

function prepareLinks(root = document) {
  qsa('a[href^="https://"]', root).forEach((link) => {
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  });
}

function bindLinkNavigation() {
  prepareLinks();

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link) return;

    const href = link.getAttribute("href") || "";
    if (/^https:\/\//.test(href)) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const openedWindow = window.open(href, "_blank");
      if (openedWindow) {
        openedWindow.opener = null;
        return;
      }
      window.location.assign(href);
      return;
    }

    if (!href.startsWith("#") || href.length <= 1) return;

    const target = document.getElementById(href.slice(1));
    if (!target) return;

    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.pushState(null, "", href);
  });
}

function bindMenu() {
  const toggle = qs("[data-menu-toggle]");
  const menu = qs("[data-mobile-menu]");
  if (!toggle || !menu) return;

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.hidden = !open;
    document.documentElement.classList.toggle("menu-open", open);
  };

  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    setOpen(open);
  });

  qsa("a", menu).forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });

  document.addEventListener("click", (event) => {
    if (menu.hidden || menu.contains(event.target) || toggle.contains(event.target)) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

function bindReveal() {
  const items = qsa(".reveal");
  if (!items.length) return;

  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("in"));
    return;
  }

  const isInViewport = (item) => {
    const rect = item.getBoundingClientRect();
    return rect.top < window.innerHeight * 0.92 && rect.bottom > 0;
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.1 });

  items.forEach((item) => {
    if (isInViewport(item)) {
      item.classList.add("in");
      return;
    }
    observer.observe(item);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  const text = String(value ?? "");
  if (!/^https:\/\//.test(text) && !/^mailto:/.test(text)) return "#";
  return escapeHtml(text);
}

async function loadRegistry() {
  const response = await fetch("data/products.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Registry load failed: ${response.status}`);
  return response.json();
}

async function loadSiteContent() {
  const response = await fetch("data/site.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Site content load failed: ${response.status}`);
  return response.json();
}

async function loadNews() {
  const response = await fetch("data/news.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`News load failed: ${response.status}`);
  return response.json();
}

function renderSiteContent() {
  if (!state.siteContent) return;
  renderProofLanes();
  renderInterfaceLinks();
  renderServices();
  renderServiceTiers();
  renderApiContracts();
  renderEvaluationExample();
  renderStatusBoard();
  renderUseCases();
  renderReleaseStages();
  renderRepositoryHandoff();
  renderFlowDiagram();
  renderBoundaryMap();
  renderReleaseMachine();
  renderMetrics();
}

function renderRegistryContent() {
  if (!state.registry) return;
  renderSnapshot();
  renderFutureDomains();
  renderFilters();
  renderStats();
  renderRepoGrid();
  renderMetrics();
}

async function initContent() {
  bindHeader();
  bindLinkNavigation();
  bindMenu();
  bindThemeToggle();
  bindReveal();
  bindSearch();
  bindLangToggle();

  try {
    state.i18n = await loadI18n();
  } catch (error) {
    console.error(error);
  }
  applyLang(preferredLang(), false);

  window.addEventListener("mullusi-lang-change", () => {
    renderSiteContent();
    renderRegistryContent();
    renderNews();
  });

  try {
    state.siteContent = await loadSiteContent();
    renderSiteContent();
  } catch (error) {
    console.error(error);
  }

  try {
    state.news = await loadNews();
    renderNews();
  } catch (error) {
    console.error(error);
    renderNews();
  }

  try {
    state.registry = await loadRegistry();
    renderRegistryContent();
  } catch (error) {
    console.error(error);
    const repoGrid = qs("[data-repo-grid]");
    if (repoGrid) {
      repoGrid.innerHTML = `
        <article class="repo-card error-card">
          <div class="repo-card-head"><h3>${escapeHtml(i18nText("repo.errorTitle") || "Product registry unavailable")}</h3></div>
          <p>${escapeHtml(i18nText("repo.errorBody") || "The static registry did not load. Confirm data/products.json is deployed beside this page.")}</p>
        </article>
      `;
      revealRendered(repoGrid);
    }
  }
}

function initSubstrate() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lat = qs("#c-lattice");
  const wav = qs("#c-wave");
  const chn = qs("#c-chain");
  if (!lat || !wav || !chn) return;

  const lx = lat.getContext("2d");
  const wx = wav.getContext("2d");
  const cx = chn.getContext("2d");
  const readout = qs("#resonance-readout");
  if (!lx || !wx || !cx) return;

  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cellSize = 68;
  let cols = 0;
  let rows = 0;
  let energy = new Float32Array(0);
  let particles = [];
  let waves = [];
  let randomState = 0x6d756c6c;
  const fidels = ["ሙ", "ሉ", "ሊ", "ሰ", "መ", "ለ", "ኡ", "ኢ", "ኣ", "ፊ", "ደ", "ል"];

  const zones = [
    {
      id: "Σ",
      at: 0,
      rgb: [92, 230, 196],
      node: [60, 68, 92],
      pRate: 1,
      pSpeed: 1,
      pMax: 4,
      waveMax: 3.4,
      waveOn: 1,
      mesh: 0,
      trail: 0,
      decay: 0.965,
      drift: 0,
      latAlpha: 1,
    },
    {
      id: "Λ",
      at: 0.5,
      rgb: [232, 177, 92],
      node: [86, 78, 58],
      pRate: 0.45,
      pSpeed: 0.55,
      pMax: 3,
      waveMax: 2.8,
      waveOn: 0.7,
      mesh: 1,
      trail: 0,
      decay: 0.95,
      drift: 0,
      latAlpha: 1,
    },
    {
      id: "H",
      at: 1,
      rgb: [122, 165, 232],
      node: [52, 60, 90],
      pRate: 0.5,
      pSpeed: 0.4,
      pMax: 4,
      waveMax: 2.4,
      waveOn: 0.15,
      mesh: 0.2,
      trail: 0.9,
      decay: 0.985,
      drift: 1,
      latAlpha: 0.55,
    },
  ];

  const zone = {
    id: "Σ",
    rgb: [92, 230, 196],
    node: [60, 68, 92],
    pRate: 1,
    pSpeed: 1,
    pMax: 4,
    waveMax: 3.4,
    waveOn: 1,
    mesh: 0,
    trail: 0,
    decay: 0.965,
    drift: 0,
    latAlpha: 1,
  };

  const themePalettes = {
    dark: [
      { rgb: [92, 230, 196], node: [60, 68, 92] },
      { rgb: [232, 177, 92], node: [86, 78, 58] },
      { rgb: [122, 165, 232], node: [52, 60, 90] },
    ],
    light: [
      { rgb: [20, 124, 111], node: [128, 139, 152] },
      { rgb: [154, 100, 27], node: [150, 136, 112] },
      { rgb: [76, 100, 150], node: [118, 128, 148] },
    ],
  };

  let activeSubstrateTheme = "";

  function applySubstrateTheme() {
    const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    if (theme === activeSubstrateTheme) return;
    activeSubstrateTheme = theme;
    themePalettes[theme].forEach((palette, index) => {
      zones[index].rgb = [...palette.rgb];
      zones[index].node = [...palette.node];
    });
  }

  const ease = (value) => value * value * value * (value * (value * 6 - 15) + 10);
  const accent = (alpha) => `rgba(${zone.rgb[0] | 0},${zone.rgb[1] | 0},${zone.rgb[2] | 0},${alpha})`;
  const nodeColor = (alpha) => `rgba(${zone.node[0] | 0},${zone.node[1] | 0},${zone.node[2] | 0},${alpha})`;

  let scrollFrac = 0;
  let scrollTarget = 0;
  let frame = 0;
  let sigma = 0;
  let perfTier = 0;
  let lastTime = performance.now();
  let slowStreak = 0;
  let fastStreak = 0;
  let throttleSkip = false;
  let staticDrawn = false;
  let motionLastTime = performance.now();

  function readScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollTarget = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }

  function frameFactor(timestamp) {
    const elapsed = timestamp - motionLastTime;
    motionLastTime = timestamp;
    if (!Number.isFinite(elapsed) || elapsed <= 0) return 1;
    return Math.min(2.25, Math.max(0.35, elapsed / 16.667));
  }

  function easeFrame(base, factor) {
    return 1 - Math.pow(1 - base, factor);
  }

  function updateZone(deltaFactor) {
    scrollFrac += (scrollTarget - scrollFrac) * easeFrame(0.06, deltaFactor);
    const fraction = scrollFrac;
    let lowerIndex = 0;
    while (lowerIndex < zones.length - 2 && fraction > zones[lowerIndex + 1].at) {
      lowerIndex += 1;
    }
    const lower = zones[lowerIndex];
    const upper = zones[lowerIndex + 1];
    const span = upper.at - lower.at;
    const local = span > 0 ? (fraction - lower.at) / span : 0;
    const k = ease(Math.min(1, Math.max(0, local)));
    const mix = (a, b) => a + (b - a) * k;

    for (let index = 0; index < 3; index += 1) {
      zone.rgb[index] = mix(lower.rgb[index], upper.rgb[index]);
      zone.node[index] = mix(lower.node[index], upper.node[index]);
    }

    zone.pRate = mix(lower.pRate, upper.pRate);
    zone.pSpeed = mix(lower.pSpeed, upper.pSpeed);
    zone.pMax = mix(lower.pMax, upper.pMax);
    zone.waveMax = mix(lower.waveMax, upper.waveMax);
    zone.waveOn = mix(lower.waveOn, upper.waveOn);
    zone.mesh = mix(lower.mesh, upper.mesh);
    zone.trail = mix(lower.trail, upper.trail);
    zone.decay = mix(lower.decay, upper.decay);
    zone.drift = mix(lower.drift, upper.drift);
    zone.latAlpha = mix(lower.latAlpha, upper.latAlpha);
    zone.id = k < 0.5 ? lower.id : upper.id;
  }

  function zoneIntensity(center) {
    const distance = Math.abs(scrollFrac - center);
    return Math.max(0, Math.min(1, 1 - distance / 0.48));
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    [lat, wav, chn].forEach((canvas) => {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    cols = Math.ceil(width / cellSize) + 1;
    rows = Math.ceil(height / cellSize) + 1;
    energy = new Float32Array(cols * rows);
  }

  function randomUnit() {
    randomState = (randomState * 1664525 + 1013904223) >>> 0;
    return randomState / 4294967296;
  }

  function spawnParticle() {
    const lane = Math.floor(randomUnit() * rows);
    particles.push({
      x: randomUnit() * Math.max(width, 1),
      y: randomUnit() * Math.max(height, 1),
      vx: (randomUnit() - 0.5) * 0.18,
      vy: (randomUnit() - 0.5) * 0.12,
      lane,
      phase: randomUnit() * Math.PI * 2,
      radius: 64 + randomUnit() * 120,
      pulse: randomUnit() * 320,
      pulseEvery: 320 + randomUnit() * 360,
      sides: 4 + Math.floor(randomUnit() * 4),
      spin: (0.002 + randomUnit() * 0.004) * (randomUnit() > 0.5 ? 1 : -1),
    });
  }

  function wrapFieldObject(fieldObject) {
    const pad = fieldObject.radius + 40;
    if (fieldObject.x < -pad) fieldObject.x = width + pad;
    if (fieldObject.x > width + pad) fieldObject.x = -pad;
    if (fieldObject.y < -pad) fieldObject.y = height + pad;
    if (fieldObject.y > height + pad) fieldObject.y = -pad;
  }

  function feedEnergyAt(x, y, amount) {
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return;
    const index = row * cols + col;
    energy[index] = Math.min(1, energy[index] + amount);
  }

  function drawSmoke(fieldObject, alphaScale, time) {
    if (alphaScale <= 0.01) return;
    const radius = fieldObject.radius * (0.82 + Math.sin(fieldObject.phase + time * 0.25) * 0.08);
    const x = fieldObject.x + Math.sin(fieldObject.phase * 0.7) * 18;
    const y = fieldObject.y + Math.cos(fieldObject.phase * 0.9) * 14;
    const gradient = cx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, accent((0.038 * alphaScale).toFixed(3)));
    gradient.addColorStop(0.52, accent((0.017 * alphaScale).toFixed(3)));
    gradient.addColorStop(1, accent(0));

    cx.save();
    cx.globalCompositeOperation = "lighter";
    cx.filter = "blur(10px)";
    cx.fillStyle = gradient;
    cx.beginPath();
    cx.ellipse(
      x,
      y,
      radius * 1.45,
      radius * 0.42,
      fieldObject.phase * 0.35,
      0,
      Math.PI * 2,
    );
    cx.fill();
    cx.restore();
  }

  function drawMorph(fieldObject, alphaScale, time) {
    if (alphaScale <= 0.01) return;
    const size = fieldObject.radius * 0.36;
    const sides = fieldObject.sides;
    const basePhase = fieldObject.phase + time * fieldObject.spin * 60;

    cx.save();
    cx.globalCompositeOperation = "lighter";
    cx.lineWidth = 1;
    cx.strokeStyle = accent((0.075 * alphaScale).toFixed(3));
    cx.fillStyle = accent((0.015 * alphaScale).toFixed(3));
    cx.beginPath();
    for (let index = 0; index < sides; index += 1) {
      const angle = basePhase + index * Math.PI * 2 / sides;
      const radius = size * (0.82 + Math.sin(basePhase * 0.9 + index * 1.7) * 0.24);
      const x = fieldObject.x + Math.cos(angle) * radius;
      const y = fieldObject.y + Math.sin(angle) * radius;
      if (index === 0) cx.moveTo(x, y);
      else cx.lineTo(x, y);
    }
    cx.closePath();
    cx.fill();
    cx.stroke();
    cx.restore();
  }

  function drawWaveBands(alphaScale, time) {
    if (alphaScale <= 0.01) return;
    wx.save();
    wx.globalCompositeOperation = "lighter";
    wx.lineWidth = 1;
    for (let band = 0; band < 2; band += 1) {
      const baseY = height * (0.3 + band * 0.24);
      const amplitude = 13 + band * 8;
      wx.strokeStyle = accent((0.026 * alphaScale * (1 - band * 0.12)).toFixed(3));
      wx.beginPath();
      for (let x = -24; x <= width + 24; x += 32) {
        const y = baseY
          + Math.sin(x * 0.008 + time * (0.18 + band * 0.04) + band * 1.7) * amplitude
          + Math.sin(x * 0.017 - time * 0.13) * 5;
        if (x === -24) wx.moveTo(x, y);
        else wx.lineTo(x, y);
      }
      wx.stroke();
    }
    wx.restore();
  }

  function drawStatic() {
    lx.clearRect(0, 0, width, height);
    wx.clearRect(0, 0, width, height);
    cx.clearRect(0, 0, width, height);
    for (let row = 0; row < rows; row += 2) {
      for (let col = 0; col < cols; col += 2) {
        lx.fillStyle = "rgba(60,68,92,.24)";
        lx.fillRect(col * cellSize - 0.5, row * cellSize - 0.5, 1, 1);
      }
    }
    if (readout) readout.textContent = "Σ 0.000";
  }

  function governPerf(now) {
    let delta = now - lastTime;
    lastTime = now;
    if (frame < 30) return;
    if (delta > 80) delta = 80;
    if (delta > 34) {
      slowStreak += 1;
      fastStreak = 0;
      if (perfTier === 0 && slowStreak > 36) {
        perfTier = 1;
        slowStreak = 0;
      } else if (perfTier === 1 && slowStreak > 80) {
        perfTier = 2;
        slowStreak = 0;
      }
      return;
    }

    fastStreak += 1;
    slowStreak = 0;
    if (perfTier === 1 && fastStreak > 260) {
      perfTier = 0;
      fastStreak = 0;
    }
  }

  function governStatic(renderCost) {
    if (renderCost < 22) {
      fastStreak += 1;
      if (fastStreak > 12) {
        perfTier = 1;
        fastStreak = 0;
        slowStreak = 0;
      }
      return;
    }
    fastStreak = 0;
  }

  function drawFrame(timestamp = performance.now()) {
    frame += 1;
    const renderStart = performance.now();
    const deltaFactor = frameFactor(timestamp);
    applySubstrateTheme();
    updateZone(deltaFactor);
    const time = timestamp * 0.001;
    const smokeWeight = zoneIntensity(0);
    const waveWeight = zoneIntensity(0.5);
    const morphWeight = zoneIntensity(1);

    const energyDecay = Math.pow(zone.decay, deltaFactor);
    for (let index = 0; index < energy.length; index += 1) {
      energy[index] *= energyDecay;
    }

    cx.globalCompositeOperation = "destination-out";
    cx.fillStyle = `rgba(0,0,0,${(0.045 + waveWeight * 0.035 + smokeWeight * 0.02).toFixed(3)})`;
    cx.fillRect(0, 0, width, height);
    cx.globalCompositeOperation = "source-over";

    const cap = Math.round(4 + smokeWeight * 2 + waveWeight * 1 + morphWeight * 2);
    while (particles.length < cap) {
      spawnParticle();
    }
    if (particles.length > cap + 4) particles.length = cap + 4;

    cx.lineCap = "round";
    cx.lineJoin = "round";
    for (const particle of particles) {
      particle.phase += (0.006 + morphWeight * 0.004) * deltaFactor;
      particle.x += (particle.vx + Math.sin(particle.phase * 0.37) * 0.035) * deltaFactor * (1 + smokeWeight * 0.7);
      particle.y += (particle.vy + Math.cos(particle.phase * 0.31) * 0.028) * deltaFactor * (1 + morphWeight * 0.55);
      wrapFieldObject(particle);

      particle.pulse += deltaFactor;
      if (particle.pulse >= particle.pulseEvery) {
        particle.pulse = 0;
        if (waves.length > 10) waves.shift();
        waves.push({
          x: particle.x,
          y: particle.y,
          r: 0,
          max: cellSize * zone.waveMax * (0.82 + waveWeight * 0.36),
        });
        feedEnergyAt(particle.x, particle.y, 0.18 + waveWeight * 0.12);
      }

      drawSmoke(particle, smokeWeight * 0.68 + waveWeight * 0.12, time);
      drawMorph(particle, morphWeight * 0.58 + waveWeight * 0.14, time);
    }

    wx.clearRect(0, 0, width, height);
    drawWaveBands(waveWeight * 0.64 + smokeWeight * 0.12, time);
    let totalEnergy = 0;
    let energyCount = 0;

    for (const wave of waves) {
      wave.r += 1.15 * deltaFactor;
      const progress = wave.r / wave.max;
      const alpha = (1 - progress) * 0.3 * zone.waveOn;
      if (alpha <= 0.002) continue;

      wx.strokeStyle = accent(alpha.toFixed(3));
      wx.lineWidth = 1;
      wx.beginPath();
      wx.arc(wave.x, wave.y, wave.r, 0, Math.PI * 2);
      wx.stroke();

      const ringCol = Math.floor(wave.x / cellSize);
      const row = Math.floor(wave.y / cellSize);
      if (row >= 0 && row < rows && ringCol >= 0 && ringCol < cols) {
        const energyIndex = row * cols + ringCol;
        energy[energyIndex] = Math.min(1, energy[energyIndex] + alpha * 0.026);
      }
    }

    waves = waves.filter((wave) => wave.r < wave.max);

    lx.clearRect(0, 0, width, height);
    lx.globalAlpha = zone.latAlpha;

    if (zone.mesh > 0.02) {
      lx.lineWidth = 1;
      for (let row = 0; row < rows; row += 2) {
        for (let col = 0; col < cols; col += 2) {
          const value = energy[row * cols + col];
          if (value < 0.18) continue;
          const x = col * cellSize;
          const y = row * cellSize;
          const rightValue = col + 1 < cols ? energy[row * cols + col + 1] : 0;
          const downValue = row + 1 < rows ? energy[(row + 1) * cols + col] : 0;
          if (rightValue > 0.18) {
            lx.strokeStyle = accent((Math.min(value, rightValue) * 0.22 * zone.mesh).toFixed(3));
            lx.beginPath();
            lx.moveTo(x, y);
            lx.lineTo(x + cellSize, y);
            lx.stroke();
          }
          if (downValue > 0.18) {
            lx.strokeStyle = accent((Math.min(value, downValue) * 0.22 * zone.mesh).toFixed(3));
            lx.beginPath();
            lx.moveTo(x, y);
            lx.lineTo(x, y + cellSize);
            lx.stroke();
          }
        }
      }
    }

    for (let row = 0; row < rows; row += 2) {
      for (let col = 0; col < cols; col += 2) {
        const value = energy[row * cols + col];
        totalEnergy += value;
        energyCount += 1;
        const x = col * cellSize;
        const y = row * cellSize;
        lx.fillStyle = nodeColor((0.12 + value * 0.22).toFixed(3));
        lx.fillRect(x - 0.5, y - 0.5, 1, 1);

        if (value > 0.04) {
          lx.strokeStyle = accent((value * 0.105).toFixed(3));
          lx.lineWidth = 1;
          lx.strokeRect(x + 3, y + 3, cellSize - 6, cellSize - 6);
        }

        if (value > 0.62 && (row * 7 + col) % 5 === 0) {
          lx.fillStyle = accent((value * 0.26).toFixed(3));
          lx.font = '13px "Newsreader", serif';
          lx.fillText(fidels[(row * 3 + col) % fidels.length], x + cellSize / 2 - 6, y + cellSize / 2 + 5);
        }
      }
    }

    lx.globalAlpha = 1;

    const meanEnergy = energyCount ? totalEnergy / energyCount : 0;
    sigma += (meanEnergy - sigma) * easeFrame(0.05, deltaFactor);
    if (readout && frame % 12 === 0) {
      readout.textContent = `${zone.id} ${(sigma * 9).toFixed(3)}`;
    }

    const now = performance.now();
    governPerf(now);
    if (perfTier === 2) {
      if (!staticDrawn) {
        drawStatic();
        staticDrawn = true;
      }
      governStatic(now - renderStart);
      setTimeout(() => requestAnimationFrame(drawFrame), 200);
      return;
    }

    staticDrawn = false;
    if (perfTier === 0) {
      throttleSkip = !throttleSkip;
      if (throttleSkip) {
        setTimeout(() => requestAnimationFrame(drawFrame), 16);
        return;
      }
    }

    if (perfTier === 1) {
      throttleSkip = !throttleSkip;
      if (throttleSkip) {
        setTimeout(() => requestAnimationFrame(drawFrame), 48);
        return;
      }
    }

    requestAnimationFrame(drawFrame);
  }

  resize();
  applySubstrateTheme();
  for (let index = 0; index < 5; index += 1) spawnParticle();
  window.addEventListener("mullusi-theme-change", applySubstrateTheme);
  window.addEventListener("resize", () => {
    resize();
    if (reduce || perfTier === 2) drawStatic();
  });
  window.addEventListener("scroll", readScroll, { passive: true });

  if (reduce) {
    drawStatic();
    return;
  }

  readScroll();
  scrollFrac = scrollTarget;
  requestAnimationFrame(drawFrame);
}

initSubstrate();
initContent();
