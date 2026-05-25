/*
Purpose: render Mullusi homepage news, product activity, and local visit meter views.
Governance scope: public feed rendering, activity link boundaries, local-only visit count rendering, and explicit feed load errors.
Dependencies: assets/app.js context helpers, data/news.json records, data/site.json activity records, and browser DOM APIs.
Invariants: feed text is escaped, activity links are Mullusi-bounded, visit count remains local-only, and no feed data is fetched here.
*/

(() => {
  function activityHref(value) {
    const text = String(value ?? "").trim();
    if (/^#[A-Za-z][A-Za-z0-9_-]*$/.test(text)) return text;
    if (/^\/[A-Za-z0-9/_-]*\/?$/.test(text)) return text;
    if (/^https:\/\/(?:[a-z0-9.-]+\.)?mullusi\.com(?:\/.*)?$/i.test(text)) return text;
    return "";
  }

  function newsMeta(item, context) {
    const { escapeHtml, i18nText } = context;
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

  function newsCaption(context) {
    const { escapeHtml, i18nText, state } = context;
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

  function renderVisitMeter(context) {
    const { escapeHtml, i18nText, qs, state } = context;
    const target = qs("[data-visit-meter]");
    if (!target) return;
    const parts = [];
    if (state.visits > 0) {
      parts.push(`${escapeHtml(i18nText("footer.localVisits") || "Local visits")} ${state.visits}`);
    }
    const version = state.siteContent?.meta?.version;
    if (version) parts.push(`v${escapeHtml(version)}`);
    const signal = state.news?.meta?.updated;
    if (signal) parts.push(`${escapeHtml(i18nText("footer.signal") || "Signal")} ${escapeHtml(signal)}`);
    target.innerHTML = parts.join(" &middot; ");
  }

  function renderNews(context) {
    const { escapeAttribute, escapeHtml, i18nText, qs, revealRendered, state } = context;
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
        <p class="news-meta">${newsMeta(item, context)}</p>
      </li>
    `).join("");

    target.innerHTML = `${newsCaption(context)}<ol class="news-list">${rows}</ol>`;
    revealRendered(target);
  }

  function activityMeta(item, context) {
    const { escapeHtml } = context;
    const parts = [];
    if (item.status) parts.push(`<span class="news-source">${escapeHtml(item.status)}</span>`);
    if (item.scope) parts.push(`<span>${escapeHtml(item.scope)}</span>`);
    if (item.surface) parts.push(`<span>${escapeHtml(item.surface)}</span>`);
    if (item.date) parts.push(`<span>${escapeHtml(item.date)}</span>`);
    return parts.join('<span class="news-dot" aria-hidden="true">&middot;</span>');
  }

  function activityCaption(activity, context) {
    const { escapeHtml, i18nText, localized } = context;
    const bits = [];
    if (activity.updated) {
      bits.push(`${escapeHtml(i18nText("activity.updated") || "Updated")} ${escapeHtml(activity.updated)}`);
    }
    if (activity.label) {
      bits.push(escapeHtml(localized(activity, "label")));
    }
    if (!bits.length) return "";
    return `
      <p class="news-cap activity-cap">
        <span class="news-pulse" aria-hidden="true"></span>
        ${bits.join('<span class="news-dot" aria-hidden="true">&middot;</span>')}
      </p>
    `;
  }

  function activityStatusSummary(items, context) {
    const { escapeHtml } = context;
    const counts = new Map();
    items.forEach((item) => {
      const key = item.status || "activity";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    if (!counts.size) return "";
    const chips = Array.from(counts.entries()).map(([status, count]) => `
      <span>
        <strong>${escapeHtml(String(count))}</strong>
        ${escapeHtml(status)}
      </span>
    `).join("");
    return `<div class="activity-summary" aria-label="Mullu activity status summary">${chips}</div>`;
  }

  function renderMulluActivity(context) {
    const { escapeAttribute, escapeHtml, i18nText, localized, qs, revealRendered, state } = context;
    const target = qs("[data-mullu-activity]");
    const activity = state.siteContent?.mulluActivity;
    const items = Array.isArray(activity?.items) ? activity.items : [];
    if (!target || !activity) return;

    if (!items.length) {
      target.innerHTML = `
        <div class="news-empty">
          <h3>${escapeHtml(i18nText("activity.emptyTitle") || "Mullu activity is being recorded")}</h3>
          <p>${escapeHtml(i18nText("activity.emptyBody") || "Product updates and platform activity will appear here after the next governed release note.")}</p>
        </div>
      `;
      revealRendered(target);
      return;
    }

    const rows = items.map((item, index) => {
      const href = activityHref(item.href);
      const headline = href
        ? `<a class="news-headline activity-headline" href="${escapeAttribute(href)}">
            <span class="news-title">${escapeHtml(item.title)}</span>
            <span class="news-arrow" aria-hidden="true">-&gt;</span>
          </a>`
        : `<div class="news-headline activity-headline">
            <span class="news-title">${escapeHtml(item.title)}</span>
          </div>`;
      return `
        <li class="news-item activity-item">
          <span class="news-rank" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
          ${headline}
          <p class="news-meta">${activityMeta(item, context)}</p>
          <p class="activity-body">${escapeHtml(item.body)}</p>
        </li>
      `;
    }).join("");

    target.innerHTML = `
      ${activityCaption(activity, context)}
      <div class="activity-intro">
        <h3>${escapeHtml(localized(activity, "title"))}</h3>
        <p>${escapeHtml(localized(activity, "summary"))}</p>
      </div>
      ${activityStatusSummary(items, context)}
      <ol class="news-list activity-list">${rows}</ol>
    `;
    revealRendered(target);
  }

  function renderNewsLoadError(context) {
    const { escapeHtml, i18nText, qs, revealRendered } = context;
    const target = qs("[data-news]");
    if (!target) return;
    target.innerHTML = `
      <div class="news-empty error-card">
        <h3>${escapeHtml(i18nText("news.errorTitle") || "Frontier signal unavailable")}</h3>
        <p>${escapeHtml(i18nText("news.errorBody") || "The static news registry did not load. Confirm the registry is deployed beside this page.")}</p>
      </div>
    `;
    revealRendered(target);
  }

  window.MullusiNewsActivityRenderer = Object.freeze({
    activityHref,
    renderMulluActivity,
    renderNews,
    renderNewsLoadError,
    renderVisitMeter,
  });
})();
