const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  getPrepaidRevenueDaily,
  getPrepaidRevenueMonthly,
  getPrepaidRevenueSummary,
  normalizeReportingRows,
} = require("../services/prepaidRevenueReportingService");
const {
  REPORTING_TIMEZONE,
  getIstDayBounds,
  getIstMonthKey,
  getIstRollingMonthWindow,
} = require("../services/revenueReportingTimezone");

const vendorId = "690000000000000000000001";

test("reporting keeps service activity, fresh collections, and wallet use separate", () => {
  const result = normalizeReportingRows(
    {
      serviceActivityPaise: 159000,
      ordinaryFreshCollectionsPaise: 59000,
      prepaidServiceActivityPaise: 100000,
      valueWalletRedemptionBills: 1,
      valueWalletUsedPaise: 75000,
      sessionWalletRedemptionBills: 1,
      sessionsUsed: 2,
      sessionServiceActivityPaise: 25000,
    },
    {
      membershipsSold: 2,
      membershipsRenewed: 1,
      membershipCollectionsPaise: 1200000,
      prepaidValueCollectionsPaise: 900000,
      prepaidSessionsCollectionsPaise: 300000,
      membershipCashCollectionsPaise: 400000,
      membershipOnlineCollectionsPaise: 300000,
      membershipUpiCollectionsPaise: 300000,
      membershipCardCollectionsPaise: 200000,
    }
  );

  assert.equal(result.serviceActivity, 1590);
  assert.equal(result.ordinaryFreshCollections, 590);
  assert.equal(result.membershipCollections, 12000);
  assert.equal(result.freshCollections, 12590);
  assert.equal(result.prepaidServiceActivity, 1000);
  assert.equal(result.valueWalletUsed, 750);
  assert.equal(result.sessionsUsed, 2);
  assert.equal(result.sessionServiceActivity, 250);
  assert.equal(result.membershipsSold, 2);
  assert.equal(result.membershipsRenewed, 1);
  assert.equal(result.membershipCashCollections, 4000);
  assert.equal(result.membershipOnlineCollections, 3000);
  assert.equal(result.membershipUpiCollections, 3000);
  assert.equal(result.membershipCardCollections, 2000);
});

test("cancelled redemptions remain audit metrics but are excluded from net activity", () => {
  const result = normalizeReportingRows({
    serviceActivityPaise: 0,
    prepaidServiceActivityPaise: 0,
    valueWalletUsedPaise: 0,
    sessionsUsed: 0,
    reversedValueWalletBills: 1,
    reversedValueWalletPaise: 50000,
    reversedSessionBills: 1,
    reversedSessions: 2,
  });
  assert.equal(result.prepaidServiceActivity, 0);
  assert.equal(result.valueWalletUsed, 0);
  assert.equal(result.sessionsUsed, 0);
  assert.equal(result.reversedValueWallet, 500);
  assert.equal(result.reversedSessions, 2);
});

test("historical records without prepaid fields normalize to zero without feature gates", () => {
  assert.deepEqual(normalizeReportingRows(), {
    serviceActivity: 0,
    freshCollections: 0,
    ordinaryFreshCollections: 0,
    membershipCollections: 0,
    membershipsSold: 0,
    membershipsRenewed: 0,
    prepaidValueCollections: 0,
    prepaidSessionsCollections: 0,
    membershipCashCollections: 0,
    membershipOnlineCollections: 0,
    membershipUpiCollections: 0,
    membershipCardCollections: 0,
    prepaidServiceActivity: 0,
    valueWalletRedemptionBills: 0,
    valueWalletUsed: 0,
    sessionWalletRedemptionBills: 0,
    sessionsUsed: 0,
    sessionServiceActivity: 0,
    reversedValueWalletBills: 0,
    reversedValueWallet: 0,
    reversedSessionBills: 0,
    reversedSessions: 0,
  });
  const source = fs.readFileSync(
    path.join(__dirname, "../services/prepaidRevenueReportingService.js"),
    "utf8"
  );
  assert.doesNotMatch(source, /PREPAID_MEMBERSHIP_WALLETS_ENABLED|PREPAID_WALLET_REDEMPTION_ENABLED/);
  assert.match(source, /payment\.amount/);
  assert.doesNotMatch(source, /creditedAmountPaise.*membershipCollectionsPaise/);
});

test("reporting fails explicitly instead of returning zero metrics without MongoDB", async () => {
  await assert.rejects(
    getPrepaidRevenueSummary({ vendorId }),
    /requires an active database connection/
  );
  await assert.rejects(
    getPrepaidRevenueMonthly({ vendorId }),
    /requires an active database connection/
  );
  await assert.rejects(
    getPrepaidRevenueDaily({ vendorId }),
    /requires an active database connection/
  );
});

test("daily prepaid reporting groups purchases, redemptions, and reversals in IST", async () => {
  let billPipeline;
  let membershipPipeline;
  const BillingSessionModel = { aggregate: async (pipeline) => {
    billPipeline = pipeline;
    return [{
      _id: "2026-11-01",
      prepaidServiceActivityPaise: 50000,
      valueWalletUsedPaise: 50000,
      reversedValueWalletBills: 1,
      reversedValueWalletPaise: 25000,
    }];
  } };
  const CustomerMembershipModel = { aggregate: async (pipeline) => {
    membershipPipeline = pipeline;
    return [{
      _id: "2026-11-01",
      membershipsSold: 1,
      membershipCollectionsPaise: 100000,
    }];
  } };
  const from = new Date("2026-10-31T18:30:00.000Z");
  const to = new Date("2026-11-01T18:30:00.000Z");
  const days = await getPrepaidRevenueDaily({
    vendorId,
    from,
    to,
    BillingSessionModel,
    CustomerMembershipModel,
  });

  assert.equal(days.get("2026-11-01").membershipCollections, 1000);
  assert.equal(days.get("2026-11-01").valueWalletUsed, 500);
  assert.equal(days.get("2026-11-01").reversedValueWallet, 250);
  assert.equal(billPipeline[0].$match.createdAt.$gte.toISOString(), from.toISOString());
  assert.equal(billPipeline[0].$match.createdAt.$lt.toISOString(), to.toISOString());
  assert.equal(billPipeline.at(-1).$group._id.$dateToString.timezone, REPORTING_TIMEZONE);
  assert.equal(
    membershipPipeline.at(-1).$group._id.$dateToString.timezone,
    REPORTING_TIMEZONE
  );
});

test("summary queries are vendor/date scoped and aggregate persisted payment records once", async () => {
  let billPipeline;
  let membershipPipeline;
  const BillingSessionModel = { aggregate: async (pipeline) => {
    billPipeline = pipeline;
    return [{ ordinaryFreshCollectionsPaise: 10000, valueWalletUsedPaise: 5000 }];
  } };
  const CustomerMembershipModel = { aggregate: async (pipeline) => {
    membershipPipeline = pipeline;
    return [{ membershipsSold: 1, membershipCollectionsPaise: 20000 }];
  } };
  const from = new Date("2026-11-01T00:00:00.000Z");
  const to = new Date("2026-12-01T00:00:00.000Z");
  const result = await getPrepaidRevenueSummary({
    vendorId,
    from,
    to,
    inclusiveTo: true,
    BillingSessionModel,
    CustomerMembershipModel,
  });
  assert.equal(result.freshCollections, 300);
  assert.equal(result.valueWalletUsed, 50);
  assert.equal(String(billPipeline[0].$match.vendorId), vendorId);
  assert.equal(billPipeline[0].$match.createdAt.$gte.toISOString(), from.toISOString());
  assert.equal(billPipeline[0].$match.createdAt.$lte.toISOString(), to.toISOString());
  assert.deepEqual(membershipPipeline[0].$match.membershipType.$in, [
    "PREPAID_VALUE",
    "PREPAID_SESSIONS",
  ]);
});

test("monthly reporting keeps enrollment and redemption events in their own months", async () => {
  let billPipeline;
  let membershipPipeline;
  const BillingSessionModel = { aggregate: async (pipeline) => {
    billPipeline = pipeline;
    return [{
      _id: "2026-11",
      prepaidServiceActivityPaise: 50000,
      valueWalletUsedPaise: 50000,
    }];
  } };
  const CustomerMembershipModel = { aggregate: async (pipeline) => {
    membershipPipeline = pipeline;
    return [{
      _id: "2026-10",
      membershipsSold: 1,
      membershipsRenewed: 1,
      membershipCollectionsPaise: 100000,
    }];
  } };
  const from = new Date("2026-09-30T18:30:00.000Z");
  const to = new Date("2026-11-30T18:30:00.000Z");
  const months = await getPrepaidRevenueMonthly({
    vendorId,
    from,
    to,
    BillingSessionModel,
    CustomerMembershipModel,
  });
  assert.equal(months.get("2026-10").membershipCollections, 1000);
  assert.equal(months.get("2026-10").membershipsRenewed, 1);
  assert.equal(months.get("2026-10").prepaidServiceActivity, 0);
  assert.equal(months.get("2026-11").membershipCollections, 0);
  assert.equal(months.get("2026-11").prepaidServiceActivity, 500);
  assert.equal(billPipeline[0].$match.createdAt.$gte.toISOString(), from.toISOString());
  assert.equal(billPipeline[0].$match.createdAt.$lt.toISOString(), to.toISOString());
  assert.equal(membershipPipeline[0].$match.createdAt.$lt.toISOString(), to.toISOString());
  assert.equal(billPipeline.at(-1).$group._id.$dateToString.timezone, REPORTING_TIMEZONE);
  assert.equal(
    membershipPipeline.at(-1).$group._id.$dateToString.timezone,
    REPORTING_TIMEZONE
  );
});

test("IST month keys change exactly at October-November and December-January boundaries", () => {
  assert.equal(getIstMonthKey("2026-10-31T18:29:59.999Z"), "2026-10");
  assert.equal(getIstMonthKey("2026-10-31T18:30:00.000Z"), "2026-11");
  assert.equal(getIstMonthKey("2026-12-31T18:29:59.999Z"), "2026-12");
  assert.equal(getIstMonthKey("2026-12-31T18:30:00.000Z"), "2027-01");
});

test("IST daily and rolling month ranges use exclusive UTC boundaries without gaps", () => {
  const day = getIstDayBounds(new Date("2026-11-01T12:00:00.000Z"));
  assert.equal(day.start.toISOString(), "2026-10-31T18:30:00.000Z");
  assert.equal(day.endExclusive.toISOString(), "2026-11-01T18:30:00.000Z");

  const rolling = getIstRollingMonthWindow(new Date("2027-01-15T12:00:00.000Z"), 12);
  assert.equal(rolling.start.toISOString(), "2026-01-31T18:30:00.000Z");
  assert.equal(rolling.endExclusive.toISOString(), "2027-01-31T18:30:00.000Z");
  assert.equal(rolling.months[0].monthKey, "2026-02");
  assert.equal(rolling.months.at(-1).monthKey, "2027-01");
  for (let index = 1; index < rolling.months.length; index += 1) {
    assert.equal(
      rolling.months[index - 1].endExclusive.toISOString(),
      rolling.months[index].start.toISOString()
    );
  }
});

test("cancellation reversals retain original bill-date attribution", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../services/prepaidRevenueReportingService.js"),
    "utf8"
  );
  assert.match(source, /buildDateMatch\("createdAt", from, to/);
  assert.doesNotMatch(source, /buildDateMatch\("cancelledAt"/);
});

test("dashboard reporting routes require existing vendor authorization", () => {
  const routes = fs.readFileSync(
    path.join(__dirname, "../routes/vendorDashboardRoutes.js"),
    "utf8"
  );
  assert.match(routes, /requireVendorAccessFromExistingAuth/);
  assert.match(routes, /router\.get\("\/daily-trend", requireDashboardAccess/);
  assert.match(routes, /router\.get\("\/bills-summary", requireDashboardAccess/);
  assert.match(routes, /router\.get\("\/bills", requireDashboardAccess/);
  assert.match(routes, /router\.get\("\/fy-monthly", requireDashboardAccess/);
  assert.match(routes, /router\.get\("\/stylist-performance", requireDashboardAccess/);
});
