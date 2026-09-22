const assert = require("node:assert");
const test = require("node:test");
const mongoose = require("mongoose");

const BillingSession = require("../models/BillingSession");
const Customer = require("../models/Customer");
const DummyVendor = require("../models/DummyVendor");
const {
  getBillingAnalytics,
  getCustomerDrilldownAnalytics,
  normalizeVendorStatusFilter,
} = require("../services/adminAnalyticsService");

test("admin analytics normalizes and validates vendor status filters", () => {
  assert.strictEqual(normalizeVendorStatusFilter(), "all");
  assert.strictEqual(normalizeVendorStatusFilter("all"), "all");
  assert.strictEqual(normalizeVendorStatusFilter("Published"), "Published");

  assert.throws(
    () => normalizeVendorStatusFilter("dummyvendors"),
    (error) => error.code === "invalid_vendor_status" && error.statusCode === 400
  );
});

test("billing analytics applies DummyVendor status filter to completed bill matches", async (t) => {
  const publishedVendorId = new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae5");
  const aggregatePipelines = [];
  const vendorFindQueries = [];

  t.mock.method(DummyVendor, "find", (query) => {
    vendorFindQueries.push(query);
    return {
      distinct: async (field) => {
        assert.strictEqual(field, "_id");
        return [publishedVendorId];
      },
    };
  });

  t.mock.method(BillingSession, "aggregate", async (pipeline) => {
    aggregatePipelines.push(pipeline);
    return [];
  });

  const result = await getBillingAnalytics({
    period: "today",
    vendorStatus: "Published",
  });

  assert.strictEqual(result.vendorStatus, "Published");
  assert.deepStrictEqual(vendorFindQueries, [{ status: "Published" }]);
  assert.ok(aggregatePipelines.length >= 3);

  aggregatePipelines.forEach((pipeline) => {
    const matchStage = pipeline[0]?.$match;
    assert.strictEqual(matchStage.status, "COMPLETED");
    assert.deepStrictEqual(matchStage.vendorId, { $in: [publishedVendorId] });
  });
});

test("customer drilldown uses completed bills, vendor status, search, and pagination", async (t) => {
  const vendorId = new mongoose.Types.ObjectId("692403a24d4d3a1b6a7f0ae5");
  const customerId = new mongoose.Types.ObjectId("690d8bf7a6dc67fbf8757115");
  const aggregatePipelines = [];
  const customerFindQueries = [];

  t.mock.method(DummyVendor, "find", (query) => ({
    distinct: async (field) => {
      assert.strictEqual(field, "_id");
      assert.deepStrictEqual(query, { status: "Registered" });
      return [vendorId];
    },
  }));

  t.mock.method(Customer, "find", (query, projection) => {
    customerFindQueries.push({ query, projection });
    return {
      limit(limitValue) {
        assert.strictEqual(limitValue, 1000);
        return {
          lean: async () => [{ _id: customerId }],
        };
      },
    };
  });

  t.mock.method(BillingSession, "aggregate", async (pipeline) => {
    aggregatePipelines.push(pipeline);
    return [
      {
        metadata: [{ total: 1 }],
        data: [
          {
            customerId,
            fullNumber: "919381520396",
            totalCompletedBills: 2,
            distinctVendorCount: 1,
            billingValue: 2000,
            vendors: [
              {
                vendorId,
                businessName: "Sample Vendor",
                vendorStatus: "Registered",
                completedBills: 2,
                billingValue: 2000,
              },
            ],
          },
        ],
      },
    ];
  });

  const result = await getCustomerDrilldownAnalytics({
    type: "repeat",
    period: "thisMonth",
    vendorStatus: "Registered",
    page: 2,
    limit: 25,
    search: "93815",
  });

  assert.strictEqual(result.type, "repeat");
  assert.strictEqual(result.vendorStatus, "Registered");
  assert.deepStrictEqual(result.pagination, {
    page: 2,
    limit: 25,
    total: 1,
    totalPages: 1,
  });
  assert.strictEqual(result.rows.length, 1);
  assert.strictEqual(result.rows[0].fullNumber, "919381520396");

  assert.strictEqual(customerFindQueries.length, 1);
  assert.deepStrictEqual(customerFindQueries[0].projection, { _id: 1 });

  const pipeline = aggregatePipelines[0];
  const baseMatch = pipeline[0]?.$match;
  assert.strictEqual(baseMatch.status, "COMPLETED");
  assert.deepStrictEqual(baseMatch.vendorId, { $in: [vendorId] });
  assert.deepStrictEqual(baseMatch.customerId, { $in: [customerId] });

  const qualifyingMatch = pipeline.find((stage) => stage.$match?.totalCompletedBills)?.$match;
  assert.deepStrictEqual(qualifyingMatch, { totalCompletedBills: { $gte: 2 } });
  const facetDataStages = pipeline.at(-1).$facet.data;
  assert.deepStrictEqual(facetDataStages[0], { $skip: 25 });
  assert.deepStrictEqual(facetDataStages[1], { $limit: 25 });
});
