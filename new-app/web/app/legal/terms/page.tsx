import type { Metadata } from "next";

import { terms } from "../../../content/legal.js";
import { LegalDocument } from "../LegalDocument.js";

export const metadata: Metadata = {
  title: "Terms — Pryvis",
  description: "The terms on which Pryvis is provided, in plain language.",
};

/**
 * The words are in content/legal.ts, and one clause is deliberately absent: the permission to use
 * aggregate, non-identifying price data to build a material price index. It cannot be retro-fitted
 * once tenants have signed up under terms silent on it, so it is a dependency of registration
 * (brief §5a) and the owner's decision to make.
 */
export default function TermsPage() {
  return (
    <LegalDocument
      heading={terms.heading}
      bannerSubject={terms.bannerSubject}
      sections={terms.sections}
    />
  );
}
