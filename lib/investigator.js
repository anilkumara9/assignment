// The investigation agent. Given an app name or website, it performs real web
// investigation: resolves the app's domain, discovers its developer docs,
// fetches OAuth-related pages, extracts setup/review/approval signals, merges
// curated knowledge for well-known providers, and composes a structured guide.
//
// Honesty model: every claim carries an evidence label:
//   "fetched"  - seen on a live page fetched during this run (URL cited)
//   "curated"  - researched provider knowledge shipped with the tool
//   "inferred" - the agent's conclusion from combined signals
//   "unverified" - stated but not confirmed; the developer must check

const crypto = require("crypto");
const knowledge = require("./knowledge");

const UA = "OAuthSetupGuideBot/1.0 (take-home assignment; developer-research agent)";
const FETCH_TIMEOUT = 9000;
const MAX_DOC_PAGES = 6;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinks(html, base) {
  const out = new Set();
  const re = /href\s*=\s*["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try { out.add(new URL(m[1], base).toString()); } catch {}
  }
  return [...out];
}

async function fetchPage(url, log) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal, redirect: "follow",
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" }
    });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.includes("html")) {
      log.push({ ts: Date.now(), text: `Skipped ${url} (${res.status}, ${type || "no content-type"})`, kind: "fetch-skip" });
      return null;
    }
    const html = await res.text();
    log.push({ ts: Date.now(), text: `Fetched ${url} (${res.status}, ${html.length} bytes)`, kind: "fetch" });
    return { url, finalUrl: res.url, html, text: stripHtml(html).slice(0, 60000), status: res.status };
  } catch (e) {
    log.push({ ts: Date.now(), text: `Could not fetch ${url} (${e.name === "AbortError" ? "timeout" : e.message})`, kind: "fetch-error" });
    return null;
  } finally { clearTimeout(t); }
}

async function ddgSearch(query, log) {
  log.push({ ts: Date.now(), text: `Searching the web: "${query}"`, kind: "search" });
  const ok = u => /^https?:\/\//.test(u) && !/duckduckgo|youtube|wikipedia|bing\.com|microsoft\.com\/en-us\/bing/i.test(u);
  // DuckDuckGo HTML endpoint
  let page = await fetchPage("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), log);
  if (page && page.status === 200) {
    const urls = new Set(); const re = /uddg=([^&"]+)/g; let m;
    while ((m = re.exec(page.html))) { try { const u = decodeURIComponent(m[1]); if (ok(u)) urls.add(u); } catch {} }
    if (urls.size) return [...urls].slice(0, 8);
  }
  // Bing fallback
  page = await fetchPage("https://www.bing.com/search?q=" + encodeURIComponent(query), log);
  if (page && page.status === 200) {
    const urls = new Set(); const re = /<h2[^>]*>\s*<a[^>]+href="([^"]+)"/g; let m;
    const unwrap = u => {
      try {
        const p = new URL(u).searchParams.get("u");
        if (p && p.startsWith("a1")) return Buffer.from(p.slice(2).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      } catch {}
      return u;
    };
    while ((m = re.exec(page.html))) { const u = unwrap(m[1].replace(/&amp;/g, "&")); if (ok(u)) urls.add(u); }
    if (urls.size) return [...urls].slice(0, 8);
  }
  log.push({ ts: Date.now(), text: "Web search returned no usable results; falling back to direct docs discovery.", kind: "search-empty" });
  return [];
}

function hostnameOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } }

// ---- signal extraction ----

function extractSignals(text) {
  const t = text.toLowerCase();
  const has = re => re.test(t);
  const signals = {
    oauth: has(/oauth\s*2?\.?0?\b|authorization[_ ]code|client[_ ]secret|access[_ ]token/),
    redirectUris: has(/redirect uri|callback url|redirect_url|redirect url/),
    scopes: has(/\bscopes?\b|\bpermissions\b/),
    pkce: has(/\bpkce\b|code challenge/),
    createApp: has(/create (an|a new|your) app|register (your|an|a new) (app|application)|developer (console|dashboard|portal)|app credentials|api credentials/),
    verification: has(/app verification|verification (process|requirements|required)|unverified app|security assessment|verification review/),
    appReview: has(/app review|submit (your app |it )?for (review|approval|verification)|review process|marketplace (review|submission)|review team/),
    testMode: has(/test mode|testing mode|development mode|sandbox|test users/),
    privacyPolicy: has(/privacy policy/),
  };
  // approval wait-time phrases near review/verification words
  signals.waitPhrases = [];
  const waitRe = /(?:review|verification|approval|moderation)[^.\n]{0,160}?(\d+)\s*(?:-|to\s*)?(\d+)?\s*(business days?|days?|weeks?)/gi;
  let m;
  while ((m = waitRe.exec(text)) && signals.waitPhrases.length < 4) {
    signals.waitPhrases.push(m[0].replace(/\s+/g, " ").trim().slice(0, 220));
  }
  return signals;
}

function difficultyFrom(signals, kb) {
  let score = 0;
  const why = [];
  if (kb && kb.verification === "required-for-sensitive-scopes") { score += 3; why.push("Provider requires formal OAuth verification for sensitive scopes (curated knowledge)."); }
  else if (signals.verification) { score += 3; why.push("Docs mention an app verification / security assessment requirement (fetched)."); }
  if (kb && (kb.verification === "review-only-for-distribution" || kb.verification === "review-only-for-public" || kb.verification === "review-only-for-marketplace")) { score += 2; why.push("Review needed only for public distribution/marketplace listing (curated knowledge)."); }
  else if (signals.appReview) { score += 2; why.push("Docs mention an app review or approval process (fetched)."); }
  if (signals.oauth || (kb && kb.oauth)) { score += 1; }
  if (kb && kb.verification === "none") { why.push("No approval gate for basic use (curated knowledge)."); }
  if (!why.length) why.push("No review or verification requirement turned up in the pages fetched this run - that usually means a simple self-serve flow, but treat it as low confidence without a curated entry.");
  const level = score >= 4 ? "Hard" : score >= 3 ? "Moderate" : score >= 2 ? "Moderate" : "Easy";
  return { level, score, rationale: why };
}

function timeFrom(signals, kb) {
  let approval = null, basis = [];
  if (kb && kb.waitDays) {
    if (kb.waitDays[0] === 0 && kb.waitDays[1] === 0) { approval = "None - works immediately"; basis.push({ text: "No approval gate (curated knowledge).", evidence: "curated" }); }
    else { approval = `${kb.waitDays[0]} to ${kb.waitDays[1]} business days (estimate from researched provider guidance)`; basis.push({ text: `Approval estimate ${kb.waitDays[0]}-${kb.waitDays[1]} business days (curated knowledge; confirm current timelines on the provider's review page).`, evidence: "curated" }); }
  }
  if (signals.waitPhrases.length) {
    basis.push({ text: `Found on live docs: "${signals.waitPhrases[0]}"`, evidence: "fetched" });
    if (!approval) approval = `Docs mention review timelines: "${signals.waitPhrases[0]}" - confirm on the provider's current review page`;
  }
  if (!approval) { approval = "Unknown - no review timeline found; treat as unverified and check the provider's review policy"; basis.push({ text: "No approval timeline could be confirmed from fetched pages or curated knowledge.", evidence: "unverified" }); }
  return { setup: "30 minutes to a few hours for a basic OAuth client (create app, set redirect URI, copy credentials)", approval, basis };
}

function defaultAgentSplit(kb, signals) {
  return {
    agentCanDo: [
      "Discover and read the provider's developer and OAuth documentation",
      "Identify whether OAuth is supported, where apps are registered, and whether review/verification applies",
      "Collect requirements, gotchas and source links into a shareable guide",
      "Re-check documentation on demand to keep the guide current"
    ],
    developerMustDo: [
      kb && kb.console ? `Create the app in the provider console (${kb.console.label}) - requires the developer's own account` : "Create the app in the provider's developer console - requires the developer's own account",
      "Accept the provider's terms and, where required, complete verification/review forms",
      "Host the privacy policy and homepage URLs the provider asks for",
      "Store the client ID/secret and wire the OAuth flow into their own product"
    ]
  };
}

async function investigate(query, log) {
  log.push({ ts: Date.now(), text: `Starting investigation for "${query}"`, kind: "start" });
  let name = query.trim(), domain = null, homePageCache = null;

  if (/^https?:\/\//i.test(name)) { domain = hostnameOf(name); name = domain.split(".")[0]; }
  else if (/^[a-z0-9][a-z0-9-]*(\.[a-z]{2,})+$/i.test(name)) { domain = name.toLowerCase(); name = domain.split(".")[0]; }

  // 1. resolve domain from a bare name
  if (!domain) {
    const guess = `https://${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
    log.push({ ts: Date.now(), text: `No domain given; trying ${guess}`, kind: "guess" });
    const home = await fetchPage(guess, log);
    if (home) { domain = hostnameOf(home.finalUrl); homePageCache = home; }
    if (!domain) {
      const results = await ddgSearch(`${name} official website`, log);
      if (results.length) { domain = hostnameOf(results[0]); log.push({ ts: Date.now(), text: `Resolved "${name}" to ${domain} via search`, kind: "resolve" }); }
    }
  }
  if (!domain) throw new Error(`Could not resolve a website for "${query}". Try giving the site's URL directly.`);

  // 2. fetch homepage, mine developer/docs links
  const homeUrl = `https://${domain}`;
  const home = homePageCache && hostnameOf(homePageCache.finalUrl) === domain ? homePageCache : await fetchPage(homeUrl, log);
  const candidates = new Set();
  if (home) {
    for (const link of extractLinks(home.html, home.finalUrl)) {
      if ((/developer|\/docs?(\/|$)|docs\.|oauth/i.test(link) && !/\.(png|jpe?g|svg|css|js|ico|xml)(\?|$)/i.test(link)) && link.length < 160) candidates.add(link);
    }
  }
  for (const c of [`https://developers.${domain}`, `https://developer.${domain}`, `https://docs.${domain}`, `https://${domain}/developers`, `https://${domain}/docs`, `https://${domain}/developers/docs`]) candidates.add(c);

  // 3. web searches for OAuth + review evidence
  const docsish = u => /developer|\/docs?(\/|$)|docs\.|oauth|api-reference|authentication/i.test(u);
  const searchHits = await ddgSearch(`${name} OAuth 2.0 create app developer documentation`, log);
  const relevant = searchHits.filter(docsish);
  for (const u of (relevant.length ? relevant : searchHits).slice(0, 3)) candidates.add(u);
  const reviewHits = await ddgSearch(`${name} oauth app review verification approval how long`, log);

  // 4. fetch candidate doc pages until we have enough
  const pages = [];
  for (const u of candidates) {
    if (pages.length >= MAX_DOC_PAGES) break;
    const p = await fetchPage(u, log);
    if (p && p.text.length > 400) pages.push(p);
    await sleep(300);
  }
  for (const u of reviewHits.slice(0, 2)) {
    const p = await fetchPage(u, log);
    if (p && p.text.length > 400) pages.push(p);
    await sleep(300);
  }
  const seenUrls = new Set();
  const deduped = pages.filter(p => { if (seenUrls.has(p.finalUrl)) return false; seenUrls.add(p.finalUrl); return true; });
  pages.length = 0; pages.push(...deduped);
  log.push({ ts: Date.now(), text: `Read ${pages.length} documentation pages`, kind: "read" });

  // 5. extract signals
  const combined = pages.map(p => p.text).join("\n\n");
  const signals = extractSignals(combined);
  log.push({ ts: Date.now(), text: `Signals: oauth=${signals.oauth} app-registration=${signals.createApp} verification=${signals.verification} review=${signals.appReview}`, kind: "signals" });

  // 6. curated knowledge merge
  const kb = knowledge.lookup(domain, name);
  if (kb) log.push({ ts: Date.now(), text: `Matched curated knowledge base entry: ${kb.name} (researched provider facts, labeled separately from live fetches)`, kind: "kb" });

  // 7. compose
  const difficulty = difficultyFrom(signals, kb);
  const time = timeFrom(signals, kb);
  const split = defaultAgentSplit(kb, signals);
  const supportsOAuth = signals.oauth || (kb && kb.oauth);

  const sources = pages.map(p => ({ url: p.finalUrl, status: p.status, evidence: "fetched" }));
  if (kb) for (const u of kb.docs || []) sources.push({ url: u, status: null, evidence: "curated" });

  const requirements = [];
  if (kb && kb.console) requirements.push({ item: `A developer account with ${kb.name}; register the app at ${kb.console.label}`, evidence: kb.console.evidence, source: kb.console.url });
  else if (signals.createApp) requirements.push({ item: "A developer account; the docs describe an app-registration step (see sources)", evidence: "fetched", source: pages[0] ? pages[0].finalUrl : null });
  else requirements.push({ item: "A developer account with the provider (registration page not confirmed in this run)", evidence: "unverified", source: null });
  if (signals.redirectUris || kb) requirements.push({ item: "At least one pre-registered HTTPS redirect/callback URI", evidence: signals.redirectUris ? "fetched" : "curated", source: null });
  if (signals.privacyPolicy || (kb && kb.gotchas.some(g => /privacy/i.test(g.text)))) requirements.push({ item: "A public privacy policy URL (required for verification/review)", evidence: signals.privacyPolicy ? "fetched" : "curated", source: null });

  const gotchas = [];
  if (kb) for (const g of kb.gotchas || []) gotchas.push({ text: g.text, evidence: g.evidence, source: g.source || null });
  if (signals.pkce) gotchas.push({ text: "Docs reference PKCE / code challenge - plan to support it.", evidence: "fetched", source: null });
  if (signals.testMode) gotchas.push({ text: "Docs reference a test/development mode - expect limits (e.g. test users) before the app is approved or published.", evidence: "fetched", source: null });

  const tested = {
    whatWasTested: [
      `Live fetches performed in this run: ${pages.length} pages from ${domain} and search results (URLs in Sources, labeled "fetched")`,
      kb ? `Curated knowledge entry for ${kb.name} applied and labeled "curated"` : "No curated knowledge entry exists for this provider - the guide rests on live fetches only",
      "The tool's own library guides were researched manually against provider documentation"
    ],
    uncertain: [
      "The agent did not create a real OAuth app with this provider - registration, verification and approval steps were not executed end-to-end",
      "Approval wait times are estimates from documentation, not measured",
      ...(kb ? [] : ["This provider is outside the curated knowledge base; difficulty and time estimates carry lower confidence"]),
      "Provider policies change - re-run the investigation to refresh before relying on this guide"
    ]
  };

  const steps = [];
  steps.push({ n: 1, title: "Create a developer account and register the app", actor: "developer", detail: kb && kb.console ? `Do this at ${kb.console.label} (${kb.console.url}).` : "Use the provider's developer console linked in Sources.", evidence: kb ? "curated" : "unverified" });
  steps.push({ n: 2, title: "Configure OAuth basics", actor: "developer", detail: "Set the app name, logo, homepage/privacy-policy URLs where asked, and register your redirect URI. Choose the minimum scopes your product needs.", evidence: "inferred" });
  if (difficulty.level !== "Easy") steps.push({ n: 3, title: "Prepare for review/verification", actor: "developer", detail: kb && kb.verification === "required-for-sensitive-scopes" ? "Sensitive scopes trigger mandatory verification: prepare a demo video, domain verification, and a written justification per scope." : "If you plan public distribution, prepare review materials (demo, listing content, scope justifications).", evidence: kb ? "curated" : "inferred" });
  steps.push({ n: steps.length + 1, title: "Implement the OAuth flow", actor: "developer", detail: `Authorization-code flow against the provider's endpoints${signals.pkce ? " with PKCE" : ""}; store and refresh tokens server-side.`, evidence: "inferred" });
  steps.push({ n: steps.length + 1, title: "Submit and track approval", actor: "developer", detail: `Expected approval window: ${time.approval}.`, evidence: kb ? "curated" : "unverified" });

  const guide = {
    id: "g_" + crypto.randomBytes(8).toString("hex"),
    appName: kb ? kb.name : name.replace(/\b\w/g, c => c.toUpperCase()),
    domain, createdAt: new Date().toISOString(), source: "live",
    summary: supportsOAuth
      ? `${kb ? kb.name : name.replace(/\b\w/g, c => c.toUpperCase())} supports OAuth 2.0 app creation. Overall difficulty: ${difficulty.level}. Approval: ${time.approval}.`
      : `Could not confirm OAuth 2.0 support for ${name} from fetched pages - treat this guide as low-confidence.`,
    lowConfidence: !kb && pages.length < 3,
    oauthSupported: supportsOAuth,
    difficulty, timeEstimate: time, steps, requirements, gotchas,
    agentCanDo: split.agentCanDo, developerMustDo: split.developerMustDo,
    tested, sources,
    evidenceLegend: {
      fetched: "Confirmed on a page fetched live during this investigation",
      curated: "Researched provider knowledge shipped with the tool",
      inferred: "Agent conclusion from combined signals",
      unverified: "Not confirmed - developer must check"
    }
  };
  log.push({ ts: Date.now(), text: `Guide generated for ${guide.appName} - difficulty ${difficulty.level}, ${sources.length} sources`, kind: "done" });
  return guide;
}

module.exports = { investigate };
