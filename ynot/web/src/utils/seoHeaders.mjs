import { isProductionIndexingEnabled } from "./siteEnvironment.mjs";

export const NON_PRODUCTION_SITE_HOSTNAMES = [
  "sameep.app",
  "ynot-dev.co.in",
];

const noIndexHeader = {
  key: "X-Robots-Tag",
  value: "noindex, nofollow, noarchive",
};

export function buildIndexingProtectionHeaders(env = process.env) {
  if (!isProductionIndexingEnabled(env)) {
    return [
      {
        source: "/:path*",
        headers: [noIndexHeader],
      },
    ];
  }

  // These host conditions use Next.js' request host matching. Forwarding headers
  // are intentionally not part of the indexing decision.
  return NON_PRODUCTION_SITE_HOSTNAMES.map((hostname) => ({
    source: "/:path*",
    has: [{ type: "host", value: hostname }],
    headers: [noIndexHeader],
  }));
}
