const mongoose = require("mongoose");

const PLAN_TYPES = ["DISCOUNT", "SERVICE_QUOTA", "PREPAID_VALUE"];
const DURATIONS = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL"];
const STATUSES = ["ACTIVE", "INACTIVE"];
const BENEFIT_SEMANTICS = ["LEGACY_NON_MEMBERSHIP_FLAGS", "MEMBERSHIP_ITEM_FLAGS_V1"];

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

MembershipPlanSchema.statics.constants = {
  PLAN_TYPES,
  DURATIONS,
  STATUSES,
  BENEFIT_SEMANTICS,
};

module.exports = mongoose.model("MembershipPlan", MembershipPlanSchema);
