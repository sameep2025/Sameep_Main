import {
  PRODUCTION_SITE_ORIGIN,
  isProductionIndexingEnabled,
} from "../utils/siteEnvironment.mjs";

export default function robots() {
  if (!isProductionIndexingEnabled()) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/mybills", "/onboarding"],
      },
    ],
    sitemap: `${PRODUCTION_SITE_ORIGIN}/sitemap.xml`,
    host: PRODUCTION_SITE_ORIGIN,
  };
}
