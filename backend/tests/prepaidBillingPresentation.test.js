const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const {
  buildPrepaidBillingPresentation,
} = require("../services/prepaidBillingPresentation");

test("prepaid value presentation uses persisted settlement amount without exposing audit IDs", () => {
  const presentation = buildPrepaidBillingPresentation({
    bill: {
      paymentMode: "PREPAID_VALUE",
      prepaidSettlementSnapshot: {
        walletType: "PREPAID_VALUE",
        authorizedAmountPaise: 20000,
        walletId: new mongoose.Types.ObjectId(),
        authorizationId: new mongoose.Types.ObjectId(),
        redemptionLedgerId: new mongoose.Types.ObjectId(),
      },
    },
    transaction: { finalPaidAmount: 0 },
  });

  assert.deepEqual(presentation, {
    paymentMode: "PREPAID_VALUE",
    paymentMethodLabel: "Prepaid Wallet",
    redeemedAmountPaise: 20000,
    balanceDuePaise: 0,
  });
  assert.equal("walletId" in presentation, false);
  assert.equal("authorizationId" in presentation, false);
  assert.equal("redemptionLedgerId" in presentation, false);
});

test("prepaid sessions presentation matches the persisted canonical item identity", () => {
  const itemId = new mongoose.Types.ObjectId();
  const presentation = buildPrepaidBillingPresentation({
    bill: {
      paymentMode: "PREPAID_SESSIONS",
      status: "CANCELLED",
      cartItems: [
        {
          itemId,
          itemSource: "custom_package",
          name: "Bridal Care Combo",
          qty: 2,
        },
      ],
      prepaidSettlementSnapshot: {
        walletType: "PREPAID_SESSIONS",
        authorizedQuantity: 2,
        eligibleItemId: itemId,
        eligibleItemSource: "custom_package",
      },
    },
  });

  assert.deepEqual(presentation, {
    paymentMode: "PREPAID_SESSIONS",
    paymentMethodLabel: "Prepaid Package",
    redeemedQuantity: 2,
    redeemedItemName: "Bridal Care Combo",
    balanceDuePaise: 0,
  });
});

test("ordinary payments and inconsistent prepaid snapshots do not fabricate settlement presentation", () => {
  assert.equal(
    buildPrepaidBillingPresentation({
      bill: { paymentMode: "CASH" },
      transaction: { finalPaidAmount: 0 },
    }),
    null
  );
  assert.equal(
    buildPrepaidBillingPresentation({
      bill: {
        paymentMode: "PREPAID_VALUE",
        prepaidSettlementSnapshot: {
          walletType: "PREPAID_SESSIONS",
          authorizedQuantity: 1,
        },
      },
    }),
    null
  );
  assert.equal(
    buildPrepaidBillingPresentation({
      bill: {
        paymentMode: "PREPAID_VALUE",
        prepaidSettlementSnapshot: {
          walletType: "PREPAID_VALUE",
          authorizedAmountPaise: 0,
        },
      },
    }),
    null
  );
});
