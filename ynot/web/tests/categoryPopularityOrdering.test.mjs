import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  sortCategoriesByPopularity,
} from "../src/utils/categoryPopularity.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(dirname, "..");
const onboardingApi = fs.readFileSync(
  path.join(webRoot, "src/services/onboardingApi.js"),
  "utf8"
);
const onboardingPage = fs.readFileSync(
  path.join(webRoot, "src/app/onboarding/page.js"),
  "utf8"
);

test("homepage ordering uses count, case-insensitive name, and category ID", () => {
  const categories = [
    { categoryId: "4", name: "Zero Zebra", totalVendors: 0 },
    { categoryId: "3", name: "Zero Alpha", totalVendors: 0 },
    { categoryId: "2", name: "beauty", totalVendors: 5 },
    { categoryId: "1", name: "Beauty", totalVendors: 5 },
    { categoryId: "5", name: "Services", totalVendors: 8 },
  ];

  assert.deepEqual(
    sortCategoriesByPopularity(categories).map((category) => category.categoryId),
    ["5", "1", "2", "3", "4"]
  );
  assert.deepEqual(categories.map((category) => category.categoryId), ["4", "3", "2", "1", "5"]);
});

test("onboarding consumes ordered counts while preserving search and canonical IDs", () => {
  assert.match(onboardingApi, /request\("\/api\/dummy-vendors\/categories\/counts"/);
  assert.match(onboardingPage, /category\.name\?\.toLowerCase\(\)\.includes\(search\.toLowerCase\(\)\)/);
  assert.match(
    onboardingPage,
    /category\._id \|\| category\.id \|\| category\.categoryId/
  );
  assert.match(onboardingPage, /initialCategoryId/);
});
