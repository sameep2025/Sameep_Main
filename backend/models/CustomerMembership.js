const mongoose = require("mongoose");

const MEMBERSHIP_TYPES = ["DISCOUNT", "SERVICE_QUOTA", "PREPAID_VALUE"];
const MEMBERSHIP_STATUSES = ["ACTIVE", "SCHEDULED", "EXPIRED", "CANCELLED"];
const PAYMENT_METHODS = ["CASH", "UPI", "CARD", "ONLINE"];
const BENEFIT_SEMANTICS = ["LEGACY_NON_MEMBERSHIP_FLAGS", "MEMBERSHIP_ITEM_FLAGS_V1"];

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
      index: true,
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
    planSnapshot: {
      type: PlanSnapshotSchema,
      required: true,
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
    partialFilterExpression: { status: "ACTIVE" },
  }
);
CustomerMembershipSchema.index(
  { renewedFromMembershipId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      renewedFromMembershipId: { $exists: true, $type: "objectId" },
      status: "SCHEDULED",
    },
  }
);

CustomerMembershipSchema.statics.constants = {
  MEMBERSHIP_TYPES,
  MEMBERSHIP_STATUSES,
  PAYMENT_METHODS,
  BENEFIT_SEMANTICS,
};

module.exports = mongoose.model("CustomerMembership", CustomerMembershipSchema);
