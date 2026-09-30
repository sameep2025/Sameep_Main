const axios = require("axios");
const Customer = require("../models/Customer");
const Session = require("../models/Session");
const {
  CUSTOMER_PORTAL_SESSION_TYPE,
  getCustomerPortalExpiryDate,
  signCustomerPortalToken,
} = require("../utils/customerPortalAuth");

const MSG91_AUTH = process.env.MSG91_AUTHKEY;
const MSG91_SENDER = process.env.MSG91_SENDER;
const MSG91_OTP_TEMPLATE_ID =
  process.env.MSG91_CUSTOMER_PORTAL_OTP_TEMPLATE_ID ||
  process.env.MSG91_OTP_TEMPLATE_ID ||
  "63e1e445d6fc0560d933a5e2";

const REQUEST_WINDOW_MS = 60 * 1000;
const HOURLY_WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_MOBILE_PER_HOUR = 5;
const MAX_REQUESTS_PER_IP_PER_HOUR = 20;
const VERIFY_WINDOW_MS = 15 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS_PER_MOBILE = 8;

const otpRequestState = new Map();
const ipRequestState = new Map();
const verifyAttemptState = new Map();

function normalizePortalPhone(input = {}) {
  const countryCode = String(input.countryCode || "91")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
  const rawPhone = String(input.phone || input.mobile || "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");

  if (!countryCode || !rawPhone) {
    return null;
  }

  let phone = rawPhone;
  if (countryCode === "91" && phone.length > 10 && phone.startsWith("91")) {
    phone = phone.slice(2);
  }

  if (countryCode === "91" && phone.length !== 10) {
    return null;
  }

  if (!/^[1-9]\d{7,14}$/.test(`${countryCode}${phone}`)) {
    return null;
  }

  return {
    countryCode,
    phone,
    fullNumber: `${countryCode}${phone}`,
  };
}

function getRequestIp(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || "unknown";
}

function pruneWindow(state, now, windowMs) {
  state.timestamps = state.timestamps.filter((timestamp) => now - timestamp < windowMs);
}

function checkOtpRequestLimit({ fullNumber, ip, now = Date.now() }) {
  const mobileState = otpRequestState.get(fullNumber) || {
    lastSentAt: 0,
    timestamps: [],
  };
  const ipState = ipRequestState.get(ip) || { timestamps: [] };

  pruneWindow(mobileState, now, HOURLY_WINDOW_MS);
  pruneWindow(ipState, now, HOURLY_WINDOW_MS);

  if (now - mobileState.lastSentAt < REQUEST_WINDOW_MS) {
    return {
      allowed: false,
      reason: "too_soon",
    };
  }

  if (mobileState.timestamps.length >= MAX_REQUESTS_PER_MOBILE_PER_HOUR) {
    return {
      allowed: false,
      reason: "mobile_rate_limited",
    };
  }

  if (ipState.timestamps.length >= MAX_REQUESTS_PER_IP_PER_HOUR) {
    return {
      allowed: false,
      reason: "ip_rate_limited",
    };
  }

  mobileState.lastSentAt = now;
  mobileState.timestamps.push(now);
  ipState.timestamps.push(now);
  otpRequestState.set(fullNumber, mobileState);
  ipRequestState.set(ip, ipState);

  return { allowed: true };
}

function checkVerifyAttemptLimit({ fullNumber, now = Date.now() }) {
  const state = verifyAttemptState.get(fullNumber) || { timestamps: [] };
  pruneWindow(state, now, VERIFY_WINDOW_MS);

  if (state.timestamps.length >= MAX_VERIFY_ATTEMPTS_PER_MOBILE) {
    return {
      allowed: false,
      reason: "verify_rate_limited",
    };
  }

  state.timestamps.push(now);
  verifyAttemptState.set(fullNumber, state);
  return { allowed: true };
}

function clearVerifyAttempts(fullNumber) {
  verifyAttemptState.delete(fullNumber);
}

function formatDisplayPhone(fullNumber = "") {
  const value = String(fullNumber || "");
  if (!value) return "";
  return value.startsWith("+") ? value : `+${value}`;
}

async function requestOtp(req, res) {
  try {
    const normalized = normalizePortalPhone(req.body || {});
    if (!normalized) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid mobile number.",
      });
    }

    const ip = getRequestIp(req);
    const limit = checkOtpRequestLimit({
      fullNumber: normalized.fullNumber,
      ip,
    });

    if (!limit.allowed) {
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting another OTP.",
        code: limit.reason,
      });
    }

    const sendResp = await axios.post(
      "https://control.msg91.com/api/v5/otp",
      {
        mobile: normalized.fullNumber,
        otp_length: 6,
        sender: MSG91_SENDER,
        template_id: MSG91_OTP_TEMPLATE_ID,
      },
      {
        headers: { authkey: MSG91_AUTH, "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    if (sendResp.data?.type && sendResp.data.type !== "success") {
      return res.status(500).json({
        success: false,
        message: "Unable to request OTP right now.",
      });
    }

    return res.json({
      success: true,
      message: "If this mobile number can receive OTP, an OTP has been sent.",
    });
  } catch (err) {
    console.error("customer portal request OTP error:", err?.response?.data || err?.message || err);
    return res.status(500).json({
      success: false,
      message: "Unable to request OTP right now.",
    });
  }
}

async function verifyOtp(req, res) {
  try {
    const normalized = normalizePortalPhone(req.body || {});
    const otp = String(req.body?.otp || "").trim();

    if (!normalized || !/^\d{4,8}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP request.",
      });
    }

    const limit = checkVerifyAttemptLimit({
      fullNumber: normalized.fullNumber,
    });

    if (!limit.allowed) {
      return res.status(429).json({
        success: false,
        message: "Too many verification attempts. Please request a new OTP later.",
        code: limit.reason,
      });
    }

    const verifyResp = await axios.post(
      "https://control.msg91.com/api/v5/otp/verify",
      {
        mobile: normalized.fullNumber,
        otp,
      },
      {
        headers: { authkey: MSG91_AUTH, "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    if (verifyResp.data?.type !== "success") {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP.",
      });
    }

    clearVerifyAttempts(normalized.fullNumber);

    const customer = await Customer.findOneAndUpdate(
      { fullNumber: normalized.fullNumber },
      {
        $setOnInsert: {
          countryCode: normalized.countryCode,
          phone: normalized.phone,
          fullNumber: normalized.fullNumber,
        },
      },
      {
        new: true,
        upsert: true,
      }
    );

    const now = new Date();
    const expiryTime = getCustomerPortalExpiryDate(now);
    const session = await Session.create({
      userId: customer._id,
      vendorId: "",
      categoryId: "",
      sessionType: CUSTOMER_PORTAL_SESSION_TYPE,
      loginTime: now,
      expiryTime,
      isActive: true,
      deviceInfo: req.headers?.["user-agent"] || "",
    });

    const token = signCustomerPortalToken({
      customerId: customer._id,
      sessionId: session._id,
    });

    await Session.updateOne(
      {
        _id: session._id,
        userId: customer._id,
        sessionType: CUSTOMER_PORTAL_SESSION_TYPE,
      },
      { $set: { token } }
    );

    return res.json({
      success: true,
      message: "verified",
      token,
      expiresAt: expiryTime,
      customer: {
        phone: formatDisplayPhone(customer.fullNumber),
      },
    });
  } catch (err) {
    console.error("customer portal verify OTP error:", err?.response?.data || err?.message || err);
    return res.status(500).json({
      success: false,
      message: "Unable to verify OTP right now.",
    });
  }
}

async function me(req, res) {
  try {
    const customer = await Customer.findById(req.auth.customerId).lean();
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.json({
      success: true,
      data: {
        customer: {
          phone: formatDisplayPhone(customer.fullNumber || customer.phone),
        },
        session: {
          sessionType: CUSTOMER_PORTAL_SESSION_TYPE,
        },
      },
    });
  } catch (err) {
    console.error("customer portal me error:", err?.message || err);
    return res.status(500).json({
      success: false,
      message: "Unable to load customer portal profile",
    });
  }
}

async function logout(req, res) {
  try {
    await Session.updateOne(
      {
        _id: req.auth.sessionId,
        userId: req.auth.customerId,
        sessionType: CUSTOMER_PORTAL_SESSION_TYPE,
      },
      {
        $set: {
          isActive: false,
          expiryTime: new Date(),
        },
      }
    );

    return res.json({
      success: true,
      message: "logged_out",
    });
  } catch (err) {
    console.error("customer portal logout error:", err?.message || err);
    return res.status(500).json({
      success: false,
      message: "Unable to logout",
    });
  }
}

function __resetRateLimitersForTests() {
  otpRequestState.clear();
  ipRequestState.clear();
  verifyAttemptState.clear();
}

module.exports = {
  __resetRateLimitersForTests,
  checkOtpRequestLimit,
  checkVerifyAttemptLimit,
  formatDisplayPhone,
  logout,
  me,
  normalizePortalPhone,
  requestOtp,
  verifyOtp,
};
