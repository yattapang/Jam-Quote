/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TS source directly; let Next's compiler handle them.
  transpilePackages: ["@jamquote/core", "@jamquote/ui"],
  webpack: (config) => {
    // @jamquote/core & @jamquote/ui use NodeNext-style ".js" import specifiers
    // that actually point at ".ts" source (e.g. "./tax/money.js"). Teach
    // webpack to try ".ts"/".tsx" first, falling back to a real ".js".
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
