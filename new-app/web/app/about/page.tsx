import type { Metadata } from "next";

import { site } from "../../content/site.js";

export const metadata: Metadata = {
  title: site.about.title,
  description: site.about.description,
};

export default function AboutPage() {
  return (
    <div className="wrap">
      <section className="hero">
        <h1>{site.about.heading}</h1>
        {site.about.body.map((paragraph) => (
          <p key={paragraph.slice(0, 24)} className="lede" style={{ marginBottom: "1rem" }}>
            {paragraph}
          </p>
        ))}
        <div className="cta-row">
          <a className="btn" href={`mailto:${site.contactEmail}?subject=Pryvis`}>
            Get in touch
          </a>
        </div>
      </section>
    </div>
  );
}
