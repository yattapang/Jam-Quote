import type { Metadata } from "next";

import { privacy } from "../../../content/legal.js";
import { LegalDocument } from "../LegalDocument.js";

export const metadata: Metadata = {
  title: "Privacy — Pryvis",
  description:
    "What data Pryvis holds, who processes it, where it is stored, and how long it is kept.",
};

/**
 * The words are in content/legal.ts. They are written to be TRUE rather than comprehensive: every
 * processor named there comes from docs/SERVICE-REGISTER.md, and a guard checks they are all
 * present. Boilerplate naming processors we do not use would be a false statement about where a
 * contractor's customers' details are held — worse than having no notice.
 */
export default function PrivacyPage() {
  return (
    <LegalDocument
      heading={privacy.heading}
      bannerSubject={privacy.bannerSubject}
      sections={privacy.sections}
    />
  );
}
