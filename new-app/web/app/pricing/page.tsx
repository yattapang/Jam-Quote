import type { Metadata } from "next";

import { site } from "../../content/site.js";

export const metadata: Metadata = {
  title: site.pricing.title,
  description: site.pricing.description,
};

export default function PricingPage() {
  return (
    <div className="wrap">
      <section className="hero">
        <h1>{site.pricing.heading}</h1>
        <p className="lede">{site.pricing.intro}</p>
      </section>

      <div className="tiers">
        {site.pricing.tiers.map((tier, index) => (
          <article className={index === 1 ? "tier tier--mid" : "tier"} key={tier.name}>
            <h2 style={{ marginTop: 0 }}>{tier.name}</h2>
            <p className="tier__who">{tier.who}</p>
            {/* No placeholder number. A price that is not decided says so (Rule 20). */}
            {tier.priceLabel ? (
              <p className="tier__price">{tier.priceLabel}</p>
            ) : (
              <p className="tier__price tier__price--tbd">Price being set</p>
            )}
            <p className="tier__line">{tier.theLine}</p>
            <ul>
              {tier.includes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <section>
        <p className="note">{site.pricing.footnote}</p>
        <div className="cta-row">
          <a className="btn" href={`mailto:${site.contactEmail}?subject=Pryvis%20pricing`}>
            Ask about pricing
          </a>
        </div>
      </section>
    </div>
  );
}
