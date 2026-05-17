/*
Purpose: refresh data/news.json with a daily ranked set of general technology news, breakthroughs, and research releases.
Governance scope: public-safe external links only, deterministic output, and non-destructive refresh.
Dependencies: Node.js standard library and the keyless public Hacker News Algolia search API.
Invariants: output is HTTPS-only, deterministic, capped, and never overwritten with an empty result.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const newsPath = path.join(repoRoot, "data", "news.json");

const SEARCH_ENDPOINT = "https://hn.algolia.com/api/v1/search";
// The Hacker News front page is the community's general technology-news signal
// (programming, hardware, security, science, space, biotech, releases). The
// queries below are domain-agnostic and bias toward breakthroughs and research
// releases that may sit just below the front page — deliberately not AI-only.
const QUERIES = [
  "breakthrough",
  "research",
  "open source release",
  "scientists",
  "discovery",
  "launches",
  "study finds",
];
const MAX_AGE_DAYS = 5;
const MIN_POINTS = 60;
const FRONT_PAGE_MIN_POINTS = 20;
const FRONT_PAGE_HITS = 40;
const QUERY_HITS = 20;
const MAX_ITEMS = 7;
const MIN_ITEMS_TO_WRITE = 3;
const REQUEST_TIMEOUT_MS = 15000;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function safeUrl(rawUrl, objectId) {
  const fallback = `https://news.ycombinator.com/item?id=${objectId}`;
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    return { url: fallback, source: "news.ycombinator.com" };
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { url: fallback, source: "news.ycombinator.com" };
  }
  if (parsed.protocol !== "https:") {
    return { url: fallback, source: "news.ycombinator.com" };
  }
  return { url: parsed.toString(), source: parsed.hostname.replace(/^www\./, "") };
}

async function fetchHits(label, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, {
      headers: { "User-Agent": "mullusi-site-news-refresh" },
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`fetch_failed:${label}:http_${response.status}`);
      return [];
    }
    const body = await response.json();
    return Array.isArray(body.hits) ? body.hits : [];
  } catch (error) {
    console.warn(`fetch_error:${label}:${error.message}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function fetchFrontPage() {
  return fetchHits("front_page", new URLSearchParams({
    tags: "front_page",
    hitsPerPage: String(FRONT_PAGE_HITS),
  }));
}

function fetchQuery(query) {
  return fetchHits(query, new URLSearchParams({
    query,
    tags: "story",
    hitsPerPage: String(QUERY_HITS),
    numericFilters: `points>=${MIN_POINTS},created_at_i>${nowSeconds() - MAX_AGE_DAYS * 86400}`,
  }));
}

function toItem(hit, minPoints, cutoff) {
  const title = cleanTitle(hit.title || hit.story_title);
  if (!title) return null;
  const points = Number.isFinite(hit.points) ? hit.points : 0;
  if (points < minPoints) return null;
  const createdAtI = Number.isFinite(hit.created_at_i) ? hit.created_at_i : null;
  if (createdAtI !== null && createdAtI < cutoff) return null;
  const { url, source } = safeUrl(hit.url || hit.story_url, hit.objectID);
  const createdAt = typeof hit.created_at === "string" ? hit.created_at.slice(0, 10) : "";
  return {
    title,
    url,
    source,
    points,
    comments: Number.isFinite(hit.num_comments) ? hit.num_comments : 0,
    date: createdAt,
  };
}

function dedupe(items) {
  const byKey = new Map();
  for (const item of items) {
    const key = item.url.toLowerCase();
    const existing = byKey.get(key);
    if (!existing || item.points > existing.points) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

function readExisting() {
  try {
    return fs.readFileSync(newsPath, "utf8");
  } catch {
    return null;
  }
}

async function refreshNews() {
  const cutoff = nowSeconds() - MAX_AGE_DAYS * 86400;
  const collected = [];

  for (const hit of await fetchFrontPage()) {
    const item = toItem(hit, FRONT_PAGE_MIN_POINTS, cutoff);
    if (item) collected.push(item);
  }

  for (const query of QUERIES) {
    for (const hit of await fetchQuery(query)) {
      const item = toItem(hit, MIN_POINTS, cutoff);
      if (item) collected.push(item);
    }
  }

  const ranked = dedupe(collected)
    .sort((left, right) => {
      if (right.points !== left.points) return right.points - left.points;
      return left.title.localeCompare(right.title);
    })
    .slice(0, MAX_ITEMS);

  if (ranked.length < MIN_ITEMS_TO_WRITE) {
    console.warn(`news_refresh_skipped:only_${ranked.length}_qualifying_items`);
    return;
  }

  const payload = {
    meta: {
      name: "Mullusi Frontier Signal",
      source: "Hacker News",
      sourceUrl: "https://news.ycombinator.com",
      updated: new Date().toISOString().slice(0, 10),
      count: ranked.length,
    },
    items: ranked,
  };

  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const previous = readExisting();
  if (previous === serialized) {
    console.log("news_refresh_unchanged");
    return;
  }

  fs.writeFileSync(newsPath, serialized);
  console.log(`news_refresh_written:${ranked.length}_items`);
}

refreshNews().catch((error) => {
  console.error(`news_refresh_failed:${error.message}`);
  process.exit(1);
});
