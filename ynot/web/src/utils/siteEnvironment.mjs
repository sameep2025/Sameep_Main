export const PRODUCTION_SITE_ORIGIN = "https://ynot.co.in";

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!/^https?:$/.test(url.protocol)) return "";
    return url.origin.replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function getConfiguredSiteOrigin(env = process.env) {
  return normalizeOrigin(env.NEXT_PUBLIC_SITE_URL);
}

export function getPublicSiteOrigin(env = process.env) {
  return getConfiguredSiteOrigin(env) || PRODUCTION_SITE_ORIGIN;
}

export function isProductionIndexingEnabled(env = process.env) {
  const deploymentEnvironment = String(
    env.YNOT_DEPLOYMENT_ENVIRONMENT || ""
  ).trim().toLowerCase();

  return (
    deploymentEnvironment === "production" &&
    getConfiguredSiteOrigin(env) === PRODUCTION_SITE_ORIGIN
  );
}

export function absoluteSiteUrl(pathname = "/", env = process.env) {
  return new URL(pathname, `${getPublicSiteOrigin(env)}/`).toString();
}
