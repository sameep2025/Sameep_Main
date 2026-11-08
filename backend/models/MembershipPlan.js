const mongoose = require("mongoose");

const PLAN_TYPES = ["DISCOUNT", "SERVICE_QUOTA", "PREPAID_VALUE", "PREPAID_SESSIONS"];
const DURATIONS = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL"];
const STATUSES = ["ACTIVE", "INACTIVE"];
const BENEFIT_SEMANTICS = ["LEGACY_NON_MEMBERSHIP_FLAGS", "MEMBERSHIP_ITEM_FLAGS_V1"];
const PREPAID_ITEM_SOURCES = ["vendor_price_node", "vendor_menu_node", "custom_package"];
const PREPAID_ITEM_KINDS = ["SERVICE", "PACKAGE"];

const ServiceQuotaBenefitSchema = new mongoose.Schema(
  {
    menuItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    quota: {
      type: Number,
      min: 0,
      default: 0,
    },
    carryForwardUnused: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const PrepaidValueConfigSchema = new mongoose.Schema(
  {
    prepaidValue: {
      type: Number,
      min: 0,
      default: 0,
    },
    bonusValue: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const PrepaidSessionsConfigSchema = new mongoose.Schema(
  {
    eligibleItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    eligibleItemSource: {
      type: String,
      enum: PREPAID_ITEM_SOURCES,
      default: undefined,
    },
    eligibleItemKind: {
      type: String,
      enum: PREPAID_ITEM_KINDS,
      default: undefined,
    },
    paidQuantity: {
      type: Number,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "paid quantity must be a safe integer",
      },
      default: undefined,
    },
    creditedQuantity: {
      type: Number,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "credited quantity must be a safe integer",
      },
      default: undefined,
    },
  },
  { _id: false }
);

const ServiceEligibilityRevisionSchema = new mongoose.Schema(
  {
    revisionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    previousEligibleMenuItemIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
    newEligibleMenuItemIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
    scope: {
      type: String,
      enum: ["ALL_ACTIVE_AND_SCHEDULED", "FUTURE_ONLY"],
      required: true,
    },
    affectedStatuses: {
      type: [String],
      default: [],
    },
    affectedMembershipCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    appliedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { _id: false }
);

const BenefitRulesRevisionSchema = new mongoose.Schema(
  {
    revisionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    previousAllowAdditionalDiscountOnMembershipItems: {
      type: Boolean,
      required: true,
      default: false,
    },
    previousAllowRewardsOnMembershipItems: {
      type: Boolean,
      required: true,
      default: false,
    },
    newAllowAdditionalDiscountOnMembershipItems: {
      type: Boolean,
      required: true,
      default: false,
    },
    newAllowRewardsOnMembershipItems: {
      type: Boolean,
      required: true,
      default: false,
    },
    previousBenefitSemanticsVersion: {
      type: String,
      enum: BENEFIT_SEMANTICS,
      default: "LEGACY_NON_MEMBERSHIP_FLAGS",
    },
    newBenefitSemanticsVersion: {
      type: String,
      enum: BENEFIT_SEMANTICS,
      default: "MEMBERSHIP_ITEM_FLAGS_V1",
    },
    scope: {
      type: String,
      enum: ["ALL_ACTIVE_AND_SCHEDULED", "FUTURE_ONLY"],
      required: true,
    },
    affectedStatuses: {
      type: [String],
      default: [],
    },
    affectedMembershipCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    appliedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { _id: false }
);

const MembershipPlanSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    planType: {
      type: String,
      enum: PLAN_TYPES,
      required: true,
      default: "DISCOUNT",
      immutable: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    duration: {
      type: String,
      enum: DURATIONS,
      required: true,
    },
    sellingPrice: {
      type: Number,
      min: 0,
      required: true,
      default: 0,
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
    status: {
      type: String,
      enum: STATUSES,
      default: "INACTIVE",
      index: true,
    },

    // Phase 1 schema foundation only. These are intentionally not activated by
    // current APIs so sold-plan snapshots and ledgers can be added safely later.
    serviceQuotaConfig: {
      benefits: {
        type: [ServiceQuotaBenefitSchema],
        default: [],
      },
    },
    prepaidValueConfig: {
      type: PrepaidValueConfigSchema,
      default: () => ({}),
    },
    prepaidSessionsConfig: {
      type: PrepaidSessionsConfigSchema,
      default: undefined,
    },
    audit: {
      createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
    },
    serviceEligibilityRevisions: {
      type: [ServiceEligibilityRevisionSchema],
      default: [],
    },
    benefitRulesRevisions: {
      type: [BenefitRulesRevisionSchema],
      default: [],
    },
  },
  { timestamps: true }
);

MembershipPlanSchema.index({ vendorId: 1, status: 1, updatedAt: -1 });
MembershipPlanSchema.index({ vendorId: 1, name: 1 });

MembershipPlanSchema.pre("validate", function validatePrepaidSessions(next) {
  if (this.planType !== "PREPAID_SESSIONS") return next();

  const config = this.prepaidSessionsConfig;
  if (
    !config?.eligibleItemId ||
    !PREPAID_ITEM_SOURCES.includes(config.eligibleItemSource) ||
    !PREPAID_ITEM_KINDS.includes(config.eligibleItemKind) ||
    !Number.isSafeInteger(config.paidQuantity) ||
    config.paidQuantity < 1 ||
    !Number.isSafeInteger(config.creditedQuantity) ||
    config.creditedQuantity < config.paidQuantity
  ) {
    this.invalidate(
      "prepaidSessionsConfig",
      "PREPAID_SESSIONS requires one eligible item and credited quantity not less than paid quantity"
    );
  }
  next();
});

MembershipPlanSchema.pre("validate", function validatePrepaidValue(next) {
  if (this.planType !== "PREPAID_VALUE") return next();

  const paidAmountPaise = Math.round(Number(this.sellingPrice) * 100);
  const creditedAmountPaise = Math.round(Number(this.prepaidValueConfig?.prepaidValue) * 100);
  const bonusAmountPaise = Math.round(Number(this.prepaidValueConfig?.bonusValue) * 100);
  if (
    !Number.isSafeInteger(paidAmountPaise) ||
    paidAmountPaise < 1 ||
    !Number.isSafeInteger(creditedAmountPaise) ||
    creditedAmountPaise < paidAmountPaise ||
    !Number.isSafeInteger(bonusAmountPaise) ||
    bonusAmountPaise !== creditedAmountPaise - paidAmountPaise
  ) {
    this.invalidate(
      "prepaidValueConfig",
      "PREPAID_VALUE requires positive paid value and credited value with an exact calculated bonus"
    );
  }
  next();
});

MembershipPlanSchema.statics.constants = {
  PLAN_TYPES,
  DURATIONS,
  STATUSES,
  BENEFIT_SEMANTICS,
  PREPAID_ITEM_SOURCES,
  PREPAID_ITEM_KINDS,
};

module.exports = mongoose.model("MembershipPlan", MembershipPlanSchema);
