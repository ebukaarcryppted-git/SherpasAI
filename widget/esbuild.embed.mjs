import { build } from "esbuild";

/**
 * Bundles the script-tag embed into one dependency-free file — React,
 * wagmi, viem, and react-query all inlined, since a non-React host page
 * has none of these. The npm React-component path (dist/index.js, built by
 * `tsc` instead) deliberately keeps these as peerDependencies so it doesn't
 * duplicate the host app's own React/wagmi instance.
 */
await build({
  entryPoints: ["src/embed.tsx"],
  outfile: "dist/widget.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  sourcemap: true,
  loader: { ".tsx": "tsx", ".ts": "ts" },
  define: { "process.env.NODE_ENV": '"production"' },
});

console.log("Built dist/widget.js");
