/**
 * The banner every legal page carries while `site.legal.draft` is true.
 *
 * A component rather than copied markup, so the day the owner approves the wording one flag removes
 * it from every page at once — and until then no page can quietly present a draft as final
 * (Rule 20). The site guards check the chain: each legal page renders through LegalDocument, and
 * LegalDocument renders this.
 *
 * The words live in content/site.ts. They started out here, inline, and the content-source guard
 * refused them — rightly, since this is the most consequential sentence on the site and the person
 * who carries legal responsibility for it should not have to edit TSX to change it.
 */
import { site } from "../../content/site.js";

export function DraftBanner({ what }: { what: string }) {
  if (!site.legal.draft) return null;

  const notice = site.legal.draftNotice
    .replace("{subject}", what)
    .replace("{name}", site.name)
    .replace("{date}", site.legal.lastReviewed);

  return (
    <div className="draft-banner" role="note">
      <p style={{ margin: 0 }}>
        <strong>{site.legal.draftLabel}</strong> {notice}
      </p>
    </div>
  );
}
