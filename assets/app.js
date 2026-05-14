document.documentElement.classList.add('js-enabled');

const state = {
  registry: null,
  siteContent: null,
  activeCategory: 'All',
  query: ''
};

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function normalize(value) {
  return String(value || '').toLowerCase().trim();
}

function categorySet(products) {
  return ['All', ...Array.from(new Set(products.map((item) => item.category))).sort()];
}

function matchesQuery(item, query) {
  if (!query) return true;
  const haystack = [
    item.name,
    item.repo,
    item.category,
    item.status,
    item.summary,
    ...(item.tags || [])
  ].map(normalize).join(' ');
  return haystack.includes(query);
}

function filteredProducts() {
  const products = state.registry?.systems || [];
  const query = normalize(state.query);
  return products.filter((item) => {
    const categoryOk = state.activeCategory === 'All' || item.category === state.activeCategory;
    return categoryOk && matchesQuery(item, query);
  });
}

function renderSnapshot() {
  if (!state.registry) return;
  const products = state.registry.systems || [];
  const futureDomains = state.registry.futureDomains || [];
  const productTarget = qs('[data-public-product-count]');
  const domainTarget = qs('[data-domain-count]');

  if (productTarget) productTarget.textContent = `${products.length} public products`;
  if (domainTarget) domainTarget.textContent = `${futureDomains.length} staged engines`;
}

function renderProofLanes() {
  const target = qs('[data-proof-lanes]');
  const lanes = state.siteContent?.proofLanes || [];
  if (!target || !lanes.length) return;

  target.innerHTML = lanes.map((lane) => `
    <article class="evidence-card">
      <span>${escapeHtml(lane.label)}</span>
      <h3>${escapeHtml(lane.title)}</h3>
      <p>${escapeHtml(lane.summary)}</p>
    </article>
  `).join('');
}

function renderInterfaceLinks() {
  const target = qs('[data-interface-links]');
  const interfaces = state.siteContent?.interfaces || [];
  if (!target || !interfaces.length) return;

  target.innerHTML = interfaces.map((item) => `
    <article class="interface-card">
      <span>${escapeHtml(item.status)}</span>
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.summary)}</p>
      <a href="${escapeAttribute(item.href)}" rel="noopener">Open ${escapeHtml(item.name)}</a>
    </article>
  `).join('');
}

function renderReleaseStages() {
  const target = qs('[data-release-stages]');
  const stages = state.siteContent?.releaseStages || [];
  if (!target || !stages.length) return;

  target.innerHTML = stages.map((stage) => `
    <div class="timeline-item">
      <span>${escapeHtml(stage.step)}</span>
      <strong>${escapeHtml(stage.title)}</strong>
      <p>${escapeHtml(stage.summary)}</p>
    </div>
  `).join('');
}

function renderFutureDomains() {
  const target = qs('[data-future-domains]');
  if (!target || !state.registry) return;

  const physics = {
    name: 'Mullusi Physics Engine',
    slug: 'physics',
    plannedRepo: 'mullusi-physics-engine',
    status: 'live demo',
    summary: 'Existing symbolic causal physics hypothesis engine for regimes, axioms, bridges, open problems, and solver execution plans.'
  };

  const domains = [physics, ...(state.registry.futureDomains || [])];
  target.innerHTML = domains.map((domain) => `
    <article class="science-card">
      <span class="science-slug">${escapeHtml(domain.slug)} · ${escapeHtml(domain.status)}</span>
      <h3>${escapeHtml(domain.name)}</h3>
      <p>${escapeHtml(domain.summary)}</p>
      <span class="planned-repo">${escapeHtml(domain.plannedRepo)}</span>
    </article>
  `).join('');
}

function renderFilters() {
  const target = qs('[data-repo-filters]');
  if (!target || !state.registry) return;
  target.innerHTML = categorySet(state.registry.systems).map((category) => `
    <button class="filter-button ${category === state.activeCategory ? 'active' : ''}" type="button" data-category="${escapeHtml(category)}">
      ${escapeHtml(category)}
    </button>
  `).join('');

  qsa('[data-category]', target).forEach((button) => {
    button.addEventListener('click', () => {
      state.activeCategory = button.dataset.category || 'All';
      renderFilters();
      renderRepoGrid();
    });
  });
}

function renderStats() {
  const target = qs('[data-repo-stats]');
  if (!target || !state.registry) return;
  const products = state.registry.systems;
  const categories = new Set(products.map((item) => item.category)).size;
  const science = products.filter((item) => item.category === 'Science').length;
  target.innerHTML = `
    <div><strong>${products.length}</strong><span>Public products</span></div>
    <div><strong>${categories}</strong><span>Categories</span></div>
    <div><strong>${science}</strong><span>Science engines</span></div>
  `;
}

function renderRepoGrid() {
  const target = qs('[data-repo-grid]');
  if (!target) return;
  const products = filteredProducts();

  if (!products.length) {
    target.innerHTML = `
      <article class="repo-card">
        <div class="repo-card-head"><h3>No matching public repository</h3></div>
        <p>Adjust the search term or category filter. Planned domain engines are listed above.</p>
      </article>
    `;
    return;
  }

  target.innerHTML = products.map((item) => `
    <article class="repo-card">
      <div class="repo-card-head">
        <h3>${escapeHtml(item.name)}</h3>
        <span class="status-pill">${escapeHtml(item.status)}</span>
      </div>
      <span class="repo-name">${escapeHtml(item.repo)}</span>
      <p>${escapeHtml(item.summary)}</p>
      <div class="tag-row">
        ${(item.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
      </div>
      <a class="repo-link" href="${escapeAttribute(item.href)}" rel="noopener">Open repository →</a>
    </article>
  `).join('');
}

function bindSearch() {
  const input = qs('[data-repo-search]');
  if (!input) return;
  input.addEventListener('input', (event) => {
    state.query = event.target.value;
    renderRepoGrid();
  });
}

function bindHeader() {
  const header = qs('[data-elevate]');
  if (!header) return;
  const update = () => header.classList.toggle('is-elevated', window.scrollY > 12);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

function bindMenu() {
  const toggle = qs('[data-menu-toggle]');
  const menu = qs('[data-mobile-menu]');
  if (!toggle || !menu) return;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
  };

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    setOpen(open);
  });

  qsa('a', menu).forEach((link) => {
    link.addEventListener('click', () => setOpen(false));
  });
}

function bindReveal() {
  const items = qsa('.reveal');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-visible'));
    return;
  }

  const isInViewport = (item) => {
    const rect = item.getBoundingClientRect();
    return rect.top < window.innerHeight * 0.92 && rect.bottom > 0;
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });

  items.forEach((item) => {
    if (isInViewport(item)) {
      item.classList.add('is-visible');
      return;
    }
    observer.observe(item);
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  const text = String(value ?? '');
  if (!/^https:\/\//.test(text) && !/^mailto:/.test(text)) return '#';
  return escapeHtml(text);
}

async function loadRegistry() {
  const response = await fetch('data/products.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Registry load failed: ${response.status}`);
  return response.json();
}

async function loadSiteContent() {
  const response = await fetch('data/site.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Site content load failed: ${response.status}`);
  return response.json();
}

async function init() {
  bindHeader();
  bindMenu();
  bindReveal();
  bindSearch();

  try {
    state.siteContent = await loadSiteContent();
    renderProofLanes();
    renderInterfaceLinks();
    renderReleaseStages();
  } catch (error) {
    console.error(error);
  }

  try {
    state.registry = await loadRegistry();
    renderSnapshot();
    renderFutureDomains();
    renderFilters();
    renderStats();
    renderRepoGrid();
  } catch (error) {
    console.error(error);
    const repoGrid = qs('[data-repo-grid]');
    if (repoGrid) {
      repoGrid.innerHTML = `
        <article class="repo-card">
          <div class="repo-card-head"><h3>Product registry unavailable</h3></div>
          <p>The static registry did not load. Confirm <code>data/products.json</code> is deployed beside this page.</p>
        </article>
      `;
    }
  }
}

init();
