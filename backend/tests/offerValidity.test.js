const assert = require("node:assert");
const test = require("node:test");

const {
  isOfferCurrentlyValid,
  offerDateToStorageValue,
  offerDateToYmd,
  validateOfferDateRange,
} = require("../utils/offerValidity");

test("undated offers remain valid", () => {
  assert.equal(isOfferCurrentlyValid({}, { todayYmd: "2026-10-11" }), true);
});

test("future start dates hide offers until start date", () => {
  const offer = { offerStartDate: offerDateToStorageValue("2026-10-12") };
  assert.equal(isOfferCurrentlyValid(offer, { todayYmd: "2026-10-11" }), false);
  assert.equal(isOfferCurrentlyValid(offer, { todayYmd: "2026-10-12" }), true);
});

test("end dates are inclusive for the whole local calendar day", () => {
  const offer = { offerEndDate: offerDateToStorageValue("2026-10-11") };
  assert.equal(isOfferCurrentlyValid(offer, { todayYmd: "2026-10-11" }), true);
  assert.equal(isOfferCurrentlyValid(offer, { todayYmd: "2026-10-12" }), false);
});

test("invalid date ranges are rejected", () => {
  assert.throws(
    () => validateOfferDateRange("2026-10-12", "2026-10-11"),
    /Offer End Date cannot be earlier/
  );
});

test("storage date values serialize back to date-only strings", () => {
  assert.equal(offerDateToYmd(offerDateToStorageValue("2026-10-11")), "2026-10-11");
});
