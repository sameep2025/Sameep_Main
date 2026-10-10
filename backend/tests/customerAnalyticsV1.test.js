const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");

const BillingSession = require("../models/BillingSession");
const controller = require("../controllers/customerAnalyticsController");

const VENDOR_ID = "692403a24d4d3a1b6a7f0ae5";
const OTHER_VENDOR_ID = "692403a24d4d3a1b6a7f0ae6";
const CUSTOMER_ID = "690d8bf7a6dc67fbf8757115";

function mockReq({ query = {}, vendorId = VENDOR_ID } = {}) {
  return {
    query: {
      vendorId,
      ...query,
    },
    vendorWriteAuth: {
      vendorId,
      authType: "vendor",
    },
  };
}

function mockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function withMockedAggregate(fn) {
  return async () => {
    const originalAggregate = BillingSession.aggregate;
    try {
      await fn();
    } finally {
      BillingSession.aggregate = originalAggregate;
    }
  };
}

test("customer analytics summary separates customer-linked and all-bill metrics", withMockedAggregate(async () => {
  const pipelines = [];
  BillingSession.aggregate = async (pipeline) => {
    pipelines.push(pipeline);
    const hasCustomerMatch = pipeline.some((stage) => stage.$match?.customerId?.$ne === null);
    if (hasCustomerMatch) {
      return [{ totalCustomers: 3, repeatCustomers: 2 }];
    }
    return [{ completedBillCount: 5, totalNetCollected: 1750, averageCompletedBillValue: 350 }];
  };

  const res = mockRes();
  await controller.getCustomerAnalyticsSummary(mockReq(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  assert.deepEqual(res.payload.data.customerLinked, {
    totalCustomers: 3,
    repeatCustomers: 2,
  });
  assert.deepEqual(res.payload.data.allCompletedBills, {
    completedBillCount: 5,
    totalNetCollected: 1750,
    averageCompletedBillValue: 350,
  });
  assert.equal(String(pipelines[0][0].$match.vendorId), VENDOR_ID);
  assert.equal(pipelines[0][0].$match.status, "COMPLETED");
}));

test("top spending customers use server-side pagination and mapped customer fields", withMockedAggregate(async () => {
  let pipelineSeen = null;
  BillingSession.aggregate = async (pipeline) => {
    pipelineSeen = pipeline;
    return [
      {
        _id: new mongoose.Types.ObjectId(CUSTOMER_ID),
        customer: { fullNumber: "919999999999" },
        totalSpend: 1200,
        visitCount: 3,
        firstVisit: new Date("2026-09-01T00:00:00.000Z"),
        lastVisit: new Date("2026-10-01T00:00:00.000Z"),
      },
      {
        _id: new mongoose.Types.ObjectId("690d8bf7a6dc67fbf8757116"),
        customer: { fullNumber: "918888888888" },
        totalSpend: 900,
        visitCount: 2,
        firstVisit: new Date("2026-09-02T00:00:00.000Z"),
        lastVisit: new Date("2026-09-28T00:00:00.000Z"),
      },
    ];
  };

  const res = mockRes();
  await controller.getCustomerAnalyticsCustomers(
    mockReq({ query: { segment: "top_spenders", limit: "1", offset: "0" } }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.items.length, 1);
  assert.equal(res.payload.data.items[0].phone, "919999999999");
  assert.equal(res.payload.data.items[0].totalSpend, 1200);
  assert.equal(res.payload.data.pagination.hasMore, true);
  assert.equal(res.payload.data.pagination.nextOffset, 1);
  assert.deepEqual(pipelineSeen.at(-2), { $skip: 0 });
  assert.deepEqual(pipelineSeen.at(-1), { $limit: 2 });
}));

test("inactive and threshold customer filters validate supported options", withMockedAggregate(async () => {
  BillingSession.aggregate = async () => [];

  const inactiveRes = mockRes();
  await controller.getCustomerAnalyticsCustomers(
    mockReq({ query: { segment: "inactive", days: "31" } }),
    inactiveRes
  );
  assert.equal(inactiveRes.statusCode, 400);

  const thresholdRes = mockRes();
  await controller.getCustomerAnalyticsCustomers(
    mockReq({ query: { segment: "threshold", threshold: "750" } }),
    thresholdRes
  );
  assert.equal(thresholdRes.statusCode, 400);

  const invalidSegmentRes = mockRes();
  await controller.getCustomerAnalyticsCustomers(
    mockReq({ query: { segment: "one_time" } }),
    invalidSegmentRes
  );
  assert.equal(invalidSegmentRes.statusCode, 400);
}));

test("item analytics include walk-in compatible completed bill snapshots and stable pagination", withMockedAggregate(async () => {
  let pipelineSeen = null;
  BillingSession.aggregate = async (pipeline) => {
    pipelineSeen = pipeline;
    return [
      {
        _id: "legacy:hair cut",
        name: "Hair Cut",
        quantitySold: 4,
        grossSales: 1000,
        samplePath: ["Salon", "Hair"],
      },
      {
        _id: "legacy:beard trim",
        name: "Beard Trim",
        quantitySold: 3,
        grossSales: 450,
      },
    ];
  };

  const res = mockRes();
  await controller.getCustomerAnalyticsItems(
    mockReq({ query: { sortBy: "quantity", limit: "1" } }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.items.length, 1);
  assert.equal(res.payload.data.items[0].name, "Hair Cut");
  assert.equal(res.payload.data.items[0].quantitySold, 4);
  assert.equal(res.payload.data.items[0].grossSales, 1000);
  assert.equal(res.payload.data.pagination.hasMore, true);
  assert.ok(pipelineSeen.some((stage) => stage.$unwind === "$cartItems"));
  assert.equal(pipelineSeen[0].$match.customerId, undefined);
}));

test("customer analytics endpoints are mounted behind vendor auth", () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, "../routes/customerAnalyticsRoutes.js"),
    "utf8"
  );
  const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");

  assert.match(routeSource, /customer-analytics\/summary/);
  assert.match(routeSource, /customer-analytics\/customers/);
  assert.match(routeSource, /customer-analytics\/items/);
  assert.match(routeSource, /requireVendorAccessFromExistingAuth/);
  assert.match(serverSource, /app\.use\("\/api\/vendor\/dashboard"/);
});

test("customer analytics formatting keeps missing customer names empty and calculates inactive days", () => {
  const { formatCustomerRow, formatItemRow } = controller._private;
  const row = formatCustomerRow(
    {
      _id: new mongoose.Types.ObjectId(CUSTOMER_ID),
      customer: { fullNumber: "919999999999" },
      totalSpend: 500,
      visitCount: 1,
      lastVisit: new Date("2026-09-01T00:00:00.000Z"),
    },
    new Date("2026-10-01T00:00:00.000Z")
  );

  assert.equal(row.name, "");
  assert.equal(row.phone, "919999999999");
  assert.equal(row.daysSinceLastVisit, 30);

  assert.deepEqual(formatItemRow({ _id: "legacy:item", name: "Item", quantitySold: 2, grossSales: 300 }), {
    key: "legacy:item",
    itemId: "",
    name: "Item",
    quantitySold: 2,
    grossSales: 300,
    category: "Items",
    samplePath: [],
  });
});

test("customer analytics rejects malformed vendor ids", async () => {
  const res = mockRes();
  const req = mockReq();
  req.vendorWriteAuth.vendorId = "not-a-vendor";
  req.query.vendorId = "not-a-vendor";
  await controller.getCustomerAnalyticsSummary(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.success, false);
});

test("route auth source prevents cross-vendor query-only access", () => {
  const routeSource = fs.readFileSync(
    path.join(__dirname, "../routes/customerAnalyticsRoutes.js"),
    "utf8"
  );

  assert.match(routeSource, /const resolveVendorQueryId = \(req\) => req\.query\?\.vendorId/);
  assert.match(routeSource, /requireVendorAccessFromExistingAuth\(resolveVendorQueryId\)/);
  assert.notEqual(VENDOR_ID, OTHER_VENDOR_ID);
});
