import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { salonLandingContent } from "../src/content/salonManagementSoftware.mjs";
import {
  PRODUCTION_SITE_ORIGIN,
  isProductionIndexingEnabled,
} from "../src/utils/siteEnvironment.mjs";
import {
  NON_PRODUCTION_SITE_HOSTNAMES,
  buildIndexingProtectionHeaders,
} from "../src/utils/seoHeaders.mjs";
import { buildPublicSitemap } from "../src/utils/seoSitemap.mjs";
import { fetchPublishedPromotionalPosters } from "../src/services/promotionalPosters.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const page = read("src/app/salon-management-software/page.js");
const homepage = read("src/app/page.js");
const robots = read("src/app/robots.js");
const sitemap = read("src/app/sitemap.js");
const layout = read("src/app/layout.js");
const nextConfig = read("next.config.js");

test("salon landing content contains approved pricing and product scope", () => {
  assert.equal(salonLandingContent.hero.title, "Affordable Salon Management Software in India");
  assert.equal(salonLandingContent.hero.price, "₹3,600/year");
  assert.deepEqual(
    salonLandingContent.plans.map((plan) => plan.price),
    ["₹3,600", "₹4,800", "₹6,000"]
  );
  assert.match(JSON.stringify(salonLandingContent), /Membership Management/);
  assert.match(JSON.stringify(salonLandingContent), /Own WhatsApp Billing Integration/);
  assert.doesNotMatch(JSON.stringify(salonLandingContent), /Inventory Management/);
  assert.doesNotMatch(JSON.stringify(salonLandingContent), /WhatsApp Marketing/);
});

test("small-salon search themes are covered naturally in visible content", () => {
  const visibleContent = JSON.stringify({
    hero: salonLandingContent.hero,
    ownerGuide: salonLandingContent.ownerGuide,
    features: salonLandingContent.features,
    plans: salonLandingContent.plans,
    addOns: salonLandingContent.addOns,
    faqs: salonLandingContent.faqs,
  });

  for (const phrase of [
    /small salons/i,
    /beauty parlours/i,
    /ladies' beauty parlour/i,
    /salon billing/i,
    /mobile-friendly/i,
    /WhatsApp billing/i,
    /appointment/i,
    /customer loyalty/i,
    /GST invoice/i,
    /prepaid value wallets/i,
    /customer management/i,
    /professional salon website/i,
    /dedicated POS/i,
    /first-time software user/i,
  ]) {
    assert.match(visibleContent, phrase);
  }
});

test("pricing copy keeps Basic and optional paid add-ons distinct", () => {
  const [basic, oneAddOn, bothAddOns] = salonLandingContent.plans;
  assert.equal(basic.name, "Basic Annual Plan");
  assert.equal(basic.price, "₹3,600");
  assert.doesNotMatch(basic.highlights.join(" "), /Membership Management/);
  assert.doesNotMatch(basic.highlights.join(" "), /Own WhatsApp Billing Integration/);
  assert.equal(oneAddOn.price, "₹4,800");
  assert.equal(bothAddOns.price, "₹6,000");
  assert.deepEqual(
    salonLandingContent.addOns.map((addOn) => addOn.price),
    ["+₹1,200/year", "+₹1,200/year"]
  );
});

test("landing page is server-rendered with ISR and exposes matching structured data", () => {
  assert.doesNotMatch(page, /["']use client["']/);
  assert.match(page, /revalidate = 300/);
  assert.match(page, /SoftwareApplication/);
  assert.match(page, /"@type": "Organization"/);
  assert.match(page, /BusinessAudience/);
  assert.match(page, /featureList: content\.features\.map/);
  assert.match(page, /BreadcrumbList/);
  assert.match(page, /FAQPage/);
  assert.match(page, /content\.faqs\.map/);
  assert.match(page, /alternates: \{ canonical: canonicalUrl \}/);
  assert.equal((page.match(/<h1/g) || []).length, 1);
});

test("landing page includes three onboarding CTAs and optional promotional highlights", () => {
  assert.match(page, /salonOnboardingUrl = "\/onboarding\?category=salon-spa"/);
  assert.match(page, /className="salonSignupButton" href=\{salonOnboardingUrl\}/);
  assert.equal(
    (page.match(/className="salonPrimaryButton" href=\{salonOnboardingUrl\}/g) || []).length,
    2
  );
  assert.match(page, /<SalonPromotionalPopup/);
  assert.match(page, /YNOT Promotional Highlights/);
  assert.match(page, /<Image/);
  assert.match(page, /promotionalPosters\.length/);
  assert.match(page, /FeatureIcon/);
});

test("published poster fetch sorts valid data and omits malformed entries", async () => {
  const posters = await fetchPublishedPromotionalPosters({
    backendBaseUrl: "https://api.example.test",
    fetchImpl: async (url, options) => {
      assert.equal(
        url,
        "https://api.example.test/api/app-config/promotional-posters/public"
      );
      assert.equal(options.next.revalidate, 300);
      return {
        ok: true,
        json: async () => ({
          posters: [
            {
              id: "second",
              imageUrl: "https://bucket.s3.ap-south-1.amazonaws.com/second.webp",
              altText: "Second YNOT promotional poster",
              displayOrder: 2,
              width: 1200,
              height: 1500,
            },
            {
              id: "invalid",
              imageUrl: "https://bucket.s3.ap-south-1.amazonaws.com/invalid.webp",
              altText: "",
              displayOrder: 0,
              width: 1200,
              height: 1500,
            },
            {
              id: "first",
              imageUrl: "https://bucket.s3.ap-south-1.amazonaws.com/first.webp",
              altText: "First YNOT promotional poster",
              displayOrder: 1,
              width: 1200,
              height: 1500,
            },
          ],
        }),
      };
    },
  });

  assert.deepEqual(posters.map((poster) => poster.id), ["first", "second"]);
});

test("poster API failure leaves the server-rendered landing page usable", async () => {
  const unavailable = await fetchPublishedPromotionalPosters({
    fetchImpl: async () => {
      throw new Error("backend unavailable");
    },
    timeoutMs: 10,
  });
  const failedResponse = await fetchPublishedPromotionalPosters({
    fetchImpl: async () => ({ ok: false }),
    timeoutMs: 10,
  });

  assert.deepEqual(unavailable, []);
  assert.deepEqual(failedResponse, []);
  assert.match(page, /content\.features\.map/);
  assert.match(page, /content\.plans\.map/);
  assert.match(page, /content\.faqs\.map/);
});

test("production indexing is exact-origin and fail-closed", () => {
  assert.equal(PRODUCTION_SITE_ORIGIN, "https://ynot.co.in");
  assert.equal(isProductionIndexingEnabled({}), false);
  assert.equal(
    isProductionIndexingEnabled({ NEXT_PUBLIC_SITE_URL: "https://ynot.co.in" }),
    false
  );
  assert.equal(
    isProductionIndexingEnabled({ YNOT_DEPLOYMENT_ENVIRONMENT: "production" }),
    false
  );
  assert.equal(
    isProductionIndexingEnabled({
      YNOT_DEPLOYMENT_ENVIRONMENT: "production",
      NEXT_PUBLIC_SITE_URL: "https://ynot.co.in",
    }),
    true
  );
  assert.equal(
    isProductionIndexingEnabled({
      YNOT_DEPLOYMENT_ENVIRONMENT: "test",
      NEXT_PUBLIC_SITE_URL: "https://ynot.co.in",
    }),
    false
  );
  assert.equal(
    isProductionIndexingEnabled({
      YNOT_DEPLOYMENT_ENVIRONMENT: "production",
      NEXT_PUBLIC_SITE_URL: "https://test.ynot.co.in",
    }),
    false
  );
  assert.equal(
    isProductionIndexingEnabled({
      YNOT_DEPLOYMENT_ENVIRONMENT: "production",
      NEXT_PUBLIC_SITE_URL: "https://ynot.co.in.example.com",
    }),
    false
  );
  assert.match(robots, /disallow: "\/"/);
});

test("homepage declares the exact production canonical URL", () => {
  assert.match(layout, /canonical: `\$\{PRODUCTION_SITE_ORIGIN\}\//);
  assert.equal(PRODUCTION_SITE_ORIGIN, "https://ynot.co.in");
});

test("non-production sitemaps are empty while production entries remain intact", () => {
  const testSitemap = buildPublicSitemap({
    YNOT_DEPLOYMENT_ENVIRONMENT: "test",
    NEXT_PUBLIC_SITE_URL: "https://sameep.app",
  });
  const preProductionSitemap = buildPublicSitemap({
    YNOT_DEPLOYMENT_ENVIRONMENT: "pre-production",
    NEXT_PUBLIC_SITE_URL: "https://ynot-dev.co.in",
  });
  const productionSitemap = buildPublicSitemap({
    YNOT_DEPLOYMENT_ENVIRONMENT: "production",
    NEXT_PUBLIC_SITE_URL: "https://ynot.co.in",
  });

  assert.deepEqual(testSitemap, []);
  assert.deepEqual(preProductionSitemap, []);
  assert.deepEqual(
    productionSitemap.map(({ url }) => url),
    [
      "https://ynot.co.in/",
      "https://ynot.co.in/salon-management-software",
      "https://ynot.co.in/privacy-policy",
    ]
  );
  assert.match(sitemap, /buildPublicSitemap/);
  assert.match(homepage, /href="\/salon-management-software"/);
});

test("response headers protect non-production builds and known deployment hosts", () => {
  const productionEnv = {
    YNOT_DEPLOYMENT_ENVIRONMENT: "production",
    NEXT_PUBLIC_SITE_URL: "https://ynot.co.in",
  };
  const testEnv = {
    YNOT_DEPLOYMENT_ENVIRONMENT: "test",
    NEXT_PUBLIC_SITE_URL: "https://sameep.app",
  };
  const preProductionEnv = {
    YNOT_DEPLOYMENT_ENVIRONMENT: "pre-production",
    NEXT_PUBLIC_SITE_URL: "https://ynot-dev.co.in",
  };
  const productionRules = buildIndexingProtectionHeaders(productionEnv);

  assert.deepEqual(NON_PRODUCTION_SITE_HOSTNAMES, [
    "sameep.app",
    "ynot-dev.co.in",
  ]);
  assert.deepEqual(
    productionRules.map((rule) => rule.has[0]),
    NON_PRODUCTION_SITE_HOSTNAMES.map((value) => ({ type: "host", value }))
  );
  assert.equal(buildIndexingProtectionHeaders(testEnv)[0].has, undefined);
  assert.equal(buildIndexingProtectionHeaders(preProductionEnv)[0].has, undefined);
  assert.equal(
    buildIndexingProtectionHeaders(testEnv)[0].headers[0].value,
    "noindex, nofollow, noarchive"
  );

  assert.match(nextConfig, /buildIndexingProtectionHeaders/);
  assert.doesNotMatch(nextConfig, /x-forwarded-host/i);
});
