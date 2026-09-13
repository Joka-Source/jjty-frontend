# Scan engine implementation

Owner: scan task. Branch feat/scan-engine-20260913, base 39baa99. Studio, Android packaging and emulator remain owned by the application task. Native adapter integration must be agreed with that owner.

## Scope and sequence

1. Source-preserving raster correction and quality guidance; deterministic fixtures.
2. Durable scan session, multi-page editing, interruption recovery, actual PDF output.
3. Explicit browser camera lifecycle and file fallback; optional native adapter contracts.
4. Native RGB capture and OCR adapters, optional depth capability inventory, integration handoff.
5. Fixture quality/performance checks, build, full regression, code review and pushed receipt.

Continuous book scanning is the longer-term target described in the founder's LiDAR PDF Scanner Design conversation. RGB captures readable page detail. Depth is optional geometry evidence; no quality or throughput advantage has been measured. Do not equate planar correction with curved-page dewarping. Do not use camera FPS as recovered pages per minute.

## Current API

`createScanSession({store,processor,ocr,id})` produces a session with addPage, editPage, retakePage, removePage, cancel and finish. Input is an upright PNG or JPEG. Edges are ordered top-left, top-right, bottom-right, bottom-left in normalised coordinates. Rotation is clockwise. Processing returns derived bytes and never overwrites source assets.

The store implements async load(id) and atomic save(id,state,expectedRevision). Both supplied stores reject a stale revision; IndexedDB compares and writes within one transaction. MemoryScanStore is explicitly non-durable. The host must retain the checkpoint and every returned sourceAsset, including superseded and removed sources, until a separately authorised cleanup. Successful finish means PDF generation, not library persistence. The Studio owner commits PDF and source custody through its existing store before showing Saved.

Limits: 50 active pages, 25 MB per source image, 150 MB of retained source bytes, 24 million decoded pixels per image. Refuse unsupported formats and excessive allocations. Checkpoint restore checks image digests. OCR unavailable and failed are distinct; sidecar text is not a searchable PDF.

No application/device/production result is implied by module tests. Current test imagery is synthetic. Device latency, camera tuning, thermal behaviour and battery remain unmeasured.

## Primary references inspected

- Apple AVFoundation Capturing depth using the LiDAR camera: https://developer.apple.com/documentation/avfoundation/capturing-depth-using-the-lidar-camera (Markdown source inspected 13 September 2026). Rear LiDAR device lookup and supported video/depth formats are explicit; synchronised video/depth and photo depth are separate output handling. Enabling photo depth depends on configured output support. This does not establish paper OCR improvement.
- Apple VisionKit VNDocumentCameraViewController: https://developer.apple.com/documentation/visionkit/vndocumentcameraviewcontroller . Document camera and DataScanner are different APIs; capability and permission checks are required.

## Honest current limits

No physical phone is assigned to this task. No LiDAR, page-turn tracking, curved-page reconstruction, simultaneous stream compatibility, OCR accuracy, fastest-scanner or energy claim is established. Native integration remains subject to single-writer coordination, not a reason to edit packaging owned by another task.

## Integration handoff

Import `mountScanner` from `packages/jt-scan/ui.js`. Call `await mountScanner({root,onSave,id})`; retain returned `{id,destroy}`. Save the returned id in the host's navigation/session state and supply the same id on reopen. A missing id creates a new scan rather than guessing which previous scan to reopen. Mount is asynchronous; the host must handle invalid/unavailable storage without claiming recovery. Destroy on navigation/unmount releases camera, worker, event listener and preview URL, retaining captured sources.

`onSave(result)` is asynchronous and must resolve `{documentId}` only after committing the library document and source assets atomically. Do not display Saved when PDF generation merely finishes. A rejection leaves checkpoint and edits intact for retry. No checkpoint is deleted automatically after acknowledgement. Host idempotency should use the retained scanner id to avoid duplicate documents if a user deliberately saves the same scan twice.

Result fields: `pdfBytes:Uint8Array`, `title:string`, `mime:'application/pdf'`, `sourceAssets:Array`, `ocr:{status,pages}`, `timings:Array<{stage,pageId?,ms}>`, `diagnostics:Array<{code,pageId?}>`.

Each source asset is structured-cloneable `{id:string,pageId:string,bytes:Uint8Array,mime:'image/png'|'image/jpeg',width:number,height:number,sha256:string,status:'active'|'superseded'|'removed'}`. `sha256` is the lowercase 64-character SHA-256 of the exact encoded source bytes; width/height describe that source, not the corrected output. `pageId` is stable across retakes. Asset id changes on retake. All originals are returned, including removed/superseded assets. Do not hash the derived PDF and label that hash as source custody.

Browser capture uses negotiated video-frame resolution, not full-resolution camera still capture. File input expects upright PNG/JPEG; use rotation review for sideways images. Automatic edges are only a conservative bright-paper-on-dark-background proposal, not a general document detector. Auto capture is opt-in. Native processed-image sources must be labelled as such rather than as raw sensor originals.

Vite integration requires `worker:{format:'es'}` because the raster worker initializes MuPDF using top-level await. `test/scan-build.test.mjs` verifies this production bundle separately; the existing application build does not by itself prove that the new UI entry was integrated.

## Native work, not application proof

`native/ios/ScanCapture.swift` provides a VisionKit coordinator and rear LiDAR capability inventory, with explicit permission/cancel handling and caller-owned checkpoint directory. It returns corrected VisionKit images, not unprocessed sensor frames. Host still needs camera usage description, app wiring and physical testing. Encoding/checkpoint work in its delegate is a baseline to profile, not a measured high-throughput implementation. It does not capture depth maps or reconstruct curved pages.

`native/ios/ScanOCR.swift` uses Vision on an already-upright corrected image and returns text/confidence with normalized top-left-origin bounds. Call it off the UI thread. `OCRFixture.swift` exercises actual macOS Vision on a synthetic English image. That is native OCR execution evidence, not mobile-camera accuracy or integration evidence. JavaScript OCR remains an injected provider; sidecar text is explicitly not embedded/searchable PDF text.

Android native packaging belongs to the application task. Google ML Kit's document scanner is an available optional adapter route: requires Play services' downloaded flow and may incur first-use delay; it does not establish raw-source custody. Reference: https://developers.google.com/ml-kit/vision/doc-scanner/android (inspected 13 September 2026). Browser camera/file fallback remains the independent baseline.

## Measured synthetic benchmark

13 September 2026, arm64 macOS Node 26.7.0, 1000×1000 synthetic RGB page; two warmups and ten measured runs. Raster processing p50 98.9 ms / p95 234.2 ms; PDF generation p50 50.5 ms / p95 306.9 ms; combined measured stages p50 182.2 ms / p95 457.7 ms. End-of-test RSS was 151.3 MB (not peak memory). Results vary with contention. Camera capture, decoding hardware, OCR, library commit, physical heat and battery are not represented. This does not measure recovered pages per minute or real-world readability.

## Verification checkpoint

- Final `node --test --test-concurrency=1 test/scan-*.test.mjs`: 23 passed, zero failed/cancelled, including synthetic Chromium camera, byte custody, recovery, stale writes, RGB correction, worker crash retry, exact image/overlay alignment, save rejection/retry, scanner production bundle and mobile overflow checks.
- Existing application build passed, with existing large-chunk / MuPDF externalization / PDFium URL warnings.
- Existing unit suite: 102 passed. Full shared regression is running under the application owner to avoid fixed-port interference.
- Independent read-only review found worker-retry readiness and overlay alignment defects; both regression tests passed and the reviewer confirmed no remaining browser-baseline handoff blockers.
- Swift 6 iOS-simulator-target typecheck passed with no diagnostics. Actual macOS Vision fixture passed. Neither is an iOS app/camera test.
- Final sequential suite benchmark under concurrent host load: processing p50 157.2 / p95 605.6 ms; PDF p50 81.4 / p95 264.9 ms; total p50 250.9 / p95 687.1 ms; end RSS 165.2 MB. Both runs are retained here to show variability rather than selecting only the faster result.
- No deployment, integrated Studio build, native camera run or physical-device pass is implied.
