import {
  PRODUCTION_SITE_ORIGIN,
  isProductionIndexingEnabled,
} from "./siteEnvironment.mjs";

export function buildPublicSitemap(env = process.env) {
  if (!isProductionIndexingEnabled(env)) return [];

  return [
    {
      url: `${PRODUCTION_SITE_ORIGIN}/`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${PRODUCTION_SITE_ORIGIN}/salon-management-software`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${PRODUCTION_SITE_ORIGIN}/privacy-policy`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
