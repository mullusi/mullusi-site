/*
Purpose: serve the Mullusi Cloudflare Pages artifact locally with the same static route boundary expected in production.
Governance scope: local preview routing, artifact-only file serving, missing-route fallback, and path traversal prevention.
Dependencies: Node.js standard library and scripts/build-cloudflare-pages.mjs.
Invariants: only files inside dist are served, unknown routes return 404.html with status 404, and no backend/runtime claim is introduced.
Test contract: run node scripts/test-serve-local-preview.mjs.
*/

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCloudflarePages } from "./build-cloudflare-pages.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultDistDirectory = path.join(repoRoot, "dist");
const defaultHost = "127.0.0.1";
const defaultPort = 4173;

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

function isInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function decodeRequestPath(requestUrl) {
  const rawPath = requestUrl.split(/[?#]/, 1)[0] || "/";
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return null;
  }
}

function candidatePaths(distDirectory, pathname) {
  const cleanPath = pathname.replace(/^\/+/, "");
  const candidates = [];
  if (cleanPath === "") {
    candidates.push("index.html");
  } else {
    candidates.push(cleanPath);
    if (pathname.endsWith("/")) {
      candidates.push(path.join(cleanPath, "index.html"));
    } else if (path.extname(cleanPath) === "") {
      candidates.push(path.join(cleanPath, "index.html"));
    }
  }
  return candidates.map((relativePath) => path.resolve(distDirectory, relativePath));
}

function fileExists(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

export function resolveStaticResponse({ distDirectory = defaultDistDirectory, requestUrl }) {
  const root = path.resolve(distDirectory);
  const pathname = decodeRequestPath(requestUrl);
  if (pathname === null || pathname.includes("\0")) {
    return {
      body: "Bad request",
      contentType: "text/plain; charset=utf-8",
      filePath: null,
      statusCode: 400,
    };
  }

  for (const candidatePath of candidatePaths(root, pathname)) {
    if (!isInside(root, candidatePath)) {
      return {
        body: "Route boundary violation",
        contentType: "text/plain; charset=utf-8",
        filePath: null,
        statusCode: 403,
      };
    }
    if (fileExists(candidatePath)) {
      return {
        body: null,
        contentType: contentTypes.get(path.extname(candidatePath).toLowerCase()) ?? "application/octet-stream",
        filePath: candidatePath,
        statusCode: 200,
      };
    }
  }

  const fallbackPath = path.join(root, "404.html");
  if (fileExists(fallbackPath)) {
    return {
      body: null,
      contentType: "text/html; charset=utf-8",
      filePath: fallbackPath,
      statusCode: 404,
    };
  }

  return {
    body: "Route not published",
    contentType: "text/plain; charset=utf-8",
    filePath: null,
    statusCode: 404,
  };
}

export function createPreviewServer({ distDirectory = defaultDistDirectory } = {}) {
  return http.createServer((request, response) => {
    const result = resolveStaticResponse({
      distDirectory,
      requestUrl: request.url ?? "/",
    });
    response.writeHead(result.statusCode, {
      "Cache-Control": "no-store",
      "Content-Type": result.contentType,
      "X-Content-Type-Options": "nosniff",
    });
    if (result.filePath) {
      fs.createReadStream(result.filePath).pipe(response);
      return;
    }
    response.end(result.body);
  });
}

function parsePort(value) {
  if (value === undefined) return defaultPort;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid_port:${value}`);
  }
  return port;
}

function main() {
  const requestedArgs = new Set(process.argv.slice(2));
  if (requestedArgs.has("--help") || requestedArgs.has("-h")) {
    console.log([
      "Usage: node scripts/serve-local-preview.mjs [--no-build] [--port 4173]",
      "",
      "Builds and serves the Cloudflare Pages artifact from dist.",
      "Unknown routes return 404.html with HTTP 404.",
    ].join("\n"));
    return;
  }

  const portFlagIndex = process.argv.indexOf("--port");
  const port = parsePort(portFlagIndex === -1 ? undefined : process.argv[portFlagIndex + 1]);
  if (!requestedArgs.has("--no-build")) {
    buildCloudflarePages({ outputDirectory: defaultDistDirectory });
  }

  const server = createPreviewServer({ distDirectory: defaultDistDirectory });
  server.listen(port, defaultHost, () => {
    console.log(`local preview serving http://${defaultHost}:${port}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}
