const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const Customer = require("../models/Customer");
const Session = require("../models/Session");
const LoginHistory = require("../models/LoginHistory");
const DummyVendor = require("../models/DummyVendor");
const { getSessionValidityHours } = require("../utils/sessionConfig");

const router = express.Router();

const MSG91_AUTH = process.env.MSG91_AUTHKEY;
const MSG91_SENDER = process.env.MSG91_SENDER;
const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";

if (!MSG91_AUTH) console.warn("MSG91_AUTHKEY not set in .env");
if (!MSG91_SENDER) console.warn("MSG91_SENDER not set in .env");

// helper to build full number
const buildFull = (countryCode, phone) => `${countryCode}${phone.replace(/\D/g, "")}`;

// helper: log duration
function logApi(req, res, label) {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[API] ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms ${label || ""}`);
  });
}

/* ---------------- 1) Request OTP ---------------- */
router.post("/request-otp", async (req, res) => {
  logApi(req, res, "request-otp");
  try {
    const { countryCode, phone } = req.body;
    if (!countryCode || !phone) {
      return res.status(400).json({ message: "countryCode and phone required" });
    }

    const mobile = buildFull(countryCode, phone);
    const deviceInfo = req.headers["user-agent"] || "";

    const sendResp = await axios.post(
      "https://control.msg91.com/api/v5/otp",
      {
        mobile,
        otp_length: 6,
        sender: MSG91_SENDER,
        template_id: "63e1e445d6fc0560d933a5e2", // replace with your template id
      },
      {
        headers: { authkey: MSG91_AUTH, "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    console.log("MSG91 OTP Response:", sendResp.data);

    if (sendResp.data.type && sendResp.data.type === "success") {
      return res.json({ message: "OTP sent" });
    }

    return res.status(400).json({ message: sendResp.data.message || "Failed to send OTP" });
  } catch (err) {
    console.error("request-otp error:", err?.response?.data || err.message);
    const msg = err?.response?.data?.message || "Failed to request OTP";
    res.status(500).json({ message: msg });
  }
});

/* ---------------- 4b) Session status via JWT token ---------------- */
router.post("/session-status-token", async (req, res) => {
  logApi(req, res, "customer-session-status-token");
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ message: "token required" });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.json({ status: "invalid_token" });
    }

    const customerId = decoded.customerId;
    const vendorId = decoded.vendorId || "";
    const categoryId = decoded.categoryId || "";
    if (!customerId) return res.status(400).json({ message: "Invalid token payload" });

    const now = new Date();
    const filter = { userId: customerId, isActive: true };
    if (vendorId) filter.vendorId = String(vendorId);
    if (categoryId) filter.categoryId = String(categoryId);

    const session = await Session.findOne(filter)
      .sort({ loginTime: -1 })
      .lean();

    if (!session) {
      return res.json({ status: "no_session" });
    }

    if (session.expiryTime && new Date(session.expiryTime) > now) {
      return res.json({
        status: "active",
        loginTime: session.loginTime,
        expiryTime: session.expiryTime,
        deviceInfo: session.deviceInfo || "",
      });
    }

    // Expired: move to login history if not already recorded, then deactivate
    const existing = await LoginHistory.findOne({
      userId: customerId,
      loginTime: session.loginTime,
      expiryTime: session.expiryTime,
    }).lean();

    if (!existing) {
      await LoginHistory.create({
        userId: customerId,
        loginTime: session.loginTime,
        expiryTime: session.expiryTime,
        deviceInfo: session.deviceInfo || "",
        status: "expired",
      });
    }

    await Session.updateOne({ _id: session._id }, { $set: { isActive: false } });
    return res.json({ status: "expired" });
  } catch (err) {
    console.error("POST /api/customers/session-status-token error:", err.message);
    res.status(500).json({ message: "Failed to load session status from token" });
  }
});

/* ---------------- 2) Verify OTP ---------------- */
router.post("/verify-otp", async (req, res) => {
  logApi(req, res, "verify-otp");
  try {
    const { countryCode, phone, otp, vendorId, categoryId } = req.body;
    if (!countryCode || !phone || !otp) {
      return res.status(400).json({ message: "countryCode, phone and otp required" });
    }

    const mobile = buildFull(countryCode, phone);
    const deviceInfo = req.headers["user-agent"] || "";

    const verifyResp = await axios.post(
      "https://control.msg91.com/api/v5/otp/verify",
      { mobile, otp },
      {
        headers: { authkey: MSG91_AUTH, "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    console.log("MSG91 Verify Response:", verifyResp.data);

    if (verifyResp.data.type && verifyResp.data.type === "success") {
      // create customer if not exists
      const fullNumber = mobile;
      let customer = await Customer.findOne({ fullNumber });
      if (!customer) {
        customer = new Customer({ countryCode, phone, fullNumber });
        await customer.save();
      }

      // Determine role based on DummyVendor linkage (business account),
      // scoped to the current category when available so that a vendor
      // from another category does not appear as vendor here.
      let role = "guest";
      let displayName = "Guest";
      try {
        const vendorQuery = { customerId: customer._id };
        if (categoryId) {
          vendorQuery.categoryId = categoryId;
        }
        const dummyVendor = await DummyVendor.findOne(vendorQuery).lean();
        if (dummyVendor && dummyVendor.businessName) {
          role = "vendor";
          displayName = dummyVendor.businessName;
        }
      } catch (roleErr) {
        console.error(
          "Failed to resolve vendor role for customer",
          customer._id.toString(),
          roleErr?.message || roleErr
        );
      }

      // Session management: create a new session using app-config validity
      try {
        const hours = await getSessionValidityHours(4); // default 4h if not configured
        const now = new Date();
        const expiryTime = new Date(now.getTime() + hours * 60 * 60 * 1000);

        // Check latest active session for this customer in the same vendor/category scope (if provided)
        const sessionFilter = {
          userId: customer._id,
          isActive: true,
        };
        if (vendorId) sessionFilter.vendorId = String(vendorId);
        if (categoryId) sessionFilter.categoryId = String(categoryId);

        const lastSession = await Session.findOne(sessionFilter).sort({ loginTime: -1 });

        if (lastSession) {
          // If previous session is expired, move it to login history and deactivate
          if (lastSession.expiryTime && lastSession.expiryTime <= now) {
            await LoginHistory.create({
              userId: customer._id,
              loginTime: lastSession.loginTime,
              expiryTime: lastSession.expiryTime,
              deviceInfo: lastSession.deviceInfo || "",
              status: "expired",
            });
            lastSession.isActive = false;
            await lastSession.save();
          }
        }

        // Create a new active session
        const session = await Session.create({
          userId: customer._id,
          vendorId: vendorId ? String(vendorId) : "",
          categoryId: categoryId ? String(categoryId) : "",
          loginTime: now,
          expiryTime,
          isActive: true,
          deviceInfo,
        });

        // Issue a JWT auth token scoped to this customer + vendor + category + session
        let token = null;
        try {
          const payload = {
            customerId: String(customer._id),
            vendorId: vendorId ? String(vendorId) : "",
            categoryId: categoryId ? String(categoryId) : "",
            sessionId: String(session._id),
          };
          // Align token expiry with session expiry in hours
          const hours = await getSessionValidityHours(4);
          token = jwt.sign(payload, JWT_SECRET, { expiresIn: `${hours}h` });

          // Persist token on the session document for audit/debug
          if (token) {
            await Session.updateOne({ _id: session._id }, { $set: { token } });
            session.token = token;
          }
        } catch (jwtErr) {
          console.error("Failed to generate JWT token after OTP verify:", jwtErr?.message || jwtErr);
        }

        return res.json({ message: "verified", customer, session, token, role, displayName });
      } catch (sessionErr) {
        console.error("Session creation error after OTP verify:", sessionErr?.message || sessionErr);
        // Still return verified customer even if session logic fails
        return res.json({ message: "verified", customer, role, displayName });
      }
    }

    return res.status(400).json({ message: verifyResp.data.message || "OTP verify failed" });
  } catch (err) {
    console.error("verify-otp error:", err?.response?.data || err.message);
    const msg = err?.response?.data?.message || "Failed to verify OTP";
    res.status(500).json({ message: msg });
  }
});

/* ---------------- 3) List customers ---------------- */
router.get("/", async (req, res) => {
  logApi(req, res, "list-customers");
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    res.json(customers);
  } catch (err) {
    console.error("GET /api/customers error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* ---------------- 4) Current session status for a customer ---------------- */
router.get("/:id/session-status", async (req, res) => {
  logApi(req, res, "customer-session-status");
  try {
    const { id } = req.params;
    const { vendorId, categoryId } = req.query;
    if (!id) return res.status(400).json({ message: "Customer id required" });

    const now = new Date();
    const filter = { userId: id, isActive: true };
    if (vendorId) filter.vendorId = String(vendorId);
    if (categoryId) filter.categoryId = String(categoryId);

    const session = await Session.findOne(filter)
      .sort({ loginTime: -1 })
      .lean();

    if (!session) {
      return res.json({ status: "no_session" });
    }

    if (session.expiryTime && new Date(session.expiryTime) > now) {
      return res.json({
        status: "active",
        loginTime: session.loginTime,
        expiryTime: session.expiryTime,
        deviceInfo: session.deviceInfo || "",
      });
    }

    // Expired session: move to login history if not already recorded, then deactivate
    const existing = await LoginHistory.findOne({
      userId: id,
      loginTime: session.loginTime,
      expiryTime: session.expiryTime,
    }).lean();

    if (!existing) {
      await LoginHistory.create({
        userId: id,
        loginTime: session.loginTime,
        expiryTime: session.expiryTime,
        deviceInfo: session.deviceInfo || "",
        status: "expired",
      });
    }

    await Session.updateOne({ _id: session._id }, { $set: { isActive: false } });
    return res.json({ status: "expired" });
  } catch (err) {
    console.error("GET /api/customers/:id/session-status error:", err.message);
    res.status(500).json({ message: "Failed to load session status" });
  }
});

/* ---------------- 5) Login history for a customer ---------------- */
router.get("/:id/login-history", async (req, res) => {
  logApi(req, res, "customer-login-history");
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Customer id required" });

    const now = new Date();

    // Move all expired active sessions for this user into LoginHistory and deactivate them.
    const activeSessions = await Session.find({ userId: id, isActive: true }).lean();

    for (const s of activeSessions) {
      if (s.expiryTime && new Date(s.expiryTime) <= now) {
        const exists = await LoginHistory.findOne({
          userId: id,
          loginTime: s.loginTime,
          expiryTime: s.expiryTime,
        }).lean();

        if (!exists) {
          await LoginHistory.create({
            userId: id,
            loginTime: s.loginTime,
            expiryTime: s.expiryTime,
            deviceInfo: s.deviceInfo || "",
            status: "expired",
          });
        }

        await Session.updateOne({ _id: s._id }, { $set: { isActive: false } });
      }
    }

    // Reload history after normalizing expired sessions
    const history = await LoginHistory.find({ userId: id })
      .sort({ loginTime: -1 })
      .lean();

    // Also include current active sessions (if any) as rows with status "active"
    const stillActive = await Session.find({ userId: id, isActive: true })
      .sort({ loginTime: -1 })
      .lean();

    const activeRows = stillActive
      .filter((s) => s.expiryTime && new Date(s.expiryTime) > now)
      .map((s) => ({
        _id: `active-${s._id}`,
        userId: id,
        loginTime: s.loginTime,
        expiryTime: s.expiryTime,
        deviceInfo: s.deviceInfo || "",
        status: "active",
      }));

    const combined = [...activeRows, ...history];

    res.json(combined);
  } catch (err) {
    console.error("GET /api/customers/:id/login-history error:", err.message);
    res.status(500).json({ message: "Failed to load login history" });
  }
});

module.exports = router;
