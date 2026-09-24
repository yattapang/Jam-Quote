import type { Metadata } from "next";

import { site } from "../../content/site.js";

export const metadata: Metadata = {
  title: site.features.title,
  description: site.features.description,
};

export default function FeaturesPage() {
  return (
    <div className="wrap">
      <section className="hero">
        <h1>{site.features.heading}</h1>
        <p className="lede">{site.features.intro}</p>
      </section>

      <div className="cards">
        {site.features.items.map((item) => (
          <article className="card" key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>

      <section>
        <h2>Coming next</h2>
        <p>
          Staged deposit and progress invoicing, a signed record of the client&rsquo;s acceptance,
          change orders as their own documents, and supplier price comparison. In that order, and
          one at a time.
        </p>
        <div className="cta-row">
          <a className="btn" href={`mailto:${site.earlyAccessEmail}?subject=Early%20access%20to%20Pryvis`}>
            Ask for early access
          </a>
        </div>
      </section>
    </div>
  );
}
