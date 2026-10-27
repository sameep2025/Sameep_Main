const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const vendorPreviewRoot = path.resolve(__dirname, "..");
const exploreSource = fs.readFileSync(
  path.join(vendorPreviewRoot, "app", "_Explore", "Explore.jsx"),
  "utf8"
);
const menuCssSource = fs.readFileSync(
  path.join(vendorPreviewRoot, "app", "_Explore", "ExploreInline.css"),
  "utf8"
);

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);

  const openingBrace = source.indexOf("{", start);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  throw new Error(`Unable to extract ${functionName}`);
}

const helperNames = [
  "buildQuickBillingServiceIndex",
  "buildQuickBillingCategoryTree",
  "findQuickBillingCategory",
  "findDefaultQuickBillingCategoryKey",
  "filterQuickBillingServices",
  "getQuickBillingInitialQuantity",
  "getQuickBillingIncrementedQuantity",
  "getQuickBillingDecrementedQuantity",
];
const helperContext = { module: { exports: {} } };
vm.runInNewContext(
  `${helperNames.map((name) => extractFunction(exploreSource, name)).join("\n")}\n` +
    `module.exports = { ${helperNames.join(", ")} };`,
  helperContext
);

const {
  buildQuickBillingServiceIndex,
  buildQuickBillingCategoryTree,
  findQuickBillingCategory,
  findDefaultQuickBillingCategoryKey,
  filterQuickBillingServices,
  getQuickBillingInitialQuantity,
  getQuickBillingIncrementedQuantity,
  getQuickBillingDecrementedQuantity,
} = helperContext.module.exports;

function service(id, name, price, extra = {}) {
  return {
    _id: id,
    categoryId: `category-${id}`,
    name,
    price,
    children: [],
    ...extra,
  };
}

test("flat index supports mixed service and subcategory siblings at arbitrary depth", () => {
  const directService = service("direct", "Haircut", 500);
  const deepService = service("deep", "Balayage", 2500);
  const tree = [
    {
      _id: "hair",
      categoryId: "hair-category",
      name: "Hair",
      children: [
        directService,
        {
          _id: "colour",
          categoryId: "colour-category",
          name: "Colour",
          price: 999,
          children: [
            {
              _id: "advanced",
              categoryId: "advanced-category",
              name: "Advanced",
              children: [deepService],
            },
          ],
        },
      ],
    },
  ];

  const index = buildQuickBillingServiceIndex(tree, [], ["root"]);
  assert.deepEqual(
    Array.from(index, (entry) => entry.serviceName),
    ["Haircut", "Balayage"]
  );
  assert.equal(index[0].categoryName, "Hair");
  assert.deepEqual(Array.from(index[1].nodePath), ["Hair", "Colour", "Advanced", "Balayage"]);
  assert.deepEqual(Array.from(index[1].categoryPathIds), [
    "root",
    "hair-category",
    "colour-category",
    "advanced-category",
    "category-deep",
  ]);
  assert.deepEqual(Array.from(index[1].categoryKeys), [
    "hair-category",
    "colour-category",
    "advanced-category",
  ]);
  assert.strictEqual(index[1].node, deepService);
});

test("dynamic categories support breadcrumbs, descendants and mixed-level services", () => {
  const directService = service("direct-womens", "Consultation", 300);
  const cutService = service("womens-cut", "Layer Cut", 900);
  const facialService = service("facial", "Glow Facial", 1500);
  const tree = [
    {
      _id: "mens",
      name: "Hash Mens",
      children: [service("mens-cut", "Hair Cut", 500)],
    },
    {
      _id: "womens",
      name: "Hash Womens",
      children: [
        directService,
        {
          _id: "hair-cuts",
          name: "Hair Cuts",
          children: [cutService],
        },
        {
          _id: "face",
          name: "Facial",
          children: [facialService],
        },
      ],
    },
  ];

  const categoryTree = buildQuickBillingCategoryTree(tree);
  assert.deepEqual(Array.from(categoryTree, (category) => category.name), [
    "Hash Mens",
    "Hash Womens",
  ]);

  const womens = findQuickBillingCategory(categoryTree, "womens");
  assert.deepEqual(Array.from(womens.path, (category) => category.name), ["Hash Womens"]);
  assert.deepEqual(Array.from(womens.children, (category) => category.name), [
    "Hair Cuts",
    "Facial",
  ]);

  const index = buildQuickBillingServiceIndex(tree);
  const womensServices = index.filter((entry) => entry.categoryKeys.includes(womens.key));
  assert.deepEqual(Array.from(womensServices, (entry) => entry.serviceName), [
    "Consultation",
    "Layer Cut",
    "Glow Facial",
  ]);

  const hairCuts = findQuickBillingCategory(categoryTree, "hair-cuts");
  assert.equal(hairCuts.parentKey, "womens");
  assert.deepEqual(Array.from(hairCuts.path, (category) => category.name), [
    "Hash Womens",
    "Hair Cuts",
  ]);
  assert.deepEqual(
    Array.from(womens.children, (category) => category.key),
    ["hair-cuts", "face"]
  );
});

test("persistent category UI keeps top-level, sibling and child switching available", () => {
  assert.match(exploreSource, /quick-billing-top-categories/);
  assert.match(exploreSource, /quickBillingSiblingCategories\.map/);
  assert.match(exploreSource, /quickBillingChildCategories\.map/);
  assert.match(exploreSource, /selectedQuickBillingCategory\.path\.map/);
  assert.match(exploreSource, /findDefaultQuickBillingCategoryKey/);
  assert.doesNotMatch(exploreSource, />\s*All\s*</);
  assert.doesNotMatch(exploreSource, />\s*Browse Categories\s*</);
  assert.doesNotMatch(exploreSource, /quick-billing-category-back/);
});

test("default category follows menu order and selects a billable child", () => {
  const tree = [
    { _id: "empty", name: "Empty", children: [] },
    {
      _id: "hair",
      name: "Hair",
      children: [
        { _id: "empty-child", name: "Empty Child", children: [] },
        {
          _id: "cuts",
          name: "Cuts",
          children: [service("cut", "Layer Cut", 900)],
        },
      ],
    },
    { _id: "skin", name: "Skin", children: [service("facial", "Facial", 1500)] },
  ];
  const categories = buildQuickBillingCategoryTree(tree);
  const services = buildQuickBillingServiceIndex(tree);

  assert.equal(findDefaultQuickBillingCategoryKey(categories, services), "cuts");
});

test("default category keeps directly billable parent services accessible", () => {
  const tree = [
    {
      _id: "hair",
      name: "Hair",
      children: [
        service("consultation", "Consultation", 300),
        {
          _id: "cuts",
          name: "Cuts",
          children: [service("cut", "Layer Cut", 900)],
        },
      ],
    },
  ];
  const categories = buildQuickBillingCategoryTree(tree);
  const services = buildQuickBillingServiceIndex(tree);

  assert.equal(findDefaultQuickBillingCategoryKey(categories, services), "hair");
  assert.deepEqual(
    Array.from(
      services
        .filter((entry) => entry.categoryKeys.includes("hair"))
        .map((entry) => entry.serviceName)
    ),
    ["Consultation", "Layer Cut"]
  );
});

test("default category handles root services and empty menus", () => {
  const rootServices = buildQuickBillingServiceIndex([
    service("root-service", "Root Service", 500),
  ]);

  assert.equal(findDefaultQuickBillingCategoryKey([], rootServices), "root-services");
  assert.equal(findDefaultQuickBillingCategoryKey([], []), "none");
  assert.match(exploreSource, /effectiveQuickBillingCategory === "none"[\s\S]*No services available\./);
});

test("duplicate service names remain separate and searchable across categories", () => {
  const tree = [
    { _id: "hair", name: "Hair", children: [service("hair-spa", "Spa", 800)] },
    { _id: "nails", name: "Nails", children: [service("nail-spa", "Spa", 600)] },
  ];

  const index = buildQuickBillingServiceIndex(tree);
  const results = filterQuickBillingServices(index, "  SpA ");
  assert.equal(results.length, 2);
  assert.notEqual(results[0].categoryKey, results[1].categoryKey);
  assert.deepEqual(Array.from(results, (entry) => entry.categoryPath), ["Hair", "Nails"]);
  assert.equal(filterQuickBillingServices(index, "nails")[0].serviceName, "Spa");
});

test("flat index exactly matches terminal priced nodes used by existing Add rows", () => {
  const tree = [
    service("one", "One", 100),
    service("zero", "Zero", 0),
    service("missing", "Missing", null),
    {
      _id: "group",
      name: "Group",
      price: 500,
      children: [service("nested", "Nested", 200)],
    },
  ];
  const expected = [];
  const collectExistingAddRows = (nodes) => {
    nodes.forEach((node) => {
      const children = Array.isArray(node.children) ? node.children : [];
      if (children.length === 0 && node.price !== undefined && node.price !== null) {
        expected.push(node._id);
      } else {
        collectExistingAddRows(children);
      }
    });
  };
  collectExistingAddRows(tree);

  const actual = buildQuickBillingServiceIndex(tree).map((entry) => entry.node._id);
  assert.deepEqual(Array.from(actual), expected);
});

test("search covers a 250-service index beyond the initial 30-service display", () => {
  const tree = Array.from({ length: 250 }, (_, index) =>
    service(`service-${index + 1}`, `Service ${index + 1}`, index + 1)
  );
  const index = buildQuickBillingServiceIndex(tree);

  assert.equal(index.slice(0, 30).length, 30);
  assert.ok(index.every((entry) => entry.categoryName === "Other services"));
  assert.equal(index.length, 250);
  assert.equal(filterQuickBillingServices(index, "service 250")[0].serviceName, "Service 250");
  assert.match(exploreSource, /slice\(0, quickBillingVisibleCount\)/);
  assert.match(exploreSource, /normalizedMenuSearch\s*\?\s*quickBillingSearchResults/);
  assert.match(exploreSource, /setQuickBillingVisibleCount\(\s*\(count\) => count \+ QUICK_BILLING_INITIAL_LIMIT/);
  assert.match(exploreSource, /quickBillingChildCategories/);
});

test("search clear button restores category results and retains keyboard focus", () => {
  assert.match(exploreSource, /ref=\{quickBillingSearchInputRef\}/);
  assert.match(exploreSource, /menuSearch && \([\s\S]*quick-billing-search-clear/);
  assert.match(exploreSource, /setMenuSearch\(""\)/);
  assert.match(exploreSource, /quickBillingSearchInputRef\.current\?\.focus\(\)/);
  assert.match(exploreSource, /event\.key === "Escape"/);
  assert.doesNotMatch(
    exploreSource.match(/const clearQuickBillingSearch = \(\) => \{[\s\S]*?\n  \};/)?.[0] || "",
    /setQuickBillingCategory/
  );
  assert.match(menuCssSource, /\.quick-billing-search-clear\s*\{[\s\S]*width:\s*44px;[\s\S]*height:\s*44px/);
  assert.match(menuCssSource, /\.menu-search-input\s*\{[\s\S]*padding:\s*0 54px 0 14px/);
});

test("canonical node data, quantities and step increments are preserved", () => {
  const original = service("bundle", "Bundle", 1200, { minQty: 2, stepQty: 3 });
  const [indexed] = buildQuickBillingServiceIndex([original], ["Packages"], ["root"]);

  assert.strictEqual(indexed.node, original);
  assert.equal(indexed.node.categoryId, "category-bundle");
  assert.deepEqual(Array.from(indexed.nodePath), ["Packages", "Bundle"]);
  assert.deepEqual(Array.from(indexed.categoryPathIds), ["root", "category-bundle"]);
  assert.equal(getQuickBillingInitialQuantity(indexed.node.minQty), 2);
  assert.equal(getQuickBillingIncrementedQuantity(2, indexed.node.stepQty), 5);
  assert.equal(getQuickBillingDecrementedQuantity(5, 2, indexed.node.stepQty), 2);
  assert.equal(getQuickBillingDecrementedQuantity(2, 2, indexed.node.stepQty), null);
  assert.match(exploreSource, /total:\s*i\.price \* qty/);
  assert.match(exploreSource, /total:\s*i\.price \* nextQuantity/);
});

test("mobile cart is a full-width safe-area-aware summary without covering rows", () => {
  assert.match(exploreSource, /menu-mobile-cart-view[\s\S]*View Cart/);
  assert.match(exploreSource, /menu-mobile-cart-total/);
  assert.match(menuCssSource, /\.menu-overlay-shell\s*\{[\s\S]*env\(safe-area-inset-bottom\)/);
  assert.match(menuCssSource, /\.menu-mobile-cart-pill\s*\{[\s\S]*left:\s*8px;[\s\S]*width:\s*calc\(100% - 16px\)/);
  assert.match(menuCssSource, /\.quick-billing-category-strip\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(exploreSource, /updateItemStylist/);
});
