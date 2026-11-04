# OAuth Setup Guide

Know what you're in for before you build an OAuth integration.

If you've built anything that connects to Google, Slack or Shopify, you've lived
this: the OAuth dance itself is an afternoon, but nobody can tell you whether
the provider's approval process takes two days or two months. You find out by
doing it. This tool exists so you can find out *before* doing it.

## What it does

- **A guide library.** Hand-researched setup guides for a handful of
  representative providers, chosen to span the whole spectrum - GitHub (no
  review at all) through Slack and Notion (review only if you distribute
  publicly) to Google (mandatory verification, demo video, the works). The
  product vision is a library of 100 apps; the take-home ships five varied
  ones, which is what the brief asks for.
- **A live investigator.** Type any app name or paste its website. An agent
  goes and reads that provider's actual developer documentation - it resolves
  the domain, finds the docs, fetches the OAuth pages, looks for review and
  verification requirements - and writes a guide in real time, for apps that
  aren't in the library at all. You watch it work in a live activity log.
- **Guides you can share.** Every generated guide gets a stable link you can
  send to a teammate.

Every guide answers the questions a developer actually has:

- How hard is this, and why?
- How long will setup take, and how long is the approval wait?
- What do I need before I start (accounts, domains, privacy policies, videos)?
- What will bite me? (the gotchas section)
- What can the agent do for me, and where do I have to take over?

## Honesty is a feature, not a disclaimer

The brief asks for sound judgment about evidence, so it's built into the data
model rather than bolted on. Every claim in every guide carries one of four
labels:

| Label | Meaning |
|---|---|
| `fetched` | Confirmed on a page the agent fetched live during this run |
| `curated` | Researched provider knowledge shipped with the tool |
| `inferred` | The agent's own conclusion from combined signals |
| `unverified` | Not confirmed - check it yourself before relying on it |

Each guide also ends with two plain lists: **what was tested** and **what stays
uncertain**. When the investigator is working on a provider outside the
curated knowledge base with thin live evidence, the guide says so up front
with a low-confidence banner instead of pretending to be sure.

What the tool does *not* do: it never creates a real OAuth app on your behalf,
never signs up for anything, and never submits anything to a provider's review.
Those steps need your accounts and your judgment - the guides say exactly
where you take over.

## Running it

You need Node.js 18 or later. Nothing else - there are zero npm dependencies,
on purpose (see Decisions below).

```bash
node server.js
# open http://localhost:3000
```

Set `PORT` to change the port. That's the whole setup.

## Demo

[![Watch the demo](docs/demo-poster.png)](docs/demo.mp4)

A 52-second run of the real thing: the library, a hand-researched guide, and a
live investigation for Spotify (an app outside the library) generating its
guide from documentation fetched on the spot. Click the image - GitHub's file
page plays the video inline.

## How it's built

![System design](docs/architecture.png)

([interactive version](docs/architecture.html) - self-contained HTML, opens in
any browser)

The whole thing is one small Node.js process with zero npm dependencies:

```
server.js            HTTP server: serves the UI, runs investigation jobs, stores guides
lib/investigator.js  the agent - domain resolution, docs discovery, fetching, signal extraction
lib/knowledge.js     curated knowledge base for well-known providers
lib/guideStore.js    JSON-file storage (library guides + live-generated guides)
guides/              the hand-researched library guides (JSON)
public/index.html    the entire frontend - no build step
docs/                the system-design diagram above (PNG + self-contained HTML)
data/generated/      where live-generated guides are saved (gitignored)
```

An investigation is a background job. `POST /api/investigate` starts one and
returns a job id; the UI polls `GET /api/jobs/:id` and streams the agent's
activity log to the screen as it happens. The agent resolves the app's domain,
finds its developer documentation (guessed doc hosts, links mined from the
homepage, a search-engine fallback, and a second hop for developer portals
that render as JavaScript shells), fetches the OAuth pages, and pulls out the
signals that matter: app registration, redirect URIs, scopes, PKCE, review
and verification requirements, stated approval timelines. For well-known
providers it also merges a hand-researched knowledge-base entry, labeled
separately so live evidence and curated facts never blur together. Finished
guides are saved to disk and served at `/g/:id`, so a shared link survives a
restart.

## Key decisions

- **A deterministic investigation agent instead of an LLM-only one.** The
  agent's job here is legwork - find the docs, read them, extract what
  matters, cite it. Doing that deterministically means every claim can carry
  a real source URL and a real evidence label, and the tool runs with no API
  keys, no cost, and no way to hallucinate a requirement that isn't on the
  page. Where the agent concludes something rather than reads it, the claim
  is labeled `inferred`.
- **Curated knowledge and live evidence are kept separate.** For providers I
  researched by hand, the guide says `curated`. For things the agent just
  fetched, it says `fetched`. Mixing them silently would make the tool look
  more reliable than it is.
- **Zero dependencies.** `node server.js` should just work on any machine
  with Node 18+. No install step, no lockfile, nothing to audit.
- **Difficulty is scored from evidence, not vibes.** Verification requirement
  found? That's the biggest weight. Review only for public distribution?
  Smaller. The rationale list shows the working.

## Limitations

- The agent reads documentation; it does not execute real registrations, so
  approval wait times come from provider docs and researched knowledge -
  estimates, never measurements. Guides say this plainly.
- Web search during investigation depends on public search endpoints that
  sometimes rate-limit or challenge bots; when that happens the agent falls
  back to direct docs discovery and says so in the log.
- JavaScript-heavy docs sites sometimes render too little text to extract
  signals from; the low-confidence banner exists for exactly this case.
- The library is five providers deep by design (the brief asks for a few
  varied examples, not all 100). The investigator covers the rest.
- No LLM key is required or used; if you wanted one, the natural place to add
  it is the guide-composition step in `lib/investigator.js`, with every
  LLM-written claim still carrying an evidence label.

## What I verified before shipping this

- `node server.js` starts clean and serves the UI, the library and the API.
- Live investigations were run end-to-end for providers inside the curated
  base (Linear) and outside it (Todoist, Figma), including domain resolution
  from a bare name and from a pasted URL.
- Generated guides persist to disk and their share links work after a restart.

Built by Meda Anilkumar as a take-home assignment for Composio's APM
(Integrations) role.
