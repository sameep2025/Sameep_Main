const assert = require("node:assert/strict");
const test = require("node:test");

async function loadFormatter() {
  return import("../app/_Explore/gstPreviewDisplay.mjs");
}

test("single-rate intrastate bill displays component and total GST percentages", async () => {
  const { getGstSummaryPercentages } = await loadFormatter();
  const result = getGstSummaryPercentages(
    [
      { taxableValuePaise: 10000, gstRateBps: 1800 },
      { taxableValuePaise: 5000, gstRateBps: 1800 },
    ],
    { cgstPaise: 1350, sgstPaise: 1350, utgstPaise: 0, igstPaise: 0 }
  );

  assert.deepEqual(result, {
    total: "18%",
    cgst: "9%",
    sgst: "9%",
    utgst: null,
    igst: null,
  });
});

test("single-rate UTGST and IGST summaries use returned tax components", async () => {
  const { getGstSummaryPercentages } = await loadFormatter();
  assert.deepEqual(
    getGstSummaryPercentages(
      [{ taxableValuePaise: 10000, gstRateBps: 500 }],
      { cgstPaise: 250, sgstPaise: 0, utgstPaise: 250, igstPaise: 0 }
    ),
    { total: "5%", cgst: "2.5%", sgst: null, utgst: "2.5%", igst: null }
  );
  assert.deepEqual(
    getGstSummaryPercentages(
      [{ taxableValuePaise: 10000, gstRateBps: 1200 }],
      { cgstPaise: 0, sgstPaise: 0, utgstPaise: 0, igstPaise: 1200 }
    ),
    { total: "12%", cgst: null, sgst: null, utgst: null, igst: "12%" }
  );
});

test("mixed-rate bill does not display a misleading summary percentage", async () => {
  const { getGstSummaryPercentages } = await loadFormatter();
  assert.equal(
    getGstSummaryPercentages(
      [
        { taxableValuePaise: 10000, gstRateBps: 500 },
        { taxableValuePaise: 10000, gstRateBps: 1800 },
      ],
      { cgstPaise: 1150, sgstPaise: 1150, utgstPaise: 0, igstPaise: 0 }
    ),
    null
  );
});

