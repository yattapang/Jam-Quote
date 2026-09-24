/**
 * Home.
 *
 * Every word comes from content/site.ts (ADR 0018), so moving to a CMS later replaces the
 * loader rather than rewriting the page.
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
          <a className="btn" href={`mailto:${site.earlyAccessEmail}?subject=Early%20access%20to%20Pryvis`}>
            Ask for early access
          </a>
          <a className="btn btn--quiet" href="/features">
            See what it does
          </a>
        </div>
        <p className="note">
          Free to quote with. Sign-up opens shortly — email us and we will let you know the day it
          does.
        </p>

        <ul className="checks">
          {site.home.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Who it is for</h2>
        <p>
          Contractors in Jamaica who price their own work: builders, finishers, electricians,
          plumbers, and the one-person outfit that has outgrown a paper book. Construction first,
          other trades next.
        </p>
      </section>
    </div>
  );
}
