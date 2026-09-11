/**
 * Which deployment a page is driving, derived from the API it actually reads.
 *
 * ## Why this exists, and why it lives here
 *
 * The staff console's header carried a green "PRODUCTION" pill with no check
 * behind it, so a laptop pointed at localhost showed PRODUCTION too. On a console
 * whose buttons suspend tenants and set platform pricing, that badge is the last
 * thing that should be decorative.
 *
 * The first fix read `process.env.NEXT_PUBLIC_API_BASE_URL` directly, at module
 * scope inside the client component. A review found that inverted the precedence
 * every fetch uses: `API_BASE_URL` is resolved FIRST by `api-client`, and it is not
 * a `NEXT_PUBLIC_` variable, so the client bundle cannot see it at all. A deploy
 * that sets `API_BASE_URL=…prod…` and leaves a stale public one would have
 * suspended tenants on production behind an amber STAGING pill — the same lie in
 * the opposite direction.
 *
 * So this takes the ALREADY-RESOLVED base URL as an argument and the server page
 * passes `API_BASE_URL` in. One resolution, one precedence, no second copy to
 * drift.
 *
 * `NODE_ENV` was rejected outright: a staging deploy is also a production BUILD, so
 * it would say PRODUCTION on staging.
 */
export interface ApiEnvironment {
  label: string;
  tone: "good" | "warn" | "muted";
  /** The host, for a tooltip — so a wrong badge is diagnosable rather than just wrong. */
  detail: string;
}

/**
 * Hyphen/dot-separated tokens that mark a host as a pre-production deploy.
 *
 * Deliberately NOT `dev`, `test` or `preview`. A review ran the first version over
 * plausible production hosts and found `jamquote-api.fly.dev`, `api.jamquote.dev`
 * and `jamquote.dev` all reading STAGING — `.dev` is an ordinary TLD and Fly.io is
 * an ordinary production host. A badge that cries staging on production is the same
 * class of defect as one that cries production on staging.
 */
const PRE_PRODUCTION_TOKENS = new Set(["staging", "stage", "uat", "qa", "sandbox"]);

export function apiEnvironment(baseUrl: string | undefined): ApiEnvironment {
  if (!baseUrl || baseUrl.trim() === "") {
    return { label: "API NOT SET", tone: "warn", detail: "no API base URL resolved" };
  }

  let host: string;
  try {
    host = new URL(baseUrl).host;
  } catch {
    return { label: "API UNREADABLE", tone: "warn", detail: baseUrl };
  }

  const hostname = host.replace(/:\d+$/, "");
  if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(hostname)) {
    return { label: "LOCAL", tone: "muted", detail: host };
  }

  // Tokens from every label EXCEPT the TLD, so a `.dev` or `.test` suffix is not
  // mistaken for an environment name.
  const labels = hostname.split(".");
  const tokens = labels
    .slice(0, Math.max(1, labels.length - 1))
    .flatMap((label) => label.split("-"));
  if (tokens.some((t) => PRE_PRODUCTION_TOKENS.has(t.toLowerCase()))) {
    return { label: "STAGING", tone: "warn", detail: host };
  }

  return { label: "PRODUCTION", tone: "good", detail: host };
}
