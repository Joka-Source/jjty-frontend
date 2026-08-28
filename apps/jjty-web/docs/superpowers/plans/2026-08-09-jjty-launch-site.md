# JJTY Launch Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and privately preview the truthful, production-quality first `jjty.in` launch page for the 31 August 2026 Android beta and Linux developer preview.

**Architecture:** Keep the Sites vinext starter as a one-route server-rendered site. Separate reviewable public claims in `app/content.ts`, semantic presentation in `app/page.tsx`, visual identity in `app/globals.css`, and canonical metadata in `app/layout.tsx`; add no persistence, authentication, analytics, or runtime API.

**Tech Stack:** TypeScript, React 19, Next-compatible vinext, CSS, Node test runner, Cloudflare Workers/Sites.

## Global Constraints

- Correct product spelling is `JJTY`; public domain is `jjty.in`.
- Public launch date is 31 August 2026 in India time.
- The launch is an Android beta and Linux developer preview, not the completed civilizational ambition.
- Capture-first, never command-first.
- No screen demanded, never no screen available.
- Local/offline behavior is primary; cloud enhancement is explicit and never a silent fallback.
- Public claims advance only with real runtime evidence at the named tier.
- Do not expose credentials, private identifiers, raw private content, or secret values.
- Do not bind the production domain or publish publicly while GoDaddy KYC/DNS remains blocked.
- Use no model-authored SVG illustration, generic AI aesthetic, screenless-assistant persona, nonfunctional signup, or unsupported capability claim.

---

### Task 1: Rendered launch contract

**Files:**
- Modify: `tests/rendered-html.test.mjs`
- Create: `app/content.ts`
- Create: `app/page.tsx`
- Create: `app/layout.tsx`

**Interfaces:**
- Consumes: vinext Worker render contract at `dist/server/index.js`.
- Produces: `launch`, `principles`, `releases`, and `evidenceTiers` readonly content exports; a server-rendered `/` route.

- [ ] **Step 1: Replace the starter assertions with a failing public-contract test**

  Assert a 200 HTML response; title `JJTY — capture, not commands`; one `h1`; exact launch date; Android beta; Linux developer preview; `PASS_LOCAL`, `PASS_EMULATOR`, `PASS_DEVICE`, and `PASS_HUMAN`; `#contract` and `#releases` anchors; and absence of `codex-preview`, `Codex is working`, `screenless assistant`, and a signup form.

- [ ] **Step 2: Run the test to verify RED**

  Run: `npm test`

  Expected: FAIL because the starter route still renders the temporary loading skeleton and does not contain the JJTY contract.

- [ ] **Step 3: Add minimal reviewable content and semantic route**

  Create literal readonly content values in `app/content.ts`. Create `app/page.tsx` with a skip link, `header`, `main`, semantic sections, ordered evidence list, launch-gate copy, and footer. Create `app/layout.tsx` with the site title, description, canonical `https://jjty.in`, Open Graph text metadata without an image, and the finished `html`/`body` shell.

- [ ] **Step 4: Run the test to verify GREEN**

  Run: `npm test`

  Expected: PASS with the exact production contract server rendered.

### Task 2: Distinctive responsive visual system

**Files:**
- Create: `app/globals.css`
- Delete: `app/_sites-preview/SkeletonPreview.tsx`
- Delete: `app/_sites-preview/preview.css`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `public/favicon.svg`

**Interfaces:**
- Consumes: semantic class names and section IDs from Task 1.
- Produces: warm-paper/ink/river/vermillion visual system, responsive layout, focus treatment, optional waterline motion, and a JJTY favicon.

- [ ] **Step 1: Add CSS behavior expectations to the rendered contract test**

  Assert the rendered HTML references a stylesheet and that production HTML contains a skip-link target plus structured evidence list. The realistic regression caught is removal of the accessible navigation path or status hierarchy while restyling.

- [ ] **Step 2: Run the test to verify RED**

  Run: `npm test`

  Expected: FAIL until the page exposes the required skip target and ordered evidence structure.

- [ ] **Step 3: Implement the visual system and remove starter infrastructure**

  Add responsive CSS with editorial serif display type, monospaced evidence labels, asymmetric desktop grid, 320 px single-column behavior, visible focus, high contrast, and `prefers-reduced-motion`. Remove the starter preview component/imports and `react-loading-skeleton`; refresh the lockfile. Replace the generic favicon with a compact text/geometry mark that does not act as an illustration.

- [ ] **Step 4: Run test and lint**

  Run: `npm test && npm run lint`

  Expected: PASS with no ESLint errors.

### Task 3: Production and private-preview handoff

**Files:**
- Modify: `.openai/hosting.json` only if the Sites service returns a `project_id`.
- Create: deployment archive outside the repository via the Sites package helper.

**Interfaces:**
- Consumes: successful production build and exact Git commit SHA.
- Produces: pushed feature branch and, if available without public exposure, an isolated private Sites deployment URL.

- [ ] **Step 1: Run the final production gates**

  Run: `npm test && npm run lint && npm run build`

  Expected: all commands exit 0 and `dist/server/index.js` exists.

- [ ] **Step 2: Commit and push the exact validated source**

  Commit on `feat/launch-site-2026-08-31` with a focused message, push to `Joka-Source/jjty-web`, and record the branch-head SHA.

- [ ] **Step 3: Attempt only private Sites publication**

  Create or reuse the Sites project, persist only `project_id`, package with `package-site.sh`, save one version, deploy with the private deployment operation, and poll to a terminal status. If only a public/shared operation exists, stop without calling it.

- [ ] **Step 4: Verify handoff boundary**

  Confirm no production domain binding or DNS mutation occurred. Report the private URL when deployment succeeds; otherwise report the exact private-deployment blocker and preserve the pushed branch and package-ready build.
