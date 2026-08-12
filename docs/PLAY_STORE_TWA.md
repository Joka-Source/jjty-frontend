# Play Store handoff — jt as a Trusted Web Activity

This is the packaging runbook, not a claim that an Android release exists.
Run it only after the production PWA URL is live over HTTPS and the founder
has supplied the marked identity and signing decisions.

Primary references:

- [Trusted Web Activity quick start](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)
- [Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap/blob/main/packages/cli/README.md)
- [Digital Asset Links for a TWA](https://developer.chrome.com/docs/android/trusted-web-activity/android-for-web-devs)
- [Google Play target API requirements](https://developer.android.com/google/play/requirements/target-sdk)

## 1. Founder-controlled inputs

Do not guess, generate, commit, or paste any secret value into this repository.

- **[FOUNDER KEY] Production origin** that serves jt and
  `/manifest.webmanifest` over HTTPS.
- **[FOUNDER KEY] Android application ID / Play package name.** It is permanent
  after publication. Record the approved value in the Android packaging repo,
  not in this PWA repo until approved.
- **[FOUNDER KEY] Play Console developer account and verified developer
  identity.**
- **[FOUNDER KEY] Upload keystore path, key alias, passwords, distinguished
  name, backup location, and recovery owner.** Keep these in the founder's
  approved credential and backup surfaces; never commit a keystore or password.
- **[FOUNDER KEY] Play App Signing decision** and custody record for the upload
  key.
- **[FOUNDER KEY] Store listing, support contact, privacy policy URL, data
  safety answers, content rating, countries, pricing, testers, and release
  approval.**

The repository already fixes the product-facing PWA values: name `jt`,
standalone display, and the lowercase maskable 192/512 icons.

## 2. Verify the deployed PWA

Replace `<JT_ORIGIN>` only with the approved production HTTPS origin.

```bash
curl --fail --show-error --location <JT_ORIGIN>/manifest.webmanifest
curl --fail --show-error --location <JT_ORIGIN>/icons/jt-512.png --output /tmp/jt-512.png
```

Open the site once in Chrome, install it from the browser, then switch the
device offline and reopen a stored document. The web e2e in this repository
proves the same behavior against the production build; this step proves the
deployed origin and CDN configuration.

## 3. Install Bubblewrap and initialize a separate Android project

Keep generated Android/Gradle output in its own repository or sibling worktree;
do not mix signing configuration into `jt-web`.

```bash
npm install --global @bubblewrap/cli
mkdir jt-twa
cd jt-twa
bubblewrap init --manifest=<JT_ORIGIN>/manifest.webmanifest
```

During `init`:

1. Confirm the manifest URL and host exactly match the approved production
   origin.
2. Enter the **[FOUNDER KEY] approved application ID**.
3. Keep the app and launcher name `jt` unless the founder approves another
   store-facing name.
4. Use the manifest's 512px icon and inspect the generated adaptive/maskable
   result.
5. Point signing at the **[FOUNDER KEY] approved upload keystore and alias**.
   If Bubblewrap creates a key, immediately move it into approved custody,
   back it up, and record its recovery owner before using it for a release.
6. Review `twa-manifest.json` before building. It may contain key paths and
   package identity; it must never contain passwords.

## 4. Build installable artifacts

```bash
bubblewrap build
```

Bubblewrap produces a signed test APK (`app-release-signed.apk`) and a signed
Play App Bundle (`app-release-bundle.aab`). It prompts for keystore passwords;
for controlled CI it also supports `BUBBLEWRAP_KEYSTORE_PASSWORD` and
`BUBBLEWRAP_KEY_PASSWORD`. Those variables are **[FOUNDER KEY] secrets** and
belong only in the approved CI secret store.

For submissions on or after 31 August 2026, new apps and app updates must
target Android 16 / API 36 or higher. Inspect the generated Android project
and resulting manifest before upload; update Bubblewrap/Android build tooling
if it emits a lower target.

## 5. Bind the Android package to the website

Get the local APK/upload-key fingerprint:

```bash
keytool -printcert -jarfile app-release-signed.apk | grep SHA256
```

Create this file at `<JT_ORIGIN>/.well-known/assetlinks.json` using only real,
verified values:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "<FOUNDER_APPROVED_APPLICATION_ID>",
      "sha256_cert_fingerprints": [
        "<LOCAL_UPLOAD_CERT_SHA256>",
        "<PLAY_APP_SIGNING_CERT_SHA256>"
      ]
    }
  }
]
```

- **[FOUNDER KEY] Package name and both fingerprints require readback against
  the approved Android project and Play Console.**
- The local APK uses the upload/local certificate. An app installed from
  Google Play uses Play's app-signing certificate; the values are commonly
  different.
- Before public release, fetch the file from the public origin and confirm a
  direct successful JSON response with no authentication or HTML fallback.

## 6. Device verification before Play upload

With an authorized Android device connected:

```bash
bubblewrap install
adb logcat -c
adb shell monkey -p <FOUNDER_APPROVED_APPLICATION_ID> 1
adb logcat -v brief | grep -e TWAProviderPicker -e OriginVerifier -e digital_asset_links
```

Verify and record separately:

1. The installed package and certificate fingerprint match the intended local
   artifact.
2. The app opens as a Trusted Web Activity with no browser URL bar. A URL bar
   means verification fell back to a Custom Tab; fix Digital Asset Links before
   continuing.
3. Online first launch, document creation, reload, microphone choice, install
   surface, and an offline reopen of the stored document.
4. Back, share, external-link, rotation, process-death, and upgrade behavior.
5. The exact APK/AAB SHA-256, Git SHA of this PWA, deployed web version, device,
   browser/provider, Android version, time, and redacted logs.

## 7. Play Console sequence

1. Create the app with the **[FOUNDER KEY] permanent package identity**.
2. Configure **[FOUNDER KEY] Play App Signing** and upload the AAB to Internal
   testing first.
3. Copy the Play **app-signing certificate** SHA-256 from Play Console, add it
   to `assetlinks.json`, deploy, and verify the public file.
4. Install the Internal-test build from Google Play and repeat the TWA/no-URL-
   bar and offline-document journey. Local APK proof is not Play-distributed
   proof.
5. Complete the **[FOUNDER KEY] listing, policy, data safety, content rating,
   tester, territory, and release forms**.
6. Confirm target API 36+, version code/name, signing identity, AAB hash,
   rollout track, and rollback owner.
7. Release beyond Internal testing only with **[FOUNDER KEY] explicit founder
   approval** and preserve the Play artifact/version evidence.

## 8. Update boundaries

- Web-only code/content changes ship through the approved jt web deployment;
  the TWA loads the production origin.
- Changes to package identity, Android permissions, icons, splash behavior,
  shortcuts, target SDK, or wrapper dependencies require a new Android bundle
  with an incremented version code and a fresh device/Play test.
- A green PWA build is not a signed Android artifact; a local signed APK is not
  a Play-signed install; an Internal-test install is not a public release.
