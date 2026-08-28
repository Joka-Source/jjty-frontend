# JJTY web

The public launch surface for [jjty.in](https://jjty.in). It states the evidence-backed 31 August 2026 launch contract for the JJTY Android beta and Linux developer preview.

This repository contains public presentation and reviewable launch claims. Product source, operating-system builds, infrastructure, and the canonical decision ledger remain in their own release boundaries.

## Local development

Requires Node.js `>=22.13.0`.

```bash
npm ci
npm run dev
```

## Verification

```bash
npm test
npm run lint
npm run build
```

`npm test` builds the Cloudflare Worker-compatible site and verifies its rendered public contract and metadata. The site intentionally has no account, database, analytics, signup form, or release download until those surfaces have an approved owner and evidence boundary.

## Publishing boundary

Preview and production are separate promotions. Do not bind `jjty.in` or expose download URLs until DNS ownership, signed artifact, device-run, rollback, accessibility, and recovery gates are complete. Production promotes the exact immutable candidate that passed; it is never rebuilt ad hoc.

The implementation and design records live under `docs/superpowers/`.
