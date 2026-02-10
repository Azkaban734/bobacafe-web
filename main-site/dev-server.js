#!/usr/bin/env node
/**
 * Local server that mimics Netlify _redirects (200 rewrites).
 * Run from main-site after building schedule-app:
 *   1. From repo root: bash main-site/build.sh   (or: cd schedule-app && npm run build && cp -r build ../main-site/schedule-app)
 *   2. cd main-site && node dev-server.js
 * Then open http://localhost:8888/schedule
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 8888;
const ROOT = path.join(__dirname);

function serveFile(res, filePath, contentType) {
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain");
    res.end("Not found: " + filePath);
  });
  res.setHeader("Content-Type", contentType || "application/octet-stream");
  stream.pipe(res);
}

function getContentType(ext) {
  const types = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[ext] || "application/octet-stream";
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  let pathname = decodeURIComponent(parsed.pathname);

  // Netlify-style 200 rewrites
  if (pathname === "/schedule" || pathname === "/schedule/") {
    pathname = "/schedule-app/index.html";
  } else if (pathname.startsWith("/schedule/")) {
    pathname = "/schedule-app/" + pathname.slice("/schedule/".length);
  }

  const filePath = path.join(ROOT, pathname);
  const ext = path.extname(filePath);

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA fallback: if under /schedule-app/ and file missing, serve index.html
      if (pathname.startsWith("/schedule-app/")) {
        const indexPath = path.join(ROOT, "schedule-app", "index.html");
        return fs.createReadStream(indexPath)
          .on("error", () => {
            res.statusCode = 404;
            res.setHeader("Content-Type", "text/plain");
            res.end("Not found. Run build first: from repo root, bash main-site/build.sh");
          })
          .pipe(res);
      }
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain");
      res.end("Not found: " + pathname);
      return;
    }
    serveFile(res, filePath, getContentType(ext));
  });
});

server.listen(PORT, () => {
  console.log("Serving at http://localhost:" + PORT);
  console.log("  /          -> main site");
  console.log("  /schedule  -> schedule app (rewrite)");
  console.log("  /schedule-app/ -> schedule app (direct)");
  if (!fs.existsSync(path.join(ROOT, "schedule-app", "index.html"))) {
    console.warn("\nWarning: main-site/schedule-app not found. Run build first:");
    console.warn("  From repo root: bash main-site/build.sh");
  }
});
