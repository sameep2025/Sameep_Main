const axios = require("axios");
const BillingSession = require("../models/BillingSession");
const Transaction = require("../models/Transaction");
const VendorLoyaltyRule = require("../models/VendorLoyaltyRule");
const LoyaltyLedger = require("../models/LoyaltyLedger");
const Customer = require("../models/Customer");
const Vendor = require("../models/DummyVendor");
const { calculateCustomerBalance } = require("../services/loyaltyService");
const { deductOTP, deductWhatsApp } = require("../services/vendorWalletService");
const { buildMessagingReadiness } = require("../services/metaWhatsAppReadiness");
const {
  getPhoneNumberReadinessWithSystemUserToken,
} = require("../services/metaWhatsAppService");
const {
  isVendorMetaBillRoutingEnabled,
  sendRoutedWhatsAppBillingMessage,
} = require("../services/whatsappBillingRouter");
const {
  buildPublicBillPath,
  buildPublicBillUrl,
  createBillAccessToken,
  findBillingIdByCode,
  verifyBillAccessToken,
} = require("../utils/billLink");

async function buildPublicBillResponse(bill) {
  const [customer, vendor] = await Promise.all([
    bill.customerId ? Customer.findById(bill.customerId).lean() : null,
    Vendor.findById(bill.vendorId).lean(),
  ]);
  const previewRoot =
    process.env.VENDOR_PREVIEW_ROOT_URL ||
    process.env.NEXT_PUBLIC_VENDOR_PREVIEW_ROOT_URL ||
    process.env.REACT_APP_VENDOR_PREVIEW_ROOT_URL ||
    process.env.PUBLIC_VENDOR_SITE_ROOT_URL ||
    process.env.NEXT_PUBLIC_HARISH_PREVIEW_BASE_URL ||
    process.env.PREVIEW_BASE_URL ||
    process.env.REACT_APP_PREVIEW_BASE_URL ||
    process.env.NEXT_PUBLIC_PREVIEW_BASE_URL ||
    "";

  const websiteFromSocial = String(vendor?.socialLinks?.website || "").trim();
  let websiteUrl = "";

  if (!websiteUrl && vendor?.subdomain && previewRoot) {
    try {
      websiteUrl = String(previewRoot)
        .trim()
        .replace(/\/$/, "")
        .replace("://", `://${String(vendor.subdomain).trim().toLowerCase()}.`);
    } catch (err) {
      websiteUrl = "";
    }
  }

  if (!websiteUrl) {
    websiteUrl = websiteFromSocial;
  }

  let balance = 0;
  if (bill.customerId) {
    try {
      balance = await calculateCustomerBalance(bill.customerId, bill.vendorId);
    } catch (err) {
      balance = 0;
    }
  }

  const items = Array.isArray(bill.cartItems) ? bill.cartItems : [];

  return {
    billId: String(bill._id),
    createdAt: bill.createdAt,
    billingMode: bill.billingMode,
    status: bill.status,
    vendor: vendor
      ? {
          id: String(vendor._id),
          businessName: vendor.businessName || "Vendor",
          phone: vendor.phone || "",
          secondaryPhones: Array.isArray(vendor.secondaryPhones) ? vendor.secondaryPhones : [],
          logoUrl: vendor.logoUrl || "",
          address: vendor.location?.address || "",
          websiteUrl,
        }
      : null,
    customer: customer
      ? {
          id: String(customer._id),
          name: customer.name || "Customer",
          phone: customer.phone || customer.fullNumber || "",
        }
      : null,
    items: items.map((item) => ({
      itemId: item.itemId ? String(item.itemId) : "",
      name: item.name || "Item",
      qty: Number(item.qty || 0),
      price: Number(item.price || 0),
      total: Number(item.total || 0),
      resourceName: item.resourceName || "",
      hierarchy: Array.isArray(item.nodePath)
        ? item.nodePath.filter(Boolean).join(" / ")
        : "",
    })),
    totals: {
      billAmount: Number(bill.totalAmount || 0),
      pointsEarned: Number(bill.pointsEarned || 0),
      pointsRedeemed: Number(bill.pointsRedeemed || 0),
      finalPaid: Number(bill.totalAmount || 0) - Number(bill.pointsRedeemed || 0),
      balance: Number(balance || 0),
    },
  };
}


// ✅ Create Billing Session
exports.createBillingSession = async (req, res) => {
  try {
    const { vendorId, customerId } = req.body;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "Vendor ID required",
      });
    }

    const billing = await BillingSession.create({
      vendorId,
      customerId: customerId || null,
      billingMode: customerId ? "LOYALTY" : "WALK_IN",
      cartItems: [],
      totalAmount: 0,
    });

    res.status(200).json({
      success: true,
      data: billing,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to create billing session" });
  }
};


// ✅ Update Cart
exports.updateBillingCart = async (req, res) => {
  try {
    const { billingId, cartItems } = req.body;

    let totalAmount = 0;

    cartItems.forEach((item) => {
      item.total = item.price * item.qty;
      totalAmount += item.total;
    });

    const updated = await BillingSession.findByIdAndUpdate(
      billingId,
      {
        cartItems,
        totalAmount,
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to update cart" });
  }
};


// ✅ Get Billing Session
exports.getBillingSession = async (req, res) => {
  try {
    const { id } = req.params;

    const billing = await BillingSession.findById(id);

    res.status(200).json({
      success: true,
      data: billing,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch billing session" });
  }
};

exports.getPublicBillDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const token = String(req.query.token || "").trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Bill token required",
      });
    }

    let decoded;
    try {
      decoded = verifyBillAccessToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired bill link",
      });
    }

    if (decoded?.scope !== "bill_link" || String(decoded?.billingId || "") !== String(id)) {
      return res.status(403).json({
        success: false,
        message: "Bill link does not match this bill",
      });
    }

    const bill = await BillingSession.findById(id).lean();
    if (!bill || bill.status !== "COMPLETED") {
      return res.status(404).json({
        success: false,
        message: "Bill not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: await buildPublicBillResponse(bill),
    });
  } catch (err) {
    console.error("getPublicBillDetails error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load bill details",
    });
  }
};

exports.getPublicBillDetailsByCode = async (req, res) => {
  try {
    const code = String(req.params.code || "").trim();

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Bill code required",
      });
    }

    const billingId = await findBillingIdByCode(code);
    if (!billingId) {
      return res.status(404).json({
        success: false,
        message: "Invalid or expired bill link",
      });
    }

    const bill = await BillingSession.findById(billingId).lean();
    if (!bill || bill.status !== "COMPLETED") {
      return res.status(404).json({
        success: false,
        message: "Bill not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: await buildPublicBillResponse(bill),
    });
  } catch (err) {
    console.error("getPublicBillDetailsByCode error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load bill details",
    });
  }
};


// 🔐 Request OTP for Loyalty Redemption (MSG91)
exports.requestRedeemOTP = async (req, res) => {
  try {
    const { billingId, redeemPoints } = req.body;

    const billing = await BillingSession.findById(billingId);

    if (!billing || billing.status !== "ACTIVE") {
      return res.status(400).json({
        success: false,
        message: "Invalid billing session",
      });
    }

    if (!billing.customerId) {
      return res.status(400).json({
        success: false,
        message: "Loyalty redemption requires customer",
      });
    }

    const customer = await Customer.findById(billing.customerId);
    const mobile = customer?.fullNumber;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: "Customer mobile not found",
      });
    }

    await axios.post(
      "https://control.msg91.com/api/v5/otp",
      {
        mobile,
        otp_length: 6,
        sender: process.env.MSG91_SENDER,
        template_id: "63e1e445d6fc0560d933a5e2",
      },
      {
        headers: {
          authkey: process.env.MSG91_AUTHKEY,
          "Content-Type": "application/json",
        },
      }
    );

    billing.pointsRedeemed = redeemPoints;
    billing.otpVerified = false;

    await billing.save();

    res.status(200).json({
      success: true,
      message: "OTP sent via MSG91",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to request OTP",
    });
  }
};


// 🔐 Verify OTP (MSG91)
exports.verifyRedeemOTP = async (req, res) => {
  try {
    const { billingId, otp } = req.body;

    const billing = await BillingSession.findById(billingId);

    if (!billing) {
      return res.status(404).json({
        success: false,
        message: "Billing not found",
      });
    }

    const customer = await Customer.findById(billing.customerId);
    const mobile = customer?.fullNumber;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: "Customer mobile not found",
      });
    }

    try {
      await axios.post(
        "https://control.msg91.com/api/v5/otp/verify",
        {
          mobile,
          otp,
        },
        {
          headers: {
            authkey: process.env.MSG91_AUTHKEY,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (verifyErr) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (!billing.otpVerified) {
      await deductOTP(billing.vendorId, `billing-redemption:${billing._id}`);
    }

    billing.otpVerified = true;
    await billing.save();

    res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
};


// ✅ Complete Billing WITH FIFO + OTP SAFETY
exports.completeBillingSession = async (req, res) => {
  try {
    const { billingId, paymentMode } = req.body;

    const billing = await BillingSession.findById(billingId);

    if (!billing || billing.status !== "ACTIVE") {
      return res.status(400).json({
        success: false,
        message: "Invalid billing session",
      });
    }

    const isWalkIn = !billing.customerId;

    // 🔐 OTP SAFETY CHECK
    if (!isWalkIn && billing.pointsRedeemed > 0 && !billing.otpVerified) {
      return res.status(400).json({
        success: false,
        message: "OTP verification required before redemption",
      });
    }

    // -------------------------
    // Create Transaction
    // -------------------------
    const transaction = await Transaction.create({
      vendorId: billing.vendorId,
      customerId: billing.customerId || null,
      billingSessionId: billing._id,
      totalAmount: billing.totalAmount,
      redeemedPoints: billing.pointsRedeemed || 0,
      redeemValue: billing.pointsRedeemed || 0,
      finalPaidAmount:
        billing.totalAmount - (billing.pointsRedeemed || 0),
      paymentMode,
      paymentStatus: "OFFLINE_PAID",
      billingSource: "POS_OFFLINE",
    });

    // -------------------------
    // FIFO Redemption
    // -------------------------
    let redeemLeft = billing.pointsRedeemed || 0;

    if (!isWalkIn && redeemLeft > 0) {
      const now = new Date();

      const earns = await LoyaltyLedger.find({
        vendorId: billing.vendorId,
        customerId: billing.customerId,
        type: "EARN",
        remainingPoints: { $gt: 0 },
        $or: [
          { expiryDate: null },
          { expiryDate: { $gte: now } }
        ],
      }).sort({ expiryDate: 1, createdAt: 1 });

      for (const earn of earns) {
        if (redeemLeft <= 0) break;

        const deduct = Math.min(earn.remainingPoints, redeemLeft);

        earn.remainingPoints -= deduct;
        redeemLeft -= deduct;

        await earn.save();
      }

      await LoyaltyLedger.create({
        type: "REDEEM",
        vendorId: billing.vendorId,
        customerId: billing.customerId,
        transactionId: transaction._id,
        points: -(billing.pointsRedeemed || 0),
      });
    }

    // -------------------------
    // Earn Points
    // -------------------------
    let rule = null;
    if (!isWalkIn) {
      rule = await VendorLoyaltyRule.findOne({
        vendorId: billing.vendorId,
        isEnabled: true,
      });
    }

    if (!isWalkIn && rule) {
      const totalAmount = transaction.finalPaidAmount;
      const earnPercent = rule?.earn?.percentPer100 ?? 0;
      let earnedPoints = 0;

      if (
        typeof totalAmount === "number" &&
        totalAmount > 0 &&
        typeof earnPercent === "number" &&
        earnPercent > 0
      ) {
        earnedPoints = Math.floor((totalAmount / 100) * earnPercent);
      }

      billing.pointsEarned = Number.isFinite(earnedPoints)
        ? earnedPoints
        : 0;

      if (billing.pointsEarned > 0) {
        let expiryDate = null;

        if (rule?.expiry?.expiryDays) {
          expiryDate = new Date();
          expiryDate.setDate(
            expiryDate.getDate() + rule.expiry.expiryDays
          );
        }

        await LoyaltyLedger.create({
          type: "EARN",
          vendorId: billing.vendorId,
          customerId: billing.customerId,
          transactionId: transaction._id,
          points: billing.pointsEarned,
          remainingPoints: billing.pointsEarned,
          expiryDate,
        });
      }
    }

   // 🔒 Atomic completion lock (prevents double completion)
    if (isWalkIn) {
      billing.pointsEarned = 0;
      billing.pointsRedeemed = 0;
    }

    await billing.save();

    const closed = await BillingSession.findOneAndUpdate(
      { _id: billingId, status: "ACTIVE" },
      { status: "COMPLETED" },
      { new: true }
    );

if (!closed) {
  return res.status(400).json({
    success: false,
    message: "Billing already completed or locked",
  });
}

    setImmediate(async () => {
      try {
        console.log("[WhatsApp Billing Trace]", {
          stage: "started",
          vendorId: String(billing.vendorId || ""),
          billId: String(billing._id || ""),
          hasCustomerId: Boolean(billing.customerId),
        });

        if (!billing.customerId) {
          console.log("[WhatsApp Billing Trace]", {
            stage: "skipped_no_customer",
            vendorId: String(billing.vendorId || ""),
            billId: String(billing._id || ""),
          });
          return;
        }

        const [customer, vendor] = await Promise.all([
          Customer.findById(billing.customerId).lean(),
          Vendor.findById(billing.vendorId).lean(),
        ]);
        let vendorForWhatsApp = vendor;

        console.log("[WhatsApp Billing Trace]", {
          stage: "vendor_loaded",
          vendorId: String(billing.vendorId || ""),
          billId: String(billing._id || ""),
          vendorFound: Boolean(vendor),
          vendorModel: "DummyVendor",
          provider: vendor?.whatsappBusiness?.provider || "",
          enabled: vendor?.whatsappBusiness?.enabled === true,
          hasPhoneNumberId: Boolean(vendor?.whatsappBusiness?.phoneNumberId),
        });

        const mobile = customer?.fullNumber || customer?.phone;

        if (!mobile) {
          console.log("[WhatsApp Billing Trace]", {
            stage: "skipped_no_mobile",
            vendorId: String(billing.vendorId || ""),
            billId: String(billing._id || ""),
          });
          return;
        }

        const vendorMetaRoutingEnabled = isVendorMetaBillRoutingEnabled();
        console.log("[WhatsApp Billing Trace]", {
          stage: "global_switch",
          vendorId: String(billing.vendorId || ""),
          billId: String(billing._id || ""),
          enabled: vendorMetaRoutingEnabled,
        });

        if (
          vendorMetaRoutingEnabled &&
          vendor?.whatsappBusiness?.provider === "meta" &&
          vendor?.whatsappBusiness?.enabled === true &&
          vendor?.whatsappBusiness?.phoneNumberId
        ) {
          try {
            const phoneStatus = await getPhoneNumberReadinessWithSystemUserToken({
              phoneNumberId: vendor.whatsappBusiness.phoneNumberId,
            });
            vendorForWhatsApp = {
              ...vendor,
              whatsappBusiness: {
                ...vendor.whatsappBusiness,
                messagingReadiness: buildMessagingReadiness(phoneStatus?.health_status || null),
              },
            };
            console.log("[WhatsApp Billing Trace]", {
              stage: "readiness",
              vendorId: String(billing.vendorId || ""),
              billId: String(billing._id || ""),
              readiness: vendorForWhatsApp.whatsappBusiness.messagingReadiness.status,
            });
          } catch (readinessErr) {
            vendorForWhatsApp = {
              ...vendor,
              whatsappBusiness: {
                ...vendor.whatsappBusiness,
                messagingReadiness: buildMessagingReadiness(null),
              },
            };
            console.error("[WhatsApp Billing Trace]", {
              stage: "readiness_failed",
              vendorId: String(billing.vendorId || ""),
              billId: String(billing._id || ""),
              code: readinessErr?.code || "",
              status: readinessErr?.metaError?.status || null,
              metaCode: readinessErr?.metaError?.code || "",
              metaSubcode: readinessErr?.metaError?.subcode || "",
            });
            console.error("[WhatsApp Billing Meta Readiness Refresh Failed]", {
              vendorId: String(billing.vendorId || ""),
              billId: String(billing._id || ""),
              code: readinessErr?.code || "",
              metaCode: readinessErr?.metaError?.code || "",
              metaSubcode: readinessErr?.metaError?.subcode || "",
            });
          }
        }

        const balance = await calculateCustomerBalance(
          billing.customerId,
          billing.vendorId
        );
        const billToken = await createBillAccessToken({
          billingId: billing._id,
        });
        const billUrl = await buildPublicBillUrl({
          token: billToken,
        });
        const billPath = buildPublicBillPath({
          token: billToken,
        });
        const messagePayload = {
          mobile,
          customerName: customer?.name || "Customer",
          vendorName: vendor?.businessName || "Vendor",
          billAmount: billing.totalAmount,
          earned: billing.pointsEarned || 0,
          redeemed: billing.pointsRedeemed || 0,
          finalPaid: billing.totalAmount - (billing.pointsRedeemed || 0),
          balance,
          billUrl,
          billPath,
        };

        const sendResult = await sendRoutedWhatsAppBillingMessage({
          vendor: vendorForWhatsApp,
          vendorId: billing.vendorId,
          billId: billing._id,
          msg91Payload: messagePayload,
          metaPayload: {
            vendor: vendorForWhatsApp,
            vendorId: billing.vendorId,
            billId: billing._id,
            recipientPhoneNumber: mobile,
            vendorName: messagePayload.vendorName,
            billAmount: messagePayload.billAmount,
            pointsEarned: messagePayload.earned,
            pointsRedeemed: messagePayload.redeemed,
            finalPaid: messagePayload.finalPaid,
            loyaltyBalance: balance,
            billUrl,
          },
        });

        if (sendResult?.status === "accepted" && sendResult?.provider === "ynot_msg91") {
          await deductWhatsApp(billing.vendorId, `billing:${billing._id}`);
        }
      } catch (err) {
        console.error("WhatsApp send failed:", err?.message || err);
      }
    });

    res.status(200).json({
      success: true,
      type: isWalkIn ? "WALK_IN" : "CUSTOMER",
      message: isWalkIn ? "Walk-in bill generated" : "Bill generated",
      transaction,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to complete billing",
    });
  }
};
