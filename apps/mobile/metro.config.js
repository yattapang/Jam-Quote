// Metro config for the JamQuote npm workspace monorepo.
// Two things Metro doesn't do out of the box that we need here:
//  1. Resolve packages that live outside this app's folder (../../packages/*)
//     and are only reachable via workspace symlinks in the root node_modules.
//  2. Resolve the explicit ".js" specifiers used by @jamquote/core / @jamquote/ui
//     (e.g. "./types/enums.js") which point at real ".ts" source files — this
//     is valid NodeNext-style TS but Metro's resolver doesn't remap it itself.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo so changes to packages/core and packages/ui
// trigger a Fast Refresh, not just changes inside apps/mobile.
config.watchFolders = [workspaceRoot];

// Let Metro find modules hoisted to the workspace root node_modules as well
// as this app's own node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// npm workspaces link @jamquote/core and @jamquote/ui into node_modules via
// symlinks (junctions on Windows) — Metro needs to be told to follow them.
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = false;

const { resolveRequest: defaultResolveRequest } = config.resolver;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    try {
      const resolver = defaultResolveRequest ?? context.resolveRequest;
      return resolver(context, moduleName.slice(0, -3), platform);
    } catch {
      // Fall through to default resolution below (real .js files still work).
    }
  }
  const resolver = defaultResolveRequest ?? context.resolveRequest;
  return resolver(context, moduleName, platform);
};

module.exports = config;
