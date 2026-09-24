/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No image optimisation service, no external loaders: the marketing pages use a PNG logo and
  // plain markup, so there is nothing to optimise and nothing to depend on (ADR 0018).
  images: { unoptimized: true },

  // NEXT 16 MAKES TURBOPACK THE DEFAULT, AND TURBOPACK CANNOT DO THE RESOLUTION BELOW.
  // Measured on the upgrade (2026-09-24): with `turbopack: {}` and this block removed, the build
  // fails with nine `Module not found: Can't resolve '../content/site.js'` errors. Turbopack has
  // `resolveAlias` and `resolveExtensions`, neither of which expresses ".js means .ts here" —
  // webpack's `extensionAlias` does, so the build and dev scripts now pass `--webpack` explicitly.
  //
  // The alternative is to stop writing `.js` specifiers in this package, which would work with no
  // config at all but would split the import style the comment below defends. That is a decision
  // about a recorded convention, so it is the owner's, and it is written up rather than taken.
  webpack: (config) => {
    // Imports are written with `.js` specifiers pointing at `.ts`/`.tsx` sources, which is the
    // NodeNext style the api uses — one import style across the repository rather than two.
    // Next's webpack does not do that resolution by default, so the build failed with
    // "Can't resolve '../content/site.js'" until this was added. original-app carries the same
    // three lines for the same reason; this is the second time the project has learned it.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
