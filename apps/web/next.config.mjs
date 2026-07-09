/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TS source directly; let Next's compiler handle them.
  transpilePackages: ["@jamquote/core", "@jamquote/ui"],
};

export default nextConfig;
