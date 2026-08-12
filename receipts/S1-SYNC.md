# Delivery record — S1-SYNC (Moment-send v0)

Date: 2026-08-12. Repo `/Users/apple/projects/jt-sync`, branch `wo/s1-sync`.

## Verify: full test suite

Command:

```sh
cd /Users/apple/projects/jt-sync && npm test
```

Output (verbatim):

```
> jt-sync@0.1.0 test
> node --test --import tsx test/*.test.ts

✔ append acknowledges with a delivery record whose hash covers the full envelope (6.259833ms)
✔ file store is JSON-lines and enforces single-writer discipline (2.388791ms)
✔ relay pairs the two devices (157.239459ms)
✔ three moments A->B arrive verified, in order, hashes proven end-to-end (6.496458ms)
✔ B reconstructs the intention record intact and schema-valid (27.585584ms)
✔ tampered envelope is rejected and never enters B's log (2.922375ms)
✔ out-of-order replay is rejected (0.807875ms)
✔ golden fixtures validate (sanity: we read the schemas the contracts repo means) (2.885625ms)
✔ moment envelope's CursorRecord conforms to jt-contracts/cursor (0.2525ms)
✔ moment envelope's ReceiptRecord conforms to jt-contracts/receipt (0.109667ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 397.88725
```

## Verify: typecheck

Command:

```sh
cd /Users/apple/projects/jt-sync && npx tsc --noEmit && echo TYPECHECK_OK
```

Output (verbatim):

```
TYPECHECK_OK
```

## Verify: banned vocabulary sweep

Command:

```sh
cd /Users/apple/projects/jt-sync && grep -rniE "margin|locus|settle|recede|qr|shell|drops|\bsea\b" src/ test/ README.md
```

Output (verbatim):

```
test/helpers.ts:35:      { at: "2026-08-12T10:00:06Z", event: "person confirmed (settlement)" },
src/envelope.ts:21:  | "settlement"
```

Ruling applied: both hits are the `settlement` lifecycle state, an enum value
mandated by the jt-contracts cursor schema's shared state machine —
wire-internal contract vocabulary, not user-facing UI copy. No QR anywhere;
pairing is by three spoken words (e.g. `maple-otter-quill`).

## What the round-trip proves

- Relay runs as a separate OS process; clients connect over localhost WebSocket.
- Pairing by spoken word code, validated against the 64-word list.
- 3 moments A→B; moment 3 carries a full 10-state cursor lifecycle history.
- For every moment: receiver recomputes SHA-256 over the canonical full
  envelope and it equals the sender's hash — what arrived is what was sent,
  intention record intact.
- B's log ordering matches sender sequence (0,1,2); stored envelopes
  independently re-hash to their stored hashes.
- The arrived CursorRecord is byte-identical to the sent one and still
  validates against `jt-contracts/schemas/cursor.schema.json`.
- A tampered envelope (intention rewritten after hashing) is rejected with
  `content hash mismatch` and never enters the log.
- A replayed stale sequence number is rejected with `out of order`.

## Blockers

- Depth-1, self-resolved: order pointed at `jt-contracts/contracts/`; the
  schemas actually live at `jt-contracts/schemas/`. No other blockers.
