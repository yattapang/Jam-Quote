/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No image optimisation service, no external loaders: the marketing pages use a PNG logo and
  // plain markup, so there is nothing to optimise and nothing to depend on (ADR 0018).
  images: { unoptimized: true },

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
