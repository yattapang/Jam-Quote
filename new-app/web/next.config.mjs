/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No image optimisation service, no external loaders: the marketing pages use SVG and
  // plain markup, so there is nothing to optimise and nothing to depend on (ADR 0018).
  images: { unoptimized: true },
};

export default nextConfig;
