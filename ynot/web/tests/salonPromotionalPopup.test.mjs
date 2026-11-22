import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  getPromotionalPosterPage,
  markPromotionalPopupShown,
  movePromotionalPosterPage,
  PROMOTIONAL_POPUP_SESSION_KEY,
  shouldOpenPromotionalPopup,
} from "../src/utils/promotionalPopup.mjs";
import {
  getCategorySlug,
  resolveRequestedCategory,
  toCategorySlug,
} from "../src/utils/onboardingCategory.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const popupSource = read("src/components/SalonPromotionalPopup.js");
const landingSource = read("src/app/salon-management-software/page.js");
const onboardingSource = read("src/app/onboarding/page.js");

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}

const posters = [
  { id: "first", displayOrder: 1 },
  { id: "second", displayOrder: 2 },
  { id: "third", displayOrder: 3 },
];

test("promotional popup opens once per browser session and never opens without posters", () => {
  const storage = createStorage();
  assert.equal(shouldOpenPromotionalPopup(storage, posters), true);
  markPromotionalPopupShown(storage);
  assert.equal(storage.getItem(PROMOTIONAL_POPUP_SESSION_KEY), "1");
  assert.equal(shouldOpenPromotionalPopup(storage, posters), false);
  assert.equal(shouldOpenPromotionalPopup(createStorage(), []), false);
  assert.equal(shouldOpenPromotionalPopup(null, posters), false);
});

test("desktop shows two ordered posters and mobile shows one with wrapping navigation", () => {
  assert.deepEqual(
    getPromotionalPosterPage(posters, 0, 2).posters.map((poster) => poster.id),
    ["first", "second"]
  );
  assert.deepEqual(
    getPromotionalPosterPage(posters, 0, 1).posters.map((poster) => poster.id),
    ["first"]
  );
  assert.equal(movePromotionalPosterPage(0, 1, 1, 3), 1);
  assert.equal(movePromotionalPosterPage(2, 1, 1, 3), 0);
  assert.equal(movePromotionalPosterPage(0, -1, 2, 3), 2);
});

test("popup implements accessible dismissal, focus containment, scroll lock, and both CTAs", () => {
  assert.match(popupSource, /role="dialog"/);
  assert.match(popupSource, /aria-modal="true"/);
  assert.match(popupSource, /event\.key === "Escape"/);
  assert.match(popupSource, /event\.key !== "Tab"/);
  assert.match(popupSource, /document\.body\.style\.overflow = "hidden"/);
  assert.match(popupSource, /previousFocusRef\.current\?\.focus/);
  assert.match(popupSource, /Sign Up Now/);
  assert.match(popupSource, /Book a Free Demo/);
  assert.match(landingSource, /posters=\{promotionalPosters\}/);
});

test("Salon & Spa resolves from loaded configuration without a hardcoded database ID", () => {
  const categories = [
    { categoryId: "database-id-1", name: "Pet Grooming" },
    { categoryId: "database-id-2", name: "Salon & Spa" },
  ];
  assert.equal(toCategorySlug("Salon & Spa"), "salon-spa");
  assert.equal(getCategorySlug(categories[1]), "salon-spa");
  assert.equal(
    resolveRequestedCategory(categories, { categorySlug: "salon-spa" }),
    categories[1]
  );
  assert.equal(
    resolveRequestedCategory(categories, { categorySlug: "unknown-category" }),
    null
  );
  assert.equal(resolveRequestedCategory(categories), null);
});

test("onboarding applies a valid deep link through the normal confirmation transition", () => {
  assert.match(onboardingSource, /searchParams\.get\("category"\)/);
  assert.match(onboardingSource, /resolveRequestedCategory\(categories/);
  assert.match(onboardingSource, /if \(matched\) confirmCategory\(matched\)/);
  assert.match(onboardingSource, /onClick=\{\(\) => confirmCategory\(selected\)\}/);
  assert.match(onboardingSource, /const \[step, setStep\] = useState\("CATEGORY"\)/);
  assert.doesNotMatch(onboardingSource, /database-id-2/);
});
