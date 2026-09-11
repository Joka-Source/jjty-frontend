# Synthetic failure traces

JETT retains a Playwright trace for one controlled, synthetic browser failure.
This proves the diagnostic path without recording an account, a private
document or a pilot user's session.

Run:

```sh
npm run test:failure-trace
```

The test runs the same home-shell journey twice:

1. The passing run stops tracing without writing a file.
2. The probe run asks for an intentionally absent diagnostic target. That
   assertion fails, so the runner writes `trace.zip`.
3. The browser context allows only HTTP requests to `127.0.0.1` or `localhost`
   plus inline `data:` resources; any external request is aborted.
4. The verifier rejects absolute and parent-relative ZIP members, scans every
   member for credential-shaped Bearer, GitHub, Slack, AWS and private-key
   values, and writes `receipt.json` only after the scan passes.

Local output is under `.artifacts/failure-trace-test/` and is ignored by Git.
CI uploads the directory for 14 days under a commit-specific artifact name.
Open a downloaded trace with:

```sh
npx playwright-core show-trace trace.zip
```

The receipt binds the archive with SHA-256, byte count and member count. The
trace is evidence that the browser journey and diagnostic capture ran. It is
not evidence of a deployed build, a real account, a physical device or a
screen-reader pass.

Do not point this runner at authenticated or private content. A future pilot
capture needs explicit masking, input review, retention and deletion rules
before it can use the same mechanism.
