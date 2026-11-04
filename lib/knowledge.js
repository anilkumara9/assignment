// Curated knowledge base for well-known OAuth providers.
// Every entry is labeled evidence:"curated" - it comes from researched provider
// documentation, NOT from a live fetch during the current run. Guides surface
// this distinction explicitly; the live investigator still fetches each
// provider's docs to confirm/refresh, and those results are labeled "fetched".
// waitDays: [min, max] business-day estimate for approval/review, null if unknown.

const KB = {
  "google.com": {
    name: "Google",
    console: { url: "https://console.cloud.google.com/apis/credentials", label: "Google Cloud Console > APIs & Services > Credentials", evidence: "curated" },
    docs: [
      "https://developers.google.com/identity/protocols/oauth2",
      "https://support.google.com/cloud/answer/10311615",
      "https://developers.google.com/terms/api-services-user-data-policy"
    ],
    oauth: true,
    verification: "required-for-sensitive-scopes",
    waitDays: [3, 42],
    facts: [
      { text: "Apps requesting sensitive or restricted scopes must go through OAuth app verification before they can serve unauthenticated users without an 'unverified app' warning.", evidence: "curated", source: "https://support.google.com/cloud/answer/10311615" },
      { text: "While unverified, the consent screen shows a warning and the app is capped at 100 test users.", evidence: "curated", source: "https://support.google.com/cloud/answer/10311615" },
      { text: "Restricted scopes (e.g. Gmail read) additionally require a third-party security assessment, which can take weeks and may cost money.", evidence: "curated", source: "https://developers.google.com/terms/api-services-user-data-policy" },
      { text: "Publishing status starts as 'Testing'; moving to 'In production' triggers the verification review.", evidence: "curated", source: "https://console.cloud.google.com/apis/credentials/consent" }
    ],
    gotchas: [
      { text: "Verification requires a public privacy policy URL and a homepage URL on an owned domain.", evidence: "curated" },
      { text: "Scope changes after verification can require re-verification.", evidence: "curated" },
      { text: "Test-user refresh tokens expire after 7 days while the app is in Testing status.", evidence: "curated" }
    ]
  },
  "slack.com": {
    name: "Slack",
    console: { url: "https://api.slack.com/apps", label: "api.slack.com/apps > Create New App", evidence: "curated" },
    docs: ["https://docs.slack.dev/authentication/", "https://docs.slack.dev/app-review/"],
    oauth: true,
    verification: "review-only-for-distribution",
    waitDays: [3, 10],
    facts: [
      { text: "A Slack app works immediately inside the workspace that created it; no review needed for single-workspace use.", evidence: "curated", source: "https://docs.slack.dev/authentication/" },
      { text: "Public distribution (install by other workspaces) requires Slack Marketplace app review, typically days to about two weeks.", evidence: "curated", source: "https://docs.slack.dev/app-review/" },
      { text: "Slack distinguishes bot scopes from user scopes; over-scoping is the most common review rejection.", evidence: "curated", source: "https://docs.slack.dev/app-review/" }
    ],
    gotchas: [
      { text: "Request only the scopes you use; reviewers ask you to justify each one.", evidence: "curated" },
      { text: "Redirect URLs must be HTTPS and pre-registered on the app's OAuth settings page.", evidence: "curated" }
    ]
  },
  "github.com": {
    name: "GitHub",
    console: { url: "https://github.com/settings/developers", label: "GitHub > Settings > Developer settings > OAuth Apps", evidence: "curated" },
    docs: ["https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app"],
    oauth: true,
    verification: "none",
    waitDays: [0, 0],
    facts: [
      { text: "OAuth Apps work immediately after creation with any GitHub user; there is no approval or review gate.", evidence: "curated", source: "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app" },
      { text: "Unverified OAuth apps are rate-limited to 50 authorized users per hour until the app is verified by an organization or listed on Marketplace.", evidence: "curated", source: "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/rate-limits-for-oauth-apps" }
    ],
    gotchas: [
      { text: "An OAuth App acts as the user; if you need the app to act as itself, build a GitHub App instead - a different flow.", evidence: "curated" }
    ]
  },
  "notion.so": {
    name: "Notion",
    console: { url: "https://www.notion.so/profile/integrations", label: "Notion > Settings > Connections > Develop or manage integrations", evidence: "curated" },
    docs: ["https://developers.notion.com/docs/authorization", "https://developers.notion.com/docs/integration-security-review"],
    oauth: true,
    verification: "review-only-for-public",
    waitDays: [1, 7],
    facts: [
      { text: "Internal integrations work instantly with no review; public integrations (OAuth, installable by anyone) require Notion's security review before publication.", evidence: "curated", source: "https://developers.notion.com/docs/integration-security-review" },
      { text: "A public integration needs a privacy policy, terms URL, and support contact before it can be submitted for review.", evidence: "curated", source: "https://developers.notion.com/docs/integration-security-review" }
    ],
    gotchas: [
      { text: "Notion uses capability checkboxes (read/insert/update content) instead of granular OAuth scopes.", evidence: "curated" }
    ]
  },
  "shopify.com": {
    name: "Shopify",
    console: { url: "https://partners.shopify.com/", label: "Shopify Partner Dashboard > Apps > Create app", evidence: "curated" },
    docs: ["https://shopify.dev/docs/apps/build/authentication-authorization", "https://shopify.dev/docs/apps/launch/app-requirements"],
    oauth: true,
    verification: "review-only-for-public",
    waitDays: [5, 15],
    facts: [
      { text: "Custom apps on a single store need no review. Public App Store apps must pass Shopify's app review against a published requirements checklist.", evidence: "curated", source: "https://shopify.dev/docs/apps/launch/app-requirements" },
      { text: "Review requires a working demo store, screencast, listing content, and compliance with billing API rules for paid apps.", evidence: "curated", source: "https://shopify.dev/docs/apps/launch/app-requirements" }
    ],
    gotchas: [
      { text: "Protected customer data access needs a separate data-protection application on top of app review.", evidence: "curated" }
    ]
  },
  "hubspot.com": {
    name: "HubSpot",
    console: { url: "https://developers.hubspot.com/", label: "HubSpot Developer Account > Apps", evidence: "curated" },
    docs: ["https://developers.hubspot.com/docs/api/working-with-oauth", "https://developers.hubspot.com/docs/api/creating-an-app"],
    oauth: true,
    verification: "review-only-for-marketplace",
    waitDays: [5, 20],
    facts: [
      { text: "Apps install via OAuth immediately on any portal with the install URL; listing on the HubSpot Marketplace triggers a separate review.", evidence: "curated", source: "https://developers.hubspot.com/docs/api/working-with-oauth" }
    ],
    gotchas: [
      { text: "Access tokens expire in 30 minutes; refresh-token handling is mandatory from day one.", evidence: "curated" }
    ]
  },
  "atlassian.com": {
    name: "Atlassian (Jira/Confluence)",
    console: { url: "https://developer.atlassian.com/console/myapps/", label: "developer.atlassian.com > My apps", evidence: "curated" },
    docs: ["https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/"],
    oauth: true,
    verification: "self-declared",
    waitDays: [0, 3],
    facts: [
      { text: "OAuth 2.0 (3LO) apps work after enabling distribution in the developer console; listing on the Marketplace has a separate review.", evidence: "curated", source: "https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/" }
    ],
    gotchas: [
      { text: "Scopes are granular per-product (Jira vs Confluence); classic vs granular scopes are configured in different places.", evidence: "curated" }
    ]
  },
  "linear.app": {
    name: "Linear",
    console: { url: "https://linear.app/settings/api", label: "Linear > Settings > API > OAuth applications", evidence: "curated" },
    docs: ["https://linear.app/developers/oauth"],
    oauth: true,
    verification: "none",
    waitDays: [0, 0],
    facts: [
      { text: "OAuth applications are created from workspace settings and work immediately; no review gate.", evidence: "curated", source: "https://linear.app/developers/oauth" }
    ],
    gotchas: []
  },
  "vercel.com": {
    name: "Vercel",
    console: { url: "https://vercel.com/dashboard/integrations/console", label: "Vercel > Integrations Console", evidence: "curated" },
    docs: ["https://vercel.com/docs/integrations"],
    oauth: true,
    verification: "review-only-for-marketplace",
    waitDays: [3, 10],
    facts: [
      { text: "Integrations can be installed via OAuth immediately; publishing to the Vercel Marketplace requires review.", evidence: "curated", source: "https://vercel.com/docs/integrations" }
    ],
    gotchas: []
  },
  "airtable.com": {
    name: "Airtable",
    console: { url: "https://airtable.com/create/oauth", label: "airtable.com/create/oauth", evidence: "curated" },
    docs: ["https://airtable.com/developers/web/api/oauth-reference"],
    oauth: true,
    verification: "review-only-for-public",
    waitDays: [3, 10],
    facts: [
      { text: "OAuth integrations start in development mode for the creator's own bases; public distribution requires Airtable review.", evidence: "curated", source: "https://airtable.com/developers/web/api/oauth-reference" }
    ],
    gotchas: [{ text: "PKCE is required for Airtable OAuth.", evidence: "curated" }]
  }
};

// Aliases: product/domain variants -> canonical KB key
const ALIASES = {
  "google": "google.com", "gmail.com": "google.com", "googleapis.com": "google.com", "google.dev": "google.com",
  "slack": "slack.com", "slack.dev": "slack.com",
  "github": "github.com", "github.dev": "github.com",
  "notion": "notion.so", "notion.com": "notion.so",
  "shopify": "shopify.com", "myshopify.com": "shopify.com",
  "hubspot": "hubspot.com",
  "atlassian": "atlassian.com", "jira.com": "atlassian.com",
  "linear": "linear.app", "vercel": "vercel.com", "airtable": "airtable.com"
};

function lookup(domain, name) {
  if (!domain && !name) return null;
  const d = (domain || "").toLowerCase().replace(/^www\./, "");
  const n = (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (KB[d]) return KB[d];
  if (ALIASES[d] && KB[ALIASES[d]]) return KB[ALIASES[d]];
  if (n && ALIASES[n] && KB[ALIASES[n]]) return KB[ALIASES[n]];
  // suffix match (e.g. developers.google.com -> google.com)
  for (const key of Object.keys(KB)) {
    if (d === key || d.endsWith("." + key)) return KB[key];
  }
  return null;
}

module.exports = { KB, lookup };
