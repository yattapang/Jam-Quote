# Pricing & Supplier Scraping Spec

Material prices for Jamaican suppliers are not available via a public real-time
API, so JamQuote maintains its own price index fed from several sources. "Real
time" ships first as scan-and-confirm and scheduled scrapes, not a live feed.

## Sources (in priority order)

1. **Web scrapers** — Jamaican suppliers that publish online catalog prices.
   First target: **H&L True Value** (hardware / building materials). Each scraper
   is a small adapter implementing the `SupplierScraper` interface.
2. **Admin-curated catalog** — seeded/maintained by JamQuote staff via the admin portal.
3. **Camera scan-to-price** — OCR/barcode of a shelf tag writes a `MaterialPriceEntry` with `source = SCAN`.
4. **Contractor corrections** — a user can flag/replace a price; captured with an audit note.

## Scraper interface

```ts
interface ScrapedItem {
  name: string;
  sku?: string;
  unit?: string;        // "42.5kg bag", "20ft length"
  priceCents: number;   // JMD cents
  sourceUrl: string;
}

interface SupplierScraper {
  supplierKey: string;  // e.g. "hl-true-value"
  displayName: string;  // "H&L True Value"
  /** Fetch + parse the supplier's online catalog into normalized items. */
  scrape(): Promise<ScrapedItem[]>;
}
```

Adapters live in `apps/api/src/pricing/scrapers/`. A scheduled job (NestJS
`@Cron`, nightly) runs each enabled scraper and upserts `MaterialPriceEntry`
rows keyed by `(supplierId, sku|name)`, stamping `fetchedAt`.

## Rules & etiquette

- **Respect robots.txt and rate limits.** One polite request stream per run; cache aggressively; back off on errors. Identify with a descriptive User-Agent.
- **Never block the quote flow.** If a scrape/lookup fails, the UI falls back to the last cached price (with a staleness badge) and manual entry.
- **Freshness is always visible.** Every looked-up price shows its `source` and `fetchedAt` ("updated 3 days ago").
- **Resilience:** scrapers are best-effort and isolated — one failing supplier never breaks the others or the app.
- **Legal:** scraping is for price reference; prefer formal data partnerships with suppliers where possible (`Supplier.isPartner`).

## Lookup API (consumed by add-material screen)

- `GET /pricing/search?q=cement` → matched entries across suppliers, newest first, with freshness.
- `POST /pricing/scan` → accepts an image / barcode, returns best match(es) to confirm.
- Selecting a result sets the line's `priceSource = LOOKUP` (or `SCAN`) and `supplierId`; editing the price afterward flips intent to a manual override and requires `overrideNote`.
