import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <header className="site-header recovery-header">
        <Link className="wordmark" href="/" aria-label="JJTY home">
          JJTY<span aria-hidden="true">.</span>
        </Link>
        <span className="origin">Path unavailable</span>
      </header>

      <main className="not-found" aria-labelledby="not-found-title">
        <p className="eyebrow recovery-eyebrow">404 / Recovery route</p>
        <h1 id="not-found-title">This path is not ready.</h1>
        <p>
          Nothing was downloaded or changed. The launch contract remains available
          from the JJTY home page.
        </p>
        <Link className="button button-primary" href="/">
          Return to JJTY
        </Link>
      </main>
    </>
  );
}
