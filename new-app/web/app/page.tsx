/**
 * Home.
 *
 * Leads on the roadside estimate (design §1: Delroy at the gate), because that is the
 * moment that sells the product in a sentence. Every word comes from content/site.ts, so
 * moving to a CMS later replaces the loader rather than rewriting the page.
 */
import { site } from "../content/site.js";

export default function HomePage() {
  return (
    <div className="wrap">
      <section className="hero">
        <h1>{site.home.heading}</h1>
        <p className="lede">{site.home.subheading}</p>

        <div className="cta-row">
          {/* Interim CTA: registration is designed (ADR 0015) and not built, so this is a
              mailto rather than a third-party form service collecting addresses for us. */}
          <a
            className="btn"
            href={`mailto:${site.contactEmail}?subject=Early%20access%20to%20Pryvis`}
          >
            Ask for early access
          </a>
          <a className="btn btn--quiet" href="/features">
            See what it does
          </a>
        </div>

        {/* The condition that makes the heading's "minutes" honest. It sits here, next to
            the claim, because a speed promise separated from its condition is the
            half-truth Rule 20 refuses. */}
        <p className="note">{site.home.firstRun}</p>

        <ul className="checks">
          {site.home.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Who it is for</h2>
        <p>{site.home.forWho}</p>
      </section>
    </div>
  );
}
