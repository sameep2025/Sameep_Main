const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buildPublicPromotionalPosters,
  collectRemovedPosterKeys,
  isManagedPosterKey,
  normalizePromotionalPosters,
} = require("../services/promotionalPosterConfig");

const backendRoot = path.resolve(__dirname, "..");
const source = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), "utf8");

function poster(overrides = {}) {
  const key = overrides.key || "promotional/salon-management-software/poster-one-id.png";
  return {
    id: "poster_one",
    key,
    imageUrl: `https://ynot-assets.s3.ap-south-1.amazonaws.com/${key}`,
    altText: "YNOT salon billing and customer management highlights",
    displayOrder: 1,
    published: true,
    width: 1600,
    height: 900,
    ...overrides,
  };
}

test("promotional poster configuration validates, orders, and preserves explicit dimensions", () => {
  const normalized = normalizePromotionalPosters([
    poster({ id: "second", displayOrder: 2 }),
    poster({
      id: "first",
      key: "promotional/salon-management-software/poster-two-id.webp",
      imageUrl:
        "https://ynot-assets.s3.ap-south-1.amazonaws.com/promotional/salon-management-software/poster-two-id.webp",
      displayOrder: 1,
      width: 1200,
      height: 1500,
    }),
  ]);

  assert.deepEqual(normalized.map((entry) => entry.id), ["first", "second"]);
  assert.equal(normalized[0].width, 1200);
  assert.equal(normalized[0].height, 1500);
});

test("public poster output includes only published, accessible fields", () => {
  const publicPosters = buildPublicPromotionalPosters([
    poster({ id: "published" }),
    poster({
      id: "draft",
      key: "promotional/salon-management-software/draft-id.png",
      imageUrl:
        "https://ynot-assets.s3.ap-south-1.amazonaws.com/promotional/salon-management-software/draft-id.png",
      published: false,
      altText: "",
    }),
  ]);

  assert.equal(publicPosters.length, 1);
  assert.equal(publicPosters[0].id, "published");
  assert.equal(Object.hasOwn(publicPosters[0], "key"), false);
  assert.equal(Object.hasOwn(publicPosters[0], "published"), false);
});

test("publishing requires alt text and managed S3 ownership", () => {
  assert.throws(
    () => normalizePromotionalPosters([poster({ altText: "" })]),
    /require descriptive alt text/
  );
  assert.throws(
    () =>
      normalizePromotionalPosters([
        poster({
          key: "vendor/other/image.png",
          imageUrl: "https://ynot-assets.s3.ap-south-1.amazonaws.com/vendor/other/image.png",
        }),
      ]),
    /not managed by YNOT/
  );
  assert.equal(isManagedPosterKey("promotional/salon/poster.png"), true);
  assert.equal(isManagedPosterKey("promotional/../private.png"), false);
});

test("removed and replaced poster keys are selected for cleanup", () => {
  const previous = [poster(), poster({
    id: "replace",
    key: "promotional/salon-management-software/old-id.png",
    imageUrl:
      "https://ynot-assets.s3.ap-south-1.amazonaws.com/promotional/salon-management-software/old-id.png",
  })];
  const next = [poster(), poster({
    id: "replace",
    key: "promotional/salon-management-software/new-id.png",
    imageUrl:
      "https://ynot-assets.s3.ap-south-1.amazonaws.com/promotional/salon-management-software/new-id.png",
  })];

  assert.deepEqual(collectRemovedPosterKeys(previous, next), [
    "promotional/salon-management-software/old-id.png",
  ]);
});

test("poster routes keep writes admin-only and generic uploads admin-scoped", () => {
  const configRoutes = source("routes/appConfigRoutes.js");
  const uploadRoutes = source("routes/uploadRoutes.js");

  assert.match(configRoutes, /router\.get\("\/promotional-posters\/public"/);
  assert.match(configRoutes, /router\.get\("\/promotional-posters", requireAdminAuth/);
  assert.match(configRoutes, /router\.put\("\/promotional-posters", requireAdminAuth/);
  assert.match(configRoutes, /router\.delete\("\/promotional-posters\/upload", requireAdminAuth/);
  assert.match(configRoutes, /configuredPosters\.some/);
  assert.match(uploadRoutes, /"promotional"/);
  assert.match(uploadRoutes, /req\.uploadAuth\?\.authType !== "admin"/);
});
