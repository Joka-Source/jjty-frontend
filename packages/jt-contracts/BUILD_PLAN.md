# jt build plan v1 — durable, self-correcting

**This file outlives any session.** Any agent — Codex, Claude, whoever — cold-starts from this file plus the repo it sits in. If your session dies, the next one reads this and continues. That is the design.

## 0. How to pick up work (any agent, any time)

1. Read this file, then `orders/README.md` in your repo.
2. Find the lowest-numbered phase with unfinished orders. Claim one by writing `orders/WO-<id>.md` if it doesn't exist (id = next free number).
3. Isolate: `git worktree add ../wo-<id> -b wo/<id>-<slug>`. Never work on main directly.
4. Do the work. Run the verify command. Write `receipts/WO-<id>.md` with verify output pasted verbatim. Commit order + receipt with the work.
5. Merge to main only when verify is green; push. A receipt with pasted verify output is the only proof that counts.
6. Never stop early; never wait for permission the allowlist already grants; blockers may self-resolve to depth 2, beyond that write the blocker into the receipt and take the next order.

## 1. Fixed points (founder rulings — do not re-decide)

- Brand is lowercase **jt**; domain jjty.in. No invented vocabulary anywhere user-facing (banned: Margin-as-name, locus, settle/recede/receipt as UI nouns, sea/drops/shells as product nouns, QR anything).
- Water is **integral** to v1, as interaction physics, not decoration. The first phase is **big** — no stripped-down MVP reframing.
- Platforms now: **Android, iOS, web**. Linux/Pi preserved, later.
- Launch **31 August 2026**. Demo **12 August**. Estimates run at founder speed; never pad with industry priors.
- Voice is the substrate. Zero-click law: after one mic permission, speaking is the interface.
- Open decisions belong to the founder alone (entry mechanism, demo class, pricing, places, atmosphere). If your work hits one, surface it in the receipt and route around it — never default it.

## 2. Phase graph

**P0 — Foundations. DONE 11 Aug (16 receipts, all verified).** Contracts repo (11 schemas), both-platform conformance, iOS estate healed + CI lane + integration branch (165 tests), Android cold-proof, demo v1, website v1, fusion architecture, ops protocol. Receipts live in each repo's `receipts/`.

**P1 — Demo week (now → 12 Aug).** Vision demo page polished; rehearsal; founder demo contract. Exit: demo delivered.

**P2 — The product spine (12 → 20 Aug).** In parallel per repo:
- *Voice engine*: continuous voice → intent over documents in the web app; fuzzy-lattice two-anchor highlighting productionized; common-sense disambiguation layer v0 (rule-based before ML).
- *Android*: WebView shore hosts the voice demo surface; capture service wired to real transcription (sherpa-onnx per fusion doc); contracts records flow through one full act (act → CursorRecord → ReceiptRecord persisted).
- *iOS*: MarginApp renders a real document with voice highlight via MarginEngine; MarginContracts wired into the app's act path.
- *Water layer v0*: one shared interaction-physics module (friction/glide/settle-motion) used by demo + apps. Behavior, not skin.
- *Sync/transport v0*: single-writer + receipts (per fusion doc), device-to-device document send preserving the intention record.
**Exit: one complete act — open, speak, highlight, result with receipt — on Android, iOS, and web.**

**P3 — Release engineering (20 → 29 Aug).** Signing (jsf accounts), store/TestFlight per founder's distribution ruling, rollback drill, support surface, privacy disclosures. Exit: shippable artifact per platform + rollback proven.

**P4 — Launch (29 → 31 Aug).** Founder's distribution class executed. Exit: whatever the founder ruled, truthfully delivered.

**P5 — Post-launch (Sep→).** Firehose-driven priorities (FEATURE_SIGNAL_CONTRACT), speech-to-LaTeX integration, cursor-to-phone togetherness, institutional pilots, OSS adoption order from the fusion doc.

## 3. Self-correction protocol (the plan is falsifiable)

- **Reality wins.** When the plan conflicts with what verify commands show, update the plan, not the receipt.
- Any agent may amend this plan: commit an `orders/PLAN-CHANGE-<n>.md` stating what changed, why, and the evidence; edit BUILD_PLAN.md in the same commit. Founder rulings (§1) may never be amended by agents.
- Weekly re-plan: first agent to work each Monday re-reads all receipts since the last re-plan and reconciles §2 against them, as a PLAN-CHANGE.
- Escalation register: anything needing the founder goes in `orders/FOUNDER-QUEUE.md` (append-only). Check it before starting founder-adjacent work.
- If you find this plan stale beyond repair, do not discard it — write PLAN-CHANGE with the replacement and keep the phase-graph + receipt discipline.

## 4. Repo map

| Repo | Role | Main branch |
|---|---|---|
| jtty (TrueKrishna/jtty) | iOS estate: Margin* packages + contracts | main |
| jtty-civilization (TrueKrishna/jtty-civilization) | Android app | agent/android-launch-integration (working main) |
| jt-contracts | Portable schemas — the wire truth | main |
| jt-demo-voice-highlight | The demo | main |
| jt-website | The website (publishing founder-gated) | main |
| voice-cursor | Voice/PDF experiments + OSS evidence | main |
| jjty-web (Joka-Source/jjty-web) | Supporting web | main |
| qm / qm-deployment | Ops spine | per repo |

Verify commands per repo are in each `orders/README.md`.
