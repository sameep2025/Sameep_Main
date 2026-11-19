const express = require("express");
const mongoose = require("mongoose");
const DummyVendor = require("../models/DummyVendor");
const CheckoutAttempt = require("../models/CheckoutAttempt");
const VendorPaymentConfig = require("../models/VendorPaymentConfig");
const { buildRazorpayClient, verifyRazorpaySignature } = require("../services/razorpayService");
const { createEnquiryAndNotify } = require("../services/enquiryCreationService");
const { resolveAuthoritativeCheckout } = require("../services/razorpayCheckoutPricingService");

const router = express.Router();

async function getVendorPaymentConfig(vendorId) {
  const config = await VendorPaymentConfig.findOne({ vendorId });
  if (!config) {
    throw new Error("Vendor payment settings not found");
  }
  if (!config.paymentEnabled || config.provider !== "razorpay") {
    throw new Error("Razorpay is not enabled for this vendor");
  }

  const mode = String(config?.razorpay?.mode || "test").trim().toLowerCase() === "live" ? "live" : "test";
  const activeKeyId = String(config?.razorpay?.[mode]?.keyId || config?.razorpay?.keyId || "").trim();
  const activeKeySecret = String(config?.razorpay?.[mode]?.keySecret || config?.razorpay?.keySecret || "").trim();

  if (!activeKeyId || !activeKeySecret) {
    throw new Error(`Razorpay ${mode} credentials are incomplete for this vendor`);
  }

  return {
    config,
    mode,
    accountName: String(config?.razorpay?.accountName || "").trim(),
    razorpay: {
      keyId: activeKeyId,
      keySecret: activeKeySecret,
    },
  };
}

function appendStatusHistory(doc, nextStatus) {
  const statusText = String(nextStatus || "").trim();
  if (!statusText) return;

  if (String(doc.status || "").trim() !== statusText) {
    doc.status = statusText;
    doc.statusHistory = Array.isArray(doc.statusHistory) ? doc.statusHistory : [];
    doc.statusHistory.push({
      status: statusText,
      changedAt: new Date(),
    });
  }
}

function sanitizeAttemptPayload(body = {}) {
  const {
    vendorId,
    categoryId,
    customerId,
    phone,
    categoryPath,
    categoryIds,
    serviceName,
    source,
    attributes,
    price,
    terms,
    meta,
  } = body || {};

  return {
    vendorId: String(vendorId),
    categoryId: String(categoryId),
    customerId: customerId ? String(customerId) : "",
    phone: phone ? String(phone) : "",
    categoryPath: Array.isArray(categoryPath) ? categoryPath.map(String) : [],
    categoryIds: Array.isArray(categoryIds) ? categoryIds.map(String) : [],
    serviceName: serviceName ? String(serviceName) : "",
    source: source ? String(source) : "",
    attributes: attributes && typeof attributes === "object" ? attributes : {},
    price: typeof price === "number" ? price : price == null || price === "" ? null : Number(price),
    terms: terms ? String(terms) : "",
    meta: meta && typeof meta === "object" ? meta : {},
  };
}

router.post("/razorpay/order", async (req, res) => {
  try {
    const payload = sanitizeAttemptPayload(req.body || {});
    const { vendorId } = payload;
    const currency = String(req.body?.currency || "INR").trim().toUpperCase() || "INR";
    const submissionKey = String(req.body?.submissionKey || "").trim();

    if (!mongoose.Types.ObjectId.isValid(String(vendorId || ""))) {
      return res.status(400).json({ success: false, message: "Valid vendorId is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(String(payload.categoryId || ""))) {
      return res.status(400).json({ success: false, message: "Valid categoryId is required" });
    }
    if (currency !== "INR") {
      return res.status(400).json({ success: false, message: "Only INR checkout is supported" });
    }
    if (!/^[A-Za-z0-9-]{16,128}$/.test(submissionKey)) {
      return res.status(400).json({ success: false, message: "Valid submissionKey is required" });
    }

    const vendor = await DummyVendor.findById(vendorId).lean();
    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }

    const paymentConfig = await getVendorPaymentConfig(String(vendorId));
    const client = buildRazorpayClient(paymentConfig);
    const checkout = await resolveAuthoritativeCheckout({
      vendorId: String(vendorId),
      categoryId: String(payload.categoryId),
      cartItems: payload?.meta?.cartItems,
      claimedTotal: payload.price,
    });
    const amountInPaise = checkout.amountInPaise;

    const existingAttempt = await CheckoutAttempt.findOne({
      vendorId: String(vendorId),
      "meta.submissionKey": submissionKey,
    }).sort({ createdAt: -1 });
    if (existingAttempt) {
      if (String(existingAttempt?.meta?.cartFingerprint || "") !== checkout.fingerprint) {
        return res.status(409).json({ success: false, message: "Submission key belongs to a different checkout" });
      }
      if (existingAttempt?.payment?.razorpayOrderId) {
        return res.json({
          success: true,
          idempotent: true,
          order: {
            checkoutAttemptId: String(existingAttempt._id),
            razorpayOrderId: String(existingAttempt.payment.razorpayOrderId),
            amount: Math.round(Number(existingAttempt.payment.amount || 0) * 100),
            currency: String(existingAttempt.payment.currency || "INR"),
            keyId: String(paymentConfig?.razorpay?.keyId || ""),
            vendorName: String(paymentConfig?.accountName || vendor.businessName || "Vendor"),
          },
        });
      }
      return res.status(409).json({ success: false, message: "An earlier checkout attempt is incomplete" });
    }

    payload.price = amountInPaise / 100;
    payload.meta = {
      ...(payload.meta || {}),
      submissionKey,
      cartFingerprint: checkout.fingerprint,
      cartItems: checkout.authoritativeItems,
    };

    const attempt = new CheckoutAttempt({
      ...payload,
      payment: {
        provider: "razorpay",
        status: "initialized",
        amount: amountInPaise / 100,
        currency,
        ynotOrderId: "",
        razorpayOrderId: "",
        razorpayPaymentId: "",
        razorpaySignature: "",
        paidAt: null,
        lastError: "",
        notes: {},
      },
      status: "Initialized",
      statusHistory: [{ status: "Initialized", changedAt: new Date() }],
    });

    await attempt.save();

    const razorpayOrder = await client.orders.create({
      amount: amountInPaise,
      currency,
      receipt: `attempt_${String(attempt._id)}`,
      notes: {
        vendorId: String(vendorId),
        checkoutAttemptId: String(attempt._id),
        businessName: String(vendor.businessName || ""),
      },
    });

    attempt.payment = {
      ...(attempt.payment || {}),
      provider: "razorpay",
      status: "created",
      amount: amountInPaise / 100,
      currency,
      razorpayOrderId: String(razorpayOrder.id || ""),
      lastError: "",
      notes: razorpayOrder.notes || {},
    };
    appendStatusHistory(attempt, "Payment Pending");
    await attempt.save();

    return res.json({
      success: true,
      order: {
        checkoutAttemptId: String(attempt._id),
        razorpayOrderId: String(razorpayOrder.id || ""),
        amount: amountInPaise,
        currency,
        keyId: String(paymentConfig?.razorpay?.keyId || ""),
        vendorName: String(paymentConfig?.accountName || vendor.businessName || "Vendor"),
      },
    });
  } catch (err) {
    console.error("POST /payments/razorpay/order error:", err);
    return res.status(err?.status || 500).json({
      success: false,
      message: err?.message || "Failed to create Razorpay order",
      code: err?.code || "razorpay_order_failed",
    });
  }
});

router.post("/razorpay/verify", async (req, res) => {
  let claimedAttemptId = "";
  try {
    const {
      vendorId,
      checkoutAttemptId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(String(vendorId || ""))) {
      return res.status(400).json({ success: false, message: "Valid vendorId is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(String(checkoutAttemptId || ""))) {
      return res.status(400).json({ success: false, message: "Valid checkoutAttemptId is required" });
    }

    let attempt = await CheckoutAttempt.findById(checkoutAttemptId);
    if (!attempt) {
      return res.status(404).json({ success: false, message: "Checkout attempt not found" });
    }
    if (String(attempt.vendorId || "") !== String(vendorId)) {
      return res.status(403).json({ success: false, message: "This checkout attempt does not belong to the vendor" });
    }

    if (String(attempt.finalEnquiryId || "").trim()) {
      return res.json({
        success: true,
        payment: {
          status: "paid",
          ynotOrderId: String(attempt.finalEnquiryId),
          razorpayOrderId: String(attempt?.payment?.razorpayOrderId || razorpayOrderId || ""),
          razorpayPaymentId: String(attempt?.payment?.razorpayPaymentId || razorpayPaymentId || ""),
        },
      });
    }

    const storedOrderId = String(attempt?.payment?.razorpayOrderId || "").trim();
    const storedCurrency = String(attempt?.payment?.currency || "").trim().toUpperCase();
    const storedStatus = String(attempt?.payment?.status || "").trim().toLowerCase();
    if (!storedOrderId || storedOrderId !== String(razorpayOrderId || "").trim()) {
      return res.status(400).json({ success: false, message: "Payment order does not match this checkout" });
    }
    if (storedCurrency !== "INR") {
      return res.status(409).json({ success: false, message: "Checkout currency is invalid" });
    }
    if (storedStatus !== "created") {
      return res.status(409).json({ success: false, message: "Checkout is not awaiting payment verification" });
    }

    const duplicatePayment = await CheckoutAttempt.findOne({
      _id: { $ne: attempt._id },
      "payment.razorpayPaymentId": String(razorpayPaymentId || "").trim(),
      "payment.status": "paid",
    }).select("_id").lean();
    if (duplicatePayment) {
      return res.status(409).json({ success: false, message: "Payment has already been applied" });
    }

    const paymentConfig = await getVendorPaymentConfig(String(vendorId));
    const isValid = verifyRazorpaySignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
      keySecret: paymentConfig?.razorpay?.keySecret,
    });

    if (!isValid) {
      attempt.payment = {
        ...(attempt.payment || {}),
        provider: "razorpay",
        status: "failed_verification",
        razorpayOrderId: String(razorpayOrderId || ""),
        razorpayPaymentId: String(razorpayPaymentId || ""),
        razorpaySignature: String(razorpaySignature || ""),
        lastError: "Invalid Razorpay signature",
      };
      appendStatusHistory(attempt, "Payment Failed");
      await attempt.save();

      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

    const claimedAttempt = await CheckoutAttempt.findOneAndUpdate(
      {
        _id: attempt._id,
        finalEnquiryId: "",
        "payment.status": "created",
        "payment.razorpayOrderId": storedOrderId,
      },
      {
        $set: {
          "payment.status": "verifying",
          "payment.razorpayPaymentId": String(razorpayPaymentId || ""),
          "payment.razorpaySignature": String(razorpaySignature || ""),
          "payment.lastError": "",
        },
      },
      { new: true }
    );
    if (!claimedAttempt) {
      const current = await CheckoutAttempt.findById(attempt._id).lean();
      if (current?.finalEnquiryId && current?.payment?.status === "paid") {
        return res.json({
          success: true,
          payment: {
            status: "paid",
            ynotOrderId: String(current.finalEnquiryId),
            razorpayOrderId: String(current.payment.razorpayOrderId || ""),
            razorpayPaymentId: String(current.payment.razorpayPaymentId || ""),
          },
        });
      }
      return res.status(409).json({ success: false, message: "Payment verification is already in progress" });
    }
    attempt = claimedAttempt;
    claimedAttemptId = String(attempt._id);

    const enquiryPayload = {
      vendorId: attempt.vendorId,
      categoryId: attempt.categoryId,
      customerId: attempt.customerId,
      phone: attempt.phone,
      categoryPath: attempt.categoryPath,
      categoryIds: attempt.categoryIds,
      serviceName: attempt.serviceName,
      source: attempt.source,
      attributes: attempt.attributes,
      price: attempt.price,
      terms: attempt.terms,
      meta: {
        ...(attempt.meta || {}),
        checkoutAttemptId: String(attempt._id),
      },
      status: "Paid",
    };

    const enquiry = await createEnquiryAndNotify(enquiryPayload);

    enquiry.payment = {
      provider: "razorpay",
      status: "paid",
      amount: Number(attempt?.payment?.amount || attempt.price || 0) || null,
      currency: String(attempt?.payment?.currency || "INR"),
      ynotOrderId: String(enquiry._id),
      razorpayOrderId: String(razorpayOrderId || ""),
      razorpayPaymentId: String(razorpayPaymentId || ""),
      razorpaySignature: String(razorpaySignature || ""),
      paidAt: new Date(),
      lastError: "",
      notes: attempt?.payment?.notes || {},
    };
    await enquiry.save();

    attempt.payment = {
      ...(attempt.payment || {}),
      provider: "razorpay",
      status: "paid",
      ynotOrderId: String(enquiry._id),
      razorpayOrderId: String(razorpayOrderId || ""),
      razorpayPaymentId: String(razorpayPaymentId || ""),
      razorpaySignature: String(razorpaySignature || ""),
      paidAt: new Date(),
      lastError: "",
    };
    attempt.finalEnquiryId = String(enquiry._id);
    attempt.finalizedAt = new Date();
    appendStatusHistory(attempt, "Paid");
    await attempt.save();
    claimedAttemptId = "";

    return res.json({
      success: true,
      payment: {
        status: "paid",
        ynotOrderId: String(enquiry._id),
        razorpayOrderId: String(razorpayOrderId || ""),
        razorpayPaymentId: String(razorpayPaymentId || ""),
      },
      enquiry,
    });
  } catch (err) {
    if (claimedAttemptId) {
      await CheckoutAttempt.updateOne(
        { _id: claimedAttemptId, "payment.status": "verifying", finalEnquiryId: "" },
        {
          $set: {
            "payment.status": "created",
            "payment.lastError": "Payment finalization failed",
          },
        }
      ).catch(() => {});
    }
    console.error("POST /payments/razorpay/verify error:", err);
    return res.status(500).json({
      success: false,
      message: err?.message || "Failed to verify payment",
    });
  }
});

router.post("/razorpay/cancel", async (req, res) => {
  try {
    const { vendorId, checkoutAttemptId, reason } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(String(vendorId || ""))) {
      return res.status(400).json({ success: false, message: "Valid vendorId is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(String(checkoutAttemptId || ""))) {
      return res.status(400).json({ success: false, message: "Valid checkoutAttemptId is required" });
    }

    const attempt = await CheckoutAttempt.findById(checkoutAttemptId);
    if (!attempt) {
      return res.status(404).json({ success: false, message: "Checkout attempt not found" });
    }

    if (String(attempt.vendorId || "") !== String(vendorId)) {
      return res.status(403).json({ success: false, message: "This checkout attempt does not belong to the vendor" });
    }

    if (String(attempt?.payment?.status || "").trim().toLowerCase() === "paid") {
      return res.json({
        success: true,
        payment: {
          status: "paid",
          ynotOrderId: String(attempt.finalEnquiryId || ""),
        },
      });
    }
    if (String(attempt?.payment?.status || "").trim().toLowerCase() === "verifying") {
      return res.status(409).json({ success: false, message: "Payment verification is in progress" });
    }

    attempt.payment = {
      ...(attempt.payment || {}),
      provider: "razorpay",
      status: "cancelled",
      lastError: String(reason || "Payment checkout closed by customer"),
    };
    appendStatusHistory(attempt, "Payment Cancelled");
    await attempt.save();

    return res.json({
      success: true,
      payment: {
        status: "cancelled",
        checkoutAttemptId: String(attempt._id),
      },
    });
  } catch (err) {
    console.error("POST /payments/razorpay/cancel error:", err);
    return res.status(500).json({
      success: false,
      message: err?.message || "Failed to cancel payment attempt",
    });
  }
});

module.exports = router;
