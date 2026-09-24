import type { Metadata } from "next";

import { site } from "../../content/site.js";

export const metadata: Metadata = {
  title: site.features.title,
  description: site.features.description,
};

/**
 * Job recipes are deliberately the first card: they are what makes the roadside estimate
 * on the home page possible at all (design §3).
 */
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
        <p>{site.features.next}</p>
        <div className="cta-row">
          <a
            className="btn"
            href={`mailto:${site.contactEmail}?subject=Early%20access%20to%20Pryvis`}
          >
            Ask for early access
          </a>
        </div>
      </section>
    </div>
  );
}
