const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const DummyCategory = require("../models/dummyCategory");
const DummyVendor = require("../models/DummyVendor");
const dummyVendorRoutes = require("../routes/dummyVendorRoutes");
const {
  buildPublishedCategoryCounts,
} = require("../services/categoryPopularityService");

const ids = {
  alpha: new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae1"),
  beta: new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae2"),
  gamma: new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae3"),
  delta: new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae4"),
};

test("category popularity counts only Published vendors and preserves status counts", () => {
  const result = buildPublishedCategoryCounts(
    [
      { _id: ids.alpha, name: "Alpha", imageUrl: "alpha.png" },
      { _id: ids.beta, name: "Beta", imageUrl: "beta.png", visibleToVendor: false },
    ],
    [
      { _id: { categoryId: ids.alpha, status: "Published" }, count: 4 },
      { _id: { categoryId: ids.alpha, status: "Pending" }, count: 9 },
      { _id: { categoryId: ids.beta, status: "Draft" }, count: 12 },
      { _id: { categoryId: ids.beta, status: "Unpublished" }, count: 3 },
    ]
  );

  assert.equal(result[0].totalVendors, 4);
  assert.deepEqual(result[0].statusCounts, { Published: 4, Pending: 9 });
  assert.equal(result[1].totalVendors, 0);
  assert.deepEqual(result[1].statusCounts, { Draft: 12, Unpublished: 3 });
  assert.equal(result[1].visibleToVendor, false);
  assert.equal(result[1].onboardingEnabled, false);
});

test("category popularity sorts by count, case-insensitive name, then stable category ID", () => {
  const result = buildPublishedCategoryCounts(
    [
      { _id: ids.delta, name: "zero Zebra" },
      { _id: ids.gamma, name: "zero Alpha" },
      { _id: ids.beta, name: "beauty" },
      { _id: ids.alpha, name: "Beauty" },
    ],
    [
      { _id: { categoryId: ids.alpha, status: "Published" }, count: 2 },
      { _id: { categoryId: ids.beta, status: "Published" }, count: 2 },
      { _id: { categoryId: ids.gamma, status: "Pending" }, count: 20 },
    ]
  );

  assert.deepEqual(
    result.map((category) => String(category.categoryId)),
    [String(ids.alpha), String(ids.beta), String(ids.gamma), String(ids.delta)]
  );
  assert.deepEqual(result.map((category) => category.totalVendors), [2, 2, 0, 0]);
});

test("category popularity returns every category with its original identity", () => {
  const result = buildPublishedCategoryCounts(
    [{ _id: ids.gamma, name: "Services", imageUrl: "services.png" }],
    []
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].categoryId, ids.gamma);
  assert.equal(result[0].name, "Services");
  assert.equal(result[0].imageUrl, "services.png");
  assert.equal(result[0].totalVendors, 0);
});

test("category counts endpoint returns all categories ordered by Published vendors", async (t) => {
  const aggregatePipelines = [];
  t.mock.method(DummyVendor, "aggregate", async (pipeline) => {
    aggregatePipelines.push(pipeline);
    return [
      { _id: { categoryId: ids.alpha, status: "Pending" }, count: 50 },
      { _id: { categoryId: ids.alpha, status: "Published" }, count: 1 },
      { _id: { categoryId: ids.beta, status: "Published" }, count: 3 },
    ];
  });
  t.mock.method(DummyCategory, "find", (query) => {
    assert.deepEqual(query, {});
    return {
      lean: async () => [
        { _id: ids.alpha, name: "Alpha" },
        { _id: ids.beta, name: "Beta" },
        { _id: ids.gamma, name: "Gamma" },
      ],
    };
  });

  const routeLayer = dummyVendorRoutes.stack.find(
    (layer) => layer.route?.path === "/categories/counts"
  );
  assert.ok(routeLayer, "category counts route must remain registered");
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  await routeLayer.route.stack[0].handle({ query: {} }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.body.map(({ categoryId, totalVendors }) => ({
      categoryId: String(categoryId),
      totalVendors,
    })),
    [
      { categoryId: String(ids.beta), totalVendors: 3 },
      { categoryId: String(ids.alpha), totalVendors: 1 },
      { categoryId: String(ids.gamma), totalVendors: 0 },
    ]
  );
  assert.equal(aggregatePipelines.length, 1);
  assert.deepEqual(aggregatePipelines[0][0], { $match: {} });
  assert.deepEqual(aggregatePipelines[0][1], {
    $group: {
      _id: { categoryId: "$categoryId", status: "$status" },
      count: { $sum: 1 },
    },
  });
});
