# JJTY launch site design

Status: approved by the founder's explicit instruction to choose the strongest canon-derived direction autonomously.

## Purpose

The first `jjty.in` page has one job: make the 31 August 2026 public promise understandable without making a claim that outruns JJTY's evidence. It introduces an Android beta and Linux developer preview, explains the product constitution, and shows how JJTY distinguishes a build from a real-device result.

The page does not collect email, sell hardware, imply an iOS release, present an AI-assistant persona, or advertise capabilities that are still research.

## Product thesis

The lead sentence is: **An operating system that begins with capture, not commands.**

Supporting copy names the concrete launch: a device-owned, offline-first Android beta and Linux developer preview planned for 31 August 2026. Three short constraints sit beside it:

- no screen demanded;
- no silent cloud;
- no claim without a real-device run.

This is the public expression of the canon's capture-first rule, private interior, explicit egress, and evidence tiers. It avoids the refuted screenless-assistant framing.

## Information architecture

The site is a single anonymous route with six sections:

1. **Hero:** JJTY wordmark, launch status, product thesis, concise launch description, and anchors to the launch contract and release scope.
2. **The contract:** four constitutional commitments covering capture, device ownership, honest sensing, and recovery.
3. **What ships:** separate Android beta and Linux developer-preview cards. Each describes the release boundary and labels physical-device evidence as a launch gate rather than a current achievement.
4. **Truth ladder:** `PASS_LOCAL`, `PASS_EMULATOR`, `PASS_DEVICE`, and `PASS_HUMAN` as an accessible ordered sequence, with the rule that evidence must survive the next boundary before the public claim advances.
5. **What remains open:** hardware research and other unverified ambition are named as open work, not launch features.
6. **Launch marker:** the 31 August date, India timezone, and an explicit statement that the immutable tested artifacts—not a rebuild—will be promoted.

The primary action is an in-page link to “Read the launch contract.” The secondary action is “See what ships.” There is no nonfunctional signup control.

## Visual direction

The page uses the visual language of a field ledger beside water: warm uncoated-paper backgrounds, near-black ink, oxidised vermilion for commitments, and deep river blue for evidence. The signature visual is a horizontal “waterline” running through the page: wide, quiet bands and measured tick marks connect the launch promise to the evidence ladder. It is built with CSS, not decorative SVG.

Large editorial serif type carries the thesis; compact monospaced labels carry evidence states, dates, and section numbers. The layout is asymmetric on desktop and becomes one disciplined column on mobile. Borders, stamps, and numbered margins provide the civic/technical character. There are no glass cards, generic gradients, floating blobs, dashboards, or stock imagery.

Motion is limited to a slow waterline drift and a small launch marker transition. Both are disabled under `prefers-reduced-motion`.

## Architecture

The project remains the Sites vinext starter and produces Cloudflare Worker-compatible ESM output. The public route is server rendered. Copy and release facts live in a focused `app/content.ts` module so public claims can be reviewed independently of presentation. `app/page.tsx` owns semantic structure; `app/globals.css` owns the visual system; `app/layout.tsx` owns canonical metadata.

No database, browser storage, authentication, analytics, or remote API is added. The domain is not bound in this branch.

## Accessibility and resilience

- The document uses one `h1`, ordered headings, semantic sections, real anchor links, and a visible skip link.
- Focus is high contrast and never represented by color alone.
- Evidence states include explanatory text, not only status color.
- The layout works at 320 px without horizontal scrolling.
- Motion is optional and reduced-motion safe.
- The page remains useful with CSS or JavaScript unavailable because the core content is server rendered.

## Verification

A rendered-HTML contract test is written first and observed failing against the starter. It verifies the route status, title, single main heading, launch date, Android and Linux scope, constitution anchors, evidence vocabulary, and absence of the starter preview marker. Production implementation then makes that test pass. Final gates are the rendered test, lint, and production build.

## Publishing boundary

The source is eligible for an isolated private Sites preview after a successful build. `jjty.in` production binding, DNS changes, public deployment, download links, and release artifact links are out of scope until GoDaddy KYC/DNS and artifact evidence gates are complete.
