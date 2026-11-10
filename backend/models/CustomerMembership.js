const mongoose = require("mongoose");

const MEMBERSHIP_TYPES = ["DISCOUNT", "SERVICE_QUOTA", "PREPAID_VALUE", "PREPAID_SESSIONS"];
const MEMBERSHIP_STATUSES = ["ACTIVE", "SCHEDULED", "DEPLETED", "EXPIRED", "CANCELLED"];
const PAYMENT_METHODS = ["CASH", "UPI", "CARD", "ONLINE"];
const BENEFIT_SEMANTICS = ["LEGACY_NON_MEMBERSHIP_FLAGS", "MEMBERSHIP_ITEM_FLAGS_V1"];
const PREPAID_ITEM_SOURCES = ["vendor_price_node", "vendor_menu_node", "custom_package"];
const PREPAID_ITEM_KINDS = ["SERVICE", "PACKAGE"];

const safeIntegerPaise = {
  type: Number,
  min: 0,
  validate: {
    validator: Number.isSafeInteger,
    message: "amount must be integer paise",
  },
};

const safeIntegerQuantity = {
  type: Number,
  min: 0,
  validate: {
    validator: Number.isSafeInteger,
    message: "quantity must be a safe integer",
  },
};

const PrepaidSessionsSnapshotSchema = new mongoose.Schema(
  {
    eligibleItemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    eligibleItemSource: { type: String, enum: PREPAID_ITEM_SOURCES, required: true },
    eligibleItemKind: { type: String, enum: PREPAID_ITEM_KINDS, required: true },
    itemName: { type: String, required: true, trim: true, maxlength: 300 },
    unitPricePaise: { ...safeIntegerPaise, required: true },
    categoryPath: { type: [String], default: [] },
    packageIncludes: { type: String, trim: true, default: "", maxlength: 4000 },
    terms: { type: String, trim: true, default: "", maxlength: 4000 },
    paidQuantity: { ...safeIntegerQuantity, required: true, min: 1 },
    creditedQuantity: { ...safeIntegerQuantity, required: true, min: 1 },
    enrolledAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false, minimize: false }
);

const PrepaidValueSnapshotSchema = new mongoose.Schema(
  {
    paidAmountPaise: { ...safeIntegerPaise, required: true },
    creditedAmountPaise: { ...safeIntegerPaise, required: true },
    bonusAmountPaise: { ...safeIntegerPaise, required: true },
    enrolledAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false, minimize: false }
);

const PlanSnapshotSchema = new mongoose.Schema(
  {
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    duration: {
      type: String,
      enum: ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL"],
      required: true,
    },
    sellingPrice: {
      type: Number,
      min: 0,
      required: true,
    },
    discountPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    eligibleMenuItemIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
    minimumBillAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    applyDiscountOnNonMembershipItems: {
      type: Boolean,
      default: false,
    },
    rewardsOnNonMembershipItems: {
      type: Boolean,
      default: true,
    },
    allowAdditionalDiscountOnMembershipItems: {
      type: Boolean,
      default: false,
    },
    allowRewardsOnMembershipItems: {
      type: Boolean,
      default: false,
    },
    benefitSemanticsVersion: {
      type: String,
      enum: BENEFIT_SEMANTICS,
      default: "MEMBERSHIP_ITEM_FLAGS_V1",
    },
    serviceQuotaConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    prepaidValueConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    prepaidSessionsConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
  },
  { _id: false }
);

const CustomerMembershipSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    customerMobileSnapshot: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    membershipPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MembershipPlan",
      required: true,
      index: true,
    },
    renewedFromMembershipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerMembership",
      default: null,
    },
    renewalRecordedAt: {
      type: Date,
      default: null,
    },
    membershipType: {
      type: String,
      enum: MEMBERSHIP_TYPES,
      required: true,
      default: "DISCOUNT",
    },
    enrollmentIdempotencyKey: {
      type: String,
      trim: true,
      maxlength: 160,
      default: "",
      immutable: true,
    },
    enrollmentRequestFingerprint: {
      type: String,
      trim: true,
      maxlength: 64,
      default: "",
      immutable: true,
      select: false,
    },
    planSnapshot: {
      type: PlanSnapshotSchema,
      required: true,
    },
    prepaidSessionsSnapshot: {
      type: PrepaidSessionsSnapshotSchema,
      default: undefined,
      immutable: true,
    },
    prepaidValueSnapshot: {
      type: PrepaidValueSnapshotSchema,
      default: undefined,
      immutable: true,
    },
    serviceEligibilityOverride: {
      eligibleMenuItemIds: {
        type: [mongoose.Schema.Types.ObjectId],
        default: undefined,
      },
      revisionId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      appliedAt: {
        type: Date,
        default: null,
      },
      appliedBy: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      source: {
        type: String,
        enum: ["PLAN_SERVICE_ELIGIBILITY_UPDATE"],
        default: undefined,
      },
    },
    benefitRulesOverride: {
      allowAdditionalDiscountOnMembershipItems: {
        type: Boolean,
        default: undefined,
      },
      allowRewardsOnMembershipItems: {
        type: Boolean,
        default: undefined,
      },
      benefitSemanticsVersion: {
        type: String,
        enum: BENEFIT_SEMANTICS,
        default: undefined,
      },
      revisionId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      source: {
        type: String,
        enum: ["PLAN_BENEFIT_RULES_UPDATE"],
        default: undefined,
      },
    },
    sellingPriceAtPurchase: {
      type: Number,
      min: 0,
      required: true,
    },
    activatedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: MEMBERSHIP_STATUSES,
      required: true,
      default: "ACTIVE",
      index: true,
    },
    payment: {
      method: {
        type: String,
        enum: PAYMENT_METHODS,
        required: true,
      },
      reference: {
        type: String,
        trim: true,
        default: "",
        maxlength: 160,
      },
      amount: {
        type: Number,
        min: 0,
        required: true,
      },
    },
    createdBy: {
      authType: {
        type: String,
        enum: ["vendor", "admin"],
        default: "vendor",
      },
      customerId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      adminId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
    },
  },
  { timestamps: true }
);

CustomerMembershipSchema.index({ vendorId: 1, customerId: 1, status: 1, expiresAt: -1 });
CustomerMembershipSchema.index({ vendorId: 1, createdAt: -1, _id: -1 });
CustomerMembershipSchema.index({ vendorId: 1, customerId: 1, activatedAt: 1, expiresAt: 1 });
CustomerMembershipSchema.index(
  { vendorId: 1, customerId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "ACTIVE",
      membershipType: "DISCOUNT",
    },
    name: "customer_membership_active_discount_unique",
  }
);
CustomerMembershipSchema.index(
  { vendorId: 1, customerId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "ACTIVE",
      membershipType: { $in: ["PREPAID_VALUE", "PREPAID_SESSIONS"] },
    },
    name: "customer_membership_active_prepaid_unique",
  }
);
CustomerMembershipSchema.index(
  { vendorId: 1, enrollmentIdempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { enrollmentIdempotencyKey: { $gt: "" } },
    name: "prepaid_membership_enrollment_idempotency_unique",
  }
);

CustomerMembershipSchema.pre("validate", function validatePrepaidSnapshot(next) {
  if (this.membershipType === "PREPAID_SESSIONS") {
    const snapshot = this.prepaidSessionsSnapshot;
    if (
      !snapshot ||
      !Number.isSafeInteger(snapshot.paidQuantity) ||
      snapshot.paidQuantity < 1 ||
      !Number.isSafeInteger(snapshot.creditedQuantity) ||
      snapshot.creditedQuantity < snapshot.paidQuantity
    ) {
      this.invalidate(
        "prepaidSessionsSnapshot",
        "PREPAID_SESSIONS requires an immutable item snapshot and valid quantities"
      );
    }
  }

  if (this.membershipType === "PREPAID_VALUE") {
    const snapshot = this.prepaidValueSnapshot;
    if (
      !snapshot ||
      (
        !Number.isSafeInteger(snapshot.paidAmountPaise) ||
        !Number.isSafeInteger(snapshot.creditedAmountPaise) ||
        !Number.isSafeInteger(snapshot.bonusAmountPaise) ||
        snapshot.creditedAmountPaise !== snapshot.paidAmountPaise + snapshot.bonusAmountPaise
      )
    ) {
      this.invalidate(
        "prepaidValueSnapshot",
        "PREPAID_VALUE requires immutable paid, credited, and bonus amounts in paise"
      );
    }
  }
  next();
});
CustomerMembershipSchema.index(
  { renewedFromMembershipId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      renewedFromMembershipId: { $exists: true, $type: "objectId" },
    },
    name: "customer_membership_renewal_lineage_unique",
  }
);

CustomerMembershipSchema.statics.constants = {
  MEMBERSHIP_TYPES,
  MEMBERSHIP_STATUSES,
  PAYMENT_METHODS,
  BENEFIT_SEMANTICS,
  PREPAID_ITEM_SOURCES,
  PREPAID_ITEM_KINDS,
};

module.exports = mongoose.model("CustomerMembership", CustomerMembershipSchema);
