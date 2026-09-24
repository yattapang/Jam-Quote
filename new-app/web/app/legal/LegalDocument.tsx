/**
 * Renders a legal document from `content/legal.ts`.
 *
 * Presentation only, deliberately: the words are data so that a lawyer's or the owner's revisions
 * land in one file rather than inside TSX (ADR 0018). Both legal pages share this, so the draft
 * banner, the heading level and the contact link cannot drift apart between them.
 */
import { site } from "../../content/site.js";
import type { Section } from "../../content/legal.js";
import { DraftBanner } from "./DraftBanner.js";

export function LegalDocument({
  heading,
  bannerSubject,
  sections,
}: {
  heading: string;
  bannerSubject: string;
  sections: readonly Section[];
}) {
  return (
    <div className="wrap prose">
      <section className="hero">
        <h1>{heading}</h1>
        <DraftBanner what={bannerSubject} />
      </section>

      {sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>

          {section.paragraphs?.map((paragraph) => <p key={paragraph.slice(0, 32)}>{paragraph}</p>)}

          {section.bullets ? (
            <ul>
              {section.bullets.map((bullet) => (
                <li key={bullet.slice(0, 32)}>{bullet}</li>
              ))}
            </ul>
          ) : null}

          {section.contact ? (
            <p>
              <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}
