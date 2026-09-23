/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // /assemblies was the job library and no longer exists — send it to its
      // new home rather than a 404.
      //
      // Deliberately NO redirect for the old /jobs. That path used to be
      // client work and now serves the library, so redirecting it would break
      // a page that genuinely exists. The cost is that an old /jobs bookmark
      // quietly lands on something different from what was saved; the
      // alternative was never letting "Jobs" mean the thing contractors
      // actually call a job.
      { source: "/assemblies", destination: "/jobs", permanent: false },
      { source: "/assemblies/:path*", destination: "/jobs/:path*", permanent: false },
    ];
  },
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
