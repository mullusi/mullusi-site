/*
Purpose: refresh data/news.json with a daily ranked set of frontier model and systems research links.
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
const QUERIES = [
  "LLM",
  "machine learning",
  "neural network",
  "language model",
  "deep learning",
  "generative model",
  "OpenAI",
  "Anthropic",
];
const MAX_AGE_DAYS = 4;
const MIN_POINTS = 40;
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

async function fetchQuery(query) {
  const params = new URLSearchParams({
    query,
    tags: "story",
    hitsPerPage: "20",
    numericFilters: `points>=${MIN_POINTS},created_at_i>${nowSeconds() - MAX_AGE_DAYS * 86400}`,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, {
      headers: { "User-Agent": "mullusi-site-news-refresh" },
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`query_failed:${query}:http_${response.status}`);
      return [];
    }
    const body = await response.json();
    return Array.isArray(body.hits) ? body.hits : [];
  } catch (error) {
    console.warn(`query_error:${query}:${error.message}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function toItem(hit) {
  const title = cleanTitle(hit.title || hit.story_title);
  if (!title) return null;
  const points = Number.isFinite(hit.points) ? hit.points : 0;
  if (points < MIN_POINTS) return null;
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
  const collected = [];
  for (const query of QUERIES) {
    const hits = await fetchQuery(query);
    for (const hit of hits) {
      const item = toItem(hit);
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
