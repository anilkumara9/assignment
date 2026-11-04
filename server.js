// OAuth Setup Guide - zero-dependency Node server.
// Run: node server.js  (PORT env optional, default 3000)
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./lib/guideStore");
const { investigate } = require("./lib/investigator");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const jobs = new Map(); // jobId -> { status, steps, guideId, error }

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body);
}

function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/" || p.startsWith("/g/")) p = "/index.html";
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    const ext = path.extname(file);
    const type = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png" }[ext] || "text/plain";
    res.writeHead(200, { "Content-Type": type + "; charset=utf-8" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/api/library") {
    return sendJson(res, 200, store.loadLibrary().map(g => ({
      id: g.id, appName: g.appName, domain: g.domain, summary: g.summary,
      difficulty: g.difficulty.level, approval: g.timeEstimate.approval
    })));
  }

  if (url.pathname.startsWith("/api/guides/")) {
    const g = store.get(url.pathname.split("/").pop());
    return g ? sendJson(res, 200, g) : sendJson(res, 404, { error: "guide not found" });
  }

  if (url.pathname === "/api/investigate" && req.method === "POST") {
    let body = "";
    req.on("data", c => { body += c; if (body.length > 4000) req.destroy(); });
    req.on("end", () => {
      let query;
      try { query = JSON.parse(body).query; } catch {}
      if (!query || typeof query !== "string" || query.trim().length < 2) {
        return sendJson(res, 400, { error: "Send JSON like {\"query\": \"linear.app\"} - an app name or a website URL." });
      }
      const jobId = "j_" + crypto.randomBytes(6).toString("hex");
      const job = { status: "running", steps: [], guideId: null, error: null };
      jobs.set(jobId, job);
      investigate(query.trim(), job.steps)
        .then(guide => { store.saveGenerated(guide); job.guideId = guide.id; job.status = "done"; })
        .catch(e => { job.status = "failed"; job.error = e.message; });
      sendJson(res, 202, { jobId });
    });
    return;
  }

  if (url.pathname.startsWith("/api/jobs/")) {
    const job = jobs.get(url.pathname.split("/").pop());
    return job ? sendJson(res, 200, job) : sendJson(res, 404, { error: "job not found" });
  }

  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405); res.end();
});

server.listen(PORT, () => console.log(`OAuth Setup Guide running at http://localhost:${PORT}`));
