import {
  evidenceTiers,
  launch,
  openWork,
  principles,
  releases,
} from "./content";

function SectionLabel({ number, children }: { number: string; children: React.ReactNode }) {
  return (
    <div className="section-label" aria-hidden="true">
      <span>{number}</span>
      <span>{children}</span>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="JJTY home">
          JJTY<span aria-hidden="true">.</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#contract">Contract</a>
          <a href="#releases">Releases</a>
          <a href="#evidence">Evidence</a>
        </nav>
        <span className="origin">Building in India</span>
      </header>

      <main id="main-content">
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">
                Public preview <span aria-hidden="true">·</span>{" "}
                <time dateTime={launch.dateTime}>{launch.date}</time>
              </p>
              <h1 id="hero-title">
                An operating system that begins with <em>capture</em>, not commands.
              </h1>
              <p className="hero-lede">
                JJTY is building a device-owned, offline-first Android beta and Linux developer preview. The first release is a promise we can test—not a finished civilization in miniature.
              </p>
              <div className="hero-actions" aria-label="Page sections">
                <a className="button button-primary" href="#contract">
                  Read the launch contract
                </a>
                <a className="button button-secondary" href="#releases">
                  See what ships
                </a>
              </div>
            </div>

            <aside className="launch-stamp" aria-label="Launch scope">
              <span className="stamp-kicker">Launch contract</span>
              <strong>31 / 08 / 26</strong>
              <span>{launch.scope}</span>
              <span>{launch.timezone}</span>
            </aside>
          </div>

          <div className="waterline" aria-label="Private interior and explicit sharing">
            <div className="waterline-copy waterline-private">
              <span>Private interior</span>
              <strong>Yours by default</strong>
            </div>
            <div className="jetty" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="waterline-copy waterline-egress">
              <span>Explicit egress</span>
              <strong>Shared by an act</strong>
            </div>
          </div>

          <ul className="hero-rules" aria-label="Founding constraints">
            <li>No screen demanded.</li>
            <li>No silent cloud.</li>
            <li>No claim without a real-device run.</li>
          </ul>
        </section>

        <section className="section contract" id="contract" aria-labelledby="contract-title">
          <SectionLabel number="I">The contract</SectionLabel>
          <div className="section-heading">
            <h2 id="contract-title">Four things we refuse to trade away.</h2>
            <p>
              An operating system is a power relationship. These are the limits on ours.
            </p>
          </div>
          <div className="principle-grid">
            {principles.map((principle) => (
              <article className="principle" key={principle.number}>
                <span className="principle-number">{principle.number}</span>
                <h3>{principle.title}</h3>
                <p>{principle.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section releases" id="releases" aria-labelledby="releases-title">
          <SectionLabel number="II">What ships</SectionLabel>
          <div className="section-heading split-heading">
            <h2 id="releases-title">Two release boundaries. One constitution.</h2>
            <p>
              Each artifact advances independently. Neither gets to borrow evidence from the other.
            </p>
          </div>
          <div className="release-grid">
            {releases.map((release) => (
              <article className="release-card" key={release.code}>
                <div className="release-code" aria-hidden="true">{release.code}</div>
                <div>
                  <p className="release-eyebrow">{release.eyebrow}</p>
                  <h3>{release.title}</h3>
                  <p className="release-body">{release.body}</p>
                  <p className="release-gate">{release.gate}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section evidence" id="evidence" aria-labelledby="evidence-title">
          <SectionLabel number="III">The truth ladder</SectionLabel>
          <div className="section-heading split-heading">
            <h2 id="evidence-title">Compiling is not running.</h2>
            <p>
              A green build starts the argument. Evidence moves one boundary at a time.
            </p>
          </div>
          <ol className="truth-ladder">
            {evidenceTiers.map((tier, index) => (
              <li key={tier.name}>
                <span className="tier-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <code>{tier.name}</code>
                <div>
                  <h3>{tier.title}</h3>
                  <p>{tier.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="section open" aria-labelledby="open-title">
          <SectionLabel number="IV">The open ledger</SectionLabel>
          <div className="open-grid">
            <div>
              <h2 id="open-title">Ambition stays visible. So do the unknowns.</h2>
              <p className="open-intro">
                JJTY is larger than this launch. The public page will not turn future work into present tense.
              </p>
            </div>
            <ul>
              {openWork.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </section>

        <section className="launch-marker" aria-labelledby="launch-title">
          <p className="eyebrow">Release marker / India time</p>
          <div className="launch-date" aria-hidden="true">
            <span>31</span><i>/</i><span>08</span><i>/</i><span>26</span>
          </div>
          <h2 id="launch-title">The exact artifacts that pass will launch.</h2>
          <p>
            No last-minute rebuild. The tested Android and Linux candidates are signed, checksummed, attributable, and reversible before they are promoted.
          </p>
        </section>
      </main>

      <footer>
        <a className="wordmark wordmark-footer" href="#top">JJTY.</a>
        <p>Capture first. Keep the interior yours.</p>
        <p>jjty.in <span aria-hidden="true">·</span> 31 August 2026</p>
      </footer>
    </>
  );
}
